<script setup>
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { api } from '../lib/api'
import { store, toast, err, confirm } from '../lib/store'
import { termTheme } from '../lib/appearance'
import Icon from './Icon.vue'

const props = defineProps({ side: Object, entry: Object })
const emit = defineEmits(['close', 'binary'])
const host = ref(null)
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)
const info = ref(null) // { language, indent, eol }
const pos = ref({ line: 1, col: 1 })
const saveHint = store.platform.os === 'macos' ? '⌘S' : 'Ctrl+S'
let ed = null

onMounted(async () => {
  let doc
  try {
    const [text, mod] = await Promise.all([
      api.fs_read_text({ id: props.side.fsid, path: props.entry.path }),
      import('../lib/codeeditor'), // CodeMirror is only loaded when a file is opened
    ])
    doc = { text, createEditor: mod.createEditor }
  } catch (e) {
    if (/not valid UTF-8/.test(String(e))) return emit('binary') // opens in the default app instead
    err(e)
    emit('close')
    return
  }
  loading.value = false
  await nextTick()
  ed = doc.createEditor(host.value, {
    doc: doc.text,
    name: props.entry.name,
    colors: termTheme(),
    onSave: save,
    onEscape: close,
    onDirty: (d) => (dirty.value = d),
    onStatus: (p) => (pos.value = p),
  })
  info.value = ed.info
  ed.view.focus()
})
onBeforeUnmount(() => ed?.view.destroy())

// follow terminal theme / light-dark changes while open
watch(
  () => [store.vault.settings.term_theme, store.vault.settings.term_theme_light, store.systemDark],
  () => ed?.setColors(termTheme()),
)

async function save() {
  if (!ed || saving.value) return
  saving.value = true
  const doc = ed.doc()
  try {
    await api.fs_write_text({ id: props.side.fsid, path: props.entry.path, content: ed.text() })
    ed.markSaved(doc)
    toast(`Saved ${props.entry.name}`)
  } catch (e) {
    err(e)
  }
  saving.value = false
}
async function close() {
  if (dirty.value && !(await confirm('Discard unsaved changes?', '', { okText: 'Discard' }))) return
  emit('close')
}
/** Esc from the header buttons (inside the editor CodeMirror handles it). */
function key(e) {
  if (e.key === 'Escape' && !e.defaultPrevented && !e.target.closest('.cm-editor')) close()
}
const indentLabel = (i) => (i === '\t' ? 'Tabs' : `Spaces: ${i.length}`)
</script>

<template>
  <div class="overlay" @mousedown.self="close">
    <div class="ed" @keydown="key">
      <div class="eh">
        <Icon name="file" />
        <b class="mono">{{ entry.path }}</b>
        <span v-if="dirty" class="chip on">modified</span>
        <div style="flex: 1"></div>
        <button class="btn sm primary" :disabled="saving || !dirty" @click="save">
          {{ saving ? 'Saving…' : 'Save' }} <span class="dim">{{ saveHint }}</span>
        </button>
        <button class="iconbtn" @click="close"><Icon name="x" /></button>
      </div>
      <div v-if="loading" class="empty">Loading…</div>
      <div
        v-else
        ref="host"
        class="code"
        :style="{ fontFamily: store.vault.settings.font_family || 'ui-monospace, Menlo, Consolas, monospace' }"
      ></div>
      <div v-if="info" class="sb">
        <span>{{ info.language }}</span>
        <span>{{ indentLabel(info.indent) }}</span>
        <span>{{ info.eol === '\r\n' ? 'CRLF' : 'LF' }}</span>
        <span>UTF-8</span>
        <div style="flex: 1"></div>
        <span>Ln {{ pos.line }}, Col {{ pos.col }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ed {
  width: min(1100px, calc(100vw - 60px));
  height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.eh {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--line);
}
.eh b {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.code {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  -webkit-user-select: text;
  user-select: text;
}
.sb {
  display: flex;
  gap: 16px;
  padding: 4px 14px;
  border-top: 1px solid var(--line);
  font-size: 11.5px;
  color: var(--text-3);
}
</style>
