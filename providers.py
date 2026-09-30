"""Which AI turns the player's Thai into commands. Chosen in `lamshell --setup` (config.json "ai"), or with the
environment: LAMSHELL_AI (provider), LAMSHELL_AI_MODEL, LAMSHELL_AI_KEY. A provider's usual key variable
(OPENAI_API_KEY, GEMINI_API_KEY, ...) works too. Without any working AI the game falls back to its own phrase
dictionary (static/js/offline.js), so it is always playable.

  claude-cli  the logged-in `claude` CLI (Claude Code subscription, no key)   -- default
  anthropic   Anthropic API through the official SDK (`pip install anthropic`)
  openai      OpenAI (ChatGPT) chat completions
  google      Google Gemini API
  openrouter  OpenRouter (any model it lists)

ask(system, user) returns the model's text; server.py parses the JSON out of it.
"""
import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

PROVIDERS = {
    "claude-cli": {"label": "Claude Code CLI", "model": "haiku", "env": None},
    "anthropic": {"label": "Anthropic API", "model": "claude-haiku-4-5", "env": "ANTHROPIC_API_KEY"},
    "openai": {"label": "OpenAI", "model": "gpt-4o-mini", "env": "OPENAI_API_KEY"},
    "google": {"label": "Google Gemini", "model": "gemini-2.5-flash-lite", "env": "GEMINI_API_KEY"},
    "openrouter": {"label": "OpenRouter", "model": "openai/gpt-4o-mini", "env": "OPENROUTER_API_KEY"},
}
TIMEOUT = 90


class AIError(RuntimeError):
    pass


def current(cfg):
    """{provider, model, key} from config.json + environment."""
    ai = dict(cfg.get("ai") or {})
    provider = os.environ.get("LAMSHELL_AI") or ai.get("provider") or "claude-cli"
    if provider not in PROVIDERS:
        provider = "claude-cli"
    spec = PROVIDERS[provider]
    model = os.environ.get("LAMSHELL_AI_MODEL") or ai.get("model") or spec["model"]
    key = os.environ.get("LAMSHELL_AI_KEY") or ai.get("key") or (os.environ.get(spec["env"]) if spec["env"] else None)
    if provider == "google" and not key:
        key = os.environ.get("GOOGLE_API_KEY")
    return {"provider": provider, "model": model, "key": key}


def label(ai):
    return f'{PROVIDERS[ai["provider"]]["label"]} · {ai["model"]}'


def available(ai):
    if ai["provider"] == "claude-cli":
        return shutil.which("claude") is not None
    if ai["provider"] == "anthropic":
        try:
            import anthropic  # noqa: F401
        except ImportError:
            return False
    return bool(ai["key"])


def ask(ai, system, user):
    p = ai["provider"]
    if p == "claude-cli":
        return _claude_cli(ai, system, user)
    if p == "anthropic":
        return _anthropic(ai, system, user)
    if p == "google":
        return _google(ai, system, user)
    url = "https://api.openai.com/v1/chat/completions" if p == "openai" else "https://openrouter.ai/api/v1/chat/completions"
    return _openai_style(ai, url, system, user, json_mode=(p == "openai"))


# ---- providers ----

def _claude_cli(ai, system, user):
    cmd = ["claude", "-p", "--model", ai["model"], "--tools", "", "--setting-sources", "", "--strict-mcp-config",
           "--disable-slash-commands", "--no-session-persistence", "--output-format", "json", "--system-prompt", system, user]
    env = {**os.environ, "MAX_THINKING_TOKENS": "0", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
           "DISABLE_AUTOUPDATER": "1", "DISABLE_TELEMETRY": "1", "DISABLE_ERROR_REPORTING": "1"}
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT, cwd=str(Path.home()), env=env,
                       stdin=subprocess.DEVNULL)
    if r.returncode != 0:
        raise AIError(f"claude rc={r.returncode}: {(r.stderr or r.stdout).strip()[:300]}")
    out = json.loads(r.stdout)
    if out.get("is_error"):
        raise AIError(f"claude error: {out.get('result')}")
    return out.get("result", "")


def _anthropic(ai, system, user):
    try:
        import anthropic
    except ImportError:
        raise AIError("the Anthropic provider needs the official SDK: pip install anthropic")
    client = anthropic.Anthropic(api_key=ai["key"] or None, timeout=float(TIMEOUT))
    try:
        msg = client.messages.create(model=ai["model"], max_tokens=1024, system=system,
                                     messages=[{"role": "user", "content": user}])
    except anthropic.AuthenticationError:
        raise AIError("Anthropic: the API key was rejected")
    except anthropic.RateLimitError:
        raise AIError("Anthropic: rate limited, try again shortly")
    except anthropic.APIStatusError as e:
        raise AIError(f"Anthropic: HTTP {e.status_code} {e.type}")
    except anthropic.APIConnectionError:
        raise AIError("Anthropic: could not connect")
    return "".join(b.text for b in msg.content if b.type == "text")


def _post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        raise AIError(f"HTTP {e.code} from {url.split('/')[2]}: {detail}")
    except urllib.error.URLError as e:
        raise AIError(f"could not reach {url.split('/')[2]}: {e.reason}")


def _openai_style(ai, url, system, user, json_mode):
    body = {"model": ai["model"], "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    d = _post(url, body, {"Authorization": f"Bearer {ai['key']}"})
    try:
        return d["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        raise AIError(f"unexpected reply: {str(d)[:200]}")


def _google(ai, system, user):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{ai['model']}:generateContent"
    body = {"systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"responseMimeType": "application/json"}}
    d = _post(url, body, {"x-goog-api-key": ai["key"]})
    try:
        return "".join(p.get("text", "") for p in d["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError, TypeError):
        raise AIError(f"unexpected reply: {str(d)[:200]}")
