// Same-browser progress storage (no accounts, no cross-device sync in the first release).
export const SAVE_VERSION = 1;
const KEY = "seoulDronePilot.save";
const BIND_KEY = "seoulDronePilot.bindings";
const TAB_KEY = "seoulDronePilot.tab";
const tabId = Math.random().toString(36).slice(2);
const tabStart = Date.now();

export function freshSave() {
  return { version: SAVE_VERSION, tutorialDone: false, device: null, assist: true, completed: {}, records: {}, attemptSeq: 0 };
}

export function loadSave() {
  let raw;
  try { raw = localStorage.getItem(KEY); } catch (e) { return { status: "unreadable" }; }
  if (raw === null) return { status: "none", data: freshSave() };
  let d;
  try { d = JSON.parse(raw); } catch (e) { return { status: "corrupt" }; }
  if (!d || typeof d !== "object" || typeof d.version !== "number") return { status: "corrupt" };
  if (d.version !== SAVE_VERSION) return { status: "version", version: d.version };
  if (!d.completed || typeof d.completed !== "object" || !d.records || typeof d.records !== "object") return { status: "corrupt" };
  return { status: "ok", data: Object.assign(freshSave(), d) };
}

function owner() {
  try {
    const o = JSON.parse(localStorage.getItem(TAB_KEY) || "null");
    if (o && Date.now() - o.t < 3500) return o;
  } catch (e) { /* ignore */ }
  return null;
}

/** The first tab that opened the game owns saving; later tabs are blocked while it lives. */
export function startTabHeartbeat() {
  const beat = () => {
    try {
      const o = owner();
      if (!o || o.id === tabId || o.start > tabStart) {
        localStorage.setItem(TAB_KEY, JSON.stringify({ id: tabId, start: tabStart, t: Date.now() }));
      }
    } catch (e) { /* ignore */ }
  };
  beat();
  setInterval(beat, 1000);
  addEventListener("pagehide", () => {
    try { const o = owner(); if (o && o.id === tabId) localStorage.removeItem(TAB_KEY); } catch (e) { /* ignore */ }
  });
}

export function saveBlockedByOtherTab() {
  const o = owner();
  return !!(o && o.id !== tabId);
}

export function writeSave(data) {
  if (saveBlockedByOtherTab()) return { ok: false, reason: "tab" };
  try { localStorage.setItem(KEY, JSON.stringify(data)); return { ok: true }; } catch (e) { return { ok: false, reason: "storage" }; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); return true; } catch (e) { return false; }
}

export function loadBindings() {
  try {
    const raw = localStorage.getItem(BIND_KEY);
    if (!raw) return { status: "none" };
    const d = JSON.parse(raw);
    if (!d || !d.keys || !d.pad || !d.pad.axes || !d.pad.buttons) return { status: "corrupt" };
    return { status: "ok", data: d };
  } catch (e) { return { status: "corrupt" }; }
}

export function writeBindings(b) {
  try { localStorage.setItem(BIND_KEY, JSON.stringify(b)); return true; } catch (e) { return false; }
}
