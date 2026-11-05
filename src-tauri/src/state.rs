//! Process-wide application state, managed by Tauri and injected into commands.

use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use crate::error::Res;
use crate::forward::Forwards;
use crate::fs::{Fs, Progress};
use crate::ssh::Pool;
use crate::terminal::Terminals;
use crate::vault::Vault;

pub struct AppState {
    pub vault: Arc<Vault>,
    pub pool: Pool,
    pub terminals: Arc<Terminals>,
    /// Open file-manager sessions, keyed by an id handed to the UI.
    pub files: Mutex<HashMap<String, Arc<Fs>>>,
    /// Running transfers, keyed by the UI-provided transfer id (for cancel).
    pub transfers: Mutex<HashMap<String, Progress>>,
    pub forwards: Forwards,
    /// Remote files opened in another app, watched for saves (see `fs_open_external`).
    pub watches: Mutex<HashMap<String, Watch>>,
}

/// A downloaded copy of a remote file, kept so a save in another app can be uploaded back.
pub struct Watch {
    pub fsid: String,
    pub local: String,
    pub remote: String,
    pub stop: Arc<AtomicBool>,
}

impl AppState {
    pub fn new(vault: Vault) -> Self {
        Self {
            vault: Arc::new(vault),
            pool: Pool::default(),
            terminals: Arc::new(Terminals::default()),
            files: Mutex::new(HashMap::new()),
            transfers: Mutex::new(HashMap::new()),
            forwards: Forwards::default(),
            watches: Mutex::new(HashMap::new()),
        }
    }

    pub fn fs(&self, id: &str) -> Res<Arc<Fs>> {
        self.files.lock().get(id).cloned().ok_or_else(|| "file session closed".to_string())
    }
}
