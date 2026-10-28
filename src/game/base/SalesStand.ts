import * as THREE from "three";
import { CELL, PACE, itemColor, itemKind, oreOfItemId, type Placed } from "../data";
import { CASH, cashMesh, marketModel, truckModel } from "../world/props";
import { bakeColors, mat } from "../models";
import { THEME, groundTexture } from "../theme";
import { Stack } from "../world/Stack";
import { Zone } from "./Zone";
import type { BaseCtx } from "./Ctx";
import type { Actor } from "./Actor";
import { events, Ticker } from "../systems/Events";
import { upValue, upValue2, UNLOAD_TRANSFER } from "./common";
import { sfx } from "../audio";
import type { Label } from "../ui/Labels";
import { S, addCash, markDirty } from "../state";

interface Truck {
  root: THREE.Group;
  bed: Stack;
  wheels: THREE.Object3D[];
  x: number;
  state: "arrive" | "load" | "leave";
  target: number;
  loaded: number;
  value: number;
  byCat: Record<string, number>;
  wait: number;
  label: Label;
  tick: Ticker;
}

/** Trading house rhythm: quick on purpose (user: "the progress is very fast"). */
const INTAKE_EVERY = 0.08;
const OUTPUT_EVERY = 0.08;
const PROCESS_SECONDS = 0.3;

/**
 * The Market (Farm Valley; the trading house, ours, user 2026-10-19): the player drops goods on the SELL pad, a belt takes
 * them inside, the house pushes them out of its front door onto the BUY dock by the road, trucks
 * load there, pay the house, and the house puts the cash on the CASH pad for the player to walk
 * over. SELL and CASH stand one above the other on the side facing the furnace (`side`, user):
 * SELL on the inner side, CASH on the outer (road) side. Only the SELL pad is drawn (user).
 * Each truck wants a random load in [Sales Trucks min, max]. Progress still counts the ingots
 * trucks carry away.
 */
export class SalesStand {
  /** SELL pad: quests, the guide arrow, carriers and the price board use it. */
  readonly zone: Zone;
  /** Ingots on the SELL pad. */
  readonly pile: Stack;
  /** CASH pad centre (the money pallet). */
  readonly moneyPos: THREE.Vector3;
  /** Price board spot (its right edge x, front z) on the side away from the pads. */
  readonly boardAt: { right: number; front: number };
  private moneyRoot = new THREE.Group();
  private bundles: { mesh: THREE.Mesh; value: number }[] = [];
  /** BUY dock: ingots the house put out for the trucks. */
  private dock: Stack;
  private dockAnchor = new THREE.Object3D();
  private houseIn = new THREE.Object3D();
  private houseOut = new THREE.Object3D();
  /** Ingots inside the house, with how long they have been in. */
  private inHouse: { item: number; t: number }[] = [];
  /** Ingots in the air on a belt (pad → house, house → dock). */
  private moving: number[] = [];
  private intakeTick = new Ticker();
  private outputTick = new Ticker();
  /** Truck payments on their way to the CASH pad. */
  private cashPending = 0;
  /** Trucks on the lane: at most one arriving/loading, others driving off. */
  private trucks: Truck[] = [];
  private padTick = new Map<Actor, Ticker>();
  private moneyTick = new Ticker();
  private loadLabel: Label;
  private laneZ: number;
  private stopX: number;
  private readonly startX: number;
  private readonly endX: number;
  private pileAnchor = new THREE.Object3D();
  /** Instant big sale (SPECIAL ORDER boost): next truck takes up to this many. */
  specialOrder = 0;

  /** `side`: +1 = pads east of the house, -1 = west (towards the furnace). */
  constructor(private ctx: BaseCtx, p: Placed, roads: Placed[], side: 1 | -1 = 1) {
    const H = new THREE.Vector3(p.wx, 0, p.wz);
    // The house: same footprint and front line as the other entry buildings (Game adds its solid).
    const house = new THREE.Group();
    house.position.copy(H);
    house.add(marketModel());
    ctx.scene.add(house);
    this.houseIn.position.set(H.x + side * CELL * 0.85, 1.0, H.z - 2.3);
    this.houseOut.position.set(H.x + CELL * 0.1, 1.0, H.z + 0.9);
    ctx.scene.add(this.houseIn, this.houseOut);

    // SELL (inner) and CASH (outer) on the furnace side, BUY dock in front by the road.
    const padX = H.x + side * CELL * 2.4;
    this.zone = new Zone(ctx.scene, new THREE.Vector3(padX, 0, H.z - 2.3), CELL * 1.25, "SELL");
    this.pileAnchor.position.copy(this.zone.center).setY(0.05);
    ctx.scene.add(this.pileAnchor);
    this.pile = new Stack(this.pileAnchor, 99999, itemColor, { cols: 3, rows: 2, size: 0.6, maxShown: 30 });
    this.moneyPos = new THREE.Vector3(padX, 0, H.z + 1.25);
    this.boardAt = side > 0 ? { right: H.x - CELL * 1.25 - 0.6, front: H.z + 1.6 } : { right: H.x + CELL * 1.25 + 9, front: H.z + 1.6 };
    this.moneyRoot.position.copy(this.moneyPos);
    ctx.scene.add(this.moneyRoot);
    const dockAt = new THREE.Vector3(H.x + CELL * 0.1, 0, H.z + CELL * 2.0);
    this.dockAnchor.position.copy(dockAt).setY(0.05);
    ctx.scene.add(this.dockAnchor);
    this.dock = new Stack(this.dockAnchor, 99999, itemColor, { cols: 3, rows: 2, size: 0.6, maxShown: 30 });
    this.loadLabel = ctx.labels.add(new THREE.Vector3(this.zone.center.x, 0, this.zone.center.z + CELL * 0.85), "load", "LOAD: 0");
    // Belts: SELL pad → side door, front door → BUY dock.
    ctx.scene.add(belt(new THREE.Vector3(this.zone.center.x - side * CELL * 0.55, 0, this.zone.center.z), new THREE.Vector3(this.houseIn.position.x, 0, this.zone.center.z)));
    ctx.scene.add(belt(new THREE.Vector3(this.houseOut.position.x, 0, H.z + 0.9), new THREE.Vector3(dockAt.x, 0, dockAt.z - CELL * 0.55)));

    // Truck lane: along the road row (the road props mark the entry/exit at map edges).
    const rz = roads.length ? roads[0].wz : p.wz + CELL * 3;
    this.laneZ = rz;
    const xs = roads.map((r) => r.wx);
    this.startX = (xs.length ? Math.min(...xs) : p.wx - 40) - 6;
    this.endX = (xs.length ? Math.max(...xs) : p.wx + 40) + 6;
    this.stopX = dockAt.x + 1.2;
    // A dirt road joining the two road tiles (Farm Valley; was a chocolate strip, before that asphalt with dashes):
    // packed earth with pebbles.
    const len = this.endX - this.startX;
    const tex = groundTexture(THEME.roadTex, THEME.roadDots, { seed: 41, blades: 650, pebbles: 12, tufts: 4 });
    tex.repeat.set(len / 10, (CELL * 3) / 10);
    const lane = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, CELL * 3), new THREE.MeshLambertMaterial({ map: tex }));
    lane.position.set((this.startX + this.endX) / 2, 0.01, this.laneZ);
    lane.receiveShadow = true;
    ctx.scene.add(lane);
  }

  /** Cash waiting on the pallet. */
  get moneyWaiting(): number {
    return this.bundles.reduce((s, b) => s + b.value, 0);
  }

  /** Cash on the CASH spot or on its way there from a truck (the guide arrow waits for it). */
  get cashAhead(): number {
    return this.moneyWaiting + this.cashPending;
  }

  /** Ingots on their way to a truck, or on one that hasn't paid yet: cash is coming. */
  get selling(): boolean {
    return this.pipeline > 0 || this.trucks.some((t) => t.state !== "leave" && t.loaded > 0);
  }

  /** Bundles in the air between the pallet and the player (not yet in `S.cash`). */
  private inFlight = 0;
  /** What the save keeps as pallet cash: a reload mid-pickup or mid-payment loses nothing. */
  get moneyToSave(): number {
    return this.moneyWaiting + this.inFlight + this.cashPending;
  }

  /** Every ingot between the SELL pad and a truck (the save puts them all back on the pad). */
  get itemsToSave(): number[] {
    return [...this.pile.items, ...this.moving, ...this.inHouse.map((h) => h.item), ...this.dock.items];
  }

  /** Ingots on their way to a truck. */
  private get pipeline(): number {
    return this.pile.count + this.moving.length + this.inHouse.length + this.dock.count;
  }

  update(dt: number): void {
    // Pad: ingots only (raw minerals can't be sold in the main mode).
    for (const a of this.ctx.actors()) {
      if (a.kind === "worker" || !this.zone.contains(a.pos)) {
        this.padTick.get(a)?.reset();
        continue;
      }
      let tk = this.padTick.get(a);
      if (!tk) this.padTick.set(a, (tk = new Ticker()));
      tk.tick(dt, UNLOAD_TRANSFER, () => {
        const it = a.stack.take((i) => itemKind(i) === "ingot");
        if (it === null) return false;
        const from = a.stack.topWorld();
        this.ctx.flyers.launch(from, this.pileAnchor, itemColor(it), () => {
          this.pile.push(it);
          sfx.drop();
        }, { offset: new THREE.Vector3(0, 0.6, 0), item: it });
        events.emit("ingotToSales", { count: 1 });
        return true;
      });
    }
    this.updateHouse(dt);
    this.updateTruck(dt);
    this.updateMoney(dt);
    this.pile.update(dt);
    this.dock.update(dt);
    this.ctx.labels.set(this.loadLabel, `LOAD: ${this.pipeline}`);
  }

  /** Belt in, a short stay inside, belt out onto the BUY dock. */
  private updateHouse(dt: number): void {
    this.intakeTick.tick(dt, INTAKE_EVERY, () => {
      const from = this.pile.topWorld();
      const it = this.pile.pop();
      if (it === null) return false;
      this.moving.push(it);
      this.ctx.flyers.launch(from, this.houseIn, itemColor(it), () => {
        this.moving.splice(this.moving.indexOf(it), 1);
        this.inHouse.push({ item: it, t: 0 });
      }, { dur: 0.22, arc: 0.5, item: it });
      return true;
    });
    for (const h of this.inHouse) h.t += dt;
    this.outputTick.tick(dt, OUTPUT_EVERY, () => {
      const h = this.inHouse[0];
      if (!h || h.t < PROCESS_SECONDS) return false;
      this.inHouse.shift();
      this.moving.push(h.item);
      this.ctx.flyers.launch(this.houseOut.getWorldPosition(new THREE.Vector3()), this.dockAnchor, itemColor(h.item), () => {
        this.moving.splice(this.moving.indexOf(h.item), 1);
        this.dock.push(h.item);
      }, { dur: 0.25, arc: 0.6, offset: new THREE.Vector3(0, 0.5, 0), item: h.item });
      return true;
    });
  }

  private spawnTruck(): Truck {
    const m = truckModel();
    m.root.position.set(this.startX, 0, this.laneZ);
    this.ctx.scene.add(m.root);
    const lo = Math.round(upValue("salesTruckWeightMin"));
    const hi = Math.round(upValue2("salesTruckWeightMin") || lo + 3);
    const target = this.specialOrder > 0 ? this.specialOrder : lo + Math.floor(Math.random() * (hi - lo + 1));
    this.specialOrder = 0;
    const t: Truck = {
      root: m.root,
      bed: new Stack(m.bed, 999, itemColor, { cols: 4, rows: 2, size: 0.62, maxShown: 48 }),
      wheels: m.wheels,
      x: this.startX,
      state: "arrive",
      target,
      loaded: 0,
      value: 0,
      byCat: {},
      wait: 0,
      label: this.ctx.labels.add(m.root, "truck", `0/${target}`, 4.2),
      tick: new Ticker(),
    };
    this.trucks.push(t);
    return t;
  }

  /**
   * Trucks queue on the lane (reference): the next one pulls in as soon as the current one
   * drives off loaded, instead of waiting for it to leave the screen. A truck is called as soon
   * as anything is on its way to the dock.
   */
  private updateTruck(dt: number): void {
    const docking = this.trucks.some((x) => x.state !== "leave");
    if (!docking && this.pipeline > 0) this.spawnTruck();
    for (const t of [...this.trucks]) this.driveTruck(t, dt);
  }

  private driveTruck(t: Truck, dt: number): void {
    // PACE.truck: driving, loading and giving up on a part load all run faster than the original.
    const speed = 14 * PACE.truck;
    if (t.state === "arrive") {
      t.x = Math.min(this.stopX, t.x + speed * dt * Math.max(0.25, Math.min(1, (this.stopX - t.x) / 6)));
      if (this.stopX - t.x < 0.05) t.state = "load";
    } else if (t.state === "load") {
      t.tick.tick(dt, 0.12 / PACE.truck, () => {
        if (t.loaded >= t.target) return false;
        const from = this.dock.topWorld();
        const it = this.dock.pop();
        if (it === null) return false;
        const ore = oreOfItemId(it);
        t.loaded++;
        t.value += ore?.ingotPrice ?? 0;
        if (ore) t.byCat[ore.category] = (t.byCat[ore.category] ?? 0) + 1;
        t.wait = 0;
        this.ctx.flyers.launch(from, t.root, itemColor(it), () => t.bed.push(it), { offset: new THREE.Vector3(-1.2, 1.6, 0), dur: 0.3, item: it });
        return true;
      });
      t.wait += dt;
      // Full, or partially loaded and nothing more coming for a while → leave.
      if (t.loaded >= t.target || (t.loaded > 0 && this.pipeline === 0 && t.wait > 2.5 / PACE.truck)) {
        t.state = "leave";
        this.sell(t);
      }
    } else {
      t.x += speed * dt * Math.min(1, 0.3 + (t.x - this.stopX) / 8);
      if (t.x > this.endX) {
        this.ctx.scene.remove(t.root);
        this.ctx.labels.remove(t.label);
        this.trucks.splice(this.trucks.indexOf(t), 1);
        return;
      }
    }
    t.root.position.x = t.x;
    for (const w of t.wheels) w.rotation.x += dt * (t.state === "load" ? 0 : 6);
    this.ctx.labels.set(t.label, t.state === "leave" ? "" : `${t.loaded}/${t.target}`);
    t.bed.update(dt);
  }

  /** Truck departs: it pays the house, the house puts the cash on the CASH pad; progress counts. */
  private sell(t: Truck): void {
    S.run.sold += t.loaded;
    markDirty();
    this.pay(t.root.position.clone().setY(1.6), t.value, t.loaded);
    for (const [cat, n] of Object.entries(t.byCat)) events.emit("ingotSold", { count: n, category: cat, cash: 0 });
    sfx.coin();
  }

  /** Coins hop from the buyer into the house, then out onto the CASH pad as bundles. */
  private pay(from: THREE.Vector3, value: number, pieces: number): void {
    if (value <= 0) return;
    this.cashPending += value;
    const coins = 3;
    let landed = 0;
    for (let i = 0; i < coins; i++) {
      this.ctx.flyers.launch(from, this.houseOut, 0xffd34d, () => {
        if (++landed < coins) return;
        this.ctx.flyers.launch(this.houseOut.getWorldPosition(new THREE.Vector3()), this.moneyRoot, 0x5cc14f, () => {
          this.cashPending -= value;
          this.addPallet(value, pieces);
          sfx.coin();
        }, { dur: 0.3, arc: 1.0, offset: new THREE.Vector3(0, 0.4, 0), cash: true });
      }, { dur: 0.32 + i * 0.06, arc: 1.4, coin: true });
    }
  }

  /** SPECIAL ORDER (RV 5002): a special buyer takes up to `n` ingots at once (dock first). */
  instantSell(n: number): void {
    let value = 0;
    let count = 0;
    const byCat: Record<string, number> = {};
    while (count < n) {
      const it = this.dock.pop() ?? this.inHouse.shift()?.item ?? this.pile.pop();
      if (it === null || it === undefined) break;
      const ore = oreOfItemId(it);
      value += ore?.ingotPrice ?? 0;
      if (ore) byCat[ore.category] = (byCat[ore.category] ?? 0) + 1;
      count++;
    }
    if (!count) return;
    S.run.sold += count;
    markDirty();
    this.pay(this.houseOut.getWorldPosition(new THREE.Vector3()).setY(4), value, count);
    for (const [cat, k] of Object.entries(byCat)) events.emit("ingotSold", { count: k, category: cat, cash: 0 });
    sfx.coin();
  }

  /**
   * Stack `value` cash on the pallet as up to 12 bundles (also used to restore a save): a block
   * of bundles 3 wide and 4 deep that grows upward, like the reference's money pile.
   */
  addPallet(value: number, pieces = 12): void {
    const per = Math.max(1, Math.ceil(value / Math.max(1, Math.min(pieces, 12))));
    let left = value;
    while (left > 0) {
      const v = Math.min(per, left);
      left -= v;
      const mesh = cashMesh();
      const i = this.bundles.length;
      const layer = Math.floor(i / 12);
      const r = i % 12;
      mesh.position.set(((r % 3) - 1) * CASH.w * 1.02, CASH.h / 2 + Math.min(layer, 24) * CASH.h, (Math.floor(r / 3) - 1.5) * CASH.d * 1.04);
      mesh.rotation.y = (((i * 7) % 5) - 2) * 0.012;
      this.moneyRoot.add(mesh);
      this.bundles.push({ mesh, value: v });
    }
  }

  private updateMoney(dt: number): void {
    const a = this.ctx.controlled();
    const d = Math.hypot(a.pos.x - this.moneyPos.x, a.pos.z - this.moneyPos.z);
    if (d > CELL * 0.9 || !this.bundles.length) {
      this.moneyTick.reset();
      return;
    }
    this.moneyTick.tick(dt, 0.035, () => {
      const b = this.bundles.pop();
      if (!b) return false;
      const from = new THREE.Vector3();
      b.mesh.getWorldPosition(from);
      this.moneyRoot.remove(b.mesh);
      this.inFlight += b.value;
      this.ctx.flyers.launch(from, a.stack.anchor, 0x5cc14f, () => {
        this.inFlight -= b.value;
        addCash(b.value);
        sfx.coin();
        events.emit("cashCollected", { amount: b.value });
      }, { dur: 0.28, arc: 1.2, cash: true });
      return true;
    });
  }
}

/** A short conveyor on the ground from `a` to `b`: a dark belt between wooden side boards on wooden trestles, baked. */
function belt(a: THREE.Vector3, b: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const len = Math.max(0.5, a.distanceTo(b));
  const w = 1.0;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, len), mat(0x4a4440));
  top.position.y = 0.32;
  g.add(top);
  // Rollers showing at the ends.
  for (const z of [-len / 2 + 0.06, len / 2 - 0.06]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, w, 10).rotateZ(Math.PI / 2), mat(0x8f8a84));
    r.position.set(0, 0.32, z);
    g.add(r);
  }
  for (const x of [-w / 2 - 0.05, w / 2 + 0.05]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, len), mat(0xb47c45));
    rail.position.set(x, 0.36, 0);
    g.add(rail);
  }
  for (const z of [-len / 2 + 0.2, len / 2 - 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.3, 0.14), mat(0x7a4f2a));
    leg.position.set(0, 0.13, z);
    g.add(leg);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  bakeColors(g);
  g.position.copy(a).lerp(b, 0.5);
  g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  return g;
}
