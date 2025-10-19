from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True))
    
    # MFA Settings
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(32))  # TOTP secret
    backup_codes = Column(Text)  # JSON array of backup codes
    phone_number = Column(String(20))  # For SMS MFA
    
    # Account Security
    failed_login_attempts = Column(Integer, default=0)
    account_locked_until = Column(DateTime(timezone=True))
    password_reset_token = Column(String(255))
    password_reset_expires = Column(DateTime(timezone=True))
    
    # Terminal Settings
    terminal_settings = Column(Text)  # JSON object for terminal preferences

class TrustedDevice(Base):
    __tablename__ = "trusted_devices"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)  # Foreign key to users table
    device_fingerprint = Column(String(255), nullable=False)  # Unique device identifier
    device_name = Column(String(255))  # User-friendly device name
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)  # When trust expires
    last_used = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)

class SSHClient(Base):
    __tablename__ = "ssh_clients"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)
    host = Column(String, index=True)
    port = Column(Integer)
    username = Column(String)
    password = Column(String, nullable=True)
    private_key = Column(String, nullable=True)
    detected_os = Column(String, nullable=True)  # Operating system detected from SSH connection
