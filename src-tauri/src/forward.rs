//! Port forwarding: local (-L), remote (-R) and dynamic SOCKS5 (-D).

use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;

use crate::error::{Ctx, Res};
use crate::ssh::SshConn;
use crate::vault::Forward;

/// A rule that is currently running.
struct Running {
    task: JoinHandle<()>,
    conn: Arc<SshConn>,
    rule: Forward,
}

/// Running forwards, keyed by rule id.
#[derive(Default)]
pub struct Forwards {
    running: Mutex<HashMap<String, Running>>,
}

impl Forwards {
    pub fn active(&self) -> Vec<String> {
        self.running.lock().iter().filter(|(_, r)| !r.task.is_finished()).map(|(k, _)| k.clone()).collect()
    }

    pub async fn stop(&self, id: &str) {
        let item = self.running.lock().remove(id);
        if let Some(Running { task, conn, rule: f }) = item {
            task.abort();
            if f.kind == "remote" {
                let bind = if f.bind_host.is_empty() { "localhost".to_string() } else { f.bind_host.clone() };
                let _ = conn.handle.cancel_tcpip_forward(bind, f.bind_port as u32).await;
                conn.remote_fwd.lock().remove(&(f.bind_port as u32));
            }
        }
    }

    pub async fn start(&self, f: Forward, conn: Arc<SshConn>) -> Res<()> {
        self.stop(&f.id).await;
        let bind_host = if f.bind_host.is_empty() { "127.0.0.1".to_string() } else { f.bind_host.clone() };
        let task = match f.kind.as_str() {
            "remote" => {
                conn.remote_fwd.lock().insert(f.bind_port as u32, (f.dest_host.clone(), f.dest_port));
                let bind = if f.bind_host.is_empty() { "localhost".to_string() } else { f.bind_host.clone() };
                conn.handle.tcpip_forward(bind, f.bind_port as u32).await.ctx("remote forward rejected")?;
                let c = conn.clone();
                // Keep a task alive that ends when the connection dies.
                tokio::spawn(async move {
                    while !c.handle.is_closed() {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    }
                })
            }
            kind => {
                let listener = TcpListener::bind((bind_host.as_str(), f.bind_port)).await.ctx("bind")?;
                let c = conn.clone();
                let dynamic = kind == "dynamic";
                let (dh, dp) = (f.dest_host.clone(), f.dest_port);
                tokio::spawn(async move {
                    while let Ok((sock, peer)) = listener.accept().await {
                        let c = c.clone();
                        let (dh, dp) = (dh.clone(), dp);
                        tokio::spawn(async move {
                            let _ = sock.set_nodelay(true);
                            let r = if dynamic {
                                socks5(sock, &c).await
                            } else {
                                pipe(sock, &c, &dh, dp, &peer.ip().to_string(), peer.port()).await
                            };
                            let _ = r;
                        });
                    }
                })
            }
        };
        self.running.lock().insert(f.id.clone(), Running { task, conn, rule: f });
        Ok(())
    }
}

async fn pipe(mut sock: TcpStream, c: &SshConn, host: &str, port: u16, oh: &str, op: u16) -> Res<()> {
    let ch = c.handle.channel_open_direct_tcpip(host, port as u32, oh, op as u32).await.s()?;
    let mut stream = ch.into_stream();
    tokio::io::copy_bidirectional(&mut sock, &mut stream).await.s()?;
    Ok(())
}

/// Minimal SOCKS5 (no auth, CONNECT) server.
async fn socks5(mut s: TcpStream, c: &SshConn) -> Res<()> {
    let mut hdr = [0u8; 2];
    s.read_exact(&mut hdr).await.s()?;
    if hdr[0] != 5 {
        return Err("not socks5".into());
    }
    let mut methods = vec![0u8; hdr[1] as usize];
    s.read_exact(&mut methods).await.s()?;
    s.write_all(&[5, 0]).await.s()?;
    let mut req = [0u8; 4];
    s.read_exact(&mut req).await.s()?;
    if req[1] != 1 {
        s.write_all(&[5, 7, 0, 1, 0, 0, 0, 0, 0, 0]).await.s()?;
        return Err("only CONNECT supported".into());
    }
    let host = match req[3] {
        1 => {
            let mut a = [0u8; 4];
            s.read_exact(&mut a).await.s()?;
            std::net::Ipv4Addr::from(a).to_string()
        }
        3 => {
            let mut l = [0u8; 1];
            s.read_exact(&mut l).await.s()?;
            let mut d = vec![0u8; l[0] as usize];
            s.read_exact(&mut d).await.s()?;
            String::from_utf8_lossy(&d).into_owned()
        }
        4 => {
            let mut a = [0u8; 16];
            s.read_exact(&mut a).await.s()?;
            std::net::Ipv6Addr::from(a).to_string()
        }
        _ => return Err("bad address type".into()),
    };
    let mut p = [0u8; 2];
    s.read_exact(&mut p).await.s()?;
    let port = u16::from_be_bytes(p);
    match c.handle.channel_open_direct_tcpip(host, port as u32, "127.0.0.1", 0).await {
        Ok(ch) => {
            s.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).await.s()?;
            let mut stream = ch.into_stream();
            tokio::io::copy_bidirectional(&mut s, &mut stream).await.s()?;
            Ok(())
        }
        Err(e) => {
            let _ = s.write_all(&[5, 5, 0, 1, 0, 0, 0, 0, 0, 0]).await;
            Err(e.to_string())
        }
    }
}
