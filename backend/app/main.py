from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text
from app.api.v1.endpoints import scans, bughunter
from app.core.config import settings, SECLISTS_DIR
from app.core.database import init_db, engine
from app.utils.tool_manager import tool_manager
from contextlib import asynccontextmanager
import logging
import os

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "info").upper()),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("brahmastra")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    os.makedirs(os.path.join(os.path.dirname(__file__), "..", "reports"), exist_ok=True)
    os.makedirs(os.path.join(os.path.dirname(__file__), "..", "..", "jsons"), exist_ok=True)
    _ = tool_manager
    yield


app = FastAPI(
    title="Brahmastra - AI Pentest Platform",
    description="BugHunter skill-driven penetration testing with manual terminal",
    version="1.0.0",
    lifespan=lifespan
)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", settings.FRONTEND_URL)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scans.router, prefix="/api/v1")
app.include_router(bughunter.router, prefix="/api/v1")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"Validation error on {request.url}: {exc.errors()}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

reports_dir = os.path.join(os.path.dirname(__file__), "..", "reports")
if os.path.exists(reports_dir):
    app.mount("/reports", StaticFiles(directory=reports_dir), name="reports")


@app.get("/api/health")
async def health_check():
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception as e:
        logger.warning(f"Health check DB error: {e}")

    return {
        "status": "healthy" if db_ok else "degraded",
        "service": "Brahmastra",
        "version": "1.0.0",
        "database": "connected" if db_ok else "unreachable",
        "tools_loaded": len(tool_manager.tools),
        "seclists_available": os.path.exists(SECLISTS_DIR)
    }


@app.get("/api/info")
async def system_info():
    tools = tool_manager.list_tools()
    tools_by_cat = {}
    for t in tools:
        cat = t.get("category", "Other")
        if cat not in tools_by_cat:
            tools_by_cat[cat] = []
        tools_by_cat[cat].append(t["name"])

    return {
        "name": "Brahmastra",
        "description": "AI-Powered Pentest Platform with BugHunter Skills",
        "categories": {
            "recon": "Information gathering — Amass, Subfinder, GAU, Findomain, theHarvester, etc.",
            "scanning": "Port & service scanning — Nmap, RustScan, Masscan, WhatWeb, Wappalyzer",
            "discovery": "Directory & URL discovery — Gobuster, Dirsearch, Feroxbuster, FFUF, Nikto",
            "vulnerability": "Vulnerability assessment — Nuclei, SQLMap, Dalfox, XSStrike, WPScan",
            "exploitation": "Exploitation tools — ZAP, custom payloads",
            "osint": "OSINT & intelligence — whois, dig, theHarvester, cloud_enum"
        },
        "modes": {
            "semi_autonomous": "Select BugHunter skills and let AI execute the techniques",
            "manual": "Type commands directly in the terminal"
        },
        "tools_loaded": len(tools),
        "tools_by_category": tools_by_cat
    }


if __name__ == "__main__":
    import uvicorn
    reload_enabled = os.getenv("UVICORN_RELOAD", "false").lower() in ("true", "1", "yes")
    uvicorn.run("app.main:app", host=settings.BACKEND_HOST, port=settings.BACKEND_PORT, reload=reload_enabled)