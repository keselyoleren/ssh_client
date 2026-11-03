<script setup>
import { reactive, watch, ref } from 'vue'
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import { store, loadVault, toast, err, prompt } from '../lib/store'
import { api } from '../lib/api'
import { themes } from '../lib/themes'
import Icon from '../components/Icon.vue'

const s = reactive({ ...store.vault.settings })
let t = 0
watch(
  s,
  () => {
    clearTimeout(t)
    store.vault.settings = { ...s }
    t = setTimeout(
      () =>
        api
          .settings_save({
            settings: { ...s, font_size: +s.font_size, scrollback: +s.scrollback, line_height: +s.line_height },
          })
          .catch(err),
      300,
    )
  },
  { deep: true },
)

const preview = ref('user@server:~$ ls -la\n')
const fonts = [
  'JetBrains Mono, Menlo, Consolas, monospace',
  'Menlo, monospace',
  'SF Mono, Menlo, monospace',
  'Fira Code, monospace',
  'Cascadia Code, Consolas, monospace',
  'Consolas, monospace',
  'Ubuntu Mono, monospace',
  "'DejaVu Sans Mono', monospace",
  'Source Code Pro, monospace',
]

async function exportVault() {
  const path = await saveDialog({ defaultPath: `kshell-backup-${new Date().toISOString().slice(0, 10)}.kshell` })
  if (!path) return
  const pass = await prompt('Backup passphrase', {
    password: true,
    label: 'Used to encrypt the backup (Argon2id + XChaCha20)',
    okText: 'Export',
  })
  if (!pass) return
  try {
    await api.backup_export({ path, passphrase: pass })
    toast('Encrypted backup saved')
  } catch (e) {
    err(e)
  }
}
async function importVault() {
  const path = await openDialog({ multiple: false })
  if (!path) return
  const pass = await prompt('Backup passphrase', { password: true, okText: 'Import' })
  if (!pass) return
  try {
    const n = await api.backup_import({ path, passphrase: pass })
    await loadVault()
    Object.assign(s, store.vault.settings)
    toast(`Merged backup (${n} hosts)`)
  } catch (e) {
    err(e)
  }
}
async function importConfig() {
  try {
    const n = await api.import_ssh_config()
    await loadVault()
    toast(`Imported ${n} host(s)`)
  } catch (e) {
    err(e)
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Settings</h1></div>
    <div class="page-body" style="max-width: 760px">
      <div class="section-title">Appearance</div>
      <div class="card pad">
        <div class="set">
          <div><b>App theme</b></div>
          <div class="row">
            <button
              v-for="t in ['dark', 'light']"
              :key="t"
              class="chip"
              :class="{ on: s.app_theme === t }"
              @click="s.app_theme = t"
              style="border: 0; cursor: pointer; height: 28px; padding: 0 14px; text-transform: capitalize"
            >
              {{ t }}
            </button>
          </div>
        </div>
        <div class="set col">
          <b>Terminal theme</b>
          <div class="themes">
            <button
              v-for="(th, id) in themes"
              :key="id"
              class="th"
              :class="{ on: s.term_theme === id }"
              :style="{ background: th.background, color: th.foreground }"
              @click="s.term_theme = id"
            >
              <div class="sw">
                <i
                  v-for="c in ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']"
                  :key="c"
                  :style="{ background: th[c] }"
                ></i>
              </div>
              <span>{{ th.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="section-title">Terminal</div>
      <div class="card pad">
        <div class="set">
          <b>Font</b
          ><select class="select" style="width: 280px" v-model="s.font_family">
            <option v-for="f in fonts" :key="f" :value="f">{{ f.split(',')[0].replace(/'/g, '') }}</option>
          </select>
        </div>
        <div class="set">
          <b>Font size</b
          ><input class="input" type="number" min="8" max="32" style="width: 90px" v-model.number="s.font_size" />
        </div>
        <div class="set">
          <b>Line height</b
          ><input
            class="input"
            type="number"
            step="0.05"
            min="1"
            max="2"
            style="width: 90px"
            v-model.number="s.line_height"
          />
        </div>
        <div class="set">
          <b>Cursor</b>
          <div class="row">
            <button
              v-for="c in ['block', 'bar', 'underline']"
              :key="c"
              class="chip"
              :class="{ on: s.cursor_style === c }"
              @click="s.cursor_style = c"
              style="border: 0; cursor: pointer; height: 28px; padding: 0 12px"
            >
              {{ c }}
            </button>
          </div>
        </div>
        <div class="set">
          <b>Blinking cursor</b
          ><button class="switch" :class="{ on: s.cursor_blink }" @click="s.cursor_blink = !s.cursor_blink"></button>
        </div>
        <div class="set">
          <b>Scrollback lines</b
          ><input class="input" type="number" step="1000" style="width: 110px" v-model.number="s.scrollback" />
        </div>
        <div class="set">
          <div>
            <b>Copy on select</b>
            <div class="dim">Selected text is copied to the clipboard automatically</div>
          </div>
          <button
            class="switch"
            :class="{ on: s.copy_on_select }"
            @click="s.copy_on_select = !s.copy_on_select"
          ></button>
        </div>
        <div class="set">
          <div>
            <b>Right-click pastes</b>
            <div class="dim">Shift + right-click opens the context menu</div>
          </div>
          <button
            class="switch"
            :class="{ on: s.right_click_paste }"
            @click="s.right_click_paste = !s.right_click_paste"
          ></button>
        </div>
        <div class="set">
          <b>Confirm before closing split tabs</b
          ><button class="switch" :class="{ on: s.confirm_close }" @click="s.confirm_close = !s.confirm_close"></button>
        </div>
        <div
          class="prev mono"
          :style="{
            background: themes[s.term_theme]?.background,
            color: themes[s.term_theme]?.foreground,
            fontFamily: s.font_family,
            fontSize: s.font_size + 'px',
            lineHeight: s.line_height,
          }"
        >
          <span :style="{ color: themes[s.term_theme]?.green }">user@server</span>:<span
            :style="{ color: themes[s.term_theme]?.blue }"
            >~</span
          >$ ls -la<br />
          drwxr-xr-x <span :style="{ color: themes[s.term_theme]?.blue }">projects</span>
          <span :style="{ color: themes[s.term_theme]?.green }">deploy.sh</span>
          <span :style="{ color: themes[s.term_theme]?.red }">error.log</span>
        </div>
      </div>

      <div class="section-title">Vault</div>
      <div class="card pad">
        <div class="set">
          <div>
            <b>Import ~/.ssh/config</b>
            <div class="dim">Hosts, users, ports, identity files and ProxyJump</div>
          </div>
          <button class="btn" @click="importConfig"><Icon name="import" :size="14" /> Import</button>
        </div>
        <div class="set">
          <div>
            <b>Encrypted backup</b>
            <div class="dim">
              Export hosts, keys, snippets and rules to a passphrase-protected file — use it to sync devices
            </div>
          </div>
          <div class="row">
            <button class="btn" @click="importVault">Restore…</button
            ><button class="btn" @click="exportVault">Export…</button>
          </div>
        </div>
        <div class="set">
          <div>
            <b>Storage</b>
            <div class="dim">Local only, encrypted with XChaCha20-Poly1305. Key kept in the OS keychain.</div>
          </div>
          <Icon name="lock" style="color: var(--ok)" />
        </div>
      </div>

      <div class="section-title">Shortcuts</div>
      <div class="card pad keys">
        <div
          v-for="[k, d] in [
            ['⌘K', 'Quick connect / command palette'],
            ['⌘T', 'New local terminal'],
            ['⌘W', 'Close tab'],
            ['⌘D', 'Split right'],
            ['⇧⌘D', 'Split down'],
            ['⌘F', 'Find in terminal'],
            ['⌘1…9', 'Switch tab'],
          ]"
          :key="k"
          class="set"
        >
          <span>{{ d }}</span
          ><kbd>{{
            store.platform.os === 'macos' ? k : k.replace('⇧⌘', 'Ctrl+Shift+').replace('⌘', 'Ctrl+Shift+')
          }}</kbd>
        </div>
      </div>
      <p class="dim" style="text-align: center; margin-top: 24px">K-Shell 0.1.0 · Tauri + Rust</p>
    </div>
  </div>
</template>

<style scoped>
.pad {
  padding: 4px 16px;
}
.set {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.set:last-child {
  border-bottom: 0;
}
.set.col {
  flex-direction: column;
  align-items: stretch;
}
.set .dim {
  font-size: 12px;
}
.themes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.th {
  height: 58px;
  border-radius: 9px;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  text-align: left;
  font-size: 12px;
}
.th.on {
  border-color: var(--accent);
}
.sw {
  display: flex;
  gap: 3px;
}
.sw i {
  width: 12px;
  height: 6px;
  border-radius: 2px;
}
.prev {
  margin: 12px 0;
  padding: 12px 14px;
  border-radius: 9px;
}
kbd {
  font-family: inherit;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg-3);
  border: 1px solid var(--line);
}
.keys .set {
  padding: 8px 0;
}
</style>
