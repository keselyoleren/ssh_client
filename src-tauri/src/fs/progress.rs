//! Byte counting + cancellation shared by every transfer.

use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::task::{Context, Poll};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

use crate::error::{Ctx, Res};

/// Shared transfer state. Clone it freely; all clones observe the same counters.
#[derive(Default, Clone)]
pub struct Progress {
    /// Bytes moved so far.
    pub done: Arc<AtomicU64>,
    /// Set to abort the transfer at the next read/write.
    pub cancel: Arc<AtomicBool>,
}

fn cancelled() -> std::io::Error {
    // Not `ErrorKind::Interrupted`: tokio/std I/O loops retry on that kind,
    // which would spin forever instead of aborting the transfer.
    std::io::Error::other("cancelled")
}

/// Stream `src` into `dst` with a large buffer, counting bytes into `p`.
pub async fn copy<R, W>(src: R, dst: &mut W, p: &Progress) -> Res<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin + ?Sized,
{
    let mut r = tokio::io::BufReader::with_capacity(256 * 1024, ProgressReader { inner: src, p });
    tokio::io::copy_buf(&mut r, dst).await.map(|_| ()).s()
}

/// `AsyncRead` adapter that counts bytes and honours cancellation.
pub struct ProgressReader<'a, R> {
    pub inner: R,
    pub p: &'a Progress,
}

impl<R: AsyncRead + Unpin> AsyncRead for ProgressReader<'_, R> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        if self.p.cancel.load(Ordering::Relaxed) {
            return Poll::Ready(Err(cancelled()));
        }
        let before = buf.filled().len();
        let r = Pin::new(&mut self.inner).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = r {
            self.p.done.fetch_add((buf.filled().len() - before) as u64, Ordering::Relaxed);
        }
        r
    }
}

/// `AsyncWrite` adapter that counts bytes and honours cancellation
/// (used where the library pushes data into a writer, e.g. S3 downloads).
pub struct ProgressWriter<'a, W> {
    pub inner: &'a mut W,
    pub p: &'a Progress,
}

impl<W: AsyncWrite + Unpin> AsyncWrite for ProgressWriter<'_, W> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        if self.p.cancel.load(Ordering::Relaxed) {
            return Poll::Ready(Err(cancelled()));
        }
        let r = Pin::new(&mut *self.inner).poll_write(cx, buf);
        if let Poll::Ready(Ok(n)) = r {
            self.p.done.fetch_add(n as u64, Ordering::Relaxed);
        }
        r
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut *self.inner).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut *self.inner).poll_shutdown(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn counts_bytes() {
        let p = Progress::default();
        let data = vec![7u8; 1_000_000];
        let mut out = Vec::new();
        copy(&data[..], &mut out, &p).await.unwrap();
        assert_eq!(out, data);
        assert_eq!(p.done.load(Ordering::Relaxed), 1_000_000);
    }

    #[tokio::test]
    async fn honours_cancel() {
        let p = Progress::default();
        p.cancel.store(true, Ordering::Relaxed);
        let mut out = Vec::new();
        assert!(copy(&[1u8, 2, 3][..], &mut out, &p).await.is_err());
    }
}
