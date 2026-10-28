import * as THREE from "three";
import { prop, propSize } from "../props3d";
import { bakeColors, mat, candyLivery } from "../models";
import { gingerHouse, syrupBottle, syrupJar } from "./candyHouses";

/**
 * Procedural building and prop models for the base. Each returns a Group whose origin is
 * the centre of its footprint at ground level, with named anchor Object3Ds where the game
 * logic needs positions (pads, output trays, piles).
 */

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);

function m(geo: THREE.BufferGeometry, color: number, opts?: Parameters<typeof mat>[1]): THREE.Mesh {
  const me = new THREE.Mesh(geo, mat(color, opts));
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

/** Text rendered into a canvas texture, laid flat on the ground (pad captions). */
export function floorText(text: string, w: number, h: number, opts: { color?: string; size?: number } = {}): THREE.Mesh {
  const c = document.createElement("canvas");
  const scale = 64;
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext("2d")!;
  g.fillStyle = opts.color ?? "#ffffff";
  // Auto-fit: as big as the box allows unless a size is forced.
  const fit = Math.min(c.height * 0.82, (c.width * 0.9) / Math.max(1, text.length * 0.56));
  g.font = `${Math.round(opts.size ? opts.size * scale : fit)}px "Lilita One", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowOffsetY = 3;
  g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  me.rotation.x = -Math.PI / 2;
  me.position.y = 0.06;
  return me;
}

/** Upright sign board with text (building names, price board). */
export function signBoard(lines: string[], w: number, h: number, bg = "#2b3b4f", fg = "#ffffff"): THREE.Mesh {
  const c = document.createElement("canvas");
  const scale = 96;
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.lineWidth = 6;
  g.strokeRect(3, 3, c.width - 6, c.height - 6);
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lh = c.height / (lines.length + 0.4);
  g.font = `${Math.round(lh * 0.62)}px "Lilita One", system-ui, sans-serif`;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, lh * (i + 0.7)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  return me;
}

/** White rounded-square outline pad, like the reference game's action zones. */
export function padOutline(size: number, color = 0xffffff): { root: THREE.Group; fill: THREE.Mesh } {
  const root = new THREE.Group();
  const r = size * 0.18;
  const t = size * 0.06;
  const outer = new THREE.Shape();
  const hs = size / 2;
  outer.moveTo(-hs + r, -hs);
  outer.lineTo(hs - r, -hs);
  outer.quadraticCurveTo(hs, -hs, hs, -hs + r);
  outer.lineTo(hs, hs - r);
  outer.quadraticCurveTo(hs, hs, hs - r, hs);
  outer.lineTo(-hs + r, hs);
  outer.quadraticCurveTo(-hs, hs, -hs, hs - r);
  outer.lineTo(-hs, -hs + r);
  outer.quadraticCurveTo(-hs, -hs, -hs + r, -hs);
  const inner = new THREE.Path();
  const hi = hs - t;
  const ri = Math.max(0.01, r - t);
  inner.moveTo(-hi + ri, -hi);
  inner.lineTo(hi - ri, -hi);
  inner.quadraticCurveTo(hi, -hi, hi, -hi + ri);
  inner.lineTo(hi, hi - ri);
  inner.quadraticCurveTo(hi, hi, hi - ri, hi);
  inner.lineTo(-hi + ri, hi);
  inner.quadraticCurveTo(-hi, hi, -hi, hi - ri);
  inner.lineTo(-hi, -hi + ri);
  inner.quadraticCurveTo(-hi, -hi, -hi + ri, -hi);
  outer.holes.push(inner);
  const ring = new THREE.Mesh(new THREE.ShapeGeometry(outer, 6), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  root.add(ring);
  const fillShape = new THREE.Shape();
  fillShape.moveTo(-hi, -hi);
  fillShape.lineTo(hi, -hi);
  fillShape.lineTo(hi, hi);
  fillShape.lineTo(-hi, hi);
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(fillShape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.035;
  fill.scale.set(0.001, 0.001, 1);
  root.add(fill);
  return { root, fill };
}

/**
 * Base buildings stand this much taller than the models (user 2026-10-22: grander, exaggerated).
 * Height only: the footprints stay inside their collision boxes.
 */
const GRAND = 1.35;

/** Furnace: smelter body + chimneys + glowing mouth + output tray. Footprint 3×3 cells. */
export function furnaceModel(cell: number): { root: THREE.Group; mouth: THREE.Object3D; tray: THREE.Object3D; glow: THREE.Mesh; chimneys: THREE.Object3D[] } {
  const root = new THREE.Group();
  const s = cell;
  // The candy factory (Candy Miner): the biggest gingerbread house, pink frosting, three chimneys; no door, the oven
  // glows where it would be. Inside the furnace's collision box (Game: x −0.6…+1.6, front +0.15, back −1.9 cells).
  const k = 1.25;
  const cx = s * 0.5;
  // Front wall where the old furnace's was, so the output tray stays outside, front-right.
  const front = s * 0.1;
  const fw = s * 2.1;
  const fd = s * 1.85;
  const house = gingerHouse({ w: fw, d: fd, h: s * 0.95 * GRAND, roofH: s * 0.6 * GRAND, roof: 0xff8fb8, door: false, chimneys: [-s * 0.62, 0, s * 0.62] });
  bakeColors(house.root);
  house.root.position.set(cx, 0, front - fd / 2);
  root.add(house.root);
  const chimneys = house.chimneyTops;
  const factorySign = signBoard(["FACTORY"], s * 1.5, s * 0.4, "#5e3424", "#ffd166");
  factorySign.position.set(cx, s * 0.95 * GRAND + 0.35, front + 0.5);
  factorySign.rotation.x = -0.25;
  root.add(factorySign);
  // Furnace glow in the doorway.
  const glow = new THREE.Mesh(box(s * 0.42 * k, s * 0.34 * k * GRAND, 0.1), mat(0xff8a2a, { emissive: 0xff5a00 }));
  glow.position.set(cx, s * 0.19 * k * GRAND, front + 0.03);
  root.add(glow);
  const mouth = new THREE.Object3D();
  mouth.position.set(cx, 0.3 + s * 0.5 * k, front - s * 0.3);
  root.add(mouth);
  // Output tray (front-right): a white metal table the ingots pile onto.
  const tray = new THREE.Group();
  const table = m(box(s * 0.85, 0.5, s * 0.85), 0xe8eaee);
  table.position.y = 0.25;
  const chute = m(box(s * 0.3, 0.12, s * 0.6), 0x9aa0a8);
  chute.position.set(0, s * 0.45, -s * 0.45);
  chute.rotation.x = -0.5;
  tray.add(table, chute);
  tray.position.set(s * 1.0, 0, s * 0.35);
  root.add(tray);
  const trayTop = new THREE.Object3D();
  trayTop.position.y = 0.52;
  tray.add(trayTop);
  return { root, mouth, tray: trayTop, glow, chimneys };
}

/**
 * Entry building (Candy Miner): a gingerbread house with a frosting roof in the building's colour, its name board
 * on the front eave. Inside the building's collision box (Game: front +0.75, back −1.45 cells); front face at z = +0.7
 * (the entry pad sits in front).
 */
export function shedModel(cell: number, roof: number, _wall: number, sign: string): THREE.Group {
  const root = new THREE.Group();
  const s = cell;
  const w = s * 2.3;
  const d = s * 1.65;
  const h = s * 0.85 * GRAND;
  const house = gingerHouse({ w, d, h, roofH: s * 0.55 * GRAND, roof });
  bakeColors(house.root);
  const front = 0.7;
  house.root.position.z = front - d / 2;
  root.add(house.root);
  const board = signBoard([sign], s * 1.75, s * 0.42, "#5e3424", "#ffd166");
  board.position.set(0, h + 0.3, front + 0.5);
  board.rotation.x = -0.25;
  root.add(board);
  return root;
}

export function beaconModel(): THREE.Group {
  const beacon = new THREE.Group();
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.2, 3), mat(0x3ad15b, { emissive: 0x0e4a1a }));
  tri.rotation.x = Math.PI;
  const bang = new THREE.Mesh(box(0.18, 0.42, 0.18), mat(0xffffff));
  bang.position.set(0, 0.12, 0.34);
  const dot = new THREE.Mesh(box(0.18, 0.14, 0.18), mat(0xffffff));
  dot.position.set(0, -0.25, 0.3);
  beacon.add(tri, bang, dot);
  beacon.visible = false;
  return beacon;
}

/** Upgrade building (blue roof) with its quest beacon. */
export function upgradeModel(cell: number): { root: THREE.Group; beacon: THREE.Object3D } {
  const root = shedModel(cell, 0xff8fb8, 0xd7dbe0, "UPGRADE");
  const beacon = beaconModel();
  beacon.position.set(0, cell * 1.8 * GRAND + 2.4, -cell * 0.2);
  root.add(beacon);
  return { root, beacon };
}

/** Fuel station (the oil station; Mars Miner): Space Kit fuel tank, a stack of canisters, the barrel pad. */
export function oilStationModel(cell: number): { root: THREE.Group; barrels: THREE.Object3D } {
  const root = new THREE.Group();
  const s = cell;
  // Candy Miner: a giant syrup bottle and a few jars (Mars Miner: a Space Kit fuel tank and canisters).
  const decor = new THREE.Group();
  const tank = syrupBottle(s * 0.6, s * 1.55 * GRAND);
  tank.position.set(-s * 0.2, 0, -s * 0.8);
  decor.add(tank);
  for (const [x, z, lid] of [[0.85, -0.85, 0xff6fa5], [1.2, -0.55, 0x5fd3b5], [1.05, -0.3, 0xffd166]] as const) {
    const jar = syrupJar(s * 0.17, s * 0.42, lid);
    jar.position.set(s * x, 0, s * z);
    decor.add(jar);
  }
  bakeColors(decor);
  root.add(decor);
  const barrels = new THREE.Object3D();
  barrels.position.set(-s * 0.2, 0.05, s * 0.35);
  root.add(barrels);
  const bin = m(box(s * 0.55, s * 0.5, s * 0.55), 0xff8fb8);
  bin.position.set(s * 0.95, s * 0.25, s * 0.6);
  root.add(bin);
  return { root, barrels };
}

/* ---------- the crew's restaurant (user 2026-10-24) ----------
 * The reference's break area is a pizza stand with tables under umbrellas. Ours is a little restaurant that
 * serves food and drinks, and its spots are for eating, drinking or just sitting back (no umbrellas). Sized for our
 * people (~2.6 tall): the chairs and tables fit the seated pose in characters.ts (feet on the ground).
 */

/** Top of a chair seat and of a table. */
const SEAT_Y = 0.6;
const TABLE_Y = 1.0;

/** A restaurant sign: name on top, what it serves below, on a red board. */
function restaurantSign(w: number, h: number): THREE.Mesh {
  const px = 128;
  const tex = cashTexture(Math.round(w * px), Math.round(h * px), (g) => {
    const W = g.canvas.width;
    const H = g.canvas.height;
    g.fillStyle = "#c8302c";
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 4, W - 8, H - 8, H * 0.18);
    else g.rect(4, 4, W - 8, H - 8);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = "#ffd34d";
    g.stroke();
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff6e0";
    g.shadowColor = "rgba(0,0,0,0.35)";
    g.shadowOffsetY = 5;
    g.font = `${Math.round(H * 0.46)}px "Lilita One", system-ui, sans-serif`;
    g.fillText("PICNIC CAFE", W / 2, H * 0.4);
    g.fillStyle = "#ffd34d";
    g.font = `${Math.round(H * 0.22)}px "Lilita One", system-ui, sans-serif`;
    g.fillText("CAKES  •  DRINKS", W / 2, H * 0.78);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}

/** A chalk menu in the serving window. */
function menuBoard(w: number, h: number): THREE.Mesh {
  const px = 128;
  const tex = cashTexture(Math.round(w * px), Math.round(h * px), (g) => {
    const W = g.canvas.width;
    const H = g.canvas.height;
    g.fillStyle = "#24392f";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#8a5a2b";
    g.lineWidth = 12;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.textBaseline = "middle";
    g.fillStyle = "#f6f1e6";
    g.textAlign = "center";
    g.font = `${Math.round(H * 0.2)}px "Lilita One", system-ui, sans-serif`;
    g.fillText("MENU", W / 2, H * 0.2);
    g.font = `${Math.round(H * 0.13)}px "Lilita One", system-ui, sans-serif`;
    ["CUPCAKE", "PIE", "SODA", "JUICE"].forEach((t, i) => {
      g.textAlign = "left";
      g.fillStyle = "#f6f1e6";
      g.fillText(t, W * 0.12, H * (0.4 + i * 0.15));
      g.textAlign = "right";
      g.fillStyle = "#ffd34d";
      g.fillText(`$${[5, 4, 2, 3][i]}`, W * 0.88, H * (0.4 + i * 0.15));
    });
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

/** Food and drink on tables and the counter (person-sized, a little larger than life so it reads). */
export function burgerMesh(r = 0.12): THREE.Group {
  const g = new THREE.Group();
  const layer = (geo: THREE.BufferGeometry, color: number, y: number) => {
    const me = m(geo, color);
    me.position.y = y;
    g.add(me);
  };
  layer(cyl(r * 0.95, r * 0.9, r * 0.4, 10), 0xd9902f, r * 0.2);
  layer(cyl(r * 1.05, r * 1.05, r * 0.12, 10), 0x5fbf3a, r * 0.46);
  layer(cyl(r, r, r * 0.38, 10), 0x6b3a1e, r * 0.7);
  const cheese = m(box(r * 1.7, r * 0.08, r * 1.7), 0xffc72c);
  cheese.position.y = r * 0.92;
  cheese.rotation.y = Math.PI / 4;
  g.add(cheese);
  const top = m(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xe0a040);
  top.scale.y = 0.75;
  top.position.y = r * 0.98;
  g.add(top);
  bakeColors(g);
  return g;
}

export function cupMesh(h = 0.26, color = 0xe0483a): THREE.Group {
  const g = new THREE.Group();
  const body = m(cyl(h * 0.3, h * 0.24, h, 10), color);
  body.position.y = h / 2;
  const band = m(cyl(h * 0.285, h * 0.27, h * 0.25, 10), 0xffffff);
  band.position.y = h * 0.5;
  const lid = m(cyl(h * 0.32, h * 0.32, h * 0.07, 10), 0xffffff);
  lid.position.y = h;
  const straw = m(cyl(h * 0.035, h * 0.035, h * 0.55, 5), 0xffd34d);
  straw.position.set(h * 0.06, h * 1.2, 0);
  straw.rotation.z = -0.25;
  g.add(body, band, lid, straw);
  bakeColors(g);
  return g;
}

function pizzaSlice(r = 0.24): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(r, -r * 0.45);
  s.quadraticCurveTo(r * 1.12, 0, r, r * 0.45);
  s.lineTo(0, 0);
  const me = m(new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false }), 0xf2b33d);
  me.rotation.x = -Math.PI / 2;
  return me;
}

function plate(x: number, z: number, food: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  const p = m(cyl(0.22, 0.17, 0.035, 14), 0xffffff);
  p.position.y = 0.018;
  food.position.y = 0.035;
  g.add(p, food);
  g.position.set(x, TABLE_Y, z);
  return g;
}

/**
 * The restaurant, front (serving window, counter, door) facing +z. It stays inside the box Game makes solid for the
 * break area's building (x ±3, z −2.25…+0.75). `userData.counter`: the spot in front of the counter (local).
 */
export function restaurantModel(): THREE.Group {
  const root = new THREE.Group();
  const H = 4.2;
  const W = 5.5;
  const D = 2.6;
  const front = 0.45;
  const zc = front - D / 2;
  const at = (me: THREE.Object3D, x: number, y: number, z: number) => (me.position.set(x, y, z), root.add(me), me);
  at(m(box(W, H, D), 0xf1dfbd), 0, H / 2, zc);
  at(m(box(W + 0.12, 0.45, D + 0.12), 0xa8452f), 0, 0.225, zc);
  at(m(box(W + 0.44, 0.12, D + 0.52), 0xe9b44c), 0, H - 0.02, zc + 0.1);
  at(m(box(W + 0.4, 0.3, D + 0.5), 0x6b3f2a), 0, H + 0.15, zc + 0.1);
  at(m(box(0.5, 0.9, 0.5), 0x8a8f96), 1.9, H + 0.6, zc - 0.5);
  // Serving window: dark kitchen, the menu, a wooden frame and the counter with today's food on it.
  const wx = -0.45;
  const ww = 2.7;
  at(m(box(ww, 1.4, 0.06), 0x3b2a22), wx, 2.2, front + 0.01);
  at(menuBoard(1.1, 0.9), wx + 0.6, 2.3, front + 0.05);
  for (const [x, y, w, h] of [[wx, 2.95, ww + 0.2, 0.12], [wx - ww / 2, 2.2, 0.12, 1.5], [wx + ww / 2, 2.2, 0.12, 1.5]])
    at(m(box(w, h, 0.12), 0x8a5a2b), x, y, front + 0.04);
  at(m(box(ww + 0.3, 0.12, 0.4), 0xc98d4a), wx, 1.48, front + 0.16);
  at(m(box(ww + 0.3, 1.0, 0.06), 0xd8503c), wx, 0.95, front + 0.3);
  at(burgerMesh(0.13), wx - 0.85, 1.54, front + 0.16);
  at(cupMesh(0.3), wx - 0.3, 1.54, front + 0.18);
  at(cupMesh(0.3, 0x3a8ee6), wx + 0.05, 1.54, front + 0.14);
  const slice = pizzaSlice(0.28);
  slice.rotation.z = 2.2;
  at(slice, wx + 0.5, 1.56, front + 0.2);
  // Red and white awning over the window.
  for (let i = 0; i < 6; i++) {
    const slat = at(m(box(ww / 6 + 0.01, 0.07, 1.0), i % 2 ? 0xf6f1e6 : 0xe0483a), wx - ww / 2 + (i + 0.5) * (ww / 6), 3.35, front + 0.4);
    slat.rotation.x = 0.35;
  }
  // Door.
  at(m(box(1.05, 2.8, 0.08), 0x7a4a2a), 1.95, 0.45 + 1.4, front + 0.03);
  at(m(box(0.6, 0.9, 0.09), 0xa9d8f0), 1.95, 2.55, front + 0.04);
  at(m(box(0.07, 0.3, 0.12), 0xd9c27a), 1.6, 1.8, front + 0.08);
  // Cold drinks fridge by the window.
  at(m(box(0.72, 2.3, 0.4), 0xc8302c), -2.32, 0.45 + 1.15, front + 0.08);
  at(m(box(0.74, 0.32, 0.42), 0xffffff), -2.32, 2.9, front + 0.08);
  at(m(box(0.56, 1.6, 0.03), 0xbfe8f5, { opacity: 0.55 }), -2.32, 1.6, front + 0.29);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) at(m(cyl(0.05, 0.06, 0.32, 6), [0xff8a1f, 0x4cc94a, 0x3a8ee6][(r + c) % 3]), -2.5 + c * 0.18, 1.12 + r * 0.5, front + 0.2);
  // The sign on the roof, leaning back toward the camera.
  const sign = at(restaurantSign(4.6, 1.4), 0, H + 1.25, zc + 0.6);
  sign.rotation.x = -0.3;
  const back = at(m(box(4.7, 1.5, 0.08), 0x6b3f2a), 0, H + 1.24, zc + 0.555);
  back.rotation.x = -0.3;
  for (const x of [-1.7, 1.7]) at(m(box(0.12, 0.8, 0.12), 0x6b3f2a), x, H + 0.55, zc + 0.5);
  root.userData.counter = new THREE.Vector3(wx, 0, front + 1.5);
  // Candy colours (Candy Miner: the picnic cafe); the food on the counter is baked already and keeps its own.
  candyLivery(root);
  bakeColors(root);
  return root;
}

export type SpotKind = "eat" | "drink" | "rest";

/** A chair facing `face` (atan2 convention: 0 = +z): seat just ahead of where the person stands, back behind. */
function chair(color: number, round: boolean, face: number): THREE.Group {
  const g = new THREE.Group();
  const seat = m(round ? cyl(0.3, 0.3, 0.07, 12) : box(0.6, 0.07, 0.6), color);
  seat.position.set(0, SEAT_Y - 0.035, 0.08);
  g.add(seat);
  for (const [x, z] of [[-0.24, -0.16], [0.24, -0.16], [-0.24, 0.32], [0.24, 0.32]]) {
    const leg = m(cyl(0.03, 0.03, SEAT_Y - 0.07, 5), round ? 0x4a4f57 : 0x7a4a2a);
    leg.position.set(x, (SEAT_Y - 0.07) / 2, z);
    g.add(leg);
  }
  const back = m(box(0.6, 0.7, 0.07), color);
  back.position.set(0, SEAT_Y + 0.35, -0.26);
  back.rotation.x = -0.12;
  g.add(back);
  g.rotation.y = face;
  return g;
}

/**
 * One spot of the break area: its furniture, and where its two people go (local x/z) and the way they face.
 * eat: a wooden table with plates; drink: a round café table with drinks; rest: two armchairs and a side table.
 */
export function breakSpotModel(kind: SpotKind): { root: THREE.Group; seats: { x: number; z: number; face: number }[] } {
  const root = new THREE.Group();
  if (kind === "rest") {
    // Two armchairs side by side facing the camera, a side table with a plant between them, on a rug.
    const rug = m(box(3.1, 0.02, 1.7), 0xb85c4a);
    rug.position.set(0, 0.012, 0.05);
    rug.receiveShadow = true;
    rug.castShadow = false;
    root.add(rug);
    const seats: { x: number; z: number; face: number }[] = [];
    for (const x of [-1.0, 1.0]) {
      const c = new THREE.Group();
      const base = m(box(0.9, SEAT_Y - 0.16, 0.74), 0x3f7d4e);
      base.position.set(0, (SEAT_Y - 0.16) / 2 + 0.02, 0.04);
      const cushion = m(box(0.82, 0.16, 0.68), 0x6cc07c);
      cushion.position.set(0, SEAT_Y - 0.08, 0.08);
      const back = m(box(0.92, 0.85, 0.2), 0x4f9a5f);
      back.position.set(0, SEAT_Y + 0.34, -0.3);
      back.rotation.x = -0.1;
      c.add(base, cushion, back);
      for (const ax of [-0.52, 0.52]) {
        const arm = m(box(0.16, 0.34, 0.76), 0x4f9a5f);
        arm.position.set(ax, SEAT_Y + 0.08, 0.04);
        c.add(arm);
      }
      c.position.x = x;
      root.add(c);
      seats.push({ x, z: 0, face: 0 });
    }
    const top = m(cyl(0.28, 0.28, 0.05, 12), 0xc98d4a);
    top.position.set(0, 0.62, -0.1);
    const leg = m(cyl(0.05, 0.08, 0.6, 6), 0x4a4f57);
    leg.position.set(0, 0.3, -0.1);
    const pot = m(cyl(0.12, 0.09, 0.2, 8), 0xa8452f);
    pot.position.set(0, 0.75, -0.1);
    const leaves = m(new THREE.IcosahedronGeometry(0.22, 0), 0x3fae36);
    leaves.position.set(0, 1.0, -0.1);
    root.add(top, leg, pot, leaves);
    candyLivery(root);
    bakeColors(root);
    return { root, seats };
  }
  const seats = [
    { x: -1.12, z: 0, face: Math.PI / 2 },
    { x: 1.12, z: 0, face: -Math.PI / 2 },
  ];
  const eat = kind === "eat";
  const top = m(eat ? box(1.35, 0.08, 0.95) : cyl(0.62, 0.62, 0.07, 16), eat ? 0xc98d4a : 0xf2f2f2);
  top.position.y = TABLE_Y - 0.04;
  const post = m(cyl(0.08, 0.1, TABLE_Y - 0.08, 6), 0x4a4f57);
  post.position.y = (TABLE_Y - 0.08) / 2;
  const foot = m(cyl(0.38, 0.42, 0.06, 12), 0x4a4f57);
  foot.position.y = 0.03;
  root.add(top, post, foot);
  for (const s of seats) {
    const c = chair(eat ? 0xd8503c : 0x2fa8a0, !eat, s.face);
    c.position.set(s.x, 0, s.z);
    root.add(c);
  }
  if (eat) {
    root.add(plate(-0.38, 0.05, burgerMesh(0.11)), plate(0.38, -0.05, pizzaSlice(0.2)));
    for (const [x, c] of [[-0.06, 0xd8302c], [0.08, 0xffc72c]] as const) {
      const b = m(cyl(0.05, 0.055, 0.22, 8), c);
      b.position.set(x, TABLE_Y + 0.11, -0.3);
      root.add(b);
    }
  } else {
    for (const [x, z, c] of [[-0.3, 0.1, 0xe0483a], [0.3, -0.1, 0x3a8ee6]] as const) {
      const cup = cupMesh(0.26, c);
      cup.position.set(x, TABLE_Y, z);
      root.add(cup);
    }
    const jug = m(cyl(0.13, 0.12, 0.32, 10), 0xffe066, { opacity: 0.8 });
    jug.position.set(0, TABLE_Y + 0.16, 0.25);
    root.add(jug);
  }
  candyLivery(root);
  bakeColors(root);
  return { root, seats };
}


/**
 * Delivery van (Candy Miner; the sales truck): Kenney's flatbed pickup in candy colours with a giant ice-cream cone on
 * the cab, cab facing +X (the way it drives in); the load sits on the bed.
 */
export function truckModel(): { root: THREE.Group; bed: THREE.Object3D; wheels: THREE.Object3D[] } {
  const root = new THREE.Group();
  const body = prop("truckflat", 8.6);
  body.rotation.y = Math.PI / 2;
  root.add(body);
  candyLivery(body);
  const s = propSize(body);
  const wheels: THREE.Object3D[] = [];
  body.traverse((o) => {
    if (o.name.startsWith("wheel-")) wheels.push(o);
  });
  const cone = new THREE.Group();
  const waffle = m(new THREE.ConeGeometry(0.55, 1.5, 12), 0xe0a860);
  waffle.rotation.x = Math.PI;
  waffle.position.y = 0.75;
  const scoop1 = m(new THREE.SphereGeometry(0.62, 14, 10), 0xff8fb8);
  scoop1.position.y = 1.65;
  const scoop2 = m(new THREE.SphereGeometry(0.5, 14, 10), 0xbff2dc);
  scoop2.position.y = 2.25;
  const cherry = m(new THREE.SphereGeometry(0.16, 10, 8), 0xe8243f);
  cherry.position.y = 2.8;
  cone.add(waffle, scoop1, scoop2, cherry);
  bakeColors(cone);
  cone.position.set(s.x * 0.3, s.y * 0.92, 0);
  root.add(cone);
  const bedTop = new THREE.Object3D();
  bedTop.position.set(-s.x * 0.2, s.y * 0.47, 0);
  root.add(bedTop);
  return { root, bed: bedTop, wheels };
}

/**
 * Cash bundle (user 2026-10-22: the reference's money looks better): a brick of green notes, the
 * top note printed (pale centre, dark border, a coin seal), a cream paper band round the middle,
 * and the sides showing the edges of the stacked notes.
 */
export const CASH = { w: 0.9, h: 0.26, d: 0.46 };
const cashGeo = new THREE.BoxGeometry(CASH.w, CASH.h, CASH.d);
function cashTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const BAND = "#f3ecd2";
let cashMats: THREE.Material[] | null = null;
function cashMaterials(): THREE.Material[] {
  if (cashMats) return cashMats;
  const top = cashTexture(256, 128, (g) => {
    g.fillStyle = "#3f9a3a";
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#79d35e";
    g.fillRect(8, 8, 240, 112);
    g.strokeStyle = "#2f7f2c";
    g.lineWidth = 3;
    g.strokeRect(16, 16, 224, 96);
    // Guilloche-ish lines on each half.
    g.strokeStyle = "rgba(47,127,44,0.45)";
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(64, 64, 14 + i * 5, 24 + i * 3, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(192, 64, 14 + i * 5, 24 + i * 3, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // Paper band across the middle, with a seal.
    g.fillStyle = BAND;
    g.fillRect(108, 0, 40, 128);
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(108, 0, 3, 128);
    g.fillRect(145, 0, 3, 128);
    g.fillStyle = "#e3b23c";
    g.beginPath();
    g.arc(128, 64, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff3b0";
    g.font = "bold 22px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("$", 128, 65);
  });
  const edges = (w: number, band: boolean) =>
    cashTexture(w, 32, (g) => {
      for (let y = 0; y < 32; y += 2) {
        g.fillStyle = y % 4 ? "#5cbf4a" : "#d9f0c4";
        g.fillRect(0, y, w, 2);
      }
      g.fillStyle = "rgba(20,70,20,0.35)";
      g.fillRect(0, 0, w, 3);
      g.fillRect(0, 29, w, 3);
      if (band) {
        g.fillStyle = BAND;
        g.fillRect(w / 2 - w * 0.078, 0, w * 0.156, 32);
      }
    });
  const side = edges(256, true);
  const end = edges(128, false);
  const m = (t: THREE.Texture) => new THREE.MeshLambertMaterial({ map: t, emissive: 0x0c2a08 });
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z.
  const endM = m(end);
  const sideM = m(side);
  cashMats = [endM, endM, m(top), sideM, sideM, sideM];
  return cashMats;
}
export function cashMesh(): THREE.Mesh {
  const me = new THREE.Mesh(cashGeo, cashMaterials());
  me.castShadow = true;
  return me;
}
/** The bundle's geometry and materials (flying cash uses them too). */
export function cashLook(): { geo: THREE.BufferGeometry; mats: THREE.Material[] } {
  return { geo: cashGeo, mats: cashMaterials() };
}

/** Oil barrel. */
export const barrelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.75, 10);
export function barrelMesh(): THREE.Mesh {
  // A fuel cell (Mars Miner): teal, glowing a little.
  const me = new THREE.Mesh(barrelGeo, mat(0x2fa8c8, { emissive: 0x0d4a5c }));
  me.castShadow = true;
  return me;
}
