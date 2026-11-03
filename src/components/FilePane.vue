<script setup>
import { computed, ref } from 'vue'
import { api, fmtSize, fmtTime, fmtPerm } from '../lib/api'
import { store, openMenu, prompt, confirm, toast, err } from '../lib/store'
import { join, parent, crumbs } from '../lib/paths'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import Icon from './Icon.vue'

const props = defineProps({ side: Object, other: Object, name: String })
const emit = defineEmits(['transfer', 'pick', 'edit', 'dragstart'])
const s = props.side
const filter = ref('')
const editingPath = ref(false)
const pathInput = ref('')
const sortKey = ref('name')
const sortDir = ref(1)

const isLocal = computed(() => !s.host)
const remotes = computed(() => store.vault.hosts)
const rows = computed(() => {
  const f = filter.value.toLowerCase()
  let r = s.entries.filter((e) => (s.hidden || !e.name.startsWith('.')) && (!f || e.name.toLowerCase().includes(f)))
  const k = sortKey.value,
    d = sortDir.value
  r = [...r].sort(
    (a, b) =>
      b.is_dir - a.is_dir ||
      (k === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a[k] - b[k]) * d,
  )
  return r
})
const selected = computed(() => s.entries.filter((e) => s.sel.includes(e.path)))
const otherLabel = computed(() => (props.other.host ? props.other.host.label || props.other.host.host : 'Local'))

function startEditPath() {
  editingPath.value = true
  pathInput.value = s.path
}
function sortBy(k) {
  if (sortKey.value === k) sortDir.value *= -1
  else {
    sortKey.value = k
    sortDir.value = 1
  }
}

async function list(path = s.path) {
  if (!s.fsid) return
  s.loading = true
  s.error = ''
  try {
    s.entries = await api.fs_list({ id: s.fsid, path })
    s.path = path
    s.sel = []
  } catch (e) {
    s.error = String(e)
  }
  s.loading = false
}
defineExpose({ list })

function open(e) {
  if (e.is_dir) return list(e.path)
  emit('edit', s, e)
}
function click(ev, e) {
  if (ev.metaKey || ev.ctrlKey) s.sel = s.sel.includes(e.path) ? s.sel.filter((p) => p !== e.path) : [...s.sel, e.path]
  else if (ev.shiftKey && s.sel.length) {
    const idx = rows.value.findIndex((r) => r.path === s.sel[s.sel.length - 1])
    const j = rows.value.findIndex((r) => r.path === e.path)
    s.sel = rows.value.slice(Math.min(idx, j), Math.max(idx, j) + 1).map((r) => r.path)
  } else s.sel = [e.path]
}
function go(p) {
  editingPath.value = false
  list(p)
}
function up() {
  list(parent(s.path, s.sep))
}

async function mkdir() {
  const n = await prompt('New folder', { placeholder: 'folder name', okText: 'Create' })
  if (!n) return
  try {
    await api.fs_mkdir({ id: s.fsid, path: join(s.path, n, s.sep) })
    list()
  } catch (e) {
    err(e)
  }
}
async function newFile() {
  const n = await prompt('New file', { placeholder: 'file name', okText: 'Create' })
  if (!n) return
  try {
    await api.fs_write_text({ id: s.fsid, path: join(s.path, n, s.sep), content: '' })
    list()
  } catch (e) {
    err(e)
  }
}
async function rename(e) {
  const n = await prompt('Rename', { value: e.name, okText: 'Rename' })
  if (!n || n === e.name) return
  try {
    await api.fs_rename({ id: s.fsid, from: e.path, to: join(parent(e.path, s.sep), n, s.sep) })
    list()
  } catch (x) {
    err(x)
  }
}
async function remove(items) {
  if (!items.length) return
  const what = items.length === 1 ? `“${items[0].name}”` : `${items.length} items`
  if (!(await confirm(`Delete ${what}?`, items.some((i) => i.is_dir) ? 'Folders are deleted recursively.' : ''))) return
  try {
    for (const e of items) await api.fs_remove({ id: s.fsid, path: e.path, isDir: e.is_dir })
    toast(`Deleted ${what}`)
  } catch (x) {
    err(x)
  }
  list()
}
async function chmod(e) {
  const v = await prompt('Permissions (octal)', { value: e.perm != null ? e.perm.toString(8) : '644', okText: 'Apply' })
  if (!v) return
  try {
    await api.fs_chmod({ id: s.fsid, path: e.path, mode: parseInt(v, 8) })
    list()
  } catch (x) {
    err(x)
  }
}
async function share(e) {
  try {
    const url = await api.fs_presign({ id: s.fsid, path: e.path, expiry: 7 * 24 * 3600 })
    await writeText(url)
    toast('Pre-signed link (7 days) copied to clipboard')
  } catch (x) {
    err(x)
  }
}

function rowMenu(ev, e) {
  if (!s.sel.includes(e.path)) s.sel = [e.path]
  const items = selected.value
  const remote = !!s.host
  openMenu(ev, [
    { label: e.is_dir ? 'Open' : 'Edit', icon: e.is_dir ? 'folder' : 'edit', action: () => open(e) },
    {
      label: `${remote ? 'Download' : 'Upload'} to ${otherLabel.value}`,
      icon: remote ? 'download' : 'upload',
      action: () => emit('transfer', s, items),
    },
    '-',
    { label: 'Rename', icon: 'edit', action: () => rename(e) },
    ...(s.host?.protocol !== 's3' ? [{ label: 'Permissions…', icon: 'lock', action: () => chmod(e) }] : []),
    ...(s.host?.protocol === 's3' && !e.is_dir
      ? [{ label: 'Copy share link', icon: 'link', action: () => share(e) }]
      : []),
    { label: 'Copy path', icon: 'copy', action: () => writeText(e.path) },
    '-',
    {
      label: items.length > 1 ? `Delete ${items.length} items` : 'Delete',
      icon: 'trash',
      danger: true,
      action: () => remove(items),
    },
  ])
}
function bgMenu(ev) {
  openMenu(ev, [
    { label: 'New folder', icon: 'folder', action: mkdir },
    ...(s.host?.protocol !== 's3' ? [{ label: 'New file', icon: 'file', action: newFile }] : []),
    { label: 'Refresh', icon: 'refresh', action: () => list() },
    { label: s.hidden ? 'Hide hidden files' : 'Show hidden files', icon: 'eye', action: () => (s.hidden = !s.hidden) },
  ])
}
function key(ev) {
  if (ev.target.tagName === 'INPUT') return
  if (ev.key === 'Backspace' && (ev.metaKey || ev.ctrlKey)) return remove(selected.value)
  if (ev.key === 'Delete') return remove(selected.value)
  if (ev.key === 'Backspace') return up()
  if (ev.key === 'Enter' && selected.value.length === 1) return open(selected.value[0])
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'a') {
    ev.preventDefault()
    s.sel = rows.value.map((r) => r.path)
  }
  if (ev.key === 'F5' || ((ev.metaKey || ev.ctrlKey) && ev.key === 'r')) {
    ev.preventDefault()
    list()
  }
}
function rowDown(ev, e) {
  if (ev.button !== 0) return
  if (!s.sel.includes(e.path)) click(ev, e)
  emit('dragstart', ev, s)
}
</script>

<template>
  <div class="fp" :class="{ noperm: s.host?.protocol === 's3' }" :data-side="name" tabindex="0" @keydown="key">
    <div class="bar">
      <select class="select host" :value="s.host ? s.host.id : ''" @change="emit('pick', s, $event.target.value)">
        <option value="">💻 Local</option>
        <option v-for="h in remotes" :key="h.id" :value="h.id">
          {{ h.protocol === 's3' ? '☁️' : h.protocol === 'ssh' ? '🖥' : '📁' }} {{ h.label || h.host }}
        </option>
      </select>
      <button class="iconbtn" @click="up" title="Up"><Icon name="up" :size="15" /></button>
      <button class="iconbtn" @click="list()" title="Refresh"><Icon name="refresh" :size="15" /></button>
      <button class="iconbtn" @click="mkdir" title="New folder"><Icon name="plus" :size="15" /></button>
      <button class="iconbtn" :class="{ active: s.hidden }" @click="s.hidden = !s.hidden" title="Hidden files">
        <Icon name="eye" :size="15" />
      </button>
      <button
        class="btn sm"
        :disabled="!s.sel.length"
        @click="emit('transfer', s, selected)"
        :title="`Send selection to ${otherLabel}`"
      >
        <Icon :name="s.host ? 'download' : 'upload'" :size="13" /> {{ s.host ? 'Download' : 'Upload' }}
      </button>
    </div>
    <div class="path">
      <input
        v-if="editingPath"
        class="input mono"
        v-model="pathInput"
        @keydown.enter="go(pathInput)"
        @blur="editingPath = false"
        v-focus
      />
      <div v-else class="crumbs" @dblclick="startEditPath">
        <button v-for="c in crumbs(s.path, s.sep)" :key="c.path" @click="go(c.path)">{{ c.name }}</button>
      </div>
      <div class="search sm">
        <Icon name="search" :size="12" /><input class="input" v-model="filter" placeholder="Filter" />
      </div>
    </div>
    <div class="list" @contextmenu.self="bgMenu" @mousedown.self="s.sel = []">
      <div class="thead">
        <span class="c-name" @click="sortBy('name')">Name</span>
        <span class="c-size" @click="sortBy('size')">Size</span>
        <span class="c-time" @click="sortBy('mtime')">Modified</span>
        <span class="c-perm" v-if="s.host?.protocol !== 's3'">Perms</span>
      </div>
      <div v-if="s.connecting" class="empty"><span class="spin"></span> Connecting…</div>
      <div v-else-if="s.error" class="empty err">
        {{ s.error }}<button class="btn sm" @click="list()">Retry</button>
      </div>
      <div v-else-if="!rows.length && !s.loading" class="empty" @contextmenu="bgMenu">Empty folder</div>
      <div
        v-for="e in rows"
        :key="e.path"
        class="tr"
        :class="{ sel: s.sel.includes(e.path) }"
        @mousedown="rowDown($event, e)"
        @click="click($event, e)"
        @dblclick="open(e)"
        @contextmenu="rowMenu($event, e)"
      >
        <span class="c-name"
          ><Icon :name="e.is_dir ? 'folder' : 'file'" :size="15" :class="e.is_dir ? 'dir' : 'fi'" />
          <span class="n">{{ e.name }}</span
          ><span v-if="e.is_link" class="dim"> ↪</span></span
        >
        <span class="c-size">{{ e.is_dir ? '' : fmtSize(e.size) }}</span>
        <span class="c-time">{{ fmtTime(e.mtime) }}</span>
        <span class="c-perm mono" v-if="s.host?.protocol !== 's3'">{{ fmtPerm(e.perm) }}</span>
      </div>
      <div class="filler" @contextmenu="bgMenu" @mousedown="s.sel = []"></div>
    </div>
    <div class="foot dim">
      {{ s.entries.length }} items<span v-if="s.sel.length"> · {{ s.sel.length }} selected</span
      ><span v-if="s.loading"> · loading…</span>
    </div>
  </div>
</template>

<script>
export default { directives: { focus: { mounted: (el) => el.focus() } } }
</script>

<style scoped>
.fp {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--bg-2);
  outline: none;
}
.fp.drop {
  box-shadow: inset 0 0 0 2px var(--accent);
}
.bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 10px 6px;
}
.host {
  flex: 1;
  height: 30px;
  min-width: 0;
}
.path {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 10px 8px;
}
.path .input {
  height: 28px;
}
.crumbs {
  flex: 1;
  min-width: 0;
  display: flex;
  overflow-x: auto;
  height: 28px;
  align-items: center;
  border-radius: 7px;
  background: var(--bg);
  border: 1px solid var(--line);
  padding: 0 4px;
}
.crumbs::-webkit-scrollbar {
  height: 0;
}
.crumbs button {
  flex: none;
  border: 0;
  background: none;
  padding: 2px 5px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-2);
  font-size: 12px;
}
.crumbs button:not(:first-child)::before {
  content: '›';
  margin-right: 6px;
  color: var(--text-3);
}
.crumbs button:hover {
  color: var(--text);
}
.search.sm {
  flex: 0 0 130px;
}
.search.sm .icon {
  top: 8px;
  left: 8px;
}
.search.sm .input {
  height: 28px;
  padding-left: 26px;
}
.list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  font-size: 12.5px;
}
.thead,
.tr {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 80px 130px 82px;
  gap: 8px;
  padding: 0 12px;
  align-items: center;
}
.noperm .thead,
.noperm .tr {
  grid-template-columns: minmax(120px, 1fr) 80px 130px;
}
.thead {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 28px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--line);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.thead span {
  cursor: pointer;
}
.tr {
  height: 28px;
  cursor: default;
  border-radius: 0;
}
.tr:hover {
  background: var(--bg-3);
}
.tr.sel {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.c-name {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.c-name .n {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.c-size,
.c-time,
.c-perm {
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.c-size {
  text-align: right;
}
.dir {
  color: var(--accent-2);
}
.fi {
  color: var(--text-3);
}
.filler {
  flex: 1;
  min-height: 40px;
}
.foot {
  padding: 6px 12px;
  font-size: 11px;
  border-top: 1px solid var(--line);
}
.empty {
  padding: 40px 10px;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  flex-direction: row;
}
.empty.err {
  flex-direction: column;
  color: var(--danger);
  -webkit-user-select: text;
  user-select: text;
}
.spin {
  display: inline-block;
  width: 14px;
  height: 14px;
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
</style>
