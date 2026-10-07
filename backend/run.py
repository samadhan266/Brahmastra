#!/usr/bin/env python3
"""Brahmastra - Autonomous AI Pentest System Launcher"""
import uvicorn
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    port = int(os.getenv("BACKEND_PORT", "8000"))
    host = os.getenv("BACKEND_HOST", "0.0.0.0")

    print("=" * 60)
    print("  BRAHMASTRA - Autonomous AI Pentest System")
    print("  Starting backend server...")
    print("=" * 60)
    print(f"  API:     http://localhost:{port}/api")
    print(f"  Health:  http://localhost:{port}/api/health")
    print(f"  Docs:    http://localhost:{port}/docs")
    print("=" * 60)

    reload_enabled = os.getenv("UVICORN_RELOAD", "false").lower() in ("true", "1", "yes")
    log_level = os.getenv("LOG_LEVEL", "info")

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload_enabled,
        log_level=log_level
    )