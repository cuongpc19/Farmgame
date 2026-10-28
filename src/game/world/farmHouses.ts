import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat } from "../models";
import { rng } from "../theme";

/**
 * Farm buildings (Farm Valley, 2026-10-28; replaced Candy Miner's gingerbread houses): a kit of wooden and stone
 * parts (board walls, shingled roofs whose tabs lift at the lower edge, windows with shutters and flower boxes, plank
 * doors, stone footings and chimneys, lanterns, painted wooden signs) and the base's buildings made of it: the
 * Farmhands' cottage, the red barn (Farm Shop), the Workshop and the Market hall. The Mill, the Forge, the Fuel depot
 * and the Noodle Stall are assembled in props.ts from the same kit. All plain coloured primitives (smooth shaded),
 * so the caller bakes them into a few vertex-coloured meshes (`bakeColors`) and freezes them; signs keep their
 * canvas texture.
 *
 * Buildings face +z (the camera looks north from the south, 57° down): front wall, gable and both roof slopes show.
 */
export const C = {
  wood: 0xb47c45,
  woodDark: 0x7a4f2a,
  woodLight: 0xd8a868,
  plaster: 0xf5e8c9,
  stone: 0xaca79e,
  stoneDark: 0x8e897f,
  trim: 0xfff6e4,
  glass: 0xa6d6ec,
  iron: 0x47433f,
  brass: 0xe2b443,
  barnRed: 0xc5412f,
  hay: 0xf0c85a,
  interior: 0x3e2c20,
};
export const ROOF = { red: 0xcf4b3c, blue: 0x4174c4, green: 0x4f9e44, slate: 0x5b626d, tan: 0xc98f4c, terracotta: 0xd5683e };
const FLOWERS = [0xe8453c, 0xffd84a, 0xff8fb8, 0xffffff, 0xb48cff];

type MatOpts = Parameters<typeof mat>[1];

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const rbox = (w: number, h: number, d: number, r = 0.06, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.99);
export const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/** Add a mesh of `geo` in `color` to `parent` at (x, y, z); casts and takes shadows. */
export function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, opts?: MatOpts): THREE.Mesh {
  const me = new THREE.Mesh(geo, mat(color, opts));
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

/** A beam from (x0, y0) to (x1, y1) in the x-y plane at depth z: a rounded box `t` thick, `d` deep. */
export function beam(parent: THREE.Object3D, x0: number, y0: number, x1: number, y1: number, z: number, t: number, d: number, color: number): THREE.Mesh {
  const L = Math.hypot(x1 - x0, y1 - y0);
  const me = add(parent, rbox(L, t, d, Math.min(0.04, t / 2)), color, (x0 + x1) / 2, (y0 + y1) / 2, z);
  me.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  return me;
}

/**
 * One slope of shingles from A (the eave) up to B (the ridge) in the x-y plane, `d` deep along z round `zc`: rows of
 * tabs, every other row shifted half a tab, each tab tipped so its lower edge lifts a little (the stepped look of a
 * shingled roof from above), on a darker deck.
 */
export function slope(parent: THREE.Object3D, ax: number, ay: number, bx: number, by: number, d: number, color: number, zc = 0, seed = 1): void {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  let nx = -dy / L;
  let ny = dx / L;
  let flip = false;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    flip = true;
  }
  const deck = add(parent, box(L + 0.05, 0.1, d), shade(color, 0.62), ax + dx / 2, ay + dy / 2, zc);
  deck.rotation.z = ang;
  const r = rng(seed);
  const rows = Math.max(3, Math.round(L / 0.5));
  const rw = L / rows;
  const tabs = Math.max(2, Math.round(d / 0.6));
  const tw = d / tabs;
  const th = 0.09;
  const tilt = 0.08 * (flip ? 1 : -1);
  for (let i = 0; i < rows; i++) {
    const t = (i + 0.5) / rows;
    const cx = ax + dx * t + nx * (0.07 + i * 0.004);
    const cy = ay + dy * t + ny * (0.07 + i * 0.004);
    const off = i % 2 ? tw / 2 : 0;
    for (let j = -1; j < tabs; j++) {
      const z0 = Math.max(-d / 2, -d / 2 + j * tw + off);
      const z1 = Math.min(d / 2, -d / 2 + (j + 1) * tw + off);
      if (z1 - z0 < 0.08) continue;
      const k = (i % 2 ? 0.92 : 1) * (0.94 + r() * 0.12);
      const tab = add(parent, box(rw * 1.35, th, z1 - z0 - 0.04), shade(color, k), cx, cy, zc + (z0 + z1) / 2);
      tab.rotation.z = ang + tilt;
    }
  }
}

/** A ridge cap along z at (x, y). */
export function ridge(parent: THREE.Object3D, x: number, y: number, d: number, color: number, zc = 0): void {
  const cap = new THREE.CylinderGeometry(0.15, 0.15, d, 10);
  cap.rotateX(Math.PI / 2);
  add(parent, cap, shade(color, 0.72), x, y, zc);
}

export interface RoofOpts {
  /** Wall width (x) and depth (z) under the roof; eave height; rise to the ridge. */
  w: number;
  d: number;
  y: number;
  rise: number;
  color: number;
  over?: number;
  zc?: number;
  /** Barge boards along the gable edges (front and back). */
  trim?: number;
  seed?: number;
}

/** A gable roof, ridge front to back (along z), shingled; returns the ridge height. */
export function gableRoof(parent: THREE.Object3D, o: RoofOpts): number {
  const over = o.over ?? 0.38;
  const zc = o.zc ?? 0;
  const half = o.w / 2;
  const k = o.rise / half;
  const ex = half + over;
  const ey = o.y - over * k;
  const top = o.y + o.rise;
  const D = o.d + over * 2;
  slope(parent, -ex, ey, 0, top, D, o.color, zc, o.seed ?? 1);
  slope(parent, ex, ey, 0, top, D, o.color, zc, (o.seed ?? 1) + 7);
  ridge(parent, 0, top + 0.1, D + 0.06, o.color, zc);
  if (o.trim !== undefined)
    for (const sz of [-1, 1])
      for (const sx of [-1, 1]) beam(parent, sx * (ex + 0.02), ey - 0.06, 0, top - 0.02, zc + sz * (D / 2 + 0.03), 0.16, 0.08, o.trim);
  return top;
}

/** A gable wall: a triangle `w` wide, `rise` tall, from height y, `t` thick with its front face at z. */
export function gable(parent: THREE.Object3D, w: number, rise: number, y: number, z: number, color: number, t = 0.14): THREE.Mesh {
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0);
  tri.lineTo(w / 2, 0);
  tri.lineTo(0, rise);
  tri.closePath();
  return add(parent, new THREE.ExtrudeGeometry(tri, { depth: t, bevelEnabled: false }), color, 0, y, z - t);
}

/**
 * Boards on a wall face at z (their back on it): vertical boards across x0..x1 from y0 to y1, or horizontal ones
 * (`horizontal`) stacked from y0 to y1; two tones that alternate, each board a hair proud of or behind the next.
 */
export function boards(parent: THREE.Object3D, x0: number, x1: number, y0: number, y1: number, z: number, color: number, o: { horizontal?: boolean; size?: number; t?: number; seed?: number } = {}): void {
  const size = o.size ?? 0.42;
  const t = o.t ?? 0.07;
  const r = rng(o.seed ?? 5);
  const span = o.horizontal ? y1 - y0 : x1 - x0;
  const n = Math.max(1, Math.round(span / size));
  const bw = span / n;
  for (let i = 0; i < n; i++) {
    const k = (i % 2 ? 0.92 : 1) * (0.96 + r() * 0.08);
    const dz = (r() - 0.5) * 0.02;
    if (o.horizontal) add(parent, box(x1 - x0, bw - 0.035, t), shade(color, k), (x0 + x1) / 2, y0 + bw * (i + 0.5), z + t / 2 + dz);
    else add(parent, box(bw - 0.035, y1 - y0, t), shade(color, k), x0 + bw * (i + 0.5), (y0 + y1) / 2, z + t / 2 + dz);
  }
}

/** Rounded stones laid in courses over a rectangle on a wall face at z (their back on it). */
export function stones(parent: THREE.Object3D, x0: number, x1: number, y0: number, y1: number, z: number, color: number, o: { size?: number; seed?: number; depth?: number } = {}): void {
  const r = rng(o.seed ?? 3);
  const sh = o.size ?? 0.36;
  const rows = Math.max(1, Math.round((y1 - y0) / sh));
  const rh = (y1 - y0) / rows;
  const dep = o.depth ?? 0.12;
  for (let i = 0; i < rows; i++) {
    let x = x0;
    const y = y0 + rh * (i + 0.5);
    let first = true;
    while (x < x1 - 0.05) {
      let w = rh * (1.1 + r() * 0.9);
      if (first && i % 2) w *= 0.55;
      first = false;
      if (x + w > x1 - 0.12) w = x1 - x;
      const k = 0.88 + r() * 0.2;
      add(parent, rbox(w - 0.05, rh - 0.05, dep, Math.min(0.08, rh * 0.3), 1), shade(color, k), x + w / 2, y, z + dep / 2 - 0.02);
      x += w;
    }
  }
}

export interface WindowOpts {
  frame?: number;
  shutter?: number;
  flowers?: boolean;
  seed?: number;
}

/** A window on a wall face at z: frame, glass with a glint, cross bars; shutters and a flower box if asked. */
export function windowAt(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, o: WindowOpts = {}): void {
  const frame = o.frame ?? C.trim;
  add(parent, rbox(w + 0.18, h + 0.18, 0.08, 0.04), frame, x, y, z + 0.04);
  add(parent, box(w, h, 0.06), C.glass, x, y, z + 0.06);
  add(parent, box(w * 0.18, h * 0.5, 0.02), 0xeaf8ff, x - w * 0.22, y + h * 0.12, z + 0.1).rotation.z = -0.5;
  add(parent, box(0.06, h, 0.1), frame, x, y, z + 0.08);
  add(parent, box(w, 0.06, 0.1), frame, x, y, z + 0.08);
  add(parent, box(w + 0.32, 0.08, 0.16), frame, x, y - h / 2 - 0.1, z + 0.08);
  if (o.shutter !== undefined)
    for (const s of [-1, 1]) {
      const sx = x + s * (w / 2 + 0.09 + w * 0.22);
      add(parent, rbox(w * 0.42, h + 0.1, 0.06, 0.03), o.shutter, sx, y, z + 0.04);
      add(parent, box(w * 0.3, 0.04, 0.07), shade(o.shutter, 0.8), sx, y + h * 0.22, z + 0.06);
      add(parent, box(w * 0.3, 0.04, 0.07), shade(o.shutter, 0.8), sx, y - h * 0.22, z + 0.06);
    }
  if (o.flowers) {
    const by = y - h / 2 - 0.28;
    add(parent, rbox(w + 0.2, 0.26, 0.3, 0.05), C.woodDark, x, by, z + 0.16);
    const r = rng(o.seed ?? 7);
    const n = Math.max(3, Math.round(w / 0.17));
    for (let i = 0; i < n; i++) {
      const fx = x - w / 2 + (w * (i + 0.5)) / n;
      add(parent, new THREE.SphereGeometry(0.11, 8, 6), i % 2 ? 0x5fae3f : 0x4f9c38, fx, by + 0.15, z + 0.14 + (r() - 0.5) * 0.08);
      add(parent, new THREE.SphereGeometry(0.075, 8, 6), FLOWERS[Math.floor(r() * FLOWERS.length)], fx + (r() - 0.5) * 0.06, by + 0.24 + r() * 0.04, z + 0.2);
    }
  }
}

/** A plank door on a wall face at z (bottom at y 0 unless `y0`): frame, boards, a Z brace and a brass knob. */
export function doorAt(parent: THREE.Object3D, x: number, z: number, w: number, h: number, color: number, o: { frame?: number; y0?: number } = {}): void {
  const y0 = o.y0 ?? 0;
  const frame = o.frame ?? C.woodDark;
  add(parent, rbox(w + 0.22, h + 0.12, 0.08, 0.04), frame, x, y0 + h / 2 + 0.03, z + 0.04);
  boards(parent, x - w / 2, x + w / 2, y0, y0 + h, z + 0.05, color, { size: w / 3, t: 0.05, seed: 11 });
  for (const yy of [0.22, 0.78]) add(parent, box(w * 0.92, 0.1, 0.05), shade(color, 0.82), x, y0 + h * yy, z + 0.12);
  beam(parent, x - w * 0.42, y0 + h * 0.24, x + w * 0.42, y0 + h * 0.76, z + 0.12, 0.09, 0.05, shade(color, 0.82));
  add(parent, new THREE.SphereGeometry(0.06, 8, 6), C.brass, x + w * 0.32, y0 + h * 0.5, z + 0.17);
}

/** A stone chimney on a roof from y0 to y1 at (x, z); returns the point the smoke leaves from. */
export function chimney(parent: THREE.Object3D, x: number, z: number, y0: number, y1: number, color = C.stone, w = 0.6): THREE.Object3D {
  add(parent, rbox(w, y1 - y0, w, 0.06), shade(color, 0.9), x, (y0 + y1) / 2, z);
  stones(parent, x - w / 2, x + w / 2, Math.max(y0, y1 - 1.6), y1 - 0.08, z + w / 2, color, { size: 0.24, seed: Math.round(x * 13), depth: 0.06 });
  add(parent, rbox(w + 0.16, 0.14, w + 0.16, 0.05), shade(color, 0.75), x, y1, z);
  add(parent, cyl(w * 0.28, w * 0.28, 0.1, 10), 0x2c2a28, x, y1 + 0.08, z);
  const tip = new THREE.Object3D();
  tip.position.set(x, y1 + 0.25, z);
  parent.add(tip);
  return tip;
}

/** An iron lantern on a little bracket at a wall face (x, y, z); its glass glows with `glow` (or a shared warm glow). */
export function lantern(parent: THREE.Object3D, x: number, y: number, z: number, glow?: THREE.Material): THREE.Mesh {
  add(parent, box(0.06, 0.06, 0.32), C.iron, x, y + 0.42, z + 0.16);
  add(parent, cyl(0.012, 0.012, 0.14, 4), C.iron, x, y + 0.33, z + 0.3);
  add(parent, new THREE.ConeGeometry(0.17, 0.14, 8), C.iron, x, y + 0.2, z + 0.3);
  const glass = new THREE.Mesh(cyl(0.11, 0.09, 0.26, 10), glow ?? mat(0xffe2a0, { emissive: 0xffa53a }));
  glass.position.set(x, y, z + 0.3);
  parent.add(glass);
  add(parent, cyl(0.12, 0.12, 0.04, 10), C.iron, x, y - 0.15, z + 0.3);
  return glass;
}

/** A canvas texture of a painted wooden board: planks, grain, nails, cream letters with a dark outline. */
function signTexture(lines: string[], w: number, h: number, o: { paint?: string; text?: string; icon?: (g: CanvasRenderingContext2D, x: number, y: number, s: number) => void } = {}): THREE.CanvasTexture {
  const scale = 110;
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext("2d")!;
  const W = c.width;
  const H = c.height;
  const r = rng(lines.join("").length * 7 + 1);
  g.fillStyle = o.paint ?? "#9a6434";
  g.fillRect(0, 0, W, H);
  const planks = Math.max(2, Math.round(h / 0.32));
  for (let i = 0; i < planks; i++) {
    const y0 = (i * H) / planks;
    g.fillStyle = i % 2 ? "rgba(255,220,170,0.08)" : "rgba(60,30,10,0.08)";
    g.fillRect(0, y0, W, H / planks);
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = "rgba(60,30,10,0.18)";
      g.lineWidth = 2;
      g.beginPath();
      const gy = y0 + 6 + r() * (H / planks - 12);
      g.moveTo(r() * W * 0.3, gy);
      g.bezierCurveTo(W * 0.4, gy + (r() - 0.5) * 8, W * 0.6, gy + (r() - 0.5) * 8, W * (0.7 + r() * 0.3), gy);
      g.stroke();
    }
    g.fillStyle = "rgba(40,20,8,0.45)";
    g.fillRect(0, y0, W, 3);
  }
  g.strokeStyle = "#5a3418";
  g.lineWidth = Math.max(6, H * 0.06);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
  g.fillStyle = "#3a2410";
  for (const [x, y] of [[0.05, 0.18], [0.95, 0.18], [0.05, 0.82], [0.95, 0.82]]) {
    g.beginPath();
    g.arc(W * x, H * y, Math.max(3, H * 0.035), 0, Math.PI * 2);
    g.fill();
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lh = H / (lines.length + 0.25);
  const iconW = o.icon ? H * 0.7 : 0;
  lines.forEach((l, i) => {
    let px = Math.round(lh * 0.66);
    g.font = `${px}px "Lilita One", system-ui, sans-serif`;
    const max = W * 0.86 - iconW;
    const tw = g.measureText(l).width;
    if (tw > max) {
      px = Math.floor((px * max) / tw);
      g.font = `${px}px "Lilita One", system-ui, sans-serif`;
    }
    const x = W / 2 + iconW / 2;
    const y = lh * (i + 0.64);
    g.lineJoin = "round";
    g.lineWidth = px * 0.16;
    g.strokeStyle = "#3a2210";
    g.strokeText(l, x, y);
    g.fillStyle = o.text ?? "#fff3d2";
    g.fillText(l, x, y);
    if (o.icon && i === 0) o.icon(g, x - g.measureText(l).width / 2 - iconW * 0.55, y, iconW * 0.42);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A painted wooden sign `w` x `h`, its face toward +z, with a dark wooden frame behind (the frame bakes with the building). */
export function woodSign(lines: string[], w: number, h: number, o: Parameters<typeof signTexture>[3] = {}): THREE.Group {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(lines, w, h, o) }));
  face.position.z = 0.06;
  g.add(face);
  add(g, rbox(w + 0.14, h + 0.14, 0.1, 0.05), C.woodDark, 0, 0, 0);
  return g;
}

/** A cog drawn on a sign. */
export function cogIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = "#ffd36a";
  g.strokeStyle = "#3a2210";
  g.lineWidth = s * 0.14;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? s * 0.78 : s;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.stroke();
  g.fill();
  g.fillStyle = "#3a2210";
  g.beginPath();
  g.arc(0, 0, s * 0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A stone footing under walls w x d (front face at z = front), `h` tall, stones showing on the front. */
function footing(parent: THREE.Object3D, w: number, d: number, h: number, front: number, seed: number): void {
  add(parent, box(w + 0.16, h, d + 0.16), C.stoneDark, 0, h / 2, front - d / 2);
  stones(parent, -w / 2 - 0.08, w / 2 + 0.08, 0.02, h - 0.02, front + 0.08, C.stone, { size: h / 2, seed });
}

// ---------------------------------------------------------------------------------------------------------------
// The entry buildings. Each stands inside its collision box (Game: x ±1.3 cells, z −1.45 … +0.3 cells round the
// building's spot); front face at z = +0.7, centred on x; the entry pad is in front.

const FRONT = 0.7;

/** Farmhands' House: a cottage, cream walls in a timber frame on a stone footing, blue shingles, shutters, flowers. */
export function cottage(sign: string): THREE.Group {
  const g = new THREE.Group();
  const W = 5.4;
  const D = 3.9;
  const H = 2.95;
  const zc = FRONT - D / 2;
  const base = 0.42;
  footing(g, W, D, base, FRONT, 21);
  add(g, box(W, H - base, D), C.plaster, 0, base + (H - base) / 2, zc);
  // Timber frame on the front: corner posts, sill, top beam, a mid rail, studs by the door.
  for (const sx of [-1, 1]) add(g, rbox(0.22, H - base, 0.14, 0.04), C.woodDark, sx * (W / 2 - 0.06), base + (H - base) / 2, FRONT + 0.04);
  add(g, rbox(W + 0.12, 0.2, 0.16, 0.05), C.woodDark, 0, H - 0.05, FRONT + 0.04);
  add(g, rbox(W, 0.14, 0.12, 0.04), C.woodDark, 0, base + 0.07, FRONT + 0.03);
  for (const sx of [-1, 1]) {
    add(g, rbox(0.16, H - base - 0.2, 0.12, 0.04), C.woodDark, sx * 0.78, base + (H - base - 0.2) / 2, FRONT + 0.03);
    add(g, rbox(W / 2 - 0.9, 0.12, 0.1, 0.04), C.woodDark, sx * (0.78 + (W / 2 - 0.84) / 2), 1.18, FRONT + 0.03);
  }
  // Gables with a king post and braces, a round attic window.
  const rise = 1.9;
  for (const z of [FRONT, FRONT - D + 0.14]) gable(g, W, rise, H, z, C.plaster);
  add(g, rbox(0.14, rise * 0.72, 0.1, 0.04), C.woodDark, 0, H + rise * 0.36, FRONT + 0.03);
  for (const sx of [-1, 1]) beam(g, sx * 1.5, H + 0.08, 0, H + rise * 0.55, FRONT + 0.03, 0.12, 0.1, C.woodDark);
  const attic = cyl(0.27, 0.27, 0.1, 18);
  attic.rotateX(Math.PI / 2);
  add(g, attic, C.trim, 0, H + 1.12, FRONT + 0.05);
  const pane = cyl(0.2, 0.2, 0.1, 18);
  pane.rotateX(Math.PI / 2);
  add(g, pane, C.glass, 0, H + 1.12, FRONT + 0.08);
  gableRoof(g, { w: W, d: D, y: H, rise, color: ROOF.blue, zc, trim: C.woodDark, seed: 31 });
  // Door with a little bracketed canopy, windows with green shutters and flowers, a lantern.
  doorAt(g, 0, FRONT, 1.0, 2.05, 0x9a4a2e, { y0: base - 0.02 });
  for (const sx of [-1, 1]) beam(g, sx * 0.62, 2.25, sx * 0.62, 2.62, FRONT + 0.35, 0.1, 0.1, C.woodDark);
  const can = new THREE.Group();
  slope(can, -0.85, 2.62, 0, 2.95, 0.9, ROOF.blue, 0, 41);
  slope(can, 0.85, 2.62, 0, 2.95, 0.9, ROOF.blue, 0, 43);
  can.position.z = FRONT + 0.42;
  g.add(can);
  for (const sx of [-1, 1]) windowAt(g, sx * 1.78, 1.78, FRONT, 0.88, 0.82, { shutter: 0x4f9a5a, flowers: true, seed: 50 + sx });
  lantern(g, 0.62, 1.85, FRONT);
  chimney(g, 1.45, zc - 0.6, H + 0.3, H + 2.35);
  const s = woodSign([sign], 3.0, 0.68);
  s.position.set(0, H + 0.42, FRONT + 0.2);
  s.rotation.x = -0.22;
  g.add(s);
  return g;
}

/** Farm Shop: a big red barn with white trim, X-braced doors, a hayloft full of hay, a gambrel roof and a cupola. */
export function barn(sign: string): THREE.Group {
  const g = new THREE.Group();
  const W = 5.7;
  const D = 4.05;
  const H = 2.65;
  const zc = FRONT - D / 2;
  const kx = W / 2 - 0.62;
  const ky = H + 1.4;
  const ry = H + 2.2;
  const top = (x: number) => {
    const a = Math.abs(x);
    return a <= kx ? ry + (ky - ry) * (a / kx) : ky + (H - ky) * ((a - kx) / (W / 2 - kx));
  };
  add(g, box(W + 0.12, 0.25, D + 0.12), C.stoneDark, 0, 0.125, zc);
  add(g, box(W, H, D), C.barnRed, 0, H / 2, zc);
  const prof = new THREE.Shape();
  prof.moveTo(-W / 2, 0);
  for (const [x, y] of [[W / 2, 0], [W / 2, H], [kx, ky], [0, ry], [-kx, ky], [-W / 2, H]]) prof.lineTo(x, y);
  prof.closePath();
  for (const z of [FRONT - 0.14, FRONT - D]) add(g, new THREE.ExtrudeGeometry(prof, { depth: 0.14, bevelEnabled: false }), C.barnRed, 0, 0, z);
  // Board grooves up the front, under the roof line.
  for (let x = -W / 2 + 0.42; x < W / 2 - 0.2; x += 0.42) {
    const h = top(x) - 0.3;
    add(g, box(0.05, h - 0.25, 0.03), shade(C.barnRed, 0.78), x, 0.25 + (h - 0.25) / 2, FRONT + 0.01);
  }
  // Roof: steep lower slopes, gentle upper ones, dark shingles.
  const over = 0.32;
  const D2 = D + over * 2;
  for (const sx of [-1, 1]) {
    const lx = sx * (W / 2 + 0.24);
    const ly = H - 0.42;
    slope(g, lx, ly, sx * kx, ky, D2, ROOF.slate, zc, 61 + sx);
    slope(g, sx * kx, ky, 0, ry, D2, ROOF.slate, zc, 71 + sx);
    beam(g, lx, ly - 0.05, sx * kx, ky - 0.02, FRONT + over + 0.03, 0.16, 0.08, C.trim);
    beam(g, sx * kx, ky - 0.02, 0, ry - 0.02, FRONT + over + 0.03, 0.16, 0.08, C.trim);
  }
  ridge(g, 0, ry + 0.1, D2 + 0.06, ROOF.slate, zc);
  // White trim: corner boards and the band at the eaves.
  for (const sx of [-1, 1]) add(g, rbox(0.2, H, 0.1, 0.04), C.trim, sx * (W / 2 - 0.08), H / 2, FRONT + 0.03);
  add(g, rbox(W, 0.16, 0.09, 0.04), C.trim, 0, H, FRONT + 0.03);
  // Double doors: red leaves in a white frame, a white X on each.
  const dw = 1.22;
  const dh = 2.15;
  for (const sx of [-1, 1]) {
    const cx = sx * (dw / 2 + 0.02);
    add(g, box(dw, dh, 0.05), shade(C.barnRed, 0.92), cx, dh / 2 + 0.05, FRONT + 0.04);
    for (const [w, h, x, y] of [[dw, 0.12, 0, 0.11], [dw, 0.12, 0, dh - 0.01], [0.12, dh, -dw / 2 + 0.06, dh / 2 + 0.05], [0.12, dh, dw / 2 - 0.06, dh / 2 + 0.05]])
      add(g, box(w, h, 0.07), C.trim, cx + x, y, FRONT + 0.07);
    beam(g, cx - dw / 2 + 0.1, 0.2, cx + dw / 2 - 0.1, dh - 0.08, FRONT + 0.08, 0.1, 0.05, C.trim);
    beam(g, cx - dw / 2 + 0.1, dh - 0.08, cx + dw / 2 - 0.1, 0.2, FRONT + 0.08, 0.1, 0.05, C.trim);
  }
  // The hayloft: an open door full of hay, a hoist beam over it.
  const hy = H + 0.72;
  add(g, rbox(1.25, 1.0, 0.08, 0.04), C.trim, 0, hy, FRONT + 0.04);
  add(g, box(1.02, 0.8, 0.06), C.interior, 0, hy, FRONT + 0.06);
  add(g, rbox(0.95, 0.42, 0.5, 0.12), C.hay, 0, hy - 0.18, FRONT + 0.1);
  add(g, rbox(0.55, 0.32, 0.45, 0.1), shade(C.hay, 0.94), 0.12, hy + 0.15, FRONT + 0.05);
  for (let i = 0; i < 6; i++) beam(g, -0.4 + i * 0.16, hy - 0.38, -0.45 + i * 0.17, hy - 0.62 - (i % 3) * 0.05, FRONT + 0.32, 0.03, 0.03, shade(C.hay, 0.9));
  add(g, rbox(0.16, 0.16, 0.85, 0.04), C.woodDark, 0, ry - 0.25, FRONT + 0.3);
  const pulley = new THREE.TorusGeometry(0.1, 0.03, 6, 12);
  add(g, pulley, C.iron, 0, ry - 0.42, FRONT + 0.62);
  add(g, cyl(0.015, 0.015, 0.7, 4), 0xd8c08a, 0.1, ry - 0.8, FRONT + 0.62);
  // A cupola on the ridge with a little vane.
  add(g, box(0.75, 0.6, 0.75), C.trim, 0, ry + 0.4, zc - 0.3);
  for (const sx of [-1, 1]) add(g, box(0.05, 0.36, 0.77), C.barnRed, sx * 0.22, ry + 0.42, zc - 0.3);
  const cap = new THREE.ConeGeometry(0.66, 0.5, 4);
  cap.rotateY(Math.PI / 4);
  add(g, cap, ROOF.slate, 0, ry + 0.95, zc - 0.3);
  add(g, cyl(0.025, 0.025, 0.6, 5), C.iron, 0, ry + 1.45, zc - 0.3);
  add(g, box(0.5, 0.06, 0.04), C.iron, 0.05, ry + 1.62, zc - 0.3);
  add(g, new THREE.ConeGeometry(0.08, 0.16, 4), C.iron, 0.34, ry + 1.62, zc - 0.3).rotation.z = -Math.PI / 2;
  const s = woodSign([sign], 3.1, 0.58);
  s.position.set(0, H + 0.02, FRONT + 0.16);
  s.rotation.x = -0.16;
  g.add(s);
  return g;
}

/** A cog wheel facing +z, radius r (the Workshop's emblem). */
function cog(parent: THREE.Object3D, x: number, y: number, z: number, r: number): void {
  const disc = cyl(r, r, 0.12, 24);
  disc.rotateX(Math.PI / 2);
  add(parent, disc, 0x9aa1a8, x, y, z);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add(parent, rbox(r * 0.34, r * 0.3, 0.12, 0.03), 0x9aa1a8, x + Math.cos(a) * r, y + Math.sin(a) * r, z).rotation.z = a;
  }
  const hub = cyl(r * 0.4, r * 0.4, 0.16, 16);
  hub.rotateX(Math.PI / 2);
  add(parent, hub, 0x6c737b, x, y, z + 0.02);
  const pin = cyl(r * 0.16, r * 0.16, 0.2, 10);
  pin.rotateX(Math.PI / 2);
  add(parent, pin, C.brass, x, y, z + 0.04);
}

/** Workshop (Upgrades): warm plank walls, green shingles, a slid-open door, a tool board, a cog on the gable. */
export function workshop(sign: string): THREE.Group {
  const g = new THREE.Group();
  const W = 5.5;
  const D = 3.9;
  const H = 2.9;
  const zc = FRONT - D / 2;
  const base = 0.32;
  footing(g, W, D, base, FRONT, 23);
  add(g, box(W, H - base, D), C.wood, 0, base + (H - base) / 2, zc);
  boards(g, -W / 2, W / 2, base, H, FRONT, C.wood, { horizontal: true, size: 0.36, seed: 13 });
  for (const sx of [-1, 1]) add(g, rbox(0.22, H - base + 0.05, 0.16, 0.04), C.woodDark, sx * (W / 2 - 0.06), base + (H - base) / 2, FRONT + 0.08);
  const rise = 1.8;
  for (const z of [FRONT, FRONT - D + 0.14]) gable(g, W, rise, H, z, shade(C.wood, 0.92));
  boards(g, -1.6, 1.6, H, H + 0.3, FRONT, shade(C.wood, 0.92), { horizontal: true, size: 0.3, seed: 15 });
  gableRoof(g, { w: W, d: D, y: H, rise, color: ROOF.green, zc, trim: C.woodDark, seed: 33 });
  // The door, slid open on its rail: dark inside, a workbench and a lamp glow in there.
  const dx = -0.85;
  add(g, box(1.9, 2.15, 0.06), C.interior, dx, base + 1.075, FRONT + 0.1);
  add(g, box(1.6, 0.12, 0.3), C.woodLight, dx, base + 0.8, FRONT + 0.05);
  add(g, box(0.24, 0.4, 0.04), 0xffe2a0, dx + 0.5, base + 1.6, FRONT + 0.12, { emissive: 0x8a5a20 });
  add(g, rbox(2.3, 0.14, 0.14, 0.04), C.iron, dx - 0.2, base + 2.32, FRONT + 0.16);
  boards(g, dx - 2.0, dx - 0.95, base + 0.02, base + 2.22, FRONT + 0.14, 0x8a5a32, { size: 0.35, t: 0.06, seed: 17 });
  add(g, rbox(1.1, 2.24, 0.04, 0.03), shade(0x8a5a32, 0.8), dx - 1.47, base + 1.12, FRONT + 0.14);
  // A tool board right of the door: saw, hammer, wrench.
  const tx = 1.62;
  const ty = 1.7;
  add(g, rbox(1.25, 1.05, 0.06, 0.04), C.woodLight, tx, ty, FRONT + 0.1);
  const saw = new THREE.Shape();
  saw.moveTo(0, 0);
  saw.lineTo(0.62, 0.06);
  saw.lineTo(0.62, 0.2);
  saw.lineTo(0, 0.2);
  saw.closePath();
  add(g, new THREE.ExtrudeGeometry(saw, { depth: 0.03, bevelEnabled: false }), 0xc8ced4, tx - 0.5, ty + 0.18, FRONT + 0.13);
  add(g, rbox(0.2, 0.15, 0.05, 0.03), 0xb0502e, tx - 0.6, ty + 0.28, FRONT + 0.14);
  add(g, box(0.06, 0.42, 0.04), 0x8a5a32, tx + 0.35, ty - 0.12, FRONT + 0.14);
  add(g, rbox(0.26, 0.11, 0.06, 0.03), 0x6c737b, tx + 0.35, ty + 0.12, FRONT + 0.15);
  add(g, box(0.06, 0.48, 0.04), 0x8a939c, tx - 0.12, ty - 0.15, FRONT + 0.14);
  add(g, new THREE.TorusGeometry(0.07, 0.03, 6, 10, Math.PI * 1.5), 0x8a939c, tx - 0.12, ty + 0.13, FRONT + 0.14);
  cog(g, 0, H + 1.02, FRONT + 0.08, 0.4);
  // A stovepipe on the left slope.
  add(g, cyl(0.13, 0.13, 1.3, 12), C.iron, -1.4, H + 1.05, zc - 0.5);
  add(g, cyl(0.2, 0.2, 0.1, 12), C.iron, -1.4, H + 1.72, zc - 0.5);
  const s = woodSign([sign], 3.0, 0.66, { icon: cogIcon });
  s.position.set(0, H + 0.28, FRONT + 0.2);
  s.rotation.x = -0.22;
  g.add(s);
  return g;
}

/** A shallow crate of produce for a market counter: slats and a heap of `n` round things. */
function produceCrate(parent: THREE.Object3D, x: number, y: number, z: number, color: number, size: number, leaf = 0x4f9a3a): void {
  add(parent, box(0.74, 0.28, 0.5), C.woodLight, x, y + 0.14, z);
  add(parent, box(0.76, 0.06, 0.52), shade(C.woodLight, 0.82), x, y + 0.2, z);
  const r = rng(Math.round(x * 100 + color));
  const nx = Math.max(2, Math.floor(0.66 / (size * 2)));
  const nz = Math.max(1, Math.floor(0.44 / (size * 2)));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const px = x + (i - (nx - 1) / 2) * size * 2.05;
      const pz = z + (j - (nz - 1) / 2) * size * 2.05;
      const py = y + 0.28 + size * 0.7 + r() * 0.03;
      add(parent, new THREE.SphereGeometry(size, 12, 9), shade(color, 0.92 + r() * 0.16), px, py, pz);
      if (leaf) add(parent, new THREE.ConeGeometry(size * 0.3, size * 0.4, 5), leaf, px, py + size * 0.9, pz);
    }
  if (nx * nz > 2) add(parent, new THREE.SphereGeometry(size, 12, 9), color, x, y + 0.28 + size * 2.1, z);
}

/**
 * The Market: a cream hall with a terracotta roof, an open counter under a red-and-white awning heaped with crates of
 * produce, red paper lanterns, and side doors for the belts (SalesStand runs them at z −2.3).
 */
export function marketHall(sign: string): THREE.Group {
  const g = new THREE.Group();
  const W = 5.6;
  const D = 3.6;
  const H = 3.0;
  const hf = 0.05;
  const zc = hf - D / 2;
  footing(g, W, D, 0.3, hf, 25);
  add(g, box(W, H - 0.3, D), C.plaster, 0, 0.3 + (H - 0.3) / 2, zc);
  for (const sx of [-1, 1]) add(g, rbox(0.22, H - 0.3, 0.16, 0.04), C.woodDark, sx * (W / 2 - 0.06), 0.3 + (H - 0.3) / 2, hf + 0.05);
  add(g, rbox(W + 0.12, 0.2, 0.18, 0.05), C.woodDark, 0, H - 0.05, hf + 0.05);
  const rise = 1.7;
  for (const z of [hf, hf - D + 0.14]) gable(g, W, rise, H, z, C.plaster);
  for (const sx of [-1, 1]) beam(g, sx * 1.6, H + 0.06, 0, H + rise * 0.62, hf + 0.03, 0.12, 0.1, C.woodDark);
  gableRoof(g, { w: W, d: D, y: H, rise, color: ROOF.terracotta, zc, trim: C.woodDark, seed: 35 });
  // The open counter: dark inside with shelves of jars, the counter in front with produce.
  add(g, box(4.3, 1.45, 0.06), C.interior, 0, 1.75, hf + 0.04);
  for (const y of [1.45, 1.95]) {
    add(g, box(4.1, 0.06, 0.14), C.woodLight, 0, y, hf + 0.1);
    for (let i = 0; i < 9; i++) add(g, cyl(0.07, 0.07, 0.2, 8), [0xe8a23a, 0xd8433a, 0x8fc04a][(i + Math.round(y * 2)) % 3], -1.8 + i * 0.45, y + 0.13, hf + 0.12);
  }
  add(g, box(4.7, 0.9, 0.62), C.wood, 0, 0.45, hf + 0.31);
  boards(g, -2.35, 2.35, 0.02, 0.88, hf + 0.62, C.wood, { horizontal: true, size: 0.3, t: 0.04, seed: 19 });
  add(g, rbox(4.85, 0.1, 0.72, 0.03), C.woodDark, 0, 0.93, hf + 0.31);
  const crops: [number, number, number][] = [
    [0xf0862a, 0.13, 0x5a7a2a],
    [0x7cc24a, 0.15, 0],
    [0xe23b30, 0.1, 0x4f9a3a],
    [0xf4e9d4, 0.1, 0x8fbf4a],
    [0xffcc33, 0.1, 0x4f9a3a],
    [0x8a4fb8, 0.11, 0x4f9a3a],
  ];
  crops.forEach(([c, s, leaf], i) => produceCrate(g, -1.95 + i * 0.78, 0.98, hf + 0.33, c, s, leaf));
  // Striped awning sloping out over the counter, a scalloped valance, brackets.
  const n = 8;
  const aw = W + 0.2;
  const L = 1.5;
  const ang = Math.atan2(0.55, 1.35);
  for (let i = 0; i < n; i++) {
    const x = -aw / 2 + (aw / n) * (i + 0.5);
    const col = i % 2 ? 0xfff4e0 : 0xd8433a;
    const slat = add(g, box(aw / n + 0.005, 0.07, L), col, x, 2.62, hf + 0.68);
    slat.rotation.x = ang;
    const val = add(g, rbox(aw / n - 0.02, 0.32, 0.05, 0.1), col, x, 2.2, hf + 1.36);
    val.rotation.x = ang * 0.3;
  }
  for (const sx of [-1, 1]) {
    const br = add(g, rbox(0.1, 0.1, 1.3, 0.03), C.woodDark, sx * (W / 2 - 0.12), 2.12, hf + 0.62);
    br.rotation.x = -0.5;
  }
  // Red paper lanterns under the awning's edge.
  for (const x of [-1.9, 0, 1.9]) {
    add(g, cyl(0.012, 0.012, 0.3, 4), C.iron, x, 2.15, hf + 1.25);
    const lan = new THREE.SphereGeometry(0.2, 12, 9);
    lan.scale(1, 1.15, 1);
    add(g, lan, 0xe8402f, x, 1.82, hf + 1.25, { emissive: 0x5a1408 });
    add(g, cyl(0.1, 0.1, 0.05, 8), 0x2c2420, x, 2.05, hf + 1.25);
    add(g, cyl(0.1, 0.1, 0.05, 8), 0x2c2420, x, 1.58, hf + 1.25);
  }
  // Side doors (the belts go in at z −2.3).
  for (const sx of [-1, 1]) {
    add(g, box(0.06, 1.4, 1.2), C.interior, sx * (W / 2 + 0.01), 0.3 + 0.7, -2.3);
    add(g, rbox(0.08, 1.55, 1.38, 0.03), C.woodDark, sx * (W / 2 - 0.01), 0.3 + 0.76, -2.3);
  }
  const s = woodSign([sign], 3.0, 0.7);
  s.position.set(0, H + 0.4, hf + 0.2);
  s.rotation.x = -0.22;
  g.add(s);
  return g;
}
