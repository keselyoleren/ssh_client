// Keyboard shortcut registry: every rebindable action, its default keys per platform,
// and helpers to match, format and validate key combinations.
//
// A combo is a string such as "Shift+Meta+D" or "Ctrl+Shift+Tab": modifiers in the fixed
// order Ctrl, Alt, Shift, Meta, followed by one key name (see keyName()).
// User overrides live in settings.keybindings as "<mac|pc>:<action id>" -> combo, where an
// empty combo means "no shortcut".

import { computed } from 'vue'
import {
  store,
  openLocal,
  openSftp,
  closeTab,
  closePane,
  activeTab,
  splitFocused,
  toggleSidebar,
  toggleBroadcast,
} from './store'
import { zoomBy, zoomReset } from './appearance'

const isMac = () => store.platform.os === 'macos'
const plat = () => (isMac() ? 'mac' : 'pc')

function cycleTab(d) {
  const ids = ['vault', ...store.tabs.map((t) => t.id)]
  const i = Math.max(0, ids.indexOf(store.active))
  store.active = ids[(i + d + ids.length) % ids.length]
}
function cyclePane(d) {
  const tab = activeTab()
  if (!tab || tab.kind !== 'term') return
  const leaves = []
  const walk = (n) => (n.type === 'leaf' ? leaves.push(n.id) : n.children.forEach(walk))
  walk(tab.root)
  const i = Math.max(0, leaves.indexOf(tab.focus))
  tab.focus = leaves[(i + d + leaves.length) % leaves.length]
}
const showVault = (view) => {
  store.active = 'vault'
  if (view) store.view = view
}

// scope 'terminal': handled by the focused terminal pane, not globally.
export const ACTIONS = [
  {
    id: 'palette',
    group: 'General',
    label: 'Command palette / quick connect',
    mac: ['Meta+K', 'Meta+P'],
    pc: ['Ctrl+Shift+K', 'Ctrl+Shift+P'],
    run: () => (store.palette = !store.palette),
  },
  {
    id: 'settings',
    group: 'General',
    label: 'Open settings',
    mac: ['Meta+,'],
    pc: ['Ctrl+,'],
    run: () => showVault('settings'),
  },
  {
    id: 'hosts',
    group: 'General',
    label: 'Host list',
    mac: ['Meta+1'],
    pc: ['Ctrl+Shift+1'],
    run: () => showVault('hosts'),
  },
  { id: 'workspaces', group: 'General', label: 'Workspaces', run: () => showVault('workspaces') },
  { id: 'snippets', group: 'General', label: 'Snippets', run: () => showVault('snippets') },
  { id: 'keys', group: 'General', label: 'Keychain', run: () => showVault('keys') },
  { id: 'forwards', group: 'General', label: 'Port forwarding', run: () => showVault('forwards') },

  {
    id: 'new_local',
    group: 'Tabs',
    label: 'New local terminal',
    mac: ['Meta+T'],
    pc: ['Ctrl+Shift+T'],
    run: openLocal,
  },
  { id: 'new_sftp', group: 'Tabs', label: 'Open file manager', run: () => openSftp() },
  {
    id: 'close_tab',
    group: 'Tabs',
    label: 'Close tab',
    mac: ['Meta+W'],
    pc: ['Ctrl+Shift+W'],
    run: () => store.active !== 'vault' && closeTab(store.active),
  },
  {
    id: 'next_tab',
    group: 'Tabs',
    label: 'Next tab',
    mac: ['Ctrl+Tab', 'Shift+Meta+]'],
    pc: ['Ctrl+Tab'],
    run: () => cycleTab(1),
  },
  {
    id: 'prev_tab',
    group: 'Tabs',
    label: 'Previous tab',
    mac: ['Ctrl+Shift+Tab', 'Shift+Meta+['],
    pc: ['Ctrl+Shift+Tab'],
    run: () => cycleTab(-1),
  },
  ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    id: `tab_${n}`,
    group: 'Tabs',
    label: `Switch to tab ${n}`,
    mac: [`Meta+${n}`],
    pc: [`Ctrl+Shift+${n}`],
    run: () => (store.active = store.tabs[n - 2]?.id || store.active),
  })),

  {
    id: 'split_right',
    group: 'Panes',
    label: 'Split right',
    mac: ['Meta+D'],
    pc: ['Ctrl+Shift+D'],
    run: () => splitFocused('row'),
  },
  {
    id: 'split_down',
    group: 'Panes',
    label: 'Split down',
    mac: ['Shift+Meta+D', 'Meta+E'],
    pc: ['Ctrl+Shift+E'],
    run: () => splitFocused('col'),
  },
  {
    id: 'next_pane',
    group: 'Panes',
    label: 'Focus next pane',
    mac: ['Meta+]'],
    pc: ['Ctrl+Shift+]'],
    run: () => cyclePane(1),
  },
  {
    id: 'prev_pane',
    group: 'Panes',
    label: 'Focus previous pane',
    mac: ['Meta+['],
    pc: ['Ctrl+Shift+['],
    run: () => cyclePane(-1),
  },
  {
    id: 'close_pane',
    group: 'Panes',
    label: 'Close pane',
    run: () => {
      const t = activeTab()
      if (t?.kind === 'term') closePane(t, t.focus)
    },
  },
  {
    id: 'broadcast',
    group: 'Panes',
    label: 'Broadcast input to all panes',
    mac: ['Alt+Meta+I'],
    pc: ['Ctrl+Shift+I'],
    run: () => toggleBroadcast(),
  },

  { id: 'copy', group: 'Terminal', label: 'Copy selection', scope: 'terminal', mac: ['Meta+C'], pc: ['Ctrl+Shift+C'] },
  { id: 'paste', group: 'Terminal', label: 'Paste', scope: 'terminal', mac: ['Meta+V'], pc: ['Ctrl+Shift+V'] },
  {
    id: 'find',
    group: 'Terminal',
    label: 'Find in terminal',
    scope: 'terminal',
    mac: ['Meta+F'],
    pc: ['Ctrl+Shift+F'],
  },
  { id: 'clear', group: 'Terminal', label: 'Clear terminal', scope: 'terminal' },
  {
    id: 'accept_suggestion',
    group: 'Terminal',
    label: 'Accept autosuggestion',
    scope: 'terminal',
    mac: ['Right'],
    pc: ['Right'],
  },
  {
    id: 'accept_suggestion_word',
    group: 'Terminal',
    label: 'Accept next word of autosuggestion',
    scope: 'terminal',
    mac: ['Alt+Right'],
    pc: ['Ctrl+Right'],
  },

  {
    id: 'toggle_sidebar',
    group: 'View',
    label: 'Show / hide sidebar',
    mac: ['Meta+B'],
    pc: ['Ctrl+Shift+B'],
    run: toggleSidebar,
  },
  {
    id: 'zoom_in',
    group: 'View',
    label: 'Zoom in',
    mac: ['Meta+=', 'Shift+Meta+='],
    pc: ['Ctrl+=', 'Ctrl+Shift+='],
    run: () => zoomBy(1),
  },
  { id: 'zoom_out', group: 'View', label: 'Zoom out', mac: ['Meta+-'], pc: ['Ctrl+-'], run: () => zoomBy(-1) },
  { id: 'zoom_reset', group: 'View', label: 'Reset zoom', mac: ['Meta+0'], pc: ['Ctrl+0'], run: zoomReset },
]
export const GROUPS = [...new Set(ACTIONS.map((a) => a.group))]
export const action = (id) => ACTIONS.find((a) => a.id === id)

// ---------- key combos ----------

const MODS = ['Ctrl', 'Alt', 'Shift', 'Meta']
const CODES = {
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
}

/** Layout-independent key name from the physical key (Shift doesn't turn "1" into "!"). */
export function keyName(e) {
  const c = e.code || ''
  if (/^Key[A-Z]$/.test(c)) return c.slice(3)
  if (/^(Digit|Numpad)\d$/.test(c)) return c.slice(-1)
  if (/^F\d{1,2}$/.test(c)) return c
  if (CODES[c]) return CODES[c]
  if (['Shift', 'Control', 'Alt', 'Meta', 'OS', 'CapsLock', 'Fn', 'Dead', 'Process', 'Unidentified'].includes(e.key))
    return null
  if (!e.key || e.key === '+') return null
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

export function heldMods(e) {
  return MODS.filter((m) => e[{ Ctrl: 'ctrlKey', Alt: 'altKey', Shift: 'shiftKey', Meta: 'metaKey' }[m]])
}

/** Combo string for a keydown event, or null for a bare modifier press. */
export function eventCombo(e) {
  const k = keyName(e)
  return k ? [...heldMods(e), k].join('+') : null
}

const splitCombo = (combo) => {
  const parts = combo.split('+')
  return { mods: parts.slice(0, -1), key: parts.at(-1) }
}

const MAC_SYM = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' }
const MAC_KEYS = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Enter: '↩',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: 'Esc',
  Tab: '⇥',
}
const PC_KEYS = { Up: '↑', Down: '↓', Left: '←', Right: '→', Escape: 'Esc' }

function modName(m) {
  if (isMac()) return MAC_SYM[m]
  if (m === 'Meta') return store.platform.os === 'windows' ? 'Win' : 'Super'
  return m
}

/** Individual keycaps for display, e.g. ['⇧', '⌘', 'D'] or ['Ctrl', 'Shift', 'D']. */
export function keycaps(combo) {
  if (!combo) return []
  const { mods, key } = splitCombo(combo)
  return [...mods.map(modName), (isMac() ? MAC_KEYS : PC_KEYS)[key] || key]
}

/** One-line label, e.g. "⇧⌘D" or "Ctrl+Shift+D". */
export const comboLabel = (combo) => keycaps(combo).join(isMac() ? '' : '+')

// ---------- bindings ----------

const overrideKey = (id) => `${plat()}:${id}`
export const defaultBindings = (a) => (isMac() ? a.mac : a.pc) || []

export function bindingsOf(a) {
  const o = store.vault.settings?.keybindings?.[overrideKey(a.id)]
  return o === undefined ? defaultBindings(a) : o ? [o] : []
}
export const isCustom = (a) => store.vault.settings?.keybindings?.[overrideKey(a.id)] !== undefined

function writeOverrides(fn) {
  const s = store.vault.settings
  const kb = { ...(s.keybindings || {}) }
  fn(kb)
  s.keybindings = kb
}
/** Set the shortcut of an action ('' removes it). */
export const setBinding = (id, combo) => writeOverrides((kb) => (kb[overrideKey(id)] = combo))
export const resetBinding = (id) => writeOverrides((kb) => delete kb[overrideKey(id)])
export const resetAllBindings = () =>
  writeOverrides((kb) => Object.keys(kb).forEach((k) => k.startsWith(plat() + ':') && delete kb[k]))

const index = computed(() => {
  const m = new Map()
  for (const a of ACTIONS) for (const c of bindingsOf(a)) if (!m.has(c)) m.set(c, a)
  return m
})

/** Action bound to this keydown event, if any. */
export function actionFor(e) {
  const c = eventCombo(e)
  return (c && index.value.get(c)) || null
}

/** Other actions that use the same combo. */
export const usersOf = (combo, exceptId) => ACTIONS.filter((a) => a.id !== exceptId && bindingsOf(a).includes(combo))

/** First shortcut of an action as a label, for tooltips ("" when unbound). */
export function hint(id) {
  const a = action(id)
  const c = a && bindingsOf(a)[0]
  return c ? comboLabel(c) : ''
}
export const withHint = (text, id) => (hint(id) ? `${text} (${hint(id)})` : text)

// Taken by K-Shell's macOS menu bar (src-tauri/src/lib.rs) before the page sees them.
const MAC_RESERVED = [
  'Meta+Q',
  'Meta+H',
  'Alt+Meta+H',
  'Meta+M',
  'Ctrl+Meta+F',
  'Meta+X',
  'Meta+Z',
  'Shift+Meta+Z',
  'Meta+A',
]

/** { error } blocks the combo; { warn } is shown but allowed. */
export function checkCombo(combo) {
  const { mods, key } = splitCombo(combo)
  const fkey = /^F\d{1,2}$/.test(key)
  if (!fkey && !mods.some((m) => m !== 'Shift'))
    return { error: `Add a modifier key (${isMac() ? '⌘, ⌃ or ⌥' : 'Ctrl or Alt'}) so normal typing still works` }
  if (isMac() && MAC_RESERVED.includes(combo)) return { error: `${comboLabel(combo)} is used by the macOS menu bar` }
  const safe =
    fkey ||
    (isMac() ? mods.includes('Meta') : mods.includes('Meta') || (mods.includes('Ctrl') && mods.includes('Shift')))
  if (!safe) return { warn: `${comboLabel(combo)} is normally sent to the shell — terminals won't receive it any more` }
  return {}
}
