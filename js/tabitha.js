/* Read with Tabitha — 100% deterministic, client-side, no AI, no network.
 * Features (fixed list of 7): Pomodoro (+custom), bionic reading, reading-time
 * estimate, reading guide bar, dyslexia-friendly mode, study streak, break ideas. */

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // ============ Tabitha sprite (inline pixel art) ============
  const SPRITE = `
  <svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-label="Tabitha, a pixel-art study buddy">
    <rect x="5" y="1" width="6" height="1" fill="#7a5fc0"/>
    <rect x="4" y="2" width="8" height="1" fill="#7a5fc0"/>
    <rect x="4" y="3" width="1" height="3" fill="#7a5fc0"/>
    <rect x="11" y="3" width="1" height="3" fill="#7a5fc0"/>
    <rect x="5" y="3" width="6" height="4" fill="#ffe0c2"/>
    <rect x="4" y="3" width="1" height="1" fill="#ffe0c2"/>
    <rect x="11" y="3" width="1" height="1" fill="#ffe0c2"/>
    <rect x="6" y="4" width="1" height="1" fill="#2d2440"/>
    <rect x="9" y="4" width="1" height="1" fill="#2d2440"/>
    <rect x="6" y="5" width="1" height="1" fill="#f7a8c0"/>
    <rect x="9" y="5" width="1" height="1" fill="#f7a8c0"/>
    <rect x="7" y="6" width="2" height="1" fill="#e05d6f"/>
    <rect x="5" y="7" width="6" height="1" fill="#7a5fc0"/>
    <rect x="4" y="8" width="8" height="4" fill="#8ed0f8"/>
    <rect x="4" y="8" width="8" height="1" fill="#b79df2"/>
    <rect x="7" y="9" width="2" height="3" fill="#fffdfa"/>
    <rect x="3" y="9" width="1" height="3" fill="#ffe0c2"/>
    <rect x="12" y="9" width="1" height="3" fill="#ffe0c2"/>
    <rect x="5" y="12" width="2" height="2" fill="#55408f"/>
    <rect x="9" y="12" width="2" height="2" fill="#55408f"/>
    <rect x="2" y="2" width="1" height="1" fill="#ffd93d"/>
    <rect x="13" y="4" width="1" height="1" fill="#ffd93d"/>
    <rect x="13" y="1" width="1" height="1" fill="#8ed0f8"/>
  </svg>`;
  $("sprite-stage").innerHTML = SPRITE;

  // ============ Scripted intro dialog (fixed, not AI) ============
  const dialogEl = $("dialog");
  const INTRO = [
    "Hi! I'm Tabitha, your study buddy. 👋",
    "Paste your polished notes on the right, then hit LOAD NOTES.",
    "Use BIONIC to bold word-starts, GUIDE to highlight your line, or DYSLEXIA for easier spacing.",
    "Set a Pomodoro timer over here and I'll nudge you to rest. Let's get a streak going. Ready? Read on! 📚",
  ];
  let introIdx = 0;
  const dialogNext = $("dialog-next");
  function showDialog(text, showNext) {
    dialogEl.textContent = text;
    dialogNext.style.visibility = showNext ? "visible" : "hidden";
  }
  showDialog(INTRO[0], true);
  dialogNext.addEventListener("click", () => {
    introIdx++;
    if (introIdx < INTRO.length) showDialog(INTRO[introIdx], introIdx < INTRO.length - 1);
    else showDialog(INTRO[INTRO.length - 1], false);
  });

  function tabithaSay(text, revertMs) {
    showDialog(text, false);
    if (revertMs) setTimeout(() => showDialog(INTRO[INTRO.length - 1], false), revertMs);
  }

  // ============ Markdown rendering (tiny, safe, deterministic) ============
  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function inlineMd(s) {
    s = escapeHtml(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/\b_([^_]+)_\b/g, "<em>$1</em>");
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function renderMarkdown(md) {
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    let html = "";
    let inCode = false, codeBuf = [];
    let listType = null, listBuf = [];

    const flushList = () => {
      if (listType) { html += `<${listType}>${listBuf.join("")}</${listType}>`; listBuf = []; listType = null; }
    };

    for (const raw of lines) {
      const line = raw;
      const fence = line.match(/^```/);
      if (fence) {
        if (inCode) { html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`; codeBuf = []; inCode = false; }
        else { flushList(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flushList(); html += `<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`; continue; }

      if (/^\s*>\s?/.test(line)) { flushList(); html += `<blockquote>${inlineMd(line.replace(/^\s*>\s?/, ""))}</blockquote>`; continue; }

      const ul = line.match(/^\s*[-*+]\s+(.*)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul) { if (listType !== "ul") { flushList(); listType = "ul"; } listBuf.push(`<li>${inlineMd(ul[1])}</li>`); continue; }
      if (ol) { if (listType !== "ol") { flushList(); listType = "ol"; } listBuf.push(`<li>${inlineMd(ol[1])}</li>`); continue; }

      if (/^\s*([-*_]){3,}\s*$/.test(line)) { flushList(); html += "<hr>"; continue; }

      if (line.trim() === "") { flushList(); continue; }

      flushList();
      html += `<p>${inlineMd(line)}</p>`;
    }
    if (inCode) html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
    flushList();
    return html;
  }

  // ============ Load notes ============
  const reader = $("reader");
  const notesInput = $("notes-input");
  const loadHint = $("load-hint");
  let currentMarkdown = "";

  function loadNotes(md) {
    currentMarkdown = md || "";
    if (!currentMarkdown.trim()) { loadHint.textContent = "Nothing to load yet."; return; }
    renderReader();
    updateReadTime();
    tabithaSay("Loaded! Happy reading. 📖", 3500);
    document.querySelector(".reading-outer").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderReader() {
    reader.innerHTML = renderMarkdown(currentMarkdown);
    if (bionicOn) applyBionic();
  }

  $("load-btn").addEventListener("click", () => loadNotes(notesInput.value));
  $("notes-file").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { notesInput.value = fr.result; loadNotes(fr.result); loadHint.textContent = `Loaded ${f.name}`; };
    fr.readAsText(f);
  });

  // ============ Reading-time estimate ============
  function updateReadTime() {
    const words = currentMarkdown.trim() ? currentMarkdown.trim().split(/\s+/).length : 0;
    if (!words) { $("read-time").textContent = ""; return; }
    const mins = Math.max(1, Math.round(words / 200)); // ~200 wpm
    $("read-time").textContent = `~${mins} MIN · ${words.toLocaleString()} WORDS`;
  }

  // ============ Bionic reading ============
  let bionicOn = false;
  $("toggle-bionic").addEventListener("click", (e) => {
    bionicOn = !bionicOn;
    e.currentTarget.classList.toggle("on", bionicOn);
    renderReader();
  });
  function applyBionic() {
    const walker = document.createTreeWalker(reader, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentNode.nodeName;
        if (p === "CODE" || p === "PRE" || p === "A") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      const parts = node.nodeValue.split(/(\s+)/);
      for (const part of parts) {
        if (/^\s+$/.test(part) || part === "") { frag.appendChild(document.createTextNode(part)); continue; }
        const m = part.match(/^(\W*)(\w+)(.*)$/);
        if (!m) { frag.appendChild(document.createTextNode(part)); continue; }
        const [, pre, word, post] = m;
        const n = Math.max(1, Math.ceil(word.length * 0.4));
        if (pre) frag.appendChild(document.createTextNode(pre));
        const b = document.createElement("b");
        b.className = "bionic";
        b.textContent = word.slice(0, n);
        frag.appendChild(b);
        frag.appendChild(document.createTextNode(word.slice(n) + post));
      }
      node.parentNode.replaceChild(frag, node);
    }
  }

  // ============ Dyslexia-friendly mode ============
  $("toggle-dyslexia").addEventListener("click", (e) => {
    const on = reader.classList.toggle("dyslexia");
    e.currentTarget.classList.toggle("on", on);
  });

  // ============ Reading guide bar ============
  const guideBar = $("guide-bar");
  const readingWrap = $("reading-wrap");
  const readingOuter = document.querySelector(".reading-outer");
  let guideOn = false;
  $("toggle-guide").addEventListener("click", (e) => {
    guideOn = !guideOn;
    e.currentTarget.classList.toggle("on", guideOn);
    guideBar.hidden = !guideOn;
  });
  readingWrap.addEventListener("mousemove", (e) => {
    if (!guideOn) return;
    const outerRect = readingOuter.getBoundingClientRect();
    const y = e.clientY - outerRect.top;
    guideBar.style.top = (y - guideBar.offsetHeight / 2) + "px";
  });

  // ============ Study streak ============
  const STREAK_KEY = "act_streak";
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  }
  function updateStreak() {
    let data;
    try { data = JSON.parse(localStorage.getItem(STREAK_KEY) || "null"); } catch { data = null; }
    const today = todayStr();
    let count = 1;
    if (data && data.last) {
      const gap = daysBetween(data.last, today);
      if (gap === 0) count = data.count || 1;
      else if (gap === 1) count = (data.count || 0) + 1;
      else count = 1;
    }
    try { localStorage.setItem(STREAK_KEY, JSON.stringify({ last: today, count })); } catch { /* private mode */ }
    $("streak").textContent = `🔥 STREAK: ${count} DAY${count === 1 ? "" : "S"}`;
    if (count === 1 && (!data || daysBetween(data.last, today) > 1)) {
      // fresh start — no popup
    } else if (count >= 2) {
      setTimeout(() => tabithaSay(`${count} days in a row — proud of you! 🔥`, 4000), 1200);
    }
    if ([3, 7, 14, 30, 50, 100].includes(count)) {
      setTimeout(() => tabithaSay(`${count}-day streak! That's a real habit now. 🏆`, 4500), 1200);
    }
  }
  updateStreak();

  // ============ Pomodoro timer ============
  const BREAK_IDEAS = [
    "Stand up and stretch your arms overhead. 🙆",
    "Drink some water — hydrate that brain. 💧",
    "Walk around for a minute, get the blood moving. 🚶",
    "Look at something far away for 20 seconds to rest your eyes. 👀",
    "Roll your shoulders and unclench your jaw. 😌",
    "Take five slow, deep breaths. 🌬️",
    "Tidy one small thing on your desk. 🧹",
    "Snack on something small if you're hungry. 🍎",
  ];
  let breakIdx = Math.floor(Math.random() * BREAK_IDEAS.length);

  let workMin = 25, breakMin = 5;
  let mode = "focus";        // "focus" | "break"
  let remaining = workMin * 60;
  let ticker = null;

  const timerDisplay = $("timer-display");
  const timerMode = $("timer-mode");

  function renderTimer() {
    const m = Math.floor(remaining / 60), s = remaining % 60;
    timerDisplay.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    timerMode.textContent = mode === "focus" ? "FOCUS" : "BREAK";
    timerMode.style.color = mode === "focus" ? "var(--sky-deep)" : "var(--good)";
  }

  function setPreset(w, b) {
    stopTimer();
    workMin = w; breakMin = b; mode = "focus"; remaining = workMin * 60;
    renderTimer();
  }

  function stopTimer() { if (ticker) { clearInterval(ticker); ticker = null; } }

  function startTimer() {
    if (ticker) return;
    ticker = setInterval(() => {
      remaining--;
      if (remaining <= 0) { switchMode(); }
      renderTimer();
    }, 1000);
  }

  function switchMode() {
    beep();
    if (mode === "focus") {
      mode = "break";
      remaining = breakMin * 60;
      breakIdx = (breakIdx + 1) % BREAK_IDEAS.length;
      tabithaSay("Break time! " + BREAK_IDEAS[breakIdx], 8000);
    } else {
      mode = "focus";
      remaining = workMin * 60;
      tabithaSay("Back to it — you've got this. 💪", 5000);
    }
  }

  $("timer-start").addEventListener("click", startTimer);
  $("timer-pause").addEventListener("click", stopTimer);
  $("timer-reset").addEventListener("click", () => { stopTimer(); mode = "focus"; remaining = workMin * 60; renderTimer(); });

  const customRow = $("custom-row");
  $("preset-row").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.custom) { customRow.hidden = !customRow.hidden; return; }
    if (btn.dataset.work) { customRow.hidden = true; setPreset(+btn.dataset.work, +btn.dataset.break); }
  });
  $("custom-apply").addEventListener("click", () => {
    const w = Math.min(180, Math.max(1, parseInt($("custom-work").value, 10) || 25));
    const b = Math.min(60, Math.max(1, parseInt($("custom-break").value, 10) || 5));
    setPreset(w, b);
    customRow.hidden = true;
  });

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch { /* audio not available — silent is fine */ }
  }

  renderTimer();
})();
