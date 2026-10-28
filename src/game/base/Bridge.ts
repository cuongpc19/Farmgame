import * as THREE from "three";
import { CELL, cellToWorld, type Placed } from "../data";
import { mat } from "../models";
import { Zone } from "./Zone";
import type { BaseCtx } from "./Ctx";
import type { Actor } from "./Actor";
import type { Label } from "../ui/Labels";
import type { WalkRect } from "../world/Nav";
import { adLabel } from "../ads";
import { sfx } from "../audio";

/** A point of a bridge in the stage data: [cell x, cell z, [world dx, data dz], rot]. */
type Point = [number, number, [number, number]?, number?];

export function pointToWorld(p: Point): THREE.Vector3 {
  const c = cellToWorld(p[0], p[1]);
  const off = p[2] ?? [0, 0];
  // Offsets are in world units on the data axes (data +z is north = world −z).
  return new THREE.Vector3(c.x + off[0], 0, c.z - off[1]);
}

/**
 * A bridge over a gap between two parts of a quarry (stages 3+). From the original's map data:
 * Bridge_OnFoot_* are footbridges from the start (level 1, free) that a level-2 expansion
 * (cash, or an ad) widens so machines can cross; Bridge_7 / Bridge_15 carry machines and are
 * either there from the start (free) or built on a pad (an ad: FREE while ads are off).
 * Which way it runs comes from the data's rotation: 90 / 270 north-south, 0 / 180 east-west
 * (worked out from where each bridge's sign / platform / expansion points stand).
 */
export class Bridge {
  readonly groupId: number;
  readonly onFoot: boolean;
  /** People can cross. */
  built: boolean;
  /** Machines can cross. */
  heavy: boolean;
  /** The deck's floor rectangle (world). */
  readonly rect: WalkRect;
  /** Next step's price: number = cash, 0 = free / an ad, null = nothing left to buy. */
  readonly nextPrice: number | null;
  readonly nextIsAd: boolean;
  private root = new THREE.Group();
  private pad: Zone | null = null;
  private padLabel: Label | null = null;
  private padHold = 0;
  private sign: Label | null = null;
  private signAt: THREE.Vector3 | null = null;
  private signShown = false;
  /** Standing on the pad (Game pays / asks for an ad, then calls `advance`). */
  onRequest: (() => void) | null = null;
  /** Fired when the bridge is built or widened (Game updates walkable ground). */
  onChange: (() => void) | null = null;

  constructor(private ctx: BaseCtx, p: Placed, level: number) {
    const raw = p.raw ?? {};
    this.groupId = p.groupId ?? 0;
    this.onFoot = !!raw.onFoot;
    const steps: { payType?: string; price?: number }[] = raw.expansion ?? [];
    const alongZ = p.rotY === 90 || p.rotY === 270;
    const fw = p.w * CELL;
    const fh = p.h * CELL;
    // Footbridges are narrow until widened; machine bridges take most of the footprint.
    const half = (wide: boolean) => ((wide ? 0.42 : 0.26) * (alongZ ? fw : fh));
    const along = (alongZ ? fh : fw) / 2 + 0.6;
    const mk = (wide: boolean): WalkRect =>
      alongZ
        ? { x0: p.wx - half(wide), x1: p.wx + half(wide), z0: p.wz - along, z1: p.wz + along }
        : { x0: p.wx - along, x1: p.wx + along, z0: p.wz - half(wide), z1: p.wz + half(wide) };
    // Level 1 of a footbridge is free; machine bridges: their only level, free or an ad.
    const first = steps[0];
    const firstFree = !first || first.payType === "Free";
    if (this.onFoot) {
      this.built = true;
      this.heavy = level >= 2;
    } else {
      this.built = firstFree || level >= 1;
      this.heavy = this.built;
    }
    const next = this.onFoot ? (this.heavy ? null : steps[1] ?? null) : this.built ? null : first ?? null;
    this.nextIsAd = !!next && next.payType === "RV";
    this.nextPrice = !next ? null : next.payType === "Item" ? next.price ?? 0 : 0;
    this.rect = mk(true);
    this.wideRect = mk(true);
    this.narrowRect = mk(false);
    this.alongZ = alongZ;
    this.root.position.set(p.wx, 0, p.wz);
    ctx.scene.add(this.root);
    this.draw();
    // The pad: at the expansion point (footbridge widening) or the platform (building one).
    const at = raw.expansionPoint ?? raw.platform;
    if (this.nextPrice !== null && at) {
      const c = pointToWorld(at);
      this.pad = new Zone(ctx.scene, c, CELL * 1.1, this.onFoot ? "WIDEN" : "BUILD");
      this.padLabel = ctx.labels.add(c.clone().setZ(c.z + CELL * 0.75), "load", this.priceText());
    }
    if (raw.sign && this.onFoot && !this.heavy) {
      this.signAt = pointToWorld(raw.sign).setY(2.2);
      this.sign = ctx.labels.add(this.signAt, "lock", "");
    }
  }

  private readonly wideRect: WalkRect;
  private readonly narrowRect: WalkRect;
  private readonly alongZ: boolean;

  /** Floor people may walk on (null until built). */
  get footRect(): WalkRect | null {
    return this.built ? (this.heavy ? this.wideRect : this.narrowRect) : null;
  }
  /** Floor machines may drive on (null until widened / built). */
  get wheelRect(): WalkRect | null {
    return this.heavy ? this.wideRect : null;
  }

  private priceText(): string {
    if (this.nextPrice === null) return "";
    if (this.nextPrice > 0) return `<i class="ico cash"></i>${this.nextPrice.toLocaleString("en-US")}`;
    return this.nextIsAd ? adLabel() : "FREE";
  }

  /** Deck, beams and rails for the current state. */
  private draw(): void {
    this.root.clear();
    if (!this.built) return;
    const r = this.heavy ? this.wideRect : this.narrowRect;
    const len = this.alongZ ? r.z1 - r.z0 : r.x1 - r.x0;
    const wid = this.alongZ ? r.x1 - r.x0 : r.z1 - r.z0;
    const g = new THREE.Group();
    // Deck: planks for a footbridge, steel plate for a machine bridge.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.3, len), mat(this.heavy ? 0x7d838c : 0x9a6a3c));
    deck.position.y = 0.05;
    g.add(deck);
    const n = Math.floor(len / 0.9);
    const plank = new THREE.BoxGeometry(wid * 0.98, 0.06, 0.12);
    const plankMat = mat(this.heavy ? 0x5c626b : 0x6e4a28);
    for (let i = 1; i < n; i++) {
      const s = new THREE.Mesh(plank, plankMat);
      s.position.set(0, 0.22, -len / 2 + i * (len / n));
      g.add(s);
    }
    // Side rails on posts; machine bridges get a yellow kerb too.
    const postGeo = new THREE.BoxGeometry(0.16, 1.0, 0.16);
    const railGeo = new THREE.BoxGeometry(0.12, 0.12, len);
    const railMat = mat(this.heavy ? 0xf2b51a : 0x5a3a1e);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set((side * wid) / 2, 1.0, 0);
      g.add(rail);
      for (let i = 0; i <= 4; i++) {
        const post = new THREE.Mesh(postGeo, railMat);
        post.position.set((side * wid) / 2, 0.55, -len / 2 + (i * len) / 4);
        g.add(post);
      }
    }
    // Beams under the deck, down into the gap.
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.5, len * 0.9), mat(0x4a4f57));
      beam.position.set((side * wid) / 3, -1.8, 0);
      g.add(beam);
    }
    g.rotation.y = this.alongZ ? 0 : Math.PI / 2;
    g.traverse((o) => {
      (o as THREE.Mesh).castShadow = true;
      (o as THREE.Mesh).receiveShadow = true;
    });
    this.root.add(g);
  }

  /** Paid / ad watched: build the bridge, or widen the footbridge for machines. */
  advance(): void {
    if (this.nextPrice === null || (this.built && this.heavy)) return;
    if (!this.built) this.built = true;
    this.heavy = true;
    this.draw();
    if (this.pad) this.ctx.scene.remove(this.pad.root);
    if (this.padLabel) this.ctx.labels.remove(this.padLabel);
    if (this.sign) this.ctx.labels.remove(this.sign);
    this.pad = null;
    this.padLabel = null;
    this.sign = null;
    sfx.unlock();
    this.onChange?.();
  }

  update(dt: number, player: Actor): void {
    // The "no machines" sign only when someone is near the bridge (five of them cluttered the view).
    if (this.sign && this.signAt) {
      const near = Math.hypot(player.pos.x - this.signAt.x, player.pos.z - this.signAt.z) < CELL * 6;
      if (near !== this.signShown) {
        this.signShown = near;
        this.ctx.labels.set(this.sign, near ? "🚶 FOOTBRIDGE<br>NO MACHINES" : "");
      }
    }
    if (!this.pad) return;
    const on = player.kind === "player" && this.pad.contains(player.pos);
    this.padHold = on ? this.padHold + dt : 0;
    this.pad.setFill(this.padHold / 0.4);
    if (this.padHold >= 0.4) {
      this.padHold = -99;
      this.onRequest?.();
    }
    if (!on && this.padHold < 0) this.padHold = 0;
  }
}
