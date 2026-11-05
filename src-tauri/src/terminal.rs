//! Interactive terminals: remote SSH shells and local PTYs.
//! Output is coalesced and streamed to the webview as raw bytes over a
//! Tauri IPC channel (no JSON/base64 overhead); status events go as JSON.

use futures::FutureExt;
use parking_lot::Mutex;
use russh::ChannelMsg;
use serde_json::json;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::ipc::{Channel, InvokeResponseBody};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

use crate::error::{Ctx, Res};
use crate::ssh::SshConn;

pub enum Cmd {
    Write(Vec<u8>),
    Resize(u16, u16),
    Close,
}

/// Parameters for a new SSH shell.
pub struct ShellOptions {
    pub cols: u16,
    pub rows: u16,
    /// Typed into the shell right after it starts (e.g. `tmux attach`).
    pub startup_command: String,
    pub agent_forward: bool,
    /// Plain-text copy of the output, when session logging is on.
    pub log: Option<crate::sessionlog::SessionLog>,
}

/// Parameters for a new local shell.
pub struct LocalOptions {
    pub cols: u16,
    pub rows: u16,
    pub shell: Option<String>,
    /// Working directory ("~" expanded); the home directory when empty.
    pub cwd: Option<String>,
    /// Typed into the shell right after it starts (e.g. `npm run dev`).
    pub startup_command: String,
    /// Plain-text copy of the output, when session logging is on.
    pub log: Option<crate::sessionlog::SessionLog>,
}

/// Resolve a project folder: expands a leading "~" and checks that it exists.
pub fn resolve_dir(path: &str) -> Res<std::path::PathBuf> {
    let path = path.trim();
    let p = match path.strip_prefix('~') {
        Some(rest) if rest.is_empty() || rest.starts_with('/') || rest.starts_with('\\') => {
            dirs::home_dir().ok_or("no home directory")?.join(rest.trim_start_matches(['/', '\\']))
        }
        _ => std::path::PathBuf::from(path),
    };
    if !p.is_dir() {
        return Err(format!("Folder not found: {path}"));
    }
    Ok(p)
}

/// Live terminals, keyed by an id chosen by the UI.
#[derive(Default)]
pub struct Terminals {
    map: Mutex<HashMap<String, UnboundedSender<Cmd>>>,
}

const MAX_CHUNK: usize = 256 * 1024;

fn send_raw(out: &Channel<InvokeResponseBody>, buf: &mut Vec<u8>) {
    if !buf.is_empty() {
        let _ = out.send(InvokeResponseBody::Raw(std::mem::take(buf)));
    }
}

fn send_event(out: &Channel<InvokeResponseBody>, v: serde_json::Value) {
    let _ = out.send(InvokeResponseBody::Json(v.to_string()));
}

impl Terminals {
    pub fn send(&self, id: &str, cmd: Cmd) -> Res<()> {
        let map = self.map.lock();
        let tx = map.get(id).ok_or("terminal not found")?;
        tx.send(cmd).map_err(|_| "terminal closed".to_string())
    }

    pub fn close(&self, id: &str) {
        if let Some(tx) = self.map.lock().remove(id) {
            let _ = tx.send(Cmd::Close);
        }
    }

    /// Open an interactive shell on `conn` and start streaming it to `out`.
    pub async fn open_ssh(
        self: &Arc<Self>,
        id: String,
        conn: Arc<SshConn>,
        opts: ShellOptions,
        out: Channel<InvokeResponseBody>,
    ) -> Res<()> {
        let ch = conn.open_session().await?;
        if opts.agent_forward {
            let _ = ch.agent_forward(false).await;
        }
        ch.request_pty(false, "xterm-256color", opts.cols as u32, opts.rows as u32, 0, 0, &[])
            .await
            .ctx("request pty")?;
        ch.request_shell(true).await.ctx("request shell")?;
        if !opts.startup_command.trim().is_empty() {
            let mut s = opts.startup_command.trim_end().to_string();
            s.push('\n');
            let _ = ch.data(s.as_bytes()).await;
        }

        let (tx, mut rx) = unbounded_channel::<Cmd>();
        self.map.lock().insert(id.clone(), tx);
        let me = self.clone();
        let (mut read, write) = ch.split();
        let mut log = opts.log;
        tokio::spawn(async move {
            let _conn = conn; // keep the connection alive for the shell's lifetime
            let mut buf: Vec<u8> = Vec::with_capacity(64 * 1024);
            let mut exit: Option<u32> = None;
            loop {
                tokio::select! {
                    msg = read.wait() => {
                        let Some(msg) = msg else { break };
                        let mut done = false;
                        let mut handle = |m: ChannelMsg, buf: &mut Vec<u8>| match m {
                            ChannelMsg::Data { data } => buf.extend_from_slice(&data),
                            ChannelMsg::ExtendedData { data, .. } => buf.extend_from_slice(&data),
                            ChannelMsg::ExitStatus { exit_status } => exit = Some(exit_status),
                            ChannelMsg::Eof | ChannelMsg::Close => done = true,
                            _ => {}
                        };
                        handle(msg, &mut buf);
                        // Drain whatever is already queued to batch IPC messages.
                        while buf.len() < MAX_CHUNK {
                            match read.wait().now_or_never() {
                                Some(Some(m)) => handle(m, &mut buf),
                                Some(None) => { done = true; break }
                                None => break,
                            }
                        }
                        if let Some(l) = log.as_mut() { l.write(&buf) }
                        send_raw(&out, &mut buf);
                        if done { break }
                    }
                    cmd = rx.recv() => match cmd {
                        Some(Cmd::Write(d)) => { if write.data(&d[..]).await.is_err() { break } }
                        Some(Cmd::Resize(c, r)) => { let _ = write.window_change(c as u32, r as u32, 0, 0).await; }
                        Some(Cmd::Close) | None => { let _ = write.close().await; break }
                    }
                }
            }
            me.map.lock().remove(&id);
            send_event(&out, json!({"type": "exit", "code": exit}));
        });
        Ok(())
    }

    pub fn open_local(
        self: &Arc<Self>,
        id: String,
        opts: LocalOptions,
        out: Channel<InvokeResponseBody>,
    ) -> Res<()> {
        let LocalOptions { cols, rows, shell, cwd, startup_command, mut log } = opts;
        use portable_pty::{native_pty_system, CommandBuilder, PtySize};
        let pty = native_pty_system();
        let pair = pty.openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).s()?;
        let shell = shell.filter(|s| !s.is_empty()).unwrap_or_else(default_shell);
        let mut cmd = CommandBuilder::new(&shell);
        #[cfg(unix)]
        if shell.ends_with("sh") {
            cmd.arg("-l");
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        match cwd.as_deref().filter(|c| !c.trim().is_empty()) {
            Some(dir) => cmd.cwd(resolve_dir(dir)?),
            None => {
                if let Some(h) = dirs::home_dir() {
                    cmd.cwd(h);
                }
            }
        }
        let mut child = pair.slave.spawn_command(cmd).ctx("spawn shell")?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().s()?;
        let mut writer = pair.master.take_writer().s()?;
        if !startup_command.trim().is_empty() {
            // buffered by the PTY until the shell is ready to read it
            let _ = writer.write_all(format!("{}\r", startup_command.trim_end()).as_bytes());
            let _ = writer.flush();
        }
        let master = pair.master;

        let (tx, mut rx) = unbounded_channel::<Cmd>();
        self.map.lock().insert(id.clone(), tx.clone());

        let out2 = out.clone();
        std::thread::spawn(move || {
            // When the shell exits the PTY reports EOF; tell the control thread.
            let _guard = scopeguard(move || {
                let _ = tx.send(Cmd::Close);
            });
            let mut buf = vec![0u8; 64 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if let Some(l) = log.as_mut() {
                            l.write(&buf[..n]);
                        }
                        let _ = out2.send(InvokeResponseBody::Raw(buf[..n].to_vec()));
                    }
                }
            }
        });

        let me = self.clone();
        std::thread::spawn(move || {
            while let Some(cmd) = rx.blocking_recv() {
                match cmd {
                    Cmd::Write(d) => {
                        if writer.write_all(&d).is_err() {
                            break;
                        }
                        let _ = writer.flush();
                    }
                    Cmd::Resize(c, r) => {
                        let _ = master.resize(PtySize { rows: r, cols: c, pixel_width: 0, pixel_height: 0 });
                    }
                    Cmd::Close => {
                        let _ = child.kill();
                        break;
                    }
                }
                if let Ok(Some(_)) = child.try_wait() {
                    break;
                }
            }
            let code = child.wait().ok().map(|s| s.exit_code());
            me.map.lock().remove(&id);
            send_event(&out, json!({"type": "exit", "code": code}));
        });
        Ok(())
    }
}

pub fn default_shell() -> String {
    #[cfg(windows)]
    {
        if which("pwsh.exe") {
            return "pwsh.exe".into();
        }
        "powershell.exe".into()
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| {
            if std::path::Path::new("/bin/zsh").exists() {
                "/bin/zsh".into()
            } else {
                "/bin/bash".into()
            }
        })
    }
}

#[cfg(windows)]
fn which(bin: &str) -> bool {
    std::env::var_os("PATH").map(|p| std::env::split_paths(&p).any(|d| d.join(bin).exists())).unwrap_or(false)
}

struct Guard<F: FnOnce()>(Option<F>);
impl<F: FnOnce()> Drop for Guard<F> {
    fn drop(&mut self) {
        if let Some(f) = self.0.take() {
            f()
        }
    }
}
fn scopeguard<F: FnOnce()>(f: F) -> Guard<F> {
    Guard(Some(f))
}

#[cfg(test)]
mod tests {
    use super::resolve_dir;

    #[test]
    fn resolve_dir_expands_home_and_rejects_missing() {
        let home = dirs::home_dir().unwrap();
        assert_eq!(resolve_dir("~").unwrap(), home);
        let tmp = std::env::temp_dir();
        assert_eq!(resolve_dir(&format!("  {}  ", tmp.display())).unwrap(), tmp);
        let err = resolve_dir("/definitely/not/here").unwrap_err();
        assert!(err.contains("Folder not found"), "{err}");
        assert!(resolve_dir("~nobody-xyz").is_err(), "~user paths are not expanded");
    }
}
