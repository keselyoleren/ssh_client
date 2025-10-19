import pytest
import tempfile
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.main import app
from app.models.user_model import Base
from app.dependencies import get_db

# Test database setup
def get_test_db_url():
    """Create a temporary SQLite database for testing"""
    db_fd, db_path = tempfile.mkstemp()
    os.close(db_fd)
    return f"sqlite:///{db_path}", db_path

@pytest.fixture(scope="session")
def test_db():
    """Create test database"""
    db_url, db_path = get_test_db_url()
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    yield TestingSessionLocal
    
    # Clean up
    os.unlink(db_path)

@pytest.fixture
def db_session(test_db):
    """Create database session for each test"""
    session = test_db()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def client(db_session):
    """Create test client with test database"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def test_user_data():
    """Test user data"""
    return {
        "email": "test@example.com",
        "password": "Test123!@#",
        "confirm_password": "Test123!@#"
    }

@pytest.fixture
def test_user_login():
    """Test user login data"""
    return {
        "email": "test@example.com",
        "password": "Test123!@#"
    }