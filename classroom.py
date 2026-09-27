"""Classroom side of LamShell: student codes, saved progress, play events, and the teacher dashboard's numbers.

Stdlib only (sqlite3). Sign-in (cj, 2026-09-27): the student types name + class + seat and ticks the consent box.
The name is matched against the teacher's class list (uploaded from Excel): same name, or a few typos off (the
number allowed grows with the name's length, see allowed_edits), looking at the name only (prefixes like
นาย/ด.ญ. and spaces ignored) -> in, as that list entry. Not on the list -> waits
until the teacher approves them on the dashboard. No list uploaded yet -> everyone gets in.
The teacher password lives hashed in config.json (settings.py), set in the terminal.

Tables
  students(code, name, class, seat, status 'ok'|'pending', listed, created, last_seen, consent)
  roster(class, seat, name)           -- the teacher's class list
  state(code, data, updated)          -- the browser's save (progress + machine + journal), newest wins
  events(code, ts, type, level, phase, data)   -- one row per thing that happened in play, for research
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

import settings
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
                class TEXT NOT NULL DEFAULT '', seat TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'ok',
                listed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, last_seen INTEGER, consent INTEGER);
            CREATE TABLE IF NOT EXISTS roster (class TEXT NOT NULL, seat TEXT NOT NULL, name TEXT NOT NULL,
                PRIMARY KEY (class, seat));
            CREATE TABLE IF NOT EXISTS state (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, code TEXT NOT NULL, ts INTEGER NOT NULL,
                type TEXT NOT NULL, level TEXT, phase TEXT, data TEXT NOT NULL DEFAULT '{}');
            CREATE INDEX IF NOT EXISTS events_code_ts ON events(code, ts);
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


MATCH = 0.9   # similar() maps "within the allowed number of typos" to >= this
PREFIX = re.compile(r"^(นางสาว|นาง|นาย|เด็กชาย|เด็กหญิง|ด\.?\s?ช\.?|ด\.?\s?ญ\.?|น\.?\s?ส\.?|mrs?\.?|ms\.?|miss)\s*", re.I)


def norm_class(s):
    return re.sub(r"\s+", "", str(s or "")).replace("-", "/")[:20]


def norm_seat(s):
    s = re.sub(r"\.0+$", "", str(s or "").strip())
    return (s.lstrip("0") or s)[:4]


def name_key(name):
    """What gets compared: no title, no spaces, lower case."""
    return re.sub(r"[\s\u200b]+", "", PREFIX.sub("", clean(name, 120))).lower()


def edits(a, b):
    """Levenshtein distance: letters to add, remove or change to turn a into b."""
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def allowed_edits(n):
    """How many wrong letters a name of n letters may have: about 10%, rounded half up, never less than 1.
    (cj: "ตามความยาวชื่อไดนามิก" -- a fixed 90% refused one typo in short names.)"""
    return max(1, int(n * 0.1 + 0.5))


def similar(a, b):
    """1.0 = same name. >= MATCH when the typo count is within what the list name's length allows."""
    a, b = name_key(a), name_key(b)
    if not a or not b:
        return 0.0
    d = edits(a, b)
    return 1.0 if d == 0 else (MATCH + (1 - MATCH) * (1 - d / (allowed_edits(len(b)) + 1)) if d <= allowed_edits(len(b)) else 0.0)


def roster_match(name, klass="", seat=""):
    """Best class-list entry for this name (>= MATCH), preferring the class/seat the student typed."""
    with _lock:
        rows = db().execute("SELECT class, seat, name FROM roster").fetchall()
    ranked = []
    for r in rows:
        sc = similar(name, r["name"])
        if sc >= MATCH:
            ranked.append((sc + (0.01 if r["class"] == klass else 0) + (0.005 if r["seat"] == seat else 0), dict(r)))
    ranked.sort(key=lambda x: -x[0])
    if len(ranked) > 1 and abs(ranked[0][0] - ranked[1][0]) < 1e-9:
        return None   # two list names equally close (สมชาม: สมชาย or สมชาญ?) -> let the teacher decide
    return ranked[0][1] if ranked else None


def roster_size():
    with _lock:
        return db().execute("SELECT COUNT(*) FROM roster").fetchone()[0]


def _new_code():
    while True:
        code = "TQ-" + "".join(secrets.choice(ALPHABET) for _ in range(4))
        if not db().execute("SELECT 1 FROM students WHERE code=?", (code,)).fetchone():
            return code


def register(name, klass, seat, consent):
    """Sign in. The same name again (on any computer) finds the same student."""
    name, klass, seat = clean(name, 120), norm_class(klass), norm_seat(seat)
    if not name_key(name) or not klass or not seat or not consent:
        return None
    m = roster_match(name, klass, seat)
    listed = bool(m)
    if m:
        name, klass, seat = m["name"], m["class"], m["seat"]
    status = "ok" if listed or not roster_size() else "pending"
    t = now_ms()
    with _lock:
        rows = db().execute("SELECT * FROM students WHERE class=? AND seat=?", (klass, seat)).fetchall()
        row = next((r for r in rows if similar(r["name"], name) >= MATCH or (listed and r["listed"])), None)
        if row:
            code = row["code"]
            new_status = "ok" if status == "ok" else row["status"]   # an approved student stays approved
            db().execute("UPDATE students SET name=?, status=?, listed=MAX(listed, ?), last_seen=?, "
                         "consent=COALESCE(consent, ?) WHERE code=?", (name, new_status, int(listed), t, t, code))
        else:
            code = _new_code()
            db().execute("INSERT INTO students(code, name, class, seat, status, listed, created, last_seen, consent) "
                         "VALUES(?,?,?,?,?,?,?,?,?)", (code, name, klass, seat, status, int(listed), t, t, t))
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
    return {"code": code, "name": row["name"], "class": row["class"], "seat": row["seat"], "status": row["status"],
            "listed": bool(row["listed"]), "state": json.loads(st["data"]) if st else None,
            "updated": st["updated"] if st else 0}


# ---------------- the teacher's class list + approvals ----------------

def set_roster(rows):
    """Replace the list for every class in rows, then let in anyone waiting whose name now matches."""
    clean_rows = []
    for r in rows[:5000]:
        k, s_, n = norm_class(r.get("klass") or r.get("class")), norm_seat(r.get("seat")), clean(r.get("name"), 120)
        if k and s_ and name_key(n):
            clean_rows.append((k, s_, n))
    with _lock:
        for k in {r[0] for r in clean_rows}:
            db().execute("DELETE FROM roster WHERE class=?", (k,))
        db().executemany("INSERT OR REPLACE INTO roster(class, seat, name) VALUES(?,?,?)", clean_rows)
        db().commit()
        waiting = db().execute("SELECT code, name, class, seat FROM students WHERE status='pending'").fetchall()
    let_in = 0
    for w in waiting:
        m = roster_match(w["name"], w["class"], w["seat"])
        if m:
            with _lock:
                db().execute("UPDATE students SET status='ok', listed=1, name=?, class=?, seat=? WHERE code=?",
                             (m["name"], m["class"], m["seat"], w["code"]))
                db().commit()
            let_in += 1
    return {"saved": len(clean_rows), "let_in": let_in}


def clear_roster():
    with _lock:
        db().execute("DELETE FROM roster")
        db().commit()


def approve(code):
    with _lock:
        db().execute("UPDATE students SET status='ok' WHERE code=?", (code,))
        db().commit()


def known(code):
    with _lock:
        return db().execute("SELECT 1 FROM students WHERE code=? AND status='ok'", (code,)).fetchone() is not None


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


def overview(klass=None):
    with _lock:
        studs = [dict(r) for r in db().execute(
            "SELECT * FROM students" + (" WHERE class=?" if klass else "") + " ORDER BY class, CAST(seat AS INTEGER), code",
            (klass,) if klass else ()).fetchall()]
        classes = [r[0] for r in db().execute(
            "SELECT class FROM students UNION SELECT class FROM roster ORDER BY class").fetchall()]
        roster = [dict(r) for r in db().execute(
            "SELECT class, seat, name FROM roster" + (" WHERE class=?" if klass else "") + " ORDER BY class, CAST(seat AS INTEGER)",
            (klass,) if klass else ()).fetchall()]
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

    joined = {(s["class"], s["seat"]) for s in studs if s["listed"]}
    roster_info = {}
    for x in roster:
        c = roster_info.setdefault(x["class"], {"n": 0, "joined": 0, "missing": []})
        c["n"] += 1
        if (x["class"], x["seat"]) in joined:
            c["joined"] += 1
        else:
            c["missing"].append({"seat": x["seat"], "name": x["name"]})
    return {"now": t_now, "classes": classes, "students": studs, "roster": roster_info, "levels": levels, "errors": err_list[:60],
            "untranslated": untranslated, "quiz": quiz, "metrics": metrics}


def export_rows(klass=None):
    """Every event as flat rows (for Excel / SPSS)."""
    with _lock:
        rows = db().execute(
            "SELECT e.code, s.name, s.class, s.seat, e.ts, e.type, e.level, e.phase, e.data FROM events e "
            "JOIN students s ON s.code=e.code" + (" WHERE s.class=?" if klass else "") + " ORDER BY e.code, e.ts, e.id",
            (klass,) if klass else ()).fetchall()
    return rows
