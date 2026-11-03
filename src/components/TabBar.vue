<script setup>
import { store, closeTab, openLocal, confirm } from '../lib/store'
import Icon from './Icon.vue'
import { installUpdate } from '../lib/updater'
import { computed } from 'vue'

let dragId = null
function onDrop(target) {
  if (!dragId || dragId === target) return
  const from = store.tabs.findIndex((t) => t.id === dragId)
  const to = store.tabs.findIndex((t) => t.id === target)
  const [t] = store.tabs.splice(from, 1)
  store.tabs.splice(to, 0, t)
  dragId = null
}
async function close(t) {
  if (
    t.kind === 'term' &&
    store.vault.settings.confirm_close &&
    t.target?.kind !== 'local' &&
    t.root.type === 'split'
  ) {
    if (!(await confirm('Close tab?', 'All panes in this tab will be disconnected.', { okText: 'Close' }))) return
  }
  closeTab(t.id)
}

const updateLabel = computed(() => {
  const u = store.update
  if (u.state === 'downloading') return u.progress == null ? 'Downloading…' : `Downloading ${u.progress}%`
  if (u.state === 'installing') return 'Installing…'
  if (u.state === 'restarting') return 'Restarting…'
  return 'Update K-Shell'
})
</script>

<template>
  <header class="tabs" data-tauri-drag-region>
    <button class="tab vault" :class="{ on: store.active === 'vault' }" @click="store.active = 'vault'">
      <Icon name="grid" :size="14" /> Vault
    </button>
    <div class="scroll" data-tauri-drag-region>
      <div
        v-for="t in store.tabs"
        :key="t.id"
        class="tab"
        :class="{ on: store.active === t.id }"
        draggable="true"
        @dragstart="dragId = t.id"
        @dragover.prevent
        @drop="onDrop(t.id)"
        @click="store.active = t.id"
        @mousedown.middle.prevent="close(t)"
      >
        <span
          class="dot"
          :style="{ background: t.color || (t.kind === 'sftp' ? 'var(--accent-2)' : 'var(--accent)') }"
        ></span>
        <Icon :name="t.kind === 'sftp' ? 'folder' : 'terminal'" :size="13" />
        <span class="title">{{ t.title }}</span>
        <button class="x" @click.stop="close(t)"><Icon name="x" :size="12" /></button>
      </div>
      <button class="iconbtn add" title="New local terminal (⌘T)" @click="openLocal()">
        <Icon name="plus" :size="15" />
      </button>
    </div>
    <button
      v-if="store.update.state !== 'idle'"
      class="update-btn"
      :disabled="store.update.state !== 'available'"
      :title="`K-Shell ${store.update.version} is available`"
      @click="installUpdate"
    >
      {{ updateLabel }}
    </button>
    <button class="iconbtn" title="Quick connect (⌘K)" @click="store.palette = true">
      <Icon name="search" :size="15" />
    </button>
  </header>
</template>

<style scoped>
.update-btn {
  flex: none;
  height: 28px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
}
.update-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}
.update-btn:disabled {
  cursor: progress;
  opacity: 0.85;
}
.tabs {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  background: var(--side);
  border-bottom: 1px solid var(--line);
}
.scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  height: 100%;
}
.scroll::-webkit-scrollbar {
  height: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 8px 0 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: none;
  color: var(--text-2);
  cursor: pointer;
  flex: none;
  max-width: 220px;
}
.tab:hover {
  background: var(--bg-3);
}
.tab.on {
  background: var(--bg-3);
  border-color: var(--line);
  color: var(--text);
}
.tab.vault {
  font-weight: 600;
  padding: 0 12px;
}
.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}
.x {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 0;
  background: none;
  color: var(--text-3);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
}
.tab:hover .x,
.tab.on .x {
  opacity: 1;
}
.x:hover {
  background: var(--bg-4);
  color: var(--text);
}
.add {
  flex: none;
}
</style>
