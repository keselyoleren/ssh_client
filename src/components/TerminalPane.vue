<script setup>
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { openUrl } from '@tauri-apps/plugin-opener'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { api, Channel, asBytes, uid } from '../lib/api'
import {
  store,
  panes,
  splitFocused,
  closePane,
  detachPane,
  openMenu,
  openSftp,
  loadVault,
  toggleBroadcast,
  broadcastPeers,
} from '../lib/store'
import { termTheme } from '../lib/appearance'
import { actionFor, withHint } from '../lib/keymap'
import { promptInjection, MARKER } from '../lib/prompt'
import { LineTracker, suggestFor, firstWord, cursorContext } from '../lib/suggest'
import Icon from './Icon.vue'

const props = defineProps({ leaf: Object, tab: Object, visible: Boolean, split: Boolean })
const emit = defineEmits(['grab'])
const el = ref(null)
const status = ref('connecting')
const message = ref('')
const searching = ref(false)
const query = ref('')
const searchInput = ref(null)
const target = props.leaf.target
const title = computed(() =>
  target.kind === 'local' ? target.title || 'Local' : target.host.label || target.host.host,
)
const focused = computed(() => props.tab.focus === props.leaf.id)
/** This pane sends and receives broadcast input. */
const broadcasting = computed(() => !!props.tab.broadcast && !props.leaf.noBroadcast)

let term,
  fit,
  search,
  sid = null,
  ro,
  raf = 0,
  lastSize = ''
const S = () => store.vault.settings || {}
const theme = termTheme

function options() {
  const s = S()
  return {
    fontFamily: s.font_family || 'Menlo, monospace',
    fontSize: s.font_size || 13,
    lineHeight: s.line_height || 1.2,
    cursorStyle: s.cursor_style || 'block',
    cursorBlink: s.cursor_blink ?? true,
    scrollback: s.scrollback || 10000,
    theme: theme(),
  }
}

function doFit() {
  // while panes are dragged around the layout changes every few pixels: resize once, on drop
  if (store.layoutDrag || !props.visible || !el.value?.offsetWidth) return
  try {
    fit.fit()
  } catch {
    return
  }
  const key = term.cols + 'x' + term.rows
  if (key !== lastSize && sid && status.value === 'open') {
    lastSize = key
    api.term_resize({ id: sid, cols: term.cols, rows: term.rows }).catch(() => {})
  }
}
const scheduleFit = () => {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(doFit)
}

// ---------- autosuggestions ----------
const root = ref(null)
const tracker = new LineTracker()
// project terminals keep their own history (other projects' commands are still a fallback)
const histTarget = target.kind === 'local' ? (target.cwd ? `local:${target.cwd}` : 'local') : target.host.host
const ghost = ref(null) // { text, x, y, w, cw, ch }
let ghostRaf = 0
const refreshGhost = () => {
  cancelAnimationFrame(ghostRaf)
  ghostRaf = requestAnimationFrame(computeGhost)
}
function computeGhost() {
  ghost.value = null
  if (!term || S().autosuggest === false || status.value !== 'open' || inj) return
  if (!tracker.valid || !tracker.buf) return
  const b = term.buffer.active
  if (b.type !== 'normal' || b.viewportY !== b.baseY) return // full-screen app or scrolled back
  const ctx = cursorContext(term)
  // only when the typed text is visibly echoed (not a password prompt) and nothing is drawn after it
  if (!ctx || ctx.free < 1 || !ctx.before.endsWith(tracker.buf)) return
  const text = suggestFor(tracker.buf, {
    history: store.vault.history,
    snippets: store.vault.snippets,
    target: histTarget,
  })
  if (!text) return
  const screen = term.element?.querySelector('.xterm-screen')
  if (!screen || !root.value) return
  const r = screen.getBoundingClientRect()
  const o = root.value.getBoundingClientRect()
  const cw = r.width / term.cols
  const ch = r.height / term.rows
  const x = r.left - o.left + b.cursorX * cw
  ghost.value = { text, x, y: r.top - o.top + b.cursorY * ch, w: Math.min(r.right - o.left - x, ctx.free * cw), cw, ch }
}
function remember(line) {
  const cmd = line.trim()
  if (!cmd || line.startsWith(' ')) return // leading space = "don't remember", like HISTCONTROL=ignorespace
  const h = (store.vault.history ||= [])
  const i = h.findIndex((x) => x.cmd === cmd && x.target === histTarget)
  if (i >= 0) h.splice(i, 1)
  h.push({ cmd, target: histTarget, at: Math.floor(Date.now() / 1000) })
  if (h.length > 2000) h.splice(0, h.length - 2000)
  if (S().save_history !== false) api.history_add({ cmd, target: histTarget }).catch(() => {})
}
/** Keys/text on their way to the shell: follow the line, remember finished commands. */
function track(d) {
  const ctx = d === '\r' && cursorContext(term) // read the screen before the shell reacts
  const line = tracker.input(d)
  if (line != null && ctx?.before.endsWith(line)) remember(line)
  ghost.value = null
}
function acceptGhost(word) {
  const t = word ? firstWord(ghost.value.text) : ghost.value.text
  tracker.input(t)
  typed(t)
  ghost.value = null
}

// ---------- K-Shell prompt ----------
// Once the shell is idle at its first prompt, type the prompt snippet and hide everything
// until the snippet's marker comes back, then erase the old prompt line.
const MARK = new TextEncoder().encode(MARKER)
let inj = null // { id, phase: 'wait' | 'hide', seen, chunks, quiet, max }

function wantPrompt() {
  const s = S()
  if (!s.prompt_enabled || !s.prompt_segments?.length) return false
  const scope = s.prompt_scope || 'all'
  if (target.kind === 'local')
    return scope !== 'ssh' && store.platform.os !== 'windows' && !target.startup_command?.trim()
  // a startup command (tmux attach, sudo -i…) would receive the snippet instead of the login shell
  return scope !== 'local' && !target.host.startup_command?.trim()
}
function cancelPrompt() {
  if (!inj) return
  clearTimeout(inj.quiet)
  clearTimeout(inj.max)
  const chunks = inj.phase === 'hide' ? inj.chunks : []
  inj = null
  for (const c of chunks) term.write(c)
}
function armPrompt(id) {
  inj = { id, phase: 'wait', seen: false, chunks: [], quiet: 0, max: setTimeout(() => firePrompt(id, true), 5000) }
}
function firePrompt(id, force = false) {
  if (!inj || inj.id !== id || sid !== id || inj.phase !== 'wait') return
  if (status.value !== 'open' || (!inj.seen && !force)) return
  clearTimeout(inj.quiet)
  clearTimeout(inj.max)
  inj.phase = 'hide'
  inj.max = setTimeout(cancelPrompt, 5000) // no marker (slow link, not bash/zsh-like): show what happened
  write(promptInjection(S().prompt_segments))
}
function indexOfBytes(hay, needle) {
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}
function output(b) {
  if (!inj) return term.write(b)
  if (inj.phase === 'wait') {
    term.write(b)
    inj.seen = true
    clearTimeout(inj.quiet)
    const id = inj.id
    inj.quiet = setTimeout(() => firePrompt(id), 450)
    return
  }
  inj.chunks.push(b)
  const all = new Uint8Array(inj.chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of inj.chunks) all.set(c, (o += c.length) - c.length)
  const i = indexOfBytes(all, MARK)
  if (i < 0) return
  clearTimeout(inj.max)
  inj = null
  term.write('\r\x1b[2K')
  term.write(all.subarray(i + MARK.length))
}

async function connect() {
  const id = uid()
  sid = id
  status.value = 'connecting'
  message.value = ''
  cancelPrompt()
  tracker.reset()
  if (wantPrompt()) armPrompt(id)
  const ch = new Channel()
  ch.onmessage = (m) => {
    if (sid !== id) return
    const b = asBytes(m)
    if (b) return output(b)
    const ev = typeof m === 'string' ? JSON.parse(m) : m
    if (ev.type === 'exit') {
      cancelPrompt()
      status.value = 'closed'
      term.write(
        `\r\n\x1b[2m[session closed${ev.code != null ? ' · exit ' + ev.code : ''}] press Enter to reconnect\x1b[0m\r\n`,
      )
    }
  }
  try {
    doFit()
    if (target.kind === 'local') {
      await api.term_open_local({
        id,
        cols: term.cols,
        rows: term.rows,
        shell: null,
        cwd: target.cwd || null,
        startupCommand: target.startup_command || null,
        onData: ch,
      })
    } else {
      term.write(
        `\x1b[2mConnecting to ${target.host.username ? target.host.username + '@' : ''}${target.host.host}…\x1b[0m\r\n`,
      )
      await api.term_open_ssh({ id, host: target.host, cols: term.cols, rows: term.rows, onData: ch })
      const saved = store.vault.hosts.find((h) => h.id === target.host.id)
      if (saved && !saved.os)
        api
          .host_detect_os({ host: saved })
          .then(loadVault)
          .catch(() => {})
    }
    status.value = 'open'
    lastSize = term.cols + 'x' + term.rows
    scheduleFit()
  } catch (e) {
    cancelPrompt()
    status.value = 'error'
    message.value = String(e)
    term.write(`\r\n\x1b[31m✖ ${String(e)}\x1b[0m\r\n\x1b[2mPress Enter to retry\x1b[0m\r\n`)
  }
}

const write = (data) => {
  if (sid && status.value === 'open') api.term_write({ id: sid, data }).catch(() => {})
}

// ---------- broadcast input ----------
// xterm's onData also carries the terminal's own replies to the program running in it
// (cursor position, device attributes, colour queries…), focus events and mouse reports.
// Those belong to this pane only.
const AUTOMATIC =
  /^\x1b(\[[\d;?>]*[Rcn]|\[\?[\d;]*\$y|\[[IO]$|\[<[\d;]*[Mm]|\[M|\][\s\S]*(\x07|\x1b\\)$|P[\s\S]*\x1b\\$)/
/** Send typed text to this pane and, with broadcast on, to the other panes of the tab. */
function typed(d) {
  write(d)
  if (props.tab.broadcast && !AUTOMATIC.test(d)) for (const p of broadcastPeers(props.tab, props.leaf.id)) p.input(d)
}
/** A whole command (snippet): every broadcasting pane runs it. */
function runCommand(cmd) {
  tracker.reset()
  write(cmd)
  if (props.tab.broadcast) for (const p of broadcastPeers(props.tab, props.leaf.id)) p.write(cmd)
}
async function paste() {
  try {
    const t = await readText()
    if (t) term.paste(t)
  } catch {}
}
function copySel() {
  const s = term.getSelection()
  if (s) writeText(s).catch(() => {})
}

function doSearch(dir = 1) {
  if (!query.value) return
  const o = {
    caseSensitive: false,
    decorations: { activeMatchColorOverviewRuler: '#e07a45', matchOverviewRuler: '#888' },
  }
  dir > 0 ? search.findNext(query.value, o) : search.findPrevious(query.value, o)
}
async function openSearch() {
  searching.value = true
  await nextTick()
  searchInput.value?.focus()
}

function splitHere(dir) {
  props.tab.focus = props.leaf.id
  splitFocused(dir)
}
function closeSearch() {
  searching.value = false
  search.clearDecorations()
  term.focus()
}
function menu(e) {
  props.tab.focus = props.leaf.id
  openMenu(e, [
    { label: 'Copy', icon: 'copy', action: copySel },
    { label: 'Paste', icon: 'download', action: paste },
    { label: 'Clear', icon: 'x', action: () => term.clear() },
    { label: 'Find…', icon: 'search', action: openSearch },
    '-',
    { label: 'Split right', icon: 'splitH', action: () => splitFocused('row') },
    { label: 'Split down', icon: 'splitV', action: () => splitFocused('col') },
    ...(target.kind === 'ssh'
      ? [{ label: 'Open SFTP here', icon: 'folder', action: () => openSftp(target.host) }]
      : []),
    ...(store.vault.snippets.length
      ? [
          '-',
          ...store.vault.snippets.slice(0, 10).map((s) => ({
            label: s.name,
            icon: 'code',
            action: () => {
              runCommand(s.command + '\r')
              term.focus()
            },
          })),
        ]
      : []),
    '-',
    ...(props.split
      ? [
          {
            label: props.tab.broadcast ? 'Stop broadcasting input' : 'Broadcast input to all panes',
            icon: 'broadcast',
            action: () => toggleBroadcast(props.tab),
          },
        ]
      : []),
    ...(props.tab.broadcast
      ? [
          {
            label: props.leaf.noBroadcast ? 'Include this pane in broadcast' : 'Leave this pane out of broadcast',
            icon: 'broadcast',
            action: () => (props.leaf.noBroadcast = !props.leaf.noBroadcast),
          },
        ]
      : []),
    ...(props.split
      ? [{ label: 'Move to new tab', icon: 'popout', action: () => detachPane(props.tab, props.leaf.id) }]
      : []),
    { label: 'Close pane', icon: 'x', danger: true, action: () => closePane(props.tab, props.leaf.id) },
  ])
}

onMounted(async () => {
  term = new Terminal({
    ...options(),
    allowProposedApi: true,
    macOptionIsMeta: true,
    drawBoldTextInBrightColors: true,
    rightClickSelectsWord: false,
  })
  fit = new FitAddon()
  search = new SearchAddon()
  term.loadAddon(fit)
  term.loadAddon(search)
  term.loadAddon(
    new WebLinksAddon((ev, uri) => {
      if (ev.metaKey || ev.ctrlKey) openUrl(uri)
    }),
  )
  term.open(el.value)
  try {
    const gl = new WebglAddon()
    gl.onContextLoss(() => gl.dispose())
    term.loadAddon(gl)
  } catch {
    /* falls back to DOM renderer */
  }

  term.onData((d) => {
    if (status.value === 'open') {
      track(d)
      return typed(d)
    }
    if (d === '\r' && status.value !== 'connecting') {
      term.clear()
      connect()
    }
  })
  // The user started typing before the prompt was installed: leave the shell alone.
  // (onKey, not onData — onData also carries the terminal's automatic replies to shell queries.)
  term.onKey(() => inj?.phase === 'wait' && cancelPrompt())
  term.onWriteParsed(refreshGhost)
  term.onCursorMove(refreshGhost)
  term.onScroll(refreshGhost)
  term.onResize(refreshGhost)
  term.onSelectionChange(() => {
    if (S().copy_on_select && term.hasSelection()) copySel()
  })
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true
    const mac = store.platform.os === 'macos'
    const a = actionFor(e)
    if ((a?.id === 'accept_suggestion' || a?.id === 'accept_suggestion_word') && ghost.value) {
      acceptGhost(a.id === 'accept_suggestion_word')
      e.preventDefault()
      return false
    }
    if (a?.id === 'copy' && term.hasSelection()) {
      copySel()
      return false
    }
    if (a?.id === 'paste') {
      paste()
      e.preventDefault()
      return false
    }
    if (a?.id === 'find') {
      openSearch()
      e.preventDefault()
      return false
    }
    if (a?.id === 'clear') {
      term.clear()
      e.preventDefault()
      return false
    }
    if (mac && e.metaKey) return false // let app shortcuts through
    return true
  })
  el.value.addEventListener('contextmenu', (e) => {
    if (S().right_click_paste && !e.shiftKey && !term.hasSelection()) {
      e.preventDefault()
      paste()
    } else menu(e)
  })
  el.value.addEventListener('mousedown', () => {
    props.tab.focus = props.leaf.id
  })

  panes.set(props.leaf.id, {
    write: (t) => {
      tracker.reset() // snippets run as whole commands
      write(t)
    },
    /** Keystrokes broadcast from another pane of the tab. */
    input: (d) => {
      if (status.value !== 'open') return // never reconnect a closed pane from another pane's Enter
      track(d)
      write(d)
    },
    focus: () => term.focus(),
    term,
  })
  ro = new ResizeObserver(scheduleFit)
  ro.observe(el.value)
  await nextTick()
  doFit()
  connect()
  if (focused.value) term.focus()
})

watch(
  () => props.visible,
  (v) => {
    if (v)
      nextTick(() => {
        doFit()
        if (focused.value) term?.focus()
      })
  },
)
watch(
  () => store.layoutDrag,
  (d) => !d && scheduleFit(),
)
watch(focused, (f) => {
  if (f && props.visible) term?.focus()
})
watch(
  () => [store.vault.settings, store.systemDark],
  () => {
    if (!term) return
    Object.assign(term.options, options())
    scheduleFit()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  cancelPrompt()
  cancelAnimationFrame(ghostRaf)
  ro?.disconnect()
  cancelAnimationFrame(raf)
  panes.delete(props.leaf.id)
  if (sid) api.term_close({ id: sid }).catch(() => {})
  sid = null
  term?.dispose()
})
</script>

<template>
  <div
    ref="root"
    class="tp"
    :class="{ focused: focused && split, broadcasting }"
    :style="{ background: theme().background }"
  >
    <div
      v-if="split"
      class="ph"
      :style="{ color: theme().foreground }"
      title="Drag to move this pane"
      @mousedown="emit('grab', $event, title)"
    >
      <span class="st" :class="status"></span>
      <span class="t">{{ title }}</span>
      <button
        v-if="tab.broadcast"
        class="iconbtn bc"
        :class="{ off: leaf.noBroadcast }"
        @click="leaf.noBroadcast = !leaf.noBroadcast"
        :title="
          leaf.noBroadcast
            ? 'Not receiving broadcast input: click to include this pane'
            : 'Receiving broadcast input: click to leave this pane out'
        "
      >
        <Icon name="broadcast" :size="13" />
      </button>
      <button class="iconbtn" @click="splitFocused('row')" title="Split right">
        <Icon name="splitH" :size="13" />
      </button>
      <button class="iconbtn" @click="splitFocused('col')" title="Split down"><Icon name="splitV" :size="13" /></button>
      <button class="iconbtn" @click="detachPane(tab, leaf.id)" title="Move to new tab">
        <Icon name="popout" :size="13" />
      </button>
      <button class="iconbtn" @click="closePane(tab, leaf.id)" title="Close pane"><Icon name="x" :size="13" /></button>
    </div>
    <div v-else class="tools">
      <button class="iconbtn" @click="openSearch" :title="withHint('Find', 'find')">
        <Icon name="search" :size="14" />
      </button>
      <button class="iconbtn" @click="(e) => menu(e)" title="Snippets & actions">
        <Icon name="code" :size="14" />
      </button>
      <button class="iconbtn" @click="splitHere('row')" :title="withHint('Split right', 'split_right')">
        <Icon name="splitH" :size="14" />
      </button>
      <button class="iconbtn" @click="splitHere('col')" :title="withHint('Split down', 'split_down')">
        <Icon name="splitV" :size="14" />
      </button>
    </div>
    <div v-if="searching" class="find">
      <input
        ref="searchInput"
        v-model="query"
        placeholder="Find"
        @keydown.enter.exact="doSearch(1)"
        @keydown.shift.enter="doSearch(-1)"
        @keydown.esc="closeSearch"
        @input="doSearch(1)"
      />
      <button class="iconbtn" @click="doSearch(-1)"><Icon name="up" :size="13" /></button>
      <button class="iconbtn" @click="doSearch(1)"><Icon name="down" :size="13" /></button>
      <button class="iconbtn" @click="closeSearch">
        <Icon name="x" :size="13" />
      </button>
    </div>
    <div ref="el" class="xt"></div>
    <div
      v-if="ghost"
      class="ghost"
      :style="{
        left: ghost.x + 'px',
        top: ghost.y + 'px',
        width: ghost.w + 'px',
        height: ghost.ch + 'px',
        lineHeight: ghost.ch + 'px',
        color: theme().foreground,
        fontFamily: S().font_family,
        fontSize: (S().font_size || 13) + 'px',
      }"
    >
      <span v-for="(c, i) in ghost.text" :key="i" :style="{ width: ghost.cw + 'px' }">{{ c }}</span>
    </div>
    <div v-if="status === 'connecting' && target.kind === 'ssh'" class="loading"><span class="spin"></span></div>
  </div>
</template>

<style scoped>
.tp {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid transparent;
}
.tp.focused {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.tp.broadcasting {
  border-color: color-mix(in srgb, var(--warn) 55%, transparent);
}
.tp.broadcasting.focused {
  border-color: var(--warn);
}
.ph .bc {
  color: var(--warn);
  opacity: 1;
}
.ph .bc.off {
  color: inherit;
  opacity: 0.45;
}
.xt {
  flex: 1;
  min-height: 0;
  padding: 6px 4px 4px 10px;
}
.ph {
  height: 26px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 10px;
  font-size: 11.5px;
  opacity: 0.8;
  border-bottom: 1px solid rgba(127, 127, 127, 0.15);
}
.ph {
  cursor: grab;
}
.ph .t {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ph .iconbtn {
  width: 22px;
  height: 22px;
  color: inherit;
}
.st {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
}
.st.open {
  background: var(--ok);
}
.st.closed,
.st.error {
  background: var(--danger);
}
.tools {
  position: absolute;
  top: 6px;
  right: 14px;
  z-index: 3;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  opacity: 0;
  transition: opacity 0.15s;
}
.tp:hover .tools {
  opacity: 0.95;
}
.find {
  position: absolute;
  top: 6px;
  right: 14px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 4px 3px 10px;
  border-radius: 8px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}
.find input {
  width: 180px;
  border: 0;
  outline: 0;
  background: none;
  color: var(--text);
}
.loading {
  position: absolute;
  top: 10px;
  right: 16px;
}
.spin {
  display: block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.ghost {
  position: absolute;
  z-index: 2;
  overflow: hidden;
  white-space: pre;
  pointer-events: none;
  opacity: 0.38;
}
.ghost span {
  display: inline-block;
  text-align: center;
}
:deep(.xterm) {
  height: 100%;
}
:deep(.xterm-viewport) {
  background: transparent !important;
}
</style>
