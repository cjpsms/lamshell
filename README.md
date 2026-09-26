# ล่ามเชลล์ (LamShell)

เกมสอนใช้ terminal Linux สำหรับนักเรียนมัธยมไทย เล่นในเบราว์เซอร์ พิมพ์ผิดได้ไม่มีวันพัง

A browser game that teaches Thai high-school students the Linux command line. The same 10 core commands
(`ls cd mkdir cp mv rm cat find sudo poweroff`) come back in every phase while the typing gets stricter:

| Phase | What you can type | Help from น้องล่าม (the interpreter penguin) |
|---|---|---|
| 1 | messy Thai (`ปิดคอมดิ`) | AI translates, shows the real command, runs it |
| 2 | plain English (`list`, `copy`, `turnoff`) | maps it to the real command (runs it, later only suggests) |
| 3 | real command name + Thai for the rest (`ls ไฟล์ที่ซ่อนอยู่`) | translates only the arguments, shows what gets deleted before deleting |
| 4 | exact syntax | none; an error decoder behind a button |
| Bridge | pipes, `2>/dev/null`, `>`, `xargs` | none |

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
- `static/js/levels.js`: 38 levels (phases 1–4 + bridge). Each builds its own world and passes on the *state of the
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

## Not done yet

Phase 5 + final boss, checkpoint quizzes, teacher dashboard.
