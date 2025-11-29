<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

import { themes } from '../utils/themes'

const props = defineProps({
  termId: {
    type: String,
    required: true
  },
  client: {
    type: Object,
    required: true
  },
  active: {
    type: Boolean,
    default: false
  },
  theme: {
    type: String,
    default: 'hacker-blue'
  }
})

const emit = defineEmits(['close', 'activate', 'drop-tab'])

const terminalContainer = ref(null)
const terminal = shallowRef(null)
const fitAddon = shallowRef(null)
const socket = shallowRef(null)
const dropOverlay = ref(null)

onMounted(() => {
  initTerminal()
})

onBeforeUnmount(() => {
  if (socket.value) {
    socket.value.close()
  }
  if (terminal.value) {
    try {
      terminal.value.dispose()
    } catch (e) {
      console.warn('Error disposing terminal:', e)
    }
  }
})

watch(() => props.active, (newVal) => {
  if (newVal && terminal.value) {
    terminal.value.focus()
    fitAddon.value.fit()
  }
})

watch(() => props.theme, (newTheme) => {
  if (terminal.value && themes[newTheme]) {
    terminal.value.options.theme = themes[newTheme]
  }
})

const initTerminal = () => {
  const theme = themes[props.theme] || themes['hacker-blue']
  
  terminal.value = new Terminal({
    cursorBlink: true,
    theme: theme,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 14,
    allowProposedApi: true
  })

  fitAddon.value = new FitAddon()
  terminal.value.loadAddon(fitAddon.value)
  terminal.value.open(terminalContainer.value)
  fitAddon.value.fit()

  // Connect WebSocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const wsUrl = `${protocol}//${window.location.host}/ws/${props.client.id}?token=${token}`
  
  socket.value = new WebSocket(wsUrl)

  socket.value.onopen = () => {
    terminal.value.write('\r\n\x1b[32mConnected to ' + props.client.hostname + '\x1b[0m\r\n')
    fitAddon.value.fit()
    // Send resize event
    const dims = { cols: terminal.value.cols, rows: terminal.value.rows }
    // We might need to send this to backend if it supports resize
  }

  socket.value.onmessage = (event) => {
    terminal.value.write(event.data)
  }

  socket.value.onclose = () => {
    terminal.value.write('\r\n\x1b[31mConnection closed\x1b[0m\r\n')
  }

  socket.value.onerror = (error) => {
    console.error('WebSocket error:', error)
    terminal.value.write('\r\n\x1b[31mConnection error\x1b[0m\r\n')
  }

  terminal.value.onData((data) => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      socket.value.send(data)
    }
  })

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    if (fitAddon.value) fitAddon.value.fit()
  })
  resizeObserver.observe(terminalContainer.value)
}

// Drag and Drop Logic
const handleDragOver = (e) => {
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'copy'
  
  if (dropOverlay.value) {
    dropOverlay.value.classList.add('active')
    
    // Directional logic
    const rect = terminalContainer.value.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const h = rect.height
    
    const relX = x / w
    const relY = y / h
    
    dropOverlay.value.classList.remove('split-left', 'split-right', 'split-top', 'split-bottom')
    
    if (relY < 0.25) dropOverlay.value.classList.add('split-top')
    else if (relY > 0.75) dropOverlay.value.classList.add('split-bottom')
    else if (relX < 0.25) dropOverlay.value.classList.add('split-left')
    else dropOverlay.value.classList.add('split-right')
  }
}

const handleDragLeave = (e) => {
  e.preventDefault()
  e.stopPropagation()
  if (dropOverlay.value) {
    dropOverlay.value.classList.remove('active', 'split-left', 'split-right', 'split-top', 'split-bottom')
  }
}

const handleDrop = (e) => {
  e.preventDefault()
  e.stopPropagation()
  
  if (dropOverlay.value) {
    dropOverlay.value.classList.remove('active', 'split-left', 'split-right', 'split-top', 'split-bottom')
  }

  const data = JSON.parse(e.dataTransfer.getData('text/plain'))
  if (data.type !== 'tab-drag') return

  // Calculate direction
  const rect = terminalContainer.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height
  
  const relX = x / w
  const relY = y / h
  
  let direction = 'horizontal'
  let insertBefore = false
  
  if (relY < 0.25) { direction = 'vertical'; insertBefore = true }
  else if (relY > 0.75) { direction = 'vertical'; insertBefore = false }
  else if (relX < 0.25) { direction = 'horizontal'; insertBefore = true }
  else { direction = 'horizontal'; insertBefore = false }

  emit('drop-tab', {
    sourceTabId: data.tabId,
    targetTermId: props.termId,
    direction,
    insertBefore
  })
}
</script>

<template>
  <div 
    class="terminal-wrapper" 
    :class="{ active: active }"
    @mousedown="$emit('activate')"
  >
    <div 
      class="terminal-container" 
      ref="terminalContainer"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    ></div>
    
    <div class="terminal-header">
      <button class="close-btn" @click.stop="$emit('close')">×</button>
    </div>

    <div class="drop-overlay" ref="dropOverlay"></div>
  </div>
</template>

<style scoped>
.terminal-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: #0f111a;
  overflow: hidden;
}

.terminal-container {
  width: 100%;
  height: 100%;
}

.terminal-wrapper.active {
  box-shadow: inset 0 0 0 2px #4a9eff;
}

.terminal-header {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
  padding: 5px;
  opacity: 0;
  transition: opacity 0.2s;
  background: rgba(0, 0, 0, 0.3);
  border-bottom-left-radius: 8px;
}

.terminal-wrapper:hover .terminal-header {
  opacity: 1;
}

.close-btn {
  background: transparent;
  border: none;
  color: #e4e6eb;
  cursor: pointer;
  font-size: 16px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ff4466;
}

/* Drop Overlay Styles (Ported from multi-view.css) */
.drop-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  pointer-events: none;
  display: none;
  background: rgba(74, 158, 255, 0.05);
  transition: all 0.1s;
}

.drop-overlay.active {
  display: block;
}

.drop-overlay::after {
  content: 'Drop to Split';
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  background: rgba(74, 158, 255, 0.3);
  border: 2px dashed #4a9eff;
  backdrop-filter: blur(2px);
  border-radius: 4px;
  box-sizing: border-box;
  transition: all 0.1s;
}

/* Directional Styles */
.drop-overlay.split-left::after { top: 0; left: 0; bottom: 0; width: 50%; content: 'Split Left'; border-right: none; }
.drop-overlay.split-right::after { top: 0; right: 0; bottom: 0; width: 50%; content: 'Split Right'; border-left: none; }
.drop-overlay.split-top::after { top: 0; left: 0; right: 0; height: 50%; content: 'Split Top'; border-bottom: none; }
.drop-overlay.split-bottom::after { bottom: 0; left: 0; right: 0; height: 50%; content: 'Split Bottom'; border-top: none; }
</style>
