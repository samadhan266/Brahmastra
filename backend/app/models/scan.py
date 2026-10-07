from sqlalchemy import Column, String, Text, DateTime, Enum, Integer, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base
import uuid
import enum
from datetime import datetime


class ScanStatus(str, enum.Enum):
    PENDING = "pending"
    RECON_RUNNING = "recon_running"
    RECON_COMPLETED = "recon_completed"
    SCANNER_RUNNING = "scanner_running"
    SCANNER_COMPLETED = "scanner_completed"
    VULN_RUNNING = "vuln_running"
    VULN_COMPLETED = "vuln_completed"
    CLOUD_RUNNING = "cloud_running"
    CLOUD_COMPLETED = "cloud_completed"
    REPORT_RUNNING = "report_running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


class ScanMode(str, enum.Enum):
    AUTONOMOUS = "autonomous"
    SEMI_AUTONOMOUS = "semi_autonomous"
    MANUAL = "manual"


class Scan(Base):
    __tablename__ = "scans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target = Column(String(500), nullable=False, index=True)
    mode = Column(Enum(ScanMode), default=ScanMode.AUTONOMOUS, nullable=False)
    status = Column(Enum(ScanStatus), default=ScanStatus.PENDING, nullable=False, index=True)
    current_agent = Column(String(50), nullable=True)
    progress = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    recon_results = Column(JSON, nullable=True)
    scanner_results = Column(JSON, nullable=True)
    vuln_results = Column(JSON, nullable=True)
    cloud_results = Column(JSON, nullable=True)
    report_path = Column(String(500), nullable=True)

    agent_logs = relationship("AgentLog", back_populates="scan", cascade="all, delete-orphan")


class AgentLog(Base):
    __tablename__ = "agent_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=False, index=True)
    agent_name = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False)
    input_data = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    status = Column(String(20), nullable=False)
    error = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    scan = relationship("Scan", back_populates="agent_logs")