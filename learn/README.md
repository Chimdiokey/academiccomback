# Learning this codebase

Three Jupyter notebooks that rebuild AcademicComback from scratch so you understand
every part of it. Written to be worked through in order.

The approach throughout: **build it in Python first, where you can run one line and see
the result immediately, then look at the real JavaScript doing the same job.** The hard
part of this project is the logic, not the syntax — and the logic is identical in any
language.

## Running them

```bash
cd ~/Documents/academiccomback/learn
jupyter lab
```

The notebooks read your actual source files with relative paths, so they must stay in
this folder. Nothing here is a copy — edit `js/transcribe.js` and these notebooks show
the edit.

## The notebooks

### 1. `01-transcription-pipeline.ipynb`
The lecture transcriber, end to end. You rebuild the whole pipeline in Python — inspect
audio, find natural pauses, plan cut points, cut and compress chunks, call Groq Whisper,
stitch the results, build a `.docx` — then read the real JavaScript beside it.

Also covers the browser-only parts Python can't teach: ffmpeg.wasm, Web Workers, and the
COOP/COEP headers behind the launch-day bug.

Needs: `ffmpeg`, `requests`, `python-docx`, and a Groq API key (optional — the
transcription cells skip cleanly without one).

### 2. `02-tabitha-and-frontend.ipynb`
HTML, CSS and JavaScript, through Read with Tabitha. Tabitha has no backend at all, so
nothing can hide behind "the server did it". Renders live examples inside the notebook,
ports the markdown renderer and the bionic-reading algorithm to Python, and serves your
real site locally so you can click around it.

Includes a genuine bug in the streak counter — it uses UTC dates, so a late-night study
session can inflate the streak. Part 6f proves it and shows the fix.

### 3. `03-git-github-and-deploying.ipynb`
Version control, GitHub and Netlify. Creates a throwaway repository you can wreck freely
and runs every core git command against it for real. Covers the three-box model, undoing
things safely, `reflog`, branches, secrets, and what actually happens between `git push`
and the site updating.

Anything touching the real repo is marked and read-only.

**Read Part 6 before you first push from Terminal** — there's a stale credential setting
in `.git/config` left over from the session that set these repos up, and one command
clears it.

## A note on how to use these

Reading feels like learning and mostly isn't. The Level 2 and Level 3 exercises at the end
of each notebook — rebuilding from a blank file, and changing the real site — are the part
that actually changes what you can do.

When you get stuck, look it up rather than asking an AI to write it:

- [MDN](https://developer.mozilla.org) — HTML, CSS, JavaScript
- [Pro Git](https://git-scm.com/book) — free, and genuinely good
- [ffmpeg filters](https://ffmpeg.org/ffmpeg-filters.html)
- [Groq speech-to-text](https://console.groq.com/docs/speech-to-text)
