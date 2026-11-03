//! Import hosts from ~/.ssh/config (Host, HostName, User, Port, IdentityFile, ProxyJump).

use std::collections::HashMap;

use crate::vault::{new_id, now, Host, Key, VaultData};

#[derive(Default, Clone)]
struct Entry {
    alias: String,
    hostname: String,
    user: String,
    port: u16,
    identity: String,
    jump: String,
}

fn expand(p: &str) -> String {
    if let Some(rest) = p.strip_prefix("~/") {
        if let Some(h) = dirs::home_dir() {
            return h.join(rest).to_string_lossy().into_owned();
        }
    }
    p.to_string()
}

fn parse(text: &str) -> Vec<Entry> {
    let mut out: Vec<Entry> = Vec::new();
    let mut cur: Vec<Entry> = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (k, v) = match line.split_once(|c: char| c.is_whitespace() || c == '=') {
            Some((k, v)) => {
                (k.to_lowercase(), v.trim().trim_start_matches('=').trim().trim_matches('"').to_string())
            }
            None => continue,
        };
        match k.as_str() {
            "host" => {
                out.append(&mut cur);
                for a in v.split_whitespace() {
                    if !a.contains('*') && !a.contains('?') && !a.starts_with('!') {
                        cur.push(Entry { alias: a.to_string(), ..Default::default() });
                    }
                }
            }
            "match" => out.append(&mut cur),
            _ => {
                for e in cur.iter_mut() {
                    match k.as_str() {
                        "hostname" => e.hostname = v.clone(),
                        "user" => e.user = v.clone(),
                        "port" => e.port = v.parse().unwrap_or(22),
                        "identityfile" if e.identity.is_empty() => e.identity = expand(&v),
                        "proxyjump" => e.jump = v.split(',').next().unwrap_or("").to_string(),
                        _ => {}
                    }
                }
            }
        }
    }
    out.append(&mut cur);
    out
}

/// Returns number of hosts imported. Existing hosts with the same label are skipped.
pub fn import(data: &mut VaultData) -> Result<usize, String> {
    let path = dirs::home_dir().ok_or("no home dir")?.join(".ssh").join("config");
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let entries = parse(&text);
    let mut by_alias: HashMap<String, String> = HashMap::new();
    let mut key_by_path: HashMap<String, String> =
        data.keys.iter().map(|k| (k.name.clone(), k.id.clone())).collect();
    let mut count = 0;
    let mut pending_jump = Vec::new();
    for e in entries {
        if data.hosts.iter().any(|h| h.label == e.alias) {
            if let Some(h) = data.hosts.iter().find(|h| h.label == e.alias) {
                by_alias.insert(e.alias.clone(), h.id.clone());
            }
            continue;
        }
        let mut key_id = String::new();
        if !e.identity.is_empty() {
            if let Some(id) = key_by_path.get(&e.identity) {
                key_id = id.clone();
            } else if let Ok(pem) = std::fs::read_to_string(&e.identity) {
                let name = e.identity.clone();
                let mut k = crate::keys::import(&name, &pem, "").unwrap_or_else(|_| Key {
                    id: new_id(),
                    name: name.clone(),
                    kind: "encrypted".into(),
                    private_key: pem.clone(),
                    created_at: now(),
                    ..Default::default()
                });
                k.name = std::path::Path::new(&name)
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or(name.clone());
                key_by_path.insert(name, k.id.clone());
                key_id = k.id.clone();
                data.keys.push(k);
            }
        }
        let h = Host {
            id: new_id(),
            label: e.alias.clone(),
            group: "SSH Config".into(),
            protocol: "ssh".into(),
            host: if e.hostname.is_empty() { e.alias.clone() } else { e.hostname.clone() },
            port: if e.port == 0 { 22 } else { e.port },
            username: e.user.clone(),
            key_id,
            created_at: now(),
            ..Default::default()
        };
        by_alias.insert(e.alias.clone(), h.id.clone());
        if !e.jump.is_empty() {
            pending_jump.push((h.id.clone(), e.jump.clone()));
        }
        data.hosts.push(h);
        count += 1;
    }
    for (hid, jump) in pending_jump {
        if let Some(jid) = by_alias.get(&jump) {
            if let Some(h) = data.hosts.iter_mut().find(|h| h.id == hid) {
                h.jump_host = jid.clone();
            }
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn parses_hosts_and_skips_wildcards() {
        let cfg = "
# comment
Host *
  ServerAliveInterval 30

Host web prod-web
  HostName 10.0.0.5
  User deploy
  Port 2200
  IdentityFile ~/.ssh/id_web
  ProxyJump bastion

Host bastion
  HostName=bastion.example.com
  User ops
";
        let e = parse(cfg);
        assert_eq!(e.len(), 3);
        let web = &e[0];
        assert_eq!(
            (web.alias.as_str(), web.hostname.as_str(), web.user.as_str(), web.port),
            ("web", "10.0.0.5", "deploy", 2200)
        );
        assert_eq!(web.jump, "bastion");
        assert!(web.identity.ends_with(".ssh/id_web"));
        assert_eq!(e[1].alias, "prod-web");
        assert_eq!(e[2].hostname, "bastion.example.com");
    }
}
