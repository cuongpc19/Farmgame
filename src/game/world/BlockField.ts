import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { candyMaterial, candyUVs, type CandyPattern } from "./candyTex";

/** One minable cube on the grid. */
export interface Block {
  i: number;
  cx: number;
  cz: number;
  /** Ore type id from the stage data (0 = plain rock). */
  ore: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Seconds left on the hit "punch" animation. */
  punch: number;
  /** Mid-damage drops already released (one per 25 % HP lost). */
  drops: number;
}

export interface BlockLook {
  base: number;
  spot?: number;
  /** The candy the block is (Candy Miner). */
  pattern: CandyPattern;
  accent?: number;
  /** One of these per block, by its cell (pastel sugar cubes). */
  tints?: number[];
}

/** Crystal nuggets per ore block: [x, y, z] in cell units (y: 1 = top face), and size. */
/** Blocks per side of a culling chunk (one InstancedMesh per kind of block per chunk). */
const CHUNK = 8;

const NUGGETS: [number, number, number, number][] = [
  [-0.22, 1.0, -0.12, 1.1],
  [0.18, 1.0, 0.2, 0.85],
  [0.49, 0.62, -0.15, 0.9],
  [-0.1, 0.45, 0.49, 1.0],
];

/**
 * The quarry: one InstancedMesh per kind of block (a 40×40 field is a handful of draw calls),
 * each with its own painted stone texture (rock grain, cracks, bevelled edges; ore kinds add
 * mottled vein patches). Ore blocks also carry faceted crystal nuggets poking out of the top
 * and sides so a copper block reads as copper from the 3/4 camera.
 *
 * Damage feedback without per-block materials: the instance colour darkens with damage,
 * flashes white on each hit, and the instance squashes for 0.12 s.
 */
export class BlockField {
  readonly blocks: Block[] = [];
  private byCell = new Map<number, number>();
  private meshes: THREE.InstancedMesh[] = [];
  /** One textured material per kind of block (flying chunks reuse it). */
  private matOf = new Map<number, THREE.MeshPhongMaterial>();
  /** Meshes whose instances changed since the last upload. */
  private dirty = new Set<THREE.InstancedMesh>();
  /** Block index → [mesh, instance]. */
  private slotOf: [THREE.InstancedMesh, number][] = [];
  private veinMeshes: THREE.InstancedMesh[] = [];
  /** Per block: the nugget mesh of its chunk and the first of its NUGGETS slots (null = plain rock). */
  private veinSlot: ([THREE.InstancedMesh, number] | null)[] = [];
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private white = new THREE.Color(0xffffff);
  private aliveCount = 0;

  constructor(
    scene: THREE.Scene,
    cells: { cx: number; cz: number; ore: number; hp: number }[],
    readonly cell: number,
    private look: (ore: number) => BlockLook,
    private height = 1,
  ) {
    const geo = new RoundedBoxGeometry(cell * 0.97, height, cell * 0.97, 1, cell * 0.08);
    geo.translate(0, height / 2, 0);
    // Candy blocks: the top face and the sides show different halves of the candy texture (candyTex.ts).
    candyUVs(geo, cell * 0.97, height, cell * 0.97);
    // One mesh per (kind of block x CHUNK x CHUNK cells). An InstancedMesh is culled as a whole,
    // so one mesh per kind spanning the quarry drew all ~1200 blocks (and their nuggets, and
    // again into the shadow map) every frame; per chunk, what is off screen is skipped.
    const chunk = (c: { cx: number; cz: number }) => `${Math.floor(c.cx / CHUNK)},${Math.floor(c.cz / CHUNK)}`;
    const count = new Map<string, number>();
    const vcount = new Map<string, number>();
    for (const c of cells) {
      const k = `${c.ore}|${chunk(c)}`;
      count.set(k, (count.get(k) ?? 0) + 1);
      if (look(c.ore).spot !== undefined) vcount.set(chunk(c), (vcount.get(chunk(c)) ?? 0) + NUGGETS.length);
    }
    const material = (ore: number) => {
      let m = this.matOf.get(ore);
      if (!m) {
        const lk = look(ore);
        m = candyMaterial({ pattern: lk.pattern, base: lk.base, accent: lk.accent }, ore);
        this.matOf.set(ore, m);
      }
      return m;
    };
    const meshes = new Map<string, THREE.InstancedMesh>();
    for (const [k, n] of count) {
      const m = new THREE.InstancedMesh(geo, material(Number(k.split("|")[0])), n);
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      meshes.set(k, m);
      this.meshes.push(m);
      m.matrixAutoUpdate = false; // the object stays put; its instances carry the blocks
      scene.add(m);
    }
    // Faceted crystal nuggets on ore blocks, one mesh per chunk too.
    const vgeo = new THREE.OctahedronGeometry(cell * 0.1, 0);
    const vmat = new THREE.MeshLambertMaterial({ emissive: 0x2a2a2a, flatShading: true });
    const veins = new Map<string, THREE.InstancedMesh>();
    for (const [k, n] of vcount) {
      const m = new THREE.InstancedMesh(vgeo, vmat, n);
      m.castShadow = true;
      m.count = 0;
      veins.set(k, m);
      this.veinMeshes.push(m);
      m.matrixAutoUpdate = false; // the object stays put; its instances carry the blocks
      scene.add(m);
    }

    cells.forEach((c, i) => {
      this.blocks.push({ i, cx: c.cx, cz: c.cz, ore: c.ore, hp: c.hp, maxHp: c.hp, alive: true, punch: 0, drops: 0 });
      this.byCell.set(this.key(c.cx, c.cz), i);
      const m = meshes.get(`${c.ore}|${chunk(c)}`)!;
      this.slotOf.push([m, m.count++]);
      if (look(c.ore).spot !== undefined) {
        const vm = veins.get(chunk(c))!;
        this.veinSlot.push([vm, vm.count]);
        vm.count += NUGGETS.length;
      } else this.veinSlot.push(null);
    });
    this.aliveCount = cells.length;
    for (const b of this.blocks) this.writeBlock(b);
    this.flush();
    // Bounds from the instances (blocks never leave their cell; a little slack for the judder).
    for (const m of [...this.meshes, ...this.veinMeshes]) {
      m.computeBoundingSphere();
      m.boundingSphere!.radius += cell * 0.5;
    }
  }

  private flush(): void {
    for (const m of this.dirty) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.dirty.clear();
  }

  /** The textured material of one kind of block (flying chunks reuse it). */
  materialOf(ore: number): THREE.Material {
    return this.matOf.get(ore)!;
  }

  /** The pastel a tinted block (a sugar cube) wears, or undefined for a block in its texture's own colours. */
  tintOf(b: Block): number | undefined {
    const lk = this.look(b.ore);
    if (!lk.tints) return undefined;
    return lk.tints[(Math.abs(b.cx * 7919 + b.cz * 104729) >> 3) % lk.tints.length];
  }

  private tinted = new Map<string, THREE.Material>();

  /** The block's material in the block's own tint, for the pieces that fly off it (Shards). */
  shardMaterial(b: Block): THREE.Material {
    const m = this.materialOf(b.ore);
    const tint = this.tintOf(b);
    if (tint === undefined) return m;
    const key = `${b.ore}|${tint}`;
    let t = this.tinted.get(key);
    if (!t) {
      const c = (m as THREE.MeshPhongMaterial).clone();
      c.color.setHex(tint);
      this.tinted.set(key, (t = c));
    }
    return t;
  }

  get remaining(): number {
    return this.aliveCount;
  }

  private key(cx: number, cz: number): number {
    return cx * 100000 + cz;
  }

  center(b: Block, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(b.cx * this.cell, this.height / 2, b.cz * this.cell);
  }

  at(cx: number, cz: number): Block | null {
    const i = this.byCell.get(this.key(cx, cz));
    if (i === undefined) return null;
    const b = this.blocks[i];
    return b.alive ? b : null;
  }

  /** Alive blocks whose centre is within `r` of (x, z), nearest first. */
  near(x: number, z: number, r: number, out: Block[] = []): Block[] {
    out.length = 0;
    const c0x = Math.floor((x - r) / this.cell);
    const c1x = Math.ceil((x + r) / this.cell);
    const c0z = Math.floor((z - r) / this.cell);
    const c1z = Math.ceil((z + r) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++) {
        const b = this.at(cx, cz);
        if (!b) continue;
        const dx = cx * this.cell - x;
        const dz = cz * this.cell - z;
        if (dx * dx + dz * dz <= r * r) out.push(b);
      }
    out.sort((a, b) => (a.cx * this.cell - x) ** 2 + (a.cz * this.cell - z) ** 2 - ((b.cx * this.cell - x) ** 2 + (b.cz * this.cell - z) ** 2));
    return out;
  }

  /**
   * Push a circle (x, z, radius) out of every alive block it overlaps. Returns true if it
   * was pushed (i.e. the mover is grinding against the face — used to aim the auto-mine).
   */
  collide(p: THREE.Vector3, radius: number): boolean {
    let hit = false;
    const h = this.cell / 2;
    const cx0 = Math.floor((p.x - radius) / this.cell + 0.5) - 1;
    const cz0 = Math.floor((p.z - radius) / this.cell + 0.5) - 1;
    for (let cx = cx0; cx <= cx0 + 3; cx++)
      for (let cz = cz0; cz <= cz0 + 3; cz++) {
        if (!this.at(cx, cz)) continue;
        const bx = cx * this.cell;
        const bz = cz * this.cell;
        const qx = Math.max(bx - h, Math.min(p.x, bx + h));
        const qz = Math.max(bz - h, Math.min(p.z, bz + h));
        const dx = p.x - qx;
        const dz = p.z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          hit = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x += (dx / d) * (radius - d);
            p.z += (dz / d) * (radius - d);
          } else {
            // Centre inside the block: push out along the shallowest axis.
            const ox = p.x - bx;
            const oz = p.z - bz;
            if (Math.abs(ox) > Math.abs(oz)) p.x = bx + Math.sign(ox || 1) * (h + radius);
            else p.z = bz + Math.sign(oz || 1) * (h + radius);
          }
        }
      }
    return hit;
  }

  /** Apply damage; returns true if this hit broke the block. */
  damage(b: Block, amount: number): boolean {
    if (!b.alive) return false;
    b.hp -= amount;
    b.punch = 0.12;
    if (b.hp <= 0) {
      b.alive = false;
      this.aliveCount--;
    }
    this.writeBlock(b);
    return !b.alive;
  }

  /** Remove a block silently (restoring a saved quarry). */
  kill(b: Block): void {
    if (!b.alive) return;
    b.alive = false;
    b.hp = 0;
    this.aliveCount--;
    this.writeBlock(b);
  }

  update(dt: number): void {
    let dirty = false;
    for (const b of this.blocks) {
      if (b.punch > 0) {
        b.punch = Math.max(0, b.punch - dt);
        this.writeBlock(b);
        dirty = true;
      }
    }
    if (dirty) this.flush();
  }

  private writeBlock(b: Block): void {
    const d = this.dummy;
    const lk = this.look(b.ore);
    if (!b.alive) {
      // Collapsed where it stood (parking it far away would stretch the chunk's bounds).
      d.scale.setScalar(0);
      d.position.set(b.cx * this.cell, 0, b.cz * this.cell);
    } else {
      // A hit makes the block judder (not squash); worn blocks are a little chipped down.
      const p = b.punch / 0.12;
      const dmg = 1 - Math.max(0, b.hp) / b.maxHp;
      const jx = Math.sin(p * 37 + b.i) * 0.07 * p;
      const jz = Math.cos(p * 29 + b.i) * 0.07 * p;
      d.position.set(b.cx * this.cell + jx, -0.04 * p, b.cz * this.cell + jz);
      d.scale.set(1 - dmg * 0.07, 1 - dmg * 0.1, 1 - dmg * 0.07);
    }
    d.rotation.set(0, ((b.cx * 3 + b.cz * 5) % 4) * (Math.PI / 2), 0);
    d.updateMatrix();
    const [mesh, slot] = this.slotOf[b.i];
    mesh.setMatrixAt(slot, d.matrix);
    // The texture carries the rock colour; the instance colour only shades it: per-block
    // jitter (so a field doesn't look like a spreadsheet), darker with damage, white flash on hit.
    const dmg = 1 - Math.max(0, b.hp) / b.maxHp;
    const h = Math.abs(b.cx * 7919 + b.cz * 104729);
    const jit = 0.93 + ((h % 97) / 97) * 0.12;
    // Candy only darkens a little when hit (stone went 35 % darker: it read as rock).
    if (lk.tints) this.col.setHex(lk.tints[(h >> 3) % lk.tints.length]).multiplyScalar(jit * (1 - dmg * 0.12));
    else this.col.setScalar(jit * (1 - dmg * 0.12));
    if (b.punch > 0) this.col.lerp(this.white, (b.punch / 0.12) * 0.35);
    mesh.setColorAt(slot, this.col);
    this.dirty.add(mesh);

    const vs = this.veinSlot[b.i];
    if (lk.spot !== undefined && vs) {
      const [veins, v0] = vs;
      const p = b.punch / 0.12;
      // Mirror the layout per block so neighbours don't repeat.
      const fx = (b.cx + b.cz) % 2 ? -1 : 1;
      const fz = b.cz % 2 ? -1 : 1;
      for (let k = 0; k < NUGGETS.length; k++) {
        const [nx, ny, nz, ns] = NUGGETS[k];
        if (!b.alive) {
          d.scale.setScalar(0);
          d.position.set(b.cx * this.cell, 0, b.cz * this.cell);
        } else {
          d.scale.set(ns, ns * 1.5, ns);
          const dmg = 1 - Math.max(0, b.hp) / b.maxHp;
          d.position.set(b.cx * this.cell + nx * fx * this.cell * (1 - dmg * 0.07), this.height * ny * (1 - dmg * 0.1) - 0.04 * p, b.cz * this.cell + nz * fz * this.cell * (1 - dmg * 0.07));
        }
        d.rotation.set(0.5 + k, (k * 1.3 + b.i) % 3, 0.3 * k);
        d.updateMatrix();
        veins.setMatrixAt(v0 + k, d.matrix);
        veins.setColorAt(v0 + k, this.col.setHex(lk.spot).multiplyScalar(k % 2 ? 1.0 : 1.15));
      }
      this.dirty.add(veins);
    }
  }
}
