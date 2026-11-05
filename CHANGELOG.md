# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-11-05

### Added
- Broadcast input: type in one pane of a split tab and the other panes receive the same keystrokes, pastes,
  accepted autosuggestions and snippets. Turn it on with <kbd>⌥⌘I</kbd> / <kbd>Ctrl+Shift+I</kbd>, the command
  palette or a pane's right-click menu. Broadcasting panes get an amber border and the tab shows a broadcast icon;
  click the icon in a pane's header to leave that pane out. The terminal's automatic replies (cursor position,
  colour queries, focus and mouse reports) stay in their own pane. Broadcast turns off when the tab is down to one
  pane.
- Drop files or folders from the file manager onto a terminal to type their paths, quoted for the shell and
  separated by spaces. With several panes, the one under the pointer gets them.
- SSH terminals reconnect by themselves when the connection drops (no exit status from the server): retries
  after 1, 2, 4, 8, 15 and then every 30 seconds, about 3 minutes in all, and right away when the network comes back.
  Enter reconnects now, Ctrl+C stops. Turn it off in Settings → Terminal → Reconnect SSH automatically.
- Tabs reopen on launch: terminal tabs with their split panes, and file-manager tabs, come back as they were and
  connect again. Hosts are saved by id, so no password or key is copied, and a host deleted since is skipped. Turn
  it off in Settings → Terminal → Reopen tabs on launch.
- Rename a tab by double-clicking it, from its right-click menu or with "Rename tab" in the command palette. An
  empty name goes back to the automatic title.
- Keychain has a grid / list view switch, like Hosts.
- Terminals follow the shell's working directory (OSC 7; a small hook is added to new bash and zsh sessions, and
  shells that already report it work as they are). Splits open in the same folder, a reconnect or a reopened tab
  returns to the last folder, and "Open SFTP here" / "Open in file manager" open it. Settings → Terminal → Follow the
  working directory.
- A remote file opened in another app is watched: when you save it there, the file manager offers to upload it back
  (Upload / stop watching). Copies older than a day are removed from the temp folder at launch.
- Session logs: Settings → Terminal → Log terminal sessions writes each new session to a plain-text file (colour and
  cursor codes removed, redrawn progress lines kept at their final state) in Documents/K-Shell Logs or a folder of
  your choice.
- Snippet variables: `{{name}}` or `{{name:default}}` in a snippet is asked for when it runs (from the palette, the
  terminal menu, the Snippets page or "Run on hosts"), with the last values remembered.
- Keyword highlighting: words in terminal output are coloured by rules (words or a regular expression, a theme
  colour, match case). The defaults colour errors red, warnings yellow and successes green; the output itself is not
  changed and full-screen programs are left alone.

- More terminal settings (Settings → Terminal): font weight and bold-text weight, letter spacing, bright colours for
  bold text, minimum contrast, cursor shape in unfocused panes, a bell that flashes the pane and/or beeps, Option as
  Meta key on macOS (turn it off to type @, € or [ with Option on non-US keyboards), a warning that shows multi-line
  text before it is pasted, and the shell and start folder of local terminals.
- 16 more terminal themes, 25 in all: Tokyo Night, Catppuccin Mocha and Latte, Rosé Pine and Rosé Pine Dawn,
  Kanagawa, Everforest, GitHub Dark, Ayu Dark and Light, Night Owl, Synthwave, Aubergine, One Light, Solarized Light
  and Gruvbox Light. Settings → Appearance lists them in Dark and Light groups. The file editor uses the same colours.
- Workspaces page redesigned: projects show as cards (or a compact list, switchable like Hosts), each workspace has a
  coloured initial and a count of open terminals, paths under your home folder are shown as `~/…`, startup commands
  sit under the path, an "Add project" tile ends every workspace, and projects open with Enter from the keyboard.
- The file manager opens a file by its type: images in a built-in preview, documents, media, archives and other
  binaries in the app your OS uses for them (remote files are downloaded to a temp folder first; changes made there
  are not uploaded back), everything else in the text editor. The right-click menu adds "Open in default app" and,
  for non-text files, "Edit as text". Files that would run or install when opened (`.exe`, `.msi`, `.pkg`, `.dmg`,
  `.jar`, `.sh` …) are never handed to the default app; scripts still open in the text editor.
- The file manager's text editor highlights syntax for some 140 languages and config formats (Python, Go, Rust,
  JS/TS, Vue, PHP, Java, C/C++, SQL, YAML, TOML, JSON, Dockerfile, Nginx, shell, `.env`, `.ini` …), picked from the file
  name, in the colours of the current terminal theme. It has line numbers, find & replace (⌘F / Ctrl+F), folding,
  bracket matching and multiple cursors, keeps the file's indentation (tabs or spaces) and line endings (LF/CRLF),
  and shows them with the cursor position in a status bar.

### Changed
- Lighter start-up: the terminal, file manager, editor and every Vault page except Hosts load when first used, so the
  start-up bundle is 150 KB instead of 741 KB. Terminal panes in background tabs give their WebGL renderer back after
  30 seconds and take it again when shown, which frees GPU memory with many tabs open.

### Fixed
- Agent forwarding did nothing: the server's agent channel was accepted but never connected to the local
  ssh-agent, so `ssh-add -l`, `git` or `ssh` on the server hung or found no keys. It is now piped to
  `$SSH_AUTH_SOCK` (the OpenSSH agent pipe or Pageant on Windows), and refused right away when no local agent is
  running.

## [0.3.0] - 2026-11-04

### Added
- Show or hide the sidebar with <kbd>⌘B</kbd> / <kbd>Ctrl+Shift+B</kbd>, the button next to the K-Shell logo (shown on
  hover), the button at the start of the tab bar while it's hidden, or *Settings → Appearance → Show sidebar*.
  The choice is remembered.

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
