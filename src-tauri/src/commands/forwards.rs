//! Port-forwarding rules (stored in the vault) and their runtime state.

use super::State;
use crate::error::Res;
use crate::vault::{upsert, Forward};

#[tauri::command]
pub fn forward_save(st: State, forward: Forward) -> Res<Forward> {
    let f = upsert(&mut st.vault.data.write().forwards, forward);
    st.vault.save()?;
    Ok(f)
}

#[tauri::command]
pub async fn forward_delete(st: State<'_>, id: String) -> Res<()> {
    st.forwards.stop(&id).await;
    st.vault.data.write().forwards.retain(|f| f.id != id);
    st.vault.save()
}

#[tauri::command]
pub async fn forward_start(st: State<'_>, id: String) -> Res<()> {
    let f = st.vault.data.read().forwards.iter().find(|f| f.id == id).cloned().ok_or("rule not found")?;
    let host = st.vault.host(&f.host_id).ok_or("host for this rule was deleted")?;
    let conn = st.pool.get(&st.vault, &host).await?;
    st.forwards.start(f, conn).await
}

#[tauri::command]
pub async fn forward_stop(st: State<'_>, id: String) -> Res<()> {
    st.forwards.stop(&id).await;
    Ok(())
}

/// Ids of rules that are currently running.
#[tauri::command]
pub fn forward_active(st: State) -> Vec<String> {
    st.forwards.active()
}

/// Start every rule flagged `auto_start` (called once at launch).
pub async fn autostart(st: &crate::state::AppState) {
    let rules: Vec<Forward> =
        st.vault.data.read().forwards.iter().filter(|f| f.auto_start).cloned().collect();
    for f in rules {
        if let Some(h) = st.vault.host(&f.host_id) {
            if let Ok(c) = st.pool.get(&st.vault, &h).await {
                let _ = st.forwards.start(f, c).await;
            }
        }
    }
}
