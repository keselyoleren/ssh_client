<script setup>
import { store, openLocal, openSftp } from '../lib/store'
import Icon from './Icon.vue'
import Logo from './Logo.vue'

const items = [
  { id: 'hosts', icon: 'server', label: 'Hosts' },
  { id: 'keys', icon: 'key', label: 'Keychain' },
  { id: 'forwards', icon: 'forward', label: 'Port Forwarding' },
  { id: 'snippets', icon: 'code', label: 'Snippets' },
  { id: 'known', icon: 'shield', label: 'Known Hosts' },
]
function go(id) {
  store.view = id
  store.active = 'vault'
}
</script>

<template>
  <aside class="side">
    <div class="drag" data-tauri-drag-region></div>
    <div class="brand" data-tauri-drag-region>
      <Logo :size="26" />
      <span>K-Shell</span>
    </div>
    <nav>
      <button
        v-for="i in items"
        :key="i.id"
        :class="{ on: store.active === 'vault' && store.view === i.id }"
        @click="go(i.id)"
      >
        <Icon :name="i.icon" /> <span>{{ i.label }}</span>
        <span v-if="i.id === 'forwards' && store.activeForwards.length" class="count">{{
          store.activeForwards.length
        }}</span>
      </button>
      <div class="sep"></div>
      <button @click="openLocal()"><Icon name="terminal" /> <span>Local Terminal</span></button>
      <button @click="openSftp()"><Icon name="folder" /> <span>File Manager</span></button>
    </nav>
    <div class="grow"></div>
    <nav>
      <button :class="{ on: store.active === 'vault' && store.view === 'settings' }" @click="go('settings')">
        <Icon name="settings" /> <span>Settings</span>
      </button>
    </nav>
  </aside>
</template>

<style scoped>
.side {
  width: 212px;
  flex: none;
  background: var(--side);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  padding: 0 10px 12px;
}
.drag {
  height: 12px;
  flex: none;
}
:root[data-os='macos'] .drag {
  height: 34px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 4px 8px 16px;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.01em;
}
nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text-2);
  cursor: pointer;
  text-align: left;
}
nav button:hover {
  background: var(--bg-3);
  color: var(--text);
}
nav button.on {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-weight: 600;
}
.count {
  margin-left: auto;
  background: var(--accent);
  color: var(--accent-ink);
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
  padding: 0 6px;
  line-height: 16px;
}
.sep {
  height: 1px;
  background: var(--line);
  margin: 10px 4px;
}
.grow {
  flex: 1;
}
</style>
