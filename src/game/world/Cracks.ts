import * as THREE from "three";
import type { Block } from "./BlockField";

/**
 * Crack decals on the top face of damaged blocks, in 3 visible steps (reference: dark
 * crack lines spreading across the top as HP drops). One InstancedMesh per step, each
 * holding only the blocks currently at that step — a handful at a time.
 */
function crackTexture(step: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(30,24,20,0.85)";
  g.lineCap = "round";
  // Deterministic pseudo-random so the pattern is stable.
  let seed = 7 + step * 13;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const branches = [2, 4, 7][step - 1];
  for (let b = 0; b < branches; b++) {
    let x = 64 + (rnd() - 0.5) * 30;
    let y = 64 + (rnd() - 0.5) * 30;
    let a = rnd() * Math.PI * 2;
    g.lineWidth = 3.2 - b * 0.25;
    g.beginPath();
    g.moveTo(x, y);
    const segs = 4 + step * 2;
    for (let i = 0; i < segs; i++) {
      a += (rnd() - 0.5) * 1.2;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Cracks {
  private meshes: THREE.InstancedMesh[] = [];
  private stage = new Map<Block, number>();
  private dirty = false;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, private cell: number, private height: number, cap = 48) {
    const geo = new THREE.PlaneGeometry(cell * 0.92, cell * 0.92);
    geo.rotateX(-Math.PI / 2);
    for (let s = 1; s <= 3; s++) {
      const m = new THREE.MeshBasicMaterial({ map: crackTexture(s), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const im = new THREE.InstancedMesh(geo, m, cap);
      im.count = 0;
      im.frustumCulled = false;
      scene.add(im);
      this.meshes.push(im);
    }
  }

  /** Set a block's crack step (0 = none, 1..3). */
  set(b: Block, step: number): void {
    const s = Math.max(0, Math.min(3, step));
    if ((this.stage.get(b) ?? 0) === s) return;
    if (s === 0) this.stage.delete(b);
    else this.stage.set(b, s);
    this.dirty = true;
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const counts = [0, 0, 0];
    for (const [b, s] of this.stage) {
      if (!b.alive) {
        this.stage.delete(b);
        continue;
      }
      const im = this.meshes[s - 1];
      if (counts[s - 1] >= im.instanceMatrix.count) continue;
      this.dummy.position.set(b.cx * this.cell, this.height + 0.01, b.cz * this.cell);
      this.dummy.rotation.set(0, ((b.cx * 3 + b.cz * 7) % 4) * (Math.PI / 2), 0);
      this.dummy.updateMatrix();
      im.setMatrixAt(counts[s - 1]++, this.dummy.matrix);
    }
    this.meshes.forEach((im, i) => {
      im.count = counts[i];
      im.instanceMatrix.needsUpdate = true;
    });
  }
}
