// Flight model shared by every content: fixed-step, deterministic, same values everywhere.
import { BOUNDS, resolveSphere } from "./world.js";

export const PHYS = { maxSpeed: 38, accel: 21, vMax: 14, vAccel: 22, yawRate: 2.1, radius: 0.7, ground: 0.45, hardLanding: 7 };
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Drone {
  constructor() {
    this.pos = { x: 0, y: 2, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.flags = {};
    this.reset({ x: 0, y: 2, z: 0 }, 0);
  }

  reset(p, yaw) {
    this.pos.x = p.x; this.pos.y = p.y; this.pos.z = p.z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = yaw || 0;
    this.tiltF = 0; this.tiltR = 0;
    this.camYaw = 0; this.camPitch = -0.1;
    this.grounded = false; this.surfaceY = 0;
    this.contactT = new Map();
    this.start = { x: p.x, y: p.y, z: p.z };
    this.lastSafe = { x: p.x, y: p.y, z: p.z };
    this.safeTimer = 0;
    this.t = 0;
    this.flags = { boundary: false, noFly: false, recovered: false };
  }

  speed() { return Math.hypot(this.vel.x, this.vel.z); }

  /**
   * @param onCollision ({speed, box}) => slow factor (0..1) applied to the velocity after the bounce.
   */
  step(dt, inp, world, assist, onCollision) {
    const p = this.pos, v = this.vel, f = this.flags;
    this.t += dt;
    f.boundary = false; f.noFly = false; f.recovered = false;

    // Yaw stops the instant the stick is released; travel direction follows the nose gradually.
    const dy = -inp.yaw * PHYS.yawRate * dt;
    if (dy !== 0) {
      this.yaw += dy;
      const a = dy * 0.85, c = Math.cos(a), s = Math.sin(a), vx = v.x, vz = v.z;
      v.x = vx * c + vz * s; v.z = -vx * s + vz * c;
    }

    // Tilt drives horizontal acceleration. With assist the attitude levels itself quickly on release.
    let tx = inp.mx, tz = inp.mz;
    const m = Math.hypot(tx, tz);
    if (m > 1) { tx /= m; tz /= m; }
    const relax = assist ? 5 : 1.3;
    this.tiltR = approach(this.tiltR, tx, (tx !== 0 ? 5 : relax) * dt);
    this.tiltF = approach(this.tiltF, tz, (tz !== 0 ? 5 : relax) * dt);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    let vf = v.x * fx + v.z * fz, vr = v.x * rx + v.z * rz;
    vf += this.tiltF * PHYS.accel * dt;
    vr += this.tiltR * PHYS.accel * dt;
    const brake = (assist ? 15 : 5) * dt;
    if (tz === 0) vf = approach(vf, 0, brake);
    if (tx === 0) vr = approach(vr, 0, brake);
    if (this.grounded) { vf = approach(vf, 0, 25 * dt); vr = approach(vr, 0, 25 * dt); }
    const sp = Math.hypot(vf, vr);
    if (sp > PHYS.maxSpeed) { vf *= PHYS.maxSpeed / sp; vr *= PHYS.maxSpeed / sp; }
    v.x = fx * vf + rx * vr; v.z = fz * vf + rz * vr;

    if (inp.lift !== 0) v.y = clamp(v.y + inp.lift * PHYS.vAccel * dt, -PHYS.vMax, PHYS.vMax);
    else v.y = approach(v.y, 0, (assist ? 22 : 10) * dt);

    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;

    // Zone boundary: block only the outward component, so the drone can slide along the edge.
    const lo = BOUNDS.min + 1.5, hi = BOUNDS.max - 1.5;
    if (p.x < lo) { p.x = lo; if (v.x < 0) v.x = 0; f.boundary = true; }
    if (p.x > hi) { p.x = hi; if (v.x > 0) v.x = 0; f.boundary = true; }
    if (p.z < lo) { p.z = lo; if (v.z < 0) v.z = 0; f.boundary = true; }
    if (p.z > hi) { p.z = hi; if (v.z > 0) v.z = 0; f.boundary = true; }
    if (p.y > BOUNDS.top) { p.y = BOUNDS.top; if (v.y > 0) v.y = 0; f.boundary = true; }

    // Restricted areas inside the zone: entry is blocked at the edge.
    const r = PHYS.radius;
    for (const z of world.noFly) {
      if (p.x > z.min[0] - r && p.x < z.max[0] + r && p.z > z.min[2] - r && p.z < z.max[2] + r) {
        const d = [p.x - (z.min[0] - r), z.max[0] + r - p.x, p.z - (z.min[2] - r), z.max[2] + r - p.z];
        let k = 0;
        for (let i = 1; i < 4; i++) if (d[i] < d[k]) k = i;
        if (k === 0) { p.x = z.min[0] - r; if (v.x > 0) v.x = 0; }
        else if (k === 1) { p.x = z.max[0] + r; if (v.x < 0) v.x = 0; }
        else if (k === 2) { p.z = z.min[2] - r; if (v.z > 0) v.z = 0; }
        else { p.z = z.max[2] + r; if (v.z < 0) v.z = 0; }
        f.noFly = true;
      }
    }

    const hit = (key, speed, box) => {
      const last = this.contactT.get(key);
      const fresh = last === undefined || this.t - last > 0.4;
      this.contactT.set(key, this.t);
      return fresh ? onCollision({ speed, box }) : null;
    };

    // Ground.
    this.grounded = false;
    if (p.y <= PHYS.ground) {
      p.y = PHYS.ground;
      if (v.y < -PHYS.hardLanding) {
        const slow = hit("ground", -v.y, null);
        v.y = -v.y * 0.25;
        if (slow !== null) { v.x *= slow; v.z *= slow; }
      } else {
        if (v.y < 0) v.y = 0;
        this.grounded = true; this.surfaceY = 0;
      }
    }

    // Buildings and obstacles.
    let contacts = resolveSphere(p, r, world.colliders);
    for (const c of contacts) {
      const vn = v.x * c.nx + v.y * c.ny + v.z * c.nz;
      if (c.ny > 0.7 && vn > -PHYS.hardLanding) {
        // Gentle touch-down on a roof: a landing, not a collision.
        if (vn < 0) { v.x -= c.nx * vn; v.y -= c.ny * vn; v.z -= c.nz * vn; }
        this.grounded = true; this.surfaceY = c.box.max[1];
      } else if (vn < 0) {
        const speed = Math.hypot(v.x, v.y, v.z);
        const slow = hit(c.box.id, speed, c.box);
        if (slow !== null) {
          // Bounce off the surface, then lose speed according to the content's table.
          const k = 1.35 * vn;
          v.x = (v.x - k * c.nx) * slow; v.y = (v.y - k * c.ny) * slow; v.z = (v.z - k * c.nz) * slow;
        } else {
          v.x -= c.nx * vn; v.y -= c.ny * vn; v.z -= c.nz * vn;
        }
      } else {
        this.contactT.set(c.box.id, this.t);
      }
    }
    // Resting on a roof without pressing into it is still a landing.
    if (!this.grounded && Math.abs(v.y) < 0.05) {
      for (const b of world.colliders) {
        if (p.x >= b.min[0] && p.x <= b.max[0] && p.z >= b.min[2] && p.z <= b.max[2] && Math.abs(p.y - r - b.max[1]) < 0.06) {
          this.grounded = true; this.surfaceY = b.max[1]; break;
        }
      }
    }
    // Wedged between obstacles: try again, then fall back to the last safe position.
    if (contacts.length > 1) {
      for (let i = 0; i < 3 && contacts.length; i++) contacts = resolveSphere(p, r, world.colliders);
      if (contacts.length) this.recover();
    }

    const bad = !Number.isFinite(p.x + p.y + p.z) || p.x < BOUNDS.min - 3 || p.x > BOUNDS.max + 3 || p.z < BOUNDS.min - 3 || p.z > BOUNDS.max + 3 || p.y < -3;
    if (bad) this.recover();
    else if (!contacts.length && !f.boundary && !f.noFly) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.2) { this.safeTimer = 0; this.lastSafe.x = p.x; this.lastSafe.y = p.y; this.lastSafe.z = p.z; }
    }

    this.camYaw = clamp(this.camYaw - inp.camX * 1.7 * dt, -2.8, 2.8);
    this.camPitch = clamp(this.camPitch + inp.camY * 1.2 * dt, -1.0, 0.8);
    if (inp.camReset) { this.camYaw = 0; this.camPitch = -0.1; }
  }

  /** Return to the last confirmed in-zone position (or the content's start) with zero speed. */
  recover() {
    const s = this.lastSafe || this.start;
    this.pos.x = s.x; this.pos.y = s.y; this.pos.z = s.z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.tiltF = this.tiltR = 0;
    this.flags.recovered = true;
  }
}
