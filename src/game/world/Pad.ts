import * as THREE from "three";
import { makePad } from "../models";

/**
 * A floor zone the player activates by standing on it (the genre's only "button").
 *
 * - mode "hold":  fill for `holdTime` s while inside, fire `onComplete` once, then reset
 *                 when the player leaves (enter a vehicle, open a shop panel).
 * - mode "tick":  fire `onTick(dt)` every frame while inside (unload cargo, pay into a
 *                 buy pad, refuel) — the callee decides the pace.
 */
export class Pad {
  readonly root: THREE.Group;
  private fill: THREE.Mesh;
  progress = 0;
  inside = false;
  enabled = true;
  private fired = false;

  constructor(
    scene: THREE.Scene,
    readonly pos: THREE.Vector3,
    readonly size: number,
    color: number,
    readonly mode: "hold" | "tick",
    readonly holdTime = 0.6,
  ) {
    const p = makePad(size, color);
    this.root = p.root;
    this.fill = p.fill;
    this.root.position.copy(pos);
    scene.add(this.root);
  }

  onComplete: (() => void) | null = null;
  onTick: ((dt: number) => void) | null = null;
  onExit: (() => void) | null = null;

  contains(p: THREE.Vector3): boolean {
    const h = this.size / 2;
    return Math.abs(p.x - this.pos.x) <= h && Math.abs(p.z - this.pos.z) <= h;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
    this.enabled = v;
  }

  /** Show an external progress value (e.g. paid / price on a buy pad). */
  setFill(k: number): void {
    const s = Math.max(0.001, Math.min(1, k));
    this.fill.scale.set(s, 1, s);
  }

  update(dt: number, player: THREE.Vector3): void {
    if (!this.enabled) return;
    const now = this.contains(player);
    if (!now && this.inside) {
      this.onExit?.();
      this.fired = false;
      this.progress = 0;
      if (this.mode === "hold") this.setFill(0);
    }
    this.inside = now;
    if (!now) return;
    if (this.mode === "tick") {
      this.onTick?.(dt);
      return;
    }
    if (this.fired) return;
    this.progress = Math.min(1, this.progress + dt / this.holdTime);
    this.setFill(this.progress);
    if (this.progress >= 1) {
      this.fired = true;
      this.onComplete?.();
    }
  }
}
