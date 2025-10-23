import pytest
from fastapi import status
from app.models.user_model import User
from app.crud.auth import UserCRUD
from app.schemas.user_schema import UserCreate, UserUpdate

class TestUserCRUD:
    """Test UserCRUD operations"""
    
    def test_create_user(self, db_session):
        """Test user creation"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        user = UserCRUD.create_user(db_session, user_data)
        
        assert user.email == "test@example.com"
        assert user.hashed_password != "Test123!@#"  # Should be hashed
        assert user.is_active is True
        assert user.is_verified is False
        assert user.mfa_enabled is False
    
    def test_create_duplicate_user(self, db_session):
        """Test creating user with duplicate email"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        # Create first user
        UserCRUD.create_user(db_session, user_data)
        
        # Try to create duplicate
        with pytest.raises(Exception):  # Should raise HTTPException
            UserCRUD.create_user(db_session, user_data)
    
    def test_get_user_by_email(self, db_session):
        """Test getting user by email"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        created_user = UserCRUD.create_user(db_session, user_data)
        retrieved_user = UserCRUD.get_user_by_email(db_session, "test@example.com")
        
        assert retrieved_user is not None
        assert retrieved_user.id == created_user.id
        assert retrieved_user.email == created_user.email
    
    def test_get_user_by_id(self, db_session):
        """Test getting user by ID"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        created_user = UserCRUD.create_user(db_session, user_data)
        retrieved_user = UserCRUD.get_user_by_id(db_session, created_user.id)
        
        assert retrieved_user is not None
        assert retrieved_user.id == created_user.id
        assert retrieved_user.email == created_user.email
    
    def test_authenticate_user_valid(self, db_session):
        """Test user authentication with valid credentials"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        created_user = UserCRUD.create_user(db_session, user_data)
        authenticated_user = UserCRUD.authenticate_user(
            db_session, "test@example.com", "Test123!@#"
        )
        
        assert authenticated_user is not None
        assert authenticated_user.id == created_user.id
    
    def test_authenticate_user_invalid_password(self, db_session):
        """Test user authentication with invalid password"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        UserCRUD.create_user(db_session, user_data)
        authenticated_user = UserCRUD.authenticate_user(
            db_session, "test@example.com", "WrongPassword"
        )
        
        assert authenticated_user is None
    
    def test_authenticate_user_nonexistent(self, db_session):
        """Test authentication with nonexistent user"""
        authenticated_user = UserCRUD.authenticate_user(
            db_session, "nonexistent@example.com", "password"
        )
        
        assert authenticated_user is None
    
    def test_update_user_email(self, db_session):
        """Test updating user email"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        user = UserCRUD.create_user(db_session, user_data)
        
        update_data = UserUpdate(email="newemail@example.com")
        updated_user = UserCRUD.update_user(db_session, user, update_data)
        
        assert updated_user.email == "newemail@example.com"
        assert updated_user.is_verified is False  # Should require re-verification
    
    def test_update_user_password(self, db_session):
        """Test updating user password"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        user = UserCRUD.create_user(db_session, user_data)
        old_hash = user.hashed_password
        
        update_data = UserUpdate(
            current_password="Test123!@#",
            new_password="NewPassword123!",
            confirm_password="NewPassword123!"
        )
        updated_user = UserCRUD.update_user(db_session, user, update_data)
        
        assert updated_user.hashed_password != old_hash
        
        # Should authenticate with new password
        auth_user = UserCRUD.authenticate_user(
            db_session, "test@example.com", "NewPassword123!"
        )
        assert auth_user is not None
    
    def test_mfa_setup(self, db_session):
        """Test MFA setup"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        user = UserCRUD.create_user(db_session, user_data)
        mfa_data = UserCRUD.setup_mfa(db_session, user)
        
        assert "secret" in mfa_data
        assert "qr_code_url" in mfa_data
        assert "backup_codes" in mfa_data
        
        # User should have secret but MFA not enabled yet
        db_session.refresh(user)
        assert user.mfa_secret is not None
        assert user.mfa_enabled is False
    
    def test_password_reset_flow(self, db_session):
        """Test password reset flow"""
        user_data = UserCreate(
            email="test@example.com",
            password="Test123!@#",
            confirm_password="Test123!@#"
        )
        
        user = UserCRUD.create_user(db_session, user_data)
        
        # Initiate reset
        success = UserCRUD.initiate_password_reset(db_session, "test@example.com")
        assert success is True
        
        # User should have reset token
        db_session.refresh(user)
        assert user.password_reset_token is not None
        assert user.password_reset_expires is not None
        
        # Reset password
        token = user.password_reset_token
        success = UserCRUD.reset_password(db_session, token, "NewPassword456!")
        assert success is True
        
        # Should authenticate with new password
        auth_user = UserCRUD.authenticate_user(
            db_session, "test@example.com", "NewPassword456!"
        )
        assert auth_user is not None
        
        # Old password should not work
        auth_user = UserCRUD.authenticate_user(
            db_session, "test@example.com", "Test123!@#"
        )
        assert auth_user is None