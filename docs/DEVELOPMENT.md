# Development guide

## Prerequisites

| Tool | Version |
|---|---|
| [Rust](https://rustup.rs) | 1.85 or newer (`rustup update stable`) |
| [Node.js](https://nodejs.org) | 20 or newer |
| Docker | optional, only for end-to-end tests |

Plus the system libraries Tauri needs:

**macOS**: Xcode Command Line Tools:
```bash
xcode-select --install
```

**Windows**: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) ("Desktop
development with C++") and WebView2, which is preinstalled on Windows 10 21H2+ and 11.

**Linux (Debian/Ubuntu)**:
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev
```
For other distributions see the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

## Running the app

```bash
npm install
npm run app:dev
```

This starts Vite on `http://localhost:1420` and launches the native window with hot reload:

- Vue changes reload instantly.
- Rust changes recompile and restart the app.

The first Rust build takes a few minutes. Dependencies are compiled with optimisations even in dev (see
`[profile.dev.package."*"]` in `Cargo.toml`), because crypto is otherwise very slow. Later builds are incremental.

Opening `localhost:1420` in a normal browser does **not** work: the UI needs the Tauri runtime.

### Dev data vs. real data

Debug builds read and write `vault-dev.bin` with a plain key file. Release builds use `vault.bin`, with the key in the
OS keychain. Development never touches your real vault. To start fresh, delete `vault-dev.bin` and `vault.key` from
the app-data folder listed in the README.

## npm scripts

| Script | What it does |
|---|---|
| `npm run app:dev` | Run the desktop app in development mode |
| `npm run app:build` | Build installers into `src-tauri/target/release/bundle/` |
| `npm run build` | Build only the frontend into `dist/` |
| `npm run format` / `format:check` | Prettier for `src/` |
| `npm test` | Rust unit tests |
| `npm run test:e2e` | Start the Docker test servers, run end-to-end tests, then stop the servers |
| `npm run check` | Everything CI checks (run this before pushing) |

## Tests

### Unit tests
```bash
cd src-tauri && cargo test
```
They cover pure logic: vault encryption and backups, path helpers, the `~/.ssh/config` parser, transfer progress and
cancellation. They need no network.

### End-to-end tests
`src-tauri/tests/e2e.rs` drives the real modules against real servers defined in
[`tests/servers/docker-compose.yml`](../tests/servers/docker-compose.yml):

| Service | Port | Credentials | Used for |
|---|---|---|---|
| `kshell-ssh` | 2222 | `tester` / `secret` | SSH, SFTP, keys, forwarding |
| `kshell-ssh2` | internal only | `inner` / `inner` | jump host target |
| `kshell-ftp` | 2121 | `ftpuser` / `ftppass` | FTP |
| `kshell-minio` | 9000 | `minioadmin` / `minioadmin` | S3 |
| `kshell-azurite` | 10000 | `devstoreaccount1` / well-known dev key | Azure Blob (`tests/object_storage.rs`) |
| `kshell-fake-gcs` | 4443 | none | Google Cloud Storage (`tests/object_storage.rs`) |

```bash
npm run test:e2e
# or step by step:
docker compose -f tests/servers/docker-compose.yml up -d --wait
cd src-tauri && cargo test --test e2e --test object_storage -- --ignored --nocapture
docker compose -f tests/servers/docker-compose.yml down
```

The suite prints each step with its timing and transfer speeds, so it also works as a quick performance check.

Known emulator gaps: fake-gcs-server doesn't implement GCS's XML multipart upload or batch delete. The GCS test
therefore uploads a 6 MB file (below the 8 MB chunk size, so a single request), and K-Shell deletes folders object by
object. Large multipart uploads to Google Cloud Storage are only exercised against the real service.

## Debugging

- **Web inspector:** press <kbd>⌥⌘I</kbd> (macOS) or <kbd>Ctrl+Shift+I</kbd> in a dev build. The app replaces the default right-click menu, so *Inspect Element* is not available there.
- **Rust logs:** `println!`/`eprintln!` output appears in the terminal running `npm run app:dev`.
- **Rust debugger:** use the VS Code `rust-analyzer` + CodeLLDB extensions and attach to the `kshell` process.
- **Try a backend without the UI:** add a case to `tests/e2e.rs`. It is the fastest feedback loop for protocol work.
- **SSH problems:** compare with `ssh -vvv user@host`. Most auth issues are a key format or server setting, for
  example `AllowTcpForwarding no` blocks jump hosts and tunnels.

## Project conventions in one minute

- UI → Rust calls go through `api.<command>()` (`src/lib/api.js`). Every command is listed in [IPC.md](IPC.md).
- Rust errors are user-facing strings (`Res<T>`).
- Colours and spacing come from CSS variables in `src/styles.css`.
- New protocol? See *How to add a new protocol* in [ARCHITECTURE.md](ARCHITECTURE.md).

## Building installers

```bash
npm run app:build                                     # current OS, all bundle formats
./node_modules/.bin/tauri build --bundles app         # macOS .app only (fastest)
./node_modules/.bin/tauri build --target universal-apple-darwin   # universal macOS binary
```

Output goes to `src-tauri/target/release/bundle/`.

## Releasing (maintainers)

1. Bump `version` in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Move the `Unreleased` entries in `CHANGELOG.md` under the new version.
3. Commit, then tag and push:
   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```
4. The **Release** workflow builds macOS (universal), Windows and Linux installers into a draft GitHub release.
   Review it and publish.

## Updating the icon

The master artwork is `src-tauri/icons/icon.svg`. The UI logo in `src/components/Logo.vue` uses the same paths.
After editing it, regenerate every platform icon:
```bash
./node_modules/.bin/tauri icon src-tauri/icons/icon.svg -o src-tauri/icons
rm -rf src-tauri/icons/android src-tauri/icons/ios
```
