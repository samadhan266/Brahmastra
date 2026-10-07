import asyncio
import json
import shlex
import shutil
from typing import AsyncGenerator, Dict

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Brahmastra Tools Service", version="1.0.0")

running_processes: Dict[str, asyncio.subprocess.Process] = {}
cancel_events: Dict[str, asyncio.Event] = {}


class ExecuteRequest(BaseModel):
    run_id: str
    command: str
    timeout: int = 300
    env: Dict[str, str] = {}


class HealthResponse(BaseModel):
    status: str
    tools_count: int
    tools: list


def _detect_tools() -> list:
    known = [
        "nmap", "masscan", "nikto", "whatweb", "wpscan", "subfinder",
        "assetfinder", "waybackurls", "gau", "chaos",
        "findomain", "httpx", "httprobe", "gobuster", "ffuf",
        "feroxbuster", "nuclei", "dalfox", "dirsearch", "xsstrike",
        "theHarvester", "paramspider", "jwt-tool", "urless", "sqlmap",
        "sslscan", "whois", "dig", "nslookup", "curl", "wget",
        "dnsrecon", "linkfinder.py", "SecretFinder.py",
    ]
    available = []
    for t in sorted(known):
        path = shutil.which(t)
        if path:
            available.append(t)
    return available


@app.on_event("startup")
async def startup():
    _detect_tools()


async def _read_stream(stream, stream_name: str, run_id: str) -> AsyncGenerator[str, None]:
    while True:
        line = await stream.readline()
        if not line:
            break
        decoded = line.decode("utf-8", errors="replace").rstrip()
        if decoded:
            payload = json.dumps({"line": decoded, "stream": stream_name, "run_id": run_id})
            yield f"data: {payload}\n\n"


async def _execute_stream(run_id: str, command: str, timeout: int) -> AsyncGenerator[str, None]:
    cancel = asyncio.Event()
    cancel_events[run_id] = cancel

    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            preexec_fn=None,
        )
        running_processes[run_id] = process

        yield f"data: {json.dumps({'event': 'start', 'run_id': run_id, 'command': command})}\n\n"

        read_tasks = [
            _read_stream(process.stdout, "stdout", run_id),
            _read_stream(process.stderr, "stderr", run_id),
        ]

        async def _wait_with_timeout():
            try:
                await asyncio.wait_for(process.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                pass

        wait_task = asyncio.create_task(_wait_with_timeout())
        read_gen = _merge_generators(read_tasks)
        timeout_task = asyncio.create_task(asyncio.sleep(timeout))

        done = False
        while not done:
            if cancel.is_set():
                process.kill()
                yield f"data: {json.dumps({'event': 'cancelled', 'run_id': run_id})}\n\n"
                return

            # Check if process is done
            if process.returncode is not None:
                # Consume remaining output
                async for line in _read_stream(process.stdout, "stdout", run_id):
                    yield line
                async for line in _read_stream(process.stderr, "stderr", run_id):
                    yield line
                done = True
                break

            # Read a chunk of output (with timeout)
            try:
                async for chunk in _read_chunk(read_gen, timeout=0.5):
                    yield chunk
            except asyncio.TimeoutError:
                pass

            # Re-check exit status
            if process.returncode is not None:
                done = True

        # Final status
        rc = process.returncode if process.returncode is not None else -1
        yield f"data: {json.dumps({'event': 'exit', 'run_id': run_id, 'returncode': rc})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'event': 'error', 'run_id': run_id, 'message': str(e)[:300]})}\n\n"
    finally:
        running_processes.pop(run_id, None)
        cancel_events.pop(run_id, None)


async def _merge_generators(generators):
    """Iterate over multiple async generators, yielding items as they arrive."""
    queues = []
    for g in generators:
        q = asyncio.Queue()
        queues.append(q)
        asyncio.create_task(_forward_to_queue(g, q))

    while queues:
        done = []
        for i, q in enumerate(queues):
            try:
                item = await asyncio.wait_for(q.get(), timeout=0.1)
                yield item
                done.append(False)
            except asyncio.TimeoutError:
                done.append(False)
            except Exception:
                done.append(True)

        # Remove finished generators
        queues = [q for q, d in zip(queues, done) if not d]

        if not queues:
            break


async def _forward_to_queue(generator, queue):
    try:
        async for item in generator:
            await queue.put(item)
    except Exception:
        pass


async def _read_chunk(generator, timeout: float = 0.5):
    """Read available items from a generator within a timeout."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            item = await asyncio.wait_for(
                generator.__anext__(), timeout=0.1
            )
            yield item
        except StopAsyncIteration:
            return
        except asyncio.TimeoutError:
            return


@app.post("/execute")
async def execute(req: ExecuteRequest):
    return StreamingResponse(
        _execute_stream(req.run_id, req.command, req.timeout),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/cancel/{run_id}")
async def cancel(run_id: str):
    ev = cancel_events.get(run_id)
    if ev:
        ev.set()

    proc = running_processes.get(run_id)
    if proc:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        running_processes.pop(run_id, None)

    return {"status": "cancelled", "run_id": run_id}


@app.get("/health")
async def health():
    tools = _detect_tools()
    return {
        "status": "ok",
        "tools_count": len(tools),
        "tools": tools,
    }


@app.get("/tools")
async def list_tools():
    tools = _detect_tools()
    return {"tools": tools, "count": len(tools)}


@app.get("/")
async def root():
    return {
        "service": "Brahmastra Tools Service",
        "version": "1.0.0",
        "endpoints": {
            "POST /execute": "Execute a command and stream output via SSE",
            "POST /cancel/{run_id}": "Cancel a running command",
            "GET /health": "Health check with available tools",
            "GET /tools": "List available tools",
        },
    }
