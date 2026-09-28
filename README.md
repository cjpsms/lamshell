# LamShell (ล่ามเชลล์)

**A browser game that teaches Thai high-school students the Linux terminal.** Players start by typing messy Thai,
and the help fades out phase by phase until they type real commands and read errors on their own. Everything runs
in the browser, so mistakes can never break anything.

![Typing Thai: น้องล่าม translates it into a real command and runs it](screenshots/phase1.gif)

## The problem

Existing terminal games (GameShell, OverTheWire Bandit, Terminus, ...) come in two kinds. Some demand exact syntax
from the first level, which stops beginners who have never seen a black screen. Others stay friendly all the way
through but never reach real commands. None of them accept Thai.

LamShell brings the same 10 core commands (`ls cd mkdir cp mv rm cat find sudo poweroff`) back in every phase while
the typing gets stricter, moving from the mother tongue to real syntax:

| Phase | What the player types | How much น้องล่าม (the interpreter penguin) helps |
|---|---|---|
| 1 | Messy Thai, e.g. `ปิดคอมดิ` ("shut the computer down") | AI translates it, shows the real command, and runs it |
| 2 | Ask in Thai, then type the command yourself | Explains every part of the command but never runs it |
| 3 | Real command name + Thai for the rest, e.g. `ls ไฟล์ที่ซ่อนอยู่` | Translates only the arguments and previews every deletion |
| 4 | Exact syntax | No translation; only an error decoder behind a button |
| Bridge | `\|` `2>/dev/null` `>` `xargs` | None |
| Rescue + final act | Real tasks: `sudo`, `./script`, look before you delete | None |

**The selling point: we don't just teach commands, we teach reading errors.** Every error message is the exact
GNU coreutils / bash text, split into *who complains / about what / why* with a Thai explanation that fades out
phase by phase.

## Screenshots

| | |
|---|---|
| ![Phase 4: a real error and the decoder](screenshots/phase4-error.jpg) | ![Checkpoint quiz in the terminal](screenshots/checkpoint-quiz.jpg) |
| **Phase 4**: exact syntax, real errors, with the decoder notebook | **Checkpoint quiz** after phases 1–4; 80% to pass |
| ![Piki, the in-game command encyclopedia](screenshots/piki.jpg) | ![Teacher dashboard: stars per level](screenshots/teacher-stars.jpg) |
| **Piki**: the in-game command encyclopedia (a Wikipedia parody) | **Teacher dashboard**: progress, stars per level, and a log for every student |

## Features

- **44 levels with a story.** In 2050, น้องล่าม lives inside every computer until the virus มั่วซั่ว breaks into the
  school server. The player drives the virus out, helps ครูสมใจ (the teacher), and finally rescues น้องล่าม. 3D
  cutscenes and voice acting for every main line.
- **One machine for the whole game.** Everything the player does carries over to the next level. น้องล่าม's memory
  files are written from what the player really typed, and deleting her brain means GAME OVER, because on a real
  machine `rm` has no recycle bin.
- **Levels pass on the state of the machine**, not on matching the exact text, so any correct answer works.
- **Three-step hints**: the janitor names the commands → น้องล่าม's notebook decodes the last error → พี่รูท gives
  the solution (each step lowers the star cap).
- **Windows comparisons**: levels that introduce something new compare it to what students already know, e.g.
  `sudo` = Run as administrator.
- **Piki**, a 24-page command encyclopedia organised by command, not by level. It is enough to solve every level,
  but its examples use different files from the missions, so it is never a walkthrough.
- **Student accounts**: username and password (stored hashed), with a consent step before any data is collected.
  A save continues on any computer.
- **Teacher dashboard** at `/teacher`: per-student progress (anyone stuck on one level for over 5 minutes is
  flagged), stars per level, a log of everything typed, slowest levels, the class's most common errors, Thai phrases
  the interpreter could not translate, per-question quiz results, and a CSV export.
- **Research metrics**: repeated-error rate, reliance on the translator, decoder use, and look-before-delete rate,
  to measure whether starting in the mother tongue and fading it out really improves exact syntax and error reading.

## Running it

There is no online version yet; it runs locally. It needs Python 3 and a logged-in
[Claude Code](https://claude.com/claude-code) CLI (Claude Haiku translates Thai in phases 1–3; no API key needed).

```
./lamshell            # first run asks for the teacher password in the terminal, then opens the game
./lamshell --setup    # change the teacher password / allow classroom computers / change the port
# game: http://127.0.0.1:4011   teacher dashboard: http://127.0.0.1:4011/teacher
```

The in-game sudo password is `pass123`. Settings live in `config.json` (the password only as a hash) and play data
in `data/lamshell.db`; neither is in the repository.

## Project structure

| File | Purpose |
|---|---|
| `static/js/shell.js` | A bash simulator written from scratch (pipes, redirects, globs, quoting, sudo) over an in-memory filesystem, with errors matching GNU coreutils 9.4 / bash 5.2 |
| `static/js/levels.js` · `world.js` | The 44 levels, the starting machine, and what the story adds at each level |
| `static/js/game.js` | Input handling per phase, stars, hints, the error decoder |
| `static/js/quiz.js` · `piki.js` | Checkpoint quizzes · the Piki encyclopedia |
| `static/js/stage.js` · `cutscene.js` | 3D characters (three.js + three-vrm) and story cutscenes |
| `server.py` | Stdlib-only Python server; sends translation requests to Claude Haiku, with guards so the AI never adds `sudo`, adds extra steps, or changes the command the player chose |
| `classroom.py` · `settings.py` | Student accounts, teacher dashboard and research data (SQLite) · terminal setup |

The development history, and the reasons behind each design decision, are in [CHANGELOG.md](CHANGELOG.md) (Thai).

## Not done yet

A bonus ending that lets players try the same commands on real Linux running in the browser (v86).

The code will be open-sourced after the competition.

## Credits

- Game design and story: cj ([github.com/cjpsms](https://github.com/cjpsms))
- 3D characters: made by cj in VRoid Studio from VRoid sample models (VRoidPreset A-Z terms: free to use, not CC0)
- Voice acting: ElevenLabs (ป้าเซิร์ฟ uses a Gemini TTS voice) · Fonts: IBM Plex Sans Thai and Cascadia Mono
