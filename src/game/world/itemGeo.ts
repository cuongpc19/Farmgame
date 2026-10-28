import * as THREE from "three";
import { itemKind, oreOfItemId } from "../data";
import { farmLook, type FarmLook } from "../farm";
import {
  Kit,
  blob,
  boulder,
  crystal,
  dome,
  grad,
  hashOf,
  lathe,
  lightOf,
  mixC,
  nugget,
  place,
  ribbon,
  rng,
  shaded,
  shiftC,
  solid,
  sunlit,
  toC,
  toward,
  tube,
  type ColorLike,
  type Paint,
  type Rnd,
} from "./farmNodes";

/**
 * Shared geometries for carried / flying items (Farm Valley; Candy Miner had sweets and candy bars). Every item is
 * one merged geometry with its colours in a `color` vertex attribute (`itemMaterial` is white and only sets the
 * finish), centred on its bounding box, long side along x, at a nominal size of 1 (callers scale).
 *
 * By farm kind (farm.ts) and item kind (data.ts `itemKind`):
 *
 * | farm kind | raw ("mineral")                          | product ("ingot")                 |
 * |-----------|------------------------------------------|-----------------------------------|
 * | crop      | rice sheaf, tied in the middle           | burlap rice sack, tied at the top |
 * | wood      | log, bark sides and light end rings      | bundle of three planks, strapped  |
 * | fruit     | one, two or three fruit with a leaf      | wooden crate full of fruit        |
 * | ore       | stone chunk with metal nuggets           | cast bar                          |
 * | gem       | crystal cluster on a bit of stone        | brilliant-cut gem                 |
 * | chest     | small treasure chest                     | bag of gold coins                 |
 *
 * Fuel ("oil") is a red jerrycan. Raw items come in `ROCK_SHAPES` variants so a pile never repeats.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const PI = Math.PI;

/** Lay a part built standing on +y down along +x (its +y end toward +x). */
const layX = (g: THREE.BufferGeometry) => g.rotateZ(-PI / 2);

/** Plain stone for chunks: light, slightly cool grey, deeper underneath. */
function stoneOf(main: ColorLike): Paint {
  const body = mixC(main, 0xa7a6a2, 0.45);
  const lo = shaded(body, 1.1);
  const hi = sunlit(body, 0.8);
  return (_p, n, out) => out.copy(lo).lerp(hi, clamp01(0.5 + 0.5 * n.y)).multiplyScalar(1.02);
}

/** Facets of metal: lit faces bright, the sides deep (strong contrast reads as polished). */
function metalOf(c: ColorLike, gold: boolean): Paint {
  const hi = sunlit(c, gold ? 0.7 : 0.6);
  const lo = shaded(c, gold ? 1.3 : 1.5);
  return (_p, n, out) => out.copy(lo).lerp(hi, clamp01(n.y * 0.9 + 0.2)).multiplyScalar(gold ? 1.12 : 1.05);
}

/** Facets of a gem: saturated, lighter toward the sky, every other facet catching the light (sparkle). */
function glassOf(c: ColorLike): Paint {
  const hi = shiftC(c, 0, 0.02, 0.12);
  const lo = shaded(c, 1.0);
  return (_p, n, out) => {
    out.copy(lo).lerp(hi, clamp01(0.35 + 0.65 * n.y));
    const facet = Math.floor((Math.atan2(n.z, n.x) + PI) / (PI / 4)) % 2;
    out.multiplyScalar(facet ? 1.22 : 0.92);
  };
}

/** Wood that was cut (end grain, planks): its colour, warmer and lighter on top. */
function woodOf(c: ColorLike, k = 1): Paint {
  const lo = shaded(c, 0.7);
  const hi = sunlit(c, 0.6);
  return (_p, n, out) => out.copy(lo).lerp(hi, clamp01(0.5 + 0.5 * n.y)).multiplyScalar(k);
}

/** A half cylinder lying along x, round side up (chest lids and their bands). */
function halfDrum(radius: number, length: number, segs = 8): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, length, segs, 1, false, 0, PI).rotateZ(PI / 2);
}

/* ---------------------------------------------------------------- raw items */

/** A sheaf of rice: cut stalks, a twine tie round the waist, a head of drooping golden ears. Along x, ears at +x. */
function sheaf(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const stalk = shiftC(mixC(L.main, 0x5f9a2a, 0.5), 0, 0.08, 0);
  const cut = sunlit(mixC(L.main, 0x9ac24a, 0.3), 1);
  const gold = sunlit(L.crown, 0.2);
  const goldLo = shaded(L.crown, 0.7);
  const goldHi = sunlit(L.crown, 1.1);
  const droop = [0.07, 0.13, 0.02][v];
  const len = [1, 0.94, 1.06][v];
  // Built standing (ears up), then laid along x; the ears droop toward -y once laid (+x while standing).
  // An hourglass: the cut stalks flare at one end, the twine pinches the middle, a spiky head of ears the other end.
  const prof: [number, number][] = [
    [0, -0.55],
    [0.2, -0.545],
    [0.23, -0.5],
    [0.17, -0.3],
    [0.115, -0.1],
    [0.13, 0.0],
    [0.22, 0.14],
    [0.3, 0.3],
    [0.27, 0.44],
    [0.13, 0.56],
    [0, 0.62],
  ];
  const g = lathe(
    prof.map(([a, b]) => [a, b * len] as [number, number]),
    14,
    (p, ring, j) => {
      if (ring >= 6 && ring <= 9) {
        // Separate ears: every other one stands well proud of its neighbours.
        const ear = j % 2 === 0 ? 1.28 : 0.68;
        p.x *= ear;
        p.z *= ear;
      }
      if (ring >= 5) {
        const t = clamp01(p.y / 0.62);
        p.x += droop * t * t * 2.4;
      }
    },
    r() * PI,
  );
  layX(g);
  k.add(g, (p, n, out) => {
    const x = p.x;
    if (x < -0.52 * len) out.copy(cut);
    else if (x < 0.06) out.copy(stalk).lerp(goldLo, clamp01((x + 0.04) / 0.1) * 0.7);
    else out.copy(goldLo).lerp(gold, clamp01((x - 0.06) / 0.16)).lerp(goldHi, clamp01(n.y) * 0.8);
    out.multiplyScalar(lightOf(n) * (0.94 + r() * 0.12));
  });
  // The twine round the waist.
  const tie = new THREE.TorusGeometry(0.125, 0.04, 5, 12);
  tie.rotateY(PI / 2);
  place(tie, V(-0.08 * len, 0, 0));
  k.add(tie, grad(0x7a4524, 0xc4864a, -0.15, 0.15));
}

/** A log: bark all round (grooves, or a birch's dark marks, or a bamboo cane's nodes), light end grain with rings. */
function log(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const bamboo = L.species === "bamboo";
  const birch = L.species === "birch";
  const palm = L.species === "palm";
  const R = bamboo ? [0.2, 0.22, 0.18][v] : [0.27, 0.31, 0.24][v];
  const len = [1.0, 0.86, 1.1][v];
  const h = len / 2;
  const radial = 12;
  const barkLo = shaded(L.raw, bamboo ? 0.6 : 1.1);
  const barkHi = sunlit(L.raw, bamboo ? 0.8 : 0.6);
  // Bark: rings along the log (bamboo nodes, palm rings), grooves round it.
  const prof: [number, number][] = [];
  const steps = bamboo || palm ? 6 : 4;
  for (let i = 0; i <= steps; i++) {
    const edge = i === 0 || i === steps;
    prof.push([R * (edge ? 0.96 : 1) * (bamboo && !edge && i % 3 === 0 ? 1.12 : 1), -h + (i / steps) * len]);
  }
  const tones: number[] = [];
  const side = lathe(prof, radial, (p, ring, j) => {
    if (!bamboo && ring > 0 && ring < steps) {
      const groove = j % 2 === 0 ? 1.04 : 0.97;
      p.x *= groove;
      p.z *= groove;
    }
    let tone = j % 2 === 0 ? 1.08 : 0.86;
    if (bamboo) tone = ring % 3 === 0 && ring > 0 && ring < steps ? 0.62 : 1.06;
    if (palm) tone = ring % 2 === 0 ? 0.82 : 1.08;
    if (birch) tone = 1;
    tones.push(tone);
  });
  let vi = 0;
  layX(side);
  // Snow pine: a dusting of snow along the top of the log.
  const snow = L.species === "snowpine" && L.extra !== undefined ? toC(L.extra) : null;
  k.add(side, (_p, n, out) => {
    out.copy(barkLo).lerp(barkHi, clamp01(0.5 + 0.5 * n.y)).multiplyScalar(tones[vi++]);
    if (snow && n.y > 0.95) out.copy(snow).multiplyScalar(0.95);
  });
  // Birch: thin dark dashes across the white bark; cherry: light ones on the red-brown bark (lenticels).
  const cherry = L.species === "cherry";
  if (birch || cherry)
    for (let i = 0; i < 7; i++) {
      const y = -h + 0.1 + ((i + r() * 0.6) / 7) * (len - 0.2);
      const a0 = r() * PI * 2;
      const span = 0.9 + r() * 0.9;
      const path: THREE.Vector3[] = [];
      const w: number[] = [];
      for (let q = 0; q <= 3; q++) {
        const ang = a0 + (q / 3) * span;
        path.push(V(Math.cos(ang) * R * 1.035, y, Math.sin(ang) * R * 1.035));
        w.push(q === 0 || q === 3 ? 0 : 0.025 + r() * 0.012);
      }
      const dash = ribbon(path, w, V(Math.cos(a0 + span / 2), 0, Math.sin(a0 + span / 2)), 0);
      layX(dash);
      k.add(dash, solid(cherry ? sunlit(L.raw, 1.6) : 0x2e2a28));
    }
  // End grain: a light disc with a darker ring, the bark's edge round it (bamboo: hollow, a wall of light cane).
  const end = toC(L.product);
  for (const s of [-1, 1]) {
    const y = s * h;
    const disc: [number, number][] = bamboo
      ? [[0, y * 0.9], [R * 0.6, y * 0.96], [R * 0.75, y], [R * 0.96, y]]
      : [[0, y + s * 0.012], [R * 0.32, y + s * 0.01], [R * 0.55, y + s * 0.006], [R * 0.82, y + s * 0.002], [R * 0.96, y]];
    const cols: THREE.Color[] = bamboo
      ? [shaded(L.raw, 1.4), shaded(L.raw, 1), sunlit(L.product, 0.4), barkLo]
      : [sunlit(end, 0.5), end, shaded(end, 0.8), end, barkLo];
    const g = lathe(s > 0 ? [...disc].reverse() : disc, radial);
    layX(g);
    k.add(g, (p, n, out) => {
      // The ring this vertex is on, by its distance from the log's axis.
      const rr = Math.hypot(p.y, p.z);
      let best = 0;
      for (let i = 1; i < disc.length; i++) if (Math.abs(disc[i][0] - rr) < Math.abs(disc[best][0] - rr)) best = i;
      out.copy(cols[best]).multiplyScalar(0.98 + 0.08 * Math.max(0, n.y));
    });
  }
  // A cut-off branch on the chunky one.
  if (v === 1 && !bamboo) {
    const stub = tube([V(0, 0, 0), V(0.05, R + 0.12, 0.04)], [0.08, 0.065], 6);
    place(stub, V(0.12, 0, 0.02));
    k.add(stub, grad(barkLo, barkHi, 0, R + 0.1));
    const cap = lathe([[0.065, 0], [0, 0.005]], 6);
    place(cap, V(0.17, R + 0.12, 0.06));
    k.add(cap, solid(end));
  }
}

/** One fruit with a stem and maybe a leaf (orange: round; mango: a long, blushing kidney). */
function fruit(k: Kit, L: FarmLook, r: Rnd, at: THREE.Vector3, s: number, turn: number, leaf = true): void {
  const mango = L.species === "mango";
  const c = toC(L.extra ?? L.raw);
  const g = mango
    ? blob(s * 1.28, s * 0.86, s * 0.92, 12, 8, (p) => {
        // A kidney: one side fuller.
        p.z += 0.12 * (1 - p.x * p.x);
      })
    : blob(s, s * 0.93, s, 12, 8, (p) => {
        // Dimpled at the stem.
        if (p.y > 0.9) p.y -= (p.y - 0.9) * 0.9;
      });
  place(g, at, new THREE.Euler(0, turn, 0));
  const lo = shaded(c, 0.9);
  const hi = mango ? mixC(c, 0xff4a2a, 0.5) : sunlit(c, 0.9);
  // A mango ripens from green at one end to a red blush at the other.
  const unripe = mixC(c, 0x8cc43a, 0.55);
  const along = V(Math.cos(turn), 0, -Math.sin(turn));
  k.add(g, (p, n, out) => {
    const t = clamp01(0.5 + 0.5 * n.y);
    out.copy(lo).lerp(c, Math.min(1, t * 2));
    if (t > 0.5) out.lerp(hi, (t - 0.5) * 2);
    if (mango) out.lerp(unripe, clamp01(-p.clone().sub(at).dot(along) / (s * 1.28)) * 0.8);
    out.multiplyScalar(1.06 * (0.97 + r() * 0.06));
  });
  const top = V(at.x, at.y + s * (mango ? 0.82 : 0.86), at.z);
  k.add(tube([top, top.clone().add(V(0.02, 0.09, 0))], [0.025, 0.02], 5), solid(0x5a3a1e));
  if (!leaf) return;
  const dir = V(Math.cos(turn + 0.8), 0, Math.sin(turn + 0.8));
  const base = top.clone().add(V(0.01, 0.06, 0));
  const pts = [0, 0.5, 1].map((t) => base.clone().addScaledVector(dir, 0.34 * t).add(V(0, 0.08 * Math.sin(t * PI) + 0.02 * t, 0)));
  const green = toC(0x3f9a32);
  k.addSheet(ribbon(pts, [0, 0.085, 0], V(0, 1, 0), 0.3), dome(shaded(green, 0.8), sunlit(green, 0.9)), dome(shaded(green, 1), green));
}

function fruitRaw(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  if (v === 0) fruit(k, L, r, V(0, 0, 0), 0.38, 0.3);
  else if (v === 1) {
    fruit(k, L, r, V(-0.24, 0, 0.03), 0.3, 0.2);
    fruit(k, L, r, V(0.25, -0.02, -0.04), 0.29, 2.4, false);
  } else {
    fruit(k, L, r, V(-0.26, -0.04, 0.15), 0.27, 1.0, false);
    fruit(k, L, r, V(0.25, -0.04, 0.12), 0.27, 2.1, false);
    fruit(k, L, r, V(0, 0.2, -0.12), 0.27, 0.4);
  }
}

/** A lump of stone with nuggets of the metal in it. */
function oreChunk(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const gold = L.species === "gold";
  const rx = [0.44, 0.48, 0.4][v];
  const ry = [0.32, 0.29, 0.34][v];
  const rz = [0.38, 0.36, 0.4][v];
  k.add(boulder(r, rx, ry, rz, 10, 7, 0.16), stoneOf(L.main));
  const n = v === 1 ? 4 : 3;
  const ph = r() * PI * 2;
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * PI * 2 + (r() - 0.5) * 0.5;
    const y = i === 0 ? 0.75 : 0.15 + r() * 0.35;
    const s = Math.sqrt(1 - y * y);
    const d = V(Math.cos(a) * s, y, Math.sin(a) * s);
    const g = nugget(r, (gold ? 0.17 : 0.15) * (i === 0 ? 1.15 : 0.9 + r() * 0.2));
    place(g, V(d.x * rx * 0.92, d.y * ry * 0.92, d.z * rz * 0.92), toward(V(d.x / rx, d.y / ry, d.z / rz)));
    k.add(g, metalOf(L.crown, gold), true);
  }
}

/** A cluster of crystals on a bit of stone. */
function gemCluster(k: Kit, L: FarmLook, r: Rnd, v: number): void {
  const base = blob(0.3, 0.12, 0.26, 8, 4, (p) => p.multiplyScalar(1 + 0.12 * Math.sin(p.x * 5 + v)));
  place(base, V(0, -0.2, 0));
  k.add(base, stoneOf(L.main));
  const glass = glassOf(L.crown);
  const set: [number, number, number, number, number][] = [
    // x, z, lean x, lean z, length
    [0, 0, 0.05, -0.05, 0.66],
    [-0.15, 0.07, -0.55, 0.15, 0.46],
    [0.15, 0.05, 0.5, 0.25, 0.44],
    [0.03, -0.14, 0.1, -0.55, 0.38],
  ];
  const n = v === 2 ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const [x, z, lx, lz, len] = set[i];
    const g = crystal(i === 0 ? 0.16 : 0.115, len * (v === 1 ? 1.08 : 1), 0.3, 6);
    place(g, V(x, -0.16, z), toward(V(lx + (r() - 0.5) * 0.1, 1, lz)));
    k.add(g, glass, true);
  }
}

/** A small closed chest: box, round lid, metal bands and a lock. */
function smallChest(k: Kit, L: FarmLook): void {
  const wood = toC(L.main);
  const band = toC(0xb08a3a);
  const W = 0.82;
  const D = 0.54;
  const H = 0.36;
  k.add(place(new THREE.BoxGeometry(W, H, D), V(0, H / 2, 0)), grad(shaded(wood, 0.6), sunlit(wood, 0.3), 0, H));
  k.add(place(halfDrum(D / 2, W), V(0, H, 0)), woodOf(sunlit(wood, 0.25)));
  for (const x of [-0.28, 0.28]) {
    k.add(place(new THREE.BoxGeometry(0.08, H + 0.01, D + 0.03), V(x, H / 2, 0)), solid(band, 1.1), true);
    k.add(place(halfDrum(D / 2 + 0.015, 0.08), V(x, H, 0)), dome(shaded(band, 0.6), sunlit(band, 1)), true);
  }
  k.add(place(new THREE.BoxGeometry(0.14, 0.16, 0.05), V(0, H - 0.02, D / 2 + 0.02)), solid(sunlit(L.crown, 0.5), 1.15), true);
}

/* ---------------------------------------------------------------- products */

/**
 * A plump burlap rice sack lying on its side like the ones in a sack pile (stood up, a column of them read as a
 * caterpillar): a pillow of cloth, the neck at +x tied with twine, a ragged tuft, two red bands woven across.
 */
function riceSack(k: Kit, L: FarmLook, r: Rnd): void {
  const cloth = mixC(L.product, 0xcfae74, 0.55);
  const lo = shiftC(cloth, 0.01, 0.06, -0.2);
  const hi = sunlit(cloth, 0.5);
  // Lying flat: the standing x becomes the height, squashed; z stays the width.
  const flat = 0.62;
  const g = lathe(
    [
      [0, -0.5],
      [0.25, -0.49],
      [0.34, -0.4],
      [0.36, -0.16],
      [0.36, 0.1],
      [0.31, 0.26],
      [0.16, 0.35],
      [0.12, 0.38],
      [0.12, 0.41],
      [0.18, 0.47],
      [0.14, 0.52],
      [0, 0.5],
    ],
    14,
    (p, ring, j) => {
      p.x *= flat;
      // The cloth sags a little; the tuft is ragged.
      if (ring >= 3 && ring <= 5) p.z *= 1 + 0.03 * Math.sin(j * 1.9);
      if (ring >= 9) {
        const f = j % 2 === 0 ? 1.25 : 0.8;
        p.x *= f;
        p.z *= f;
      }
    },
  );
  layX(g);
  k.add(g, (_p, n, out) => out.copy(lo).lerp(hi, clamp01(0.5 + 0.55 * n.y)).multiplyScalar(0.95 + r() * 0.1));
  // The twine at the neck.
  const tie = new THREE.TorusGeometry(0.125, 0.035, 5, 12);
  tie.rotateY(PI / 2);
  tie.scale(1, flat * 1.05, 1);
  place(tie, V(0.395, 0, 0));
  k.add(tie, grad(0x7a4524, 0xc4864a, -0.08, 0.08));
  // Two red bands woven across.
  const red = toC(0xc8463a);
  for (const x of [-0.3, -0.19]) {
    const band = lathe([[0.364, -0.03], [0.364, 0.03]], 14, (p) => (p.x *= flat));
    layX(band);
    place(band, V(x, 0, 0));
    k.add(band, dome(shaded(red, 0.8), sunlit(red, 0.5)));
  }
}

/** Four chunky planks, two by two, a leather strap round the middle. */
function planks(k: Kit, L: FarmLook, r: Rnd): void {
  const c = shiftC(L.product, 0, 0.08, -0.04);
  const L0 = 1.12;
  const w = 0.29;
  const t = 0.16;
  // Staggered so the ends show, with gaps between the boards.
  const boards: [number, number, number][] = [
    [-0.155, -0.088, -0.03],
    [0.155, -0.088, 0.06],
    [-0.155, 0.088, 0.05],
    [0.155, 0.088, -0.05],
  ];
  boards.forEach(([z, y, dx], i) => {
    const g = new THREE.BoxGeometry(L0, t, w, 8, 1, 2);
    place(g, V(dx, y, z));
    const tone = shiftC(c, 0, 0, [0, -0.05, 0.03, -0.02][i]);
    const top = sunlit(tone, 0.5);
    const side = shaded(tone, 0.9);
    const end = shaded(tone, 0.5);
    const ph = r() * 6;
    k.add(g, (p, n, out) => {
      // Light faces up, darker sides (the gaps read as lines), end grain in between; stripes of grain along.
      if (Math.abs(n.x) > 0.5) out.copy(end);
      else if (n.y > 0.5) out.copy(top);
      else out.copy(side);
      if (Math.abs(n.x) <= 0.5) out.multiplyScalar(0.9 + 0.16 * Math.sin(p.x * 19 + p.z * 9 + ph));
    });
  });
  const strap = toC(0x6a3e24);
  k.add(place(new THREE.BoxGeometry(0.16, 0.38, 0.65), V(0, 0, 0)), grad(shaded(strap, 0.5), sunlit(strap, 0.6), -0.2, 0.2), true);
  k.add(place(new THREE.BoxGeometry(0.12, 0.12, 0.03), V(0, 0.02, 0.33)), solid(0xd8b050, 1.1), true);
}

/** A slatted wooden crate heaped with fruit. */
function crate(k: Kit, L: FarmLook, r: Rnd): void {
  const wood = toC(0xd29a5c);
  const W = 1.0;
  const D = 0.66;
  const H = 0.34;
  const y0 = -0.2;
  // The inside (dark), then slats on the sides and posts at the corners.
  k.add(place(new THREE.BoxGeometry(W - 0.06, H - 0.02, D - 0.06), V(0, y0 + H / 2, 0)), solid(shaded(wood, 1.4)), true);
  for (const s of [-1, 1]) {
    for (const yy of [0.07, 0.24]) {
      k.add(place(new THREE.BoxGeometry(W, 0.12, 0.04), V(0, y0 + yy, s * (D / 2 - 0.02))), woodOf(wood, yy > 0.1 ? 1.04 : 0.95), true);
      k.add(place(new THREE.BoxGeometry(0.04, 0.12, D), V(s * (W / 2 - 0.02), y0 + yy, 0)), woodOf(wood, yy > 0.1 ? 1.0 : 0.9), true);
    }
    for (const q of [-1, 1]) k.add(place(new THREE.BoxGeometry(0.07, H + 0.02, 0.07), V(s * (W / 2 - 0.03), y0 + H / 2, q * (D / 2 - 0.03))), woodOf(shaded(wood, 0.3)), true);
  }
  // Fruit heaped above the rim.
  const fc = toC(L.product);
  const mango = L.species === "mango";
  const hi = mango ? mixC(fc, 0xff4a2a, 0.45) : sunlit(fc, 0.9);
  const spots: [number, number, number][] = [
    [-0.3, -0.13, 0],
    [0, -0.14, 0.02],
    [0.3, -0.12, 0],
    [-0.3, 0.13, 0.01],
    [0.0, 0.13, 0.03],
    [0.3, 0.13, 0],
  ];
  for (const [x, z, dy] of spots) {
    const s = 0.15 + r() * 0.015;
    const g = mango ? blob(s * 1.25, s * 0.85, s * 0.9, 9, 6) : blob(s, s * 0.92, s, 9, 6);
    place(g, V(x + (r() - 0.5) * 0.03, y0 + H - 0.02 + dy, z), new THREE.Euler(0, r() * PI, 0));
    k.add(g, dome(shaded(fc, 0.9), hi, 1.06));
  }
  // A leaf on top.
  const green = toC(0x3f9a32);
  const base = V(0.06, y0 + H + 0.13, 0.02);
  const pts = [0, 0.5, 1].map((t) => base.clone().add(V(0.3 * t, 0.06 * Math.sin(t * PI), -0.1 * t)));
  k.addSheet(ribbon(pts, [0, 0.08, 0], V(0, 1, 0), 0.3), dome(shaded(green, 0.8), sunlit(green, 0.9)), solid(shaded(green, 0.6)));
}

/** A cast bar: a chamfered trapezoid with a bevelled top, faceted. */
function bar(k: Kit, L: FarmLook): void {
  const section = (w: number, d: number, c: number, y: number) =>
    (
      [
        [w / 2, d / 2 - c],
        [w / 2 - c, d / 2],
        [-w / 2 + c, d / 2],
        [-w / 2, d / 2 - c],
        [-w / 2, -d / 2 + c],
        [-w / 2 + c, -d / 2],
        [w / 2 - c, -d / 2],
        [w / 2, -d / 2 + c],
      ] as [number, number][]
    ).map(([x, z]) => V(x, y, z));
  const rings = [section(1.1, 0.56, 0.06, -0.19), section(0.92, 0.4, 0.05, 0.13), section(0.82, 0.31, 0.04, 0.19)];
  const pos: number[] = [];
  const idx: number[] = [];
  const add = (...ps: THREE.Vector3[]) => {
    const b = pos.length / 3;
    for (const p of ps) pos.push(p.x, p.y, p.z);
    return b;
  };
  // Sides between the rings (wound outward), then the top and bottom caps.
  for (let q = 0; q < rings.length - 1; q++) {
    const a = rings[q];
    const b = rings[q + 1];
    for (let j = 0; j < 8; j++) {
      const j1 = (j + 1) % 8;
      const s = add(a[j], a[j1], b[j1], b[j]);
      idx.push(s, s + 2, s + 1, s, s + 3, s + 2);
    }
  }
  const tb = add(...rings[rings.length - 1]);
  for (let j = 1; j < 7; j++) idx.push(tb, tb + j + 1, tb + j);
  const bb = add(...rings[0]);
  for (let j = 1; j < 7; j++) idx.push(bb, bb + j, bb + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  k.add(g, metalOf(L.product, L.species === "gold"), true);
}

/**
 * A round brilliant: table, crown facets, girdle, pavilion to a point. Leaned back so the 57° game camera sees its
 * side (the diamond outline everyone knows); table-up, a column of them read as poker chips.
 */
function cutGem(k: Kit, L: FarmLook): void {
  const radial = 8;
  const g = lathe(
    [
      [0, -0.4],
      [0.4, 0.0],
      [0.4, 0.05],
      [0.3, 0.17],
      [0.21, 0.23],
      [0, 0.23],
    ],
    radial,
    (p, ring) => {
      // Crown facets sit between the girdle's: turn that ring half a step.
      if (ring === 3) p.applyAxisAngle(V(0, 1, 0), PI / radial);
    },
    PI / radial,
  );
  g.rotateX(-0.75);
  k.add(g, glassOf(L.product), true);
}

/**
 * A leather bag of gold coins lying on its side (stood up, a column of them read as a caterpillar), the mouth at
 * +x tied with a red cord, coins heaped in it and spilling out in front.
 */
function coinBag(k: Kit, L: FarmLook, r: Rnd): void {
  const leather = toC(0xb4773e);
  const gold = toC(L.product);
  // Built standing (mouth up), squashed in x (the height once laid), then laid along x.
  const flat = 0.78;
  const lay = (g: THREE.BufferGeometry) => layX(g.scale(flat, 1, 1));
  const g = lathe(
    [
      [0, -0.33],
      [0.26, -0.31],
      [0.36, -0.18],
      [0.36, -0.02],
      [0.27, 0.11],
      [0.13, 0.18],
      [0.12, 0.22],
      [0.25, 0.3],
      [0.24, 0.34],
    ],
    14,
    (p, ring, j) => {
      if (ring >= 7) {
        const f = j % 2 === 0 ? 1.18 : 0.84;
        p.x *= f;
        p.z *= f;
      }
    },
  );
  const lo = shaded(leather, 0.9);
  const hi = sunlit(leather, 0.6);
  k.add(lay(g), (_p, n, out) => out.copy(lo).lerp(hi, clamp01(0.5 + 0.5 * n.y)).multiplyScalar(0.95 + r() * 0.1));
  // Coins heaped in the mouth: a mound and a few coins lying on it.
  const coinPaint = metalOf(gold, true);
  k.add(lay(place(blob(0.22, 0.07, 0.22, 10, 4), V(0, 0.31, 0))), coinPaint);
  const heap: [number, number, number, number][] = [
    [0.07, 0.04, 0.37, 0.3],
    [-0.08, -0.05, 0.36, -0.25],
    [0.02, -0.1, 0.35, 0.4],
  ];
  for (const [x, z, y, a] of heap) k.add(lay(place(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), V(x, y, z), new THREE.Euler(a, a * 2, a * 0.6))), coinPaint, true);
  // The cord.
  const tie = new THREE.TorusGeometry(0.14, 0.032, 5, 12);
  tie.rotateX(PI / 2);
  place(tie, V(0, 0.215, 0));
  k.add(lay(tie), grad(0x9a2a24, 0xd8504a, -0.1, 0.1));
  // Coins spilled out of the mouth onto the ground.
  const spill: [number, number, number][] = [
    [0.45, 0.1, 0.5],
    [0.53, -0.12, -0.4],
    [0.4, -0.2, 1.2],
  ];
  for (const [x, z, a] of spill) k.add(place(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10), V(x, -0.25, z), new THREE.Euler(0.12, a, 0.18)), coinPaint, true);
}

/** The fuel can: a red jerrycan with the embossed X, a handle bar and a spout. */
function jerrycan(k: Kit): void {
  const red = toC(0xd8322a);
  const body = grad(shaded(red, 0.7), sunlit(red, 0.4), -0.4, 0.4);
  k.add(place(new THREE.BoxGeometry(0.62, 0.74, 0.32), V(0, -0.04, 0)), body, true);
  // The shoulder: a lid slab, a little inset.
  k.add(place(new THREE.BoxGeometry(0.58, 0.05, 0.29), V(0, 0.355, 0)), body, true);
  // The X pressed into both big faces.
  for (const s of [-1, 1])
    for (const a of [-0.72, 0.72]) k.add(place(new THREE.BoxGeometry(0.06, 0.78, 0.02).rotateZ(a), V(0, -0.06, s * 0.165)), grad(shaded(red, 1.1), red, -0.4, 0.4), true);
  // Handle bar on three posts.
  k.add(place(new THREE.BoxGeometry(0.38, 0.06, 0.08), V(-0.08, 0.46, 0)), grad(shaded(red, 0.5), sunlit(red, 0.3), 0.4, 0.5), true);
  for (const x of [-0.24, -0.08, 0.08]) k.add(place(new THREE.BoxGeometry(0.05, 0.08, 0.06), V(x, 0.4, 0)), solid(0x9a1e1a), true);
  // Spout with a black cap.
  k.add(place(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), V(0.21, 0.42, 0), new THREE.Euler(0, 0, -0.3)), grad(shaded(red, 0.5), red, 0.38, 0.47));
  k.add(place(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 8), V(0.235, 0.49, 0), new THREE.Euler(0, 0, -0.3)), dome(0x1e1e22, 0x55555c));
}

/* ---------------------------------------------------------------- the public API */

/** Raw items come in this many shapes; `itemGeometry`'s `variant` picks one (any integer). */
export const ROCK_SHAPES = 3;

const geos = new Map<string, THREE.BufferGeometry>();
let plainGeo: THREE.BufferGeometry | null = null;

/** Centre a geometry on its bounding box. */
function centre(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(V());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function build(item: number, v: number): THREE.BufferGeometry {
  const kind = itemKind(item);
  const k = new Kit();
  if (kind === "oil") {
    jerrycan(k);
    return centre(k.build());
  }
  const o = oreOfItemId(item);
  const L = farmLook(o?.key ?? "");
  const r = rng(hashOf(o?.key ?? "item", item * 31 + v));
  if (kind === "mineral") {
    if (L.kind === "crop") sheaf(k, L, r, v);
    else if (L.kind === "wood") log(k, L, r, v);
    else if (L.kind === "fruit") fruitRaw(k, L, r, v);
    else if (L.kind === "ore") oreChunk(k, L, r, v);
    else if (L.kind === "gem") gemCluster(k, L, r, v);
    else smallChest(k, L);
  } else {
    if (L.kind === "crop") riceSack(k, L, r);
    else if (L.kind === "wood") planks(k, L, r);
    else if (L.kind === "fruit") crate(k, L, r);
    else if (L.kind === "ore") bar(k, L);
    else if (L.kind === "gem") cutGem(k, L);
    else coinBag(k, L, r);
  }
  return centre(k.build());
}

/**
 * The shared geometry of an item (callers share it; do not dispose). Raw items have `ROCK_SHAPES` shapes and
 * `variant` (any integer) picks one; products and fuel have one.
 */
export function itemGeometry(item: number, variant = 0): THREE.BufferGeometry {
  const kind = itemKind(item);
  if (kind !== "oil" && !oreOfItemId(item)) {
    // Not a farm item (should not happen): a plain white ball the material tints.
    if (!plainGeo) {
      plainGeo = new THREE.SphereGeometry(0.42, 12, 8);
      const n = plainGeo.getAttribute("position").count;
      plainGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3));
    }
    return plainGeo;
  }
  const v = kind === "mineral" ? Math.abs(Math.trunc(variant)) % ROCK_SHAPES : 0;
  const key = `${item}|${v}`;
  let g = geos.get(key);
  if (!g) geos.set(key, (g = build(item, v)));
  return g;
}

const heights = new Map<number, number>();

/**
 * How tall one item stands at size 1 (piles stack each layer on the one below). Raw items count a little less
 * than their tallest shape: they settle into each other.
 */
export function itemHeight(item: number): number {
  let h = heights.get(item);
  if (h === undefined) {
    const raw = itemKind(item) === "mineral";
    h = 0;
    for (let v = 0; v < (raw ? ROCK_SHAPES : 1); v++) {
      const g = itemGeometry(item, v);
      g.computeBoundingBox();
      h = Math.max(h, g.boundingBox!.max.y - g.boundingBox!.min.y);
    }
    if (raw) h *= 0.9;
    heights.set(item, h);
  }
  return h;
}

const feet = new Map<number, [number, number]>();

/** Ground footprint of one item at size 1, [along x, along z] (piles space their columns by it). */
export function itemFootprint(item: number): [number, number] {
  let f = feet.get(item);
  if (!f) {
    const g = itemGeometry(item);
    g.computeBoundingBox();
    const s = g.boundingBox!.getSize(V());
    feet.set(item, (f = [s.x, s.z]));
  }
  return f;
}

type Finish = "matte" | "satin" | "metal" | "gem" | "paint";

const FINISH: Record<Finish, { shininess: number; specular: number; emissive: number }> = {
  matte: { shininess: 10, specular: 0x1a1a1a, emissive: 0x000000 },
  satin: { shininess: 35, specular: 0x4a4a4a, emissive: 0x000000 },
  metal: { shininess: 90, specular: 0xffffff, emissive: 0x141414 },
  gem: { shininess: 110, specular: 0xffffff, emissive: 0x1e1e1e },
  paint: { shininess: 55, specular: 0x6a6a6a, emissive: 0x000000 },
};

function finishOf(item: number): Finish {
  const kind = itemKind(item);
  if (kind === "oil") return "paint";
  const L = farmLook(oreOfItemId(item)?.key ?? "");
  if (L.kind === "gem") return "gem";
  if (kind === "ingot") return L.kind === "ore" ? "metal" : L.kind === "fruit" || L.kind === "chest" ? "satin" : "matte";
  return L.kind === "fruit" || L.kind === "ore" || L.kind === "chest" ? "satin" : "matte";
}

const looks = new Map<string, THREE.MeshPhongMaterial>();

/**
 * The item's material. The colours are in the geometry, so this is white and only sets the finish: matte straw,
 * wood and burlap, satin fruit and stone, polished metal bars, glinting gems, a painted fuel can. `color` (the
 * callers' `itemColor`) only tints an item that is not on the farm table.
 */
export function itemMaterial(item: number, color: number): THREE.Material {
  const known = itemKind(item) === "oil" || !!oreOfItemId(item);
  const finish = finishOf(item);
  const key = known ? finish : `plain|${color}`;
  let m = looks.get(key);
  if (m) return m;
  const f = FINISH[finish];
  m = new THREE.MeshPhongMaterial({
    color: known ? 0xffffff : color,
    specular: f.specular,
    shininess: f.shininess,
    emissive: f.emissive,
    vertexColors: true,
  });
  looks.set(key, m);
  return m;
}
