"""Persistent per-target findings memory for Vaani (LLM) context.

Every technique execution (completed OR cancelled) records its findings here so
the LLM can answer questions like "what did we find on nasa.gov?" with real
scan results instead of hallucinating. One JSON file per target.
"""

import os
import re
import json
import time
import threading
import datetime
from typing import List, Dict, Any, Optional

from app.core.config import PROJECT_ROOT

MEMORY_DIR = os.getenv(
    "BRAHMASTRA_MEMORY_DIR", os.path.join(PROJECT_ROOT, "reports", "memory")
)
MAX_ENTRIES_PER_TARGET = 50
MAX_FINDINGS_PER_ENTRY = 200
MAX_CONTEXT_ENTRIES = 8
MAX_CONTEXT_FINDINGS = 10

_lock = threading.Lock()

_KEYWORD_RE = re.compile(
    r"\b(find|found|finding|findings|results?|scan|scanned|recon|subdomains?|"
    r"domains?|ports?|vulns?|vulnerabilit\w*|dns|hosts?|urls?|open|what did we|"
    r"discover\w*|batao|dikhao|kya|mila|report)\w*",
    re.I,
)


def _safe_name(target: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9._-]+", "_", (target or "").strip().lower())
    return name[:80] or "unknown"


def _bare_host(target: str) -> str:
    return (
        target.strip()
        .replace("https://", "")
        .replace("http://", "")
        .split("/")[0]
        .split("?")[0]
        .lower()
    )


def _now_str() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")


class FindingsMemory:
    def __init__(self):
        os.makedirs(MEMORY_DIR, exist_ok=True)

    # ─── storage ───
    def _path(self, target: str) -> str:
        return os.path.join(MEMORY_DIR, f"{_safe_name(target)}.json")

    def _load(self, target: str) -> List[Dict[str, Any]]:
        path = self._path(target)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict):
                entries = data.get("entries", [])
                return entries if isinstance(entries, list) else []
        except Exception:
            pass
        return []

    def _save(self, target: str, entries: List[Dict[str, Any]]) -> None:
        path = self._path(target)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(
                {"target": target, "entries": entries},
                fh, ensure_ascii=False, indent=1,
            )
        os.replace(tmp, path)

    # ─── write ───
    def record(
        self,
        target: str,
        skill_name: str,
        exec_id: str,
        status: str,
        findings: List[Dict[str, Any]],
        paths: Dict[str, str],
        severity_counts: Dict[str, int],
        commands_ok: int,
        commands_total: int,
    ) -> Optional[Dict[str, Any]]:
        try:
            slim = []
            for f in (findings or [])[:MAX_FINDINGS_PER_ENTRY]:
                slim.append({
                    "severity": str(f.get("severity", "INFO")),
                    "title": str(f.get("title", ""))[:200],
                    "evidence": str(f.get("evidence", ""))[:300],
                    "tool": str(f.get("tool", ""))[:60],
                    "technique": str(f.get("technique", ""))[:120],
                })
            entry = {
                "exec_id": exec_id,
                "skill_name": skill_name,
                "status": status,
                "timestamp": _now_str(),
                "ts": time.time(),
                "finding_count": len(findings or []),
                "severity_counts": severity_counts or {},
                "commands_ok": int(commands_ok or 0),
                "commands_total": int(commands_total or 0),
                "paths": paths or {},
                "findings": slim,
            }
            with _lock:
                entries = self._load(target)
                entries = [e for e in entries if e.get("exec_id") != exec_id]
                entries.append(entry)
                entries.sort(key=lambda e: e.get("ts", 0), reverse=True)
                entries = entries[:MAX_ENTRIES_PER_TARGET]
                self._save(target, entries)
            return entry
        except Exception:
            return None

    # ─── read ───
    def get(self, target: str) -> List[Dict[str, Any]]:
        with _lock:
            return self._load(target)

    def list_targets(self) -> List[Dict[str, Any]]:
        out = []
        try:
            names = [n for n in os.listdir(MEMORY_DIR) if n.endswith(".json")]
        except Exception:
            return out
        for name in names:
            try:
                with open(os.path.join(MEMORY_DIR, name), "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                target = data.get("target") or name[:-5]
                entries = data.get("entries", [])
                latest = entries[0] if entries else {}
                out.append({
                    "target": target,
                    "runs": len(entries),
                    "findings": sum(int(e.get("finding_count", 0)) for e in entries),
                    "last_status": latest.get("status", ""),
                    "last_skill": latest.get("skill_name", ""),
                    "last_timestamp": latest.get("timestamp", ""),
                    "latest_exec_id": latest.get("exec_id", ""),
                })
            except Exception:
                continue
        out.sort(key=lambda t: t.get("last_timestamp", ""), reverse=True)
        return out

    def all_entries(self, limit: int = 100) -> List[Dict[str, Any]]:
        """All entries across targets, newest first, each tagged with target."""
        items: List[Dict[str, Any]] = []
        for t in self.list_targets():
            for e in self.get(t["target"]):
                item = dict(e)
                item["target"] = t["target"]
                items.append(item)
        items.sort(key=lambda e: e.get("ts", 0), reverse=True)
        return items[:limit]

    # ─── LLM context ───
    def detect_target(self, message: str) -> Optional[str]:
        if not message:
            return None
        low = message.lower()
        entries = self.all_entries(limit=200)
        seen = set()
        candidates: List[str] = []
        for e in entries:
            t = e.get("target", "")
            if t and t not in seen:
                seen.add(t)
                candidates.append(t)
        # explicit mention (longest target first so sub.example.com wins over example.com)
        for t in sorted(candidates, key=len, reverse=True):
            bare = _bare_host(t)
            if (bare and bare in low) or t.lower() in low:
                return t
        # keyword fallback → most recently scanned target
        if candidates and _KEYWORD_RE.search(low):
            return candidates[0]
        return None

    def context_for(self, target: str) -> Optional[str]:
        entries = self.get(target)[:MAX_CONTEXT_ENTRIES]
        if not entries:
            return None
        total_runs = len(self.get(target))
        total_findings = sum(int(e.get("finding_count", 0)) for e in entries)
        lines = [
            f"[SYSTEM CONTEXT] Actual Brahmastra scan findings already collected "
            f"for target: {target}.",
            f"Target: {target} — {total_runs} technique run(s), "
            f"{total_findings} finding(s) recorded. "
            f"Latest run: {entries[0].get('timestamp', 'n/a')} "
            f"({entries[0].get('status', '?')}).",
            "Answer user questions about prior scans/recon using ONLY these real "
            "results. If something was not scanned yet, say so honestly.",
            "",
        ]
        for i, e in enumerate(entries, 1):
            counts = e.get("severity_counts", {}) or {}
            sev_str = " ".join(
                f"{s}={counts.get(s, 0)}"
                for s in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO")
                if counts.get(s, 0)
            ) or "none"
            lines.append(
                f"{i}) {e.get('timestamp', '')} — \"{e.get('skill_name', '')}\" "
                f"[{e.get('status', '?')}] exec={str(e.get('exec_id', ''))[:8]}"
            )
            lines.append(
                f"   commands {e.get('commands_ok', 0)}/{e.get('commands_total', 0)} "
                f"succeeded · findings {e.get('finding_count', 0)} ({sev_str})"
            )
            paths = e.get("paths", {}) or {}
            if paths:
                lines.append(
                    "   reports: "
                    + ", ".join(os.path.basename(p) for p in paths.values())
                )
            for f in (e.get("findings") or [])[:MAX_CONTEXT_FINDINGS]:
                ev = (f.get("evidence") or "").replace("\n", " ")[:180]
                lines.append(
                    f"   - [{f.get('severity', 'INFO')}] {f.get('title', '')}"
                    + (f" — {ev}" if ev else "")
                    + (f" (tool: {f.get('tool', '')})" if f.get("tool") else "")
                )
            extra = len(e.get("findings") or []) - MAX_CONTEXT_FINDINGS
            if extra > 0:
                lines.append(f"   - ... and {extra} more finding(s) in the report")
            lines.append("")
        return "\n".join(lines)

    def inject_context(
        self, history: List[Dict[str, Any]], user_message: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return message list with a findings-context system message injected.

        SSE path: inject_context(history, user_message) → history + [ctx, user]
        Terminal path: inject_context(chat_history) → ctx inserted before the
        trailing user message (or appended if none).
        """
        msgs = [dict(m) for m in (history or [])]
        try:
            if user_message is not None:
                detect_src = user_message
            else:
                detect_src = next(
                    (str(m.get("content", "")) for m in reversed(msgs)
                     if m.get("role") == "user"),
                    "",
                )
            target = self.detect_target(detect_src)
            ctx = self.context_for(target) if target else None
            if not ctx:
                if user_message is not None:
                    msgs.append({"role": "user", "content": user_message})
                return msgs
            ctx_msg = {"role": "system", "content": ctx}
            if user_message is not None:
                msgs += [ctx_msg, {"role": "user", "content": user_message}]
            elif msgs and msgs[-1].get("role") == "user":
                msgs.insert(len(msgs) - 1, ctx_msg)
            else:
                msgs.append(ctx_msg)
        except Exception:
            if user_message is not None:
                msgs.append({"role": "user", "content": user_message})
        return msgs


findings_memory = FindingsMemory()
