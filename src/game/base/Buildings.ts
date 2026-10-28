import { ADS_ON, adLabel } from "../ads";
import * as THREE from "three";
import { CELL, GAMEPLAY, PACE, itemColor, itemKind, OIL_ITEM, type Placed } from "../data";
import { barrelMesh, beaconModel, breakSpotModel, oilStationModel, restaurantModel, shedModel, upgradeModel, type SpotKind } from "../world/props";
import { Stack } from "../world/Stack";
import { freeze } from "../engine/freeze";
import { Zone } from "./Zone";
import type { BaseCtx } from "./Ctx";
import type { Actor } from "./Actor";
import { Ticker } from "../systems/Events";
import { PAD_SPEED, PICKUP_TRANSFER } from "./common";
import { sfx } from "../audio";
import { S, markDirty } from "../state";
import type { Label } from "../ui/Labels";

/**
 * A building you "enter" by standing on its pad: Upgrade (OPEN), Machinery Shop (ENTER),
 * Worker office (HIRE). Opening shows a panel; walking off closes it.
 */
export class EntryBuilding {
  readonly zone: Zone;
  readonly root = new THREE.Group();
  private hold = 0;
  private open = false;
  locked = false;
  private lockLabel: Label | null = null;
  beacon: THREE.Object3D | null = null;
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(private ctx: BaseCtx, readonly kind: "upgrade" | "shop" | "worker", p: Placed) {
    this.root.position.set(p.wx, 0, p.wz);
    ctx.scene.add(this.root);
    if (kind === "upgrade") {
      const u = upgradeModel(CELL);
      this.root.add(u.root);
      this.beacon = u.beacon;
    } else {
      this.root.add(kind === "shop" ? shedModel(CELL, 0x8fe0c8, 0xe9e4da, "GARAGE") : shedModel(CELL, 0xc9b0ff, 0xe9e4da, "CREW"));
      this.beacon = beaconModel();
      this.beacon.position.set(0, CELL * 1.8 + 2.4, -CELL * 0.2);
      this.root.add(this.beacon);
    }
    const text = kind === "upgrade" ? "OPEN" : kind === "shop" ? "ENTER" : "HIRE";
    this.zone = new Zone(ctx.scene, new THREE.Vector3(p.wx, 0, p.wz + CELL * 1.0), CELL * 1.25, text);
  }

  /** Floating hint shown when the player walks onto a locked building's pad. */
  lockHint = "";
  private hinted = false;

  setLocked(on: boolean, text = ""): void {
    if (this.locked === on && (!on || this.lockLabel)) return;
    this.locked = on;
    this.zone.setVisible(!on);
    if (on && !this.lockLabel) this.lockLabel = this.ctx.labels.add(this.zone.center.clone().setY(1), "lock", `🔒 ${text}`);
    if (!on && this.lockLabel) {
      this.ctx.labels.remove(this.lockLabel);
      this.lockLabel = null;
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Force-close (panel X button). The pad re-arms once the player steps off. */
  close(): void {
    if (this.open) {
      this.open = false;
      this.onClose?.();
    }
  }

  update(dt: number): void {
    if (this.beacon) this.beacon.position.y = CELL * 1.8 + 2.4 + Math.sin(performance.now() / 260) * 0.3;
    const a = this.ctx.controlled();
    if (this.locked) {
      const near = this.zone.contains(a.pos, 0.5);
      if (near && !this.hinted && this.lockHint) this.ctx.labels.pop(this.zone.center.clone().setY(3), this.lockHint, "hint");
      this.hinted = near;
      return;
    }
    const inside = a.kind === "player" && this.zone.contains(a.pos);
    if (!inside) {
      this.hold = 0;
      this.zone.setFill(0);
      if (this.open) this.close();
      this.armed = true;
      return;
    }
    if (this.open || !this.armed) return;
    this.hold += dt;
    this.zone.setFill(this.hold / 0.45);
    if (this.hold >= 0.45) {
      this.open = true;
      this.armed = false;
      sfx.tap();
      this.onOpen?.();
    }
  }
  private armed = true;
}

/**
 * Oil station: locked until a fuel-powered vehicle is rented, then it fills its rack with
 * barrels (max 9). Standing on the OIL pad loads barrels into your cargo; the bin beside it
 * takes excess barrels back. Stages 3+ also have an extra station out in the quarry
 * (`extra`): an ACTIVATE pad (an ad in the original, FREE while ads are off), no bin, and
 * it fills faster (ExtraOilStation: a barrel every 0.5 s).
 */
export class OilStation {
  readonly zone: Zone;
  readonly binZone: Zone;
  readonly rack: Stack;
  locked = true;
  private gen = 0;
  private lockLabel: Label | null;
  private padTick = new Map<Actor, Ticker>();
  private binTick = new Ticker();
  private barrels: THREE.Object3D;
  private activate: Zone | null = null;
  private activateLabel: Label | null = null;
  private hold = 0;
  /** Extra station: the player stood on ACTIVATE (Game asks for the ad, then calls unlock). */
  onActivateRequest: (() => void) | null = null;
  /** The player stands on OIL with no room on their back while barrels wait (Game says why nothing comes). */
  onBackFull: (() => void) | null = null;
  private fillTick = new Ticker();
  /** Barrels flying into a machine on the pad, not yet in its tank. */
  private filling = 0;

  constructor(private ctx: BaseCtx, p: Placed, readonly extra = false) {
    const root = new THREE.Group();
    root.position.set(p.wx, 0, p.wz);
    ctx.scene.add(root);
    const m = oilStationModel(CELL);
    root.add(m.root);
    this.barrels = m.barrels;
    this.rack = new Stack(this.barrels, 9, () => 0x2fa8c8, { cols: 3, rows: 3, size: 0.7, maxShown: 9 });
    this.zone = new Zone(ctx.scene, new THREE.Vector3(p.wx - CELL * 0.35, 0, p.wz + CELL * 1.0), CELL * 1.1, "SYRUP");
    this.binZone = new Zone(ctx.scene, new THREE.Vector3(p.wx + CELL * 0.95, 0, p.wz + CELL * 1.05), CELL * 0.7, "", 0x7fd07f);
    this.zone.setVisible(false);
    this.binZone.setVisible(false);
    if (extra) {
      this.lockLabel = null;
      const c = this.zone.center.clone();
      this.activate = new Zone(ctx.scene, c, CELL * 1.1, "ACTIVATE");
      this.activateLabel = ctx.labels.add(c.clone().setZ(c.z + CELL * 0.75), "load", adLabel());
    } else this.lockLabel = ctx.labels.add(new THREE.Vector3(p.wx, 1, p.wz + CELL * 0.8), "lock", "🔒 RENT A<br>SYRUP MACHINE");
  }

  unlock(): void {
    if (!this.locked) return;
    this.locked = false;
    this.zone.setVisible(true);
    this.binZone.setVisible(!this.extra);
    if (this.activate) this.ctx.scene.remove(this.activate.root);
    if (this.activateLabel) this.ctx.labels.remove(this.activateLabel);
    this.activate = null;
    this.activateLabel = null;
    if (this.lockLabel) this.ctx.labels.remove(this.lockLabel);
    this.lockLabel = null;
  }

  update(dt: number): void {
    if (this.locked) {
      if (!this.activate) return;
      const a = this.ctx.controlled();
      const on = a.kind === "player" && this.activate.contains(a.pos);
      this.hold = on ? this.hold + dt : this.hold < 0 && !on ? 0 : 0;
      this.activate.setFill(this.hold / 0.4);
      if (this.hold >= 0.4) {
        this.hold = -99;
        this.onActivateRequest?.();
      }
      return;
    }
    if (this.rack.count < 9) {
      this.gen += dt;
      if (this.gen >= (this.extra ? GAMEPLAY.extraOilStationGenerateIntervalSeconds ?? 0.5 : 1.5) / PACE.plant) {
        this.gen = 0;
        this.rack.push(OIL_ITEM);
      }
    }
    const a = this.ctx.controlled();
    // On foot, or driving something that carries oil (the ATV / fuel truck).
    const takesOil = a.kind === "player" || (a.accepts?.(OIL_ITEM) ?? false);
    if (takesOil && this.zone.contains(a.pos)) {
      let tk = this.padTick.get(a);
      if (!tk) this.padTick.set(a, (tk = new Ticker()));
      tk.tick(dt, PICKUP_TRANSFER, () => {
        if (a.stack.capacity - a.stack.count - a.incoming <= 0) {
          if (a.kind === "player" && this.rack.count > 0 && !a.stack.items.includes(OIL_ITEM)) this.onBackFull?.();
          return false;
        }
        const it = this.rack.pop();
        if (it === null) return false;
        const from = this.rack.topWorld();
        a.incoming++;
        this.ctx.flyers.launch(from, a.stack.anchor, itemColor(OIL_ITEM), () => {
          a.incoming--;
          a.stack.push(OIL_ITEM);
          sfx.pickup();
        }, { item: OIL_ITEM });
        return true;
      });
    }
    // Drive-in (ours, playtest 2026-10-24): a fuelled machine on the pad is filled from the rack barrel
    // by barrel, so a dry one limps back here (Vehicle EMPTY_CRAWL) instead of its driver walking for oil.
    const m = a as Actor & { fuelled?: boolean; feeds?: boolean; fuel?: number; tank?: number; addFuel?: () => boolean; model?: { root: THREE.Object3D } };
    if (a.kind === "vehicle" && m.fuelled && !m.feeds && m.addFuel && m.model && this.zone.contains(a.pos)) {
      const per = GAMEPLAY.fuelPerOilBarrel;
      this.fillTick.tick(dt, PICKUP_TRANSFER, () => {
        if ((m.fuel ?? 0) + this.filling * per >= (m.tank ?? 0) - 0.5) return false;
        const it = this.rack.pop();
        if (it === null) return false;
        this.filling++;
        this.ctx.flyers.launch(this.rack.topWorld(), m.model!.root, itemColor(OIL_ITEM), () => {
          this.filling--;
          m.addFuel!();
          sfx.drop();
        }, { offset: new THREE.Vector3(0, 2, 0), item: OIL_ITEM });
        return true;
      });
    } else this.fillTick.reset();
    if (takesOil && !this.extra && this.binZone.contains(a.pos)) {
      this.binTick.tick(dt, 0.1 / PAD_SPEED, () => {
        const it = a.stack.take((i) => i === OIL_ITEM);
        if (it === null) return false;
        this.ctx.flyers.launch(a.stack.topWorld(), this.binZone.root, itemColor(OIL_ITEM), () => sfx.drop(), { item: OIL_ITEM });
        return true;
      });
    } else this.binTick.reset();
    this.rack.update(dt);
  }
}

/** Ore storage: the minecart's unload pad. Anyone standing on it picks up minerals. */
export class OreStorage {
  readonly zone: Zone;
  readonly pile: Stack;
  readonly anchor = new THREE.Object3D();
  private tick = new Map<Actor, Ticker>();
  private label: Label;

  constructor(private ctx: BaseCtx, p: Placed) {
    this.zone = new Zone(ctx.scene, new THREE.Vector3(p.wx, 0, p.wz), CELL * 1.6, "STORAGE");
    this.anchor.position.set(p.wx, 0.05, p.wz);
    ctx.scene.add(this.anchor);
    this.pile = new Stack(this.anchor, 99999, itemColor, { cols: 4, rows: 3, size: 0.55, maxShown: 60 });
    this.label = ctx.labels.add(new THREE.Vector3(p.wx, 0, p.wz + CELL * 1.0), "load", "");
  }

  update(dt: number): void {
    for (const a of this.ctx.actors()) {
      if (!this.zone.contains(a.pos) || this.pile.count === 0) {
        this.tick.get(a)?.reset();
        continue;
      }
      let tk = this.tick.get(a);
      if (!tk) this.tick.set(a, (tk = new Ticker()));
      tk.tick(dt, PICKUP_TRANSFER, () => {
        if (a.stack.capacity - a.stack.count - a.incoming <= 0) return false;
        const top = this.pile.items[this.pile.items.length - 1];
        if (top === undefined || (a.accepts && !a.accepts(top))) return false;
        const it = this.pile.pop();
        if (it === null) return false;
        a.incoming++;
        this.ctx.flyers.launch(this.pile.topWorld(), a.stack.anchor, itemColor(it), () => {
          a.incoming--;
          a.stack.push(it);
          sfx.pickup();
        }, { item: it });
        return true;
      });
    }
    this.pile.update(dt);
    this.ctx.labels.set(this.label, this.pile.count ? `LOAD: ${this.pile.count}` : "");
  }

  accepts(item: number): boolean {
    return itemKind(item) === "mineral";
  }
}

/** What each spot of the break area is for, in the map's table order (the first is open from the start). */
const SPOTS: SpotKind[] = ["eat", "drink", "rest"];
/** What the pad in front of a locked spot adds (user 2026-10-24: "FREE" alone did not say what it was for). */
const SPOT_PAD: Record<SpotKind, string> = {
  eat: "🍔 ADD A DINING TABLE<br><small>+2 seats: tired workers eat here</small>",
  drink: "🥤 ADD A DRINKS TABLE<br><small>+2 seats: tired workers drink here</small>",
  rest: "🛋️ ADD 2 ARMCHAIRS<br><small>+2 seats: tired workers sit back here</small>",
};

/** A seat of the break area: where the worker goes, the way they face, and what they do there. */
export interface Seat {
  pos: THREE.Vector3;
  face: number;
  kind: SpotKind;
}

/**
 * The break area (the reference's cafeteria: a pizza stand and tables under umbrellas; user 2026-10-24: ours is a
 * restaurant with food and drinks, and spots to eat, drink or sit back). The map's truck spot holds the
 * restaurant; its three table spots hold a dining table (open), a drinks table and two armchairs, 2 seats each,
 * the last two unlocked on a pad (CafeteriaTable._rvPayPlatform; FREE with ads off). Tired workers take a free
 * seat; with none free they wait at the counter and recover slowly ("not enough seats and most won't get proper rest").
 */
export class Cafeteria {
  readonly seats: Seat[] = [];
  /** Who sits where (seat index → worker). */
  private taken = new Map<number, object>();
  /** Where seatless workers wait: before the counter. */
  readonly queuePos = new THREE.Vector3();
  /** Where the crew party offer floats: over the counter. */
  readonly offerAt = new THREE.Vector3();
  private locked: { spot: THREE.Group; pad: Zone; label: Label; seats: Seat[]; kind: SpotKind; at: THREE.Vector3; hold: number }[] = [];
  onUnlock: (() => Promise<boolean>) | null = null;
  private busy = false;

  constructor(private ctx: BaseCtx, parts: Placed[]) {
    const tables = parts.filter((p) => p.type !== "cafeteriaTruck").sort((a, b) => a.type.localeCompare(b.type));
    for (const p of parts) {
      if (p.type !== "cafeteriaTruck") continue;
      const r = restaurantModel();
      r.position.set(p.wx, 0, p.wz);
      ctx.scene.add(r);
      freeze(r);
      const c = (r.userData.counter as THREE.Vector3).clone().add(r.position);
      this.queuePos.copy(c);
      this.offerAt.set(c.x, 3.6, c.z - 1.2);
    }
    const open = 1 + (S.run.cafTables ?? 0);
    tables.forEach((p, i) => {
      const kind = SPOTS[i % SPOTS.length];
      const at = new THREE.Vector3(p.wx, 0, p.wz);
      const { root, seats } = this.spot(kind, at);
      if (i < open) {
        this.seats.push(...seats);
        return;
      }
      // Locked spot: greyed out, a pad in front of it and a line saying what it adds.
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = new THREE.MeshLambertMaterial({ color: 0x8a8f96, transparent: true, opacity: 0.45 });
      });
      const padAt = new THREE.Vector3(p.wx, 0, p.wz + CELL * 0.9);
      const pad = new Zone(ctx.scene, padAt, CELL * 0.8, ADS_ON ? "▶ AD" : "FREE");
      const label = ctx.labels.add(padAt.clone().setY(1.6), "lock spotpad", SPOT_PAD[kind]);
      this.locked.push({ spot: root, pad, label, seats, kind, at, hold: 0 });
    });
    if (!this.queuePos.lengthSq() && tables[0]) this.queuePos.set(tables[0].wx, 0, tables[0].wz + CELL);
    if (!this.offerAt.lengthSq()) this.offerAt.copy(this.queuePos).setY(3);
  }

  /** Build one spot's furniture at `at`; its seats in world space. */
  private spot(kind: SpotKind, at: THREE.Vector3): { root: THREE.Group; seats: Seat[] } {
    const { root, seats } = breakSpotModel(kind);
    root.position.copy(at);
    this.ctx.scene.add(root);
    freeze(root);
    return { root, seats: seats.map((s) => ({ pos: new THREE.Vector3(at.x + s.x, 0, at.z + s.z), face: s.face, kind })) };
  }

  /** A free seat for `who` (keeps the one it already has), or null. */
  claim(who: object): Seat | null {
    for (const [i, w] of this.taken) if (w === who) return this.seats[i];
    for (let i = 0; i < this.seats.length; i++)
      if (!this.taken.has(i)) {
        this.taken.set(i, who);
        this.unqueue(who);
        return this.seats[i];
      }
    return null;
  }

  release(who: object): void {
    for (const [i, w] of this.taken) if (w === who) this.taken.delete(i);
    this.unqueue(who);
  }

  /** Seatless workers in the order they came; each waits on a spot of their own. */
  private waiting: object[] = [];

  /**
   * Where `who` waits for a seat: a row by the truck, centre first, then either side, a second row
   * behind (user 2026-10-21: waiting workers all stood on the one spot, inside each other).
   */
  queueSpot(who: object): THREE.Vector3 {
    let k = this.waiting.indexOf(who);
    if (k < 0) k = this.waiting.push(who) - 1;
    const col = [0, -1, 1, -2, 2][k % 5];
    const row = Math.floor(k / 5);
    return new THREE.Vector3(this.queuePos.x + col * 1.4, 0, this.queuePos.z + row * 1.4);
  }

  private unqueue(who: object): void {
    const k = this.waiting.indexOf(who);
    if (k >= 0) this.waiting.splice(k, 1);
  }

  update(dt: number): void {
    if (this.busy) return;
    const a = this.ctx.controlled();
    for (const l of this.locked) {
      if (a.kind === "player" && l.pad.contains(a.pos)) {
        l.hold += dt;
        l.pad.setFill(Math.min(1, l.hold / 0.6));
        if (l.hold >= 0.6) {
          l.hold = 0;
          l.pad.setFill(0);
          void this.unlock(l);
        }
      } else if (l.hold > 0) {
        l.hold = 0;
        l.pad.setFill(0);
      }
    }
  }

  private async unlock(l: Cafeteria["locked"][number]): Promise<void> {
    this.busy = true;
    const ok = (await this.onUnlock?.()) ?? false;
    this.busy = false;
    if (!ok) return;
    l.spot.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) (m.material as THREE.Material).dispose();
    });
    this.ctx.scene.remove(l.spot);
    this.spot(l.kind, l.at);
    l.pad.setVisible(false);
    this.ctx.labels.remove(l.label);
    this.seats.push(...l.seats);
    this.locked = this.locked.filter((x) => x !== l);
    S.run.cafTables = (S.run.cafTables ?? 0) + 1;
    markDirty();
    sfx.unlock();
  }
}

export function barrelVisual(): THREE.Mesh {
  return barrelMesh();
}
