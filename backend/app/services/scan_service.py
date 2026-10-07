import uuid
import os
from typing import Dict, Any, Optional, List
from datetime import datetime
from app.models.scan import Scan, ScanStatus, ScanMode, AgentLog
from app.core.database import async_session_maker
from app.utils.ws_manager import ws_manager
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import asyncio


class ScanService:
    def __init__(self):
        self.active_scans: Dict[str, asyncio.Task] = {}

    async def create_scan(self, target: str, mode: str = "semi_autonomous") -> Scan:
        async with async_session_maker() as session:
            scan = Scan(id=uuid.uuid4(), target=target, mode=ScanMode(mode), status=ScanStatus.PENDING)
            session.add(scan)
            await session.commit()
            await session.refresh(scan)
            return scan

    async def get_scan(self, scan_id: str) -> Optional[Scan]:
        async with async_session_maker() as session:
            result = await session.execute(select(Scan).where(Scan.id == uuid.UUID(scan_id)))
            return result.scalar_one_or_none()

    async def list_scans(self, limit: int = 20, offset: int = 0):
        async with async_session_maker() as session:
            result = await session.execute(
                select(Scan).order_by(Scan.created_at.desc()).offset(offset).limit(limit)
            )
            return result.scalars().all()

    async def mark_running(self, scan_id: str):
        async with async_session_maker() as session:
            scan = await session.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = ScanStatus.RECON_RUNNING
                scan.updated_at = datetime.utcnow()
                await session.commit()

    async def mark_cloud_running(self, scan_id: str):
        async with async_session_maker() as session:
            scan = await session.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = ScanStatus.CLOUD_RUNNING
                scan.progress = 75
                scan.updated_at = datetime.utcnow()
                await session.commit()

    async def mark_cloud_completed(self, scan_id: str, results: Optional[Dict] = None):
        async with async_session_maker() as session:
            scan = await session.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = ScanStatus.CLOUD_COMPLETED
                scan.progress = 90
                scan.updated_at = datetime.utcnow()
                if results:
                    scan.cloud_results = results
                await session.commit()

    async def mark_completed(self, scan_id: str, results: Optional[Dict] = None):
        async with async_session_maker() as session:
            scan = await session.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = ScanStatus.COMPLETED
                scan.completed_at = datetime.utcnow()
                scan.progress = 100
                scan.updated_at = datetime.utcnow()
                if results:
                    for key in ("recon_results", "scanner_results", "vuln_results", "cloud_results"):
                        if key in results:
                            setattr(scan, key, results[key])
                await session.commit()

    async def mark_failed(self, scan_id: str, error: str):
        async with async_session_maker() as session:
            scan = await session.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = ScanStatus.FAILED
                scan.error_message = error
                scan.updated_at = datetime.utcnow()
                await session.commit()
        await ws_manager.send_scan_update(scan_id, "failed", 0, error[:200])

    async def get_scan_progress(self, scan_id: str) -> Optional[Dict[str, Any]]:
        async with async_session_maker() as session:
            result = await session.execute(
                select(Scan).options(selectinload(Scan.agent_logs)).where(Scan.id == uuid.UUID(scan_id))
            )
            scan = result.scalar_one_or_none()
        if not scan:
            return None
        return {
            "id": str(scan.id),
            "target": scan.target,
            "mode": scan.mode.value if scan.mode else "semi_autonomous",
            "status": scan.status.value if scan.status else "pending",
            "current_agent": scan.current_agent,
            "progress": scan.progress or 0,
            "error_message": scan.error_message,
            "created_at": scan.created_at.isoformat() if scan.created_at else None,
            "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
            "recon_results": scan.recon_results,
            "scanner_results": scan.scanner_results,
            "vuln_results": scan.vuln_results,
            "cloud_results": scan.cloud_results,
            "report_path": f"/reports/{scan.report_path}" if scan.report_path else None,
            "agent_logs": [{
                "agent_name": log.agent_name, "action": log.action,
                "status": log.status, "duration_ms": log.duration_ms,
                "error": log.error
            } for log in (scan.agent_logs or [])]
        }

    async def cancel_scan(self, scan_id: str):
        if scan_id in self.active_scans:
            self.active_scans[scan_id].cancel()
            del self.active_scans[scan_id]
        async with async_session_maker() as session:
            scan = await session.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = ScanStatus.FAILED
                scan.error_message = "Cancelled"
                scan.completed_at = datetime.utcnow()
                await session.commit()

    async def pause_scan(self, scan_id: str):
        if scan_id in self.active_scans:
            self.active_scans[scan_id].cancel()
            del self.active_scans[scan_id]
        async with async_session_maker() as session:
            scan = await session.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = ScanStatus.PAUSED
                scan.error_message = "Paused by user"
                scan.updated_at = datetime.utcnow()
                await session.commit()

    async def delete_scan(self, scan_id: str):
        if scan_id in self.active_scans:
            self.active_scans[scan_id].cancel()
            del self.active_scans[scan_id]
        async with async_session_maker() as session:
            scan = await session.get(Scan, uuid.UUID(scan_id))
            if scan:
                await session.delete(scan)
                await session.commit()


scan_service = ScanService()
