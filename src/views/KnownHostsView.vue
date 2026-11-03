<script setup>
import { store, loadVault, confirm, err } from '../lib/store'
import { api, fmtTime } from '../lib/api'
import Icon from '../components/Icon.vue'

async function remove(k) {
  if (
    !(await confirm(
      `Forget ${k.host}?`,
      'You will be asked to trust the key again on next connect (trust-on-first-use).',
      { okText: 'Forget' },
    ))
  )
    return
  try {
    await api.known_host_delete({ host: k.host, keyType: k.key_type })
    loadVault()
  } catch (e) {
    err(e)
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Known Hosts</h1></div>
    <div class="page-body">
      <p class="muted" style="margin-top: 0">
        Server fingerprints are trusted on first connect and verified on every connection after that. A mismatch blocks
        the connection to protect you from man-in-the-middle attacks. Your
        <span class="mono">~/.ssh/known_hosts</span> is honoured too.
      </p>
      <div v-if="!store.vault.known_hosts.length" class="empty">
        <Icon name="shield" :size="40" />
        <div class="big">No known hosts yet</div>
      </div>
      <div v-else class="card">
        <div v-for="k in store.vault.known_hosts" :key="k.host + k.key_type" class="list-row">
          <Icon name="shield" style="color: var(--ok)" />
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 600" class="mono">
              {{ k.host }} <span class="chip">{{ k.key_type }}</span>
            </div>
            <div class="dim mono" style="font-size: 11.5px; -webkit-user-select: text; user-select: text">
              {{ k.fingerprint }}
            </div>
          </div>
          <span class="dim" style="font-size: 12px">{{ fmtTime(k.added_at) }}</span>
          <button class="iconbtn" @click="remove(k)"><Icon name="trash" /></button>
        </div>
      </div>
    </div>
  </div>
</template>
