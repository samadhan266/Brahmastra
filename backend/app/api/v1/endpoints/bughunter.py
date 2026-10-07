from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.utils.tool_executor import tool_executor
from app.utils.ws_manager import ws_manager
from app.utils.tool_manager import tool_manager, SECLISTS_DIR
from app.services.llm_service import chat_stream, VAANI_SYSTEM_PROMPT, CORE_SYSTEM_PROMPT
from app.services.technique_report import technique_report, extract_findings
from app.services.findings_memory import findings_memory
from app.core.config import settings
import uuid
import asyncio
import json
import os

router = APIRouter(prefix="/bughunter", tags=["bughunter"])

active_executions: Dict[str, asyncio.Task] = {}


class SkillExecuteRequest(BaseModel):
    skill_id: str = Field(..., description="BugHunter skill identifier")
    skill_name: str = Field(..., description="Display name of the skill")
    target: str = Field(..., description="Target domain or IP")
    commands: List[str] = Field(..., description="Shell commands to execute sequentially")
    tools: List[str] = Field(default_factory=list, description="Tool names used by this skill")
    timeout: int = Field(default=300, description="Per-command timeout in seconds")


class SkillExecuteResponse(BaseModel):
    exec_id: str
    status: str
    message: str


@router.post("/execute", response_model=SkillExecuteResponse)
async def execute_skill(request: SkillExecuteRequest):
    if not request.target or len(request.target.strip()) < 2:
        raise HTTPException(status_code=400, detail="Valid target is required")
    if not request.commands:
        raise HTTPException(status_code=400, detail="At least one command is required")

    exec_id = str(uuid.uuid4())
    results: List[Dict[str, Any]] = []

    async def finalize(status: str):
        ok = sum(1 for r in results if r.get("returncode") == 0)
        await ws_manager.send_terminal_line(exec_id, "")
        if status == "completed":
            await ws_manager.send_terminal_line(exec_id,
                f"[BRAHMASTRA] ✓ Skill '{request.skill_name}' completed — "
                f"{ok}/{len(results)} commands succeeded")
        else:
            await ws_manager.send_terminal_line(exec_id,
                f"[!] Execution stopped — partial results preserved "
                f"({ok}/{len(results)} commands succeeded)")

        summary = None
        try:
            summary = await technique_report.generate(
                exec_id=exec_id,
                skill_name=request.skill_name,
                target=request.target,
                results=results,
                status=status,
            )
        except Exception:
            summary = None

        paths: Dict[str, str] = {}
        findings: List[Dict[str, Any]] = []
        severity_counts: Dict[str, int] = {}
        if summary:
            paths = summary.get("paths", {})
            findings = summary.get("findings", [])
            severity_counts = summary.get("severity_counts", {})
            await ws_manager.send_terminal_line(exec_id,
                f"[BRAHMASTRA] Technique report ({status}): "
                f"{summary['finding_count']} finding(s) — "
                f"{', '.join(os.path.basename(p) for p in paths.values())}")
        elif results:
            findings = extract_findings(results)
            for f in findings:
                s = str(f.get("severity", "INFO"))
                severity_counts[s] = severity_counts.get(s, 0) + 1
            await ws_manager.send_terminal_line(exec_id,
                "[BRAHMASTRA] Technique report generation skipped")

        try:
            findings_memory.record(
                target=request.target,
                skill_name=request.skill_name,
                exec_id=exec_id,
                status=status,
                findings=findings,
                paths=paths,
                severity_counts=severity_counts,
                commands_ok=ok,
                commands_total=len(results),
            )
        except Exception:
            pass

        await ws_manager.send_scan_update(
            exec_id, status, 100,
            f"Skill '{request.skill_name}' {status}")

    async def run_commands():
        run_id = f"bh-{exec_id[:8]}"

        await ws_manager.send_terminal_line(exec_id,
            f"[BRAHMASTRA] Skill: {request.skill_name}")
        await ws_manager.send_terminal_line(exec_id,
            f"[BRAHMASTRA] Target: {request.target}")
        await ws_manager.send_terminal_line(exec_id,
            f"[BRAHMASTRA] Tools: {', '.join(request.tools)}")
        await ws_manager.send_terminal_line(exec_id,
            f"[BRAHMASTRA] Commands: {len(request.commands)} queued")
        await ws_manager.send_terminal_line(exec_id, "")

        try:
            for i, raw_cmd in enumerate(request.commands):
                domain = request.target.replace("https://", "").replace("http://", "").split("/")[0].split("?")[0]
                command = raw_cmd.replace("{target}", domain).replace("{SECLISTS}", SECLISTS_DIR)
                await ws_manager.send_terminal_line(exec_id, f"$ {command}", "command")
                await ws_manager.send_terminal_line(exec_id, "")

                try:
                    result = await tool_executor.execute(
                        run_id=f"{run_id}-cmd{i}",
                        command=command,
                        output_callback=lambda rid, line, _eid=exec_id:
                            asyncio.create_task(
                                ws_manager.send_terminal_line(_eid, line, "stdout")
                            ) or None,
                        timeout=request.timeout,
                    )
                    results.append({
                        "command": command,
                        "returncode": result["returncode"],
                        "stdout": result["stdout"][:5000],
                        "stderr": result["stderr"][:2000],
                    })

                    await ws_manager.send_terminal_line(exec_id, "")
                    if result["returncode"] == 0:
                        await ws_manager.send_terminal_line(exec_id,
                            f"[✓] Command {i+1}/{len(request.commands)} "
                            f"(exit {result['returncode']})")
                    else:
                        await ws_manager.send_terminal_line(exec_id,
                            f"[SKIP] Command {i+1}/{len(request.commands)} skipped")

                except Exception as e:
                    results.append({
                        "command": command,
                        "returncode": -1,
                        "stdout": "",
                        "stderr": str(e)[:500],
                    })
                    await ws_manager.send_terminal_line(exec_id,
                        f"[SKIP] Command {i+1}/{len(request.commands)} skipped")

                if i < len(request.commands) - 1:
                    await ws_manager.send_terminal_line(exec_id, "")

        except asyncio.CancelledError:
            fin = asyncio.create_task(finalize("cancelled"))
            try:
                await asyncio.shield(fin)
            except asyncio.CancelledError:
                pass
            raise

        await finalize("completed")
        return results

    task = asyncio.create_task(run_commands())
    active_executions[exec_id] = task

    task.add_done_callback(lambda t: active_executions.pop(exec_id, None))

    return SkillExecuteResponse(
        exec_id=exec_id,
        status="started",
        message=f"Executing {len(request.commands)} command(s) for '{request.skill_name}'"
    )


@router.post("/{exec_id}/cancel")
async def cancel_skill_execution(exec_id: str):
    if exec_id in active_executions:
        active_executions[exec_id].cancel()
        del active_executions[exec_id]
        await ws_manager.send_terminal_line(exec_id,
            "[!] Execution cancelled by user", "stderr")
        return {"message": "Execution cancelled", "exec_id": exec_id}
    raise HTTPException(status_code=404, detail="Execution not found or already completed")


@router.get("/reports")
async def list_technique_reports():
    return {"reports": technique_report.list_reports()}


@router.get("/history")
async def bughunter_history():
    return {
        "targets": findings_memory.list_targets(),
        "entries": findings_memory.all_entries(),
    }


@router.get("/report/{exec_id}/{fmt}")
async def download_technique_report(exec_id: str, fmt: str):
    if fmt not in ("md", "html", "pdf"):
        raise HTTPException(status_code=400, detail="Format must be md, html or pdf")
    path = technique_report.get_path(exec_id, fmt)
    if not path:
        raise HTTPException(status_code=404, detail="Report not found")
    media = {"md": "text/markdown", "html": "text/html", "pdf": "application/pdf"}[fmt]
    return FileResponse(path, media_type=media,
                        filename=os.path.basename(path))


@router.websocket("/ws/{exec_id}")
async def bugHunter_websocket(websocket: WebSocket, exec_id: str):
    await ws_manager.connect(exec_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "cancel":
                if exec_id in active_executions:
                    active_executions[exec_id].cancel()
                    del active_executions[exec_id]
                    await ws_manager.send_terminal_line(exec_id,
                        "[!] Execution cancelled by user", "stderr")
    except WebSocketDisconnect:
        ws_manager.disconnect(exec_id, websocket)
    except Exception:
        ws_manager.disconnect(exec_id, websocket)


# ─── MANUAL TERMINAL WEBSOCKET ───
# Frontend connects with a session_id. Sends {"type":"command","command":"..."} to execute.
# Streams output back as {"type":"terminal","data":"..."} messages.
active_terminal_commands: Dict[str, asyncio.Task] = {}


@router.websocket("/ws/terminal/{session_id}")
async def manual_terminal_ws(websocket: WebSocket, session_id: str):
    await ws_manager.connect(session_id, websocket)
    try:
        await ws_manager.send_terminal_line(session_id,
            f"[BRAHMASTRA] Manual terminal session: {session_id[:8]}")
        await ws_manager.send_terminal_line(session_id,
            "[BRAHMASTRA] Type commands to execute on the target system")
        await ws_manager.send_terminal_line(session_id, "")

        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type", "")

            if msg_type == "command":
                command = msg.get("command", "").strip()
                if not command:
                    await ws_manager.send_terminal_line(session_id, "")
                    continue

                run_id = f"term-{session_id[:8]}"

                await ws_manager.send_terminal_line(session_id, f"$ {command}", "command")

                async def run_cmd(cmd, rid, sid):
                    try:
                        result = await tool_executor.execute(
                            run_id=rid,
                            command=cmd,
                            output_callback=lambda _rid, line, _sid=sid:
                                asyncio.create_task(
                                    ws_manager.send_terminal_line(_sid, line, "stdout")
                                ) or None,
                            timeout=300,
                        )
                        exit_status = "✓" if result["returncode"] == 0 else "SKIP"
                        await ws_manager.send_terminal_line(sid, "")
                        if result["returncode"] == 0:
                            await ws_manager.send_terminal_line(sid,
                                f"[✓] exit {result['returncode']}")
                        else:
                            await ws_manager.send_terminal_line(sid,
                                "[SKIP] Command skipped")
                        await ws_manager.send_terminal_line(sid, "")
                    except asyncio.CancelledError:
                        await ws_manager.send_terminal_line(sid,
                            "[!] Command cancelled", "stderr")
                    except Exception:
                        await ws_manager.send_terminal_line(sid,
                            "[SKIP] Command skipped")
                        await ws_manager.send_terminal_line(sid, "")
                    finally:
                        active_terminal_commands.pop(sid, None)

                task = asyncio.create_task(run_cmd(command, run_id, session_id))
                active_terminal_commands[session_id] = task

            elif msg_type == "cancel":
                task = active_terminal_commands.pop(session_id, None)
                if task and not task.done():
                    task.cancel()
                    await ws_manager.send_terminal_line(session_id,
                        "[!] Command cancelled by user", "stderr")

            elif msg_type == "llm_chat":
                user_message = msg.get("message", "").strip()
                if not user_message:
                    continue

                chat_history = msg.get("history", [])
                if (chat_history
                        and chat_history[-1].get("role") == "user"
                        and chat_history[-1].get("content") == user_message):
                    chat_history = findings_memory.inject_context(chat_history)
                else:
                    chat_history = findings_memory.inject_context(
                        chat_history, user_message)
                theme = msg.get("theme", "vaani")
                system_prompt = VAANI_SYSTEM_PROMPT if theme == "vaani" else CORE_SYSTEM_PROMPT

                await ws_manager.send_terminal_line(session_id,
                    f"[AI] {user_message}", "command")
                await ws_manager.send_terminal_line(session_id, "", "stdout")

                buffer = ""

                async def push_token(token: str):
                    nonlocal buffer
                    buffer += token
                    if "\n" in token or len(buffer) > 100:
                        await ws_manager.send_terminal_line(session_id, buffer, "stdout")
                        buffer = ""

                async def run_llm():
                    nonlocal buffer
                    try:
                        await chat_stream(chat_history, push_token, system_prompt=system_prompt)
                        if buffer:
                            await ws_manager.send_terminal_line(session_id, buffer, "stdout")
                    except Exception as e:
                        await ws_manager.send_terminal_line(session_id,
                            f"[ERROR] {str(e)[:300]}", "stderr")
                    finally:
                        await ws_manager.send_terminal_line(session_id, "", "stdout")
                        active_terminal_commands.pop(session_id, None)

                task = asyncio.create_task(run_llm())
                active_terminal_commands[session_id] = task

    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, websocket)
        task = active_terminal_commands.pop(session_id, None)
        if task and not task.done():
            task.cancel()
    except Exception:
        ws_manager.disconnect(session_id, websocket)
        task = active_terminal_commands.pop(session_id, None)
        if task and not task.done():
            task.cancel()


# ─── DEDICATED LLM CHAT (SSE) ───
# Used by the LLM Chat section in the frontend (non-terminal, standalone).
@router.post("/llm/chat")
async def llm_chat_endpoint(request: Request):
    body = await request.json()
    user_message = (body.get("message") or "").strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")

    history: list = body.get("history", [])
    theme: str = body.get("theme", "vaani")

    system_prompt = VAANI_SYSTEM_PROMPT if theme == "vaani" else CORE_SYSTEM_PROMPT

    async def event_stream():
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        buffer = ""

        async def push_token(token: str):
            await queue.put(token)

        async def run_llm():
            try:
                is_vaani = theme == "vaani"
                await chat_stream(
                    messages=findings_memory.inject_context(history, user_message),
                    on_token=push_token,
                    system_prompt=system_prompt,
                    model=settings.VAANI_MODEL if is_vaani else None,
                    api_key=settings.VAANI_API_KEY if is_vaani else None,
                )
            except Exception as e:
                await queue.put(f"\n[ERROR] {str(e)[:300]}")
            finally:
                await queue.put(None)

        llm_task = asyncio.create_task(run_llm())

        while True:
            token = await queue.get()
            if token is None:
                break
            buffer += token
            if "\n" in token or len(buffer) > 60 or token is None:
                yield f"data: {json.dumps({'content': buffer, 'done': False})}\n\n"
                buffer = ""

        if buffer:
            yield f"data: {json.dumps({'content': buffer, 'done': False})}\n\n"

        yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
        llm_task.cancel()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
