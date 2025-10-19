import pytest
from fastapi import status

class TestAuthAPI:
    """Test authentication API endpoints"""
    
    def test_register_user(self, client, test_user_data):
        """Test user registration"""
        response = client.post("/auth/register", json=test_user_data)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == test_user_data["email"]
        assert data["is_active"] is True
        assert data["is_verified"] is False
        assert data["mfa_enabled"] is False
        assert "id" in data
    
    def test_register_duplicate_email(self, client, test_user_data):
        """Test registration with duplicate email"""
        # Register first user
        client.post("/auth/register", json=test_user_data)
        
        # Try to register with same email
        response = client.post("/auth/register", json=test_user_data)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Email already registered" in response.json()["detail"]
    
    def test_register_password_mismatch(self, client):
        """Test registration with password mismatch"""
        user_data = {
            "email": "test@example.com",
            "password": "Test123!@#",
            "confirm_password": "DifferentPassword"
        }
        
        response = client.post("/auth/register", json=user_data)
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_login_valid_credentials(self, client, test_user_data, test_user_login):
        """Test login with valid credentials"""
        # Register user first
        client.post("/auth/register", json=test_user_data)
        
        # Login
        response = client.post("/auth/login", json=test_user_login)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "token_type" in data
        assert data["token_type"] == "bearer"
        assert "user" in data
    
    def test_login_invalid_credentials(self, client, test_user_data):
        """Test login with invalid credentials"""
        # Register user first
        client.post("/auth/register", json=test_user_data)
        
        # Try login with wrong password
        login_data = {
            "email": "test@example.com",
            "password": "WrongPassword"
        }
        response = client.post("/auth/login", json=login_data)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Incorrect email or password" in response.json()["detail"]
    
    def test_login_nonexistent_user(self, client):
        """Test login with nonexistent user"""
        login_data = {
            "email": "nonexistent@example.com",
            "password": "password"
        }
        response = client.post("/auth/login", json=login_data)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_get_current_user(self, client, test_user_data, test_user_login):
        """Test getting current user info"""
        # Register and login
        client.post("/auth/register", json=test_user_data)
        login_response = client.post("/auth/login", json=test_user_login)
        token = login_response.json()["access_token"]
        
        # Get user info
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/auth/me", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == test_user_data["email"]
    
    def test_get_current_user_no_token(self, client):
        """Test getting current user without token"""
        response = client.get("/auth/me")
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_get_current_user_invalid_token(self, client):
        """Test getting current user with invalid token"""
        headers = {"Authorization": "Bearer invalid_token"}
        response = client.get("/auth/me", headers=headers)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_update_user_info(self, client, test_user_data, test_user_login):
        """Test updating user information"""
        # Register and login
        client.post("/auth/register", json=test_user_data)
        login_response = client.post("/auth/login", json=test_user_login)
        token = login_response.json()["access_token"]
        
        # Update email
        update_data = {"email": "newemail@example.com"}
        headers = {"Authorization": f"Bearer {token}"}
        response = client.put("/auth/me", json=update_data, headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == "newemail@example.com"
        assert data["is_verified"] is False  # Should require re-verification
    
    def test_setup_mfa(self, client, test_user_data, test_user_login):
        """Test MFA setup"""
        # Register and login
        client.post("/auth/register", json=test_user_data)
        login_response = client.post("/auth/login", json=test_user_login)
        token = login_response.json()["access_token"]
        
        # Setup MFA
        headers = {"Authorization": f"Bearer {token}"}
        response = client.post("/auth/mfa/setup", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "secret" in data
        assert "qr_code_url" in data
        assert "backup_codes" in data
        assert len(data["backup_codes"]) == 8
    
    def test_password_reset_request(self, client, test_user_data):
        """Test password reset request"""
        # Register user
        client.post("/auth/register", json=test_user_data)
        
        # Request password reset
        reset_data = {"email": test_user_data["email"]}
        response = client.post("/auth/password-reset", json=reset_data)
        
        assert response.status_code == status.HTTP_200_OK
        assert "reset link has been sent" in response.json()["message"]
    
    def test_password_reset_nonexistent_email(self, client):
        """Test password reset for nonexistent email"""
        reset_data = {"email": "nonexistent@example.com"}
        response = client.post("/auth/password-reset", json=reset_data)
        
        # Should still return success to not reveal email existence
        assert response.status_code == status.HTTP_200_OK
    
    def test_delete_account(self, client, test_user_data, test_user_login):
        """Test account deletion"""
        # Register and login
        client.post("/auth/register", json=test_user_data)
        login_response = client.post("/auth/login", json=test_user_login)
        token = login_response.json()["access_token"]
        
        # Delete account
        headers = {"Authorization": f"Bearer {token}"}
        response = client.delete("/auth/me", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert "Account deleted successfully" in response.json()["message"]
        
        # Should not be able to access user info after deletion
        response = client.get("/auth/me", headers=headers)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

class TestAuthPages:
    """Test authentication HTML pages"""
    
    def test_login_page(self, client):
        """Test login page rendering"""
        response = client.get("/auth/login-page")
        
        assert response.status_code == status.HTTP_200_OK
        assert "text/html" in response.headers["content-type"]
    
    def test_register_page(self, client):
        """Test register page rendering"""
        response = client.get("/auth/register-page")
        
        assert response.status_code == status.HTTP_200_OK
        assert "text/html" in response.headers["content-type"]
    
    def test_reset_password_page(self, client):
        """Test reset password page rendering"""
        response = client.get("/auth/reset-password?token=test_token")
        
        assert response.status_code == status.HTTP_200_OK
        assert "text/html" in response.headers["content-type"]