import logging
import paramiko
import asyncio
import time

from fastapi import APIRouter, Depends, Request, WebSocket
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect
from app.crud import user
from app.dependencies import get_db
from app.schemas import user_schema
from app.core.jwt_auth import get_current_active_user


logger = logging.getLogger(__name__)
router = APIRouter()

templates = Jinja2Templates(directory="templates")

@router.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Serve main application page - authentication handled by frontend"""
    return templates.TemplateResponse("index.html", {"request": request})

@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@router.post("/clients")
async def create_client(client: user_schema.SSHClient, db: Session = Depends(get_db), current_user: user_schema.UserResponse = Depends(get_current_active_user)):
    return user.create_client(db=db, client=client, user_id=current_user.id)

@router.get("/clients")
async def get_clients(db: Session = Depends(get_db), current_user: user_schema.UserResponse = Depends(get_current_active_user)):
    return {"clients": user.get_clients(db=db, user_id=current_user.id)}

@router.get("/clients/{client_id}")
async def get_client(client_id: int, db: Session = Depends(get_db), current_user: user_schema.UserResponse = Depends(get_current_active_user)):
    return user.get_client(db=db, client_id=client_id, user_id=current_user.id)

@router.put("/clients/{client_id}")
async def update_client(client_id: int, client: user_schema.SSHClient, db: Session = Depends(get_db), current_user: user_schema.UserResponse = Depends(get_current_active_user)):
    return user.update_client(db=db, client_id=client_id, client=client, user_id=current_user.id)

@router.delete("/clients/{client_id}")
async def delete_client(client_id: int, db: Session = Depends(get_db), current_user: user_schema.UserResponse = Depends(get_current_active_user)):
    return user.delete_client(db=db, client_id=client_id, user_id=current_user.id)


def detect_operating_system(ssh_client):
    """Detect operating system through SSH connection"""
    try:
        # Execute uname command to detect OS
        stdin, stdout, stderr = ssh_client.exec_command('uname -s', timeout=5)
        os_output = stdout.read().decode().strip().lower()
        
        if 'linux' in os_output:
            # Try to detect specific Linux distribution
            stdin, stdout, stderr = ssh_client.exec_command('cat /etc/os-release 2>/dev/null || cat /etc/redhat-release 2>/dev/null || echo "linux"', timeout=5)
            distro_output = stdout.read().decode().lower()
            
            if 'ubuntu' in distro_output:
                return 'ubuntu'
            elif 'debian' in distro_output:
                return 'debian'
            elif 'centos' in distro_output or 'red hat' in distro_output:
                return 'redhat'
            elif 'fedora' in distro_output:
                return 'fedora'
            elif 'alpine' in distro_output:
                return 'alpine'
            elif 'arch' in distro_output:
                return 'arch'
            else:
                return 'linux'
                
        elif 'darwin' in os_output:
            return 'macos'
        elif 'freebsd' in os_output:
            return 'freebsd'
        elif 'openbsd' in os_output:
            return 'openbsd'
        else:
            # Try Windows detection
            stdin, stdout, stderr = ssh_client.exec_command('ver', timeout=5)
            windows_output = stdout.read().decode().lower()
            if 'windows' in windows_output or 'microsoft' in windows_output:
                return 'windows'
            return 'unknown'
            
    except Exception as e:
        logger.error(f"OS detection failed: {e}")
        return 'unknown'


@router.post("/clients/{client_id}/detect-os")
async def detect_client_os(client_id: int, db: Session = Depends(get_db), current_user: user_schema.UserResponse = Depends(get_current_active_user)):
    """Detect and update the operating system of an SSH client"""
    client_details = user.get_client(db=db, client_id=client_id, user_id=current_user.id)
    if not client_details:
        return {"error": "Client not found"}
    
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        # Connect to SSH server
        if client_details.private_key:
            from io import StringIO
            private_key = paramiko.RSAKey.from_private_key(StringIO(client_details.private_key))
            ssh.connect(client_details.host, client_details.port, client_details.username, pkey=private_key, timeout=10)
        else:
            ssh.connect(client_details.host, client_details.port, client_details.username, client_details.password, timeout=10)
        
        # Detect OS
        detected_os = detect_operating_system(ssh)
        ssh.close()
        
        # Update the client with detected OS
        client_data = user_schema.SSHClient(
            label=client_details.label,
            host=client_details.host,
            port=client_details.port,
            username=client_details.username,
            password=client_details.password,
            private_key=client_details.private_key,
            detected_os=detected_os
        )
        
        updated_client = user.update_client(db=db, client_id=client_id, client=client_data, user_id=current_user.id)
        return {"detected_os": detected_os, "client": updated_client}
        
    except Exception as e:
        logger.error(f"OS detection failed for client {client_id}: {e}")
        return {"error": f"Failed to detect OS: {str(e)}", "detected_os": "unknown"}


@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: int, token: str = None, db: Session = Depends(get_db)):
    # Note: We need to validate the token here since WS doesn't support headers easily
    # We'll expect ?token=... in the URL
    await websocket.accept()
    
    if not token:
        await websocket.close(code=4003, reason="Authentication required")
        return

    from app.core.jwt_auth import get_current_user_from_token
    try:
        current_user = await get_current_user_from_token(token, db)
    except Exception as e:
        logger.error(f"WebSocket auth failed: {e}")
        await websocket.close(code=4003, reason="Invalid token")
        return

    client_details = user.get_client(db=db, client_id=client_id, user_id=current_user.id)
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