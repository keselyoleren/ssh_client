<script setup>
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { store, loadVault, err, restoreSession } from './lib/store'
import { actionFor } from './lib/keymap'
import { initAppearance } from './lib/appearance'
import { api } from './lib/api'
import { startUpdateChecks } from './lib/updater'
import Sidebar from './components/Sidebar.vue'
import TabBar from './components/TabBar.vue'
import HostsView from './views/HostsView.vue'
import KeysView from './views/KeysView.vue'
import SnippetsView from './views/SnippetsView.vue'
import ForwardsView from './views/ForwardsView.vue'
import KnownHostsView from './views/KnownHostsView.vue'
import SettingsView from './views/SettingsView.vue'
import WorkspacesView from './views/WorkspacesView.vue'
import TerminalLayer from './components/TerminalLayer.vue'
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
  workspaces: WorkspacesView,
}
const view = computed(() => views[store.view] || HostsView)

function onKey(e) {
  if (store.recordingKeys) return
  const a = actionFor(e)
  // Terminal-scoped actions (copy, paste, find…) are handled by the focused terminal pane.
  if (!a || a.scope === 'terminal' || !a.run) return
  a.run()
  e.preventDefault()
  e.stopPropagation()
}

onMounted(async () => {
  initAppearance()
  try {
    store.platform = await api.platform()
    document.documentElement.dataset.os = store.platform.os
    await loadVault()
    restoreSession()
  } catch (e) {
    err(e)
  }
  store.ready = true
  startUpdateChecks()
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('input,textarea,.xterm,.cm-editor')) e.preventDefault()
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
        <!-- all terminal panes share one layer so they can move between tabs without reconnecting -->
        <div class="pane-wrap" v-show="store.tabs.some((t) => t.id === store.active && t.kind === 'term')">
          <TerminalLayer />
        </div>
        <template v-for="t in store.tabs" :key="t.id">
          <div v-if="t.kind !== 'term'" class="pane-wrap" v-show="store.active === t.id">
            <SftpTab :tab="t" />
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
