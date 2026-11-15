// Boot, game loop and session management.
import * as SAVE from "./save.js";
import { Input, defaultBindings, mergeBindings, keyLabel, padAxisLabel, padButtonLabel } from "./input.js";
import { buildWorld, makeMarkers, rayBoxes } from "./world.js";
import { Drone } from "./drone.js";
import { makeContents, ORDER } from "./contents.js";
import * as ui from "./ui.js";
import { esc } from "./ui.js";
import * as screens from "./screens.js";

const FIXED = 1 / 120; // fixed simulation step: the same input in the same situation gives the same flight
const params = new URLSearchParams(location.search);
const debug = params.get("debug");

let THREE = null, renderer = null, scene = null, camera = null, world = null, markers = null, dyn = null;
let droneMesh = null, rotors = [];
const drone = new Drone();
let session = null, lastT = 0, acc = 0, attractT = 0, bootTries = 0, looping = false;
const edges = { attack: false, defend: false, camReset: false, confirm: false };
const tmpV = { v: null };

const app = {
  save: SAVE.freshSave(), persisted: SAVE.freshSave(), bindings: defaultBindings(), contents: makeContents(),
  input: null, isNew: true, saveError: null,
  go(name, arg) { endSession(); screens[name](app, arg); },
  unlocked(id) { const i = ORDER.indexOf(id); return i <= 0 || !!app.persisted.completed[ORDER[i - 1]]; },
  done(id) { return !!app.persisted.completed[id]; },
  persist, startContent: safeStart, boot, loadProgress,
  saveBindings: () => SAVE.writeBindings(app.bindings),
  setAssist(v) {
    const old = app.save.assist;
    app.save.assist = v;
    if (persist(true)) return true;
    app.save.assist = old;
    return false;
  },
  setDevice(d) { app.save.device = d; persist(true); },
};

/** Write progress. Unlocks always read the last state that actually reached storage. */
function persist(quiet = false) {
  const r = SAVE.writeSave(app.save);
  if (r.ok) { app.persisted = JSON.parse(JSON.stringify(app.save)); app.saveError = null; return true; }
  app.saveError = r.reason;
  if (!quiet) {
    ui.toast(r.reason === "tab" ? "다른 탭에서 게임이 실행 중이라 이 탭의 진행 상태 저장이 차단되었습니다." : "진행 상태를 브라우저에 저장하지 못했습니다.", {
      kind: "error", ms: 9000,
      action: { label: "저장 재시도", onClick: () => { if (persist()) ui.toast("진행 상태를 저장했습니다.", { kind: "ok" }); } },
    });
  }
  return false;
}

// ---------------------------------------------------------------------------------- boot
function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot() {
  bootTries++;
  screens.loading("비행 구역을 불러오는 중…", 0.15);
  await nextFrame();
  // Check the required graphics features before loading the zone.
  if (!webglOK()) return screens.unsupported();
  try {
    if (debug === "failload" && bootTries === 1) throw new Error("테스트용 불러오기 실패");
    if (!THREE) THREE = await import("/vendor/three.module.min.js");
    screens.loading("도심 구역을 구성하는 중…", 0.55);
    await nextFrame();
    if (!renderer) initRenderer();
    initScene();
    screens.loading("게임 화면을 준비하는 중…", 0.9);
    await nextFrame();
    renderer.render(scene, camera);
  } catch (err) {
    console.error(err);
    return screens.loadFail(app, String((err && err.message) || err));
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  if (!looping) { looping = true; lastT = performance.now(); requestAnimationFrame(loop); }
  loadProgress();
}

function initRenderer() {
  const canvas = document.getElementById("view");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    if (camera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  };
  addEventListener("resize", resize);
  resize();
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    pause("lag");
    ui.toast("그래픽 컨텍스트가 끊겼습니다. 페이지를 새로고침해 주세요.", { kind: "error", ms: 0 });
  });
}

function initScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 1600);
  world = buildWorld(THREE, scene);
  markers = makeMarkers(THREE, scene);
  dyn = new THREE.Group();
  scene.add(dyn);
  tmpV.v = new THREE.Vector3();
  // Player drone: a simple quadcopter.
  droneMesh = new THREE.Group();
  rotors = [];
  const dark = new THREE.MeshLambertMaterial({ color: 0x20242c });
  droneMesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 0.95), new THREE.MeshLambertMaterial({ color: 0xf2f4f8 })));
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.13), dark);
    arm.rotation.y = a; droneMesh.add(arm);
  }
  for (const [x, z] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 14), new THREE.MeshBasicMaterial({ color: 0x9fb4d0, transparent: true, opacity: 0.45 }));
    r.position.set(x, 0.14, z); droneMesh.add(r); rotors.push(r);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  nose.position.set(0, 0, -0.5);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  tail.position.set(0, 0, 0.5);
  droneMesh.add(nose, tail);
  droneMesh.scale.setScalar(1.5);
  droneMesh.rotation.order = "YXZ";
  droneMesh.visible = false;
  scene.add(droneMesh);
}

function loadProgress() {
  ui.closeModal();
  const b = SAVE.loadBindings();
  if (b.status === "ok") Object.assign(app.bindings, mergeBindings(b.data));
  else if (b.status === "corrupt") ui.toast("저장된 조작 배치를 불러오지 못해 기본 배치를 표시합니다.", { kind: "error" });
  const fresh = () => { app.save = SAVE.freshSave(); app.persisted = SAVE.freshSave(); app.isNew = true; screens.menu(app); };
  const r = SAVE.loadSave();
  if (r.status === "ok") {
    app.save = r.data; app.persisted = JSON.parse(JSON.stringify(r.data)); app.isNew = false;
    screens.menu(app);
  } else if (r.status === "none") fresh();
  else if (r.status === "unreadable") {
    screens.hold(app, "브라우저 저장소를 읽지 못했습니다.");
    ui.modal({
      title: "저장소를 읽지 못했습니다", body: "브라우저 저장소에 접근할 수 없어 진행 상태를 불러오지 못했습니다. 다시 불러오거나, 저장 없이 새 게임으로 진행할 수 있습니다.",
      buttons: [{ label: "다시 불러오기", primary: true, onClick: loadProgress }, { label: "저장 없이 새 게임", onClick: fresh }],
    });
  } else {
    const corrupt = r.status === "corrupt";
    screens.hold(app, corrupt ? "손상된 저장 데이터가 있어 게임 시작을 보류했습니다." : `지원하지 않는 형식 버전(v${r.version})의 저장 데이터가 있어 복원을 중단했습니다.`);
    ui.modal({
      title: corrupt ? "저장 데이터가 손상되었습니다" : "지원하지 않는 저장 데이터 형식",
      body: corrupt ? "저장된 진행 상태를 읽을 수 없습니다. 기존 데이터를 지우고 새 게임으로 시작할까요? 동의하지 않으면 게임 시작을 보류합니다."
        : `이 저장 데이터(형식 버전 v${r.version})는 현재 게임에서 복원할 수 없어 복원을 중단했습니다. 기존 데이터를 지우고 새 게임으로 시작할 수 있습니다.`,
      buttons: [{ label: "새 게임으로 시작", primary: true, onClick: () => { SAVE.clearSave(); fresh(); } }, { label: "보류" }],
    });
  }
}

// ---------------------------------------------------------------------------------- hints
function hint(kind) {
  const k = app.bindings.keys, p = app.bindings.pad;
  const K = (a) => `<b>${esc(keyLabel(k[a]))}</b>`;
  const A = (a) => `<b>${esc(padAxisLabel(p.axes[a]))}</b>`;
  const B = (a) => `<b>${esc(padButtonLabel(p.buttons[a]))}</b>`;
  const pad = app.save.device === "gamepad" && app.input.pad();
  const h = pad ? {
    move: `상승·하강 ${A("throttle")} · 전진·후진 ${A("pitch")} · 좌우 이동 ${A("roll")}`,
    yaw: `기체 회전 ${A("yaw")}`,
    cam: `${B("camMod")}을(를) 누른 채 이동 스틱으로 카메라 · 초기화 ${B("camReset")}`,
    act: `공격 ${B("attack")} · 방어 ${B("defend")} · 일시정지 <b>Start</b>`,
  } : {
    move: `상승 ${K("up")} · 하강 ${K("down")} · 전진 ${K("forward")} · 후진 ${K("back")} · 좌우 이동 ${K("left")} ${K("right")}`,
    yaw: `기체 회전 ${K("yawL")} / ${K("yawR")}`,
    cam: `${K("camMod")}을(를) 누른 채 이동 키로 카메라 · 초기화 ${K("camReset")}`,
    act: `공격 ${K("attack")} · 방어 ${K("defend")} · 일시정지 <b>Esc</b>`,
  };
  return kind === "all" ? `${h.move}<br>${h.yaw}<br>${h.cam}<br>${h.act}` : h[kind];
}

// ---------------------------------------------------------------------------------- camera
function camState() {
  const yt = drone.yaw + drone.camYaw, p = drone.camPitch, cp = Math.cos(p);
  const dx = -Math.sin(yt) * cp, dy = Math.sin(p), dz = -Math.cos(yt) * cp;
  const o = { x: drone.pos.x, y: drone.pos.y + 1.6, z: drone.pos.z };
  let d = 9;
  const t = rayBoxes(o, { x: -dx, y: -dy, z: -dz }, d, world.colliders);
  if (t < d) d = Math.max(1.2, t - 0.4);
  return { ox: o.x - dx * d, oy: Math.max(0.5, o.y - dy * d), oz: o.z - dz * d, dx, dy, dz };
}

// ---------------------------------------------------------------------------------- session
const g = {
  get THREE() { return THREE; }, get scene() { return scene; }, get world() { return world; }, get markers() { return markers; },
  get dyn() { return dyn; }, get session() { return session; },
  drone, hud: ui.hud, sfx: ui.sfx,
  notice: (t, kind, ms) => ui.hud.notice(t, kind, ms),
  finish, aim: camState, hint,
  resetDrone: (p) => drone.reset(p, p.yaw),
  bearing(pos) {
    const yt = drone.yaw + drone.camYaw;
    const vx = pos.x - drone.pos.x, vz = pos.z - drone.pos.z;
    return Math.atan2(vx * Math.cos(yt) - vz * Math.sin(yt), -vx * Math.sin(yt) - vz * Math.cos(yt));
  },
};

function clearDyn() {
  while (dyn.children.length) {
    const o = dyn.children[dyn.children.length - 1];
    dyn.remove(o);
    o.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
  }
}

function endSession() {
  if (!scene) return;
  if (session && session.rt && session.rt.dispose) session.rt.dispose();
  session = null;
  markers.clear(); world.removeTemp(); clearDyn();
  world.boundaryMat.opacity = 0;
  droneMesh.visible = false;
  ui.hud.hide();
  app.input.flight = false;
}

function startContent(id) {
  const def = app.contents[id];
  if (debug === "failstart" && !startContent.failed) { startContent.failed = true; throw new Error("테스트용 시작 실패"); }
  endSession();
  ui.closeModal(); ui.hideScreen();
  app.input.clear(); app.input.flight = true;
  for (const k in edges) edges[k] = false;
  app.save.attemptSeq = (app.save.attemptSeq || 0) + 1;
  drone.reset(def.start, def.start.yaw);
  // The assist level is fixed for the whole flight; it can only change before take-off.
  session = { id, def, assist: !!app.save.assist, time: 0, collisions: 0, damage: 0, phase: def.manualStart ? "ready" : "running", ended: false, paused: false, pauseReason: null, attempt: app.save.attemptSeq, frames: 0, boundaryT: 0, noFlyT: 0, rt: null };
  session.rt = def.create(g);
  droneMesh.visible = true;
  ui.hud.show(!!def.combat);
  if (def.manualStart) ui.hud.center("Enter 또는 공격 키(게임패드 A)를 누르면 출발 — 그때부터 시간을 측정합니다");
  acc = 0; lastT = performance.now();
}

/** Start a content; if its zone or targets cannot be prepared, offer a retry instead of a broken flight. */
function safeStart(id) {
  try { startContent(id); }
  catch (err) {
    console.error(err);
    endSession();
    screens.content(app);
    ui.modal({
      title: "콘텐츠를 불러오지 못했습니다", body: "비행 구역이나 미션 정보를 준비하는 중 문제가 발생했습니다. 다시 시도하거나 콘텐츠 선택으로 돌아갈 수 있습니다.",
      buttons: [{ label: "재시도", primary: true, onClick: () => safeStart(id) }, { label: "나가기" }],
    });
  }
}

function onCollision(info) {
  const s = session, t = s.def.table;
  s.collisions++;
  const band = t.bands.find((b) => info.speed <= b.max);
  const repeat = s.collisions > t.repeatAfter;
  const dmg = Math.round(band.dmg * (repeat ? t.repeatMult : 1));
  s.damage = Math.min(100, s.damage + dmg);
  ui.hud.flash("col"); ui.sfx.hit();
  ui.hud.notice(`충돌! 속도 ${info.speed.toFixed(0)} m/s${dmg ? ` · 손상 +${dmg}%` : " · 감속"}`, "bad");
  if (s.rt.onCollision) s.rt.onCollision(info);
  if (!s.ended && s.def.failOnDamage && s.damage >= 100) finish(false, "충돌 손상이 누적되어 비행을 정지했습니다");
  return band.slow * (repeat ? 0.85 : 1);
}

function simStep(dt, inp) {
  const s = session;
  if (s.phase === "ready") {
    if (inp.confirm || inp.attack) { s.phase = "running"; ui.hud.center(""); ui.hud.notice("출발!", "ok"); ui.sfx.ok(); }
    return;
  }
  drone.step(dt, inp, world, s.assist, onCollision);
  s.time += dt;
  const f = drone.flags;
  s.boundaryT = f.boundary ? 0.3 : Math.max(0, s.boundaryT - dt);
  s.noFlyT = f.noFly ? 0.5 : Math.max(0, s.noFlyT - dt);
  if (f.recovered) ui.hud.notice("마지막으로 확인된 안전 위치로 복귀했습니다", "warn", 2600);
  if (s.ended) return;
  s.rt.update(dt, inp);
  // Strictly greater: arriving at exactly the limit still counts.
  if (!s.ended && s.def.timeLimit && s.time > s.def.timeLimit) finish(false, "제한 시간을 초과했습니다");
}

function finish(success, reason) {
  const s = session;
  if (!s || s.ended) return;
  s.ended = true;
  app.input.flight = false;
  const res = { id: s.id, def: s.def, success, reason, timeMs: Math.round(s.time * 1000), collisions: s.collisions, damage: s.damage, assist: s.assist, attempt: s.attempt };
  res.score = s.rt.score(res);
  ui.hud.center(success ? "성공!" : "실패");
  if (success) ui.sfx.ok(); else ui.sfx.fail();
  setTimeout(() => {
    if (session !== s) return;
    if (s.def.type === "tutorial") {
      app.save.tutorialDone = true; app.isNew = false;
      persist();
      endSession();
      screens.tutorialDone(app);
    } else {
      commit(res);
      endSession();
      screens.result(app, res);
    }
  }, 1000);
}

/** Store the attempt: latest + previous attempt, and best time / best score per assist level. */
function commit(res) {
  const sv = app.save;
  let rec = sv.records[res.id];
  if (!rec || typeof rec !== "object") rec = sv.records[res.id] = { on: {}, off: {}, last: null, attempts: 0 };
  const key = res.assist ? "on" : "off";
  if (!rec[key] || typeof rec[key] !== "object") { rec[key] = {}; }
  const b = rec[key];
  res.prev = rec.last;
  rec.last = { success: res.success, timeMs: res.timeMs, score: res.score, collisions: res.collisions, assist: res.assist, attempt: res.attempt };
  rec.attempts = (rec.attempts || 0) + 1;
  if (res.success) {
    res.newBestTime = b.bestTime == null || res.timeMs < b.bestTime;
    res.newBestScore = b.bestScore == null || res.score > b.bestScore;
    if (res.newBestTime) b.bestTime = res.timeMs;
    if (res.newBestScore) b.bestScore = res.score;
    sv.completed[res.id] = true;
  }
  res.best = { bestTime: b.bestTime, bestScore: b.bestScore };
  persist();
}

// ---------------------------------------------------------------------------------- pause / input loss
function pause(reason) {
  if (!session || session.ended || session.paused) return;
  session.paused = true; session.pauseReason = reason;
  app.input.clear();
  for (const k in edges) edges[k] = false;
  showPause();
}

function resume() {
  if (!session) return;
  ui.closeModal();
  app.input.clear(); // drop whatever was held when the input was lost
  session.paused = false; session.pauseReason = null;
  acc = 0; lastT = performance.now();
}

function exitFlight() {
  if (session && session.def.type === "tutorial") {
    ui.modal({
      title: "튜토리얼에서 나갈까요?", body: "지금 나가면 다음에 튜토리얼을 시작할 때 처음부터 다시 진행합니다.",
      buttons: [{ label: "나가기", primary: true, onClick: () => { app.isNew = false; app.go("content"); } }, { label: "계속 연습", onClick: showPause }],
    });
  } else app.go("content");
}

function showPause() {
  const s = session;
  if (!s) return;
  const reason = s.pauseReason, tut = s.def.type === "tutorial";
  const padOK = !!app.input.pad();
  const T = {
    user: ["일시정지", "비행을 일시정지했습니다."],
    blur: ["입력이 끊겨 일시정지했습니다", "창이 포커스를 잃어 입력이 끊겼습니다. 드론이 계속 움직이지 않도록 게임을 멈췄습니다."],
    lag: ["화면 갱신 지연", "화면 갱신이 1초 이상 지연되어 비행을 일시정지했습니다."],
    pad: ["게임패드 입력이 끊겼습니다", padOK ? "게임패드가 다시 연결되었습니다. 확인을 누르면 게임을 재개합니다."
      : "게임패드 연결이 끊겨 게임을 일시정지했습니다. 다시 연결한 뒤 확인하거나, 키보드로 확인하고 재개할 수 있습니다." + (app.input.gamepadApi() ? "" : " (이 브라우저는 일부 장치의 연결 끊김을 감지하지 못할 수 있습니다.)")],
  }[reason] || ["일시정지", ""];
  const buttons = reason === "pad"
    ? [{ label: "확인 후 재개", primary: true, disabled: !padOK, onClick: resume }, { label: "키보드로 재개", onClick: resume }]
    : [{ label: "계속하기", primary: true, onClick: resume }];
  buttons.push({ label: "처음부터 다시", onClick: () => safeStart(s.id) });
  buttons.push({ label: tut ? "튜토리얼 건너뛰기" : "나가기", onClick: exitFlight });
  ui.modal({ title: T[0], body: T[1], buttons });
}

function unsupportedDevice(gp) {
  const inFlight = session && !session.ended;
  if (inFlight && !session.paused) { session.paused = true; session.pauseReason = "user"; app.input.clear(); }
  ui.modal({
    title: "지원되지 않는 입력 장치",
    body: `브라우저가 표준 게임패드로 인식하지 못한 장치입니다 (${esc(gp.id || "알 수 없는 장치")}). 실제 드론 조종기와 장치별 보정은 지원하지 않습니다. 키보드나 표준 게임패드를 사용해 주세요.`,
    buttons: inFlight ? [{ label: "지원 장치로 계속", primary: true, onClick: resume }, { label: "콘텐츠 선택으로", onClick: () => app.go("content") }] : [{ label: "확인", primary: true }],
  });
}

// ---------------------------------------------------------------------------------- frame
function updateFlightView(dt) {
  const s = session, def = s.def;
  droneMesh.position.set(drone.pos.x, drone.pos.y, drone.pos.z);
  droneMesh.rotation.set(-drone.tiltF * 0.42, drone.yaw, -drone.tiltR * 0.42);
  if (!s.paused) for (const r of rotors) r.rotation.y += dt * 40;
  const c = camState();
  camera.position.set(c.ox, c.oy, c.oz);
  camera.lookAt(c.ox + c.dx, c.oy + c.dy, c.oz + c.dz);
  camera.updateMatrixWorld();
  markers.update(camera.position);
  const bm = world.boundaryMat;
  bm.opacity += ((s.boundaryT > 0 ? 0.55 : 0) - bm.opacity) * Math.min(1, dt * 10);
  ui.hud.edge(s.boundaryT > 0 ? "구역 밖으로 이동할 수 없습니다" : s.noFlyT > 0 ? "비행 제한 영역에는 진입할 수 없습니다" : null);
  if (def.timeLimit) {
    const left = Math.max(0, def.timeLimit - s.time);
    ui.hud.timer(s.phase === "ready" ? "제한 시간 (출발 대기)" : "남은 시간", ui.fmtTime(left * 1000), left < 10);
  } else ui.hud.timer("경과 시간", ui.fmtTime(s.time * 1000), false);
  ui.hud.stats(Math.hypot(drone.vel.x, drone.vel.y, drone.vel.z), Math.max(0, drone.pos.y - 0.45), s.collisions, s.damage, s.assist);
  const o = s.rt.objective();
  ui.hud.objective({ type: def.typeLabel, title: o.title || def.title, items: o.items, fails: o.fails || def.fails || [], hint: o.hint || "" });
  ui.hud.keys(hint("all"));
  const n = s.rt.nav && s.rt.nav();
  if (!n) ui.hud.nav(null);
  else {
    const v = tmpV.v.set(n.pos.x, n.pos.y, n.pos.z);
    const d = Math.hypot(n.pos.x - drone.pos.x, n.pos.y - drone.pos.y, n.pos.z - drone.pos.z);
    v.project(camera);
    let x = v.x, y = v.y;
    const behind = v.z > 1;
    if (behind) { x = -x; y = -y; }
    const on = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.82;
    if (!on) { const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.82) || 1; x /= m; y /= m; }
    ui.hud.nav({ x: (x * 0.5 + 0.5) * innerWidth, y: (-y * 0.5 + 0.5) * innerHeight - (on ? 34 : 0), on, angle: Math.atan2(x, y), dist: d, label: n.label });
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const dtMs = now - lastT;
  lastT = now;
  app.input.pollCapture();
  if (session) {
    if (!session.paused && !session.ended) {
      session.frames++;
      // A long frame pauses the flight — except the first frames after loading a content, which are setup cost.
      if (dtMs > 1000) { if (session.frames > 8 && debug !== "nolag") pause("lag"); }
      else {
        const inp = app.input.read();
        if (inp.pause) pause("user");
        else {
          for (const k in edges) edges[k] = edges[k] || inp[k];
          acc += Math.min(dtMs / 1000, 0.1);
          while (acc >= FIXED && session && !session.ended && !session.paused) {
            Object.assign(inp, edges);
            simStep(FIXED, inp);
            for (const k in edges) edges[k] = false;
            acc -= FIXED;
          }
        }
      }
    }
    if (session) updateFlightView(Math.min(dtMs / 1000, 0.1));
  } else {
    // Menu backdrop: a slow orbit over the district.
    attractT += Math.min(dtMs / 1000, 0.1) * 0.05;
    camera.position.set(Math.cos(attractT) * 235, 120, Math.sin(attractT) * 235 + 20);
    camera.lookAt(0, 22, 10);
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------------- wiring
app.input = new Input(app.bindings, {
  blur: () => { if (session && !session.paused && !session.ended) pause("blur"); },
  padConnected: (gp) => {
    if (gp.mapping !== "standard") return unsupportedDevice(gp);
    ui.toast("게임패드가 연결되었습니다.", { kind: "ok", ms: 2200 });
    if (session && session.paused && session.pauseReason === "pad") showPause();
  },
  padDisconnected: (gp, wasActive) => {
    if (session && !session.ended && wasActive) {
      if (session.paused) { session.pauseReason = "pad"; showPause(); } else pause("pad");
    } else if (wasActive) ui.toast("게임패드 연결이 해제되었습니다.", { kind: "error" });
  },
});
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && session && session.paused && session.pauseReason !== "pad" && ui.modalOpen() && !e.repeat) { e.preventDefault(); resume(); }
});
SAVE.startTabHeartbeat();
if (debug) window.__sdp = { app, drone, g, get session() { return session; }, startContent: safeStart, finish, pause, resume };
boot();
