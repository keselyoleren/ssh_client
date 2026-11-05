<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { api, fmtSize } from '../lib/api'
import { err } from '../lib/store'
import { extOf, IMAGE_MIME } from '../lib/filetypes'
import Icon from './Icon.vue'

const props = defineProps({ side: Object, entry: Object })
const emit = defineEmits(['close', 'external'])
const url = ref('')
const dims = ref('')
const loading = ref(true)
const box = ref(null)

onMounted(async () => {
  setTimeout(() => box.value?.focus())
  try {
    const buf = await api.fs_read_bytes({ id: props.side.fsid, path: props.entry.path })
    const ext = extOf(props.entry.name)
    url.value = URL.createObjectURL(new Blob([buf], { type: IMAGE_MIME[ext] || `image/${ext}` }))
  } catch (e) {
    err(e)
    emit('close')
  }
  loading.value = false
})
onBeforeUnmount(() => url.value && URL.revokeObjectURL(url.value))

function loaded(ev) {
  const i = ev.target
  if (i.naturalWidth) dims.value = `${i.naturalWidth} × ${i.naturalHeight}`
}
function broken() {
  err(`Can't display ${props.entry.name}`)
  emit('close')
}
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <div ref="box" class="iv" tabindex="-1" @keydown.esc="emit('close')">
      <div class="eh">
        <Icon name="file" />
        <b class="mono path">{{ entry.path }}</b>
        <span class="dim">{{ [dims, fmtSize(entry.size)].filter(Boolean).join(' · ') }}</span>
        <div style="flex: 1"></div>
        <button class="btn sm" @click="emit('external')"><Icon name="popout" :size="13" /> Open in default app</button>
        <button class="iconbtn" @click="emit('close')"><Icon name="x" /></button>
      </div>
      <div class="stage">
        <div v-if="loading" class="empty">Loading…</div>
        <img v-else-if="url" :src="url" :alt="entry.name" @load="loaded" @error="broken" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.iv {
  width: min(1100px, calc(100vw - 60px));
  height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow: hidden;
  outline: none;
}
.eh {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--line);
  min-width: 0;
}
.path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  /* checkerboard so transparent images stay visible */
  background: repeating-conic-gradient(color-mix(in srgb, var(--line) 60%, transparent) 0% 25%, transparent 0% 50%)
    50% / 20px 20px;
}
.stage img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  image-rendering: auto;
}
</style>
