import uuid
import json
import os
import httpx
from typing import Optional, Dict, Any, List
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager

app = FastAPI(title="Brahmastra Cloud Analysis Service", version="1.0.0")

CLOUD_STORE: Dict[str, Dict[str, Any]] = {}

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-5")
MAX_TOKENS = int(os.getenv("CLOUD_MAX_TOKENS", "4096"))
BACKEND_CALLBACK_URL = os.getenv("BACKEND_CALLBACK_URL", "")


class ScanData(BaseModel):
    scan_id: str
    target: str
    mode: str = "semi_autonomous"
    recon_results: Optional[Dict[str, Any]] = None
    scanner_results: Optional[Dict[str, Any]] = None
    vuln_results: Optional[Dict[str, Any]] = None


class AnalyzeResponse(BaseModel):
    scan_id: str
    analysis_id: str
    status: str
    message: str


class ExecuteRequest(BaseModel):
    scan_id: str
    target: str
    action: str = Field(..., description="Action to execute: deep_scan, validate_vuln, exploit_test, gather_evidence")
    parameters: Optional[Dict[str, Any]] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=120.0)
    yield
    await app.state.http_client.aclose()


app = FastAPI(title="Brahmastra Cloud Analysis Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "service": "cloud-analysis",
        "status": "healthy",
        "model": OPENROUTER_MODEL,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/cloud/analyze", response_model=AnalyzeResponse)
async def analyze_scan(data: ScanData, background_tasks: BackgroundTasks):
    analysis_id = str(uuid.uuid4())
    CLOUD_STORE[analysis_id] = {
        "scan_id": data.scan_id,
        "status": "queued",
        "target": data.target,
        "results": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None
    }

    background_tasks.add_task(run_analysis, data, analysis_id)

    return AnalyzeResponse(
        scan_id=data.scan_id,
        analysis_id=analysis_id,
        status="queued",
        message="Cloud analysis queued — results will be available via /cloud/status/{analysis_id}"
    )


async def run_analysis(data: ScanData, analysis_id: str):
    client = app.state.http_client
    CLOUD_STORE[analysis_id]["status"] = "running"

    if not OPENROUTER_API_KEY:
        CLOUD_STORE[analysis_id]["status"] = "failed"
        CLOUD_STORE[analysis_id]["error"] = "OPENROUTER_API_KEY not configured"
        await notify_backend(data.scan_id, "failed", error="OPENROUTER_API_KEY not configured")
        return

    prompt = build_analysis_prompt(data)
    system_prompt = (
        "You are Brahmastra Cloud Analysis Engine, an expert security AI that analyzes scan results, "
        "identifies vulnerabilities, prioritizes findings, and recommends exploitation or remediation steps. "
        "Output valid JSON with keys: summary, critical_findings, recommendations, next_actions."
    )

    try:
        response = await client.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": MAX_TOKENS,
                "temperature": 0.3
            }
        )
        response.raise_for_status()
        result = response.json()
        content = result["choices"][0]["message"]["content"]

        parsed = parse_llm_json(content)

        CLOUD_STORE[analysis_id]["status"] = "completed"
        CLOUD_STORE[analysis_id]["results"] = parsed
        CLOUD_STORE[analysis_id]["completed_at"] = datetime.utcnow().isoformat()

        await notify_backend(data.scan_id, "completed", results=parsed)

    except httpx.TimeoutException:
        CLOUD_STORE[analysis_id]["status"] = "failed"
        CLOUD_STORE[analysis_id]["error"] = "LLM request timed out"
        await notify_backend(data.scan_id, "failed", error="Cloud analysis timed out")
    except Exception as e:
        CLOUD_STORE[analysis_id]["status"] = "failed"
        CLOUD_STORE[analysis_id]["error"] = str(e)[:500]
        await notify_backend(data.scan_id, "failed", error=str(e)[:500])


def build_analysis_prompt(data: ScanData) -> str:
    sections = [f"Target: {data.target}", f"Mode: {data.mode}", ""]

    if data.recon_results:
        sections.append("=== RECONNAISSANCE RESULTS ===")
        sections.append(json.dumps(data.recon_results, indent=2, default=str)[:4000])

    if data.scanner_results:
        sections.append("=== VULNERABILITY SCANNER RESULTS ===")
        sections.append(json.dumps(data.scanner_results, indent=2, default=str)[:4000])

    if data.vuln_results:
        sections.append("=== CUSTOM VULNERABILITY RESULTS ===")
        sections.append(json.dumps(data.vuln_results, indent=2, default=str)[:4000])

    sections.append("")
    sections.append(
        "Analyze the above scan results. Provide:\n"
        "1. Summary: brief overview of findings\n"
        "2. Critical findings: list of confirmed vulnerabilities with severity\n"
        "3. Recommendations: actionable next steps\n"
        "4. Next actions: specific tools or commands to run for further validation\n"
        "Output as valid JSON."
    )

    return "\n".join(sections)


def parse_llm_json(content: str) -> Dict[str, Any]:
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw_analysis": content}


async def notify_backend(scan_id: str, status: str, results: Optional[Dict] = None, error: Optional[str] = None):
    if not BACKEND_CALLBACK_URL:
        return
    client = app.state.http_client
    payload = {"scan_id": scan_id, "cloud_status": status}
    if results:
        payload["cloud_results"] = results
    if error:
        payload["error"] = error
    try:
        await client.post(f"{BACKEND_CALLBACK_URL}/scans/{scan_id}/cloud-callback", json=payload, timeout=10.0)
    except Exception:
        pass


@app.get("/cloud/status/{analysis_id}")
async def get_analysis_status(analysis_id: str):
    entry = CLOUD_STORE.get(analysis_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return entry


@app.get("/cloud/scan/{scan_id}/status")
async def get_scan_cloud_status(scan_id: str):
    for analysis_id, entry in CLOUD_STORE.items():
        if entry["scan_id"] == scan_id:
            return {"analysis_id": analysis_id, **entry}
    raise HTTPException(status_code=404, detail="No cloud analysis found for this scan")


@app.post("/cloud/execute")
async def execute_cloud_action(req: ExecuteRequest):
    action = req.action
    target = req.target
    params = req.parameters or {}

    if action == "deep_scan":
        return {
            "scan_id": req.scan_id,
            "action": "deep_scan",
            "status": "queued",
            "commands": [
                f"nuclei -u {target} -severity critical,high -o nuclei_deep_{req.scan_id[:8]}.txt",
                f"nmap -sV -sC -p- -T4 {target} -oN full_port_scan_{req.scan_id[:8]}.txt"
            ]
        }
    elif action == "validate_vuln":
        vuln_type = params.get("vuln_type", "sqli")
        return {
            "scan_id": req.scan_id,
            "action": "validate_vuln",
            "status": "queued",
            "commands": [
                f"sqlmap -u {params.get('url', target)} --batch --level 3 --risk 2"
            ]
        }
    elif action == "exploit_test":
        return {
            "scan_id": req.scan_id,
            "action": "exploit_test",
            "status": "queued",
            "warning": "Automated exploitation not available in cloud mode. Use BugHunter terminal."
        }
    elif action == "gather_evidence":
        return {
            "scan_id": req.scan_id,
            "action": "gather_evidence",
            "status": "queued",
            "commands": [
                f"whatweb -v {target}",
                f"dig any {target}",
                f"whois {target}"
            ]
        }
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
