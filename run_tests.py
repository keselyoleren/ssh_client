#!/usr/bin/env python3
"""
Test runner for SSH Client authentication system
"""
import sys
import pytest
import os

# Add the app directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

if __name__ == "__main__":
    # Run tests with verbose output
    exit_code = pytest.main([
        "tests/",
        "-v",
        "--tb=short",
        "--durations=10",
        "-x"  # Stop on first failure
    ])
    sys.exit(exit_code)