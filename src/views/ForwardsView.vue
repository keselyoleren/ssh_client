<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { store, loadVault, err, confirm, toast } from '../lib/store'
import { api } from '../lib/api'
import { parseSshCommand, matchHosts, toSshCommand } from '../lib/sshcmd'
import Icon from '../components/Icon.vue'

const edit = ref(null)
const busy = ref('')
const KINDS = { local: 'Local (-L)', remote: 'Remote (-R)', dynamic: 'Dynamic SOCKS (-D)' }
const sshHosts = computed(() => store.vault.hosts.filter((h) => h.protocol === 'ssh'))
const hostById = (id) => store.vault.hosts.find((h) => h.id === id)
const hostName = (id) => {
  const h = hostById(id)
  return h ? h.label || h.host : '—'
}
/** "prod-db — deploy@10.0.0.5:2222" */
const hostLine = (h) =>
  `${h.label || h.host} — ${h.username ? h.username + '@' : ''}${h.host}${(+h.port || 22) !== 22 ? ':' + h.port : ''}`
const isOn = (f) => store.activeForwards.includes(f.id)

function blank(hostId) {
  return {
    id: '',
    name: '',
    host_id: hostId || sshHosts.value[0]?.id || '',
    kind: 'local',
    bind_host: '127.0.0.1',
    bind_port: 8080,
    dest_host: '127.0.0.1',
    dest_port: 80,
    auto_start: false,
  }
}
const pasteInput = ref(null)
const nameInput = ref(null)
async function open(f, hostId) {
  edit.value = f ? { ...f } : blank(hostId)
  pasted.value = ''
  // focus explicitly: WebKit doesn't always honour autofocus inside a freshly shown dialog
  await nextTick()
  ;(f ? nameInput : pasteInput).value?.focus()
}

// "Port forwarding…" from a host's menu on the Hosts page
watch(
  () => store.forwardFor,
  (id) => {
    if (!id) return
    open(null, id)
    store.forwardFor = null
  },
  { immediate: true },
)

// ---------- paste an ssh command ----------
const pasted = ref('')
const parsed = computed(() => (pasted.value.trim() ? parseSshCommand(pasted.value) : null))
const matches = computed(() => (parsed.value?.host ? matchHosts(parsed.value, store.vault.hosts) : []))
watch(parsed, (p) => {
  const f = p?.forwards[0]
  if (f && edit.value) Object.assign(edit.value, f)
})
watch(matches, (m) => {
  if (edit.value && m.length && !m.some((h) => h.id === edit.value.host_id)) edit.value.host_id = m[0].id
})
/** The pasted command names a server that isn't saved: don't let the rule go through another one. */
const unknownHost = computed(() => !!parsed.value?.host && !matches.value.length)
function addParsedHost() {
  const p = parsed.value
  store.editor = { host: { protocol: 'ssh', label: p.host, host: p.host, port: p.port, username: p.user } }
}

// ---------- save / list ----------
const ruleName = (f) =>
  f.name || (f.kind === 'dynamic' ? `SOCKS ${f.bind_port}` : `${f.dest_host}:${f.dest_port} → :${f.bind_port}`)
async function save() {
  try {
    const base = { ...edit.value, bind_port: +edit.value.bind_port, dest_port: +edit.value.dest_port || 0 }
    // a pasted command with several tunnels creates one rule per tunnel
    const extra = !base.id && parsed.value?.forwards.length > 1 ? parsed.value.forwards.slice(1) : []
    await api.forward_save({ forward: { ...base, name: ruleName(base) } })
    for (const f of extra) {
      const r = { ...base, ...f, id: '', name: '' }
      await api.forward_save({ forward: { ...r, name: ruleName(r) } })
    }
    await loadVault()
    if (extra.length) toast(`Created ${extra.length + 1} rules`)
    edit.value = null
  } catch (e) {
    err(e)
  }
}
async function toggle(f) {
  busy.value = f.id
  try {
    if (isOn(f)) await api.forward_stop({ id: f.id })
    else {
      await api.forward_start({ id: f.id })
      toast(`Forwarding ${describe(f)}`)
    }
  } catch (e) {
    err(e)
  }
  store.activeForwards = await api.forward_active()
  busy.value = ''
}
async function remove(f) {
  if (!(await confirm(`Delete rule “${f.name}”?`))) return
  await api.forward_delete({ id: f.id })
  loadVault()
}
function describe(f) {
  if (f.kind === 'dynamic') return `SOCKS5 ${f.bind_host || '127.0.0.1'}:${f.bind_port}`
  if (f.kind === 'remote') return `remote :${f.bind_port} → ${f.dest_host}:${f.dest_port}`
  return `${f.bind_host || '127.0.0.1'}:${f.bind_port} → ${f.dest_host}:${f.dest_port}`
}
const preview = computed(
  () => edit.value && !unknownHost.value && toSshCommand(edit.value, hostById(edit.value.host_id)),
)
async function copy(text) {
  try {
    await writeText(text)
    toast('Copied')
  } catch (e) {
    err(e)
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Port Forwarding</h1>
      <button class="btn primary" @click="open(null)" :disabled="!sshHosts.length">
        <Icon name="plus" :size="14" /> New Rule
      </button>
    </div>
    <div class="page-body">
      <div v-if="!store.vault.forwards.length" class="empty">
        <Icon name="forward" :size="40" />
        <div class="big">No forwarding rules</div>
        <div>
          Tunnel a remote database to localhost, expose a local port to a server, or run a SOCKS proxy through SSH.
        </div>
        <button v-if="sshHosts.length" class="btn primary" @click="open(null)">
          <Icon name="plus" :size="14" /> New rule
        </button>
        <template v-else>
          <div class="dim">Tunnels run through one of your saved SSH hosts — add one first.</div>
          <button class="btn primary" @click="store.editor = { host: null }">
            <Icon name="plus" :size="14" /> Add host
          </button>
        </template>
      </div>
      <div v-else class="card">
        <div v-for="f in store.vault.forwards" :key="f.id" class="list-row">
          <button class="switch" :class="{ on: isOn(f) }" :disabled="busy === f.id" @click="toggle(f)"></button>
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 600">
              {{ f.name }} <span class="chip">{{ KINDS[f.kind] }}</span>
              <span v-if="f.auto_start" class="chip">auto-start</span>
            </div>
            <div class="dim mono" style="font-size: 12px">{{ describe(f) }} · via {{ hostName(f.host_id) }}</div>
            <div v-if="hostById(f.host_id)" class="cmdline mono" :title="'Equivalent command'">
              {{ toSshCommand(f, hostById(f.host_id)) }}
            </div>
          </div>
          <span v-if="busy === f.id" class="dim">connecting…</span>
          <span v-else-if="isOn(f)" style="color: var(--ok); font-size: 12px">● active</span>
          <button
            v-if="hostById(f.host_id)"
            class="iconbtn"
            title="Copy as ssh command"
            @click="copy(toSshCommand(f, hostById(f.host_id)))"
          >
            <Icon name="copy" />
          </button>
          <button class="iconbtn" @click="open(f)"><Icon name="edit" /></button>
          <button class="iconbtn" @click="remove(f)"><Icon name="trash" /></button>
        </div>
      </div>
    </div>

    <div v-if="edit" class="overlay" @mousedown.self="edit = null">
      <form class="modal" @submit.prevent="save">
        <h2>{{ edit.id ? 'Edit rule' : 'New forwarding rule' }}</h2>
        <div v-if="!edit.id" class="field paste">
          <label>Paste an ssh command <span class="opt">optional</span></label>
          <input
            class="input mono"
            ref="pasteInput"
            v-model="pasted"
            placeholder="ssh -L 5432:localhost:5432 user@server -p 2222"
            spellcheck="false"
          />
          <template v-if="parsed">
            <div v-if="parsed.forwards.length" class="found">
              <Icon name="check" :size="13" />
              {{ parsed.forwards.length }} tunnel{{ parsed.forwards.length > 1 ? 's' : '' }} found<template
                v-if="parsed.forwards.length > 1"
              >
                — Save creates one rule each</template
              >
            </div>
            <div v-for="e in parsed.errors" :key="e" class="warn"><Icon name="info" :size="13" /> {{ e }}</div>
            <div v-if="parsed.host && !matches.length" class="warn">
              <Icon name="info" :size="13" />
              {{ parsed.user ? parsed.user + '@' : '' }}{{ parsed.host }}:{{ parsed.port }} isn't in your hosts yet
              <button type="button" class="btn sm" @click="addParsedHost">Add host</button>
            </div>
            <div v-else-if="matches.length" class="found">
              <Icon name="server" :size="13" /> Using saved host
              <b>{{ hostName(edit.host_id) }}</b>
              <span v-if="matches.length > 1" class="dim">({{ matches.length }} match — change below)</span>
            </div>
          </template>
        </div>
        <div class="field">
          <label>Name</label
          ><input class="input" v-model="edit.name" :placeholder="ruleName({ ...edit, name: '' })" ref="nameInput" />
        </div>
        <div class="field">
          <label>Type</label>
          <div class="row">
            <button
              v-for="(l, k) in KINDS"
              :key="k"
              type="button"
              class="chip"
              :class="{ on: edit.kind === k }"
              style="border: 0; cursor: pointer; height: 28px; padding: 0 12px"
              @click="edit.kind = k"
            >
              {{ l }}
            </button>
          </div>
        </div>
        <div class="field">
          <label>Through host</label>
          <select class="select" v-model="edit.host_id" required :disabled="unknownHost">
            <option v-for="h in sshHosts" :key="h.id" :value="h.id">{{ hostLine(h) }}</option>
          </select>
        </div>
        <div class="row">
          <div class="field">
            <label>{{ edit.kind === 'remote' ? 'Remote bind address' : 'Local bind address' }}</label
            ><input class="input mono" v-model="edit.bind_host" placeholder="127.0.0.1" />
          </div>
          <div class="field" style="flex: 0.5">
            <label>Port</label><input class="input mono" type="number" v-model="edit.bind_port" required />
          </div>
        </div>
        <div class="row" v-if="edit.kind !== 'dynamic'">
          <div class="field">
            <label>{{ edit.kind === 'remote' ? 'Forward to (local side)' : 'Destination (from server)' }}</label
            ><input class="input mono" v-model="edit.dest_host" placeholder="127.0.0.1" />
          </div>
          <div class="field" style="flex: 0.5">
            <label>Port</label><input class="input mono" type="number" v-model="edit.dest_port" required />
          </div>
        </div>
        <div class="row" style="color: var(--text-2)">
          <button
            type="button"
            class="switch"
            :class="{ on: edit.auto_start }"
            @click="edit.auto_start = !edit.auto_start"
          ></button>
          Start automatically when K-Shell opens
        </div>
        <div v-if="preview" class="field" style="margin-top: 14px">
          <label>Same as</label>
          <div class="cmdbox mono">
            <span>{{ preview }}</span>
            <button type="button" class="iconbtn" title="Copy" @click="copy(preview)">
              <Icon name="copy" :size="13" />
            </button>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" @click="edit = null">Cancel</button
          ><button
            class="btn primary"
            :disabled="unknownHost"
            :title="unknownHost ? 'Add the host from the pasted command first' : ''"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.cmdline {
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  -webkit-user-select: text;
  user-select: text;
}
.paste {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 14px;
}
.found,
.warn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  flex-wrap: wrap;
}
.found {
  color: var(--ok);
}
.found .dim {
  color: var(--text-3);
}
.warn {
  color: var(--warn);
}
.opt {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
  color: var(--text-3);
  margin-left: 4px;
}
.cmdbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 10px;
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--line);
  font-size: 12px;
}
.cmdbox span {
  flex: 1;
  word-break: break-all;
  -webkit-user-select: text;
  user-select: text;
}
</style>
