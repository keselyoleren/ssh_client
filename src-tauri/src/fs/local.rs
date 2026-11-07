//! The local file system (also the source/target of every upload/download).

use tokio::io::AsyncWriteExt;

use super::progress::{copy, open_at};
use super::{Backend, Entry, Progress};
use crate::error::{Ctx, Res};

pub struct Local;

fn secs(t: std::time::SystemTime) -> i64 {
    t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

impl Backend for Local {
    async fn home(&self) -> Res<String> {
        Ok(dirs::home_dir().unwrap_or_else(|| "/".into()).to_string_lossy().into_owned())
    }

    async fn list(&self, path: &str) -> Res<Vec<Entry>> {
        // On Windows an empty path (or "/") lists the available drives.
        #[cfg(windows)]
        if path.is_empty() || path == "/" {
            return Ok((b'A'..=b'Z')
                .map(|c| format!("{}:\\", c as char))
                .filter(|d| std::path::Path::new(d).exists())
                .map(|d| Entry {
                    name: d.clone(),
                    path: d,
                    is_dir: true,
                    is_link: false,
                    size: 0,
                    mtime: 0,
                    perm: None,
                })
                .collect());
        }
        let mut rd = tokio::fs::read_dir(path).await.ctx(path)?;
        let mut v = Vec::new();
        while let Some(e) = rd.next_entry().await.s()? {
            let is_link = e.file_type().await.map(|t| t.is_symlink()).unwrap_or(false);
            // Follow symlinks so links to directories are browsable.
            let meta = if is_link {
                tokio::fs::metadata(e.path()).await.or(e.metadata().await)
            } else {
                e.metadata().await
            };
            let Ok(m) = meta else { continue };
            #[cfg(unix)]
            let perm = {
                use std::os::unix::fs::PermissionsExt;
                Some(m.permissions().mode() & 0o7777)
            };
            #[cfg(not(unix))]
            let perm = None;
            v.push(Entry {
                name: e.file_name().to_string_lossy().into_owned(),
                path: e.path().to_string_lossy().into_owned(),
                is_dir: m.is_dir(),
                is_link,
                size: m.len(),
                mtime: m.modified().map(secs).unwrap_or(0),
                perm,
            });
        }
        Ok(v)
    }

    async fn mkdir(&self, path: &str) -> Res<()> {
        tokio::fs::create_dir_all(path).await.ctx(path)
    }

    async fn rename(&self, from: &str, to: &str) -> Res<()> {
        tokio::fs::rename(from, to).await.s()
    }

    async fn remove(&self, path: &str, is_dir: bool) -> Res<()> {
        if is_dir {
            tokio::fs::remove_dir_all(path).await.ctx(path)
        } else {
            tokio::fs::remove_file(path).await.ctx(path)
        }
    }

    async fn download(&self, path: &str, local: &str, p: &Progress) -> Res<()> {
        let src = tokio::fs::File::open(path).await.ctx(path)?;
        let mut dst = tokio::fs::File::create(local).await.ctx(local)?;
        copy(src, &mut dst, p).await?;
        dst.flush().await.s()
    }

    async fn upload(&self, local: &str, path: &str, p: &Progress) -> Res<()> {
        self.download(local, path, p).await
    }

    async fn stat(&self, path: &str) -> Res<Option<(bool, u64)>> {
        match tokio::fs::metadata(path).await {
            Ok(m) => Ok(Some((m.is_dir(), m.len()))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("{path}: {e}")),
        }
    }

    async fn download_from(&self, path: &str, local: &str, offset: u64, p: &Progress) -> Res<()> {
        use tokio::io::AsyncSeekExt;
        let mut src = tokio::fs::File::open(path).await.ctx(path)?;
        src.seek(std::io::SeekFrom::Start(offset)).await.ctx(path)?;
        let mut dst = open_at(local, offset).await?;
        copy(src, &mut dst, p).await?;
        dst.flush().await.s()
    }

    async fn upload_from(&self, local: &str, path: &str, offset: u64, p: &Progress) -> Res<()> {
        self.download_from(local, path, offset, p).await
    }

    #[cfg(unix)]
    async fn chmod(&self, path: &str, mode: u32) -> Res<()> {
        use std::os::unix::fs::PermissionsExt;
        tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).await.s()
    }
}
