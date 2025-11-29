<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from '../components/Sidebar.vue'
import TerminalView from '../components/TerminalView.vue'
import SettingsModal from '../components/Modals/SettingsModal.vue'
import MFAModal from '../components/Modals/MFAModal.vue'
import CreateHostModal from '../components/Modals/CreateHostModal.vue'
import Toastify from 'toastify-js'
import { fetchWithAuth } from '../utils/api'

const router = useRouter()
const clients = ref([])
const activeClientId = ref(null)
const currentUser = ref(null)
const terminalView = ref(null)

// Modals State
const showSettings = ref(false)
const showMFA = ref(false)
const showCreateHost = ref(false)
const clientToEdit = ref(null)
const isSidebarOpen = ref(true)

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

onMounted(async () => {
  await fetchUser()
  await fetchClients()
})

const fetchUser = async () => {
  try {
    const response = await fetchWithAuth('/auth/me')

    if (response.ok) {
      currentUser.value = await response.json()
    } else {
      router.push('/login')
    }
  } catch (error) {
    console.error('Auth check failed:', error)
    router.push('/login')
  }
}

const fetchClients = async () => {
  try {
    const response = await fetchWithAuth('/clients')
    
    if (response.status === 401) {
      router.push('/login')
      return
    }

    const data = await response.json()
    clients.value = data.clients
  } catch (error) {
    console.error('Failed to fetch clients:', error)
    showToast('Failed to load hosts', 'error')
  }
}

const handleSelectClient = (client) => {
  activeClientId.value = client.id
  if (terminalView.value) {
    terminalView.value.createTab(client)
  }
}

const handleTabChange = (client) => {
  if (client) {
    activeClientId.value = client.id
  }
}

const handleCreateClient = () => {
  clientToEdit.value = null
  showCreateHost.value = true
}

const handleEditClient = (client) => {
  clientToEdit.value = client
  showCreateHost.value = true
}

const handleSaveClient = async (clientData) => {
  try {
    const url = clientToEdit.value ? `/clients/${clientToEdit.value.id}` : '/clients'
    const method = clientToEdit.value ? 'PUT' : 'POST'
    
    // Add client_id to payload if editing
    const payload = {
      ...clientData,
      client_id: clientToEdit.value ? String(clientToEdit.value.id) : undefined
    }

    const response = await fetchWithAuth(url, {
      method: method,
      body: JSON.stringify(payload)
    })
    
    if (response.ok) {
      showToast(clientToEdit.value ? 'Host updated' : 'Host created', 'success')
      showCreateHost.value = false
      await fetchClients()
    } else {
      showToast('Failed to save host', 'error')
    }
  } catch (error) {
    console.error('Save client error:', error)
    showToast('Error saving host', 'error')
  }
}

const handleDeleteClient = async (client) => {
  try {
    const response = await fetchWithAuth(`/clients/${client.id}`, {
      method: 'DELETE'
    })
    
    if (response.ok) {
      showToast('Host deleted', 'success')
      showCreateHost.value = false
      await fetchClients()
    } else {
      showToast('Failed to delete host', 'error')
    }
  } catch (error) {
    console.error('Delete client error:', error)
    showToast('Error deleting host', 'error')
  }
}

const handleDuplicateClient = async (client) => {
  try {
    // Create a copy of the client data, append "Copy" to name
    const newClient = {
      label: `${client.label || client.name} (Copy)`,
      host: client.host || client.hostname,
      port: String(client.port),
      username: client.username,
      password: '', // Usually don't copy password for security, or maybe we do? Legacy app copied it.
      private_key: client.private_key || ''
    }
    
    // Legacy app copied password. Let's assume we should too if we have it, 
    // but usually we don't have the password in the client object from the list.
    // If the backend returns it, it's there.
    
    const response = await fetchWithAuth('/clients', {
      method: 'POST',
      body: JSON.stringify(newClient)
    })
    
    if (response.ok) {
      showToast('Host duplicated', 'success')
      showCreateHost.value = false
      await fetchClients()
    } else {
      showToast('Failed to duplicate host', 'error')
    }
  } catch (error) {
    console.error('Duplicate client error:', error)
    showToast('Error duplicating host', 'error')
  }
}

const currentTheme = ref('hacker-blue')

onMounted(async () => {
  await fetchUser()
  await fetchClients()
  await fetchSettings()
})

const fetchSettings = async () => {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    if (!token) return

    // Try to get terminal settings. If endpoint doesn't exist, we might need to rely on local storage or user profile
    // Based on legacy code, there is a POST /auth/terminal-settings, likely a GET too or it's part of user profile
    // Let's try to fetch it, or fallback to localStorage
    
    // Fallback to localStorage first to be safe
    const savedSettings = localStorage.getItem('sshClientSettings')
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings)
      if (parsed.terminal && parsed.terminal.theme) {
        currentTheme.value = parsed.terminal.theme
      }
    }
    
    // If there's an API, we should use it. 
    // Assuming GET /auth/terminal-settings exists or we can use what we have.
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}

const handleSaveSettings = async (settings) => {
  if (settings.theme) {
    currentTheme.value = settings.theme
    
    // Persist to backend
    try {
      const response = await fetchWithAuth('/auth/terminal-settings', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      
      // Save to local storage as well
      const localSettings = JSON.parse(localStorage.getItem('sshClientSettings') || '{}')
      localSettings.terminal = { ...localSettings.terminal, theme: settings.theme }
      localStorage.setItem('sshClientSettings', JSON.stringify(localSettings))
      
      if (response.ok) {
        showToast('Theme updated', 'success')
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }
  
  // showSettings.value = false // Don't close immediately to allow previewing
}

const handleDetectOS = async (client) => {
  try {
    showToast(`Detecting OS for ${client.name}...`, 'info')
    const response = await fetchWithAuth(`/clients/${client.id}/detect-os`, {
      method: 'POST'
    })
    const data = await response.json()
    
    if (data.detected_os && data.detected_os !== 'unknown') {
      showToast(`Detected OS: ${data.detected_os}`, 'success')
      // Update local client data
      const index = clients.value.findIndex(c => c.id === client.id)
      if (index !== -1) {
        clients.value[index].detected_os = data.detected_os
      }
    } else {
      showToast('Could not detect OS', 'warning')
    }
  } catch (error) {
    console.error('OS detection failed:', error)
    showToast('OS detection failed', 'error')
  }
}

const handleLogout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('refresh_token')
  sessionStorage.removeItem('user')
  router.push('/login')
}

const showToast = (message, type = 'info') => {
  const backgroundColor = {
    info: '#3498db',
    success: '#2ecc71',
    warning: '#f1c40f',
    error: '#e74c3c'
  }[type]

  Toastify({
    text: message,
    duration: 3000,
    close: true,
    gravity: "bottom",
    position: "right",
    backgroundColor: backgroundColor,
    stopOnFocus: true,
  }).showToast()
}
</script>

<template>
  <div class="dashboard-container">
    <Sidebar 
      :clients="clients"
      :active-client-id="activeClientId"
      :is-open="isSidebarOpen"
      @select-client="handleSelectClient"
      @create-client="handleCreateClient"
      @edit-client="handleEditClient"
      @detect-os="handleDetectOS"
    />
    
    <div class="main-content">
      <div class="top-bar">
        <div class="left-actions">
          <button @click="toggleSidebar" class="icon-btn toggle-sidebar-btn" title="Toggle Sidebar">
            <span v-if="isSidebarOpen">◀</span>
            <span v-else>▶</span>
          </button>
        </div>
        <div class="actions">
          <button @click="showSettings = true" class="icon-btn" title="Settings">⚙️</button>
          <button @click="showMFA = true" class="icon-btn" title="MFA">🔒</button>
        </div>
        <div class="user-info" v-if="currentUser">
          <span>{{ currentUser.email }}</span>
          <button @click="handleLogout" class="logout-btn">Logout</button>
        </div>
      </div>
      
      <div class="terminal-area">
        <TerminalView 
          ref="terminalView" 
          :active-client-id="activeClientId" 
          :theme="currentTheme"
          @tab-changed="handleTabChange"
        />
      </div>
    </div>

    <!-- Modals -->
    <SettingsModal 
      :isOpen="showSettings" 
      :currentTheme="currentTheme"
      @close="showSettings = false"
      @save="handleSaveSettings"
    />
    
    <MFAModal 
      :isOpen="showMFA" 
      @close="showMFA = false"
    />
    
    <CreateHostModal 
      :isOpen="showCreateHost" 
      :clientToEdit="clientToEdit"
      @close="showCreateHost = false"
      @save="handleSaveClient"
      @delete="handleDeleteClient"
      @duplicate="handleDuplicateClient"
    />
  </div>
</template>

<style scoped>
.dashboard-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: #0f111a;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.top-bar {
  height: 50px;
  background-color: #1a1d29;
  border-bottom: 1px solid #2e3247;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.left-actions {
  display: flex;
  align-items: center;
  margin-right: auto; /* Push other items to the right */
}

.toggle-sidebar-btn {
  margin-right: 15px;
  color: #8b9bb4;
}

.toggle-sidebar-btn:hover {
  color: #fff;
}

.actions {
  display: flex;
  gap: 10px;
}

.icon-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.icon-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 15px;
  color: #e4e6eb;
  font-size: 14px;
}

.logout-btn {
  background: transparent;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.logout-btn:hover {
  background-color: #e74c3c;
  color: white;
}

.terminal-area {
  flex: 1;
  position: relative;
  background-color: #0f111a;
  overflow: hidden;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #8b9bb4;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 0 0 10px;
  color: #e4e6eb;
}
</style>
