import * as THREE from "three";
import { CELL, cellToWorld, type Placed, type StageDef } from "../data";
import { bakeColors } from "../models";
import { buildYard } from "./yard";
import { bushGeometry, farmLamp, reedGeometry, rockGeometry, rockMaterial, rockyKnoll, tintedInstances, tintedMaterial, woodFence } from "./farmScenery";
import { THEME, bankTexture, groundTexture, rng, waterTexture } from "../theme";

type Rect = { x0: number; z0: number; x1: number; z1: number };

/** How far the water round the plot lies below the field, and how far the meadow slab goes down. */
const WATER_Y = -2.2;
const SLAB = 4;

/**
 * Static scenery of a stage built from the decoded map: field / yard / rocky-hill tiles, roads, fences, lamps, and
 * round it the plot itself (Farm Valley): a meadow with bushes and rocks, its earth-and-stone bank down to a river that
 * runs all round and into the gaps, reeds at the water's edge. Everything here is instanced or merged: one stage is
 * a handful of draw calls.
 */
export class MapView {
  readonly group = new THREE.Group();
  /** Walkable rectangles (world XZ) — the player is clamped to their union. */
  readonly walk: { x0: number; z0: number; x1: number; z1: number }[] = [];
  /** Where machines may drive: the same tiles, but only bridges built for machines. */
  readonly wheel: { x0: number; z0: number; x1: number; z1: number }[] = [];
  private tilesWalk = 0;
  private bridges = new Map<number, { foot: Rect | null; wheel: Rect | null }>();

  constructor(scene: THREE.Scene, private st: StageDef) {
    scene.add(this.group);
    this.buildBackdrop();
    this.buildTiles();
    this.buildProps();
    buildYard(this.st.areas.lawn, this.group);
    this.tilesWalk = this.walk.length;
    this.wheel.push(...this.walk);
  }

  /** A bridge's deck changed (built / widened): people walk on `foot`, machines drive on `wheel`. */
  setBridge(id: number, foot: Rect | null, wheel: Rect | null): void {
    this.bridges.set(id, { foot, wheel });
    this.walk.length = this.tilesWalk;
    this.wheel.length = 0;
    this.wheel.push(...this.walk);
    for (const b of this.bridges.values()) {
      if (b.foot) this.walk.push(b.foot);
      if (b.wheel) this.wheel.push(b.wheel);
    }
  }

  private rect(p: Placed): { x0: number; z0: number; x1: number; z1: number } {
    return {
      x0: p.wx - (p.w * CELL) / 2,
      x1: p.wx + (p.w * CELL) / 2,
      z0: p.wz - (p.h * CELL) / 2,
      z1: p.wz + (p.h * CELL) / 2,
    };
  }

  /** Water that drifts slowly: the texture's offset follows the clock, set just before the mesh is drawn. */
  private static flowing(mesh: THREE.Mesh, tex: THREE.Texture, speed: number): void {
    mesh.onBeforeRender = () => {
      const t = performance.now() / 1000;
      tex.offset.set(t * speed, Math.sin(t * 0.3) * speed * 4);
    };
  }

  private static waterMaterial(repeat: number): { m: THREE.MeshPhongMaterial; tex: THREE.Texture } {
    const tex = waterTexture();
    tex.repeat.set(repeat, repeat);
    return { m: new THREE.MeshPhongMaterial({ map: tex, shininess: 70, specular: 0x6a8a99 }), tex };
  }

  private buildBackdrop(): void {
    // The plot: a meadow slab under the whole used area, a little below the floor, so cliff edges drop to grass; its
    // sides are an earth-and-stone bank down to the river round it (Farm Valley; was a candy island over clouds).
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of [...this.st.areas.ground, ...this.st.areas.home, ...this.st.areas.obstacle, ...this.st.areas.lawn]) {
      const r = this.rect(p);
      x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1);
      z0 = Math.min(z0, r.z0); z1 = Math.max(z1, r.z1);
    }
    const pad = 30;
    const W = x1 - x0 + pad * 2;
    const D = z1 - z0 + pad * 2;
    const meadow = groundTexture(THEME.meadow, THEME.meadowDots, { seed: 17, blades: 1000, flowers: 22 });
    meadow.repeat.set(W / 12, D / 12);
    const sideX = bankTexture();
    sideX.repeat.set(W / 12, 1);
    const sideZ = sideX.clone();
    sideZ.repeat.set(D / 12, 1);
    const top = new THREE.MeshLambertMaterial({ map: meadow });
    const bankX = new THREE.MeshLambertMaterial({ map: sideX });
    const bankZ = new THREE.MeshLambertMaterial({ map: sideZ });
    // BoxGeometry faces: +x, -x, +y, -y, +z, -z.
    const land = new THREE.Mesh(new THREE.BoxGeometry(W, SLAB, D), [bankZ, bankZ, top, top, bankX, bankX]);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    land.position.set(cx, -0.4 - SLAB / 2, cz);
    land.receiveShadow = true;
    this.group.add(land);
    // The river all round, out to the haze.
    const { m: wm, tex } = MapView.waterMaterial(60);
    const river = new THREE.Mesh(new THREE.PlaneGeometry(720, 720), wm);
    river.rotation.x = -Math.PI / 2;
    river.position.set(cx, WATER_Y, cz);
    MapView.flowing(river, tex, 0.004);
    this.group.add(river);

    // Round the plot: bushes with flowers, mossy rocks, reeds standing in the water along the bank.
    const r = rng(Math.round(W * 31 + D * 7));
    const inside = (x: number, z: number, m: number) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m;
    const bushes: { m: THREE.Matrix4; a: number; b: number }[] = [];
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (let i = 0; i < 600 && bushes.length < 80; i++) {
      const x = x0 - pad + 1.5 + r() * (W - 3);
      const z = z0 - pad + 1.5 + r() * (D - 3);
      if (inside(x, z, 3)) continue;
      const s = 0.8 + r() * 1.1;
      q.setFromEuler(e.set(0, r() * Math.PI * 2, 0));
      bushes.push({
        m: new THREE.Matrix4().compose(v.set(x, -0.45, z), q, sc.set(s, s * (0.8 + r() * 0.35), s)),
        a: THEME.bushes[Math.floor(r() * THEME.bushes.length)],
        b: THEME.flowers[Math.floor(r() * THEME.flowers.length)],
      });
    }
    const bushMesh = tintedInstances(bushGeometry(), tintedMaterial(null, 8), bushes);
    if (bushMesh) this.group.add(bushMesh);
    const rocks = new THREE.InstancedMesh(rockGeometry(7, true, 10, 7), rockMaterial(), 60);
    const col = new THREE.Color();
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 400 && n < 60; i++) {
      const x = x0 - pad + 1 + r() * (W - 2);
      const z = z0 - pad + 1 + r() * (D - 2);
      if (inside(x, z, 2.5)) continue;
      const s = 0.7 + r() * 1.6;
      q.setFromEuler(e.set(0, r() * Math.PI * 2, 0));
      m4.compose(v.set(x, -0.6, z), q, sc.set(s * (1 + r() * 0.5), s * (0.6 + r() * 0.4), s));
      rocks.setMatrixAt(n, m4);
      rocks.setColorAt(n++, col.setScalar(0.92 + r() * 0.16));
    }
    rocks.count = n;
    rocks.castShadow = rocks.receiveShadow = true;
    this.group.add(rocks);
    const reeds: { m: THREE.Matrix4; a: number; b: number }[] = [];
    const edge = (x: number, z: number, rot: number) => {
      const s = 0.8 + r() * 0.5;
      q.setFromEuler(e.set(0, rot + r() * 3, 0));
      reeds.push({ m: new THREE.Matrix4().compose(v.set(x, WATER_Y - 0.1, z), q, sc.set(s, s, s)), a: 0xffffff, b: 0xffffff });
    };
    const ex0 = x0 - pad;
    const ex1 = x1 + pad;
    const ez0 = z0 - pad;
    const ez1 = z1 + pad;
    for (let x = ex0 + 2; x < ex1 - 2; x += 2 + r() * 5) {
      if (r() < 0.6) edge(x, ez1 + 0.35 + r() * 0.5, 0);
      if (r() < 0.6) edge(x, ez0 - 0.35 - r() * 0.5, 0);
    }
    for (let z = ez0 + 2; z < ez1 - 2; z += 2 + r() * 5) {
      if (r() < 0.6) edge(ex1 + 0.35 + r() * 0.5, z, 0);
      if (r() < 0.6) edge(ex0 - 0.35 - r() * 0.5, z, 0);
    }
    const reedMesh = tintedInstances(reedGeometry(), tintedMaterial(null, 8), reeds);
    if (reedMesh) {
      reedMesh.castShadow = false;
      this.group.add(reedMesh);
    }
  }

  private buildTiles(): void {
    // Each tile = a flat top that overlaps its neighbours a little + a thick base set back and a
    // little lower. A plain box per tile showed its dark side face as a one-pixel line wherever
    // two tiles met, flickering as the camera moved (user: "feels like the game stutters").
    // Now the bases only show at the outer edge of the map, where an edge is wanted.
    // Neighbouring tops sit 4 mm apart in height (checkerboard) so the overlaps don't z-fight.
    const top = new THREE.PlaneGeometry(CELL * 4 + 0.08, CELL * 4 + 0.08);
    top.rotateX(-Math.PI / 2);
    // Set well back and well down: a base only 3 cm under the top z-fought with it at the seams
    // (limited depth precision on weak GPUs) and showed through as a dark line.
    const base = new THREE.BoxGeometry(CELL * 4 - 0.3, 0.6, CELL * 4 - 0.3);
    base.translate(0, -0.55, 0);
    const m4 = new THREE.Matrix4();
    // The field (fresh grass under the cells), the base yard (packed earth), the road (a darker earth road); the
    // bases under them are earth, which shows at the edges as a bank.
    const field = new THREE.MeshLambertMaterial({ map: groundTexture(THEME.field, THEME.fieldDots, { size: 512, seed: 7, blades: 1100 }) });
    const yard = new THREE.MeshLambertMaterial({ map: groundTexture(THEME.yard, THEME.yardDots, { seed: 9, blades: 650, pebbles: 9, tufts: 16 }) });
    const road = new THREE.MeshLambertMaterial({ map: groundTexture(THEME.roadTex, THEME.roadDots, { seed: 41, blades: 650, pebbles: 12, tufts: 4 }) });
    const earth = new THREE.MeshLambertMaterial({ color: THEME.earth });
    const add = (list: Placed[], material: THREE.Material, y = 0) => {
      const im = new THREE.InstancedMesh(top, material, Math.max(1, list.length));
      const under = new THREE.InstancedMesh(base, earth, Math.max(1, list.length));
      list.forEach((p, i) => {
        const odd = (Math.round(p.wx / (CELL * 4)) + Math.round(p.wz / (CELL * 4))) & 1;
        m4.makeTranslation(p.wx, y + odd * 0.004, p.wz);
        im.setMatrixAt(i, m4);
        m4.makeTranslation(p.wx, y, p.wz);
        under.setMatrixAt(i, m4);
        this.walk.push(this.rect(p));
      });
      im.count = under.count = list.length;
      im.receiveShadow = under.receiveShadow = true;
      this.group.add(im, under);
    };
    add(this.st.areas.ground, field);
    add(this.st.areas.home, yard, 0.02);

    // Water in the gaps between parts of the field (stages 3+: islands joined by bridges): any
    // empty tile slot next to a ground tile. Without it the gap showed the meadow slab just
    // under the floor and read as a lawn, not as something a bridge has to cross.
    // A slot counts only when all 16 of its cells are empty (the road row is offset by a cell).
    const key = (x: number, z: number) => `${x},${z}`;
    const taken = new Set<string>();
    // Lawn tiles (grass beside the stage 1 base, where cliff walls used to be) are not a gap.
    for (const t of [...this.st.areas.ground, ...this.st.areas.home, ...this.st.areas.obstacle, ...this.st.areas.lawn])
      for (let i = 0; i < t.w; i++) for (let j = 0; j < t.h; j++) taken.add(key(t.x + i, t.z + j));
    const empty = (x: number, z: number) => {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (taken.has(key(x + i, z + j))) return false;
      return true;
    };
    const water = new Map<string, [number, number]>();
    for (const g of this.st.areas.ground)
      for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]])
        if (empty(g.x + dx, g.z + dz)) water.set(key(g.x + dx, g.z + dz), [g.x + dx, g.z + dz]);
    if (water.size) {
      const sheet = new THREE.PlaneGeometry(CELL * 4 + 0.1, CELL * 4 + 0.1);
      sheet.rotateX(-Math.PI / 2);
      // A stream between the fields (Farm Valley; was clouds under a candy island, then space).
      const { m: wmat, tex } = MapView.waterMaterial(1);
      const wm = new THREE.InstancedMesh(sheet, wmat, water.size);
      let i = 0;
      for (const [x, z] of water.values()) {
        const c = cellToWorld(x + 1.5, z + 1.5);
        // Just above the meadow slab (its top is at -0.4) so the water hides it.
        m4.makeTranslation(c.x, -0.3, c.z);
        wm.setMatrixAt(i++, m4);
      }
      wm.receiveShadow = true;
      MapView.flowing(wm, tex, 0.01);
      this.group.add(wm);
    }

    // No paving lines on the base: thin seams a pixel wide shimmer as the camera scrolls, which
    // reads as the game stuttering (user, 2026-10-19). The soft texture carries the floor.

    // Obstacle tiles in the southern rows are the delivery road (not walkable, a dirt road);
    // the rest are rocky hills: big mossy boulders, two by two, and a smaller one or two.
    const minZ = Math.min(...this.st.areas.ground.map((g) => g.z), ...this.st.areas.home.map((g) => g.z));
    const roadTiles = this.st.areas.obstacle.filter((p) => p.z < minZ);
    const cliffs = this.st.areas.obstacle.filter((p) => p.z >= minZ);
    add(roadTiles, road, -0.02);
    this.walk.splice(this.walk.length - roadTiles.length, roadTiles.length);
    const kinds = [rockGeometry(1), rockGeometry(2)];
    const lists: THREE.Matrix4[][] = [[], []];
    const tints: number[][] = [[], []];
    const hash = (x: number, z: number) => ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1;
    for (const p of cliffs) {
      const r = rng(Math.round(p.wx * 131 + p.wz * 977));
      const put = (x: number, z: number, w: number, h: number, d: number) => {
        const k = r() < 0.5 ? 0 : 1;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
        lists[k].push(new THREE.Matrix4().compose(new THREE.Vector3(x, -0.35, z), q, new THREE.Vector3(w, h, d)));
        tints[k].push(0.9 + r() * 0.18);
      };
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          const x = p.wx + (i - 0.5) * CELL * 2 + (r() - 0.5) * 0.8;
          const z = p.wz + (j - 0.5) * CELL * 2 + (r() - 0.5) * 0.8;
          const tall = 2.4 + hash(x, z) * 3.0;
          put(x, z, 4.4 + r() * 1.2, tall, 4.4 + r() * 1.2);
        }
      const extra = 1 + Math.floor(r() * 2);
      for (let k = 0; k < extra; k++) {
        const s = 1.6 + r() * 1.2;
        put(p.wx + (r() - 0.5) * CELL * 3, p.wz + (r() - 0.5) * CELL * 3, s * 1.2, s * 0.8 + 0.8, s);
      }
    }
    const col = new THREE.Color();
    kinds.forEach((geo, k) => {
      if (!lists[k].length) return;
      const rocks = new THREE.InstancedMesh(geo, rockMaterial(), lists[k].length);
      lists[k].forEach((m, i) => {
        rocks.setMatrixAt(i, m);
        rocks.setColorAt(i, col.setScalar(tints[k][i]));
      });
      rocks.castShadow = true;
      rocks.receiveShadow = true;
      this.group.add(rocks);
    });
  }

  private buildProps(): void {
    // Street furniture is baked into one vertex-coloured group (a few draw calls for every lamp and fence stretch).
    const street = new THREE.Group();
    const roadMat = new THREE.MeshLambertMaterial({ map: groundTexture(THEME.roadTex, THEME.roadDots, { seed: 41, blades: 650, pebbles: 12, tufts: 4 }) });
    for (const p of this.st.props) {
      if (p.type === "road") {
        const road = new THREE.Mesh(new THREE.BoxGeometry(p.w * CELL, 0.1, p.h * CELL), roadMat);
        road.position.set(p.wx, 0.02, p.wz);
        road.receiveShadow = true;
        this.group.add(road);
      } else if (p.type === "metalBarrier") {
        // A stretch of wooden rail fence (was a striped road barrier on two legs, same length).
        const fence = woodFence(CELL * 0.9);
        fence.position.set(p.wx, 0, p.wz);
        fence.rotation.y = THREE.MathUtils.degToRad(p.rotY);
        street.add(fence);
      } else if (p.type === "mountain") {
        // A rocky hill inside the field (stage 9): not walkable (Game adds its solid).
        const knoll = rockyKnoll(p.w * CELL, p.h * CELL);
        knoll.position.set(p.wx, 0, p.wz);
        bakeColors(knoll);
        this.group.add(knoll);
      } else if (p.type === "streetLamp") {
        // Our base layout's street furniture (scripts/townbase.py): a wooden post, its lantern hanging from the arm.
        const lamp = farmLamp();
        lamp.position.set(p.wx, 0, p.wz);
        street.add(lamp);
      }
    }
    if (street.children.length) {
      this.group.add(street);
      bakeColors(street);
    }
  }

  /** Is (x, z) on a ground/home tile? */
  inside(x: number, z: number): boolean {
    for (const r of this.walk) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
    return false;
  }

  /** Clamp a position to the walkable area (ground + home tiles, bridge decks; machines: `vehicle`). */
  clamp(p: THREE.Vector3, radius: number, vehicle = false): void {
    const list = vehicle ? this.wheel : this.walk;
    // Inside any rect (shrunk by radius on outer edges is overkill — tiles abut): accept.
    for (const r of list) if (p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1) return;
    // Otherwise snap to the nearest point of the nearest rect.
    let best = Infinity;
    let bx = p.x;
    let bz = p.z;
    for (const r of list) {
      const x = Math.max(r.x0 + radius * 0.2, Math.min(p.x, r.x1 - radius * 0.2));
      const z = Math.max(r.z0 + radius * 0.2, Math.min(p.z, r.z1 - radius * 0.2));
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < best) {
        best = d;
        bx = x;
        bz = z;
      }
    }
    p.x = bx;
    p.z = bz;
  }
}
