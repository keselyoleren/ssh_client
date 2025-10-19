from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str
    confirm_password: str
    
    @validator('confirm_password')
    def passwords_match(cls, v, values, **kwargs):
        if 'password' in values and v != values['password']:
            raise ValueError('Passwords do not match')
        return v

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None
    confirm_password: Optional[str] = None
    phone_number: Optional[str] = None
    
    @validator('confirm_password')
    def passwords_match(cls, v, values, **kwargs):
        if 'new_password' in values and v and v != values['new_password']:
            raise ValueError('Passwords do not match')
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    mfa_code: Optional[str] = None
    remember_device: Optional[bool] = False

class UserResponse(UserBase):
    id: int
    is_active: bool
    is_verified: bool
    mfa_enabled: bool
    phone_number: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class MFASetup(BaseModel):
    secret: str
    qr_code_url: str
    backup_codes: List[str]

class MFAVerification(BaseModel):
    code: str

class MFADisable(BaseModel):
    password: str
    code: str

class PasswordReset(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str
    confirm_password: str
    
    @validator('confirm_password')
    def passwords_match(cls, v, values, **kwargs):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Passwords do not match')
        return v

class ChangeEmail(BaseModel):
    current_password: str
    new_email: EmailStr
    confirm_email: EmailStr
    
    @validator('confirm_email')
    def emails_match(cls, v, values, **kwargs):
        if 'new_email' in values and v != values['new_email']:
            raise ValueError('Email addresses do not match')
        return v

class ChangePassword(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str
    
    @validator('confirm_password')
    def passwords_match(cls, v, values, **kwargs):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Passwords do not match')
        return v

# Terminal Settings Schema
class TerminalSettings(BaseModel):
    theme: Optional[str] = "hacker-blue"
    autoReconnect: Optional[bool] = True
    bellSound: Optional[bool] = False
    terminalThemes: Optional[dict] = {}  # Per-terminal theme mapping

# SSH Client Schema (existing)
class SSHClient(BaseModel):
    label: str
    host: str
    port: int
    username: str
    password: Optional[str] = None
    private_key: Optional[str] = None

# Trusted Device Schemas
class TrustedDeviceCreate(BaseModel):
    device_name: Optional[str] = None
    remember_device: bool = False

class TrustedDeviceResponse(BaseModel):
    id: int
    device_name: str
    created_at: datetime
    expires_at: datetime
    last_used: Optional[datetime] = None
    is_active: bool
    
    class Config:
        from_attributes = True
