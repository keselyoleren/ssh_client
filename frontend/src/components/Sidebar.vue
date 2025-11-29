<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  clients: {
    type: Array,
    default: () => []
  },
  activeClientId: {
    type: String,
    default: null
  },
  isOpen: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['select-client', 'create-client', 'edit-client', 'detect-os'])

const searchQuery = ref('')
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  client: null
})

const filteredClients = () => {
  if (!searchQuery.value) return props.clients
  const query = searchQuery.value.toLowerCase()
  return props.clients.filter(client => {
    const name = client.label || client.host || client.name || ''
    const host = client.host || client.hostname || ''
    const username = client.username || ''
    
    return name.toLowerCase().includes(query) || 
           host.toLowerCase().includes(query) ||
           username.toLowerCase().includes(query)
  })
}

const getClientIcon = (client) => {
  const os = client.detected_os || 'unknown'
  const icons = {
    'ubuntu': '🐧',
    'debian': '🍥',
    'centos': '💠',
    'fedora': '🎩',
    'rhel': '🐂',
    'linux': '🐧',
    'windows': '🪟',
    'macos': '🍎',
    'freebsd': '😈',
    'unknown': '🖥️'
  }
  return icons[os] || icons['unknown']
}

const handleContextMenu = (e, client) => {
  e.preventDefault()
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    client: client
  }
}

const closeContextMenu = () => {
  contextMenu.value.visible = false
}

const handleAction = (action) => {
  if (contextMenu.value.client) {
    emit(action, contextMenu.value.client)
  }
  closeContextMenu()
}

// Close context menu on click outside
onMounted(() => {
  document.addEventListener('click', closeContextMenu)
})
</script>

<template>
  <div class="sidebar" :class="{ collapsed: !isOpen }">
    <div class="sidebar-header">
      <h2 v-if="isOpen">Hosts</h2>
      <button class="add-btn" @click="$emit('create-client')" title="Add New Host">+</button>
    </div>
    
    <div class="search-box" v-if="isOpen">
      <input 
        type="text" 
        v-model="searchQuery" 
        placeholder="Search hosts..."
      >
    </div>
    
    <div class="client-list">
      <div 
        v-for="client in filteredClients()" 
        :key="client.id" 
        class="host-card"
        :class="{ active: activeClientId === client.id }"
        @click="$emit('select-client', client)"
        @contextmenu="handleContextMenu($event, client)"
        :title="!isOpen ? (client.label || client.host) : ''"
      >
        <div class="host-icon">{{ getClientIcon(client) }}</div>
        <div class="host-info" v-if="isOpen">
          <div class="host-name">{{ client.label || client.host || client.name }}</div>
          <div class="host-detail">{{ client.username }}@{{ client.hostname }}</div>
        </div>
        <div class="host-status" :class="{ connected: activeClientId === client.id }" v-if="isOpen"></div> 
      </div>
    </div>

    <!-- Context Menu -->
    <div 
      v-if="contextMenu.visible" 
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <div class="menu-item" @click="handleAction('detect-os')">
        <span>🔍</span> Detect OS
      </div>
      <div class="menu-item" @click="handleAction('edit-client')">
        <span>✏️</span> Edit Client
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: 280px;
  background-color: #1a1d29;
  border-right: 1px solid #2e3247;
  display: flex;
  flex-direction: column;
  height: 100%;
  transition: width 0.3s ease;
  overflow: hidden;
}

.sidebar.collapsed {
  width: 60px;
}

.sidebar.collapsed .sidebar-header {
  justify-content: center;
  padding: 20px 0;
}

.sidebar.collapsed .host-card {
  justify-content: center;
  padding: 12px 0;
}

.sidebar.collapsed .host-icon {
  margin-right: 0;
}

.sidebar-header {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #2e3247;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.add-btn {
  background-color: #4a9eff;
  color: white;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.add-btn:hover {
  background-color: #3b82f6;
}

.search-box {
  padding: 15px;
}

.search-box input {
  width: 100%;
  padding: 10px;
  background-color: #0f111a;
  border: 1px solid #2e3247;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  box-sizing: border-box;
}

.search-box input:focus {
  outline: none;
  border-color: #4a9eff;
}

.client-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 10px;
}

.host-card {
  display: flex;
  align-items: center;
  padding: 12px;
  background-color: #232736;
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.host-card:hover {
  background-color: #2e3247;
  transform: translateY(-1px);
}

.host-card.active {
  background-color: rgba(46, 204, 113, 0.15);
  border-color: #2ecc71;
}

.host-icon {
  font-size: 24px;
  margin-right: 12px;
  width: 32px;
  text-align: center;
}

.host-info {
  flex: 1;
  min-width: 0;
}

.host-name {
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.host-detail {
  font-size: 12px;
  color: #8b9bb4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.host-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #e74c3c; /* Disconnected */
  margin-left: 8px;
}

.host-status.connected {
  background-color: #2ecc71;
}

/* Context Menu */
.context-menu {
  position: fixed;
  background-color: #2e3247;
  border: 1px solid #4a9eff;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 150px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.menu-item {
  padding: 8px 16px;
  cursor: pointer;
  color: #e4e6eb;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.menu-item:hover {
  background-color: #4a9eff;
  color: white;
}
</style>
