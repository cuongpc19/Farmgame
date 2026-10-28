import * as THREE from "three";
import { CELL, type Placed } from "../data";
import {
  barrelGeometry,
  crateGeometry,
  haybaleGeometry,
  haystackGeometry,
  roundBaleGeometry,
  sackGeometry,
  tintedInstances,
  tintedMaterial,
  troughGeometry,
  woodpileGeometry,
} from "./farmScenery";

/**
 * A farmyard on the stage 1 lawn (the grass beside the base where cliff walls used to be; Farm Valley, 2026-10-28):
 * stacks of hay bales, round bales, rice-straw stacks round their poles, woodpiles, crates of produce, burlap sacks,
 * barrels and a water trough (Candy Miner's gift boxes and candy tubs before; Quarry Crush's shipping containers,
 * user 2026-10-21: "put crates there that can't be broken, it will look nicer"). Pure scenery: the lawn is not
 * walkable, so nothing here can be reached or broken.
 *
 * Each 4x4-cell lawn tile is split into two strips along a random axis; a strip holds a hay stack, a woodpile with
 * sacks, crates with barrels, or straw stacks with a trough. The layout is seeded by the tile, so it is the same on
 * every load. One InstancedMesh per kind, two colours per copy (`tintedMaterial`): eight draw calls for the yard.
 */
const LAWN_TOP = -0.4;
const INSET = 0.9;
const BALE = { l: 1.6, h: 0.8, w: 1.0 };

const HAY = [0xf0c85a, 0xe8bd4f, 0xf4d37a, 0xe6c060];
const TWINE = [0xd8572f, 0x3f74c4, 0xd8572f, 0x4f9a3a];
const BARK = [0x7a5232, 0x8a5a34, 0x6e4a2c];
const WOOD = [0xc89458, 0xb98448, 0xd2a066];
const PRODUCE = [0xe23b30, 0xf0862a, 0x8cc24a, 0xf3e3c6, 0xffcc33, 0x8a4fb8, 0xd8302c];
const BURLAP = [0xd9b98a, 0xceac78, 0xe2c79a];
const BARREL = [0xa8743f, 0x9a6a3c, 0xb5804a];

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

export function buildYard(lawn: Placed[], group: THREE.Group): void {
  if (!lawn.length) return;
  const kinds = { bales: [] as Inst[], rounds: [] as Inst[], stacks: [] as Inst[], wood: [] as Inst[], crates: [] as Inst[], sacks: [] as Inst[], barrels: [] as Inst[], troughs: [] as Inst[] };
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const put = (list: Inst[], x: number, y: number, z: number, rotY: number, a: number, b: number, s = 1, tiltX = 0, tiltZ = 0) =>
    list.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(tiltX, rotY, tiltZ)).clone(), new THREE.Vector3(s, s, s)), a, b });

  for (const t of lawn) {
    // `r` drives the layout, `v` the looks.
    const r = rng(t.x * 7919 + t.z * 104729);
    const v = rng(t.x * 104729 + t.z * 7919 + 17);
    const half = (t.w * CELL) / 2 - INSET;
    const alongX = r() < 0.5;
    // Two strips across the tile; positions are (along, across) in the tile's own axes.
    for (const side of [-1, 1]) {
      const across = side * half * 0.5;
      const toWorld = (a: number, b: number): [number, number] => (alongX ? [t.wx + a, t.wz + b] : [t.wx + b, t.wz + a]);
      const rot = alongX ? 0 : Math.PI / 2;
      const roll = r();
      if (roll < 0.34) {
        // A stack of hay bales: three or four end to end, two or three on them, maybe one on top; a round bale or two.
        const hay = pick(HAY, v);
        const twine = pick(TWINE, v);
        const n = 3 + Math.floor(r() * 2);
        const start = -half + 0.3;
        for (let row = 0; row < 3; row++) {
          const count = row === 0 ? n : row === 1 ? n - 1 - Math.floor(r() * 2) : r() < 0.5 ? 1 : 0;
          for (let i = 0; i < count; i++) {
            const a = start + BALE.l * (i + 0.5 + row * 0.5) + (v() - 0.5) * 0.1;
            const [x, z] = toWorld(a, across + (v() - 0.5) * 0.12);
            put(kinds.bales, x, LAWN_TOP + row * BALE.h, z, rot + (v() - 0.5) * 0.08, hay, twine);
          }
        }
        const k = 1 + Math.floor(r() * 2);
        for (let i = 0; i < k; i++) {
          const [x, z] = toWorld(half - 0.8 - i * 1.5, across + (v() - 0.5) * 0.6);
          put(kinds.rounds, x, LAWN_TOP, z, rot + Math.PI / 2 + (v() - 0.5) * 0.5, pick(HAY, v), 0xf6f2e6);
        }
      } else if (roll < 0.58) {
        // A woodpile at one end, sacks and a barrel at the other.
        const end = r() < 0.5 ? -1 : 1;
        const [x, z] = toWorld(end * (half - 1.6), across);
        put(kinds.wood, x, LAWN_TOP, z, rot + (v() - 0.5) * 0.1, pick(BARK, v), 0);
        if (r() < 0.5) {
          const [x2, z2] = toWorld(end * (half - 1.6) + 0.1, across + (end > 0 ? 1 : -1) * 0.05);
          put(kinds.wood, x2, LAWN_TOP + 0.6, z2, rot + 0.04, pick(BARK, v), 0, 0.7);
        }
        const n = 3 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const [sx, sz] = toWorld(-end * (half - 0.5 - (i % 3) * 0.9), across + (Math.floor(i / 3) - 0.3) * 0.95 + (v() - 0.5) * 0.2);
          put(kinds.sacks, sx, LAWN_TOP, sz, v() * Math.PI * 2, pick(BURLAP, v), 0x8a5a32, 0.9 + v() * 0.2, (v() - 0.5) * 0.2, (v() - 0.5) * 0.2);
        }
        const [bx, bz] = toWorld(-end * 0.6, across + 0.9);
        put(kinds.barrels, bx, LAWN_TOP, bz, v() * 6, pick(BARREL, v), 0);
      } else if (roll < 0.84) {
        // Crates of produce in stacks at one end, barrels at the other.
        const end = r() < 0.5 ? -1 : 1;
        const levels = 1 + Math.floor(r() * 2);
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++) {
            const n = i + j === 0 ? levels : Math.max(1, levels - Math.floor(r() * 2));
            const [x, z] = toWorld(end * (half - 0.6 - i * 1.12), across + (j - 0.5) * 0.86);
            const wood = pick(WOOD, v);
            for (let k = 0; k < n; k++) put(kinds.crates, x, LAWN_TOP + k * 0.6, z, rot + (v() - 0.5) * 0.12, wood, pick(PRODUCE, v));
          }
        const n = 2 + Math.floor(r() * 4);
        for (let k = 0; k < n; k++) {
          const [x, z] = toWorld(-end * (half - 0.55 - (k % 3) * 0.95), across + (Math.floor(k / 3) - 0.5) * 0.95);
          put(kinds.barrels, x, LAWN_TOP, z, r() * Math.PI, pick(BARREL, v), 0);
        }
      } else {
        // Rice-straw stacks round their poles, and a water trough.
        const n = 2 + Math.floor(r() * 2);
        for (let k = 0; k < n; k++) {
          const [x, z] = toWorld(-half + 1.2 + k * 2.1 + (v() - 0.5) * 0.4, across + (v() - 0.5) * 0.8);
          put(kinds.stacks, x, LAWN_TOP, z, v() * 6, pick(HAY, v), 0, 0.85 + v() * 0.3);
        }
        const [x, z] = toWorld(half - 1.4, across + (v() - 0.5) * 0.4);
        put(kinds.troughs, x, LAWN_TOP, z, rot, pick(BARREL, v), 0);
      }
    }
  }

  const add = (geo: THREE.BufferGeometry, material: THREE.Material, list: Inst[]) => {
    const mesh = tintedInstances(geo, material, list);
    if (mesh) group.add(mesh);
    else geo.dispose();
  };
  add(haybaleGeometry(BALE.l, BALE.h, BALE.w), tintedMaterial("straw", 6), kinds.bales);
  add(roundBaleGeometry(), tintedMaterial("straw", 6), kinds.rounds);
  add(haystackGeometry(), tintedMaterial("straw", 6), kinds.stacks);
  add(woodpileGeometry(), tintedMaterial(null, 6), kinds.wood);
  add(crateGeometry(), tintedMaterial("planks", 14), kinds.crates);
  add(sackGeometry(), tintedMaterial("weave", 4), kinds.sacks);
  add(barrelGeometry(), tintedMaterial("staves", 16), kinds.barrels);
  add(troughGeometry(), tintedMaterial("planks", 14), kinds.troughs);
}
