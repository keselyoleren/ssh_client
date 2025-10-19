import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user_model import User, TrustedDevice
from app.schemas.user_schema import UserCreate, UserUpdate
from app.core.auth import AuthManager, MFAManager

class UserCRUD:
    """User CRUD operations"""
    
    @staticmethod
    def get_user_by_email(db: Session, email: str) -> Optional[User]:
        """Get user by email"""
        return db.query(User).filter(User.email == email).first()
    
    @staticmethod
    def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
        """Get user by ID"""
        return db.query(User).filter(User.id == user_id).first()
    
    @staticmethod
    def get_users(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
        """Get list of users"""
        return db.query(User).offset(skip).limit(limit).all()
    
    @staticmethod
    def create_user(db: Session, user_data: UserCreate) -> User:
        """Create new user"""
        # Check if user already exists
        existing_user = UserCRUD.get_user_by_email(db, user_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Hash password
        hashed_password = AuthManager.hash_password(user_data.password)
        
        # Create user
        db_user = User(
            email=user_data.email,
            hashed_password=hashed_password,
            created_at=datetime.utcnow()
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    
    @staticmethod
    def update_user(db: Session, user: User, user_data: UserUpdate) -> User:
        """Update user information"""
        update_data = user_data.dict(exclude_unset=True)
        
        # Handle email update
        if user_data.email and user_data.email != user.email:
            existing_user = UserCRUD.get_user_by_email(db, user_data.email)
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use"
                )
            user.email = user_data.email
            user.is_verified = False  # Require re-verification
        
        # Handle password update
        if user_data.new_password:
            if not user_data.current_password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password required"
                )
            
            if not AuthManager.verify_password(user_data.current_password, user.hashed_password):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is incorrect"
                )
            
            user.hashed_password = AuthManager.hash_password(user_data.new_password)
        
        # Handle phone number
        if 'phone_number' in update_data:
            user.phone_number = user_data.phone_number
        
        user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return user
    
    @staticmethod
    def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
        """Authenticate user with email and password"""
        user = UserCRUD.get_user_by_email(db, email)
        if not user:
            return None
        
        if AuthManager.is_account_locked(user):
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account is locked due to multiple failed login attempts"
            )
        
        if not AuthManager.verify_password(password, user.hashed_password):
            AuthManager.increment_failed_attempts(db, user)
            return None
        
        # Reset failed attempts on successful password verification
        AuthManager.reset_failed_attempts(db, user)
        return user
    
    @staticmethod
    def verify_mfa_and_login(db: Session, user: User, mfa_code: Optional[str] = None) -> bool:
        """Verify MFA code if enabled"""
        if not user.mfa_enabled:
            return True
        
        if not mfa_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA code required"
            )
        
        if not MFAManager.verify_login_code(user, mfa_code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid MFA code"
            )
        
        db.commit()  # Save any changes (like used backup codes)
        return True
    
    @staticmethod
    def setup_mfa(db: Session, user: User) -> dict:
        """Setup MFA for user"""
        if user.mfa_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is already enabled"
            )
        
        mfa_data = MFAManager.setup_mfa(user.email)
        
        # Store secret temporarily (will be saved when verified)
        user.mfa_secret = mfa_data["secret"]
        backup_codes_json = json.dumps(mfa_data["backup_codes"])
        user.backup_codes = backup_codes_json
        
        db.commit()
        return mfa_data
    
    @staticmethod
    def verify_mfa_setup(db: Session, user: User, code: str) -> bool:
        """Verify and enable MFA"""
        if user.mfa_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is already enabled"
            )
        
        if not user.mfa_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA setup not initiated"
            )
        
        if not MFAManager.verify_setup(user.mfa_secret, code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid MFA code"
            )
        
        user.mfa_enabled = True
        db.commit()
        return True
    
    @staticmethod
    def disable_mfa(db: Session, user: User, password: str, mfa_code: str) -> bool:
        """Disable MFA"""
        if not user.mfa_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is not enabled"
            )
        
        # Verify password
        if not AuthManager.verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid password"
            )
        
        # Verify MFA code
        if not MFAManager.verify_login_code(user, mfa_code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid MFA code"
            )
        
        # Disable MFA
        user.mfa_enabled = False
        user.mfa_secret = None
        user.backup_codes = None
        db.commit()
        return True
    
    @staticmethod
    def initiate_password_reset(db: Session, email: str) -> bool:
        """Initiate password reset process"""
        user = UserCRUD.get_user_by_email(db, email)
        if not user:
            # Don't reveal if email exists or not
            return True
        
        # Generate reset token
        reset_token = AuthManager.generate_reset_token()
        user.password_reset_token = reset_token
        user.password_reset_expires = datetime.utcnow() + timedelta(hours=1)
        
        db.commit()
        
        # Send email
        AuthManager.send_password_reset_email(email, reset_token)
        return True
    
    @staticmethod
    def reset_password(db: Session, token: str, new_password: str) -> bool:
        """Reset password using token"""
        user = db.query(User).filter(User.password_reset_token == token).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reset token"
            )
        
        if not user.password_reset_expires or datetime.utcnow() > user.password_reset_expires:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset token has expired"
            )
        
        # Update password
        user.hashed_password = AuthManager.hash_password(new_password)
        user.password_reset_token = None
        user.password_reset_expires = None
        user.failed_login_attempts = 0
        user.account_locked_until = None
        
        db.commit()
        return True
    
    @staticmethod
    def delete_user(db: Session, user: User) -> bool:
        """Delete user account"""
        db.delete(user)
        db.commit()
        return True
    
    @staticmethod
    def change_email(db: Session, user: User, current_password: str, new_email: str) -> bool:
        """Change user email address"""
        # Verify current password
        if not AuthManager.verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        # Check if new email already exists
        existing_user = UserCRUD.get_user_by_email(db, new_email)
        if existing_user and existing_user.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address is already in use"
            )
        
        # Update email
        user.email = new_email
        user.is_verified = False  # Require re-verification
        user.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(user)
        return True
    
    @staticmethod
    def change_password(db: Session, user: User, current_password: str, new_password: str) -> bool:
        """Change user password"""
        # Verify current password
        if not AuthManager.verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        # Hash new password
        hashed_password = AuthManager.hash_password(new_password)
        
        # Update password
        user.hashed_password = hashed_password
        user.updated_at = datetime.utcnow()
        
        # Clear any failed login attempts
        user.failed_login_attempts = 0
        user.account_locked_until = None
        
        db.flush()  # Ensure changes are written to database
        db.commit()
        db.refresh(user)
        return True

    @staticmethod
    def get_terminal_settings(db: Session, user: User) -> dict:
        """Get user's terminal settings"""
        if user.terminal_settings:
            try:
                import json
                return json.loads(user.terminal_settings)
            except (json.JSONDecodeError, TypeError):
                pass
        
        # Return default settings if none exist or invalid JSON
        return {
            "theme": "hacker-blue",
            "autoReconnect": True,
            "bellSound": False
        }
    
    @staticmethod
    def save_terminal_settings(db: Session, user: User, settings: dict) -> bool:
        """Save user's terminal settings"""
        try:
            import json
            user.terminal_settings = json.dumps(settings)
            user.updated_at = datetime.utcnow()
            
            db.flush()
            db.commit()
            db.refresh(user)
            return True
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save terminal settings: {str(e)}"
            )
            return False

    @staticmethod
    def generate_device_fingerprint(user_agent: str, ip_address: str) -> str:
        """Generate a unique device fingerprint"""
        # Combine user agent and IP address to create a device fingerprint
        # In production, you might want to use more sophisticated fingerprinting
        fingerprint_data = f"{user_agent}:{ip_address}"
        return hashlib.sha256(fingerprint_data.encode()).hexdigest()
    
    @staticmethod
    def add_trusted_device(db: Session, user: User, device_fingerprint: str, device_name: str = None) -> TrustedDevice:
        """Add a device to the trusted devices list"""
        try:
            # Check if device already exists and is active
            existing_device = db.query(TrustedDevice).filter(
                TrustedDevice.user_id == user.id,
                TrustedDevice.device_fingerprint == device_fingerprint,
                TrustedDevice.is_active == True
            ).first()
            
            if existing_device:
                # Update existing device with new expiry date
                existing_device.expires_at = datetime.utcnow() + timedelta(days=30)
                existing_device.last_used = datetime.utcnow()
                if device_name:
                    existing_device.device_name = device_name
                
                db.commit()
                db.refresh(existing_device)
                return existing_device
            
            # Create new trusted device
            expires_at = datetime.utcnow() + timedelta(days=30)
            trusted_device = TrustedDevice(
                user_id=user.id,
                device_fingerprint=device_fingerprint,
                device_name=device_name or "Unknown Device",
                expires_at=expires_at,
                last_used=datetime.utcnow()
            )
            
            db.add(trusted_device)
            db.commit()
            db.refresh(trusted_device)
            return trusted_device
            
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to add trusted device: {str(e)}"
            )
    
    @staticmethod
    def is_device_trusted(db: Session, user: User, device_fingerprint: str) -> bool:
        """Check if a device is trusted and not expired"""
        try:
            trusted_device = db.query(TrustedDevice).filter(
                TrustedDevice.user_id == user.id,
                TrustedDevice.device_fingerprint == device_fingerprint,
                TrustedDevice.is_active == True,
                TrustedDevice.expires_at > datetime.utcnow()
            ).first()
            
            if trusted_device:
                # Update last used timestamp
                trusted_device.last_used = datetime.utcnow()
                db.commit()
                return True
            
            return False
            
        except Exception:
            return False
    
    @staticmethod
    def get_trusted_devices(db: Session, user: User) -> List[TrustedDevice]:
        """Get all trusted devices for a user"""
        return db.query(TrustedDevice).filter(
            TrustedDevice.user_id == user.id,
            TrustedDevice.is_active == True
        ).order_by(TrustedDevice.last_used.desc()).all()
    
    @staticmethod
    def remove_trusted_device(db: Session, user: User, device_id: int) -> bool:
        """Remove a trusted device"""
        try:
            trusted_device = db.query(TrustedDevice).filter(
                TrustedDevice.id == device_id,
                TrustedDevice.user_id == user.id
            ).first()
            
            if trusted_device:
                trusted_device.is_active = False
                db.commit()
                return True
            
            return False
            
        except Exception:
            db.rollback()
            return False
    
    @staticmethod
    def cleanup_expired_devices(db: Session):
        """Clean up expired trusted devices"""
        try:
            expired_devices = db.query(TrustedDevice).filter(
                TrustedDevice.expires_at < datetime.utcnow()
            ).all()
            
            for device in expired_devices:
                device.is_active = False
            
            db.commit()
            
        except Exception:
            db.rollback()