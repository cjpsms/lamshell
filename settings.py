"""LamShell settings: config.json next to server.py (gitignored, chmod 600).

Made in the terminal, never on the web page:  python3 server.py --setup
(also runs by itself the first time server.py or the `lamshell` launcher starts in a terminal with no config).
The teacher password is stored only as a PBKDF2 hash + salt. LAMSHELL_HOST / LAMSHELL_PORT still override.

  {"host": "127.0.0.1", "port": 4011, "teacher": {"salt": "...", "hash": "...", "iterations": 200000}}
"""
import getpass
import hashlib
import json
import os
import secrets
import socket
from pathlib import Path

PATH = Path(__file__).resolve().parent / "config.json"
ITERATIONS = 200_000
DEFAULTS = {"host": "127.0.0.1", "port": 4011, "teacher": None, "ai": None}


def load():
    try:
        cfg = {**DEFAULTS, **json.loads(PATH.read_text())}
    except (OSError, ValueError):
        cfg = dict(DEFAULTS)
    cfg["host"] = os.environ.get("LAMSHELL_HOST", cfg["host"])
    cfg["port"] = int(os.environ.get("LAMSHELL_PORT", cfg["port"]))
    return cfg


def exists():
    return PATH.exists()


def save(cfg):
    data = {k: cfg[k] for k in DEFAULTS}
    fd = os.open(PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=1)
    os.chmod(PATH, 0o600)


def hash_password(pw, salt=None, iterations=ITERATIONS):
    salt = salt or secrets.token_hex(16)
    return {"salt": salt, "hash": hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), iterations).hex(),
            "iterations": iterations}


def check_password(pw):
    t = load().get("teacher")
    if not t or not pw:
        return False
    h = hash_password(pw, t["salt"], t.get("iterations", ITERATIONS))["hash"]
    return secrets.compare_digest(h, t["hash"])


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))   # no packet is sent; just picks the outgoing interface
            return s.getsockname()[0]
    except OSError:
        return None


def _ask(prompt, default=""):
    v = input(f"{prompt}" + (f" [{default}]" if default != "" else "") + ": ").strip()
    return v or str(default)


def ask_ai(old):
    """Which AI translates Thai (see providers.py). The key is stored in config.json (chmod 600), or left empty to use
    the provider's environment variable."""
    import providers
    names = list(providers.PROVIDERS)
    cur = old.get("provider") or "claude-cli"
    print("AI ที่ใช้แปลภาษาไทย (ไม่มี AI ก็เล่นได้ เกมจะใช้พจนานุกรมในตัวแทน):")
    for i, n in enumerate(names, 1):
        print(f"  {i}) {providers.PROVIDERS[n]['label']}{' (ไม่ต้องใช้ key)' if n == 'claude-cli' else ''}")
    while True:
        pick = _ask("เลือก", names.index(cur) + 1 if cur in names else 1)
        if pick.isdigit() and 1 <= int(pick) <= len(names):
            break
        print(f"  พิมพ์เลข 1-{len(names)}")
    provider = names[int(pick) - 1]
    spec = providers.PROVIDERS[provider]
    model = _ask("model", old.get("model") if provider == cur and old.get("model") else spec["model"])
    key = old.get("key") if provider == cur else None
    if spec["env"]:
        hint = "Enter = ใช้ key เดิม" if key else f"Enter = ใช้ตัวแปร {spec['env']}"
        typed = getpass.getpass(f"API key ({hint}): ").strip()
        key = typed or key
    return {"provider": provider, "model": model, "key": key or None}


def setup():
    """Interactive setup in the terminal. Enter keeps the current value."""
    old = load() if exists() else dict(DEFAULTS)
    print("=== ตั้งค่าล่ามเชลล์ ===  (กด Enter = ใช้ค่าเดิม)")
    lan = _ask("ให้เครื่องนักเรียนในห้องเข้าเล่นผ่านเครือข่ายได้ไหม? (y/n)", "y" if old["host"] == "0.0.0.0" else "n")
    host = "0.0.0.0" if lan.lower().startswith("y") else "127.0.0.1"
    while True:
        port = _ask("พอร์ต", old["port"])
        if port.isdigit() and 1024 <= int(port) <= 65535:
            break
        print("  พอร์ตต้องเป็นตัวเลข 1024-65535")
    teacher = old.get("teacher")
    while True:
        pw = getpass.getpass("รหัสผ่านครู (อย่างน้อย 6 ตัว" + (", Enter = ใช้รหัสเดิม" if teacher else "") + "): ")
        if not pw and teacher:
            break
        if len(pw) < 6:
            print("  สั้นเกินไป อย่างน้อย 6 ตัวอักษร")
            continue
        if getpass.getpass("พิมพ์รหัสอีกครั้ง: ") != pw:
            print("  สองครั้งไม่ตรงกัน ลองใหม่")
            continue
        teacher = hash_password(pw)
        break
    ai = ask_ai(old.get("ai") or {})
    changed_pw = teacher is not old.get("teacher")
    save({"host": host, "port": int(port), "teacher": teacher, "ai": ai})
    print(f"บันทึกแล้ว: {PATH}  (รหัสผ่านเก็บเป็น hash อ่านย้อนกลับไม่ได้)")
    ip = lan_ip() if host == "0.0.0.0" else None
    print(f"หน้าครู: http://127.0.0.1:{port}/teacher" + (f"   นักเรียนเข้าที่: http://{ip}:{port}/" if ip else ""))
    return changed_pw
