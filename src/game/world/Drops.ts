import * as THREE from "three";
import { PACE } from "../data";
import { ROCK_SHAPES, itemGeometry, itemHeight, itemMaterial } from "./itemGeo";

/**
 * Loose ore chunks on the ground: the same lumps they are on a back (`itemGeo`), so one
 * InstancedMesh per kind of item and lump shape, made when the first one drops.
 *
 * Life of a chunk: burst out of a broken block (fake ballistic physics, bounce, settle) →
 * rest on the ground → get pulled to a collector that has room → handed to the collector's
 * stack via `onCollect`. No physics engine: a chunk only ever hits the flat ground.
 */
export interface Drop {
  /** Slot in its kind's pool. */
  id: number;
  pool: Pool;
  item: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  state: "fly" | "rest" | "pull" | "dead";
  t: number;
  target: THREE.Object3D | null;
  onArrive: ((d: Drop) => void) | null;
  /** Where the chunk retreats to if it lands inside a solid block (the miner's side). */
  home: THREE.Vector3 | null;
}

interface Pool {
  mesh: THREE.InstancedMesh;
  free: number[];
  /** Highest slot in use + 1 (only that many instances are drawn). */
  used: number;
}

export class Drops {
  readonly list: Drop[] = [];
  private pools = new Map<number, Pool>();
  private dummy = new THREE.Object3D();
  private tmp = new THREE.Vector3();
  /** Height of a resting chunk's centre. */
  private rest = 0.13;

  /** Optional solidity test so chunks never come to rest inside an unbroken block. */
  blocked: ((x: number, z: number) => boolean) | null = null;

  constructor(private scene: THREE.Scene, private colorOf: (item: number) => number, private capacity = 600, private size = 0.26) {}

  /** The pool for one kind of item in one shape (made on first use). */
  private poolOf(item: number, shape: number): Pool {
    const key = item * 8 + shape;
    let p = this.pools.get(key);
    if (p) return p;
    const mesh = new THREE.InstancedMesh(itemGeometry(item, shape), itemMaterial(item, this.colorOf(item)), this.capacity);
    mesh.castShadow = true;
    // The instanced bounds are computed once, while every chunk is still hidden below the
    // map — culling against that stale sphere made all chunks blink out as the camera moved.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false; // instances move, the mesh object never does
    this.scene.add(mesh);
    p = { mesh, free: [], used: 0 };
    for (let i = this.capacity - 1; i >= 0; i--) {
      p.free.push(i);
      this.hide(p, i);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = 0;
    this.pools.set(key, p);
    this.rest = Math.max(this.rest, (itemHeight(item) * this.size) / 2);
    return p;
  }

  /** A free slot in the pool of `item`, or null when it is full. */
  private slot(item: number): { pool: Pool; id: number } | null {
    const pool = this.poolOf(item, Math.floor(Math.random() * ROCK_SHAPES));
    const id = pool.free.pop();
    if (id === undefined) return null;
    if (id + 1 > pool.used) pool.used = id + 1;
    return { pool, id };
  }

  get resting(): number {
    let n = 0;
    for (const d of this.list) if (d.state === "rest" || d.state === "fly") n++;
    return n;
  }

  /**
   * Burst `count` chunks of `item` out of a point (a block being mined). With `toward`,
   * chunks fan out on that side (±75°) — the side the miner stands on — so they land
   * where the miner can reach them.
   */
  burst(at: THREE.Vector3, item: number, count: number, power = 1, toward: THREE.Vector3 | null = null): void {
    const base = toward ? Math.atan2(toward.z - at.z, toward.x - at.x) : 0;
    for (let k = 0; k < count; k++) {
      const got = this.slot(item);
      if (!got) return;
      const a = toward ? base + (Math.random() - 0.5) * 2.6 : Math.random() * Math.PI * 2;
      const s = (1.4 + Math.random() * 1.6) * power;
      const d: Drop = {
        ...got,
        item,
        pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4)),
        vel: new THREE.Vector3(Math.cos(a) * s, 3.2 + Math.random() * 2.2, Math.sin(a) * s),
        rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0),
        spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        state: "fly",
        t: 0,
        target: null,
        onArrive: null,
        home: toward ? toward.clone() : null,
      };
      this.list.push(d);
    }
  }

  /** Put a chunk back on the ground at rest (restoring a saved quarry; one saved where it can't be picked up moves off). */
  place(item: number, x: number, z: number): void {
    const s = this.slot(item);
    if (!s) return;
    const d: Drop = {
      ...s,
      item,
      pos: new THREE.Vector3(x, this.rest, z),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0),
      spin: new THREE.Vector3(),
      state: "rest",
      t: 99,
      target: null,
      onArrive: null,
      home: null,
    };
    this.unstick(d);
    this.list.push(d);
  }

  /** Start pulling a resting chunk toward `target`; `onArrive` fires when it gets there. */
  pull(d: Drop, target: THREE.Object3D, onArrive: (d: Drop) => void): void {
    d.state = "pull";
    d.t = 0;
    d.target = target;
    d.onArrive = onArrive;
  }

  /** Resting (and, with `flying`, airborne) chunks within r of (x, z). */
  near(x: number, z: number, r: number, out: Drop[] = [], flying = false): Drop[] {
    out.length = 0;
    for (const d of this.list) {
      if (d.state !== "rest" && !(flying && d.state === "fly")) continue;
      const dx = d.pos.x - x;
      const dz = d.pos.z - z;
      if (dx * dx + dz * dz <= r * r) out.push(d);
    }
    return out;
  }

  update(dt: number): void {
    for (const d of this.list) {
      if (d.state === "fly") {
        d.t += dt;
        d.vel.y -= 18 * dt;
        d.pos.addScaledVector(d.vel, dt);
        d.rot.x += d.spin.x * dt;
        d.rot.y += d.spin.y * dt;
        d.rot.z += d.spin.z * dt;
        if (d.pos.y < this.rest) {
          d.pos.y = this.rest;
          if (Math.abs(d.vel.y) < 1.6) {
            d.state = "rest";
            d.t = 0;
            d.vel.set(0, 0, 0);
            this.unstick(d);
          } else {
            d.vel.y = -d.vel.y * 0.35;
            d.vel.x *= 0.55;
            d.vel.z *= 0.55;
            d.spin.multiplyScalar(0.5);
          }
        }
      } else if (d.state === "rest") {
        d.t += dt;
      } else if (d.state === "pull" && d.target) {
        // The hop onto a back runs on a faster clock than the original (PACE.pickup).
        const pdt = dt * PACE.pickup;
        d.t += pdt;
        d.target.getWorldPosition(this.tmp);
        // Accelerating homing with a little lift so the chunk arcs into the stack.
        const k = Math.min(1, pdt * (6 + d.t * 18));
        d.pos.lerp(this.tmp, k);
        d.pos.y += Math.sin(Math.min(1, d.t * 3) * Math.PI) * pdt * 3;
        d.rot.y += pdt * 10;
        if (d.pos.distanceToSquared(this.tmp) < 0.04 || d.t > 0.8) {
          d.state = "dead";
          d.onArrive?.(d);
        }
      }
      if (d.state === "dead") this.hide(d.pool, d.id);
      else {
        this.dummy.position.copy(d.pos);
        // Resting chunks lie flat (a slab on its face); flying ones tumble.
        if (d.state === "rest") this.dummy.rotation.set(0, d.rot.y, 0);
        else this.dummy.rotation.copy(d.rot);
        this.dummy.scale.setScalar(this.size * (d.state === "pull" ? Math.max(0.4, 1 - d.t) : 1));
        this.dummy.updateMatrix();
        d.pool.mesh.setMatrixAt(d.id, this.dummy.matrix);
      }
    }
    // Compact: return dead chunks to their pool (lowest slots are reused first).
    const freed = new Set<Pool>();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      if (d.state === "dead") {
        d.pool.free.push(d.id);
        this.list.splice(i, 1);
        freed.add(d.pool);
      }
    }
    for (const p of freed) {
      p.free.sort((a, b) => b - a);
      p.used = 0;
    }
    if (freed.size) for (const d of this.list) if (freed.has(d.pool)) d.pool.used = Math.max(d.pool.used, d.id + 1);
    for (const p of this.pools.values()) {
      p.mesh.count = p.used;
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * A chunk that settled where nobody can pick it up (`blocked`) walks back toward its miner, else
   * moves to the nearest open spot around it (rings out to 12 m; it stays put if there is none).
   */
  private unstick(d: Drop): void {
    const blocked = this.blocked;
    if (!blocked || !blocked(d.pos.x, d.pos.z)) return;
    const x0 = d.pos.x;
    const z0 = d.pos.z;
    if (d.home) {
      const dir = this.tmp.subVectors(d.home, d.pos).setY(0);
      const len = dir.length();
      if (len > 1e-3) {
        dir.multiplyScalar(1 / len);
        for (let i = 0; i < 24 && blocked(d.pos.x, d.pos.z); i++) d.pos.addScaledVector(dir, 0.35);
        if (!blocked(d.pos.x, d.pos.z)) return;
      }
    }
    for (let r = 0.4; r <= 12; r += 0.4)
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = x0 + Math.cos(a) * r;
        const z = z0 + Math.sin(a) * r;
        if (blocked(x, z)) continue;
        d.pos.x = x;
        d.pos.z = z;
        return;
      }
    d.pos.x = x0;
    d.pos.z = z0;
  }

  private hide(p: Pool, id: number): void {
    this.dummy.position.set(0, -100, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    p.mesh.setMatrixAt(id, this.dummy.matrix);
  }
}
