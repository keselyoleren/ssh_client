"""
Database initialization module.
Creates default admin user on first startup.
"""
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.crud.crud_auth import UserCRUD
from app.schemas.user_schema import UserCreate
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

def create_default_user(db: Session) -> None:
    """Create default admin user if no users exist"""
    try:
        # Check if any users exist
        existing_users = UserCRUD.get_users(db, skip=0, limit=1)
        print(f"📊 Found {len(existing_users)} existing users")
        
        if existing_users:
            logger.info("Users already exist. Skipping default user creation.")
            print("ℹ️  Users already exist. Skipping default user creation.")
            return
        
        # Default admin credentials
        default_email = "admin@sshclient.com"
        default_password = "admin123"
        
        print(f"👤 Creating default admin user: {default_email}")
        
        # Create default admin user
        admin_user = UserCreate(
            email=default_email,
            password=default_password,
            confirm_password=default_password
        )
        
        created_user = UserCRUD.create_user(db, admin_user)
        logger.info(f"✅ Default admin user created successfully: {created_user.email}")
        print(f"🚀 Default admin user created: {created_user.email}")
        print(f"🔑 Default password: {default_password}")
        print("⚠️  Please change the default password after first login!")
        
    except Exception as e:
        logger.error(f"Failed to create default user: {str(e)}")
        print(f"❌ Error creating default user: {str(e)}")
        import traceback
        traceback.print_exc()

def init_db() -> None:
    """Initialize database with default data"""
    print("🔧 Initializing database...")
    
    try:
        db = SessionLocal()
        create_default_user(db)
        db.close()
        print("✅ Database initialization completed!")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        print(f"❌ Database initialization failed: {str(e)}")

if __name__ == "__main__":
    init_db()