import * as THREE from "three";
import { CELL, type Placed } from "../data";
import { cottonTubGeometry, giftGeometry, gumballTubGeometry, macaronGeometry, tintedInstances, tintedMaterial, wrappedCandyGeometry } from "./candyScenery";

/**
 * A candy-shop yard on the stage 1 lawn (the frosting beside the base where cliff walls used to be): giant wrapped
 * gift boxes, towers of macarons or heaps of wrapped candies, and tubs of gumballs or cotton candy (Candy Miner,
 * 2026-10-28; Quarry Crush's yard of shipping containers, crates and barrels, user 2026-10-21: "put crates there that
 * can't be broken, it will look nicer"). Pure scenery: the lawn is not walkable, so nothing here can be reached or
 * broken.
 *
 * Each 4x4-cell lawn tile is split into two strips along a random axis; a strip holds a gift box (the container's
 * footprint; sometimes a small one sits on it) or a pile of sweets (the crate pile's) with tubs (the barrels'). The
 * layout is seeded by the tile, so it is the same on every load. One InstancedMesh per kind, two colours per copy
 * (`tintedMaterial`): five draw calls for the whole yard.
 */
const LAWN_TOP = -0.4;
const INSET = 0.9;
const GIFT = { l: 6.1, h: 2.6, w: 2.4 };
const CRATE = 1.15;
const TUB_R = 0.42;
/** Gift wrap (white dots on it) and ribbons. */
const WRAP = [0xff6fa5, 0x4fd1a5, 0xffc93c, 0x9b7bff, 0x5fb8ff, 0xff8fb8];
const RIBBON = [0xffffff, 0xe8395a, 0xffd166, 0x4fd1a5, 0x9b7bff, 0xff6fa5];
/** Macaron shells and fillings. */
const SHELL = [0xffa3c4, 0x9fe8cf, 0xffe08a, 0xcdb6ff, 0x9fd3ff, 0xffc29a, 0xfff3e2];
const FILLING = [0xfff3e2, 0xffffff, 0x8a5232, 0xff6fa5];
/** Wrapped candies, gumball tubs. */
const CANDY = [0xff5c8a, 0x4fd1a5, 0xffc93c, 0x9b7bff, 0x5fb8ff, 0xff8a3d];
/** Cotton candy and its tub. */
const FLUFF = [0xffb3d1, 0xa8d8ff, 0xd9c2ff, 0xb8f0dc];
const TUB = [0xff6fa5, 0x5fb8ff, 0x9b7bff, 0x4fd1a5];

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

interface Inst {
  m: THREE.Matrix4;
  a: number;
  b: number;
}

const pick = <T>(list: T[], r: () => number): T => list[Math.floor(r() * list.length)];
const lighter = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();

export function buildYard(lawn: Placed[], group: THREE.Group): void {
  if (!lawn.length) return;
  const gifts: Inst[] = [];
  const macarons: Inst[] = [];
  const candies: Inst[] = [];
  const gumballs: Inst[] = [];
  const cottons: Inst[] = [];
  const mac = macaronGeometry(1.05);
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const put = (list: Inst[], x: number, y: number, z: number, rotY: number, a: number, b: number, s = 1, tiltX = 0, tiltZ = 0) =>
    list.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(tiltX, rotY, tiltZ)).clone(), new THREE.Vector3(s, s, s)), a, b });

  for (const t of lawn) {
    // `r` drives the layout (as the old yard's), `v` the sweets' looks.
    const r = rng(t.x * 7919 + t.z * 104729);
    const v = rng(t.x * 104729 + t.z * 7919 + 17);
    const half = (t.w * CELL) / 2 - INSET;
    const alongX = r() < 0.5;
    // Two strips across the tile; positions are (along, across) in the tile's own axes.
    for (const side of [-1, 1]) {
      const across = side * half * 0.5;
      const toWorld = (a: number, b: number): [number, number] => (alongX ? [t.wx + a, t.wz + b] : [t.wx + b, t.wz + a]);
      const rot = alongX ? 0 : Math.PI / 2;
      if (r() < 0.65) {
        // A giant gift box, now and then a small one on top.
        const slack = half - GIFT.l / 2;
        const a = (r() * 2 - 1) * slack;
        const [x, z] = toWorld(a, across);
        const wrap = pick(WRAP, r);
        let ribbon = pick(RIBBON, v);
        if (ribbon === wrap) ribbon = 0xffffff;
        put(gifts, x, LAWN_TOP + GIFT.h / 2, z, rot, wrap, ribbon);
        if (r() < 0.3) {
          const s = 0.5;
          const w2 = pick(WRAP, r);
          const along = (v() - 0.5) * GIFT.l * 0.4;
          const [x2, z2] = toWorld(a + along, across);
          put(gifts, x2, LAWN_TOP + GIFT.h + (GIFT.h * s) / 2 + 0.02, z2, rot + (v() - 0.5) * 0.9, w2 === wrap ? pick(WRAP, v) : w2, pick(RIBBON, v), s);
        }
      } else {
        // A pile of sweets at one end of the strip (macaron towers or wrapped candies), tubs at the other.
        const end = r() < 0.5 ? -1 : 1;
        const levels = 1 + Math.floor(r() * 3);
        const towers = v() < 0.6;
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++) {
            const n = i + j === 0 ? levels : Math.max(1, levels - 1 - Math.floor(r() * 2));
            const [x, z] = toWorld(end * (half - CRATE * (i + 0.5) - 0.1), across + (j - 0.5) * (CRATE + 0.05));
            if (towers) {
              // Macarons, a few more than the crates were high (they are thinner), in mixed colours.
              const count = n + 1 + Math.floor(v() * 2);
              for (let k = 0; k < count; k++)
                put(macarons, x + (v() - 0.5) * 0.06, LAWN_TOP + mac.height * (k + 0.5), z + (v() - 0.5) * 0.06, v() * 6, pick(SHELL, v), pick(FILLING, v), 1, (v() - 0.5) * 0.08, (v() - 0.5) * 0.08);
            } else {
              for (let k = 0; k < n; k++) {
                const c = pick(CANDY, v);
                put(candies, x, LAWN_TOP + 0.24 + k * 0.4, z, v() * Math.PI, c, lighter(c, 0.45), 1, (v() - 0.5) * 0.3, (v() - 0.5) * 0.3);
              }
            }
          }
        // Tubs: gumballs or cotton candy, mostly one colour per group.
        const n = 3 + Math.floor(r() * 4);
        const cotton = v() < 0.45;
        const colour = cotton ? pick(FLUFF, r) : pick(CANDY, r);
        const tub = pick(TUB, v);
        for (let k = 0; k < n; k++) {
          const [x, z] = toWorld(-end * (half - 0.6 - (k % 3) * (TUB_R * 2.1)), across + (Math.floor(k / 3) - 0.5) * (TUB_R * 2.1));
          const yaw = r() * Math.PI;
          const c = r() < 0.8 ? colour : cotton ? pick(FLUFF, v) : pick(CANDY, v);
          if (cotton) put(cottons, x, LAWN_TOP, z, yaw, c, tub);
          else put(gumballs, x, LAWN_TOP, z, yaw, c, 0xffffff);
        }
      }
    }
  }

  const add = (geo: THREE.BufferGeometry, material: THREE.Material, list: Inst[]) => {
    const mesh = tintedInstances(geo, material, list);
    if (mesh) group.add(mesh);
    else geo.dispose();
  };
  add(giftGeometry(GIFT.l, GIFT.h, GIFT.w), tintedMaterial("dots", 30), gifts);
  add(mac.geo, tintedMaterial(null, 25), macarons);
  add(wrappedCandyGeometry(), tintedMaterial("swirl", 80), candies);
  add(gumballTubGeometry(TUB_R), tintedMaterial("stripes", 60), gumballs);
  add(cottonTubGeometry(TUB_R), tintedMaterial("stripes", 20), cottons);
}
