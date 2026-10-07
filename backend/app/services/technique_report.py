import os
import re
import html as html_mod
import datetime
import asyncio
from typing import List, Dict, Any, Optional

from app.core.config import PROJECT_ROOT

REPORTS_DIR = os.getenv("BRAHMASTRA_REPORTS_DIR", os.path.join(PROJECT_ROOT, "reports"))

SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
SEV_COLOR = {
    "CRITICAL": "#8b0000", "HIGH": "#e03131", "MEDIUM": "#f08c00",
    "LOW": "#1971c2", "INFO": "#495057",
}

TECHNIQUE_MAP = {
    "nmap": "Network Service Scanning (T1046)",
    "masscan": "Network Service Scanning (T1046)",
    "rustscan": "Network Service Scanning (T1046)",
    "subfinder": "Subdomain Discovery (T1596.005)",
    "assetfinder": "Subdomain Discovery (T1596.005)",
    "findomain": "Subdomain Discovery (T1596.005)",
    "chaos": "Subdomain Discovery (T1596.005)",
    "gau": "URL Discovery (T1596)",
    "waybackurls": "URL Discovery (T1596)",
    "paramspider": "URL Discovery (T1596)",
    "gobuster": "Content Discovery (T1595.003)",
    "ffuf": "Content Discovery (T1595.003)",
    "feroxbuster": "Content Discovery (T1595.003)",
    "dirsearch": "Content Discovery (T1595.003)",
    "nikto": "Vulnerability Scanning (T1595.002)",
    "nuclei": "Vulnerability Scanning (T1595.002)",
    "wpscan": "Vulnerability Scanning (T1595.002)",
    "joomscan": "Vulnerability Scanning (T1595.002)",
    "sqlmap": "Exploitation: SQL Injection (T1190)",
    "dalfox": "Exploitation: XSS (T1190)",
    "xsstrike": "Exploitation: XSS (T1190)",
    "hydra": "Brute Force (T1110.001)",
    "whatweb": "Gather Victim Host Info (T1592)",
    "sslscan": "Crypto/SSL weaknesses",
    "testssl": "Crypto/SSL weaknesses",
    "theharvester": "Gather Victim Org Info (T1593)",
    "linkfinder": "Endpoint/JS Disclosure",
    "secretfinder": "Secrets Discovery",
    "whois": "Gather Victim Host Info (T1592)",
}

NUCLEI_SEV = {"critical": "CRITICAL", "high": "HIGH", "medium": "MEDIUM",
              "low": "LOW", "info": "INFO", "unknown": "INFO"}
RISKY_SERVICES = {"ftp": "MEDIUM", "telnet": "HIGH", "rdp": "MEDIUM", "microsoft-ds": "MEDIUM",
                  "msrpc": "LOW", "snmp": "MEDIUM", "vnc": "HIGH", "redis": "HIGH",
                  "mongodb": "HIGH", "mysql": "INFO", "postgresql": "INFO", "irc": "LOW"}


def _first_token(cmd: str) -> str:
    for tok in cmd.split():
        if tok in ("sudo", "timeout", "bash", "-c", "http://", "https://"):
            continue
        return os.path.basename(tok)
    return ""


def _parse_nmap(out: str) -> List[Dict]:
    findings = []
    for m in re.finditer(r"^(\d+)/(tcp|udp)\s+open\s+(\S+)\s*(.*)$", out, re.M):
        port, proto, service, banner = m.group(1), m.group(2), m.group(3), m.group(4).strip()
        sev = RISKY_SERVICES.get(service, "INFO")
        findings.append({
            "severity": sev, "title": f"Open port {port}/{proto} ({service})",
            "evidence": f"{port}/{proto} open {service} {banner}".strip(),
        })
    if re.search(r"OS details:|Running: ", out):
        m = re.search(r"OS details:\s*(.+)", out)
        if m:
            findings.append({"severity": "INFO", "title": "OS fingerprint detected",
                             "evidence": m.group(1).strip()[:200]})
    return findings


def _parse_nuclei(out: str) -> List[Dict]:
    findings = []
    for m in re.finditer(r"\[(critical|high|medium|low|info|unknown)\]\s+\[?([^\]\s]+)\]?\s+(\S+)", out, re.I):
        sev = NUCLEI_SEV.get(m.group(1).lower(), "INFO")
        tid, url = m.group(2), m.group(3)
        findings.append({"severity": sev, "title": f"[{tid}] matched",
                         "evidence": f"{sev} {tid} {url}"[:300]})
    return findings


def _parse_nikto(out: str) -> List[Dict]:
    findings = []
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("+") and len(line) > 3:
            body = line.lstrip("+ ").strip()
            if not body:
                continue
            sev = "MEDIUM" if re.search(r"vulnerab|OSVDB|CVE-|dangerous", body, re.I) else "LOW"
            findings.append({"severity": sev, "title": body[:120], "evidence": line[:300]})
    return findings[:100]


def _parse_sqlmap(out: str) -> List[Dict]:
    findings = []
    if re.search(r"is vulnerable|injection point|sqlmap identified the following injection", out, re.I):
        for m in re.finditer(r"^\s*(\d+):\s*(.+)$", out, re.M):
            if re.search(r"injection|payload", m.group(2), re.I):
                findings.append({"severity": "CRITICAL", "title": "SQL injection point found",
                                 "evidence": m.group(0).strip()[:300]})
        if not findings:
            findings.append({"severity": "CRITICAL", "title": "SQL injection confirmed by sqlmap",
                             "evidence": next((l.strip() for l in out.splitlines()
                                               if re.search(r"vulnerable|injection", l, re.I)), "")[:300]})
    m = re.search(r"back-end DBMS:\s*(.+)", out)
    if m:
        findings.append({"severity": "INFO", "title": "Backend DBMS identified",
                         "evidence": m.group(1).strip()[:200]})
    return findings


def _parse_dirs(out: str) -> List[Dict]:
    findings, seen = [], set()
    patterns = [
        r"(\S+)\s+\(Status:\s*(\d{3})",
        r"\[Status:\s*(\d{3})\]\s+(\S+)",
        r"^\s*(\d{3})\s+\S*B\s+(http\S+)",
    ]
    for line in out.splitlines():
        for i, pat in enumerate(patterns):
            m = re.search(pat, line)
            if not m:
                continue
            if i == 1:
                status, path = m.group(1), m.group(2)
            elif i == 2:
                status, path = m.group(1), m.group(2)
            else:
                path, status = m.group(1), m.group(2)
            key = (path, status)
            if key in seen:
                break
            seen.add(key)
            if status.startswith("2"):
                sev = "LOW"
            elif status == "403":
                sev = "INFO"
            else:
                sev = "INFO"
            findings.append({"severity": sev, "title": f"Discovered path (HTTP {status})",
                             "evidence": line.strip()[:250]})
            break
    return findings[:150]


def _parse_xss(out: str) -> List[Dict]:
    findings = []
    for line in out.splitlines():
        if re.search(r"xss (vulnerability|found)|dalfox found|poc:", line, re.I):
            findings.append({"severity": "HIGH", "title": "XSS vulnerability found",
                             "evidence": line.strip()[:300]})
    return findings[:50]


def _parse_hydra(out: str) -> List[Dict]:
    findings = []
    for line in out.splitlines():
        if re.search(r"password found|login:\s*\S+\s+password:", line, re.I):
            findings.append({"severity": "CRITICAL", "title": "Valid credential found (brute force)",
                             "evidence": line.strip()[:300]})
    return findings


def _parse_ssl(out: str) -> List[Dict]:
    findings = []
    for line in out.splitlines():
        if re.search(r"heartbleed|CVE-2014-0160", line, re.I):
            findings.append({"severity": "CRITICAL", "title": "Heartbleed (CVE-2014-0160)",
                             "evidence": line.strip()[:250]})
        elif re.search(r"TLS 1\.0|SSLv3|SSLv2|weak cipher|RC4|DES-CBC3|NULL cipher", line, re.I):
            findings.append({"severity": "MEDIUM", "title": "Weak TLS/cipher configuration",
                             "evidence": line.strip()[:250]})
        elif re.search(r"certificate (expired|self-signed)|self-signed", line, re.I):
            findings.append({"severity": "LOW", "title": "Certificate issue",
                             "evidence": line.strip()[:250]})
    return findings[:50]


def _parse_hosts(out: str) -> List[Dict]:
    hosts = set()
    for line in out.splitlines():
        line = line.strip()
        if re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-z]{2,}$", line):
            hosts.add(line.lower())
    if hosts:
        sample = sorted(hosts)[:15]
        return [{"severity": "INFO",
                 "title": f"{len(hosts)} host(s)/URL(s) discovered",
                 "evidence": ", ".join(sample) + (" ..." if len(hosts) > 15 else "")}]
    return []


def _parse_wpscan(out: str) -> List[Dict]:
    findings = []
    for line in out.splitlines():
        if line.strip().startswith("[!]"):
            findings.append({"severity": "MEDIUM", "title": line.strip("[!] ").strip()[:120],
                             "evidence": line.strip()[:300]})
        elif line.strip().startswith("[+]"):
            body = line.strip("[+] ").strip()
            if re.search(r"version|vulnerab|exploit", body, re.I):
                findings.append({"severity": "INFO", "title": body[:120], "evidence": line.strip()[:300]})
    return findings[:80]


def _parse_generic_vuln(out: str) -> List[Dict]:
    findings = []
    for line in out.splitlines():
        if re.search(r"\bVULNERABLE\b|CVE-\d{4}-\d+.*found|exploit (available|found)", line, re.I):
            findings.append({"severity": "HIGH", "title": "Vulnerability indicator",
                             "evidence": line.strip()[:300]})
    return findings[:50]


PARSERS = {
    "nmap": _parse_nmap, "masscan": _parse_nmap, "rustscan": _parse_nmap,
    "nuclei": _parse_nuclei, "nikto": _parse_nikto, "sqlmap": _parse_sqlmap,
    "gobuster": _parse_dirs, "ffuf": _parse_dirs, "feroxbuster": _parse_dirs,
    "dirsearch": _parse_dirs,
    "dalfox": _parse_xss, "xsstrike": _parse_xss,
    "hydra": _parse_hydra,
    "sslscan": _parse_ssl, "testssl": _parse_ssl,
    "subfinder": _parse_hosts, "assetfinder": _parse_hosts, "findomain": _parse_hosts,
    "chaos": _parse_hosts, "gau": _parse_hosts, "waybackurls": _parse_hosts,
    "paramspider": _parse_hosts,
    "wpscan": _parse_wpscan, "joomscan": _parse_generic_vuln,
}


def extract_findings(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    findings, seen = [], set()
    for r in results:
        cmd = r.get("command", "")
        tool = _first_token(cmd)
        out = (r.get("stdout") or "") + "\n" + (r.get("stderr") or "")
        parser = PARSERS.get(tool)
        raw = parser(out) if parser else []
        if not raw and parser is None:
            raw = _parse_generic_vuln(out)
        technique = TECHNIQUE_MAP.get(tool, tool or "Unknown technique")
        for f in raw:
            key = (tool, f["title"], f["evidence"][:80])
            if key in seen:
                continue
            seen.add(key)
            findings.append({
                "tool": tool, "technique": technique,
                "severity": f.get("severity", "INFO"),
                "title": f["title"], "evidence": f.get("evidence", ""),
            })
    findings.sort(key=lambda f: SEV_ORDER.index(f["severity"]) if f["severity"] in SEV_ORDER else 4)
    for i, f in enumerate(findings, 1):
        f["id"] = f"F-{i:03d}"
    return findings


def _sev_counts(findings):
    c = {s: 0 for s in SEV_ORDER}
    for f in findings:
        c[f["severity"]] = c.get(f["severity"], 0) + 1
    return c


def _now():
    return datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")


def _build_md(meta: Dict, findings: List[Dict], results: List[Dict]) -> str:
    counts = _sev_counts(findings)
    ok = sum(1 for r in results if r.get("returncode") == 0)
    lines = [
        f"# Brahmastra Technique Report — {meta['skill_name']}",
        "",
        f"- **Target:** {meta['target']}",
        f"- **Execution ID:** {meta['exec_id']}",
        f"- **Status:** {meta.get('status', 'completed')}",
        f"- **Generated:** {meta['generated_at']}",
        f"- **Commands run:** {len(results)} ({ok} succeeded, {len(results)-ok} skipped)",
        f"- **Total findings:** {len(findings)}",
        "",
        "## Summary by severity",
        "",
        "| Severity | Count |", "|---|---|",
    ]
    lines += [f"| {s} | {counts[s]} |" for s in SEV_ORDER]
    lines += ["", "## Findings", ""]
    if not findings:
        lines.append("_No findings extracted from tool output._")
    for f in findings:
        lines += [
            f"### {f['id']} — {f['title']}",
            f"- **Severity:** {f['severity']}",
            f"- **Technique:** {f['technique']}",
            f"- **Tool:** `{f['tool']}`",
            f"- **Evidence:** `{f['evidence'][:400]}`",
            "",
        ]
    lines += ["## Commands executed", "", "| # | Command | Exit |", "|---|---|---|"]
    for i, r in enumerate(results, 1):
        status = "✓" if r.get("returncode") == 0 else "SKIP"
        cmd = r.get("command", "").replace("|", "\\|")[:150]
        lines.append(f"| {i} | `{cmd}` | {status} |")
    lines.append("")
    return "\n".join(lines)


def _build_html(meta: Dict, findings: List[Dict], results: List[Dict]) -> str:
    counts = _sev_counts(findings)
    ok = sum(1 for r in results if r.get("returncode") == 0)
    badges = "".join(
        f'<span class="badge" style="background:{SEV_COLOR[s]}">{s}: {counts[s]}</span>'
        for s in SEV_ORDER)
    rows = []
    for f in findings:
        rows.append(
            f'<tr><td><span class="badge" style="background:{SEV_COLOR[f["severity"]]}">{f["severity"]}</span></td>'
            f'<td><b>{html_mod.escape(f["id"])}</b><br>{html_mod.escape(f["title"])}</td>'
            f'<td>{html_mod.escape(f["technique"])}</td>'
            f'<td><code>{html_mod.escape(f["tool"])}</code></td>'
            f'<td class="ev">{html_mod.escape(f["evidence"][:500])}</td></tr>')
    cmd_rows = "".join(
        f'<tr><td>{i}</td><td><code>{html_mod.escape(r.get("command","")[:200])}</code></td>'
        f'<td>{"✓" if r.get("returncode")==0 else "SKIP"}</td></tr>'
        for i, r in enumerate(results, 1))
    body_rows = "".join(rows) or '<tr><td colspan="5">No findings extracted.</td></tr>'
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Brahmastra Technique Report — {html_mod.escape(meta['skill_name'])}</title>
<style>
body{{font-family:Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f4f5f7;color:#212529}}
.wrap{{max-width:1100px;margin:24px auto;padding:0 20px}}
.card{{background:#fff;border-radius:10px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:20px}}
h1{{margin:0 0 6px;font-size:24px}} h2{{font-size:18px;border-bottom:2px solid #eee;padding-bottom:6px}}
.meta{{color:#666;font-size:13px}} .badge{{color:#fff;border-radius:4px;padding:3px 9px;font-size:11px;font-weight:700;margin-right:6px;display:inline-block}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th{{background:#343a40;color:#fff;text-align:left;padding:8px}}
td{{padding:7px 8px;border-bottom:1px solid #eee;vertical-align:top}}
.ev{{font-family:monospace;font-size:11px;color:#495057;word-break:break-all}}
code{{background:#f1f3f5;padding:1px 5px;border-radius:3px;font-size:12px}}
</style></head><body><div class="wrap">
<div class="card"><h1>Brahmastra Technique Report</h1>
<div class="meta"><b>{html_mod.escape(meta['skill_name'])}</b> · target <b>{html_mod.escape(meta['target'])}</b> ·
exec <code>{html_mod.escape(meta['exec_id'])}</code> · status <b>{html_mod.escape(str(meta.get('status', 'completed')))}</b> · {html_mod.escape(meta['generated_at'])}<br>
{len(results)} commands ({ok} succeeded, {len(results)-ok} skipped) · {len(findings)} findings</div>
<p style="margin:14px 0 0">{badges}</p></div>
<div class="card"><h2>Findings</h2>
<table><tr><th>Severity</th><th>Finding</th><th>Technique</th><th>Tool</th><th>Evidence</th></tr>
{body_rows}</table></div>
<div class="card"><h2>Commands executed</h2>
<table><tr><th>#</th><th>Command</th><th>Result</th></tr>{cmd_rows}</table></div>
</div></body></html>"""


def _pdf_escape(s: str) -> str:
    return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _build_pdf(meta: Dict, findings: List[Dict], results: List[Dict]) -> bytes:
    counts = _sev_counts(findings)
    ok = sum(1 for r in results if r.get("returncode") == 0)
    layout: List[tuple] = []  # (text, bold, size)

    def emit(text="", bold=False, size=9):
        layout.append((text, bold, size))

    emit("Brahmastra Technique Report", True, 16)
    emit(f"Skill: {meta['skill_name']}   Target: {meta['target']}", True, 10)
    emit(f"Exec: {meta['exec_id']}   Generated: {meta['generated_at']}", False, 9)
    emit(f"Status: {meta.get('status', 'completed')}", True, 9)
    emit(f"Commands: {len(results)} ({ok} succeeded, {len(results)-ok} skipped)   "
         f"Findings: {len(findings)}", False, 9)
    emit(f"Severity: " + "  ".join(f"{s}={counts[s]}" for s in SEV_ORDER), True, 10)
    emit()
    emit("FINDINGS", True, 12)
    emit("-" * 90, True, 10)
    if not findings:
        emit("No findings extracted from tool output.")
    for f in findings:
        head = f"{f['id']}  [{f['severity']}]  {f['title']}"
        for seg in [head[i:i + 95] for i in range(0, len(head), 95)] or [""]:
            emit(seg, True, 9)
        emit(f"    Technique: {f['technique']}   Tool: {f['tool']}", False, 8)
        ev = f"Evidence: {f['evidence'][:350]}"
        for seg in [ev[i:i + 95] for i in range(0, len(ev), 95)] or [""]:
            emit("    " + seg, False, 8)
        emit()
    emit("COMMANDS EXECUTED", True, 12)
    emit("-" * 90, True, 10)
    for i, r in enumerate(results, 1):
        status = "OK  " if r.get("returncode") == 0 else "SKIP"
        cmd = r.get("command", "")
        segs = [cmd[i:i + 92] for i in range(0, len(cmd), 92)] or [""]
        emit(f"{i:>3}. [{status}] {segs[0]}", False, 8)
        for seg in segs[1:]:
            emit(f"          {seg}", False, 8)

    # paginate
    pages, cur, y = [], [], 800.0
    for text, bold, size in layout:
        step = size + 3.5
        if y < 58:
            pages.append(cur)
            cur, y = [], 800.0
        cur.append((text, bold, size, y))
        y -= step
    if cur:
        pages.append(cur)

    content_streams = []
    for page in pages:
        parts = ["BT"]
        for text, bold, size, y in page:
            font = "/F2" if bold else "/F1"
            parts.append(f"{font} {size} Tf")
            parts.append(f"1 0 0 1 45 {y:.1f} Tm")
            parts.append(f"({_pdf_escape(text)}) Tj")
        parts.append("ET")
        content_streams.append("\n".join(parts))

    n = max(len(pages), 1)
    objs: Dict[int, str] = {}
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>"
    kids = " ".join(f"{5 + 2*i} 0 R" for i in range(n))
    objs[2] = f"<< /Type /Pages /Kids [{kids}] /Count {n} >>"
    objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
    streams: Dict[int, bytes] = {}
    for i in range(n):
        pid, cid = 5 + 2*i, 6 + 2*i
        objs[pid] = (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                     f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {cid} 0 R >>")
        data = (content_streams[i] if i < len(content_streams) else "").encode("latin-1", "replace")
        streams[cid] = data

    out = bytearray(b"%PDF-1.4\n")
    offsets: Dict[int, int] = {}
    max_obj = 4 + 2*n
    for oid in range(1, max_obj + 1):
        offsets[oid] = len(out)
        if oid in streams:
            data = streams[oid]
            out += f"{oid} 0 obj\n<< /Length {len(data)} >>\nstream\n".encode()
            out += data + b"\nendstream\nendobj\n"
        else:
            out += f"{oid} 0 obj\n{objs[oid]}\nendobj\n".encode()
    xref_pos = len(out)
    out += f"xref\n0 {max_obj + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for oid in range(1, max_obj + 1):
        out += f"{offsets[oid]:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {max_obj + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF").encode()
    return bytes(out)


class TechniqueReportAgent:
    def __init__(self):
        os.makedirs(REPORTS_DIR, exist_ok=True)
        self._store: Dict[str, Dict[str, Any]] = {}

    async def generate(self, exec_id: str, skill_name: str, target: str,
                       results: List[Dict[str, Any]],
                       status: str = "completed") -> Dict[str, Any]:
        loop = asyncio.get_running_loop()
        findings = await loop.run_in_executor(None, extract_findings, results)
        meta = {
            "exec_id": exec_id, "skill_name": skill_name, "target": target,
            "generated_at": _now(), "status": status,
        }
        md = await loop.run_in_executor(None, _build_md, meta, findings, results)
        htm = await loop.run_in_executor(None, _build_html, meta, findings, results)
        pdf = await loop.run_in_executor(None, _build_pdf, meta, findings, results)

        base_md = f"technique-report-{exec_id[:8]}"
        paths = {}
        for ext, data in (("md", md.encode()), ("html", htm.encode()), ("pdf", pdf)):
            path = os.path.join(REPORTS_DIR, f"{base_md}.{ext}")
            with open(path, "wb") as fh:
                fh.write(data)
            paths[ext] = f"reports/{base_md}.{ext}"

        summary = {
            "exec_id": exec_id, "skill_name": skill_name, "target": target,
            "generated_at": meta["generated_at"], "status": status,
            "finding_count": len(findings),
            "severity_counts": _sev_counts(findings),
            "commands_total": len(results),
            "commands_ok": sum(1 for r in results if r.get("returncode") == 0),
            "findings": findings, "paths": paths,
        }
        self._store[exec_id] = summary
        return summary

    def get_path(self, exec_id: str, fmt: str) -> Optional[str]:
        if fmt not in ("md", "html", "pdf"):
            return None
        entry = self._store.get(exec_id)
        if entry:
            rel = entry["paths"].get(fmt)
            if rel:
                path = os.path.join(PROJECT_ROOT, rel)
                if os.path.exists(path):
                    return path
        for eid, entry in self._store.items():
            if eid.startswith(exec_id) or exec_id.startswith(eid[:8]):
                path = os.path.join(PROJECT_ROOT, entry["paths"].get(fmt, ""))
                if os.path.exists(path):
                    return path
        # fall back to scanning REPORTS_DIR by partial id
        suffix = f".{fmt}"
        for name in sorted(os.listdir(REPORTS_DIR)):
            if name.endswith(suffix) and exec_id[:8] in name:
                return os.path.join(REPORTS_DIR, name)
        return None

    def list_reports(self) -> List[Dict[str, Any]]:
        items = []
        if not os.path.isdir(REPORTS_DIR):
            return items
        for name in sorted(os.listdir(REPORTS_DIR), reverse=True):
            if not name.startswith("technique-report-"):
                continue
            full = os.path.join(REPORTS_DIR, name)
            items.append({
                "file": name, "path": f"reports/{name}",
                "size": os.path.getsize(full),
                "modified": datetime.datetime.utcfromtimestamp(
                    os.path.getmtime(full)).strftime("%Y-%m-%d %H:%M:%S UTC"),
            })
        return items


technique_report = TechniqueReportAgent()
