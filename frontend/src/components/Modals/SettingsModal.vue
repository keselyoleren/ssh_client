<script setup>
import { ref, onMounted, computed } from 'vue'
import { themes } from '../../utils/themes'

const props = defineProps({
  isOpen: Boolean,
  currentTheme: {
    type: String,
    default: 'hacker-blue'
  }
})

const emit = defineEmits(['close', 'save'])

const selectedTheme = ref(props.currentTheme)

const themeList = computed(() => {
  return Object.entries(themes).map(([id, theme]) => ({
    id,
    ...theme
  }))
})

const selectTheme = (themeId) => {
  selectedTheme.value = themeId
  emit('save', { theme: themeId })
}

const close = () => {
  emit('close')
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="close">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>Settings</h2>
        <button class="close-btn" @click="close">×</button>
      </div>
      
      <div class="modal-body">
        <h3>Terminal Theme</h3>
        <div class="theme-grid">
          <div 
            v-for="theme in themeList" 
            :key="theme.id"
            class="theme-card"
            :class="{ active: selectedTheme === theme.id }"
            @click="selectTheme(theme.id)"
          >
            <div class="theme-preview" :style="{ backgroundColor: theme.background }">
              <div class="theme-preview-lines">
                <div v-for="(color, i) in theme.colors.slice(0, 3)" :key="i" 
                     class="theme-preview-line" 
                     :style="{ background: color, width: (90 - i * 15) + '%' }">
                </div>
              </div>
            </div>
            <div class="theme-name">{{ theme.name }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: #1a1d29;
  width: 600px;
  max-width: 90%;
  border-radius: 8px;
  border: 1px solid #2e3247;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.modal-header {
  padding: 20px;
  border-bottom: 1px solid #2e3247;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h2 {
  margin: 0;
  color: #fff;
  font-size: 20px;
}

.close-btn {
  background: transparent;
  border: none;
  color: #8b9bb4;
  font-size: 24px;
  cursor: pointer;
}

.close-btn:hover {
  color: #fff;
}

.modal-body {
  padding: 20px;
}

.modal-body h3 {
  margin-top: 0;
  color: #e4e6eb;
  font-size: 16px;
  margin-bottom: 15px;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 15px;
}

.theme-card {
  background-color: #232736;
  border: 1px solid #2e3247;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
}

.theme-card:hover {
  border-color: #4a9eff;
  transform: translateY(-2px);
}

.theme-card.active {
  border-color: #4a9eff;
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
}

.theme-preview {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: monospace;
  font-size: 20px;
  padding: 10px;
  box-sizing: border-box;
}

.theme-preview-lines {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-preview-line {
  height: 8px;
  border-radius: 4px;
}

.theme-name {
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: #e4e6eb;
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
