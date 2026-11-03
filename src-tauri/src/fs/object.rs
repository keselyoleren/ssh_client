//! Object storage that doesn't speak the S3 API, through Apache OpenDAL:
//! Azure Blob Storage and Google Cloud Storage (service-account auth).
//!
//! A session is bound to one container/bucket. Paths look like `/<bucket>/<key>`,
//! the same layout as the S3 backend, so the UI treats both alike.

use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio_util::compat::{FuturesAsyncReadCompatExt, FuturesAsyncWriteCompatExt};

use super::progress::copy;
use super::{Backend, Entry, Progress};
use crate::error::{Ctx, Res};
use crate::vault::Host;

pub struct ObjectStore {
    op: opendal::Operator,
    bucket: String,
    /// Azure only: what's needed to sign read-only share links ourselves.
    azure: Option<AzureSigner>,
}

struct AzureSigner {
    account: String,
    /// Decoded account key; `None` when the host uses a SAS token instead.
    key: Option<Vec<u8>>,
    endpoint: String,
}

/// OpenDAL needs an HTTP transport registered once per process (first install wins).
fn init() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(opendal::install_default);
}

fn e(err: opendal::Error) -> String {
    err.to_string()
}

impl ObjectStore {
    /// Azure Blob Storage. `access_key` = account name, `secret_key` = account key or SAS token,
    /// `bucket` = container. `endpoint` defaults to `https://<account>.blob.core.windows.net`.
    pub fn azure(host: &Host) -> Res<Self> {
        init();
        let account = host.access_key.trim();
        let container = host.bucket.trim();
        if account.is_empty() || container.is_empty() {
            return Err("Azure needs an account name and a container".into());
        }
        let endpoint = if host.endpoint.trim().is_empty() {
            format!("https://{account}.blob.core.windows.net")
        } else {
            host.endpoint.trim().trim_end_matches('/').to_string()
        };
        let secret = host.secret_key.trim();
        let is_sas = secret.starts_with("sv=") || secret.starts_with("?sv=");
        let mut b = opendal::services::Azblob::default()
            .container(container)
            .endpoint(&endpoint)
            .account_name(account);
        b = if is_sas { b.sas_token(secret.trim_start_matches('?')) } else { b.account_key(secret) };
        let key = if is_sas {
            None
        } else {
            use base64::Engine;
            Some(
                base64::engine::general_purpose::STANDARD
                    .decode(secret)
                    .ctx("account key is not valid base64")?,
            )
        };
        Ok(Self {
            op: opendal::Operator::new(b).map_err(e)?,
            bucket: container.to_string(),
            azure: Some(AzureSigner { account: account.to_string(), key, endpoint }),
        })
    }

    /// Google Cloud Storage with a service-account key (JSON). Without a key the bucket
    /// is read anonymously (public buckets only).
    pub fn gcs(host: &Host) -> Res<Self> {
        use base64::Engine;
        init();
        let bucket = host.bucket.trim();
        if bucket.is_empty() {
            return Err("Google Cloud Storage needs a bucket name".into());
        }
        let mut b =
            opendal::services::Gcs::default().bucket(bucket).disable_vm_metadata().disable_config_load();
        if !host.endpoint.trim().is_empty() {
            b = b.endpoint(host.endpoint.trim().trim_end_matches('/'));
        }
        let json = host.credential.trim();
        if json.is_empty() {
            b = b.skip_signature();
        } else {
            serde_json::from_str::<serde_json::Value>(json).ctx("service account key is not valid JSON")?;
            b = b.credential(&base64::engine::general_purpose::STANDARD.encode(json));
        }
        Ok(Self { op: opendal::Operator::new(b).map_err(e)?, bucket: bucket.to_string(), azure: None })
    }

    /// "/bucket/a/b" -> "a/b" (rejects paths outside the session's bucket).
    fn key(&self, path: &str) -> Res<String> {
        let p = path.trim_start_matches('/');
        let rest = p.strip_prefix(self.bucket.as_str()).ok_or("path is outside this bucket")?;
        Ok(rest.trim_start_matches('/').to_string())
    }

    fn dir_key(&self, path: &str) -> Res<String> {
        let k = self.key(path)?;
        Ok(if k.is_empty() { String::new() } else { format!("{}/", k.trim_end_matches('/')) })
    }
}

impl Backend for ObjectStore {
    async fn home(&self) -> Res<String> {
        Ok(format!("/{}", self.bucket))
    }

    async fn list(&self, path: &str) -> Res<Vec<Entry>> {
        if path.trim_matches('/').is_empty() {
            let b = &self.bucket;
            return Ok(vec![Entry {
                name: b.clone(),
                path: format!("/{b}"),
                is_dir: true,
                is_link: false,
                size: 0,
                mtime: 0,
                perm: None,
            }]);
        }
        let prefix = self.dir_key(path)?;
        let mut v = Vec::new();
        for ent in self.op.list(&prefix).await.map_err(e)? {
            let p = ent.path();
            if p == prefix || p.is_empty() {
                continue; // the folder itself
            }
            let m = ent.metadata();
            let is_dir = m.is_dir() || p.ends_with('/');
            let name = p.trim_end_matches('/').rsplit('/').next().unwrap_or("").to_string();
            let mtime = m
                .last_modified()
                .map(|t| {
                    std::time::SystemTime::from(t)
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0)
                })
                .unwrap_or(0);
            v.push(Entry {
                path: format!("/{}/{}", self.bucket, p.trim_end_matches('/')),
                name,
                is_dir,
                is_link: false,
                size: if is_dir { 0 } else { m.content_length() },
                mtime,
                perm: None,
            });
        }
        Ok(v)
    }

    async fn mkdir(&self, path: &str) -> Res<()> {
        let k = self.dir_key(path)?;
        if k.is_empty() {
            return Err("creating buckets is not supported here".into());
        }
        self.op.create_dir(&k).await.map_err(e)
    }

    async fn rename(&self, from: &str, to: &str) -> Res<()> {
        let (a, b) = (self.key(from)?, self.key(to)?);
        if self.op.stat(&a).await.map(|m| m.is_dir()).unwrap_or(false) {
            return Err("renaming folders isn't supported for object storage".into());
        }
        self.op.copy(&a, &b).await.map_err(e)?;
        self.op.delete(&a).await.map_err(e)
    }

    async fn remove(&self, path: &str, is_dir: bool) -> Res<()> {
        if is_dir {
            let k = self.dir_key(path)?;
            if k.is_empty() {
                return Err("deleting a whole bucket is not supported here".into());
            }
            // Delete object by object instead of using batch APIs, which not every
            // provider (or emulator) implements. Files first, then folder markers, deepest first.
            let mut paths: Vec<String> = self
                .op
                .list_with(&k)
                .recursive(true)
                .await
                .map_err(e)?
                .into_iter()
                .map(|x| x.path().to_string())
                .collect();
            paths.sort_by_key(|p| (p.ends_with('/'), std::cmp::Reverse(p.matches('/').count())));
            for p in paths.iter().chain(std::iter::once(&k)) {
                self.op.delete(p).await.map_err(e)?;
            }
            Ok(())
        } else {
            self.op.delete(&self.key(path)?).await.map_err(e)
        }
    }

    async fn download(&self, path: &str, local: &str, p: &Progress) -> Res<()> {
        let reader = self.op.reader(&self.key(path)?).await.map_err(e)?;
        let src = reader.into_futures_async_read(..).await.map_err(e)?.compat();
        let mut dst = tokio::fs::File::create(local).await.ctx(local)?;
        copy(src, &mut dst, p).await?;
        dst.flush().await.s()
    }

    async fn upload(&self, local: &str, path: &str, p: &Progress) -> Res<()> {
        let src = tokio::fs::File::open(local).await.ctx(local)?;
        let writer = self.op.writer_with(&self.key(path)?).chunk(8 * 1024 * 1024).await.map_err(e)?;
        let mut dst = writer.into_futures_async_write().compat_write();
        copy(src, &mut dst, p).await?;
        dst.shutdown().await.s() // completes the upload
    }

    async fn presign(&self, path: &str, expiry_secs: u32) -> Res<String> {
        let key = self.key(path)?;
        if let Some(az) = &self.azure {
            return az.read_only_link(&self.bucket, &key, expiry_secs);
        }
        let req = self
            .op
            .presign_read(&key, Duration::from_secs(expiry_secs as u64))
            .await
            .map_err(|err| format!("can't create a share link with these credentials: {err}"))?;
        Ok(req.uri().to_string())
    }
}

/// Percent-encode for URLs (RFC 3986 unreserved characters pass through; `/` optionally kept).
fn pct(s: &str, keep_slash: bool) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b'/' if keep_slash => out.push('/'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

impl AzureSigner {
    /// A read-only (sp=r) service SAS for one blob, signed with the account key.
    /// See https://learn.microsoft.com/rest/api/storageservices/create-service-sas
    fn read_only_link(&self, container: &str, blob: &str, expiry_secs: u32) -> Res<String> {
        use base64::Engine;
        use hmac::{Hmac, Mac};
        let key = self
            .key
            .as_ref()
            .ok_or("share links need the storage account key; this host uses a SAS token")?;
        let version = "2020-12-06";
        let expiry = (chrono::Utc::now() + chrono::Duration::seconds(expiry_secs as i64))
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string();
        let resource = format!("/blob/{}/{}/{}", self.account, container, blob);
        // sp, st, se, canonicalizedResource, si, sip, spr, sv, sr, snapshot, ses, rscc, rscd, rsce, rscl, rsct
        let to_sign = format!("r\n\n{expiry}\n{resource}\n\n\n\n{version}\nb\n\n\n\n\n\n\n");
        let mut mac = Hmac::<sha2::Sha256>::new_from_slice(key).s()?;
        mac.update(to_sign.as_bytes());
        let sig = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
        Ok(format!(
            "{}/{}/{}?sv={version}&se={}&sr=b&sp=r&sig={}",
            self.endpoint,
            pct(container, false),
            pct(blob, true),
            pct(&expiry, false),
            pct(&sig, false)
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::pct;

    #[test]
    fn percent_encoding() {
        assert_eq!(pct("a b/c+d", true), "a%20b/c%2Bd");
        assert_eq!(pct("a/b=", false), "a%2Fb%3D");
    }
}
