<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { homeDir } from '@tauri-apps/api/path'
import { store, loadVault, err, confirm, openMenu, openProject, openWorkspace, toast } from '../lib/store'
import { api } from '../lib/api'
import Icon from '../components/Icon.vue'

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#ef4444', '#64748b']

const q = ref('')
const collapsed = ref(new Set())
const wsEdit = ref(null) // { id, name, color, projects }
const pjEdit = ref(null) // { wsId, fromWs, project: { id, name, path, startup_command } }
const nameInput = ref(null)
const layout = ref(localStorage.getItem('workspaces.layout') || 'grid')
const setLayout = (l) => {
  layout.value = l
  try {
    localStorage.setItem('workspaces.layout', l)
  } catch {}
}

// Show paths under the home folder as ~/…
const home = ref('')
onMounted(() =>
  homeDir()
    .then((h) => (home.value = h.replace(/[\\/]+$/, '')))
    .catch(() => {}),
)
const short = (p) => {
  const h = home.value
  return h && p.startsWith(h) && (p.length === h.length || '/\\'.includes(p[h.length])) ? '~' + p.slice(h.length) : p
}
const initial = (name) => (name.trim()[0] || '?').toUpperCase()
const totalProjects = computed(() => workspaces.value.reduce((n, w) => n + (w.projects?.length || 0), 0))

const workspaces = computed(() => store.vault.workspaces || [])
const view = computed(() => {
  const s = q.value.trim().toLowerCase()
  return workspaces.value
    .map((w) => ({
      ws: w,
      projects: (w.projects || []).filter(
        (p) => !s || w.name.toLowerCase().includes(s) || `${p.name} ${p.path}`.toLowerCase().includes(s),
      ),
    }))
    .filter((v) => !s || v.projects.length || v.ws.name.toLowerCase().includes(s))
})

const leaves = (n) => (n.type === 'leaf' ? [n] : n.children.flatMap(leaves))
/** Open terminal tabs that belong to this project. */
const runningIn = (ws, p) =>
  store.tabs.filter(
    (t) => t.kind === 'term' && leaves(t.root).some((l) => l.target.workspace === ws.id && l.target.cwd === p.path),
  )

/** Open terminal tabs across the projects of a workspace. */
const openCount = (ws) => (ws.projects || []).reduce((n, p) => n + runningIn(ws, p).length, 0)

function toggle(id) {
  const c = new Set(collapsed.value)
  c.has(id) ? c.delete(id) : c.add(id)
  collapsed.value = c
}

async function persist(ws) {
  try {
    await api.workspace_save({ workspace: ws })
    await loadVault()
    return true
  } catch (e) {
    err(e)
    return false
  }
}

// ---------- workspace ----------
async function newWorkspace() {
  wsEdit.value = { id: '', name: '', color: COLORS[workspaces.value.length % COLORS.length], projects: [] }
  await nextTick()
  nameInput.value?.focus()
}
function editWorkspace(ws) {
  wsEdit.value = JSON.parse(JSON.stringify(ws))
}
async function saveWorkspace() {
  const w = wsEdit.value
  if (!w.name.trim()) return
  if (await persist({ ...w, name: w.name.trim() })) wsEdit.value = null
}
async function removeWorkspace(ws) {
  const n = ws.projects?.length || 0
  const msg = n
    ? `Its ${n} project${n === 1 ? '' : 's'} will be removed from K-Shell. Your folders are not touched.`
    : ''
  if (!(await confirm(`Delete workspace “${ws.name}”?`, msg))) return
  try {
    await api.workspace_delete({ id: ws.id })
    await loadVault()
  } catch (e) {
    err(e)
  }
}

// ---------- project ----------
const baseName = (p) =>
  p
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop() || p

async function browse() {
  const dir = await openDialog({
    directory: true,
    multiple: false,
    defaultPath: pjEdit.value.project.path || undefined,
  })
  if (!dir) return
  const p = pjEdit.value.project
  if (!p.name || p.name === baseName(p.path || '')) p.name = baseName(dir)
  p.path = dir
}
async function newProject(ws) {
  pjEdit.value = { wsId: ws.id, fromWs: ws.id, project: { id: '', name: '', path: '', startup_command: '' } }
  await browse() // most people start by picking the folder
}
function editProject(ws, p) {
  pjEdit.value = { wsId: ws.id, fromWs: ws.id, project: { ...p } }
}
async function saveProject() {
  const { wsId, fromWs, project } = pjEdit.value
  const p = { ...project, name: project.name.trim() || baseName(project.path), path: project.path.trim() }
  if (!p.path) return
  const target = JSON.parse(JSON.stringify(workspaces.value.find((w) => w.id === wsId)))
  if (fromWs !== wsId && p.id) {
    // moved to another workspace: take it out of the old one first
    const old = JSON.parse(JSON.stringify(workspaces.value.find((w) => w.id === fromWs)))
    old.projects = old.projects.filter((x) => x.id !== p.id)
    if (!(await persist(old))) return
  }
  const i = target.projects.findIndex((x) => x.id && x.id === p.id)
  i >= 0 ? (target.projects[i] = p) : target.projects.push(p)
  if (await persist(target)) pjEdit.value = null
}
async function removeProject(ws, p) {
  if (
    !(await confirm(`Remove “${p.name}” from ${ws.name}?`, 'The folder itself is not touched.', { okText: 'Remove' }))
  )
    return
  persist({ ...ws, projects: ws.projects.filter((x) => x.id !== p.id) })
}
async function move(ws, p, d) {
  const list = [...ws.projects]
  const i = list.findIndex((x) => x.id === p.id)
  const j = i + d
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  persist({ ...ws, projects: list })
}

function wsMenu(e, ws) {
  openMenu(e, [
    { label: 'Open all projects', icon: 'play', action: () => openAll(ws) },
    { label: 'Add project…', icon: 'plus', action: () => newProject(ws) },
    { label: 'Edit workspace…', icon: 'edit', action: () => editWorkspace(ws) },
    '-',
    { label: 'Delete workspace', icon: 'trash', danger: true, action: () => removeWorkspace(ws) },
  ])
}
function pjMenu(e, ws, p) {
  const i = ws.projects.findIndex((x) => x.id === p.id)
  openMenu(e, [
    { label: 'Open terminal', icon: 'terminal', action: () => openProject(ws, p) },
    { label: 'Edit project…', icon: 'edit', action: () => editProject(ws, p) },
    ...(i > 0 ? [{ label: 'Move up', icon: 'up', action: () => move(ws, p, -1) }] : []),
    ...(i < ws.projects.length - 1 ? [{ label: 'Move down', icon: 'down', action: () => move(ws, p, 1) }] : []),
    '-',
    { label: 'Remove from workspace', icon: 'trash', danger: true, action: () => removeProject(ws, p) },
  ])
}
function openAll(ws) {
  if (!ws.projects?.length) return toast('Add a project to this workspace first', 'error')
  openWorkspace(ws)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>
        Workspaces
        <span v-if="workspaces.length" class="sum"
          >{{ workspaces.length }} workspace{{ workspaces.length === 1 ? '' : 's' }} · {{ totalProjects }} project{{
            totalProjects === 1 ? '' : 's'
          }}</span
        >
      </h1>
      <template v-if="workspaces.length">
        <div class="search">
          <Icon name="search" :size="14" />
          <input class="input" v-model="q" placeholder="Search projects or folders" />
        </div>
        <button class="iconbtn" :class="{ active: layout === 'grid' }" @click="setLayout('grid')" title="Grid">
          <Icon name="grid" />
        </button>
        <button class="iconbtn" :class="{ active: layout === 'list' }" @click="setLayout('list')" title="List">
          <Icon name="list" />
        </button>
      </template>
      <button class="btn primary" @click="newWorkspace"><Icon name="plus" :size="14" /> New workspace</button>
    </div>

    <div class="page-body">
      <div v-if="!workspaces.length" class="empty">
        <div class="hero"><Icon name="grid" :size="28" /></div>
        <div class="big">Group your local projects</div>
        <div style="max-width: 440px">
          A workspace holds the folders you work on together — for example one per client or product. Open a project to
          get a terminal right in its folder, or open the whole workspace at once.
        </div>
        <button class="btn primary" @click="newWorkspace"><Icon name="plus" :size="14" /> Create a workspace</button>
      </div>

      <div v-else-if="!view.length" class="empty">
        <div class="big">No matching projects</div>
        <button class="btn sm" @click="q = ''">Clear search</button>
      </div>

      <section
        v-for="{ ws, projects } in view"
        :key="ws.id"
        class="ws"
        :style="{ '--ws': ws.color || 'var(--accent)' }"
      >
        <header @contextmenu="wsMenu($event, ws)">
          <button
            class="chev"
            :class="{ shut: collapsed.has(ws.id) }"
            :title="collapsed.has(ws.id) ? 'Expand' : 'Collapse'"
            @click="toggle(ws.id)"
          >
            <Icon name="down" :size="14" />
          </button>
          <span class="avatar">{{ initial(ws.name) }}</span>
          <div class="wtitle" @click="toggle(ws.id)">
            <b class="wname" @dblclick.stop="editWorkspace(ws)" title="Double-click to edit">{{ ws.name }}</b>
            <span class="wmeta">
              {{ ws.projects?.length || 0 }} project{{ ws.projects?.length === 1 ? '' : 's' }}
              <span v-if="openCount(ws)" class="live"><i></i>{{ openCount(ws) }} open</span>
            </span>
          </div>
          <button
            class="btn sm"
            :disabled="!ws.projects?.length"
            @click="openAll(ws)"
            title="Open every project in its own tab"
          >
            <Icon name="play" :size="12" /> Open all
          </button>
          <button class="iconbtn" title="Add project" @click="newProject(ws)"><Icon name="plus" :size="15" /></button>
          <button class="iconbtn" title="More" @click="wsMenu($event, ws)"><Icon name="more" :size="15" /></button>
        </header>

        <div v-if="!collapsed.has(ws.id)" :class="layout === 'grid' ? 'pgrid' : 'plist card'">
          <div
            v-for="p in projects"
            :key="p.id"
            class="pj"
            :class="{ running: runningIn(ws, p).length }"
            tabindex="0"
            role="button"
            :title="`Open a terminal in ${p.path}`"
            @click="openProject(ws, p)"
            @keydown.enter.prevent="openProject(ws, p)"
            @contextmenu="pjMenu($event, ws, p)"
          >
            <span class="ficon"><Icon name="folder" :size="17" /></span>
            <div class="pinfo">
              <div class="pname">
                <span class="ellip">{{ p.name }}</span>
                <span v-if="runningIn(ws, p).length" class="open-badge"><i></i>{{ runningIn(ws, p).length }} open</span>
              </div>
              <div class="ppath mono">{{ short(p.path) }}</div>
              <div v-if="p.startup_command" class="cmd mono" :title="`Runs on open: ${p.startup_command}`">
                <span class="prompt">$</span> {{ p.startup_command }}
              </div>
            </div>
            <div class="acts" @click.stop>
              <button class="iconbtn" title="Open terminal" @click="openProject(ws, p)">
                <Icon name="terminal" :size="14" />
              </button>
              <button class="iconbtn" title="Edit" @click="editProject(ws, p)"><Icon name="edit" :size="14" /></button>
              <button class="iconbtn" title="More" @click="pjMenu($event, ws, p)">
                <Icon name="more" :size="14" />
              </button>
            </div>
          </div>
          <button v-if="!q" class="addtile" @click="newProject(ws)">
            <Icon name="plus" :size="15" /> {{ ws.projects?.length ? 'Add project' : 'Add a project folder' }}
          </button>
        </div>
      </section>
    </div>

    <!-- workspace editor -->
    <div v-if="wsEdit" class="overlay" @mousedown.self="wsEdit = null">
      <form class="modal" style="width: 420px" @submit.prevent="saveWorkspace">
        <h2>{{ wsEdit.id ? 'Edit workspace' : 'New workspace' }}</h2>
        <div class="field">
          <label>Name</label>
          <input ref="nameInput" class="input" v-model="wsEdit.name" placeholder="e.g. Chronicle, Personal, Client X" />
        </div>
        <div class="field">
          <label>Color</label>
          <div class="colors">
            <button
              v-for="c in COLORS"
              :key="c"
              type="button"
              class="sw"
              :class="{ on: wsEdit.color === c }"
              :style="{ background: c }"
              @click="wsEdit.color = c"
            >
              <Icon v-if="wsEdit.color === c" name="check" :size="12" />
            </button>
          </div>
          <span class="dim hint">Tabs opened from this workspace use this color.</span>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" @click="wsEdit = null">Cancel</button>
          <button class="btn primary" :disabled="!wsEdit.name.trim()">
            {{ wsEdit.id ? 'Save' : 'Create workspace' }}
          </button>
        </div>
      </form>
    </div>

    <!-- project editor -->
    <div v-if="pjEdit" class="overlay" @mousedown.self="pjEdit = null">
      <form class="modal" style="width: 480px" @submit.prevent="saveProject">
        <h2>{{ pjEdit.project.id ? 'Edit project' : 'Add project' }}</h2>
        <div class="field">
          <label>Folder</label>
          <div class="row" style="gap: 6px">
            <input class="input mono" v-model="pjEdit.project.path" placeholder="~/code/my-app" />
            <button type="button" class="btn" @click="browse"><Icon name="folder" :size="14" /> Browse…</button>
          </div>
        </div>
        <div class="field">
          <label>Name</label>
          <input
            class="input"
            v-model="pjEdit.project.name"
            :placeholder="pjEdit.project.path ? baseName(pjEdit.project.path) : 'Project name'"
          />
        </div>
        <div class="field">
          <label>Startup command <span class="opt">optional</span></label>
          <input
            class="input mono"
            v-model="pjEdit.project.startup_command"
            placeholder="e.g. git pull && npm run dev"
          />
          <span class="dim hint">Typed into the terminal when the project opens.</span>
        </div>
        <div class="field" v-if="workspaces.length > 1">
          <label>Workspace</label>
          <select class="select" v-model="pjEdit.wsId">
            <option v-for="w in workspaces" :key="w.id" :value="w.id">{{ w.name }}</option>
          </select>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" @click="pjEdit = null">Cancel</button>
          <button class="btn primary" :disabled="!pjEdit.project.path.trim()">
            {{ pjEdit.project.id ? 'Save' : 'Add project' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.hero {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.sum {
  margin-left: 10px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
}
.ws {
  margin-bottom: 22px;
}
.ws header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 2px 10px;
}
.chev {
  width: 22px;
  height: 22px;
  flex: none;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
  cursor: pointer;
  transition: transform 0.15s;
}
.chev:hover {
  background: var(--bg-3);
  color: var(--text);
}
.chev.shut {
  transform: rotate(-90deg);
}
.avatar {
  width: 30px;
  height: 30px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 9px;
  font-weight: 700;
  font-size: 14px;
  color: #fff;
  background: var(--ws);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--ws) 35%, transparent);
}
.wtitle {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  cursor: pointer;
}
.wname {
  font-size: 14.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wmeta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-3);
}
.live,
.open-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ok);
}
.live i,
.open-badge i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 20%, transparent);
}
.open-badge {
  flex: none;
  padding: 1px 7px 1px 6px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--ok) 12%, transparent);
}

/* ---- projects: grid ---- */
.pgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
  padding-left: 32px;
}
.pgrid .pj {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 74px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-2);
  border-top: 2px solid color-mix(in srgb, var(--ws) 70%, transparent);
  transition:
    border-color 0.12s,
    transform 0.12s,
    box-shadow 0.12s;
}
.pgrid .pj:hover,
.pgrid .pj:focus-visible {
  border-color: color-mix(in srgb, var(--ws) 55%, var(--line));
  transform: translateY(-1px);
  box-shadow: var(--shadow);
  outline: none;
}
.pgrid .acts {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px;
  border-radius: 8px;
  background: var(--bg-2);
}

/* ---- projects: list ---- */
.plist {
  margin-left: 32px;
  overflow: hidden;
}
.plist .pj {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line);
}
.plist .pj:hover,
.plist .pj:focus-visible {
  background: var(--bg-3);
  outline: none;
}
.plist .pinfo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
  align-items: center;
  gap: 4px 16px;
}
.plist .cmd {
  max-width: 260px;
  margin-top: 0;
}

/* ---- shared ---- */
.pj {
  cursor: pointer;
}
.ficon {
  width: 34px;
  height: 34px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--ws);
  background: color-mix(in srgb, var(--ws) 14%, transparent);
}
.pinfo {
  min-width: 0;
  flex: 1;
}
.pname {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-weight: 600;
}
.ellip {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ppath {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmd {
  display: inline-block;
  max-width: 100%;
  margin-top: 7px;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-2);
  background: var(--bg-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmd .prompt {
  color: var(--ws);
  font-weight: 700;
}
.acts {
  display: flex;
  opacity: 0;
  transition: opacity 0.12s;
}
.pj:hover .acts,
.pj:focus-within .acts {
  opacity: 1;
}
.addtile {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 74px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: none;
  color: var(--text-3);
  cursor: pointer;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.addtile:hover {
  color: var(--ws);
  border-color: var(--ws);
  background: color-mix(in srgb, var(--ws) 6%, transparent);
}
.plist .addtile {
  width: 100%;
  min-height: 0;
  justify-content: flex-start;
  padding: 11px 14px;
  border: 0;
  border-radius: 0;
}
.colors {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sw {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 0;
  display: grid;
  place-items: center;
  color: #fff;
  cursor: pointer;
}
.sw.on {
  box-shadow:
    0 0 0 2px var(--bg-2),
    0 0 0 4px var(--text-3);
}
.hint {
  font-size: 12px;
}
.opt {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
  color: var(--text-3);
  margin-left: 4px;
}
</style>
