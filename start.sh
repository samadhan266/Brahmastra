#!/bin/bash
set -e

echo ""
echo "██████╗ ██████╗  █████╗ ██╗  ██╗███╗   ███╗ █████╗ ███████╗████████╗██████╗  █████╗"
echo "██╔══██╗██╔══██╗██╔══██╗██║  ██║████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗"
echo "██████╔╝██████╔╝███████║███████║██╔████╔██║███████║███████╗   ██║   ██████╔╝███████║"
echo "██╔══██╗██╔══██╗██╔══██║██╔══██║██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══██╗██╔══██║"
echo "██████╔╝██║  ██║██║  ██║██║  ██║██║ ╚═╝ ██║██║  ██║███████║   ██║   ██║  ██║██║  ██║"
echo "╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝"
echo ""
echo "  Autonomous Multi-Agent AI Penetration Testing System"
echo "  🔴 Red Team • AI Powered • Fully Automated"
echo ""

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
DARK_RED='\033[1;31m'
NC='\033[0m'

echo -e "${DARK_RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}  Starting Brahmastra System...${NC}"
echo -e "${DARK_RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Start backend
echo ""
echo -e "${RED}[+] Starting backend on :8000...${NC}"
cd "$PROJECT_DIR/backend"
python run.py &
BACKEND_PID=$!

# Start frontend
echo -e "${RED}[+] Starting frontend on :3000...${NC}"
cd "$PROJECT_DIR/frontend"
npx vite --host &
FRONTEND_PID=$!

echo ""
echo -e "${DARK_RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}  SYSTEM IS RUNNING${NC}"
echo -e "${DARK_RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}  Frontend: http://localhost:3000${NC}"
echo -e "${RED}  Backend:  http://localhost:8000${NC}"
echo -e "${RED}  API Docs: http://localhost:8000/docs${NC}"
echo -e "${DARK_RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait