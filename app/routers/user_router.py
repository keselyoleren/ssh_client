import logging
import paramiko
import asyncio

from fastapi import APIRouter, Depends, Request, WebSocket
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect
from app.crud import crud_user
from app.dependencies import get_db
from app.schemas import user_schema


logger = logging.getLogger(__name__)
router = APIRouter()

templates = Jinja2Templates(directory="templates")

@router.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@router.post("/clients")
async def create_client(client: user_schema.SSHClient, db: Session = Depends(get_db)):
    return crud_user.create_client(db=db, client=client)

@router.get("/clients")
async def get_clients(db: Session = Depends(get_db)):
    return {"clients": crud_user.get_clients(db=db)}

@router.get("/clients/{client_id}")
async def get_client(client_id: int, db: Session = Depends(get_db)):
    return crud_user.get_client(db=db, client_id=client_id)

@router.put("/clients/{client_id}")
async def update_client(client_id: int, client: user_schema.SSHClient, db: Session = Depends(get_db)):
    return crud_user.update_client(db=db, client_id=client_id, client=client)

@router.delete("/clients/{client_id}")
async def delete_client(client_id: int, db: Session = Depends(get_db)):
    return crud_user.delete_client(db=db, client_id=client_id)


@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: int, db: Session = Depends(get_db)):
    await websocket.accept()
    client_details = crud_user.get_client(db=db, client_id=client_id)
    if not client_details:
        logger.warning(f"Client with id {client_id} not found.")
        await websocket.close(code=4000, reason="Client not found")
        return

    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        if client_details.private_key:
            from io import StringIO
            private_key = paramiko.RSAKey.from_private_key(StringIO(client_details.private_key))
            logger.info(f"Connecting to {client_details.host}:{client_details.port} with user {client_details.username} and private key.")
            ssh.connect(client_details.host, client_details.port, client_details.username, pkey=private_key)
        else:
            logger.info(f"Connecting to {client_details.host}:{client_details.port} with user {client_details.username} and password.")
            ssh.connect(client_details.host, client_details.port, client_details.username, client_details.password)
        
        channel = ssh.invoke_shell()

        async def read_from_ssh():
            while not channel.exit_status_ready():
                try:
                    if channel.recv_ready():
                        data = channel.recv(1024)
                        if not data:
                            break
                        await websocket.send_text(data.decode())
                    else:
                        await asyncio.sleep(0.01)
                except Exception as e:
                    logger.error(f"Error reading from SSH: {e}")
                    break
            logger.info(f"SSH read loop for client {client_id} finished.")

        async def write_to_ssh():
            try:
                while True:
                    data = await websocket.receive_text()
                    if not channel.active:
                        break
                    channel.send(data)
            except WebSocketDisconnect:
                logger.info(f"WebSocket client {client_id} disconnected.")
                raise
            except Exception as e:
                logger.error(f"Error writing to SSH (from WebSocket): {e}")
                raise

        read_task = asyncio.create_task(read_from_ssh())
        write_task = asyncio.create_task(write_to_ssh())

        done, pending = await asyncio.wait(
            [read_task, write_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        for task in pending:
            task.cancel()
        
        if pending:
            try:
                await asyncio.gather(*pending)
            except asyncio.CancelledError:
                logger.info(f"Pending task for client {client_id} cancelled.")

        for task in done:
            if task.exception():
                raise task.exception()

    except WebSocketDisconnect:
        logger.info(f"WebSocketDisconnect: Client {client_id} disconnected gracefully.")
    except Exception as e:
        logger.error(f"An error occurred for client {client_id}: {e}")
        try:
            await websocket.close(reason=f"Error: {e}")
        except RuntimeError as re:
            logger.warning(f"Tried to close websocket, but it was already closed: {re}")
    finally:
        if channel:
            channel.close()
        if ssh:
            ssh.close()
        logger.info(f"SSH connection for client {client_id} cleaned up.")