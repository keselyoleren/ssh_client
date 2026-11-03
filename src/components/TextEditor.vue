<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../lib/api'
import { toast, err, confirm } from '../lib/store'
import Icon from './Icon.vue'

const props = defineProps({ side: Object, entry: Object })
const emit = defineEmits(['close'])
const text = ref('')
const orig = ref('')
const loading = ref(true)
const saving = ref(false)
const ta = ref(null)

onMounted(async () => {
  try {
    text.value = orig.value = await api.fs_read_text({ id: props.side.fsid, path: props.entry.path })
  } catch (e) {
    err(e)
    emit('close')
    return
  }
  loading.value = false
  setTimeout(() => ta.value?.focus())
})
async function save() {
  saving.value = true
  try {
    await api.fs_write_text({ id: props.side.fsid, path: props.entry.path, content: text.value })
    orig.value = text.value
    toast(`Saved ${props.entry.name}`)
  } catch (e) {
    err(e)
  }
  saving.value = false
}
async function close() {
  if (text.value !== orig.value && !(await confirm('Discard unsaved changes?', '', { okText: 'Discard' }))) return
  emit('close')
}
function key(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    save()
  }
  if (e.key === 'Escape') close()
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = ta.value,
      s = el.selectionStart
    text.value = text.value.slice(0, s) + '  ' + text.value.slice(el.selectionEnd)
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = s + 2
    })
  }
}
</script>

<template>
  <div class="overlay" @mousedown.self="close">
    <div class="ed" @keydown="key">
      <div class="eh">
        <Icon name="file" />
        <b class="mono">{{ entry.path }}</b>
        <span v-if="text !== orig" class="chip on">modified</span>
        <div style="flex: 1"></div>
        <button class="btn sm primary" :disabled="saving || text === orig" @click="save">
          {{ saving ? 'Saving…' : 'Save' }} <span class="dim">⌘S</span>
        </button>
        <button class="iconbtn" @click="close"><Icon name="x" /></button>
      </div>
      <div v-if="loading" class="empty">Loading…</div>
      <textarea v-else ref="ta" v-model="text" class="mono" spellcheck="false" wrap="off"></textarea>
    </div>
  </div>
</template>

<style scoped>
.ed {
  width: min(1000px, calc(100vw - 60px));
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
textarea {
  flex: 1;
  border: 0;
  outline: 0;
  resize: none;
  padding: 14px 16px;
  background: var(--bg);
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.55;
  tab-size: 4;
  user-select: text;
}
</style>
