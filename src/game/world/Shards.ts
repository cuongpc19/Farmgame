import * as THREE from "three";

/**
 * Irregular rock-chunk shapes, shared by every shard: jittered icosahedra (lumps) and jittered
 * triangular slabs (the wedges a block splits into, reference; user 2026-10-22: bigger pieces).
 * Wedges come first in the list (`burst` with `wedge` picks from them).
 */
const WEDGES = 4;
function chunkGeometries(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 6 + WEDGES; k++) {
    const wedge = k < WEDGES;
    const g = wedge ? new THREE.CylinderGeometry(0.62, 0.62, 0.5, 3, 1) : new THREE.IcosahedronGeometry(0.5, 0);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const sx = wedge ? 0.9 + r() * 0.4 : 0.75 + r() * 0.5;
    const sy = wedge ? 0.6 + r() * 0.5 : 0.45 + r() * 0.4;
    const sz = wedge ? 0.7 + r() * 0.5 : 0.75 + r() * 0.5;
    // Same jitter for vertices that coincide, so the chunk stays closed.
    const jit = new Map<string, [number, number, number]>();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!jit.has(key)) jit.set(key, [(r() - 0.5) * 0.22, (r() - 0.5) * 0.22, (r() - 0.5) * 0.22]);
      const [jx, jy, jz] = jit.get(key)!;
      pos.setXYZ(i, pos.getX(i) * sx + jx, pos.getY(i) * sy + jy, pos.getZ(i) * sz + jz);
    }
    if (wedge) g.rotateZ(Math.PI / 2); // lying on its long face, the triangle standing up
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

interface Shard {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

/**
 * Chunks of rock that fly out of a block (reference: the block splits into a handful of big
 * textured pieces that tumble out, bounce and vanish; each hit also flicks small chips toward
 * the miner). Pieces use the block's own material, so they carry its stone / ore pattern.
 * Pooled meshes, simple ballistic motion with a ground bounce — no physics engine.
 */
export class Shards {
  private pool: Shard[] = [];
  private next = 0;
  private geos = chunkGeometries();
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private cap = 60) {}

  /**
   * Throw `n` chunks from `at`. `size` is the chunk diameter; `power` scales the speed;
   * `toward` (optional, horizontal) biases the throw direction (e.g. toward the miner): its
   * length is the pull, 1 = mostly that way. `flat` / `up` scale the sideways / upward speed.
   */
  burst(at: THREE.Vector3, material: THREE.Material, n: number, size: number, power = 1, toward?: THREE.Vector3, flat = 1, up = 1, wedge = false): void {
    for (let k = 0; k < n; k++) {
      const s = this.take();
      s.mesh.material = material;
      s.mesh.geometry = wedge ? this.geos[(this.next + k) % WEDGES] : this.geos[WEDGES + ((this.next + k) % (this.geos.length - WEDGES))];
      s.mesh.visible = true;
      s.mesh.position.copy(at).add(this.tmp.set((Math.random() - 0.5) * size, Math.random() * size * 0.6, (Math.random() - 0.5) * size));
      s.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const a = Math.random() * Math.PI * 2;
      let dx = Math.cos(a);
      let dz = Math.sin(a);
      if (toward) {
        dx = dx * 0.5 + toward.x;
        dz = dz * 0.5 + toward.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
      }
      const sp = (2.2 + Math.random() * 2.8) * power * flat;
      s.vel.set(dx * sp, (3.5 + Math.random() * 3.5) * power * up, dz * sp);
      s.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
      s.max = s.life = (wedge ? 1.3 : 0.9) + Math.random() * 0.6;
      s.size = size * (0.7 + Math.random() * 0.6);
      s.mesh.scale.setScalar(s.size);
    }
  }

  private take(): Shard {
    if (this.pool.length < this.cap) {
      const mesh = new THREE.Mesh(this.geos[0]);
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      const s = { mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, max: 1, size: 1 };
      this.pool.push(s);
      return s;
    }
    const s = this.pool[this.next];
    this.next = (this.next + 1) % this.cap;
    return s;
  }

  update(dt: number): void {
    for (const s of this.pool) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      s.vel.y -= 18 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const floor = s.size * 0.25;
      if (s.mesh.position.y < floor) {
        // Bounce with heavy damping; spin slows on each contact.
        s.mesh.position.y = floor;
        if (s.vel.y < 0) s.vel.y *= -0.3;
        s.vel.x *= 0.6;
        s.vel.z *= 0.6;
        s.spin.multiplyScalar(0.6);
      }
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      // Full size until the last 0.25 s, then shrink away.
      s.mesh.scale.setScalar(s.size * Math.min(1, s.life / 0.25));
    }
  }
}
