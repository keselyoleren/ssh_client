// In-app updates (tauri-plugin-updater). Release builds check GitHub Releases for
// latest.json; updates are verified against the public key in tauri.conf.json.
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { store, toast, err, confirm } from './store'

const CHECK_EVERY = 6 * 60 * 60 * 1000 // 6 hours
let pending = null

/** Look for a newer version. `manual` reports the outcome even when there's nothing new. */
export async function checkForUpdate({ manual = false } = {}) {
  if (['downloading', 'installing', 'restarting'].includes(store.update.state)) return
  store.update.checking = true
  try {
    const update = await check()
    if (update) {
      pending = update
      store.update = { ...store.update, state: 'available', version: update.version, notes: update.body || '' }
      if (manual) toast(`K-Shell ${update.version} is available`)
    } else if (manual) {
      toast("You're using the latest version")
    }
  } catch (e) {
    if (manual) err(`Couldn't check for updates: ${e}`)
  } finally {
    store.update.checking = false
  }
}

/** Download, verify and install the pending update, then restart K-Shell. */
export async function installUpdate() {
  if (!pending) return
  const sessions = store.tabs.length
  if (
    sessions &&
    !(await confirm(
      `Update to K-Shell ${store.update.version}?`,
      `K-Shell restarts after installing. ${sessions} open tab${sessions > 1 ? 's' : ''} will be closed.`,
      { okText: 'Update and restart', danger: false },
    ))
  )
    return
  let total = 0
  let done = 0
  store.update.state = 'downloading'
  store.update.progress = null
  try {
    await pending.downloadAndInstall((ev) => {
      if (ev.event === 'Started') total = ev.data.contentLength || 0
      else if (ev.event === 'Progress') {
        done += ev.data.chunkLength
        store.update.progress = total ? Math.min(100, Math.round((done / total) * 100)) : null
      } else if (ev.event === 'Finished') store.update.state = 'installing'
    })
    store.update.state = 'restarting'
    await relaunch()
  } catch (e) {
    store.update.state = 'available'
    err(`Update failed: ${e}. You can also download it from keselyoleren.com/download`)
  }
}

/** Check shortly after launch and then every few hours (release builds only). */
export function startUpdateChecks() {
  if (import.meta.env.DEV) return
  setTimeout(() => checkForUpdate(), 5000)
  setInterval(() => checkForUpdate(), CHECK_EVERY)
}
