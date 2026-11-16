// Game modes (race / delivery / combat / scouting), each with its own missions and three difficulties.
import { PADS, rayBoxes } from "./world.js";
import { PHYS } from "./drone.js";

export const DIFFS = [["easy", "쉬움"], ["normal", "보통"], ["hard", "어려움"]];
export const DIFF_LABEL = { easy: "쉬움", normal: "보통", hard: "어려움" };
export const MODES = [
  { id: "race", label: "레이스", desc: "체크포인트를 순서대로 통과해 완주 시간을 겨룹니다.", missions: ["race1", "race2", "race3"] },
  { id: "deliver", label: "짐 나르기", desc: "물품을 수령해 목적지 패드에 착륙해 전달합니다.", missions: ["deliver1", "deliver2", "deliver3"] },
  { id: "combat", label: "전투", desc: "허구의 교란 드론을 펄스 교란기로 무력화합니다.", missions: ["combat1", "combat2", "combat3"] },
  { id: "scout", label: "탐색 비행", desc: "지정 장소 도착과 유도 드론 추적으로 비행 감각을 다집니다.", missions: ["arrive1", "arrive2", "follow1"] },
];
export const ALL = MODES.flatMap((m) => m.missions);

const TIME_K = { easy: 1.4, normal: 1, hard: 0.72 };
const SCORE_K = { easy: 0.8, normal: 1, hard: 1.3 };

// Collision tables: impact-speed bands decide the slow-down and the damage; repeated collisions hit harder.
// Damage never changes flight performance — it only fails the attempt.
const TABLE_STD = { bands: [{ max: 10, slow: 0.75, dmg: 6 }, { max: 24, slow: 0.5, dmg: 16 }, { max: 1e9, slow: 0.3, dmg: 30 }], repeatAfter: 3, repeatMult: 1.5 };
const TABLE_SOFT = { bands: [{ max: 10, slow: 0.8, dmg: 0 }, { max: 24, slow: 0.6, dmg: 0 }, { max: 1e9, slow: 0.4, dmg: 0 }], repeatAfter: 99, repeatMult: 1 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copy = (p) => ({ x: p.x, y: p.y, z: p.z });
const N = { nx: 0, nz: -1 }, S = { nx: 0, nz: 1 }, E = { nx: 1, nz: 0 }, W = { nx: -1, nz: 0 };
const cp = (x, y, z, dir, r = 7) => ({ x, y, z, r, ...dir });

/** Did the segment p0→p1 cross the checkpoint's gate plane inside its ring? */
function crossed(p0, p1, c) {
  const s0 = (p0.x - c.x) * c.nx + (p0.z - c.z) * c.nz;
  const s1 = (p1.x - c.x) * c.nx + (p1.z - c.z) * c.nz;
  if (s0 === s1 || (s0 > 0) === (s1 > 0)) return false;
  const t = s0 / (s0 - s1);
  const x = p0.x + (p1.x - p0.x) * t, y = p0.y + (p1.y - p0.y) * t, z = p0.z + (p1.z - p0.z) * t;
  return Math.hypot(x - c.x, y - c.y, z - c.z) <= c.r;
}

// ------------------------------------------------------------------------------------- race
function makeRace(o) {
  const limit = (d) => Math.round(o.base * TIME_K[d]);
  return {
    id: o.id, mode: "race", type: "race", typeLabel: "레이스", title: o.title, summary: o.summary,
    goal: "출발 지점(초록 원)에서 체크포인트를 순서대로 통과한 뒤 도착 지점(파란 깃발)에 도달",
    info: (d) => [
      `체크포인트 ${o.cps.length}개 · ${o.note}`,
      `난이도 ${DIFF_LABEL[d]}: 고리 크기 ${d === "easy" ? "+2m (넉넉함)" : d === "hard" ? "−1m (좁음)" : "기본"} · 충돌 손상 ${d === "easy" ? "×0.7" : d === "hard" ? "×1.4" : "×1"}`,
      "시간 측정은 출발 조작(Enter / 공격 키 / 게임패드 A) 후 시작",
      `점수 = (완주 300 + 남은 시간 비율 × 700 + 통과 체크포인트 × 50 − 충돌 × 60) × ${SCORE_K[d]}`,
    ],
    fails: (d) => [`제한 시간 ${limit(d)}초 초과`, "체크포인트를 놓친 채 도착 지점 도달", "충돌 손상 100% 누적"],
    limit, start: o.start, manualStart: true, failOnDamage: true, table: TABLE_STD, map: [o.start, ...o.cps, o.goal],
    create(g) {
      const d = g.diff;
      const cps = o.cps.map((c) => ({ ...c, r: c.r < 5 ? c.r : c.r + (d === "easy" ? 2 : d === "hard" ? -1 : 0) }));
      const rings = cps.map((c) => g.markers.ring(c));
      let next = 0, prev = copy(g.drone.pos);
      const refresh = () => rings.forEach((m, i) => g.markers.setRing(m, i < next ? "passed" : i === next ? "next" : "future"));
      g.markers.startCircle(o.start);
      g.markers.goal(o.goal);
      refresh();
      return {
        update() {
          const p = g.drone.pos;
          for (let i = 0; i < cps.length; i++) {
            if (i < next || !crossed(prev, p, cps[i])) continue;
            if (i === next) { next++; refresh(); g.sfx.cp(); g.notice(`체크포인트 ${next}/${cps.length} 통과`, "ok"); }
            else g.notice("순서가 맞지 않아 통과가 인정되지 않습니다", "warn");
          }
          prev = copy(p);
          if (dist(p, o.goal) <= o.goal.r) {
            if (next >= cps.length) g.finish(true, "모든 체크포인트를 통과하고 도착했습니다");
            else g.finish(false, "체크포인트를 놓친 채 도착 지점에 도달했습니다");
          }
        },
        objective() { return { items: [{ text: `체크포인트 ${next}/${cps.length}`, done: next >= cps.length }, { text: "도착 지점(파란 깃발) 도달", done: false }] }; },
        nav() { return next < cps.length ? { pos: cps[next], label: `체크포인트 ${next + 1}` } : { pos: o.goal, label: "도착" }; },
        score(res) {
          const frac = res.success ? Math.max(0, 1 - res.timeMs / 1000 / limit(d)) : 0;
          return Math.max(0, Math.round(((res.success ? 300 + 700 * frac : 0) + next * 50 - res.collisions * 60) * SCORE_K[d]));
        },
      };
    },
  };
}

// ------------------------------------------------------------------------------------- delivery
function makeDeliver(o) {
  const limit = (d) => Math.round(o.base * TIME_K[d]);
  const MAX_HITS = { easy: 4, normal: 3, hard: 1 };
  return {
    id: o.id, mode: "deliver", type: "mission", typeLabel: "짐 나르기", title: o.title, summary: o.summary,
    goal: o.legs.map((l, i) => `${o.legs.length > 1 ? `${i + 1}차: ` : ""}${l.pickName}에 착륙해 물품 수령 → ${l.dropName}에 착륙해 정지`).join(" / "),
    info: (d) => [
      "패드에 착륙하면 물품을 자동 수령 — 하강 속도 7 m/s 이상으로 닿으면 충돌로 처리",
      "목적지 패드에 접지 후 정지하면 전달 완료",
      `난이도 ${DIFF_LABEL[d]}: 운송 중 허용 충돌 ${MAX_HITS[d]}회`,
      `점수 = (1000 − 경과 초 × 4 − 충돌 × 80) × ${SCORE_K[d]}`,
    ],
    fails: (d) => [`제한 시간 ${limit(d)}초 초과`, `운송 중 충돌 ${MAX_HITS[d]}회 초과`, "충돌 손상 100% 누적", "완료와 실패 조건이 동시에 충족되면 실패"],
    limit, start: o.start, failOnDamage: true, table: TABLE_STD, map: [o.start, ...o.legs.flatMap((l) => [l.pick, l.drop])],
    create(g) {
      const T = g.THREE, d = g.diff, maxHits = MAX_HITS[d];
      let leg = 0, carrying = false, hold = 0, cargoHits = 0;
      const parcel = new T.Mesh(new T.BoxGeometry(0.9, 0.7, 0.9), new T.MeshLambertMaterial({ color: 0xc98b4a }));
      parcel.visible = false;
      g.dyn.add(parcel);
      const mark = () => {
        g.markers.clear();
        if (leg >= o.legs.length) return;
        const L = o.legs[leg];
        if (carrying) g.markers.zone({ ...L.drop, r: 6.5 }, 0x3a86ff, "목적지", "goal");
        else g.markers.zone({ ...L.pick, r: 6.5 }, 0xffd23f, "물품 수령", "zone");
      };
      const landedOn = (pad) => {
        const dr = g.drone;
        return dr.grounded && hdist(dr.pos, pad) <= 6.5 && Math.abs(dr.pos.y - (pad.y + PHYS.ground)) < 1.4 && Math.hypot(dr.vel.x, dr.vel.y, dr.vel.z) < 0.8;
      };
      mark();
      return {
        update(dt) {
          const L = o.legs[leg];
          hold = landedOn(carrying ? L.drop : L.pick) ? hold + dt : 0;
          if (hold > 0.4) {
            hold = 0;
            if (!carrying) {
              carrying = true; parcel.visible = true; g.sfx.cp();
              g.notice(`물품 수령 완료 — ${L.dropName}(으)로 운송하세요`, "ok");
            } else {
              carrying = false; parcel.visible = false; leg++;
              if (leg >= o.legs.length) return g.finish(true, "모든 물품을 목적지에 전달했습니다");
              g.sfx.ok(); g.notice(`배송 ${leg}/${o.legs.length} 완료 — 다음 물품을 수령하세요`, "ok");
            }
            mark();
          }
          parcel.position.set(g.drone.pos.x, g.drone.pos.y - 0.25, g.drone.pos.z);
        },
        onCollision() {
          if (!carrying) return;
          cargoHits++;
          if (cargoHits > maxHits) g.finish(false, `운송 중 충돌 횟수가 한도(${maxHits}회)를 초과했습니다`);
          else g.notice(`운송 중 충돌 ${cargoHits}/${maxHits}`, "warn");
        },
        objective() {
          const items = o.legs.map((l, i) => ({ text: `${l.pickName} → ${l.dropName}`, done: i < leg }));
          items.push({ text: carrying ? "물품 운송 중 — 목적지 패드에 착륙해 정지" : "수령 패드에 착륙해 물품 수령", done: false });
          items.push({ text: `운송 중 충돌 ${cargoHits}/${maxHits}`, done: false });
          return { items };
        },
        nav() {
          const L = o.legs[Math.min(leg, o.legs.length - 1)];
          return carrying ? { pos: L.drop, label: "목적지" } : { pos: L.pick, label: "물품 수령" };
        },
        score(res) { return res.success ? Math.max(100, Math.round((1000 - res.timeMs / 1000 * 4 - res.collisions * 80) * SCORE_K[d])) : 0; },
      };
    },
  };
}

// ------------------------------------------------------------------------------------- combat
const SHOT_SPEED = 60;
function makeCombat(o) {
  const DMG_K = { easy: 0.7, normal: 1, hard: 1.4 }, RATE_K = { easy: 1.3, normal: 1, hard: 0.75 }, KITS = { easy: 4, normal: 4, hard: 2 };
  const scouts = o.enemies.filter((e) => e[0] === "scout").length, heavies = o.enemies.length - scouts;
  return {
    id: o.id, mode: "combat", type: "combat", typeLabel: "전투", title: o.title, summary: o.summary,
    goal: `강변 전투 구역의 지정된 적 드론 ${o.enemies.length}기를 모두 무력화하면 승리`,
    info: (d) => [
      `적: 정찰형 교란 드론 ${scouts}기(공격 피해 ${Math.round(8 * DMG_K[d])})${heavies ? ` · 중장형 교란 드론 ${heavies}기(공격 피해 ${Math.round(15 * DMG_K[d])})` : ""} — 각 체력 100`,
      `난이도 ${DIFF_LABEL[d]}: 적 공격 간격 ×${RATE_K[d]} · 수리 키트 ${KITS[d]}개`,
      "전투 구역: 한강을 본뜬 강변과 두 교량 주변 — 적은 약 110m 안으로 접근하면 교전을 시작",
      "펄스 교란기(공격): 화면 중앙을 적에게 맞추고 발사 — 피해 25, 재충전 2초",
      "방어막(방어): 2초 동안 모든 방향의 피해 차단, 재사용 대기 6초",
      "수리 키트(초록 십자): 닿으면 획득(최대 3개 보유) — 체력이 줄어 있으면 자동 사용해 25 회복",
      "모든 장비와 규칙은 허구이며 실제 무기·전술과 무관합니다",
    ],
    fails: () => ["플레이어 체력 100 소진 (그 외 패배 조건 없음)"],
    limit: () => 0, start: { x: 0, y: 2, z: 90, yaw: Math.PI }, failOnDamage: false, table: TABLE_SOFT, combat: true,
    create(g) {
      const T = g.THREE, d = g.diff;
      const enemies = [], shots = [], kits = [];
      let hp = 100, cd = 0, shieldT = 0, shieldCd = 0, kills = 0, beamT = 0, held = 0;
      o.enemies.forEach(([type, name, x, y, z], phase) => {
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
        enemies.push({ type, name, hp: 100, alive: true, pos: { x, y, z }, home: { x, y, z }, mesh: grp, lock, fire: 3 + phase, dmg: Math.round((big ? 15 : 8) * DMG_K[d]), interval: (big ? 6 : 4.2) * RATE_K[d], speed: big ? 9 : 14, ang: phase * 2.1, vy: 0, alert: 0 });
      });
      for (const [x, y, z] of [[-120, 6, 113], [120, 6, 113], [-30, 12, 150], [30, 12, 150]].slice(0, KITS[d])) {
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
          if (t <= 0 || t > 150) continue;
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
            if (dP < 110) e.alert = 6; else e.alert = Math.max(0, e.alert - dt);
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
              if (e.alert > 0 && dP < 115 && rayBoxes(e.pos, dir, dP, g.world.colliders) >= dP) {
                const m = new T.Mesh(shotGeo, shotMat);
                m.position.set(e.pos.x, e.pos.y, e.pos.z);
                g.dyn.add(m);
                shots.push({ pos: copy(e.pos), dir, life: 3.5, dmg: e.dmg, mesh: m });
                e.fire = e.interval;
                g.hud.warn(g.bearing(e.pos), `${e.type === "heavy" ? "중장형" : "정찰형"} 공격!`);
                g.sfx.warn();
              } else e.fire = 0.5;
            }
          }

          for (let i = shots.length - 1; i >= 0; i--) {
            const s = shots[i];
            const stepLen = SHOT_SPEED * dt;
            const blocked = rayBoxes(s.pos, s.dir, stepLen, g.world.colliders) < stepLen;
            s.pos.x += s.dir.x * stepLen; s.pos.y += s.dir.y * stepLen; s.pos.z += s.dir.z * stepLen; s.life -= dt;
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
                if (hp <= 0) g.finish(false, "체력이 모두 소진되었습니다");
              }
            }
            if (gone) { g.dyn.remove(s.mesh); shots.splice(i, 1); }
          }
          if (g.session.ended) return;

          for (const k of kits) {
            if (k.taken) continue;
            k.mesh.rotation.y += dt * 2;
            if (dist(k.pos, P) < 3.6) {
              if (held < 3) { k.taken = true; k.mesh.visible = false; held++; g.sfx.cp(); g.notice(`수리 키트 획득 (보유 ${held}/3)`, "ok"); }
              else if (!k.fullNote) { k.fullNote = true; g.notice("수리 키트는 최대 3개까지 보유할 수 있습니다", "warn"); }
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
          for (const e of enemies) if (e.alive) { const dd = dist(e.pos, g.drone.pos); if (dd < bd) { bd = dd; best = e; } }
          return best ? { pos: best.pos, label: "적 드론" } : null;
        },
        score(res) { return Math.max(0, Math.round((kills * 300 + hp * 3 + (res.success ? Math.max(0, 400 - res.timeMs / 1000 * 2) : 0)) * SCORE_K[d])); },
      };
    },
  };
}

// ------------------------------------------------------------------------------------- scouting
function makeArrive(o) {
  const limit = (d) => Math.round(o.base * TIME_K[d]);
  return {
    id: o.id, mode: "scout", type: "mission", typeLabel: "탐색 비행", title: o.title, summary: o.summary, goal: o.goal,
    info: (d) => [`목표 영역 반경 ${o.target.r}m — 진입하면 도착 인정`, "화면의 방향 표시와 거리를 따라 비행", `점수 = (1000 − 경과 초 × 12 − 충돌 × 40) × ${SCORE_K[d]}`],
    fails: (d) => [`제한 시간 ${limit(d)}초 초과`, "충돌 손상 100% 누적"],
    limit, start: o.start, failOnDamage: true, table: TABLE_STD, map: [o.start, o.target],
    create(g) {
      const d = g.diff;
      g.markers.startCircle(o.start);
      g.markers.zone(o.target, 0x3a86ff, "지정 장소", "goal");
      return {
        update() { if (dist(g.drone.pos, o.target) <= o.target.r) g.finish(true, "지정 장소에 도착했습니다"); },
        objective() { return { items: [{ text: `지정 장소까지 ${Math.round(dist(g.drone.pos, o.target))}m`, done: false }] }; },
        nav() { return { pos: o.target, label: "지정 장소" }; },
        score(res) { return res.success ? Math.max(100, Math.round((1000 - res.timeMs / 1000 * 12 - res.collisions * 40) * SCORE_K[d])) : 0; },
      };
    },
  };
}

const FOLLOW_PATH = [
  { x: 0, y: 12, z: 62 }, { x: 0, y: 14, z: -20 }, { x: -80, y: 16, z: -20 }, { x: -80, y: 20, z: -80 },
  { x: -140, y: 18, z: -80 }, { x: -140, y: 12, z: 40 }, { x: -140, y: 10, z: 90 },
];
const FOLLOW = { easy: { speed: 13, range: 60, grace: 8 }, normal: { speed: 18, range: 50, grace: 6 }, hard: { speed: 24, range: 40, grace: 4 } };
const follow1 = {
  id: "follow1", mode: "scout", type: "mission", typeLabel: "탐색 비행", title: "유도 드론 추적",
  summary: "도심을 가로지르는 유도 드론을 놓치지 않고 최종 지점까지 따라갑니다.",
  goal: "노란 유도 드론을 허용 거리 안으로 유지하며 최종 지점까지 추적",
  info: (d) => [`추적 목표: 허구의 배송 유도 드론 (경로 약 450m, 속도 ${FOLLOW[d].speed} m/s)`, `${FOLLOW[d].range}m 넘게 멀어지면 놓친 상태 — ${FOLLOW[d].grace}초 안에 다시 접근`, `점수 = (1000 − 놓친 시간 × 30 − 충돌 × 40) × ${SCORE_K[d]}`],
  fails: (d) => [`놓친 상태가 ${FOLLOW[d].grace}초 지속`, "제한 시간 100초 초과", "유도 드론이 최종 지점에 도달할 때 놓친 상태", "충돌 손상 100% 누적"],
  limit: () => 100, start: { x: 0, y: 2, z: 90, yaw: 0 }, failOnDamage: true, table: TABLE_STD, map: [{ x: 0, y: 2, z: 90 }, ...FOLLOW_PATH],
  create(g) {
    const T = g.THREE, d = g.diff, F = FOLLOW[d];
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
          const dd = dist(tp, n);
          const stepLen = (dd < 14 ? F.speed * 0.6 : F.speed) * dt;
          if (dd <= stepLen) { tp.x = n.x; tp.y = n.y; tp.z = n.z; seg++; }
          else { tp.x += (n.x - tp.x) / dd * stepLen; tp.y += (n.y - tp.y) / dd * stepLen; tp.z += (n.z - tp.z) / dd * stepLen; }
        }
        mesh.position.set(tp.x, tp.y, tp.z); mesh.rotation.y += dt * 2;
        const nowLost = started && dist(p, tp) > F.range;
        if (nowLost && !lost) g.notice(`목표를 놓쳤습니다 — ${F.grace}초 안에 다시 접근하세요`, "warn");
        if (!nowLost && lost) g.notice("목표를 다시 포착했습니다", "ok");
        lost = nowLost;
        if (lost) { lostT += dt; lostTotal += dt; } else lostT = 0;
        g.hud.center(lost ? `목표 놓침 — 실패까지 ${Math.max(0, F.grace - lostT).toFixed(1)}초` : "");
        if (lost && lostT > F.grace) return g.finish(false, `추적 목표를 놓친 상태가 ${F.grace}초 동안 지속되었습니다`);
        if (seg >= FOLLOW_PATH.length - 1) {
          if (lost) g.finish(false, "유도 드론이 최종 지점에 도달할 때 목표를 놓친 상태였습니다");
          else g.finish(true, "유도 드론을 최종 지점까지 따라갔습니다");
        }
      },
      objective() {
        return { items: [
          { text: `유도 드론과의 거리 ${Math.round(dist(g.drone.pos, tp))}m (허용 ${F.range}m)`, done: false },
          { text: `경로 진행 ${seg}/${FOLLOW_PATH.length - 1}`, done: false },
        ] };
      },
      nav() { return { pos: tp, label: "유도 드론" }; },
      score(res) { return res.success ? Math.max(100, Math.round((1000 - lostTotal * 30 - res.collisions * 40) * SCORE_K[d])) : 0; },
    };
  },
};

// ------------------------------------------------------------------------------------- tutorial
const tutorial = {
  id: "tutorial", type: "tutorial", typeLabel: "튜토리얼", title: "조작 튜토리얼",
  summary: "이동 → 회전 → 카메라 → 충돌 회피 → 콘텐츠 목표 순으로 조작을 익힙니다.",
  limit: () => 0, start: { x: 0, y: 2, z: 95, yaw: 0 }, failOnDamage: false, table: TABLE_SOFT,
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
      objective() { return { title: step.title, hint: g.hint(step.hint), fails: [step.fail], items: step.tasks.map((t) => ({ text: t.label, done: t.done })) }; },
      nav() { return step.nav ? step.nav() : null; },
      score() { return 0; },
      dispose() { g.world.removeTemp(); },
    };
  },
};

export function makeContents() {
  const C = { tutorial, follow1 };
  const add = (def) => { C[def.id] = def; };
  const A = PADS.towerA, B = PADS.towerB, PK = PADS.park, PZ = PADS.plaza;

  add(makeRace({
    id: "race1", title: "대로 스프린트", summary: "중앙 대로를 따라 북쪽 고궁 마당까지 직선으로 질주하는 입문 코스.", note: "직선 위주 · 마지막에 고궁 정문 위를 넘어 마당에 도착", base: 45,
    start: { x: 0, y: 2, z: 95, yaw: 0 },
    cps: [cp(0, 14, 60, N, 8), cp(0, 20, 10, N, 8), cp(0, 26, -40, N, 8), cp(0, 22, -90, N, 8), cp(0, 20, -135, N, 8)],
    goal: { x: 0, y: 14, z: -166, r: 9 },
  }));
  add(makeRace({
    id: "race2", title: "도심 순환", summary: "도심 블록을 한 바퀴 돌고 두 교량 아래를 통과해 광장으로 돌아오는 코스.", note: "교량 아래 구간 2곳 · 공중 연결로 아래 통과", base: 130,
    start: { x: 0, y: 2, z: 90, yaw: 0 },
    cps: [cp(0, 15, 40, N, 8), cp(0, 22, -40, N, 8), cp(40, 26, -80, E), cp(110, 24, -80, E), cp(140, 22, -40, S), cp(140, 14, 40, S), cp(140, 8, 112, S),
      cp(80, 4.8, 145, W, 4.2), cp(0, 7, 145, W), cp(-80, 4.8, 145, W, 4.2), cp(-80, 18, 70, N)],
    goal: { x: -44, y: 5, z: 10, r: 9 },
  }));
  add(makeRace({
    id: "race3", title: "교량 슬라럼", summary: "강 위를 낮게 날며 두 교량 아래를 지나 동쪽 도로로 급상승하는 상급 코스.", note: "저고도 교량 통과 2곳 · 급선회와 고도 변화가 큼", base: 110,
    start: { x: -170, y: 3, z: 145, yaw: -Math.PI / 2 },
    cps: [cp(-80, 4.8, 145, E, 4.2), cp(0, 7, 145, E), cp(80, 4.8, 145, E, 4.2), cp(140, 12, 100, N), cp(140, 14, 20, N), cp(140, 20, -40, N), cp(110, 24, -80, W), cp(40, 26, -80, W)],
    goal: { x: 0, y: 12, z: -45, r: 9 },
  }));

  add(makeDeliver({
    id: "deliver1", title: "공원에서 옥상으로", summary: "강변 공원에서 물품을 수령해 서쪽 빌딩 옥상에 전달합니다.", base: 80,
    start: { x: -44, y: 2, z: 10, yaw: Math.PI },
    legs: [{ pick: PK, drop: B, pickName: "강변 공원 패드", dropName: "서쪽 빌딩 옥상(38m)" }],
  }));
  add(makeDeliver({
    id: "deliver2", title: "옥상 간 운송", summary: "동쪽 고층 빌딩 옥상에서 수령해 도심을 가로질러 서쪽 옥상으로 옮깁니다.", base: 80,
    start: { x: 0, y: 2, z: 90, yaw: -Math.PI / 2 },
    legs: [{ pick: A, drop: B, pickName: "동쪽 고층 빌딩 옥상(64m)", dropName: "서쪽 빌딩 옥상(38m)" }],
  }));
  add(makeDeliver({
    id: "deliver3", title: "연속 배송", summary: "물품 두 개를 연달아 배송합니다. 공원→서쪽 옥상, 이어서 동쪽 옥상→광장.", base: 150,
    start: { x: 0, y: 2, z: 90, yaw: Math.PI },
    legs: [{ pick: PK, drop: B, pickName: "강변 공원 패드", dropName: "서쪽 빌딩 옥상(38m)" }, { pick: A, drop: PZ, pickName: "동쪽 고층 빌딩 옥상(64m)", dropName: "광장 패드" }],
  }));

  add(makeCombat({
    id: "combat1", title: "정찰 드론 요격", summary: "정찰형 교란 드론 2기를 무력화하는 입문 전투.",
    enemies: [["scout", "정찰형 교란 드론 A", -115, 22, 142], ["scout", "정찰형 교란 드론 B", 115, 26, 150]],
  }));
  add(makeCombat({
    id: "combat2", title: "강변 교란 편대", summary: "정찰형 2기와 중장형 1기로 이뤄진 편대를 무력화합니다.",
    enemies: [["scout", "정찰형 교란 드론 A", -115, 22, 142], ["scout", "정찰형 교란 드론 B", 115, 26, 150], ["heavy", "중장형 교란 드론", 0, 34, 178]],
  }));
  add(makeCombat({
    id: "combat3", title: "중장 편대 격파", summary: "중장형 2기와 정찰형 2기 — 방어막과 수리 키트 운용이 중요한 상급 전투.",
    enemies: [["scout", "정찰형 교란 드론 A", -130, 22, 140], ["scout", "정찰형 교란 드론 B", 130, 26, 150], ["heavy", "중장형 교란 드론 A", -45, 34, 178], ["heavy", "중장형 교란 드론 B", 45, 36, 178]],
  }));

  add(makeArrive({
    id: "arrive1", title: "옥상 헬리패드 도착", summary: "제한 시간 안에 동쪽 고층 빌딩 옥상의 지정 장소에 도착합니다.", base: 30,
    goal: "동쪽 고층 빌딩(64m) 옥상 헬리패드의 목표 영역에 진입",
    start: { x: -44, y: 2, z: 10, yaw: -Math.PI / 2 }, target: { x: A.x, y: A.y + 2.5, z: A.z, r: 9 },
  }));
  add(makeArrive({
    id: "arrive2", title: "전망 타워 정상", summary: "구역 북동쪽 끝 전망 타워 꼭대기(104m)까지 올라갑니다.", base: 40,
    goal: "북동쪽 전망 타워 정상의 목표 영역에 진입 — 도심 전체를 대각선으로 가로지르는 장거리 비행",
    start: { x: -140, y: 2, z: 100, yaw: -Math.PI / 4 }, target: { x: 173, y: 108, z: -174, r: 9 },
  }));
  return C;
}
