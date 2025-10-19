#!/usr/bin/env python3
"""Check current user state"""

from app.db.session import SessionLocal
from app.models.user_model import User
from app.core.auth import AuthManager

def check_user_state():
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            print("No users found")
            return
        
        print(f"User: {user.email}")
        print(f"Hash length: {len(user.hashed_password)}")
        print(f"Hash starts with: {user.hashed_password[:20]}...")
        print(f"Created at: {user.created_at}")
        print(f"Updated at: {user.updated_at}")
        
        # Test common passwords
        test_passwords = ["admin123", "password", "admin", "test123", "newpassword", "123456"]
        for password in test_passwords:
            result = AuthManager.verify_password(password, user.hashed_password)
            if result:
                print(f"✅ Working password: {password}")
                return
        
        print("❌ No working password found from common list")
        
    finally:
        db.close()

if __name__ == "__main__":
    check_user_state()