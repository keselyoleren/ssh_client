# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
