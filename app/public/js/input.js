// Keyboard + standard-gamepad input, rebindable.
export const KEY_ACTIONS = [
  ["forward", "전진"], ["back", "후진"], ["left", "왼쪽 이동"], ["right", "오른쪽 이동"],
  ["up", "상승"], ["down", "하강"], ["yawL", "기체 왼쪽 회전"], ["yawR", "기체 오른쪽 회전"],
  ["camMod", "카메라 조합 키 (누른 채 이동 키)"], ["camReset", "카메라 초기화"],
  ["attack", "공격"], ["defend", "방어"],
];
export const PAD_AXES = [
  ["throttle", "상승·하강", "위"], ["yaw", "기체 회전", "오른쪽"],
  ["pitch", "전진·후진 (기울기)", "앞"], ["roll", "좌우 이동 (기울기)", "오른쪽"],
];
export const PAD_BUTTONS = [
  ["camMod", "카메라 조합 버튼 (누른 채 이동 스틱)"], ["camReset", "카메라 초기화"],
  ["attack", "공격"], ["defend", "방어"],
];

export function defaultBindings() {
  return {
    keys: {
      forward: "ArrowUp", back: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
      up: "KeyW", down: "KeyS", yawL: "KeyA", yawR: "KeyD",
      camMod: "ShiftLeft", camReset: "KeyC", attack: "Space", defend: "KeyF",
    },
    pad: {
      axes: { throttle: { i: 1, inv: true }, yaw: { i: 0, inv: false }, pitch: { i: 3, inv: true }, roll: { i: 2, inv: false } },
      buttons: { camMod: 4, camReset: 3, attack: 7, defend: 6 },
    },
  };
}

export function mergeBindings(saved) {
  const d = defaultBindings();
  for (const k of Object.keys(d.keys)) if (typeof saved.keys[k] === "string") d.keys[k] = saved.keys[k];
  for (const k of Object.keys(d.pad.axes)) {
    const a = saved.pad.axes[k];
    if (a && Number.isInteger(a.i)) d.pad.axes[k] = { i: a.i, inv: !!a.inv };
  }
  for (const k of Object.keys(d.pad.buttons)) if (Number.isInteger(saved.pad.buttons[k])) d.pad.buttons[k] = saved.pad.buttons[k];
  return d;
}

/** Keys the browser or OS intercepts, plus the two the game reserves (Esc = pause, Enter = confirm). */
export const RESERVED_KEY = /^(F\d+|Tab|Escape|Enter|NumpadEnter|MetaLeft|MetaRight|OSLeft|OSRight|ContextMenu|AltLeft|AltRight|ControlLeft|ControlRight|PrintScreen|CapsLock|NumLock|ScrollLock|Pause)$/;

const KEY_NAMES = {
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Space: "스페이스",
  ShiftLeft: "왼쪽 Shift", ShiftRight: "오른쪽 Shift", Backspace: "Backspace", Minus: "-", Equal: "=",
  BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`", Backslash: "\\",
};
export function keyLabel(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "숫자패드 " + code.slice(6);
  return code;
}
const AXIS_NAMES = ["왼쪽 스틱 ↔", "왼쪽 스틱 ↕", "오른쪽 스틱 ↔", "오른쪽 스틱 ↕"];
export function padAxisLabel(a) { return (AXIS_NAMES[a.i] || "축 " + a.i) + (a.inv ? " (반전)" : ""); }
const BTN_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start", "L3", "R3", "D↑", "D↓", "D←", "D→"];
export function padButtonLabel(i) { return BTN_NAMES[i] || "버튼 " + i; }

const clamp1 = (v) => Math.max(-1, Math.min(1, v));

export class Input {
  constructor(bindings, handlers = {}) {
    this.b = bindings;
    this.handlers = handlers;
    this.keys = new Set();
    this.edges = new Set();
    this.padPrev = {};
    this.padIndex = null;
    this.flight = false;
    this.keyCapture = null;
    this.padCapture = null;
    addEventListener("keydown", (e) => this.onKey(e, true));
    addEventListener("keyup", (e) => this.onKey(e, false));
    addEventListener("blur", () => { this.clear(); this.handlers.blur && this.handlers.blur(); });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { this.clear(); this.handlers.blur && this.handlers.blur(); }
    });
    addEventListener("gamepadconnected", (e) => {
      if (this.padIndex === null && e.gamepad.mapping === "standard") this.padIndex = e.gamepad.index;
      this.handlers.padConnected && this.handlers.padConnected(e.gamepad);
    });
    addEventListener("gamepaddisconnected", (e) => {
      const wasActive = e.gamepad.index === this.padIndex;
      if (wasActive) this.padIndex = null;
      this.handlers.padDisconnected && this.handlers.padDisconnected(e.gamepad, wasActive);
    });
  }

  gamepadApi() { return typeof navigator.getGamepads === "function"; }

  /** The active standard-mapped gamepad, or null. */
  pad() {
    if (!this.gamepadApi()) return null;
    let list;
    try { list = navigator.getGamepads(); } catch (e) { return null; }
    const cur = this.padIndex !== null ? list[this.padIndex] : null;
    if (cur && cur.connected && cur.mapping === "standard") return cur;
    for (const g of list) if (g && g.connected && g.mapping === "standard") { this.padIndex = g.index; return g; }
    this.padIndex = null;
    return null;
  }

  /** A connected device the browser does not map as a standard gamepad. */
  unsupportedPad() {
    if (!this.gamepadApi()) return null;
    try { for (const g of navigator.getGamepads()) if (g && g.connected && g.mapping !== "standard") return g; } catch (e) { /* ignore */ }
    return null;
  }

  isBound(code) { return Object.values(this.b.keys).includes(code); }

  onKey(e, down) {
    if (this.keyCapture) {
      if (down) { e.preventDefault(); const cb = this.keyCapture; this.keyCapture = null; cb(e.code); }
      return;
    }
    if (down) {
      if (!e.repeat) { this.keys.add(e.code); this.edges.add(e.code); }
    } else {
      this.keys.delete(e.code);
    }
    if (this.flight && (this.isBound(e.code) || /^(Arrow|Space)/.test(e.code))) e.preventDefault();
  }

  clear() { this.keys.clear(); this.edges.clear(); this.padPrev = {}; }

  captureKey(cb) { this.padCapture = null; this.keyCapture = cb; }
  capturePad(kind, cb) { this.keyCapture = null; this.padCapture = { kind, cb, armed: false }; }
  cancelCapture() { this.keyCapture = null; this.padCapture = null; }

  /** Called every frame so a pending gamepad rebind can see the next press or stick push. */
  pollCapture() {
    const c = this.padCapture;
    if (!c) return;
    const gp = this.pad();
    if (!gp) return;
    const anyBtn = gp.buttons.findIndex((b) => b.pressed || b.value > 0.5);
    let ax = -1, av = 0;
    gp.axes.forEach((v, i) => { if (Math.abs(v) > Math.abs(av)) { av = v; ax = i; } });
    if (!c.armed) { if (anyBtn === -1 && Math.abs(av) < 0.3) c.armed = true; return; }
    if (c.kind === "button" && anyBtn !== -1) { this.padCapture = null; c.cb(anyBtn); }
    else if (c.kind === "axis" && Math.abs(av) > 0.7) { this.padCapture = null; c.cb({ i: ax, raw: av }); }
  }

  /** One frame of intent. Consumes key-press edges. */
  read() {
    const k = this.b.keys;
    const K = (c) => (this.keys.has(c) ? 1 : 0);
    const E = (c) => this.edges.has(c);
    const s = { mx: 0, mz: 0, lift: 0, yaw: 0, camX: 0, camY: 0, attack: false, defend: false, camReset: false, pause: false, confirm: false };
    // Opposite keys cancel each other out.
    const fx = K(k.right) - K(k.left), fz = K(k.forward) - K(k.back);
    if (K(k.camMod)) { s.camX = fx; s.camY = fz; } else { s.mx = fx; s.mz = fz; }
    s.lift = K(k.up) - K(k.down);
    s.yaw = K(k.yawR) - K(k.yawL);
    s.attack = E(k.attack); s.defend = E(k.defend); s.camReset = E(k.camReset);
    s.pause = E("Escape"); s.confirm = E("Enter") || E("NumpadEnter");
    const gp = this.pad();
    if (gp) {
      const pa = this.b.pad.axes, pb = this.b.pad.buttons;
      const ax = (n) => {
        let v = gp.axes[pa[n].i] || 0;
        v = Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
        return pa[n].inv ? -v : v;
      };
      const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const edge = (name, i) => { const now = btn(i), was = this.padPrev[name]; this.padPrev[name] = now; return now && !was; };
      const px = ax("roll"), pz = ax("pitch");
      if (btn(pb.camMod)) { s.camX += px; s.camY += pz; } else { s.mx += px; s.mz += pz; }
      s.lift += ax("throttle"); s.yaw += ax("yaw");
      s.attack = edge("attack", pb.attack) || s.attack;
      s.defend = edge("defend", pb.defend) || s.defend;
      s.camReset = edge("camReset", pb.camReset) || s.camReset;
      s.pause = edge("pause", 9) || s.pause;
      s.confirm = edge("confirm", 0) || s.confirm;
    }
    for (const n of ["mx", "mz", "lift", "yaw", "camX", "camY"]) s[n] = clamp1(s[n]);
    this.edges.clear();
    return s;
  }
}
