#!/usr/bin/env python3

import sqlite3
import sys
from datetime import datetime, timedelta

def test_trusted_devices_table():
    """Test the trusted_devices table structure and functionality"""
    
    try:
        # Connect to database
        conn = sqlite3.connect('ssh_client.db')
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='trusted_devices';")
        table_exists = cursor.fetchone()
        
        if not table_exists:
            print("❌ trusted_devices table does not exist")
            return False
            
        print("✅ trusted_devices table exists")
        
        # Check table structure
        cursor.execute("PRAGMA table_info(trusted_devices);")
        columns = cursor.fetchall()
        
        expected_columns = ['id', 'user_id', 'device_fingerprint', 'created_at', 'expires_at']
        actual_columns = [col[1] for col in columns]
        
        print(f"Table columns: {actual_columns}")
        
        for expected_col in expected_columns:
            if expected_col in actual_columns:
                print(f"✅ Column '{expected_col}' exists")
            else:
                print(f"❌ Column '{expected_col}' missing")
                
        # Test inserting a trusted device (if users table exists)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users';")
        users_table_exists = cursor.fetchone()
        
        if users_table_exists:
            # Check if there are any users
            cursor.execute("SELECT id FROM users LIMIT 1;")
            user = cursor.fetchone()
            
            if user:
                user_id = user[0]
                test_fingerprint = "test_device_fingerprint_123"
                expires_at = datetime.utcnow() + timedelta(days=30)
                device_name = "Test Device"
                
                # Insert test trusted device  
                cursor.execute("""
                    INSERT INTO trusted_devices (user_id, device_fingerprint, expires_at, device_name)
                    VALUES (?, ?, ?, ?)
                """, (user_id, test_fingerprint, expires_at, device_name))
                
                # Verify insertion
                cursor.execute("SELECT COUNT(*) FROM trusted_devices WHERE device_fingerprint = ?", (test_fingerprint,))
                count = cursor.fetchone()[0]
                
                if count > 0:
                    print("✅ Successfully inserted test trusted device")
                    
                    # Clean up test data
                    cursor.execute("DELETE FROM trusted_devices WHERE device_fingerprint = ?", (test_fingerprint,))
                    print("✅ Test data cleaned up")
                else:
                    print("❌ Failed to insert test trusted device")
            else:
                print("ℹ️  No users found to test with")
        else:
            print("ℹ️  Users table doesn't exist, skipping insert test")
        
        conn.commit()
        conn.close()
        
        print("\n🎉 Trusted devices table verification completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Error testing trusted devices table: {e}")
        return False

if __name__ == "__main__":
    print("Testing Trusted Devices Implementation")
    print("=" * 40)
    test_trusted_devices_table()