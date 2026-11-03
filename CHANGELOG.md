# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- macOS: <kbd>⌘W</kbd> closed the whole window instead of the current tab. The app now uses its own menu
  without "Close Window".
- Windows/Linux: <kbd>Ctrl+Shift+1</kbd>…<kbd>9</kbd> did nothing, because Shift turns the key into a symbol.
  Digits are now matched by physical key.
- macOS: dragging files in the File Manager selected all text on the page (missing `-webkit-user-select`).
- The "Clear finished" button in the Transfers panel overlapped the panel title.
- The File Manager tab was labelled "SFTP" even when both panes were local.
- Shortcut lists in Settings and the README showed the wrong split-down shortcut on Windows/Linux.

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
