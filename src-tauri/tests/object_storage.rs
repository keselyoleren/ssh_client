//! End-to-end tests for object storage that doesn't use the S3 API:
//! Azure Blob Storage (against Azurite) and Google Cloud Storage (against fake-gcs-server).
//!
//! Ignored by default. Start the emulators (see tests/servers/docker-compose.yml) and run:
//!
//! ```sh
//! cargo test --manifest-path src-tauri/Cargo.toml --test object_storage -- --ignored --nocapture
//! ```
//!
//! Endpoints can be overridden with AZURITE_URL (default http://127.0.0.1:10000) and
//! FAKE_GCS_URL (default http://127.0.0.1:4443).

use kshell_lib::{fs::Fs, fs::Progress, vault::Host};
use std::io::{Read, Write};

// Azurite's well-known development account (public, documented by Microsoft).
const AZ_ACCOUNT: &str = "devstoreaccount1";
const AZ_KEY: &str =
    "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

macro_rules! check {
    ($name:expr, $e:expr) => {{
        let t = std::time::Instant::now();
        match $e {
            Ok(v) => {
                println!("  ✔ {} ({} ms)", $name, t.elapsed().as_millis());
                v
            }
            Err(e) => panic!("✖ {}: {}", $name, e),
        }
    }};
}

fn url(var: &str, default: &str) -> String {
    std::env::var(var).unwrap_or_else(|_| default.to_string())
}

/// Minimal HTTP/1.1 request over a plain TCP socket (emulators only, no TLS). Returns the status code.
fn http(addr: &str, req: &str) -> u16 {
    let mut s = std::net::TcpStream::connect(addr).expect("connect");
    s.write_all(req.as_bytes()).unwrap();
    let mut buf = [0u8; 512];
    let n = s.read(&mut buf).unwrap_or(0);
    String::from_utf8_lossy(&buf[..n]).split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0)
}

fn host_port(u: &str) -> String {
    u.trim_start_matches("http://").trim_end_matches('/').to_string()
}

/// Create an Azure container with a SharedKey-signed request (K-Shell itself never creates containers).
fn azure_create_container(base: &str, container: &str) -> u16 {
    use base64::Engine;
    use hmac::{Hmac, Mac};
    let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    let version = "2021-08-06";
    let to_sign = format!(
        "PUT\n{}x-ms-date:{date}\nx-ms-version:{version}\n/{AZ_ACCOUNT}/{AZ_ACCOUNT}/{container}\nrestype:container",
        "\n".repeat(11)
    );
    let key = base64::engine::general_purpose::STANDARD.decode(AZ_KEY).unwrap();
    let mut mac = Hmac::<sha2::Sha256>::new_from_slice(&key).unwrap();
    mac.update(to_sign.as_bytes());
    let sig = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    let hp = host_port(base);
    http(
        &hp,
        &format!(
            "PUT /{AZ_ACCOUNT}/{container}?restype=container HTTP/1.1\r\nHost: {hp}\r\nx-ms-date: {date}\r\nx-ms-version: {version}\r\n\
             Authorization: SharedKey {AZ_ACCOUNT}:{sig}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        ),
    )
}

fn gcs_create_bucket(base: &str, bucket: &str) -> u16 {
    let hp = host_port(base);
    let body = format!("{{\"name\":\"{bucket}\"}}");
    http(
        &hp,
        &format!(
            "POST /storage/v1/b?project=test HTTP/1.1\r\nHost: {hp}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ),
    )
}

/// `big` is uploaded and downloaded again; `file` is its name inside `local`.
async fn exercise(name: &str, f: &Fs, root: &str, local: &std::path::Path, file: &str, big: &[u8]) {
    let mb = big.len() as f64 / 1e6;
    println!("{name}");
    let home = check!("home", f.home().await);
    assert_eq!(home, root);
    let d = f.join(root, "kshell-test");
    let _ = f.remove(&d, true).await;
    check!("mkdir", f.mkdir(&d).await);
    let src = local.join(file);
    let t = std::time::Instant::now();
    check!(
        format!("upload {mb:.0} MB"),
        f.upload(&src.to_string_lossy(), &f.join(&d, "big.bin"), &Progress::default()).await
    );
    println!("    {:.1} MB/s", mb / t.elapsed().as_secs_f64());
    let ls = check!("list", f.list(&d).await);
    assert!(ls.iter().any(|e| e.name == "big.bin" && e.size == big.len() as u64 && !e.is_dir), "{ls:?}");
    let root_ls = check!("list bucket root", f.list(root).await);
    assert!(root_ls.iter().any(|e| e.name == "kshell-test" && e.is_dir), "{root_ls:?}");
    let dl = local.join(format!("dl-{name}.bin"));
    let p = Progress::default();
    check!(
        format!("download {mb:.0} MB"),
        f.download(&f.join(&d, "big.bin"), &dl.to_string_lossy(), &p).await
    );
    check!("content identical", if std::fs::read(&dl).unwrap() == big { Ok(()) } else { Err("mismatch") });
    check!(
        "progress counted",
        if p.done.load(std::sync::atomic::Ordering::Relaxed) == big.len() as u64 {
            Ok(())
        } else {
            Err("wrong byte count")
        }
    );
    check!("write text", f.write_text(&f.join(&d, "note.txt"), "hello\nworld").await);
    assert_eq!(check!("read text", f.read_text(&f.join(&d, "note.txt")).await), "hello\nworld");
    check!("rename", f.rename(&f.join(&d, "note.txt"), &f.join(&d, "renamed.txt")).await);
    let mut items = Vec::new();
    check!("walk", f.walk(&d, String::new(), &mut items).await);
    assert!(
        items.iter().any(|i| i.0 == "renamed.txt") && !items.iter().any(|i| i.0 == "note.txt"),
        "{items:?}"
    );
    check!("recursive delete", f.remove(&d, true).await);
    let after = check!("list after delete", f.list(root).await);
    assert!(!after.iter().any(|e| e.name == "kshell-test"), "{after:?}");
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Azurite and fake-gcs-server (tests/servers/docker-compose.yml)"]
async fn azure_and_gcs() {
    let dir = std::env::temp_dir().join(format!("kshell-obj-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let big: Vec<u8> = (0..20_000_000u32).map(|i| (i % 251) as u8).collect();
    std::fs::write(dir.join("big.bin"), &big).unwrap();

    // ---- Azure Blob (Azurite) ----
    let az = url("AZURITE_URL", "http://127.0.0.1:10000");
    let code = azure_create_container(&az, "kshell-az");
    assert!(code == 201 || code == 409, "create container returned {code}");
    let az_host = Host {
        protocol: "azblob".into(),
        access_key: AZ_ACCOUNT.into(),
        secret_key: AZ_KEY.into(),
        bucket: "kshell-az".into(),
        endpoint: format!("{az}/{AZ_ACCOUNT}"),
        ..Default::default()
    };
    let azfs = check!("open Azure Blob", Fs::azure(&az_host));
    exercise("Azure Blob", &azfs, "/kshell-az", &dir, "big.bin", &big).await;
    azfs.write_text("/kshell-az/share.txt", "shared").await.unwrap();
    let link = check!("presign (SAS link)", azfs.presign("/kshell-az/share.txt", 600).await);
    check!("link is read-only (sp=r)", if link.contains("&sp=r&") { Ok(()) } else { Err(link.clone()) });
    let out = std::process::Command::new("curl").args(["-s", &link]).output().unwrap();
    check!(
        "SAS link downloads the file",
        if out.stdout == b"shared" {
            Ok(())
        } else {
            Err(format!("{link}\n{}", String::from_utf8_lossy(&out.stdout)))
        }
    );
    // A read-only link must not allow overwriting the blob.
    let put = std::process::Command::new("curl")
        .args([
            "-s",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "-X",
            "PUT",
            "-H",
            "x-ms-blob-type: BlockBlob",
            "--data",
            "hacked",
            &link,
        ])
        .output()
        .unwrap();
    let code = String::from_utf8_lossy(&put.stdout).to_string();
    check!(
        "link can't overwrite the file",
        if code.starts_with('4') { Ok(()) } else { Err(format!("PUT returned {code}")) }
    );
    assert_eq!(azfs.read_text("/kshell-az/share.txt").await.unwrap(), "shared");
    let bad = Host { secret_key: "AAAA".into(), ..az_host.clone() };
    let err = Fs::azure(&bad).unwrap().list("/kshell-az").await;
    check!("wrong account key is rejected", if err.is_err() { Ok(()) } else { Err("accepted a bad key") });

    // ---- Google Cloud Storage (fake-gcs-server) ----
    let gcs = url("FAKE_GCS_URL", "http://127.0.0.1:4443");
    let code = gcs_create_bucket(&gcs, "kshell-gcs");
    assert!(code == 200 || code == 409, "create bucket returned {code}");
    let gcs_host = Host {
        protocol: "gcs".into(),
        bucket: "kshell-gcs".into(),
        endpoint: gcs.clone(),
        ..Default::default()
    };
    let gfs = check!("open Google Cloud Storage", Fs::gcs(&gcs_host));
    // fake-gcs-server doesn't implement the XML multipart API that large uploads use on real GCS,
    // so stay under the 8 MB chunk size here (single-request upload).
    let small = &big[..6_000_000];
    std::fs::write(dir.join("small.bin"), small).unwrap();
    exercise("Google Cloud Storage", &gfs, "/kshell-gcs", &dir, "small.bin", small).await;
    let bad_json = Host { credential: "{not json".into(), ..gcs_host.clone() };
    check!(
        "invalid service-account JSON is rejected",
        match Fs::gcs(&bad_json) {
            Err(e) if e.contains("JSON") => Ok(()),
            Err(e) => Err(e),
            Ok(_) => Err("accepted".into()),
        }
    );

    let _ = std::fs::remove_dir_all(&dir);
    println!("\nALL OK");
}
