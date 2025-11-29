<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Toastify from 'toastify-js'

const router = useRouter()
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)

const handleRegister = async () => {
  if (!email.value || !password.value || !confirmPassword.value) {
    showToast('Please fill in all fields', 'error')
    return
  }

  if (password.value !== confirmPassword.value) {
    showToast('Passwords do not match', 'error')
    return
  }

  isLoading.value = true

  try {
    const response = await fetch('/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        confirm_password: confirmPassword.value
      })
    })

    const data = await response.json()

    if (response.ok) {
      showToast('Registration successful! Please login.', 'success')
      router.push('/login')
    } else {
      showToast(data.detail || 'Registration failed', 'error')
    }
  } catch (error) {
    console.error('Registration error:', error)
    showToast('An error occurred. Please try again.', 'error')
  } finally {
    isLoading.value = false
  }
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
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h1>Create Account</h1>
        <p>Join SSH Client today</p>
      </div>
      
      <form @submit.prevent="handleRegister">
        <div class="form-group">
          <label for="email">Email</label>
          <input 
            type="email" 
            id="email" 
            v-model="email" 
            placeholder="Enter your email"
            required
          >
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            placeholder="Create a password"
            required
          >
        </div>

        <div class="form-group">
          <label for="confirm-password">Confirm Password</label>
          <input 
            type="password" 
            id="confirm-password" 
            v-model="confirmPassword" 
            placeholder="Confirm your password"
            required
          >
        </div>
        
        <button type="submit" class="btn-login" :disabled="isLoading">
          {{ isLoading ? 'Creating Account...' : 'Sign Up' }}
        </button>
      </form>
      
      <div class="login-footer">
        Already have an account? <router-link to="/login">Sign In</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Reusing styles from LoginView for consistency */
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #0f111a;
  background-image: radial-gradient(circle at 50% 50%, #1a1d29 0%, #0f111a 100%);
}

.login-box {
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background-color: #1a1d29;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border: 1px solid #2e3247;
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h1 {
  margin: 0;
  color: #fff;
  font-size: 24px;
  font-weight: 600;
}

.login-header p {
  margin: 5px 0 0;
  color: #8b9bb4;
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #e4e6eb;
  font-size: 14px;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 12px;
  background-color: #0f111a;
  border: 1px solid #2e3247;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #4a9eff;
}

.btn-login {
  width: 100%;
  padding: 12px;
  background-color: #4a9eff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-login:hover {
  background-color: #3b82f6;
}

.btn-login:disabled {
  background-color: #2e3247;
  cursor: not-allowed;
  color: #8b9bb4;
}

.login-footer {
  margin-top: 24px;
  text-align: center;
  color: #8b9bb4;
  font-size: 14px;
}

.login-footer a {
  color: #4a9eff;
  text-decoration: none;
  font-weight: 500;
}

.login-footer a:hover {
  text-decoration: underline;
}
</style>
