# Security Policy

K-Shell stores credentials and connects to your servers, so we take security reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report them privately through
[GitHub → Security → Report a vulnerability](https://github.com/keselyoleren/ssh_client/security/advisories/new).
Include the affected version and OS, steps to reproduce, and the impact you expect.

We aim to acknowledge reports within 72 hours and to release a fix for confirmed issues as fast as their severity
requires. With your permission, you will be credited in the release notes.

## Supported versions

Only the latest release receives security fixes.

## Security model, in short

- **Vault at rest:** a single file encrypted with XChaCha20-Poly1305. The 256-bit key is kept in the OS keychain
  (macOS Keychain, Windows Credential Manager, Secret Service on Linux). If no keychain is available, it falls back to a
  `vault.key` file with `0600` permissions next to the vault.
- **Backups:** encrypted with a key derived from your passphrase using Argon2id.
- **Host keys:** trusted on first use and pinned afterwards. A changed key aborts the connection. Mismatches recorded in
  `~/.ssh/known_hosts` are honoured too.
- **Process boundary:** the web UI has no network or file access of its own. Everything goes through the Rust commands
  listed in [docs/IPC.md](docs/IPC.md).
- **No telemetry:** K-Shell makes no network connections other than the ones you ask for.

### Known limitations

- Hosts are trusted on first connect without an interactive fingerprint prompt.
- Secrets are decrypted in memory while the app runs, and the UI can read them so the host editor works.
- There is no master-password lock yet.
