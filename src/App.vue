<script setup>
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { store, loadVault, openLocal, closeTab, activeTab, splitFocused, err } from './lib/store'
import { api } from './lib/api'
import Sidebar from './components/Sidebar.vue'
import TabBar from './components/TabBar.vue'
import HostsView from './views/HostsView.vue'
import KeysView from './views/KeysView.vue'
import SnippetsView from './views/SnippetsView.vue'
import ForwardsView from './views/ForwardsView.vue'
import KnownHostsView from './views/KnownHostsView.vue'
import SettingsView from './views/SettingsView.vue'
import TerminalTab from './components/TerminalTab.vue'
import SftpTab from './components/SftpTab.vue'
import HostEditor from './components/HostEditor.vue'
import Palette from './components/Palette.vue'
import Overlays from './components/Overlays.vue'

const views = {
  hosts: HostsView,
  keys: KeysView,
  snippets: SnippetsView,
  forwards: ForwardsView,
  known: KnownHostsView,
  settings: SettingsView,
}
const view = computed(() => views[store.view] || HostsView)

function onKey(e) {
  const mod = store.platform.os === 'macos' ? e.metaKey : e.ctrlKey && e.shiftKey
  if (!mod) return
  const k = e.key.toLowerCase()
  let handled = true
  if (k === 'k' || k === 'p') store.palette = !store.palette
  else if (k === 't') openLocal()
  else if (k === 'w') {
    if (store.active !== 'vault') closeTab(store.active)
  } else if (k === 'd') splitFocused(e.shiftKey && store.platform.os === 'macos' ? 'col' : 'row')
  else if (k === 'e') splitFocused('col')
  else if (/^[1-9]$/.test(k)) {
    const n = +k
    store.active = n === 1 ? 'vault' : store.tabs[n - 2]?.id || store.active
  } else handled = false
  if (handled) {
    e.preventDefault()
    e.stopPropagation()
  }
}

onMounted(async () => {
  try {
    store.platform = await api.platform()
    document.documentElement.dataset.os = store.platform.os
    await loadVault()
  } catch (e) {
    err(e)
  }
  store.ready = true
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('input,textarea,.xterm')) e.preventDefault()
  })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="shell" v-if="store.ready">
    <Sidebar />
    <main class="main">
      <TabBar />
      <section class="content">
        <div class="pane-wrap" v-show="store.active === 'vault'">
          <component :is="view" />
        </div>
        <template v-for="t in store.tabs" :key="t.id">
          <div class="pane-wrap" v-show="store.active === t.id">
            <TerminalTab v-if="t.kind === 'term'" :tab="t" :visible="store.active === t.id" />
            <SftpTab v-else :tab="t" />
          </div>
        </template>
      </section>
    </main>
    <HostEditor v-if="store.editor" />
    <Palette v-if="store.palette" />
    <Overlays />
  </div>
</template>

<style>
.shell {
  display: flex;
  height: 100%;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.content {
  flex: 1;
  min-height: 0;
  position: relative;
}
.pane-wrap {
  position: absolute;
  inset: 0;
}
</style>
