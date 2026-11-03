# Architecture

K-Shell is a [Tauri 2](https://tauri.app) app. A Rust process owns all networking, crypto and storage. A web UI
rendered by the OS webview (WebKit on macOS and Linux, WebView2 on Windows) handles presentation only.

```
┌──────────────────────── UI (Vue 3, src/) ────────────────────────┐
│ views/        Hosts · Keychain · Forwards · Snippets · Settings  │
│ components/   TerminalTab → TerminalPane (xterm.js)              │
│               SftpTab → FilePane ×2, transfer queue, TextEditor  │
│ lib/store.js  reactive app state: vault copy, tabs, dialogs      │
│ lib/api.js    `api.<command>(args)` → Tauri invoke               │
└───────────────────────────────┬──────────────────────────────────┘
          invoke() + Channels   │   (raw bytes for terminal output)
┌───────────────────────────────▼──────── Core (Rust, src-tauri/) ─┐
│ commands/    thin IPC layer, one file per feature                │
│ state.rs     AppState: vault, SSH pool, terminals, file sessions │
│ vault.rs     encrypted storage + data model                      │
│ ssh.rs       connect, auth, jump hosts, host keys, pooling       │
│ terminal.rs  SSH shells + local PTYs                             │
│ fs/          Backend trait: local · sftp · ftp · s3 · object     │
│ forward.rs   -L / -R / -D tunnels                                │
│ keys.rs, ssh_config.rs                                           │
└──────────────────────────────────────────────────────────────────┘
```

## Repository layout

```
.
├── src/                    # UI (Vue 3 + Vite)
│   ├── App.vue             # shell: sidebar, tab bar, global shortcuts
│   ├── styles.css          # design tokens (CSS variables) + shared classes
│   ├── lib/                # api, store, themes, path helpers, host badges
│   ├── components/         # reusable building blocks (terminal, file pane, dialogs…)
│   └── views/              # one page per sidebar entry
├── src-tauri/              # Rust core
│   ├── src/
│   │   ├── main.rs         # binary entry (calls lib::run)
│   │   ├── lib.rs          # Tauri builder + command registration
│   │   ├── commands/       # IPC commands (see docs/IPC.md)
│   │   ├── fs/             # file-system backends
│   │   └── *.rs            # core modules
│   ├── tests/e2e.rs        # end-to-end tests against real servers
│   ├── capabilities/       # Tauri permissions granted to the UI
│   └── tauri.conf.json     # window, bundle and build config
├── tests/servers/          # docker-compose with SSH / FTP / MinIO test servers
└── docs/
```

## Key design decisions

### Local-first, single encrypted vault
All user data lives in one `VaultData` struct (`vault.rs`), held in memory behind an `RwLock` and written atomically
(temp file + rename) after every change. The file is sealed with XChaCha20-Poly1305. The key is kept in the OS keychain
through the `keyring` crate, with a `0600` key file as fallback. Debug builds always use the key file and
`vault-dev.bin`, because rebuilt binaries would otherwise trigger a keychain prompt on every run.

Every new field must be `#[serde(default)]`-compatible, since the structs use `#[serde(default)]`. That way old vaults
keep loading. **Never rename or remove a field without a migration.**

### The UI receives full objects
`vault_get` returns the whole vault, and commands such as `term_open_ssh` take a full `Host` object rather than an id.
This keeps the UI simple (it edits plain objects) and makes unsaved hosts work, for example quick connect and **Test**.
Jump hosts are still looked up from the vault by id.

### SSH connection pool
`ssh::Pool` keeps a `Weak<SshConn>` per host id. Terminals, `ssh_exec` and port forwards reuse a live connection.
File-manager sessions deliberately open a **fresh** connection (`Pool::fresh`), so large transfers never add latency to
interactive shells. A connection closes automatically once nothing holds it.

Connecting (`ssh::connect`) works like this:

1. If `jump_host` is set, recursively connect to the jump host (depth ≤ 5), open a `direct-tcpip` channel to the
   target, and run SSH over that channel.
2. Verify the host key: `~/.ssh/known_hosts` mismatch → reject; vault entry mismatch → reject; unknown → trust and
   record it (TOFU).
3. Authenticate, in this order: selected keychain key → password (then keyboard-interactive answered with the
   password) → ssh-agent → `~/.ssh/id_ed25519`, `id_ecdsa`, `id_rsa`.

### Terminal streaming
`terminal.rs` runs one task per shell. Remote output is **coalesced** (everything already queued, up to 256 KB) and sent
as a single raw `InvokeResponseBody::Raw` message over a Tauri `Channel`. There is no JSON or base64 on the hot path,
so `seq 1 200000` renders in about 50 ms. Input comes in through `term_write`. Local shells use `portable-pty` with
one reader thread and one control thread.

On the UI side, `TerminalTab.vue` flattens the split tree into absolutely positioned rectangles, keyed by pane id.
Splitting or closing a pane therefore **never remounts** the other terminals, and their sessions survive.

### One file-system API
`fs::Fs` is an enum over the backends in `fs/`: `local`, `sftp`, `ftp` (FTP and FTPS), `s3` (any S3-compatible
service, via rust-s3) and `object` (Azure Blob Storage and Google Cloud Storage, via
[Apache OpenDAL](https://opendal.apache.org)). Each implements the `Backend` trait (`home`, `list`, `mkdir`,
`rename`, `remove`, `download`, `upload`, plus optional `chmod` and `presign`). Shared behaviour sits once on `Fs`:
sorting, `walk`, text read/write, path joining.

Transfers only need two primitives: **remote → local file** (`download`) and **local file → remote** (`upload`).
`commands/files.rs::transfer` combines them. A remote → remote copy goes through a temp file. Progress and
cancellation are handled by the `ProgressReader` / `ProgressWriter` adapters in `fs/progress.rs`, so backends only
need to stream bytes.

## How to…

### …add a new protocol (e.g. WebDAV)
1. Create `src-tauri/src/fs/webdav.rs` with a struct and `impl Backend for WebDav`. Use `fs/sftp.rs` as a template,
   and wrap streams with `progress::copy` so progress and cancel work automatically.
2. Add `mod webdav;`, a `Fs::WebDav(webdav::WebDav)` variant, a line in the `dispatch!` macro and a constructor in
   `fs/mod.rs`.
3. Handle the new `protocol` string in `commands/files.rs::fs_open`.
4. Add any connection fields to `Host` in `vault.rs`, with defaults.
5. In the UI, add the protocol to `PROTOCOLS` in `src/lib/os.js` and its fields to `components/HostEditor.vue`.
6. Add a service to `tests/servers/docker-compose.yml` and an `exercise(...)` call in `tests/e2e.rs`.

### …add a new command
1. Write a `#[tauri::command] pub fn` (or `pub async fn`) in the matching `commands/*.rs` file. Take
   `st: State<'_>` for app state and return `Res<T>`, which is `Result<T, String>`.
2. Register it in `generate_handler!` in `lib.rs`.
3. Call it from the UI as `api.my_command({ camelCaseArgs })`.
4. Document it in [IPC.md](IPC.md).

### …add a setting
Add a field to `Settings` in `vault.rs` and its default in `impl Default for Settings`. Then add a control in
`views/SettingsView.vue`, which saves automatically, and read it with `store.vault.settings.<field>`.

### …add a terminal theme
Add an entry to `src/lib/themes.js`. It appears in Settings automatically.

## Error handling

Core functions return `error::Res<T>` (`Result<T, String>`). The `Ctx` trait adds `.s()` (stringify an error) and
`.ctx("what")` (prefix context). Errors are meant for the user: write them as short, actionable sentences. The UI
shows them with `err(e)` from `lib/store.js`.
