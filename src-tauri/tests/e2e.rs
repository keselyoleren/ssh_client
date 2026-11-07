//! End-to-end tests against real servers (SSH + jump host, FTP, an S3-compatible server).
//!
//! They are `#[ignore]`d by default. Start the servers and run them with:
//!
//! ```sh
//! docker compose -f tests/servers/docker-compose.yml up -d --wait
//! cargo test --manifest-path src-tauri/Cargo.toml --test e2e -- --ignored --nocapture
//! docker compose -f tests/servers/docker-compose.yml down
//! ```
use kshell_lib::{
    forward,
    fs::Fs,
    fs::Progress,
    keys,
    ssh::Pool,
    terminal::{Cmd, LocalOptions, ShellOptions, Terminals},
    vault::*,
};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};

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

/// True when `s` contains an HTTP status code (2xx-4xx), i.e. a server answered.
fn http_answered(s: &str) -> bool {
    s.split(|c: char| !c.is_ascii_digit())
        .any(|t| t.len() == 3 && matches!(t.as_bytes()[0], b'2' | b'3' | b'4'))
}

fn shell(cols: u16, rows: u16, startup: &str) -> ShellOptions {
    ShellOptions { cols, rows, startup_command: startup.into(), agent_forward: false, log: None }
}

type Captured = (Channel<InvokeResponseBody>, Arc<Mutex<Vec<u8>>>, Arc<Mutex<Vec<String>>>);

fn capture() -> Captured {
    let buf = Arc::new(Mutex::new(Vec::new()));
    let ev = Arc::new(Mutex::new(Vec::new()));
    let (b, e) = (buf.clone(), ev.clone());
    let ch = Channel::new(move |m| {
        match m {
            InvokeResponseBody::Raw(r) => b.lock().unwrap().extend(r),
            InvokeResponseBody::Json(j) => e.lock().unwrap().push(j),
        }
        Ok(())
    });
    (ch, buf, ev)
}

async fn wait_for(buf: &Arc<Mutex<Vec<u8>>>, needle: &str, secs: u64) -> Result<String, String> {
    for _ in 0..secs * 20 {
        let s = String::from_utf8_lossy(&buf.lock().unwrap()).to_string();
        if s.contains(needle) {
            return Ok(s);
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    Err(format!("timeout waiting for {needle:?}; got: {:?}", String::from_utf8_lossy(&buf.lock().unwrap())))
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs docker servers (tests/servers/docker-compose.yml)"]
async fn end_to_end() {
    let dir = std::env::temp_dir().join(format!("kshell-smoke-{}", new_id()));
    let vault = Arc::new(Vault::load(dir.clone()).unwrap());
    let pool = Pool::default();
    let ssh = Host {
        id: "h1".into(),
        label: "docker".into(),
        protocol: "ssh".into(),
        host: "127.0.0.1".into(),
        port: 2222,
        username: "tester".into(),
        password: "secret".into(),
        ..Default::default()
    };
    vault.data.write().hosts.push(ssh.clone());

    println!("SSH");
    let conn = check!("password auth + connect", pool.get(&vault, &ssh).await);
    let (out, code) = check!("exec", conn.exec("echo hello-kshell && uname -s").await);
    assert!(out.contains("hello-kshell") && code == 0, "{out}");
    check!(
        "known host recorded (TOFU)",
        if vault.data.read().known_hosts.len() == 1 { Ok(()) } else { Err("missing") }
    );
    let again = check!("pool reuses connection", pool.get(&vault, &ssh).await);
    assert!(Arc::ptr_eq(&conn, &again));

    // tamper the stored fingerprint -> must be rejected
    vault.data.write().known_hosts[0].fingerprint = "SHA256:bogus".into();
    let r = Pool::default().fresh(&vault, &ssh).await;
    check!(
        "host key mismatch rejected",
        match r {
            Err(e) if e.contains("HOST KEY CHANGED") => Ok(()),
            Err(e) => Err(e),
            Ok(_) => Err("accepted!".into()),
        }
    );
    vault.data.write().known_hosts.clear();

    // interactive shell
    let terms = Arc::new(Terminals::default());
    let (ch, buf, ev) = capture();
    check!(
        "open shell",
        terms.open_ssh("t1".into(), conn.clone(), shell(100, 30, "echo startup-ok"), ch).await
    );
    check!("startup command ran", wait_for(&buf, "startup-ok", 10).await);
    terms.send("t1", Cmd::Write(b"stty size\n".to_vec())).unwrap();
    check!("pty size 30x100", wait_for(&buf, "30 100", 10).await);
    terms.send("t1", Cmd::Resize(120, 40)).unwrap();
    terms.send("t1", Cmd::Write(b"stty size\n".to_vec())).unwrap();
    check!("resize -> 40x120", wait_for(&buf, "40 120", 10).await);
    terms.send("t1", Cmd::Write(b"exit\n".to_vec())).unwrap();
    for _ in 0..100 {
        if !ev.lock().unwrap().is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await
    }
    check!("exit event", ev.lock().unwrap().first().cloned().ok_or("no exit event".to_string()));

    // throughput
    let (ch, buf, _) = capture();
    terms.open_ssh("t2".into(), conn.clone(), shell(200, 50, ""), ch).await.unwrap();
    let t = std::time::Instant::now();
    terms.send("t2", Cmd::Write(b"seq 1 200000; echo DONE-SEQ\n".to_vec())).unwrap();
    wait_for(&buf, "DONE-SEQ\r\n", 30).await.unwrap();
    let n = buf.lock().unwrap().len();
    println!("  ✔ throughput: {:.1} MB in {} ms", n as f64 / 1e6, t.elapsed().as_millis());
    terms.close("t2");

    // agent forwarding: a throw-away local ssh-agent holding one key; the remote `ssh-add -l`
    // must list that key's fingerprint through the forwarded agent channel.
    println!("Agent forwarding");
    let adir = std::env::temp_dir().join(format!("ksa-{}", &new_id()[..8]));
    std::fs::create_dir_all(&adir).unwrap();
    let sock = adir.join("agent.sock");
    let keyf = adir.join("id");
    let run = |cmd: &mut std::process::Command| {
        let o = cmd.env("SSH_AUTH_SOCK", &sock).output().map_err(|e| e.to_string())?;
        if o.status.success() {
            Ok(String::from_utf8_lossy(&o.stdout).into_owned())
        } else {
            Err(String::from_utf8_lossy(&o.stderr).into_owned())
        }
    };
    let started =
        check!("start local ssh-agent", run(std::process::Command::new("ssh-agent").arg("-a").arg(&sock)));
    let agent_pid =
        started.split("SSH_AGENT_PID=").nth(1).and_then(|r| r.split(';').next()).unwrap_or("").to_string();
    check!(
        "generate agent key",
        run(std::process::Command::new("ssh-keygen")
            .args(["-q", "-t", "ed25519", "-N", "", "-C", "kshell-agent-test", "-f"])
            .arg(&keyf))
    );
    check!("add key to agent", run(std::process::Command::new("ssh-add").arg(&keyf)));
    let fp =
        check!("agent key fingerprint", run(std::process::Command::new("ssh-keygen").arg("-lf").arg(&keyf)));
    let fp = fp.split_whitespace().nth(1).unwrap().to_string(); // "SHA256:…"
    std::env::set_var("SSH_AUTH_SOCK", &sock);
    let (ch, buf, _) = capture();
    let opts = ShellOptions { agent_forward: true, ..shell(100, 30, "") };
    terms.open_ssh("t3".into(), conn.clone(), opts, ch).await.unwrap();
    // The echoed command line contains `%s-END\n'`, only the real output contains `-END\r\n`.
    terms.send("t3", Cmd::Write(b"ssh-add -l; printf 'RC=%s-END\\n' $?\n".to_vec())).unwrap();
    let out = check!("remote ssh-add -l answered", wait_for(&buf, "-END\r\n", 10).await);
    check!(
        "forwarded agent lists the local key",
        if out.contains(&fp) && out.contains("RC=0-END") { Ok(()) } else { Err(out) }
    );
    terms.close("t3");
    let _ = std::process::Command::new("ssh-agent").arg("-k").env("SSH_AGENT_PID", &agent_pid).output();
    let _ = std::fs::remove_dir_all(&adir);

    // key auth
    println!("Keys");
    let key = check!("generate ed25519", keys::generate("smoke", "ed25519", ""));
    let enc = check!("generate encrypted ecdsa", keys::generate("smoke2", "ecdsa", "pw123"));
    check!("re-import encrypted key", keys::import("x", &enc.private_key, "pw123"));
    let pubk = key.public_key.clone();
    conn.exec(&format!(
        "mkdir -p ~/.ssh && echo '{pubk}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    ))
    .await
    .unwrap();
    vault.data.write().keys.push(key.clone());
    let kh = Host { id: "h2".into(), password: String::new(), key_id: key.id.clone(), ..ssh.clone() };
    let kc = check!("public key auth", Pool::default().get(&vault, &kh).await);
    assert!(kc.exec("whoami").await.unwrap().0.contains("tester"));

    // jump host
    println!("Jump host");
    let inner = Host {
        id: "h3".into(),
        label: "inner".into(),
        protocol: "ssh".into(),
        host: "kshell-ssh2".into(),
        port: 2222,
        username: "inner".into(),
        password: "inner".into(),
        jump_host: "h1".into(),
        ..Default::default()
    };
    let jc = check!("connect via ProxyJump", Pool::default().get(&vault, &inner).await);
    let (o, _) = jc.exec("whoami; hostname").await.unwrap();
    check!("inner whoami", if o.contains("inner") { Ok(()) } else { Err(o) });

    // forwards
    println!("Port forwarding");
    let fw = forward::Forwards::default();
    let lf = Forward {
        id: "f1".into(),
        kind: "local".into(),
        bind_host: "127.0.0.1".into(),
        bind_port: 18022,
        dest_host: "kshell-ssh2".into(),
        dest_port: 2222,
        ..Default::default()
    };
    check!("start local forward", fw.start(lf, conn.clone()).await);
    let banner = check!(
        "read remote banner through tunnel",
        async {
            use tokio::io::AsyncReadExt;
            let mut s = tokio::net::TcpStream::connect("127.0.0.1:18022").await.map_err(|e| e.to_string())?;
            let mut b = [0u8; 64];
            let n = tokio::time::timeout(Duration::from_secs(5), s.read(&mut b))
                .await
                .map_err(|_| "timeout".to_string())?
                .map_err(|e| e.to_string())?;
            Ok::<_, String>(String::from_utf8_lossy(&b[..n]).to_string())
        }
        .await
    );
    assert!(banner.starts_with("SSH-"), "{banner}");
    let df = Forward {
        id: "f2".into(),
        kind: "dynamic".into(),
        bind_host: "127.0.0.1".into(),
        bind_port: 11080,
        ..Default::default()
    };
    check!("start SOCKS5", fw.start(df, conn.clone()).await);
    let curl = std::process::Command::new("curl")
        .args([
            "-s",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "--socks5-hostname",
            "127.0.0.1:11080",
            "http://kshell-s3:9000/",
        ])
        .output()
        .unwrap();
    let code = String::from_utf8_lossy(&curl.stdout).to_string();
    check!(
        "HTTP through SOCKS5 reaches the S3 server",
        if http_answered(&code) { Ok(()) } else { Err(code) }
    );
    let rf = Forward {
        id: "f3".into(),
        kind: "remote".into(),
        bind_host: "localhost".into(),
        bind_port: 19000,
        dest_host: "127.0.0.1".into(),
        dest_port: 9000,
        ..Default::default()
    };
    check!("start remote forward", fw.start(rf, conn.clone()).await);
    let (o, _) = conn.exec("curl -s -o /dev/null -w '%{http_code}' http://localhost:19000/ || wget -S -O /dev/null http://localhost:19000/ 2>&1 | grep HTTP/ | head -1").await.unwrap();
    // Any HTTP status from the S3 server (it answers 403 to anonymous requests) proves the tunnel works.
    check!("server reaches local S3 via -R", if http_answered(&o) { Ok(()) } else { Err(o) });
    fw.stop("f1").await;
    fw.stop("f2").await;
    fw.stop("f3").await;

    // file systems
    let local_dir = dir.join("files");
    std::fs::create_dir_all(local_dir.join("sub")).unwrap();
    let big: Vec<u8> = (0..20_000_000u32).map(|i| (i % 251) as u8).collect();
    std::fs::write(local_dir.join("big.bin"), &big).unwrap();
    std::fs::write(local_dir.join("sub/a.txt"), "alpha").unwrap();
    let local = Fs::local();

    async fn exercise(name: &str, f: &Fs, root: &str, local_dir: &std::path::Path, big: &[u8]) {
        println!("{name}");
        let home = check!("home", f.home().await);
        let root = if root.is_empty() { home } else { root.to_string() };
        let d = f.join(&root, "kshell-test");
        let _ = f.remove(&d, true).await;
        check!("mkdir", f.mkdir(&d).await);
        let p = Progress::default();
        let t = std::time::Instant::now();
        check!(
            "upload 20 MB",
            f.upload(&local_dir.join("big.bin").to_string_lossy(), &f.join(&d, "big.bin"), &p).await
        );
        println!("    {:.1} MB/s", 20.0 / t.elapsed().as_secs_f64());
        let ls = check!("list", f.list(&d).await);
        assert!(ls.iter().any(|e| e.name == "big.bin" && e.size == 20_000_000), "{ls:?}");
        let dl = local_dir.join(format!("dl-{name}.bin"));
        let t = std::time::Instant::now();
        check!(
            "download 20 MB",
            f.download(&f.join(&d, "big.bin"), &dl.to_string_lossy(), &Progress::default()).await
        );
        println!("    {:.1} MB/s", 20.0 / t.elapsed().as_secs_f64());
        check!(
            "content identical",
            if std::fs::read(&dl).unwrap() == big { Ok(()) } else { Err("mismatch") }
        );
        check!("write text", f.write_text(&f.join(&d, "note.txt"), "hello\nworld").await);
        let txt = check!("read text", f.read_text(&f.join(&d, "note.txt")).await);
        assert_eq!(txt, "hello\nworld");
        check!("rename", f.rename(&f.join(&d, "note.txt"), &f.join(&d, "renamed.txt")).await);
        let mut items = Vec::new();
        check!("walk", f.walk(&d, String::new(), &mut items).await);
        assert!(items.iter().any(|i| i.0 == "renamed.txt"), "{items:?}");
        check!("recursive delete", f.remove(&d, true).await);
    }

    let sftp = check!("open sftp", Fs::sftp(Pool::default().fresh(&vault, &ssh).await.unwrap()).await);
    exercise("SFTP", &sftp, "", &local_dir, &big).await;

    println!("SFTP resume");
    {
        let home = sftp.home().await.unwrap();
        let d = sftp.join(&home, "kshell-resume");
        let _ = sftp.remove(&d, true).await;
        check!("mkdir", sftp.mkdir(&d).await);
        let remote = sftp.join(&d, "big.bin");
        // an upload that died after 7 MB
        let head = local_dir.join("head.bin");
        std::fs::write(&head, &big[..7_000_000]).unwrap();
        check!("partial upload", sftp.upload(&head.to_string_lossy(), &remote, &Progress::default()).await);
        check!(
            "partial size",
            match sftp.stat(&remote).await {
                Ok(Some((false, 7_000_000))) => Ok(()),
                other => Err(format!("{other:?}")),
            }
        );
        let p = Progress::default();
        let full = local_dir.join("big.bin").to_string_lossy().into_owned();
        check!("resume upload", sftp.upload_from(&full, &remote, 7_000_000, &p).await);
        assert_eq!(p.done.load(std::sync::atomic::Ordering::Relaxed), 20_000_000);
        // a download that died after 7 MB
        let dl = local_dir.join("dl-resume.bin");
        std::fs::write(&dl, &big[..7_000_000]).unwrap();
        check!(
            "resume download",
            sftp.download_from(&remote, &dl.to_string_lossy(), 7_000_000, &Progress::default()).await
        );
        check!(
            "resumed content identical",
            if std::fs::read(&dl).unwrap() == big { Ok(()) } else { Err("mismatch") }
        );
        check!(
            "missing file stats as None",
            match sftp.stat(&sftp.join(&d, "nope")).await {
                Ok(None) => Ok(()),
                other => Err(format!("{other:?}")),
            }
        );
        check!("cleanup", sftp.remove(&d, true).await);
    }

    let ftp_h = Host {
        protocol: "ftp".into(),
        host: "127.0.0.1".into(),
        port: 2121,
        username: "ftpuser".into(),
        password: "ftppass".into(),
        ..Default::default()
    };
    let ftp = check!("open ftp", Fs::ftp(&ftp_h).await);
    exercise("FTP", &ftp, "", &local_dir, &big).await;

    // S3: create a bucket first
    let s3h = Host {
        protocol: "s3".into(),
        endpoint: "http://127.0.0.1:9000".into(),
        region: "us-east-1".into(),
        access_key: "rustfsadmin".into(),
        secret_key: "rustfsadmin".into(),
        path_style: true,
        ..Default::default()
    };
    let s3fs = check!("open s3", Fs::s3(&s3h));
    // The S3 container may still be starting: retry creating the bucket for up to 60 s.
    let mut ready = false;
    for _ in 0..60 {
        let creds =
            s3::creds::Credentials::new(Some("rustfsadmin"), Some("rustfsadmin"), None, None, None).unwrap();
        let region =
            s3::Region::Custom { region: "us-east-1".into(), endpoint: "http://127.0.0.1:9000".into() };
        let _ = s3::Bucket::create_with_path_style(
            "kshell-smoke",
            region,
            creds,
            s3::BucketConfiguration::default(),
        )
        .await;
        if s3fs.list("/").await.map(|b| b.iter().any(|b| b.name == "kshell-smoke")).unwrap_or(false) {
            ready = true;
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    check!("S3 server ready, bucket created", if ready { Ok(()) } else { Err("bucket never appeared") });
    exercise("S3", &s3fs, "/kshell-smoke", &local_dir, &big).await;
    s3fs.write_text("/kshell-smoke/share.txt", "x").await.unwrap();
    let url = check!("presign", s3fs.presign("/kshell-smoke/share.txt", 600).await);
    let code = String::from_utf8_lossy(
        &std::process::Command::new("curl")
            .args(["-s", "-o", "/dev/null", "-w", "%{http_code}", &url])
            .output()
            .unwrap()
            .stdout,
    )
    .to_string();
    check!("presigned URL works", if code == "200" { Ok(()) } else { Err(code) });

    exercise("Local", &local, &dir.to_string_lossy(), &local_dir, &big).await;

    println!("Local PTY");
    let (ch, buf, ev) = capture();
    let opts = |cwd: Option<String>, startup_command: &str| LocalOptions {
        cols: 80,
        rows: 24,
        shell: Some("/bin/sh".into()),
        cwd,
        startup_command: startup_command.into(),
        log: None,
    };
    check!("spawn shell", terms.open_local("l1".into(), opts(None, ""), ch));
    terms.send("l1", Cmd::Write(b"echo local-$((40+2))\n".to_vec())).unwrap();
    check!("local echo", wait_for(&buf, "local-42", 10).await);
    terms.send("l1", Cmd::Write(b"exit\n".to_vec())).unwrap();
    for _ in 0..100 {
        if !ev.lock().unwrap().is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await
    }
    check!("local exit event", ev.lock().unwrap().first().cloned().ok_or("no exit event".to_string()));

    // project terminal: starts in the folder and runs its startup command
    let (ch, buf, _) = capture();
    let proj = std::env::temp_dir();
    check!(
        "spawn in folder",
        terms.open_local("l2".into(), opts(Some(proj.display().to_string()), "pwd"), ch)
    );
    let base = proj.file_name().unwrap().to_string_lossy().to_string();
    check!("startup command ran in folder", wait_for(&buf, &base, 10).await);
    terms.close("l2");
    let (ch, _, _) = capture();
    check!(
        "missing folder is an error",
        match terms.open_local("l3".into(), opts(Some("/no/such/dir".into()), ""), ch) {
            Err(e) if e.contains("Folder not found") => Ok(()),
            other => Err(format!("{other:?}")),
        }
    );

    println!("Vault");
    check!("save", vault.save());
    let v2 = check!("reload", Vault::load(dir.clone()));
    assert_eq!(v2.data.read().hosts.len(), vault.data.read().hosts.len());
    let raw = std::fs::read(dir.join("vault-dev.bin")).unwrap();
    check!(
        "on-disk vault is encrypted",
        if String::from_utf8_lossy(&raw).contains("secret") { Err("plaintext!") } else { Ok(()) }
    );

    let _ = std::fs::remove_dir_all(&dir);
    println!("\nALL OK");
}
