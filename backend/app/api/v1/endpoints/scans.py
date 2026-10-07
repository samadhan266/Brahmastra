from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.services.scan_service import scan_service
from app.models.scan import Scan, ScanStatus
from app.utils.ws_manager import ws_manager
from app.utils.tool_manager import tool_manager, SECLISTS_DIR
from app.core.database import async_session_maker
from app.core.config import settings
import httpx
import json
import uuid
from sqlalchemy import select

router = APIRouter(prefix="/scans", tags=["scans"])

api_enabled = True


class ScanCreateRequest(BaseModel):
    target: str = Field(..., description="Target domain or IP address")
    mode: str = Field("semi_autonomous", description="semi_autonomous or manual")
    tools: Optional[Dict[str, List[str]]] = Field(None, description="Tool selections per category")


class ScanResponse(BaseModel):
    id: str
    target: str
    mode: str
    status: str
    current_agent: Optional[str] = None
    progress: int = 0
    error_message: Optional[str] = None
    report_path: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    message: str = ""


class LLMQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language query about which tool to use")
    target: Optional[str] = Field(None, description="Optional target context")


@router.post("/create", response_model=ScanResponse)
async def create_scan(request: ScanCreateRequest):
    if not request.target or len(request.target.strip()) < 3:
        raise HTTPException(status_code=400, detail="Valid target is required")
    valid_modes = ["semi_autonomous", "manual"]
    if request.mode not in valid_modes:
        raise HTTPException(status_code=400, detail=f"Mode must be one of: {valid_modes}")
    scan = await scan_service.create_scan(request.target, request.mode)
    return ScanResponse(
        id=str(scan.id),
        target=scan.target,
        mode=scan.mode.value if scan.mode else "semi_autonomous",
        status=scan.status.value if scan.status else "pending",
        progress=scan.progress or 0,
        created_at=scan.created_at.isoformat() if scan.created_at else None,
        message="Scan created"
    )


@router.post("/{scan_id}/start")
async def start_scan(scan_id: str):
    scan = await scan_service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status not in [ScanStatus.PENDING, ScanStatus.FAILED]:
        raise HTTPException(status_code=400, detail=f"Scan already in state: {scan.status.value}")
    await scan_service.mark_running(scan_id)
    return {"message": "Scan started — use BugHunter skills or manual terminal to execute commands", "scan_id": scan_id}


@router.get("/{scan_id}/status")
async def get_scan_status(scan_id: str):
    return await scan_service.get_scan_progress(scan_id)


@router.get("/{scan_id}/results")
async def get_scan_results(scan_id: str):
    progress = await scan_service.get_scan_progress(scan_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Scan not found")
    return progress


@router.get("/list")
async def list_scans(limit: int = Query(20, le=100), offset: int = Query(0, ge=0)):
    scans = await scan_service.list_scans(limit, offset)
    return [ScanResponse(
        id=str(s.id), target=s.target,
        mode=s.mode.value if s.mode else "semi_autonomous",
        status=s.status.value if s.status else "pending",
        current_agent=s.current_agent,
        progress=s.progress or 0,
        error_message=s.error_message,
        report_path=f"/reports/{s.report_path}" if s.report_path else None,
        created_at=s.created_at.isoformat() if s.created_at else None,
        completed_at=s.completed_at.isoformat() if s.completed_at else None
    ) for s in scans]


@router.post("/{scan_id}/cancel")
async def cancel_scan(scan_id: str):
    scan = await scan_service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    await scan_service.cancel_scan(scan_id)
    return {"message": "Scan cancelled"}


@router.delete("/{scan_id}")
async def delete_scan(scan_id: str):
    scan = await scan_service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    await scan_service.delete_scan(scan_id)
    return {"message": f"Scan {scan_id} deleted"}


@router.post("/{scan_id}/pause")
async def pause_scan(scan_id: str):
    scan = await scan_service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status not in [ScanStatus.RECON_RUNNING, ScanStatus.SCANNER_RUNNING,
                            ScanStatus.VULN_RUNNING, ScanStatus.CLOUD_RUNNING, ScanStatus.REPORT_RUNNING, ScanStatus.PENDING]:
        raise HTTPException(status_code=400, detail=f"Cannot pause scan in state: {scan.status.value}")
    await scan_service.pause_scan(scan_id)
    return {"message": "Scan paused"}


@router.post("/{scan_id}/resume")
async def resume_scan(scan_id: str):
    scan = await scan_service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status != ScanStatus.PAUSED:
        raise HTTPException(status_code=400, detail=f"Can only resume paused scans, current state: {scan.status.value}")
    await scan_service.mark_running(scan_id)
    return {"message": "Scan resumed — use BugHunter skills or manual terminal to continue"}


# ─── LLM SEARCH BOX ───
@router.post("/llm-query")
async def llm_query(request: LLMQueryRequest):
    query = request.query.lower()
    target = request.target or "example.com"
    all_tools = tool_manager.list_tools()
    tool_names = [t["name"].lower() for t in all_tools]

    matched_tools = []
    for t in all_tools:
        if t["name"].lower() in query or any(word in t["name"].lower() for word in query.split()):
            matched_tools.append(t)

    if not matched_tools:
        for t in all_tools:
            desc = t.get("description", "").lower()
            if any(word in desc for word in query.split() if len(word) > 3):
                matched_tools.append(t)

    suggestions = []
    for t in matched_tools[:5]:
        tool_def = tool_manager.get_tool(t["name"])
        if tool_def:
            prompts = tool_def.get_prompts()
            if prompts:
                for p in prompts[:2]:
                    cmd = p.get("command", "").replace("{target}", target).replace("{SECLISTS}", SECLISTS_DIR)
                    suggestions.append({
                        "tool": t["name"],
                        "command": cmd,
                        "intent": p.get("intent", "basic"),
                        "description": p.get("description", ""),
                        "prompt": p.get("prompt", "")
                    })
            else:
                suggestions.append({"tool": t["name"], "command": "", "intent": "basic", "description": t.get("description", "")})

    if not suggestions:
        suggestions = [{"tool": "nmap", "command": f"nmap -sV -sC -T4 {target}", "intent": "basic_scan",
                        "description": "Default SYN scan with version detection", "prompt": f"Scan {target}"}]

    return {"query": query, "suggestions": suggestions, "matched_tools": [t["name"] for t in matched_tools]}


# ─── API TOGGLE ───
@router.get("/api-toggle")
async def get_api_toggle():
    global api_enabled
    return {"enabled": api_enabled}


@router.post("/api-toggle")
async def set_api_toggle(body: dict):
    global api_enabled
    api_enabled = body.get("enabled", True)
    return {"enabled": api_enabled}


# ─── TOOLS ───
@router.get("/tools")
async def list_tools(category: Optional[str] = None):
    if category:
        tools = tool_manager.get_tools_by_category(category)
        return [{"name": t.name, "description": t.description[:120], "category": t.category} for t in tools]
    return tool_manager.list_tools()


@router.get("/tools/{tool_name}")
async def get_tool_detail(tool_name: str):
    tool = tool_manager.get_tool(tool_name)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return tool.raw


# ─── SYSTEM STATUS (Shield page) ───
@router.get("/system/status")
async def system_status():
    import subprocess, shutil
    tools_check = {}
    tool_binaries = {
        "nmap": "nmap", "masscan": "masscan", "whatweb": "whatweb",
        "nikto": "nikto", "nuclei": "nuclei", "sqlmap": "sqlmap",
        "subfinder": "subfinder", "gau": "gau",
        "waybackurls": "waybackurls", "gobuster": "gobuster",
        "dirsearch": "dirsearch", "feroxbuster": "feroxbuster",
        "whois": "whois", "dig": "dig", "host": "host",
        "paramspider": "paramspider", "dalfox": "dalfox",
        "xsstrike": "xsstrike", "linkfinder": "linkfinder",
        "secretfinder": "secretfinder", "theharvester": "theHarvester",
    }
    for name, binary in tool_binaries.items():
        path = shutil.which(binary)
        tools_check[name] = {"installed": path is not None, "path": path or "not found"}

    active = len(scan_service.active_scans)
    recent_errors = []
    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(Scan).where(Scan.status == ScanStatus.FAILED)
                .order_by(Scan.updated_at.desc()).limit(10)
            )
            for s in result.scalars().all():
                if s.error_message:
                    recent_errors.append({
                        "scan_id": str(s.id), "target": s.target,
                        "error": s.error_message, "at": s.updated_at.isoformat() if s.updated_at else None
                    })
    except Exception:
        pass

    return {
        "tools": tools_check,
        "tools_total": len(tools_check),
        "tools_installed": sum(1 for t in tools_check.values() if t["installed"]),
        "active_scans": active,
        "recent_errors": recent_errors,
    }


# ─── TOOL UPDATE CHECK ───
@router.get("/tools/{tool_name}/check-update")
async def check_tool_update(tool_name: str):
    import subprocess, shutil
    path = shutil.which(tool_name)
    if not path:
        return {"tool": tool_name, "installed": False, "path": None, "update_available": False, "current_version": None}

    version = None
    update_available = False
    try:
        result = subprocess.run([tool_name, "--version"], capture_output=True, text=True, timeout=10)
        output = (result.stdout + result.stderr).strip()
        version = output.split("\n")[0][:100]
    except Exception:
        pass

    return {
        "tool": tool_name, "installed": True, "path": path,
        "update_available": update_available, "current_version": version,
    }


@router.post("/tools/update-all")
async def update_all_tools():
    import subprocess
    results = []
    cmds = [
        ("nuclei", "go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest"),
        ("subfinder", "go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest"),
        ("httpx", "go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest"),
    ]
    for name, cmd in cmds:
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
            results.append({"tool": name, "success": r.returncode == 0, "output": r.stdout[-200:] if r.stdout else r.stderr[-200:]})
        except Exception as e:
            results.append({"tool": name, "success": False, "output": str(e)[:200]})
    return {"results": results}


# ─── BACKGROUND ACTIVITY ───
@router.get("/activity")
async def background_activity():
    active = []
    for scan_id, task in scan_service.active_scans.items():
        active.append({
            "scan_id": scan_id,
            "running": not task.done(),
            "cancelled": task.cancelled(),
        })
    return {"active_scans": active, "total_active": len(active)}


# ─── ERROR RESOLUTION ───
@router.get("/errors")
async def get_errors():
    errors = []
    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(Scan).where(Scan.status == ScanStatus.FAILED)
                .order_by(Scan.updated_at.desc()).limit(50)
            )
            for s in result.scalars().all():
                errors.append({
                    "scan_id": str(s.id), "target": s.target,
                    "error": s.error_message, "status": s.status.value,
                    "at": s.updated_at.isoformat() if s.updated_at else None,
                })
    except Exception:
        pass
    return {"errors": errors, "total": len(errors)}


@router.post("/errors/{scan_id}/retry")
async def retry_error(scan_id: str):
    scan = await scan_service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status != ScanStatus.FAILED:
        raise HTTPException(status_code=400, detail="Can only retry failed scans")
    await scan_service.mark_running(scan_id)
    return {"message": "Scan marked as running — use BugHunter skills or manual terminal", "scan_id": scan_id}


@router.delete("/errors/{scan_id}")
async def dismiss_error(scan_id: str):
    scan = await scan_service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    async with async_session_maker() as session:
        scan_db = await session.get(Scan, uuid.UUID(scan_id))
        if scan_db:
            scan_db.error_message = None
            scan_db.status = ScanStatus.COMPLETED
            await session.commit()
    return {"message": "Error dismissed"}


# ─── CLOUD ANALYSIS ───
@router.post("/{scan_id}/cloud-analyze")
async def cloud_analyze(scan_id: str):
    if not settings.CLOUD_SERVICE_URL:
        raise HTTPException(status_code=400, detail="Cloud service not configured — set CLOUD_SERVICE_URL")
    scan = await scan_service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    payload = {
        "scan_id": scan_id,
        "target": scan.target,
        "mode": scan.mode.value if scan.mode else "semi_autonomous",
        "recon_results": scan.recon_results,
        "scanner_results": scan.scanner_results,
        "vuln_results": scan.vuln_results,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{settings.CLOUD_SERVICE_URL}/cloud/analyze", json=payload)
        resp.raise_for_status()
        result = resp.json()
    await scan_service.mark_cloud_running(scan_id)
    return result


@router.post("/{scan_id}/cloud-callback")
async def cloud_callback(scan_id: str, body: dict):
    cloud_status = body.get("cloud_status", "failed")
    cloud_results = body.get("cloud_results")
    if cloud_status == "completed" and cloud_results:
        await scan_service.mark_cloud_completed(scan_id, cloud_results)
    else:
        error = body.get("error", "Cloud analysis completed with errors")
        await scan_service.mark_failed(scan_id, error)
    return {"message": "Callback received"}


@router.get("/cloud/status/{analysis_id}")
async def cloud_analysis_status(analysis_id: str):
    if not settings.CLOUD_SERVICE_URL:
        raise HTTPException(status_code=400, detail="Cloud service not configured")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{settings.CLOUD_SERVICE_URL}/cloud/status/{analysis_id}")
        resp.raise_for_status()
        return resp.json()


@router.post("/{scan_id}/cloud-execute")
async def cloud_execute(scan_id: str, body: dict):
    if not settings.CLOUD_SERVICE_URL:
        raise HTTPException(status_code=400, detail="Cloud service not configured")
    scan = await scan_service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    action = body.get("action", "deep_scan")
    payload = {
        "scan_id": scan_id,
        "target": scan.target,
        "action": action,
        "parameters": body.get("parameters", {}),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{settings.CLOUD_SERVICE_URL}/cloud/execute", json=payload)
        resp.raise_for_status()
        return resp.json()


@router.websocket("/ws/{scan_id}")
async def websocket_endpoint(websocket: WebSocket, scan_id: str):
    await ws_manager.connect(scan_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type", "")
            if msg_type == "cancel":
                await scan_service.cancel_scan(scan_id)
    except WebSocketDisconnect:
        ws_manager.disconnect(scan_id, websocket)
    except Exception:
        ws_manager.disconnect(scan_id, websocket)
