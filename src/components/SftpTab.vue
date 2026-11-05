<script setup>
import { onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { api, Channel, uid, fmtSize } from '../lib/api'
import { store, err, toast } from '../lib/store'
import FilePane from './FilePane.vue'
import TextEditor from './TextEditor.vue'
import ImageViewer from './ImageViewer.vue'
import { fileKind, runsWhenOpened } from '../lib/filetypes'
import Icon from './Icon.vue'

const props = defineProps({ tab: Object })
const mk = (host) =>
  reactive({
    host,
    fsid: null,
    path: '',
    sep: '/',
    entries: [],
    sel: [],
    loading: false,
    connecting: false,
    error: '',
    hidden: false,
  })
const left = mk(null)
const right = mk(props.tab.host || null)
const refs = { left: ref(null), right: ref(null) }
const transfers = reactive([])
const editing = ref(null)
const ghost = reactive({ on: false, x: 0, y: 0, text: '', over: '' })

async function connect(side) {
  if (side.fsid) api.fs_close({ id: side.fsid })
  side.fsid = null
  side.entries = []
  side.error = ''
  side.connecting = true
  try {
    const r = await api.fs_open({ host: side.host })
    side.fsid = r.id
    side.sep = r.sep
    side.connecting = false
    // first connect of a tab opened from a terminal: start in the shell's folder
    const start = props.tab.paths?.[side === left ? 'left' : 'right']
    if (start) delete props.tab.paths[side === left ? 'left' : 'right']
    await paneOf(side).value.list(start || r.home)
    if (start && side.error) await paneOf(side).value.list(r.home) // folder gone: fall back to home
  } catch (e) {
    side.connecting = false
    side.error = String(e)
  }
}
const paneOf = (side) => (side === left ? refs.left : refs.right)
const otherOf = (side) => (side === left ? right : left)

function pick(side, hostId) {
  side.host = hostId ? { ...store.vault.hosts.find((h) => h.id === hostId) } : null
  if (side === right && !props.tab.renamed) props.tab.title = side.host ? side.host.label || side.host.host : 'Local'
  connect(side)
}

// ---------- transfers ----------
let running = 0
const queue = []
function enqueue(from, items, to, dstDir = to.path) {
  if (!from.fsid || !to.fsid) return toast('Both panes must be connected', 'error')
  for (const e of items) {
    const t = reactive({
      tid: uid(),
      name: e.name,
      total: e.size || 0,
      done: 0,
      state: 'queued',
      error: '',
      from,
      to,
      e,
      dstDir,
      started: 0,
    })
    transfers.unshift(t)
    queue.push(t)
  }
  pump()
}
function pump() {
  while (running < 3 && queue.length) run(queue.shift())
}
async function run(t) {
  running++
  t.state = 'running'
  t.started = performance.now()
  const ch = new Channel()
  ch.onmessage = (p) => {
    t.total = p.total
    t.done = p.done
    if (p.file) t.file = p.file
  }
  try {
    await api.transfer({
      tid: t.tid,
      src: t.from.fsid,
      srcPath: t.e.path,
      isDir: t.e.is_dir,
      size: t.e.size || 0,
      dst: t.to.fsid,
      dstDir: t.dstDir,
      onProgress: ch,
    })
    t.state = 'done'
    t.done = t.total
    if (t.to.path === t.dstDir) paneOf(t.to).value?.list()
  } catch (e) {
    t.state = String(e) === 'cancelled' ? 'cancelled' : 'error'
    t.error = String(e)
  }
  running--
  pump()
}
const cancel = (t) =>
  t.state === 'queued'
    ? (queue.splice(queue.indexOf(t), 1), (t.state = 'cancelled'))
    : api.transfer_cancel({ tid: t.tid })
const clearDone = () =>
  transfers.splice(0, transfers.length, ...transfers.filter((t) => t.state === 'running' || t.state === 'queued'))
const speed = (t) => {
  const s = (performance.now() - t.started) / 1000
  return s > 0.5 ? fmtSize(t.done / s) + '/s' : ''
}
const pct = (t) => (t.total ? Math.min(100, (t.done / t.total) * 100) : t.state === 'done' ? 100 : 0)

// ---------- pointer drag between panes ----------
function dragstart(ev, side) {
  const sx = ev.clientX,
    sy = ev.clientY
  let started = false
  const move = (e) => {
    if (!started && Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return
    if (!started) {
      started = true
      ghost.on = true
      ghost.text = side.sel.length > 1 ? `${side.sel.length} items` : side.sel[0]?.split(/[\\/]/).pop()
    }
    ghost.x = e.clientX
    ghost.y = e.clientY
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-side]')
    ghost.over = el?.dataset.side || ''
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    if (started) {
      const target = ghost.over === 'left' ? left : ghost.over === 'right' ? right : null
      if (target && target !== side)
        enqueue(
          side,
          side.entries.filter((e) => side.sel.includes(e.path)),
          target,
        )
    }
    ghost.on = false
    ghost.over = ''
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// ---------- files dropped from the OS ----------
let unlisten = null,
  localFs = null
onMounted(async () => {
  connect(left)
  connect(right)
  unlisten = await getCurrentWebview().onDragDropEvent(async (ev) => {
    if (store.active !== props.tab.id) return
    const p = ev.payload
    if (p.type === 'over' || p.type === 'enter') {
      const r = window.devicePixelRatio || 1
      const el = document.elementFromPoint(p.position.x / r, p.position.y / r)?.closest('[data-side]')
      ghost.over = el?.dataset.side || ''
    } else if (p.type === 'drop') {
      const side = ghost.over === 'left' ? left : ghost.over === 'right' ? right : null
      ghost.over = ''
      if (!side || !side.host) return side && toast('Drop files onto a remote pane to upload', 'error')
      try {
        if (!localFs) localFs = (await api.fs_open({ host: null })).id
        const items = []
        for (const path of p.paths) {
          const st = await api.local_stat({ path })
          items.push({ path, name: path.split(/[\\/]/).pop(), is_dir: st.is_dir, size: st.size })
        }
        enqueue({ fsid: localFs, host: null, path: '' }, items, side)
      } catch (e) {
        err(e)
      }
    } else ghost.over = ''
  })
})
onBeforeUnmount(() => {
  unlisten?.()
  for (const s of [left, right]) if (s.fsid) api.fs_close({ id: s.fsid })
  if (localFs) api.fs_close({ id: localFs })
})

function closeEditor() {
  const side = editing.value?.side
  editing.value = null
  if (side) paneOf(side).value?.list()
}
/** Open a file: mode 'text' | 'image' | 'external', or by its type when not given. */
function edit(side, e, mode) {
  mode ||= { image: 'image', binary: 'external' }[fileKind(e.name)] || 'text'
  if (mode === 'external') return openExternal(side, e)
  if (mode === 'image') return (viewing.value = { side, entry: e })
  if (e.size > 8 * 1024 * 1024) return toast('File too large to edit — transfer it instead', 'error')
  editing.value = { side, entry: e }
}
const viewing = ref(null) // image preview
/** Hand the file to the app the OS associates with it (remote files: a downloaded copy). */
async function openExternal(side, e) {
  viewing.value = null
  if (runsWhenOpened(e.name))
    return toast(`K-Shell doesn't open ${e.name}: opening it would run or install it. Download it instead.`, 'error')
  const remote = !!side.host
  if (remote) toast(`Downloading ${e.name}…`)
  try {
    await api.fs_open_external({ id: side.fsid, path: e.path })
    if (remote) toast(`Opened a downloaded copy of ${e.name}: changes stay on this computer`)
  } catch (x) {
    err(x)
  }
}
/** The editor found binary content: offer the default app instead. */
function notText(side, e) {
  editing.value = null
  openExternal(side, e)
}
</script>

<template>
  <div class="sftp">
    <div class="panes">
      <FilePane
        :ref="refs.left"
        name="left"
        :side="left"
        :other="right"
        :class="{ drop: ghost.over === 'left' }"
        @pick="pick"
        @transfer="(s, items) => enqueue(s, items, otherOf(s))"
        @edit="edit"
        @dragstart="dragstart"
      />
      <div class="split"></div>
      <FilePane
        :ref="refs.right"
        name="right"
        :side="right"
        :other="left"
        :class="{ drop: ghost.over === 'right' }"
        @pick="pick"
        @transfer="(s, items) => enqueue(s, items, otherOf(s))"
        @edit="edit"
        @dragstart="dragstart"
      />
    </div>
    <div v-if="transfers.length" class="xfers">
      <div class="xh">
        <b>Transfers</b>
        <span class="dim">{{ transfers.filter((t) => t.state === 'running').length }} active</span>
        <div style="flex: 1"></div>
        <button class="btn sm ghost" @click="clearDone">Clear finished</button>
      </div>
      <div class="xl">
        <div v-for="t in transfers" :key="t.tid" class="xr">
          <Icon :name="t.to.host ? 'upload' : 'download'" :size="14" :class="t.state" />
          <div class="xn">
            <div class="row" style="gap: 6px">
              <span class="nm">{{ t.name }}</span>
              <span class="dim" v-if="t.state === 'running' && t.file && t.file !== t.name">· {{ t.file }}</span>
              <div style="flex: 1"></div>
              <span class="dim mono"
                >{{ fmtSize(t.done) }}{{ t.total ? ' / ' + fmtSize(t.total) : '' }}
                {{ t.state === 'running' ? speed(t) : '' }}</span
              >
            </div>
            <div class="bar"><div :class="t.state" :style="{ width: pct(t) + '%' }"></div></div>
            <div v-if="t.error && t.state === 'error'" class="er">{{ t.error }}</div>
          </div>
          <button
            v-if="t.state === 'running' || t.state === 'queued'"
            class="iconbtn"
            @click="cancel(t)"
            title="Cancel"
          >
            <Icon name="x" :size="13" />
          </button>
          <span v-else class="st" :class="t.state">{{ t.state }}</span>
        </div>
      </div>
    </div>
    <div v-if="ghost.on" class="drag-ghost" :style="{ left: ghost.x + 12 + 'px', top: ghost.y + 8 + 'px' }">
      <Icon name="file" :size="13" /> {{ ghost.text }}
    </div>
    <TextEditor
      v-if="editing"
      :side="editing.side"
      :entry="editing.entry"
      @close="closeEditor"
      @binary="notText(editing.side, editing.entry)"
    />
    <ImageViewer
      v-if="viewing"
      :side="viewing.side"
      :entry="viewing.entry"
      @close="viewing = null"
      @external="openExternal(viewing.side, viewing.entry)"
    />
  </div>
</template>

<style scoped>
.sftp {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.panes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
}
.split {
  background: var(--line);
}
.xfers {
  flex: none;
  max-height: 34%;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line);
  background: var(--bg-2);
}
.xh {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
}
.xl {
  overflow: auto;
  padding: 0 8px 8px;
}
.xr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  border-radius: 8px;
}
.xr:hover {
  background: var(--bg-3);
}
.xn {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.nm {
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar {
  height: 4px;
  border-radius: 4px;
  background: var(--bg-4);
  margin-top: 5px;
  overflow: hidden;
}
.bar > div {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.bar > .done {
  background: var(--ok);
}
.bar > .error,
.bar > .cancelled {
  background: var(--danger);
}
.er {
  color: var(--danger);
  font-size: 11px;
  margin-top: 3px;
  -webkit-user-select: text;
  user-select: text;
}
.st {
  font-size: 11px;
  text-transform: capitalize;
  color: var(--text-3);
  width: 60px;
  text-align: right;
}
.st.done {
  color: var(--ok);
}
.st.error {
  color: var(--danger);
}
.icon.done {
  color: var(--ok);
}
.icon.error {
  color: var(--danger);
}
.drag-ghost {
  position: fixed;
  z-index: 90;
  pointer-events: none;
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 5px 10px;
  border-radius: 7px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 600;
  box-shadow: var(--shadow);
}
</style>
