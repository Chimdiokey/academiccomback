/* Site-wide name gate — shows once on first visit, then never again.
 * Stores { name, registeredAt } in localStorage under "act_user".
 * Structured so an email field can be added later without migration. */

(() => {
  "use strict";

  const STORAGE_KEY = "act_user";

  function getUser() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }

  function setUser(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  }

  window.ACT_getUser = getUser;

  if (getUser()) return;

  document.addEventListener("DOMContentLoaded", () => {
    if (getUser()) return;

    const overlay = document.createElement("div");
    overlay.id = "namegate";
    overlay.innerHTML = `
      <div class="ng-console">
        <p class="ng-title">▶ BEFORE WE START</p>
        <div class="ng-screen">
          <p class="ng-intro">Welcome! Just drop your name so Mr&nbsp;Cee knows the tools are reaching people. This isn't a login — no password, no email, asked once and never again.</p>
          <label class="ng-label" for="ng-name">YOUR NAME</label>
          <input type="text" id="ng-name" class="ng-input" placeholder="e.g. Ada from 300L Microbiology" autocomplete="name" autofocus />
          <button class="ng-btn" id="ng-go" disabled>▶ LET'S GO</button>
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #namegate {
        position: fixed; inset: 0; z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(45, 36, 64, 0.82);
        backdrop-filter: blur(6px);
        padding: 1rem;
      }
      .ng-console {
        width: 100%; max-width: 28rem;
        background: linear-gradient(160deg, #b79df2 0%, #7a5fc0 100%);
        border: 4px solid #2d2440;
        border-radius: 26px;
        box-shadow: 8px 8px 0 rgba(45, 36, 64, 0.5);
        padding: 1.6rem;
        animation: ng-pop 0.25s ease-out;
      }
      @keyframes ng-pop {
        from { opacity: 0; transform: scale(0.92) translateY(12px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      .ng-title {
        font-family: "Press Start 2P", monospace;
        font-size: 0.72rem;
        color: #fff;
        text-shadow: 2px 2px 0 #55408f;
        margin: 0 0 1.1rem;
        letter-spacing: 1px;
        text-align: center;
      }
      .ng-screen {
        background: #f6f2ff;
        border: 4px solid #2d2440;
        border-radius: 12px;
        padding: 1.4rem;
        box-shadow: inset 0 0 0 3px #fff;
      }
      .ng-intro {
        margin: 0 0 1rem;
        font-family: "Nunito", "Segoe UI", system-ui, sans-serif;
        font-size: 0.95rem;
        line-height: 1.6;
        color: #2d2440;
      }
      .ng-label {
        display: block;
        font-family: "Press Start 2P", monospace;
        font-size: 0.62rem;
        color: #55408f;
        margin-bottom: 0.5rem;
        letter-spacing: 1px;
      }
      .ng-input {
        width: 100%;
        font-family: "Nunito", "Segoe UI", system-ui, sans-serif;
        font-size: 1rem;
        color: #2d2440;
        background: #fff;
        border: 3px solid #2d2440;
        border-radius: 8px;
        padding: 0.65rem 0.8rem;
        outline: none;
        box-sizing: border-box;
      }
      .ng-input:focus {
        border-color: #3f9fd8;
        box-shadow: 0 0 0 3px rgba(142, 208, 248, 0.5);
      }
      .ng-btn {
        display: block;
        width: 100%;
        margin-top: 1.2rem;
        font-family: "Press Start 2P", monospace;
        font-size: 0.82rem;
        letter-spacing: 1px;
        color: #fff;
        background: #4caf7d;
        border: 3px solid #2d2440;
        border-radius: 10px;
        padding: 1.1rem;
        cursor: pointer;
        box-shadow: 0 4px 0 #2d2440;
        text-transform: uppercase;
        transition: transform 0.05s ease, box-shadow 0.05s ease;
      }
      .ng-btn:active {
        transform: translateY(4px);
        box-shadow: 0 0 0 #2d2440;
      }
      .ng-btn:disabled {
        background: #a9a3bd;
        cursor: not-allowed;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    const input = document.getElementById("ng-name");
    const btn = document.getElementById("ng-go");

    input.addEventListener("input", () => {
      btn.disabled = !input.value.trim();
    });

    function submit() {
      const name = input.value.trim();
      if (!name) return;
      setUser({ name, registeredAt: new Date().toISOString() });
      overlay.remove();
      style.remove();
    }

    btn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  });
})();
