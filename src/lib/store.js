import { reactive, watch } from 'vue'
import { api, uid } from './api'
import { isObjectStorage } from './os'

export const store = reactive({
  ready: false,
  platform: { os: 'macos' },
  vault: {
    hosts: [],
    keys: [],
    snippets: [],
    forwards: [],
    known_hosts: [],
    workspaces: [],
    history: [],
    settings: {},
  },
  view: 'hosts', // sidebar section shown on the Vault tab
  settingsTab: 'appearance', // section shown on the Settings page
  tabs: [], // open session tabs
  active: 'vault', // 'vault' or a tab id
  activeForwards: [],
  toasts: [],
  palette: false,
  editor: null, // { host } when host drawer is open
  dialog: null, // generic prompt/confirm dialog
  menu: null,
  systemDark: true, // OS colour scheme, tracked by lib/appearance.js
  recordingKeys: false,
  forwardFor: null, // host id: open a new forwarding rule for it (Hosts → Port forwarding…)
  tabDrag: null, // id of the tab being dragged in the tab bar
  layoutDrag: false, // a pane or tab is being dragged over the terminals: panes stop resizing their PTY
  paneToTabBar: false, // a dragged pane is over the tab bar (drop = own tab) // true while the shortcut editor captures a key combination
  // in-app updater: state is idle | available | downloading | installing | restarting
  update: { state: 'idle', version: '', notes: '', progress: null, checking: false }, // context menu { x, y, items }
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
export function confirm(title, message = '', { okText = 'Delete', danger = true, detail = '' } = {}) {
  return new Promise((resolve) => {
    store.dialog = { type: 'confirm', title, message, detail, okText, danger, resolve }
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

export function toggleSidebar() {
  store.vault.settings.sidebar_hidden = !store.vault.settings.sidebar_hidden
}

/** Open a workspace project: a local terminal in its folder, tinted with the workspace colour. */
export function openProject(ws, p) {
  const tab = openTerminal(
    { kind: 'local', cwd: p.path, startup_command: p.startup_command || '', title: p.name, workspace: ws.id },
    p.name,
  )
  tab.color = ws.color || ''
  return tab
}
/** Open every project of a workspace in its own tab; focuses the first one. */
export function openWorkspace(ws) {
  const tabs = (ws.projects || []).map((p) => openProject(ws, p))
  if (tabs[0]) store.active = tabs[0].id
  return tabs
}

export function connectHost(host) {
  if (host.protocol === 'ftp' || host.protocol === 'ftps' || isObjectStorage(host.protocol)) return openSftp(host)
  return openTerminal({ kind: 'ssh', host: { ...host } }, host.label || host.host)
}

export function openSftp(host = null) {
  const tab = {
    id: uid(),
    kind: 'sftp',
    title: host ? host.label || host.host : 'File Manager',
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

const firstLeaf = (n) => (n.type === 'leaf' ? n : firstLeaf(n.children[0]))

// ---------- split-tree helpers (pure: they return new split nodes, leaves are shared) ----------

/** Tree without node `id` (its sibling takes the freed space); null when nothing is left. */
export function treeWithout(n, id) {
  if (n.id === id) return null
  if (n.type === 'leaf') return n
  const kids = n.children.map((c) => treeWithout(c, id)).filter(Boolean)
  if (!kids.length) return null
  if (kids.length === 1) return kids[0]
  return { ...n, children: kids }
}
/** Tree with `node` placed on `side` ('left' | 'right' | 'top' | 'bottom') of node `targetId`. */
export function treeInsert(n, targetId, side, node) {
  if (n.id === targetId) {
    const dir = side === 'left' || side === 'right' ? 'row' : 'col'
    const before = side === 'left' || side === 'top'
    return { type: 'split', id: uid(), dir, ratio: 0.5, children: before ? [node, n] : [n, node] }
  }
  if (n.type === 'leaf') return n
  return { ...n, children: n.children.map((c) => treeInsert(c, targetId, side, node)) }
}
/** Where a pane currently sits, as { nodeId, side } relative to its sibling. */
export function placeOf(root, id) {
  const walk = (n) => {
    if (n.type === 'leaf') return null
    const i = n.children.findIndex((c) => c.id === id)
    if (i >= 0) {
      const side = n.dir === 'row' ? (i === 0 ? 'left' : 'right') : i === 0 ? 'top' : 'bottom'
      return { nodeId: n.children[1 - i].id, side }
    }
    return n.children.map(walk).find(Boolean) || null
  }
  return walk(root)
}

/** Move pane `leafId` of `tab` next to node `nodeId`. Its session keeps running. */
export function movePane(tab, leafId, nodeId, side) {
  if (leafId === nodeId) return
  let leaf = null
  const find = (n) => (n.id === leafId ? (leaf = n) : n.type === 'split' && n.children.forEach(find))
  find(tab.root)
  const base = leaf && treeWithout(tab.root, leafId)
  if (!base) return
  tab.root = treeInsert(base, nodeId, side, leaf)
  tab.focus = leafId
}

/**
 * Merge terminal tab `srcId` into tab `dstId`, placing it on `side` of node `nodeId`.
 * Sessions keep running: the panes only move.
 */
export function mergeTab(srcId, dstId, nodeId, side) {
  const src = store.tabs.find((t) => t.id === srcId)
  const dst = store.tabs.find((t) => t.id === dstId)
  if (!src || !dst || src === dst || src.kind !== 'term' || dst.kind !== 'term') return
  dst.root = treeInsert(dst.root, nodeId, side, src.root)
  dst.focus = firstLeaf(src.root).id
  store.tabs.splice(store.tabs.indexOf(src), 1)
  store.active = dst.id
}

/** Drop target registered by TerminalLayer for tabs dragged from the tab bar: { over(x, y, tab), drop(), leave() } */
export const terminalDrop = { api: null }

/** Take a pane out of a split tab and give it its own tab (the session keeps running). */
export function detachPane(tab, paneId) {
  let moved = null
  const prune = (node) => {
    if (node.type === 'leaf') {
      if (node.id !== paneId) return node
      moved = node
      return null
    }
    const kids = node.children.map(prune).filter(Boolean)
    if (kids.length === 1) return kids[0]
    node.children = kids
    return node
  }
  if (tab.root.type === 'leaf') return
  tab.root = prune(tab.root)
  if (!moved) return
  tab.focus = firstLeaf(tab.root).id
  const t = moved.target
  const nt = {
    id: uid(),
    kind: 'term',
    title: t.kind === 'local' ? t.title || 'Local' : t.host.label || t.host.host,
    root: moved,
    focus: moved.id,
    color: t.host?.color || tab.color || '',
  }
  store.tabs.splice(store.tabs.indexOf(tab) + 1, 0, nt)
  store.active = nt.id
}

// live terminal panes (id -> { write(text), focus(), term })
export const panes = new Map()

export function sendToFocused(text) {
  const tab = activeTab()
  const p = tab && panes.get(tab.focus)
  if (!p) return toast('Open a terminal first', 'error')
  p.write(text)
  if (tab.broadcast) for (const q of broadcastPeers(tab, tab.focus)) q.write(text)
  p.focus()
}

// ---------- broadcast input ----------
// A terminal tab with `broadcast` on sends what is typed (or pasted, or a snippet) in one
// pane to the other panes of the tab too. A pane opts out with `leaf.noBroadcast`.

const leavesOf = (n) => (n.type === 'leaf' ? [n] : n.children.flatMap(leavesOf))

/** Turn broadcast on/off for a terminal tab (the active one by default). */
export function toggleBroadcast(tab = activeTab()) {
  if (!tab || tab.kind !== 'term') return
  if (!tab.broadcast && tab.root.type === 'leaf')
    return toast('Split the tab first: broadcast sends input to the other panes of the tab')
  tab.broadcast = !tab.broadcast
  if (tab.broadcast) for (const l of leavesOf(tab.root)) l.noBroadcast = false
}

/** Live panes of `tab`, other than `fromId`, that receive broadcast input. */
export function broadcastPeers(tab, fromId) {
  const from = leavesOf(tab.root).find((l) => l.id === fromId)
  if (!from || from.noBroadcast) return []
  return leavesOf(tab.root)
    .filter((l) => l.id !== fromId && !l.noBroadcast)
    .map((l) => panes.get(l.id))
    .filter(Boolean)
}

/** Broadcast stops by itself once a tab is down to one pane. */
watch(
  () => store.tabs.map((t) => t.broadcast && t.root.type === 'leaf'),
  () => {
    for (const t of store.tabs) if (t.broadcast && t.root.type === 'leaf') t.broadcast = false
  },
)

// ---------- rename ----------

/** Rename a tab; an empty name goes back to the automatic title. */
export async function renameTab(tab) {
  if (!tab) return
  const name = await prompt('Rename tab', { value: tab.title, placeholder: autoTitle(tab), okText: 'Rename' })
  if (name == null) return
  setTabName(tab, name)
}
export function setTabName(tab, name) {
  name = String(name).trim()
  tab.renamed = !!name
  tab.title = name || autoTitle(tab)
}
function autoTitle(tab) {
  if (tab.kind === 'sftp') return tab.host ? tab.host.label || tab.host.host : 'File Manager'
  const t = firstLeaf(tab.root).target
  return t.kind === 'local' ? t.title || 'Local' : t.host.label || t.host.host
}

// ---------- session: reopen the tabs of the last run ----------
// Saved in the vault. SSH and file-manager hosts are stored by id and looked up again on
// restore, so no password or key is copied; a host deleted since then is skipped.

const hostRef = (h) =>
  h?.id ? { id: h.id } : h ? { protocol: h.protocol, host: h.host, port: h.port, username: h.username } : null
const hostOf = (ref) => (ref?.id ? store.vault.hosts.find((h) => h.id === ref.id) : ref?.host ? ref : null)

function snapNode(n) {
  if (n.type === 'split') return { type: 'split', dir: n.dir, ratio: n.ratio, children: n.children.map(snapNode) }
  const t = n.target
  if (t.kind === 'local') {
    const { cwd, startup_command, title, workspace } = t
    return { type: 'leaf', target: { kind: 'local', cwd, startup_command, title, workspace } }
  }
  return { type: 'leaf', target: { kind: 'ssh', host: hostRef(t.host) } }
}
function snapshot() {
  if (!store.vault.settings.restore_tabs) return null
  const tabs = store.tabs.map((t) => ({
    kind: t.kind,
    title: t.title,
    renamed: !!t.renamed,
    color: t.color,
    ...(t.kind === 'sftp' ? { host: hostRef(t.host) } : { root: snapNode(t.root) }),
  }))
  return { tabs, active: store.tabs.findIndex((t) => t.id === store.active) }
}

function buildNode(n) {
  if (n.type === 'split') {
    const kids = n.children.map(buildNode).filter(Boolean)
    if (kids.length < 2) return kids[0] || null
    return { type: 'split', id: uid(), dir: n.dir, ratio: n.ratio || 0.5, children: kids }
  }
  if (n.target?.kind === 'local') return leaf({ ...n.target })
  const h = hostOf(n.target?.host)
  return h ? leaf({ kind: 'ssh', host: { ...h } }) : null
}

/** Reopen the tabs saved by the last run (called once, after the vault is loaded). */
export function restoreSession() {
  const s = store.vault.session
  if (store.vault.settings.restore_tabs && s?.tabs?.length && !store.tabs.length) {
    for (const st of s.tabs) {
      let tab
      if (st.kind === 'sftp') {
        const h = st.host ? hostOf(st.host) : null
        if (st.host && !h) continue
        tab = { id: uid(), kind: 'sftp', title: st.title, host: h ? { ...h } : null, color: st.color || '' }
      } else {
        const root = st.root && buildNode(st.root)
        if (!root) continue
        tab = { id: uid(), kind: 'term', title: st.title, root, focus: firstLeaf(root).id, color: st.color || '' }
      }
      if (st.renamed) tab.renamed = true
      else tab.title = autoTitle(tab) // follow host renames
      store.tabs.push(tab)
    }
    store.active = store.tabs[s.active]?.id || store.tabs[0]?.id || 'vault'
  }
  // From now on keep the saved session in step with the open tabs.
  let timer = 0
  watch(
    () => JSON.stringify(snapshot()),
    (json) => {
      clearTimeout(timer)
      timer = setTimeout(() => api.session_save({ session: JSON.parse(json) }).catch(() => {}), 500)
    },
    { immediate: true },
  )
}

// Persist settings whenever they are edited in place (from the Settings page or a shortcut
// such as zoom). Replacing the whole object (loadVault) is not an edit and is skipped.
let saveTimer = 0
watch(
  () => store.vault.settings,
  (now, before) => {
    if (now !== before) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const s = store.vault.settings
      api
        .settings_save({
          settings: {
            ...s,
            font_size: +s.font_size || 13,
            scrollback: +s.scrollback || 10000,
            line_height: +s.line_height || 1.2,
            ui_zoom: +s.ui_zoom || 1,
            letter_spacing: +s.letter_spacing || 0,
            min_contrast: +s.min_contrast || 1,
          },
        })
        .catch(err)
    }, 300)
  },
  { deep: true },
)

export function openMenu(e, items) {
  e.preventDefault()
  e.stopPropagation()
  const x = Math.min(e.clientX, window.innerWidth - 200)
  const y = Math.min(e.clientY, window.innerHeight - items.length * 31 - 12)
  store.menu = { x, y, items }
}
