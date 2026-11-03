<script setup>
import { reactive, ref } from 'vue'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { store, loadVault, toast, err, confirm, prompt, openMenu } from '../lib/store'
import { api, fmtTime } from '../lib/api'
import Icon from '../components/Icon.vue'

const modal = ref(null) // 'gen' | 'import' | 'install'
const busy = ref(false)
const gen = reactive({ name: '', kind: 'ed25519', passphrase: '' })
const imp = reactive({ name: '', pem: '', passphrase: '' })
const inst = reactive({ key: null, host: '' })

async function generate() {
  busy.value = true
  try {
    await api.key_generate({
      name: gen.name || `${gen.kind}-${new Date().toISOString().slice(0, 10)}`,
      kind: gen.kind,
      passphrase: gen.passphrase,
    })
    await loadVault()
    modal.value = null
    toast('Key generated')
    Object.assign(gen, { name: '', passphrase: '' })
  } catch (e) {
    err(e)
  }
  busy.value = false
}
async function pickFile() {
  const path = await openDialog({ multiple: false, directory: false, defaultPath: '~/.ssh' })
  if (!path) return
  try {
    imp.pem = await api.read_local_text({ path })
    if (!imp.name) imp.name = String(path).split(/[\\/]/).pop()
  } catch (e) {
    err(e)
  }
}
async function doImport() {
  try {
    await api.key_import({ name: imp.name || 'imported key', pem: imp.pem, passphrase: imp.passphrase })
    await loadVault()
    modal.value = null
    toast('Key imported')
    Object.assign(imp, { name: '', pem: '', passphrase: '' })
  } catch (e) {
    err(e)
  }
}
async function install() {
  const host = store.vault.hosts.find((h) => h.id === inst.host)
  if (!host) return
  busy.value = true
  try {
    await api.key_install({ host, keyId: inst.key.id })
    toast(`Public key installed on ${host.label}`)
    modal.value = null
  } catch (e) {
    err(e)
  }
  busy.value = false
}
async function rename(k) {
  const name = await prompt('Rename key', { value: k.name, okText: 'Rename' })
  if (!name) return
  try {
    await api.key_save({ key: { ...k, name } })
    loadVault()
  } catch (e) {
    err(e)
  }
}
async function remove(k) {
  if (!(await confirm(`Delete key “${k.name}”?`, 'Hosts using this key will fall back to password / agent.'))) return
  try {
    await api.key_delete({ id: k.id })
    loadVault()
  } catch (e) {
    err(e)
  }
}
const copyPub = (k) => writeText(k.public_key).then(() => toast('Public key copied'))
const usedBy = (k) => store.vault.hosts.filter((h) => h.key_id === k.id).length
function openInstall(k) {
  inst.key = k
  inst.host = ''
  modal.value = 'install'
}
function menu(e, k) {
  openMenu(e, [
    { label: 'Copy public key', icon: 'copy', action: () => copyPub(k) },
    {
      label: 'Install on host…',
      icon: 'send',
      action: () => {
        inst.key = k
        inst.host = ''
        modal.value = 'install'
      },
    },
    { label: 'Rename', icon: 'edit', action: () => rename(k) },
    '-',
    { label: 'Delete', icon: 'trash', danger: true, action: () => remove(k) },
  ])
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Keychain</h1>
      <button class="btn" @click="modal = 'import'"><Icon name="import" :size="14" /> Import</button>
      <button class="btn primary" @click="modal = 'gen'"><Icon name="plus" :size="14" /> Generate Key</button>
    </div>
    <div class="page-body">
      <div v-if="!store.vault.keys.length" class="empty">
        <Icon name="key" :size="40" />
        <div class="big">No SSH keys</div>
        <div>Generate an Ed25519 key or import an existing one. Keys are stored encrypted in your local vault.</div>
      </div>
      <div v-else class="card">
        <div v-for="k in store.vault.keys" :key="k.id" class="list-row" @contextmenu="menu($event, k)">
          <span class="badge" style="background: #b07d2b"><Icon name="key" /></span>
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 600">
              {{ k.name }} <span class="chip">{{ k.kind }}</span>
              <span v-if="k.passphrase" class="chip"><Icon name="lock" :size="10" />&nbsp;passphrase</span>
            </div>
            <div
              class="dim mono"
              style="font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
            >
              {{ k.fingerprint }}
            </div>
          </div>
          <span class="dim" style="font-size: 12px"
            >{{ usedBy(k) ? `${usedBy(k)} host(s)` : '' }} {{ fmtTime(k.created_at) }}</span
          >
          <button class="iconbtn" title="Copy public key" @click="copyPub(k)"><Icon name="copy" /></button>
          <button class="iconbtn" title="Install on host" @click="openInstall(k)">
            <Icon name="send" />
          </button>
          <button class="iconbtn" @click="menu($event, k)"><Icon name="more" /></button>
        </div>
      </div>
    </div>

    <div v-if="modal" class="overlay" @mousedown.self="modal = null">
      <form v-if="modal === 'gen'" class="modal" @submit.prevent="generate">
        <h2>Generate SSH key</h2>
        <div class="field">
          <label>Name</label><input class="input" v-model="gen.name" placeholder="my-laptop" autofocus />
        </div>
        <div class="field">
          <label>Type</label>
          <div class="row">
            <button
              v-for="t in ['ed25519', 'ecdsa', 'rsa']"
              :key="t"
              type="button"
              class="chip"
              :class="{ on: gen.kind === t }"
              style="border: 0; cursor: pointer; height: 28px; padding: 0 14px"
              @click="gen.kind = t"
            >
              {{ t === 'rsa' ? 'RSA 4096' : t === 'ecdsa' ? 'ECDSA P-256' : 'Ed25519 (recommended)' }}
            </button>
          </div>
        </div>
        <div class="field">
          <label>Passphrase <span class="dim">(optional)</span></label
          ><input class="input" type="password" v-model="gen.passphrase" />
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" @click="modal = null">Cancel</button
          ><button class="btn primary" :disabled="busy">{{ busy ? 'Generating…' : 'Generate' }}</button>
        </div>
      </form>

      <form v-else-if="modal === 'import'" class="modal" @submit.prevent="doImport">
        <h2>Import private key</h2>
        <div class="field"><label>Name</label><input class="input" v-model="imp.name" placeholder="id_ed25519" /></div>
        <div class="field">
          <label>Private key (OpenSSH / PEM)</label>
          <textarea
            class="textarea"
            rows="7"
            v-model="imp.pem"
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          ></textarea>
          <button type="button" class="btn sm" style="align-self: flex-start" @click="pickFile">
            <Icon name="folder" :size="13" /> Choose file…
          </button>
        </div>
        <div class="field">
          <label>Passphrase <span class="dim">(if encrypted)</span></label
          ><input class="input" type="password" v-model="imp.passphrase" />
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" @click="modal = null">Cancel</button
          ><button class="btn primary" :disabled="!imp.pem">Import</button>
        </div>
      </form>

      <form v-else-if="modal === 'install'" class="modal" @submit.prevent="install">
        <h2>Install “{{ inst.key.name }}” on a host</h2>
        <p class="muted">
          Appends the public key to <span class="mono">~/.ssh/authorized_keys</span> on the selected server (like
          ssh-copy-id).
        </p>
        <div class="field">
          <label>Host</label>
          <select class="select" v-model="inst.host">
            <option value="" disabled>Select a host…</option>
            <option v-for="h in store.vault.hosts.filter((h) => h.protocol === 'ssh')" :key="h.id" :value="h.id">
              {{ h.label || h.host }}
            </option>
          </select>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" @click="modal = null">Cancel</button
          ><button class="btn primary" :disabled="!inst.host || busy">{{ busy ? 'Installing…' : 'Install' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
