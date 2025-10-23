class RegisterManager {
    constructor() {
        this.form = document.getElementById('registerForm');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.confirmPasswordInput = document.getElementById('confirmPassword');
        this.strengthFill = document.getElementById('strengthFill');
        this.strengthText = document.getElementById('strengthText');
        this.registerBtn = document.getElementById('registerBtn');
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.passwordInput.addEventListener('input', () => this.checkPasswordStrength());
        this.confirmPasswordInput.addEventListener('input', () => this.validatePasswordMatch());
        this.emailInput.addEventListener('input', () => this.validateEmail());
    }

    checkPasswordStrength() {
        const password = this.passwordInput.value;
        const strength = this.calculatePasswordStrength(password);
        
        this.strengthFill.style.width = `${strength.percentage}%`;
        this.strengthFill.className = `strength-fill strength-${strength.level}`;
        this.strengthText.textContent = strength.text;
        
        this.clearError('password-error');
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
        const password = this.passwordInput.value;
        const confirmPassword = this.confirmPasswordInput.value;
        
        if (confirmPassword && password !== confirmPassword) {
            this.showError('confirm-password-error', 'Passwords do not match');
            return false;
        }
        
        this.clearError('confirm-password-error');
        return true;
    }

    validateEmail() {
        const email = this.emailInput.value;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (email && !emailRegex.test(email)) {
            this.showError('email-error', 'Please enter a valid email address');
            return false;
        }
        
        this.clearError('email-error');
        return true;
    }

    showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    clearError(elementId) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        // Validate form
        const emailValid = this.validateEmail();
        const passwordValid = this.passwordInput.value.length >= 8;
        const passwordMatchValid = this.validatePasswordMatch();
        
        if (!emailValid || !passwordValid || !passwordMatchValid) {
            if (!passwordValid) {
                this.showError('password-error', 'Password must be at least 8 characters long');
            }
            return;
        }

        this.setLoading(true);

        try {
            const formData = {
                email: this.emailInput.value,
                password: this.passwordInput.value,
                confirm_password: this.confirmPasswordInput.value
            };

            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast('Registration successful! Please login.', 'success');
                setTimeout(() => {
                    window.location.href = '/auth/login-page';
                }, 2000);
            } else {
                this.showToast(data.detail || 'Registration failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showToast('A network error occurred. Please try again.', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        const btnText = this.registerBtn.querySelector('.btn-text');
        const spinner = this.registerBtn.querySelector('.loading-spinner');
        
        if (loading) {
            btnText.style.display = 'none';
            spinner.style.display = 'inline-block';
            this.registerBtn.disabled = true;
        } else {
            btnText.style.display = 'inline';
            spinner.style.display = 'none';
            this.registerBtn.disabled = false;
        }
    }

    showToast(message, type = 'info') {
        const backgroundColor = {
            info: '#3498db',
            success: '#2ecc71',
            warning: '#f1c40f',
            error: '#e74c3c'
        }[type];

        Toastify({
            text: message,
            duration: 3000,
            close: true,
            gravity: "top", // `top` or `bottom`
            position: "right", // `left`, `center` or `right`
            backgroundColor: backgroundColor,
            stopOnFocus: true, // Prevents dismissing of toast on hover
        }).showToast();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RegisterManager();
});