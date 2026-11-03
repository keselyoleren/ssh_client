<script setup>
import { ref } from 'vue'
import { store, loadVault, err, confirm, toast } from '../lib/store'
import { api } from '../lib/api'
import Icon from '../components/Icon.vue'

const edit = ref(null)
const busy = ref('')
const KINDS = { local: 'Local (-L)', remote: 'Remote (-R)', dynamic: 'Dynamic SOCKS (-D)' }
const sshHosts = () => store.vault.hosts.filter((h) => h.protocol === 'ssh')
const hostName = (id) => {
  const h = store.vault.hosts.find((h) => h.id === id)
  return h ? h.label || h.host : '—'
}
const isOn = (f) => store.activeForwards.includes(f.id)

function open(f) {
  edit.value = f
    ? { ...f }
    : {
        id: '',
        name: '',
        host_id: sshHosts()[0]?.id || '',
        kind: 'local',
        bind_host: '127.0.0.1',
        bind_port: 8080,
        dest_host: '127.0.0.1',
        dest_port: 80,
        auto_start: false,
      }
}
async function save() {
  try {
    const f = { ...edit.value, bind_port: +edit.value.bind_port, dest_port: +edit.value.dest_port || 0 }
    if (!f.name) f.name = `${f.kind} ${f.bind_port}`
    await api.forward_save({ forward: f })
    await loadVault()
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
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Port Forwarding</h1>
      <button class="btn primary" @click="open(null)" :disabled="!sshHosts().length">
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
          </div>
          <span v-if="busy === f.id" class="dim">connecting…</span>
          <span v-else-if="isOn(f)" style="color: var(--ok); font-size: 12px">● active</span>
          <button class="iconbtn" @click="open(f)"><Icon name="edit" /></button>
          <button class="iconbtn" @click="remove(f)"><Icon name="trash" /></button>
        </div>
      </div>
    </div>

    <div v-if="edit" class="overlay" @mousedown.self="edit = null">
      <form class="modal" @submit.prevent="save">
        <h2>{{ edit.id ? 'Edit rule' : 'New forwarding rule' }}</h2>
        <div class="field">
          <label>Name</label><input class="input" v-model="edit.name" placeholder="Postgres prod" autofocus />
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
          <select class="select" v-model="edit.host_id" required>
            <option v-for="h in sshHosts()" :key="h.id" :value="h.id">{{ h.label || h.host }}</option>
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
        <div class="modal-foot">
          <button type="button" class="btn" @click="edit = null">Cancel</button
          ><button class="btn primary">Save</button>
        </div>
      </form>
    </div>
  </div>
</template>
