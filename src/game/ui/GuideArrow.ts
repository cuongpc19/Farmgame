import * as THREE from "three";

/**
 * Green ground chevrons leading from the player toward the current quest target (the
 * reference game's guide trail). Hidden when the target is close or there is none.
 */
export class GuideArrow {
  private group = new THREE.Group();
  private chevrons: THREE.Mesh[] = [];
  private t = 0;
  private target: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.55);
    shape.lineTo(0.5, -0.25);
    shape.lineTo(0.22, -0.25);
    shape.lineTo(0, 0.12);
    shape.lineTo(-0.22, -0.25);
    shape.lineTo(-0.5, -0.25);
    shape.lineTo(0, 0.55);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0x46e04a, transparent: true, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(geo, m.clone());
      c.scale.setScalar(1.3);
      this.chevrons.push(c);
      this.group.add(c);
    }
    scene.add(this.group);
  }

  set(target: THREE.Vector3 | null): void {
    this.target = target;
  }

  update(dt: number, from: THREE.Vector3): void {
    if (!this.target) {
      this.group.visible = false;
      return;
    }
    const dx = this.target.x - from.x;
    const dz = this.target.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.5) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.t = (this.t + dt * 1.6) % 1;
    const ux = dx / d;
    const uz = dz / d;
    const ang = Math.atan2(ux, uz);
    const span = Math.min(d - 1.5, 7);
    this.chevrons.forEach((c, i) => {
      const k = (i + this.t) / this.chevrons.length;
      const s = 1.6 + k * span;
      c.position.set(from.x + ux * s, 0.08, from.z + uz * s);
      // ShapeGeometry points +y → after rotateX it points −z; rotate to face the target.
      c.rotation.y = ang + Math.PI;
      (c.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.95;
    });
  }
}
