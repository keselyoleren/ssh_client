<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Toastify from 'toastify-js'

const router = useRouter()
const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const isLoading = ref(false)

const handleLogin = async () => {
  if (!email.value || !password.value) {
    showToast('Please enter both email and password', 'error')
    return
  }

  isLoading.value = true

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        remember_device: rememberMe.value
      })
    })

    const data = await response.json()

    if (response.ok) {
      if (rememberMe.value) {
        localStorage.setItem('token', data.access_token)
        localStorage.setItem('user', JSON.stringify(data.user || {}))
      } else {
        sessionStorage.setItem('token', data.access_token)
        sessionStorage.setItem('user', JSON.stringify(data.user || {}))
      }
      
      showToast('Login successful!', 'success')
      router.push('/')
    } else {
      showToast(data.detail || 'Login failed', 'error')
    }
  } catch (error) {
    console.error('Login error:', error)
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
        <h1>SSH Client</h1>
        <p>Secure Terminal Access</p>
      </div>
      
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="email">Email</label>
          <input 
            type="email" 
            id="email" 
            v-model="email" 
            placeholder="Enter your email"
            required
            autofocus
          >
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            placeholder="Enter your password"
            required
          >
        </div>
        
        <div class="form-options">
          <label class="checkbox-container">
            <input type="checkbox" v-model="rememberMe">
            <span class="checkmark"></span>
            Remember me
          </label>
          <a href="#" class="forgot-password">Forgot Password?</a>
        </div>
        
        <button type="submit" class="btn-login" :disabled="isLoading">
          {{ isLoading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>
      
      <div class="login-footer">
        Don't have an account? <router-link to="/register">Create one</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  font-size: 13px;
}

.checkbox-container {
  display: flex;
  align-items: center;
  color: #8b9bb4;
  cursor: pointer;
}

.checkbox-container input {
  margin-right: 8px;
}

.forgot-password {
  color: #4a9eff;
  text-decoration: none;
}

.forgot-password:hover {
  text-decoration: underline;
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
