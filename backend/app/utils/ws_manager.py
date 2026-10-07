from fastapi import WebSocket
from typing import Set, Dict, Any
import json
import asyncio


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.message_buffers: Dict[str, List[Dict[str, Any]]] = {}

    async def connect(self, scan_id: str, websocket: WebSocket):
        await websocket.accept()
        if scan_id not in self.active_connections:
            self.active_connections[scan_id] = set()
        self.active_connections[scan_id].add(websocket)
        # Flush buffered messages to the newly connected client
        buffered = self.message_buffers.pop(scan_id, [])
        for msg in buffered:
            try:
                await websocket.send_json(msg)
            except Exception:
                break

    def disconnect(self, scan_id: str, websocket: WebSocket):
        if scan_id in self.active_connections:
            self.active_connections[scan_id].discard(websocket)
            if not self.active_connections[scan_id]:
                del self.active_connections[scan_id]

    async def broadcast(self, scan_id: str, message: Dict[str, Any]):
        if scan_id not in self.active_connections or not self.active_connections[scan_id]:
            self.message_buffers.setdefault(scan_id, []).append(message)
            return
        disconnected = set()
        for ws in self.active_connections[scan_id]:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.add(ws)
        for ws in disconnected:
            self.active_connections[scan_id].discard(ws)

    async def send_terminal_line(self, scan_id: str, line: str, stream: str = "stdout"):
        await self.broadcast(scan_id, {
            "type": "terminal",
            "stream": stream,
            "data": line,
            "timestamp": asyncio.get_event_loop().time()
        })

    async def send_agent_status(self, scan_id: str, agent: str, status: str, message: str = ""):
        await self.broadcast(scan_id, {
            "type": "agent_status",
            "agent": agent,
            "status": status,
            "message": message,
            "timestamp": asyncio.get_event_loop().time()
        })

    async def send_tool_prompt(self, scan_id: str, tool_name: str, options: list):
        await self.broadcast(scan_id, {
            "type": "tool_prompt",
            "tool": tool_name,
            "options": options
        })

    async def send_scan_update(self, scan_id: str, status: str, progress: int, message: str = ""):
        await self.broadcast(scan_id, {
            "type": "scan_update",
            "status": status,
            "progress": progress,
            "message": message
        })


ws_manager = ConnectionManager()