<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { store, mergeTab, movePane, detachPane, treeWithout, treeInsert, placeOf, terminalDrop } from '../lib/store'
import TerminalPane from './TerminalPane.vue'
import Icon from './Icon.vue'

// Every pane of every terminal tab lives in this one flat list, keyed by pane id. Moving a
// pane (drag & drop, merging tabs, "move to new tab") therefore never remounts it, so its
// SSH or local session keeps running.
//
// Dragging works like Warp: grab a pane by its header (or a tab from the tab bar) and the
// layout re-flows live around an empty slot showing where it will land.

const box = ref(null)
const PH = '__drop' // id of the placeholder leaf in preview layouts

/** Split tree -> absolutely positioned rects (in %) and resize gutters. */
function layoutOf(root) {
  const rects = new Map(),
    gutters = []
  const walk = (n, r) => {
    if (n.type === 'leaf') return rects.set(n.id, r)
    const a = n.ratio
    if (n.dir === 'row') {
      walk(n.children[0], { x: r.x, y: r.y, w: r.w * a, h: r.h })
      walk(n.children[1], { x: r.x + r.w * a, y: r.y, w: r.w * (1 - a), h: r.h })
      gutters.push({
        n,
        r,
        style: { left: `calc(${r.x + r.w * a}% - 3px)`, top: r.y + '%', width: '6px', height: r.h + '%' },
      })
    } else {
      walk(n.children[0], { x: r.x, y: r.y, w: r.w, h: r.h * a })
      walk(n.children[1], { x: r.x, y: r.y + r.h * a, w: r.w, h: r.h * (1 - a) })
      gutters.push({
        n,
        r,
        style: { top: `calc(${r.y + r.h * a}% - 3px)`, left: r.x + '%', height: '6px', width: r.w + '%' },
      })
    }
  }
  if (root) walk(root, { x: 0, y: 0, w: 100, h: 100 })
  return { rects, gutters }
}

const termTabs = computed(() => store.tabs.filter((t) => t.kind === 'term'))
const activeTab = computed(() => termTabs.value.find((t) => t.id === store.active))

// ---------- drag state ----------
// drag: { kind: 'pane' | 'tab', tabId, leafId?, title, x, y, zone: { nodeId, side } | null }
const drag = ref(null)

/** Active tab's tree without the dragged pane: what hit-testing uses (stable while dragging). */
const base = computed(() => {
  const t = activeTab.value
  if (!t) return null
  const d = drag.value
  return d?.kind === 'pane' && d.tabId === t.id ? treeWithout(t.root, d.leafId) : t.root
})
/** Tree actually drawn: the base plus a placeholder where the dragged item would land. */
const shown = computed(() => {
  const d = drag.value
  if (!d || !base.value) return activeTab.value?.root
  if (d.zone && !store.paneToTabBar) return treeInsert(base.value, d.zone.nodeId, d.zone.side, { type: 'leaf', id: PH })
  return base.value
})
const baseLayout = computed(() => layoutOf(base.value))
const activeLayout = computed(() => layoutOf(shown.value))
const layouts = computed(() => new Map(termTabs.value.map((t) => [t.id, layoutOf(t.root)])))

const panes = computed(() =>
  termTabs.value.flatMap((tab) => {
    const own = layouts.value.get(tab.id)
    const isActive = tab.id === store.active
    const L = isActive ? activeLayout.value : own
    return [...own.rects.keys()].map((id) => {
      const leaf = findLeaf(tab.root, id)
      const r = L.rects.get(id) || own.rects.get(id)
      const hidden = !isActive || (drag.value?.kind === 'pane' && drag.value.leafId === id)
      return { tab, leaf, r, hidden, split: own.rects.size > 1 }
    })
  }),
)
const findLeaf = (n, id) =>
  n.id === id ? n : n.type === 'split' ? n.children.map((c) => findLeaf(c, id)).find(Boolean) : null
const placeholder = computed(() => (drag.value ? activeLayout.value.rects.get(PH) : null))

/** Pane under the pointer in the base layout, and the side nearest to it. */
function zoneAt(x, y) {
  const b = box.value.getBoundingClientRect()
  const px = ((x - b.left) / b.width) * 100
  const py = ((y - b.top) / b.height) * 100
  if (px < 0 || py < 0 || px > 100 || py > 100) return undefined // outside: keep the current zone
  // still over the empty slot: keep it (no flicker)
  const ph = placeholder.value
  if (ph && px >= ph.x && px <= ph.x + ph.w && py >= ph.y && py <= ph.y + ph.h) return undefined
  for (const [id, r] of baseLayout.value.rects) {
    if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue
    const fx = (px - r.x) / r.w
    const fy = (py - r.y) / r.h
    const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy }
    return { nodeId: id, side: Object.keys(d).reduce((a, k) => (d[k] < d[a] ? k : a)) }
  }
  return undefined
}
function setZone(x, y) {
  const z = zoneAt(x, y)
  if (z !== undefined) drag.value.zone = z
}

// ---------- pane drag (pointer events, from the pane header) ----------
function grabPane(e, tab, leaf, title) {
  if (e.button !== 0 || e.target.closest('button')) return
  const sx = e.clientX,
    sy = e.clientY
  let started = false
  const move = (ev) => {
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
      started = true
      store.layoutDrag = true
      drag.value = { kind: 'pane', tabId: tab.id, leafId: leaf.id, title, x: 0, y: 0, zone: placeOf(tab.root, leaf.id) }
    }
    drag.value.x = ev.clientX
    drag.value.y = ev.clientY
    store.paneToTabBar = !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tabs')
    if (!store.paneToTabBar) setZone(ev.clientX, ev.clientY)
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    window.removeEventListener('keydown', esc, true)
    if (!started) return
    const d = drag.value
    if (store.paneToTabBar) detachPane(tab, leaf.id)
    else if (d.zone) movePane(tab, leaf.id, d.zone.nodeId, d.zone.side)
    endDrag()
  }
  const esc = (ev) => {
    if (ev.key !== 'Escape' || !started) return
    ev.preventDefault()
    ev.stopPropagation()
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    window.removeEventListener('keydown', esc, true)
    endDrag()
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
  window.addEventListener('keydown', esc, true)
  e.preventDefault()
}
function endDrag() {
  drag.value = null
  store.layoutDrag = false
  store.paneToTabBar = false
}
onBeforeUnmount(endDrag)

// ---------- tab dragged from the tab bar (TabBar drives it with mouse events) ----------
function tabOver(x, y, tab) {
  const t = activeTab.value
  if (!t || t.id === tab.id) return tabLeave() // a tab can't be split into itself
  const b = box.value.getBoundingClientRect()
  if (x < b.left || x > b.right || y < b.top || y > b.bottom) return tabLeave()
  if (drag.value?.kind !== 'tab' || drag.value.tabId !== tab.id) {
    store.layoutDrag = true
    drag.value = { kind: 'tab', tabId: tab.id, title: tab.title, x, y, zone: null }
  }
  setZone(x, y)
}
function tabLeave() {
  if (drag.value?.kind === 'tab') endDrag()
}
function tabDrop() {
  const d = drag.value
  if (d?.kind === 'tab' && d.zone && activeTab.value) mergeTab(d.tabId, activeTab.value.id, d.zone.nodeId, d.zone.side)
  tabLeave()
}
terminalDrop.api = { over: tabOver, drop: tabDrop, leave: tabLeave }
onBeforeUnmount(() => (terminalDrop.api = null))

// ---------- resizing ----------
const resizing = ref(false)
function resize(e, g) {
  const rect = box.value.getBoundingClientRect()
  resizing.value = true
  const move = (ev) => {
    const pct =
      g.n.dir === 'row'
        ? (((ev.clientX - rect.left) / rect.width) * 100 - g.r.x) / g.r.w
        : (((ev.clientY - rect.top) / rect.height) * 100 - g.r.y) / g.r.h
    g.n.ratio = Math.min(0.9, Math.max(0.1, pct))
  }
  const up = () => {
    resizing.value = false
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

const pct = (r) => ({ left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%' })
</script>

<template>
  <div ref="box" class="tl" :class="{ resizing, dragging: drag }">
    <div v-for="p in panes" :key="p.leaf.id" v-show="!p.hidden" class="slot" :style="pct(p.r)">
      <TerminalPane
        :leaf="p.leaf"
        :tab="p.tab"
        :visible="p.tab.id === store.active"
        :split="p.split"
        @grab="(e, title) => grabPane(e, p.tab, p.leaf, title)"
      />
    </div>

    <!-- where the dragged pane / tab will land -->
    <div v-if="placeholder" class="slot drop" :style="pct(placeholder)"></div>

    <template v-if="activeTab && !drag">
      <div
        v-for="(g, i) in layouts.get(activeTab.id).gutters"
        :key="activeTab.id + i"
        class="gutter"
        :class="g.n.dir"
        :style="g.style"
        @mousedown.prevent="resize($event, g)"
      ></div>
    </template>
  </div>

  <!-- chip that follows the pointer while dragging a pane -->
  <Teleport to="body">
    <div
      v-if="drag?.kind === 'pane'"
      class="dragchip"
      :class="{ newtab: store.paneToTabBar }"
      :style="{ left: drag.x + 'px', top: drag.y + 'px' }"
    >
      <Icon :name="store.paneToTabBar ? 'popout' : 'terminal'" :size="12" />
      {{ store.paneToTabBar ? `Open ${drag.title} in a new tab` : drag.title }}
    </div>
  </Teleport>
</template>

<style scoped>
.tl {
  position: absolute;
  inset: 0;
  background: var(--term-bg, #141821);
}
.tl.resizing {
  cursor: col-resize;
  -webkit-user-select: none;
  user-select: none;
}
.tl.resizing .slot,
.tl.dragging .slot {
  pointer-events: none;
}
.tl.dragging {
  cursor: grabbing;
  -webkit-user-select: none;
  user-select: none;
}
.slot {
  position: absolute;
  overflow: hidden;
}
.tl.dragging .slot {
  transition:
    left 0.14s ease,
    top 0.14s ease,
    width 0.14s ease,
    height 0.14s ease;
}
.slot.drop {
  background: rgba(0, 0, 0, 0.28);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
}
.gutter {
  position: absolute;
  z-index: 5;
}
.gutter.row {
  cursor: col-resize;
}
.gutter.col {
  cursor: row-resize;
}
.gutter::after {
  content: '';
  position: absolute;
  background: var(--line);
}
.gutter.row::after {
  left: 2.5px;
  width: 1px;
  top: 0;
  bottom: 0;
}
.gutter.col::after {
  top: 2.5px;
  height: 1px;
  left: 0;
  right: 0;
}
.gutter:hover::after {
  background: var(--accent);
}
.dragchip {
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
.dragchip.newtab {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
