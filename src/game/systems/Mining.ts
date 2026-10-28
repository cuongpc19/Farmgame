import * as THREE from "three";
import type { Block, BlockField } from "../world/BlockField";
import type { Drops, Drop } from "../world/Drops";
import type { Stack } from "../world/Stack";
import type { OreDef } from "../data";
import { GAMEPLAY, PACE } from "../data";
import { isCrop } from "../farm";

/**
 * Rice (farm game, user 2026-10-28: "harvesting rice is quick, one stroke and it's cut"): a crop falls to any hit, and
 * one sweep of the sickle cuts up to CROP_SWEEP rice cells side by side (the farm-games research: cutting rows in
 * one stroke is what makes harvesting feel good). Each crop cell drops CROP_DROPS sheaves, so a full sweep pays about
 * what one old 2-hit cell did, a third of the swings per cell cleared.
 */
const CROP_SWEEP = 3;
const CROP_DROPS = 2;

/** Anything that can swing at blocks: the player, a mining vehicle, a hired miner. */
export interface Miner {
  pos: THREE.Vector3;
  /** Facing angle (radians, 0 = +z world). */
  facing: number;
  radius: number;
  power: number;
  interval: number;
  /** Extra reach beyond MINING_RANGE (vehicles have long arms). */
  reach: number;
  /** How many blocks one hit damages (Roller Crusher sweeps a row). */
  targets: number;
  cooldown: number;
  /** Set to the block hit this frame (for animation); null otherwise. */
  lastHit: Block | null;
  /** Damage multiplier from boosts. */
  powerMul: number;
  /** Attack-interval reduction from boosts (0.23 → interval / 1.23). */
  intervalMul: number;
}

/** Anything that vacuums loose chunks into a stack. */
export interface Collector {
  pos: THREE.Vector3;
  stack: Stack;
  absorb: number;
  /** Items currently flying toward the stack (reserved capacity). */
  incoming: number;
  /** Which items it accepts. */
  accepts: (item: number) => boolean;
}

export interface MiningEvents {
  onHit?(b: Block, ore: OreDef, miner: Miner): void;
  onBreak?(b: Block, ore: OreDef, miner: Miner): void;
  onCollect?(item: number, c: Collector): void;
}

const tmp = new THREE.Vector3();
const near: Block[] = [];
const nearDrops: Drop[] = [];

/**
 * Auto-mining and auto-collecting — the genre's whole input model: walk next to a block
 * and the tool swings by itself; walk over chunks and they fly into your cargo.
 */
export class Mining {
  constructor(
    private field: BlockField,
    private drops: Drops,
    private oreOf: (b: Block) => OreDef,
    private ev: MiningEvents,
  ) {}

  /** Advance one miner; returns the block it hit this frame (if any). */
  mine(m: Miner, dt: number): Block | null {
    m.lastHit = null;
    m.cooldown -= dt;
    if (m.cooldown > 0) return null;
    const best = this.target(m);
    if (!best) {
      m.cooldown = 0;
      return null;
    }
    m.cooldown = m.interval / (1 + m.intervalMul);
    m.lastHit = best;
    const hits = [best];
    if (isCrop(this.oreOf(best))) {
      for (const b of near) {
        if (hits.length >= Math.max(CROP_SWEEP, m.targets)) break;
        if (b !== best && b.alive && Math.abs(b.cx - best.cx) + Math.abs(b.cz - best.cz) <= 1 && isCrop(this.oreOf(b))) hits.push(b);
      }
    } else if (m.targets > 1) {
      // Sweep: the nearest neighbours of the primary target that are also in reach (side by
      // side first; more than 5 targets reach one cell further out).
      const ring = m.targets > 5 ? 2 : 1;
      const side = near
        .filter((b) => b !== best && b.alive && Math.abs(b.cx - best.cx) + Math.abs(b.cz - best.cz) <= ring)
        .sort((a, b) => Math.abs(a.cx - best.cx) + Math.abs(a.cz - best.cz) - (Math.abs(b.cx - best.cx) + Math.abs(b.cz - best.cz)));
      for (const b of side) {
        if (hits.length >= m.targets) break;
        hits.push(b);
      }
    }
    for (const b of hits) this.damage(b, m.power * m.powerMul, m);
    return best;
  }

  /** The block this miner would hit now (in reach, what is in front first), or null. Fills `near`. */
  target(m: Miner): Block | null {
    // People: data range 1.5 from their centre. Machines have no range in the data (their
    // tool collider does the hitting): body radius + tool reach.
    const range = m.reach > 0 ? m.radius + m.reach + 0.3 : GAMEPLAY.miningRangePlayerAndWorker;
    this.field.near(m.pos.x, m.pos.z, range + this.field.cell * 0.5, near);
    // Keep only blocks whose surface is within range, preferring what's in front.
    let best: Block | null = null;
    let bestScore = Infinity;
    const fx = Math.sin(m.facing);
    const fz = Math.cos(m.facing);
    const h = this.field.cell / 2;
    for (const b of near) {
      this.field.center(b, tmp);
      const qx = Math.max(tmp.x - h, Math.min(m.pos.x, tmp.x + h));
      const qz = Math.max(tmp.z - h, Math.min(m.pos.z, tmp.z + h));
      const d = Math.hypot(m.pos.x - qx, m.pos.z - qz);
      if (d > range) continue;
      const dx = tmp.x - m.pos.x;
      const dz = tmp.z - m.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      const front = (dx / l) * fx + (dz / l) * fz; // 1 = straight ahead
      const score = d - front * 1.2;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  /** Apply damage, releasing one chunk per 25 % HP crossed and 2 more on destruction. */
  damage(b: Block, amount: number, m: Miner): void {
    if (!b.alive) return;
    const ore = this.oreOf(b);
    if (isCrop(ore)) {
      this.field.damage(b, b.hp, m.pos);
      this.field.center(b, tmp);
      tmp.y = this.field.cell * 0.4;
      b.drops = 4;
      this.drops.burst(tmp, ore.mineralId, CROP_DROPS, 0.9, m.pos);
      this.ev.onHit?.(b, ore, m);
      this.ev.onBreak?.(b, ore, m);
      return;
    }
    const broke = this.field.damage(b, amount, m.pos);
    this.field.center(b, tmp);
    tmp.y = this.field.cell * 0.7;
    const frac = Math.max(0, b.hp) / b.maxHp;
    const stages = 4;
    const due = Math.min(stages, Math.floor((1 - frac) * stages + 1e-6));
    const mid = due - b.drops;
    if (mid > 0) {
      b.drops = due;
      this.drops.burst(tmp, ore.mineralId, mid, 0.8, m.pos);
    }
    this.ev.onHit?.(b, ore, m);
    if (broke) {
      const rest = stages - b.drops;
      b.drops = stages;
      this.drops.burst(tmp, ore.mineralId, rest + 2, 1.1, m.pos);
      this.ev.onBreak?.(b, ore, m);
    }
  }

  /** Pull resting chunks into a collector's stack while it has room. */
  collect(c: Collector): void {
    const room = c.stack.capacity - c.stack.count - c.incoming;
    if (room <= 0) return;
    // Fresh chunks pop up and fly straight onto the carrier while there is room; ones that
    // land (no room at the time) must rest COLLECT_DELAY before they can be picked up.
    this.drops.near(c.pos.x, c.pos.z, c.absorb, nearDrops, true);
    let n = 0;
    for (const d of nearDrops) {
      if (n >= room) break;
      if (!c.accepts(d.item)) continue;
      // PACE.pickup: chunks are up for grabs sooner than in the original.
      if (d.state === "fly" ? d.t < 0.15 / PACE.pickup : d.t < GAMEPLAY.dropCollectDelaySeconds / PACE.pickup) continue;
      c.incoming++;
      n++;
      this.drops.pull(d, c.stack.anchor, () => {
        c.incoming--;
        if (c.stack.count < c.stack.capacity) {
          c.stack.push(d.item);
          this.ev.onCollect?.(d.item, c);
        } else {
          // Lost the race for the last slot — drop it back at the collector's feet.
          this.drops.burst(c.pos.clone().setY(0.5), d.item, 1, 0.3);
        }
      });
    }
  }
}
