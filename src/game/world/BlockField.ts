import * as THREE from "three";
import type { FarmKind } from "../farm";
import { VIEW } from "./spriteNodes";

/** One harvestable cell on the grid: rice, a tree or a rock (Quarry Crush's minable cube). */
export interface Block {
  i: number;
  cx: number;
  cz: number;
  /** Ore type id from the stage data. */
  ore: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Seconds left on the hit animation (a tree sways, a rock judders). */
  punch: number;
  /** Mid-damage drops already released (one per 25 % HP lost). */
  drops: number;
  /** Direction away from the last one who hit it (radians, 0 = +z): a tree leans and falls that way. */
  away: number;
}

export interface BlockLook {
  /** Ore key (farm.ts). */
  key: string;
  kind: FarmKind;
}

/** The model of a cell: one geometry (origin at the ground centre) and its material, per ore key and variant. */
export interface NodeSource {
  model(key: string, variant: number): { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; depth?: THREE.Material; shadow?: boolean };
  variants(key: string): number;
  /**
   * Camera-facing pictures (spriteNodes.ts): never turned about the vertical, and a tree sways and falls in the picture's
   * plane (about the view direction) instead of toward the axe.
   */
  billboard?: boolean;
}

/**
 * Blocks per side of a culling chunk (one InstancedMesh per kind of cell per variant per chunk). 12, not Quarry Crush's
 * 8: farm fields mix more kinds and variants per chunk, and 8 doubled the draw calls (2026-10-28: 186 -> 350 at the base).
 */
const CHUNK = 12;
const PUNCH = 0.35;

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * The fields (farm game; Quarry Crush's quarry of cubes): one InstancedMesh per kind of cell, per model variant, per
 * 8x8-cell chunk, so what is off screen is culled and a big field is still a handful of draw calls. Each cell gets
 * its own turn and size from its position (rice only turns in quarter turns, so its paddy squares line up).
 *
 * Hit feedback without per-cell materials: a tree leans away from the axe and springs back, swaying; a rock
 * judders and wears down a little; every cell flashes a little brighter on a hit.
 */
export class BlockField {
  readonly blocks: Block[] = [];
  private byCell = new Map<number, number>();
  private meshes: THREE.InstancedMesh[] = [];
  /** Meshes whose instances changed since the last upload. */
  private dirty = new Set<THREE.InstancedMesh>();
  /** Block index → [mesh, instance]. */
  private slotOf: [THREE.InstancedMesh, number][] = [];
  /** Per block: its model variant. */
  private variantOf: number[] = [];
  private dummy = new THREE.Object3D();
  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private col = new THREE.Color();
  private aliveCount = 0;
  private chunkMats = new Map<string, THREE.Material>();

  constructor(
    scene: THREE.Scene,
    cells: { cx: number; cz: number; ore: number; hp: number }[],
    readonly cell: number,
    private look: (ore: number) => BlockLook,
    private source: NodeSource,
    private height = 1,
  ) {
    const variant = (c: { cx: number; cz: number; ore: number }) => {
      const n = Math.max(1, source.variants(look(c.ore).key));
      return (Math.abs(c.cx * 73856093 ^ c.cz * 19349663) >> 4) % n;
    };
    const chunk = (c: { cx: number; cz: number }) => `${Math.floor(c.cx / CHUNK)},${Math.floor(c.cz / CHUNK)}`;
    const keyOf = (c: { cx: number; cz: number; ore: number }) => `${c.ore}|${variant(c)}|${chunk(c)}`;
    const count = new Map<string, number>();
    for (const c of cells) count.set(keyOf(c), (count.get(keyOf(c)) ?? 0) + 1);
    const meshes = new Map<string, THREE.InstancedMesh>();
    for (const [k, n] of count) {
      const [ore, v] = k.split("|").map(Number);
      const { geo, mat, depth, shadow } = source.model(look(ore).key, v);
      const m = new THREE.InstancedMesh(geo, mat, n);
      if (depth) m.customDepthMaterial = depth;
      m.castShadow = shadow ?? true;
      m.receiveShadow = true;
      m.count = 0;
      meshes.set(k, m);
      this.meshes.push(m);
      m.matrixAutoUpdate = false; // the object stays put; its instances carry the cells
      scene.add(m);
    }
    cells.forEach((c, i) => {
      this.blocks.push({ i, cx: c.cx, cz: c.cz, ore: c.ore, hp: c.hp, maxHp: c.hp, alive: true, punch: 0, drops: 0, away: 0 });
      this.byCell.set(this.key(c.cx, c.cz), i);
      const m = meshes.get(keyOf(c))!;
      this.slotOf.push([m, m.count++]);
      this.variantOf.push(variant(c));
    });
    this.aliveCount = cells.length;
    for (const b of this.blocks) this.writeBlock(b);
    this.flush();
    // Bounds from the instances (cells never leave their spot; slack for canopies and the sway).
    for (const m of this.meshes) {
      m.computeBoundingSphere();
      m.boundingSphere!.radius += cell * 1.5;
    }
  }

  private flush(): void {
    for (const m of this.dirty) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.dirty.clear();
  }

  /** What a cell is (rice, a kind of tree, a rock). */
  lookOf(b: Block): BlockLook {
    return this.look(b.ore);
  }

  /** The cell's model and how it stands (turn and size): the falling tree and the cut rice copy it (Felled). */
  pose(b: Block): { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; depth?: THREE.Material; yaw: number; scale: number; flip: boolean; billboard: boolean } {
    const { geo, mat, depth } = this.source.model(this.look(b.ore).key, this.variantOf[b.i]);
    const { yaw, scale, flip } = this.stance(b);
    return { geo, mat, depth, yaw, scale, flip, billboard: !!this.source.billboard };
  }

  /** A plain material in one colour for the bits that fly off a cell (rock chips), cached per colour. */
  chipMaterial(color: number): THREE.Material {
    const k = String(color);
    let m = this.chunkMats.get(k);
    if (!m) this.chunkMats.set(k, (m = new THREE.MeshLambertMaterial({ color, flatShading: true })));
    return m;
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

  /** Apply damage from someone at `from` (optional); returns true if this hit broke the block. */
  damage(b: Block, amount: number, from?: { x: number; z: number }): boolean {
    if (!b.alive) return false;
    b.hp -= amount;
    b.punch = PUNCH;
    if (from) b.away = Math.atan2(b.cx * this.cell - from.x, b.cz * this.cell - from.z);
    if (b.hp <= 0) {
      b.alive = false;
      this.aliveCount--;
    }
    this.writeBlock(b);
    return !b.alive;
  }

  /** Remove a block silently (restoring a saved field). */
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

  /** The cell's own turn and size, from where it is (rice in quarter turns). */
  /** `flip`: a picture shown mirrored (half the cells, by position), so a row of the same tree does not repeat. */
  private stance(b: Block): { yaw: number; scale: number; flip: boolean } {
    const h = Math.abs(b.cx * 7919 + b.cz * 104729);
    const crop = this.look(b.ore).kind === "crop";
    const scale = crop ? 1 : 0.9 + ((h >> 5) % 21) / 100;
    if (this.source.billboard) return { yaw: 0, scale, flip: ((h >> 7) & 1) === 1 };
    return { yaw: crop ? ((h >> 2) % 4) * (Math.PI / 2) : ((h >> 2) % 16) * (Math.PI / 8), scale, flip: false };
  }

  private writeBlock(b: Block): void {
    const d = this.dummy;
    const lk = this.look(b.ore);
    const { yaw, scale, flip } = this.stance(b);
    const p = b.punch / PUNCH;
    const dmg = 1 - Math.max(0, b.hp) / b.maxHp;
    this.qa.setFromAxisAngle(Y_AXIS, yaw);
    if (!b.alive) {
      // Gone where it stood (parking it far away would stretch the chunk's bounds).
      d.scale.setScalar(0);
      d.position.set(b.cx * this.cell, 0, b.cz * this.cell);
      d.quaternion.copy(this.qa);
    } else if (lk.kind === "wood" || lk.kind === "fruit") {
      // A tree leans away from the axe, then sways back and forth as it settles (pivot at the foot).
      const tilt = Math.sin((1 - p) * Math.PI * 3) * 0.11 * p;
      // A picture leans in its own plane: toward the screen side the axe drove it (+x world is screen right).
      if (this.source.billboard) this.qb.setFromAxisAngle(VIEW, Math.sin(b.away) >= 0 ? -tilt : tilt);
      else this.qb.setFromAxisAngle(this.axis.set(Math.cos(b.away), 0, -Math.sin(b.away)), tilt);
      d.quaternion.multiplyQuaternions(this.qb, this.qa);
      d.position.set(b.cx * this.cell, 0, b.cz * this.cell);
      d.scale.setScalar(scale);
    } else {
      // A rock (or a crop) judders on a hit and wears down a little.
      const jx = Math.sin(p * 37 + b.i) * 0.07 * p;
      const jz = Math.cos(p * 29 + b.i) * 0.07 * p;
      d.position.set(b.cx * this.cell + jx, -0.04 * p, b.cz * this.cell + jz);
      d.quaternion.copy(this.qa);
      d.scale.set(scale * (1 - dmg * 0.08), scale * (1 - dmg * 0.12), scale * (1 - dmg * 0.08));
    }
    if (flip) d.scale.x = -d.scale.x;
    d.updateMatrix();
    const [mesh, slot] = this.slotOf[b.i];
    mesh.setMatrixAt(slot, d.matrix);
    // The model carries the colours; the instance colour only shades it: a little per-cell jitter (so a field doesn't
    // look like a spreadsheet) and a brief brighter flash on a hit.
    const h = Math.abs(b.cx * 7919 + b.cz * 104729);
    this.col.setScalar(0.94 + ((h % 97) / 97) * 0.1);
    if (b.punch > 0) this.col.multiplyScalar(1 + Math.min(1, p * 1.6) * 0.3);
    mesh.setColorAt(slot, this.col);
    this.dirty.add(mesh);
  }
}
