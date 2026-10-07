#!/usr/bin/env bash
set -euo pipefail

# ─── Brahmastra Setup Script ───
# Run this from the project root directory.
# Usage: bash setup.sh

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Brahmastra Setup                     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo -e "${YELLOW}[*]${NC} Project root: ${PROJECT_ROOT}"

# ─── 1. System Dependency Check ───
echo -e "\n${GREEN}[1/4]${NC} Checking system dependencies..."

SYSTEM_TOOLS=(
  nmap sqlmap nikto subfinder assetfinder findomain gau
  gobuster feroxbuster ffuf nuclei dalfox xsstrike whatweb
  theharvester curl jq whois dig nslookup rustscan masscan hydra
)

MISSING=()
for tool in "${SYSTEM_TOOLS[@]}"; do
  if command -v "$tool" &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $tool"
  else
    echo -e "  ${RED}✗${NC} $tool"
    MISSING+=("$tool")
  fi
done

PYTHON_SCRIPTS=(
  "LinkFinder/linkfinder.py:python3"
  "SecretFinder/SecretFinder.py:python3"
)
for entry in "${PYTHON_SCRIPTS[@]}"; do
  script="${entry%%:*}"
  full_path="${PROJECT_ROOT}/jsons/${script}"
  if [[ -f "$full_path" ]]; then
    echo -e "  ${GREEN}✓${NC} $script"
  else
    echo -e "  ${RED}✗${NC} $script (not found)"
    MISSING+=("$script")
  fi
done

SECLISTS_DIR="${PROJECT_ROOT}/jsons/SecLists"
if [[ -d "$SECLISTS_DIR" ]]; then
  WL_COUNT=$(find "$SECLISTS_DIR" -type f | wc -l)
  echo -e "  ${GREEN}✓${NC} SecLists ($WL_COUNT wordlist files)"
else
  echo -e "  ${RED}✗${NC} SecLists not found at $SECLISTS_DIR (4.8 GB directory)"
  echo -e "  ${YELLOW}⚠${NC} Copy SecLists from original source if missing"
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo -e "\n${YELLOW}[!]${NC} Missing ${#MISSING[@]} tools. Install with:"
  echo -e "  ${CYAN}sudo apt update && sudo apt install -y ${MISSING[*]}${NC}"
fi

# ─── 2. Python Virtual Environment ───
echo -e "\n${GREEN}[2/4]${NC} Setting up Python virtual environment..."

# Remove old tools-venv (has absolute symlinks to samadhan's pyenv)
if [[ -d "${PROJECT_ROOT}/tools-venv" ]]; then
  echo -e "  ${YELLOW}[!]${NC} Removing stale tools-venv (built for a different machine)..."
  rm -rf "${PROJECT_ROOT}/tools-venv"
fi

python3 -m venv "${PROJECT_ROOT}/tools-venv"
echo -e "  ${GREEN}✓${NC} Created tools-venv"

source "${PROJECT_ROOT}/tools-venv/bin/activate"
pip install --upgrade pip --quiet
pip install -r "${PROJECT_ROOT}/backend/requirements.txt" --quiet
echo -e "  ${GREEN}✓${NC} Installed Python dependencies"

# ─── 3. Environment Configuration ───
echo -e "\n${GREEN}[3/4]${NC} Setting up environment..."

if [[ ! -f "${PROJECT_ROOT}/.env" ]]; then
  if [[ -f "${PROJECT_ROOT}/.env.example" ]]; then
    cp "${PROJECT_ROOT}/.env.example" "${PROJECT_ROOT}/.env"
    echo -e "  ${GREEN}✓${NC} Created .env from .env.example"
    echo -e "  ${YELLOW}[!]${NC} Edit .env with your API keys before starting the backend"
  else
    echo -e "  ${RED}✗${NC} .env.example not found — skipping"
  fi
else
  echo -e "  ${GREEN}✓${NC} .env already exists"
fi

# ─── 4. Verify Backend Starts ───
echo -e "\n${GREEN}[4/4]${NC} Testing backend startup..."

if source "${PROJECT_ROOT}/tools-venv/bin/activate" && \
   timeout 8 python3 -c "
from app.core.config import settings, PROJECT_ROOT, SECLISTS_DIR, TOOLS_DIR
print(f'  PROJECT_ROOT: {PROJECT_ROOT}')
print(f'  SECLISTS_DIR: {SECLISTS_DIR}')
print(f'  TOOLS_DIR:    {TOOLS_DIR}')
print(f'  SECLISTS OK:  {__import__(\"os\").path.exists(SECLISTS_DIR)}')
" 2>&1; then
  echo -e "  ${GREEN}✓${NC} Configuration validation passed"
else
  echo -e "  ${RED}✗${NC} Configuration validation failed (check above)"
  echo -e "  ${YELLOW}[!]${NC} Make sure you're running from the project root directory"
fi

# ─── Done ───
echo -e "\n${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Setup Complete!                       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Start backend:  ${YELLOW}cd ${PROJECT_ROOT##*/} && source tools-venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload${NC}"
echo -e "  Start frontend: ${YELLOW}cd frontend && npm run dev${NC}"
echo ""
[[ ${#MISSING[@]} -gt 0 ]] && echo -e "  ${YELLOW}⚠  Missing ${#MISSING[@]} system tools (install them for full functionality)${NC}"
echo ""
