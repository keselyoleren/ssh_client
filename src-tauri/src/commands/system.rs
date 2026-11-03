use serde_json::{json, Value};

/// Basic platform info for the UI (`os` is `macos`, `windows` or `linux`).
#[tauri::command]
pub fn platform() -> Value {
    json!({ "os": std::env::consts::OS, "shell": crate::terminal::default_shell() })
}
