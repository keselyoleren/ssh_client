//! Tauri IPC commands — the only API surface the UI can call.
//!
//! Commands are thin: they validate input, pick objects out of [`AppState`]
//! and delegate to the core modules. Rust `snake_case` parameters are exposed
//! to JavaScript as `camelCase` (e.g. `src_path` → `srcPath`).
//!
//! When you add a command, register it in `lib.rs` (`generate_handler!`).
//!
//! [`AppState`]: crate::state::AppState

pub mod files;
pub mod forwards;
pub mod system;
pub mod terminal;
pub mod vault;

pub type State<'a> = tauri::State<'a, crate::state::AppState>;
