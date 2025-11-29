<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, shallowRef } from 'vue'
import Split from 'split.js'
import TerminalTab from './TerminalTab.vue'

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  terminals: {
    type: Object,
    required: true
  },
  activeTabId: String,
  active: Boolean,
  theme: String
})

const emit = defineEmits(['close-terminal', 'drop-tab', 'activate-terminal'])

const splitInstance = shallowRef(null)
const container = ref(null)
const slot1 = ref(null)
const slot2 = ref(null)

const initSplit = () => {
  if (props.node.type === 'split' && container.value) {
    // Clean up existing instance if any
    if (splitInstance.value) {
      splitInstance.value.destroy()
    }

    // Wait for children to be mounted
    nextTick(() => {
      const children = Array.from(container.value.children)
      if (children.length !== 2) return

      splitInstance.value = Split(children, {
        sizes: props.node.sizes || [50, 50],
        minSize: 100,
        gutterSize: 8,
        direction: props.node.direction,
        cursor: props.node.direction === 'horizontal' ? 'col-resize' : 'row-resize',
        onDragEnd: (sizes) => {
          props.node.sizes = sizes
        }
      })
    })
  }
}

onMounted(() => {
  initSplit()
})

onBeforeUnmount(() => {
  if (splitInstance.value) {
    splitInstance.value.destroy()
  }
})

watch(() => props.node.type, () => {
  initSplit()
})

watch(() => props.node.direction, () => {
  initSplit()
})

// If node changes completely (e.g. replaced), re-init
watch(() => props.node, () => {
  initSplit()
}, { deep: true })

</script>

<template>
  <div 
    v-if="node.type === 'split'" 
    ref="container" 
    class="split-container"
    :class="`split-${node.direction}`"
  >
    <SplitPane 
      class="split-slot"
      :node="node.children[0]" 
      :terminals="terminals"
      :active-tab-id="activeTabId"
      :active="active"
      :theme="theme"
      @close-terminal="$emit('close-terminal', $event)"
      @drop-tab="$emit('drop-tab', $event)"
      @activate-terminal="$emit('activate-terminal', $event)"
    />
    <SplitPane 
      class="split-slot"
      :node="node.children[1]" 
      :terminals="terminals"
      :active-tab-id="activeTabId"
      :active="active"
      :theme="theme"
      @close-terminal="$emit('close-terminal', $event)"
      @drop-tab="$emit('drop-tab', $event)"
      @activate-terminal="$emit('activate-terminal', $event)"
    />
  </div>
  
  <div v-else class="terminal-slot">
    <TerminalTab 
      v-if="terminals[node.termId]"
      :term-id="node.termId"
      :client="terminals[node.termId].client"
      :active="active"
      :theme="theme"
      @close="$emit('close-terminal', node.termId)"
      @drop-tab="$emit('drop-tab', $event)"
      @activate="$emit('activate-terminal', node.termId)"
    />
  </div>
</template>

<style scoped>
.split-container {
  width: 100%;
  height: 100%;
  display: flex;
}

.split-horizontal {
  flex-direction: row;
}

.split-vertical {
  flex-direction: column;
}

.split-slot {
  overflow: hidden;
}

.terminal-slot {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Global gutter styles needed for Split.js */
:global(.gutter) {
  background-color: #0f111a;
  background-repeat: no-repeat;
  background-position: 50%;
  position: relative;
  z-index: 100; /* Ensure gutter is above terminals */
}

:global(.gutter::after) {
  content: "";
  position: absolute;
  background-color: #2e3247;
  transition: background-color 0.2s;
}

:global(.gutter:hover::after) {
  background-color: #4a9eff;
}

:global(.gutter.gutter-horizontal) {
  cursor: col-resize;
}

:global(.gutter.gutter-horizontal::after) {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
}

:global(.gutter.gutter-vertical) {
  cursor: row-resize;
}

:global(.gutter.gutter-vertical::after) {
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
}
</style>
