from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.routers import user_router
from app.db.session import engine
from app.models import user_model

user_model.Base.metadata.create_all(bind=engine)


class ReferrerPolicyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Referrer-Policy"] = "same-origin"
        return response


app = FastAPI()

app.add_middleware(ReferrerPolicyMiddleware)
app.include_router(user_router.router)
