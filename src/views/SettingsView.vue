<script setup>
import { ref, computed, onMounted } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { checkForUpdate, installUpdate } from '../lib/updater'
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import { store, loadVault, toast, err, prompt, confirm } from '../lib/store'
import { api } from '../lib/api'
import { themes, isDarkTheme } from '../lib/themes'
import { ACCENTS, ZOOMS, appMode, termTheme, termThemeId } from '../lib/appearance'
import { hint } from '../lib/keymap'
import Icon from '../components/Icon.vue'
import ShortcutEditor from '../components/ShortcutEditor.vue'
import PromptEditor from '../components/PromptEditor.vue'
import { SEGMENTS, DEFAULT_PROMPT } from '../lib/prompt'

// Edited in place; lib/store.js persists every change.
const s = computed(() => store.vault.settings)

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'eye' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'grid' },
  { id: 'vault', label: 'Vault & backup', icon: 'lock' },
  { id: 'about', label: 'About', icon: 'info' },
]

const version = ref('')
onMounted(async () => {
  try {
    version.value = await getVersion()
  } catch {}
})

// ---------- appearance ----------

const MODES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System', sub: 'Follows your OS' },
]

const accentNow = computed(() => s.value.accent || '')
const customAccent = computed(() => accentNow.value && !ACCENTS.some((a) => a.color === accentNow.value))

const zoomPct = (z) => Math.round(z * 100) + '%'
const zoomKeys = computed(() => [hint('zoom_in'), hint('zoom_out'), hint('zoom_reset')].filter(Boolean).join(' · '))

// which slot a click on a terminal theme card assigns when "match app mode" is on
const slot = ref(appMode() === 'light' ? 'light' : 'dark')
/** Terminal themes split into dark and light; the light ones first while picking the light-mode theme. */
const themeGroups = computed(() => {
  const all = Object.entries(themes)
  const dark = { label: 'Dark', items: all.filter(([, t]) => isDarkTheme(t)) }
  const light = { label: 'Light', items: all.filter(([, t]) => !isDarkTheme(t)) }
  return s.value.term_theme_sync && slot.value === 'light' ? [light, dark] : [dark, light]
})
function pickTermTheme(id) {
  if (s.value.term_theme_sync && slot.value === 'light') s.value.term_theme_light = id
  else s.value.term_theme = id
}
const darkThemeId = computed(() => s.value.term_theme || 'kshell')
const lightThemeId = computed(() => s.value.term_theme_light || 'light')

// ---------- terminal ----------

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
// keep the saved font selectable even when it isn't one of the presets (e.g. the built-in default)
const fontOptions = computed(() =>
  !s.value.font_family || fonts.includes(s.value.font_family) ? fonts : [s.value.font_family, ...fonts],
)
const fontName = (f) => f.split(',')[0].replace(/'/g, '')
function bump(key, d, min, max, step = 1) {
  const v = Math.round(((+s.value[key] || 0) + d * step) * 100) / 100
  s.value[key] = Math.min(max, Math.max(min, v))
}

// ---------- prompt ----------

const editingPrompt = ref(false)
const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const promptLines = computed(() => {
  const out = [[]]
  for (const id of s.value.prompt_segments || DEFAULT_PROMPT)
    if (id === 'newline') out.push([])
    else if (SEGMENTS[id]) out.at(-1).push(id)
  return out
})
const segColor = (id) => termTheme()[ANSI[SEGMENTS[id].color]]

// ---------- autosuggestions ----------

const historyCount = computed(() => store.vault.history?.length || 0)
async function clearHistory() {
  if (
    !(await confirm('Clear command history?', `${historyCount.value} commands will be forgotten.`, { okText: 'Clear' }))
  )
    return
  try {
    await api.history_clear()
    store.vault.history = []
    toast('Command history cleared')
  } catch (e) {
    err(e)
  }
}

// ---------- vault ----------

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
    <div class="page-body layout">
      <nav class="snav">
        <button
          v-for="sec in SECTIONS"
          :key="sec.id"
          :class="{ on: store.settingsTab === sec.id }"
          @click="store.settingsTab = sec.id"
        >
          <Icon :name="sec.icon" :size="15" /> <span>{{ sec.label }}</span>
        </button>
      </nav>

      <div class="sbody">
        <!-- ================= Appearance ================= -->
        <template v-if="store.settingsTab === 'appearance'">
          <div class="section-title">Theme</div>
          <div class="modes">
            <button
              v-for="m in MODES"
              :key="m.id"
              class="mode"
              :class="{ on: (s.app_theme || 'dark') === m.id }"
              @click="s.app_theme = m.id"
            >
              <div class="mock" :class="m.id">
                <div class="mk dark"><i class="sd"></i><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
                <div class="mk light"><i class="sd"></i><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
              </div>
              <div class="mlabel">
                <span class="radio"></span>
                <b>{{ m.label }}</b>
                <span v-if="m.sub" class="dim">{{ m.sub }}</span>
              </div>
            </button>
          </div>

          <div class="section-title">Accent color</div>
          <div class="card pad">
            <div class="set">
              <div>
                <b>Highlight color</b>
                <div class="dim">Buttons, active items, switches and focus rings</div>
              </div>
              <div class="swatches">
                <button
                  v-for="a in ACCENTS"
                  :key="a.color"
                  class="swatch"
                  :class="{ on: accentNow === a.color }"
                  :style="{ background: a.swatch || a.color }"
                  :title="a.name"
                  @click="s.accent = a.color"
                >
                  <Icon v-if="accentNow === a.color" name="check" :size="12" />
                </button>
                <label
                  class="swatch custom"
                  :class="{ on: customAccent }"
                  :style="customAccent ? { background: accentNow } : null"
                  title="Custom color"
                >
                  <Icon :name="customAccent ? 'check' : 'plus'" :size="12" />
                  <input type="color" :value="accentNow || '#e07a45'" @input="s.accent = $event.target.value" />
                </label>
              </div>
            </div>
          </div>

          <div class="section-title">Window</div>
          <div class="card pad">
            <div class="set">
              <div>
                <b>Show sidebar</b>
                <div class="dim">
                  The menu on the left. Hide it for more room<span v-if="hint('toggle_sidebar')">
                    · {{ hint('toggle_sidebar') }}</span
                  >
                </div>
              </div>
              <button
                class="switch"
                :class="{ on: !s.sidebar_hidden }"
                @click="s.sidebar_hidden = !s.sidebar_hidden"
              ></button>
            </div>
            <div class="set">
              <div>
                <b>Zoom</b>
                <div class="dim">
                  Scales the whole interface, terminals included<span v-if="zoomKeys"> · {{ zoomKeys }}</span>
                </div>
              </div>
              <div class="row">
                <button v-if="(+s.ui_zoom || 1) !== 1" class="btn ghost sm" @click="s.ui_zoom = 1">
                  Reset to default
                </button>
                <select class="select" style="width: 150px" v-model.number="s.ui_zoom">
                  <option v-for="z in ZOOMS" :key="z" :value="z">
                    {{ zoomPct(z) }}{{ z === 1 ? ' (default)' : '' }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div class="section-title">Terminal theme</div>
          <div class="card pad">
            <div class="set">
              <div>
                <b>Match app light / dark mode</b>
                <div class="dim">Use a separate terminal theme while K-Shell is in light mode</div>
              </div>
              <button
                class="switch"
                :class="{ on: s.term_theme_sync }"
                @click="s.term_theme_sync = !s.term_theme_sync"
              ></button>
            </div>
            <div v-if="s.term_theme_sync" class="slots">
              <button
                v-for="sl in ['dark', 'light']"
                :key="sl"
                class="slotbtn"
                :class="{ on: slot === sl }"
                @click="slot = sl"
              >
                <span class="dim">{{ sl === 'dark' ? 'Dark mode' : 'Light mode' }}</span>
                <b>{{ themes[sl === 'dark' ? darkThemeId : lightThemeId]?.name }}</b>
              </button>
            </div>
            <template v-for="g in themeGroups" :key="g.label">
              <div class="tgroup">
                {{ g.label }} <span class="dim">· {{ g.items.length }}</span>
              </div>
              <div class="themes">
                <button
                  v-for="[id, th] in g.items"
                  :key="id"
                  class="tcard"
                  :class="{
                    on: s.term_theme_sync
                      ? (slot === 'light' ? lightThemeId : darkThemeId) === id
                      : termThemeId() === id,
                  }"
                  @click="pickTermTheme(id)"
                >
                  <div class="tprev mono" :style="{ background: th.background, color: th.foreground }">
                    <div>
                      <span :style="{ color: th.green }">➜</span> <span :style="{ color: th.cyan }">~/app</span> ls
                    </div>
                    <div>
                      <span :style="{ color: th.blue }">src</span>&nbsp;
                      <span :style="{ color: th.green }">run.sh</span>&nbsp;
                      <span :style="{ color: th.red }">err.log</span>
                    </div>
                    <div>
                      <span :style="{ color: th.magenta }">$</span>
                      <i class="cur" :style="{ background: th.cursor }"></i>
                    </div>
                  </div>
                  <div class="tname">
                    <span>{{ th.name }}</span>
                    <template v-if="s.term_theme_sync">
                      <span v-if="darkThemeId === id" class="mtag">Dark</span>
                      <span v-if="lightThemeId === id" class="mtag">Light</span>
                    </template>
                  </div>
                </button>
              </div>
            </template>
          </div>
        </template>

        <!-- ================= Terminal ================= -->
        <template v-else-if="store.settingsTab === 'terminal'">
          <div
            class="prev mono"
            :style="{
              background: termTheme().background,
              color: termTheme().foreground,
              fontFamily: s.font_family,
              fontSize: s.font_size + 'px',
              lineHeight: s.line_height,
            }"
          >
            <span :style="{ color: termTheme().green }">user@server</span>:<span :style="{ color: termTheme().blue }"
              >~</span
            >$ ls -la<br />
            drwxr-xr-x <span :style="{ color: termTheme().blue }">projects</span>&nbsp;&nbsp;<span
              :style="{ color: termTheme().green }"
              >deploy.sh</span
            >&nbsp;&nbsp;<span :style="{ color: termTheme().red }">error.log</span><br />
            <span :style="{ color: termTheme().green }">user@server</span>:<span :style="{ color: termTheme().blue }"
              >~</span
            >$ <i class="pcur" :class="s.cursor_style" :style="{ '--c': termTheme().cursor }"></i>
          </div>

          <div class="section-title">Text</div>
          <div class="card pad">
            <div class="set">
              <b>Font</b
              ><select class="select" style="width: 240px" v-model="s.font_family">
                <option v-for="f in fontOptions" :key="f" :value="f" :style="{ fontFamily: f }">
                  {{ fontName(f) }}
                </option>
              </select>
            </div>
            <div class="set">
              <b>Font size</b>
              <div class="stepper">
                <button @click="bump('font_size', -1, 8, 32)">−</button
                ><input type="number" min="8" max="32" v-model.number="s.font_size" /><button
                  @click="bump('font_size', 1, 8, 32)"
                >
                  +
                </button>
              </div>
            </div>
            <div class="set">
              <b>Line height</b>
              <div class="stepper">
                <button @click="bump('line_height', -1, 1, 2, 0.05)">−</button
                ><input type="number" step="0.05" min="1" max="2" v-model.number="s.line_height" /><button
                  @click="bump('line_height', 1, 1, 2, 0.05)"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div class="section-title">Prompt</div>
          <div class="card pad">
            <div class="set">
              <div>
                <b>K-Shell prompt</b>
                <div class="dim">Replace the shell prompt in new bash and zsh sessions</div>
              </div>
              <button
                class="switch"
                :class="{ on: s.prompt_enabled }"
                @click="s.prompt_enabled = !s.prompt_enabled"
              ></button>
            </div>
            <div class="set col" :class="{ off: !s.prompt_enabled }">
              <div
                class="promptprev mono"
                :style="{ background: termTheme().background, color: termTheme().foreground }"
                @click="editingPrompt = true"
              >
                <div v-for="(line, li) in promptLines" :key="li">
                  <template v-for="(id, k) in line" :key="k"
                    ><span :style="{ color: segColor(id) }">{{ SEGMENTS[id].sample }}</span
                    >{{ ' ' }}</template
                  ><i
                    v-if="li === promptLines.length - 1"
                    class="pcur block"
                    :style="{ '--c': termTheme().cursor }"
                  ></i>
                </div>
                <span class="editbtn"><Icon name="edit" :size="13" /> Edit prompt</span>
              </div>
            </div>
            <div class="set" :class="{ off: !s.prompt_enabled }">
              <div>
                <b>Apply to</b>
                <div class="dim">New sessions only. Hosts with a startup command keep their own prompt.</div>
              </div>
              <div class="seg">
                <button
                  v-for="[v, l] in [
                    ['all', 'All sessions'],
                    ['local', 'Local'],
                    ['ssh', 'SSH'],
                  ]"
                  :key="v"
                  :class="{ on: (s.prompt_scope || 'all') === v }"
                  @click="s.prompt_scope = v"
                >
                  {{ l }}
                </button>
              </div>
            </div>
          </div>
          <PromptEditor v-if="editingPrompt" @close="editingPrompt = false" />

          <div class="section-title">Autosuggestions</div>
          <div class="card pad">
            <div class="set">
              <div>
                <b>Suggest commands as you type</b>
                <div class="dim">
                  Completes the line from commands you ran before and your snippets.
                  <template v-if="hint('accept_suggestion')">
                    Press <kbd>{{ hint('accept_suggestion') }}</kbd> to accept<template
                      v-if="hint('accept_suggestion_word')"
                    >
                      or <kbd>{{ hint('accept_suggestion_word') }}</kbd> for one word</template
                    >.
                  </template>
                </div>
              </div>
              <button
                class="switch"
                :class="{ on: s.autosuggest !== false }"
                @click="s.autosuggest = s.autosuggest === false"
              ></button>
            </div>
            <div class="set">
              <div>
                <b>Remember command history</b>
                <div class="dim">
                  Kept in the encrypted vault. Hidden input such as passwords and commands starting with a space are
                  never saved. When off, new commands are only kept until K-Shell quits.
                </div>
              </div>
              <button
                class="switch"
                :class="{ on: s.save_history !== false }"
                @click="s.save_history = s.save_history === false"
              ></button>
            </div>
            <div class="set">
              <div>
                <b>Command history</b>
                <div class="dim">{{ historyCount }} command{{ historyCount === 1 ? '' : 's' }}</div>
              </div>
              <button class="btn" :disabled="!historyCount" @click="clearHistory">
                <Icon name="trash" :size="13" /> Clear
              </button>
            </div>
          </div>

          <div class="section-title">Cursor</div>
          <div class="card pad">
            <div class="set">
              <b>Style</b>
              <div class="seg">
                <button
                  v-for="c in ['block', 'bar', 'underline']"
                  :key="c"
                  :class="{ on: s.cursor_style === c }"
                  @click="s.cursor_style = c"
                >
                  <i class="pcur" :class="c" style="--c: currentColor"></i> {{ c }}
                </button>
              </div>
            </div>
            <div class="set">
              <b>Blinking cursor</b
              ><button
                class="switch"
                :class="{ on: s.cursor_blink }"
                @click="s.cursor_blink = !s.cursor_blink"
              ></button>
            </div>
          </div>

          <div class="section-title">Behavior</div>
          <div class="card pad">
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
              <div>
                <b>Reconnect SSH automatically</b>
                <div class="dim">When a connection drops, retry for about 3 minutes</div>
              </div>
              <button
                class="switch"
                :class="{ on: s.auto_reconnect }"
                @click="s.auto_reconnect = !s.auto_reconnect"
              ></button>
            </div>
            <div class="set">
              <div>
                <b>Reopen tabs on launch</b>
                <div class="dim">Tabs and split panes from the last session open again, and their sessions connect</div>
              </div>
              <button class="switch" :class="{ on: s.restore_tabs }" @click="s.restore_tabs = !s.restore_tabs"></button>
            </div>
            <div class="set">
              <b>Confirm before closing split tabs</b
              ><button
                class="switch"
                :class="{ on: s.confirm_close }"
                @click="s.confirm_close = !s.confirm_close"
              ></button>
            </div>
          </div>
        </template>

        <!-- ================= Shortcuts ================= -->
        <template v-else-if="store.settingsTab === 'shortcuts'">
          <div class="section-title">Keyboard shortcuts</div>
          <ShortcutEditor />
        </template>

        <!-- ================= Vault ================= -->
        <template v-else-if="store.settingsTab === 'vault'">
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
        </template>

        <!-- ================= About ================= -->
        <template v-else>
          <div class="section-title">About</div>
          <div class="card pad">
            <div class="set">
              <div>
                <b>K-Shell {{ version }}</b>
                <div class="dim" v-if="store.update.state === 'available'">
                  Version {{ store.update.version }} is available
                </div>
                <div class="dim" v-else>Updates are checked automatically every few hours</div>
              </div>
              <button v-if="store.update.state === 'available'" class="btn primary" @click="installUpdate">
                Update to {{ store.update.version }}
              </button>
              <button
                v-else
                class="btn"
                :disabled="store.update.checking || store.update.state !== 'idle'"
                @click="checkForUpdate({ manual: true })"
              >
                {{ store.update.checking ? 'Checking…' : 'Check for updates' }}
              </button>
            </div>
          </div>
          <p class="dim" style="text-align: center; margin-top: 24px">K-Shell {{ version }} · Tauri + Rust</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.snav {
  position: sticky;
  top: 0;
  width: 190px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 14px;
}
.snav button {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: none;
  color: var(--menu-text);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.snav button:hover {
  background: var(--bg-3);
  color: var(--text);
}
.snav button.on {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  font-weight: 650;
}
.sbody {
  flex: 1;
  min-width: 0;
  max-width: 760px;
}
@media (max-width: 860px) {
  .layout {
    flex-direction: column;
    gap: 0;
  }
  .snav {
    position: static;
    width: auto;
    flex-direction: row;
    flex-wrap: wrap;
  }
}

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
.set .dim {
  font-size: 12px;
}

/* theme mode cards */
.modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.mode {
  padding: 8px;
  border-radius: 12px;
  border: 2px solid var(--line);
  background: var(--bg-2);
  cursor: pointer;
  text-align: left;
}
.mode:hover {
  border-color: var(--text-3);
}
.mode.on {
  border-color: var(--accent);
}
.mock {
  position: relative;
  height: 74px;
  border-radius: 7px;
  overflow: hidden;
  border: 1px solid var(--line);
}
.mk {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 0 12px 0 calc(28% + 10px);
}
.mk i {
  display: block;
  height: 9px;
}
.mk .sd {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 28%;
  height: auto;
  border-radius: 0;
}
.mk i {
  border-radius: 3px;
}
.mk.dark {
  background: #12151d;
}
.mk.dark .sd {
  background: #0d1017;
}
.mk.dark .b1,
.mk.dark .b3 {
  background: #262c3b;
}
.mk.light {
  background: #f6f7fb;
}
.mk.light .sd {
  background: #e3e6ee;
}
.mk.light .b1,
.mk.light .b3 {
  background: #dde1ea;
}
.mk .b2 {
  background: var(--accent);
  width: 55%;
}
.mk .b3 {
  width: 75%;
}
.mock.dark .mk.light,
.mock.light .mk.dark {
  display: none;
}
.mock.system .mk.light {
  clip-path: polygon(62% 0, 100% 0, 100% 100%, 38% 100%);
}
.mlabel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 2px 1px;
  flex-wrap: wrap;
}
.mlabel .dim {
  font-size: 11.5px;
}
.radio {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--text-3);
  flex: none;
}
.mode.on .radio {
  border: 4px solid var(--accent);
}

/* accent */
.swatches {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.swatch {
  position: relative;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 0;
  display: grid;
  place-items: center;
  color: #fff;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  transition: transform 0.1s;
}
.swatch:hover {
  transform: scale(1.12);
}
.swatch.on {
  box-shadow:
    0 0 0 2px var(--bg-2),
    0 0 0 4px var(--text-3);
}
.swatch.custom {
  background: conic-gradient(#f43f5e, #eab308, #22c55e, #06b6d4, #6366f1, #ec4899, #f43f5e);
}
.swatch.custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

/* terminal theme cards */
.slots {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 2px 0 12px;
}
.slotbtn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--bg);
  cursor: pointer;
  font-size: 12px;
}
.slotbtn.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
.tgroup {
  margin: 14px 0 8px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-2);
}
.themes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
  padding: 4px 0 14px;
}
.tcard {
  padding: 0;
  border-radius: 10px;
  border: 2px solid var(--line);
  background: var(--bg-3);
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  transition: transform 0.1s;
}
.tcard:hover {
  transform: translateY(-1px);
  border-color: var(--text-3);
}
.tcard.on {
  border-color: var(--accent);
}
.tprev {
  padding: 9px 10px;
  font-size: 10.5px;
  line-height: 1.55;
  white-space: nowrap;
  overflow: hidden;
}
.cur {
  display: inline-block;
  width: 6px;
  height: 11px;
  vertical-align: -2px;
}
.tname {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  font-size: 12px;
}
.tname span:first-child {
  flex: 1;
}
.mtag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 99px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}

.set .dim kbd {
  font-family: inherit;
  font-size: 11px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--bg-3);
  border: 1px solid var(--line);
}

/* prompt */
.set.col {
  flex-direction: column;
  align-items: stretch;
}
.set.off {
  opacity: 0.5;
}
.promptprev {
  position: relative;
  padding: 12px 14px;
  border-radius: 9px;
  border: 1px solid var(--line);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  cursor: pointer;
}
.promptprev:hover {
  border-color: var(--accent);
}
.editbtn {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  font:
    12px -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  background: var(--bg-2);
  color: var(--text);
  border: 1px solid var(--line);
}

/* terminal */
.prev {
  margin: 14px 0 0;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--line);
}
.pcur {
  display: inline-block;
  vertical-align: middle;
  width: 0.6em;
  height: 1.1em;
  background: var(--c);
}
.pcur.bar {
  width: 2px;
}
.pcur.underline {
  height: 2px;
  vertical-align: bottom;
  margin-bottom: 0.15em;
}
.seg {
  display: inline-flex;
  padding: 2px;
  border-radius: 8px;
  background: var(--bg-3);
  border: 1px solid var(--line);
}
.seg button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 11px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-2);
  cursor: pointer;
  text-transform: capitalize;
}
.seg button.on {
  background: var(--bg-2);
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.seg .pcur {
  font-size: 12px;
}
.stepper {
  display: inline-flex;
  align-items: stretch;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg);
}
.stepper button {
  width: 30px;
  border: 0;
  background: var(--bg-3);
  cursor: pointer;
  font-size: 15px;
}
.stepper button:hover {
  background: var(--bg-4);
}
.stepper input {
  width: 56px;
  border: 0;
  outline: 0;
  background: none;
  text-align: center;
  -moz-appearance: textfield;
}
.stepper input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
</style>
