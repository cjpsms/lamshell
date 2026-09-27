# ล่ามเชลล์ (LamShell)

เกมสอนใช้ terminal Linux สำหรับนักเรียนมัธยมไทย เล่นในเบราว์เซอร์ พิมพ์ผิดได้ไม่มีวันพัง

A browser game that teaches Thai high-school students the Linux command line. The same 10 core commands
(`ls cd mkdir cp mv rm cat find sudo poweroff`) come back in every phase while the typing gets stricter:

| Phase | What you can type | Help from น้องล่าม (the interpreter penguin) |
|---|---|---|
| 1 | messy Thai (`ปิดคอมดิ`) | AI translates, shows the real command, runs it |
| 2 | ask in Thai, then type the real command yourself | teaches the command with every part explained, never runs it |
| 3 | real command name + Thai for the rest (`ls ไฟล์ที่ซ่อนอยู่`) | translates only the arguments, shows what gets deleted before deleting |
| 4 | exact syntax | none; an error decoder behind a button |
| Bridge | pipes, `2>/dev/null`, `>`, `xargs` | none |
| Rescue + 5 | real tasks, `sudo`, `./script`, look before you delete | none |

The selling point is **learning to read errors**: every error is the exact GNU coreutils/bash text, split into
*who complains / about what / why* with a Thai explanation that fades out phase by phase.

## How it works

- `static/js/shell.js`: a bash simulator written from scratch (pipes, redirects, globs, quoting, sudo with a password
  prompt) over an in-memory filesystem. Nothing touches the real machine; `rm -rf /` only clears a JS object.
- `server.py`: stdlib-only Python server. Interprets player input with Claude Haiku through the `claude` CLI
  (no API key, no tools), with hard guards so the AI never adds `sudo`, chains extra steps, or changes the command
  the player chose.
- `static/js/stage.js`: the character stage. The speaker shows as a VRM model (three.js + three-vrm) that blinks,
  breathes, changes expression and moves its mouth while talking. Models in `static/models/` were made by cj in
  VRoid Studio from VRoid sample models (VRoidPreset A-Z terms: free use, not CC0).
- `static/js/levels.js`: 44 levels (phases 1–4, bridge, rescue, last act). Each builds its own world and passes on the *state of the
  world*, not on matching the exact text typed.

## Run

Needs Python 3 and a logged-in [Claude Code](https://claude.com/claude-code) CLI.

```
./lamshell            # or: python3 server.py
# -> http://127.0.0.1:4011
```

sudo password in the game: `pass123`

UI: a Windows Terminal lookalike for the shell; everything the game says (dialogue, hints, error decoder,
yes/no questions, mission checklist) lives in the side panel so `clear` never wipes it.

## Story

Year 2050: น้องล่าม, the interpreter, lives in every computer until the virus มั่วซั่ว starts eating her language.
She fades phase by phase, falls asleep after phase 3, gets rescued from `/quarantine` in a 4-level rescue arc,
and, three months later, wakes up in the last act. 3D cutscenes (`static/js/cutscene.js`) tell it.

The whole game is one machine (`static/js/world.js`): every file the levels use is there from the start, the story
adds the virus's files as it goes, and what the player does carries over (delete a work file and ครูสมใจ restores it).
น้องล่าม's memory files are written from what the player actually typed (`static/js/journal.js`).

Voice acting: every fixed line is voiced (ElevenLabs, `static/voice/`, built by `tools/voices/`), except ป้าเซิร์ฟ,
who uses a Gemini voice.

## Classroom

- **Sign in**: students type only their class and seat number and tick the consent box (what gets collected and
  why); no names are stored. They get a player code (e.g. `TQ-7F3K`), and the teacher matches codes to names on
  their own list: on the dashboard, 📋 รายชื่อนักเรียน reads the teacher's Excel (.xlsx) or CSV class list
  (columns ชั้น / เลขที่ / ชื่อ [/ นามสกุล], or one sheet per class) and shows names next to seat numbers. The list
  stays in that browser only (`static/js/roster.js`, .xlsx unzipped with no library); the server never gets names.
  The same class + seat on another computer continues the same save (kept on the server). A
  "play without saving" guest mode sends nothing.
- **Checkpoint quizzes** (`static/js/quiz.js`): after phases 1–4, ป้าเซิร์ฟ (the school server herself) asks
  5 questions drawn from a bank (what a command does, what a real error means). 4/5 (80%) opens the next phase;
  retries draw new questions.
- **Teacher dashboard** at `/teacher`: progress per student with anyone stuck on one
  level over 5 minutes flagged, slowest levels, the class's most common errors, Thai น้องล่าม couldn't translate,
  quiz results per question, research indicators (repeated-error rate, AI reliance, decoder use, look before
  delete), and a CSV export of every event.
- **Settings are made in the terminal**, never on the web: the first `./lamshell` (or `python3 server.py`) asks
  for the teacher password, whether students' computers may connect over the network, and the port, and writes
  `config.json` (chmod 600, gitignored; the password only as a PBKDF2 hash). Change them later with
  `./lamshell --setup`. `LAMSHELL_HOST` / `LAMSHELL_PORT` still override.
- Play data lives in `data/lamshell.db` (SQLite, gitignored).

## Not done yet

Voices for ป้าเซิร์ฟ (Gemini TTS, `tools/voices/tts_build.py --who serv`), the v86 "real Linux" ending.
