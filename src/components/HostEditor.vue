<script setup>
import { computed, reactive, ref } from 'vue'
import { store, loadVault, toast, err } from '../lib/store'
import { api } from '../lib/api'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { PROTOCOLS, S3_PRESETS, isObjectStorage } from '../lib/os'
import Icon from './Icon.vue'

const blank = {
  id: '',
  label: '',
  group: '',
  tags: [],
  protocol: 'ssh',
  host: '',
  port: 22,
  username: '',
  password: '',
  key_id: '',
  jump_host: '',
  startup_command: '',
  color: '',
  notes: '',
  agent_forward: false,
  endpoint: '',
  region: '',
  bucket: '',
  access_key: '',
  secret_key: '',
  path_style: false,
  virtual_hosted: false,
  credential: '',
}
const h = reactive({ ...blank, ...(store.editor.host || {}) })
const tags = ref((h.tags || []).join(', '))
const showPass = ref(false)
const testing = ref(false)
const isNew = !h.id
const groups = computed(() => [...new Set(store.vault.hosts.map((x) => x.group).filter(Boolean))])
const jumpHosts = computed(() => store.vault.hosts.filter((x) => x.protocol === 'ssh' && x.id !== h.id))
const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']

function setProto(p) {
  const def = PROTOCOLS.find((x) => x.id === p)
  if (!h.port || PROTOCOLS.some((x) => x.port === h.port)) h.port = def.port
  h.protocol = p
}
const isObj = computed(() => isObjectStorage(h.protocol))

// S3 URL style: 'path' = https://endpoint/bucket, 'virtual' = https://bucket.endpoint
const urlStyle = computed({
  get: () => (h.path_style ? 'path' : h.virtual_hosted || !h.endpoint ? 'virtual' : 'path'),
  set: (v) => {
    h.path_style = v === 'path'
    h.virtual_hosted = v === 'virtual'
  },
})
function preset(p) {
  h.endpoint = p.endpoint
  h.region = p.region
  urlStyle.value = p.url
}
async function pickCredential() {
  const path = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!path) return
  try {
    h.credential = await api.read_local_text({ path })
  } catch (e) {
    err(e)
  }
}

function payload() {
  return {
    ...h,
    port: +h.port || 0,
    tags: tags.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    label: h.label || (isObj.value ? h.bucket || 'Object storage' : h.host),
  }
}
async function save() {
  if (!isObj.value && !h.host) return toast('Address is required', 'error')
  if ((h.protocol === 'azblob' || h.protocol === 'gcs') && !h.bucket)
    return toast(h.protocol === 'azblob' ? 'Container is required' : 'Bucket is required', 'error')
  try {
    await api.host_save({ host: payload() })
    await loadVault()
    store.editor = null
  } catch (e) {
    err(e)
  }
}
async function test() {
  testing.value = true
  try {
    if (h.protocol === 'ssh') toast(await api.ssh_test({ host: { ...payload(), id: h.id || 'test' } }))
    else {
      const r = await api.fs_open({ host: payload() })
      await api.fs_list({ id: r.id, path: r.home })
      api.fs_close({ id: r.id })
      toast('Connection OK')
    }
  } catch (e) {
    err(e)
  }
  testing.value = false
}
</script>

<template>
  <div class="drawer-bg" @mousedown.self="store.editor = null">
    <form class="drawer" @submit.prevent="save" @keydown.esc="store.editor = null">
      <div class="head">
        <h2>{{ isNew ? 'New Host' : 'Edit Host' }}</h2>
        <button type="button" class="iconbtn" @click="store.editor = null"><Icon name="x" /></button>
      </div>
      <div class="body">
        <div class="protos">
          <button
            v-for="p in PROTOCOLS"
            :key="p.id"
            type="button"
            class="chip"
            :class="{ on: h.protocol === p.id }"
            @click="setProto(p.id)"
          >
            {{ p.label }}
          </button>
        </div>

        <template v-if="!isObj">
          <div class="row">
            <div class="field" style="flex: 3">
              <label>Address</label
              ><input class="input" v-model.trim="h.host" placeholder="192.168.1.10 or example.com" autofocus />
            </div>
            <div class="field" style="flex: 1">
              <label>Port</label><input class="input" v-model.number="h.port" type="number" />
            </div>
          </div>
        </template>

        <div class="row">
          <div class="field">
            <label>Label</label><input class="input" v-model="h.label" :placeholder="h.host || 'My server'" />
          </div>
          <div class="field">
            <label>Group</label>
            <input class="input" v-model="h.group" list="groups" placeholder="Production" />
            <datalist id="groups"><option v-for="g in groups" :key="g" :value="g" /></datalist>
          </div>
        </div>

        <template v-if="h.protocol === 's3'">
          <div class="field">
            <label>Provider preset</label>
            <div class="presets">
              <button v-for="p in S3_PRESETS" :key="p.label" type="button" class="chip" @click="preset(p)">
                {{ p.label }}
              </button>
            </div>
          </div>
          <div class="field">
            <label>Endpoint <span class="dim">(empty = AWS)</span></label
            ><input class="input mono" v-model.trim="h.endpoint" placeholder="https://s3.example.com" />
          </div>
          <div class="row">
            <div class="field">
              <label>Region</label><input class="input" v-model.trim="h.region" placeholder="us-east-1" />
            </div>
            <div class="field">
              <label>Bucket <span class="dim">(optional)</span></label
              ><input class="input" v-model.trim="h.bucket" placeholder="all buckets" />
            </div>
          </div>
          <div class="field"><label>Access key ID</label><input class="input mono" v-model.trim="h.access_key" /></div>
          <div class="field">
            <label>Secret access key</label
            ><input class="input mono" v-model.trim="h.secret_key" :type="showPass ? 'text' : 'password'" />
          </div>
          <div class="field">
            <label>URL style</label>
            <select class="select" v-model="urlStyle">
              <option value="path">Path-style: endpoint/bucket (MinIO, R2, most self-hosted)</option>
              <option value="virtual">Virtual-hosted: bucket.endpoint (AWS, Tencent COS)</option>
            </select>
          </div>
        </template>

        <template v-else-if="h.protocol === 'azblob'">
          <div class="field">
            <label>Storage account name</label
            ><input class="input mono" v-model.trim="h.access_key" placeholder="mystorageaccount" />
          </div>
          <div class="field">
            <label>Account key or SAS token</label
            ><input
              class="input mono"
              v-model.trim="h.secret_key"
              :type="showPass ? 'text' : 'password'"
              placeholder="key, or sv=…&sig=…"
            />
          </div>
          <div class="field">
            <label>Container</label><input class="input" v-model.trim="h.bucket" placeholder="backups" />
          </div>
          <div class="field">
            <label>Endpoint <span class="dim">(optional)</span></label
            ><input
              class="input mono"
              v-model.trim="h.endpoint"
              :placeholder="`https://${h.access_key || '<account>'}.blob.core.windows.net`"
            />
          </div>
          <p class="hint">
            Share links need the account key. With a SAS token you can browse and transfer, but not create links.
          </p>
        </template>

        <template v-else-if="h.protocol === 'gcs'">
          <div class="field">
            <label>Bucket</label><input class="input" v-model.trim="h.bucket" placeholder="my-bucket" />
          </div>
          <div class="field">
            <label>Service account key (JSON)</label>
            <textarea
              class="textarea"
              rows="5"
              v-model="h.credential"
              placeholder='{ "type": "service_account", … }'
            ></textarea>
            <button type="button" class="btn sm" style="align-self: flex-start" @click="pickCredential">
              <Icon name="folder" :size="13" /> Choose file…
            </button>
          </div>
          <div class="field">
            <label>Endpoint <span class="dim">(optional)</span></label
            ><input class="input mono" v-model.trim="h.endpoint" placeholder="https://storage.googleapis.com" />
          </div>
          <p class="hint">
            Leave the key empty for public buckets (read-only). Share links need a service account key.
          </p>
        </template>

        <template v-else>
          <div class="section-title">Credentials</div>
          <div class="field">
            <label>Username</label
            ><input
              class="input"
              v-model.trim="h.username"
              :placeholder="h.protocol === 'ssh' ? 'root' : 'anonymous'"
            />
          </div>
          <div class="field">
            <label>Password</label>
            <div class="pw">
              <input
                class="input"
                v-model="h.password"
                :type="showPass ? 'text' : 'password'"
                placeholder="optional when using a key"
              />
              <button type="button" class="iconbtn" @click="showPass = !showPass"><Icon name="eye" /></button>
            </div>
          </div>
          <template v-if="h.protocol === 'ssh'">
            <div class="field">
              <label>SSH key</label>
              <select class="select" v-model="h.key_id">
                <option value="">— none (try agent & ~/.ssh defaults) —</option>
                <option v-for="k in store.vault.keys" :key="k.id" :value="k.id">{{ k.name }} · {{ k.kind }}</option>
              </select>
            </div>
            <div class="section-title">Advanced</div>
            <div class="field">
              <label>Jump host (ProxyJump)</label>
              <select class="select" v-model="h.jump_host">
                <option value="">— direct connection —</option>
                <option v-for="j in jumpHosts" :key="j.id" :value="j.id">{{ j.label || j.host }}</option>
              </select>
            </div>
            <div class="field">
              <label>Startup command</label
              ><input
                class="input mono"
                v-model="h.startup_command"
                placeholder="e.g. cd /var/www && tmux attach || tmux"
              />
            </div>
            <div class="row tog">
              <button
                type="button"
                class="switch"
                :class="{ on: h.agent_forward }"
                @click="h.agent_forward = !h.agent_forward"
              ></button>
              Agent forwarding
            </div>
          </template>
        </template>

        <div class="section-title">Appearance</div>
        <div class="colors">
          <button
            v-for="c in colors"
            :key="c"
            type="button"
            class="sw"
            :class="{ on: h.color === c }"
            :style="{ background: c || 'var(--bg-4)' }"
            @click="h.color = c"
          >
            <Icon v-if="h.color === c" name="check" :size="12" />
          </button>
        </div>
        <div class="field" style="margin-top: 12px">
          <label>Tags</label><input class="input" v-model="tags" placeholder="web, docker" />
        </div>
        <div class="field"><label>Notes</label><textarea class="textarea" v-model="h.notes" rows="3"></textarea></div>
      </div>
      <div class="foot">
        <button type="button" class="btn" :disabled="testing" @click="test">
          <Icon name="zap" :size="14" /> {{ testing ? 'Testing…' : 'Test' }}
        </button>
        <div style="flex: 1"></div>
        <button type="button" class="btn" @click="store.editor = null">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.drawer-bg {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.3);
  animation: fade 0.12s;
}
.drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(440px, 100vw);
  background: var(--bg-2);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  animation: slidein 0.18s ease-out;
}
@keyframes slidein {
  from {
    transform: translateX(30px);
    opacity: 0;
  }
}
.head {
  display: flex;
  align-items: center;
  padding: 16px 18px 6px;
}
:root[data-os='macos'] .head {
  padding-top: 30px;
}
.head h2 {
  flex: 1;
  margin: 0;
  font-size: 16px;
}
.body {
  flex: 1;
  overflow: auto;
  padding: 8px 18px;
}
.foot {
  display: flex;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--line);
}
.protos,
.presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.presets {
  margin: 0;
}
.protos .chip,
.presets .chip {
  border: 0;
  cursor: pointer;
  height: 26px;
}
.pw {
  display: flex;
  gap: 4px;
  align-items: center;
}
.hint {
  font-size: 12px;
  color: var(--text-3);
  margin: -4px 0 12px;
}
.tog {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 12px;
}
.colors {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sw {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  border: 2px solid transparent;
  cursor: pointer;
  display: grid;
  place-items: center;
  color: #fff;
}
.sw.on {
  border-color: var(--text);
}
</style>
