import os
import secrets
import qrcode
import pyotp
import bcrypt
import smtplib
from io import BytesIO
from base64 import b64encode
from datetime import datetime, timedelta
from typing import Optional, List
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.user_model import User
from app.core.config import settings

class AuthManager:
    """Authentication and MFA management class"""
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt"""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    
    @staticmethod
    def generate_mfa_secret() -> str:
        """Generate a new MFA secret"""
        return pyotp.random_base32()
    
    @staticmethod
    def generate_qr_code(email: str, secret: str, app_name: str = "SSH Client") -> str:
        """Generate QR code for MFA setup"""
        totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=email,
            issuer_name=app_name
        )
        
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        # Convert to base64 for easy embedding in HTML
        img_str = b64encode(buffer.getvalue()).decode()
        return f"data:image/png;base64,{img_str}"
    
    @staticmethod
    def verify_mfa_code(secret: str, code: str) -> bool:
        """Verify MFA TOTP code"""
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=1)
    
    @staticmethod
    def generate_backup_codes(count: int = 8) -> List[str]:
        """Generate backup codes for MFA"""
        return [secrets.token_hex(4).upper() for _ in range(count)]
    
    @staticmethod
    def verify_backup_code(backup_codes: List[str], code: str) -> bool:
        """Verify and consume a backup code"""
        code = code.upper().replace('-', '').replace(' ', '')
        return code in backup_codes
    
    @staticmethod
    def generate_reset_token() -> str:
        """Generate a password reset token"""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def is_account_locked(user: User) -> bool:
        """Check if account is locked due to failed attempts"""
        if user.account_locked_until:
            return datetime.utcnow() < user.account_locked_until
        return False
    
    @staticmethod
    def lock_account(db: Session, user: User, duration_minutes: int = 30):
        """Lock user account for specified duration"""
        user.account_locked_until = datetime.utcnow() + timedelta(minutes=duration_minutes)
        db.commit()
    
    @staticmethod
    def unlock_account(db: Session, user: User):
        """Unlock user account"""
        user.account_locked_until = None
        user.failed_login_attempts = 0
        db.commit()
    
    @staticmethod
    def increment_failed_attempts(db: Session, user: User):
        """Increment failed login attempts"""
        if user.failed_login_attempts is None:
            user.failed_login_attempts = 0
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:  # Lock after 5 failed attempts
            AuthManager.lock_account(db, user)
        db.commit()
    
    @staticmethod
    def reset_failed_attempts(db: Session, user: User):
        """Reset failed login attempts on successful login"""
        user.failed_login_attempts = 0
        user.last_login = datetime.utcnow()
        db.commit()
    
    @staticmethod
    def send_password_reset_email(email: str, token: str):
        """Send password reset email"""
        # This is a basic implementation - in production, use proper email service
        try:
            msg = MIMEMultipart()
            msg['From'] = settings.SMTP_USER if hasattr(settings, 'SMTP_USER') else "noreply@sshclient.com"
            msg['To'] = email
            msg['Subject'] = "Password Reset - SSH Client"
            
            reset_link = f"http://localhost:8000/reset-password?token={token}"
            body = f"""
            Hello,
            
            You requested a password reset for your SSH Client account.
            Click the link below to reset your password:
            
            {reset_link}
            
            This link will expire in 1 hour.
            
            If you didn't request this reset, please ignore this email.
            
            Best regards,
            SSH Client Team
            """
            
            msg.attach(MIMEText(body, 'plain'))
            
            # In production, configure proper SMTP settings
            if hasattr(settings, 'SMTP_SERVER') and settings.SMTP_SERVER:
                server = smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT)
                if hasattr(settings, 'SMTP_TLS') and settings.SMTP_TLS:
                    server.starttls()
                if hasattr(settings, 'SMTP_USER') and settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
                server.quit()
            else:
                # For development - just log the reset link
                print(f"Password reset link for {email}: {reset_link}")
                
        except Exception as e:
            print(f"Failed to send email: {e}")
            # In production, you might want to log this error properly
            pass

class MFAManager:
    """Multi-Factor Authentication management"""
    
    @staticmethod
    def setup_mfa(email: str) -> dict:
        """Setup MFA for user"""
        secret = AuthManager.generate_mfa_secret()
        qr_code_url = AuthManager.generate_qr_code(email, secret)
        backup_codes = AuthManager.generate_backup_codes()
        
        return {
            "secret": secret,
            "qr_code_url": qr_code_url,
            "backup_codes": backup_codes
        }
    
    @staticmethod
    def verify_setup(secret: str, code: str) -> bool:
        """Verify MFA setup with provided code"""
        return AuthManager.verify_mfa_code(secret, code)
    
    @staticmethod
    def verify_login_code(user: User, code: str) -> bool:
        """Verify MFA code during login"""
        if not user.mfa_enabled or not user.mfa_secret:
            return True
            
        # Try TOTP first
        if AuthManager.verify_mfa_code(user.mfa_secret, code):
            return True
            
        # Try backup codes
        if user.backup_codes:
            import json
            backup_codes = json.loads(user.backup_codes)
            if AuthManager.verify_backup_code(backup_codes, code):
                # Remove used backup code
                backup_codes.remove(code.upper().replace('-', '').replace(' ', ''))
                user.backup_codes = json.dumps(backup_codes)
                return True
                
        return False