<script setup>
import { computed, ref } from 'vue'
import { store, connectHost, openSftp, openMenu, confirm, toast, err, loadVault } from '../lib/store'
import { api } from '../lib/api'
import { badge } from '../lib/os'
import Icon from '../components/Icon.vue'

const q = ref('')
const group = ref('')
const layout = ref(localStorage.getItem('hosts.layout') || 'grid')
const setLayout = (l) => {
  layout.value = l
  try {
    localStorage.setItem('hosts.layout', l)
  } catch {}
}

const groups = computed(() => [...new Set(store.vault.hosts.map((h) => h.group).filter(Boolean))].sort())
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  return store.vault.hosts
    .filter((h) => !group.value || h.group === group.value)
    .filter(
      (h) =>
        !s || `${h.label} ${h.host} ${h.username} ${h.group} ${(h.tags || []).join(' ')}`.toLowerCase().includes(s),
    )
    .sort((a, b) => (a.label || a.host).localeCompare(b.label || b.host))
})
const grouped = computed(() => {
  const m = new Map()
  for (const h of filtered.value) {
    const g = h.group || ''
    if (!m.has(g)) m.set(g, [])
    m.get(g).push(h)
  }
  return [...m.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
})
const recent = computed(() =>
  store.vault.hosts
    .filter((h) => h.last_used)
    .sort((a, b) => b.last_used - a.last_used)
    .slice(0, 6),
)

const sub = (h) =>
  h.protocol === 's3'
    ? h.bucket || h.endpoint || 'AWS S3'
    : `${h.protocol !== 'ssh' ? h.protocol + ' · ' : ''}${h.username ? h.username + '@' : ''}${h.host}${h.port && h.port !== 22 && h.port !== 21 ? ':' + h.port : ''}`

function edit(h) {
  store.editor = { host: h ? JSON.parse(JSON.stringify(h)) : null }
}

async function remove(h) {
  if (
    !(await confirm(
      `Delete “${h.label || h.host}”?`,
      'This removes the host and its port-forward rules from the vault.',
    ))
  )
    return
  try {
    await api.host_delete({ id: h.id })
    await loadVault()
  } catch (e) {
    err(e)
  }
}
async function duplicate(h) {
  try {
    await api.host_save({ host: { ...h, id: '', label: h.label + ' copy', last_used: 0, created_at: 0 } })
    await loadVault()
  } catch (e) {
    err(e)
  }
}
async function importConfig() {
  try {
    const n = await api.import_ssh_config()
    await loadVault()
    toast(`Imported ${n} host(s) from ~/.ssh/config`)
  } catch (e) {
    err(e)
  }
}

async function test(h) {
  toast(`Testing ${h.label || h.host}…`)
  try {
    toast(await api.ssh_test({ host: h }))
  } catch (e) {
    err(e)
  }
}

function menu(e, h) {
  const ssh = h.protocol === 'ssh'
  openMenu(e, [
    { label: ssh ? 'Connect' : 'Open', icon: ssh ? 'terminal' : 'folder', action: () => connectHost(h) },
    ...(ssh
      ? [
          { label: 'Open SFTP', icon: 'folder', action: () => openSftp(h) },
          { label: 'Test connection', icon: 'zap', action: () => test(h) },
        ]
      : []),
    '-',
    { label: 'Edit', icon: 'edit', action: () => edit(h) },
    { label: 'Duplicate', icon: 'copy', action: () => duplicate(h) },
    { label: 'Copy address', icon: 'copy', action: () => navigator.clipboard.writeText(h.host) },
    '-',
    { label: 'Delete', icon: 'trash', danger: true, action: () => remove(h) },
  ])
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Hosts</h1>
      <div class="search">
        <Icon name="search" :size="14" /><input class="input" v-model="q" placeholder="Search hosts…" />
      </div>
      <button class="iconbtn" :class="{ active: layout === 'grid' }" @click="setLayout('grid')" title="Grid">
        <Icon name="grid" />
      </button>
      <button class="iconbtn" :class="{ active: layout === 'list' }" @click="setLayout('list')" title="List">
        <Icon name="list" />
      </button>
      <button class="btn" @click="importConfig" title="Import from ~/.ssh/config">
        <Icon name="import" :size="14" /> Import
      </button>
      <button class="btn primary" @click="edit(null)"><Icon name="plus" :size="14" /> New Host</button>
    </div>

    <div class="page-body">
      <div class="chips" v-if="groups.length">
        <button class="chip" :class="{ on: !group }" @click="group = ''">All</button>
        <button v-for="g in groups" :key="g" class="chip" :class="{ on: group === g }" @click="group = g">
          {{ g }}
        </button>
      </div>

      <template v-if="!q && !group && recent.length">
        <div class="section-title">Recent</div>
        <div class="recent">
          <button v-for="h in recent" :key="h.id" class="rc" @click="connectHost(h)" @contextmenu="menu($event, h)">
            <span class="badge sm" :style="{ background: badge(h).bg }">{{ badge(h).text }}</span>
            <span>{{ h.label || h.host }}</span>
          </button>
        </div>
      </template>

      <div v-if="!store.vault.hosts.length" class="empty">
        <Icon name="server" :size="40" />
        <div class="big">No hosts yet</div>
        <div>Add an SSH server, FTP site or S3 bucket — or import your ~/.ssh/config.</div>
        <div class="row" style="justify-content: center; margin-top: 8px">
          <button class="btn" @click="importConfig">Import ~/.ssh/config</button>
          <button class="btn primary" @click="edit(null)">New Host</button>
        </div>
      </div>

      <template v-for="[g, hosts] in grouped" :key="g">
        <div class="section-title">
          {{ g || (groups.length ? 'Ungrouped' : 'All hosts') }} <span class="dim">· {{ hosts.length }}</span>
        </div>
        <div :class="layout === 'grid' ? 'grid' : 'card listv'">
          <div
            v-for="h in hosts"
            :key="h.id"
            :class="layout === 'grid' ? 'host card' : 'list-row host-row'"
            @dblclick="connectHost(h)"
            @contextmenu="menu($event, h)"
          >
            <span class="badge" :style="{ background: badge(h).bg }">{{ badge(h).text }}</span>
            <div class="meta">
              <div class="name">{{ h.label || h.host }}</div>
              <div class="sub mono">{{ sub(h) }}</div>
            </div>
            <div class="acts">
              <button v-if="h.protocol === 'ssh'" class="iconbtn" title="SFTP" @click.stop="openSftp(h)">
                <Icon name="folder" />
              </button>
              <button class="iconbtn" title="Edit" @click.stop="edit(h)"><Icon name="edit" /></button>
              <button class="iconbtn go" title="Connect" @click.stop="connectHost(h)">
                <Icon :name="h.protocol === 'ssh' ? 'play' : 'right'" :size="14" />
              </button>
            </div>
          </div>
        </div>
      </template>
      <div v-if="store.vault.hosts.length && !filtered.length" class="empty">No hosts match “{{ q }}”.</div>
    </div>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.chips .chip {
  border: 0;
  cursor: pointer;
}
.recent {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.rc {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px 0 5px;
  border-radius: 9px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  cursor: pointer;
}
.rc:hover {
  border-color: var(--accent);
}
.badge.sm {
  width: 24px;
  height: 24px;
  font-size: 11px;
  border-radius: 6px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
}
.host {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  cursor: default;
  transition:
    border-color 0.12s,
    transform 0.12s;
}
.host:hover {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
}
.meta {
  flex: 1;
  min-width: 0;
}
.name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acts {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s;
}
.host:hover .acts,
.host-row:hover .acts {
  opacity: 1;
}
.go {
  color: var(--accent);
}
.listv {
  overflow: hidden;
}
.host-row .badge {
  width: 30px;
  height: 30px;
  font-size: 12px;
}
</style>
