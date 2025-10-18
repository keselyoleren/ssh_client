from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class SSHClient(Base):
    __tablename__ = "ssh_clients"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)
    host = Column(String, index=True)
    port = Column(Integer)
    username = Column(String)
    password = Column(String, nullable=True)
    private_key = Column(String, nullable=True)
