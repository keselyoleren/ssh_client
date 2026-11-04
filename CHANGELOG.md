# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-04

### Added
- Settings are split into sections (Appearance, Terminal, Keyboard shortcuts, Vault & backup, About).
- Appearance: *System* theme that follows the OS light/dark mode, accent colour (presets or custom), interface
  zoom (also <kbd>⌘=</kbd> / <kbd>⌘-</kbd> / <kbd>⌘0</kbd>), and an optional separate terminal theme for light mode.
  Terminal themes now show a live preview card.
- Custom keyboard shortcuts: record a new combination, remove or reset it, search by name or keys, and filter by
  customized / conflicting / unassigned. Conflicts and combinations the shell would normally receive are flagged.
- New actions: open settings, next/previous tab, focus next/previous pane, close pane, clear terminal, open file
  manager, jump to Snippets / Keychain / Port forwarding. Some have no default shortcut and can be assigned.
- The command palette also lists app commands with their shortcuts.
- K-Shell prompt (Settings → Terminal → Prompt): build a bash/zsh prompt from segments (user@host, directory,
  git branch, Python venv, conda env, kube context, time, date, exit code, prompt symbol, line breaks; long
  directories are shortened from the left, e.g. `…project/chronicle/fork/core-api`) with
  drag and drop and a live preview. It is applied to new local and/or SSH sessions, or can be copied for
  `~/.bashrc` / `~/.zshrc`. Off by default.
- Terminal autosuggestions: the rest of a previously run command (or a snippet) appears as ghost text while
  typing; <kbd>→</kbd> accepts it, <kbd>⌥→</kbd> / <kbd>Ctrl+→</kbd> accepts one word. Commands from the same host
  are preferred. History is kept in the encrypted vault; input that isn't echoed (passwords) and commands
  starting with a space are never stored. Can be turned off or cleared in Settings → Terminal.
- Workspaces: group local project folders (e.g. per client or product). Open a project to get a terminal in its
  folder, optionally running a startup command, or open every project of a workspace at once. Tabs use the
  workspace colour, projects are searchable in the command palette, and each project keeps its own
  autosuggestion history.
- Rearrange split panes by dragging their header: the layout re-flows live around an empty slot showing where
  the pane will land, and a chip with its title follows the pointer (<kbd>Esc</kbd> cancels). Drop a pane on the
  tab bar to give it its own tab. Dragging a terminal tab onto another terminal merges it in as a split the same
  way; hovering over a tab while dragging switches to it. "Move to new tab" is also in the pane header and
  right-click menu. Sessions keep running throughout.
- Port forwarding: paste an `ssh -L/-R/-D … user@host -p port` command to fill in a rule (several tunnels
  become several rules). The server is matched against your saved hosts, or can be added from the command in one
  click. The host picker shows `user@host:port`, every rule shows its equivalent `ssh` command with a copy
  button, and a host's menu on the Hosts page has "Port forwarding…" to start a rule for it.

### Fixed
- The Font list in Settings showed an empty value when the saved font was not one of the presets.

## [0.1.0] - 2026-11-03

First release of the desktop app. It replaces the previous FastAPI + web client.

### Added
- Encrypted local vault (XChaCha20-Poly1305, key in OS keychain) for hosts, keys, snippets, port-forward rules,
  known hosts and settings; Argon2id-protected backup export and restore.
- SSH terminal with tabs, split panes, find, themes, startup commands and reconnect; local PTY terminal.
- SSH auth via password, keyboard-interactive, keychain keys, ssh-agent/Pageant and default identities; ProxyJump.
- Trust-on-first-use host key verification that honours `~/.ssh/known_hosts`.
- Dual-pane file manager over Local, SFTP, FTP, FTPS and S3-compatible storage, with a transfer queue, drag and drop,
  a text editor and pre-signed S3 links.
- Local, remote and SOCKS5 port forwarding with auto-start.
- SSH key generation (Ed25519, ECDSA, RSA-4096), import and install-on-host.
- Snippets: paste into a terminal or run on several hosts.
- `~/.ssh/config` import, command palette with quick connect.
- Azure Blob Storage hosts (account key or SAS token). Share links are read-only SAS URLs (`sp=r`).
- Google Cloud Storage hosts using a service-account key (JSON), or anonymous access for public buckets.
- S3 hosts can choose path-style or virtual-hosted URLs, needed for services such as Tencent COS.
- More S3 presets: Tencent COS, Scaleway, Hetzner, Linode/Akamai and Oracle Cloud.
- End-to-end tests for Azure (Azurite) and GCS (fake-gcs-server).
- In-app updates: an **Update K-Shell** button appears in the tab bar when a new version is released; one click
  downloads, verifies (signature), installs and restarts. *Settings → About* shows the version and can check manually.

### Fixed (found during pre-release testing)
- macOS: <kbd>⌘W</kbd> closed the whole window instead of the current tab. The app now uses its own menu
  without "Close Window".
- Windows/Linux: <kbd>Ctrl+Shift+1</kbd>…<kbd>9</kbd> did nothing, because Shift turns the key into a symbol.
  Digits are now matched by physical key.
- macOS: dragging files in the File Manager selected all text on the page (missing `-webkit-user-select`).
- The "Clear finished" button in the Transfers panel overlapped the panel title.
- The File Manager tab was labelled "SFTP" even when both panes were local.
- Shortcut lists in Settings and the README showed the wrong split-down shortcut on Windows/Linux.
