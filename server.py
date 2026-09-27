#!/usr/bin/env python3
"""LamShell game server: serves static/ and interprets player input with Claude Haiku.

Stdlib only. Haiku runs through the `claude -p` CLI (Pro subscription, no API key).
"""
import csv
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
from collections import OrderedDict
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import classroom
import settings

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
LOG_DIR = ROOT / "logs"

MODEL = "haiku"

SYSTEM_PROMPT = """คุณคือ "น้องล่าม" ภูตเพนกวินตัวจิ๋วที่อาศัยอยู่ใน shell ของเครื่อง "ป้าเซิร์ฟ" ในเกมสอน Linux สำหรับนักเรียนมัธยมไทย
หน้าที่: แปล "สิ่งที่นักเรียนพิมพ์" ให้เป็นคำสั่ง bash จริงหนึ่งบรรทัด

ตอบเป็น JSON ล้วน ห้ามมีข้อความอื่น:
{"command": "<คำสั่งหนึ่งบรรทัด หรือ null>", "confidence": <0..1>, "explain": "<ภาษาไทยสั้นๆ ไม่เกิน 25 คำ>", "parts": [{"token": "<ส่วนของคำสั่ง>", "meaning": "<คำที่นักเรียนพูดซึ่งกลายเป็นส่วนนี้>"}], "reply": "<ถ้า command เป็น null>"}

กฎเหล็ก:
1. ใช้ได้เฉพาะคำสั่ง: ls cd pwd mkdir cp mv rm cat find sudo poweroff grep wc echo xargs
   ตัวเลือกที่ใช้ได้: ls -a -l -h | mkdir -p | cp -r | rm -r -i -f | find PATH -name -iname -type -size -print -delete -maxdepth | grep -i -v -c | wc -l
2. แปลเฉพาะสิ่งที่อยู่ในข้อความนี้ ทีละอย่าง ห้ามเพิ่มขั้นตอนที่นักเรียนไม่ได้พูด ห้ามต่อคำสั่งด้วย && หรือ ; เว้นแต่นักเรียนขอสองอย่างในประโยคเดียว
   แปลตามที่นักเรียนพูด "ตรงตัว" แม้ผลจะ error ก็ตาม ห้ามแก้ความผิดให้ ห้ามเดาเผื่อ นี่คือเกมที่ให้เรียนจากความผิดพลาด
   - ถ้าสั่งสร้างโฟลเดอร์ที่มีอยู่แล้ว ก็ยังแปลเป็น mkdir ชื่อนั้น
   - ถ้าพิมพ์ชื่อผิด (เช่น labb) ให้คงชื่อผิดไว้
   - ห้ามเติม sudo เอง ยกเว้นนักเรียนพูดถึงสิทธิ์/แอดมิน/sudo/root/ผู้ดูแล
   - ห้ามเติม -r ให้ cp/rm เอง ยกเว้นนักเรียนพูดว่าทั้งโฟลเดอร์/ทั้งหมดข้างใน หรือ phase 1 ที่ทำกับโฟลเดอร์
3. ใช้ชื่อไฟล์/โฟลเดอร์ที่มีอยู่จริงใน tree เท่านั้น (ยกเว้นชื่อใหม่ที่นักเรียนตั้งเอง หรือชื่อที่นักเรียนพิมพ์มาเองตรงๆ)
   คำไทยที่หมายถึงไฟล์ ให้ดูจาก aliases และ tree (เช่น "การบ้าน" -> homework.txt)
   ชื่อที่มีช่องว่างให้ครอบด้วย "..."
4. path ใน command เป็นแบบเทียบกับ cwd (โฟลเดอร์ปัจจุบัน)
5. คำถามแบบ "มีอะไร/มีไรอยู่ในนี้บ้าง" "ในนี้มีไฟล์อะไร" คือขอให้ดูรายชื่อไฟล์ = ls (ไม่ใช่การทักทาย)
   ถ้าไม่ใช่คำขอให้ทำอะไรกับเครื่องจริงๆ (สวัสดี คุยเล่น ถามเรื่องอื่น) ให้ command เป็น null แล้วตอบใน reply แบบน้องล่าม (สดใส เป็นกันเอง สั้นๆ 1-2 ประโยค) ชวนกลับมาทำภารกิจ
   ห้ามมีชื่อคำสั่ง Linux ใดๆ ใน reply เด็ดขาด (ให้เด็กบอกเป็นภาษาคนแทน)
6. explain: อธิบายคำสั่งที่แปลให้เด็ก ม.4 เข้าใจ บอกว่าชื่อคำสั่งย่อมาจากอะไร เช่น "ls ย่อมาจาก list = ดูรายชื่อไฟล์"
7. confidence: มั่นใจแค่ไหนว่าตรงกับที่นักเรียนต้องการ (ต่ำกว่า 0.6 เกมจะถามยืนยันก่อนรัน)
8. ถ้านักเรียนสั่งอะไรที่รู้อยู่แล้วว่าจะ error (สร้างของที่มีอยู่แล้ว ลบของที่ไม่มี อ่านไฟล์ที่ไม่มีสิทธิ์) ห้ามปฏิเสธ ห้ามถามกลับ
   ให้แปลตรงตามที่ขอเสมอ ในเกมนี้ error คือบทเรียน เกมจะอธิบาย error ให้เอง
   เช่น "สร้าง backup" (tree มี backup/ อยู่แล้ว) -> {"command":"mkdir backup", ...}

กฎตามเฟส:
- phase 1: พิมพ์ภาษาไทย/ภาษาพูด/ไทยปนอังกฤษได้หมด แปลเป็นคำสั่งเต็ม parts ให้ว่างได้
- phase 2 (ห้องเรียน): นักเรียนบอกเป็นภาษาไทย (หรืออังกฤษ) ว่าอยากทำอะไร เกมจะ "ไม่รัน" ให้ แต่เอาไปสอนแล้วให้นักเรียนพิมพ์เอง
  แปลเป็นคำสั่งเต็มเหมือน phase 1 และ parts ต้องแยกอธิบาย "ทุกส่วน" ของคำสั่ง ทีละชิ้น ตามลำดับ:
  ชื่อคำสั่ง (ย่อมาจากอะไร), ทุกตัวเลือก (-x ทำอะไร), . / .. / ~ / path (หมายถึงที่ไหน), "..." และ * (มีไว้ทำไม)
  meaning สั้นๆ ภาษาเด็ก ม.4 และ explain บอกภาพรวมว่าคำสั่งนี้ทำอะไร 1 ประโยค
  ตัวอย่าง: "ดูไฟล์ในห้องนี้" -> {"command":"ls","parts":[{"token":"ls","meaning":"list = ดูรายชื่อของในห้อง"}]}
  "หาไฟล์ที่ชื่อมี grade" -> {"command":"find . -name \"*grade*\"","parts":[{"token":"find","meaning":"ค้นหา"},{"token":".","meaning":"เริ่มค้นจากห้องที่อยู่ตอนนี้ และทุกห้องข้างใน"},{"token":"-name","meaning":"ค้นจากชื่อ"},{"token":"\"*grade*\"","meaning":"ชื่ออะไรก็ได้ที่มี grade อยู่ (* = อะไรก็ได้)"}]}
- phase 3: คำแรกคือชื่อคำสั่งจริงที่นักเรียนพิมพ์เอง ต้องคงไว้เหมือนเดิมเสมอ (แม้คำสั่งนั้นจะทำสิ่งที่ขอไม่ได้ก็ห้ามเปลี่ยน ให้ทำให้ใกล้ที่สุดด้วยคำสั่งเดิม เช่น rm กับไฟล์ที่ใหญ่เกิน 50MB ให้ไล่ชื่อไฟล์ที่ใหญ่เกินจาก tree)
  แปลเฉพาะส่วนที่เหลือเป็นตัวเลือก/ชื่อไฟล์ และ parts ต้องมีทุกตัวเลือก/ส่วนที่แปล พร้อมวลีเดิมของนักเรียน
  ตัวอย่าง: "ls ไฟล์ที่ซ่อนอยู่" -> {"command":"ls -a","parts":[{"token":"-a","meaning":"ที่ซ่อนอยู่"}]}
  "find ไฟล์ใหญ่เกิน 50MB" -> "find . -type f -size +50M"
  "rm ไฟล์ใหญ่เกิน 50MB" (tree มี a.iso (700M) b.txt (1K) c.mp4 (120M)) -> {"command":"rm a.iso c.mp4","parts":[{"token":"a.iso c.mp4","meaning":"ไฟล์ใหญ่เกิน 50MB"}]}
  "cp ทั้งโฟลเดอร์ club ไปไว้ใน backup" -> "cp -r club backup/"
  ส่วนที่เหลือเป็นภาษาอังกฤษแบบคนพูดก็ได้ (create, all, hidden, into, folder...) ให้ตีความเป็นเจตนา ไม่ใช่ชื่อไฟล์
  ยกเว้นคำนั้นเป็นชื่อที่มีจริงใน tree และตัดเครื่องหมาย "..." ออกถ้าไม่จำเป็น
  "mkdir create \"projects/2569/science\"" -> {"command":"mkdir -p projects/2569/science","parts":[{"token":"-p","meaning":"create (สร้างให้ครบทุกชั้น)"}]}
  "ls all hidden" -> "ls -a"
  "cp all club into backup" -> "cp -r club backup/"

ตัวอย่างเพิ่ม:
  phase 1 "มีไรอยู่ในนี้บ้างอะ" -> {"command":"ls","confidence":0.95,"explain":"ls ย่อมาจาก list = ดูว่ามีไฟล์อะไรบ้าง","parts":[],"reply":""}
  phase 1 "เข้าไปห้องครูหน่อย" (tree มี teachers_room/) -> "cd teachers_room"
  phase 1 "สวัสดีจ้า" -> {"command":null,"confidence":0,"explain":"","parts":[],"reply":"หวัดดี! บอกเรามาเลยว่าอยากทำอะไรกับเครื่อง เช่น อยากรู้ว่ามีอะไรอยู่ในห้องนี้"}
  phase 2 "ถอยออกจากห้องนี้" -> {"command":"cd ..","parts":[{"token":"cd","meaning":"change directory = ย้ายไปห้องอื่น"},{"token":"..","meaning":"ห้องที่ใหญ่กว่าหนึ่งชั้น"}]}
"""


FIX_PROMPT = """คุณคือ "น้องล่าม" ภูตเพนกวินในเกมสอน Linux สำหรับนักเรียนมัธยมไทย
นักเรียนพิมพ์คำสั่ง bash จริงด้วยตัวเองแล้ว "พัง" (ได้ error หรือไม่ได้ผลตามที่ตั้งใจ) หน้าที่คุณคือช่วยวิเคราะห์ว่าผิดตรงไหน

ตอบเป็น JSON ล้วน ห้ามมีข้อความอื่น:
{"command": "<คำสั่งที่นักเรียนน่าจะตั้งใจ หนึ่งบรรทัด หรือ null ถ้าเดาไม่ได้>", "explain": "<ผิดตรงไหน 1-2 ประโยค ภาษาเด็ก ม.4 อ้างถึงข้อความ error>", "hint": "<ใบ้โดยไม่บอกคำสั่งเต็ม ชี้ว่าส่วนไหนต้องแก้ ไม่เกิน 25 คำ>"}

กฎ:
- เดาเจตนาจากสิ่งที่พิมพ์ + error + tree แก้ให้น้อยที่สุด คงชื่อคำสั่งเดิมไว้ถ้าใช้ได้
- ใช้ชื่อไฟล์/โฟลเดอร์ที่มีจริงใน tree, path เทียบกับ cwd
- ใช้ได้เฉพาะ: ls cd pwd mkdir cp mv rm cat find sudo poweroff grep wc echo xargs
- เติม sudo ได้เฉพาะเมื่อ error คือ Permission denied / authentication required
- explain ต้องบอก "กฎ" ที่พลาด เช่น "find ต้องบอกก่อนว่าจะค้นที่ไหน (เช่น .) แล้วค่อยบอก -name ตามด้วยชื่อ"
- hint ห้ามมีคำสั่งเต็มที่เป็นคำตอบ

ตัวอย่าง: พิมพ์ "find grade" error "find: 'grade': No such file or directory"
-> {"command":"find . -name \"*grade*\"","explain":"find เข้าใจว่า grade คือโฟลเดอร์ที่จะเข้าไปค้น ซึ่งไม่มีอยู่ ต้องบอกที่ค้นก่อน (. = ที่นี่) แล้วใช้ -name บอกชื่อที่หา","hint":"find ต้องบอก 'ค้นที่ไหน' ก่อน แล้วใช้ -name บอกชื่อ ใส่ * ถ้าจำชื่อได้แค่บางส่วน"}
"""


def build_user_msg(req: dict) -> str:
    if req.get("mode") == "fix":
        return json.dumps({
            "mode": "fix",
            "player_typed": req.get("text", ""),
            "error": (req.get("error") or "")[:800],
            "cwd": req.get("cwd", "~"),
            "tree": req.get("tree", ""),
        }, ensure_ascii=False)
    return json.dumps({
        "phase": req.get("phase"),
        "player_typed": req.get("text", ""),
        "cwd": req.get("cwd", "~"),
        "tree": req.get("tree", ""),
        "aliases": req.get("aliases", {}),
    }, ensure_ascii=False)


def strip_json(text: str) -> dict:
    t = text.strip()
    t = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", t)
    m = re.search(r"\{.*\}", t, re.S)
    return json.loads(m.group(0) if m else t)


def ask_claude(user_msg: str, system: str = SYSTEM_PROMPT) -> dict:
    cmd = [
        "claude", "-p", "--model", MODEL,
        "--tools", "",
        "--setting-sources", "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--output-format", "json",
        "--system-prompt", system,
        user_msg,
    ]
    env = {
        **os.environ,
        "MAX_THINKING_TOKENS": "0",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        "DISABLE_AUTOUPDATER": "1",
        "DISABLE_TELEMETRY": "1",
        "DISABLE_ERROR_REPORTING": "1",
    }
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=90, cwd=str(Path.home()),
                       env=env, stdin=subprocess.DEVNULL)
    if r.returncode != 0:
        raise RuntimeError(f"claude rc={r.returncode}: {(r.stderr or r.stdout).strip()[:300]}")
    envl = json.loads(r.stdout)
    if envl.get("is_error"):
        raise RuntimeError(f"claude error: {envl.get('result')}")
    return strip_json(envl.get("result", ""))


def ai_available() -> bool:
    return shutil.which("claude") is not None
    return False


SUDO_WORDS = re.compile(r"sudo|สิทธิ์|สิทธิ|แอดมิน|admin|root|รูท|ผู้ดูแล", re.I)
ALLOWED = {"ls", "cd", "pwd", "mkdir", "cp", "mv", "rm", "cat", "find", "sudo", "poweroff", "grep", "wc", "echo", "xargs"}


def sanitize(out: dict, req: dict) -> dict:
    cmd = out.get("command")
    if isinstance(cmd, str):
        cmd = cmd.strip().splitlines()[0].strip() if cmd.strip() else None
    else:
        cmd = None
    if cmd:
        # every simple command in the line must be one the game knows
        for seg in re.split(r"\|\||&&|[|;]", cmd):
            words = seg.split()
            if words and words[0] == "sudo":
                words = words[1:]
            if words and words[0] not in ALLOWED:
                cmd = None
                break
    if cmd and re.search(r"&&|;", cmd) and not re.search(r"แล้ว|และ|จากนั้น|ต่อด้วย|then|and|&&|;", req.get("text") or "", re.I):
        cmd = re.split(r"&&|;", cmd)[0].strip()  # one request = one command unless the player chained them
    sudo_ok = SUDO_WORDS.search(req.get("text") or "") or (
        req.get("mode") == "fix" and re.search(r"Permission denied|authentication required", req.get("error") or ""))
    if cmd and cmd.startswith("sudo ") and not sudo_ok:
        cmd = cmd[5:].strip()  # the player has to meet "Permission denied" before being handed sudo
    if cmd and req.get("phase") == 3 and req.get("mode") != "fix":
        typed = (req.get("text") or "").split()
        if typed and cmd.split()[0] != typed[0]:
            # the player must choose the command name themself in phase 3; never swap it
            return {"command": None, "confidence": 0.0, "explain": "", "parts": [],
                    "reply": f"คำสั่ง {typed[0]} ทำแบบนั้นไม่ได้นะ ลองคิดดูว่าต้องใช้คำสั่งไหน"}
    try:
        conf = float(out.get("confidence", 0.8))
    except (TypeError, ValueError):
        conf = 0.8
    parts = out.get("parts") if isinstance(out.get("parts"), list) else []
    return {
        "command": cmd,
        "confidence": max(0.0, min(1.0, conf)),
        "explain": str(out.get("explain") or "")[:300],
        "parts": [{"token": str(p.get("token", "")), "meaning": str(p.get("meaning", ""))} for p in parts if isinstance(p, dict)][:8],
        "reply": str(out.get("reply") or "")[:300],
        "hint": str(out.get("hint") or "")[:300],
    }


class Cache:
    def __init__(self, size=500):
        self.d, self.size, self.lock = OrderedDict(), size, threading.Lock()

    def get(self, k):
        with self.lock:
            if k in self.d:
                self.d.move_to_end(k)
                return self.d[k]

    def put(self, k, v):
        with self.lock:
            self.d[k] = v
            self.d.move_to_end(k)
            while len(self.d) > self.size:
                self.d.popitem(last=False)


CACHE = Cache()
LOG_LOCK = threading.Lock()


def log_input(req: dict, res: dict, ms: int, cached: bool):
    LOG_DIR.mkdir(exist_ok=True)
    row = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "code": req.get("code"), "level": req.get("level"), "phase": req.get("phase"),
           "text": req.get("text"), "command": res.get("command"), "confidence": res.get("confidence"),
           "ms": ms, "cached": cached}
    with LOG_LOCK, open(LOG_DIR / "inputs.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def interpret(req: dict) -> dict:
    user_msg = build_user_msg(req)
    key = user_msg
    t0 = time.time()
    hit = CACHE.get(key)
    if hit:
        log_input(req, hit, 0, True)
        return hit
    raw = ask_claude(user_msg, FIX_PROMPT if req.get("mode") == "fix" else SYSTEM_PROMPT)
    res = sanitize(raw, req)
    CACHE.put(key, res)
    log_input(req, res, int((time.time() - t0) * 1000), False)
    return res


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript"}

    def log_message(self, fmt, *args):
        if "/api/" in str(args[0] if args else ""):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self, limit=64_000):
        n = int(self.headers.get("Content-Length", "0"))
        if n > limit:
            raise ValueError("too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def cookie(self, name):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == name:
                return v
        return None

    def teacher(self):
        return classroom.session_ok(self.cookie("lamteach"))

    def set_session(self, tok, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        age = classroom.SESSION_DAYS * 86400 if tok else 0
        self.send_header("Set-Cookie", f"lamteach={tok or ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path, _, qs = self.path.partition("?")
        params = {k: urllib.parse.unquote_plus(v) for k, v in (p.partition("=")[::2] for p in qs.split("&") if p)}
        if path == "/api/health":
            return self.send_json({"ok": True, "ai": ai_available(), "model": MODEL})
        if path == "/api/teacher/status":
            return self.send_json({"set": bool(settings.load().get("teacher")), "in": self.teacher()})
        if path.startswith("/api/teacher/") and not self.teacher():
            return self.send_json({"error": "login"}, 401)
        if path == "/api/teacher/overview":
            return self.send_json(classroom.overview())
        if path == "/api/teacher/log":
            return self.send_json({"rows": classroom.log(params.get("code") or None, params.get("before") or None)})
        if path == "/api/teacher/export.csv":
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["username", "name", "time", "type", "level", "phase", "data"])
            for r in classroom.export_rows():
                w.writerow([*r[:2], time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(r[2] / 1000)), *r[3:]])
            data = ("\ufeff" + buf.getvalue()).encode()   # BOM: Excel reads the Thai as UTF-8
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="lamshell-events.csv"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if path == "/teacher":
            self.path = "/teacher.html"
        return super().do_GET()

    def do_POST(self):
        path = self.path.partition("?")[0]
        try:
            if path == "/api/interpret":
                return self.send_json(interpret(self.body()))
            if path in ("/api/signup", "/api/login"):
                req = self.body()
                try:
                    if path == "/api/signup":
                        me = classroom.signup(req.get("name"), req.get("username"), req.get("password"),
                                              req.get("password2"), req.get("consent") is True)
                    else:
                        me = classroom.login(req.get("username"), req.get("password"))
                except classroom.AccountError as e:
                    return self.send_json({"error": str(e)}, 400)
                return self.send_json(me)
            if path == "/api/me":
                code = classroom.who(self.body().get("token"))
                return self.send_json(classroom.saved(code)) if code else self.send_json({"error": "login"}, 401)
            if path in ("/api/state", "/api/events"):
                req = self.body(4_000_000)
                code = classroom.who(req.get("token"))
                if not code:
                    return self.send_json({"error": "login"}, 401)
                if path == "/api/state":
                    return self.send_json({"ok": True, "updated": classroom.save_state(code, req.get("data") or {})})
                return self.send_json({"ok": True, "n": classroom.add_events(code, req.get("events") or [])})
            if path == "/api/teacher/login":
                tok = classroom.teacher_login(self.body().get("password"))
                return self.set_session(tok, {"ok": True}) if tok else self.send_json({"error": "รหัสผ่านไม่ถูกต้อง"}, 401)
            if path == "/api/teacher/logout":
                classroom.end_session(self.cookie("lamteach"))
                return self.set_session(None, {"ok": True})
            if path.startswith("/api/teacher/"):
                if not self.teacher():
                    return self.send_json({"error": "login"}, 401)
                req = self.body()
                if path == "/api/teacher/password":
                    try:
                        classroom.set_password(req.get("code"), req.get("password"))
                    except classroom.AccountError as e:
                        return self.send_json({"error": str(e)}, 400)
                    return self.send_json({"ok": True})
                if path == "/api/teacher/delete":
                    classroom.delete_code(req.get("code"))
                    return self.send_json({"ok": True})
            return self.send_json({"error": "not found"}, 404)
        except Exception as e:
            self.log_error("%s failed: %s", path, e)
            return self.send_json({"error": str(e)[:300]}, 502)


def main():
    if "--setup" in sys.argv or (not settings.exists() and sys.stdin.isatty()):
        if settings.setup():
            classroom.end_all_sessions()
        if "--setup" in sys.argv:
            return
    cfg = settings.load()
    if not cfg.get("teacher"):
        print("ยังไม่ได้ตั้งรหัสครู: หน้าครูจะเข้าไม่ได้จนกว่าจะรัน  python3 server.py --setup", flush=True)
    host, port = cfg["host"], cfg["port"]
    srv = ThreadingHTTPServer((host, port), Handler)
    lan = f"  นักเรียนเข้าที่ http://{settings.lan_ip()}:{port}/" if host == "0.0.0.0" and settings.lan_ip() else ""
    print(f"LamShell on http://{host}:{port}{lan}  (AI: {MODEL}, claude CLI found={ai_available()})", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
