//! File-manager sessions and transfers between any two of them.

use parking_lot::Mutex;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;

use super::State;
use crate::error::{Ctx, Res};
use crate::fs::{temp_path, Entry, Fs, Progress};
use crate::vault::{new_id, Host};

/// Open a session. `host = None` opens the local file system.
/// Returns `{ id, home, sep }`.
#[tauri::command]
pub async fn fs_open(st: State<'_>, host: Option<Host>) -> Res<Value> {
    let f = match &host {
        None => Fs::local(),
        Some(h) => match h.protocol.as_str() {
            "ftp" | "ftps" => Fs::ftp(h).await?,
            "s3" => Fs::s3(h)?,
            "azblob" => Fs::azure(h)?,
            "gcs" => Fs::gcs(h)?,
            _ => {
                // Dedicated connection so big transfers never stall interactive shells.
                let conn = st.pool.fresh(&st.vault, h).await?;
                st.vault.touch_host(&h.id);
                Fs::sftp(conn).await?
            }
        },
    };
    let home = f.home().await.unwrap_or_else(|_| "/".into());
    let sep = f.sep();
    let id = new_id();
    st.files.lock().insert(id.clone(), Arc::new(f));
    Ok(json!({ "id": id, "home": home, "sep": sep }))
}

#[tauri::command]
pub fn fs_close(st: State, id: String) {
    st.files.lock().remove(&id);
}

#[tauri::command]
pub async fn fs_list(st: State<'_>, id: String, path: String) -> Res<Vec<Entry>> {
    st.fs(&id)?.list(&path).await
}

#[tauri::command]
pub async fn fs_mkdir(st: State<'_>, id: String, path: String) -> Res<()> {
    st.fs(&id)?.mkdir(&path).await
}

#[tauri::command]
pub async fn fs_rename(st: State<'_>, id: String, from: String, to: String) -> Res<()> {
    st.fs(&id)?.rename(&from, &to).await
}

#[tauri::command]
pub async fn fs_remove(st: State<'_>, id: String, path: String, is_dir: bool) -> Res<()> {
    st.fs(&id)?.remove(&path, is_dir).await
}

#[tauri::command]
pub async fn fs_chmod(st: State<'_>, id: String, path: String, mode: u32) -> Res<()> {
    st.fs(&id)?.chmod(&path, mode).await
}

#[tauri::command]
pub async fn fs_read_text(st: State<'_>, id: String, path: String) -> Res<String> {
    st.fs(&id)?.read_text(&path).await
}

/// Raw bytes of a file (up to 32 MB), for the image preview.
#[tauri::command]
pub async fn fs_read_bytes(st: State<'_>, id: String, path: String) -> Res<tauri::ipc::Response> {
    let bytes = st.fs(&id)?.read_bytes(&path, 32 * 1024 * 1024).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Extensions whose default app runs or installs the file. Keep in step with RUNS in
/// src/lib/filetypes.js.
const BLOCKED: &[&str] = &[
    "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "js", "jse", "wsf", "hta", "lnk", "reg", "app",
    "pkg", "dmg", "command", "tool", "workflow", "jar", "deb", "rpm", "apk", "appimage", "sh", "run", "bin",
    "py", "pyw", "vbe", "msix", "appx", "msp", "cpl", "pif", "jnlp", "scpt", "terminal", "desktop",
];

/// Open a file with the app the OS associates with it. Remote files are downloaded to a
/// temp folder first; changes made there are not uploaded back.
#[tauri::command]
pub async fn fs_open_external(app: tauri::AppHandle, st: State<'_>, id: String, path: String) -> Res<()> {
    use tauri_plugin_opener::OpenerExt;
    let ext = path.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    if BLOCKED.contains(&ext.as_str()) {
        return Err(format!("K-Shell doesn't open .{ext} files: opening one would run or install it"));
    }
    let local = st.fs(&id)?.local_copy(&path).await?;
    app.opener().open_path(&local, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_write_text(st: State<'_>, id: String, path: String, content: String) -> Res<()> {
    st.fs(&id)?.write_text(&path, &content).await
}

#[tauri::command]
pub async fn fs_presign(st: State<'_>, id: String, path: String, expiry: u32) -> Res<String> {
    st.fs(&id)?.presign(&path, expiry).await
}

#[tauri::command]
pub fn local_stat(path: String) -> Res<Value> {
    let m = std::fs::metadata(&path).ctx(&path)?;
    Ok(json!({ "is_dir": m.is_dir(), "size": m.len() }))
}

#[tauri::command]
pub fn read_local_text(path: String) -> Res<String> {
    let meta = std::fs::metadata(&path).ctx(&path)?;
    if meta.len() > 1024 * 1024 {
        return Err("file too large".into());
    }
    std::fs::read_to_string(&path).ctx(&path)
}

/// Copy a file or directory from session `src` into directory `dst_dir` of
/// session `dst`. Progress is reported on `on_progress` every 200 ms as
/// `{ total, done, file }`, then once more with `finished: true`.
/// Remote → remote copies go through a local temp file.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn transfer(
    st: State<'_>,
    tid: String,
    src: String,
    src_path: String,
    is_dir: bool,
    size: u64,
    dst: String,
    dst_dir: String,
    on_progress: Channel<Value>,
) -> Res<()> {
    let s = st.fs(&src)?;
    let d = st.fs(&dst)?;
    let p = Progress::default();
    st.transfers.lock().insert(tid.clone(), p.clone());

    let r = run_transfer(&s, &d, &src_path, is_dir, size, &dst_dir, &p, &on_progress).await;
    st.transfers.lock().remove(&tid);
    if p.cancel.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }
    r
}

#[tauri::command]
pub fn transfer_cancel(st: State, tid: String) {
    if let Some(p) = st.transfers.lock().get(&tid) {
        p.cancel.store(true, Ordering::Relaxed);
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_transfer(
    s: &Fs,
    d: &Fs,
    src_path: &str,
    is_dir: bool,
    size: u64,
    dst_dir: &str,
    p: &Progress,
    on_progress: &Channel<Value>,
) -> Res<()> {
    let name = s.base_name(src_path);
    let target = d.join(dst_dir, &name);
    let via_temp = !s.is_local() && !d.is_local();

    // Build the work list: (relative path, is_dir, size).
    let mut items = Vec::new();
    if is_dir {
        s.walk(src_path, String::new(), &mut items).await?;
        let _ = d.mkdir(&target).await;
    } else {
        items.push((String::new(), false, size));
    }
    let mut total: u64 = items.iter().map(|i| i.2).sum();
    if via_temp {
        total *= 2; // every byte is moved twice
    }
    let _ = on_progress.send(json!({ "total": total, "done": 0, "file": name }));

    // Progress ticker.
    let stop = Arc::new(AtomicBool::new(false));
    let current = Arc::new(Mutex::new(name.clone()));
    {
        let (p, ch, stop, current) = (p.clone(), on_progress.clone(), stop.clone(), current.clone());
        tokio::spawn(async move {
            while !stop.load(Ordering::Relaxed) {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                let file = current.lock().clone();
                let _ =
                    ch.send(json!({ "total": total, "done": p.done.load(Ordering::Relaxed), "file": file }));
            }
        });
    }

    let result: Res<()> = async {
        for (rel, dir, _) in &items {
            let sp = if rel.is_empty() { src_path.to_string() } else { s.join(src_path, rel) };
            let dp = if rel.is_empty() { target.clone() } else { d.join(&target, rel) };
            if *dir {
                let _ = d.mkdir(&dp).await;
                continue;
            }
            *current.lock() = if rel.is_empty() { name.clone() } else { rel.clone() };
            if s.is_local() {
                d.upload(&sp, &dp, p).await?;
            } else if d.is_local() {
                s.download(&sp, &dp, p).await?;
            } else {
                let tmp = temp_path();
                let r = async {
                    s.download(&sp, &tmp, p).await?;
                    d.upload(&tmp, &dp, p).await
                }
                .await;
                let _ = tokio::fs::remove_file(&tmp).await;
                r?;
            }
        }
        Ok(())
    }
    .await;

    stop.store(true, Ordering::Relaxed);
    let done = p.done.load(Ordering::Relaxed);
    let _ = on_progress.send(json!({ "total": total, "done": done, "file": name, "finished": true }));
    result
}
