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
import { store, panes, splitFocused, closePane, openMenu, openSftp, loadVault } from '../lib/store'
import { themes } from '../lib/themes'
import Icon from './Icon.vue'

const props = defineProps({ leaf: Object, tab: Object, visible: Boolean, split: Boolean })
const el = ref(null)
const status = ref('connecting')
const message = ref('')
const searching = ref(false)
const query = ref('')
const searchInput = ref(null)
const target = props.leaf.target
const title = computed(() => (target.kind === 'local' ? 'Local' : target.host.label || target.host.host))
const focused = computed(() => props.tab.focus === props.leaf.id)

let term,
  fit,
  search,
  sid = null,
  ro,
  raf = 0,
  lastSize = ''
const S = () => store.vault.settings || {}
const theme = () => themes[S().term_theme] || themes.kshell

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
  if (!props.visible || !el.value?.offsetWidth) return
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

async function connect() {
  const id = uid()
  sid = id
  status.value = 'connecting'
  message.value = ''
  const ch = new Channel()
  ch.onmessage = (m) => {
    if (sid !== id) return
    const b = asBytes(m)
    if (b) return term.write(b)
    const ev = typeof m === 'string' ? JSON.parse(m) : m
    if (ev.type === 'exit') {
      status.value = 'closed'
      term.write(
        `\r\n\x1b[2m[session closed${ev.code != null ? ' · exit ' + ev.code : ''}] press Enter to reconnect\x1b[0m\r\n`,
      )
    }
  }
  try {
    doFit()
    if (target.kind === 'local') {
      await api.term_open_local({ id, cols: term.cols, rows: term.rows, shell: null, onData: ch })
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
    status.value = 'error'
    message.value = String(e)
    term.write(`\r\n\x1b[31m✖ ${String(e)}\x1b[0m\r\n\x1b[2mPress Enter to retry\x1b[0m\r\n`)
  }
}

const write = (data) => {
  if (sid && status.value === 'open') api.term_write({ id: sid, data }).catch(() => {})
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
              write(s.command + '\r')
              term.focus()
            },
          })),
        ]
      : []),
    '-',
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
    if (status.value === 'open') return write(d)
    if (d === '\r' && status.value !== 'connecting') {
      term.clear()
      connect()
    }
  })
  term.onSelectionChange(() => {
    if (S().copy_on_select && term.hasSelection()) copySel()
  })
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true
    const mac = store.platform.os === 'macos'
    const mod = mac ? e.metaKey : e.ctrlKey && e.shiftKey
    if (mod && e.key.toLowerCase() === 'c' && term.hasSelection()) {
      copySel()
      return false
    }
    if (mod && e.key.toLowerCase() === 'v') {
      paste()
      e.preventDefault()
      return false
    }
    if (mod && e.key.toLowerCase() === 'f') {
      openSearch()
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

  panes.set(props.leaf.id, { write, focus: () => term.focus(), term })
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
watch(focused, (f) => {
  if (f && props.visible) term?.focus()
})
watch(
  () => store.vault.settings,
  () => {
    if (!term) return
    Object.assign(term.options, options())
    scheduleFit()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  ro?.disconnect()
  cancelAnimationFrame(raf)
  panes.delete(props.leaf.id)
  if (sid) api.term_close({ id: sid }).catch(() => {})
  sid = null
  term?.dispose()
})
</script>

<template>
  <div class="tp" :class="{ focused: focused && split }" :style="{ background: theme().background }">
    <div v-if="split" class="ph" :style="{ color: theme().foreground }">
      <span class="st" :class="status"></span>
      <span class="t">{{ title }}</span>
      <button class="iconbtn" @click="splitFocused('row')" title="Split right">
        <Icon name="splitH" :size="13" />
      </button>
      <button class="iconbtn" @click="splitFocused('col')" title="Split down"><Icon name="splitV" :size="13" /></button>
      <button class="iconbtn" @click="closePane(tab, leaf.id)" title="Close pane"><Icon name="x" :size="13" /></button>
    </div>
    <div v-else class="tools">
      <button class="iconbtn" @click="openSearch" title="Find"><Icon name="search" :size="14" /></button>
      <button class="iconbtn" @click="(e) => menu(e)" title="Snippets & actions">
        <Icon name="code" :size="14" />
      </button>
      <button class="iconbtn" @click="splitHere('row')" title="Split right (⌘D)">
        <Icon name="splitH" :size="14" />
      </button>
      <button class="iconbtn" @click="splitHere('col')" title="Split down (⇧⌘D)">
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
:deep(.xterm) {
  height: 100%;
}
:deep(.xterm-viewport) {
  background: transparent !important;
}
</style>
