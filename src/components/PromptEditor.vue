<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { store, toast } from '../lib/store'
import { termTheme } from '../lib/appearance'
import { SEGMENTS, DEFAULT_PROMPT, promptRcSnippet } from '../lib/prompt'
import Icon from './Icon.vue'

const emit = defineEmits(['close'])
const initial = [...(store.vault.settings.prompt_segments || DEFAULT_PROMPT)]
const draft = ref([...initial])
const changed = computed(() => draft.value.join() !== initial.join())

const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const th = computed(() => termTheme())
const colorOf = (id) => th.value[ANSI[SEGMENTS[id]?.color ?? 7]]

// segments not used yet (line breaks can be used any number of times)
const available = computed(() => Object.keys(SEGMENTS).filter((id) => SEGMENTS[id].multi || !draft.value.includes(id)))

// preview lines: [[id, …], …] split on line breaks
const lines = computed(() => {
  const out = [[]]
  for (const id of draft.value) id === 'newline' ? out.push([]) : out.at(-1).push(id)
  return out
})

function add(id, at = draft.value.length) {
  draft.value.splice(at, 0, id)
}
function remove(i) {
  draft.value.splice(i, 1)
}
function move(i, d) {
  const j = i + d
  if (j < 0 || j >= draft.value.length) return
  const [x] = draft.value.splice(i, 1)
  draft.value.splice(j, 0, x)
}

// ---------- drag & drop ----------
// Mouse events, not HTML5 drag & drop: Tauri keeps native drag & drop for file drops, so the
// webview never receives HTML5 drag events.
const drag = ref(null) // { from: 'palette' | 'zone', id, index, x, y, where: 'zone' | 'palette' | null }
const over = ref(-1) // insertion index in the zone
const zoneEl = ref(null)
const paletteEl = ref(null)
let justDragged = false

/** Insertion index for a pointer position: before the first chip on the pointer's row whose middle is right of it. */
function indexAt(x, y) {
  const chips = [...(zoneEl.value?.querySelectorAll('.seg.placed') || [])]
  for (let i = 0; i < chips.length; i++) {
    const r = chips[i].getBoundingClientRect()
    if (y < r.top - 4) return i // pointer is on an earlier row
    if (y <= r.bottom + 4 && x < r.left + r.width / 2) return i
  }
  return chips.length
}
const inside = (el, x, y) => {
  const r = el?.getBoundingClientRect()
  return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}
function grab(e, from, id, index = -1) {
  if (e.button !== 0 || e.target.closest('.x')) return
  const sx = e.clientX,
    sy = e.clientY
  let started = false
  const move = (ev) => {
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return
      started = true
      drag.value = { from, id, index, x: 0, y: 0, where: null }
    }
    const d = drag.value
    d.x = ev.clientX
    d.y = ev.clientY
    d.where = inside(zoneEl.value, d.x, d.y) ? 'zone' : inside(paletteEl.value, d.x, d.y) ? 'palette' : null
    over.value = d.where === 'zone' ? indexAt(d.x, d.y) : -1
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    if (!started) return
    const d = drag.value
    if (d.where === 'zone') {
      let at = over.value
      if (d.from === 'zone') {
        draft.value.splice(d.index, 1)
        if (d.index < at) at--
      }
      add(d.id, at)
    } else if (d.where === 'palette' && d.from === 'zone') remove(d.index)
    drag.value = null
    over.value = -1
    justDragged = true // the click after a drag must not also add the chip
    setTimeout(() => (justDragged = false))
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
  e.preventDefault()
}
function clickAdd(id) {
  if (!justDragged) add(id)
}
function chipKey(e, i) {
  if (e.key === 'Backspace' || e.key === 'Delete') remove(i)
  else if (e.altKey && e.key === 'ArrowLeft') move(i, -1)
  else if (e.altKey && e.key === 'ArrowRight') move(i, 1)
  else return
  e.preventDefault()
}

function save() {
  store.vault.settings.prompt_segments = [...draft.value]
  emit('close')
}
async function copyRc() {
  try {
    await writeText(promptRcSnippet(draft.value))
    toast('Copied — paste it at the end of ~/.bashrc or ~/.zshrc')
  } catch (e) {
    toast(String(e), 'error')
  }
}
const esc = (e) => e.key === 'Escape' && !drag.value && emit('close')
onMounted(() => window.addEventListener('keydown', esc))
onBeforeUnmount(() => window.removeEventListener('keydown', esc))
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <div class="modal pe">
      <h2>Edit prompt</h2>

      <div class="builder" :style="{ background: th.background, color: th.foreground }">
        <div class="bhead">
          <b>K-Shell prompt</b>
          <button class="link" :disabled="draft.join() === DEFAULT_PROMPT.join()" @click="draft = [...DEFAULT_PROMPT]">
            Restore default
          </button>
        </div>

        <div ref="paletteEl" class="palette" :class="{ target: drag?.from === 'zone' && drag.where === 'palette' }">
          <button
            v-for="id in available"
            :key="id"
            class="seg"
            :title="`${SEGMENTS[id].label}${SEGMENTS[id].hint ? ' — ' + SEGMENTS[id].hint : ''} · click or drag to add`"
            :style="{ color: id === 'newline' ? th.foreground : colorOf(id) }"
            @mousedown="grab($event, 'palette', id)"
            @click="clickAdd(id)"
          >
            <Icon :name="SEGMENTS[id].icon" :size="12" />
            {{ id === 'newline' ? 'Line break' : SEGMENTS[id].sample }}
          </button>
        </div>

        <div class="zone" :class="{ active: drag?.where === 'zone' }" ref="zoneEl">
          <template v-for="(id, i) in draft" :key="i + id">
            <span
              class="seg placed"
              :class="{
                nl: id === 'newline',
                dragging: drag?.from === 'zone' && drag.index === i,
                'ins-before': over === i,
                'ins-after': i === draft.length - 1 && over === draft.length,
              }"
              tabindex="0"
              :title="`${SEGMENTS[id]?.label} · drag to reorder, ⌫ to remove`"
              :style="{ color: id === 'newline' ? th.foreground : colorOf(id) }"
              @mousedown="grab($event, 'zone', id, i)"
              @keydown="chipKey($event, i)"
            >
              <Icon :name="SEGMENTS[id]?.icon" :size="12" />
              {{ id === 'newline' ? 'Line break' : SEGMENTS[id]?.sample }}
              <button class="x" title="Remove" @click="remove(i)"><Icon name="x" :size="11" /></button>
            </span>
          </template>

          <span v-if="!draft.length" class="placeholder">Click or drag segments here</span>
        </div>
      </div>

      <Teleport to="body">
        <div
          v-if="drag"
          class="seg floating"
          :style="{
            left: drag.x + 'px',
            top: drag.y + 'px',
            color: drag.id === 'newline' ? th.foreground : colorOf(drag.id),
            background: th.background,
          }"
        >
          <Icon :name="SEGMENTS[drag.id].icon" :size="12" />
          {{ drag.id === 'newline' ? 'Line break' : SEGMENTS[drag.id].sample }}
        </div>
      </Teleport>

      <div class="previewbox">
        <div class="ptitle">
          <b>Preview</b>
          <button class="link" @click="copyRc"><Icon name="copy" :size="12" /> Copy for .bashrc / .zshrc</button>
        </div>
        <div class="term mono" :style="{ background: th.background, color: th.foreground }">
          <div v-for="(line, li) in lines" :key="li">
            <template v-for="(id, k) in line" :key="k">
              <span :style="{ color: colorOf(id) }">{{ SEGMENTS[id].sample }}</span
              >{{ ' ' }}
            </template>
            <i v-if="li === lines.length - 1" class="cur" :style="{ background: th.cursor }"></i>
          </div>
        </div>
        <p class="dim note">
          Segments that don't apply (no git repo, no virtualenv, last command succeeded…) are hidden automatically.
        </p>
      </div>

      <div class="modal-foot">
        <button class="btn" style="flex: 1; justify-content: center" @click="emit('close')">Cancel</button>
        <button
          class="btn primary"
          style="flex: 1; justify-content: center"
          :disabled="!changed || !draft.length"
          @click="save"
        >
          Save changes
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pe {
  width: min(680px, calc(100vw - 40px));
}
.builder {
  border-radius: 12px;
  border: 1px solid var(--accent);
  padding: 14px 16px 16px;
}
.bhead,
.ptitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.85;
}
.link:hover:not(:disabled) {
  opacity: 1;
  text-decoration: underline;
}
.link:disabled {
  opacity: 0.35;
  cursor: default;
}
.palette,
.zone {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.palette {
  min-height: 30px;
  margin-bottom: 12px;
}
.zone {
  min-height: 52px;
  padding: 10px;
  border-radius: 9px;
  border: 1.5px dashed rgba(127, 127, 127, 0.45);
  transition: border-color 0.12s;
}
.zone.active {
  border-color: var(--accent);
}
.seg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.28);
  background: rgba(127, 127, 127, 0.12);
  font:
    600 12px ui-monospace,
    'JetBrains Mono',
    Menlo,
    Consolas,
    monospace;
  cursor: grab;
  white-space: nowrap;
}
.seg:hover {
  border-color: rgba(127, 127, 127, 0.6);
}
.seg.placed {
  padding-right: 3px;
  outline: none;
}
.seg.placed:focus-visible {
  box-shadow: 0 0 0 2px var(--accent);
}
.seg.nl {
  flex-basis: auto;
  opacity: 0.75;
}
.seg.floating {
  position: fixed;
  z-index: 200;
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: var(--shadow);
}
.palette.target {
  outline: 1.5px dashed #f87171;
  outline-offset: 4px;
  border-radius: 6px;
}
.seg.dragging {
  opacity: 0.35;
}
.x {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: #f87171;
  cursor: pointer;
}
.x:hover {
  background: rgba(248, 113, 113, 0.18);
}
/* insertion marker drawn as a shadow so the layout never shifts under the pointer */
.seg.ins-before {
  box-shadow: -5px 0 0 -2px var(--accent);
}
.seg.ins-after {
  box-shadow: 5px 0 0 -2px var(--accent);
}
.placeholder {
  font-size: 12px;
  opacity: 0.55;
}
.previewbox {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--bg-3);
}
.term {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
.cur {
  display: inline-block;
  width: 0.6em;
  height: 1.1em;
  vertical-align: -0.2em;
}
.note {
  margin: 8px 0 0;
  font-size: 12px;
}
</style>
