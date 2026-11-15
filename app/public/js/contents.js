// Race, single-player missions, fictional combat and the tutorial. Offline, single player.
import { PADS, rayBoxes } from "./world.js";
import { PHYS } from "./drone.js";

export const ORDER = ["race", "arrive", "follow", "deliver", "combat"];

// Per-content collision tables: impact-speed bands decide the slow-down and the damage,
// and repeated collisions hit harder. Damage never changes flight performance — it only fails the attempt.
const TABLE_STD = { bands: [{ max: 6, slow: 0.75, dmg: 6 }, { max: 14, slow: 0.5, dmg: 16 }, { max: 1e9, slow: 0.3, dmg: 30 }], repeatAfter: 3, repeatMult: 1.5 };
const TABLE_SOFT = { bands: [{ max: 6, slow: 0.8, dmg: 0 }, { max: 14, slow: 0.6, dmg: 0 }, { max: 1e9, slow: 0.4, dmg: 0 }], repeatAfter: 99, repeatMult: 1 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copy = (p) => ({ x: p.x, y: p.y, z: p.z });

/** Did the segment p0→p1 cross the checkpoint's gate plane inside its ring? */
function crossed(p0, p1, c) {
  const s0 = (p0.x - c.x) * c.nx + (p0.z - c.z) * c.nz;
  const s1 = (p1.x - c.x) * c.nx + (p1.z - c.z) * c.nz;
  if (s0 === s1 || (s0 > 0) === (s1 > 0)) return false;
  const t = s0 / (s0 - s1);
  const x = p0.x + (p1.x - p0.x) * t, y = p0.y + (p1.y - p0.y) * t, z = p0.z + (p1.z - p0.z) * t;
  return Math.hypot(x - c.x, y - c.y, z - c.z) <= c.r;
}

const RACE_CP = [
  { x: 0, y: 15, z: 40, nx: 0, nz: -1, r: 8 },
  { x: 0, y: 22, z: -40, nx: 0, nz: -1, r: 8 },
  { x: 40, y: 26, z: -80, nx: 1, nz: 0, r: 7 },
  { x: 110, y: 24, z: -80, nx: 1, nz: 0, r: 7 },
  { x: 140, y: 22, z: -40, nx: 0, nz: 1, r: 7 },
  { x: 140, y: 14, z: 40, nx: 0, nz: 1, r: 7 },
  { x: 140, y: 8, z: 112, nx: 0, nz: 1, r: 7 },
  { x: 80, y: 4.8, z: 145, nx: -1, nz: 0, r: 4.2 },
  { x: 0, y: 7, z: 145, nx: -1, nz: 0, r: 7 },
  { x: -80, y: 4.8, z: 145, nx: -1, nz: 0, r: 4.2 },
  { x: -80, y: 18, z: 70, nx: 0, nz: -1, r: 7 },
];
const RACE_GOAL = { x: -44, y: 5, z: 10, r: 9 };
const RACE_TIME = [[85, 1000], [110, 800], [135, 600], [165, 400], [1e9, 200]];

const FOLLOW_PATH = [
  { x: 0, y: 12, z: 62 }, { x: 0, y: 14, z: -20 }, { x: -80, y: 16, z: -20 }, { x: -80, y: 20, z: -80 },
  { x: -140, y: 18, z: -80 }, { x: -140, y: 12, z: 40 }, { x: -140, y: 10, z: 90 },
];

export function makeContents() {
  const C = {};

  // ------------------------------------------------------------------------------- race
  C.race = {
    id: "race", type: "race", typeLabel: "도시 레이스", title: "도심 순환 레이스",
    summary: "체크포인트 11개를 순서대로 통과해 광장 도착 지점까지 비행합니다.",
    goal: "출발 지점(초록 원)에서 체크포인트를 순서대로 통과한 뒤 도착 지점(파란 깃발)에 도달",
    info: ["체크포인트 11개 · 교량 아래 구간 2곳 포함", "시간 측정은 출발 조작(Enter / 공격 키 / 게임패드 A) 후 시작", "점수 = 완료 시간 구간 점수 + 통과 체크포인트 × 50 − 충돌 × 60"],
    fails: ["제한 시간 200초 초과", "체크포인트를 놓친 채 도착 지점 도달", "충돌 손상 100% 누적"],
    timeLimit: 200, start: { x: 0, y: 2, z: 90, yaw: 0 }, manualStart: true, failOnDamage: true, table: TABLE_STD,
    create(g) {
      const rings = RACE_CP.map((c) => g.markers.ring(c));
      let next = 0, prev = copy(g.drone.pos);
      const refresh = () => rings.forEach((m, i) => g.markers.setRing(m, i < next ? "passed" : i === next ? "next" : "future"));
      g.markers.startCircle(this.start);
      g.markers.goal(RACE_GOAL);
      refresh();
      return {
        update() {
          const p = g.drone.pos;
          for (let i = 0; i < RACE_CP.length; i++) {
            if (i < next || !crossed(prev, p, RACE_CP[i])) continue;
            if (i === next) {
              next++; refresh(); g.sfx.cp();
              g.notice(`체크포인트 ${next}/${RACE_CP.length} 통과`, "ok");
            } else g.notice("순서가 맞지 않아 통과가 인정되지 않습니다", "warn");
          }
          prev = copy(p);
          if (dist(p, RACE_GOAL) <= RACE_GOAL.r) {
            if (next >= RACE_CP.length) g.finish(true, "모든 체크포인트를 통과하고 도착했습니다");
            else g.finish(false, "체크포인트를 놓친 채 도착 지점에 도달했습니다");
          }
        },
        objective() {
          return { items: [{ text: `체크포인트 ${next}/${RACE_CP.length}`, done: next >= RACE_CP.length }, { text: "도착 지점(파란 깃발) 도달", done: false }] };
        },
        nav() { return next < RACE_CP.length ? { pos: RACE_CP[next], label: `체크포인트 ${next + 1}` } : { pos: RACE_GOAL, label: "도착" }; },
        score(res) {
          const band = res.success ? RACE_TIME.find((b) => res.timeMs / 1000 <= b[0])[1] : 0;
          return Math.max(0, band + next * 50 - res.collisions * 60);
        },
      };
    },
  };

  // ------------------------------------------------------------------------------- arrive
  const ARRIVE_T = { x: PADS.towerA.x, y: PADS.towerA.y + 2.5, z: PADS.towerA.z, r: 9 };
  C.arrive = {
    id: "arrive", type: "mission", typeLabel: "싱글 미션 1", title: "옥상 헬리패드 도착",
    summary: "제한 시간 안에 동쪽 고층 빌딩 옥상의 지정 장소에 도착합니다.",
    goal: "동쪽 고층 빌딩(높이 64m) 옥상 헬리패드의 목표 영역에 진입",
    info: ["목표 영역 반경 9m — 진입하면 도착 인정", "화면의 방향 표시와 거리를 따라 비행", "점수 = 1000 − 경과 초 × 6 − 충돌 × 40"],
    fails: ["제한 시간 60초 초과", "충돌 손상 100% 누적"],
    timeLimit: 60, start: { x: -44, y: 2, z: 10, yaw: -Math.PI / 2 }, failOnDamage: true, table: TABLE_STD,
    create(g) {
      g.markers.startCircle(this.start);
      g.markers.zone(ARRIVE_T, 0x3a86ff, "지정 장소", "goal");
      return {
        update() { if (dist(g.drone.pos, ARRIVE_T) <= ARRIVE_T.r) g.finish(true, "지정 장소에 도착했습니다"); },
        objective() { return { items: [{ text: `지정 장소까지 ${Math.round(dist(g.drone.pos, ARRIVE_T))}m`, done: false }] }; },
        nav() { return { pos: ARRIVE_T, label: "지정 장소" }; },
        score(res) { return res.success ? Math.max(100, Math.round(1000 - res.timeMs / 1000 * 6 - res.collisions * 40)) : 0; },
      };
    },
  };

  // ------------------------------------------------------------------------------- follow
  C.follow = {
    id: "follow", type: "mission", typeLabel: "싱글 미션 2", title: "유도 드론 추적",
    summary: "도심을 가로지르는 유도 드론을 놓치지 않고 최종 지점까지 따라갑니다.",
    goal: "노란 유도 드론을 45m 이내로 유지하며 최종 지점까지 추적",
    info: ["추적 목표: 허구의 배송 유도 드론 (경로 약 450m)", "45m 넘게 멀어지면 놓친 상태 — 6초 안에 다시 접근", "점수 = 1000 − 놓친 시간 × 30 − 충돌 × 40"],
    fails: ["놓친 상태가 6초 지속", "제한 시간 120초 초과", "유도 드론이 최종 지점에 도달할 때 놓친 상태", "충돌 손상 100% 누적"],
    timeLimit: 120, start: { x: 0, y: 2, z: 90, yaw: 0 }, failOnDamage: true, table: TABLE_STD,
    create(g) {
      const T = g.THREE;
      const mesh = new T.Group();
      const body = new T.Mesh(new T.OctahedronGeometry(1.3), new T.MeshBasicMaterial({ color: 0xffd23f }));
      const halo = new T.Mesh(new T.TorusGeometry(2.1, 0.18, 6, 24), new T.MeshBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true, opacity: 0.9 }));
      halo.rotation.x = Math.PI / 2; halo.renderOrder = 998;
      mesh.add(body, halo);
      g.dyn.add(mesh);
      const tp = copy(FOLLOW_PATH[0]);
      let seg = 0, started = false, lostT = 0, lostTotal = 0, lost = false, wait = 0;
      const end = FOLLOW_PATH[FOLLOW_PATH.length - 1];
      g.markers.startCircle(this.start);
      g.markers.zone({ ...end, r: 8 }, 0x3a86ff, "최종 지점", "goal");
      return {
        update(dt) {
          const p = g.drone.pos;
          wait += dt;
          if (!started && (dist(p, tp) < 28 || wait > 6)) { started = true; g.notice("유도 드론이 출발했습니다 — 따라가세요", "ok"); }
          if (started && seg < FOLLOW_PATH.length - 1) {
            const n = FOLLOW_PATH[seg + 1];
            const d = dist(tp, n);
            const speed = d < 12 ? 7 : 11.5;
            const stepLen = speed * dt;
            if (d <= stepLen) { tp.x = n.x; tp.y = n.y; tp.z = n.z; seg++; }
            else { tp.x += (n.x - tp.x) / d * stepLen; tp.y += (n.y - tp.y) / d * stepLen; tp.z += (n.z - tp.z) / d * stepLen; }
          }
          mesh.position.set(tp.x, tp.y, tp.z); mesh.rotation.y += dt * 2;
          const d = dist(p, tp);
          const nowLost = started && d > 45;
          if (nowLost && !lost) g.notice("목표를 놓쳤습니다 — 6초 안에 다시 접근하세요", "warn");
          if (!nowLost && lost) g.notice("목표를 다시 포착했습니다", "ok");
          lost = nowLost;
          if (lost) { lostT += dt; lostTotal += dt; } else lostT = 0;
          g.hud.center(lost ? `목표 놓침 — 실패까지 ${Math.max(0, 6 - lostT).toFixed(1)}초` : "");
          if (lost && lostT > 6) return g.finish(false, "추적 목표를 놓친 상태가 6초 동안 지속되었습니다");
          if (seg >= FOLLOW_PATH.length - 1) {
            if (lost) g.finish(false, "유도 드론이 최종 지점에 도달할 때 목표를 놓친 상태였습니다");
            else g.finish(true, "유도 드론을 최종 지점까지 따라갔습니다");
          }
        },
        objective() {
          return { items: [
            { text: `유도 드론과의 거리 ${Math.round(dist(g.drone.pos, tp))}m (허용 45m)`, done: false },
            { text: `경로 진행 ${seg}/${FOLLOW_PATH.length - 1}`, done: false },
          ] };
        },
        nav() { return { pos: tp, label: "유도 드론" }; },
        score(res) { return res.success ? Math.max(100, Math.round(1000 - lostTotal * 30 - res.collisions * 40)) : 0; },
      };
    },
  };

  // ------------------------------------------------------------------------------- deliver
  const PICK = { ...PADS.park, r: 6 }, DROP = { ...PADS.towerB, r: 6.5 };
  C.deliver = {
    id: "deliver", type: "mission", typeLabel: "싱글 미션 3", title: "옥상 물품 운송",
    summary: "강변 공원에서 물품을 수령해 서쪽 빌딩 옥상에 착륙해 전달합니다.",
    goal: "강변 공원 패드에 착륙해 물품 수령 → 서쪽 빌딩(38m) 옥상 패드에 착륙해 정지",
    info: ["패드에 착륙하면 물품을 자동 수령 — 하강 속도 6 m/s 이상으로 닿으면 충돌로 처리", "목적지 패드에 접지 후 정지하면 운송 완료", "점수 = 1000 − 경과 초 × 4 − 충돌 × 80"],
    fails: ["제한 시간 150초 초과", "운송 중 충돌 3회 초과 (4번째 충돌에서 실패)", "충돌 손상 100% 누적", "완료와 실패 조건이 동시에 충족되면 실패"],
    timeLimit: 150, start: { x: -44, y: 2, z: 10, yaw: Math.PI }, failOnDamage: true, table: TABLE_STD,
    create(g) {
      const T = g.THREE;
      let carrying = false, hold = 0, cargoHits = 0;
      const parcel = new T.Mesh(new T.BoxGeometry(0.9, 0.7, 0.9), new T.MeshLambertMaterial({ color: 0xc98b4a }));
      parcel.visible = false;
      g.dyn.add(parcel);
      g.markers.startCircle(this.start);
      let pickMark = g.markers.zone(PICK, 0xffd23f, "물품 수령", "zone");
      g.markers.zone(DROP, 0x3a86ff, "목적지", "goal");
      const landedOn = (pad) => {
        const d = g.drone;
        return d.grounded && hdist(d.pos, pad) <= pad.r && Math.abs(d.pos.y - (pad.y + PHYS.ground)) < 1.4 && Math.hypot(d.vel.x, d.vel.y, d.vel.z) < 0.8;
      };
      return {
        update(dt) {
          const pad = carrying ? DROP : PICK;
          hold = landedOn(pad) ? hold + dt : 0;
          if (hold > 0.4) {
            hold = 0;
            if (!carrying) {
              carrying = true; parcel.visible = true; g.markers.remove(pickMark); pickMark = null;
              g.sfx.cp(); g.notice("물품 수령 완료 — 목적지 옥상으로 운송하세요", "ok");
            } else g.finish(true, "물품을 목적지에 전달했습니다");
          }
          parcel.position.set(g.drone.pos.x, g.drone.pos.y - 0.25, g.drone.pos.z);
        },
        onCollision() {
          if (!carrying) return;
          cargoHits++;
          if (cargoHits > 3) g.finish(false, "운송 중 충돌 횟수가 한도(3회)를 초과했습니다");
          else g.notice(`운송 중 충돌 ${cargoHits}/3`, "warn");
        },
        objective() {
          return { items: [
            { text: "강변 공원 패드에 착륙해 물품 수령", done: carrying },
            { text: "서쪽 빌딩 옥상 패드에 착륙해 정지", done: false },
            { text: `운송 중 충돌 ${cargoHits}/3`, done: false },
          ] };
        },
        nav() { return carrying ? { pos: DROP, label: "목적지" } : { pos: PICK, label: "물품 수령" }; },
        score(res) { return res.success ? Math.max(100, Math.round(1000 - res.timeMs / 1000 * 4 - res.collisions * 80)) : 0; },
      };
    },
  };

  // ------------------------------------------------------------------------------- combat
  C.combat = {
    id: "combat", type: "combat", typeLabel: "가상 드론 전투", title: "강변 교란 드론 무력화",
    summary: "허구의 교란 드론 3기를 펄스 교란기로 무력화합니다.",
    goal: "강변 전투 구역의 지정된 적 드론 3기를 모두 무력화하면 승리",
    info: [
      "적: 정찰형 교란 드론 2기(공격 피해 8) · 중장형 교란 드론 1기(공격 피해 15) — 각 체력 100",
      "전투 구역: 한강을 본뜬 강변과 두 교량 주변 — 적은 약 95m 안으로 접근하면 교전을 시작",
      "펄스 교란기(공격): 화면 중앙을 적에게 맞추고 발사 — 피해 25, 재충전 2초",
      "방어막(방어): 2초 동안 모든 방향의 피해 차단, 재사용 대기 6초",
      "수리 키트(초록 십자): 닿으면 획득(최대 3개 보유) — 체력이 줄어 있으면 자동으로 사용해 25 회복, 체력이 가득이면 소모되지 않음",
      "모든 장비와 규칙은 허구이며 실제 무기·전술과 무관합니다",
    ],
    fails: ["플레이어 체력 100 소진 (그 외 패배 조건 없음)"],
    timeLimit: 0, start: { x: 0, y: 2, z: 90, yaw: Math.PI }, failOnDamage: false, table: TABLE_SOFT, combat: true,
    create(g) {
      const T = g.THREE;
      const enemies = [], shots = [], kits = [];
      let hp = 100, cd = 0, shieldT = 0, shieldCd = 0, kills = 0, beamT = 0, held = 0;
      const mkEnemy = (type, name, x, y, z, phase) => {
        const big = type === "heavy";
        const grp = new T.Group();
        const body = new T.Mesh(new T.OctahedronGeometry(big ? 2.4 : 1.6), new T.MeshLambertMaterial({ color: big ? 0x9b1d3a : 0xd7263d, emissive: 0x5a0a14 }));
        const ring = new T.Mesh(new T.TorusGeometry(big ? 3.3 : 2.3, 0.14, 6, 24), new T.MeshBasicMaterial({ color: 0xff5d5d }));
        ring.rotation.x = Math.PI / 2;
        const lock = new T.Mesh(new T.TorusGeometry(big ? 4.4 : 3.2, 0.2, 6, 4), new T.MeshBasicMaterial({ color: 0x5ee0d0, depthTest: false }));
        lock.visible = false; lock.renderOrder = 998;
        grp.add(body, ring, lock);
        grp.position.set(x, y, z);
        g.dyn.add(grp);
        enemies.push({ type, name, hp: 100, alive: true, pos: { x, y, z }, home: { x, y, z }, mesh: grp, lock, fire: 3 + phase, dmg: big ? 15 : 8, interval: big ? 6 : 4.2, speed: big ? 6 : 9, ang: phase * 2.1, vy: 0 });
      };
      mkEnemy("scout", "정찰형 교란 드론 A", -115, 22, 142, 0);
      mkEnemy("scout", "정찰형 교란 드론 B", 115, 26, 150, 1);
      mkEnemy("heavy", "중장형 교란 드론", 0, 34, 178, 2);
      for (const [x, y, z] of [[-120, 6, 113], [120, 6, 113], [-30, 12, 150], [30, 12, 150]]) {
        const m = new T.Group();
        const mat = new T.MeshBasicMaterial({ color: 0x3ddc84 });
        m.add(new T.Mesh(new T.BoxGeometry(2.4, 0.8, 0.8), mat), new T.Mesh(new T.BoxGeometry(0.8, 2.4, 0.8), mat));
        m.position.set(x, y, z);
        g.dyn.add(m);
        kits.push({ pos: { x, y, z }, mesh: m, taken: false });
      }
      const shield = new T.Mesh(new T.SphereGeometry(2, 20, 14), new T.MeshBasicMaterial({ color: 0x5ee0d0, transparent: true, opacity: 0.28, depthWrite: false }));
      shield.visible = false;
      g.dyn.add(shield);
      const beamGeo = new T.BufferGeometry();
      beamGeo.setAttribute("position", new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const beam = new T.Line(beamGeo, new T.LineBasicMaterial({ color: 0x9ff7ee, transparent: true }));
      beam.visible = false; beam.frustumCulled = false;
      g.dyn.add(beam);
      const shotGeo = new T.SphereGeometry(0.55, 10, 8);
      const shotMat = new T.MeshBasicMaterial({ color: 0xff7b54 });

      const pick = (aim) => {
        const P = g.drone.pos;
        let best = null, bd = 1e9;
        for (const e of enemies) {
          if (!e.alive) continue;
          const vx = e.pos.x - aim.ox, vy = e.pos.y - aim.oy, vz = e.pos.z - aim.oz;
          const t = vx * aim.dx + vy * aim.dy + vz * aim.dz;
          if (t <= 0 || t > 135) continue;
          const perp = Math.hypot(vx - aim.dx * t, vy - aim.dy * t, vz - aim.dz * t);
          if (perp > (e.type === "heavy" ? 3.4 : 2.6) + t * 0.012) continue;
          const L = dist(e.pos, P);
          // An enemy behind an obstacle cannot be targeted.
          if (rayBoxes(P, { x: (e.pos.x - P.x) / L, y: (e.pos.y - P.y) / L, z: (e.pos.z - P.z) / L }, L, g.world.colliders) < L) continue;
          if (L < bd) { bd = L; best = e; }
        }
        return best;
      };
      const setBeam = (a, b) => {
        const arr = beamGeo.attributes.position.array;
        arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
        beamGeo.attributes.position.needsUpdate = true;
        beam.visible = true; beamT = 0.18;
      };

      return {
        update(dt, inp) {
          const P = g.drone.pos;
          cd = Math.max(0, cd - dt);
          if (shieldT > 0) { shieldT -= dt; if (shieldT <= 0) { shieldT = 0; shieldCd = 6; } }
          else shieldCd = Math.max(0, shieldCd - dt);
          // Repeated defend presses while active or cooling down are ignored.
          if (inp.defend && shieldT <= 0 && shieldCd <= 0) { shieldT = 2; g.sfx.shield(); g.notice("방어막 가동 — 2초 동안 피해 차단", "ok"); }

          const aim = g.aim();
          const target = pick(aim);
          for (const e of enemies) e.lock.visible = e === target;
          g.hud.aim(target ? `${target.name} · 체력 ${target.hp}/100` : "", !!target);

          if (inp.attack) {
            if (shieldT > 0) g.notice("방어 중에는 공격 장비를 사용할 수 없습니다", "warn");
            else if (cd <= 0) {
              cd = 2; g.sfx.shot();
              if (target) {
                target.hp = Math.max(0, target.hp - 25);
                setBeam(P, target.pos);
                if (target.hp <= 0) { target.alive = false; kills++; g.notice(`적중 −25 · ${target.name} 무력화!`, "ok"); g.sfx.ok(); }
                else g.notice(`적중 −25 · ${target.name} 체력 ${target.hp}`, "ok");
              } else {
                setBeam(P, { x: aim.ox + aim.dx * 120, y: aim.oy + aim.dy * 120, z: aim.oz + aim.dz * 120 });
                g.notice("빗나감 — 조준 대상 없음", "warn");
              }
            } // still recharging: the input is ignored
          }
          if (beamT > 0) { beamT -= dt; beam.material.opacity = Math.max(0, beamT / 0.18); if (beamT <= 0) beam.visible = false; }

          for (const e of enemies) {
            if (!e.alive) {
              if (e.mesh.visible) { e.vy -= 18 * dt; e.pos.y += e.vy * dt; e.mesh.position.y = e.pos.y; e.mesh.rotation.z += dt * 4; if (e.pos.y < 0) e.mesh.visible = false; }
              continue;
            }
            e.ang += dt * (e.type === "heavy" ? 0.2 : 0.35);
            const dP = dist(e.pos, P);
            let tx = e.home.x, ty = e.home.y, tz = e.home.z;
            // Enemies engage only inside their alert range, so they can be drawn out one at a time.
            if (dP < 95) e.alert = 6; else e.alert = Math.max(0, (e.alert || 0) - dt);
            if (e.alert > 0) {
              const R = e.type === "heavy" ? 60 : 45;
              tx = P.x + Math.cos(e.ang) * R; tz = P.z + Math.sin(e.ang) * R; ty = P.y + 8 + Math.sin(e.ang * 1.7) * 5;
            }
            tx = Math.max(-180, Math.min(180, tx)); tz = Math.max(110, Math.min(180, tz)); ty = Math.max(13, Math.min(48, ty));
            const dx = tx - e.pos.x, dy = ty - e.pos.y, dz = tz - e.pos.z, dl = Math.hypot(dx, dy, dz);
            if (dl > 0.5) { const s = Math.min(dl, e.speed * dt) / dl; e.pos.x += dx * s; e.pos.y += dy * s; e.pos.z += dz * s; }
            e.mesh.position.set(e.pos.x, e.pos.y, e.pos.z); e.mesh.rotation.y += dt * 1.5;
            e.fire -= dt;
            if (e.fire <= 0) {
              const dir = { x: (P.x - e.pos.x) / dP, y: (P.y - e.pos.y) / dP, z: (P.z - e.pos.z) / dP };
              if (e.alert > 0 && dP < 100 && rayBoxes(e.pos, dir, dP, g.world.colliders) >= dP) {
                const m = new T.Mesh(shotGeo, shotMat);
                m.position.set(e.pos.x, e.pos.y, e.pos.z);
                g.dyn.add(m);
                shots.push({ pos: copy(e.pos), vel: { x: dir.x * 36, y: dir.y * 36, z: dir.z * 36 }, life: 4.5, dmg: e.dmg, mesh: m });
                e.fire = e.interval;
                g.hud.warn(g.bearing(e.pos), `${e.type === "heavy" ? "중장형" : "정찰형"} 공격!`);
                g.sfx.warn();
              } else e.fire = 0.5;
            }
          }

          for (let i = shots.length - 1; i >= 0; i--) {
            const s = shots[i];
            const stepLen = 36 * dt;
            const blocked = rayBoxes(s.pos, { x: s.vel.x / 36, y: s.vel.y / 36, z: s.vel.z / 36 }, stepLen, g.world.colliders) < stepLen;
            s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt; s.life -= dt;
            s.mesh.position.set(s.pos.x, s.pos.y, s.pos.z);
            let gone = blocked || s.life <= 0 || s.pos.y < 0;
            if (!gone && dist(s.pos, P) < 1.9) {
              gone = true;
              if (shieldT > 0) { g.notice("방어 성공 — 피해 차단", "ok"); g.sfx.shield(); }
              else {
                hp = Math.max(0, hp - s.dmg);
                g.hud.flash("hit"); g.sfx.hit();
                g.notice(`피격! −${s.dmg} (남은 체력 ${hp})`, "bad");
                // Exhausted health ends the battle before anything else is evaluated.
                if (hp <= 0) { g.finish(false, "체력이 모두 소진되었습니다"); }
              }
            }
            if (gone) { g.dyn.remove(s.mesh); shots.splice(i, 1); }
          }
          if (g.session.ended) return;

          for (const k of kits) {
            if (k.taken) continue;
            k.mesh.rotation.y += dt * 2;
            if (dist(k.pos, P) < 3.6) {
              if (held < 3) {
                k.taken = true; k.mesh.visible = false; held++;
                g.sfx.cp(); g.notice(`수리 키트 획득 (보유 ${held}/3)`, "ok");
              } else if (!k.fullNote) { k.fullNote = true; g.notice("수리 키트는 최대 3개까지 보유할 수 있습니다", "warn"); }
            } else k.fullNote = false;
          }
          // A held kit is used automatically as soon as the drone is damaged; never at full health.
          if (held > 0 && hp < 100) {
            const before = hp;
            hp = Math.min(100, hp + 25); held--;
            g.sfx.cp(); g.notice(`수리 키트 사용 +${hp - before} (체력 ${hp} · 보유 ${held}/3)`, "ok");
          }
          shield.visible = shieldT > 0;
          shield.position.set(P.x, P.y, P.z);
          g.hud.combat({
            hp, wpn: 1 - cd / 2, wpnText: cd > 0 ? cd.toFixed(1) + "초" : "준비",
            shd: shieldT > 0 ? shieldT / 2 : 1 - shieldCd / 6, shdText: shieldT > 0 ? "가동 중" : shieldCd > 0 ? shieldCd.toFixed(1) + "초" : "준비", active: shieldT > 0,
          });
          if (kills >= enemies.length) g.finish(true, "지정된 적 드론을 모두 무력화했습니다");
        },
        objective() { return { items: [{ text: `적 드론 무력화 ${kills}/${enemies.length}`, done: kills >= enemies.length }, { text: `수리 키트 보유 ${held}/3 · 구역에 ${kits.filter((k) => !k.taken).length}개`, done: false }] }; },
        nav() {
          let best = null, bd = 1e9;
          for (const e of enemies) if (e.alive) { const d = dist(e.pos, g.drone.pos); if (d < bd) { bd = d; best = e; } }
          return best ? { pos: best.pos, label: "적 드론" } : null;
        },
        score(res) { return Math.max(0, Math.round(kills * 300 + hp * 3 + (res.success ? Math.max(0, 400 - res.timeMs / 1000 * 2) : 0))); },
      };
    },
  };

  // ------------------------------------------------------------------------------- tutorial
  C.tutorial = {
    id: "tutorial", type: "tutorial", typeLabel: "튜토리얼", title: "조작 튜토리얼",
    summary: "이동 → 회전 → 카메라 → 충돌 회피 → 콘텐츠 목표 순으로 조작을 익힙니다.",
    timeLimit: 0, start: { x: 0, y: 2, z: 95, yaw: 0 }, failOnDamage: false, table: TABLE_SOFT,
    create(g) {
      const d = g.drone;
      let si = -1, step = null, stepT = 0, doneT = -1, hitFlag = false, prev = copy(d.pos), cpDone = false;
      const task = (label, need) => ({ label, need, v: 0, done: false });
      const add = (i, amount) => {
        const t = step.tasks[i];
        if (t.done || amount <= 0) return;
        t.v += amount;
        if (t.v >= t.need) { t.done = true; g.sfx.cp(); }
      };
      const AVOID_T = { x: 0, y: 8, z: 18, r: 7 }, GOAL_CP = { x: 0, y: 14, z: 10, nx: 0, nz: -1, r: 7 }, GOAL_T = { x: -44, y: 6, z: 10, r: 9 };
      const steps = [
        {
          title: "1/5 이동 연습", hint: "move", fail: "실패 조건 없음 — 여섯 가지 이동을 모두 수행하면 성공",
          tasks: () => [task("상승", 3), task("하강", 3), task("전진", 5), task("후진", 5), task("왼쪽 이동", 5), task("오른쪽 이동", 5)],
          enter() { g.resetDrone({ x: 0, y: 2, z: 95, yaw: 0 }); },
          update(dt, inp) {
            const sy = Math.sin(d.yaw), cy = Math.cos(d.yaw);
            const vf = -d.vel.x * sy - d.vel.z * cy, vr = d.vel.x * cy - d.vel.z * sy;
            add(0, inp.lift > 0.3 && d.vel.y > 0.5 ? d.vel.y * dt : 0);
            add(1, inp.lift < -0.3 && d.vel.y < -0.5 ? -d.vel.y * dt : 0);
            add(2, inp.mz > 0.3 && vf > 0.5 ? vf * dt : 0);
            add(3, inp.mz < -0.3 && vf < -0.5 ? -vf * dt : 0);
            add(4, inp.mx < -0.3 && vr < -0.5 ? -vr * dt : 0);
            add(5, inp.mx > 0.3 && vr > 0.5 ? vr * dt : 0);
          },
        },
        {
          title: "2/5 회전 연습", hint: "yaw", fail: "실패 조건 없음 — 좌우로 기체를 회전하면 성공",
          tasks: () => [task("기체 왼쪽 회전", 1), task("기체 오른쪽 회전", 1)],
          enter() {},
          update(dt, inp) { add(0, inp.yaw < -0.3 ? PHYS.yawRate * dt : 0); add(1, inp.yaw > 0.3 ? PHYS.yawRate * dt : 0); },
        },
        {
          title: "3/5 카메라 연습", hint: "cam", fail: "실패 조건 없음 — 카메라를 상하좌우로 움직이면 성공",
          tasks: () => [task("카메라 왼쪽", 0.4), task("카메라 오른쪽", 0.4), task("카메라 위", 0.4), task("카메라 아래", 0.4)],
          enter() {},
          update(dt, inp) { add(0, inp.camX < -0.3 ? dt : 0); add(1, inp.camX > 0.3 ? dt : 0); add(2, inp.camY > 0.3 ? dt : 0); add(3, inp.camY < -0.3 ? dt : 0); },
        },
        {
          title: "4/5 충돌 회피 연습", hint: "move", fail: "기둥·건물에 충돌하거나 60초가 지나면 이 단계를 다시 시작",
          tasks: () => [task("기둥을 피해 표시 지점까지 비행", 1)],
          enter() {
            g.resetDrone({ x: 0, y: 6, z: 92, yaw: 0 });
            g.world.addTemp(-9, 68, -3, 72, 0, 30); g.world.addTemp(3, 50, 9, 54, 0, 30); g.world.addTemp(-9, 32, -3, 36, 0, 30);
            g.world.addTemp(-2, 59, 2, 63, 0, 30); g.world.addTemp(-1, 41, 5, 45, 0, 30);
            g.markers.zone(AVOID_T, 0x3a86ff, "표시 지점", "goal");
            hitFlag = false;
          },
          update() { if (dist(d.pos, AVOID_T) <= AVOID_T.r) add(0, 1); },
          failed() { return hitFlag ? "충돌했습니다" : stepT > 60 ? "시간이 초과되었습니다" : null; },
          nav: () => ({ pos: AVOID_T, label: "표시 지점" }),
        },
        {
          title: "5/5 콘텐츠 목표 연습", hint: "move", fail: "90초가 지나면 이 단계를 다시 시작",
          tasks: () => [task("체크포인트(노란 고리) 통과", 1), task("지정 장소(파란 영역) 도착", 1)],
          enter() {
            g.resetDrone({ x: 0, y: 6, z: 60, yaw: 0 });
            const ring = g.markers.ring(GOAL_CP); g.markers.setRing(ring, "next");
            g.markers.zone(GOAL_T, 0x3a86ff, "지정 장소", "goal");
            cpDone = false; prev = copy(d.pos);
          },
          update() {
            if (!cpDone && crossed(prev, d.pos, GOAL_CP)) { cpDone = true; add(0, 1); }
            prev = copy(d.pos);
            if (dist(d.pos, GOAL_T) <= GOAL_T.r) { if (cpDone) add(1, 1); else g.notice("먼저 체크포인트를 통과하세요", "warn"); }
          },
          failed() { return stepT > 90 ? "시간이 초과되었습니다" : null; },
          nav: () => (cpDone ? { pos: GOAL_T, label: "지정 장소" } : { pos: GOAL_CP, label: "체크포인트" }),
        },
      ];
      const enter = (i) => {
        si = i; step = { ...steps[i], tasks: steps[i].tasks() };
        stepT = 0; doneT = -1;
        g.markers.clear(); g.world.removeTemp();
        step.enter();
      };
      enter(0);
      return {
        update(dt, inp) {
          stepT += dt;
          if (doneT >= 0) {
            doneT += dt;
            if (doneT > 0.9) { if (si + 1 < steps.length) enter(si + 1); else g.finish(true, "필수 조작을 모두 수행했습니다"); }
            return;
          }
          step.update(dt, inp);
          if (step.tasks.every((t) => t.done)) { doneT = 0; g.sfx.ok(); g.notice("성공! 다음 안내로 진행합니다", "ok"); return; }
          const why = step.failed && step.failed();
          if (why) { g.sfx.fail(); g.notice(`실패 — ${why}. 이 단계를 다시 시작합니다`, "bad", 2600); enter(si); }
        },
        onCollision() { hitFlag = true; },
        objective() {
          return { title: step.title, hint: g.hint(step.hint), fails: [step.fail], items: step.tasks.map((t) => ({ text: t.label, done: t.done })) };
        },
        nav() { return step.nav ? step.nav() : null; },
        score() { return 0; },
        dispose() { g.world.removeTemp(); },
      };
    },
  };
  // Top-down route points for the pre-flight briefing map.
  C.race.map = [C.race.start, ...RACE_CP, RACE_GOAL];
  C.arrive.map = [C.arrive.start, ARRIVE_T];
  C.follow.map = [C.follow.start, ...FOLLOW_PATH];
  C.deliver.map = [C.deliver.start, PICK, DROP];
  return C;
}
