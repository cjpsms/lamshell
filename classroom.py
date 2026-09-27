"""Classroom side of LamShell: student codes, saved progress, play events, and the teacher dashboard's numbers.

Stdlib only (sqlite3). Students sign in themselves with their real name, class and seat number, and must tick the consent box first
(cj's call, 2026-09-27); the time they agreed is kept. Internally each student is a random code like TQ-7F3K.

Tables
  students(code, name, class, seat, created, last_seen, consent)
  state(code, data, updated)          -- the browser's save (progress + machine + journal), newest wins
  events(code, ts, type, level, phase, data)   -- one row per thing that happened in play, for research
  teacher(k, v)                       -- password hash + salt
  sessions(token, created)            -- teacher logins
"""
import hashlib
import json
import re
import secrets
import sqlite3
import statistics
import threading
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data" / "lamshell.db"
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O, 1/I: codes get read off paper
CODE_RE = re.compile(r"^TQ-[A-Z0-9]{4}$")
STUCK_MS = 5 * 60 * 1000      # the doc's "ครูคือคำใบ้ขั้นที่ 4": stuck on one level longer than this
ACTIVE_MS = 3 * 60 * 1000     # ...and still at the keyboard
SESSION_DAYS = 30

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
            CREATE TABLE IF NOT EXISTS students (code TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
                class TEXT NOT NULL DEFAULT '', seat TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL,
                last_seen INTEGER, consent INTEGER);
            CREATE TABLE IF NOT EXISTS state (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, code TEXT NOT NULL, ts INTEGER NOT NULL,
                type TEXT NOT NULL, level TEXT, phase TEXT, data TEXT NOT NULL DEFAULT '{}');
            CREATE INDEX IF NOT EXISTS events_code_ts ON events(code, ts);
            CREATE TABLE IF NOT EXISTS teacher (k TEXT PRIMARY KEY, v TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created INTEGER NOT NULL);
        """)
    return _db


def now_ms():
    return int(time.time() * 1000)


# ---------------- students ----------------

def norm_code(code):
    c = re.sub(r"[\s-]", "", str(code or "").upper())
    if c.startswith("TQ"):
        c = c[2:]
    return f"TQ-{c}" if re.fullmatch(r"[A-Z0-9]{4}", c) else None


def clean(s, n):
    return re.sub(r"\s+", " ", str(s or "")).strip()[:n]


def register(name, klass, seat, consent):
    """Sign in by name + class + seat. The same three again (on any computer) finds the same student."""
    name, klass, seat = clean(name, 80), clean(klass, 20), clean(seat, 4)
    if not name or not klass or not seat or not consent:
        return None
    t = now_ms()
    with _lock:
        row = db().execute("SELECT * FROM students WHERE name=? AND class=? AND seat=?", (name, klass, seat)).fetchone()
        if row:
            code = row["code"]
            db().execute("UPDATE students SET last_seen=?, consent=COALESCE(consent, ?) WHERE code=?", (t, t, code))
        else:
            while True:
                code = "TQ-" + "".join(secrets.choice(ALPHABET) for _ in range(4))
                if not db().execute("SELECT 1 FROM students WHERE code=?", (code,)).fetchone():
                    break
            db().execute("INSERT INTO students(code, name, class, seat, created, last_seen, consent) VALUES(?,?,?,?,?,?,?)",
                         (code, name, klass, seat, t, t, t))
        db().commit()
    return login(code)


def login(code):
    code = norm_code(code)
    if not code:
        return None
    with _lock:
        row = db().execute("SELECT * FROM students WHERE code=?", (code,)).fetchone()
        if not row:
            return None
        db().execute("UPDATE students SET last_seen=? WHERE code=?", (now_ms(), code))
        db().commit()
        st = db().execute("SELECT data, updated FROM state WHERE code=?", (code,)).fetchone()
    return {"code": code, "name": row["name"], "class": row["class"], "seat": row["seat"],
            "state": json.loads(st["data"]) if st else None, "updated": st["updated"] if st else 0}


def known(code):
    with _lock:
        return db().execute("SELECT 1 FROM students WHERE code=?", (code,)).fetchone() is not None


def save_state(code, data):
    if not known(code):
        return False
    t = now_ms()
    with _lock:
        db().execute("INSERT INTO state(code, data, updated) VALUES(?,?,?) "
                     "ON CONFLICT(code) DO UPDATE SET data=excluded.data, updated=excluded.updated",
                     (code, json.dumps(data, ensure_ascii=False), t))
        db().execute("UPDATE students SET last_seen=? WHERE code=?", (t, code))
        db().commit()
    return t


def add_events(code, events):
    if not known(code):
        return 0
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
        for t in ("students", "state", "events"):
            db().execute(f"DELETE FROM {t} WHERE code=?", (code,))
        db().commit()


# ---------------- teacher auth ----------------

def _hash(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()


def teacher_is_set():
    with _lock:
        return db().execute("SELECT 1 FROM teacher WHERE k='hash'").fetchone() is not None


def teacher_setup(pw):
    if teacher_is_set() or len(pw or "") < 6:
        return None
    salt = secrets.token_hex(16)
    with _lock:
        db().executemany("INSERT INTO teacher(k, v) VALUES(?,?)", [("salt", salt), ("hash", _hash(pw, salt))])
        db().commit()
    return new_session()


def teacher_login(pw):
    with _lock:
        rows = dict(db().execute("SELECT k, v FROM teacher").fetchall())
    if "hash" not in rows or not secrets.compare_digest(_hash(pw or "", rows["salt"]), rows["hash"]):
        return None
    return new_session()


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


def overview(klass=None):
    with _lock:
        studs = [dict(r) for r in db().execute(
            "SELECT * FROM students" + (" WHERE class=?" if klass else "") + " ORDER BY class, CAST(seat AS INTEGER), code",
            (klass,) if klass else ()).fetchall()]
        classes = [r[0] for r in db().execute("SELECT DISTINCT class FROM students ORDER BY class").fetchall()]
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

    return {"now": t_now, "classes": classes, "students": studs, "levels": levels, "errors": err_list[:60],
            "untranslated": untranslated, "quiz": quiz, "metrics": metrics}


def export_rows(klass=None):
    """Every event as flat rows (for Excel / SPSS)."""
    with _lock:
        rows = db().execute(
            "SELECT e.code, s.name, s.class, s.seat, e.ts, e.type, e.level, e.phase, e.data FROM events e "
            "JOIN students s ON s.code=e.code" + (" WHERE s.class=?" if klass else "") + " ORDER BY e.code, e.ts, e.id",
            (klass,) if klass else ()).fetchall()
    return rows
