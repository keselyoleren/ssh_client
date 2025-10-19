class ResetPasswordManager {
    constructor() {
        this.form = document.getElementById('resetForm');
        this.tokenInput = document.getElementById('token');
        this.newPasswordInput = document.getElementById('newPassword');
        this.confirmPasswordInput = document.getElementById('confirmPassword');
        this.strengthFill = document.getElementById('strengthFill');
        this.strengthText = document.getElementById('strengthText');
        this.resetBtn = document.getElementById('resetBtn');
        
        this.initializeEventListeners();
        this.checkToken();
    }

    initializeEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.newPasswordInput.addEventListener('input', () => this.checkPasswordStrength());
        this.confirmPasswordInput.addEventListener('input', () => this.validatePasswordMatch());
    }

    checkToken() {
        const token = this.tokenInput.value;
        if (!token) {
            this.showErrorMessage('Invalid or missing reset token. Please request a new password reset.');
            this.form.style.display = 'none';
        }
    }

    checkPasswordStrength() {
        const password = this.newPasswordInput.value;
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
        const password = this.newPasswordInput.value;
        const confirmPassword = this.confirmPasswordInput.value;
        
        if (confirmPassword && password !== confirmPassword) {
            this.showError('confirm-password-error', 'Passwords do not match');
            return false;
        }
        
        this.clearError('confirm-password-error');
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
        const passwordValid = this.newPasswordInput.value.length >= 8;
        const passwordMatchValid = this.validatePasswordMatch();
        
        if (!passwordValid || !passwordMatchValid) {
            if (!passwordValid) {
                this.showError('password-error', 'Password must be at least 8 characters long');
            }
            return;
        }

        this.setLoading(true);

        try {
            const formData = {
                token: this.tokenInput.value,
                new_password: this.newPasswordInput.value,
                confirm_password: this.confirmPasswordInput.value
            };

            const response = await fetch('/auth/password-reset/confirm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccessMessage();
            } else {
                this.showErrorMessage(data.detail || 'Password reset failed. Please try again.');
            }
        } catch (error) {
            console.error('Password reset error:', error);
            this.showErrorMessage('A network error occurred. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        const btnText = this.resetBtn.querySelector('.btn-text');
        const spinner = this.resetBtn.querySelector('.loading-spinner');
        
        if (loading) {
            btnText.style.display = 'none';
            spinner.style.display = 'inline-block';
            this.resetBtn.disabled = true;
        } else {
            btnText.style.display = 'inline';
            spinner.style.display = 'none';
            this.resetBtn.disabled = false;
        }
    }

    showSuccessMessage() {
        this.form.style.display = 'none';
        document.getElementById('successMessage').style.display = 'block';
    }

    showErrorMessage(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').style.display = 'block';
    }
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ResetPasswordManager();
});