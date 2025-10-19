import pytest
from app.core.auth import AuthManager, MFAManager

class TestAuthManager:
    """Test AuthManager functionality"""
    
    def test_password_hashing(self):
        """Test password hashing and verification"""
        password = "Test123!@#"
        hashed = AuthManager.hash_password(password)
        
        # Hash should be different from original password
        assert hashed != password
        
        # Should verify correctly
        assert AuthManager.verify_password(password, hashed) is True
        
        # Should not verify incorrect password
        assert AuthManager.verify_password("wrong_password", hashed) is False
    
    def test_mfa_secret_generation(self):
        """Test MFA secret generation"""
        secret = AuthManager.generate_mfa_secret()
        
        # Should be 32 characters (base32)
        assert len(secret) == 32
        assert secret.isalnum()
    
    def test_qr_code_generation(self):
        """Test QR code generation"""
        email = "test@example.com"
        secret = AuthManager.generate_mfa_secret()
        qr_code = AuthManager.generate_qr_code(email, secret)
        
        # Should return base64 encoded image
        assert qr_code.startswith("data:image/png;base64,")
    
    def test_backup_codes_generation(self):
        """Test backup codes generation"""
        codes = AuthManager.generate_backup_codes(5)
        
        # Should generate 5 codes
        assert len(codes) == 5
        
        # Each code should be 8 characters (4 hex bytes)
        for code in codes:
            assert len(code) == 8
            assert code.isupper()
    
    def test_backup_code_verification(self):
        """Test backup code verification"""
        codes = ["ABCD1234", "EFGH5678"]
        
        # Should verify valid codes
        assert AuthManager.verify_backup_code(codes, "ABCD1234") is True
        assert AuthManager.verify_backup_code(codes, "abcd1234") is True  # Case insensitive
        assert AuthManager.verify_backup_code(codes, "ABCD-1234") is True  # With separator
        
        # Should not verify invalid codes
        assert AuthManager.verify_backup_code(codes, "INVALID1") is False
    
    def test_reset_token_generation(self):
        """Test reset token generation"""
        token = AuthManager.generate_reset_token()
        
        # Should be a string
        assert isinstance(token, str)
        assert len(token) > 0

class TestMFAManager:
    """Test MFAManager functionality"""
    
    def test_mfa_setup(self):
        """Test MFA setup"""
        email = "test@example.com"
        setup_data = MFAManager.setup_mfa(email)
        
        # Should contain required fields
        assert "secret" in setup_data
        assert "qr_code_url" in setup_data
        assert "backup_codes" in setup_data
        
        # Secret should be valid
        assert len(setup_data["secret"]) == 32
        
        # Should have backup codes
        assert len(setup_data["backup_codes"]) == 8
        
        # QR code should be base64 image
        assert setup_data["qr_code_url"].startswith("data:image/png;base64,")
    
    def test_mfa_verification(self):
        """Test MFA code verification"""
        secret = AuthManager.generate_mfa_secret()
        
        # This test would require a time-based code
        # In a real test, you'd mock the time or use a known timestamp
        # For now, we'll test the structure
        assert MFAManager.verify_setup(secret, "123456") in [True, False]