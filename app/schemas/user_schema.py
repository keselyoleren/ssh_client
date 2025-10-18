from pydantic import BaseModel
from typing import Optional

class SSHClient(BaseModel):
    label: str
    host: str
    port: int
    username: str
    password: Optional[str] = None
    private_key: Optional[str] = None
