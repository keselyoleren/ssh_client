<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" alt="K-Shell logo" />

# K-Shell

**A lightweight, open-source SSH, SFTP, FTP and S3 client for macOS, Windows and Linux.**

Manage all your servers and remote storage from one fast, native app: no account, no cloud and no telemetry.

[Features](#features) · [Install](#install) · [Build from source](#build-from-source) · [Docs](#documentation) · [Contributing](CONTRIBUTING.md)

</div>

---

K-Shell is a modern take on the Termius-style workflow, built with **Rust + [Tauri 2](https://tauri.app)** for the
networking core and **Vue 3 + [xterm.js](https://xtermjs.org)** (WebGL) for the UI. A release build is about **8 MB** and
idles at a fraction of the memory of Electron-based clients.

## Features

| Area | What you get |
|---|---|
| **Hosts** | Groups, tags, colours, automatic OS detection, search, recent hosts, grid/list view, duplicate, test connection, import from `~/.ssh/config` |
| **Terminal** | Tabs, split panes (side by side / stacked, resizable; drag panes by their header to rearrange, drag a tab onto a terminal to merge it as a split), find, copy-on-select, right-click paste, 9 colour themes (optionally a separate one for light mode), custom bash/zsh prompt builder, history autosuggestions, startup command, one-key reconnect, local shell, workspaces that group local project folders (open one or all in their folder, with an optional startup command) |
| **Authentication** | Password, keyboard-interactive, keys from the built-in keychain, ssh-agent / Pageant, default `~/.ssh/id_*` keys |
| **Jump hosts** | ProxyJump chains (`laptop → bastion → … → target`) |
| **Security** | Trust-on-first-use host keys with mismatch blocking, honours `~/.ssh/known_hosts`, vault encrypted with XChaCha20-Poly1305 and its key kept in the OS keychain |
| **Keychain** | Generate Ed25519 / ECDSA / RSA-4096 keys (optional passphrase), import, copy public key, install on a server (`ssh-copy-id`) |
| **File manager** | Dual pane between **any** pair of Local / SFTP / FTP / FTPS / S3 / Azure Blob / GCS; drag between panes, drop files from your OS, recursive folders, parallel transfer queue with speed and cancel, rename, delete, chmod, built-in text editor |
| **Object storage** | Any S3-compatible service (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, Wasabi, Backblaze B2, Tencent COS, Scaleway, Hetzner, Linode, Oracle, …) with path-style or virtual-hosted URLs, plus native **Azure Blob Storage** and **Google Cloud Storage** (service-account key). Share links: pre-signed for S3, read-only SAS for Azure, signed URL for GCS (needs a service-account key; not yet tested against real GCS) |
| **Port forwarding** | Local (`-L`), remote (`-R`) and dynamic SOCKS5 (`-D`) tunnels through your saved hosts, with optional auto-start; paste an `ssh -L …` command to create rules, copy any rule back as an `ssh` command |
| **Snippets** | Save commands, paste them into a terminal, or run them on many hosts at once with per-host output |
| **Updates** | Signed in-app updates: an **Update K-Shell** button appears when a new version is out, and one click installs it and restarts |
| **Everything else** | Command palette (<kbd>⌘K</kbd>) with quick connect `user@host:port`, encrypted vault backup and restore |

## Install

Installers (`.dmg`, `.msi`/`.exe`, `.deb`/`.AppImage`/`.rpm`) are built by the release workflow and published on
the [Releases](https://github.com/keselyoleren/ssh_client/releases) page. Until the first release is out, build from
source as described below.

> **macOS:** builds are not notarised yet. On first launch, open the app once, then go to
> **System Settings → Privacy & Security** and click **Open Anyway**.

## Build from source

Prerequisites: [Rust](https://rustup.rs) ≥ 1.85, [Node.js](https://nodejs.org) ≥ 20, and the
[Tauri system dependencies](https://tauri.app/start/prerequisites/) for your OS.

```bash
git clone https://github.com/keselyoleren/ssh_client.git kshell
cd kshell
npm install
npm run app:dev      # run with hot reload
npm run app:build    # produce an installer in src-tauri/target/release/bundle/
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for per-OS setup, testing and debugging tips.

## Keyboard shortcuts

Every shortcut can be changed, removed or reset in **Settings → Keyboard shortcuts**. Defaults:

| macOS | Windows / Linux | Action |
|---|---|---|
| <kbd>⌘K</kbd> | <kbd>Ctrl+Shift+K</kbd> | Command palette / quick connect |
| <kbd>⌘,</kbd> | <kbd>Ctrl+,</kbd> | Open settings |
| <kbd>⌘T</kbd> | <kbd>Ctrl+Shift+T</kbd> | New local terminal |
| <kbd>⌘W</kbd> | <kbd>Ctrl+Shift+W</kbd> | Close tab |
| <kbd>⌃⇥</kbd> / <kbd>⌃⇧⇥</kbd> | <kbd>Ctrl+Tab</kbd> / <kbd>Ctrl+Shift+Tab</kbd> | Next / previous tab |
| <kbd>⌘D</kbd> | <kbd>Ctrl+Shift+D</kbd> | Split right |
| <kbd>⇧⌘D</kbd> | <kbd>Ctrl+Shift+E</kbd> | Split down |
| <kbd>⌘]</kbd> / <kbd>⌘[</kbd> | <kbd>Ctrl+Shift+]</kbd> / <kbd>[</kbd> | Focus next / previous pane |
| <kbd>⌘F</kbd> | <kbd>Ctrl+Shift+F</kbd> | Find in terminal |
| <kbd>→</kbd> / <kbd>⌥→</kbd> | <kbd>→</kbd> / <kbd>Ctrl+→</kbd> | Accept autosuggestion / its next word |
| <kbd>⌘=</kbd> / <kbd>⌘-</kbd> / <kbd>⌘0</kbd> | <kbd>Ctrl+=</kbd> / <kbd>Ctrl+-</kbd> / <kbd>Ctrl+0</kbd> | Zoom in / out / reset |
| <kbd>⌘B</kbd> | <kbd>Ctrl+Shift+B</kbd> | Show / hide the sidebar |
| <kbd>⌘1</kbd> | <kbd>Ctrl+Shift+1</kbd> | Host list (Vault) |
| <kbd>⌘2</kbd> … <kbd>⌘9</kbd> | <kbd>Ctrl+Shift+2</kbd> … <kbd>9</kbd> | Switch to an open tab |

## Where is my data?

Everything is stored locally in one encrypted file in your OS app-data directory:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/dev.keselyoleren.kshell/vault.bin` |
| Windows | `%APPDATA%\dev.keselyoleren.kshell\vault.bin` |
| Linux | `~/.local/share/dev.keselyoleren.kshell/vault.bin` |

Development builds use `vault-dev.bin` so they never touch your real data. Use **Settings → Encrypted backup** to move
your vault between machines.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): how the pieces fit together, and how to add a protocol or a command
- [Development guide](docs/DEVELOPMENT.md): setup, scripts, tests, debugging, releasing
- [IPC reference](docs/IPC.md): every command the UI can call
- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md) · [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © K-Shell contributors
