# AcademicComback

Free tech solutions to everyday academic problems. A **Mr Cee** project.

Two tools, one static site, no user accounts:

1. **Lecture Transcription** — upload lecture audio, get a raw `.docx` transcript back. Audio is chunked in the browser (ffmpeg.wasm) at natural pauses, transcribed via Groq Whisper through a thin Netlify Function, stitched, and written to a `.docx` client-side. **Nothing is stored server-side.**
2. **Read with Tabitha** — a deterministic, no-AI study companion for reading polished markdown notes: Pomodoro (+custom), bionic reading, reading-time estimate, reading guide bar, dyslexia-friendly mode, study streak, break ideas.

## Project layout

```
index.html            Landing page (Level 1 missions)
transcribe.html       Lecture Transcription UI       -> js/transcribe.js
tabitha.html          Read with Tabitha              -> js/tabitha.js
feedback.html         Netlify Forms feedback form    -> thanks.html
admin.html            Unauthenticated usage-log viewer
css/style.css         Lilac + sky-blue retro console theme
netlify/functions/
  transcribe.mjs      Thin proxy to Groq Whisper (/api/transcribe)
  log-usage.mjs       Writes a usage entry to Netlify Blobs (/api/log-usage)
  usage-list.mjs      Reads usage entries for admin.html (/api/usage-list)
netlify.toml          Publish dir + functions dir
```

## Local development

Static pages (including all of Read with Tabitha) work from any static server:

```bash
python3 -m http.server 8000
```

To exercise the Netlify Functions (transcription + usage log) locally:

```bash
npm install
npx netlify dev
```

Set `GROQ_API_KEY` first (see below).

## Deploy (separate Netlify account)

Per the brief, deploy to a **new, separate Netlify account** (created via a `+alias`
email) so shared-credit risk stays isolated from other projects.

1. Create the site (confirm the name `academiccomback` is available in site settings).
2. In **Site settings → Environment variables**, add:
   - `GROQ_API_KEY` — your Groq API key. Never commit it; it is read only inside `transcribe.mjs`.
3. Deploy. Netlify auto-detects the function directory from `netlify.toml`.
4. **Netlify Forms**: the feedback form is plain HTML with `data-netlify="true"`,
   so Netlify captures it at deploy time. Submissions appear under **Forms**.
5. **Usage log**: entries are written to the Netlify **Blobs** store named `usage`.
   View them at `/admin.html`, via the Netlify CLI, or the dashboard.

## Guardrails baked in

- No accounts / login anywhere. The name field is a usage log, not auth.
- No server-side storage of audio or transcripts — ephemeral by design.
- Tabitha is fully deterministic: no AI/LLM calls, exactly the 7 listed features.
- The transcribe function is a thin proxy only (10s free-tier timeout in mind).

## Phase 2 (not built yet)

PDF slide support for Read with Tabitha via **pdf.js** — render each slide as an
image and extract text where present. Instruct users to export slides to PDF first
rather than parsing `.pptx`. Build after the core flow ships.
