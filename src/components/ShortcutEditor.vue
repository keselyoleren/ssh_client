<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { store, toast, confirm } from '../lib/store'
import {
  ACTIONS,
  GROUPS,
  bindingsOf,
  defaultBindings,
  isCustom,
  setBinding,
  resetBinding,
  resetAllBindings,
  eventCombo,
  heldMods,
  keycaps,
  comboLabel,
  checkCombo,
  usersOf,
} from '../lib/keymap'
import Icon from './Icon.vue'

const mac = computed(() => store.platform.os === 'macos')
const q = ref('')
const filter = ref('all') // all | custom | conflict | unbound

// ---------- search & filters ----------

const ALIASES = {
  Meta: 'meta cmd command super win windows',
  Ctrl: 'ctrl control',
  Alt: 'alt option opt',
  Shift: 'shift',
}
function haystack(a) {
  const parts = [a.label, a.group]
  for (const c of bindingsOf(a)) {
    parts.push(comboLabel(c), c.replace(/\+/g, ' '))
    for (const m of c.split('+').slice(0, -1)) parts.push(ALIASES[m])
  }
  return parts.join(' ').toLowerCase()
}
const conflicted = (a) => bindingsOf(a).some((c) => usersOf(c, a.id).length)

const counts = computed(() => ({
  all: ACTIONS.length,
  custom: ACTIONS.filter(isCustom).length,
  conflict: ACTIONS.filter(conflicted).length,
  unbound: ACTIONS.filter((a) => !bindingsOf(a).length).length,
}))

const groups = computed(() => {
  const tokens = q.value
    .toLowerCase()
    .replace(/[+]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // typing "⌘" or "⇧" directly works too
    .map((t) => t.replace('⌘', 'cmd').replace('⇧', 'shift').replace('⌥', 'alt').replace('⌃', 'ctrl'))
  const keep = (a) => {
    if (filter.value === 'custom' && !isCustom(a)) return false
    if (filter.value === 'conflict' && !conflicted(a)) return false
    if (filter.value === 'unbound' && bindingsOf(a).length) return false
    const hay = haystack(a)
    return tokens.every((t) => hay.includes(t))
  }
  return GROUPS.map((g) => ({ name: g, items: ACTIONS.filter((a) => a.group === g && keep(a)) })).filter(
    (g) => g.items.length,
  )
})

// ---------- recording ----------

const rec = ref(null) // { id, held: [], error, warn, combo, conflicts }
const recBox = ref(null)

function start(a) {
  stop()
  rec.value = { id: a.id, held: [], error: '', warn: '', combo: '', conflicts: [] }
  store.recordingKeys = true
  window.addEventListener('keydown', onRecKey, true)
  window.addEventListener('keyup', onRecKeyUp, true)
  nextTick(() => recBox.value?.[0]?.focus())
}
function stop() {
  rec.value = null
  store.recordingKeys = false
  window.removeEventListener('keydown', onRecKey, true)
  window.removeEventListener('keyup', onRecKeyUp, true)
}
onBeforeUnmount(stop)

function onRecKeyUp(e) {
  if (rec.value && !rec.value.combo) rec.value.held = heldMods(e)
}
function onRecKey(e) {
  const r = rec.value
  if (!r) return
  e.preventDefault()
  e.stopPropagation()
  const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
  if (plain && e.key === 'Escape') return stop()
  if (plain && e.key === 'Enter' && r.combo) return apply()
  if (plain && (e.key === 'Backspace' || e.key === 'Delete')) return clear(action(r.id))
  const combo = eventCombo(e)
  if (!combo) {
    r.held = heldMods(e)
    return
  }
  const { error, warn } = checkCombo(combo)
  r.held = []
  if (error) {
    Object.assign(r, { error, warn: '', combo: '', conflicts: [] })
    return
  }
  const conflicts = usersOf(combo, r.id)
  Object.assign(r, { error: '', warn: warn || '', combo, conflicts })
  if (!warn && !conflicts.length) apply()
}

const action = (id) => ACTIONS.find((a) => a.id === id)

function apply() {
  const r = rec.value
  if (!r?.combo) return
  for (const other of r.conflicts) {
    const rest = bindingsOf(other).filter((c) => c !== r.combo)
    setBinding(other.id, rest[0] || '')
  }
  setBinding(r.id, r.combo)
  const msg = r.conflicts.length ? ` — removed from “${r.conflicts.map((c) => c.label).join('”, “')}”` : ''
  toast(`${action(r.id).label}: ${comboLabel(r.combo)}${msg}`)
  flash(r.id)
  stop()
}

function clear(a) {
  setBinding(a.id, '')
  stop()
  flash(a.id)
}
function reset(a) {
  resetBinding(a.id)
  flash(a.id)
}
async function resetAll() {
  if (!(await confirm('Reset all shortcuts?', 'Every shortcut goes back to its default.', { okText: 'Reset all' })))
    return
  resetAllBindings()
  toast('Shortcuts reset to defaults')
}

const flashed = ref('')
let ft = 0
function flash(id) {
  flashed.value = id
  clearTimeout(ft)
  ft = setTimeout(() => (flashed.value = ''), 900)
}

const defaultText = (a) => defaultBindings(a).map(comboLabel).join(' or ') || 'none'
</script>

<template>
  <div class="sc">
    <div class="sc-head">
      <div class="search">
        <Icon name="search" :size="14" />
        <input
          class="input"
          v-model="q"
          :placeholder="
            mac
              ? 'Search by name or keys (e.g. “split”, “cmd d”)'
              : 'Search by name or keys (e.g. “split”, “ctrl shift d”)'
          "
        />
      </div>
      <button class="btn" :disabled="!counts.custom" @click="resetAll">
        <Icon name="refresh" :size="13" /> Reset all
      </button>
    </div>

    <div class="filters">
      <button
        v-for="[k, l] in [
          ['all', 'All'],
          ['custom', 'Customized'],
          ['conflict', 'Conflicts'],
          ['unbound', 'No shortcut'],
        ]"
        :key="k"
        class="chip"
        :class="{ on: filter === k, warnchip: k === 'conflict' && counts.conflict }"
        @click="filter = k"
      >
        {{ l }} <span class="n">{{ counts[k] }}</span>
      </button>
    </div>

    <p class="dim tip">
      Click a shortcut to record a new one. <kbd>Esc</kbd> cancels, <kbd>{{ mac ? '⌫' : 'Backspace' }}</kbd> removes it.
    </p>

    <div v-for="g in groups" :key="g.name" class="group">
      <div class="gname">{{ g.name }}</div>
      <div class="card">
        <div
          v-for="a in g.items"
          :key="a.id"
          class="srow"
          :class="{ recording: rec?.id === a.id, flash: flashed === a.id }"
        >
          <div class="name">
            <span>{{ a.label }}</span>
            <span v-if="isCustom(a)" class="tag" :title="`Default: ${defaultText(a)}`">Customized</span>
            <span v-if="conflicted(a)" class="tag warn" title="Another action uses the same keys">Conflict</span>
            <span v-if="a.scope === 'terminal'" class="dim scope">in terminal</span>
          </div>

          <div class="keys">
            <template v-if="rec?.id === a.id">
              <button ref="recBox" class="recbox" @blur="stop">
                <template v-if="rec.combo">
                  <kbd v-for="(k, i) in keycaps(rec.combo)" :key="i" class="on">{{ k }}</kbd>
                </template>
                <template v-else-if="rec.held.length">
                  <kbd v-for="(k, i) in keycaps(rec.held.join('+') + '+…').slice(0, -1)" :key="i">{{ k }}</kbd>
                  <span class="dim">…</span>
                </template>
                <span v-else class="dim">Press new shortcut…</span>
              </button>
            </template>
            <button v-else class="combo" :title="'Change shortcut'" @click="start(a)">
              <template v-if="bindingsOf(a).length">
                <template v-for="(c, ci) in bindingsOf(a)" :key="c">
                  <span v-if="ci" class="or">or</span>
                  <span class="caps">
                    <kbd v-for="(k, i) in keycaps(c)" :key="i" :class="{ on: isCustom(a) }">{{ k }}</kbd>
                  </span>
                </template>
              </template>
              <span v-else class="dim add"><Icon name="plus" :size="12" /> Add shortcut</span>
            </button>

            <div class="acts">
              <button
                v-if="isCustom(a)"
                class="iconbtn"
                :title="`Reset to default (${defaultText(a)})`"
                @click="reset(a)"
              >
                <Icon name="refresh" :size="13" />
              </button>
              <button
                v-if="bindingsOf(a).length && rec?.id !== a.id"
                class="iconbtn"
                title="Remove shortcut"
                @click="clear(a)"
              >
                <Icon name="x" :size="13" />
              </button>
            </div>
          </div>

          <div
            v-if="rec?.id === a.id && (rec.error || rec.warn || rec.conflicts.length)"
            class="note"
            @mousedown.prevent
          >
            <span v-if="rec.error" class="err"><Icon name="info" :size="13" /> {{ rec.error }}</span>
            <template v-else>
              <span v-if="rec.conflicts.length" class="wrn">
                <Icon name="info" :size="13" />
                {{ comboLabel(rec.combo) }} is already used by
                <b>{{ rec.conflicts.map((c) => c.label).join(', ') }}</b>
              </span>
              <span v-else class="wrn"><Icon name="info" :size="13" /> {{ rec.warn }}</span>
              <span class="row" style="gap: 6px; margin-left: auto">
                <button class="btn sm" @click="stop">Cancel</button>
                <button class="btn sm primary" @click="apply">
                  {{ rec.conflicts.length ? 'Replace' : 'Use anyway' }}
                </button>
              </span>
            </template>
          </div>
        </div>
      </div>
    </div>
    <div v-if="!groups.length" class="empty">
      <div class="big">No matching shortcuts</div>
      <button class="btn sm" @click="((q = ''), (filter = 'all'))">Clear search</button>
    </div>
  </div>
</template>

<style scoped>
.sc-head {
  display: flex;
  gap: 8px;
  align-items: center;
}
.sc-head .search {
  flex: 1;
}
.filters {
  display: flex;
  gap: 6px;
  margin: 10px 0 4px;
  flex-wrap: wrap;
}
.filters .chip {
  border: 0;
  cursor: pointer;
  height: 26px;
  padding: 0 10px;
  gap: 6px;
}
.chip .n {
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
.chip.warnchip:not(.on) {
  color: var(--warn);
}
.tip {
  font-size: 12px;
  margin: 8px 0 0;
}
.tip kbd {
  padding: 0 5px;
  font-size: 11px;
}
.group {
  margin-top: 14px;
}
.gname {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
  margin: 0 0 6px 2px;
}
.srow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-height: 42px;
  padding: 6px 8px 6px 14px;
  border-bottom: 1px solid var(--line);
  transition: background 0.3s;
}
.srow:last-child {
  border-bottom: 0;
}
.srow:hover {
  background: var(--bg-3);
}
.srow.recording {
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}
.srow.flash {
  background: color-mix(in srgb, var(--ok) 14%, transparent);
}
.name {
  flex: 1;
  min-width: 180px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tag {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 99px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.tag.warn {
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 14%, transparent);
}
.scope {
  font-size: 11px;
}
.keys {
  display: flex;
  align-items: center;
  gap: 2px;
}
.combo,
.recbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 2px 6px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
}
.combo:hover {
  border-color: var(--line);
  background: var(--bg-2);
}
.recbox {
  min-width: 170px;
  justify-content: center;
  border: 1px dashed var(--accent);
  background: var(--bg);
  outline: none;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  }
}
.caps {
  display: inline-flex;
  gap: 3px;
}
.or {
  font-size: 11px;
  color: var(--text-3);
}
kbd {
  min-width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  padding: 0 6px;
  font-family: inherit;
  font-size: 12px;
  border-radius: 5px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  color: var(--text-2);
}
kbd.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-2));
}
.add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.acts {
  display: flex;
  width: 56px;
  justify-content: flex-end;
  opacity: 0;
  transition: opacity 0.12s;
}
.srow:hover .acts {
  opacity: 1;
}
.note {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  padding: 2px 0 4px;
}
.note > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.err {
  color: var(--danger);
}
.wrn {
  color: var(--warn);
}
</style>
