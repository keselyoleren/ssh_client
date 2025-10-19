#!/usr/bin/env python3
"""
Reset user password and fix database issues
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import sessionmaker
from app.db.session import engine
from app.models.user_model import User
from app.core.auth import AuthManager

# Create session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
session = SessionLocal()

try:
    # Get the user (assuming there's only one user for simplicity)
    user = session.query(User).first()
    
    if not user:
        print("No user found in database")
        sys.exit(1)
    
    print(f"Found user: {user.email}")
    print(f"Current password hash: {user.hashed_password[:50] if user.hashed_password else 'None'}...")
    print(f"Failed login attempts: {user.failed_login_attempts}")
    print(f"Account locked until: {user.account_locked_until}")
    
    # Fix the failed_login_attempts if it's None
    if user.failed_login_attempts is None:
        print("Fixing failed_login_attempts field (was None)")
        user.failed_login_attempts = 0
    
    # Reset password to "admin123"
    new_password = "admin123"
    auth_manager = AuthManager()
    new_hash = auth_manager.hash_password(new_password)
    
    # Reset all security fields
    user.hashed_password = new_hash
    user.failed_login_attempts = 0
    user.account_locked_until = None
    user.password_reset_token = None
    user.password_reset_expires = None
    
    session.commit()
    
    print(f"Password reset successfully to: {new_password}")
    print(f"New password hash: {new_hash[:50]}...")
    print("Account unlocked and failed attempts reset")
    
    # Verify the password works
    if auth_manager.verify_password(new_password, new_hash):
        print("✓ Password verification successful")
    else:
        print("✗ Password verification failed")

except Exception as e:
    print(f"Error: {e}")
    session.rollback()
finally:
    session.close()