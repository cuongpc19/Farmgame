import * as THREE from "three";
import { mat } from "../models";

/**
 * Short-lived debris (pooled, instanced, no physics engine):
 * "chip" = small sparks/chips on every hit; "slab" = the big pieces a block splits into
 * when it breaks (reference: 4–6 slabs that tumble out and fade within ~1 s).
 */
export class Dust {
  private mesh: THREE.InstancedMesh;
  private p: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; size: number }[] = [];
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private next = 0;

  constructor(scene: THREE.Scene, private cap = 160, private kind: "chip" | "slab" = "chip") {
    // Chips are candy sprinkles (Candy Miner; they were rock splinters): little rounded sticks.
    const geo = kind === "slab" ? new THREE.BoxGeometry(1, 0.45, 0.8) : new THREE.CapsuleGeometry(0.06, 0.22, 2, 6);
    this.mesh = new THREE.InstancedMesh(geo, mat(0xffffff), cap);
    this.mesh.castShadow = kind === "slab";
    this.mesh.frustumCulled = false;
    for (let i = 0; i < cap; i++) {
      this.p.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 1 });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.matrixAutoUpdate = false; // instances move, the mesh object never does
    scene.add(this.mesh);
  }

  burst(at: THREE.Vector3, color: number, n = 6, power = 1): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      const q = this.p[i];
      const slab = this.kind === "slab";
      const spread = slab ? 1.6 : 0.8;
      q.pos.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * (slab ? 1.2 : 0.6), (Math.random() - 0.5) * spread));
      const a = Math.random() * Math.PI * 2;
      const s = (slab ? 2 + Math.random() * 2.5 : 1.5 + Math.random() * 3) * power;
      q.vel.set(Math.cos(a) * s, (slab ? 3 : 2) + Math.random() * 3 * power, Math.sin(a) * s);
      q.max = q.life = slab ? 0.9 + Math.random() * 0.3 : 0.35 + Math.random() * 0.35;
      q.size = slab ? 0.8 + Math.random() * 0.6 : 0.6 + Math.random() * 0.9;
      this.mesh.setColorAt(i, this.col.setHex(color).multiplyScalar(0.8 + Math.random() * 0.3));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      const q = this.p[i];
      if (q.life <= 0) continue;
      q.life -= dt;
      q.vel.y -= 14 * dt;
      q.pos.addScaledVector(q.vel, dt);
      if (q.pos.y < 0.05) {
        q.pos.y = 0.05;
        q.vel.multiplyScalar(0.4);
      }
      this.dummy.position.copy(q.pos);
      this.dummy.rotation.set(q.life * (this.kind === "slab" ? 4 : 9), q.life * 7, q.life * 3);
      // Slabs keep their size and shrink away only at the end; chips shrink all the way.
      const k = q.life / q.max;
      this.dummy.scale.setScalar(Math.max(0, this.kind === "slab" ? Math.min(1, k * 3.3) : k) * q.size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
