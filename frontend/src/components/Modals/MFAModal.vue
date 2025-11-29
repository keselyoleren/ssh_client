<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close'])

const mfaEnabled = ref(false)
const qrCode = ref('')
const secret = ref('')
const verificationCode = ref('')

const fetchStatus = async () => {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const response = await fetch('/auth/mfa/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await response.json()
    mfaEnabled.value = data.mfa_enabled
  } catch (error) {
    console.error('Failed to fetch MFA status', error)
  }
}

const setupMFA = async () => {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const response = await fetch('/auth/mfa/setup', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await response.json()
    secret.value = data.secret
    qrCode.value = data.qr_code // This is likely a base64 image or URL
  } catch (error) {
    console.error('Failed to setup MFA', error)
  }
}

const verifyMFA = async () => {
  // Implementation for verifying code
  console.log('Verify code:', verificationCode.value)
}

const disableMFA = async () => {
  // Implementation for disabling MFA
  console.log('Disable MFA')
}

onMounted(() => {
  if (props.isOpen) {
    fetchStatus()
  }
})

const close = () => {
  emit('close')
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="close">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>Two-Factor Authentication</h2>
        <button class="close-btn" @click="close">×</button>
      </div>
      
      <div class="modal-body">
        <div class="mfa-status">
          <span>Status:</span>
          <span :class="mfaEnabled ? 'status-enabled' : 'status-disabled'">
            {{ mfaEnabled ? 'Enabled' : 'Disabled' }}
          </span>
        </div>
        
        <div v-if="!mfaEnabled" class="setup-section">
          <p>Protect your account with 2FA.</p>
          <button class="btn-primary" @click="setupMFA" v-if="!secret">Enable 2FA</button>
          
          <div v-if="secret" class="qr-section">
            <p>Scan this QR code with your authenticator app:</p>
            <div class="qr-code" v-html="qrCode"></div>
            <p>Or enter this secret: <code>{{ secret }}</code></p>
            
            <div class="verify-form">
              <input type="text" v-model="verificationCode" placeholder="Enter 6-digit code">
              <button class="btn-primary" @click="verifyMFA">Verify</button>
            </div>
          </div>
        </div>
        
        <div v-else class="disable-section">
          <button class="btn-danger" @click="disableMFA">Disable 2FA</button>
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
  width: 500px;
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
  color: #e4e6eb;
}

.mfa-status {
  margin-bottom: 20px;
  font-size: 16px;
}

.status-enabled {
  color: #2ecc71;
  font-weight: bold;
  margin-left: 10px;
}

.status-disabled {
  color: #e74c3c;
  font-weight: bold;
  margin-left: 10px;
}

.btn-primary {
  background-color: #4a9eff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.btn-danger {
  background-color: #e74c3c;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.qr-section {
  margin-top: 20px;
  text-align: center;
}

.qr-code {
  background: white;
  padding: 10px;
  display: inline-block;
  margin: 10px 0;
}

.verify-form {
  margin-top: 20px;
  display: flex;
  gap: 10px;
  justify-content: center;
}

.verify-form input {
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #2e3247;
  background-color: #0f111a;
  color: white;
}
</style>
