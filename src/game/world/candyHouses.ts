import * as THREE from "three";
import { mat } from "../models";

/**
 * Gingerbread buildings (Candy Miner, 2026-10-28; Mars Miner used Kenney's Space Kit): gingerbread walls with icing on
 * the corners, a gable roof of frosting in the building's colour with icing dripping off the eaves and gumdrops on the
 * ridge, a chocolate door, lemon windows and candy-cane posts. All plain coloured primitives, so the caller can bake
 * them into a few vertex-coloured meshes (`bakeColors`) and freeze them.
 */
const GINGER = 0xc47a42;
const GINGER_DARK = 0x95562b;
const ICING = 0xffffff;
const CHOCO = 0x5e3424;
const LEMON = 0xfff1a8;
export const GUMS = [0xff5c8a, 0x4fd1a5, 0xffc93c, 0x9b7bff, 0x5fb8ff, 0xff8a3d];

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
function part(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, opts?: Parameters<typeof mat>[1]): THREE.Mesh {
  const me = new THREE.Mesh(geo, mat(color, opts));
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

/** A red-and-white candy cane post of height `h`, standing at (x, z). */
export function candyCane(h: number, x: number, z: number, r = 0.12): THREE.Group {
  const g = new THREE.Group();
  const n = 7;
  for (let i = 0; i < n; i++) g.add(part(new THREE.CylinderGeometry(r, r, h / n, 10), i % 2 ? ICING : 0xe8395a, x, (i + 0.5) * (h / n), z));
  // The hook.
  const hook = part(new THREE.TorusGeometry(r * 2.2, r, 8, 12, Math.PI), 0xe8395a, x + r * 2.2, h, z);
  g.add(hook);
  return g;
}

export interface HouseOpts {
  w: number;
  d: number;
  /** Wall height (the roof rises `roofH` above it). */
  h: number;
  roofH?: number;
  roof: number;
  chimneys?: number[];
  canes?: boolean;
  windows?: boolean;
  door?: boolean;
}

/**
 * A gingerbread house on the ground, front face (door, windows) at z = +d / 2, centred on x. The ridge runs along x,
 * so the camera (looking north) sees the front wall and the front slope of the roof. Returns the chimney tops (smoke).
 */
export function gingerHouse(o: HouseOpts): { root: THREE.Group; chimneyTops: THREE.Object3D[]; top: number } {
  const root = new THREE.Group();
  const { w, d, h } = o;
  const rh = o.roofH ?? h * 0.6;
  root.add(part(box(w, h, d), GINGER, 0, h / 2, 0));
  root.add(part(box(w + 0.16, 0.2, d + 0.16), GINGER_DARK, 0, 0.1, 0));
  // Icing: corners and the band under the eaves.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) root.add(part(box(0.16, h, 0.16), ICING, (sx * w) / 2, h / 2, (sz * d) / 2));
  root.add(part(box(w + 0.1, 0.14, d + 0.1), ICING, 0, h - 0.05, 0));
  // Gable ends (front and back): gingerbread triangles. The ridge runs front to back, so the camera (looking north,
  // from above) sees the classic house shape: wall, triangle, two roof slopes.
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0);
  tri.lineTo(w / 2, 0);
  tri.lineTo(0, rh);
  tri.closePath();
  for (const sz of [-1, 1]) {
    const geo = new THREE.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false });
    root.add(part(geo, GINGER, 0, h, sz > 0 ? d / 2 - 0.12 : -d / 2));
  }
  // Roof slopes: frosting slabs with an overhang left and right and over the gables.
  const over = 0.35;
  const run = w / 2 + over;
  const ang = Math.atan2(rh, w / 2);
  const len = run / Math.cos(ang);
  const deep = d + over * 2;
  for (const sx of [-1, 1]) {
    const slab = part(box(len, 0.24, deep), o.roof, (sx * run) / 2, h + rh - (run * Math.tan(ang)) / 2 + 0.1, 0);
    slab.rotation.z = -sx * ang;
    root.add(slab);
  }
  // Piped icing along the two front roof edges (dots), and drips off the side eaves.
  const fz = d / 2 + over - 0.02;
  for (const sx of [-1, 1])
    for (let k = 0.04; k < 1; k += 0.09) {
      const x = sx * run * k;
      const y = h + rh + 0.24 - run * k * Math.tan(ang);
      root.add(part(new THREE.SphereGeometry(0.11, 8, 6), ICING, x, y, fz));
    }
  const eaveY = h + rh + 0.1 - run * Math.tan(ang);
  for (const sx of [-1, 1])
    for (let z = -deep / 2 + 0.25, i = 0; z < deep / 2 - 0.2; z += 0.5, i++) {
      const l = 0.16 + ((i * 37) % 5) * 0.06;
      const x = sx * (run - 0.05);
      root.add(part(new THREE.CylinderGeometry(0.07, 0.07, l, 6), ICING, x, eaveY - l / 2, z));
      root.add(part(new THREE.SphereGeometry(0.085, 8, 6), ICING, x, eaveY - l, z));
    }
  // Gumdrops along the ridge, front to back.
  const n = Math.max(3, Math.round(deep / 0.75));
  for (let i = 0; i < n; i++) {
    const z = -deep / 2 + (deep * (i + 0.5)) / n;
    root.add(part(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), GUMS[i % GUMS.length], 0, h + rh + 0.18, z));
  }
  // Door with an icing frame, windows with icing crosses.
  if (o.door !== false) {
    const dw = Math.min(w * 0.24, 1.3);
    const dh = h * 0.62;
    root.add(part(box(dw + 0.24, dh + 0.12, 0.08), ICING, 0, dh / 2, d / 2 + 0.03));
    root.add(part(box(dw, dh, 0.1), CHOCO, 0, dh / 2, d / 2 + 0.05));
    root.add(part(new THREE.SphereGeometry(0.08, 8, 6), 0xffc93c, dw * 0.3, dh * 0.5, d / 2 + 0.12));
  }
  if (o.windows !== false)
    for (const sx of [-1, 1]) {
      const ww = Math.min(w * 0.17, 0.9);
      const x = sx * w * 0.32;
      const y = h * 0.58;
      root.add(part(box(ww + 0.18, ww + 0.18, 0.06), ICING, x, y, d / 2 + 0.02));
      root.add(part(box(ww, ww, 0.08), LEMON, x, y, d / 2 + 0.04, { emissive: 0x4a3a10 }));
      root.add(part(box(0.06, ww, 0.1), ICING, x, y, d / 2 + 0.06));
      root.add(part(box(ww, 0.06, 0.1), ICING, x, y, d / 2 + 0.06));
    }
  if (o.canes !== false) for (const sx of [-1, 1]) root.add(candyCane(h * 0.75, sx * (w / 2 + 0.25), d / 2 + 0.25));
  // Chimneys (x positions), brown with an icing top; their tops are returned for smoke.
  const chimneyTops: THREE.Object3D[] = [];
  for (const cx of o.chimneys ?? []) {
    const ch = h + rh * 0.9;
    root.add(part(box(0.55, ch - h * 0.6, 0.55), GINGER_DARK, cx, h * 0.6 + (ch - h * 0.6) / 2, -d * 0.12));
    root.add(part(box(0.7, 0.16, 0.7), ICING, cx, ch, -d * 0.12));
    const tip = new THREE.Object3D();
    tip.position.set(cx, ch + 0.2, -d * 0.12);
    root.add(tip);
    chimneyTops.push(tip);
  }
  return { root, chimneyTops, top: h + rh };
}

/** A giant syrup bottle (the fuel tank of Mars Miner's fuel station): amber body, a label band, a red cap. */
export function syrupBottle(r: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(r, r, h * 0.7, 18), 0xd9822b, 0, h * 0.35, 0));
  g.add(part(new THREE.CylinderGeometry(r * 1.02, r * 1.02, h * 0.22, 18), 0xfff4e6, 0, h * 0.36, 0));
  g.add(part(new THREE.CylinderGeometry(r * 0.45, r, h * 0.16, 18), 0xd9822b, 0, h * 0.78, 0));
  g.add(part(new THREE.CylinderGeometry(r * 0.48, r * 0.48, h * 0.12, 14), 0xe8395a, 0, h * 0.92, 0));
  return g;
}

/** A small jar of syrup (the barrel stack beside the pump). */
export function syrupJar(r: number, h: number, lid: number): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(r, r, h, 12), 0xe0913a, 0, h / 2, 0));
  g.add(part(new THREE.CylinderGeometry(r * 1.05, r * 1.05, h * 0.18, 12), lid, 0, h + h * 0.06, 0));
  return g;
}
