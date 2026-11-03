//! K-Shell core. See `docs/ARCHITECTURE.md` for an overview.
//!
//! * `commands/` — Tauri IPC layer called by the UI
//! * `vault`     — encrypted local storage
//! * `ssh`       — connections, auth, jump hosts, host keys
//! * `terminal`  — SSH shells and local PTYs
//! * `fs/`       — one file-system API over Local / SFTP / FTP(S) / S3
//! * `forward`   — -L / -R / -D port forwarding
//! * `keys`, `ssh_config` — key generation/import, `~/.ssh/config` import

pub mod commands;
pub mod error;
pub mod forward;
pub mod fs;
pub mod keys;
pub mod ssh;
pub mod ssh_config;
pub mod state;
pub mod terminal;
pub mod vault;

use tauri::Manager;

use commands::{files, forwards, system, terminal as term, vault as v};

/// macOS menu bar. It mirrors Tauri's default menu but leaves out
/// "Close Window" (⌘W), so ⌘W reaches the UI and closes the current tab
/// instead of the whole window.
#[cfg(target_os = "macos")]
fn macos_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, SubmenuBuilder};
    let app_menu = SubmenuBuilder::new(app, "K-Shell")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let window = SubmenuBuilder::new(app, "Window").minimize().maximize().separator().fullscreen().build()?;
    MenuBuilder::new(app).items(&[&app_menu, &edit, &window]).build()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_menu(macos_menu(app.handle())?)?;

            let dir = app.path().app_data_dir()?;
            vault::migrate_legacy_dir(&dir);
            let vault = vault::Vault::load(dir).map_err(|e| anyhow::anyhow!(e))?;
            app.manage(state::AppState::new(vault));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                forwards::autostart(&handle.state::<state::AppState>()).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // vault
            v::vault_get,
            v::host_save,
            v::host_delete,
            v::key_save,
            v::key_delete,
            v::key_generate,
            v::key_import,
            v::snippet_save,
            v::snippet_delete,
            v::settings_save,
            v::known_host_delete,
            v::import_ssh_config,
            v::backup_export,
            v::backup_import,
            // terminals & ssh
            term::term_open_ssh,
            term::term_open_local,
            term::term_write,
            term::term_resize,
            term::term_close,
            term::ssh_exec,
            term::ssh_test,
            term::host_detect_os,
            term::key_install,
            // files
            files::fs_open,
            files::fs_close,
            files::fs_list,
            files::fs_mkdir,
            files::fs_rename,
            files::fs_remove,
            files::fs_chmod,
            files::fs_read_text,
            files::fs_write_text,
            files::fs_presign,
            files::local_stat,
            files::read_local_text,
            files::transfer,
            files::transfer_cancel,
            // port forwarding
            forwards::forward_save,
            forwards::forward_delete,
            forwards::forward_start,
            forwards::forward_stop,
            forwards::forward_active,
            // system
            system::platform,
        ])
        .run(tauri::generate_context!())
        .expect("error while running K-Shell");
}
