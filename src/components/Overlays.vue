<script setup>
import { nextTick, ref, watch } from 'vue'
import { store } from '../lib/store'
import Icon from './Icon.vue'

const input = ref(null)
watch(
  () => store.dialog,
  async (d) => {
    if (d?.type === 'prompt') {
      await nextTick()
      input.value?.focus()
      input.value?.select()
    }
  },
)
function done(v) {
  const d = store.dialog
  store.dialog = null
  d?.resolve(v)
}
function run(item) {
  store.menu = null
  item.action?.()
}
</script>

<template>
  <div class="toasts">
    <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.kind">
      <Icon :name="t.kind === 'error' ? 'info' : 'check'" :size="15" />
      <span>{{ t.msg }}</span>
    </div>
  </div>

  <div v-if="store.menu" class="menu-catch" @mousedown="store.menu = null" @contextmenu.prevent="store.menu = null">
    <div class="menu" :style="{ left: store.menu.x + 'px', top: store.menu.y + 'px' }" @mousedown.stop>
      <template v-for="(it, i) in store.menu.items" :key="i">
        <hr v-if="it === '-'" />
        <button v-else :class="{ danger: it.danger }" @click="run(it)">
          <Icon :name="it.icon || 'right'" :size="14" /> {{ it.label }}
        </button>
      </template>
    </div>
  </div>

  <div v-if="store.dialog" class="overlay" @mousedown.self="done(store.dialog.type === 'prompt' ? null : false)">
    <form
      class="modal"
      style="width: 420px"
      @submit.prevent="done(store.dialog.type === 'prompt' ? store.dialog.value : true)"
    >
      <h2>{{ store.dialog.title }}</h2>
      <p v-if="store.dialog.message" class="muted" style="margin-top: -4px">{{ store.dialog.message }}</p>
      <div v-if="store.dialog.type === 'prompt'" class="field">
        <label v-if="store.dialog.label">{{ store.dialog.label }}</label>
        <input
          ref="input"
          class="input"
          v-model="store.dialog.value"
          :type="store.dialog.password ? 'password' : 'text'"
          :placeholder="store.dialog.placeholder"
          @keydown.esc="done(null)"
        />
      </div>
      <div class="modal-foot">
        <button type="button" class="btn" @click="done(store.dialog.type === 'prompt' ? null : false)">Cancel</button>
        <button type="submit" class="btn" :class="store.dialog.danger ? 'danger' : 'primary'" v-focus>
          {{ store.dialog.okText }}
        </button>
      </div>
    </form>
  </div>
</template>

<script>
export default {
  directives: {
    focus: {
      mounted: (el) => {
        if (!el.closest('form')?.querySelector('input')) el.focus()
      },
    },
  },
}
</script>

<style scoped>
.toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
  pointer-events: none;
}
.toast {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  max-width: 420px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  animation: slide 0.18s;
  -webkit-user-select: text;
  user-select: text;
  pointer-events: auto;
}
.toast .icon {
  margin-top: 2px;
  color: var(--ok);
}
.toast.error {
  border-color: color-mix(in srgb, var(--danger) 50%, var(--line));
}
.toast.error .icon {
  color: var(--danger);
}
@keyframes slide {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
}
.menu-catch {
  position: fixed;
  inset: 0;
  z-index: 69;
}
</style>
