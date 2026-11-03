import { reactive, watch } from 'vue'
import { api, uid } from './api'

export const store = reactive({
  ready: false,
  platform: { os: 'macos' },
  vault: { hosts: [], keys: [], snippets: [], forwards: [], known_hosts: [], settings: {} },
  view: 'hosts', // sidebar section shown on the Vault tab
  tabs: [], // open session tabs
  active: 'vault', // 'vault' or a tab id
  activeForwards: [],
  toasts: [],
  palette: false,
  editor: null, // { host } when host drawer is open
  dialog: null, // generic prompt/confirm dialog
  menu: null, // context menu { x, y, items }
})

export async function loadVault() {
  store.vault = await api.vault_get()
  store.activeForwards = await api.forward_active()
}

export function toast(msg, kind = 'info', ms = 3500) {
  const id = uid()
  store.toasts.push({ id, msg: String(msg), kind })
  setTimeout(() => {
    store.toasts = store.toasts.filter((t) => t.id !== id)
  }, ms)
}

export const err = (e) => toast(e?.message || e, 'error', 6000)

/** Promise-based dialogs rendered by <Dialog/> */
export function prompt(title, { value = '', placeholder = '', label = '', okText = 'OK', password = false } = {}) {
  return new Promise((resolve) => {
    store.dialog = { type: 'prompt', title, value, placeholder, label, okText, password, resolve }
  })
}
export function confirm(title, message = '', { okText = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    store.dialog = { type: 'confirm', title, message, okText, danger, resolve }
  })
}

// ---------- tabs ----------

export function leaf(target) {
  return { type: 'leaf', id: uid(), target }
}

export function openTerminal(target, title) {
  const l = leaf(target)
  const tab = { id: uid(), kind: 'term', title, root: l, focus: l.id, color: target.host?.color || '' }
  store.tabs.push(tab)
  store.active = tab.id
  return tab
}

export function openLocal() {
  return openTerminal({ kind: 'local' }, 'Local')
}

export function connectHost(host) {
  if (host.protocol === 'ftp' || host.protocol === 'ftps' || host.protocol === 's3') return openSftp(host)
  return openTerminal({ kind: 'ssh', host: { ...host } }, host.label || host.host)
}

export function openSftp(host = null) {
  const tab = {
    id: uid(),
    kind: 'sftp',
    title: host ? host.label || host.host : 'SFTP',
    host: host ? { ...host } : null,
    color: host?.color || '',
  }
  store.tabs.push(tab)
  store.active = tab.id
  return tab
}

export function closeTab(id) {
  const i = store.tabs.findIndex((t) => t.id === id)
  if (i < 0) return
  store.tabs.splice(i, 1)
  if (store.active === id) store.active = store.tabs[Math.min(i, store.tabs.length - 1)]?.id || 'vault'
}

export function activeTab() {
  return store.tabs.find((t) => t.id === store.active)
}

/** Split the focused pane of the active terminal tab. dir: 'row' (side by side) | 'col' (stacked) */
export function splitFocused(dir, target) {
  const tab = activeTab()
  if (!tab || tab.kind !== 'term') return
  const replace = (node) => {
    if (node.type === 'leaf') {
      if (node.id !== tab.focus) return node
      const nl = leaf(target || node.target)
      tab.focus = nl.id
      return { type: 'split', id: uid(), dir, ratio: 0.5, children: [node, nl] }
    }
    node.children = node.children.map(replace)
    return node
  }
  tab.root = replace(tab.root)
}

/** Remove a pane from a tab; closes the tab when it was the last one. */
export function closePane(tab, paneId) {
  const prune = (node) => {
    if (node.type === 'leaf') return node.id === paneId ? null : node
    const kids = node.children.map(prune).filter(Boolean)
    if (kids.length === 0) return null
    if (kids.length === 1) return kids[0]
    node.children = kids
    return node
  }
  const root = prune(tab.root)
  if (!root) return closeTab(tab.id)
  tab.root = root
  const first = (n) => (n.type === 'leaf' ? n : first(n.children[0]))
  tab.focus = first(root).id
}

// live terminal panes (id -> { write(text), focus(), term })
export const panes = new Map()

export function sendToFocused(text) {
  const tab = activeTab()
  const p = tab && panes.get(tab.focus)
  if (!p) return toast('Open a terminal first', 'error')
  p.write(text)
  p.focus()
}

watch(
  () => store.vault.settings?.app_theme,
  (t) => {
    document.documentElement.dataset.theme = t || 'dark'
  },
)

export function openMenu(e, items) {
  e.preventDefault()
  e.stopPropagation()
  const x = Math.min(e.clientX, window.innerWidth - 200)
  const y = Math.min(e.clientY, window.innerHeight - items.length * 31 - 12)
  store.menu = { x, y, items }
}
