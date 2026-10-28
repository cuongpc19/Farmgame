import * as THREE from "three";
import { itemKind, oreOfItemId } from "../data";
import { mat } from "../models";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Shared geometries for carried / flying items, by kind:
 * mineral = a raw lump of ore, ingot = cast bar, oil = barrel.
 * Sizes are for a nominal item size of 1 (callers scale).
 */

/** Bake a brightness per vertex into its colour (white = the material colour): `light(normal, position)`. */
function shade(g: THREE.BufferGeometry, light: (n: THREE.Vector3, p: THREE.Vector3) => number): THREE.BufferGeometry {
  const nrm = g.getAttribute("normal") as THREE.BufferAttribute;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const col = new Float32Array(nrm.count * 3);
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < nrm.count; i++) {
    const v = light(n.fromBufferAttribute(nrm, i), p.fromBufferAttribute(pos, i));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
/** Soft light from above for smooth candy: a lit top, gently darker underneath. */
const soft = (n: THREE.Vector3) => 0.82 + 0.38 * Math.max(0, n.y) - 0.12 * Math.max(0, -n.y);

/** Merge parts that each carry their own colour attribute. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const p of flat) for (const k of Object.keys(p.attributes)) if (k !== "position" && k !== "normal" && k !== "color") p.deleteAttribute(k);
  return mergeGeometries(flat)!;
}

/**
 * Candy as it comes off a block (Candy Miner; Mars Miner and Quarry Crush had jagged lumps of rock): three sweets so
 * a pile never repeats, smooth and glossy: a wrapped bonbon with twisted ends, a round drop, a star.
 */
const ROCKS = [0, 1, 2].map((k) => {
  if (k === 0) {
    const body = new THREE.SphereGeometry(0.42, 14, 10);
    body.scale(1.15, 0.8, 0.8);
    shade(body, soft);
    const ends = [-1, 1].map((sx) => {
      const twist = new THREE.ConeGeometry(0.26, 0.34, 8, 1);
      twist.rotateZ((sx * Math.PI) / 2);
      twist.translate(sx * 0.62, 0, 0);
      // The wrapper's twists: lighter, like crinkled clear paper.
      return shade(twist, (n) => 1.35 + 0.2 * Math.max(0, n.y));
    });
    return merge([body, ...ends]);
  }
  if (k === 1) {
    const drop = new THREE.SphereGeometry(0.45, 16, 12);
    drop.scale(1.0, 0.82, 1.0);
    // A shine band round the top so it reads as hard candy.
    return shade(drop, (n) => soft(n) + (n.y > 0.55 && n.y < 0.8 ? 0.35 : 0));
  }
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rad = i % 2 ? 0.22 : 0.5;
    if (i === 0) star.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else star.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  star.closePath();
  const g = new THREE.ExtrudeGeometry(star, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeVertexNormals();
  return merge([shade(g, soft)]);
});
/**
 * A cooked treat (Candy Miner; the ingot): a candy bar in a wrapper, a label band round the middle and crimped
 * ends, brighter than the wrapper.
 */
const bar = (() => {
  const body = new RoundedBoxGeometry(1.0, 0.42, 0.56, 2, 0.1);
  shade(body, soft);
  const band = new THREE.BoxGeometry(0.34, 0.46, 0.6);
  shade(band, (n) => 1.55 + 0.2 * Math.max(0, n.y));
  const ends = [-1, 1].map((sx) => {
    const e = new THREE.BoxGeometry(0.14, 0.3, 0.6);
    e.translate(sx * 0.56, 0, 0);
    return shade(e, (n) => 1.3 + 0.15 * Math.max(0, n.y));
  });
  return merge([body, band, ...ends]);
})();
const barrel = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 10);

/** Raw-ore lumps come in `ROCKS.length` shapes; `variant` picks one (any integer). */
export function itemGeometry(item: number, variant = 0): THREE.BufferGeometry {
  const k = itemKind(item);
  return k === "ingot" ? bar : k === "oil" ? barrel : ROCKS[Math.abs(variant) % ROCKS.length];
}
export const ROCK_SHAPES = ROCKS.length;

const heights = new Map<THREE.BufferGeometry, number>();

/**
 * How tall one item stands at size 1 (piles stack each layer on the one below). Lumps count a
 * little less than their full height: they settle into each other.
 */
export function itemHeight(item: number): number {
  const k = itemKind(item);
  const g = itemGeometry(item);
  let h = heights.get(g);
  if (h === undefined) {
    const all = k === "mineral" ? ROCKS : [g];
    h = Math.max(...all.map((x) => (x.computeBoundingBox(), x.boundingBox!.max.y - x.boundingBox!.min.y)));
    if (k === "mineral") h *= 0.88;
    for (const x of all) heights.set(x, h);
  }
  return h;
}

const feet = new Map<THREE.BufferGeometry, [number, number]>();

/** Ground footprint of one item at size 1, [along x, along z] (piles space their columns by it). */
export function itemFootprint(item: number): [number, number] {
  const g = itemGeometry(item);
  let f = feet.get(g);
  if (!f) {
    g.computeBoundingBox();
    const s = g.boundingBox!.getSize(new THREE.Vector3());
    feet.set(g, (f = [s.x, s.z]));
  }
  return f;
}

const looks = new Map<string, THREE.MeshPhongMaterial>();

/**
 * Raw ore: plain stone (`rock` ores) is matte in its rock colour; ore with a vein is a glossy lump
 * in the vein colour (reference: blue crystal lumps, red-brown copper, white silver nuggets).
 * Ingots: a deeper, richer take on the ingot colour; metals and jewels polished, stone bricks
 * nearly matte. Barrels are matte.
 */
export function itemMaterial(item: number, color: number): THREE.Material {
  const kind = itemKind(item);
  if (kind === "oil") return mat(color);
  const o = oreOfItemId(item);
  const stone = !o || o.category === "rock";
  const key = `${kind}|${color}|${stone}`;
  let m = looks.get(key);
  if (m) return m;
  const c = new THREE.Color(kind === "mineral" ? (o?.pattern === "sugar" ? 0xffb3cf : (o?.vein ?? o?.rock ?? color)) : color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (kind === "ingot") c.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), hsl.l * 0.8);
  else if (!stone) c.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), hsl.l * 0.85);
  else c.setHSL(hsl.h, hsl.s, hsl.l * 0.92);
  // Candy is smooth and glossy (Candy Miner; the stone lumps were flat-shaded and matte).
  m = new THREE.MeshPhongMaterial({
    color: c,
    emissive: c.clone().multiplyScalar(kind === "ingot" ? 0.1 : 0.08),
    specular: kind === "ingot" ? 0xffffff : 0x888888,
    shininess: kind === "ingot" ? 70 : 60,
    vertexColors: true,
  });
  looks.set(key, m);
  return m;
}
