# SSH Client Authentication System

This document describes the comprehensive user authentication and MFA system implemented for the SSH Client application.

## Features

### 🔐 User Authentication
- **User Registration**: Email-based account creation with password confirmation
- **Secure Login**: JWT-based authentication with email/password
- **Password Management**: Secure password hashing using bcrypt
- **Account Management**: Update email, password, and profile information

### 🛡️ Multi-Factor Authentication (MFA)
- **TOTP Support**: Time-based One-Time Password using authenticator apps (Google Authenticator, Authy, etc.)
- **QR Code Generation**: Automatic QR code generation for easy MFA setup
- **Backup Codes**: 8 one-time backup codes for account recovery
- **MFA Management**: Enable/disable MFA with proper verification

### 🔒 Security Features
- **Account Lockout**: Automatic account lockout after 5 failed login attempts
- **Password Reset**: Secure email-based password reset with time-limited tokens
- **JWT Tokens**: Secure session management with configurable expiration
- **Password Strength Validation**: Real-time password strength checking

## API Endpoints

### Authentication Routes (`/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user account |
| POST | `/auth/login` | Login with email/password |
| GET | `/auth/me` | Get current user information |
| PUT | `/auth/me` | Update user information |
| DELETE | `/auth/me` | Delete user account |

### MFA Routes (`/auth/mfa`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/mfa/setup` | Initialize MFA setup (get QR code) |
| POST | `/auth/mfa/verify-setup` | Verify and enable MFA |
| POST | `/auth/mfa/disable` | Disable MFA |

### Password Reset Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/password-reset` | Request password reset email |
| POST | `/auth/password-reset/confirm` | Reset password with token |

### HTML Pages

| Route | Description |
|-------|-------------|
| `/auth/login-page` | Login form |
| `/auth/register-page` | Registration form |
| `/auth/reset-password` | Password reset form |

## Database Schema

### Users Table

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP,
    last_login TIMESTAMP,
    
    -- MFA Settings
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(32),
    backup_codes TEXT,
    phone_number VARCHAR(20),
    
    -- Security
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP
);
```

## Usage Examples

### 1. User Registration

```python
# API Request
POST /auth/register
{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "confirm_password": "SecurePass123!"
}

# Response
{
    "id": 1,
    "email": "user@example.com",
    "is_active": true,
    "is_verified": false,
    "mfa_enabled": false,
    "created_at": "2025-10-19T10:00:00Z"
}
```

### 2. User Login

```python
# API Request
POST /auth/login
{
    "email": "user@example.com",
    "password": "SecurePass123!"
}

# Response (no MFA)
{
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "token_type": "bearer",
    "user": {
        "id": 1,
        "email": "user@example.com",
        "mfa_enabled": false
    }
}

# Response (MFA required)
{
    "mfa_required": true,
    "message": "MFA code required"
}
```

### 3. MFA Setup

```python
# Step 1: Initialize MFA
POST /auth/mfa/setup
Authorization: Bearer <token>

# Response
{
    "secret": "JBSWY3DPEHPK3PXP",
    "qr_code_url": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "backup_codes": [
        "ABCD1234",
        "EFGH5678",
        ...
    ]
}

# Step 2: Verify MFA setup
POST /auth/mfa/verify-setup
Authorization: Bearer <token>
{
    "code": "123456"
}

# Response
{
    "success": true,
    "message": "MFA enabled successfully"
}
```

### 4. Password Reset

```python
# Step 1: Request reset
POST /auth/password-reset
{
    "email": "user@example.com"
}

# Step 2: Confirm reset
POST /auth/password-reset/confirm
{
    "token": "reset_token_from_email",
    "new_password": "NewSecurePass123!",
    "confirm_password": "NewSecurePass123!"
}
```

## Frontend Integration

### JavaScript Classes

- **LoginManager**: Handles login form, MFA verification, settings management
- **RegisterManager**: Manages user registration with validation
- **ResetPasswordManager**: Handles password reset flow

### Features

- Real-time password strength validation
- Form validation with error handling
- MFA QR code display and verification
- Responsive design with dark theme
- Loading states and user feedback

## Security Best Practices

### Password Security
- Minimum 8 characters with complexity requirements
- Bcrypt hashing with salt
- Password strength meter with real-time feedback

### Account Protection
- Account lockout after failed attempts
- Time-limited password reset tokens
- Secure session management with JWT

### MFA Security
- TOTP with 30-second windows
- Backup codes for account recovery
- Secure secret generation and storage

## Testing

### Test Coverage

The system includes comprehensive tests covering:

- **Unit Tests**: Individual component testing
  - Password hashing/verification
  - MFA secret generation
  - Token creation/validation
  
- **Integration Tests**: API endpoint testing
  - User registration flow
  - Login authentication
  - MFA setup and verification
  - Password reset process

- **CRUD Tests**: Database operations
  - User creation/retrieval
  - Authentication validation
  - Account management

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio

# Run all tests
python run_tests.py

# Run specific test file
pytest tests/test_auth.py -v

# Run with coverage
pytest --cov=app tests/
```

## Configuration

### Environment Variables

```bash
# JWT Configuration
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Email Configuration (optional)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_TLS=true

# Application Settings
APP_NAME=SSH Client
ISSUER_NAME=SSH Client App
```

### Database Migration

```bash
# Apply migrations
docker compose exec web alembic upgrade head

# Create new migration
docker compose exec web alembic revision --autogenerate -m "description"
```

## Dependencies

### Core Dependencies
- **FastAPI**: Web framework
- **SQLAlchemy**: ORM and database management
- **Alembic**: Database migrations
- **Pydantic**: Data validation and serialization

### Authentication Dependencies
- **bcrypt**: Password hashing
- **python-jose**: JWT token handling
- **pyotp**: TOTP implementation
- **qrcode**: QR code generation
- **email-validator**: Email validation

### Development Dependencies
- **pytest**: Testing framework
- **pytest-asyncio**: Async testing support

## Error Handling

The system includes comprehensive error handling:

- **Validation Errors**: Input validation with detailed messages
- **Authentication Errors**: Clear error codes for auth failures
- **Rate Limiting**: Account lockout for security
- **Database Errors**: Graceful handling of database issues

## Future Enhancements

Potential improvements for the authentication system:

1. **SMS MFA**: Text message-based verification
2. **Social Login**: OAuth integration (Google, GitHub, etc.)
3. **Session Management**: Advanced session control
4. **Audit Logging**: Login/activity tracking
5. **Role-Based Access**: User roles and permissions
6. **Email Verification**: Account activation via email
7. **Remember Me**: Persistent login sessions