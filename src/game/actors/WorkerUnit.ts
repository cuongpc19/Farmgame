import * as THREE from "three";
import { power, interval, cargoBase } from "../state";
import { buffs, buffClock } from "../systems/Boosts";
import { CELL, PACE, PICKAXE_MUL, itemColor, itemKind, WORKER_RULES, type WorkerProfile } from "../data";
import { Character, PLAYER_HEIGHT, SWING_LEAD } from "../characters";
import { Stack } from "../world/Stack";
import type { Miner, Collector, Mining } from "../systems/Mining";
import type { Actor } from "../base/Actor";
import type { BlockField, Block } from "../world/BlockField";
import type { Drops } from "../world/Drops";
import type { Seat } from "../base/Buildings";

export interface WorkerWorld {
  field: BlockField;
  drops: Drops;
  mining: Mining;
  furnacePad: THREE.Vector3;
  storagePad: THREE.Vector3;
  storageCount: () => number;
  seats: Seat[];
  rest: THREE.Vector3;
  /** Take a free cafeteria seat (null when all are taken) / give it back. */
  claimSeat: (who: object) => Seat | null;
  releaseSeat: (who: object) => void;
  /** Where this worker waits for a seat (every waiting worker gets their own spot). */
  queueSpot: (who: object) => THREE.Vector3;
  collide: (p: THREE.Vector3, r: number) => void;
  /**
   * A walking route from `from` to `to` around buildings and unbroken ore (Nav.route): fills
   * `out` with waypoints. False: no way there from here.
   */
  route: (from: THREE.Vector3, to: THREE.Vector3, out: THREE.Vector3[]) => boolean;
  /** The nearest spot by walking where `want(x, z)` holds (Nav.nearest), with the route in `out`. */
  nearest: (from: THREE.Vector3, want: (x: number, z: number) => boolean, out: THREE.Vector3[]) => THREE.Vector3 | null;
  /** The nearest loose chunk by walking (skipping any near `avoid`), with the route in `out`. */
  nearestDrop: (from: THREE.Vector3, avoid: THREE.Vector3 | null, out: THREE.Vector3[]) => THREE.Vector3 | null;
  /** Blocks other miners already target (spread the crew out). */
  claimed: Set<Block>;
}

type State = "seek" | "work" | "deliver" | "tired" | "resting";

/**
 * A hired worker (this stage only). Miners walk to an exposed block and swing at it;
 * carriers vacuum loose chunks (or take from ore storage) and haul them to the furnace.
 * Every hit / delivered item costs 1 stamina; at 0 they go sit in the cafeteria for
 * StaminaRecoverTimeBase (50 s), then go back to work.
 */
export class WorkerUnit implements Actor, Miner, Collector {
  readonly kind = "worker" as const;
  readonly model: Character;
  readonly pos = new THREE.Vector3();
  facing = Math.PI;
  readonly radius = 0.6;
  readonly stack: Stack;
  incoming = 0;
  absorb = 1.5;
  power: number;
  interval = 1;
  reach = 0;
  targets = 1;
  cooldown = 0;
  lastHit = null as Miner["lastHit"];
  powerMul = 1;
  intervalMul = 0;
  stamina: number;
  state: State = "seek";
  private goal = new THREE.Vector3();
  private block: Block | null = null;
  private restT = 0;
  private stuckT = 0;
  private sinceHit = 99;
  /** Items on the way to the furnace this trip (stamina cost on arrival). */
  private carried = 0;
  private lastPos = new THREE.Vector3();
  private seat: Seat | null = null;
  /** Blocks this worker failed to reach recently (skip them for a while). */
  private skip = new Map<Block, number>();
  private clock = 0;
  private noProgress = 0;

  constructor(scene: THREE.Scene, readonly profile: WorkerProfile, private w: WorkerWorld, spawn: THREE.Vector3) {
    // A different person per applicant; only miners carry a pickaxe. A bit smaller than the player.
    this.model = new Character("worker", profile.id, { tool: profile.role === "Mining", height: PLAYER_HEIGHT * 0.88 });
    scene.add(this.model.root);
    this.pos.copy(spawn);
    this.power = profile.stats.power;
    this.stamina = profile.stats.stamina;
    this.stack = new Stack(this.model.stackAnchor, Math.max(1, Math.round(profile.stats.cargo * PACE.cargo)), itemColor, { cols: 1, rows: 1, size: 0.75, maxShown: 80, outline: true, ingot: 0.7 });
  }

  accepts = (i: number) => itemKind(i) === "mineral";

  get label(): string {
    return this.profile.name;
  }

  /** How far through their rest a resting worker is (0..1; the bubble over their head), null when not resting. */
  get restDone(): number | null {
    return this.state === "resting" ? 1 - Math.max(0, this.restT) / WORKER_RULES.staminaRecoverSeconds : null;
  }

  /** What a resting worker is doing: eating, drinking or sitting back at their seat, or waiting for one; null when not resting. */
  get restKind(): Seat["kind"] | "wait" | null {
    return this.state === "resting" ? this.seat?.kind ?? "wait" : null;
  }

  /** Pushed back where it walks, or no way to its goal (telemetry `wk`). */
  get blocked(): boolean {
    return this.noWay || this.stuckT > 0.4;
  }

  /** SPEED BOOST: x1.3 while it runs (Game sets it with intervalMul; the original's boost covers the crew). */
  speedMul = 1;

  get speed(): number {
    return this.profile.stats.moveSpeed * this.speedMul;
  }

  /** Waypoints to the current goal (Nav.route), replanned as blocks break and when stuck. */
  private path: THREE.Vector3[] = [];
  private pathTo = new THREE.Vector3(1e9, 0, 1e9);
  private sincePlan = 99;
  /** The last plan found no way to the goal from here (another island, or walled in by ore). */
  private noWay = false;
  /** A loose chunk this carrier could not reach: skip that spot for a while. */
  private badGoal = new THREE.Vector3(1e9, 0, 1e9);
  private badUntil = 0;

  /**
   * One step along the route to `goal`; true once within `near` of it (or of the closest open
   * spot to it, when the goal itself is taken). User 2026-10-21: workers kept walking into ore and
   * buildings; they used to aim straight at the goal and slide off whatever was in the way.
   */
  private walkTo(goal: THREE.Vector3, dt: number, near = 0.4): boolean {
    const end = this.path.length && goal.distanceToSquared(this.pathTo) < 0.01 ? this.path[this.path.length - 1] : goal;
    if (Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) <= near || Math.hypot(end.x - this.pos.x, end.z - this.pos.z) <= near) {
      this.path.length = 0;
      this.noWay = false;
      return true;
    }
    // Plan on a new goal, every 1.5 s (blocks break and open shorter ways), and when stuck.
    this.sincePlan += dt;
    if (goal.distanceToSquared(this.pathTo) > 0.25 || this.sincePlan > 1.5 || (this.stuckT > 0.5 && this.sincePlan > 0.5)) {
      this.sincePlan = 0;
      this.pathTo.copy(goal);
      this.noWay = !this.w.route(this.pos, goal, this.path);
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.pos.x, this.path[0].z - this.pos.z) < 0.35) this.path.shift();
    const p = this.noWay || !this.path.length ? goal : this.path[0];
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1e-6;
    const s = Math.min(d, this.speed * dt);
    this.pos.x += (dx / d) * s;
    this.pos.z += (dz / d) * s;
    this.facing = Math.atan2(dx, dz);
    this.w.collide(this.pos, this.radius);
    // Unstick: if pushed back by a corner, sidestep perpendicular for a moment.
    if (this.pos.distanceToSquared(this.lastPos) < (s * 0.2) ** 2) {
      this.stuckT += dt;
      if (this.stuckT > 0.4) {
        this.pos.x += (-dz / d) * this.speed * dt;
        this.pos.z += (dx / d) * this.speed * dt;
        this.w.collide(this.pos, this.radius);
      }
    } else this.stuckT = 0;
    this.lastPos.copy(this.pos);
    return false;
  }

  /**
   * The nearest block by walking that has a free side to stand on, is not another miner's and
   * was not given up lately; the goal is the spot beside it. (As the crow flies, the nearest block
   * often lay behind a wall of ore or across the water, and miners kept walking into things.)
   */
  private pickBlock(): boolean {
    const f = this.w.field;
    let found = null as Block | null;
    const at = this.w.nearest(
      this.pos,
      (x, z) => {
        // A half cell touches the two ore cells on its own sides.
        const ci = Math.round(x / CELL);
        const cj = Math.round(z / CELL);
        for (const [ox, oz] of [[x > ci * CELL ? 1 : -1, 0], [0, z > cj * CELL ? 1 : -1]]) {
          const b = f.at(ci + ox, cj + oz);
          if (b && !this.w.claimed.has(b) && (this.skip.get(b) ?? 0) <= this.clock) {
            found = b;
            return true;
          }
        }
        return false;
      },
      this.path,
    );
    const b = found as Block | null;
    if (!at || !b) return false;
    this.block = b;
    this.w.claimed.add(b);
    this.goal.copy(at);
    this.pathTo.copy(at);
    this.sincePlan = 0;
    this.noWay = false;
    this.noProgress = 0;
    return true;
  }

  /** Seconds before looking for work again after finding none (a search covers the whole ground). */
  private seekWait = 0;

  private release(): void {
    if (this.block) this.w.claimed.delete(this.block);
    this.block = null;
  }

  /**
   * Use one of the player's light tools (null = basic gear). Stats scale from the profile by
   * the tool's strength relative to the basic Pickaxe (power 10) / Wooden Carrier (cargo 5).
   */
  setGear(key: string | null): void {
    const st = this.profile.stats;
    if (this.profile.role === "Mining") {
      const k = key ?? "pickaxe";
      this.power = st.power * (power(k) / (k === "pickaxe" ? 10 * PICKAXE_MUL : 10));
      this.interval = interval(k);
    } else {
      const k = key ?? "woodenCarrier";
      this.stack.capacity = Math.max(1, Math.round(st.cargo * PACE.cargo * (cargoBase(k) / 5)));
    }
  }

  /** CREW BBQ PARTY: rested right away (a resting worker gets back to work). */
  recover(): void {
    this.stamina = this.profile.stats.stamina;
    if (this.state === "tired" || this.state === "resting") {
      this.state = "seek";
      this.w.releaseSeat(this);
      this.seat = null;
    }
  }

  private tire(n = 1): void {
    if (buffClock() < buffs.staminaUntil) return;
    this.stamina -= n;
    if (this.stamina <= 0) {
      this.release();
      this.state = "tired";
      this.seat = this.w.claimSeat(this);
    }
  }

  update(dt: number): void {
    this.clock += dt;
    const miner = this.profile.role === "Mining";
    switch (this.state) {
      case "seek":
        if ((this.seekWait -= dt) > 0) break;
        if (miner) {
          if (this.pickBlock()) this.state = "work";
          else this.seekWait = 1;
        } else {
          // The nearest chunk by walking; ore storage instead when that chunk is far off.
          const at = this.w.nearestDrop(this.pos, this.clock <= this.badUntil ? this.badGoal : null, this.path);
          const far = !at || Math.hypot(at.x - this.pos.x, at.z - this.pos.z) > 60;
          if (at && !(far && this.w.storageCount() > 0)) {
            this.goal.copy(at);
            this.pathTo.copy(at);
            this.sincePlan = 0;
            this.noWay = false;
            this.state = "work";
          } else if (this.w.storageCount() > 0) {
            this.goal.copy(this.w.storagePad);
            this.state = "work";
          } else this.seekWait = 1;
        }
        break;
      case "work":
        if (miner) {
          if (!this.block || !this.block.alive) {
            this.release();
            this.state = "seek";
            break;
          }
          // Swing at anything in reach; otherwise keep walking to the claimed block's open side.
          const hit = this.w.mining.mine(this, dt);
          if (hit) {
            this.model.swing();
            this.sinceHit = 0;
            this.facing = Math.atan2(hit.cx * CELL - this.pos.x, hit.cz * CELL - this.pos.z);
            this.noProgress = 0;
            this.tire();
            break;
          }
          if (this.cooldown > 0) break;
          this.walkTo(this.goal, dt, 0.3);
          // A detour first takes you farther from the block: progress is "not stuck", not distance.
          this.noProgress = this.stuckT > 0.4 ? this.noProgress + dt : 0;
          if (this.noWay || this.noProgress > 2) {
            // Can't get there: give this block up for a while and pick another.
            this.skip.set(this.block, this.clock + 30);
            this.release();
            this.state = "seek";
          }
        } else {
          const before = this.stack.count;
          this.w.mining.collect(this);
          const arrived = this.walkTo(this.goal, dt, 0.8);
          if (this.noWay) {
            // That chunk lies where we can't walk to: leave that spot alone for a while.
            this.badGoal.copy(this.goal);
            this.badUntil = this.clock + 25;
            this.noWay = false;
            this.state = this.stack.count > 0 ? "deliver" : "seek";
            break;
          }
          if (this.stack.count + this.incoming >= this.stack.capacity) this.state = "deliver";
          else if (arrived) {
            // Look for the next chunk nearby; otherwise deliver what we have. One still out of reach
            // after we got as close as we can lies where nobody walks: skip that spot for a while
            // (user 2026-10-23: a chunk on the lawn held a carrier there for good).
            const bad = this.clock <= this.badUntil;
            const d = this.w.drops.near(this.pos.x, this.pos.z, 8).find((c) => !bad || Math.hypot(c.pos.x - this.badGoal.x, c.pos.z - this.badGoal.z) > 3);
            if (d && Math.hypot(d.pos.x - this.goal.x, d.pos.z - this.goal.z) < 0.05 && Math.hypot(d.pos.x - this.pos.x, d.pos.z - this.pos.z) > this.absorb) {
              this.badGoal.copy(this.goal);
              this.badUntil = this.clock + 25;
            } else if (d) this.goal.copy(d.pos).setY(0);
            else if (this.stack.count > 0 && this.stack.count === before && this.incoming === 0) this.state = "deliver";
            else if (this.stack.count === 0 && this.incoming === 0) this.state = "seek";
          }
        }
        break;
      case "deliver":
        if (this.walkTo(this.w.furnacePad, dt, 0.6) && this.stack.count === 0 && this.incoming === 0) {
          // Data §12.10: every delivered item costs 1 stamina (not every trip).
          this.tire(Math.max(1, this.carried));
          this.carried = 0;
          if (this.state === "deliver") this.state = "seek";
        } else this.carried = Math.max(this.carried, this.stack.count);
        break;
      case "tired":
        if (!this.seat) this.seat = this.w.claimSeat(this);
        if (this.walkTo(this.seat?.pos ?? this.w.queueSpot(this), dt, 0.5)) {
          this.state = "resting";
          // Sit down properly: on the chair, facing the table (armchairs face the camera).
          if (this.seat) {
            this.pos.copy(this.seat.pos);
            this.facing = this.seat.face;
          }
          this.restT = WORKER_RULES.staminaRecoverSeconds;
        }
        break;
      case "resting":
        // Without a seat (cafeteria full) rest is poor: half speed, and grab a seat when one frees.
        if (!this.seat) {
          this.seat = this.w.claimSeat(this);
          if (this.seat) {
            this.state = "tired";
            break;
          }
        }
        this.restT -= this.seat ? dt : dt * 0.5;
        if (this.restT <= 0) {
          this.stamina = this.profile.stats.stamina;
          this.state = "seek";
          this.w.releaseSeat(this);
          this.seat = null;
        }
        break;
    }
    this.animate(dt);
  }

  private animate(dt: number): void {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.facing;
    const moving = this.state === "seek" || this.state === "deliver" || this.state === "tired" || (this.state === "work" && this.stuckT === 0 && this.pos.distanceToSquared(this.goal) > 0.5);
    this.sinceHit += dt;
    if (this.state === "work" && this.sinceHit < this.interval + 0.25 && this.cooldown > 0 && this.cooldown <= SWING_LEAD) m.windup(this.cooldown);
    // At the break area: seated (eating, drinking or just resting); waiting for a seat is standing about.
    const seated = this.state === "resting" && this.seat ? this.seat.kind : null;
    m.pose = seated ? "sit" : moving ? "walk" : "idle";
    m.activity = seated;
    m.stride = this.speed / 3.5;
    m.update(dt);
    this.stack.update(dt);
  }

  dispose(scene: THREE.Scene): void {
    this.release();
    scene.remove(this.model.root);
  }
}
