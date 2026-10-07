import asyncio
import json
import os
from typing import Optional, Callable, Dict, Any

from app.core.config import settings
from app.utils.tool_manager import tool_manager, SECLISTS_DIR, TOOLS_DIR, ToolDefinition


class ToolExecutor:
    def __init__(self):
        self.running_processes: Dict[str, asyncio.subprocess.Process] = {}

    async def execute(
        self,
        run_id: str,
        command: str,
        output_callback: Optional[Callable[[str, str], None]] = None,
        timeout: int = 300,
        cwd: Optional[str] = None
    ) -> Dict[str, Any]:
        hard_limit = getattr(settings, "SCAN_TIMEOUT", 300) or 300
        timeout = max(10, min(int(timeout or 300), int(hard_limit)))
        service_url = settings.TOOLS_SERVICE_URL
        if service_url:
            return await self._execute_remote(service_url, run_id, command, output_callback, timeout)
        return await self._execute_local(run_id, command, output_callback, timeout, cwd)

    async def _execute_remote(
        self,
        service_url: str,
        run_id: str,
        command: str,
        output_callback: Optional[Callable[[str, str], None]],
        timeout: int,
    ) -> Dict[str, Any]:
        import httpx

        result = {"stdout": "", "stderr": "", "returncode": -1, "command": command}

        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{service_url}/execute",
                    json={"run_id": run_id, "command": command, "timeout": timeout},
                    headers={"Accept": "text/event-stream"},
                ) as resp:
                    if resp.status_code != 200:
                        body = await resp.aread()
                        result["stderr"] = f"Tools service error (HTTP {resp.status_code}): {body.decode()[:300]}"
                        return result

                    stdout_lines = []
                    stderr_lines = []

                    async for chunk in resp.aiter_lines():
                        if not chunk.startswith("data: "):
                            continue
                        payload = chunk[len("data: "):]
                        try:
                            msg = json.loads(payload)
                        except json.JSONDecodeError:
                            continue

                        event = msg.get("event")
                        if event == "start":
                            continue

                        if event == "exit":
                            result["returncode"] = msg.get("returncode", -1)
                            break

                        if event == "cancelled":
                            result["returncode"] = -1
                            result["stdout"] = "\n".join(stdout_lines) if stdout_lines else ""
                            result["stderr"] = "\n".join(stderr_lines) if stderr_lines else ""
                            if output_callback:
                                await output_callback(run_id, "[CANCELLED]")
                            return result

                        if event == "error":
                            result["stderr"] = msg.get("message", "Unknown error")
                            result["returncode"] = -1
                            if output_callback:
                                await output_callback(run_id, "[SKIP] Command skipped")
                            return result

                        line = msg.get("line", "")
                        stream = msg.get("stream", "stdout")
                        if stream == "stdout":
                            stdout_lines.append(line)
                        else:
                            stderr_lines.append(line)

                        if output_callback and stream == "stdout":
                            await output_callback(run_id, line)

                    result["stdout"] = "\n".join(stdout_lines) if stdout_lines else ""
                    result["stderr"] = "\n".join(stderr_lines) if stderr_lines else ""

                    if output_callback:
                        if result["returncode"] == 0:
                            await output_callback(run_id, "[EXIT] ✓")
                        else:
                            await output_callback(run_id, "[SKIP] Command skipped")

        except httpx.ConnectError as e:
            result["stderr"] = f"Cannot connect to tools service at {service_url}: {e}"
            if output_callback:
                await output_callback(run_id, "[SKIP] Command skipped")
        except Exception as e:
            result["stderr"] = str(e)
            if output_callback:
                await output_callback(run_id, "[SKIP] Command skipped")

        return result

    async def _execute_local(
        self,
        run_id: str,
        command: str,
        output_callback: Optional[Callable[[str, str], None]],
        timeout: int,
        cwd: Optional[str],
    ) -> Dict[str, Any]:
        result = {"stdout": "", "stderr": "", "returncode": -1, "command": command}

        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                shell=True
            )
            self.running_processes[run_id] = process

            async def read_stream(stream, name: str):
                output = ""
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                    output += decoded + "\n"
                    if name == "stdout" and output_callback:
                        await output_callback(run_id, decoded)
                return output

            try:
                stdout_task = asyncio.create_task(read_stream(process.stdout, "stdout"))
                stderr_task = asyncio.create_task(read_stream(process.stderr, "stderr"))
                done, pending = await asyncio.wait(
                    [stdout_task, stderr_task],
                    timeout=timeout
                )
                for task in pending:
                    task.cancel()

                stdout = stdout_task.result() if stdout_task in done else ""
                stderr = stderr_task.result() if stderr_task in done else ""

                try:
                    await asyncio.wait_for(process.wait(), timeout=5)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()

                result["stdout"] = stdout
                result["stderr"] = stderr
                result["returncode"] = process.returncode if process.returncode is not None else -1

                if output_callback:
                    if result["returncode"] == 0:
                        await output_callback(run_id, "[EXIT] ✓")
                    else:
                        await output_callback(run_id, "[SKIP] Command skipped")

            except asyncio.TimeoutError:
                process.kill()
                result["stdout"] = (result.get("stdout") or "") + "\n[SKIP] Command timed out"
                result["returncode"] = -1
                if output_callback:
                    await output_callback(run_id, "[SKIP] Timeout — command skipped")

        except Exception as e:
            result["stderr"] = str(e)
            result["returncode"] = -1
            if output_callback:
                await output_callback(run_id, "[SKIP] Command skipped")

        if run_id in self.running_processes:
            del self.running_processes[run_id]

        return result

    def cancel(self, run_id: str):
        service_url = settings.TOOLS_SERVICE_URL
        if service_url:
            import httpx
            try:
                httpx.post(f"{service_url}/cancel/{run_id}", timeout=3)
            except Exception:
                pass
            return

        if run_id in self.running_processes:
            self.running_processes[run_id].kill()
            del self.running_processes[run_id]

    def build_nmap_command(self, target: str, scan_type: str = "basic", ports: str = "", extra_args: str = "") -> str:
        base = "nmap"
        if scan_type == "quick":
            return f"{base} -T4 -F {target} 2>&1"
        elif scan_type == "basic":
            return f"{base} -sV -sC -T4 --top-ports 1000 {target} 2>&1"
        elif scan_type == "full":
            return f"{base} -sV -sC -O -T4 -p- {target} 2>&1"
        elif scan_type == "udp":
            return f"{base} -sU --top-ports 100 {target} 2>&1"
        elif ports:
            return f"{base} -sV -sC -T4 -p {ports} {target} 2>&1"
        return f"{base} {extra_args} {target} 2>&1"

    def build_gobuster_command(self, target: str, mode: str = "dir", wordlist: str = "", extensions: str = "") -> str:
        if not wordlist:
            wordlist = os.path.join(SECLISTS_DIR, "Discovery", "Web-Content", "common.txt")
        if not os.path.exists(wordlist):
            wordlist = os.path.join(SECLISTS_DIR, "Discovery", "Web-Content", "common.txt")

        ext_flag = f"-x {extensions}" if extensions else ""
        return f"gobuster {mode} -u http://{target} -w {wordlist} {ext_flag} -t 50 2>&1"

    def build_dirsearch_command(self, target: str, wordlist: str = "", extensions: str = "") -> str:
        if not wordlist:
            wordlist = os.path.join(SECLISTS_DIR, "Discovery", "Web-Content", "common.txt")
        ext_flag = f"-e {extensions}" if extensions else ""
        return f"dirsearch -u http://{target} -w {wordlist} {ext_flag} -t 50 --format plain 2>&1"

    def build_subfinder_command(self, target: str) -> str:
        return f"subfinder -d {target} -all 2>&1"

    def build_nikto_command(self, target: str) -> str:
        return f"nikto -h http://{target} -ssl -Format txt 2>&1"

    def build_sqlmap_command(self, target: str, url: str = "") -> str:
        if not url:
            url = f"http://{target}"
        return f"sqlmap -u {url} --batch --random-agent --level 2 2>&1"

    def build_whatweb_command(self, target: str) -> str:
        return f"whatweb -v {target} 2>&1"

    def build_wpscan_command(self, target: str) -> str:
        return f"wpscan --url http://{target} --no-update 2>&1"

    def build_rustscan_command(self, target: str) -> str:
        return f"rustscan -a {target} -- -sV -sC 2>&1"

    def build_masscan_command(self, target: str) -> str:
        return f"masscan -p1-1000 {target} --rate=1000 2>&1"

    def build_feroxbuster_command(self, target: str) -> str:
        wordlist = os.path.join(SECLISTS_DIR, "Discovery", "Web-Content", "common.txt")
        return f"feroxbuster -u http://{target} -w {wordlist} -t 50 2>&1"

    def build_ffuf_command(self, target: str) -> str:
        wordlist = os.path.join(SECLISTS_DIR, "Discovery", "Web-Content", "common.txt")
        return f"ffuf -u http://{target}/FUZZ -w {wordlist} -t 50 -mc 200,301,302,403 2>&1"

    def build_dalfox_command(self, target: str) -> str:
        return f"dalfox url http://{target} --waf-evasion 2>&1"

    def build_xsstrike_command(self, target: str) -> str:
        return f"xsstrike -u http://{target} --crawl 2>&1"

    def build_zaproxy_command(self, target: str) -> str:
        return f"zap-cli quick-scan --self-contained http://{target} 2>&1"

    def build_hydra_command(self, target: str) -> str:
        wordlist = os.path.join(SECLISTS_DIR, "Passwords", "Common-Credentials", "top-20-common-SSH-passwords.txt")
        return f"hydra -l admin -P {wordlist} {target} ssh 2>&1"

    def build_joomscan_command(self, target: str) -> str:
        return f"joomscan -u http://{target} 2>&1"

    def build_sslscan_command(self, target: str) -> str:
        return f"sslscan {target} 2>&1"

    def build_testssl_command(self, target: str) -> str:
        return f"testssl {target} 2>&1"

    def build_wappalyzer_command(self, target: str) -> str:
        return f"wappalyzer http://{target} 2>&1"

    def build_gau_command(self, target: str) -> str:
        return f"gau {target} 2>&1"

    def build_waybackurls_command(self, target: str) -> str:
        return f"waybackurls {target} 2>&1"

    def build_nuclei_command(self, target: str) -> str:
        return f"nuclei -u {target} -rl 10 2>&1"

    def build_linkfinder_command(self, target: str) -> str:
        script = os.path.join(TOOLS_DIR, "LinkFinder", "linkfinder.py")
        if os.path.exists(script):
            return f"python3 {script} -i {target} -o cli 2>&1"
        return "echo '[BRAHMASTRA] LinkFinder not found at jsons/LinkFinder/'"

    def build_secretfinder_command(self, target: str) -> str:
        script = os.path.join(TOOLS_DIR, "SecretFinder", "SecretFinder.py")
        if os.path.exists(script):
            return f"python3 {script} -i {target} -o cli 2>&1"
        return "echo '[BRAHMASTRA] SecretFinder not found at jsons/SecretFinder/'"

    def build_paramspider_command(self, target: str) -> str:
        return f"paramspider -d {target} 2>&1"

    def build_chaos_command(self, target: str) -> str:
        return f"chaos -d {target} -silent 2>&1"

    def build_findomain_command(self, target: str) -> str:
        return f"findomain -t {target} -silent 2>&1"


tool_executor = ToolExecutor()