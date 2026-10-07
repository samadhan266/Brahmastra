# BRAHMASTRA — Complete Project Memory (A–Z)

> Autonomous multi-agent AI penetration-testing platform. Red-team, AI-powered, fully automated.
> Last comprehensive survey: 2026-10-07 (based on **Volume4 = primary/ahead copy**).

---

## 1. Project Layout — 4 Volumes (critical!)

| Volume | Path | Contents | Status |
|---|---|---|---|
| **New Volume4** | `/media/samadhan/New Volume4/PROJECT BRAHMASTRA/brahmastra/` | **PRIMARY** — `frontend/`, `backend/`, `tools-service/`, `cloud-service/`, `jsons/`, `setup.sh`, `start.sh`, `start-prod.sh`, `docker-compose.yml`, `.env.example` | Authoritative; make all edits here |
| **New Volume2** | `/media/samadhan/New Volume2/PROJECT BRAHMASTRA/brahmastra/` | `backend/`, `cloud-service/`, `docker-compose.yml` only | Partial mirror; **behind** Volume4 (lacks `CLOUD_SERVICE_URL` in `config.py`, cloud-analyze/callback endpoints in `scans.py` were added later) |
| **New Volume3** | `/media/samadhan/New Volume3/PROJECT BRAHMASTRA/brahmastra/jsons/` | 15 skill JSONs | **Read-only** (PermissionDenied on write) |
| **New Volume1** | — | `jsons/` empty | Unused |

**Sync rules (user directives):**
- Edit in **Volume4**; when mirroring, `cp` only the specific changed files to Volume2 — **never whole dirs** (`scans.py`, `config.py`, `models/scan.py` legitimately differ between volumes).
- Current mirror state: `bughunter.py`, `technique_report.py`, `findings_memory.py` + related backend files were `cp`'d to Volume2; `py_compile` passed both volumes; `npm run build` passed.

---

## 2. Architecture Overview

```
Browser (React SPA :8082→nginx:80)
   │  /api proxy + WS
   ▼
backend (FastAPI :8000)  ──► tools-service (:9000, executes shell cmds, SSE)
   │        │                  ▲
   │        └── TOOLS_SERVICE_URL=http://tools:9000 (Docker)
   │        └── CLOUD_SERVICE_URL=http://cloud:9101  (Docker; only in Volume4)
   ▼
cloud-service (:9101, OpenRouter/Claude analysis, callbacks to backend)
   +
Local: sqlite (brahmastra.db, aiosqlite), reports/ on volume `reports-data`
```

### docker-compose.yml (Volume4)
- **tools** — build `./tools-service`, port 9000, healthcheck `curl http://localhost:9000/health` (30s/5s/3, start 15s), mounts `./jsons:/jsons:ro`, `reports-data:/workspace`, restart unless-stopped.
- **backend** — build `./backend`, port 8000, `env_file ./backend/.env`, env: `CORS_ORIGINS=http://localhost:3000,http://localhost:80,http://localhost:8082`, `TOOLS_SERVICE_URL=http://tools:9000`, `TOOLS_DIR=/jsons`, `SECLISTS_DIR=/jsons/SecLists`; volumes `reports-data:/app/reports`, `./jsons:/jsons:ro`; `depends_on: tools: service_healthy`.
- **cloud** — build `./cloud-service`, port 9101, `env_file ./backend/.env`, `BACKEND_CALLBACK_URL=http://backend:8000/api/v1`, `CLOUD_MAX_TOKENS=4096`, depends backend.
- **frontend** — build `./frontend`, port `8082:80` (multi-stage: node:20-alpine `npm run build` → nginx:stable-alpine), depends backend.
- network `brahmastra` (bridge); volume `reports-data`.

### Ports
- Frontend dev: Vite :3000 (proxy `/api` and `/reports` → `http://localhost:8082`, ws:true).
- Frontend prod (Docker): :8082→80; direct backend :8000; tools :9000; cloud :9101.

---

## 3. Backend (`backend/app/`, FastAPI)

### Entry: `main.py`
- `lifespan`: `init_db()`, creates `reports/` + `jsons/` dirs, initializes singleton `tool_manager`.
- Routers: `scans.router` + `bughunter.router`, both prefix `/api/v1`.
- CORS from `CORS_ORIGINS` env (comma list) else `settings.FRONTEND_URL`.
- Custom handlers: 422 validation, 500 global; mounts `/reports` static; `GET /api/health` (DB check, tools count, seclists), `GET /api/info` (categories, modes, tools_by_category).
- Runs via `uvicorn app.main:app` (`backend/run.py`), `UVICORN_RELOAD` toggle.

### `core/config.py` (pydantic-settings, env case-sensitive, `.env`)
- Paths: `PROJECT_ROOT` (`BRAHMASTRA_ROOT` override), `SECLISTS_DIR` (`jsons/SecLists`), `TOOLS_DIR` (`jsons/`).
- LLM: `OPENROUTER_API_KEY`, `VAANI_API_KEY`, `OPENROUTER_BASE_URL` (openrouter.ai/api/v1), `OPENROUTER_MODEL` (default `anthropic/claude-sonnet-5`), `VAANI_MODEL` (default `openrouter/free`).
- Keys: `SHODAN_API_KEY`, `NVD_API_KEY`; DB `DATABASE_URL` (`sqlite+aiosqlite:///./brahmastra.db`), `REDIS_URL`.
- Auth: `SECRET_KEY`, `HS256`, 30-min tokens.
- Host/port: `BACKEND_HOST=0.0.0.0`, `BACKEND_PORT=8000`, `FRONTEND_URL=http://localhost:3000`.
- Tool paths `NMAP_PATH/SQLMAP_PATH/NIKTO_PATH`; `SCAN_TIMEOUT=300`, `MAX_CONCURRENT_SCANS=3`.
- **`TOOLS_SERVICE_URL`** (empty locally → local exec; `http://tools:9000` in Docker) and **`CLOUD_SERVICE_URL`** (empty locally; `http://cloud:9101` in Docker — Volume4 only).

### API — `api/v1/endpoints/scans.py` (prefix `/v1/scans`)
Scan lifecycle: `POST /create`, `POST /{scan_id}/start`, `GET /{scan_id}/status`, `GET /{scan_id}/results`, `GET /list` (limit≤100), `POST /{scan_id}/cancel`, `DELETE /{scan_id}`, `POST /{scan_id}/pause`, `POST /{scan_id}/resume`.
LLM/misc: `POST /llm-query`, `GET|POST /api-toggle`, `GET /tools` (by category), `GET /tools/{tool_name}`, `GET /system/status`, `GET /tools/{tool_name}/check-update`, `POST /tools/update-all`, `GET /activity`, `GET /errors`, `POST /errors/{scan_id}/retry`, `DELETE /errors/{scan_id}`.
Cloud (Volume4): `POST /{scan_id}/cloud-analyze`, `POST /{scan_id}/cloud-callback`, `GET /cloud/status/{analysis_id}`, `POST /{scan_id}/cloud-execute`.
WS: `WS /{scan_id}`.

### API — `api/v1/endpoints/bughunter.py` (prefix `/v1/bughunter`) — core skill engine
- `POST /execute` (`SkillExecuteRequest`: skill_id, skill_name, target, commands[], tools[], timeout=300):
  - generates `exec_id` (uuid), runs commands **sequentially** via `tool_executor.execute` with `run_id=bh-{exec_id[:8]}`, streams lines to WS.
  - **`finalize(status)`**: computes ok/total, generates **technique report** (`technique_report.generate(..., status=status)` — status ∈ completed/cancelled), records into **findings memory**, sends `ws_manager.send_scan_update(exec_id, status, 100, ...)`.
  - cancel path (line ~169): `finalize("cancelled")` via `asyncio.create_task` + `asyncio.shield`; success path (line ~176): `finalize("completed")`.
  - `active_executions: Dict[str, asyncio.Task]` for cancellation.
- `POST /{exec_id}/cancel` — cancels task, shielded finalize.
- `GET /reports` → `technique_report.list_reports()`.
- `GET /history` → `{targets: findings_memory.list_targets(), entries: findings_memory.all_entries()}`.
- `GET /report/{exec_id}/{fmt}` — fmt ∈ `md|html|pdf` → `FileResponse` (404 if not found).
- `WS /{exec_id}` — skill execution stream (terminal lines, scan_update, tool_prompt, agent_status).
- `WS /ws/terminal/{session_id}` — **manual terminal**: receives `{type:"command", command}`; runs via `tool_executor` (`run_id=term-{sid[:8]}`, timeout 300), streams stdout lines, `[✓] exit N` / `[SKIP] Command skipped` markers; also `llm` message type → `llm` token stream (`run_llm`).
- `POST /llm/chat` — SSE streaming chat: body `{message, history[], theme: "vaani"|"core"}`; prompt = `VAANI_SYSTEM_PROMPT` (theme vaani, uses `VAANI_MODEL`/`VAANI_API_KEY`) else `CORE_SYSTEM_PROMPT`; messages = **`findings_memory.inject_context(history, user_message)`** (line ~399 — injects per-target findings into context); token queue → `data: {"content": ..., "done": bool}` SSE.

### Services (`app/services/`)
- **`llm_service.py`** — `chat_stream(messages, on_token, system_prompt, model, api_key)`: OpenRouter `/chat/completions` streaming via httpx (timeout 120), `max_tokens: 2048`, headers `X-Title: VAANI`.
  - `VAANI_SYSTEM_PROMPT`: "VAANI (वाणी)" wise-friend persona, English+Hinglish, markdown formatting.
  - `CORE_SYSTEM_PROMPT`: "Brahmastra, an AI cybersecurity assistant" — terminal output/commands visible in history.
- **`technique_report.py`** — pure-Python (NO weasyprint/reportlab for HTML; reportlab is in requirements but PDF is hand-built):
  - Tool-specific parsers: `_parse_nmap/_nuclei/_nikto/_sqlmap/_dirs/_xss/_hydra/_ssl/_hosts/_wpscan/_generic_vuln` → `extract_findings(results)`.
  - `generate(exec_id, skill_name, target, results, status)` → builds **md + html + pdf** into `REPORTS_DIR` (`BRAHMASTRA_REPORTS_DIR` or `{PROJECT_ROOT}/reports`), returns `{paths, findings, finding_count, severity_counts}`.
  - `_build_pdf` — hand-rolled PDF emission (`_pdf_escape`, 92-char command wrapping).
  - `get_path(exec_id, fmt)` (with metadata lookup + fallback scan), `list_reports()` (newest-first, path `reports/<name>`).
- **`findings_memory.py`** — per-target JSON store:
  - `MEMORY_DIR` = `BRAHMASTRA_MEMORY_DIR` or `{PROJECT_ROOT}/reports/memory/`; file per target `{safe_name}.json`.
  - API: `record(target, skill_name, exec_id, status, findings, paths, severity_counts, commands_ok, commands_total)`, `get`, `list_targets`, `all_entries(limit=100)`, `detect_target(message)`, `context_for(target)`, `inject_context(history, user_message)` — used by `/llm/chat` so VAANI knows prior scan findings.
- **`scan_service.py`** — `ScanService`: `create_scan`, `get_scan`, `list_scans`, `mark_running`, `mark_cloud_running`, `mark_cloud_completed`, `mark_completed`, `mark_failed`, `get_scan_progress`, `cancel_scan`, `pause_scan`, `delete_scan`.

### Utils (`app/utils/`)
- **`tool_executor.py`** — key behavior (user-enforced):
  - `execute(run_id, command, output_callback, timeout=300, cwd)`:
    - **timeout clamp: `timeout = max(10, min(int(timeout or 300), hard_limit))`** — always.
    - Remote if `settings.TOOLS_SERVICE_URL` set (`POST {url}/execute`, SSE streaming) else `_execute_local` (asyncio subprocess shell).
    - **Missing tool → print `[SKIP] Command skipped`** and continue (minimal `[SKIP]` on command failure); timeouts → `[SKIP] Command timed out`.
    - `cancel(run_id)` — POST `{service}/cancel/{run_id}` (timeout 3).
  - `build_*_command` builders: nmap, gobuster, dirsearch, subfinder, nikto, sqlmap, whatweb, wpscan, rustscan, masscan, feroxbuster, ffuf, dalfox.
- **`tool_manager.py`** — singleton; loads tool definitions from `TOOLS_DIR` JSONs (`ToolDefinition`: name/description/binary_path/category, `get_prompts(intent)`, `get_commands_for_category`); `find_seclist(pattern)`, `get_recon_tools/scan_tools/vuln_tools`.
- **`ws_manager.py`** — `ConnectionManager`: per-key (`exec_id`/`scan_id`) connection sets + **message buffers** (messages buffered for not-yet-connected clients, flushed on connect); `broadcast`, `send_terminal_line(scan_id, line, stream)`, `send_agent_status`, `send_tool_prompt`, `send_scan_update(scan_id, status, progress, message)`.

### Models (`app/models/scan.py`)
- `ScanStatus` enum, `ScanMode` enum (AUTONOMOUS default; modes: semi_autonomous/manual per API).
- **`Scan`** (`scans`): UUID pk, target (indexed), mode, status, current_agent, progress, error_message, created/updated/completed_at, JSON columns `recon_results`, `scanner_results`, `vuln_results`, `cloud_results`, `report_path`.
- **`AgentLog`** (`agent_logs`): FK scan_id, agent_name, action, input/output JSON, status, error, duration_ms.

### `requirements.txt` (highlights)
fastapi, uvicorn, gunicorn, pydantic v2 + pydantic-settings, httpx/aiohttp, websockets, **crewai, langchain, langchain-openai, openai**, python-nmap, shodan, dnspython, python-whois, requests, bs4, lxml, **reportlab, jinja2**, aiosqlite + sqlalchemy[asyncio], pytest/pytest-asyncio.

---

## 4. Frontend (`frontend/src/`, React 18 + Vite + TS + Tailwind)

### Entry & routing (`App.tsx` — **no react-router**; manual `page` state)
- **`PasswordGate`** first — `VITE_APP_PASSWORD` env or fallback `'HELLINHEAVEN'`; unlock → app.
- Pages state: `dashboard | chat | history | info`; bottom floating nav (PENTESTER AI / VAANI / HISTORY / INFO), hidden when `page === 'chat'`.
- **Dashboard always mounted** (display:none when inactive) to persist terminal state.
- Providers: `ScanProvider` → `WebSocketProvider`; `Toaster` bottom-right (dark glass style).
- Fullscreen `LLMChat` for VAANI.

### Pages (`src/pages/`, ~2405 LOC total)
| Page | LOC | Role |
|---|---|---|
| `Dashboard.tsx` | 694 | Main workspace: WS `/api/v1/bughunter/ws/terminal/{sessionId}` (manual terminal) + WS `/api/v1/bughunter/ws/{execId}` (skill runs), embeds `BugHunterSkills`, terminal, results |
| `BugHunterSkills.tsx` | 587 | Skill catalog UI; WS `/api/v1/bughunter/ws/{execId}` for live execution |
| `LLMChat.tsx` | 431 | VAANI chat — `POST /api/v1/bughunter/llm/chat` (SSE fetch) |
| `SystemInfo.tsx` | 326 | Shield/info page (`/v1/scans/system/status`, tool updates) |
| `ScanHistory.tsx` | 277 | Scan list + **TECHNIQUE REPORTS section** (MD/HTML/PDF buttons → `window.open('/api/v1/bughunter/report/{exec_id}/{fmt}')`) |
| `SettingsPage.tsx` | 90 | Settings |

### Components
`agents/AgentPipeline.tsx`, `agents/ScanResults.tsx`, `layout/Sidebar.tsx`, `scans/ScanForm.tsx`, `terminal/LiveTerminal.tsx`, `PasswordGate.tsx`.

### Data (`src/data/bughunter-skills.ts`) — **source of truth for techniques**
- **29 skills** (not 33 — 33 was the count of dirs in `jsons/`), `SkillCategory = recon | osint | network | vuln_hunting | exploitation | reporting | cloud`.
- Each: `id`, `name`, `category`, `difficulty (beginner|intermediate|advanced)`, description, **`commands[]`** (template commands executed by backend), `tools[]`.
- Full skill list by category:
  - **recon**: `subdomain-enum`, `url-harvesting`, `js-endpoint-extract`, `param-discovery`, `security-headers`
  - **cloud**: `s3-bucket-enum`, `cloud-iam-audit`, `metadata-service-attack`, `container-registry-scan`, `cloud-service-enum`
  - **osint**: `whois-lookup`, `tech-fingerprint`, `email-osint`, `cloud-exposure`
  - **network**: `port-scan-full`, `web-server-audit`, `directory-bruteforce`, `vhost-discovery`
  - **vuln_hunting**: `nuclei-scan`, `sqli-scan`, `xss-scan`, `ssrf-test`
  - **exploitation**: `auth-bypass`, `api-testing`, `cmsscan`, `ssrf-rce-chain`
  - **reporting**: `result-aggregation`, `cvss-scoring`, `executive-summary`
- **Architecture rule: the frontend sends `commands[]` with the execute request — the backend just runs them.** All technique logic lives in this TS file. (Amass was removed earlier from these skills.)

### Context/hooks/utils
- `context/ScanContext.tsx` — scans CRUD: `fetchScans`, `createAndStartScan`, `cancelScan`, `deleteScan`, `clearError`.
- `context/WebSocketContext.tsx` — shared WS to `/api/v1/scans/ws/{scanId}` (message types: terminal, agent_status, tool_prompt, scan_update), `WS_PROTO` from location, send messages when OPEN.
- `hooks/useWebSocket.ts` — `useWebSocket(scanId)` → lines, agentStatuses, currentPrompt, scanStatus/progress/message, connected; `clearTerminal`, `sendMessage`.
- `utils/api.ts` — axios instance `baseURL: '/api'`, timeout 30s; `brahmastraApi`: health/info, scan lifecycle, `llmQuery`, api-toggle, tools, system-status/activity/errors, `executeSkill({skill_id, skill_name, target, commands, tools, timeout})`, `cancelSkillExecution`, **`getBughunterHistory()`**, **`getBughunterReports()`**.
- `types/index.ts`, `styles/globals.css` (scanline/neon-red cyber aesthetic, JetBrains Mono).

### Frontend build
- `npm run build` = `tsc && vite build`; deps: axios, framer-motion, lucide-react, react-hot-toast, react-markdown + remark-gfm, react-router-dom (installed but unused in App).
- `vite.config.ts`: port 3000, `envDir: '..'` (reads root `.env` for `VITE_APP_PASSWORD`), proxy `/api` + `/reports` → `http://localhost:8082` with ws:true.

---

## 5. Tools Service (`tools-service/app/main.py`, :9000)
- FastAPI "Brahmastra Tools Service"; `ExecuteRequest {run_id, command, timeout=300, env}`.
- **`_detect_tools()`**: probes ~35 known binaries with `shutil.which`: nmap, masscan, nikto, whatweb, wpscan, subfinder, assetfinder, waybackurls, gau, chaos, findomain, httpx, httprobe, gobuster, ffuf, feroxbuster, nuclei, dalfox, dirsearch, xsstrike, theHarvester, paramspider, jwt-tool, urless, sqlmap, sslscan, whois, dig, nslookup, curl, wget, dnsrecon, linkfinder.py, SecretFinder.py.
- Executes via `asyncio.create_subprocess_shell`, streams stdout/stderr as **SSE** `data: {line, stream, run_id}`; `running_processes` + `cancel_events` dicts per run_id; cancellation endpoint. Health at `/health`.

## 6. Cloud Service (`cloud-service/app/main.py`, :9101)
- "Brahmastra Cloud Analysis Service"; `CLOUD_STORE` in-memory analysis store.
- Env: `OPENROUTER_API_KEY/BASE_URL/MODEL` (default `anthropic/claude-sonnet-5`), `CLOUD_MAX_TOKENS=4096`, `BACKEND_CALLBACK_URL`.
- Endpoints: `GET /health`; `POST /cloud/analyze` (ScanData: scan_id, target, mode, recon/scanner/vuln results → background `run_analysis` → LLM → **callback to backend `/api/v1/{scan_id}/cloud-callback`**); `ExecuteRequest {scan_id, target, action: deep_scan|validate_vuln|exploit_test|gather_evidence, parameters}` for cloud-executed actions.
- httpx.AsyncClient timeout 120 (lifespan).

---

## 7. Reports & Artifacts
- **Technique reports** (per skill execution): `{PROJECT_ROOT}/reports/<base>.md|.html|.pdf` — generated by `technique_report.generate`; listed via `GET /v1/bughunter/reports`; downloaded via `GET /v1/bughunter/report/{exec_id}/{fmt}`.
- **Findings memory**: `{PROJECT_ROOT}/reports/memory/{target}.json` — per-target cumulative findings, injected into VAANI chat context.
- **Scan reports**: `backend/reports/` (e.g. `brahmastra_mcdonalds_com_20260610_152155.pdf`, per-target dirs `http_mcdonalds.com`, `https_nasa.gov`, `https_www.sandipuniversity.edu.in`, `http_testphp.vulnweb.com`); mounted static at `/reports`.
- Misc artifacts in backend root: `nikto_report.html`, `nuclei_results.txt`, `subdomains.txt(.old)`, `brahmastra.db`, `results/`, `tests/`.

---

## 8. Scripts & Commands

### `setup.sh` (run from project root)
1. Checks 20 system tools: `nmap sqlmap nikto subfinder assetfinder findomain gau gobuster feroxbuster ffuf nuclei dalfox xsstrike whatweb theharvester curl jq whois dig nslookup rustscan masscan hydra` + `jsons/LinkFinder/linkfinder.py`, `jsons/SecretFinder/SecretFinder.py`, SecLists dir (4.8 GB, `jsons/SecLists`); prints `sudo apt install -y ...` for missing.
2. Recreates `tools-venv` (removes stale one), `pip install -r backend/requirements.txt`.
3. Copies `.env.example` → `.env` if absent (edit API keys!).
4. Validates config import (`PROJECT_ROOT`, `SECLISTS_DIR`, `TOOLS_DIR`).
- Start: `source tools-venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` (backend); `cd frontend && npm run dev`.

### `start.sh` — dev: backend via `python run.py` (:8000) + `npx vite --host` (:3000).
### `start-prod.sh` — sources `.env` (exports `VITE_*`), `docker compose up --build -d`; Frontend :80, API :8000/api, health `/api/health`, `docker compose logs -f` / `down`.

### Env keys (`.env.example`)
`OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL, SHODAN_API_KEY, NVD_API_KEY, DATABASE_URL, REDIS_URL, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, BACKEND_HOST, BACKEND_PORT, FRONTEND_URL, CORS_ORIGINS, VITE_APP_PASSWORD, TOOLS_SERVICE_URL, NMAP_PATH, SQLMAP_PATH, NIKTO_PATH, SCAN_TIMEOUT, MAX_CONCURRENT_SCANS, LOG_LEVEL, UVICORN_RELOAD` (+ `VAANI_API_KEY`, `VAANI_MODEL`, `CLOUD_SERVICE_URL` supported by code).

---

## 9. `jsons/` — Tool Ecosystem (33 dirs)
`assetfinder, chaos, chaos-client, dalfox, dirsearch, feroxbuster, ffuf, findomain/Findomain, gau, gobuster, joomscan, LinkFinder, masscan, nikto, nmap (full source tree + nmap.json), nuclei, osmedeus, ParamSpider, RustScan, SecLists (4.8 GB wordlists), SecretFinder, Sn1per, sqlmap, sslscan, subfinder, testssl, wappalyzer, waybackurls, WhatWeb, wpscan, XSStrike, zaproxy`.
- Tool definition JSONs (e.g. `jsons/nmap/nmap.json`) shape: `tool, tool_capabilities, user_prompts, execution_conditions, error_situations, full_execution_process, user_input_schema, tool_communication_protocol, ai_integration_examples` — loaded by `tool_manager`.
- **Grep hygiene (user directive):** exclude `jsons/SecLists|Sn1per|zaproxy|osmedeus|Findomain|nmap|feroxbuster|dirsearch` and `--exclude-dir=node_modules --exclude-dir=dist` when searching the repo.

---

## 10. Conventions & Non-Negotiables (from session history)

1. **Faster workflow** — user: "make it faster": batch parallel tool calls, minimal output, don't stop to ask; "Continue if you have next steps".
2. On command failure print minimal `[SKIP]`; tool_executor emits `[SKIP] Command skipped` / `[SKIP] Command timed out` — keep that style.
3. **Timeout clamp**: `max(10, min(int(timeout or 300), hard_limit))` — always.
4. **PDF is pure-Python** (hand-rolled in `technique_report.py`) — no weasyprint/reportlab dependence for the technique PDF.
5. **Techniques source of truth = `frontend/src/data/bughunter-skills.ts`**; backend executes frontend-sent `commands`.
6. Volume4 is ahead; copy specific files to Volume2 only; never mirror whole dirs; Volume3 jsons read-only.
7. Verify after changes: `python3 -m py_compile <files>` (both volumes), `npm run build` in frontend (tsc + vite), `docker compose config` for compose validity.
8. Style: no code comments unless asked; concise replies; red/black cyber aesthetic (Tailwind arbitrary colors, neon-border, scanline).

---

## 11. Key File Index (Volume4)

```
brahmastra/
├── docker-compose.yml          # tools/backend/cloud/frontend services
├── setup.sh / start.sh / start-prod.sh
├── .env / .env.example
├── backend/
│   ├── Dockerfile, requirements.txt, run.py, brahmastra.db
│   ├── reports/                # scan + technique reports, memory/
│   └── app/
│       ├── main.py             # FastAPI app, /api/health, /api/info, /reports mount
│       ├── core/config.py      # settings, PROJECT_ROOT, SECLISTS_DIR, TOOLS/CLOUD_SERVICE_URL
│       ├── core/database.py    # init_db, engine
│       ├── models/scan.py      # Scan, AgentLog
│       ├── api/v1/endpoints/
│       │   ├── scans.py        # scan lifecycle + tools/system/cloud + WS /ws/{scan_id}
│       │   └── bughunter.py    # /execute /cancel /reports /history /report/{id}/{fmt}
│       │                       # WS /ws/{exec_id}, WS /ws/terminal/{sid}, POST /llm/chat (SSE)
│       ├── services/
│       │   ├── llm_service.py      # chat_stream + VAANI/CORE prompts
│       │   ├── technique_report.py # md/html/pdf generators, parsers, list/get_path
│       │   ├── findings_memory.py  # per-target JSON memory, inject_context
│       │   └── scan_service.py     # scan state machine
│       └── utils/
│           ├── tool_executor.py    # remote/local exec, [SKIP], timeout clamp, builders
│           ├── tool_manager.py     # JSON tool registry singleton
│           └── ws_manager.py       # ConnectionManager + buffers
├── frontend/
│   ├── Dockerfile, vite.config.ts, nginx.conf, package.json
│   └── src/
│       ├── App.tsx             # PasswordGate → page state (dashboard/chat/history/info)
│       ├── pages/              # Dashboard, BugHunterSkills, LLMChat, ScanHistory, SystemInfo, SettingsPage
│       ├── components/         # agents/, layout/, scans/, terminal/, PasswordGate
│       ├── context/            # ScanContext, WebSocketContext
│       ├── data/bughunter-skills.ts   # ★ 29 skills — technique source of truth
│       ├── hooks/useWebSocket.ts
│       ├── utils/api.ts        # brahmastraApi
│       └── types/index.ts, styles/globals.css
├── tools-service/app/main.py   # :9000 command execution + SSE
├── cloud-service/app/main.py   # :9101 OpenRouter analysis + backend callbacks
└── jsons/                      # 33 tool dirs + SecLists + tool JSON definitions
```
