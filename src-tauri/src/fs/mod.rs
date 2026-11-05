//! A single file-system abstraction over every supported protocol.
//!
//! The UI only ever talks to [`Fs`], so the file manager can browse and
//! transfer between *any* two endpoints (local ↔ SFTP, FTP ↔ S3, …) with the
//! same code. Each protocol lives in its own module and implements
//! [`Backend`]. To add a new protocol (e.g. WebDAV), implement `Backend` in a
//! new module and add a variant to [`Fs`] — see `docs/ARCHITECTURE.md`.

mod ftp;
mod local;
mod object;
mod progress;
mod s3;
mod sftp;

pub use progress::Progress;

use serde::Serialize;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use crate::error::Res;
use crate::ssh::SshConn;
use crate::vault::Host;

/// One row in a directory listing.
#[derive(Serialize, Clone, Debug)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_link: bool,
    pub size: u64,
    /// Unix timestamp (seconds); 0 when unknown.
    pub mtime: i64,
    /// POSIX permission bits, when the backend exposes them.
    pub perm: Option<u32>,
}

/// The contract every protocol implements. Paths are always absolute and use
/// the backend's own separator (see [`Fs::join`]).
#[allow(async_fn_in_trait)]
pub trait Backend {
    /// Initial directory shown when a session opens.
    async fn home(&self) -> Res<String>;
    /// Directory listing (unsorted; [`Fs::list`] sorts it).
    async fn list(&self, path: &str) -> Res<Vec<Entry>>;
    async fn mkdir(&self, path: &str) -> Res<()>;
    async fn rename(&self, from: &str, to: &str) -> Res<()>;
    /// Delete a file, or a directory recursively when `is_dir`.
    async fn remove(&self, path: &str, is_dir: bool) -> Res<()>;
    /// Copy remote `path` into the local file `local`, reporting into `p`.
    async fn download(&self, path: &str, local: &str, p: &Progress) -> Res<()>;
    /// Copy the local file `local` to remote `path`, reporting into `p`.
    async fn upload(&self, local: &str, path: &str, p: &Progress) -> Res<()>;

    async fn chmod(&self, _path: &str, _mode: u32) -> Res<()> {
        Err("changing permissions is not supported for this connection".into())
    }
    async fn presign(&self, _path: &str, _expiry_secs: u32) -> Res<String> {
        Err("share links are only available for object storage".into())
    }
}

pub enum Fs {
    Local(local::Local),
    Sftp(sftp::Sftp),
    Ftp(ftp::Ftp),
    S3(s3::S3),
    Object(object::ObjectStore),
}

macro_rules! dispatch {
    ($self:ident, $b:ident => $e:expr) => {
        match $self {
            Fs::Local($b) => $e,
            Fs::Sftp($b) => $e,
            Fs::Ftp($b) => $e,
            Fs::S3($b) => $e,
            Fs::Object($b) => $e,
        }
    };
}

/// Join POSIX-style remote paths.
pub fn rjoin(dir: &str, name: &str) -> String {
    if dir.is_empty() || dir == "/" {
        format!("/{name}")
    } else {
        format!("{}/{}", dir.trim_end_matches('/'), name)
    }
}

/// Last component of a POSIX-style path.
pub fn rname(path: &str) -> String {
    path.trim_end_matches('/').rsplit('/').next().unwrap_or("").to_string()
}

type BoxFut<'a, T> = Pin<Box<dyn Future<Output = Res<T>> + Send + 'a>>;

impl Fs {
    // ---------- constructors ----------

    pub fn local() -> Self {
        Fs::Local(local::Local)
    }

    pub async fn sftp(conn: Arc<SshConn>) -> Res<Self> {
        Ok(Fs::Sftp(sftp::Sftp::open(conn).await?))
    }

    pub async fn ftp(host: &Host) -> Res<Self> {
        Ok(Fs::Ftp(ftp::Ftp::connect(host).await?))
    }

    pub fn s3(host: &Host) -> Res<Self> {
        Ok(Fs::S3(s3::S3::new(host)?))
    }

    pub fn azure(host: &Host) -> Res<Self> {
        Ok(Fs::Object(object::ObjectStore::azure(host)?))
    }

    pub fn gcs(host: &Host) -> Res<Self> {
        Ok(Fs::Object(object::ObjectStore::gcs(host)?))
    }

    // ---------- path helpers ----------

    pub fn is_local(&self) -> bool {
        matches!(self, Fs::Local(_))
    }

    pub fn sep(&self) -> &'static str {
        if self.is_local() && cfg!(windows) {
            "\\"
        } else {
            "/"
        }
    }

    pub fn join(&self, dir: &str, name: &str) -> String {
        if self.is_local() {
            std::path::PathBuf::from(dir).join(name).to_string_lossy().into_owned()
        } else {
            rjoin(dir, name)
        }
    }

    pub fn base_name(&self, path: &str) -> String {
        if self.is_local() {
            std::path::Path::new(path)
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default()
        } else {
            rname(path)
        }
    }

    // ---------- operations ----------

    pub async fn home(&self) -> Res<String> {
        dispatch!(self, b => b.home().await)
    }

    /// Listing sorted directories-first, then case-insensitively by name.
    pub async fn list(&self, path: &str) -> Res<Vec<Entry>> {
        let mut out = dispatch!(self, b => b.list(path).await)?;
        out.sort_by(|a, b| {
            b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(out)
    }

    pub async fn mkdir(&self, path: &str) -> Res<()> {
        dispatch!(self, b => b.mkdir(path).await)
    }

    pub async fn rename(&self, from: &str, to: &str) -> Res<()> {
        dispatch!(self, b => b.rename(from, to).await)
    }

    pub async fn remove(&self, path: &str, is_dir: bool) -> Res<()> {
        dispatch!(self, b => b.remove(path, is_dir).await)
    }

    pub async fn chmod(&self, path: &str, mode: u32) -> Res<()> {
        dispatch!(self, b => b.chmod(path, mode).await)
    }

    pub async fn download(&self, path: &str, local: &str, p: &Progress) -> Res<()> {
        if let Some(parent) = std::path::Path::new(local).parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        dispatch!(self, b => b.download(path, local, p).await)
    }

    pub async fn upload(&self, local: &str, path: &str, p: &Progress) -> Res<()> {
        dispatch!(self, b => b.upload(local, path, p).await)
    }

    pub async fn presign(&self, path: &str, expiry: u32) -> Res<String> {
        dispatch!(self, b => b.presign(path, expiry).await)
    }

    /// Recursively enumerate everything under `root` as
    /// `(relative_path, is_dir, size)`; directories come before their content.
    pub fn walk<'a>(
        &'a self,
        root: &'a str,
        rel: String,
        out: &'a mut Vec<(String, bool, u64)>,
    ) -> BoxFut<'a, ()> {
        Box::pin(async move {
            let dir = if rel.is_empty() { root.to_string() } else { self.join(root, &rel) };
            for e in self.list(&dir).await? {
                let r = if rel.is_empty() { e.name.clone() } else { format!("{rel}/{}", e.name) };
                if e.is_dir && !e.is_link {
                    out.push((r.clone(), true, 0));
                    self.walk(root, r, out).await?;
                } else {
                    out.push((r, false, e.size));
                }
            }
            Ok(())
        })
    }

    /// Read a whole (small) file, going through a temp file for remotes.
    pub async fn read_bytes(&self, path: &str, limit: u64) -> Res<Vec<u8>> {
        let tmp = temp_path();
        let local = if self.is_local() {
            path.to_string()
        } else {
            self.download(path, &tmp, &Progress::default()).await?;
            tmp.clone()
        };
        let result = async {
            let meta = tokio::fs::metadata(&local).await.map_err(|e| e.to_string())?;
            if meta.len() > limit {
                return Err(format!("file is larger than {} MB; download it instead", limit / (1024 * 1024)));
            }
            tokio::fs::read(&local).await.map_err(|e| e.to_string())
        }
        .await;
        let _ = tokio::fs::remove_file(&tmp).await;
        result
    }

    /// Read a (small) text file, going through a temp file for remotes.
    pub async fn read_text(&self, path: &str) -> Res<String> {
        let bytes = self.read_bytes(path, 8 * 1024 * 1024).await?;
        String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8 text".to_string())
    }

    /// A local path for `path` that other apps can open: the file itself for the local
    /// filesystem, otherwise a fresh copy downloaded into a temp folder (keeping its name,
    /// so the OS picks the right app).
    pub async fn local_copy(&self, path: &str) -> Res<String> {
        if self.is_local() {
            return Ok(path.to_string());
        }
        let name = path.rsplit(['/', '\\']).find(|s| !s.is_empty()).unwrap_or("file");
        let dir = std::env::temp_dir().join("kshell-open").join(&uuid::Uuid::new_v4().to_string()[..8]);
        let local = dir.join(name).to_string_lossy().into_owned();
        self.download(path, &local, &Progress::default()).await?;
        Ok(local)
    }

    pub async fn write_text(&self, path: &str, content: &str) -> Res<()> {
        if self.is_local() {
            return tokio::fs::write(path, content).await.map_err(|e| e.to_string());
        }
        let tmp = temp_path();
        tokio::fs::write(&tmp, content).await.map_err(|e| e.to_string())?;
        let r = self.upload(&tmp, path, &Progress::default()).await;
        let _ = tokio::fs::remove_file(&tmp).await;
        r
    }
}

/// A unique path in the OS temp dir.
pub fn temp_path() -> String {
    std::env::temp_dir().join(format!("kshell-{}", uuid::Uuid::new_v4())).to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn joins_remote_paths() {
        assert_eq!(rjoin("/", "a"), "/a");
        assert_eq!(rjoin("", "a"), "/a");
        assert_eq!(rjoin("/srv/", "a"), "/srv/a");
        assert_eq!(rjoin("/srv", "a"), "/srv/a");
    }

    #[test]
    fn remote_base_name() {
        assert_eq!(rname("/srv/www/index.html"), "index.html");
        assert_eq!(rname("/srv/www/"), "www");
        assert_eq!(rname("/"), "");
    }
}
