import { freeze } from "../engine/freeze";
import * as THREE from "three";
import { CELL, itemColor, itemKind, oreOfItemId, type Placed } from "../data";
import { furnaceModel } from "../world/props";
import { Stack } from "../world/Stack";
import { Zone } from "./Zone";
import type { BaseCtx } from "./Ctx";
import type { Actor } from "./Actor";
import { events, Ticker } from "../systems/Events";
import { upValue, UNLOAD_TRANSFER, PICKUP_TRANSFER } from "./common";
import { PACE } from "../data";
import { sfx } from "../audio";
import { houseOf, type House } from "../farm";
import type { Label } from "../ui/Labels";

/**
 * A processing house = drop pad + machine + output tray (Quarry Crush's furnace).
 * Raw items dropped on the pad queue up; the machine works one at a time
 * (time = ore smelt seconds / Furnace Processing Speed) and piles products on the tray,
 * where anyone with free cargo standing next to it picks them up.
 * Farm game (user 2026-10-28): two of them, the Mill (rice, wood, fruit: ores of category rock) and the Forge (metals,
 * gems); each pad only takes its own raw items (`takes`).
 */
export class Furnace {
  readonly zone: Zone;
  readonly trayPos = new THREE.Vector3();
  readonly queue: number[] = [];
  readonly output: Stack;
  private current: number | null = null;

  /** Everything waiting to smelt, the one in the furnace first (save). */
  pending(): number[] {
    return this.current === null ? [...this.queue] : [this.current, ...this.queue];
  }
  private t = 0;
  private dur = 1;
  private model: ReturnType<typeof furnaceModel>;
  private inTick = new Map<Actor, Ticker>();
  private outTick = new Map<Actor, Ticker>();
  private loadLabel: Label;
  private outLabel: Label;
  private timerLabel: Label;
  private smoke: { m: THREE.Mesh; t: number }[] = [];
  private smokeT = 0;
  /** Extra speed from the FURNACE OVERLOAD boost (1 = none). */
  speedMul = 1;
  /** Fires the first time a smelt completes (tutorial). */
  onSmelt: (() => void) | null = null;

  constructor(private ctx: BaseCtx, p: Placed, readonly house: House = "mill") {
    const root = new THREE.Group();
    root.position.set(p.wx, 0, p.wz);
    ctx.scene.add(root);
    this.model = furnaceModel(CELL, house);
    root.add(this.model.root);
    // REFINING pad on the south-west cell of the footprint.
    this.zone = new Zone(ctx.scene, new THREE.Vector3(p.wx - CELL, 0, p.wz + CELL * 0.95), CELL * 1.3, house === "mill" ? "MILL" : "FORGE");
    this.output = new Stack(this.model.tray, 9999, itemColor, { cols: 3, rows: 2, size: 0.55, maxShown: 36 });
    // The hall never moves; the ingot pile on the tray bumps as ingots land, so it stays live.
    freeze(root, [this.model.tray]);
    this.model.tray.getWorldPosition(this.trayPos);
    this.trayPos.y = 0;
    this.loadLabel = ctx.labels.add(new THREE.Vector3(this.zone.center.x, 0, this.zone.center.z + CELL * 0.75), "load", "LOAD: 0");
    this.outLabel = ctx.labels.add(new THREE.Vector3(this.trayPos.x, 0, this.trayPos.z + CELL * 0.6), "load", "");
    // Orange progress bar with the seconds left, floating over the furnace while it works.
    this.timerLabel = ctx.labels.add(this.model.mouth, "ftimer", "", 3.4);
    const puffGeo = new THREE.SphereGeometry(0.45, 7, 5);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshLambertMaterial({ color: 0xdad6d0, transparent: true, opacity: 0 }));
      m.visible = false;
      ctx.scene.add(m);
      this.smoke.push({ m, t: 1 });
    }
  }

  /** Whether this house processes a raw item (the Mill: farm goods; the Forge: metals and gems). */
  takes(item: number): boolean {
    if (itemKind(item) !== "mineral") return false;
    const ore = oreOfItemId(item);
    return !!ore && houseOf(ore) === this.house;
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  update(dt: number): void {
    // Pad: take one mineral every SEND_INTERVAL from whoever stands on it.
    for (const a of this.ctx.actors()) {
      if (!this.zone.contains(a.pos)) {
        this.inTick.get(a)?.reset();
        continue;
      }
      let tk = this.inTick.get(a);
      if (!tk) this.inTick.set(a, (tk = new Ticker()));
      tk.tick(dt, UNLOAD_TRANSFER, () => {
        const it = a.stack.take((i) => this.takes(i));
        if (it === null) return false;
        const from = a.stack.topWorld();
        this.ctx.flyers.launch(from, this.model.mouth, itemColor(it), () => {
          this.queue.push(it);
          sfx.drop();
        }, { item: it });
        events.emit("mineralToSmelter", { count: 1, by: a.label ?? "PLAYER" });
        return true;
      });
    }

    // Smelter: one item at a time.
    if (this.current === null && this.queue.length) {
      this.current = this.queue.shift()!;
      const ore = oreOfItemId(this.current);
      this.dur = (ore?.smeltSeconds ?? 1) / (upValue("smelterSmeltingSpeed") * this.speedMul * PACE.plant);
      this.t = 0;
    }
    if (this.current !== null) {
      this.t += dt;
      const glow = this.model.glow.material as THREE.MeshLambertMaterial;
      glow.emissiveIntensity = 0.8 + Math.sin(performance.now() / 90) * 0.3;
      if (this.t >= this.dur) {
        const ore = oreOfItemId(this.current);
        this.current = null;
        if (ore) {
          const from = new THREE.Vector3();
          this.model.mouth.getWorldPosition(from);
          const ingot = ore.ingotId;
          this.ctx.flyers.launch(from, this.model.tray, itemColor(ingot), () => {
            this.output.push(ingot);
            events.emit("smeltDone", { item: ingot });
            this.onSmelt?.();
          }, { dur: 0.35, arc: 1.5, offset: new THREE.Vector3(0, 0.4, 0), item: ingot });
        }
      }
    }

    // Tray: hand ingots to anyone next to it with room.
    for (const a of this.ctx.actors()) {
      const d = Math.hypot(a.pos.x - this.trayPos.x, a.pos.z - this.trayPos.z);
      if (d > CELL * 0.95 || this.output.count === 0) {
        this.outTick.get(a)?.reset();
        continue;
      }
      let tk = this.outTick.get(a);
      if (!tk) this.outTick.set(a, (tk = new Ticker()));
      tk.tick(dt, PICKUP_TRANSFER, () => {
        if (a.stack.capacity - a.stack.count - a.incoming <= 0) return false;
        // Only to carriers that take ingots (not an ATV, not a mining-only worker).
        const top = this.output.items[this.output.items.length - 1];
        if (top === undefined || (a.accepts && !a.accepts(top))) return false;
        const it = this.output.pop();
        if (it === null) return false;
        const from = this.output.topWorld();
        a.incoming++;
        this.ctx.flyers.launch(from, a.stack.anchor, itemColor(it), () => {
          a.incoming--;
          a.stack.push(it);
          sfx.pickup();
          events.emit("ingotCollected", { count: 1 });
        }, { item: it });
        return true;
      });
    }

    this.output.update(dt);
    this.ctx.labels.set(this.loadLabel, `LOAD: ${this.queue.length + (this.current !== null ? 1 : 0)}`);
    this.ctx.labels.set(this.outLabel, `LOAD: ${this.output.count}`);
    if (this.current !== null) {
      const k = Math.min(1, this.t / this.dur);
      this.ctx.labels.set(this.timerLabel, `<div class="tbar"><i style="width:${(k * 100).toFixed(0)}%"></i></div><small>${Math.max(0, this.dur - this.t).toFixed(1)}</small>`);
    } else this.ctx.labels.set(this.timerLabel, "");
    // Chimney smoke while smelting.
    if (this.busy) {
      this.smokeT += dt;
      if (this.smokeT > 0.35) {
        this.smokeT = 0;
        const p = this.smoke.find((x) => x.t >= 1);
        if (p) {
          p.t = 0;
          const tip = this.model.chimneys[Math.floor(Math.random() * this.model.chimneys.length)];
          tip.getWorldPosition(p.m.position);
          p.m.visible = true;
        }
      }
    }
    for (const p of this.smoke) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / 1.6);
      p.m.position.y += dt * 1.6;
      p.m.position.x += dt * 0.4;
      p.m.scale.setScalar(0.6 + p.t * 1.6);
      (p.m.material as THREE.MeshLambertMaterial).opacity = 0.7 * (1 - p.t);
      if (p.t >= 1) p.m.visible = false;
    }
  }
}
