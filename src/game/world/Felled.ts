import * as THREE from "three";
import { VIEW } from "./spriteNodes";

interface Fall {
  mesh: THREE.Mesh;
  kind: "tree" | "crop";
  /** Direction it falls (radians, 0 = +z). */
  away: number;
  yaw: number;
  scale: number;
  t: number;
  /** Where the fall lands: a light pop of dust there (`onLand`). */
  landed: boolean;
  /** A camera-facing picture: it falls in its own plane (to the screen side the axe drove it). */
  billboard: boolean;
  /** Shown mirrored, as the cell was (BlockField). */
  flip: boolean;
  x: number;
  z: number;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TREE_FALL = 0.62;
const TREE_LIE = 0.3;
const TREE_GONE = 0.45;
const CROP_GONE = 0.32;

const easeIn = (t: number) => t * t * t;

/**
 * The last blow (farm game, user 2026-10-28; the farm-games research: "the tree tips away from the player"): a felled
 * tree topples away from the axe, gathering speed, bounces once on the ground, lies a moment and sinks away; cut rice
 * folds down flat and goes. Copies of the cell's own model (BlockField.pose), pooled.
 */
export class Felled {
  private list: Fall[] = [];
  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  /** Called once when a tree hits the ground (dust, a thud). */
  onLand: ((x: number, z: number, away: number, scale: number) => void) | null = null;

  constructor(private scene: THREE.Scene, private cap = 24) {}

  add(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, z: number, yaw: number, scale: number, away: number, kind: "tree" | "crop", billboard = false, depth?: THREE.Material, flip = false): void {
    let f = this.list.find((x) => !x.mesh.visible);
    if (!f) {
      if (this.list.length >= this.cap) f = this.list.shift()!;
      else {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        this.scene.add(mesh);
        f = { mesh, kind, away, yaw, scale, t: 0, landed: false, x, z, billboard, flip };
      }
      this.list.push(f);
    }
    f.mesh.geometry = geo;
    f.mesh.material = mat;
    f.mesh.customDepthMaterial = depth;
    f.mesh.visible = true;
    Object.assign(f, { kind, away, yaw, scale, t: 0, landed: false, x, z, billboard, flip });
    this.place(f);
  }

  update(dt: number): void {
    for (const f of this.list) {
      if (!f.mesh.visible) continue;
      f.t += dt;
      const end = f.kind === "tree" ? TREE_FALL + TREE_LIE + TREE_GONE : CROP_GONE;
      if (f.t >= end) {
        f.mesh.visible = false;
        continue;
      }
      if (f.kind === "tree" && !f.landed && f.t >= TREE_FALL) {
        f.landed = true;
        this.onLand?.(f.x, f.z, f.away, f.scale);
      }
      this.place(f);
    }
  }

  private place(f: Fall): void {
    const m = f.mesh;
    this.qa.setFromAxisAngle(Y_AXIS, f.yaw);
    this.axis.set(Math.cos(f.away), 0, -Math.sin(f.away));
    let tilt = 0;
    let sink = 0;
    let s = f.scale;
    let sy = 1;
    if (f.kind === "tree") {
      // Toppling gathers speed; a small bounce where it lands; then it sinks into the ground and shrinks away.
      const lie = Math.PI / 2 - 0.08;
      if (f.t < TREE_FALL) tilt = lie * easeIn(f.t / TREE_FALL);
      else {
        const u = f.t - TREE_FALL;
        tilt = lie - Math.max(0, Math.sin(Math.min(1, u / 0.22) * Math.PI)) * 0.1;
        const g = Math.max(0, f.t - TREE_FALL - TREE_LIE) / TREE_GONE;
        sink = g * 0.6;
        s = f.scale * (1 - g * 0.85);
      }
    } else {
      // Cut rice folds over and flattens, then goes.
      const u = f.t / CROP_GONE;
      // (A picture of rice only squashes: tipping it would take it out of its plane.)
      tilt = f.billboard ? 0 : 0.9 * Math.min(1, u * 2.2);
      sy = 1 - 0.75 * Math.min(1, u * 1.6);
      s = f.scale * (1 - Math.max(0, u - 0.55) / 0.45);
    }
    if (f.billboard && f.kind === "tree") this.qb.setFromAxisAngle(VIEW, Math.sin(f.away) >= 0 ? -tilt : tilt);
    else this.qb.setFromAxisAngle(this.axis, tilt);
    m.quaternion.multiplyQuaternions(this.qb, this.qa);
    m.position.set(f.x, -sink, f.z);
    m.scale.set(f.flip ? -s : s, s * sy, s);
  }
}
