<script setup>
import { computed, ref, onMounted } from 'vue'
import { store, connectHost, openLocal, openSftp, sendToFocused, openProject, openWorkspace } from '../lib/store'
import { uid } from '../lib/api'
import Icon from './Icon.vue'
import { isObjectStorage } from '../lib/os'
import { ACTIONS, hint } from '../lib/keymap'

const q = ref('')
const sel = ref(0)
const input = ref(null)
onMounted(() => input.value.focus())

const items = computed(() => {
  const s = q.value.trim().toLowerCase()
  const out = []
  for (const h of store.vault.hosts) {
    const hay = `${h.label} ${h.host} ${h.username} ${h.group} ${(h.tags || []).join(' ')}`.toLowerCase()
    if (!s || hay.includes(s))
      out.push({
        icon: isObjectStorage(h.protocol) ? 'cloud' : 'server',
        label: h.label || h.host,
        sub: `${h.username ? h.username + '@' : ''}${h.host}`,
        run: () => connectHost(h),
      })
  }
  for (const ws of store.vault.workspaces || []) {
    for (const p of ws.projects || []) {
      const hay = `${ws.name} ${p.name} ${p.path}`.toLowerCase()
      if (!s || hay.includes(s))
        out.push({ icon: 'folder', label: p.name, sub: `${ws.name} · ${p.path}`, run: () => openProject(ws, p) })
    }
    if (s && ws.projects?.length && ws.name.toLowerCase().includes(s))
      out.push({
        icon: 'grid',
        label: `Open workspace ${ws.name}`,
        sub: `${ws.projects.length} project${ws.projects.length === 1 ? '' : 's'}`,
        run: () => openWorkspace(ws),
      })
  }
  for (const sn of store.vault.snippets) {
    if (s && (sn.name + ' ' + sn.command).toLowerCase().includes(s))
      out.push({ icon: 'code', label: sn.name, sub: sn.command, run: () => sendToFocused(sn.command + '\r') })
  }
  // quick connect: user@host[:port]
  const m = q.value.trim().match(/^(?:ssh\s+)?(?:([^@\s]+)@)?([\w.-]+)(?::(\d+))?$/)
  if (m && q.value.includes('@')) {
    out.unshift({
      icon: 'zap',
      label: `Connect to ${q.value.trim()}`,
      sub: 'Quick connect (not saved)',
      run: () =>
        connectHost({
          id: 'quick-' + uid(),
          protocol: 'ssh',
          label: m[2],
          host: m[2],
          username: m[1] || '',
          port: +(m[3] || 22),
        }),
    })
  }
  if (!s || 'local terminal'.includes(s))
    out.push({ icon: 'terminal', label: 'New local terminal', sub: '', keys: hint('new_local'), run: openLocal })
  if (!s || 'file manager sftp'.includes(s))
    out.push({ icon: 'folder', label: 'Open file manager', sub: '', keys: hint('new_sftp'), run: () => openSftp() })
  // app commands, e.g. "split", "zoom", "settings"
  if (s)
    for (const a of ACTIONS) {
      if (!a.run || a.id === 'palette' || a.id === 'new_local' || a.id === 'new_sftp') continue
      if (`${a.group} ${a.label}`.toLowerCase().includes(s))
        out.push({ icon: 'zap', label: a.label, sub: a.group, keys: hint(a.id), run: a.run })
    }
  return out.slice(0, 50)
})

function key(e) {
  if (e.key === 'ArrowDown') {
    sel.value = Math.min(sel.value + 1, items.value.length - 1)
    e.preventDefault()
  } else if (e.key === 'ArrowUp') {
    sel.value = Math.max(sel.value - 1, 0)
    e.preventDefault()
  } else if (e.key === 'Enter') choose(items.value[sel.value])
  else if (e.key === 'Escape') store.palette = false
}
function choose(it) {
  if (!it) return
  store.palette = false
  it.run()
}
</script>

<template>
  <div class="overlay top" @mousedown.self="store.palette = false">
    <div class="pal">
      <div class="in">
        <Icon name="search" />
        <input
          ref="input"
          v-model="q"
          @input="sel = 0"
          @keydown="key"
          placeholder="Search hosts, snippets… or type user@host to quick connect"
        />
      </div>
      <div class="res">
        <div
          v-for="(it, i) in items"
          :key="i"
          class="it"
          :class="{ on: i === sel }"
          @mouseenter="sel = i"
          @click="choose(it)"
        >
          <Icon :name="it.icon" />
          <span class="l">{{ it.label }}</span>
          <span class="s mono">{{ it.sub }}</span>
          <kbd v-if="it.keys" class="k">{{ it.keys }}</kbd>
        </div>
        <div v-if="!items.length" class="dim" style="padding: 18px">No results</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay.top {
  place-items: start center;
  padding-top: 12vh;
}
.pal {
  width: min(620px, calc(100vw - 40px));
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.in {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
  color: var(--text-3);
}
.in input {
  flex: 1;
  height: 50px;
  border: 0;
  outline: 0;
  background: none;
  font-size: 15px;
  color: var(--text);
}
.res {
  max-height: 50vh;
  overflow: auto;
  padding: 6px;
}
.it {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-2);
}
.it.on {
  background: var(--bg-3);
  color: var(--text);
}
.l {
  font-weight: 550;
  white-space: nowrap;
}
.s {
  color: var(--text-3);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.k {
  margin-left: auto;
  flex: none;
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  color: var(--text-2);
}
</style>
