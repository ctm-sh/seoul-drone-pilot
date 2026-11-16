// The fixed downtown flight zone: a small, Seoul-inspired district (not a replica of real places).
export const BOUNDS = { min: -200, max: 200, top: 128 };
export const PADS = {
  towerA: { x: 110, y: 64, z: 70 },
  towerB: { x: -110, y: 38, z: -50 },
  park: { x: 40, y: 0, z: 113 },
  plaza: { x: -44, y: 0, z: 10 },
};
const XR = [[-200, -147], [-133, -87], [-73, -15], [15, 73], [87, 133], [147, 200]];
const ZR = [[-200, -147], [-133, -87], [-73, -27], [-13, 33], [47, 93]];

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Push a sphere out of every box it penetrates. Mutates p; returns the contacts. */
export function resolveSphere(p, r, boxes) {
  const out = [];
  for (const b of boxes) {
    const mn = b.min, mx = b.max;
    if (p.x < mn[0] - r || p.x > mx[0] + r || p.y < mn[1] - r || p.y > mx[1] + r || p.z < mn[2] - r || p.z > mx[2] + r) continue;
    const cx = clamp(p.x, mn[0], mx[0]), cy = clamp(p.y, mn[1], mx[1]), cz = clamp(p.z, mn[2], mx[2]);
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) continue;
    let nx = 0, ny = 0, nz = 0, depth;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      nx = dx / d; ny = dy / d; nz = dz / d; depth = r - d;
    } else {
      // Centre is inside the box: leave through the nearest face.
      const pen = [p.x - mn[0], mx[0] - p.x, p.y - mn[1], mx[1] - p.y, p.z - mn[2], mx[2] - p.z];
      let k = 0;
      for (let i = 1; i < 6; i++) if (pen[i] < pen[k]) k = i;
      if (k === 0) nx = -1; else if (k === 1) nx = 1; else if (k === 2) ny = -1; else if (k === 3) ny = 1; else if (k === 4) nz = -1; else nz = 1;
      depth = pen[k] + r;
    }
    p.x += nx * depth; p.y += ny * depth; p.z += nz * depth;
    out.push({ box: b, nx, ny, nz, depth });
  }
  return out;
}

/** Nearest hit distance of a ray against the boxes (Infinity if none within maxT). Boxes containing the origin are ignored. */
export function rayBoxes(o, d, maxT, boxes) {
  let best = Infinity;
  const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
  for (const b of boxes) {
    let t0 = 0, t1 = maxT, inside = true, miss = false;
    for (let a = 0; a < 3; a++) {
      if (O[a] < b.min[a] || O[a] > b.max[a]) inside = false;
      if (Math.abs(D[a]) < 1e-9) {
        if (O[a] < b.min[a] || O[a] > b.max[a]) { miss = true; break; }
      } else {
        let ta = (b.min[a] - O[a]) / D[a], tb = (b.max[a] - O[a]) / D[a];
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { miss = true; break; }
      }
    }
    if (miss || inside) continue;
    if (t0 < best) best = t0;
  }
  return best;
}

function iconSprite(THREE, kind, text, color, through, scale = 5) {
  const c = document.createElement("canvas");
  c.width = 384; c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(10,14,24,0.82)";
  x.beginPath(); x.roundRect(4, 14, 376, 100, 50); x.fill();
  x.lineWidth = 6; x.strokeStyle = color; x.stroke();
  x.fillStyle = color; x.strokeStyle = color; x.lineWidth = 9; x.lineJoin = "round";
  const cx = 64, cy = 64;
  if (kind === "start") { x.beginPath(); x.arc(cx, cy, 26, 0, 7); x.fill(); }
  else if (kind === "goal") { x.fillRect(cx - 22, cy - 30, 7, 62); x.beginPath(); x.moveTo(cx - 15, cy - 30); x.lineTo(cx + 28, cy - 16); x.lineTo(cx - 15, cy - 2); x.fill(); }
  else if (kind === "hazard") { x.beginPath(); x.moveTo(cx, cy - 30); x.lineTo(cx + 32, cy + 26); x.lineTo(cx - 32, cy + 26); x.closePath(); x.fill(); x.fillStyle = "#1a1206"; x.fillRect(cx - 4, cy - 10, 8, 20); x.fillRect(cx - 4, cy + 14, 8, 7); }
  else if (kind === "nofly") { x.beginPath(); x.arc(cx, cy, 26, 0, 7); x.stroke(); x.beginPath(); x.moveTo(cx - 18, cy - 18); x.lineTo(cx + 18, cy + 18); x.stroke(); }
  else if (kind === "ring") { x.beginPath(); x.arc(cx, cy, 24, 0, 7); x.stroke(); }
  else { x.beginPath(); x.moveTo(cx, cy - 26); x.lineTo(cx + 26, cy); x.lineTo(cx, cy + 26); x.lineTo(cx - 26, cy); x.closePath(); x.fill(); }
  x.fillStyle = "#fff"; x.font = "bold 50px sans-serif"; x.textBaseline = "middle";
  x.fillText(text, 112, 66, 250);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: !through, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.set(scale * 3, scale, 1);
  if (through) s.renderOrder = 999;
  return s;
}

export function buildWorld(THREE, scene) {
  const rng = mulberry32(20261115);
  const colliders = [];
  const noFly = [];
  const parks = [];
  let nextId = 1;
  const group = new THREE.Group();
  scene.add(group);
  const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const win = { pos: [], norm: [], uv: [], col: [], idx: [] };
  const plain = { pos: [], norm: [], col: [], idx: [] };
  const ROOF = C("#5d6066"), GREEN = C("#4c8a62");
  const PAL = ["#c9c2b4", "#b6bcc6", "#d6cfc2", "#9fb1c4", "#c2b6a6", "#8fa3b8", "#d2d5d8", "#b7a895", "#a8c0c9"].map(C);

  function quad(buf, verts, n, col, uvs) {
    const base = buf.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      buf.pos.push(verts[i][0], verts[i][1], verts[i][2]);
      buf.norm.push(n[0], n[1], n[2]);
      buf.col.push(col[0], col[1], col[2]);
      if (uvs) buf.uv.push(uvs[i][0], uvs[i][1]);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function addBox(x0, z0, x1, z1, y0, y1, color, opts = {}) {
    let box = null;
    if (opts.collide !== false) {
      box = { id: nextId++, min: [x0, y0, z0], max: [x1, y1, z1], kind: opts.kind || "building" };
      colliders.push(box);
    }
    const faces = [
      [[x0, z1], [x1, z1], [0, 0, 1]],
      [[x1, z1], [x1, z0], [1, 0, 0]],
      [[x1, z0], [x0, z0], [0, 0, -1]],
      [[x0, z0], [x0, z1], [-1, 0, 0]],
    ];
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 8) / 8;
    for (const [a, b, n] of faces) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const verts = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]];
      if (opts.plain) quad(plain, verts, n, color);
      else {
        const u1 = Math.max(1, Math.round(len / 4)) / 8, v1 = Math.max(1, Math.round((y1 - y0) / 3.5)) / 8;
        quad(win, verts, n, color, [[uo, vo], [uo + u1, vo], [uo + u1, vo + v1], [uo, vo + v1]]);
      }
    }
    quad(plain, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], opts.roof || ROOF);
    if (y0 > 0.5) quad(plain, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], opts.roof || ROOF);
    return box;
  }

  // ---- neon signs (generic Korean street words) -------------------------------------------
  const WORDS = ["치킨", "노래방", "약국", "PC방", "분식", "카페", "부동산", "미용실", "학원", "편의점", "고깃집", "당구장", "치과", "국밥", "호프", "서점"];
  const SIGN_BG = ["#e63946", "#f4a261", "#2a9d8f", "#3a86ff", "#ff006e", "#8338ec", "#fb8500", "#06a77d"];
  const signTex = {};
  function sign(x, y, z, face, word) {
    if (!signTex[word]) {
      const chars = [...word];
      const c = document.createElement("canvas");
      c.width = 64; c.height = 64 * chars.length + 16;
      const g = c.getContext("2d");
      g.fillStyle = SIGN_BG[Math.floor(rng() * SIGN_BG.length)];
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = "#fff"; g.font = "bold 46px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      chars.forEach((ch, i) => g.fillText(ch, 32, 42 + i * 64, 56));
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      signTex[word] = { t, n: chars.length };
    }
    const s = signTex[word];
    const h = 1.7 * s.n + 0.4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, h), new THREE.MeshBasicMaterial({ map: s.t }));
    m.position.set(x, y + h / 2, z);
    m.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][face];
    group.add(m);
  }
  function signOn(x0, z0, x1, z1, h) {
    const face = Math.floor(rng() * 4);
    const word = WORDS[Math.floor(rng() * WORDS.length)];
    const y = 4 + rng() * Math.max(1, Math.min(14, h - 12));
    const t = 0.2 + rng() * 0.6;
    if (face === 0) sign(x0 + (x1 - x0) * t, y, z1 + 0.15, 0, word);
    else if (face === 1) sign(x1 + 0.15, y, z0 + (z1 - z0) * t, 1, word);
    else if (face === 2) sign(x0 + (x1 - x0) * t, y, z0 - 0.15, 2, word);
    else sign(x0 - 0.15, y, z0 + (z1 - z0) * t, 3, word);
  }

  // ---- generic city blocks -----------------------------------------------------------------
  function lots(x0, x1, z0, z1, maxH = 96) {
    const w = x1 - x0, d = z1 - z0, gap = 5;
    const nx = w > 50 ? 2 + (rng() < 0.35 ? 1 : 0) : 1 + (rng() < 0.6 ? 1 : 0);
    const nz = d > 50 ? 2 + (rng() < 0.35 ? 1 : 0) : 1 + (rng() < 0.6 ? 1 : 0);
    const cw = (w - gap * (nx - 1)) / nx, cd = (d - gap * (nz - 1)) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lx0 = x0 + i * (cw + gap), lz0 = z0 + j * (cd + gap);
      if (rng() < 0.08) { parks.push([lx0, lz0, lx0 + cw, lz0 + cd]); continue; }
      const ins = 1.5 + rng() * 2;
      const bx0 = lx0 + ins, bx1 = lx0 + cw - ins, bz0 = lz0 + ins, bz1 = lz0 + cd - ins;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      let h = (82 - Math.hypot(cx, cz + 10) * 0.3) * (0.5 + rng() * 0.85);
      h = clamp(h, 9, maxH);
      const col = PAL[Math.floor(rng() * PAL.length)];
      const low = h < 26;
      addBox(bx0, bz0, bx1, bz1, 0, h, col, { roof: low && rng() < 0.65 ? GREEN : ROOF });
      const minDim = Math.min(bx1 - bx0, bz1 - bz0);
      if (!low && minDim > 16 && rng() < 0.35) addBox(bx0 + 4, bz0 + 4, bx1 - 4, bz1 - 4, h, h + 8 + rng() * 14, col);
      else if (minDim > 9 && rng() < 0.7) {
        const ux = bx0 + 2 + rng() * (bx1 - bx0 - 7), uz = bz0 + 2 + rng() * (bz1 - bz0 - 7);
        addBox(ux, uz, ux + 3, uz + 3, h, h + 2.2, C("#8e9299"), { plain: true });
      }
      if (rng() < 0.6) signOn(bx0, bz0, bx1, bz1, h);
    }
  }

  const special = (xi, zi) => (zi === 0 && (xi === 2 || xi === 3 || xi === 5)) || (xi === 2 && zi === 3) || (xi === 4 && zi >= 2) || (xi === 1 && zi === 2) || (xi === 5 && zi === 3);
  for (let xi = 0; xi < XR.length; xi++) for (let zi = 0; zi < ZR.length; zi++) {
    if (special(xi, zi)) continue;
    lots(XR[xi][0] + 2.5, XR[xi][1] - 2.5, ZR[zi][0] + 2.5, ZR[zi][1] - 2.5);
  }
  for (const [x0, x1] of XR) lots(x0 + 2.5, x1 - 2.5, 174, 198, 22); // low-rise south bank

  // Landmark buildings with rooftop pads.
  addBox(93, 53, 127, 87, 0, 64, C("#9fb1c4"));
  addBox(-128, -68, -92, -32, 0, 38, C("#c9c2b4"));
  addBox(90, -10, 131, 30, 0, 52, C("#b6bcc6"));
  addBox(149, -10, 196, 30, 0, 44, C("#d6cfc2"));
  // Low service compound.
  addBox(92, -68, 110, -50, 0, 12, C("#8e9299"), { plain: true });
  addBox(114, -48, 128, -32, 0, 9, C("#8e9299"), { plain: true });
  // Observation tower on a podium (major obstacle).
  addBox(153, -194, 193, -154, 0, 8, C("#6e7f6a"), { plain: true, roof: GREEN, kind: "obstacle" });
  addBox(168, -179, 178, -169, 8, 104, C("#d2d5d8"), { plain: true, kind: "obstacle" });
  addBox(164, -183, 182, -165, 78, 88, C("#b6bcc6"), { kind: "obstacle" });
  // Two river bridges (deck + piers), a sky-bridge and a construction crane.
  for (const bx of [-80, 80]) {
    addBox(bx - 7, 112, bx + 7, 178, 9, 11, C("#8e9299"), { plain: true, kind: "obstacle" });
    addBox(bx - 2, 123, bx + 2, 127, 0, 9, C("#7b7f86"), { plain: true, kind: "obstacle" });
    addBox(bx - 2, 163, bx + 2, 167, 0, 9, C("#7b7f86"), { plain: true, kind: "obstacle" });
  }
  addBox(131, -3, 149, 3, 26, 30, C("#a8c0c9"), { kind: "obstacle" });
  addBox(-87.6, 49, -86, 51, 0, 36, C("#f2b233"), { plain: true, kind: "obstacle" });
  addBox(-100, 49.3, -58, 50.7, 34, 35.6, C("#f2b233"), { plain: true, kind: "obstacle" });

  // ---- merged static meshes ----------------------------------------------------------------
  const wc = document.createElement("canvas"); wc.width = wc.height = 256;
  const ec = document.createElement("canvas"); ec.width = ec.height = 256;
  const wg = wc.getContext("2d"), eg = ec.getContext("2d");
  wg.fillStyle = "#d9d9d9"; wg.fillRect(0, 0, 256, 256);
  eg.fillStyle = "#000"; eg.fillRect(0, 0, 256, 256);
  const trng = mulberry32(77);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const lit = trng() < 0.3;
    wg.fillStyle = lit ? "#ffe2a8" : "#33435a";
    wg.fillRect(i * 32 + 6, j * 32 + 7, 20, 17);
    if (lit) { eg.fillStyle = trng() < 0.5 ? "#ffc56b" : "#ffe9b8"; eg.fillRect(i * 32 + 6, j * 32 + 7, 20, 17); }
  }
  const wtex = new THREE.CanvasTexture(wc), etex = new THREE.CanvasTexture(ec);
  for (const t of [wtex, etex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
  const mk = (buf, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(buf.norm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(buf.col, 3));
    if (buf.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uv, 2));
    g.setIndex(buf.idx);
    const m = new THREE.Mesh(g, mat);
    group.add(m);
    return m;
  };
  mk(win, new THREE.MeshLambertMaterial({ map: wtex, emissiveMap: etex, emissive: 0xffffff, emissiveIntensity: 0.85, vertexColors: true }));
  mk(plain, new THREE.MeshLambertMaterial({ vertexColors: true }));

  // ---- ground ------------------------------------------------------------------------------
  const GS = 2048 / 400;
  const gc = document.createElement("canvas"); gc.width = gc.height = 2048;
  const g = gc.getContext("2d");
  const rect = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect((x0 + 200) * GS, (z0 + 200) * GS, (x1 - x0) * GS, (z1 - z0) * GS); };
  rect(-200, -200, 200, 200, "#25282e");
  rect(-200, 107, 200, 120, "#35603a");
  rect(-200, 120, 200, 170, "#1b4468");
  for (let i = 0; i < 60; i++) { const rx = -200 + trng() * 390, rz = 122 + trng() * 46; rect(rx, rz, rx + 4 + trng() * 10, rz + 0.3, "#2c5f8c"); }
  rect(-200, 170, 200, 172, "#35603a");
  for (const [x0, x1] of XR) {
    for (const [z0, z1] of ZR) { rect(x0, z0, x1, z1, "#6d7179"); rect(x0 + 2.5, z0 + 2.5, x1 - 2.5, z1 - 2.5, "#494d54"); }
    rect(x0, 172, x1, 200, "#6d7179"); rect(x0 + 2.5, 174.5, x1 - 2.5, 200, "#494d54");
  }
  for (const p of parks) rect(p[0], p[1], p[2], p[3], "#3f7243");
  rect(-73, -200, 73, -147, "#9a8762");
  rect(147, -200, 200, -147, "#3f6b45");
  rect(87, -73, 133, -27, "#5a4a4a");
  g.fillStyle = "#4f8a4f"; g.beginPath(); g.ellipse((-44 + 200) * GS, (10 + 200) * GS, 24 * GS, 18 * GS, 0, 0, 7); g.fill();
  // lane markings
  const dash = (x0, z0, x1, z1, col, w) => {
    g.strokeStyle = col; g.lineWidth = w; g.setLineDash([3 * GS, 4 * GS]);
    g.beginPath(); g.moveTo((x0 + 200) * GS, (z0 + 200) * GS); g.lineTo((x1 + 200) * GS, (z1 + 200) * GS); g.stroke(); g.setLineDash([]);
  };
  rect(-0.5, -147, -0.2, 107, "#e3b23c"); rect(0.2, -147, 0.5, 107, "#e3b23c");
  for (const lx of [-10, -5, 5, 10]) dash(lx, -147, lx, 107, "#d8d8d8", 1.2);
  for (const rx of [-140, -80, 80, 140]) dash(rx, -200, rx, 107, "#d8d8d8", 1.2);
  for (const rz of [-140, -80, -20, 40, 100]) dash(-200, rz, 200, rz, "#d8d8d8", 1.2);
  for (const rz of [-140, -80, -20, 40, 100]) for (const side of [-9, 9]) for (let sx = -14; sx < 14; sx += 2) rect(sx, rz + side - 1.5, sx + 1, rz + side + 1.5, "#cfcfcf");
  const gtex = new THREE.CanvasTexture(gc);
  gtex.colorSpace = THREE.SRGBColorSpace; gtex.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: gtex }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: 0x2f3a3a }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.3;
  group.add(outer);

  // ---- decoration without collision --------------------------------------------------------
  const treeGeo = new THREE.ConeGeometry(1.7, 5.5, 6);
  const treePos = [];
  for (let z = -140; z <= 92; z += 12) { treePos.push([-16.5, z], [16.5, z]); }
  for (let x = -190; x <= 190; x += 9) if (Math.abs(Math.abs(x) - 80) > 12) treePos.push([x, 109 + (x % 2 ? 2 : 0)]);
  for (let i = 0; i < 14; i++) treePos.push([-44 + Math.cos(i * 0.45) * 22, 10 + Math.sin(i * 0.45) * 16]);
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: 0x2f6d3c }), treePos.length);
  const mtx = new THREE.Matrix4();
  treePos.forEach((t, i) => { mtx.makeTranslation(t[0], 3.4, t[1]); trees.setMatrixAt(i, mtx); });
  group.add(trees);
  // palace-style compound (generic hanok shapes, open to fly over)
  const hanok = (x, z, w, d, h) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: 0x8c3b2e }));
    body.position.set(x, h / 2, z); group.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), new THREE.MeshLambertMaterial({ color: 0x2d3a3f }));
    roof.rotation.y = Math.PI / 4; roof.scale.set(w * 0.85, h * 0.7, d * 0.85); roof.position.set(x, h + h * 0.35, z); group.add(roof);
    colliders.push({ id: nextId++, min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h * 1.5, z + d / 2], kind: "building" });
  };
  hanok(0, -153, 30, 8, 9); hanok(0, -180, 40, 18, 11); hanok(-45, -178, 20, 12, 7); hanok(45, -178, 20, 12, 7);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.5, 24, 8), new THREE.MeshLambertMaterial({ color: 0xd9dde2 }));
  tower.position.set(173, 116, -174); group.add(tower);
  const mrng = mulberry32(5);
  for (let i = 0; i < 9; i++) {
    const r = 110 + mrng() * 120, h = 80 + mrng() * 110;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), new THREE.MeshLambertMaterial({ color: 0x3a4257 }));
    const side = i < 6;
    m.position.set(side ? -420 + i * 170 : 430, h / 2 - 2, side ? -360 - mrng() * 80 : -300 + (i - 6) * 220);
    group.add(m);
  }

  // ---- pads, hazard and restricted-zone markings -------------------------------------------
  const padCanvas = document.createElement("canvas"); padCanvas.width = padCanvas.height = 256;
  const pg = padCanvas.getContext("2d");
  pg.fillStyle = "#30343b"; pg.beginPath(); pg.arc(128, 128, 126, 0, 7); pg.fill();
  pg.strokeStyle = "#ffd23f"; pg.lineWidth = 12; pg.beginPath(); pg.arc(128, 128, 112, 0, 7); pg.stroke();
  pg.fillStyle = "#fff"; pg.fillRect(78, 66, 24, 124); pg.fillRect(154, 66, 24, 124); pg.fillRect(78, 116, 100, 24);
  const padTex = new THREE.CanvasTexture(padCanvas); padTex.colorSpace = THREE.SRGBColorSpace;
  for (const p of [PADS.towerA, PADS.towerB, PADS.park, PADS.plaza]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshBasicMaterial({ map: padTex, transparent: true }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.12, p.z); group.add(m);
  }
  const hazards = [[173, 112, -174, "전망 타워"], [80, 16, 145, "교량"], [-80, 16, 145, "교량"], [140, 35, 0, "공중 연결로"], [-80, 41, 50, "크레인"]];
  for (const h of hazards) { const s = iconSprite(THREE, "hazard", h[3], "#ff9f1c", false, 4.2); s.position.set(h[0], h[1], h[2]); group.add(s); }

  function addNoFly(x0, z0, x1, z1, label) {
    const zone = { min: [x0, 0, z0], max: [x1, BOUNDS.top + 20, z1] };
    noFly.push(zone);
    const h = 70;
    const geo = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); group.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xff4d4d }));
    e.position.copy(m.position); group.add(e);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const [sx, sz] of [[cx, z1 + 1], [cx, z0 - 1], [x1 + 1, cz], [x0 - 1, cz]]) {
      const s = iconSprite(THREE, "nofly", label, "#ff4d4d", false, 4.6); s.position.set(sx, 24, sz); group.add(s);
    }
  }
  // The whole district is open airspace: no restricted areas are placed (addNoFly stays available for later use).

  // Boundary walls: only visible while the drone pushes against the edge.
  const bc = document.createElement("canvas"); bc.width = bc.height = 64;
  const bg = bc.getContext("2d");
  bg.strokeStyle = "#ff6b6b"; bg.lineWidth = 3; bg.strokeRect(0, 0, 64, 64);
  const btex = new THREE.CanvasTexture(bc); btex.wrapS = btex.wrapT = THREE.RepeatWrapping; btex.repeat.set(40, 14);
  const boundaryMat = new THREE.MeshBasicMaterial({ map: btex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 140), boundaryMat);
    m.position.set(i === 0 ? -200 : i === 1 ? 200 : 0, 70, i === 2 ? -200 : i === 3 ? 200 : 0);
    if (i < 2) m.rotation.y = Math.PI / 2;
    group.add(m);
  }

  // ---- lights and sky ----------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xd6e2ff, 0x6b5a48, 2.7));
  const sun = new THREE.DirectionalLight(0xffcf9e, 3.2);
  sun.position.set(-160, 90, 60);
  scene.add(sun);
  const sc = document.createElement("canvas"); sc.width = 8; sc.height = 256;
  const sg = sc.getContext("2d");
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#3d5596"); grad.addColorStop(0.45, "#a877a0"); grad.addColorStop(0.7, "#e58a66"); grad.addColorStop(1, "#f6c489");
  sg.fillStyle = grad; sg.fillRect(0, 0, 8, 256);
  const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
  scene.background = stex;
  scene.fog = new THREE.Fog(0xd99b7c, 160, 700);

  // ---- temporary obstacles (tutorial pillars) ----------------------------------------------
  const temps = [];
  function addTemp(x0, z0, x1, z1, y0, y1, color = 0xff8c42) {
    const box = { id: nextId++, min: [x0, y0, z0], max: [x1, y1, z1], kind: "temp" };
    colliders.push(box);
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshLambertMaterial({ color }));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    group.add(m);
    temps.push({ box, m });
  }
  function removeTemp() {
    while (temps.length) {
      const t = temps.pop();
      group.remove(t.m); t.m.geometry.dispose(); t.m.material.dispose();
      const i = colliders.indexOf(t.box);
      if (i >= 0) colliders.splice(i, 1);
    }
  }
  return { colliders, noFly, addTemp, removeTemp, boundaryMat, group };
}

/** Per-content guidance markers: checkpoints, start, goal, target zones. */
export function makeMarkers(THREE, scene) {
  const group = new THREE.Group();
  scene.add(group);
  const labels = [];
  const free = (o) => o.traverse((m) => {
    const li = labels.indexOf(m);
    if (li >= 0) labels.splice(li, 1);
    if (m.geometry) m.geometry.dispose();
    if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
  });
  return {
    /** Hide see-through labels the camera is about to fly into. */
    update(cam) {
      for (const s of labels) s.visible = Math.hypot(s.position.x - cam.x, s.position.y - cam.y, s.position.z - cam.z) > 16;
    },
    clear() { while (group.children.length) { const o = group.children[group.children.length - 1]; group.remove(o); free(o); } },
    remove(o) { group.remove(o); free(o); },
    ring(cp) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(cp.r, 0.45, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, fog: false }));
      m.position.set(cp.x, cp.y, cp.z);
      m.rotation.y = Math.atan2(cp.nx, cp.nz);
      group.add(m);
      return m;
    },
    setRing(m, state) {
      m.visible = state !== "passed";
      if (state === "next") { m.material.color.set(0xffd23f); m.material.opacity = 1; m.material.depthTest = false; m.renderOrder = 998; }
      else { m.material.color.set(0xffffff); m.material.opacity = 0.28; m.material.depthTest = true; m.renderOrder = 0; }
    },
    startCircle(p) {
      const m = new THREE.Mesh(new THREE.RingGeometry(3.6, 5, 40), new THREE.MeshBasicMaterial({ color: 0x3ddc84, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95, fog: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.25, p.z); m.renderOrder = 997;
      const s = iconSprite(THREE, "start", "출발", "#3ddc84", true, 3); s.position.set(p.x, 12, p.z); labels.push(s);
      group.add(m, s);
    },
    goal(p) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a86ff, depthTest: false, side: THREE.DoubleSide, fog: false });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 6), mat); pole.position.y = 4.5;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), mat); flag.position.set(2, 7.6, 0);
      pole.renderOrder = flag.renderOrder = 997;
      const zone = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 30, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x3a86ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      zone.position.y = 15;
      g.add(pole, flag, zone);
      g.position.set(p.x, Math.max(0, p.y - 5), p.z);
      const s = iconSprite(THREE, "goal", "도착", "#3a86ff", true, 3.6); s.position.set(p.x, p.y + 9, p.z); labels.push(s);
      group.add(g, s);
    },
    zone(p, color, label, kind = "zone") {
      const hex = "#" + color.toString(16).padStart(6, "0");
      const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 40, 32, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.set(p.x, p.y + 14, p.z);
      const s = iconSprite(THREE, kind, label, hex, true, 3.6); s.position.set(p.x, p.y + 11, p.z); labels.push(s);
      const o = new THREE.Group(); o.add(m, s);
      group.add(o);
      return o;
    },
    label(p, text, color, kind = "zone", through = true) {
      const s = iconSprite(THREE, kind, text, color, through, 3.2); s.position.set(p.x, p.y, p.z); labels.push(s);
      group.add(s);
      return s;
    },
  };
}
