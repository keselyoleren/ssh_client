// SSH Client - Main App JavaScript

class SSHClientApp {
    constructor() {
        this.terminals = {};
        this.activeTabId = null;
        this.clients = [];
        this.currentTheme = 'hacker-blue';
        this.editingClientId = null;
        this.currentUser = null;
        this.mfaSetupData = null;
        this.terminalThemes = {}; // Store per-terminal themes
        this.settingsData = {
            mfa: {
                enabled: false,
                methods: {
                    authenticator: false,
                    sms: false,
                    email: false,
                    backupCodes: false
                },
                backupCodes: []
            },
            session: {
                autoLogout: true,
                rememberDevice: false
            },
            terminal: {
                autoReconnect: true,
                bellSound: false,
                theme: 'hacker-blue'
            },
            general: {
                darkMode: true,
                notifications: true,
                autoSave: true
            }
        };

        this.iconColors = ['blue'];
        this.icons = ['🖥️'];
        
        // OS-based icons mapping
        this.osIcons = {
            'linux': '🐧',        // Penguin for Linux
            'ubuntu': '🟠',       // Orange circle for Ubuntu
            'debian': '🔴',       // Red circle for Debian
            'redhat': '🎩',       // Hat for Red Hat/CentOS
            'fedora': '🔵',       // Blue circle for Fedora
            'alpine': '🏔️',       // Mountain for Alpine
            'arch': '🏛️',        // Classical building for Arch
            'macos': '🍎',        // Apple for macOS
            'windows': '🪟',      // Window for Windows
            'freebsd': '😈',      // Devil for FreeBSD
            'openbsd': '🐡',      // Pufferfish for OpenBSD
            'unknown': '🖥️',     // Generic computer
            'default': '⚡'       // Lightning for terminals (unchanged)
        };
        
        this.themes = {
            'flexoki-dark': {
                name: 'Flexoki Dark',
                downloads: 'new',
                background: '#100f0f',
                foreground: '#cecdc3',
                cursor: '#d0a215',
                colors: ['#878580', '#d14d41', '#879a39', '#d0a215', '#4385be', '#ce5d97', '#3aa99f', '#cecdc3']
            },
            'flexoki-light': {
                name: 'Flexoki Light',
                downloads: 'new',
                background: '#fffcf0',
                foreground: '#100f0f',
                cursor: '#d0a215',
                colors: ['#6f6e69', '#af3029', '#66800b', '#ad8301', '#205ea6', '#a02f6f', '#24837b', '#cecdc3']
            },
            'kanagawa-wave': {
                name: 'Kanagawa Wave',
                downloads: 'new',
                background: '#1f1f28',
                foreground: '#dcd7ba',
                cursor: '#c8c093',
                colors: ['#090618', '#c34043', '#76946a', '#c0a36e', '#7e9cd8', '#957fb8', '#6a9589', '#c8c093']
            },
            'kanagawa-dragon': {
                name: 'Kanagawa Dragon',
                downloads: 'new',
                background: '#181616',
                foreground: '#c5c9c5',
                cursor: '#c8c093',
                colors: ['#0d0c0c', '#c4746e', '#8a9a7b', '#c4b28a', '#8ba4b0', '#a292a3', '#8ea4a2', '#c8c093']
            },
            'kanagawa-lotus': {
                name: 'Kanagawa Lotus',
                downloads: 'new',
                background: '#f2ecbc',
                foreground: '#545464',
                cursor: '#43436c',
                colors: ['#d5cea3', '#c84053', '#6f894e', '#77713f', '#4d699b', '#b35b79', '#597b75', '#545464']
            },
            'hacker-blue': {
                name: 'Hacker Blue',
                downloads: 'new',
                background: '#0a1628',
                foreground: '#9cc4ff',
                cursor: '#5fd7ff',
                colors: ['#1b3356', '#d84f76', '#69c39c', '#e7da6f', '#2987db', '#6f77d5', '#4fc9db', '#9cc4ff']
            },
            'hacker-green': {
                name: 'Hacker Green',
                downloads: 'new',
                background: '#0d1a0d',
                foreground: '#6fff6f',
                cursor: '#8fff8f',
                colors: ['#1a3d1a', '#ff3939', '#6fff6f', '#e7e76f', '#4fa3ff', '#bf6fff', '#4fc9db', '#6fff6f']
            },
            'hacker-red': {
                name: 'Hacker Red',
                downloads: 'new',
                background: '#1a0d0d',
                foreground: '#ff6f6f',
                cursor: '#ff8f8f',
                colors: ['#3d1a1a', '#ff3939', '#6fff6f', '#e7e76f', '#4fa3ff', '#ff6fbf', '#4fc9db', '#ff6f6f']
            },
            'everforest-dark': {
                name: 'Everforest Dark',
                downloads: 'new',
                background: '#2b3339',
                foreground: '#d3c6aa',
                cursor: '#d3c6aa',
                colors: ['#4b565c', '#e67e80', '#a7c080', '#dbbc7f', '#7fbbb3', '#d699b6', '#83c092', '#d3c6aa']
            },
            'everforest-light': {
                name: 'Everforest Light',
                downloads: 'new',
                background: '#fdf6e3',
                foreground: '#5c6a72',
                cursor: '#5c6a72',
                colors: ['#5c6a72', '#f85552', '#8da101', '#dfa000', '#3a94c5', '#df69ba', '#35a77c', '#dfddc8']
            },
            'night-owl': {
                name: 'Night Owl',
                downloads: 'new',
                background: '#011627',
                foreground: '#d6deeb',
                cursor: '#80a4c2',
                colors: ['#011627', '#ef5350', '#c792ea', '#addb67', '#82aaff', '#c792ea', '#7fdbca', '#ffffff']
            },
            'light-owl': {
                name: 'Light Owl',
                downloads: 'new',
                background: '#f0f0f0',
                foreground: '#403f53',
                cursor: '#403f53',
                colors: ['#011627', '#de3d3b', '#2aa298', '#daaa01', '#4876d6', '#403f53', '#08916a', '#403f53']
            },
            'aura': {
                name: 'Aura',
                downloads: 'new',
                background: '#15141b',
                foreground: '#edecee',
                cursor: '#a277ff',
                colors: ['#110f18', '#ff6767', '#61ffca', '#ffca85', '#a277ff', '#a277ff', '#61ffca', '#edecee']
            },
            'rose-pine': {
                name: 'Rosé Pine',
                downloads: 'new',
                background: '#191724',
                foreground: '#e0def4',
                cursor: '#524f67',
                colors: ['#26233a', '#eb6f92', '#9ccfd8', '#f6c177', '#31748f', '#c4a7e7', '#ebbcba', '#e0def4']
            }
        };

        this.init();
    }

    init() {
        this.initializeAuth();
        this.initializeElements();
        this.bindEventListeners();
        this.loadSettings();
        this.renderThemes();
        this.fetchClients();
    }

    // Authentication Methods
    async initializeAuth() {
        try {
            // Check if user is logged in
            const token = this.getToken();
            if (!token) {
                this.redirectToLogin();
                return;
            }

            // Get current user info
            const response = await fetch('/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.updateUserInterface();
                this.updateMFASettings(); // Load MFA status from server
            } else {
                this.redirectToLogin();
            }
        } catch (error) {
            console.error('Auth initialization error:', error);
            this.redirectToLogin();
        }
    }

    getToken() {
        return localStorage.getItem('token') || sessionStorage.getItem('token');
    }

    redirectToLogin() {
        window.location.href = '/auth/login-page';
    }

    updateUserInterface() {
        // Update any user-specific UI elements
        const userMenus = document.querySelectorAll('.user-email');
        userMenus.forEach(menu => {
            if (this.currentUser && this.currentUser.email) {
                menu.textContent = this.currentUser.email;
            }
        });

        // Update MFA settings based on user's MFA status
        if (this.currentUser) {
            this.settingsData.mfa.enabled = this.currentUser.mfa_enabled;
        }
    }

    async logout() {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                // Call logout endpoint to invalidate token on server
                await fetch('/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }
        } catch (error) {
            console.error('Logout API error:', error);
        }
        
        // Clear tokens and user data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        
        // Redirect to login page
        window.location.href = '/login';
    }

    // MFA Management Methods
    async setupMFA() {
        console.log('Setting up MFA...');
        try {
            const token = this.getToken();
            console.log('Token available:', !!token);
            
            const response = await fetch('/auth/mfa/setup', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('MFA setup response status:', response.status);
            
            if (response.ok) {
                this.mfaSetupData = await response.json();
                console.log('MFA setup data received:', this.mfaSetupData);
                this.showMFASetupModal();
            } else {
                const error = await response.json();
                console.error('MFA setup error:', error);
                this.showNotification('Failed to setup MFA: ' + error.detail, 'error');
            }
        } catch (error) {
            console.error('MFA setup error:', error);
            this.showNotification('A network error occurred', 'error');
        }
    }

    showMFASetupModal() {
        console.log('Showing MFA setup modal with data:', this.mfaSetupData);
        if (!this.mfaSetupData) {
            console.error('No MFA setup data available');
            return;
        }
        
        console.log('MFA backup codes:', this.mfaSetupData.backup_codes);
        console.log('Number of backup codes:', this.mfaSetupData.backup_codes ? this.mfaSetupData.backup_codes.length : 0);

        const modal = document.createElement('div');
        modal.className = 'modal mfa-setup-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="close-btn">×</button>
                <div class="modal-header">Setup Multi-Factor Authentication</div>
                
                <div class="mfa-setup-steps">
                    <div class="step">
                        <h4>1. Scan QR Code</h4>
                        <p>Use your authenticator app (Google Authenticator, Authy, etc.) to scan this QR code:</p>
                        <div class="qr-code-container">
                            <img src="${this.mfaSetupData.qr_code_url}" alt="MFA QR Code" class="qr-code">
                        </div>
                    </div>
                    
                    <div class="step">
                        <h4>2. Enter Verification Code</h4>
                        <p>Enter the 6-digit code from your authenticator app:</p>
                        <div class="form-group">
                            <div class="code-input-group">
                                <input type="text" class="code-input" maxlength="1" data-index="0">
                                <input type="text" class="code-input" maxlength="1" data-index="1">
                                <input type="text" class="code-input" maxlength="1" data-index="2">
                                <input type="text" class="code-input" maxlength="1" data-index="3">
                                <input type="text" class="code-input" maxlength="1" data-index="4">
                                <input type="text" class="code-input" maxlength="1" data-index="5">
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <h4>3. Backup Codes</h4>
                        <p>Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device:</p>
                        <div class="backup-codes-warning">
                            <strong>⚠️ Important:</strong> These codes can only be used once each. Store them securely!
                        </div>
                        <div class="backup-codes">
                            ${this.mfaSetupData.backup_codes.map(code => `<span class="backup-code">${code}</span>`).join('')}
                        </div>
                        <button type="button" class="btn btn-secondary download-backup-btn">📥 Download Codes</button>
                    </div>
                </div>

                <form id="mfa-verification-form">
                    <div class="modal-footer">
                        <button type="button" class="btn cancel-btn">Cancel</button>
                        <button type="submit" class="btn btn-primary">Verify & Enable MFA</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        // Setup event listeners
        const closeBtn = modal.querySelector('.close-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');
        
        const closeModal = () => {
            modal.classList.remove('active');
            setTimeout(() => {
                if (modal.parentNode) {
                    document.body.removeChild(modal);
                }
            }, 300);
        };
        
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        const form = modal.querySelector('#mfa-verification-form');
        form.addEventListener('submit', (e) => this.verifyMFASetup(e, modal));

        // Setup backup codes download
        const downloadBtn = modal.querySelector('.download-backup-btn');
        downloadBtn.addEventListener('click', () => this.downloadBackupCodes());

        // Setup code input handling
        const codeInputs = modal.querySelectorAll('.code-input');
        codeInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => this.handleMFACodeInput(e, index, codeInputs));
            input.addEventListener('keydown', (e) => this.handleMFACodeKeydown(e, index, codeInputs));
        });

        // Show modal with proper animation
        modal.classList.add('active');
        
        // Focus first input
        setTimeout(() => {
            const firstInput = modal.querySelector('.code-input');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    async verifyMFASetup(e, modal) {
        e.preventDefault();
        
        const codeInputs = modal.querySelectorAll('.code-input');
        const code = Array.from(codeInputs).map(input => input.value).join('');
        
        if (code.length !== 6) {
            this.showNotification('Please enter a valid 6-digit code', 'error');
            return;
        }

        try {
            const token = this.getToken();
            const response = await fetch('/auth/mfa/verify-setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code: code })
            });

            if (response.ok) {
                this.showNotification('MFA enabled successfully!', 'success');
                this.settingsData.mfa.enabled = true;
                if (this.currentUser) {
                    this.currentUser.mfa_enabled = true;
                }
                await this.updateMFASettings();
                document.body.removeChild(modal);
            } else {
                const error = await response.json();
                this.showNotification('Invalid code: ' + error.detail, 'error');
            }
        } catch (error) {
            console.error('MFA verification error:', error);
            this.showNotification('A network error occurred', 'error');
        }
    }

    async disableMFA(password, mfaCode) {
        try {
            const token = this.getToken();
            const response = await fetch('/auth/mfa/disable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    password: password,
                    code: mfaCode
                })
            });

            if (response.ok) {
                this.showNotification('MFA disabled successfully!', 'success');
                this.settingsData.mfa.enabled = false;
                if (this.currentUser) {
                    this.currentUser.mfa_enabled = false;
                }
                await this.updateMFASettings();
                this.closeMFADisableFormModal();
            } else {
                const error = await response.json();
                this.showNotification('Failed to disable MFA: ' + error.detail, 'error');
            }
        } catch (error) {
            console.error('MFA disable error:', error);
            this.showNotification('A network error occurred', 'error');
        }
    }

    async updateMFASettings() {
        try {
            // Fetch current MFA status from server
            const token = this.getToken();
            if (token) {
                const response = await fetch('/auth/mfa/status', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const mfaStatus = await response.json();
                    this.settingsData.mfa.enabled = mfaStatus.mfa_enabled;
                    
                    // Update current user object
                    if (this.currentUser) {
                        this.currentUser.mfa_enabled = mfaStatus.mfa_enabled;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch MFA status:', error);
        }
        
        const mfaToggle = document.getElementById('mfa-toggle');
        const mfaMethodsSection = document.getElementById('mfa-methods-section');
        const mfaStatusText = document.getElementById('mfa-status-text');
        
        if (mfaToggle) {
            // Update toggle switch visual state
            if (this.settingsData.mfa.enabled) {
                mfaToggle.classList.add('active');
            } else {
                mfaToggle.classList.remove('active');
            }
        }
        
        if (mfaStatusText) {
            // Update status text
            if (this.settingsData.mfa.enabled) {
                mfaStatusText.textContent = 'Status: Enabled';
                mfaStatusText.style.color = '#4CAF50';
            } else {
                mfaStatusText.textContent = 'Status: Disabled';
                mfaStatusText.style.color = '#f44336';
            }
        }
        
        if (mfaMethodsSection) {
            // Show/hide MFA methods section based on MFA status
            if (this.settingsData.mfa.enabled) {
                mfaMethodsSection.style.display = 'block';
            } else {
                mfaMethodsSection.style.display = 'none';
            }
        }
    }

    handleMFACodeInput(e, index, inputs) {
        const input = e.target;
        const value = input.value;

        // Only allow digits
        if (!/^\d*$/.test(value)) {
            input.value = value.replace(/\D/g, '');
            return;
        }

        // Move to next input if digit entered
        if (value && index < inputs.length - 1) {
            inputs[index + 1].focus();
        }
    }

    handleMFACodeKeydown(e, index, inputs) {
        // Handle backspace
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            inputs[index - 1].focus();
        }
    }

    downloadBackupCodes() {
        let backupCodes = [];
        
        // Try to get backup codes from MFA setup data first
        if (this.mfaSetupData && this.mfaSetupData.backup_codes && this.mfaSetupData.backup_codes.length > 0) {
            backupCodes = this.mfaSetupData.backup_codes;
            console.log('Using backup codes from MFA setup data:', backupCodes);
        } 
        // Fallback to settings data
        else if (this.settingsData && this.settingsData.mfa && this.settingsData.mfa.backupCodes && this.settingsData.mfa.backupCodes.length > 0) {
            backupCodes = this.settingsData.mfa.backupCodes;
            console.log('Using backup codes from settings data:', backupCodes);
        } 
        else {
            console.error('No backup codes found');
            this.showNotification('No backup codes available to download', 'error');
            return;
        }

        // Create file content with proper formatting
        const timestamp = new Date().toISOString().split('T')[0];
        const header = `SSH Client - Multi-Factor Authentication Backup Codes
Generated: ${timestamp}
Important: Each code can only be used once. Store these codes securely!

`;
        const codesText = backupCodes.map((code, index) => `${index + 1}. ${code}`).join('\n');
        const fullContent = header + codesText + '\n\n--- End of Backup Codes ---';
        
        const blob = new Blob([fullContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ssh-client-backup-codes-${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        window.URL.revokeObjectURL(url);
        
        this.showNotification('Backup codes downloaded successfully!', 'success');
    }

    // Account Management Methods
    async changePassword() {
        const currentPassword = prompt('Enter your current password:');
        if (!currentPassword) return;

        const newPassword = prompt('Enter your new password:');
        if (!newPassword) return;

        const confirmPassword = prompt('Confirm your new password:');
        if (newPassword !== confirmPassword) {
            this.showNotification('Passwords do not match', 'error');
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

            if (response.ok) {
                this.showNotification('Password updated successfully!', 'success');
            } else {
                const error = await response.json();
                this.showNotification('Failed to update password: ' + error.detail, 'error');
            }
        } catch (error) {
            console.error('Password change error:', error);
            this.showNotification('A network error occurred', 'error');
        }
    }

    async changeEmail() {
        const newEmail = prompt('Enter your new email address:');
        if (!newEmail) return;

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

            if (response.ok) {
                this.currentUser.email = newEmail;
                this.updateUserInterface();
                this.showNotification('Email updated successfully!', 'success');
            } else {
                const error = await response.json();
                this.showNotification('Failed to update email: ' + error.detail, 'error');
            }
        } catch (error) {
            console.error('Email change error:', error);
            this.showNotification('A network error occurred', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    initializeElements() {
        this.createClientForm = document.getElementById('create-client-form');
        this.clientList = document.getElementById('client-list');
        this.terminalContainer = document.getElementById('terminal-container');
        this.terminalView = document.getElementById('terminal-view');
        this.sidebar = document.getElementById('sidebar');
        this.tabBar = document.getElementById('tab-bar');
        this.createModal = document.getElementById('create-modal');
        this.searchBox = document.getElementById('search-box');
        this.gridViewBtn = document.getElementById('grid-view');
        this.listViewBtn = document.getElementById('list-view');
        this.themePanel = document.getElementById('theme-panel');
        this.themeGrid = document.getElementById('theme-grid');
        this.settingsIcon = document.querySelector('.settings-icon');
        this.modalHeaderTitle = document.getElementById('modal-header-title');
        this.submitBtn = document.getElementById('submit-btn');
        this.clientIdInput = document.getElementById('client-id');
        this.deleteBtn = document.getElementById('delete-btn');
        this.duplicateBtn = document.getElementById('duplicate-btn');
        this.settingsModal = document.getElementById('settings-modal');
    }

    bindEventListeners() {
        // View Toggle
        this.gridViewBtn.addEventListener('click', () => this.setGridView());
        this.listViewBtn.addEventListener('click', () => this.setListView());

        // Search functionality
        this.searchBox.addEventListener('input', (e) => this.handleSearch(e));

        // Form submission
        this.createClientForm.addEventListener('submit', (e) => this.handleFormSubmission(e));

        // Modal event listeners
        this.createModal.addEventListener('click', (e) => {
            if (e.target === this.createModal) this.closeCreateModal();
        });

        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettingsModal();
        });

        const changeEmailModal = document.getElementById('change-email-modal');
        changeEmailModal.addEventListener('click', (e) => {
            if (e.target === changeEmailModal) this.closeChangeEmailModal();
        });

        const changePasswordModal = document.getElementById('change-password-modal');
        changePasswordModal.addEventListener('click', (e) => {
            if (e.target === changePasswordModal) this.closeChangePasswordModal();
        });

        this.themePanel.addEventListener('click', (e) => {
            if (e.target === this.themePanel) this.toggleThemePanel();
        });

        // Window resize handler
        window.addEventListener('resize', () => {
            if (this.activeTabId && this.terminals[this.activeTabId]) {
                this.terminals[this.activeTabId].fitAddon.fit();
            }
        });

        // Setup form event listeners
        this.setupFormEventListeners();
    }

    setupFormEventListeners() {
        // Password strength checking
        const newPasswordInput = document.getElementById('new-password-change');
        if (newPasswordInput) {
            newPasswordInput.addEventListener('input', () => this.updatePasswordStrength());
        }

        // Change Email Form
        const changeEmailForm = document.getElementById('change-email-form');
        if (changeEmailForm) {
            changeEmailForm.addEventListener('submit', (e) => this.handleEmailChange(e));
        }

        // Change Password Form
        const changePasswordForm = document.getElementById('change-password-form');
        console.log('Looking for change-password-form:', changePasswordForm);
        if (changePasswordForm) {
            console.log('Binding submit event to change-password-form');
            changePasswordForm.addEventListener('submit', (e) => this.handlePasswordChange(e));
        } else {
            console.log('ERROR: change-password-form not found!');
        }

        // MFA Disable Form
        const mfaDisableForm = document.getElementById('mfa-disable-form');
        if (mfaDisableForm) {
            mfaDisableForm.addEventListener('submit', (e) => this.handleMFADisable(e));
        }
    }

    // View Management
    setGridView() {
        this.clientList.classList.remove('list-view');
        this.gridViewBtn.classList.add('active');
        this.listViewBtn.classList.remove('active');
    }

    setListView() {
        this.clientList.classList.add('list-view');
        this.listViewBtn.classList.add('active');
        this.gridViewBtn.classList.remove('active');
    }

    // Search functionality
    handleSearch(e) {
        const searchTerm = e.target.value.toLowerCase();
        const hostCards = this.clientList.querySelectorAll('.host-card');
        
        hostCards.forEach(card => {
            const text = card.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    }

    // Theme Management
    toggleThemePanel() {
        this.themePanel.classList.toggle('active');
    }

    renderThemes() {
        this.themeGrid.innerHTML = '';
        Object.keys(this.themes).forEach(themeId => {
            const theme = this.themes[themeId];
            const item = document.createElement('div');
            item.className = `theme-item ${themeId === this.currentTheme ? 'active' : ''}`;
            item.setAttribute('data-theme-id', themeId);
            item.onclick = () => this.applyTheme(themeId);
            
            const previewLines = theme.colors.slice(0, 3).map((color, i) => 
                `<div class="theme-preview-line" style="background: ${color}; width: ${90 - i * 15}%;"></div>`
            ).join('');
            
            item.innerHTML = `
                <div class="theme-preview" style="background: ${theme.background};">
                    <div class="theme-preview-lines">${previewLines}</div>
                </div>
                <div class="theme-info">
                    <div class="theme-name">${theme.name}</div>
                    <div class="theme-stats">👥 ${theme.downloads}</div>
                </div>
            `;
            
            this.themeGrid.appendChild(item);
        });
    }

    applyThemeToTerminal(tabId, themeId) {
        // Apply theme to a specific terminal
        if (this.terminals[tabId] && this.terminals[tabId].term) {
            const theme = this.themes[themeId] || this.themes['hacker-blue'];
            const newTheme = {
                background: theme.background,
                foreground: theme.foreground,
                cursor: theme.cursor,
                selection: theme.cursor + '40',
                black: theme.colors[0],
                red: theme.colors[1],
                green: theme.colors[2],
                yellow: theme.colors[3],
                blue: theme.colors[4],
                magenta: theme.colors[5],
                cyan: theme.colors[6],
                white: theme.colors[7]
            };
            
            // Set the new theme
            this.terminals[tabId].term.options.theme = newTheme;
            this.terminals[tabId].theme = themeId;
            this.terminalThemes[tabId] = themeId;
            
            // Force refresh of the terminal to apply theme changes
            if (this.terminals[tabId].term.element) {
                this.terminals[tabId].term.refresh(0, this.terminals[tabId].term.rows - 1);
            }
        }
    }

    applyTheme(themeId) {
        // Check if we should apply to current terminal only or globally
        if (this.activeTabId) {
            // Apply to current terminal
            this.applyThemeToTerminal(this.activeTabId, themeId);
        } else {
            // Apply globally (fallback behavior)
            this.currentTheme = themeId;
            Object.keys(this.terminals).forEach(tabId => {
                this.applyThemeToTerminal(tabId, themeId);
            });
        }
        
        this.renderThemes();
        
        // Save the global theme preference (used for new terminals)
        this.currentTheme = themeId;
        this.settingsData.terminal.theme = themeId;
        this.saveTerminalSettings();
    }

    // Modal Management
    openCreateModal() {
        this.editingClientId = null;
        this.modalHeaderTitle.textContent = 'Create SSH Client';
        this.submitBtn.textContent = 'Create';
        this.deleteBtn.style.display = 'none';
        this.duplicateBtn.style.display = 'none';
        this.createClientForm.reset();
        this.clientIdInput.value = '';
        this.createModal.classList.add('active');
    }

    openEditModal(client) {
        this.editingClientId = client.id;
        this.modalHeaderTitle.textContent = 'Edit SSH Client';
        this.submitBtn.textContent = 'Update';
        this.deleteBtn.style.display = 'block';
        this.duplicateBtn.style.display = 'block';
        
        document.getElementById('label').value = client.label;
        document.getElementById('host').value = client.host;
        document.getElementById('port').value = client.port;
        document.getElementById('username').value = client.username;
        document.getElementById('password').value = client.password || '';
        document.getElementById('private_key').value = client.private_key || '';
        this.clientIdInput.value = client.id;
        
        this.createModal.classList.add('active');
    }

    closeCreateModal() {
        this.createModal.classList.remove('active');
        this.createClientForm.reset();
        this.editingClientId = null;
        this.deleteBtn.style.display = 'none';
        this.duplicateBtn.style.display = 'none';
    }

    // Settings Modal Functions
    async openSettingsModal() {
        this.settingsModal.classList.add('active');
        // Clone themes to settings modal
        document.getElementById('settings-theme-grid').innerHTML = document.getElementById('theme-grid').innerHTML;
        
        // Re-attach event handlers for cloned theme items
        const settingsThemeItems = document.querySelectorAll('#settings-theme-grid .theme-item');
        settingsThemeItems.forEach(item => {
            const themeId = item.getAttribute('data-theme-id');
            if (themeId) {
                item.onclick = () => this.applyTheme(themeId);
            }
        });
        
        // Refresh MFA settings when opening settings modal
        await this.updateMFASettings();
    }

    closeSettingsModal() {
        this.settingsModal.classList.remove('active');
    }

    switchSettingsTab(tabName) {
        // Remove active class from all tabs and contents
        document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.settings-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        event.target.classList.add('active');
        document.getElementById(tabName + '-settings').classList.add('active');
    }

    // Form Handlers
    async handleFormSubmission(event) {
        event.preventDefault();
        const formData = new FormData(this.createClientForm);
        const client = Object.fromEntries(formData.entries());

        const url = this.editingClientId ? `/clients/${this.editingClientId}` : '/clients';
        const method = this.editingClientId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(client)
        });

        if (response.ok) {
            this.closeCreateModal();
            this.fetchClients();
        }
    }

    async handleEmailChange(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('current-password-email').value;
        const newEmail = document.getElementById('new-email').value;
        const confirmEmail = document.getElementById('confirm-email').value;
        
        if (!currentPassword || !newEmail || !confirmEmail) {
            this.showNotification('Please fill in all fields', 'error');
            return;
        }
        
        if (newEmail !== confirmEmail) {
            this.showNotification('Email addresses do not match', 'error');
            return;
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            this.showNotification('Please enter a valid email address', 'error');
            return;
        }
        
        try {
            const token = this.getToken();
            const response = await fetch('/auth/change-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_email: newEmail,
                    confirm_email: confirmEmail
                })
            });

            if (response.ok) {
                // Update local user data
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                user.email = newEmail;
                localStorage.setItem('user', JSON.stringify(user));
                
                document.getElementById('currentEmailDisplay').textContent = newEmail;
                this.showNotification('Email updated successfully!', 'success');
                this.closeChangeEmailModal();
            } else {
                const error = await response.json();
                this.showNotification('Failed to update email: ' + error.detail, 'error');
            }
        } catch (error) {
            console.error('Email change error:', error);
            this.showNotification('A network error occurred', 'error');
        }
    }

    async handlePasswordChange(e) {
        console.log('=== PASSWORD CHANGE FORM SUBMITTED ===');
        console.log('Event:', e);
        console.log('Event target:', e.target);
        console.log('Form element:', e.target.tagName);
        e.preventDefault();
        
        const currentPassword = document.getElementById('current-password-change').value;
        const newPassword = document.getElementById('new-password-change').value;
        const confirmPassword = document.getElementById('confirm-password-change').value;
        
        console.log('=== PASSWORD VALUES ===');
        console.log('Current password length:', currentPassword.length);
        console.log('New password length:', newPassword.length);
        console.log('Confirm password length:', confirmPassword.length);
        
        console.log('=== VALIDATION CHECKS ===');
        if (!currentPassword || !newPassword || !confirmPassword) {
            console.log('VALIDATION FAILED: Empty fields');
            this.showNotification('Please fill in all fields', 'error');
            return;
        }
        console.log('✓ All fields filled');
        
        if (newPassword !== confirmPassword) {
            console.log('VALIDATION FAILED: Passwords do not match');
            this.showNotification('New passwords do not match', 'error');
            return;
        }
        console.log('✓ Passwords match');
        
        if (currentPassword === newPassword) {
            console.log('VALIDATION FAILED: Same password');
            this.showNotification('New password must be different from current password', 'error');
            return;
        }
        console.log('✓ Passwords are different');
        
        const { strength, checks } = this.checkPasswordStrength(newPassword);
        const passedChecks = Object.values(checks).filter(Boolean).length;
        console.log('Password strength checks passed:', passedChecks, 'out of 5');
        
        if (passedChecks < 4) {
            console.log('VALIDATION FAILED: Password strength insufficient');
            this.showNotification('Password does not meet security requirements', 'error');
            return;
        }
        console.log('✓ Password strength OK');
        
        console.log('=== ALL VALIDATIONS PASSED - PROCEEDING TO API CALL ===');
        
        try {
            const token = this.getToken();
            
            console.log('=== TOKEN CHECK ===');
            console.log('Token exists:', !!token);
            console.log('Token length:', token ? token.length : 0);
            console.log('Token preview:', token ? token.substring(0, 50) + '...' : 'null');
            
            if (!token) {
                console.log('ERROR: No token found - redirecting to login');
                this.showNotification('Authentication required. Please log in again.', 'error');
                window.location.href = '/login';
                return;
            }

            console.log('DEBUG: Sending password change request');
            console.log('DEBUG: Current password provided:', !!currentPassword);
            console.log('DEBUG: New password provided:', !!newPassword);
            console.log('DEBUG: Confirm password provided:', !!confirmPassword);
            console.log('DEBUG: About to make fetch request to /auth/change-password');

            console.log('DEBUG: Making fetch request NOW...');
            const response = await fetch('/auth/change-password', {
                method: 'POST',
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

            console.log('DEBUG: Fetch completed!');
            console.log('DEBUG: Response received:', response);
            console.log('DEBUG: Response status:', response.status);
            console.log('DEBUG: Response ok:', response.ok);
            console.log('DEBUG: Response headers:', [...response.headers.entries()]);

            if (response.ok) {
                this.showNotification('Password changed successfully! You will be signed out from all devices. Please log in with your new password.', 'success');
                
                // Show additional guidance
                setTimeout(() => {
                    if (confirm('Your password has been changed successfully!\n\nYou will now be signed out for security reasons.\n\nPlease log in again using your NEW password.\n\nClick OK to continue to the login page.')) {
                        // Clear token and redirect to login after a short delay
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        sessionStorage.removeItem('token');
                        sessionStorage.removeItem('user');
                        window.location.href = '/login';
                    }
                }, 1000);
            } else {
                const errorData = await response.json();
                if (response.status === 400) {
                    this.showNotification(errorData.detail || 'Password change failed. Please check your current password.', 'error');
                } else {
                    this.showNotification(errorData.detail || 'Failed to change password. Please try again.', 'error');
                }
                this.closeChangePasswordModal();
            }
        } catch (error) {
            console.error('Password change error:', error);
            console.log('DEBUG: Error details:', error.message);
            this.showNotification('Failed to change password: ' + error.message, 'error');
            this.closeChangePasswordModal();
        }
    }

    async deleteCurrentClient() {
        if (!this.editingClientId) return;
        
        if (!confirm('Are you sure you want to delete this SSH client?')) {
            return;
        }

        const response = await fetch(`/clients/${this.editingClientId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            this.closeCreateModal();
            this.fetchClients();
        }
    }

    duplicateCurrentClient() {
        if (!this.editingClientId) return;
        
        // Get current form values
        const label = document.getElementById('label').value;
        const host = document.getElementById('host').value;
        const port = document.getElementById('port').value;
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const privateKey = document.getElementById('private_key').value;
        
        // Close current modal
        this.closeCreateModal();
        
        // Open create modal with duplicated values
        this.openCreateModal();
        
        // Set form values to duplicated data with modified label
        document.getElementById('label').value = `${label} (Copy)`;
        document.getElementById('host').value = host;
        document.getElementById('port').value = port;
        document.getElementById('username').value = username;
        document.getElementById('password').value = password;
        document.getElementById('private_key').value = privateKey;
        
        // Focus on the label field so user can modify the name
        document.getElementById('label').focus();
        document.getElementById('label').select();
    }

    // Client Management
    async fetchClients() {
        const response = await fetch('/clients');
        const data = await response.json();
        this.clients = data.clients;
        this.renderClients();
    }

    getClientIcon(client) {
        // Return OS-specific icon if detected, otherwise use generic computer icon
        return this.osIcons[client.detected_os] || this.osIcons['unknown'];
    }

    getTabIcon(client) {
        // Return OS-specific icon for tab, otherwise use lightning bolt
        return this.osIcons[client.detected_os] || this.osIcons['default'];
    }

    async detectClientOS(clientId) {
        try {
            const response = await fetch(`/clients/${clientId}/detect-os`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.detected_os && data.detected_os !== 'unknown') {
                // Update the client in our local array
                const clientIndex = this.clients.findIndex(c => c.id === clientId);
                if (clientIndex !== -1) {
                    this.clients[clientIndex].detected_os = data.detected_os;
                }
                
                // Refresh the client list to show new icon
                this.renderClients();
                
                // Update any open tabs for this client
                this.updateTabIcon(clientId, data.detected_os);
            }
            
            return data.detected_os;
        } catch (error) {
            console.error('Failed to detect OS:', error);
            return 'unknown';
        }
    }

    updateTabIcon(clientId, detectedOs) {
        const tabId = `tab-${clientId}`;
        const tab = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tab) {
            const tabIcon = tab.querySelector('.tab-icon');
            if (tabIcon) {
                tabIcon.textContent = this.osIcons[detectedOs] || this.osIcons['default'];
            }
        }
    }

    renderClients() {
        this.clientList.innerHTML = '';
        this.clients.forEach((client, index) => {
            const card = document.createElement('div');
            card.className = 'host-card';
            
            const colorClass = this.iconColors[index % this.iconColors.length];
            const icon = this.getClientIcon(client);
            
            card.innerHTML = `
                <div class="host-icon ${colorClass}" title="OS: ${client.detected_os || 'Unknown'}">${icon}</div>
                <div class="host-info">
                    <h4>${client.label || client.host}</h4>
                    <p>ssh, ${client.username}</p>
                </div>
                <div class="host-actions">
                    <a class="host-actions edit" title="More options">
                        <span class="">...</span>
                    </a>
                </div>
            `;
            
            // Click on card to connect
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.host-actions')) {
                    this.openTerminal(client);
                }
            });
            
            // Edit button
            card.querySelector('.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditModal(client);
            });
            
            // Right-click context menu for OS detection
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showClientContextMenu(e, client);
            });
            
            this.clientList.appendChild(card);
        });
    }

    showClientContextMenu(event, client) {
        // Remove any existing context menu
        const existingMenu = document.querySelector('.client-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'client-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        menu.style.zIndex = '10000';
        
        menu.innerHTML = `
            <div class="context-menu-item" data-action="detect-os">
                🔍 Detect OS
            </div>
            <div class="context-menu-item" data-action="edit">
                ✏️ Edit Client
            </div>
        `;

        // Add menu to body
        document.body.appendChild(menu);

        // Add event listeners
        menu.addEventListener('click', async (e) => {
            const action = e.target.getAttribute('data-action');
            if (action === 'detect-os') {
                menu.remove();
                await this.detectClientOSWithFeedback(client);
            } else if (action === 'edit') {
                menu.remove();
                this.openEditModal(client);
            }
        });

        // Remove menu when clicking outside
        document.addEventListener('click', () => {
            if (menu && menu.parentNode) {
                menu.remove();
            }
        }, { once: true });
    }

    async detectClientOSWithFeedback(client) {
        try {
            // Show loading indicator
            const clientCard = document.querySelector(`.host-card:nth-child(${this.clients.indexOf(client) + 1}) .host-icon`);
            if (clientCard) {
                const originalIcon = clientCard.innerHTML;
                clientCard.innerHTML = '⏳';
                
                const detectedOs = await this.detectClientOS(client.id);
                
                // Show success message
                if (detectedOs && detectedOs !== 'unknown') {
                    this.showNotification(`OS detected: ${detectedOs}`, 'success');
                } else {
                    this.showNotification('Could not detect OS', 'warning');
                    clientCard.innerHTML = originalIcon;
                }
            }
        } catch (error) {
            console.error('OS detection failed:', error);
            this.showNotification('OS detection failed', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 10001;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;

        // Set background color based on type
        const colors = {
            success: '#28a745',
            warning: '#ffc107',
            error: '#dc3545',
            info: '#17a2b8'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);

        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }

    // Terminal Management
    createTab(client) {
        const tabId = `tab-${client.id}`;
        const colorClass = this.iconColors[Math.floor(Math.random() * this.iconColors.length)];
        
        // Create tab
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.tabId = tabId;
        const tabIcon = this.getTabIcon(client);
        tab.innerHTML = `
            <div class="tab-icon ${colorClass}" title="OS: ${client.detected_os || 'Unknown'}">${tabIcon}</div>
            <div class="tab-title">${client.host || client.label}</div>
            <button class="tab-theme" onclick="sshApp.showTerminalThemeSelector('${tabId}', event)" title="Change theme for this terminal">🎨</button>
            <button class="tab-close" onclick="sshApp.closeTab('${tabId}', event)">×</button>
        `;
        tab.onclick = (e) => {
            if (!e.target.classList.contains('tab-close')) {
                this.switchTab(tabId);
            }
        };
        
        // Insert tab after back button
        const backBtn = this.tabBar.querySelector('.back-btn');
        if (backBtn && backBtn.nextSibling) {
            this.tabBar.insertBefore(tab, backBtn.nextSibling);
        } else {
            this.tabBar.appendChild(tab);
        }

        // Create terminal wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'terminal-wrapper';
        wrapper.dataset.tabId = tabId;
        wrapper.innerHTML = `<div class="terminal-content" id="${tabId}"></div>`;
        this.terminalContainer.appendChild(wrapper);

        return tabId;
    }

    switchTab(tabId) {
        // Update tab active state
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab[data-tab-id="${tabId}"]`).classList.add('active');

        // Update terminal wrapper active state
        document.querySelectorAll('.terminal-wrapper').forEach(w => w.classList.remove('active'));
        document.querySelector(`.terminal-wrapper[data-tab-id="${tabId}"]`).classList.add('active');

        this.activeTabId = tabId;

        // Fit terminal
        if (this.terminals[tabId] && this.terminals[tabId].fitAddon) {
            setTimeout(() => this.terminals[tabId].fitAddon.fit(), 100);
        }
    }

    closeTab(tabId, event) {
        event.stopPropagation();
        
        // Close WebSocket
        if (this.terminals[tabId] && this.terminals[tabId].ws) {
            this.terminals[tabId].ws.close();
        }

        // Remove tab and terminal
        document.querySelector(`.tab[data-tab-id="${tabId}"]`).remove();
        document.querySelector(`.terminal-wrapper[data-tab-id="${tabId}"]`).remove();
        delete this.terminals[tabId];
        delete this.terminalThemes[tabId];

        // Switch to another tab or hide terminal view
        const remainingTabs = document.querySelectorAll('.tab');
        if (remainingTabs.length > 0) {
            const firstTab = remainingTabs[0];
            this.switchTab(firstTab.dataset.tabId);
        } else {
            this.terminalView.classList.remove('active');
            this.sidebar.classList.remove('hidden');
        }
    }

    backToList() {
        this.terminalView.classList.remove('active');
        this.sidebar.classList.remove('hidden');
        this.settingsIcon.classList.remove('visible');
    }

    async openTerminal(client) {
        if (!client || client.id === undefined) {
            alert("Please select a client first.");
            return;
        }

        // Show terminal view and hide sidebar on mobile
        this.terminalView.classList.add('active');
        if (window.innerWidth < 1024) {
            this.sidebar.classList.add('hidden');
        }

        // Create new tab
        const tabId = this.createTab(client);
        
        // Get theme for this terminal (fallback to global theme, then hacker-blue)
        const terminalThemeId = this.terminalThemes[tabId] || this.currentTheme || 'hacker-blue';
        const theme = this.themes[terminalThemeId] || this.themes['hacker-blue'];
        
        // Initialize terminal
        const term = new Terminal({
            theme: {
                background: theme.background,
                foreground: theme.foreground,
                cursor: theme.cursor,
                selection: theme.cursor + '40',
                black: theme.colors[0],
                red: theme.colors[1],
                green: theme.colors[2],
                yellow: theme.colors[3],
                blue: theme.colors[4],
                magenta: theme.colors[5],
                cyan: theme.colors[6],
                white: theme.colors[7]
            },
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            cursorBlink: true
        });
        
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(document.getElementById(tabId));
        
        setTimeout(() => fitAddon.fit(), 100);

        const ws = new WebSocket(`ws://localhost:8000/ws/${client.id}`);

        ws.onopen = () => {
            term.write('Connected to SSH server\r\n');
            
            // Detect OS if not already detected
            if (!client.detected_os || client.detected_os === 'unknown') {
                this.detectClientOS(client.id).then((detectedOs) => {
                    if (detectedOs && detectedOs !== 'unknown') {
                        term.write(`\r\nDetected OS: ${detectedOs}\r\n`);
                        client.detected_os = detectedOs; // Update local client object
                    }
                }).catch((error) => {
                    console.error('OS detection failed:', error);
                });
            }
        };

        ws.onmessage = (event) => {
            term.write(event.data);
        };

        ws.onerror = (error) => {
            term.write(`Error: ${error.message}\r\n`);
        };

        ws.onclose = (event) => {
            term.write(`\r\nConnection closed: ${event.reason}\r\n`);
        };

        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        // Store terminal with its theme
        this.terminals[tabId] = { term, fitAddon, ws, theme: terminalThemeId };
        this.terminalThemes[tabId] = terminalThemeId;
        this.switchTab(tabId);
        
        // Show settings icon
        this.settingsIcon.classList.add('visible');
    }

    showTerminalThemeSelector(tabId, event) {
        event.stopPropagation();
        
        // Remove any existing selector
        const existingSelector = document.querySelector('.terminal-theme-selector');
        if (existingSelector) {
            existingSelector.remove();
        }
        
        // Create theme selector dropdown
        const selector = document.createElement('div');
        selector.className = 'terminal-theme-selector';
        
        const currentTheme = this.terminalThemes[tabId] || 'hacker-blue';
        
        let themeOptions = '';
        Object.keys(this.themes).forEach(themeId => {
            const theme = this.themes[themeId];
            const isSelected = themeId === currentTheme ? 'selected' : '';
            themeOptions += `
                <div class="theme-option ${isSelected}" data-theme-id="${themeId}" onclick="sshApp.applyTerminalTheme('${tabId}', '${themeId}')">
                    <div class="theme-preview-mini" style="background: ${theme.background};">
                        <div class="theme-preview-dot" style="background: ${theme.foreground};"></div>
                    </div>
                    <span class="theme-name">${theme.name}</span>
                </div>
            `;
        });
        
        selector.innerHTML = `
            <div class="theme-selector-content">
                <div class="theme-selector-header">
                    <span>Terminal Theme</span>
                    <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
                </div>
                <div class="theme-options">
                    ${themeOptions}
                </div>
            </div>
        `;
        
        // Position the selector near the theme button
        const rect = event.target.getBoundingClientRect();
        selector.style.position = 'fixed';
        selector.style.top = `${rect.bottom + 5}px`;
        selector.style.left = `${rect.left - 150}px`;
        selector.style.zIndex = '10000';
        
        document.body.appendChild(selector);
        
        // Close selector when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeSelector(e) {
                if (!selector.contains(e.target)) {
                    selector.remove();
                    document.removeEventListener('click', closeSelector);
                }
            });
        }, 100);
    }

    applyTerminalTheme(tabId, themeId) {
        this.applyThemeToTerminal(tabId, themeId);
        
        // Close the theme selector
        const selector = document.querySelector('.terminal-theme-selector');
        if (selector) {
            selector.remove();
        }
        
        // Update the visual indicator if needed
        this.updateTerminalThemeIndicator(tabId, themeId);
    }

    updateTerminalThemeIndicator(tabId, themeId) {
        // Update the tab to show which theme is active
        const tab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tab) {
            const themeButton = tab.querySelector('.tab-theme');
            const theme = this.themes[themeId] || this.themes['hacker-blue'];
            // Optionally change the theme button color to match the theme
            themeButton.style.color = theme.cursor || '#6c727f';
        }
    }

    // Settings Functions
    async loadSettings() {
        try {
            // Load settings from server
            const response = await fetch('/auth/terminal-settings', {
                headers: {
                    'Authorization': `Bearer ${this.getToken()}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const serverSettings = data.settings;
                
                // Merge server settings with local defaults
                this.settingsData = {
                    ...this.settingsData,
                    terminal: {
                        ...this.settingsData.terminal,
                        ...serverSettings
                    }
                };
                
                // Apply saved theme if available
                if (serverSettings.theme) {
                    this.currentTheme = serverSettings.theme;
                }
                
                // Load per-terminal themes if available
                if (serverSettings.terminalThemes) {
                    this.terminalThemes = { ...serverSettings.terminalThemes };
                }
                
                this.updateSettingsUI();
            } else {
                console.log('No terminal settings found on server, using defaults');
                // Fallback to localStorage if server fails
                const saved = localStorage.getItem('sshClientSettings');
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        this.settingsData = { ...this.settingsData, ...parsed };
                        
                        if (this.settingsData.terminal && this.settingsData.terminal.theme) {
                            this.currentTheme = this.settingsData.terminal.theme;
                        }
                        
                        if (this.settingsData.terminal && this.settingsData.terminal.terminalThemes) {
                            this.terminalThemes = { ...this.settingsData.terminal.terminalThemes };
                        }
                        
                        this.updateSettingsUI();
                    } catch (error) {
                        console.error('Failed to load local settings:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load settings from server:', error);
            // Fallback to localStorage
            const saved = localStorage.getItem('sshClientSettings');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    this.settingsData = { ...this.settingsData, ...parsed };
                    
                    if (this.settingsData.terminal && this.settingsData.terminal.theme) {
                        this.currentTheme = this.settingsData.terminal.theme;
                    }
                    
                    if (this.settingsData.terminal && this.settingsData.terminal.terminalThemes) {
                        this.terminalThemes = { ...this.settingsData.terminal.terminalThemes };
                    }
                    
                    this.updateSettingsUI();
                } catch (error) {
                    console.error('Failed to load local settings:', error);
                }
            }
        }
    }

    async saveTerminalSettings() {
        try {
            const terminalSettings = {
                theme: this.settingsData.terminal.theme,
                autoReconnect: this.settingsData.terminal.autoReconnect,
                bellSound: this.settingsData.terminal.bellSound,
                terminalThemes: this.terminalThemes
            };
            
            const response = await fetch('/auth/terminal-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getToken()}`
                },
                body: JSON.stringify(terminalSettings)
            });
            
            if (response.ok) {
                console.log('Terminal settings saved to server');
                // Also save to localStorage as backup
                localStorage.setItem('sshClientSettings', JSON.stringify(this.settingsData));
            } else {
                console.error('Failed to save terminal settings to server');
                // Fallback to localStorage only
                localStorage.setItem('sshClientSettings', JSON.stringify(this.settingsData));
            }
        } catch (error) {
            console.error('Error saving terminal settings:', error);
            // Fallback to localStorage
            localStorage.setItem('sshClientSettings', JSON.stringify(this.settingsData));
        }
    }

    async saveSettings() {
        // Save terminal settings to server
        await this.saveTerminalSettings();
        alert('Settings saved successfully!');
        this.closeSettingsModal();
    }

    updateSettingsUI() {
        const toggles = [
            { id: 'mfa-toggle', value: this.settingsData.mfa.enabled },
            { id: 'auto-logout-toggle', value: this.settingsData.session.autoLogout },
            { id: 'remember-device-toggle', value: this.settingsData.session.rememberDevice },
            { id: 'auto-reconnect-toggle', value: this.settingsData.terminal.autoReconnect },
            { id: 'bell-sound-toggle', value: this.settingsData.terminal.bellSound },
            { id: 'dark-mode-toggle', value: this.settingsData.general.darkMode },
            { id: 'notifications-toggle', value: this.settingsData.general.notifications },
            { id: 'auto-save-toggle', value: this.settingsData.general.autoSave }
        ];

        toggles.forEach(({ id, value }) => {
            const toggle = document.getElementById(id);
            if (toggle) {
                if (value) {
                    toggle.classList.add('active');
                } else {
                    toggle.classList.remove('active');
                }
            }
        });

        if (this.settingsData.mfa.enabled) {
            document.getElementById('mfa-methods-section').style.display = 'block';
            this.updateMFAMethodsUI();
        }
    }

    // MFA Modal Functions
    showMFADisableConfirmationModal() {
        const modal = document.getElementById('mfa-disable-confirmation-modal');
        modal.classList.add('active');
    }

    closeMFADisableConfirmationModal() {
        const modal = document.getElementById('mfa-disable-confirmation-modal');
        modal.classList.remove('active');
    }

    showMFADisableForm() {
        // Close confirmation modal and show form modal
        this.closeMFADisableConfirmationModal();
        const modal = document.getElementById('mfa-disable-form-modal');
        modal.classList.add('active');
        
        // Reset form
        const form = document.getElementById('mfa-disable-form');
        form.reset();
    }

    closeMFADisableFormModal() {
        const modal = document.getElementById('mfa-disable-form-modal');
        modal.classList.remove('active');
        
        // Reset form
        const form = document.getElementById('mfa-disable-form');
        form.reset();
    }

    async handleMFADisable(e) {
        e.preventDefault();
        
        const password = document.getElementById('mfa-disable-password').value;
        const mfaCode = document.getElementById('mfa-disable-code').value;
        
        if (!password || !mfaCode) {
            this.showNotification('Please fill in all fields', 'error');
            return;
        }
        
        if (mfaCode.length !== 6 || !/^\d{6}$/.test(mfaCode)) {
            this.showNotification('Please enter a valid 6-digit MFA code', 'error');
            return;
        }
        
        await this.disableMFA(password, mfaCode);
    }

    // MFA Functions
    async toggleMFA() {
        const currentStatus = this.settingsData.mfa.enabled || (this.currentUser && this.currentUser.mfa_enabled);
        
        if (currentStatus) {
            // Show confirmation modal before disabling MFA
            this.showMFADisableConfirmationModal();
        } else {
            // Enable MFA
            await this.setupMFA();
        }
    }

    setupAuthenticator() {
        if (!this.settingsData.mfa.enabled) {
            this.setupMFA();
        } else {
            this.showNotification('MFA is already enabled', 'info');
        }
    }

    setupSMS() {
        this.showNotification('SMS MFA is not yet implemented. Please use the Authenticator app.', 'info');
    }

    setupEmail() {
        alert('Email verification method has been enabled.');
        this.settingsData.mfa.methods.email = true;
        this.updateMFAMethodsUI();
    }

    generateBackupCodes() {
        const codes = [];
        for (let i = 0; i < 10; i++) {
            codes.push(Math.random().toString(36).substr(2, 8).toUpperCase());
        }
        this.settingsData.mfa.backupCodes = codes;
        this.settingsData.mfa.methods.backupCodes = true;
        this.displayBackupCodes();
        this.updateMFAMethodsUI();
    }

    viewBackupCodes() {
        this.displayBackupCodes();
    }

    displayBackupCodes() {
        const display = document.getElementById('backup-codes-display');
        const grid = document.getElementById('backup-codes-grid');
        
        grid.innerHTML = '';
        this.settingsData.mfa.backupCodes.forEach((code, index) => {
            const codeDiv = document.createElement('div');
            codeDiv.className = 'backup-code';
            codeDiv.textContent = code;
            grid.appendChild(codeDiv);
        });
        
        display.style.display = 'block';
    }

    downloadBackupCodes() {
        console.log('Settings downloadBackupCodes called');
        console.log('settingsData:', this.settingsData);
        
        // Check multiple sources for backup codes
        let backupCodes = null;
        
        if (this.settingsData && this.settingsData.mfa && this.settingsData.mfa.backupCodes && this.settingsData.mfa.backupCodes.length > 0) {
            backupCodes = this.settingsData.mfa.backupCodes;
            console.log('Using backup codes from settingsData.mfa.backupCodes:', backupCodes);
        } else if (this.mfaSetupData && this.mfaSetupData.backup_codes && this.mfaSetupData.backup_codes.length > 0) {
            backupCodes = this.mfaSetupData.backup_codes;
            console.log('Using backup codes from mfaSetupData.backup_codes:', backupCodes);
        } else {
            // Try to get codes from the displayed grid
            const codeElements = document.querySelectorAll('#backup-codes-grid .backup-code');
            if (codeElements.length > 0) {
                backupCodes = Array.from(codeElements).map(el => el.textContent.trim());
                console.log('Using backup codes from DOM elements:', backupCodes);
            }
        }
        
        console.log('Final backupCodes:', backupCodes);
        
        if (!backupCodes || backupCodes.length === 0) {
            console.error('No backup codes found in any source');
            this.showNotification('No backup codes available. Click "Regenerate" first to create new backup codes.', 'warning');
            return;
        }
        
        // Create formatted content
        const timestamp = new Date().toISOString().split('T')[0];
        const content = `SSH Client - Backup Codes
Generated: ${timestamp}

These are your backup authentication codes. Store them securely.
Each code can only be used once.

${backupCodes.map((code, index) => `${index + 1}. ${code}`).join('\n')}

Generated on ${new Date().toLocaleString()}`;
        
        console.log('Creating file with content length:', content.length);
        console.log('Content preview:', content.substring(0, 200) + '...');
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ssh-client-backup-codes-${timestamp}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showNotification('Backup codes downloaded successfully!', 'success');
    }

    printBackupCodes() {
        const codes = this.settingsData.mfa.backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n');
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head><title>Backup Codes</title></head>
            <body style="font-family: monospace; padding: 20px;">
                <h2>SSH Client - Backup Codes</h2>
                <p>Keep these codes in a safe place. Each can only be used once.</p>
                <pre>${codes}</pre>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }

    regenerateBackupCodes() {
        if (confirm('This will invalidate your existing backup codes. Continue?')) {
            this.generateBackupCodes();
        }
    }

    updateMFAMethodsUI() {
        const methods = ['authenticator', 'sms', 'email', 'backup-codes'];
        methods.forEach(method => {
            const element = document.getElementById(method + '-method');
            const isEnabled = this.settingsData.mfa.methods[method.replace('-', '')] || 
                              (method === 'backup-codes' && this.settingsData.mfa.methods.backupCodes);
            
            if (isEnabled) {
                element.classList.add('enabled');
                const button = element.querySelector('.btn-primary');
                if (button) {
                    button.textContent = 'Configured';
                    button.classList.remove('btn-primary');
                }
            }
        });

        if (this.settingsData.mfa.methods.backupCodes) {
            document.getElementById('view-backup-codes').style.display = 'inline-block';
        }
    }

    // Toggle Functions
    toggleAutoLogout() {
        const toggle = document.getElementById('auto-logout-toggle');
        this.settingsData.session.autoLogout = !this.settingsData.session.autoLogout;
        toggle.classList.toggle('active');
    }

    toggleRememberDevice() {
        const toggle = document.getElementById('remember-device-toggle');
        this.settingsData.session.rememberDevice = !this.settingsData.session.rememberDevice;
        toggle.classList.toggle('active');
    }

    toggleAutoReconnect() {
        const toggle = document.getElementById('auto-reconnect-toggle');
        this.settingsData.terminal.autoReconnect = !this.settingsData.terminal.autoReconnect;
        toggle.classList.toggle('active');
        this.saveTerminalSettings();
    }

    toggleBellSound() {
        const toggle = document.getElementById('bell-sound-toggle');
        this.settingsData.terminal.bellSound = !this.settingsData.terminal.bellSound;
        toggle.classList.toggle('active');
        this.saveTerminalSettings();
    }

    toggleDarkMode() {
        const toggle = document.getElementById('dark-mode-toggle');
        this.settingsData.general.darkMode = !this.settingsData.general.darkMode;
        toggle.classList.toggle('active');
    }

    toggleNotifications() {
        const toggle = document.getElementById('notifications-toggle');
        this.settingsData.general.notifications = !this.settingsData.general.notifications;
        toggle.classList.toggle('active');
    }

    toggleAutoSave() {
        const toggle = document.getElementById('auto-save-toggle');
        this.settingsData.general.autoSave = !this.settingsData.general.autoSave;
        toggle.classList.toggle('active');
    }

    // Change modals
    openChangeEmailModal() {
        document.getElementById('change-email-modal').classList.add('active');
        // Get current user email from localStorage or user data
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        document.getElementById('currentEmailDisplay').textContent = user.email || 'user@example.com';
    }

    closeChangeEmailModal() {
        document.getElementById('change-email-modal').classList.remove('active');
        document.getElementById('change-email-form').reset();
    }

    openChangePasswordModal() {
        document.getElementById('change-password-modal').classList.add('active');
    }

    closeChangePasswordModal() {
        document.getElementById('change-password-modal').classList.remove('active');
        document.getElementById('change-password-form').reset();
        document.getElementById('password-strength-fill').className = 'strength-fill';
        document.getElementById('password-strength-text').textContent = 'Password strength: Weak';
        this.resetPasswordRequirements();
    }

    // Password strength functions
    checkPasswordStrength(password) {
        const checks = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /\d/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };
        
        const passed = Object.values(checks).filter(Boolean).length;
        let strength = 'weak';
        
        if (passed >= 5) strength = 'strong';
        else if (passed >= 4) strength = 'good';
        else if (passed >= 3) strength = 'fair';
        
        return { strength, checks };
    }

    updatePasswordStrength() {
        const password = document.getElementById('new-password-change').value;
        const strengthFill = document.getElementById('password-strength-fill');
        const strengthText = document.getElementById('password-strength-text');
        
        if (!password) {
            strengthFill.className = 'strength-fill';
            strengthText.textContent = 'Password strength: Weak';
            this.resetPasswordRequirements();
            return;
        }
        
        const { strength, checks } = this.checkPasswordStrength(password);
        
        strengthFill.className = `strength-fill ${strength}`;
        strengthText.textContent = `Password strength: ${strength.charAt(0).toUpperCase() + strength.slice(1)}`;
        
        // Update requirements
        document.getElementById('length-req').className = checks.length ? 'requirement met' : 'requirement';
        document.getElementById('uppercase-req').className = checks.uppercase ? 'requirement met' : 'requirement';
        document.getElementById('lowercase-req').className = checks.lowercase ? 'requirement met' : 'requirement';
        document.getElementById('number-req').className = checks.number ? 'requirement met' : 'requirement';
        document.getElementById('special-req').className = checks.special ? 'requirement met' : 'requirement';
    }

    resetPasswordRequirements() {
        const requirements = ['length-req', 'uppercase-req', 'lowercase-req', 'number-req', 'special-req'];
        requirements.forEach(id => {
            document.getElementById(id).className = 'requirement';
        });
    }

    // Utility functions
    clearSessionData() {
        if (confirm('This will clear all session data and settings. Continue?')) {
            localStorage.clear();
            sessionStorage.clear();
            alert('Session data cleared. Please refresh the page.');
        }
    }

    exportSettings() {
        const data = {
            settings: this.settingsData,
            theme: this.currentTheme,
            clients: this.clients.map(c => ({ ...c, password: '', private_key: '' }))
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ssh-client-settings.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        if (data.settings) {
                            this.settingsData = { ...this.settingsData, ...data.settings };
                            if (data.theme) {
                                this.applyTheme(data.theme);
                            }
                            alert('Settings imported successfully!');
                            this.closeSettingsModal();
                        }
                    } catch (error) {
                        alert('Invalid settings file.');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }
}

// Global function exports for HTML onclick handlers
let sshApp;

// Functions that need to be available globally
window.openCreateModal = () => sshApp.openCreateModal();
window.closeCreateModal = () => sshApp.closeCreateModal();
window.openSettingsModal = () => sshApp.openSettingsModal();
window.closeSettingsModal = () => sshApp.closeSettingsModal();
window.switchSettingsTab = (tabName) => sshApp.switchSettingsTab(tabName);
window.toggleThemePanel = () => sshApp.toggleThemePanel();
window.backToList = () => sshApp.backToList();
window.deleteCurrentClient = () => sshApp.deleteCurrentClient();
window.duplicateCurrentClient = () => sshApp.duplicateCurrentClient();

// Settings functions
window.toggleMFA = () => sshApp.toggleMFA();
window.setupAuthenticator = () => sshApp.setupAuthenticator();
window.setupSMS = () => sshApp.setupSMS();
window.setupEmail = () => sshApp.setupEmail();
window.generateBackupCodes = () => sshApp.generateBackupCodes();
window.viewBackupCodes = () => sshApp.viewBackupCodes();
window.downloadBackupCodes = () => sshApp.downloadBackupCodes();
window.printBackupCodes = () => sshApp.printBackupCodes();
window.regenerateBackupCodes = () => sshApp.regenerateBackupCodes();

window.toggleAutoLogout = () => sshApp.toggleAutoLogout();
window.toggleRememberDevice = () => sshApp.toggleRememberDevice();
window.toggleAutoReconnect = () => sshApp.toggleAutoReconnect();
window.toggleBellSound = () => sshApp.toggleBellSound();
window.toggleDarkMode = () => sshApp.toggleDarkMode();
window.toggleNotifications = () => sshApp.toggleNotifications();
window.toggleAutoSave = () => sshApp.toggleAutoSave();

window.openChangeEmailModal = () => sshApp.openChangeEmailModal();
window.closeChangeEmailModal = () => sshApp.closeChangeEmailModal();
window.openChangePasswordModal = () => sshApp.openChangePasswordModal();
window.closeChangePasswordModal = () => sshApp.closeChangePasswordModal();
window.logout = () => sshApp.logout();

window.clearSessionData = () => sshApp.clearSessionData();
window.exportSettings = () => sshApp.exportSettings();
window.importSettings = () => sshApp.importSettings();
window.saveSettings = () => sshApp.saveSettings();

// MFA Modal Functions
window.closeMFADisableConfirmationModal = () => sshApp.closeMFADisableConfirmationModal();
window.showMFADisableForm = () => sshApp.showMFADisableForm();
window.closeMFADisableFormModal = () => sshApp.closeMFADisableFormModal();

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    sshApp = new SSHClientApp();
});