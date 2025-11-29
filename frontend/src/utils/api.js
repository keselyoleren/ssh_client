import { useRouter } from 'vue-router'

const getTokens = () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const refreshToken = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token')
    return { token, refreshToken }
}

const setTokens = (token, refreshToken, rememberMe) => {
    if (rememberMe) {
        localStorage.setItem('token', token)
        if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
    } else {
        sessionStorage.setItem('token', token)
        if (refreshToken) sessionStorage.setItem('refresh_token', refreshToken)
    }
}

const clearTokens = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('refresh_token')
    sessionStorage.removeItem('user')
}

export const fetchWithAuth = async (url, options = {}) => {
    const { token, refreshToken } = getTokens()

    // Default headers
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        })

        // If unauthorized, try to refresh token
        if (response.status === 401 && refreshToken) {
            try {
                const refreshResponse = await fetch('/auth/refresh', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ refresh_token: refreshToken })
                })

                if (refreshResponse.ok) {
                    const data = await refreshResponse.json()
                    const isRemembered = !!localStorage.getItem('token')

                    // Update access token
                    setTokens(data.access_token, null, isRemembered)

                    // Retry original request with new token
                    headers['Authorization'] = `Bearer ${data.access_token}`
                    return fetch(url, {
                        ...options,
                        headers
                    })
                } else {
                    // Refresh failed, logout
                    clearTokens()
                    window.location.href = '/login'
                    throw new Error('Session expired')
                }
            } catch (refreshError) {
                clearTokens()
                window.location.href = '/login'
                throw refreshError
            }
        }

        return response
    } catch (error) {
        throw error
    }
}
