import * as THREE from "three";
import { mat } from "../models";
import { itemKind } from "../data";
import { itemFootprint, itemGeometry, itemHeight, itemMaterial } from "./itemGeo";

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x24170c, side: THREE.BackSide });

/**
 * A visible pile of carried items attached to an anchor (worker's back, dozer bucket, cart
 * tub, a stand's tray). Items are laid out in a grid of `cols × rows` per layer, each layer as
 * tall as its tallest item, layers going up. Counts and capacity are data; the meshes are just
 * a picture of them.
 */
export class Stack {
  readonly items: number[] = [];
  private group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  /** Seconds left on the "bump" when an item lands. */
  private bump = 0;
  /** Height of the bottom of each shown layer (rebuilt on every change). */
  private floors: number[] = [];

  constructor(
    readonly anchor: THREE.Object3D,
    public capacity: number,
    private colorOf: (item: number) => number,
    /** `ingot`: ingots drawn at this share of `size` (lumps and bricks need not match). */
    private layout: { cols: number; rows: number; size: number; maxShown?: number; outline?: boolean; ingot?: number } = { cols: 1, rows: 1, size: 0.22 },
  ) {
    anchor.add(this.group);
  }

  get count(): number {
    return this.items.length;
  }
  get full(): boolean {
    return this.items.length >= this.capacity;
  }
  get room(): number {
    return Math.max(0, this.capacity - this.items.length);
  }

  push(item: number): void {
    this.items.push(item);
    this.bump = 0.12;
    this.redraw();
  }

  /** Remove and return the top item (or null). */
  pop(): number | null {
    const it = this.items.pop();
    this.redraw();
    return it ?? null;
  }

  /** Remove the topmost item matching `pred`. */
  take(pred: (item: number) => boolean): number | null {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (pred(this.items[i])) {
        const [it] = this.items.splice(i, 1);
        this.redraw();
        return it;
      }
    }
    return null;
  }

  clear(): void {
    this.items.length = 0;
    this.redraw();
  }

  /** World position of the current top slot (where the next item lands / leaves from). */
  topWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const i = Math.max(0, this.shownCount() - 1);
    out.copy(this.slot(i));
    return this.group.localToWorld(out);
  }

  update(dt: number): void {
    if (this.bump > 0) {
      this.bump = Math.max(0, this.bump - dt);
      const s = 1 + (this.bump / 0.12) * 0.15;
      this.group.scale.set(s, 1 / s, s);
    }
  }

  private shownCount(): number {
    return Math.min(this.items.length, this.layout.maxShown ?? 60);
  }

  /** Drawn size of one item. */
  private sizeOf(item: number | undefined): number {
    return this.layout.size * (item !== undefined && this.layout.ingot !== undefined && itemKind(item) === "ingot" ? this.layout.ingot : 1);
  }

  private slot(i: number): THREE.Vector3 {
    const { cols, rows } = this.layout;
    const per = cols * rows;
    const layer = Math.floor(i / per);
    const r = i % per;
    const cx = r % cols;
    const cz = Math.floor(r / cols);
    const it = this.items[i];
    const size = this.sizeOf(it);
    const h = it !== undefined ? itemHeight(it) : 0.6;
    // Columns and rows as far apart as the item is long / deep (bricks are longer than lumps).
    const [fx, fz] = it !== undefined ? itemFootprint(it) : [1, 1];
    const dx = size * Math.max(1.05, fx * 0.98);
    const dz = size * Math.max(1.05, fz * 1.02);
    return new THREE.Vector3((cx - (cols - 1) / 2) * dx, (this.floors[layer] ?? 0) + (h / 2) * size, (cz - (rows - 1) / 2) * dz);
  }

  private redraw(): void {
    const n = this.shownCount();
    // Each layer sits on the tallest item of the one below (bars are flat, rock slabs thicker).
    const per = this.layout.cols * this.layout.rows;
    this.floors.length = 0;
    let y = 0;
    for (let i = 0; i < Math.max(n, 1); i += per) {
      this.floors.push(y);
      let top = 0;
      for (let k = i; k < Math.min(n, i + per); k++) top = Math.max(top, itemHeight(this.items[k]) * this.sizeOf(this.items[k]));
      y += (top || 0.6 * this.layout.size) * 1.02;
    }
    this.floors.push(y);
    while (this.meshes.length < n) {
      const m = new THREE.Mesh(itemGeometry(0), mat(0xffffff));
      m.castShadow = true;
      if (this.layout.outline) {
        // Dark back-face shell: carried items stay readable against the brown ground.
        const shell = new THREE.Mesh(m.geometry, OUTLINE);
        shell.scale.setScalar(1.1);
        m.add(shell);
      }
      this.group.add(m);
      this.meshes.push(m);
    }
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      if (i < n) {
        const it = this.items[i];
        m.visible = true;
        m.scale.setScalar(this.sizeOf(it));
        m.position.copy(this.slot(i));
        m.geometry = itemGeometry(it, i);
        if (m.children[0]) (m.children[0] as THREE.Mesh).geometry = m.geometry;
        // Bricks are stacked by hand, each turned a little (reference); raw lumps lie every which
        // way, a little off the column's line and tilted (reference: a rough, uneven column of rocks).
        const ingot = itemKind(it) === "ingot";
        const r = (k: number) => (((i + 1) * k) % 1) - 0.5;
        if (ingot) m.rotation.set(0, this.layout.cols * this.layout.rows === 1 ? r(0.437) * 0.7 : ((i * 1.7) % 0.12) - 0.06, 0);
        else {
          m.rotation.set(r(0.618) * 0.5, r(0.381) * 2.4, r(0.737) * 0.5);
          m.position.x += r(0.291) * 0.16 * this.layout.size;
          m.position.z += r(0.853) * 0.16 * this.layout.size;
        }
        m.material = itemMaterial(it, this.colorOf(it));
      } else m.visible = false;
    }
  }
}
