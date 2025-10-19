from fastapi import Request
from fastapi.responses import RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from app.core.jwt_auth import verify_token
import logging

logger = logging.getLogger(__name__)

class AuthMiddleware(BaseHTTPMiddleware):
    """Middleware to handle authentication redirects for protected routes"""
    
    PROTECTED_ROUTES = []  # Frontend handles auth check for main page
    PUBLIC_ROUTES = ["/auth", "/css", "/js", "/docs", "/openapi.json", "/"]  # Routes that don't require auth
    
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # Skip auth check for public routes
        if any(path.startswith(route) for route in self.PUBLIC_ROUTES):
            return await call_next(request)
        
        # Check if route requires authentication
        if path in self.PROTECTED_ROUTES:
            # Check for JWT token in cookies or Authorization header
            token = None
            
            # Check Authorization header
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
            
            # Check cookies
            if not token:
                token = request.cookies.get("access_token")
            
            # If no token or invalid token, redirect to login
            if not token or not verify_token(token):
                if request.headers.get("accept", "").startswith("text/html"):
                    return RedirectResponse(url="/auth/login-page", status_code=302)
                else:
                    # For API calls, let the endpoint handle the 401
                    pass
        
        return await call_next(request)