import json
import os
from typing import Dict, Any, List, Optional

TOOLS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "jsons"))
SECLISTS_DIR = os.path.join(TOOLS_DIR, "SecLists")


class ToolDefinition:
    def __init__(self, data: Dict[str, Any]):
        self.raw = data
        self.tool = data.get("tool", {})
        self.capabilities = data.get("tool_capabilities", {})
        self.prompts = data.get("user_prompts", {})
        self.conditions = data.get("execution_conditions", {})
        self.errors = data.get("error_situations", {})
        self.process = data.get("full_execution_process", {})
        self.input_schema = data.get("user_input_schema", {})
        self.comms = data.get("tool_communication_protocol", {})

    @property
    def name(self) -> str:
        return self.tool.get("name", "unknown")

    @property
    def description(self) -> str:
        return self.tool.get("description", "")

    @property
    def binary_path(self) -> str:
        return self.tool.get("binary_path") or self.tool.get("binary") or self.name

    @property
    def category(self) -> str:
        path = self.tool.get("path", "")
        if "/" in path:
            return path.split("/")[0].strip()
        return path if path else "Other"

    def get_prompts(self, intent: str = "") -> List[Dict]:
        if intent:
            for key, prompts in self.prompts.items():
                for p in prompts:
                    if p.get("intent") == intent:
                        return [p]
            return []
        all_prompts = []
        for key, prompts in self.prompts.items():
            if isinstance(prompts, list):
                all_prompts.extend(prompts)
        return all_prompts

    def get_commands_for_category(self, category: str) -> List[Dict]:
        return self.get_prompts(category)


class ToolManager:
    _instance = None
    _tools: Dict[str, ToolDefinition] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load_tools()
        return cls._instance

    def _load_tools(self):
        if not os.path.exists(TOOLS_DIR):
            return
        for root, dirs, files in os.walk(TOOLS_DIR):
            for f in files:
                if f.endswith(".json") and f != "package.json":
                    fp = os.path.join(root, f)
                    try:
                        with open(fp, "r") as fh:
                            data = json.load(fh)
                        if isinstance(data, dict) and "tool" in data:
                            name = data["tool"].get("name", f.replace(".json", ""))
                            self._tools[name] = ToolDefinition(data)
                    except (json.JSONDecodeError, Exception):
                        pass

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        return self._tools.get(name)

    def get_tools_by_category(self, category: str) -> List[ToolDefinition]:
        return [t for t in self._tools.values() if t.category.lower() == category.lower()]

    def list_tools(self) -> List[Dict]:
        return [{"name": t.name, "description": t.description[:80], "category": t.category} for t in self._tools.values()]

    @property
    def tools(self) -> Dict[str, ToolDefinition]:
        return self._tools

    def find_seclist(self, pattern: str) -> List[str]:
        matches = []
        if not os.path.exists(SECLISTS_DIR):
            return matches
        for root, dirs, files in os.walk(SECLISTS_DIR):
            for f in files:
                if pattern.lower() in f.lower():
                    matches.append(os.path.join(root, f))
        return matches[:10]

    def get_recon_tools(self) -> List[ToolDefinition]:
        return [t for t in self._tools.values() if t.category in [
            "Recon & Subdomain Scanning", "URL & Parameter Discovery",
            "JavaScript Analysis", "Automation Frameworks"
        ]]

    def get_scan_tools(self) -> List[ToolDefinition]:
        return [t for t in self._tools.values() if t.category in [
            "Port Scanning & Network Scanning", "Directory Endpoint Scanning"
        ]]

    def get_vuln_tools(self) -> List[ToolDefinition]:
        return [t for t in self._tools.values() if t.category in [
            "Vulnerability Scanners", "Injection & Exploitation Scanners",
            "Web App Testing Proxy Tools"
        ]]


tool_manager = ToolManager()