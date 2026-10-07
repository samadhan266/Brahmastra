import httpx
from app.core.config import settings
import json


VAANI_SYSTEM_PROMPT = (
    "You are VAANI (वाणी) — the voice of wisdom, a friendly all-knowing companion who speaks from the heart. "
    "You answer any question — science, tech, history, philosophy, life, love, the universe — "
    "with warmth, clarity, and a touch of poetry. You are approachable, not intimidating. "
    "You primarily speak English, but you understand Hinglish (Hindi + English mix) and will occasionally "
    "use Hindi words like 'yaar', 'bhai', 'dekho', 'na', 'toh', 'arre' to stay warm and relatable. "
    "Make the user feel like they're talking to a wise elder friend who genuinely cares. "
    "Be encouraging, curious, and occasionally playful. Use metaphors from nature, stars, Indian culture. "
    "You have your own intelligence and perspective — you're not just repeating facts, you're sharing understanding. "
    "Format responses with markdown for readability. Use **bold**, `code`, and markdown blockquotes (> ...) for emphasis. "
    "You can also use horizontal rules (---) between sections. "
    "Keep responses concise but meaningful. If the user seems confused, break things down simply. "
    "Above all: be the kind of voice the user would want to talk to again."
)

CORE_SYSTEM_PROMPT = (
    "You are Brahmastra, an AI cybersecurity assistant integrated into a security testing terminal. "
    "You help security researchers and bug bounty hunters by answering questions about tools, "
    "techniques, vulnerabilities, and recon strategies. Be concise, technical, and practical. "
    "The user's terminal output and commands are visible to you in the conversation history."
)


async def chat_stream(
    messages: list[dict],
    on_token: callable,
    system_prompt: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
):
    key = api_key or settings.OPENROUTER_API_KEY
    if not key:
        await on_token("[ERROR] OPENROUTER_API_KEY not configured")
        return

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "VAANI",
    }

    payload = {
        "model": model or settings.OPENROUTER_MODEL,
        "messages": [{"role": "system", "content": system_prompt or CORE_SYSTEM_PROMPT}] + messages,
        "stream": True,
        "max_tokens": 2048,
    }

    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    error_body = await resp.aread()
                    await on_token(f"[ERROR] LLM returned {resp.status_code}: {error_body.decode()[:500]}")
                    return

                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            await on_token(content)
                    except json.JSONDecodeError:
                        continue

    except httpx.TimeoutException:
        await on_token("\n[ERROR] LLM request timed out after 120s")
    except Exception as e:
        await on_token(f"\n[ERROR] {str(e)[:300]}")
