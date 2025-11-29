import logging
from datetime import timedelta
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.dependencies import get_db
from app.schemas.user_schema import (
    UserCreate, UserLogin, UserResponse, UserUpdate,
    MFASetup, MFAVerification, MFADisable,
    PasswordReset, PasswordResetConfirm,
    ChangeEmail, ChangePassword, TerminalSettings,
    TrustedDeviceResponse, TokenRefresh
)
from app.crud.auth import UserCRUD
from app.core.jwt_auth import create_access_token, create_refresh_token, get_current_user, get_current_active_user, verify_token
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["authentication"])
templates = Jinja2Templates(directory="templates")

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    user = UserCRUD.create_user(db, user_data)
    return user

@router.post("/login")
async def login(user_data: UserLogin, request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Authenticate user and return JWT token"""
    # Authenticate with email/password
    user = UserCRUD.authenticate_user(db, user_data.email, user_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Generate device fingerprint
    user_agent = request.headers.get("user-agent", "Unknown")
    # In production, you might want to get the real client IP
    client_ip = request.client.host if request.client else "unknown"
    device_fingerprint = UserCRUD.generate_device_fingerprint(user_agent, client_ip)
    
    # Check if MFA is required and if device is trusted
    mfa_required = user.mfa_enabled
    device_trusted = False
    
    if mfa_required:
        device_trusted = UserCRUD.is_device_trusted(db, user, device_fingerprint)
        if device_trusted:
            mfa_required = False  # Skip MFA for trusted device
    
    # Check if MFA is required
    if mfa_required and not user_data.mfa_code:
        return {
            "mfa_required": True,
            "message": "MFA code required"
        }
    
    # Verify MFA if provided
    if mfa_required and user_data.mfa_code:
        UserCRUD.verify_mfa_and_login(db, user, user_data.mfa_code)
    
    # Add device to trusted list if user requested it
    if user_data.remember_device and user.mfa_enabled:
        UserCRUD.add_trusted_device(db, user, device_fingerprint, user_agent[:50])
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    # Create refresh token
    refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_token = create_refresh_token(
        data={"sub": user.email}, expires_delta=refresh_token_expires
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": UserResponse.from_orm(user),
        "device_trusted": device_trusted
    }

@router.post("/refresh")
async def refresh_token(token_data: TokenRefresh, db: Session = Depends(get_db)):
    """Refresh access token using refresh token"""
    email = verify_token(token_data.refresh_token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user = UserCRUD.get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
        
    # Create new access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user = Depends(get_current_active_user)):
    """Get current user information"""
    return current_user

@router.put("/me", response_model=UserResponse)
async def update_user_info(
    user_data: UserUpdate,
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update current user information"""
    updated_user = UserCRUD.update_user(db, current_user, user_data)
    return updated_user

@router.post("/mfa/setup", response_model=MFASetup)
async def setup_mfa(
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Setup MFA for current user"""
    mfa_data = UserCRUD.setup_mfa(db, current_user)
    return mfa_data

@router.post("/mfa/verify-setup")
async def verify_mfa_setup(
    verification: MFAVerification,
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Verify and enable MFA"""
    success = UserCRUD.verify_mfa_setup(db, current_user, verification.code)
    return {"success": success, "message": "MFA enabled successfully"}

@router.post("/mfa/disable")
async def disable_mfa(
    mfa_disable: MFADisable,
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Disable MFA for current user"""
    success = UserCRUD.disable_mfa(db, current_user, mfa_disable.password, mfa_disable.code)
    return {"success": success, "message": "MFA disabled successfully"}

@router.get("/mfa/status")
async def get_mfa_status(
    current_user = Depends(get_current_active_user)
):
    """Get current MFA status for user"""
    return {
        "mfa_enabled": current_user.mfa_enabled,
        "has_backup_codes": bool(current_user.backup_codes),
        "phone_number": bool(current_user.phone_number)
    }

@router.post("/password-reset")
async def request_password_reset(reset_data: PasswordReset, db: Session = Depends(get_db)):
    """Request password reset"""
    success = UserCRUD.initiate_password_reset(db, reset_data.email)
    return {"message": "If the email exists, a reset link has been sent"}

@router.post("/password-reset/confirm")
async def confirm_password_reset(
    reset_data: PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """Confirm password reset with token"""
    success = UserCRUD.reset_password(db, reset_data.token, reset_data.new_password)
    return {"success": success, "message": "Password reset successfully"}

@router.delete("/me")
async def delete_account(
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete current user account"""
    success = UserCRUD.delete_user(db, current_user)
    return {"success": success, "message": "Account deleted successfully"}

@router.post("/change-email")
async def change_email(
    email_data: ChangeEmail,
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Change user email address"""
    success = UserCRUD.change_email(
        db, current_user, email_data.current_password, email_data.new_email
    )
    return {"success": success, "message": "Email address updated successfully"}

@router.post("/change-password")
async def change_password(
    password_data: ChangePassword,
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Change user password"""
    try:
        success = UserCRUD.change_password(
            db, current_user, password_data.current_password, password_data.new_password
        )
        logger.info(f"Password change successful for user: {current_user.email}")
        return {"success": success, "message": "Password updated successfully"}
    except Exception as e:
        logger.error(f"Password change failed for user: {current_user.email}. Error: {str(e)}")
        raise

# HTML Templates
@router.get("/login-page", response_class=HTMLResponse)
async def login_page(request: Request):
    """Serve login page"""
    return templates.TemplateResponse("login.html", {"request": request})

@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_active_user)):
    """Logout user (invalidate token)"""
    # In a stateless JWT system, logout is typically handled client-side
    # by removing the token. This endpoint exists for completeness and
    # could be extended to maintain a blacklist of tokens if needed.
    return {"message": "Successfully logged out"}

@router.get("/register-page", response_class=HTMLResponse)
async def register_page(request: Request):
    """Serve registration page"""
    return templates.TemplateResponse("register.html", {"request": request})

@router.get("/reset-password", response_class=HTMLResponse)
async def reset_password_page(request: Request, token: str = None):
    """Serve password reset page"""
    return templates.TemplateResponse("reset_password.html", {"request": request, "token": token})

@router.get("/terminal-settings")
async def get_terminal_settings(
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get user's terminal settings"""
    settings = UserCRUD.get_terminal_settings(db, current_user)
    return {"settings": settings}

@router.post("/terminal-settings")
async def save_terminal_settings(
    settings: TerminalSettings,
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Save user's terminal settings"""
    success = UserCRUD.save_terminal_settings(db, current_user, settings.dict(exclude_unset=True))
    return {"success": success, "message": "Terminal settings saved successfully"}

@router.get("/trusted-devices")
async def get_trusted_devices(
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get user's trusted devices"""
    devices = UserCRUD.get_trusted_devices(db, current_user)
    return {"devices": [TrustedDeviceResponse.from_orm(device) for device in devices]}

@router.delete("/trusted-devices/{device_id}")
async def remove_trusted_device(
    device_id: int,
    current_user = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Remove a trusted device"""
    success = UserCRUD.remove_trusted_device(db, current_user, device_id)
    return {"success": success, "message": "Trusted device removed successfully" if success else "Device not found"}