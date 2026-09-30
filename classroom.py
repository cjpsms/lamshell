"""Classroom side of LamShell: student accounts, saved progress, play events, and the teacher dashboard's numbers.

Stdlib only (sqlite3). Students make a normal account (cj, 2026-09-27): name + username + password (typed twice) +
the consent tick, then log in with username + password on any computer. Passwords are PBKDF2 hashes. A login
gives the browser a token; the save and the play events are only accepted with it. The teacher can reset a
student's password from the dashboard. The teacher password lives hashed in config.json (settings.py).

Tables
  students(code, username, name, pw, created, last_seen, consent)   -- code = internal id (TQ-XXXX)
  logins(token, code, created)        -- student browsers
  state(code, data, updated)          -- the browser's save (progress + machine + journal), newest wins
  events(code, ts, type, level, phase, data)   -- one row per thing that happened in play, for research
  sessions(token, created)            -- teacher logins
"""
import json
import re
import secrets
import sqlite3
import statistics
import threading
import time

import settings
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data" / "lamshell.db"
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
STUCK_MS = 5 * 60 * 1000      # the doc's "ครูคือคำใบ้ขั้นที่ 4": stuck on one level longer than this
ACTIVE_MS = 3 * 60 * 1000     # ...and still at the keyboard
SESSION_DAYS = 30
USERNAME = re.compile(r"^[A-Za-z0-9_.\-]{3,20}$")
MIN_PW = 4

_lock = threading.Lock()
_db = None


def db():
    global _db
    if _db is None:
        DB_PATH.parent.mkdir(exist_ok=True)
        _db = sqlite3.connect(DB_PATH, check_same_thread=False)
        _db.row_factory = sqlite3.Row
        _db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS students (code TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                name TEXT NOT NULL, pw TEXT NOT NULL, created INTEGER NOT NULL, last_seen INTEGER, consent INTEGER);
            CREATE TABLE IF NOT EXISTS logins (token TEXT PRIMARY KEY, code TEXT NOT NULL, created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS state (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, code TEXT NOT NULL, ts INTEGER NOT NULL,
                type TEXT NOT NULL, level TEXT, phase TEXT, data TEXT NOT NULL DEFAULT '{}');
            CREATE INDEX IF NOT EXISTS events_code_ts ON events(code, ts);
            CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created INTEGER NOT NULL);
        """)
    return _db


def now_ms():
    return int(time.time() * 1000)


def clean(s, n):
    return re.sub(r"\s+", " ", str(s or "")).strip()[:n]


# ---------------- student accounts ----------------

class AccountError(Exception):
    """A message for the student, in Thai."""


def _new_code():
    while True:
        code = "TQ-" + "".join(secrets.choice(ALPHABET) for _ in range(4))
        if not db().execute("SELECT 1 FROM students WHERE code=?", (code,)).fetchone():
            return code


def _check_pw(pw, stored):
    try:
        h = json.loads(stored)
    except (TypeError, ValueError):
        return False
    return secrets.compare_digest(settings.hash_password(pw, h["salt"], h["iterations"])["hash"], h["hash"])


def signup(name, username, password, password2, consent):
    name, username = clean(name, 80), str(username or "").strip()
    if not name:
        raise AccountError("กรอกชื่อ-นามสกุลก่อน")
    if not USERNAME.match(username):
        raise AccountError("ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ _ . - ยาว 3-20 ตัว (ห้ามเว้นวรรค)")
    if len(password or "") < MIN_PW:
        raise AccountError(f"รหัสผ่านต้องยาวอย่างน้อย {MIN_PW} ตัว")
    if password != password2:
        raise AccountError("รหัสผ่านสองช่องไม่ตรงกัน")
    if not consent:
        raise AccountError("ต้องกดยอมรับการเก็บข้อมูลก่อน")
    pw = json.dumps(settings.hash_password(password))
    t = now_ms()
    with _lock:
        if db().execute("SELECT 1 FROM students WHERE username=?", (username,)).fetchone():
            raise AccountError("ชื่อผู้ใช้นี้มีคนใช้แล้ว ลองชื่ออื่น")
        code = _new_code()
        db().execute("INSERT INTO students(code, username, name, pw, created, last_seen, consent) VALUES(?,?,?,?,?,?,?)",
                     (code, username, name, pw, t, t, t))
        db().commit()
    return _start(code)


def login(username, password):
    with _lock:
        row = db().execute("SELECT code, pw FROM students WHERE username=?", (str(username or "").strip(),)).fetchone()
    if not row or not _check_pw(password or "", row["pw"]):
        raise AccountError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    return _start(row["code"])


def _start(code):
    """A new login token + everything the browser needs."""
    tok = secrets.token_urlsafe(24)
    with _lock:
        db().execute("INSERT INTO logins(token, code, created) VALUES(?,?,?)", (tok, code, now_ms()))
        db().execute("UPDATE students SET last_seen=? WHERE code=?", (now_ms(), code))
        db().commit()
        row = db().execute("SELECT * FROM students WHERE code=?", (code,)).fetchone()
        st = db().execute("SELECT data, updated FROM state WHERE code=?", (code,)).fetchone()
    return {"token": tok, "code": code, "username": row["username"], "name": row["name"],
            "state": json.loads(st["data"]) if st else None, "updated": st["updated"] if st else 0}


def saved(code):
    """The save kept on the server, for a browser that's already logged in (checked on every page load)."""
    with _lock:
        st = db().execute("SELECT data, updated FROM state WHERE code=?", (code,)).fetchone()
        db().execute("UPDATE students SET last_seen=? WHERE code=?", (now_ms(), code))
        db().commit()
    return {"state": json.loads(st["data"]) if st else None, "updated": st["updated"] if st else 0}


def who(token):
    """The student code a login token belongs to, or None."""
    if not token:
        return None
    with _lock:
        row = db().execute("SELECT code FROM logins WHERE token=?", (str(token),)).fetchone()
    return row["code"] if row else None


def set_password(code, password):
    """Teacher resets a student's password; the student's other browsers are logged out."""
    if len(password or "") < MIN_PW:
        raise AccountError(f"รหัสผ่านต้องยาวอย่างน้อย {MIN_PW} ตัว")
    with _lock:
        db().execute("UPDATE students SET pw=? WHERE code=?", (json.dumps(settings.hash_password(password)), code))
        db().execute("DELETE FROM logins WHERE code=?", (code,))
        db().commit()


def save_state(code, data):
    t = now_ms()
    with _lock:
        db().execute("INSERT INTO state(code, data, updated) VALUES(?,?,?) "
                     "ON CONFLICT(code) DO UPDATE SET data=excluded.data, updated=excluded.updated",
                     (code, json.dumps(data, ensure_ascii=False), t))
        db().execute("UPDATE students SET last_seen=? WHERE code=?", (t, code))
        db().commit()
    return t


def add_events(code, events):
    rows = []
    for e in events[:500]:
        if not isinstance(e, dict) or not e.get("type"):
            continue
        rest = {k: v for k, v in e.items() if k not in ("t", "type", "lv", "phase")}
        rows.append((code, int(e.get("t") or now_ms()), str(e["type"])[:24], str(e.get("lv") or "")[:12] or None,
                     str(e.get("phase") or "")[:4] or None, json.dumps(rest, ensure_ascii=False)[:4000]))
    with _lock:
        db().executemany("INSERT INTO events(code, ts, type, level, phase, data) VALUES(?,?,?,?,?,?)", rows)
        db().execute("UPDATE students SET last_seen=? WHERE code=?", (now_ms(), code))
        db().commit()
    return len(rows)


def delete_code(code):
    with _lock:
        for t in ("students", "logins", "state", "events"):
            db().execute(f"DELETE FROM {t} WHERE code=?", (code,))
        db().commit()


# ---------------- teacher auth ----------------

def teacher_login(pw):
    return new_session() if settings.check_password(pw) else None


def new_session():
    tok = secrets.token_urlsafe(32)
    with _lock:
        db().execute("INSERT INTO sessions(token, created) VALUES(?,?)", (tok, now_ms()))
        db().commit()
    return tok


def session_ok(tok):
    if not tok:
        return False
    with _lock:
        row = db().execute("SELECT created FROM sessions WHERE token=?", (tok,)).fetchone()
    return bool(row) and now_ms() - row["created"] < SESSION_DAYS * 86400_000


def end_all_sessions():
    """After the password changes in setup, every teacher browser has to sign in again."""
    with _lock:
        db().execute("DELETE FROM sessions")
        db().commit()


def end_session(tok):
    with _lock:
        db().execute("DELETE FROM sessions WHERE token=?", (tok,))
        db().commit()


# ---------------- dashboard numbers ----------------

def error_kind(line):
    """'cp: cannot stat 'x': No such file or directory' -> 'No such file or directory'.
    The kind is the last part that isn't just a file name; file names inside it become '…'."""
    line = re.sub(r"\x1b\[[0-9;]*m", "", line or "").strip()
    if not line:
        return None
    if line.startswith("Sorry, try again"):
        return "Sorry, try again. (รหัสผ่านผิด)"
    if line.startswith("Failed to power off"):
        return "Failed to power off (ไม่ได้ใช้ sudo)"
    parts = [p.strip() for p in line.split(": ")][1:] or [line]
    while len(parts) > 1 and (re.fullmatch(r"['‘`\"].*['’\"]", parts[-1]) or " " not in parts[-1]):
        parts.pop()
    kind = parts[-1]
    kind = re.sub(r"'[^']*'|‘[^’]*’|`[^']*'|\"[^\"]*\"", "'…'", kind)
    return kind[:80]


def saved_progress(state):
    """The game's progress object out of a saved state ({localStorage key: raw JSON string})."""
    try:
        return json.loads((state or {}).get("lamshell.progress.v1") or "{}") or {}
    except (TypeError, ValueError):
        return {}


def _median(xs):
    return int(statistics.median(xs)) if xs else None


def overview():
    with _lock:
        studs = [dict(r) for r in db().execute(
            "SELECT code, username, name, created, last_seen FROM students ORDER BY name COLLATE NOCASE").fetchall()]
        codes = [s["code"] for s in studs]
        q = ",".join("?" * len(codes))
        evs = [dict(r) for r in db().execute(
            f"SELECT code, ts, type, level, phase, data FROM events WHERE code IN ({q}) ORDER BY code, ts, id", codes).fetchall()] if codes else []
        states = {r["code"]: json.loads(r["data"]) for r in db().execute(
            f"SELECT code, data FROM state WHERE code IN ({q})", codes).fetchall()} if codes else {}
    for e in evs:
        e["d"] = json.loads(e.pop("data") or "{}")
    t_now = now_ms()

    by_code = {}
    for e in evs:
        by_code.setdefault(e["code"], []).append(e)

    # ---- per student ----
    level_runs = {}      # level -> list of {ms, attempts, hints} for passes
    stuck_now = {}       # level -> count
    for s in studs:
        es = by_code.get(s["code"], [])
        prog = saved_progress(states.get(s["code"]))
        s["stars"] = sum(v for v in (prog.get("stars") or {}).values() if isinstance(v, int))
        s["level_stars"] = {k: v for k, v in (prog.get("stars") or {}).items() if isinstance(v, int)}
        s["front"] = prog.get("unlockedId")
        s["quiz"] = {}
        s["inputs"] = sum(1 for e in es if e["type"] == "input")
        # where they are now: the last level they opened, and since when without passing it
        cur, since, passed = None, None, False
        for e in es:
            if e["type"] == "level_start":
                cur, since, passed = e["level"], e["ts"], False
            elif e["type"] == "pass" and e["level"] == cur:
                passed = True
            elif e["type"] == "quiz":
                cp = str(e["d"].get("cp"))
                qz = s["quiz"].setdefault(cp, {"best": 0, "total": e["d"].get("total", 5), "tries": 0, "passed": False, "first": None})
                qz["tries"] += 1
                qz["best"] = max(qz["best"], e["d"].get("score", 0))
                qz["passed"] = qz["passed"] or bool(e["d"].get("passed"))
                if qz["first"] is None:
                    qz["first"] = e["d"].get("score", 0)
            elif e["type"] == "quiz_start":
                cur, since, passed = "CP" + str(e["d"].get("cp")), e["ts"], False
        last = es[-1]["ts"] if es else s.get("last_seen")
        s["current"] = cur
        s["last"] = last
        s["on_level_ms"] = (t_now - since) if since and not passed else None
        s["stuck"] = bool(since and not passed and t_now - since > STUCK_MS and last and t_now - last < ACTIVE_MS)
        if s["stuck"]:
            stuck_now[cur] = stuck_now.get(cur, 0) + 1
        s["online"] = bool(last and t_now - last < ACTIVE_MS)
        # the live classroom screen: what they typed last and what the machine said back
        li = next((e for e in reversed(es) if e["type"] in ("input", "untranslated")), None)
        s["last_input"] = {"ts": li["ts"], "level": li["level"], "said": li["d"].get("said"), "ran": li["d"].get("ran"),
                           "err": li["d"].get("err"), "untranslated": li["type"] == "untranslated"} if li else None
        s["hints_now"] = max((e["d"].get("step") or 0 for e in es if e["type"] == "hint" and since and e["ts"] >= since
                              and e["level"] == cur), default=0)
        for e in es:
            if e["type"] == "pass":
                level_runs.setdefault(e["level"], []).append(e["d"])

    # ---- per level ----
    levels = {}
    for lv, runs in level_runs.items():
        levels[lv] = {
            "passed": len(runs),
            "median_ms": _median([r["ms"] for r in runs if isinstance(r.get("ms"), (int, float))]),
            "median_attempts": _median([r["attempts"] for r in runs if isinstance(r.get("attempts"), int)]),
            "hint_rate": round(sum(1 for r in runs if (r.get("hints") or 0) > 0) / len(runs), 2),
            "answer_rate": round(sum(1 for r in runs if (r.get("hints") or 0) >= 3) / len(runs), 2),
            "stars": round(sum(r.get("stars") or 0 for r in runs) / len(runs), 2),
        }
    for lv, n in stuck_now.items():
        levels.setdefault(lv, {"passed": 0})["stuck_now"] = n

    # ---- errors, and "same error again" (Becker's repeated error rate) per phase ----
    errors = {}
    rep = {}                      # phase -> [repeats, total errors]
    for code, es in by_code.items():
        prev_kind, prev_lv = None, None
        for e in es:
            if e["type"] == "level_start":
                prev_kind, prev_lv = None, e["level"]
            if e["type"] != "input":
                continue
            kind = error_kind(e["d"].get("err"))
            ph = e["phase"] or "?"
            if kind:
                key = (kind, ph)
                errors[key] = errors.get(key, 0) + 1
                r = rep.setdefault(ph, [0, 0])
                r[1] += 1
                if kind == prev_kind and e["level"] == prev_lv:
                    r[0] += 1
            prev_kind, prev_lv = kind, e["level"]
    err_list = sorted(({"kind": k, "phase": p, "n": n} for (k, p), n in errors.items()), key=lambda x: -x["n"])

    # ---- Thai น้องล่าม couldn't turn into a command ----
    untr = {}
    for e in evs:
        if e["type"] != "untranslated":
            continue
        text = str(e["d"].get("said") or "").strip()
        if not text:
            continue
        u = untr.setdefault(text, {"text": text, "n": 0, "levels": set(), "last": 0})
        u["n"] += 1
        u["levels"].add(e["level"])
        u["last"] = max(u["last"], e["ts"])
    untranslated = sorted(({**u, "levels": sorted(x for x in u["levels"] if x)} for u in untr.values()),
                          key=lambda x: (-x["n"], -x["last"]))[:200]

    # ---- checkpoint quizzes: pass rate, and how many got each question right (item difficulty p) ----
    quiz = {}
    for e in evs:
        if e["type"] != "quiz":
            continue
        cp = str(e["d"].get("cp"))
        qz = quiz.setdefault(cp, {"attempts": 0, "passed_attempts": 0, "scores": [], "items": {}, "students": set(), "passed_students": set()})
        qz["attempts"] += 1
        qz["students"].add(e["code"])
        if e["d"].get("passed"):
            qz["passed_attempts"] += 1
            qz["passed_students"].add(e["code"])
        qz["scores"].append(e["d"].get("score", 0) / max(1, e["d"].get("total", 5)))
        for a in e["d"].get("answers") or []:
            it = qz["items"].setdefault(a.get("id"), {"id": a.get("id"), "q": a.get("q"), "n": 0, "right": 0})
            it["n"] += 1
            it["right"] += 1 if a.get("ok") else 0
    for cp, qz in quiz.items():
        qz["students"] = len(qz["students"])
        qz["passed_students"] = len(qz["passed_students"])
        qz["avg"] = round(sum(qz["scores"]) / len(qz["scores"]), 3) if qz["scores"] else None
        del qz["scores"]
        qz["items"] = sorted(qz["items"].values(), key=lambda x: x["right"] / max(1, x["n"]))

    # ---- research indicators (design doc section 8) ----
    rely = {}
    for e in evs:
        if e["type"] == "input" and e["phase"] in ("1", "2", "3"):
            r = rely.setdefault(e["phase"], [0, 0])
            r[1] += 1
            r[0] += 1 if e["d"].get("ai") else 0
    strict_err = sum(1 for e in evs if e["type"] == "input" and e["phase"] in ("4", "B", "R", "5") and e["d"].get("err"))
    opened = sum(1 for e in evs if e["type"] == "decoder")
    looks = [e["d"].get("looked") for e in evs if e["type"] == "pass" and e["d"].get("looked") is not None]
    metrics = {
        "repeat_error": {ph: {"rate": round(a / b, 3) if b else None, "errors": b} for ph, (a, b) in sorted(rep.items())},
        "ai_reliance": {ph: {"rate": round(a / b, 3) if b else None, "inputs": b} for ph, (a, b) in sorted(rely.items())},
        "decoder_open": {"rate": round(opened / strict_err, 3) if strict_err else None, "errors": strict_err, "opened": opened},
        "look_before_delete": {"rate": round(sum(1 for x in looks if x) / len(looks), 3) if looks else None, "levels": len(looks)},
    }

    return {"now": t_now, "students": studs, "levels": levels, "errors": err_list[:60],
            "untranslated": untranslated, "quiz": quiz, "metrics": metrics}


GAP_MS = 5 * 60 * 1000   # a pause longer than this between two events isn't counted as play time


def student(code):
    """One student's page: per-level numbers, their errors, the Thai they typed, every quiz attempt, play time."""
    with _lock:
        s = db().execute("SELECT code, username, name, created, last_seen FROM students WHERE code=?", (code,)).fetchone()
        if not s:
            return None
        s = dict(s)
        evs = [dict(r) for r in db().execute(
            "SELECT ts, type, level, phase, data FROM events WHERE code=? ORDER BY ts, id", (code,)).fetchall()]
        st = db().execute("SELECT data FROM state WHERE code=?", (code,)).fetchone()
    for e in evs:
        e["d"] = json.loads(e.pop("data") or "{}")
    prog = saved_progress(json.loads(st["data"]) if st else None)
    s["level_stars"] = {k: v for k, v in (prog.get("stars") or {}).items() if isinstance(v, int)}
    s["stars"] = sum(s["level_stars"].values())
    s["front"] = prog.get("unlockedId")

    levels, errors, thai, quiz = {}, {}, [], []
    tot = {"play_ms": 0, "inputs": 0, "hints": 0, "decoder": 0, "piki": 0, "ai": 0}
    cur = None
    for i, e in enumerate(evs):
        d, lv = e["d"], e["level"]
        if e["type"] == "level_start":
            cur = lv
        elif e["type"] == "quiz_start":
            cur = None
        x = levels.setdefault(lv, {"opens": 0, "passes": 0, "inputs": 0, "errors": 0, "ai": 0, "hints": 0,
                                   "time_ms": 0, "first_pass": None}) if lv else None
        # play time: the gap to the next event, if it's short, goes to the level being played
        if i + 1 < len(evs):
            gap = evs[i + 1]["ts"] - e["ts"]
            if 0 < gap <= GAP_MS:
                tot["play_ms"] += gap
                if cur and cur in levels:
                    levels[cur]["time_ms"] += gap
        t = e["type"]
        if t == "level_start" and x:
            x["opens"] += 1
        elif t == "pass" and x:
            x["passes"] += 1
            if x["first_pass"] is None:
                x["first_pass"] = {"ts": e["ts"], "stars": d.get("stars"), "attempts": d.get("attempts"),
                                   "ms": d.get("ms"), "hints": d.get("hints") or 0}
        elif t == "input":
            tot["inputs"] += 1
            if x:
                x["inputs"] += 1
            kind = error_kind(d.get("err"))
            if kind:
                if x:
                    x["errors"] += 1
                k = errors.setdefault(kind, {"kind": kind, "n": 0, "levels": set(), "example": d.get("ran") or d.get("said")})
                k["n"] += 1
                if lv:
                    k["levels"].add(lv)
            if d.get("ai"):
                tot["ai"] += 1
                if x:
                    x["ai"] += 1
                thai.append({"ts": e["ts"], "level": lv, "said": d.get("said"), "ran": d.get("ran"), "err": d.get("err")})
        elif t == "untranslated":
            thai.append({"ts": e["ts"], "level": lv, "said": d.get("said"), "ran": None, "untranslated": True})
        elif t == "hint":
            tot["hints"] += 1
            if x:
                x["hints"] = max(x["hints"], d.get("step") or 0)
        elif t == "decoder":
            tot["decoder"] += 1
        elif t == "piki":
            tot["piki"] += 1
        elif t == "quiz":
            quiz.append({"ts": e["ts"], "cp": str(d.get("cp")), "score": d.get("score"), "total": d.get("total"),
                         "passed": bool(d.get("passed")), "answers": d.get("answers") or []})
    errs = sorted(({**k, "levels": sorted(k["levels"])} for k in errors.values()), key=lambda k: -k["n"])
    return {"now": now_ms(), "student": s, "totals": tot, "levels": levels, "errors": errs[:30],
            "thai": thai[::-1][:200], "quiz": quiz[::-1]}


def log(code=None, before=None, limit=300):
    """Newest events first, with the student's name (the teacher's log page). before = "ts:id" to page back from."""
    q = ("SELECT e.id, e.code, s.username, s.name, e.ts, e.type, e.level, e.phase, e.data FROM events e "
         "JOIN students s ON s.code=e.code WHERE 1=1")
    args = []
    if code:
        q += " AND e.code=?"
        args.append(code)
    if before:
        ts, _, eid = str(before).partition(":")   # "ts:id" of the oldest row shown
        q += " AND (e.ts<? OR (e.ts=? AND e.id<?))"
        args += [int(ts), int(ts), int(eid or 0)]
    q += " ORDER BY e.ts DESC, e.id DESC LIMIT ?"
    args.append(max(1, min(int(limit), 1000)))
    with _lock:
        rows = [dict(r) for r in db().execute(q, args).fetchall()]
    for r in rows:
        r["d"] = json.loads(r.pop("data") or "{}")
    return rows


def export_rows():
    """Every event as flat rows (for Excel / SPSS)."""
    with _lock:
        rows = db().execute(
            "SELECT s.username, s.name, e.ts, e.type, e.level, e.phase, e.data FROM events e "
            "JOIN students s ON s.code=e.code ORDER BY e.code, e.ts, e.id").fetchall()
    return rows
