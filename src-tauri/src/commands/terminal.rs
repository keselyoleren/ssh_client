//! Interactive terminals and one-shot SSH commands.

use serde_json::{json, Value};
use tauri::ipc::{Channel, InvokeResponseBody};

use super::State;
use crate::error::Res;
use crate::terminal::{Cmd, ShellOptions};
use crate::vault::Host;

/// Open an SSH shell. Output streams to `on_data` as raw bytes; a JSON
/// `{"type":"exit","code":…}` message is sent when the shell ends.
#[tauri::command]
pub async fn term_open_ssh(
    st: State<'_>,
    id: String,
    host: Host,
    cols: u16,
    rows: u16,
    on_data: Channel<InvokeResponseBody>,
) -> Res<()> {
    let conn = st.pool.get(&st.vault, &host).await?;
    st.terminals
        .open_ssh(
            id,
            conn,
            ShellOptions {
                cols,
                rows,
                startup_command: host.startup_command,
                agent_forward: host.agent_forward,
            },
            on_data,
        )
        .await
}

#[tauri::command]
pub fn term_open_local(
    st: State,
    id: String,
    cols: u16,
    rows: u16,
    shell: Option<String>,
    on_data: Channel<InvokeResponseBody>,
) -> Res<()> {
    st.terminals.open_local(id, cols, rows, shell, on_data)
}

#[tauri::command]
pub fn term_write(st: State, id: String, data: String) -> Res<()> {
    st.terminals.send(&id, Cmd::Write(data.into_bytes()))
}

#[tauri::command]
pub fn term_resize(st: State, id: String, cols: u16, rows: u16) -> Res<()> {
    st.terminals.send(&id, Cmd::Resize(cols, rows))
}

#[tauri::command]
pub fn term_close(st: State, id: String) {
    st.terminals.close(&id)
}

#[tauri::command]
pub async fn ssh_exec(st: State<'_>, host: Host, command: String) -> Res<Value> {
    let conn = st.pool.get(&st.vault, &host).await?;
    let (output, code) = conn.exec(&command).await?;
    Ok(json!({ "output": output, "code": code }))
}

/// Open a fresh connection (bypassing the pool) and report how long it took.
#[tauri::command]
pub async fn ssh_test(st: State<'_>, host: Host) -> Res<String> {
    let started = std::time::Instant::now();
    let conn = st.pool.fresh(&st.vault, &host).await?;
    let ms = started.elapsed().as_millis();
    let _ = conn.handle.disconnect(russh::Disconnect::ByApplication, "", "en").await;
    Ok(format!("Connected in {ms} ms"))
}

/// Detect the remote OS (`ubuntu`, `debian`, `darwin`, …) and store it on the host.
#[tauri::command]
pub async fn host_detect_os(st: State<'_>, host: Host) -> Res<String> {
    let conn = st.pool.get(&st.vault, &host).await?;
    let (out, _) = conn.exec("(. /etc/os-release 2>/dev/null && echo \"$ID\") || uname -s").await?;
    let os = out.lines().next().unwrap_or("").trim().to_lowercase();
    if !os.is_empty() {
        if let Some(h) = st.vault.data.write().hosts.iter_mut().find(|h| h.id == host.id) {
            h.os = os.clone();
        }
        let _ = st.vault.save();
    }
    Ok(os)
}

/// Append a keychain public key to `~/.ssh/authorized_keys` (like `ssh-copy-id`).
#[tauri::command]
pub async fn key_install(st: State<'_>, host: Host, key_id: String) -> Res<()> {
    let key = st.vault.key(&key_id).ok_or("key not found")?;
    let pubk = key.public_key.trim().replace('\'', "");
    let conn = st.pool.get(&st.vault, &host).await?;
    let cmd = format!(
        "umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && \
         (grep -qxF '{pubk}' ~/.ssh/authorized_keys || echo '{pubk}' >> ~/.ssh/authorized_keys)"
    );
    let (out, code) = conn.exec(&cmd).await?;
    if code != 0 {
        return Err(format!("failed ({code}): {out}"));
    }
    Ok(())
}
