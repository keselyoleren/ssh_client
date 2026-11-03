//! S3-compatible object storage (AWS, R2, MinIO, Spaces, Wasabi, B2, GCS…).
//!
//! Paths look like `/<bucket>/<key>`. `/` lists buckets. "Directories" are
//! key prefixes; creating one writes an empty `prefix/` placeholder object.

use tokio::io::AsyncWriteExt;

use super::progress::{ProgressReader, ProgressWriter};
use super::{Backend, Entry, Progress};
use crate::error::{Ctx, Res};
use crate::vault::Host;

pub struct S3 {
    region: s3::Region,
    creds: s3::creds::Credentials,
    path_style: bool,
    default_bucket: String,
}

fn rfc3339(s: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(s).map(|d| d.timestamp()).unwrap_or(0)
}

/// "/bucket/key/…" -> ("bucket", "key/…")
fn split(path: &str) -> (String, String) {
    let p = path.trim_start_matches('/');
    match p.split_once('/') {
        Some((b, k)) => (b.to_string(), k.to_string()),
        None => (p.to_string(), String::new()),
    }
}

impl S3 {
    pub fn new(host: &Host) -> Res<Self> {
        let region = if host.endpoint.trim().is_empty() {
            host.region.parse::<s3::Region>().unwrap_or(s3::Region::UsEast1)
        } else {
            let mut endpoint = host.endpoint.trim().trim_end_matches('/').to_string();
            if !endpoint.starts_with("http") {
                endpoint = format!("https://{endpoint}");
            }
            let region = if host.region.is_empty() { "us-east-1".into() } else { host.region.clone() };
            s3::Region::Custom { region, endpoint }
        };
        let creds =
            s3::creds::Credentials::new(Some(&host.access_key), Some(&host.secret_key), None, None, None)
                .s()?;
        Ok(Self {
            region,
            creds,
            // Custom endpoints (MinIO & co.) almost always need path-style URLs.
            path_style: host.path_style || !host.endpoint.is_empty(),
            default_bucket: host.bucket.clone(),
        })
    }

    fn bucket(&self, name: &str) -> Res<Box<s3::Bucket>> {
        let b = s3::Bucket::new(name, self.region.clone(), self.creds.clone()).s()?;
        Ok(if self.path_style { b.with_path_style() } else { b })
    }
}

impl Backend for S3 {
    async fn home(&self) -> Res<String> {
        Ok(if self.default_bucket.is_empty() { "/".into() } else { format!("/{}", self.default_bucket) })
    }

    async fn list(&self, path: &str) -> Res<Vec<Entry>> {
        let (b, key) = split(path);
        if b.is_empty() {
            let r = s3::Bucket::list_buckets(self.region.clone(), self.creds.clone())
                .await
                .ctx("list buckets")?;
            return Ok(r
                .buckets
                .bucket
                .into_iter()
                .map(|bi| Entry {
                    path: format!("/{}", bi.name),
                    mtime: rfc3339(&bi.creation_date),
                    name: bi.name,
                    is_dir: true,
                    is_link: false,
                    size: 0,
                    perm: None,
                })
                .collect());
        }
        let prefix = if key.is_empty() { String::new() } else { format!("{}/", key.trim_end_matches('/')) };
        let pages = self.bucket(&b)?.list(prefix.clone(), Some("/".into())).await.ctx("list objects")?;
        let mut v = Vec::new();
        for page in pages {
            for cp in page.common_prefixes.unwrap_or_default() {
                let p = cp.prefix.trim_end_matches('/');
                let name = p.rsplit('/').next().unwrap_or("").to_string();
                v.push(Entry {
                    path: format!("/{b}/{p}"),
                    name,
                    is_dir: true,
                    is_link: false,
                    size: 0,
                    mtime: 0,
                    perm: None,
                });
            }
            for o in page.contents {
                if o.key == prefix {
                    continue; // the folder placeholder itself
                }
                v.push(Entry {
                    name: o.key.rsplit('/').next().unwrap_or("").to_string(),
                    path: format!("/{b}/{}", o.key),
                    is_dir: false,
                    is_link: false,
                    size: o.size,
                    mtime: rfc3339(&o.last_modified),
                    perm: None,
                });
            }
        }
        Ok(v)
    }

    async fn mkdir(&self, path: &str) -> Res<()> {
        let (b, k) = split(path);
        if k.is_empty() {
            return Err("creating buckets is not supported here".into());
        }
        self.bucket(&b)?.put_object(format!("{}/", k.trim_end_matches('/')), &[]).await.s().map(|_| ())
    }

    async fn rename(&self, from: &str, to: &str) -> Res<()> {
        let ((b, k1), (_, k2)) = (split(from), split(to));
        let bucket = self.bucket(&b)?;
        bucket.copy_object_internal(&k1, &k2).await.s()?;
        bucket.delete_object(&k1).await.s().map(|_| ())
    }

    async fn remove(&self, path: &str, is_dir: bool) -> Res<()> {
        let (b, k) = split(path);
        let bucket = self.bucket(&b)?;
        if !is_dir {
            return bucket.delete_object(&k).await.s().map(|_| ());
        }
        let prefix = format!("{}/", k.trim_end_matches('/'));
        for page in bucket.list(prefix, None).await.s()? {
            for o in page.contents {
                bucket.delete_object(&o.key).await.s()?;
            }
        }
        Ok(())
    }

    async fn download(&self, path: &str, local: &str, p: &Progress) -> Res<()> {
        let (b, k) = split(path);
        let mut file = tokio::fs::File::create(local).await.ctx(local)?;
        let mut w = ProgressWriter { inner: &mut file, p };
        self.bucket(&b)?.get_object_to_writer(&k, &mut w).await.s()?;
        file.flush().await.s()
    }

    async fn upload(&self, local: &str, path: &str, p: &Progress) -> Res<()> {
        let (b, k) = split(path);
        let src = tokio::fs::File::open(local).await.ctx(local)?;
        let mut r = ProgressReader { inner: src, p };
        self.bucket(&b)?.put_object_stream(&mut r, &k).await.s().map(|_| ())
    }

    async fn presign(&self, path: &str, expiry_secs: u32) -> Res<String> {
        let (b, k) = split(path);
        self.bucket(&b)?.presign_get(&k, expiry_secs, None).await.s()
    }
}

#[cfg(test)]
mod tests {
    use super::split;

    #[test]
    fn splits_bucket_and_key() {
        assert_eq!(split("/"), ("".into(), "".into()));
        assert_eq!(split("/media"), ("media".into(), "".into()));
        assert_eq!(split("/media/a/b.png"), ("media".into(), "a/b.png".into()));
    }
}
