import * as THREE from "three";
import { CELL } from "../data";

/** The fine grid's cell (half an ore cell, so its cells line up with the ore cells). */
const FINE = CELL / 2;
/** Room a walking person needs around them (WorkerUnit.radius). */
const BODY = 0.6;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** A test on a point of the ground (x, z). */
type Spot = (x: number, z: number) => boolean;

export interface WalkRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * Ground routing for units that walk or drive on their own. Stages 3+ are islands joined by
 * bridges, and every quarry is a field of ore blocks, so nobody may simply head straight for a goal.
 * - The grid of ore-cell size (`open`, `cellOf`, `centre`): the auto harvester plans its own
 *   block-aware route on it.
 * - The fine grid (half cells, buildings grown by a body's width): `route` plans a worker's walk
 *   around buildings and unbroken ore, breadth-first, then pulls it straight where the body fits.
 */
export class Nav {
  private x0 = 0;
  private z0 = 0;
  private nx = 0;
  private nz = 0;
  private foot = new Uint8Array(0);
  private wheel = new Uint8Array(0);

  /** `foot`: where people may stand; `wheel`: where machines may drive. Solids are carved out. */
  build(foot: WalkRect[], wheel: WalkRect[], solids: WalkRect[]): void {
    const all = [...foot, ...wheel];
    if (!all.length) return;
    const x0 = Math.min(...all.map((r) => r.x0));
    const z0 = Math.min(...all.map((r) => r.z0));
    const x1 = Math.max(...all.map((r) => r.x1));
    const z1 = Math.max(...all.map((r) => r.z1));
    this.x0 = x0;
    this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / CELL) + 1;
    this.nz = Math.ceil((z1 - z0) / CELL) + 1;
    const fill = (rects: WalkRect[]) => {
      const g = new Uint8Array(this.nx * this.nz);
      for (let j = 0; j < this.nz; j++)
        for (let i = 0; i < this.nx; i++) {
          const x = this.x0 + (i + 0.5) * CELL;
          const z = this.z0 + (j + 0.5) * CELL;
          if (!rects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)) continue;
          if (solids.some((s) => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1)) continue;
          g[j * this.nx + i] = 1;
        }
      return g;
    };
    this.foot = fill(foot);
    this.wheel = fill(wheel);
    // The fine grid for people who plan their own way (workers, `route`): half-cells, and a cell
    // is closed when its centre is within a body's radius of a building (a building covering a
    // coarse cell's edge but not its centre left that cell open, and workers walked into it).
    this.fnx = this.nx * 2;
    this.fnz = this.nz * 2;
    this.fine = new Uint8Array(this.fnx * this.fnz);
    const r = BODY;
    for (let j = 0; j < this.fnz; j++)
      for (let i = 0; i < this.fnx; i++) {
        const x = this.x0 + (i + 0.5) * FINE;
        const z = this.z0 + (j + 0.5) * FINE;
        if (!foot.some((q) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1)) continue;
        if (solids.some((s) => x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r)) continue;
        this.fine[j * this.fnx + i] = 1;
      }
    this.solids = solids;
  }

  private fnx = 0;
  private fnz = 0;
  private fine = new Uint8Array(0);
  private solids: WalkRect[] = [];

  /**
   * A walking route for a person from `from` to `to` on the fine grid, around buildings and around
   * the cells `blocked` says are taken (unbroken ore), pulled straight wherever the body fits
   * (`roomAt`). Fills `out` with waypoints ending at `to` (or the nearest open spot to it when
   * `to` itself is taken, e.g. a chunk lying against a block). False: no way there from here.
   */
  route(from: THREE.Vector3, to: THREE.Vector3, blocked: Spot, roomAt: Spot, out: THREE.Vector3[]): boolean {
    if (!this.fnx) return false;
    const open = this.opener(blocked);
    let [ti, tj] = this.fineCell(to.x, to.z);
    const exact = open(ti, tj);
    if (!exact) {
      // The goal cell is taken: the nearest open cell within two cells of it.
      let best = Infinity;
      let bi = 0;
      let bj = 0;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          if (!open(ti + di, tj + dj)) continue;
          const d = (this.fx(ti + di) - to.x) ** 2 + (this.fz(tj + dj) - to.z) ** 2;
          if (d < best) {
            best = d;
            bi = ti + di;
            bj = tj + dj;
          }
        }
      if (best === Infinity) return false;
      ti = bi;
      tj = bj;
    }
    const t0 = tj * this.fnx + ti;
    const hit = this.search(from, open, (c) => c === t0);
    if (hit < 0) return false;
    this.pull(from, hit, exact ? to : null, roomAt, out);
    return true;
  }

  /**
   * The nearest spot by walking (not as the crow flies) where `want(x, z)` holds, at a cell centre:
   * fills `out` with the route there and returns that spot, or null when nothing wanted can be
   * reached. One search instead of trying the nearest-looking goals one by one (on islands most of
   * those lie across the water).
   */
  nearest(from: THREE.Vector3, want: Spot, blocked: Spot, roomAt: Spot, out: THREE.Vector3[]): THREE.Vector3 | null {
    if (!this.fnx) return null;
    const W = this.fnx;
    const hit = this.search(from, this.opener(blocked), (c) => want(this.fx(c % W), this.fz(Math.floor(c / W))));
    if (hit < 0) return null;
    this.pull(from, hit, null, roomAt, out);
    return new THREE.Vector3(this.fx(hit % W), 0, this.fz(Math.floor(hit / W)));
  }

  private fineCell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.x0) / FINE), Math.floor((z - this.z0) / FINE)];
  }
  private fx(i: number): number {
    return this.x0 + (i + 0.5) * FINE;
  }
  private fz(j: number): number {
    return this.z0 + (j + 0.5) * FINE;
  }

  /** Open fine cell: on the ground, clear of buildings, and not taken (`blocked` at its centre). */
  private opener(blocked: Spot): (i: number, j: number) => boolean {
    const W = this.fnx;
    const H = this.fnz;
    return (i, j) => i >= 0 && j >= 0 && i < W && j < H && this.fine[j * W + i] === 1 && !blocked(this.fx(i), this.fz(j));
  }

  private prev = new Int32Array(0);
  private queue = new Int32Array(0);

  /**
   * Breadth-first from the walker's cell (it counts as open even on an edge), 8 ways, never cutting
   * a closed corner, until `goal(cell)`: that cell, or -1. `prev` keeps the way back.
   */
  private search(from: THREE.Vector3, open: (i: number, j: number) => boolean, goal: (c: number) => boolean): number {
    const W = this.fnx;
    const H = this.fnz;
    const [si, sj] = this.fineCell(from.x, from.z);
    if (si < 0 || sj < 0 || si >= W || sj >= H) return -1;
    const prev = this.prev.length === W * H ? this.prev : (this.prev = new Int32Array(W * H));
    prev.fill(-2);
    const q = this.queue.length === W * H ? this.queue : (this.queue = new Int32Array(W * H));
    let head = 0;
    let tail = 0;
    const s0 = sj * W + si;
    prev[s0] = -1;
    q[tail++] = s0;
    if (goal(s0)) return s0;
    while (head < tail) {
      const c = q[head++];
      const i = c % W;
      const j = (c - i) / W;
      for (const [di, dj] of DIRS) {
        const ni = i + di;
        const nj = j + dj;
        if (!open(ni, nj)) continue;
        if (di && dj && (!open(i + di, j) || !open(i, j + dj))) continue;
        const n = nj * W + ni;
        if (prev[n] !== -2) continue;
        prev[n] = c;
        if (goal(n)) return n;
        q[tail++] = n;
      }
    }
    return -1;
  }

  /**
   * The cells back from `hit` (via `prev`), then `last` if given, pulled straight: from where the
   * walker is, skip ahead while the body still fits on the straight line (stops at the first point
   * it does not, so a long winding way costs little).
   */
  private pull(from: THREE.Vector3, hit: number, last: THREE.Vector3 | null, roomAt: Spot, out: THREE.Vector3[]): void {
    const W = this.fnx;
    const pts: THREE.Vector3[] = [];
    for (let c = hit; c >= 0 && this.prev[c] !== -1; c = this.prev[c]) pts.push(new THREE.Vector3(this.fx(c % W), 0, this.fz(Math.floor(c / W))));
    pts.reverse();
    if (last) pts.push(last.clone().setY(0));
    if (!pts.length) pts.push(new THREE.Vector3(this.fx(hit % W), 0, this.fz(Math.floor(hit / W))));
    out.length = 0;
    let at = from.clone().setY(0);
    let k = 0;
    while (k < pts.length) {
      let far = k;
      while (far + 1 < pts.length && this.walkable(at, pts[far + 1], roomAt)) far++;
      out.push(pts[far]);
      at = pts[far];
      k = far + 1;
    }
  }

  /** Can a body walk the straight segment a→b (every 0.3 m has room)? */
  private walkable(a: THREE.Vector3, b: THREE.Vector3, roomAt: Spot): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / 0.3));
    for (let k = 1; k < n; k++) if (!roomAt(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n)) return false;
    return true;
  }

  /** Is there room for a body at (x, z) as far as the ground and the buildings go? */
  roomOnGround(x: number, z: number): boolean {
    const [i, j] = [Math.floor((x - this.x0) / FINE), Math.floor((z - this.z0) / FINE)];
    if (i < 0 || j < 0 || i >= this.fnx || j >= this.fnz || this.fine[j * this.fnx + i] !== 1) return false;
    const r = BODY;
    return !this.solids.some((s) => x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r);
  }

  private cell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.x0) / CELL), Math.floor((z - this.z0) / CELL)];
  }

  /* Grid access for units that plan their own routes (the auto harvester). Grid cells line up
   * with ore cells: the tile rectangles start on ore cell edges. */
  get width(): number {
    return this.nx;
  }
  get height(): number {
    return this.nz;
  }
  cellOf(x: number, z: number): [number, number] {
    return this.cell(x, z);
  }
  centre(i: number, j: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.x0 + (i + 0.5) * CELL, 0, this.z0 + (j + 0.5) * CELL);
  }
  open(i: number, j: number, vehicle: boolean): boolean {
    return this.ok(vehicle ? this.wheel : this.foot, i, j);
  }

  private ok(g: Uint8Array, i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.nx && j < this.nz && g[j * this.nx + i] === 1;
  }
}
