from sqlalchemy.orm import Session
from app.models import user_model
from app.schemas import user_schema

def create_client(db: Session, client: user_schema.SSHClient, user_id: int):
    client_data = client.dict()
    client_data['user_id'] = user_id
    db_client = user_model.SSHClient(**client_data)
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

def get_clients(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(user_model.SSHClient).filter(user_model.SSHClient.user_id == user_id).offset(skip).limit(limit).all()

def get_client(db: Session, client_id: int, user_id: int):
    return db.query(user_model.SSHClient).filter(user_model.SSHClient.id == client_id, user_model.SSHClient.user_id == user_id).first()

def update_client(db: Session, client_id: int, client: user_schema.SSHClient, user_id: int):
    db_client = db.query(user_model.SSHClient).filter(user_model.SSHClient.id == client_id, user_model.SSHClient.user_id == user_id).first()
    if not db_client:
        return None
    for var, value in vars(client).items():
        setattr(db_client, var, value) if value else None
    db.commit()
    db.refresh(db_client)
    return db_client

def delete_client(db: Session, client_id: int, user_id: int):
    db_client = db.query(user_model.SSHClient).filter(user_model.SSHClient.id == client_id, user_model.SSHClient.user_id == user_id).first()
    if not db_client:
        return None
    db.delete(db_client)
    db.commit()
    return {"message": f"SSH client {client_id} deleted successfully"}