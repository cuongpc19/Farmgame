import * as THREE from "three";
import { CELL, cellToWorld, type Placed, type StageDef } from "../data";
import { bakeColors, mat } from "../models";
import { buildYard } from "./yard";
import { candyLamp, caneFence, chocoKnoll, chocoPillarTexture, chocoPillarUVs } from "./candyScenery";
import { THEME, cakeSideTexture, cloudTexture, lollipopTexture, sourable } from "../theme";

type Rect = { x0: number; z0: number; x1: number; z1: number };

/**
 * Static scenery of a stage built from the decoded map: ground / home / cliff tiles,
 * roads, fence posts, plus the asteroid's crust and underside adrift in space (Mars Miner), so the quarry reads as a cliff-top
 * site. Everything here is instanced or merged: one stage is a handful of draw calls.
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

  private buildBackdrop(): void {
    // The candy island (Candy Miner): a slab of pink frosting under the whole used area, slightly below the floor, so
    // cliff edges drop away to cake layers, then a chocolate underside; beyond it, the sky (Stage3D's backdrop).
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of [...this.st.areas.ground, ...this.st.areas.home, ...this.st.areas.obstacle]) {
      const r = this.rect(p);
      x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1);
      z0 = Math.min(z0, r.z0); z1 = Math.max(z1, r.z1);
    }
    const pad = 30;
    const W = x1 - x0 + pad * 2;
    const D = z1 - z0 + pad * 2;
    const crustTex = MapView.noiseTex(THEME.crust, THEME.crustDots, 90);
    crustTex.repeat.set(W / 10, D / 10);
    const sideX = cakeSideTexture();
    sideX.repeat.set(W / 14, 1);
    const sideZ = sideX.clone();
    sideZ.repeat.set(D / 14, 1);
    // The land round the quarry is drained of colour by the sour spell until the stage is cleared (theme.ts landColour).
    const top = sourable(new THREE.MeshLambertMaterial({ map: crustTex }));
    const cakeX = sourable(new THREE.MeshLambertMaterial({ map: sideX }));
    const cakeZ = sourable(new THREE.MeshLambertMaterial({ map: sideZ }));
    // BoxGeometry faces: +x, -x, +y, -y, +z, -z.
    const land = new THREE.Mesh(new THREE.BoxGeometry(W, 14, D), [cakeZ, cakeZ, top, top, cakeX, cakeX]);
    land.position.set((x0 + x1) / 2, -7.4, (z0 + z1) / 2);
    land.receiveShadow = true;
    this.group.add(land);
    const under = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + pad, 22, z1 - z0 + pad), mat(THEME.underside));
    under.position.set((x0 + x1) / 2, -25, (z0 + z1) / 2);
    this.group.add(under);
    // Gumdrops and lollipops on the frosting round the quarry (where the trees were), one colour each.
    const gumGeo = new THREE.SphereGeometry(1.3, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const gumdrops = new THREE.InstancedMesh(gumGeo, sourable(new THREE.MeshPhongMaterial({ shininess: 70, specular: 0x555555 })), 90);
    const stickGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6);
    stickGeo.translate(0, 1.2, 0);
    const sticks = new THREE.InstancedMesh(stickGeo, mat(0xfff8f0), 40);
    const popGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.28, 20);
    popGeo.rotateX(Math.PI / 2);
    popGeo.translate(0, 2.75, 0);
    const pops = new THREE.InstancedMesh(popGeo, sourable(new THREE.MeshPhongMaterial({ map: lollipopTexture(), shininess: 60, specular: 0x444444 })), 40);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let n = 0;
    let k = 0;
    for (let i = 0; i < 500 && (n < 90 || k < 40); i++) {
      const x = x0 - pad + Math.random() * (x1 - x0 + pad * 2);
      const z = z0 - pad + Math.random() * (z1 - z0 + pad * 2);
      if (x > x0 - 4 && x < x1 + 4 && z > z0 - 4 && z < z1 + 4) continue;
      if (Math.random() < 0.7 && n < 90) {
        q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));
        const s = 0.6 + Math.random() * 1.0;
        m4.compose(new THREE.Vector3(x, -0.45, z), q, new THREE.Vector3(s, s * 1.15, s));
        gumdrops.setMatrixAt(n, m4);
        gumdrops.setColorAt(n++, col.setHex(THEME.gumdrops[Math.floor(Math.random() * THEME.gumdrops.length)]));
      } else if (k < 40) {
        // Lollipops face the camera (it looks north from the south), with a little lean.
        q.setFromEuler(new THREE.Euler(Math.random() * 0.2 - 0.1, Math.random() * 0.8 - 0.4, Math.random() * 0.2 - 0.1));
        const s = 0.8 + Math.random() * 0.7;
        m4.compose(new THREE.Vector3(x, -0.4, z), q, new THREE.Vector3(s, s, s));
        sticks.setMatrixAt(k, m4);
        pops.setMatrixAt(k, m4);
        pops.setColorAt(k++, col.setHex(THEME.gumdrops[Math.floor(Math.random() * THEME.gumdrops.length)]).lerp(new THREE.Color(0xffffff), 0.25));
      }
    }
    gumdrops.count = n;
    sticks.count = pops.count = k;
    gumdrops.castShadow = sticks.castShadow = pops.castShadow = true;
    this.group.add(gumdrops, sticks, pops);
  }

  /** Procedural ground texture: base colour + speckles and pebbles (no image files). */
  private static noiseTex(base: string, dots: string[], pebbles: number, sprinkles?: string[]): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = dots[i % dots.length];
      g.globalAlpha = 0.18 + Math.random() * 0.25;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    for (let i = 0; i < pebbles; i++) {
      g.globalAlpha = 0.35;
      g.fillStyle = dots[i % dots.length];
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 7, 2 + Math.random() * 5, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // Sprinkles (Candy Miner: the quarry floor): little rounded sticks in candy colours.
    for (let i = 0; sprinkles && i < 70; i++) {
      g.save();
      g.translate(Math.random() * 256, Math.random() * 256);
      g.rotate(Math.random() * Math.PI);
      g.fillStyle = sprinkles[i % sprinkles.length];
      g.beginPath();
      g.roundRect(-5, -1.6, 10, 3.2, 1.6);
      g.fill();
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
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
    const dirt = new THREE.MeshLambertMaterial({ map: MapView.noiseTex(THEME.floor, THEME.floorDots, 60, THEME.sprinkles) });
    const paving = new THREE.MeshLambertMaterial({ map: MapView.noiseTex(THEME.deck, THEME.deckDots, 8) });
    const add = (list: Placed[], color: number, y = 0) => {
      const material = color === 0xa47b52 ? dirt : color === 0xb9b2a4 ? paving : mat(color);
      const im = new THREE.InstancedMesh(top, material, Math.max(1, list.length));
      const under = new THREE.InstancedMesh(base, material, Math.max(1, list.length));
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
    add(this.st.areas.ground, 0xa47b52);
    add(this.st.areas.home, 0xb9b2a4, 0.02);

    // Water in the gaps between parts of the quarry (stages 3+: islands joined by bridges): any
    // empty tile slot next to a ground tile. Without it the gap showed the grass slab just
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
      // A drop off the island (Candy Miner; was water, then space): clouds far below, unlit.
      const wm = new THREE.InstancedMesh(sheet, new THREE.MeshBasicMaterial({ map: cloudTexture() }), water.size);
      let i = 0;
      for (const [x, z] of water.values()) {
        const c = cellToWorld(x + 1.5, z + 1.5);
        // Just above the grass slab (its top is at -0.4) so the water hides it.
        m4.makeTranslation(c.x, -0.3, c.z);
        wm.setMatrixAt(i++, m4);
      }
      wm.receiveShadow = true;
      this.group.add(wm);
    }

    // No paving lines on the base: thin seams a pixel wide shimmer as the camera scrolls, which
    // reads as the game stuttering (user, 2026-10-19). The speckled texture carries the floor.

    // Obstacle tiles in the southern rows are the sales-truck road (not walkable, flat
    // asphalt); the rest are cliff: a 4×4 cluster of rock pillars of uneven height.
    const minZ = Math.min(...this.st.areas.ground.map((g) => g.z), ...this.st.areas.home.map((g) => g.z));
    const roadTiles = this.st.areas.obstacle.filter((p) => p.z < minZ);
    const cliffs = this.st.areas.obstacle.filter((p) => p.z >= minZ);
    add(roadTiles, THEME.road, -0.02);
    this.walk.splice(this.walk.length - roadTiles.length, roadTiles.length);
    const rockGeo = new THREE.BoxGeometry(CELL, 1, CELL);
    rockGeo.translate(0, 0.5, 0);
    chocoPillarUVs(rockGeo, CELL, 1, CELL);
    const n = cliffs.length * 16;
    // Chocolate (Candy Miner): every pillar a rocky-road brownie, crackled crust with marshmallows on top, a fudge
    // coat dripping down its sides; lighter or darker by the instance colour. Not a chocolate bar: those are candy
    // blocks (Dark / Milk Chocolate, Cocoa) and can be broken, a wall must not look like one.
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ map: chocoPillarTexture() }), Math.max(1, n));
    const col = new THREE.Color();
    let r = 0;
    for (const p of cliffs)
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          const x = p.wx + (i - 1.5) * CELL;
          const z = p.wz + (j - 1.5) * CELL;
          const h = 1.6 + ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1 * 2.4;
          const rnd = ((Math.sin(x * 4.1 + z * 9.7) * 9631.7) % 1 + 1) % 1;
          // Slight twist and width jitter break up the grid of pillars.
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd - 0.5) * 0.5);
          const w = 0.92 + rnd * 0.16;
          m4.compose(new THREE.Vector3(x, -0.2, z), q, new THREE.Vector3(w, h, w));
          rocks.setMatrixAt(r, m4);
          // Dark, milk and in between (texture x colour); taller ones a little lighter.
          const milk = Math.min(1, Math.max(0, rnd * 1.3 - 0.15 + (h - 1.6) * 0.06));
          col.setRGB(0.72 + milk * 0.5, 0.7 + milk * 0.42, 0.7 + milk * 0.36);
          if (rnd > 0.9) col.setRGB(1.25, 1.1, 1.0);
          rocks.setColorAt(r, col);
          r++;
        }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.group.add(rocks);
  }

  private buildProps(): void {
    // Street furniture is baked into one vertex-coloured group (a few draw calls for every lamp and fence stretch).
    const street = new THREE.Group();
    for (const p of this.st.props) {
      if (p.type === "road") {
        const road = new THREE.Mesh(new THREE.BoxGeometry(p.w * CELL, 0.1, p.h * CELL), mat(THEME.road));
        road.position.set(p.wx, 0.02, p.wz);
        road.receiveShadow = true;
        this.group.add(road);
      } else if (p.type === "metalBarrier") {
        // A stretch of candy-cane fence (was a striped road barrier on two legs, same length).
        const fence = caneFence(CELL * 0.9);
        fence.position.set(p.wx, 0, p.wz);
        fence.rotation.y = THREE.MathUtils.degToRad(p.rotY);
        street.add(fence);
      } else if (p.type === "mountain") {
        // A chocolate mountain with icing caps inside the quarry (stage 9): not walkable (Game adds its solid).
        const knoll = chocoKnoll(p.w * CELL, p.h * CELL);
        knoll.position.set(p.wx, 0, p.wz);
        bakeColors(knoll);
        this.group.add(knoll);
      } else if (p.type === "streetLamp") {
        // Our base layout's street furniture (scripts/townbase.py): a candy-cane lamp post, its bulb hanging from the hook.
        const lamp = candyLamp();
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
