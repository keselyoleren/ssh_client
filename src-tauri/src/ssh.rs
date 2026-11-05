//! SSH connections: pooled per host, jump-host (ProxyJump) chaining,
//! password / keyboard-interactive / key / agent auth, TOFU host keys,
//! and remote (-R) forwarding dispatch.

use parking_lot::Mutex;
use russh::client::{self, Handle, Msg, Session};
use russh::keys::{self, HashAlg, PrivateKeyWithHashAlg, PublicKey, PublicKeyOrCertificate};
use russh::{Channel, ChannelMsg};
use std::collections::HashMap;
use std::sync::{Arc, Weak};
use std::time::Duration;

use crate::error::{Ctx, Res};
use crate::vault::{now, Host, KnownHost, Vault};

pub type RemoteFwdMap = Arc<Mutex<HashMap<u32, (String, u16)>>>;

pub struct Client {
    vault: Arc<Vault>,
    host_key_name: String,
    host: String,
    port: u16,
    reject_reason: Arc<Mutex<Option<String>>>,
    remote_fwd: RemoteFwdMap,
}

fn pubkey_of(k: &PublicKeyOrCertificate) -> PublicKey {
    match k {
        PublicKeyOrCertificate::PublicKey { key, .. } => key.clone(),
        PublicKeyOrCertificate::Certificate(c) => PublicKey::new(c.public_key().clone(), ""),
    }
}

impl client::Handler for Client {
    type Error = anyhow::Error;

    async fn check_server_key(&mut self, server_key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
        let key = pubkey_of(server_key);
        let fp = key.fingerprint(HashAlg::Sha256).to_string();
        let algo = key.algorithm().to_string();

        // Respect the user's OpenSSH known_hosts if it already has an opinion.
        if let Err(keys::Error::KeyChanged { line }) = keys::check_known_hosts(&self.host, self.port, &key) {
            *self.reject_reason.lock() = Some(format!(
                "HOST KEY CHANGED for {} (~/.ssh/known_hosts line {line}). Possible MITM attack. New fingerprint: {fp}",
                self.host_key_name
            ));
            return Ok(false);
        }

        let existing = {
            let d = self.vault.data.read();
            d.known_hosts.iter().find(|k| k.host == self.host_key_name && k.key_type == algo).cloned()
        };
        match existing {
            Some(k) if k.fingerprint == fp => Ok(true),
            Some(k) => {
                *self.reject_reason.lock() = Some(format!(
                    "HOST KEY CHANGED for {}: expected {}, got {fp}. Remove it from Known Hosts if this change is expected.",
                    self.host_key_name, k.fingerprint
                ));
                Ok(false)
            }
            None => {
                self.vault.data.write().known_hosts.push(KnownHost {
                    host: self.host_key_name.clone(),
                    key_type: algo,
                    fingerprint: fp,
                    added_at: now(),
                });
                let _ = self.vault.save();
                Ok(true)
            }
        }
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        _connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: client::ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        let dest = self.remote_fwd.lock().get(&connected_port).cloned();
        if let Some((h, p)) = dest {
            reply.accept().await;
            tokio::spawn(async move {
                if let Ok(mut tcp) = tokio::net::TcpStream::connect((h.as_str(), p)).await {
                    let mut stream = channel.into_stream();
                    let _ = tokio::io::copy_bidirectional(&mut tcp, &mut stream).await;
                }
            });
        }
        Ok(())
    }

    /// The server opened an agent channel (someone ran `ssh-add -l`, `git`, `ssh` … on the
    /// remote side of a shell started with agent forwarding): pipe it to the local agent.
    /// russh's default accepts the channel and drops it, which leaves the remote client hanging.
    async fn server_channel_open_agent_forward(
        &mut self,
        channel: Channel<Msg>,
        reply: client::ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        let Ok(agent) = local_agent().await else {
            // No local agent: dropping `reply` rejects the channel, so the remote side
            // gets an immediate error instead of a hang.
            return Ok(());
        };
        reply.accept().await;
        tokio::spawn(async move {
            let mut agent = agent.into_inner();
            let mut stream = channel.into_stream();
            let _ = tokio::io::copy_bidirectional(&mut agent, &mut stream).await;
        });
        Ok(())
    }
}

type LocalAgent = keys::agent::client::AgentClient<Box<dyn keys::agent::client::AgentStream + Send + Unpin>>;

/// Connect to the local ssh-agent: `$SSH_AUTH_SOCK` on Unix, the OpenSSH named pipe or
/// Pageant on Windows.
async fn local_agent() -> Result<LocalAgent, keys::Error> {
    #[cfg(unix)]
    let agent = keys::agent::client::AgentClient::connect_env().await.map(|a| a.dynamic());
    #[cfg(windows)]
    let agent =
        match keys::agent::client::AgentClient::connect_named_pipe(r"\\.\pipe\openssh-ssh-agent").await {
            Ok(a) => Ok(a.dynamic()),
            Err(_) => keys::agent::client::AgentClient::connect_pageant().await.map(|a| a.dynamic()),
        };
    agent
}

pub struct SshConn {
    pub handle: Handle<Client>,
    pub remote_fwd: RemoteFwdMap,
    _jump: Option<Arc<SshConn>>,
}

impl SshConn {
    pub async fn open_session(&self) -> Res<Channel<Msg>> {
        self.handle.channel_open_session().await.ctx("open channel")
    }

    /// Run a command and collect stdout+stderr and exit code.
    pub async fn exec(&self, cmd: &str) -> Res<(String, u32)> {
        let mut ch = self.open_session().await?;
        ch.exec(true, cmd).await.s()?;
        let mut out = Vec::new();
        let mut code = 0;
        while let Some(msg) = ch.wait().await {
            match msg {
                ChannelMsg::Data { data } => out.extend_from_slice(&data),
                ChannelMsg::ExtendedData { data, .. } => out.extend_from_slice(&data),
                ChannelMsg::ExitStatus { exit_status } => code = exit_status,
                ChannelMsg::Close => break,
                _ => {}
            }
        }
        Ok((String::from_utf8_lossy(&out).into_owned(), code))
    }
}

#[derive(Default)]
pub struct Pool {
    conns: Mutex<HashMap<String, Weak<SshConn>>>,
}

impl Pool {
    pub async fn get(&self, vault: &Arc<Vault>, host: &Host) -> Res<Arc<SshConn>> {
        if let Some(c) = self.conns.lock().get(&host.id).and_then(|w| w.upgrade()) {
            if !c.handle.is_closed() {
                return Ok(c);
            }
        }
        let c = connect(vault.clone(), host.clone(), 0).await?;
        self.conns.lock().insert(host.id.clone(), Arc::downgrade(&c));
        vault.touch_host(&host.id);
        Ok(c)
    }

    /// Always create a dedicated connection (used for SFTP so heavy transfers
    /// never stall interactive shells on the same TCP stream).
    pub async fn fresh(&self, vault: &Arc<Vault>, host: &Host) -> Res<Arc<SshConn>> {
        connect(vault.clone(), host.clone(), 0).await
    }
}

fn config() -> Arc<client::Config> {
    Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(20)),
        keepalive_max: 4,
        inactivity_timeout: None,
        nodelay: true,
        window_size: 8 * 1024 * 1024,
        maximum_packet_size: 65535,
        channel_buffer_size: 256,
        ..Default::default()
    })
}

fn connect(
    vault: Arc<Vault>,
    host: Host,
    depth: u8,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Res<Arc<SshConn>>> + Send>> {
    Box::pin(async move {
        if depth > 5 {
            return Err("jump host chain too deep (loop?)".into());
        }
        let port = host.addr_port();
        let reject = Arc::new(Mutex::new(None));
        let remote_fwd: RemoteFwdMap = Default::default();
        let handler = Client {
            vault: vault.clone(),
            host_key_name: if port == 22 { host.host.clone() } else { format!("[{}]:{}", host.host, port) },
            host: host.host.clone(),
            port,
            reject_reason: reject.clone(),
            remote_fwd: remote_fwd.clone(),
        };

        let mut jump = None;
        let fut = async {
            if !host.jump_host.is_empty() && host.jump_host != host.id {
                let jh = vault.host(&host.jump_host).ok_or("jump host not found in vault")?;
                let j = connect(vault.clone(), jh, depth + 1).await?;
                let ch = j
                    .handle
                    .channel_open_direct_tcpip(host.host.clone(), port as u32, "127.0.0.1", 0)
                    .await
                    .ctx("jump host tunnel")?;
                jump = Some(j);
                client::connect_stream(config(), ch.into_stream(), handler).await.map_err(|e| e.to_string())
            } else {
                client::connect(config(), (host.host.as_str(), port), handler)
                    .await
                    .map_err(|e| e.to_string())
            }
        };
        let mut handle = match tokio::time::timeout(Duration::from_secs(20), fut).await {
            Err(_) => return Err(format!("connection to {}:{} timed out", host.host, port)),
            Ok(Err(e)) => return Err(reject.lock().take().unwrap_or(e)),
            Ok(Ok(h)) => h,
        };

        authenticate(&vault, &mut handle, &host).await?;
        Ok(Arc::new(SshConn { handle, remote_fwd, _jump: jump }))
    })
}

async fn try_key(handle: &mut Handle<Client>, user: &str, key: keys::PrivateKey) -> Res<bool> {
    let hash = if key.algorithm().is_rsa() {
        handle.best_supported_rsa_hash().await.s()?.flatten().or(Some(HashAlg::Sha512))
    } else {
        None
    };
    let r = handle.authenticate_publickey(user, PrivateKeyWithHashAlg::new(Arc::new(key), hash)).await.s()?;
    Ok(r.success())
}

async fn try_agent(handle: &mut Handle<Client>, user: &str) -> bool {
    let Ok(mut agent) = local_agent().await else { return false };
    let Ok(ids) = agent.request_identities().await else {
        return false;
    };
    for id in ids {
        let pk = id.public_key().into_owned();
        let hash = if pk.algorithm().is_rsa() { Some(HashAlg::Sha512) } else { None };
        if let Ok(r) = handle.authenticate_publickey_with(user, pk, hash, &mut agent).await {
            if r.success() {
                return true;
            }
        }
    }
    false
}

async fn authenticate(vault: &Vault, handle: &mut Handle<Client>, host: &Host) -> Res<()> {
    let user = if host.username.is_empty() { "root".to_string() } else { host.username.clone() };
    let mut tried = Vec::new();

    // 1. explicit key from keychain
    if !host.key_id.is_empty() {
        let k = vault.key(&host.key_id).ok_or("selected SSH key no longer exists in keychain")?;
        let pass = (!k.passphrase.is_empty()).then_some(k.passphrase.as_str());
        let key = keys::decode_secret_key(&k.private_key, pass).ctx("decode key")?;
        if try_key(handle, &user, key).await? {
            return Ok(());
        }
        tried.push("publickey");
    }

    // 2. password, then keyboard-interactive answering with the password
    if !host.password.is_empty() {
        if handle.authenticate_password(&user, &host.password).await.s()?.success() {
            return Ok(());
        }
        use russh::client::KeyboardInteractiveAuthResponse as K;
        let mut resp = handle.authenticate_keyboard_interactive_start(&user, None).await.s()?;
        for _ in 0..4 {
            match resp {
                K::Success => return Ok(()),
                K::Failure { .. } => break,
                K::InfoRequest { prompts, .. } => {
                    let answers = prompts.iter().map(|_| host.password.clone()).collect();
                    resp = handle.authenticate_keyboard_interactive_respond(answers).await.s()?;
                }
            }
        }
        tried.push("password");
    }

    // 3. ssh-agent
    if try_agent(handle, &user).await {
        return Ok(());
    }
    tried.push("agent");

    // 4. default identity files (unencrypted)
    if let Some(home) = dirs::home_dir() {
        for f in ["id_ed25519", "id_ecdsa", "id_rsa"] {
            if let Ok(key) = keys::load_secret_key(home.join(".ssh").join(f), None) {
                if try_key(handle, &user, key).await.unwrap_or(false) {
                    return Ok(());
                }
            }
        }
    }
    Err(format!("authentication failed for {user}@{} (tried: {})", host.host, tried.join(", ")))
}
