<script setup>
import { computed, reactive, ref } from 'vue'
import { store, loadVault, err, confirm, sendToFocused, toast } from '../lib/store'
import { api } from '../lib/api'
import Icon from '../components/Icon.vue'

const q = ref('')
const edit = ref(null)
const runOn = reactive({ snippet: null, hosts: [], results: [], busy: false })
const list = computed(() =>
  store.vault.snippets.filter((s) => !q.value || (s.name + s.command).toLowerCase().includes(q.value.toLowerCase())),
)

function open(s) {
  edit.value = s ? { ...s, tags: (s.tags || []).join(', ') } : { id: '', name: '', command: '', tags: '' }
}
async function save() {
  try {
    await api.snippet_save({
      snippet: {
        ...edit.value,
        tags: edit.value.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      },
    })
    await loadVault()
    edit.value = null
  } catch (e) {
    err(e)
  }
}
async function remove(s) {
  if (!(await confirm(`Delete snippet “${s.name}”?`))) return
  await api.snippet_delete({ id: s.id })
  loadVault()
}
function paste(s) {
  if (!store.tabs.some((t) => t.kind === 'term')) return toast('Open a terminal first', 'error')
  const t = store.tabs.filter((t) => t.kind === 'term').pop()
  store.active = t.id
  setTimeout(() => sendToFocused(s.command + '\r'), 30)
}
function openRun(s) {
  runOn.snippet = s
  runOn.hosts = []
  runOn.results = []
}
async function execMany() {
  runOn.busy = true
  runOn.results = runOn.hosts.map((id) => ({
    host: store.vault.hosts.find((h) => h.id === id),
    output: '',
    code: null,
    pending: true,
  }))
  await Promise.all(
    runOn.results.map(async (r) => {
      try {
        const o = await api.ssh_exec({ host: r.host, command: runOn.snippet.command })
        r.output = o.output
        r.code = o.code
      } catch (e) {
        r.output = String(e)
        r.code = -1
      }
      r.pending = false
    }),
  )
  runOn.busy = false
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Snippets</h1>
      <div class="search">
        <Icon name="search" :size="14" /><input class="input" v-model="q" placeholder="Search snippets…" />
      </div>
      <button class="btn primary" @click="open(null)"><Icon name="plus" :size="14" /> New Snippet</button>
    </div>
    <div class="page-body">
      <div v-if="!store.vault.snippets.length" class="empty">
        <Icon name="code" :size="40" />
        <div class="big">No snippets</div>
        <div>Save frequently used commands, paste them into any terminal or run them on many hosts at once.</div>
      </div>
      <div class="grid">
        <div v-for="s in list" :key="s.id" class="card sn">
          <div class="row">
            <b style="flex: 1">{{ s.name }}</b>
            <button class="iconbtn" title="Paste to terminal" @click="paste(s)"><Icon name="terminal" /></button>
            <button class="iconbtn" title="Run on hosts" @click="openRun(s)">
              <Icon name="play" :size="14" />
            </button>
            <button class="iconbtn" @click="open(s)"><Icon name="edit" /></button>
            <button class="iconbtn" @click="remove(s)"><Icon name="trash" /></button>
          </div>
          <pre class="mono">{{ s.command }}</pre>
          <div v-if="s.tags?.length" class="row" style="gap: 4px">
            <span v-for="t in s.tags" :key="t" class="chip">{{ t }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="edit" class="overlay" @mousedown.self="edit = null">
      <form class="modal" @submit.prevent="save">
        <h2>{{ edit.id ? 'Edit snippet' : 'New snippet' }}</h2>
        <div class="field"><label>Name</label><input class="input" v-model="edit.name" required autofocus /></div>
        <div class="field">
          <label>Command</label
          ><textarea
            class="textarea"
            rows="6"
            v-model="edit.command"
            required
            placeholder="sudo systemctl restart nginx"
          ></textarea>
        </div>
        <div class="field">
          <label>Tags</label><input class="input" v-model="edit.tags" placeholder="nginx, deploy" />
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" @click="edit = null">Cancel</button
          ><button class="btn primary">Save</button>
        </div>
      </form>
    </div>

    <div v-if="runOn.snippet" class="overlay" @mousedown.self="runOn.snippet = null">
      <div class="modal" style="width: 720px">
        <h2>Run “{{ runOn.snippet.name }}”</h2>
        <pre class="mono cmd">{{ runOn.snippet.command }}</pre>
        <div class="section-title">Hosts</div>
        <div class="hosts">
          <label
            v-for="h in store.vault.hosts.filter((h) => h.protocol === 'ssh')"
            :key="h.id"
            class="chip"
            :class="{ on: runOn.hosts.includes(h.id) }"
          >
            <input type="checkbox" :value="h.id" v-model="runOn.hosts" hidden /> {{ h.label || h.host }}
          </label>
        </div>
        <div v-for="r in runOn.results" :key="r.host.id" class="res">
          <div class="row">
            <b>{{ r.host.label }}</b
            ><span v-if="r.pending" class="dim">running…</span
            ><span v-else :style="{ color: r.code === 0 ? 'var(--ok)' : 'var(--danger)' }">exit {{ r.code }}</span>
          </div>
          <pre class="mono">{{ r.output }}</pre>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="runOn.snippet = null">Close</button
          ><button class="btn primary" :disabled="!runOn.hosts.length || runOn.busy" @click="execMany">
            {{ runOn.busy ? 'Running…' : `Run on ${runOn.hosts.length} host(s)` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
}
.sn {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
pre {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-2);
  background: var(--bg);
  border-radius: 7px;
  padding: 8px 10px;
  max-height: 120px;
  overflow: auto;
  -webkit-user-select: text;
  user-select: text;
}
.cmd {
  margin-bottom: 4px;
}
.hosts {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.hosts .chip {
  cursor: pointer;
  height: 26px;
}
.res {
  margin-top: 12px;
}
.res pre {
  max-height: 200px;
  margin-top: 4px;
}
</style>
