# Contributing to K-Shell

Thanks for helping! Bug reports, docs fixes, translations, themes and code are all welcome, from first-time
contributors too.

## Ways to contribute

- **Report a bug:** open an issue with the *Bug report* template. Include your OS, the K-Shell version and the
  protocol involved (SSH / SFTP / FTP / S3).
- **Suggest a feature:** open an issue with the *Feature request* template before writing large changes, so we can
  agree on the approach.
- **Pick an issue:** look for [`good first issue`](https://github.com/keselyoleren/k-shell/labels/good%20first%20issue)
  and [`help wanted`](https://github.com/keselyoleren/k-shell/labels/help%20wanted). Comment on it so nobody
  duplicates your work.
- **Security problems:** please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Getting set up

```bash
git clone https://github.com/<you>/k-shell.git k-shell
cd k-shell
npm install
npm run app:dev
```

Full per-OS prerequisites, the test setup and debugging tips are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before touching the Rust core. It is short, and it explains where
things go.

## Making a change

1. Create a branch from `main`, named for example `fix/sftp-symlink-size` or `feat/webdav`.
2. Keep the change focused. One pull request should cover one topic.
3. Add or update tests:
   - pure logic → a `#[cfg(test)]` unit test next to the code;
   - protocol behaviour → `src-tauri/tests/e2e.rs`. It runs against real servers in Docker.
4. Update the docs when you change behaviour, add a command (see [docs/IPC.md](docs/IPC.md)) or add a setting.
5. Run the full check locally. CI runs the same steps:

   ```bash
   npm run check     # prettier, frontend build, cargo fmt, clippy -D warnings, unit tests
   npm run test:e2e  # optional: needs Docker
   ```

6. Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.
7. Open the pull request and fill in the template. Screenshots or a short GIF help a lot for UI changes.

## Code style

**Rust (`src-tauri/`)**
- Run `cargo fmt` before pushing; `cargo clippy --all-targets -- -D warnings` must pass.
- Fallible functions return `Res<T>` (`Result<T, String>`). Error messages reach the user, so make them short and
  actionable, for example `"jump host not found in vault"` rather than `"Err(None)"`. Use `.ctx("what failed")` to
  add context.
- Keep `commands/` thin. Logic belongs in the core modules, where it can be tested without Tauri.
- Never log or return secrets (passwords, private keys, tokens) in error messages.
- New fields on vault structs must be backwards compatible (`#[serde(default)]` handles this). Don't rename fields
  without a migration.

**Frontend (`src/`)**
- Vue 3 `<script setup>` components and plain JavaScript; no extra UI frameworks.
- Run `npm run format`. Prettier config lives in `.prettierrc.json`.
- Use the design tokens in `src/styles.css` (`var(--accent)`, `var(--bg-2)`, …) instead of hard-coded colours, so
  light and dark themes keep working.
- Call the backend only through `api.<command>()` from `src/lib/api.js`. Show errors with `err(e)` and success with
  `toast()` from `src/lib/store.js`.
- Keep dependencies minimal. Every package added to the bundle needs a good reason.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(sftp): show symlink targets in the file list
fix(ssh): retry keyboard-interactive when the server sends an empty prompt
docs: explain how to add a terminal theme
```

Common types are `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore` and `ci`.

## Review process

- A maintainer reviews pull requests, usually within a few days. Feel free to ping if it has been a week.
- CI must be green before merge.
- We squash-merge, so the PR title becomes the commit message. Please follow the format above.

## Code of Conduct

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
