import * as THREE from "three";
import { floorText, padOutline } from "../world/props";

/**
 * A white rounded-square floor zone with a caption painted inside (REFINING, SELL, OPEN…).
 * Pure geometry + a point-in-square test; the owner decides what standing on it does.
 */
export class Zone {
  readonly root = new THREE.Group();
  private fill: THREE.Mesh;
  private caption: THREE.Mesh | null = null;
  private fillK = 0;

  constructor(
    parent: THREE.Object3D,
    readonly center: THREE.Vector3,
    readonly size: number,
    text: string,
    color = 0xffffff,
  ) {
    const p = padOutline(size, color);
    this.fill = p.fill;
    this.root.add(p.root);
    if (text) this.setText(text);
    this.root.position.copy(center);
    parent.add(this.root);
  }

  setText(text: string, color = "#ffffff"): void {
    if (this.caption) {
      this.root.remove(this.caption);
      (this.caption.material as THREE.MeshBasicMaterial).map?.dispose();
    }
    this.caption = floorText(text, this.size * 0.86, this.size * 0.34, { color });
    this.root.add(this.caption);
  }

  contains(p: THREE.Vector3, grow = 0): boolean {
    const h = this.size / 2 + grow;
    return Math.abs(p.x - this.center.x) <= h && Math.abs(p.z - this.center.z) <= h;
  }

  /** Progress fill 0..1 (hold-to-activate pads). */
  setFill(k: number): void {
    this.fillK = Math.max(0, Math.min(1, k));
    const s = Math.max(0.001, this.fillK);
    this.fill.scale.set(s, s, 1);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }
}
