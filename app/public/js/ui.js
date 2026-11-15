// DOM helpers: menu screens, modal, toasts, flight HUD, small sound cues.
const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function fmtTime(ms) {
  if (ms == null) return "—";
  const t = Math.max(0, ms) / 1000, m = Math.floor(t / 60), s = t - m * 60;
  return String(m).padStart(2, "0") + ":" + s.toFixed(2).padStart(5, "0");
}

const screenEl = $("#screen"), modalEl = $("#modal"), toastsEl = $("#toasts"), hudEl = $("#hud");

export function screen(html, handlers = {}) {
  screenEl.innerHTML = html;
  screenEl.hidden = false;
  screenEl.scrollTop = 0;
  screenEl.onclick = (e) => {
    const b = e.target.closest("[data-act]");
    if (b && !b.disabled && !b.classList.contains("locked") && handlers[b.dataset.act]) handlers[b.dataset.act](b.dataset, b);
  };
  const f = screenEl.querySelector("[autofocus]");
  if (f) f.focus();
}
export function hideScreen() { screenEl.hidden = true; screenEl.innerHTML = ""; screenEl.onclick = null; }

export function modal({ title, body, buttons }) {
  modalEl.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><div class="modal-body">${body}</div><div class="row">${
    buttons.map((b, i) => `<button class="btn ${b.primary ? "primary" : ""}" data-i="${i}" ${b.disabled ? "disabled" : ""}>${esc(b.label)}</button>`).join("")}</div></div>`;
  modalEl.hidden = false;
  modalEl.onclick = (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b || b.disabled) return;
    const def = buttons[+b.dataset.i];
    if (!def.keep) closeModal();
    if (def.onClick) def.onClick();
  };
  const first = modalEl.querySelector("button:not(:disabled)");
  if (first) first.focus();
}
export function closeModal() { modalEl.hidden = true; modalEl.innerHTML = ""; }
export function modalOpen() { return !modalEl.hidden; }

export function toast(text, { kind = "info", ms = 3800, action } = {}) {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = `<span>${esc(text)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.className = "btn small"; b.textContent = action.label;
    b.onclick = () => { el.remove(); action.onClick(); };
    el.appendChild(b);
  }
  toastsEl.appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

// ---- sound cues -------------------------------------------------------------------------------
let ac = null;
function beep(freq, dur = 0.12, type = "sine", vol = 0.07) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  } catch (e) { /* audio is optional */ }
}
export const sfx = {
  cp: () => beep(880, 0.15, "triangle"),
  hit: () => beep(120, 0.25, "sawtooth", 0.1),
  ok: () => { beep(660, 0.12); setTimeout(() => beep(990, 0.2), 120); },
  fail: () => beep(160, 0.5, "square", 0.06),
  shot: () => beep(1400, 0.08, "square", 0.04),
  warn: () => beep(520, 0.1, "square", 0.05),
  shield: () => beep(300, 0.3, "sine", 0.09),
};

// ---- HUD --------------------------------------------------------------------------------------
const el = {};
for (const id of ["obj-type", "obj-title", "obj-list", "obj-hint", "obj-fail", "timer", "timer-label", "timer-v", "notice", "edge-msg",
  "st-speed", "st-alt", "st-col", "st-dmg", "st-assist", "cross", "aim-info", "warns", "nav", "nav-arrow", "nav-label", "center-msg",
  "combat", "cb-hp", "cb-hpn", "cb-wpn", "cb-wpnn", "cb-shd", "cb-shdn", "keys", "flash"]) el[id] = document.getElementById(id);
const last = {};
const setText = (id, v) => { if (last[id] !== v) { last[id] = v; el[id].textContent = v; } };
let noticeTimer = 0, flashTimer = 0;

export const hud = {
  show(isCombat) {
    hudEl.hidden = false;
    el.combat.hidden = !isCombat;
    el.cross.hidden = false;
    this.notice(""); this.center(""); this.edge(null); this.aim("", false); this.nav(null);
    el.warns.innerHTML = "";
  },
  hide() { hudEl.hidden = true; },
  objective(o) {
    const key = JSON.stringify(o);
    if (last.obj === key) return;
    last.obj = key;
    el["obj-type"].textContent = o.type;
    el["obj-title"].textContent = o.title;
    el["obj-list"].innerHTML = o.items.map((i) => `<li class="${i.done ? "done" : ""}">${esc(i.text)}</li>`).join("");
    el["obj-hint"].innerHTML = o.hint || "";
    el["obj-fail"].textContent = o.fails && o.fails.length ? "실패 조건: " + o.fails.join(" · ") : "";
  },
  timer(label, text, warn) {
    setText("timer-label", label); setText("timer-v", text);
    el.timer.classList.toggle("warn", !!warn);
  },
  notice(text, kind = "", ms = 2000) {
    clearTimeout(noticeTimer);
    el.notice.textContent = text; el.notice.className = kind;
    if (text) noticeTimer = setTimeout(() => { el.notice.textContent = ""; }, ms);
  },
  center(text) { setText("center-msg", text); },
  edge(text) {
    if (last.edge === text) return;
    last.edge = text;
    el["edge-msg"].hidden = !text; el["edge-msg"].textContent = text || "";
  },
  stats(speed, alt, col, dmg, assist) {
    setText("st-speed", speed.toFixed(1)); setText("st-alt", alt.toFixed(0)); setText("st-col", String(col));
    const w = Math.round(dmg) + "%";
    if (last.dmg !== w) { last.dmg = w; el["st-dmg"].style.width = w; el["st-dmg"].style.background = dmg > 66 ? "var(--red)" : "var(--amber)"; }
    setText("st-assist", assist ? "조작 보조 켜짐" : "조작 보조 꺼짐");
  },
  combat(c) {
    el["cb-hp"].style.width = c.hp + "%"; el["cb-hp"].style.background = c.hp > 35 ? "var(--green)" : "var(--red)";
    setText("cb-hpn", String(c.hp));
    el["cb-wpn"].style.width = Math.round(c.wpn * 100) + "%"; setText("cb-wpnn", c.wpnText);
    el["cb-shd"].style.width = Math.round(c.shd * 100) + "%"; setText("cb-shdn", c.shdText);
    el["cb-shd"].classList.toggle("active", c.active);
  },
  aim(text, locked) { setText("aim-info", text); el.cross.classList.toggle("locked", locked); },
  nav(n) {
    if (!n) { el.nav.hidden = true; return; }
    el.nav.hidden = false;
    el.nav.style.left = n.x + "px"; el.nav.style.top = n.y + "px";
    el.nav.classList.toggle("on", n.on);
    el["nav-arrow"].style.transform = `rotate(${n.angle}rad)`;
    setText("nav-label", `${n.label} ${Math.round(n.dist)}m`);
  },
  /** Direction warning for an incoming enemy attack (angle: 0 = ahead, clockwise). */
  warn(angle, text) {
    const w = document.createElement("div");
    w.className = "warn-arrow";
    w.style.transform = `rotate(${angle}rad)`;
    w.innerHTML = `<i></i><span>${esc(text)}</span>`;
    el.warns.appendChild(w);
    setTimeout(() => w.remove(), 1300);
  },
  flash(kind) {
    clearTimeout(flashTimer);
    el.flash.className = kind;
    flashTimer = setTimeout(() => { el.flash.className = ""; }, 120);
  },
  keys(html) { if (last.keys !== html) { last.keys = html; el.keys.innerHTML = html; } },
};
