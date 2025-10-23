class LoginManager {
    constructor() {
        this.currentStep = 'login';
        this.mfaSetupData = null;
        this.token = localStorage.getItem('access_token');
        
        this.initializeElements();
        this.initializeEventListeners();
        this.loadSettings();
    }

    initializeElements() {
        // Login form elements
        this.loginForm = document.getElementById('emailPasswordForm');
        this.mfaForm = document.getElementById('mfaCodeForm');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.rememberCheckbox = document.getElementById('remember');
        this.loginBtn = document.getElementById('loginBtn');
        
        // MFA code inputs
        this.mfaInputs = document.querySelectorAll('.code-input');
        this.resendLink = document.getElementById('resendLink');
        
        // Settings dropdown
        this.settingsDropdown = document.getElementById('settingsDropdown');
        this.settingsMenu = document.getElementById('settingsMenu');
        
        // Change email form
        this.emailChangeForm = document.getElementById('emailChangeForm');
        this.currentEmailSpan = document.getElementById('currentEmail');
        this.newEmailInput = document.getElementById('newEmail');
        
        // Change password form
        this.passwordChangeForm = document.getElementById('passwordChangeForm');
        this.currentPasswordInput = document.getElementById('currentPassword');
        this.newPasswordInput = document.getElementById('newPassword');
        this.confirmPasswordInput = document.getElementById('confirmPassword');
        this.strengthFill = document.getElementById('strengthFill');
        this.strengthText = document.getElementById('strengthText');
        
        // Error/success elements
        this.errorMessage = document.getElementById('errorMessage');
        this.successMessage = document.getElementById('successMessage');
    }

    initializeEventListeners() {
        // Login form
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // MFA form
        if (this.mfaForm) {
            this.mfaForm.addEventListener('submit', (e) => this.handleMFAVerification(e));
        }

        // MFA code inputs
        this.mfaInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => this.handleMFAInput(e, index));
            input.addEventListener('keydown', (e) => this.handleMFAKeydown(e, index));
            input.addEventListener('paste', (e) => this.handleMFAPaste(e));
        });

        // Settings dropdown
        if (this.settingsDropdown) {
            this.settingsDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSettingsMenu();
            });
        }

        // Change email form
        if (this.emailChangeForm) {
            this.emailChangeForm.addEventListener('submit', (e) => this.handleEmailChange(e));
        }

        // Change password form
        if (this.passwordChangeForm) {
            this.passwordChangeForm.addEventListener('submit', (e) => this.handlePasswordChange(e));
        }

        // Password strength checking
        if (this.newPasswordInput) {
            this.newPasswordInput.addEventListener('input', () => this.checkPasswordStrength());
        }

        // Confirm password validation
        if (this.confirmPasswordInput) {
            this.confirmPasswordInput.addEventListener('input', () => this.validatePasswordMatch());
        }

        // Forgot password link
        const forgotPasswordLink = document.querySelector('.forgot-link');
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleForgotPassword();
            });
        }

        // Sign up link
        const signupLink = document.querySelector('a[href="#"]');
        if (signupLink && signupLink.textContent.includes('Sign up')) {
            signupLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/auth/register-page';
            });
        }

        // Resend MFA code
        if (this.resendLink) {
            this.resendLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.resendMFACode();
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            this.closeAllDropdowns();
        });

        // Prevent dropdown close when clicking inside
        if (this.settingsMenu) {
            this.settingsMenu.addEventListener('click', (e) => e.stopPropagation());
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = this.emailInput.value;
        const password = this.passwordInput.value;
        const remember = this.rememberCheckbox.checked;
        
        if (!email || !password) {
            this.showError('Please fill in all fields');
            return;
        }

        this.setLoginLoading(true);

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                if (data.mfa_required) {
                    // Show MFA form
                    this.showMFAForm();
                } else {
                    // Login successful
                    this.handleLoginSuccess(data, remember);
                }
            } else {
                this.showError(data.detail || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('A network error occurred. Please try again.');
        } finally {
            this.setLoginLoading(false);
        }
    }

    async handleMFAVerification(e) {
        e.preventDefault();
        
        const mfaCode = this.getMFACode();
        if (!mfaCode || mfaCode.length !== 6) {
            this.showError('Please enter a valid 6-digit code');
            return;
        }

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: this.emailInput.value,
                    password: this.passwordInput.value,
                    mfa_code: mfaCode
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.handleLoginSuccess(data, this.rememberCheckbox.checked);
            } else {
                this.showError(data.detail || 'Invalid MFA code');
                this.clearMFAInputs();
            }
        } catch (error) {
            console.error('MFA verification error:', error);
            this.showError('A network error occurred. Please try again.');
        }
    }

    handleLoginSuccess(data, remember) {
        // Store token
        if (remember) {
            localStorage.setItem('access_token', data.access_token);
        } else {
            sessionStorage.setItem('access_token', data.access_token);
        }
        
        // Store user info
        localStorage.setItem('user_info', JSON.stringify(data.user));
        
        this.showSuccess('Login successful! Redirecting...');
        
        // Redirect to main app
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    }

    async handleEmailChange(e) {
        e.preventDefault();
        
        const newEmail = this.newEmailInput.value;
        if (!newEmail) {
            this.showError('Please enter a new email');
            return;
        }

        try {
            const token = this.getToken();
            const response = await fetch('/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    email: newEmail
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess('Email updated successfully!');
                this.currentEmailSpan.textContent = newEmail;
                this.newEmailInput.value = '';
                
                // Update stored user info
                const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
                userInfo.email = newEmail;
                localStorage.setItem('user_info', JSON.stringify(userInfo));
            } else {
                this.showError(data.detail || 'Failed to update email');
            }
        } catch (error) {
            console.error('Email change error:', error);
            this.showError('A network error occurred. Please try again.');
        }
    }

    async handlePasswordChange(e) {
        e.preventDefault();
        
        const currentPassword = this.currentPasswordInput.value;
        const newPassword = this.newPasswordInput.value;
        const confirmPassword = this.confirmPasswordInput.value;
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            this.showError('Please fill in all fields');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            this.showError('New passwords do not match');
            return;
        }
        
        if (newPassword.length < 8) {
            this.showError('Password must be at least 8 characters long');
            return;
        }

        try {
            const token = this.getToken();
            const response = await fetch('/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                    confirm_password: confirmPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess('Password updated successfully!');
                this.passwordChangeForm.reset();
            } else {
                this.showError(data.detail || 'Failed to update password');
            }
        } catch (error) {
            console.error('Password change error:', error);
            this.showError('A network error occurred. Please try again.');
        }
    }

    async handleForgotPassword() {
        const email = this.emailInput.value;
        if (!email) {
            this.showError('Please enter your email address first');
            return;
        }

        try {
            const response = await fetch('/auth/password-reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email
                })
            });

            const data = await response.json();
            this.showSuccess('If the email exists, a reset link has been sent.');
        } catch (error) {
            console.error('Password reset error:', error);
            this.showError('A network error occurred. Please try again.');
        }
    }

    checkPasswordStrength() {
        const password = this.newPasswordInput.value;
        const strength = this.calculatePasswordStrength(password);
        
        this.strengthFill.style.width = `${strength.percentage}%`;
        this.strengthFill.className = `strength-fill strength-${strength.level}`;
        this.strengthText.textContent = strength.text;
    }

    calculatePasswordStrength(password) {
        let score = 0;
        let feedback = [];

        if (password.length >= 8) score += 1;
        else feedback.push('at least 8 characters');

        if (/[a-z]/.test(password)) score += 1;
        else feedback.push('lowercase letters');

        if (/[A-Z]/.test(password)) score += 1;
        else feedback.push('uppercase letters');

        if (/[0-9]/.test(password)) score += 1;
        else feedback.push('numbers');

        if (/[^a-zA-Z0-9]/.test(password)) score += 1;
        else feedback.push('special characters');

        const levels = ['very-weak', 'weak', 'fair', 'good', 'strong'];
        const texts = [
            'Very Weak',
            'Weak',
            'Fair',
            'Good',
            'Strong'
        ];

        if (password.length === 0) {
            return { level: 'very-weak', percentage: 0, text: 'Enter a password' };
        }

        const level = Math.min(score, 4);
        const percentage = ((score + 1) / 5) * 100;

        return {
            level: levels[level],
            percentage,
            text: texts[level] + (feedback.length > 0 ? ` - Add ${feedback.join(', ')}` : '')
        };
    }

    validatePasswordMatch() {
        const newPassword = this.newPasswordInput.value;
        const confirmPassword = this.confirmPasswordInput.value;
        
        if (confirmPassword && newPassword !== confirmPassword) {
            this.confirmPasswordInput.setCustomValidity('Passwords do not match');
        } else {
            this.confirmPasswordInput.setCustomValidity('');
        }
    }

    // MFA Helper Methods
    showMFAForm() {
        this.loginForm.style.display = 'none';
        this.mfaForm.style.display = 'block';
        this.mfaInputs[0].focus();
    }

    hideMFAForm() {
        this.mfaForm.style.display = 'none';
        this.loginForm.style.display = 'block';
    }

    handleMFAInput(e, index) {
        const input = e.target;
        const value = input.value;

        // Only allow digits
        if (!/^\d*$/.test(value)) {
            input.value = value.replace(/\D/g, '');
            return;
        }

        // Move to next input if digit entered
        if (value && index < this.mfaInputs.length - 1) {
            this.mfaInputs[index + 1].focus();
        }

        // Auto-submit if all fields filled
        if (this.getMFACode().length === 6) {
            setTimeout(() => this.handleMFAVerification({ preventDefault: () => {} }), 100);
        }
    }

    handleMFAKeydown(e, index) {
        // Handle backspace
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            this.mfaInputs[index - 1].focus();
        }
    }

    handleMFAPaste(e) {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        const digits = paste.replace(/\D/g, '').slice(0, 6);
        
        this.mfaInputs.forEach((input, index) => {
            input.value = digits[index] || '';
        });
        
        if (digits.length === 6) {
            setTimeout(() => this.handleMFAVerification({ preventDefault: () => {} }), 100);
        }
    }

    getMFACode() {
        return Array.from(this.mfaInputs).map(input => input.value).join('');
    }

    clearMFAInputs() {
        this.mfaInputs.forEach(input => input.value = '');
        this.mfaInputs[0].focus();
    }

    async resendMFACode() {
        // For now, just show a message. In a real app, you'd implement SMS/email resend
        this.showSuccess('A new code has been sent to your device.');
    }

    // Settings Methods
    toggleSettingsMenu() {
        if (this.settingsMenu.style.display === 'block') {
            this.settingsMenu.style.display = 'none';
        } else {
            this.settingsMenu.style.display = 'block';
        }
    }

    closeAllDropdowns() {
        if (this.settingsMenu) {
            this.settingsMenu.style.display = 'none';
        }
    }

    loadSettings() {
        // Load current user info
        const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
        if (userInfo.email && this.currentEmailSpan) {
            this.currentEmailSpan.textContent = userInfo.email;
        }
    }

    // Utility Methods
    getToken() {
        return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    }

    setLoginLoading(loading) {
        if (this.loginBtn) {
            this.loginBtn.disabled = loading;
            this.loginBtn.textContent = loading ? 'Signing in...' : 'Sign In';
        }
    }

    showError(message) {
        if (this.errorMessage) {
            this.errorMessage.textContent = message;
            this.errorMessage.style.display = 'block';
            
            // Hide after 5 seconds
            setTimeout(() => {
                this.errorMessage.style.display = 'none';
            }, 5000);
        } else {
            // Fallback to alert if no error element
            this.showToast('Error: ' + message);
        }
    }

    showSuccess(message) {
        if (this.successMessage) {
            this.successMessage.textContent = message;
            this.successMessage.style.display = 'block';
            
            // Hide after 3 seconds
            setTimeout(() => {
                this.successMessage.style.display = 'none';
            }, 3000);
        } else {
            // Fallback to alert if no success element
            this.showToast('Success: ' + message);
        }
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});