import * as THREE from "three";
import { farmLook, type FarmLook } from "../farm";

/**
 * What stands on a farm cell (farm.ts `FarmLook`): a rice patch in paddy water, a tree of its species, a boulder with
 * an ore vein or crystals, a half-buried treasure chest. Procedural, one merged geometry per (key, variant) with the
 * colours in a `color` vertex attribute and smooth normals (a bright, soft cartoon; the user's other game is
 * flat-shaded low-poly and this one must not look like it). Crystals, nuggets and cut gems keep their facets.
 *
 * Origin at the cell's ground centre, +y up. Rice, trunks and rocks stay inside ±0.47 cell (neighbours touch),
 * canopies may overhang to ±0.6 cell. Heights are in world units whatever the cell size.
 *
 * The geometry kit at the top (`Kit`, `lathe`, `blob`, `tube`, `ribbon`, paints) is shared with itemGeo.ts.
 */

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/* ---------------------------------------------------------------- random */

export type Rnd = () => number;

/** Seeded random in [0, 1) (mulberry32). */
export function rng(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashOf(s: string, n = 0): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* ---------------------------------------------------------------- colour */

export type ColorLike = number | THREE.Color;
export const toC = (c: ColorLike) => (typeof c === "number" ? new THREE.Color(c) : c.clone());
/** `a` toward `b` by t (in the linear working space). */
export const mixC = (a: ColorLike, b: ColorLike, t: number) => toC(a).lerp(toC(b), t);
/** Lighter (k > 1) or darker (k < 1). */
export const scaleC = (a: ColorLike, k: number) => toC(a).multiplyScalar(k);
/** Toward white by t. */
export const tintC = (a: ColorLike, t: number) => toC(a).lerp(new THREE.Color(1, 1, 1), t);

/** Hue / saturation / lightness moved (in sRGB, so the steps look even). */
export function shiftC(c: ColorLike, dh: number, ds: number, dl: number): THREE.Color {
  const o = toC(c);
  const h = { h: 0, s: 0, l: 0 };
  o.getHSL(h, THREE.SRGBColorSpace);
  o.setHSL((h.h + dh + 1) % 1, clamp01(h.s + ds), clamp01(h.l + dl), THREE.SRGBColorSpace);
  return o;
}

/** Hue moved toward `to` (the short way round) by t. */
function hueToward(h: number, to: number, t: number): number {
  let d = to - h;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return (h + d * t + 1) % 1;
}

/** Warmer and lighter (sunlit): the cartoon way, never toward grey. */
export function sunlit(c: ColorLike, t: number): THREE.Color {
  const o = toC(c);
  const h = { h: 0, s: 0, l: 0 };
  o.getHSL(h, THREE.SRGBColorSpace);
  o.setHSL(hueToward(h.h, 0.14, 0.12 * t), clamp01(h.s + 0.04 * t), clamp01(h.l + 0.13 * t), THREE.SRGBColorSpace);
  return o;
}

/** Cooler and deeper (in shade). */
export function shaded(c: ColorLike, t: number): THREE.Color {
  const o = toC(c);
  const h = { h: 0, s: 0, l: 0 };
  o.getHSL(h, THREE.SRGBColorSpace);
  const cool = h.h > 0.15 && h.h < 0.7 ? 0.5 : 0.93;
  o.setHSL(hueToward(h.h, cool, 0.08 * t), clamp01(h.s + 0.08 * t), clamp01(h.l - 0.16 * t), THREE.SRGBColorSpace);
  return o;
}

/** A vertex colour from the vertex's position and normal (both in the model's space). */
export type Paint = (p: V3, n: V3, out: THREE.Color) => void;

/** The light baked into the vertex colours: lighter on faces turned up, darker underneath (the sun does the rest). */
export const lightOf = (n: V3) => 0.94 + 0.14 * Math.max(0, n.y) - 0.2 * Math.max(0, -n.y);

/** From `low` (at y0 and below) to `high` (at y1 and above), lit from above. */
export function grad(low: ColorLike, high: ColorLike = low, y0 = 0, y1 = 1, bright = 1): Paint {
  const a = toC(low);
  const b = toC(high);
  return (p, n, out) => {
    out.copy(a).lerp(b, clamp01((p.y - y0) / (y1 - y0 || 1)));
    out.multiplyScalar(lightOf(n) * bright);
  };
}

/** By the way a face turns: `under` facing down, `over` facing up (a crown lit from the sky). */
export function dome(under: ColorLike, over: ColorLike, bright = 1, bias = 0): Paint {
  const a = toC(under);
  const b = toC(over);
  return (_p, n, out) => {
    const t = clamp01((n.y + 1) / 2 + bias);
    out.copy(a).lerp(b, t * t * (3 - 2 * t)).multiplyScalar(bright);
  };
}

/** Leaves and blossom: deep and cool underneath, warm and light on top, a little dappled per vertex. */
export function leafy(c: ColorLike, r: Rnd, bright = 1, under = 1, over = 1): Paint {
  const lo = shaded(c, 1.3 * under);
  const mid = toC(c);
  const hi = sunlit(c, 1.1 * over);
  return (_p, n, out) => {
    const t = clamp01((n.y + 1) / 2);
    if (t < 0.5) out.copy(lo).lerp(mid, t * 2);
    else out.copy(mid).lerp(hi, (t - 0.5) * 2);
    out.multiplyScalar((0.9 + r() * 0.2) * bright);
  };
}

/** One colour, lit from above. */
export const solid = (c: ColorLike, bright = 1): Paint => grad(c, c, 0, 1, bright);

/* ---------------------------------------------------------------- geometry kit */

/**
 * Collects parts into one indexed geometry with position, normal and color. Each part keeps its own normals
 * (smooth where its generator shares vertices, faceted with `flat`).
 */
export class Kit {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  add(g: THREE.BufferGeometry, paint: Paint, flat = false): this {
    let geo = g;
    for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal") geo.deleteAttribute(k);
    if (flat) {
      if (geo.index) geo = geo.toNonIndexed();
      geo.deleteAttribute("normal");
      geo.computeVertexNormals();
    } else if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    const n = geo.getAttribute("normal") as THREE.BufferAttribute;
    const base = this.pos.length / 3;
    const pv = V();
    const nv = V();
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      pv.fromBufferAttribute(p, i);
      nv.fromBufferAttribute(n, i).normalize();
      paint(pv, nv, c);
      this.pos.push(pv.x, pv.y, pv.z);
      this.nrm.push(nv.x, nv.y, nv.z);
      this.col.push(c.r, c.g, c.b);
    }
    const ix = geo.index;
    if (ix) for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }

  /** A double-sided sheet (leaves, fronds): the front as given, the back with its winding and normals turned. */
  addSheet(g: THREE.BufferGeometry, front: Paint, back: Paint = front): this {
    const b = g.clone();
    const ix = b.index!.array as Uint16Array | Uint32Array;
    const rev: number[] = [];
    for (let i = 0; i < ix.length; i += 3) rev.push(ix[i], ix[i + 2], ix[i + 1]);
    b.setIndex(rev);
    const n = b.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    this.add(g, front);
    return this.add(b, back);
  }

  get triangles(): number {
    return this.idx.length / 3;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** Move / turn / scale a geometry in place (returns it). */
export function place(g: THREE.BufferGeometry, at: V3, rot: THREE.Euler | null = null, scale: V3 | number = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), typeof scale === "number" ? V(scale, scale, scale) : scale);
  return g.applyMatrix4(m);
}

function indexed(pos: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Rings round the y axis from a profile of [radius, y] (bottom to top); radius 0 is a single pole vertex. No seam,
 * so normals are smooth all round. `warp` moves each vertex before the normals are worked out.
 */
export function lathe(profile: [number, number][], radial: number, warp?: (v: V3, ring: number, j: number) => void, phase = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const start: number[] = [];
  const pole: boolean[] = [];
  const v = V();
  profile.forEach(([r, y], ring) => {
    start.push(pos.length / 3);
    const isPole = r <= 1e-6;
    pole.push(isPole);
    for (let j = 0; j < (isPole ? 1 : radial); j++) {
      const a = phase + (j / radial) * Math.PI * 2;
      v.set(isPole ? 0 : r * Math.cos(a), y, isPole ? 0 : r * Math.sin(a));
      warp?.(v, ring, j);
      pos.push(v.x, v.y, v.z);
    }
  });
  for (let k = 0; k < profile.length - 1; k++) {
    const a0 = start[k];
    const b0 = start[k + 1];
    if (pole[k] && pole[k + 1]) continue;
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      if (pole[k]) idx.push(a0, b0 + j, b0 + j1);
      else if (pole[k + 1]) idx.push(a0 + j, b0, a0 + j1);
      else idx.push(a0 + j, b0 + j, a0 + j1, a0 + j1, b0 + j, b0 + j1);
    }
  }
  return indexed(pos, idx);
}

/** An ellipsoid (`radial` round, `rings` pole to pole); `warp` gets the unit-sphere point before it is scaled. */
export function blob(rx: number, ry: number, rz: number, radial: number, rings: number, warp?: (v: V3) => void, phase = 0): THREE.BufferGeometry {
  const prof: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const f = (Math.PI * i) / rings;
    prof.push([i === 0 || i === rings ? 0 : Math.sin(f), -Math.cos(f)]);
  }
  return lathe(prof, radial, (v) => {
    warp?.(v);
    v.set(v.x * rx, v.y * ry, v.z * rz);
  }, phase);
}

/** Rings along a path (parallel-transported frames); radius 0 makes a pole (a closed end or a point). */
export function tube(path: V3[], radii: number[], radial: number, warp?: (v: V3, ring: number, j: number) => void): THREE.BufferGeometry {
  const n = path.length;
  const T = path.map((_, i) => V().subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize());
  const N: V3[] = [];
  const t0 = T[0];
  N.push((Math.abs(t0.y) < 0.9 ? V().crossVectors(t0, V(0, 1, 0)) : V().crossVectors(t0, V(1, 0, 0))).normalize());
  for (let i = 1; i < n; i++) {
    const axis = V().crossVectors(T[i - 1], T[i]);
    const nn = N[i - 1].clone();
    if (axis.lengthSq() > 1e-10) {
      const ang = Math.acos(THREE.MathUtils.clamp(T[i - 1].dot(T[i]), -1, 1));
      nn.applyAxisAngle(axis.normalize(), ang);
    }
    nn.addScaledVector(T[i], -nn.dot(T[i])).normalize();
    N.push(nn);
  }
  const pos: number[] = [];
  const idx: number[] = [];
  const start: number[] = [];
  const pole: boolean[] = [];
  const v = V();
  for (let i = 0; i < n; i++) {
    start.push(pos.length / 3);
    const isPole = radii[i] <= 1e-6;
    pole.push(isPole);
    const B = V().crossVectors(N[i], T[i]);
    for (let j = 0; j < (isPole ? 1 : radial); j++) {
      const a = (j / radial) * Math.PI * 2;
      v.copy(path[i]);
      if (!isPole) v.addScaledVector(N[i], Math.cos(a) * radii[i]).addScaledVector(B, Math.sin(a) * radii[i]);
      warp?.(v, i, j);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let k = 0; k < n - 1; k++) {
    const a0 = start[k];
    const b0 = start[k + 1];
    if (pole[k] && pole[k + 1]) continue;
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      if (pole[k]) idx.push(a0, b0 + j, b0 + j1);
      else if (pole[k + 1]) idx.push(a0 + j, b0, a0 + j1);
      else idx.push(a0 + j, b0 + j, a0 + j1, a0 + j1, b0 + j, b0 + j1);
    }
  }
  return indexed(pos, idx);
}

/**
 * A leaf or frond: a strip along `path`, half-width `w[i]` (0 = a point), its face turned toward `up`, the middle
 * raised by `fold` x the width (a midrib). One side only: add it with `Kit.addSheet`.
 */
export function ribbon(path: V3[], w: number[], up: V3, fold = 0.25): THREE.BufferGeometry {
  const n = path.length;
  const pos: number[] = [];
  const idx: number[] = [];
  const rows: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = V().subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize();
    const s = V().crossVectors(t, up).normalize();
    const f = V().crossVectors(s, t).normalize();
    const p = path[i];
    const k = pos.length / 3;
    if (w[i] <= 1e-6) {
      pos.push(p.x, p.y, p.z);
      rows.push([k, k, k]);
    } else {
      const l = p.clone().addScaledVector(s, -w[i]);
      const m = p.clone().addScaledVector(f, fold * w[i]);
      const r = p.clone().addScaledVector(s, w[i]);
      pos.push(l.x, l.y, l.z, m.x, m.y, m.z, r.x, r.y, r.z);
      rows.push([k, k + 1, k + 2]);
    }
  }
  const tri = (a: number, b: number, c: number) => {
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  };
  for (let i = 0; i < n - 1; i++) {
    const [l0, m0, r0] = rows[i];
    const [l1, m1, r1] = rows[i + 1];
    tri(l0, m0, l1);
    tri(l1, m0, m1);
    tri(m0, r0, m1);
    tri(m1, r0, r1);
  }
  return indexed(pos, idx);
}

/** A point on a quadratic curve from a through control c to b. */
export const bez = (a: V3, c: V3, b: V3, t: number) =>
  V()
    .addScaledVector(a, (1 - t) * (1 - t))
    .addScaledVector(c, 2 * (1 - t) * t)
    .addScaledVector(b, t * t);

/** Smooth low-frequency wobble in about [-1, 1] for lumps on a unit sphere. */
export function wobble(r: Rnd, freq = 2.6): (v: V3) => number {
  const s = [r() * 6.3, r() * 6.3, r() * 6.3, r() * 6.3];
  const f = [freq * (0.8 + r() * 0.4), freq * (0.8 + r() * 0.4), freq * (0.8 + r() * 0.4)];
  return (v) => 0.5 * (Math.sin(v.x * f[0] + s[0]) * Math.sin(v.y * f[1] + s[1]) + Math.sin(v.z * f[2] + s[2]) * Math.sin(v.x * f[1] + v.y * f[0] + s[3]));
}

/* ---------------------------------------------------------------- shared material */

/** Shared by every node (instance colours multiply it, so it stays white). */
export const nodeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

/* ---------------------------------------------------------------- rice */

const BASE_CELL = 2.5;
/** Rice, trunks and rocks stay inside this (x and z, at a 2.5 cell). */
const INNER = 0.47 * BASE_CELL;
/** Canopies may reach this far. */
const OUTER = 0.6 * BASE_CELL;

function rice(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  // Paddy water: a flat square with a lighter middle (the sky in it).
  const h = 1.12;
  const y = 0.02;
  const water = indexed([-h, y, -h, h, y, -h, h, y, h, -h, y, h, 0, y, 0], [4, 1, 0, 4, 2, 1, 4, 3, 2, 4, 0, 3]);
  const edge = toC(0x7cc7bd);
  const mid = toC(0xc4f0ea);
  k.add(water, (p, _n, out) => out.copy(edge).lerp(mid, 1 - Math.max(Math.abs(p.x), Math.abs(p.z)) / h));
  // Clumps in rows (planted by hand): green stalks fanning out, gold heads drooping all round.
  const stalk = mixC(L.main, 0x5f9a2e, 0.55);
  const gold = toC(L.crown);
  const deep = mixC(L.crown, L.main, 0.45);
  const top = tintC(L.crown, 0.3);
  const step = 0.71;
  const offset = v === 1 ? 0.12 : 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const cx = (i - 1) * step + (r() - 0.5) * 0.06 + (j % 2 ? offset : -offset);
      const cz = (j - 1) * step + (r() - 0.5) * 0.06;
      const H = (0.92 + r() * 0.16) * (v === 2 ? 0.94 : 1);
      const R = 0.4 + r() * 0.03;
      const dir = r() * Math.PI * 2;
      const lean = V(Math.cos(dir), 0, Math.sin(dir)).multiplyScalar(0.07);
      const g = lathe([[0.07, 0], [R, 0.6 * H], [0, H]], 8, (p, ring, jj) => {
        if (ring === 1) {
          const tip = jj % 2 === 0;
          const rr = tip ? R : R * 0.62;
          const a = Math.atan2(p.z, p.x);
          p.set(Math.cos(a) * rr, tip ? 0.5 * H : 0.8 * H, Math.sin(a) * rr);
        }
        if (ring === 2) p.addScaledVector(lean, 1.4);
        else if (ring === 1) p.addScaledVector(lean, 0.6);
      }, r() * Math.PI);
      place(g, V(cx, 0, cz));
      k.add(g, (p, n, out) => {
        const t = clamp01((p.y - 0.12) / (0.5 * H));
        out.copy(stalk).lerp(gold, t * t);
        if (p.y > 0.62 * H) out.copy(deep).lerp(top, clamp01((p.y - 0.62 * H) / (0.35 * H)));
        out.multiplyScalar(lightOf(n));
      });
    }
}

/* ---------------------------------------------------------------- trees */

/** A trunk or branch from a to b, bowed by `bow`, radii r0 -> r1, the foot flared by `flare`. */
function limb(a: V3, b: V3, r0: number, r1: number, radial: number, segs: number, bow = V(), flare = 0, warp?: (v: V3, ring: number, j: number) => void): THREE.BufferGeometry {
  const c = V().addVectors(a, b).multiplyScalar(0.5).add(bow);
  const path: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    path.push(bez(a, c, b, t));
    radii.push(THREE.MathUtils.lerp(r0, r1, t) * (1 + flare * Math.pow(1 - t, 3)));
  }
  return tube(path, radii, radial, warp);
}

/** A lumpy crown blob, darker underneath and lighter on top. */
function puff(k: Kit, r: Rnd, at: V3, rx: number, ry: number, rz: number, colour: ColorLike, opts: { radial?: number; rings?: number; lump?: number; freq?: number; under?: number; over?: number } = {}): void {
  const wob = wobble(r, opts.freq ?? 3.1);
  const lump = opts.lump ?? 0.1;
  const g = blob(rx, ry, rz, opts.radial ?? 9, opts.rings ?? 6, (p) => p.multiplyScalar(1 + lump * wob(p)), r() * 6);
  place(g, at);
  k.add(g, dome(scaleC(colour, opts.under ?? 0.55), tintC(colour, opts.over ?? 0.22)));
}

/** Points spread over the visible part of an ellipsoid crown (not underneath). */
function onCrown(r: Rnd, c: V3, rx: number, ry: number, rz: number, count: number, yMin = -0.35, sink = 0.92): V3[] {
  const out: V3[] = [];
  const phase = r() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2 + (r() - 0.5) * 0.7;
    const y = THREE.MathUtils.lerp(yMin, 0.75, (i * 0.618 + r() * 0.3) % 1);
    const s = Math.sqrt(1 - y * y);
    out.push(V(c.x + Math.cos(a) * s * rx * sink, c.y + y * ry * sink, c.z + Math.sin(a) * s * rz * sink));
  }
  return out;
}

const BARK = (L: FarmLook) => grad(scaleC(L.main, 0.7), L.main, 0, 1.6);

function roundTree(k: Kit, L: FarmLook, r: Rnd, v: number, fruitTree: boolean): void {
  const mango = L.species === "mango";
  const lean = V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3);
  const H = fruitTree ? 1.25 : 1.6;
  const top = V(lean.x, H, lean.z);
  k.add(limb(V(), top, 0.24, 0.15, 7, 3, V(0.08, 0, 0), 0.9), BARK(L));
  // Two short branches into the crown.
  for (const s of [-1, 1]) k.add(limb(top.clone().setY(H - 0.25), V(top.x + s * 0.55, H + 0.55, top.z + (r() - 0.5) * 0.4), 0.11, 0.06, 5, 1), BARK(L));
  const cy = H + (fruitTree ? 1.0 : 1.25);
  const rx = (fruitTree ? 1.12 : 1.2) * (mango ? 1.08 : 1) * (v === 2 ? 0.94 : 1);
  const ry = (fruitTree ? 0.95 : 1.05) * (mango ? 0.92 : 1);
  const c = V(lean.x, cy, lean.z);
  puff(k, r, c, rx, ry, rx * 0.96, L.crown, { radial: 10, rings: 7, lump: 0.1 });
  // A second, smaller blob on top for a rounder silhouette.
  const c2 = V(lean.x + (r() - 0.5) * 0.4, cy + ry * 0.62, lean.z + (r() - 0.5) * 0.4);
  puff(k, r, c2, rx * 0.62, ry * 0.55, rx * 0.6, L.crown, { radial: 8, rings: 6, lump: 0.12, under: 0.75 });
  if (!fruitTree || L.extra === undefined) return;
  const fruitC = L.extra;
  const n = mango ? 7 : 8;
  for (const p of onCrown(r, c, rx, ry, rx * 0.96, n, -0.45, 0.97)) {
    const s = mango ? 0.15 : 0.17;
    const g = blob(s * (mango ? 0.85 : 1), s * (mango ? 1.3 : 1), s * (mango ? 0.85 : 1), 6, 4);
    place(g, p, new THREE.Euler((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5));
    // Mangoes blush red on top; oranges are lighter on top.
    k.add(g, dome(scaleC(fruitC, 0.75), mango ? mixC(fruitC, 0xff5a3a, 0.45) : tintC(fruitC, 0.25), 1.08));
  }
}

function pine(k: Kit, L: FarmLook, r: Rnd, v: number, snow: boolean): void {
  const tiers = v === 2 ? 3 : 4;
  const H = (snow ? 4.0 : 4.3) * (v === 1 ? 0.92 : 1);
  k.add(limb(V(), V(0, 0.9, 0), 0.22, 0.16, 7, 1, V(), 0.6), BARK(L));
  const green = toC(L.crown);
  const white = toC(L.extra ?? 0xffffff);
  const base = 0.55;
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const y0 = base + f * (H - base - 0.9) * 1.0;
    const R = THREE.MathUtils.lerp(1.42, 0.62, f) * (v === 2 ? 1.05 : 1);
    const h = THREE.MathUtils.lerp(1.55, 1.15, f) + (t === tiers - 1 ? 0.35 : 0);
    const radial = 12;
    const ph = r() * Math.PI;
    const wob = wobble(r, 3.5);
    // Bottom (a shallow cone under the skirt) -> wavy rim -> shoulder -> top.
    const g = lathe(
      [[0, y0 + 0.28], [R, y0], [R * 0.78, y0 + h * 0.2], [R * 0.4, y0 + h * 0.58], [0, y0 + h]],
      radial,
      (p, ring, j) => {
        if (ring === 1) {
          // Drooping branch tips round the rim.
          const tip = j % 2 === 0;
          p.y -= tip ? 0.12 : -0.04;
          p.x *= tip ? 1.04 : 0.9;
          p.z *= tip ? 1.04 : 0.9;
        }
        if (ring >= 1) p.multiplyScalar(1).add(V(0, 0.04 * wob(p), 0));
      },
      ph,
    );
    const dark = scaleC(green, 0.55);
    const light = tintC(green, 0.18);
    if (!snow) {
      k.add(g, (p, n, out) => {
        out.copy(dark).lerp(light, clamp01((p.y - y0) / h + 0.15 * n.y));
        out.multiplyScalar(lightOf(n));
      });
      continue;
    }
    // Snow on the upper half of each tier, its edge dripping down between the branch tips.
    k.add(g, (p, n, out) => {
      const a = Math.atan2(p.z, p.x) - ph;
      const lip = y0 + h * (0.4 + 0.12 * Math.cos(a * radial * 0.5));
      if (p.y > lip + 0.02 && n.y > 0.1) out.copy(white).multiplyScalar(0.9 + 0.12 * n.y);
      else out.copy(dark).lerp(light, clamp01((p.y - y0) / h)).multiplyScalar(lightOf(n));
    });
    // A soft snow pad on the shoulder of each tier.
    const pad = blob(R * 0.55, 0.16, R * 0.55, 9, 4, (p) => p.multiplyScalar(1 + 0.12 * wob(p)), ph);
    place(pad, V(0, y0 + h * 0.5, 0));
    k.add(pad, dome(scaleC(white, 0.78), white, 1.02));
  }
}

function maple(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const H = 1.7;
  const top = V((r() - 0.5) * 0.2, H, (r() - 0.5) * 0.2);
  k.add(limb(V(), top, 0.27, 0.16, 7, 3, V(0.1, 0, -0.05), 0.9), BARK(L));
  for (const s of [-1, 1]) k.add(limb(top.clone().setY(H - 0.3), V(s * 0.75, H + 0.75, (r() - 0.5) * 0.5), 0.12, 0.06, 5, 1), BARK(L));
  // Autumn: one blob more orange, one deeper red.
  const red = toC(L.crown);
  const orange = mixC(L.crown, 0xffa040, 0.55);
  const deep = mixC(L.crown, 0xa0201a, 0.35);
  const sw = v === 1 ? -1 : 1;
  puff(k, r, V(0, H + 1.15, 0), 1.15, 0.95, 1.1, red, { radial: 10, rings: 7, lump: 0.12 });
  puff(k, r, V(sw * 0.62, H + 1.55, 0.25), 0.72, 0.62, 0.7, orange, { radial: 8, rings: 6, lump: 0.12, under: 0.7 });
  puff(k, r, V(-sw * 0.55, H + 1.5, -0.35), 0.7, 0.6, 0.68, v === 2 ? orange : deep, { radial: 8, rings: 6, lump: 0.12, under: 0.7 });
}

function birch(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const white = toC(L.main);
  const markC = toC(0x2f2a28);
  const stems: [V3, V3, number][] = [[V(-0.12, 0, 0.05), V(-0.25, 3.0, 0.1), 0.15]];
  if (v !== 2) stems.push([V(0.2, 0, -0.08), V(0.55, 2.55, -0.2), 0.11]);
  for (const [a, b, rad] of stems) {
    k.add(limb(a, b, rad, rad * 0.65, 7, 4, V(0.06, 0, 0), 0.5), grad(scaleC(white, 0.85), white, 0, 2));
    // Dark marks: short dashes across the bark, laid just outside it.
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = 0.12 + (i / n) * 0.78 + r() * 0.05;
      const c = V().lerpVectors(a, b, t);
      const rr = THREE.MathUtils.lerp(rad, rad * 0.65, t) * 1.04;
      const a0 = r() * Math.PI * 2;
      const span = 0.9 + r() * 0.8;
      const path: V3[] = [];
      const w: number[] = [];
      for (let q = 0; q <= 3; q++) {
        const ang = a0 + (q / 3) * span;
        path.push(V(c.x + Math.cos(ang) * rr, c.y, c.z + Math.sin(ang) * rr));
        w.push(q === 0 || q === 3 ? 0 : 0.035 + r() * 0.02);
      }
      k.add(ribbon(path, w, V(0, 0, 0).set(Math.cos(a0 + span / 2), 0, Math.sin(a0 + span / 2)), 0), solid(markC));
    }
  }
  const leaf = toC(L.crown);
  const top = stems[0][1];
  puff(k, r, V(top.x, top.y + 0.55, top.z), 0.95, 0.85, 0.9, leaf, { radial: 9, rings: 6, lump: 0.14, under: 0.6 });
  puff(k, r, V(top.x + 0.7, top.y - 0.05, top.z + 0.2), 0.62, 0.55, 0.6, mixC(leaf, 0x6fae3a, 0.3), { radial: 8, rings: 5, lump: 0.14 });
  puff(k, r, V(top.x - 0.5, top.y + 0.1, top.z - 0.45), 0.58, 0.52, 0.56, tintC(leaf, 0.1), { radial: 8, rings: 5, lump: 0.14 });
}

function cherry(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const H = 1.45;
  const top = V(0.1, H, 0);
  k.add(limb(V(), top, 0.24, 0.14, 7, 3, V(-0.15, 0, 0.05), 1.0), BARK(L));
  const arms: V3[] = [V(-0.85, H + 0.85, 0.2), V(0.8, H + 0.8, -0.2), V(0.05, H + 1.0, 0.75)];
  for (const a of arms) k.add(limb(top, a, 0.1, 0.05, 5, 2, V(0, 0.15, 0)), BARK(L));
  const pink = toC(L.crown);
  const hot = mixC(L.crown, 0xff6fa8, 0.35);
  const pale = tintC(L.crown, 0.35);
  const sw = v === 1 ? -1 : 1;
  puff(k, r, V(0, H + 1.25, 0), 1.0, 0.8, 0.95, pink, { radial: 9, rings: 6, lump: 0.16, freq: 4.2, under: 0.62, over: 0.35 });
  puff(k, r, V(sw * -0.78, H + 1.0, 0.25), 0.62, 0.52, 0.6, hot, { radial: 8, rings: 5, lump: 0.16, freq: 4.2, under: 0.65 });
  puff(k, r, V(sw * 0.78, H + 1.05, -0.2), 0.62, 0.52, 0.6, pale, { radial: 8, rings: 5, lump: 0.16, freq: 4.2, under: 0.65 });
  puff(k, r, V(0.1, H + 1.85, 0.1), 0.6, 0.45, 0.58, pale, { radial: 8, rings: 5, lump: 0.16, freq: 4.2, under: 0.8 });
  // Fallen petals round the foot.
  const ring = lathe([[0, 0.015], [0.95, 0.012]], 9, (p, ri) => {
    if (ri === 1) p.multiplyScalar(0.85 + 0.25 * Math.sin(Math.atan2(p.z, p.x) * 3 + v));
  });
  k.add(ring, (_p, _n, out) => out.copy(tintC(L.crown, 0.15)));
}

function banyan(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const bark = BARK(L);
  // A fat trunk on buttress roots.
  const g = lathe(
    [[0.95, 0], [0.62, 0.35], [0.5, 1.0], [0.46, 1.9], [0.42, 2.6]],
    9,
    (p, ring, j) => {
      if (ring === 0) p.multiplyScalar(j % 2 ? 0.62 : 1.08);
      if (ring === 1) p.multiplyScalar(j % 2 ? 0.92 : 1.05);
      p.x += Math.sin(p.y * 1.7 + v) * 0.05;
    },
    r() * Math.PI,
  );
  k.add(g, bark);
  // Big limbs into the crown.
  const limbs = [V(-1.05, 3.25, 0.25), V(1.0, 3.2, -0.3)];
  for (const b of limbs) k.add(limb(V(0, 2.3, 0), b, 0.2, 0.1, 5, 2, V(0, 0.2, 0)), bark);
  const leaf = toC(L.crown);
  const H = 3.75;
  puff(k, r, V(0, H, 0), 1.2, 0.8, 1.15, leaf, { radial: 10, rings: 7, lump: 0.12, under: 0.5 });
  const side: [number, number][] = [[0.8, 0.35], [-0.85, 0.1], [0.05, -0.85]];
  side.forEach(([x, z], i) => puff(k, r, V(x, H - 0.25 + (i === 1 ? 0.15 : 0), z), 0.68, 0.52, 0.66, i === 1 ? mixC(leaf, 0x5c9a3a, 0.4) : leaf, { radial: 8, rings: 5, lump: 0.12, under: 0.55 }));
  // Aerial roots hanging from under the crown.
  const roots: [number, number][] = [[-1.0, 0.55], [1.05, -0.45], [0.75, 0.8], [-0.6, -0.95], [-1.15, -0.25]];
  for (const [x, z] of roots) {
    const top = V(x, H - 0.55, z);
    const foot = V(x * 0.92, 0, z * 0.92);
    k.add(limb(top, foot, 0.045, 0.07, 4, 1, V(), 0.6), grad(scaleC(L.main, 0.75), tintC(L.main, 0.1), 0, 3));
  }
}

function palm(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const sw = v === 1 ? -1 : 1;
  const lean = V(sw * 0.55, 0, 0.25 * (v === 2 ? -1 : 1));
  const top = V(lean.x * 1.4, 3.35 * (v === 2 ? 0.9 : 1), lean.z * 1.4);
  const path: V3[] = [];
  const radii: number[] = [];
  const segs = 8;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    path.push(bez(V(-lean.x * 0.3, 0, -lean.z * 0.3), V(-lean.x * 0.3, top.y * 0.55, -lean.z * 0.3), top, t));
    radii.push(THREE.MathUtils.lerp(0.22, 0.14, t) * (1 + 0.8 * Math.pow(1 - t, 4)));
  }
  const trunk = tube(path, radii, 6, (p, ring) => {
    // Ring bulges every segment.
    void p;
    void ring;
  });
  const lightBark = tintC(L.main, 0.12);
  const darkBark = scaleC(L.main, 0.72);
  k.add(trunk, (p, n, out) => {
    const s = 0.5 + 0.5 * Math.cos((p.y / top.y) * segs * Math.PI * 2);
    out.copy(darkBark).lerp(lightBark, s).multiplyScalar(lightOf(n));
  });
  // Coconuts under the fronds.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const g = blob(0.15, 0.17, 0.15, 6, 4);
    place(g, V(top.x + Math.cos(a) * 0.16, top.y - 0.12, top.z + Math.sin(a) * 0.16));
    k.add(g, dome(scaleC(0x6f9a2a, 0.7), 0xa8c84a));
  }
  // Fronds: long folded leaves arching out and down.
  const leaf = toC(L.crown);
  const n = 7;
  const ph = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.3;
    const len = 1.45 + r() * 0.2;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const lift = 0.45 + r() * 0.2;
    const pts: V3[] = [];
    const w: number[] = [];
    const m = 5;
    for (let q = 0; q <= m; q++) {
      const t = q / m;
      const p = top.clone().addScaledVector(dir, len * t).add(V(0, lift * Math.sin(t * Math.PI * 0.85) - 0.95 * t * t, 0));
      pts.push(p);
      w.push(q === 0 ? 0.02 : q === m ? 0 : 0.3 * Math.sin(t * Math.PI * 0.9 + 0.15));
    }
    const g = ribbon(pts, w, V(0, 1, 0), 0.3);
    k.addSheet(g, dome(scaleC(leaf, 0.6), tintC(leaf, 0.2)), dome(scaleC(leaf, 0.45), scaleC(leaf, 0.8)));
  }
}

function bamboo(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const culm = toC(L.main);
  const node = mixC(L.main, 0xc9b85a, 0.45);
  const leaf = toC(L.crown);
  const count = v === 2 ? 4 : 5;
  const spots: [number, number, number][] = [
    [-0.32, 0.05, 4.1],
    [0.22, -0.28, 3.8],
    [0.3, 0.3, 3.45],
    [-0.12, -0.45, 3.2],
    [-0.05, 0.48, 2.6],
  ];
  for (let c = 0; c < count; c++) {
    const [x, z, Hc] = spots[c];
    const H = Hc * (v === 1 ? 0.94 : 1) * (0.96 + r() * 0.08);
    const lean = V(x * 0.25 + (r() - 0.5) * 0.12, 0, z * 0.25 + (r() - 0.5) * 0.12);
    const rad = 0.1 + (c < 2 ? 0.015 : 0);
    const segs = 4;
    for (let s = 0; s < segs; s++) {
      const a = V(x + lean.x * (s / segs), (s / segs) * H, z + lean.z * (s / segs));
      const b = V(x + lean.x * ((s + 1) / segs), ((s + 1) / segs) * H - 0.02, z + lean.z * ((s + 1) / segs));
      // Each internode flares a little at its top: the node ring.
      const g = tube([a, V().lerpVectors(a, b, 0.85), b], [rad, rad, rad * 1.22], 6);
      const y0 = a.y;
      const y1 = b.y;
      k.add(g, (p, n, out) => {
        const t = clamp01((p.y - y0) / (y1 - y0));
        out.copy(culm).lerp(tintC(culm, 0.25), Math.sin(t * Math.PI) * 0.6);
        if (t > 0.9) out.copy(node);
        out.multiplyScalar(lightOf(n));
      });
    }
    // A fan of narrow leaves at the top, and a small one half way.
    const tip = V(x + lean.x, H, z + lean.z);
    const fans: [V3, number, number][] = [[tip, 5, 0.75]];
    if (c < 3) fans.push([V(x + lean.x * 0.6, H * 0.62, z + lean.z * 0.6), 3, 0.6]);
    for (const [at, nl, len0] of fans) {
      const ph = r() * Math.PI * 2;
      for (let q = 0; q < nl; q++) {
        const a = ph + (q / nl) * Math.PI * 2 + (r() - 0.5) * 0.4;
        const dir = V(Math.cos(a), 0, Math.sin(a));
        const len = len0 * (0.85 + r() * 0.3);
        const pts = [0, 0.5, 1].map((t) => at.clone().addScaledVector(dir, len * t).add(V(0, 0.18 * Math.sin(t * Math.PI) - 0.28 * t * t + 0.05, 0)));
        const g = ribbon(pts, [0, 0.075, 0], V(0, 1, 0), 0.35);
        k.addSheet(g, dome(scaleC(leaf, 0.62), tintC(leaf, 0.2)), dome(scaleC(leaf, 0.5), scaleC(leaf, 0.8)));
      }
    }
  }
}

function tree(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  switch (L.species) {
    case "bamboo":
      return bamboo(k, L, r, v);
    case "orange":
    case "mango":
      return roundTree(k, L, r, v, true);
    case "pine":
      return pine(k, L, r, v, false);
    case "snowpine":
      return pine(k, L, r, v, true);
    case "maple":
      return maple(k, L, r, v);
    case "birch":
      return birch(k, L, r, v);
    case "cherry":
      return cherry(k, L, r, v);
    case "banyan":
      return banyan(k, L, r, v);
    case "palm":
      return palm(k, L, r, v);
    default:
      return roundTree(k, L, r, v, false);
  }
}

/* ---------------------------------------------------------------- rocks */

/** A smooth boulder: a squashed, lumpy ellipsoid with a flat foot. */
export function boulder(r: Rnd, rx: number, ry: number, rz: number, radial = 11, rings = 8, lump = 0.12): THREE.BufferGeometry {
  const wob = wobble(r, 2.2);
  const wob2 = wobble(r, 4.4);
  return blob(rx, ry, rz, radial, rings, (p) => {
    p.multiplyScalar(1 + lump * wob(p) + lump * 0.4 * wob2(p));
    // Settle onto the ground: flatten what is under the middle.
    if (p.y < -0.45) p.y = -0.45 - (p.y + 0.45) * 0.35;
  }, r() * 6);
}

/** Grey stone: darker at the foot, lighter on top. */
const stone = (main: ColorLike, ry: number): Paint => {
  const a = scaleC(main, 0.62);
  const b = tintC(main, 0.18);
  return (p, n, out) => {
    out.copy(a).lerp(b, clamp01(p.y / (ry * 1.6)) * 0.6 + clamp01(n.y) * 0.4);
    out.multiplyScalar(0.92 + 0.12 * Math.max(0, n.y));
  };
};

/** Where to put things on a boulder: points on its upper surface (raycast down onto the geometry's bounds). */
function onBoulder(r: Rnd, c: V3, rx: number, ry: number, rz: number, count: number, yMin = -0.1, yMax = 0.85): { at: V3; n: V3 }[] {
  const out: { at: V3; n: V3 }[] = [];
  const ph = r() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = ph + (i / count) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const y = THREE.MathUtils.lerp(yMin, yMax, ((i * 0.618 + r() * 0.25) % 1));
    const s = Math.sqrt(1 - y * y);
    const d = V(Math.cos(a) * s, y, Math.sin(a) * s);
    out.push({ at: V(c.x + d.x * rx * 0.97, c.y + d.y * ry * 0.95, c.z + d.z * rz * 0.97), n: V(d.x / rx, d.y / ry, d.z / rz).normalize() });
  }
  return out;
}

/** A faceted nugget (a few big facets, like a cut lump of metal). */
export function nugget(r: Rnd, size: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(size, 0);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  // Squash and jitter so no two match; the index-free icosahedron keeps its facets.
  const sx = 0.85 + r() * 0.35;
  const sy = 0.6 + r() * 0.25;
  const sz = 0.85 + r() * 0.35;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let j = seen.get(key);
    if (!j) seen.set(key, (j = [1 + (r() - 0.5) * 0.3, 1 + (r() - 0.5) * 0.3, 1 + (r() - 0.5) * 0.3]));
    pos.setXYZ(i, pos.getX(i) * sx * j[0], pos.getY(i) * sy * j[1], pos.getZ(i) * sz * j[2]);
  }
  return g;
}

/** A point-ended crystal (hexagonal prism and tip), faceted. Stands on its foot along +y. */
export function crystal(radius: number, length: number, tip = 0.35, sides = 6): THREE.BufferGeometry {
  const prof: [number, number][] = [[radius * 0.8, -0.25], [radius, length * (1 - tip)], [0, length]];
  const g = lathe(prof, sides);
  return g.toNonIndexed();
}

/** Turn +y onto `dir`. */
export const toward = (dir: V3) => new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));

function oreRock(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const vein = toC(L.crown);
  const gold = L.species === "gold";
  const parts: { c: V3; rx: number; ry: number; rz: number; nug: number }[] =
    v === 2
      ? [
          { c: V(-0.22, 0.55, -0.15), rx: 0.9, ry: 0.85, rz: 0.82, nug: 3 },
          { c: V(0.62, 0.32, 0.5), rx: 0.5, ry: 0.42, rz: 0.48, nug: 2 },
        ]
      : [{ c: V(0, 0.62, 0), rx: v === 1 ? 1.08 : 1.02, ry: v === 1 ? 0.82 : 0.95, rz: v === 1 ? 0.95 : 1.0, nug: 5 }];
  for (const b of parts) {
    const seg = parts.length > 1 ? (b.nug > 2 ? [10, 7] : [8, 5]) : [11, 8];
    const g = boulder(r, b.rx, b.ry, b.rz, seg[0], seg[1]);
    place(g, b.c);
    // Vein streaks: the stone near the nuggets takes the vein colour.
    const spots = onBoulder(r, b.c, b.rx, b.ry, b.rz, b.nug, -0.05, 0.8);
    const base = stone(L.main, b.c.y + b.ry);
    const veinDark = mixC(L.crown, L.main, 0.35);
    k.add(g, (p, n, out) => {
      base(p, n, out);
      let best = 0;
      for (const s of spots) best = Math.max(best, 1 - p.distanceTo(s.at) / 0.42);
      if (best > 0) out.lerp(veinDark, clamp01(best * 1.4) * 0.85);
    });
    for (const s of spots) {
      const g2 = nugget(r, (gold ? 0.24 : 0.21) * (0.85 + r() * 0.35) * (parts.length > 1 && b.nug < 3 ? 0.8 : 1));
      place(g2, s.at, toward(s.n));
      // Metal: lit faces burn bright, the rest of the facets stay rich.
      const hi = tintC(vein, gold ? 0.35 : 0.25);
      const lo = scaleC(vein, gold ? 0.72 : 0.62);
      k.add(g2, (_p, n, out) => out.copy(lo).lerp(hi, clamp01(n.y * 0.8 + 0.35)).multiplyScalar(gold ? 1.18 : 1.1), true);
    }
  }
}

function gemRock(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const gem = toC(L.crown);
  const rx = v === 1 ? 1.05 : 0.98;
  const ry = v === 1 ? 0.72 : 0.8;
  const c = V(0, 0.55, 0);
  const g = boulder(r, rx, ry, rx * 0.95, 10, 7);
  place(g, c);
  const base = stone(L.main, c.y + ry);
  const glow = mixC(L.main, L.crown, 0.5);
  // Clusters: one big on top, one or two smaller on the shoulder.
  const clusters: { at: V3; n: V3; size: number; count: number }[] = [];
  const topSpot = onBoulder(r, c, rx, ry, rx * 0.95, 1, 0.6, 0.75)[0];
  clusters.push({ ...topSpot, size: 1, count: 4 });
  for (const s of onBoulder(r, c, rx, ry, rx * 0.95, v === 2 ? 2 : 1, 0.0, 0.3)) clusters.push({ ...s, size: 0.62, count: v === 2 ? 1 : 3 });
  k.add(g, (p, n, out) => {
    base(p, n, out);
    let best = 0;
    for (const s of clusters) best = Math.max(best, 1 - p.distanceTo(s.at) / (0.55 * s.size));
    if (best > 0) out.lerp(glow, clamp01(best) * 0.6);
  });
  const hi = tintC(gem, 0.45);
  const lo = scaleC(gem, 0.7);
  for (const cl of clusters) {
    for (let i = 0; i < cl.count; i++) {
      const tilt = i === 0 ? 0.15 : 0.55 + r() * 0.25;
      const a = (i / cl.count) * Math.PI * 2 + r();
      const dir = cl.n.clone().lerp(V(0, 1, 0), 0.5).normalize();
      const side = V(Math.cos(a), 0, Math.sin(a));
      const d = dir.clone().addScaledVector(side, tilt).normalize();
      const len = (i === 0 ? 0.95 : 0.55 + r() * 0.2) * cl.size;
      const rad = (i === 0 ? 0.16 : 0.11) * cl.size;
      const g2 = crystal(rad, len, 0.32, 6);
      place(g2, cl.at.clone().addScaledVector(side, i === 0 ? 0 : 0.12 * cl.size), toward(d));
      k.add(g2, (p, n, out) => {
        out.copy(lo).lerp(hi, clamp01(0.45 + 0.55 * n.y));
        out.multiplyScalar(1.12);
        void p;
      }, true);
    }
  }
}

function chestNode(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  // A patch of dug earth.
  const earth = blob(1.05, 0.14, 0.95, 9, 3, (p) => p.multiplyScalar(1 + 0.1 * Math.sin(Math.atan2(p.z, p.x) * 3 + v)));
  place(earth, V(0, 0, 0));
  k.add(earth, dome(0x6b4a2c, 0x9a7048));
  const wood = toC(L.main);
  const band = toC(0x6a6a72);
  const gold = toC(L.crown);
  const tilt = new THREE.Euler(0.12, v === 1 ? -0.35 : 0.3, v === 1 ? 0.1 : -0.08);
  const box = new THREE.Group();
  box.rotation.copy(tilt);
  box.position.set(0, 0.18, -0.05);
  box.updateMatrixWorld();
  const put = (g: THREE.BufferGeometry, at: V3, rot: THREE.Euler | null, paint: Paint, flat = false) => {
    place(g, at, rot);
    g.applyMatrix4(box.matrixWorld);
    k.add(g, paint, flat);
  };
  const W = 1.35;
  const D = 0.82;
  const Hb = 0.62;
  // Body (half sunk: its foot is below ground).
  put(new THREE.BoxGeometry(W, Hb, D), V(0, Hb / 2 - 0.2, 0), null, grad(scaleC(wood, 0.6), wood, -0.2, 0.6), true);
  // Iron bands round the body.
  for (const x of [-0.45, 0.45]) put(new THREE.BoxGeometry(0.12, Hb + 0.02, D + 0.04), V(x, Hb / 2 - 0.2, 0), null, solid(band, 1.05), true);
  // Gold heaped in the open chest.
  put(blob(W * 0.47, 0.26, D * 0.45, 9, 4, (p) => p.multiplyScalar(1 + 0.08 * Math.sin(p.x * 9 + v) * Math.cos(p.z * 7))), V(0, Hb - 0.2, 0), null, dome(scaleC(gold, 0.75), tintC(gold, 0.3), 1.15));
  // The lid, open and leaning back.
  const lid = new THREE.CylinderGeometry(D / 2, D / 2, W, 6, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  put(lid, V(0, Hb - 0.2 + 0.32, -D / 2 - 0.12), new THREE.Euler(-1.15, 0, 0), grad(scaleC(wood, 0.7), tintC(wood, 0.12), 0, 1.4));
  // Lock plate.
  put(new THREE.BoxGeometry(0.22, 0.24, 0.06), V(0, Hb - 0.36, D / 2 + 0.02), null, solid(gold, 1.1), true);
  // Coins spilled in front.
  const coinPaint = dome(scaleC(gold, 0.7), tintC(gold, 0.3), 1.15);
  const coins: [number, number, number][] = [[-0.45, 0.62, 0.3], [0.2, 0.75, -0.4], [0.55, 0.58, 0.9]];
  for (const [x, z, a] of coins) {
    const c = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 8);
    place(c, V(x + (r() - 0.5) * 0.1, 0.13, z), new THREE.Euler(0.25 * a, a, 0.3 * a));
    k.add(c, coinPaint);
  }
}

/* ---------------------------------------------------------------- the public API */

const cache = new Map<string, THREE.BufferGeometry>();
const tops = new Map<string, number>();

/** How many looks a key has (a field picks one per cell so it does not repeat). */
export function nodeVariants(key: string): number {
  return farmLook(key).kind === "chest" ? 2 : 3;
}

/** Fit x / z inside `limit` (squeezes a model that grew past its cell). */
function fit(g: THREE.BufferGeometry, limit: number): void {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const m = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
  if (m > limit) g.scale(limit / m, 1, limit / m);
}

/**
 * The model on a cell of this ore key: origin at the cell's ground centre, +y up, colours in `color`, smooth normals.
 * Deterministic per (key, variant); cached (callers share the geometry, do not dispose it).
 */
export function nodeGeometry(key: string, variant: number, cell: number): THREE.BufferGeometry {
  const v = ((variant % nodeVariants(key)) + nodeVariants(key)) % nodeVariants(key);
  const id = `${key}|${v}|${cell}`;
  let g = cache.get(id);
  if (g) return g;
  const L = farmLook(key);
  const r = rng(hashOf(key, v * 7919 + 13));
  const k = new Kit();
  if (L.kind === "crop") rice(k, L, r, v);
  else if (L.kind === "wood" || L.kind === "fruit") tree(k, L, r, v);
  else if (L.kind === "ore") oreRock(k, L, r, v);
  else if (L.kind === "gem") gemRock(k, L, r, v);
  else chestNode(k, L, r, v);
  g = k.build();
  fit(g, L.kind === "wood" || L.kind === "fruit" ? OUTER : INNER);
  if (cell !== BASE_CELL) g.scale(cell / BASE_CELL, 1, cell / BASE_CELL);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  cache.set(id, g);
  return g;
}

/** Height of the top of this key's model (the tallest variant), for labels and effects. */
export function nodeTop(key: string): number {
  let t = tops.get(key);
  if (t === undefined) {
    t = 0;
    for (let v = 0; v < nodeVariants(key); v++) t = Math.max(t, nodeGeometry(key, v, BASE_CELL).boundingBox!.max.y);
    tops.set(key, t);
  }
  return t;
}
