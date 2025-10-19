from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.routers import user_router, auth_router
from app.db.session import engine
from app.models import user_model
from app.core.auth_middleware import AuthMiddleware
from app.core.init_db import init_db

user_model.Base.metadata.create_all(bind=engine)

# Initialize database with default user
init_db()


class ReferrerPolicyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Referrer-Policy"] = "same-origin"
        return response


app = FastAPI()

# Mount static files
app.mount("/css", StaticFiles(directory="templates/css"), name="css")
app.mount("/js", StaticFiles(directory="templates/js"), name="js")

app.add_middleware(AuthMiddleware)
app.add_middleware(ReferrerPolicyMiddleware)
app.include_router(user_router.router)
app.include_router(auth_router.router)
