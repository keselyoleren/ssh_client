//! FTP and explicit FTPS (suppaftp + rustls).

use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use super::progress::copy;
use super::{rjoin, Backend, BoxFut, Entry, Progress};
use crate::error::{Ctx, Res};
use crate::vault::Host;

type PlainFtp = suppaftp::tokio::AsyncFtpStream;
type TlsFtp = suppaftp::tokio::AsyncRustlsFtpStream;

enum Stream {
    Plain(PlainFtp),
    Tls(TlsFtp),
}

/// Run the same code against either stream type.
macro_rules! with {
    ($f:expr, $s:ident => $body:expr) => {
        match $f {
            Stream::Plain($s) => $body,
            Stream::Tls($s) => $body,
        }
    };
}

/// FTP has a single control connection, so every operation takes the lock.
pub struct Ftp(Mutex<Stream>);

fn secs(t: std::time::SystemTime) -> i64 {
    t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn tls_connector() -> Res<suppaftp::tokio::AsyncRustlsConnector> {
    use tokio_rustls::rustls;
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let cfg = rustls::ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .s()?
        .with_root_certificates(roots)
        .with_no_client_auth();
    Ok(tokio_rustls::TlsConnector::from(Arc::new(cfg)).into())
}

impl Ftp {
    pub async fn connect(host: &Host) -> Res<Self> {
        let addr = format!("{}:{}", host.host, host.addr_port());
        let user = if host.username.is_empty() { "anonymous" } else { &host.username };
        let fut = async {
            let mut s = if host.protocol == "ftps" {
                let plain = TlsFtp::connect(&addr).await.ctx("connect")?;
                Stream::Tls(plain.into_secure(tls_connector()?, &host.host).await.ctx("TLS handshake")?)
            } else {
                Stream::Plain(PlainFtp::connect(&addr).await.ctx("connect")?)
            };
            with!(&mut s, f => {
                f.login(user, host.password.as_str()).await.ctx("login")?;
                f.transfer_type(suppaftp::types::FileType::Binary).await.s()?;
            });
            Res::Ok(s)
        };
        let s = tokio::time::timeout(Duration::from_secs(20), fut)
            .await
            .map_err(|_| "FTP connection timed out".to_string())??;
        Ok(Self(Mutex::new(s)))
    }

    fn remove_rec<'a>(&'a self, path: &'a str, is_dir: bool) -> BoxFut<'a, ()> {
        Box::pin(async move {
            if !is_dir {
                return with!(&mut *self.0.lock().await, f => f.rm(path).await.ctx(path));
            }
            for e in self.list(path).await? {
                self.remove_rec(&e.path, e.is_dir && !e.is_link).await?;
            }
            with!(&mut *self.0.lock().await, f => f.rmdir(path).await.ctx(path))
        })
    }
}

impl Backend for Ftp {
    async fn home(&self) -> Res<String> {
        with!(&mut *self.0.lock().await, f => f.pwd().await.s())
    }

    async fn list(&self, path: &str) -> Res<Vec<Entry>> {
        // Prefer machine-readable MLSD; fall back to LIST for old servers.
        let (lines, mlsd) = with!(&mut *self.0.lock().await, f => match f.mlsd(Some(path)).await {
            Ok(l) => (l, true),
            Err(_) => (f.list(Some(path)).await.ctx(path)?, false),
        });
        let mut v = Vec::new();
        for line in lines {
            let parsed = if mlsd {
                suppaftp::list::ListParser::parse_mlsd(&line)
            } else {
                line.parse::<suppaftp::list::File>()
            };
            let Ok(fi) = parsed else { continue };
            let name = fi.name().to_string();
            if name.is_empty() || name == "." || name == ".." {
                continue;
            }
            v.push(Entry {
                path: rjoin(path, &name),
                name,
                is_dir: fi.is_directory(),
                is_link: fi.is_symlink(),
                size: fi.size() as u64,
                mtime: secs(fi.modified()),
                perm: None,
            });
        }
        Ok(v)
    }

    async fn mkdir(&self, path: &str) -> Res<()> {
        with!(&mut *self.0.lock().await, f => f.mkdir(path).await.ctx(path))
    }

    async fn rename(&self, from: &str, to: &str) -> Res<()> {
        with!(&mut *self.0.lock().await, f => f.rename(from, to).await.s())
    }

    async fn remove(&self, path: &str, is_dir: bool) -> Res<()> {
        self.remove_rec(path, is_dir).await
    }

    async fn download(&self, path: &str, local: &str, p: &Progress) -> Res<()> {
        let mut dst = tokio::fs::File::create(local).await.ctx(local)?;
        with!(&mut *self.0.lock().await, f => {
            let mut stream = f.retr_as_stream(path).await.ctx(path)?;
            copy(&mut stream, &mut dst, p).await?;
            stream.finish().await.s()?;
        });
        dst.flush().await.s()
    }

    async fn upload(&self, local: &str, path: &str, p: &Progress) -> Res<()> {
        let src = tokio::fs::File::open(local).await.ctx(local)?;
        with!(&mut *self.0.lock().await, f => {
            let mut stream = f.put_with_stream(path).await.ctx(path)?;
            copy(src, &mut stream, p).await?;
            stream.finish().await.s()
        })
    }

    async fn chmod(&self, path: &str, mode: u32) -> Res<()> {
        with!(&mut *self.0.lock().await, f => f.site(format!("CHMOD {mode:o} {path}")).await.s().map(|_| ()))
    }
}
