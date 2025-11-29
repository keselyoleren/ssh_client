<script setup>
import { ref, shallowRef, nextTick } from 'vue'
import SplitPane from './SplitPane.vue'

// State
const tabs = ref([]) // Array of { id, client, title, active }
const activeTabId = ref(null)
const terminals = ref({}) // Map termId -> { id, clientId, tabId, ... }
const tabLayouts = ref({}) // Map tabId -> RootNode (TerminalNode | SplitNode)

// Props
const props = defineProps({
  activeClientId: String,
  theme: {
    type: String,
    default: 'hacker-blue'
  }
})

// Methods
const createTab = (client) => {
  const tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const termId = `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const newTab = {
    id: tabId,
    client: client,
    title: `${client.username}@${client.hostname}`,
    active: true
  }
  
  // Deactivate others
  tabs.value.forEach(t => t.active = false)
  
  tabs.value.push(newTab)
  activeTabId.value = tabId
  
  // Create terminal record
  terminals.value[termId] = {
    id: termId,
    client: client,
    tabId: tabId
  }
  
  // Initialize layout as a single terminal node
  tabLayouts.value[tabId] = {
    type: 'terminal',
    termId: termId
  }
  
  return tabId
}

const closeTab = (tabId) => {
  const index = tabs.value.findIndex(t => t.id === tabId)
  if (index === -1) return
  
  // Clean up terminals
  // We need to find all terminals in this tab's layout
  const layout = tabLayouts.value[tabId]
  if (layout) {
    const collectTermIds = (node) => {
      if (node.type === 'terminal') return [node.termId]
      if (node.type === 'split') return [...collectTermIds(node.children[0]), ...collectTermIds(node.children[1])]
      return []
    }
    const termIds = collectTermIds(layout)
    termIds.forEach(id => delete terminals.value[id])
  }
  
  delete tabLayouts.value[tabId]
  tabs.value.splice(index, 1)
  
  if (activeTabId.value === tabId) {
    activeTabId.value = tabs.value.length > 0 ? tabs.value[tabs.value.length - 1].id : null
    if (activeTabId.value) {
      const tab = tabs.value.find(t => t.id === activeTabId.value)
      if (tab) tab.active = true
    }
  }
}

const emit = defineEmits(['tab-changed'])

const switchTab = (tabId) => {
  tabs.value.forEach(t => t.active = (t.id === tabId))
  activeTabId.value = tabId
  
  const activeTab = tabs.value.find(t => t.id === tabId)
  if (activeTab && activeTab.client) {
    emit('tab-changed', activeTab.client)
  }
}

// Tree Manipulation Helpers
const findParentNode = (root, targetTermId) => {
  if (root.type === 'terminal') return null
  if (root.type === 'split') {
    if ((root.children[0].type === 'terminal' && root.children[0].termId === targetTermId) ||
        (root.children[1].type === 'terminal' && root.children[1].termId === targetTermId)) {
      return root
    }
    const left = findParentNode(root.children[0], targetTermId)
    if (left) return left
    const right = findParentNode(root.children[1], targetTermId)
    if (right) return right
  }
  return null
}

const replaceNode = (root, targetTermId, newNode) => {
  if (root.type === 'terminal' && root.termId === targetTermId) {
    return newNode
  }
  if (root.type === 'split') {
    return {
      ...root,
      children: [
        replaceNode(root.children[0], targetTermId, newNode),
        replaceNode(root.children[1], targetTermId, newNode)
      ]
    }
  }
  return root
}

const removeNodeFromTree = (root, targetTermId) => {
  if (root.type === 'terminal') {
    if (root.termId === targetTermId) return null // Should be handled by caller checking for null
    return root
  }
  if (root.type === 'split') {
    const left = removeNodeFromTree(root.children[0], targetTermId)
    const right = removeNodeFromTree(root.children[1], targetTermId)
    
    if (!left) return right // Left was removed, return right (hoist)
    if (!right) return left // Right was removed, return left (hoist)
    
    return {
      ...root,
      children: [left, right]
    }
  }
  return root
}

const closeTerminal = (termId) => {
  const term = terminals.value[termId]
  if (!term) return
  
  const tabId = term.tabId
  const layout = tabLayouts.value[tabId]
  
  // If it's the only terminal (root is terminal), close tab
  if (layout.type === 'terminal' && layout.termId === termId) {
    closeTab(tabId)
    return
  }
  
  // Otherwise remove from tree
  const newLayout = removeNodeFromTree(layout, termId)
  tabLayouts.value[tabId] = newLayout
  delete terminals.value[termId]
}

// Drag and Drop Handlers
const handleTabDragStart = (e, tab) => {
  e.dataTransfer.setData('text/plain', JSON.stringify({
    type: 'tab-drag',
    tabId: tab.id,
    client: tab.client
  }))
}

const handleTabDrop = async ({ sourceTabId, targetTermId, direction, insertBefore }) => {
  console.log('Drop detected:', { sourceTabId, targetTermId, direction, insertBefore })

  // 1. Get source terminal info
  const sourceLayout = tabLayouts.value[sourceTabId]
  if (!sourceLayout) {
    console.warn('Source layout not found for tab:', sourceTabId)
    return
  }
  
  // Find first terminal in source layout
  let sourceTermId = null
  if (sourceLayout.type === 'terminal') {
    sourceTermId = sourceLayout.termId
  } else {
    // Find first terminal
    const findFirst = (node) => {
      if (node.type === 'terminal') return node.termId
      return findFirst(node.children[0])
    }
    sourceTermId = findFirst(sourceLayout)
  }
  
  if (!sourceTermId) {
    console.warn('No terminal found in source layout')
    return
  }
  
  console.log('Moving terminal:', sourceTermId)
  
  // Prevent dropping onto itself (if same tab)
  const targetTerm = terminals.value[targetTermId]
  if (!targetTerm) {
    console.warn('Target terminal not found:', targetTermId)
    return
  }
  
  if (targetTerm.tabId === sourceTabId) {
    console.log('Skipping self-drop (same tab)')
    return 
  }

  // 2. Remove from source tab
  const sourceTabTerminalsCount = Object.values(terminals.value).filter(t => t.tabId === sourceTabId).length
  console.log('Source tab terminal count:', sourceTabTerminalsCount)
  
  if (sourceTabTerminalsCount > 1) {
    // Complex source tab: remove the terminal from it
    console.log('Removing terminal from complex source tab')
    tabLayouts.value[sourceTabId] = removeNodeFromTree(tabLayouts.value[sourceTabId], sourceTermId)
  }
  
  // 3. Update terminal state
  const term = terminals.value[sourceTermId]
  term.tabId = targetTerm.tabId
  
  // 4. Update target layout
  console.log('Updating target layout')
  const targetLayout = tabLayouts.value[targetTerm.tabId]
  const newSplitNode = {
    type: 'split',
    direction: direction,
    sizes: [50, 50],
    children: insertBefore 
      ? [{ type: 'terminal', termId: sourceTermId }, { type: 'terminal', termId: targetTermId }]
      : [{ type: 'terminal', termId: targetTermId }, { type: 'terminal', termId: sourceTermId }]
  }
  
  tabLayouts.value[targetTerm.tabId] = replaceNode(targetLayout, targetTermId, newSplitNode)

  // Update Tab Title
  const targetTab = tabs.value.find(t => t.id === targetTerm.tabId)
  const sourceTab = tabs.value.find(t => t.id === sourceTabId)
  
  if (targetTab && sourceTab) {
    // Avoid duplicate titles if merging multiple times
    const sourceTitle = sourceTab.title
    const targetTitle = targetTab.title
    
    // Simple concatenation for now: "Title 1 | Title 2"
    if (insertBefore) {
      targetTab.title = `${sourceTitle} | ${targetTitle}`
    } else {
      targetTab.title = `${targetTitle} | ${sourceTitle}`
    }
  }
  
  // 5. Close source tab if empty (MANUAL CLEANUP)
  if (sourceTabTerminalsCount === 1) {
    console.log('Closing empty source tab (manual cleanup)')
    const index = tabs.value.findIndex(t => t.id === sourceTabId)
    if (index !== -1) {
      // Remove layout
      delete tabLayouts.value[sourceTabId]
      // Remove from tabs array
      tabs.value.splice(index, 1)
      
      // Update active tab if needed
      if (activeTabId.value === sourceTabId) {
        activeTabId.value = targetTerm.tabId // Switch to the target tab
        const tab = tabs.value.find(t => t.id === activeTabId.value)
        if (tab) tab.active = true
      }
    }
  }
  
  await nextTick()
  console.log('Drop handled successfully')
}

// Expose createTab to parent
defineExpose({ createTab })
</script>

<template>
  <div class="terminal-view">
    <!-- Tab Bar -->
    <div class="tab-bar">
      <div 
        v-for="tab in tabs" 
        :key="tab.id"
        class="tab"
        :class="{ active: tab.active }"
        draggable="true"
        @dragstart="handleTabDragStart($event, tab)"
        @click="switchTab(tab.id)"
      >
        <span class="tab-icon">🖥️</span>
        <span class="tab-title">{{ tab.title }}</span>
        <button class="close-tab-btn" @click.stop="closeTab(tab.id)">×</button>
      </div>
    </div>

    <!-- Terminal Container Area -->
    <div class="terminal-container-area">
      <div 
        v-for="tab in tabs" 
        :key="tab.id"
        class="tab-content"
        v-show="tab.active"
      >
        <SplitPane 
          v-if="tabLayouts[tab.id]"
          :node="tabLayouts[tab.id]"
          :terminals="terminals"
          :active-tab-id="tab.id"
          :active="tab.active"
          :theme="props.theme"
          @close-terminal="closeTerminal"
          @drop-tab="handleTabDrop"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.terminal-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.tab-bar {
  display: flex;
  background-color: #0b0c15;
  height: 36px;
  overflow-x: auto;
  border-bottom: 1px solid #2e3247;
}

.tab {
  display: flex;
  align-items: center;
  padding: 0 15px;
  min-width: 120px;
  max-width: 200px;
  background-color: #1a1d29;
  border-right: 1px solid #2e3247;
  color: #8b9bb4;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  transition: background-color 0.2s;
}

.tab:hover {
  background-color: #232736;
}

.tab.active {
  background-color: #2e3247;
  color: #fff;
  border-bottom: 2px solid #4a9eff;
}

.tab-icon {
  margin-right: 8px;
}

.tab-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-tab-btn {
  background: transparent;
  border: none;
  color: #8b9bb4;
  margin-left: 8px;
  cursor: pointer;
  font-size: 16px;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-tab-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ff4466;
}

.terminal-container-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.tab-content {
  width: 100%;
  height: 100%;
}
</style>

