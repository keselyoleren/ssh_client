<script setup>
import { store, closeTab, openLocal, confirm, terminalDrop } from '../lib/store'
import Icon from './Icon.vue'
import { installUpdate } from '../lib/updater'
import { computed, ref } from 'vue'
import { withHint } from '../lib/keymap'

// Tab dragging uses mouse events, not HTML5 drag & drop: Tauri keeps native drag & drop for
// dropping files from Finder (SFTP upload), and the webview then never sees HTML5 drag events.
//  - over the tab bar: drop reorders (a caret shows where); resting on another tab switches to it
//  - over a terminal: TerminalLayer previews and performs the split (see terminalDrop)
const drag = ref(null) // { id, title, x, y, insertAt, overBar }
const scroll = ref(null)
let hoverTimer = 0,
  hoverId = null,
  justDragged = false

function insertIndex(x) {
  const els = [...scroll.value.querySelectorAll('.tab[data-id]')]
  const i = els.findIndex((el) => {
    const r = el.getBoundingClientRect()
    return x < r.left + r.width / 2
  })
  return i < 0 ? els.length : i
}
function hoverTab(id) {
  if (id === hoverId) return
  hoverId = id
  clearTimeout(hoverTimer)
  if (id && id !== drag.value.id && id !== store.active) hoverTimer = setTimeout(() => (store.active = id), 500)
}
function tabDown(e, t) {
  if (e.button !== 0 || e.target.closest('.x')) return
  const sx = e.clientX,
    sy = e.clientY
  let started = false
  const move = (ev) => {
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
      started = true
      drag.value = { id: t.id, title: t.title, x: 0, y: 0, insertAt: -1, overBar: true }
      store.tabDrag = t.id
    }
    const d = drag.value
    d.x = ev.clientX
    d.y = ev.clientY
    const el = document.elementFromPoint(ev.clientX, ev.clientY)
    d.overBar = !!el?.closest('.tabs')
    if (d.overBar) {
      d.insertAt = insertIndex(ev.clientX)
      hoverTab(el.closest('.tab[data-id]')?.dataset.id || null)
      terminalDrop.api?.leave()
    } else {
      d.insertAt = -1
      hoverTab(null)
      if (t.kind === 'term') terminalDrop.api?.over(ev.clientX, ev.clientY, t)
    }
  }
  const finish = (commit) => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    window.removeEventListener('keydown', esc, true)
    clearTimeout(hoverTimer)
    hoverId = null
    if (!started) return
    const d = drag.value
    if (commit && d.overBar && d.insertAt >= 0) {
      const from = store.tabs.findIndex((x) => x.id === t.id)
      const to = d.insertAt > from ? d.insertAt - 1 : d.insertAt
      if (to !== from) store.tabs.splice(to, 0, store.tabs.splice(from, 1)[0])
    }
    if (commit && !d.overBar) terminalDrop.api?.drop()
    else terminalDrop.api?.leave()
    drag.value = null
    store.tabDrag = null
    justDragged = true // swallow the click that follows mouseup
    setTimeout(() => (justDragged = false))
  }
  const up = () => finish(true)
  const esc = (ev) => {
    if (ev.key !== 'Escape' || !started) return
    ev.preventDefault()
    ev.stopPropagation()
    finish(false)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
  window.addEventListener('keydown', esc, true)
}
function select(t) {
  if (!justDragged) store.active = t.id
}
/** Left edge (px, inside .scroll) of the insertion caret. */
const caretX = computed(() => {
  const d = drag.value
  if (!d?.overBar || d.insertAt < 0 || !scroll.value) return null
  const els = [...scroll.value.querySelectorAll('.tab[data-id]')]
  const base = scroll.value.getBoundingClientRect().left - scroll.value.scrollLeft
  if (!els.length) return null
  const r = d.insertAt < els.length ? els[d.insertAt].getBoundingClientRect() : els.at(-1).getBoundingClientRect()
  return (d.insertAt < els.length ? r.left - 4 : r.right + 2) - base
})

async function close(t) {
  if (
    t.kind === 'term' &&
    store.vault.settings.confirm_close &&
    t.target?.kind !== 'local' &&
    t.root.type === 'split'
  ) {
    if (!(await confirm('Close tab?', 'All panes in this tab will be disconnected.', { okText: 'Close' }))) return
  }
  closeTab(t.id)
}

const updateLabel = computed(() => {
  const u = store.update
  if (u.state === 'downloading') return u.progress == null ? 'Downloading…' : `Downloading ${u.progress}%`
  if (u.state === 'installing') return 'Installing…'
  if (u.state === 'restarting') return 'Restarting…'
  return 'Update K-Shell'
})
</script>

<template>
  <header class="tabs" :class="{ droptarget: store.paneToTabBar }" data-tauri-drag-region>
    <button class="tab vault" :class="{ on: store.active === 'vault' }" @click="store.active = 'vault'">
      <Icon name="grid" :size="14" /> Vault
    </button>
    <div ref="scroll" class="scroll" data-tauri-drag-region>
      <i v-if="caretX != null" class="caret" :style="{ left: caretX + 'px' }"></i>
      <div
        v-for="t in store.tabs"
        :key="t.id"
        class="tab"
        :class="{ on: store.active === t.id, lifted: drag?.id === t.id }"
        :data-id="t.id"
        :title="t.kind === 'term' ? 'Drag to reorder, or onto another terminal tab to split it' : 'Drag to reorder'"
        @mousedown="tabDown($event, t)"
        @click="select(t)"
        @mousedown.middle.prevent="close(t)"
      >
        <span
          class="dot"
          :style="{ background: t.color || (t.kind === 'sftp' ? 'var(--accent-2)' : 'var(--accent)') }"
        ></span>
        <Icon :name="t.kind === 'sftp' ? 'folder' : 'terminal'" :size="13" />
        <span class="title">{{ t.title }}</span>
        <button class="x" @click.stop="close(t)"><Icon name="x" :size="12" /></button>
      </div>
      <button class="iconbtn add" :title="withHint('New local terminal', 'new_local')" @click="openLocal()">
        <Icon name="plus" :size="15" />
      </button>
    </div>
    <button
      v-if="store.update.state !== 'idle'"
      class="update-btn"
      :disabled="store.update.state !== 'available'"
      :title="`K-Shell ${store.update.version} is available`"
      @click="installUpdate"
    >
      {{ updateLabel }}
    </button>
    <button class="iconbtn" :title="withHint('Quick connect', 'palette')" @click="store.palette = true">
      <Icon name="search" :size="15" />
    </button>
  </header>
  <Teleport to="body">
    <div v-if="drag" class="tabchip" :style="{ left: drag.x + 'px', top: drag.y + 'px' }">
      <Icon name="terminal" :size="12" /> {{ drag.title }}
    </div>
  </Teleport>
</template>

<style scoped>
.update-btn {
  flex: none;
  height: 28px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
}
.update-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}
.update-btn:disabled {
  cursor: progress;
  opacity: 0.85;
}
.tabs {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  background: var(--side);
  border-bottom: 1px solid var(--line);
}
.scroll {
  position: relative;
}
.caret {
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 2px;
  background: var(--accent);
  z-index: 3;
  pointer-events: none;
}
.tab.lifted {
  opacity: 0.45;
}
.tabchip {
  position: fixed;
  z-index: 100;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 7px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  pointer-events: none;
  white-space: nowrap;
}
.tabs.droptarget {
  box-shadow: inset 0 -2px 0 var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  height: 100%;
}
.scroll::-webkit-scrollbar {
  height: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 8px 0 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: none;
  color: var(--text-2);
  cursor: pointer;
  flex: none;
  max-width: 220px;
}
.tab:hover {
  background: var(--bg-3);
}
.tab.on {
  background: var(--bg-3);
  border-color: var(--line);
  color: var(--text);
}
.tab.vault {
  font-weight: 600;
  padding: 0 12px;
}
.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}
.x {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 0;
  background: none;
  color: var(--text-3);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
}
.tab:hover .x,
.tab.on .x {
  opacity: 1;
}
.x:hover {
  background: var(--bg-4);
  color: var(--text);
}
.add {
  flex: none;
}
</style>
