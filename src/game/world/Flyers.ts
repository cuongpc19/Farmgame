import * as THREE from "three";
import { mat } from "../models";
import { itemGeometry, itemMaterial } from "./itemGeo";
import { cashLook } from "./props";

/**
 * Items hopping between piles: stack → cart, cart → sell stand, stand → coins, etc.
 * Each flyer is a small mesh on a parabolic arc from a start point to a (possibly moving)
 * target object; `onArrive` hands the item over when it lands.
 */
interface Flyer {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  target: THREE.Object3D;
  offset: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  onArrive: () => void;
}

export class Flyers {
  private list: Flyer[] = [];
  private pool: THREE.Mesh[] = [];
  private geo: THREE.BufferGeometry;
  private coinGeo: THREE.BufferGeometry;
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private size = 0.24) {
    this.geo = new THREE.BoxGeometry(size, size * 0.8, size);
    this.coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12);
  }

  get busy(): number {
    return this.list.length;
  }

  launch(
    from: THREE.Vector3,
    target: THREE.Object3D,
    color: number,
    onArrive: () => void,
    opts: { dur?: number; arc?: number; offset?: THREE.Vector3; coin?: boolean; item?: number; cash?: boolean } = {},
  ): void {
    const mesh = this.pool.pop() ?? new THREE.Mesh(this.geo, mat(color));
    const cash = opts.cash ? cashLook() : null;
    mesh.geometry = cash ? cash.geo : opts.coin ? this.coinGeo : opts.item !== undefined ? itemGeometry(opts.item, this.list.length) : this.geo;
    mesh.scale.setScalar(opts.item !== undefined ? this.size : 1);
    mesh.material = cash ? cash.mats : opts.coin ? mat(color, { emissive: 0x553300 }) : opts.item !== undefined ? itemMaterial(opts.item, color) : mat(color);
    mesh.castShadow = true;
    mesh.position.copy(from);
    mesh.visible = true;
    this.scene.add(mesh);
    this.list.push({
      mesh,
      from: from.clone(),
      target,
      offset: opts.offset ?? new THREE.Vector3(),
      t: 0,
      dur: opts.dur ?? 0.32,
      arc: opts.arc ?? 1.2,
      onArrive,
    });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.target.getWorldPosition(this.tmp).add(f.offset);
      f.mesh.position.lerpVectors(f.from, this.tmp, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * f.arc;
      f.mesh.rotation.y += dt * 9;
      f.mesh.rotation.x += dt * 5;
      if (k >= 1) {
        f.mesh.visible = false;
        this.scene.remove(f.mesh);
        this.pool.push(f.mesh);
        this.list.splice(i, 1);
        f.onArrive();
      }
    }
  }
}
