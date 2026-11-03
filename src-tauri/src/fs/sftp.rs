//! SFTP over an SSH connection (russh-sftp).

use std::sync::Arc;
use tokio::io::AsyncWriteExt;

use super::progress::copy;
use super::{rjoin, Backend, BoxFut, Entry, Progress};
use crate::error::{Ctx, Res};
use crate::ssh::SshConn;

pub struct Sftp {
    sftp: russh_sftp::client::SftpSession,
    /// Keeps the SSH connection alive for as long as the session exists.
    _conn: Arc<SshConn>,
}

impl Sftp {
    pub async fn open(conn: Arc<SshConn>) -> Res<Self> {
        let ch = conn.open_session().await?;
        ch.request_subsystem(true, "sftp").await.ctx("sftp subsystem")?;
        let cfg = russh_sftp::client::Config { max_concurrent_writes: 32, ..Default::default() };
        let sftp =
            russh_sftp::client::SftpSession::new_with_config(ch.into_stream(), cfg).await.ctx("sftp init")?;
        sftp.set_timeout(60);
        Ok(Self { sftp, _conn: conn })
    }

    fn remove_rec<'a>(&'a self, path: &'a str, is_dir: bool) -> BoxFut<'a, ()> {
        Box::pin(async move {
            if !is_dir {
                return self.sftp.remove_file(path).await.ctx(path);
            }
            for e in self.list(path).await? {
                self.remove_rec(&e.path, e.is_dir && !e.is_link).await?;
            }
            self.sftp.remove_dir(path).await.ctx(path)
        })
    }
}

impl Backend for Sftp {
    async fn home(&self) -> Res<String> {
        self.sftp.canonicalize(".").await.s()
    }

    async fn list(&self, path: &str) -> Res<Vec<Entry>> {
        let mut v = Vec::new();
        for e in self.sftp.read_dir(path).await.ctx(path)? {
            let name = e.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let m = e.metadata();
            let full = rjoin(path, &name);
            let is_dir = if m.is_symlink() {
                self.sftp.metadata(full.clone()).await.map(|t| t.is_dir()).unwrap_or(false)
            } else {
                m.is_dir()
            };
            v.push(Entry {
                name,
                path: full,
                is_dir,
                is_link: m.is_symlink(),
                size: m.size.unwrap_or(0),
                mtime: m.mtime.unwrap_or(0) as i64,
                perm: m.permissions.map(|p| p & 0o7777),
            });
        }
        Ok(v)
    }

    async fn mkdir(&self, path: &str) -> Res<()> {
        self.sftp.create_dir(path).await.ctx(path)
    }

    async fn rename(&self, from: &str, to: &str) -> Res<()> {
        self.sftp.rename(from, to).await.s()
    }

    async fn remove(&self, path: &str, is_dir: bool) -> Res<()> {
        self.remove_rec(path, is_dir).await
    }

    async fn download(&self, path: &str, local: &str, p: &Progress) -> Res<()> {
        let src = self.sftp.open(path).await.ctx(path)?;
        let mut dst = tokio::fs::File::create(local).await.ctx(local)?;
        copy(src, &mut dst, p).await?;
        dst.flush().await.s()
    }

    async fn upload(&self, local: &str, path: &str, p: &Progress) -> Res<()> {
        let src = tokio::fs::File::open(local).await.ctx(local)?;
        let mut dst = self.sftp.create(path).await.ctx(path)?;
        copy(src, &mut dst, p).await?;
        dst.shutdown().await.s()
    }

    async fn chmod(&self, path: &str, mode: u32) -> Res<()> {
        let mut attrs = self.sftp.metadata(path).await.s()?;
        attrs.permissions = Some((attrs.permissions.unwrap_or(0) & !0o7777) | (mode & 0o7777));
        self.sftp.set_metadata(path, attrs).await.s()
    }
}
