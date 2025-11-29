<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  isOpen: Boolean,
  clientToEdit: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'save', 'delete', 'duplicate'])

const form = ref({
  label: '',
  host: '',
  username: '',
  password: '',
  port: 22,
  private_key: ''
})

watch(() => props.clientToEdit, (newVal) => {
  if (newVal) {
    form.value = { 
      label: newVal.label || newVal.name || '',
      host: newVal.host || newVal.hostname || '',
      username: newVal.username || '',
      port: newVal.port || 22,
      password: '', // Usually don't pre-fill password
      private_key: newVal.private_key || ''
    }
  } else {
    form.value = {
      label: '',
      host: '',
      username: '',
      password: '',
      port: 22,
      private_key: ''
    }
  }
}, { immediate: true })

const handleSubmit = () => {
  // Ensure port is a string if the user wants it to match the example "22"
  // But input type="number" gives a number. 
  // The user example shows "port": "22".
  // Let's convert it to string to be safe if that's what they want.
  const payload = {
    ...form.value,
    port: String(form.value.port)
  }
  emit('save', payload)
}

const handleDelete = () => {
  if (confirm('Are you sure you want to delete this host?')) {
    emit('delete', props.clientToEdit)
  }
}

const handleDuplicate = () => {
  emit('duplicate', props.clientToEdit)
}

const close = () => {
  emit('close')
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="close">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>{{ clientToEdit ? 'Edit SSH Client' : 'Create SSH Client' }}</h2>
        <button class="close-btn" @click="close">×</button>
      </div>
      
      <form @submit.prevent="handleSubmit" class="modal-body">
        <div class="form-group">
          <label>Label</label>
          <input type="text" v-model="form.label" placeholder="My Server" required>
        </div>
        
        <div class="form-group">
          <label>Host</label>
          <input type="text" v-model="form.host" placeholder="192.168.1.1" required>
        </div>
        
        <div class="form-group">
          <label>Port</label>
          <input type="number" v-model="form.port" placeholder="22" required>
        </div>
        
        <div class="form-group">
          <label>Username</label>
          <input type="text" v-model="form.username" placeholder="root" required>
        </div>

        <div class="form-group">
          <label>Password</label>
          <input type="password" v-model="form.password" placeholder="••••••••••••">
        </div>

        <div class="form-group">
          <label>Private Key</label>
          <textarea v-model="form.private_key" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."></textarea>
        </div>
        
        <div class="form-actions">
          <button type="button" class="btn-cancel" @click="close">Cancel</button>
          
          <template v-if="clientToEdit">
            <button type="button" class="btn-duplicate" @click="handleDuplicate">Duplicate</button>
            <button type="button" class="btn-delete" @click="handleDelete">Delete</button>
            <button type="submit" class="btn-save">Update</button>
          </template>
          
          <template v-else>
            <button type="submit" class="btn-save">Create</button>
          </template>
        </div>
      </form>
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
  background-color: #23273a;
  width: 500px;
  max-width: 90%;
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.modal-header h2 {
  margin: 0;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.close-btn {
  background: #3a3f5c;
  border: none;
  color: #e4e6eb;
  font-size: 18px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background-color: #464c68;
}

.modal-body {
  /* padding removed as it's handled by modal-content */
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #9ca3af;
  font-size: 13px;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px;
  background-color: #2e3247;
  border: 1px solid #3a3f5c;
  border-radius: 8px;
  color: #e4e6eb;
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
}

.form-group textarea {
  min-height: 100px;
  resize: vertical;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #4a9eff;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 25px;
}

.btn-cancel {
  background: #3a3f5c;
  border: none;
  color: #e4e6eb;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.btn-cancel:hover {
  background: #464c68;
}

.btn-save {
  background-color: #4a9eff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
}

.btn-save:hover {
  background-color: #3d8ee6;
}

.btn-delete {
  background-color: #d84f76;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
}

.btn-delete:hover {
  background-color: #c23e6a;
}

.btn-duplicate {
  background-color: #28a745;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
}

.btn-duplicate:hover {
  background-color: #218838;
}
</style>
