/* Lecture Transcription — all heavy lifting runs in the browser.
 * Flow: ffmpeg.wasm splits audio at silence near ~13-min marks into small
 * low-bitrate mp3 chunks -> chunks POST in parallel to /api/transcribe ->
 * transcripts stitched in order -> client-side .docx built for download. */

(() => {
  "use strict";

  // ---- exact copy (do not edit — from the build brief) ----
  const DISCLAIMER =
`Quick heads-up: this tool only transcribes — it doesn't clean anything up. What follows is a raw, word-for-word transcript (filler words, tangents, and all). To turn it into proper notes, copy the prompt below into Claude, ChatGPT, or whatever AI you use, paste your transcript where it says to, and it'll organize everything for you.`;

  const POLISH_PROMPT =
`You'll be given a raw transcript of a recorded university lecture. Because it comes from automatic transcription, expect filler words, repetition, false starts, background chatter, occasional misheard/garbled words, and no punctuation structure — treat it as unpolished raw material, not finished writing.

Turn it into clear, comprehensive lecture notes a student could actually study from:

1. Extract the real teaching content — concepts, definitions, processes, formulas, examples — anything the lecturer explained or emphasized.
2. Cut the noise — filler words, small talk, class admin ("submit by Friday"), and repetition — unless a repeated point signals something the lecturer wanted remembered.
3. Reorganize by topic, not by the order things were said — group related ideas under clear headings so someone who missed the class could follow the logic.
4. Write in plain, simple language — but keep every specific fact, figure, or example. Simple doesn't mean shallow.
5. If a section is too garbled to make sense of, mark it [unclear in recording] rather than guessing.
6. Finish with a short "Key Takeaways" section — the 3-6 things most likely to matter for revision or exams.

Transcript:
[paste your transcript here]`;

  const CLOSING =
`This tool is a product of Mr Cee — built to give free tech solutions to everyday academic problems. Got a bug to report, a suggestion, or an idea for something else I should build? Fill this form:`;

  const FEEDBACK_URL = "feedback.html";

  // ---- tuning ----
  const TARGET_SEC = 780;   // ~13 min: err under 15 to stay well below size caps
  const MIN_SEC = 360;
  const MAX_SEC = 870;
  const SEARCH_WINDOW = 90; // how far from the ideal cut we'll hunt for silence
  const POOL = 4;           // parallel transcription requests

  // Pre-transcription cleanup for phone-in-a-lecture-hall audio:
  // highpass drops HVAC rumble and desk/handling thumps; dynaudnorm evens out
  // the level so a lecturer who walks away from the mic stays audible.
  const AUDIO_FILTERS = "highpass=f=80,dynaudnorm=f=200:g=15";

  // ---- tuning (size warning) ----
  const SIZE_WARN_BYTES = 150 * 1024 * 1024; // 150 MB

  // ---- state ----
  const files = [];
  let ffmpeg = null;
  let transcriptText = "";

  // ---- elements ----
  const $ = (id) => document.getElementById(id);
  const dropzone = $("dropzone");
  const fileInput = $("file-input");
  const fileListEl = $("file-list");
  const startBtn = $("start-btn");
  const introStep = $("intro-step");
  const progressStep = $("progress-step");
  const doneStep = $("done-step");
  const pbarFill = $("pbar-fill");
  const statusText = $("status-text");
  const alertSlot = $("alert-slot");
  const resultsList = $("results-list");
  const downloadBtn = $("download-btn");
  const restartBtn = $("restart-btn");

  // ---- file selection ----
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", () => addFiles(fileInput.files));

  ["dragover", "dragenter"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); })
  );
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  });

  function addFiles(fileList) {
    for (const f of fileList) {
      if (!f.type.startsWith("audio") && !/\.(m4a|mp3|wav|ogg|opus|aac|flac|webm)$/i.test(f.name)) continue;
      files.push(f);
    }
    renderFiles();
  }

  function renderFiles() {
    fileListEl.innerHTML = "";
    files.forEach((f, i) => {
      const li = document.createElement("li");
      const nm = document.createElement("span");
      nm.textContent = f.name;
      const sz = document.createElement("span");
      sz.className = "size";
      sz.textContent = fmtSize(f.size) + " · ✕";
      sz.style.cursor = "pointer";
      sz.title = "Remove";
      sz.addEventListener("click", () => { files.splice(i, 1); renderFiles(); });
      li.append(nm, sz);
      fileListEl.appendChild(li);
    });
    updateStartState();
  }

  function updateStartState() {
    startBtn.disabled = files.length === 0;
  }

  // ---- run ----
  startBtn.addEventListener("click", run);
  restartBtn.addEventListener("click", () => location.reload());

  async function run() {
    // File-size warning for large uploads.
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    if (totalBytes > SIZE_WARN_BYTES) {
      const sizeMB = (totalBytes / (1024 * 1024)).toFixed(0);
      const proceed = await showSizeWarning(sizeMB);
      if (!proceed) return;
    }

    introStep.hidden = true;
    progressStep.hidden = false;
    alertSlot.innerHTML = "";
    setProgress(2, "Loading the audio engine…");

    try {
      await loadFfmpeg();
    } catch (err) {
      return fail("Couldn't load the audio engine. Check your connection and try again.");
    }

    // Build chunks from every file, in order.
    const allChunks = [];
    let totalDuration = 0;
    try {
      for (let fi = 0; fi < files.length; fi++) {
        setProgress(5 + fi * 3, `Splitting file ${fi + 1} of ${files.length} at natural pauses…`);
        const { chunks, duration } = await chunkFile(files[fi], fi);
        totalDuration += duration;
        allChunks.push(...chunks);
      }
    } catch (err) {
      return fail("Something went wrong while preparing your audio. Try a different file or format.");
    }

    if (allChunks.length === 0) return fail("No audio could be read from those files.");

    // Fire-and-forget usage log (never blocks the user).
    const user = window.ACT_getUser ? window.ACT_getUser() : null;
    logUsage(user?.name || "anonymous", totalDuration, files.length);

    // Transcribe chunks in parallel (bounded pool), keeping order.
    setProgress(15, `Transcribing ${allChunks.length} piece(s)…`);
    const results = new Array(allChunks.length).fill(null);
    let done = 0;
    let busyHit = false;

    async function worker(idx) {
      for (let i = idx; i < allChunks.length; i += POOL) {
        try {
          results[i] = await transcribeChunk(allChunks[i].data);
        } catch (err) {
          if (err && err.busy) busyHit = true;
          throw err;
        }
        done++;
        setProgress(15 + Math.round((done / allChunks.length) * 80), `Transcribed ${done} of ${allChunks.length} piece(s)…`);
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(POOL, allChunks.length) }, (_, k) => worker(k)));
    } catch (err) {
      if (busyHit || (err && err.busy)) {
        return busy();
      }
      return fail(err && err.message ? err.message : "Transcription failed partway through. Please try again.");
    }

    // Stitch in original order.
    transcriptText = results.map((t) => (t || "").trim()).filter(Boolean).join("\n\n");
    setProgress(100, "Done!");
    showDone(allChunks.length);
  }

  // ---- size warning ----
  function showSizeWarning(sizeMB) {
    return new Promise((resolve) => {
      alertSlot.innerHTML = "";
      const div = document.createElement("div");
      div.className = "msg-busy";
      div.innerHTML =
        `<strong>Heads up — ${escapeHtml(sizeMB)} MB is a lot of audio.</strong><br>` +
        `Processing this much in your browser may be slow or could fail on phones and lower-memory devices. ` +
        `If you're on a laptop you'll probably be fine.`;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:0.7rem;margin-top:0.9rem;flex-wrap:wrap";
      const goBtn = document.createElement("button");
      goBtn.className = "btn btn-mini on";
      goBtn.textContent = "PROCEED ANYWAY";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-mini";
      cancelBtn.textContent = "CANCEL";
      row.append(goBtn, cancelBtn);
      div.appendChild(row);
      alertSlot.appendChild(div);
      goBtn.addEventListener("click", () => { alertSlot.innerHTML = ""; resolve(true); });
      cancelBtn.addEventListener("click", () => { alertSlot.innerHTML = ""; resolve(false); });
    });
  }

  // ---- ffmpeg ----
  async function loadFfmpeg() {
    if (ffmpeg) return;
    const { FFmpeg } = window.FFmpegWASM;
    const { toBlobURL } = window.FFmpegUtil;
    ffmpeg = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
  }

  // Detect silences + duration by running the null muxer once and reading logs.
  async function analyze(inName) {
    const logs = [];
    const onLog = ({ message }) => logs.push(message);
    ffmpeg.on("log", onLog);
    await ffmpeg.exec(["-i", inName, "-af", "silencedetect=noise=-30dB:d=0.4", "-f", "null", "-"]);
    ffmpeg.off("log", onLog);

    let duration = 0;
    const silences = [];
    let pendingStart = null;
    for (const line of logs) {
      const dm = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (dm) duration = (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]);
      const sm = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
      if (sm) pendingStart = parseFloat(sm[1]);
      const em = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
      if (em && pendingStart !== null) {
        const end = parseFloat(em[1]);
        silences.push({ start: pendingStart, end, mid: (pendingStart + end) / 2 });
        pendingStart = null;
      }
    }
    return { duration, silences };
  }

  async function chunkFile(file, fileIdx) {
    const { fetchFile } = window.FFmpegUtil;
    const ext = (file.name.match(/\.[a-z0-9]+$/i) || [".dat"])[0].toLowerCase();
    const inName = `in_${fileIdx}${ext}`;
    await ffmpeg.writeFile(inName, await fetchFile(file));

    const { duration, silences } = await analyze(inName);
    const dur = duration || estimateDuration(file);
    const cuts = planCuts(dur, silences);

    const chunks = [];
    for (let c = 0; c < cuts.length - 1; c++) {
      const start = cuts[c];
      const end = cuts[c + 1];
      const outName = `out_${fileIdx}_${c}.mp3`;
      // Mono, 16kHz, 32kbps mp3 — tiny files, plenty for speech (Whisper works at 16kHz).
      await ffmpeg.exec([
        "-ss", start.toFixed(3),
        "-to", end.toFixed(3),
        "-i", inName,
        "-af", AUDIO_FILTERS,
        "-ac", "1", "-ar", "16000", "-b:a", "32k",
        outName,
      ]);
      const data = await ffmpeg.readFile(outName);
      await ffmpeg.deleteFile(outName);
      chunks.push({ data: new Uint8Array(data) });
    }
    await ffmpeg.deleteFile(inName);
    return { chunks, duration: dur };
  }

  // Greedily place cut points near TARGET_SEC, snapping to the nearest silence.
  function planCuts(duration, silences) {
    if (!duration || duration <= MAX_SEC) return [0, duration || 1];
    const cuts = [0];
    let pos = 0;
    while (duration - pos > MAX_SEC) {
      const ideal = pos + TARGET_SEC;
      const lo = Math.max(pos + MIN_SEC, ideal - SEARCH_WINDOW);
      const hi = Math.min(pos + MAX_SEC, ideal + SEARCH_WINDOW);
      let best = null, bestDist = Infinity;
      for (const s of silences) {
        if (s.mid < lo || s.mid > hi) continue;
        const d = Math.abs(s.mid - ideal);
        if (d < bestDist) { bestDist = d; best = s.mid; }
      }
      const cut = best !== null ? best : ideal;
      cuts.push(cut);
      pos = cut;
    }
    cuts.push(duration);
    return cuts;
  }

  function estimateDuration(file) {
    // Fallback only: assume ~1MB per minute of typical voice-memo audio.
    return Math.max(MAX_SEC + 1, (file.size / (1024 * 1024)) * 60);
  }

  // ---- network ----
  async function transcribeChunk(uint8, attempt = 0) {
    let res;
    try {
      res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: uint8,
      });
    } catch {
      if (attempt < 1) { await sleep(800); return transcribeChunk(uint8, attempt + 1); }
      throw new Error("Network hiccup — please try again.");
    }

    if (res.status === 429) {
      if (attempt < 1) { await sleep(1500); return transcribeChunk(uint8, attempt + 1); }
      const e = new Error("busy"); e.busy = true; throw e;
    }
    if (!res.ok) {
      if (attempt < 1) { await sleep(800); return transcribeChunk(uint8, attempt + 1); }
      let msg = "Transcription failed. Please try again.";
      try { msg = (await res.json()).message || msg; } catch { /* keep default */ }
      throw new Error(msg);
    }
    const data = await res.json();
    return data.text || "";
  }

  function logUsage(name, durationSec, fileCount) {
    try {
      fetch("/api/log-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, durationSec, fileCount }),
      }).catch(() => {});
    } catch { /* logging must never break the flow */ }
  }

  // ---- ui helpers ----
  function setProgress(pct, msg) {
    pbarFill.style.width = Math.min(100, pct) + "%";
    if (msg) statusText.textContent = msg;
  }

  function fail(message) {
    progressStep.hidden = false;
    alertSlot.innerHTML = "";
    const div = document.createElement("div");
    div.className = "msg-error";
    div.innerHTML = `<strong>Something went wrong.</strong><br>${escapeHtml(message)}`;
    const retry = document.createElement("button");
    retry.className = "btn btn-mini";
    retry.style.marginTop = "0.8rem";
    retry.textContent = "↺ Start over";
    retry.addEventListener("click", () => location.reload());
    div.appendChild(retry);
    alertSlot.appendChild(div);
    statusText.textContent = "Stopped.";
  }

  function busy() {
    alertSlot.innerHTML = "";
    const div = document.createElement("div");
    div.className = "msg-busy";
    div.innerHTML = `<strong>Busy right now — try again in a bit.</strong><br>The free transcription quota is shared across everyone using the tool, and it's briefly maxed out. Give it a few minutes and start again.`;
    const retry = document.createElement("button");
    retry.className = "btn btn-mini";
    retry.style.marginTop = "0.8rem";
    retry.textContent = "↺ Try again";
    retry.addEventListener("click", () => location.reload());
    div.appendChild(retry);
    alertSlot.appendChild(div);
    statusText.textContent = "Paused.";
  }

  function showDone(chunkCount) {
    progressStep.hidden = true;
    doneStep.hidden = false;
    resultsList.innerHTML = "";
    const li = document.createElement("li");
    const words = transcriptText ? transcriptText.trim().split(/\s+/).length : 0;
    li.innerHTML = `<span>📄 ${chunkCount} piece(s) stitched · ~${words.toLocaleString()} words</span>`;
    resultsList.appendChild(li);
  }

  // ---- .docx ----
  downloadBtn.addEventListener("click", async () => {
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Building .docx…";
    try {
      const blob = await buildDocx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `lecture-transcript-${stamp}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "⬇ DOWNLOAD .DOCX";
    }
  });

  async function buildDocx() {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink } = window.docx;

    const para = (text, opts = {}) =>
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text, ...opts })] });

    const multiline = (block, opts = {}) =>
      block.split("\n").map((line) =>
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: line, ...opts })] })
      );

    const children = [];

    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Lecture Transcript")] }));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [
      new TextRun({ text: "Generated free by AcademicComback — a Mr Cee project.", italics: true, color: "7A5FC0" }),
    ] }));

    // a. disclaimer
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Read this first")] }));
    children.push(...multiline(DISCLAIMER));

    // b. polishing prompt
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Prompt — paste this into your AI")] }));
    children.push(...multiline(POLISH_PROMPT, { font: "Courier New", size: 20 }));

    // c. transcript
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Raw transcript")] }));
    const body = transcriptText || "[no transcript produced]";
    body.split(/\n{2,}/).forEach((p) => children.push(para(p)));

    // d. closing + feedback CTA
    children.push(new Paragraph({ spacing: { before: 240 }, border: { top: { style: "single", size: 6, color: "B79DF2" } }, children: [] }));
    children.push(...multiline(CLOSING, { italics: true }));
    children.push(new Paragraph({ children: [
      new ExternalHyperlink({
        link: new URL(FEEDBACK_URL, location.href).href,
        children: [new TextRun({ text: "Send feedback to Mr Cee", style: "Hyperlink" })],
      }),
    ] }));

    const doc = new Document({ sections: [{ properties: {}, children }] });
    return Packer.toBlob(doc);
  }

  // ---- misc ----
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
