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
const backupCodes = ref([])

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
    qrCode.value = data.qr_code_url
    backupCodes.value = data.backup_codes || []
  } catch (error) {
    console.error('Failed to setup MFA', error)
  }
}

const verifyMFA = async () => {
  if (!verificationCode.value || verificationCode.value.length !== 6) {
    alert('Please enter a valid 6-digit code')
    return
  }

  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const response = await fetch('/auth/mfa/verify-setup', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({ code: verificationCode.value })
    })

    if (response.ok) {
      alert('MFA enabled successfully!')
      mfaEnabled.value = true
      secret.value = ''
      qrCode.value = ''
      backupCodes.value = []
      verificationCode.value = ''
      await fetchStatus()
    } else {
      const error = await response.json()
      alert('Invalid code: ' + (error.detail || 'Unknown error'))
    }
  } catch (error) {
    console.error('MFA verification error:', error)
    alert('Failed to verify MFA')
  }
}

const disableMFA = async () => {
  if (!confirm('Are you sure you want to disable MFA? This will make your account less secure.')) {
    return
  }

  const password = prompt('Enter your current password to disable MFA:')
  if (!password) return

  const code = prompt('Enter a 6-digit MFA code:')
  if (!code) return

  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const response = await fetch('/auth/mfa/disable', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({ 
        password: password,
        code: code
      })
    })

    if (response.ok) {
      alert('MFA disabled successfully!')
      mfaEnabled.value = false
      await fetchStatus()
    } else {
      const error = await response.json()
      alert('Failed to disable MFA: ' + (error.detail || 'Unknown error'))
    }
  } catch (error) {
    console.error('MFA disable error:', error)
    alert('Failed to disable MFA')
  }
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
            <div class="qr-code-container">
              <img :src="qrCode" alt="MFA QR Code" class="qr-image" />
            </div>
            <p>Or enter this secret: <code>{{ secret }}</code></p>
            
            <div class="backup-codes" v-if="backupCodes.length > 0">
              <h4>Backup Codes</h4>
              <p class="warning-text">Save these codes in a safe place!</p>
              <div class="codes-grid">
                <span v-for="code in backupCodes" :key="code" class="code-item">{{ code }}</span>
              </div>
            </div>

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

.qr-code-container {
  background: white;
  padding: 10px;
  display: inline-block;
  margin: 10px 0;
  border-radius: 4px;
}

.qr-image {
  max-width: 200px;
  display: block;
}

.backup-codes {
  margin: 20px 0;
  text-align: left;
  background-color: #232736;
  padding: 15px;
  border-radius: 6px;
}

.backup-codes h4 {
  margin: 0 0 5px 0;
  color: #fff;
}

.warning-text {
  color: #e74c3c;
  font-size: 12px;
  margin-bottom: 10px;
}

.codes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.code-item {
  font-family: monospace;
  background-color: #1a1d29;
  padding: 4px 8px;
  border-radius: 4px;
  text-align: center;
  color: #8b9bb4;
}
</style>
