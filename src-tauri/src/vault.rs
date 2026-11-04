//! Local-first encrypted vault: hosts, keys, snippets, port-forward rules,
//! known hosts and settings. The whole vault is serialized to JSON and sealed
//! with XChaCha20-Poly1305. The 256-bit key lives in the OS keychain
//! (macOS Keychain / Windows Credential Manager / Secret Service) with a
//! 0600 key file as fallback.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use parking_lot::RwLock;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::error::{Ctx, Res};

const MAGIC: &[u8; 4] = b"TMX1";

pub fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Host {
    pub id: String,
    pub label: String,
    pub group: String,
    pub tags: Vec<String>,
    /// ssh | ftp | ftps | s3
    pub protocol: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub key_id: String,
    pub jump_host: String,
    pub startup_command: String,
    pub color: String,
    pub notes: String,
    pub os: String,
    pub agent_forward: bool,
    // S3 / object storage
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    pub path_style: bool,
    /// S3 with a custom endpoint uses path-style URLs unless this is set
    /// (needed by Alibaba OSS, Tencent COS and other virtual-hosted-only services).
    pub virtual_hosted: bool,
    /// Google Cloud Storage service-account key (JSON).
    pub credential: String,
    pub created_at: i64,
    pub last_used: i64,
}

impl Host {
    pub fn addr_port(&self) -> u16 {
        if self.port != 0 {
            return self.port;
        }
        match self.protocol.as_str() {
            "ftp" | "ftps" => 21,
            _ => 22,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Key {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub private_key: String,
    pub public_key: String,
    pub passphrase: String,
    pub fingerprint: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub command: String,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Forward {
    pub id: String,
    pub name: String,
    pub host_id: String,
    /// local | remote | dynamic
    pub kind: String,
    pub bind_host: String,
    pub bind_port: u16,
    pub dest_host: String,
    pub dest_port: u16,
    pub auto_start: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct KnownHost {
    pub host: String,
    pub key_type: String,
    pub fingerprint: String,
    pub added_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Settings {
    pub app_theme: String,
    pub term_theme: String,
    pub font_family: String,
    pub font_size: u16,
    pub line_height: f32,
    pub cursor_style: String,
    pub cursor_blink: bool,
    pub scrollback: u32,
    pub copy_on_select: bool,
    pub right_click_paste: bool,
    pub confirm_close: bool,
    /// Accent colour override (hex); empty uses the theme default.
    pub accent: String,
    /// Webview zoom factor, 1.0 = 100%.
    pub ui_zoom: f32,
    /// Use `term_theme_light` instead of `term_theme` while the app is light.
    pub term_theme_sync: bool,
    pub term_theme_light: String,
    /// Custom shortcuts: "<mac|pc>:<action id>" -> combo ("" = unbound).
    pub keybindings: std::collections::HashMap<String, String>,
    /// Install the K-Shell prompt in new bash/zsh sessions.
    pub prompt_enabled: bool,
    /// Ordered prompt segment ids (see src/lib/prompt.js).
    pub prompt_segments: Vec<String>,
    /// Where the prompt is applied: "all" | "local" | "ssh".
    pub prompt_scope: String,
    /// Show history-based autosuggestions while typing in terminals.
    pub autosuggest: bool,
    /// Keep typed commands in the vault across restarts.
    pub save_history: bool,
    /// Left sidebar hidden (toggled with ⌘B / Ctrl+Shift+B).
    pub sidebar_hidden: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            app_theme: "dark".into(),
            term_theme: "kshell".into(),
            font_family: "JetBrains Mono, Menlo, Consolas, 'DejaVu Sans Mono', monospace".into(),
            font_size: 13,
            line_height: 1.2,
            cursor_style: "block".into(),
            cursor_blink: true,
            scrollback: 10000,
            copy_on_select: true,
            right_click_paste: true,
            confirm_close: true,
            accent: String::new(),
            ui_zoom: 1.0,
            term_theme_sync: false,
            term_theme_light: "light".into(),
            keybindings: Default::default(),
            prompt_enabled: false,
            prompt_segments: ["venv", "user_host", "cwd", "git", "exit", "symbol"].map(String::from).to_vec(),
            prompt_scope: "all".into(),
            autosuggest: true,
            save_history: true,
            sidebar_hidden: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct VaultData {
    pub version: u32,
    pub hosts: Vec<Host>,
    pub keys: Vec<Key>,
    pub snippets: Vec<Snippet>,
    pub forwards: Vec<Forward>,
    pub known_hosts: Vec<KnownHost>,
    pub settings: Settings,
    /// Commands typed in terminals, newest last; feeds autosuggestions.
    pub history: Vec<HistoryEntry>,
    /// Groups of local project folders.
    pub workspaces: Vec<Workspace>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub color: String,
    pub projects: Vec<Project>,
    pub created_at: i64,
}

/// A folder opened in a local terminal, optionally running a command first.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub startup_command: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct HistoryEntry {
    pub cmd: String,
    /// "local" or the host address the command ran on.
    pub target: String,
    pub at: i64,
}

pub const HISTORY_MAX: usize = 2000;

impl VaultData {
    /// Record a command, moving an existing identical entry to the end.
    pub fn add_history(&mut self, cmd: &str, target: &str) {
        let cmd = cmd.trim();
        if cmd.is_empty() || cmd.len() > 2000 {
            return;
        }
        self.history.retain(|h| !(h.cmd == cmd && h.target == target));
        self.history.push(HistoryEntry { cmd: cmd.into(), target: target.into(), at: now() });
        let over = self.history.len().saturating_sub(HISTORY_MAX);
        self.history.drain(..over);
    }
}

pub struct Vault {
    path: PathBuf,
    key: [u8; 32],
    pub data: RwLock<VaultData>,
}

fn load_or_create_key(dir: &Path) -> Res<[u8; 32]> {
    let key_file = dir.join("vault.key");
    // In release builds prefer the OS keychain. Debug builds are re-signed on
    // every compile which would make macOS prompt for keychain access each run.
    let use_keyring = !cfg!(debug_assertions) && std::env::var("KSHELL_NO_KEYRING").is_err();
    let decode = |s: &str| -> Option<[u8; 32]> {
        let v = B64.decode(s.trim()).ok()?;
        v.try_into().ok()
    };
    if use_keyring {
        if let Ok(entry) = keyring::Entry::new("K-Shell", "vault-key") {
            if let Ok(s) = entry.get_password() {
                if let Some(k) = decode(&s) {
                    return Ok(k);
                }
            }
            // Pre-rename builds stored the key under the "TermX" service.
            let legacy = keyring::Entry::new("TermX", "vault-key")
                .and_then(|e| e.get_password())
                .ok()
                .and_then(|s| decode(&s));
            if let Some(k) = legacy {
                if entry.set_password(&B64.encode(k)).is_ok() {
                    return Ok(k);
                }
            }
            // Migrate an existing file key into the keychain, or create a new one.
            let k = std::fs::read_to_string(&key_file).ok().and_then(|s| decode(&s)).unwrap_or_else(|| {
                let mut k = [0u8; 32];
                rand::thread_rng().fill_bytes(&mut k);
                k
            });
            if entry.set_password(&B64.encode(k)).is_ok() {
                let _ = std::fs::remove_file(&key_file);
                return Ok(k);
            }
            write_key_file(&key_file, &k)?;
            return Ok(k);
        }
    }
    if let Some(k) = std::fs::read_to_string(&key_file).ok().and_then(|s| decode(&s)) {
        return Ok(k);
    }
    let mut k = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut k);
    write_key_file(&key_file, &k)?;
    Ok(k)
}

fn write_key_file(path: &Path, k: &[u8; 32]) -> Res<()> {
    std::fs::write(path, B64.encode(k)).s()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub fn seal(key: &[u8; 32], plain: &[u8]) -> Res<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let mut nonce = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut nonce);
    let ct = cipher.encrypt(XNonce::from_slice(&nonce), plain).map_err(|_| "encrypt failed".to_string())?;
    let mut out = Vec::with_capacity(4 + 24 + ct.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

pub fn open(key: &[u8; 32], blob: &[u8]) -> Res<Vec<u8>> {
    if blob.len() < 28 || &blob[..4] != MAGIC {
        return Err("invalid vault file".into());
    }
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(XNonce::from_slice(&blob[4..28]), &blob[28..])
        .map_err(|_| "cannot decrypt vault (wrong key or corrupted file)".to_string())
}

const BACKUP_MAGIC: &[u8; 4] = b"TMXB";

/// Derive a key from a user passphrase for portable backups (Argon2id).
fn passphrase_key(pass: &str, salt: &[u8]) -> Res<[u8; 32]> {
    let mut out = [0u8; 32];
    argon2::Argon2::default()
        .hash_password_into(pass.as_bytes(), salt, &mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// Serialize and encrypt `data` with a passphrase.
/// Format: `TMXB | salt(16) | TMX1 | nonce(24) | ciphertext`.
pub fn export_backup(data: &VaultData, passphrase: &str) -> Res<Vec<u8>> {
    if passphrase.is_empty() {
        return Err("a passphrase is required".into());
    }
    let json = serde_json::to_vec(data).s()?;
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let mut out = BACKUP_MAGIC.to_vec();
    out.extend_from_slice(&salt);
    out.extend_from_slice(&seal(&passphrase_key(passphrase, &salt)?, &json)?);
    Ok(out)
}

pub fn import_backup(blob: &[u8], passphrase: &str) -> Res<VaultData> {
    if blob.len() < 20 || &blob[..4] != BACKUP_MAGIC {
        return Err("not a K-Shell backup file".into());
    }
    let key = passphrase_key(passphrase, &blob[4..20])?;
    let json = open(&key, &blob[20..]).map_err(|_| "wrong passphrase or corrupted backup".to_string())?;
    serde_json::from_slice(&json).s()
}

impl VaultData {
    /// Merge another vault into this one. Items with the same id are replaced;
    /// settings are kept as they are.
    pub fn merge(&mut self, other: VaultData) {
        for h in other.hosts {
            upsert(&mut self.hosts, h);
        }
        for k in other.keys {
            upsert(&mut self.keys, k);
        }
        for s in other.snippets {
            upsert(&mut self.snippets, s);
        }
        for f in other.forwards {
            upsert(&mut self.forwards, f);
        }
        for w in other.workspaces {
            upsert(&mut self.workspaces, w);
        }
        for kh in other.known_hosts {
            if !self.known_hosts.iter().any(|x| x.host == kh.host && x.key_type == kh.key_type) {
                self.known_hosts.push(kh);
            }
        }
    }
}

/// Copy vault files from the pre-rename data directory (`…/dev.keselyoleren.termx`)
/// into `dir` the first time K-Shell starts. The old directory is left untouched.
pub fn migrate_legacy_dir(dir: &Path) {
    let Some(old) = dir.parent().map(|p| p.join("dev.keselyoleren.termx")) else { return };
    if !old.is_dir() || dir.join("vault.key").exists() || dir.join("vault.bin").exists() {
        return;
    }
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    for f in ["vault.key", "vault.bin", "vault-dev.bin"] {
        let src = old.join(f);
        if src.exists() {
            let _ = std::fs::copy(&src, dir.join(f));
        }
    }
}

impl Vault {
    pub fn load(dir: PathBuf) -> Res<Self> {
        std::fs::create_dir_all(&dir).s()?;
        let key = load_or_create_key(&dir)?;
        let path = dir.join(if cfg!(debug_assertions) { "vault-dev.bin" } else { "vault.bin" });
        let data = match std::fs::read(&path) {
            Ok(blob) => serde_json::from_slice(&open(&key, &blob)?).s()?,
            Err(_) => VaultData { version: 1, ..Default::default() },
        };
        Ok(Self { path, key, data: RwLock::new(data) })
    }

    pub fn save(&self) -> Res<()> {
        let json = serde_json::to_vec(&*self.data.read()).s()?;
        let blob = seal(&self.key, &json)?;
        let tmp = self.path.with_extension("tmp");
        std::fs::write(&tmp, blob).s()?;
        std::fs::rename(&tmp, &self.path).s()?;
        Ok(())
    }

    pub fn host(&self, id: &str) -> Option<Host> {
        self.data.read().hosts.iter().find(|h| h.id == id).cloned()
    }

    pub fn key(&self, id: &str) -> Option<Key> {
        self.data.read().keys.iter().find(|k| k.id == id).cloned()
    }

    /// Record that a host was just used (drives the "Recent" list).
    pub fn touch_host(&self, id: &str) {
        let found = {
            let mut d = self.data.write();
            d.hosts.iter_mut().find(|h| h.id == id).map(|h| h.last_used = now()).is_some()
        };
        if found {
            let _ = self.save();
        }
    }
}

/// Items stored in the vault lists with a string id.
pub trait HasId {
    fn id_mut(&mut self) -> &mut String;
    fn id_ref(&self) -> &str;
}
macro_rules! has_id { ($($t:ty),*) => { $(impl HasId for $t {
    fn id_mut(&mut self) -> &mut String { &mut self.id }
    fn id_ref(&self) -> &str { &self.id }
})* } }
has_id!(Host, Key, Snippet, Forward, Workspace, Project);

/// Upsert: assign an id when missing, replace when present.
pub fn upsert<T: HasId + Clone>(list: &mut Vec<T>, mut item: T) -> T {
    if item.id_mut().is_empty() {
        *item.id_mut() = new_id();
    }
    let id = item.id_mut().clone();
    match list.iter_mut().find(|x| x.id_ref() == id) {
        Some(slot) => *slot = item.clone(),
        None => list.push(item.clone()),
    }
    item
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_roundtrip_and_tamper_detection() {
        let key = [42u8; 32];
        let mut blob = seal(&key, b"hello").unwrap();
        assert_eq!(open(&key, &blob).unwrap(), b"hello");
        assert!(open(&[0u8; 32], &blob).is_err(), "wrong key must fail");
        *blob.last_mut().unwrap() ^= 1;
        assert!(open(&key, &blob).is_err(), "tampered data must fail");
    }

    #[test]
    fn history_dedupes_and_caps() {
        let mut d = VaultData::default();
        d.add_history("ls", "local");
        d.add_history("  pwd ", "local");
        d.add_history("ls", "local");
        d.add_history("ls", "srv");
        d.add_history("   ", "local");
        let got: Vec<_> = d.history.iter().map(|h| (h.cmd.as_str(), h.target.as_str())).collect();
        assert_eq!(got, [("pwd", "local"), ("ls", "local"), ("ls", "srv")]);
        for i in 0..HISTORY_MAX + 10 {
            d.add_history(&format!("echo {i}"), "local");
        }
        assert_eq!(d.history.len(), HISTORY_MAX);
        assert_eq!(d.history.last().unwrap().cmd, format!("echo {}", HISTORY_MAX + 9));
    }

    #[test]
    fn backup_roundtrip() {
        let mut d = VaultData::default();
        d.hosts.push(Host {
            id: "a".into(),
            label: "web".into(),
            password: "pw".into(),
            ..Default::default()
        });
        let blob = export_backup(&d, "correct horse").unwrap();
        assert!(!String::from_utf8_lossy(&blob).contains("web"));
        assert_eq!(import_backup(&blob, "correct horse").unwrap().hosts[0].password, "pw");
        assert!(import_backup(&blob, "wrong").is_err());
    }

    #[test]
    fn upsert_inserts_then_replaces() {
        let mut list: Vec<Snippet> = Vec::new();
        let s = upsert(&mut list, Snippet { name: "a".into(), ..Default::default() });
        assert!(!s.id.is_empty());
        upsert(&mut list, Snippet { name: "b".into(), ..s.clone() });
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "b");
    }

    #[test]
    fn vault_persists_encrypted() {
        let dir = std::env::temp_dir().join(format!("kshell-test-{}", new_id()));
        let v = Vault::load(dir.clone()).unwrap();
        v.data.write().hosts.push(Host {
            id: "x".into(),
            password: "topsecret".into(),
            ..Default::default()
        });
        v.save().unwrap();
        let raw = std::fs::read(&v.path).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("topsecret"));
        assert_eq!(Vault::load(dir.clone()).unwrap().data.read().hosts.len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
