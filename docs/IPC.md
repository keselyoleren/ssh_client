# IPC reference

The UI talks to the Rust core only through the Tauri commands below. They are defined in
[`src-tauri/src/commands/`](../src-tauri/src/commands) and called from JavaScript through the `api` proxy in
[`src/lib/api.js`](../src/lib/api.js):

```js
import { api, Channel } from '../lib/api'

const entries = await api.fs_list({ id, path: '/var/log' })
```

**Conventions**

- Argument names are **camelCase in JavaScript** and snake_case in Rust (`src_path` → `srcPath`).
- Every fallible command rejects with a human-readable **string** error, ready to show in a toast.
- Data types (`Host`, `Key`, `Snippet`, `Forward`, `Settings`, `VaultData`) are defined in
  [`src-tauri/src/vault.rs`](../src-tauri/src/vault.rs). Fields are snake_case in both languages.
- Commands that take a full `host` object (not an id) also accept unsaved hosts, which is how quick connect and
  the editor's **Test** button work.

## Vault: `commands/vault.rs`

| Command | Arguments | Returns |
|---|---|---|
| `vault_get` | – | `VaultData` (the whole vault) |
| `host_save` | `host: Host` | `Host` (an empty `id` creates a new host) |
| `host_delete` | `id` | – (also removes its forwards and clears jump-host references) |
| `key_save` | `key: Key` | `Key` |
| `key_delete` | `id` | – |
| `key_generate` | `name, kind: "ed25519" \| "ecdsa" \| "rsa", passphrase` | `Key` |
| `key_import` | `name, pem, passphrase` | `Key` |
| `snippet_save` / `snippet_delete` | `snippet: Snippet` / `id` | `Snippet` / – |
| `settings_save` | `settings: Settings` | – |
| `session_save` | `session` (open tabs as JSON; hosts by id) | – (reopened on the next launch) |
| `history_add` | `cmd, target` (`"local"`, `"local:<project folder>"` or host address) | – (deduplicated, last 2000 kept) |
| `workspace_save` | `workspace: Workspace` | `Workspace` (ids filled in) |
| `workspace_delete` | `id` | – |
| `history_clear` | – | – |
| `known_host_delete` | `host, keyType` | – |
| `import_ssh_config` | – | number of hosts imported |
| `backup_export` | `path, passphrase` | – |
| `backup_import` | `path, passphrase` | number of hosts in the backup (merged) |

## Terminals and SSH: `commands/terminal.rs`

| Command | Arguments | Returns |
|---|---|---|
| `term_open_ssh` | `id, host, cols, rows, onData: Channel` | – |
| `term_open_local` | `id, cols, rows, shell?: string, cwd?: string, startupCommand?: string, onData: Channel` | – (error if `cwd` doesn't exist; `~` is expanded) |
| `term_write` | `id, data: string` | – |
| `term_resize` | `id, cols, rows` | – |
| `term_close` | `id` | – |
| `ssh_exec` | `host, command` | `{ output, code }` |
| `ssh_test` | `host` | `"Connected in N ms"` |
| `host_detect_os` | `host` | OS id such as `ubuntu`, also saved on the host |
| `key_install` | `host, keyId` | – (appends the public key to `authorized_keys`) |
| `log_dir` | – | session-log folder (from the settings, or `Documents/K-Shell Logs`) |
| `log_dir_open` | – | – (creates the folder and opens it in the OS file manager) |

`id` is chosen by the UI (a UUID). On the `onData` channel:

- terminal output arrives as raw bytes (`ArrayBuffer`); use `asBytes()` from `lib/api.js`;
- when the shell ends, a JSON message `{ "type": "exit", "code": number | null }` arrives.

SSH connections are pooled per host id, so several terminals to one host share one TCP connection.

## Files: `commands/files.rs`

| Command | Arguments | Returns |
|---|---|---|
| `fs_open` | `host: Host \| null` (null = local disk) | `{ id, home, sep }`. Backend picked by `host.protocol`: `ssh` (SFTP), `ftp`, `ftps`, `s3`, `azblob`, `gcs` |
| `fs_close` | `id` | – |
| `fs_list` | `id, path` | `Entry[]`, directories first |
| `fs_mkdir` | `id, path` | – |
| `fs_rename` | `id, from, to` | – |
| `fs_remove` | `id, path, isDir` | – (directories are removed recursively) |
| `fs_chmod` | `id, path, mode` | – (local, SFTP and FTP via `SITE CHMOD`) |
| `fs_read_text` / `fs_write_text` | `id, path` / `id, path, content` | `string` (max 8 MB) / – |
| `fs_read_bytes` | `id, path` | raw bytes as `ArrayBuffer` (max 32 MB, used by the image preview) |
| `fs_open_external` | `id, path, onChange: Channel` | watch id for remote files, `null` for local ones. Opens the file in the app the OS uses for it; remote files are downloaded to a temp copy first and `onChange` gets `{ type: "changed" }` each time that copy is saved. Files that run or install when opened are refused |
| `fs_upload_back` | `wid` | – (uploads the watched copy to where it came from) |
| `fs_unwatch` | `wid` | – |
| `fs_presign` | `id, path, expiry` (seconds) | share URL: S3 pre-signed GET, Azure read-only SAS (needs the account key), GCS signed URL (needs a service-account key; untested against real GCS) |
| `local_stat` | `path` | `{ is_dir, size }` |
| `read_local_text` | `path` | `string` (max 1 MB, used to import key files) |
| `transfer` | `tid, src, srcPath, isDir, size, dst, dstDir, onProgress: Channel` | resolves when done |
| `transfer_cancel` | `tid` | – (the `transfer` call then rejects with `"cancelled"`) |

`Entry` is `{ name, path, is_dir, is_link, size, mtime, perm }`. `mtime` is in Unix seconds, and `perm` holds POSIX mode
bits or `null`.

`transfer` copies a file or folder from session `src` into folder `dstDir` of session `dst`, between **any** two
backends. `onProgress` receives `{ total, done, file }` about every 200 ms, then one message with `finished: true`.

Remote paths always use `/`. Local paths use the OS separator returned as `sep` by `fs_open`. S3 paths look like
`/<bucket>/<key>`, and `/` lists the buckets.

## Port forwarding: `commands/forwards.rs`

| Command | Arguments | Returns |
|---|---|---|
| `forward_save` / `forward_delete` | `forward: Forward` / `id` | `Forward` / – |
| `forward_start` / `forward_stop` | `id` | – |
| `forward_active` | – | ids of running rules |

`Forward.kind` is `local` (`-L`), `remote` (`-R`) or `dynamic` (`-D`, SOCKS5).

## System: `commands/system.rs`

| Command | Returns |
|---|---|
| `platform` | `{ os: "macos" \| "windows" \| "linux", shell }` |
