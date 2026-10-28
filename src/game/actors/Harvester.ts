import * as THREE from "three";
import { CELL, PACE, itemColor, itemKind, type Placed } from "../data";
import { makeLoader, mat, type VehicleModel } from "../models";
import { Stack } from "../world/Stack";
import { Zone } from "../base/Zone";
import { pointToWorld } from "../base/Bridge";
import type { Collector, Mining } from "../systems/Mining";
import type { Drops } from "../world/Drops";
import type { BlockField } from "../world/BlockField";
import type { Nav } from "../world/Nav";
import type { BaseCtx } from "../base/Ctx";
import type { Actor } from "../base/Actor";
import type { OreStorage } from "../base/Buildings";
import type { Label } from "../ui/Labels";
import { adLabel } from "../ads";
import { sfx } from "../audio";

const tmp = new THREE.Vector3();
/** INFERRED (the original's tables give the auto harvester no numbers): load, speed, reach. */
const CARGO = 40;
const SPEED = 5;
const ABSORB = 3;

/**
 * Auto Harvester (stages 4+, an ad in the original: FREE while ads are off). A driverless
 * loader that roams the quarry picking up loose chunks, drives them back to its return point
 * by the ore storage when full (or when nothing is left lying around) and tips them onto the
 * storage pile, for the player or carrier workers to take to the furnace.
 */
export class Harvester implements Collector {
  readonly pos = new THREE.Vector3();
  readonly stack: Stack;
  readonly absorb = ABSORB;
  incoming = 0;
  accepts = (i: number) => itemKind(i) === "mineral";
  readonly groupId: number;
  locked = true;
  private model: VehicleModel;
  private home: THREE.Vector3;
  private route: THREE.Vector3[] = [];
  private planT = 0;
  private state: "idle" | "seek" | "return" | "unload" = "idle";
  private facing = 0;
  private stuck = 0;
  private unloadT = 0;
  private pad: Zone;
  private padLabel: Label | null;
  private label: Label;
  private hold = 0;
  /** Stood on ACTIVATE (Game asks for the ad, then calls unlock). */
  onUnlockRequest: (() => void) | null = null;

  constructor(
    private ctx: BaseCtx,
    p: Placed,
    private drops: Drops,
    private mining: Mining,
    private nav: Nav,
    private field: BlockField,
    private storage: OreStorage,
    private collide: (p: THREE.Vector3, r: number) => void,
  ) {
    this.groupId = p.groupId ?? 0;
    this.model = makeLoader();
    this.model.root.scale.setScalar(1.5);
    // Driverless: a teal livery and a beacon on the roof tell it apart from the rentals.
    this.model.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshLambertMaterial;
      const c = src.clone();
      if (c.color) c.color.lerp(new THREE.Color(0x2fb8b0), 0.45);
      m.material = c;
      m.castShadow = true;
    });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.25, 8), mat(0xffb020, { emissive: 0xaa6600 }));
    beacon.position.set(0, 2.3, 0);
    this.model.root.add(beacon);
    this.pos.set(p.wx, 0, p.wz);
    this.model.root.position.copy(this.pos);
    ctx.scene.add(this.model.root);
    this.home = p.raw?.returnPoint ? pointToWorld(p.raw.returnPoint) : storage.zone.center.clone();
    this.stack = new Stack(this.model.stackAnchor, Math.round(CARGO * PACE.cargo), itemColor, { cols: 3, rows: 2, size: 0.26, maxShown: 60 });
    const c = this.pos.clone().add(new THREE.Vector3(-CELL * 1.6, 0, CELL * 1.2));
    this.pad = new Zone(ctx.scene, c, CELL * 1.1, "ACTIVATE");
    this.padLabel = ctx.labels.add(c.clone().setZ(c.z + CELL * 0.75), "load", adLabel());
    this.label = ctx.labels.add(this.model.root, "cart", "", 3.6);
  }

  unlock(): void {
    if (!this.locked) return;
    this.locked = false;
    this.state = "idle";
    this.ctx.scene.remove(this.pad.root);
    if (this.padLabel) this.ctx.labels.remove(this.padLabel);
    this.padLabel = null;
    sfx.unlock();
  }

  /** Is grid cell (i, j) open for the harvester (machine ground, no ore block on it)? */
  private free(i: number, j: number): boolean {
    if (!this.nav.open(i, j, true)) return false;
    const c = this.nav.centre(i, j, tmp);
    return !this.field.at(Math.round(c.x / CELL), Math.round(c.z / CELL));
  }

  /**
   * Plan a route over open machine ground: to the nearest reachable loose chunk (`home` false)
   * or back to the return point. Breadth-first from where it stands, so "nearest" is by path.
   * False: nothing reachable.
   */
  private plan(home: boolean): boolean {
    const W = this.nav.width;
    const H = this.nav.height;
    if (!W) return false;
    const goals = new Set<number>();
    if (home) {
      const [i, j] = this.nav.cellOf(this.home.x, this.home.z);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) goals.add((j + dj) * W + i + di);
    } else
      for (const d of this.drops.near(this.pos.x, this.pos.z, 400)) {
        const [i, j] = this.nav.cellOf(d.pos.x, d.pos.z);
        goals.add(j * W + i);
      }
    if (!goals.size) return false;
    const [si, sj] = this.nav.cellOf(this.pos.x, this.pos.z);
    const prev = new Int32Array(W * H).fill(-2);
    const q: number[] = [];
    // Start from its own cell even if a block edge makes it look closed.
    const s0 = sj * W + si;
    prev[s0] = -1;
    q.push(s0);
    let hit = -1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (goals.has(c)) {
        hit = c;
        break;
      }
      const i = c % W;
      const j = (c - i) / W;
      for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni;
        if (prev[n] !== -2 || !this.free(ni, nj)) continue;
        prev[n] = c;
        q.push(n);
      }
    }
    if (hit < 0) return false;
    const cells: number[] = [];
    for (let c = hit; c >= 0; c = prev[c]) cells.push(c);
    cells.reverse();
    this.route = cells.slice(1).map((c) => this.nav.centre(c % W, Math.floor(c / W), new THREE.Vector3()));
    if (home) this.route.push(this.home.clone());
    return true;
  }

  /** Follow the planned route; true once it is used up. */
  private drive(dt: number): boolean {
    while (this.route.length && Math.hypot(this.route[0].x - this.pos.x, this.route[0].z - this.pos.z) < 0.9) this.route.shift();
    // Cut corners: aim at the farthest of the next few waypoints that is in a straight line.
    const to = this.route[Math.min(this.route.length - 1, 2)];
    if (!to) return true;
    const dx = to.x - this.pos.x;
    const dz = to.z - this.pos.z;
    const want = Math.atan2(dx, dz);
    let turn = want - this.facing;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.facing += turn * Math.min(1, dt * 6);
    const s = SPEED * dt * Math.max(0.3, Math.cos(Math.min(Math.abs(turn), Math.PI / 2)));
    const before = this.pos.clone();
    this.pos.x += Math.sin(this.facing) * s;
    this.pos.z += Math.cos(this.facing) * s;
    this.collide(this.pos, 1.1);
    this.stuck = this.pos.distanceTo(before) < s * 0.25 ? this.stuck + dt : 0;
    for (const w of this.model.wheels) w.rotation.x += s * 1.8;
    return false;
  }

  update(dt: number, player: Actor): void {
    if (this.locked) {
      const on = player.kind === "player" && this.pad.contains(player.pos);
      this.hold = on ? this.hold + dt : 0;
      this.pad.setFill(this.hold / 0.4);
      if (this.hold >= 0.4) {
        this.hold = -99;
        this.onUnlockRequest?.();
      }
      this.ctx.labels.set(this.label, "AUTO HARVESTER");
      return;
    }
    this.planT -= dt;
    switch (this.state) {
      case "idle":
        // Nothing reachable on the ground: look again now and then.
        if (this.planT <= 0) {
          this.planT = 2;
          if (this.plan(false)) this.state = "seek";
        }
        break;
      case "seek":
        this.mining.collect(this);
        if (this.stack.full) {
          this.state = "return";
          this.planT = 0;
          break;
        }
        if (this.planT <= 0 || this.stuck > 1.5 || !this.route.length) {
          this.planT = 1.5;
          this.stuck = 0;
          if (!this.plan(false)) this.state = this.stack.count > 0 ? "return" : "idle";
        }
        this.drive(dt);
        break;
      case "return":
        if (this.planT <= 0 || this.stuck > 1.5) {
          this.planT = 2;
          this.stuck = 0;
          if (!this.plan(true)) this.route = [this.home.clone()];
        }
        if (this.drive(dt) || Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) < 1.4) this.state = "unload";
        break;
      case "unload":
        this.unloadT -= dt;
        if (this.unloadT <= 0) {
          this.unloadT = 0.05;
          const it = this.stack.pop();
          if (it === null) {
            this.state = "idle";
            this.planT = 0;
            break;
          }
          this.ctx.flyers.launch(this.stack.topWorld(), this.storage.anchor, itemColor(it), () => this.storage.pile.push(it), { item: it, dur: 0.3 });
        }
        break;
    }
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    this.stack.update(dt);
    this.ctx.labels.set(this.label, this.stack.count ? `${this.stack.count}/${this.stack.capacity}` : "");
  }
}
