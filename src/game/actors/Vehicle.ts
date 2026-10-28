import * as THREE from "three";
import { EQUIP, GAMEPLAY, itemColor, itemKind, OIL_ITEM } from "../data";
import { makeVehicleModel, type VehicleModel } from "../models";
import { Stack } from "../world/Stack";
import type { Miner, Collector } from "../systems/Mining";
import type { Actor } from "../base/Actor";
import { absorb, cargo, fuelEff, fuelTank, interval, mgmtBase, moveSpeed, power } from "../state";

/** Body radius, extra tool reach and blocks per hit of each machine (world units; Wheel Loader for the rest). */
const BODY: Record<string, { radius: number; reach?: number; targets?: number }> = {
  wheelbarrow: { radius: 0.9 },
  hydraulicBreaker: { radius: 1.3, reach: 1.2 },
  rollerCrusher: { radius: 1.4, reach: 1.0, targets: 3 },
  dumpTruck: { radius: 1.5 },
  allTerrainVehicle: { radius: 1.0 },
  // Twin drills side by side: the block in front and its neighbour.
  drillCrusher: { radius: 1.4, reach: 1.1, targets: 2 },
  // One block, but the hammer arm reaches far.
  crushHammer: { radius: 1.4, reach: 2.0 },
  // Blocks per hit come from its attackCount stat (see the constructor).
  infernoBreaker: { radius: 1.5, reach: 1.4 },
  haulTruck: { radius: 1.8 },
  // The bucket wheel sweeps a row like the roller.
  wheelCrusher: { radius: 1.6, reach: 1.1, targets: 3 },
  fuelTruck: { radius: 1.6 },
};

/** Item pile on the machine: the big haulers spread it over their beds. */
const PILE: Record<string, { cols: number; rows: number; size: number; maxShown: number }> = {
  haulTruck: { cols: 5, rows: 6, size: 0.3, maxShown: 60 },
  wheelCrusher: { cols: 4, rows: 3, size: 0.28, maxShown: 60 },
};

/** Seconds between two barrels' worth of fuel from the Fuel Truck's hose. */
const FEED_EVERY = 0.2;
/**
 * Speed of a machine with an empty tank. The data says 5 % (`vehicleEmptyFuelMoveSpeedMulti`); ours is
 * 35 % so a dry machine limps back to OIL by itself, where it is refuelled (OilStation drive-in).
 * Playtest 2026-10-24: at 5 %, the only way out was the walk for barrels, which a full back blocked.
 */
const EMPTY_CRAWL = 0.35;

/**
 * A rented machine. Mining vehicles (breakers, crushers, drills, hammers) swing at blocks
 * in front; carrying vehicles (Wheelbarrow, Wheel Loader, Dump / Haul Truck) vacuum chunks into
 * their own cargo; the Wheel Crusher (hybrid) does both; the ATV hauls oil barrels; the Fuel
 * Truck tops up machines parked next to it from its own tank (`refuelNearby`). Fuel-powered ones
 * burn fuel while working and crawl (EMPTY_CRAWL) when the tank is empty.
 */
export class Vehicle implements Actor, Miner, Collector {
  readonly kind = "vehicle" as const;
  readonly model: VehicleModel;
  readonly pos = new THREE.Vector3();
  facing = Math.PI;
  readonly radius: number;
  readonly stack: Stack;
  incoming = 0;
  absorb = 0;
  // Miner
  power = 0;
  interval = 1;
  reach = 0;
  targets = 1;
  cooldown = 0;
  lastHit = null as Miner["lastHit"];
  powerMul = 1;
  intervalMul = 0;

  readonly mines: boolean;
  readonly carries: boolean;
  readonly fuelled: boolean;
  /** Fuel Truck: its tank is fuel for the others; driving it burns nothing. */
  readonly feeds: boolean;
  fuel = 0;
  tank = 0;
  speed = 6;
  driven = false;
  moving = false;
  private toolT = 0;
  /** Inferno Breaker: glow of the chisel, 1 right after a hit, cooling down after. */
  private heat = 0;
  /** Fuel Truck: time toward the next barrel's worth, and hose-reel animation left. */
  private feedT = FEED_EVERY;
  private feeding = 0;

  constructor(scene: THREE.Scene, readonly key: string) {
    const def = EQUIP[key];
    const sub = def?.sub ?? "";
    this.mines = sub === "MiningVehicle" || sub === "HybridVehicle";
    this.carries = sub === "AllCarryingVehicle" || sub === "ResourceCarryingVehicle" || sub === "OilCarryingVehicle" || sub === "HybridVehicle";
    this.feeds = sub === "FuelTruck";
    this.fuelled = (def?.stats.fuelAmount ?? 0) > 0;
    this.model = makeVehicleModel(key);
    const body = BODY[key] ?? { radius: 1.4 };
    this.radius = body.radius;
    this.reach = body.reach ?? 0;
    this.targets = body.targets ?? Math.max(1, Math.round(def?.stats.attackCount ?? 1));
    this.model.root.scale.setScalar(key === "wheelbarrow" ? 1.4 : 1.5);
    scene.add(this.model.root);
    const cap = key === "allTerrainVehicle" ? (def?.stats.cargo ?? 5) + mgmtBase(key, "Cargo") : this.carries ? cargo(key) : 0;
    this.stack = new Stack(this.model.stackAnchor, cap, itemColor, PILE[key] ?? { cols: 3, rows: 2, size: 0.26, maxShown: 60 });
    this.accepts = key === "allTerrainVehicle" ? (i) => i === OIL_ITEM : (i) => itemKind(i) === "mineral";
    this.tank = fuelTank(key);
    this.fuel = this.tank;
    this.refresh();
  }

  accepts: (item: number) => boolean;

  /** Re-read upgradeable stats (after an upgrade purchase). */
  refresh(): void {
    this.speed = moveSpeed(this.key);
    if (this.mines) {
      this.power = power(this.key);
      this.interval = interval(this.key);
    }
    if (this.carries && this.key !== "allTerrainVehicle") {
      this.stack.capacity = cargo(this.key);
      this.absorb = absorb(this.key);
    }
    // Fuel Truck capacity is an upgrade (Fuel Capacity).
    if (this.fuelled) this.tank = fuelTank(this.key);
  }

  get empty(): boolean {
    return this.fuelled && !this.feeds && this.fuel <= 0;
  }

  /** Fuel the Fuel Truck still has to hand out (0 for every other machine). */
  get fuelReserve(): number {
    return this.feeds ? this.fuel : 0;
  }

  /** Drive by a world-space intent; burns fuel while moving. */
  drive(vx: number, vz: number, dt: number): void {
    const l = Math.hypot(vx, vz);
    this.moving = l > 0.05;
    if (!this.moving) return;
    const spd = this.speed * (this.empty ? EMPTY_CRAWL : 1);
    const target = Math.atan2(vx, vz);
    let d = target - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * 7);
    // Vehicles move along their heading (no strafing), slower while turning hard.
    const k = Math.max(0.25, Math.cos(Math.min(Math.abs(d), Math.PI / 2)));
    this.pos.x += Math.sin(this.facing) * spd * l * k * dt;
    this.pos.z += Math.cos(this.facing) * spd * l * k * dt;
    this.burn(dt);
    for (const w of this.model.wheels) w.rotation.x += spd * dt * 1.8;
  }

  /** Fuel drain ≈ 1 / fuel-efficiency units per working second (INFERRED, see docs). */
  burn(dt: number): void {
    if (!this.fuelled || this.feeds || this.fuel <= 0) return;
    this.fuel = Math.max(0, this.fuel - dt / Math.max(0.1, fuelEff(this.key)));
  }

  addFuel(): boolean {
    if (!this.fuelled || this.fuel >= this.tank - 0.01) return false;
    this.fuel = Math.min(this.tank, this.fuel + GAMEPLAY.fuelPerOilBarrel);
    return true;
  }

  /**
   * Fuel Truck only: while it has fuel, top up the thirstiest fuelled machine within reach
   * (radius sum + 1.5) by one barrel's worth (GAMEPLAY.fuelPerOilBarrel) every FEED_EVERY s,
   * from its own tank. Call every frame; returns the machine fed on the frames a top-up
   * happens (for a flying barrel / sound), else null.
   */
  refuelNearby(others: Vehicle[], dt: number): Vehicle | null {
    if (!this.feeds || this.fuel <= 0) {
      this.feedT = FEED_EVERY;
      return null;
    }
    let target: Vehicle | null = null;
    let low = Infinity;
    for (const v of others) {
      if (v === this || !v.fuelled || v.feeds || v.fuel >= v.tank - 0.5) continue;
      if (Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z) >= v.radius + this.radius + 1.5) continue;
      const k = v.fuel / Math.max(1, v.tank);
      if (k < low) {
        low = k;
        target = v;
      }
    }
    if (!target) {
      // The first barrel goes over as soon as a machine pulls up.
      this.feedT = FEED_EVERY;
      return null;
    }
    this.feeding = FEED_EVERY * 1.5;
    this.feedT += dt;
    if (this.feedT < FEED_EVERY) return null;
    this.feedT = Math.min(FEED_EVERY, this.feedT - FEED_EVERY);
    const n = Math.min(GAMEPLAY.fuelPerOilBarrel, target.tank - target.fuel, this.fuel);
    target.fuel += n;
    this.fuel -= n;
    return target;
  }

  /** Seconds the engine still counts as "working" after the last hit (burns fuel). */
  private workT = 0;

  hitAnim(): void {
    this.toolT = 1;
    this.heat = 1;
    this.workT = this.interval * 1.5 + 0.1;
  }

  update(dt: number): void {
    // Fuel burns while driving (see drive) and while the tool is working, not per hit.
    if (this.workT > 0) {
      this.workT -= dt;
      if (!this.moving) this.burn(dt);
    }
    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = this.facing;
    const tool = this.model.tool;
    if (tool) {
      if (this.toolT > 0) this.toolT = Math.max(0, this.toolT - dt * 6);
      const t = this.toolT;
      switch (this.key) {
        case "hydraulicBreaker":
          tool.position.y = 1.0 + Math.sin(t * Math.PI) * 0.35;
          break;
        case "rollerCrusher":
          tool.rotation.x += dt * (t > 0 ? 10 : 2);
          break;
        case "drillCrusher":
          // Bits spin flat out while drilling, idle while driven; the head pushes in on each hit.
          for (const b of this.model.spin ?? []) b.rotation.z += dt * (t > 0 ? 30 : this.driven ? 4 : 0);
          tool.position.z = 1.08 + Math.sin(t * Math.PI) * 0.12;
          break;
        case "crushHammer":
          // Slams down on the hit, then rises for the next one.
          tool.rotation.x = t > 0 ? -Math.sin((1 - t) * Math.PI) * 0.5 : 0;
          break;
        case "infernoBreaker":
          tool.position.y = (tool.userData.restY ?? 1.25) + Math.sin(t * Math.PI) * 0.45;
          break;
        case "wheelCrusher":
          tool.rotation.x -= dt * (t > 0 ? 6 : this.driven ? 1.2 : 0);
          break;
        case "fuelTruck":
          if (this.feeding > 0) tool.rotation.x += dt * 8;
          break;
        default:
          tool.rotation.x = -t * 0.4;
      }
    }
    if (this.feeding > 0) this.feeding -= dt;
    const glow = this.model.glow;
    if (glow) {
      // White-hot on the hit, cooling over ~2 s to a dull ember.
      this.heat = Math.max(0, this.heat - dt * 0.5);
      glow.emissiveIntensity = 0.45 + this.heat * 1.4 + (this.driven ? Math.sin(performance.now() / 160) * 0.08 : 0);
    }
    // Idle engine wobble while driven.
    r.position.y = this.driven && this.fuelled && !this.empty ? Math.sin(performance.now() / 45) * 0.02 : 0;
    this.stack.update(dt);
  }
}
