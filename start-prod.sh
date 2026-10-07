#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Brahmastra — Production Start        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"

# ─── Prerequisites ───
if [[ ! -f "${PROJECT_ROOT}/.env" ]]; then
  echo -e "${RED}[!]${NC} No .env found at project root."
  echo -e "${YELLOW}[!]${NC} Run setup.sh first, then edit .env with your API keys."
  exit 1
fi

# ─── Extract Vite vars for Docker build ───
# The docker-compose.yml passes --build-arg VITE_APP_PASSWORD from the env.
# Source the .env so the VITE_* vars are available as shell env vars.
set -a
source "${PROJECT_ROOT}/.env"
set +a

# ─── Docker Compose ───
echo -e "${GREEN}[+]${NC} Building and starting services..."
docker compose -f "${PROJECT_ROOT}/docker-compose.yml" up --build -d

echo -e "${GREEN}[+]${NC} Done!"
echo ""
echo -e "  Frontend: ${CYAN}http://localhost:80${NC}"
echo -e "  API:      ${CYAN}http://localhost:8000/api${NC}"
echo -e "  Health:   ${CYAN}http://localhost:8000/api/health${NC}"
echo -e "  Logs:     ${YELLOW}docker compose logs -f${NC}"
echo -e "  Stop:     ${YELLOW}docker compose down${NC}"
