import * as THREE from "three";
import { prop, propSize } from "../props3d";
import { bakeColors, mat, farmLivery } from "../models";
import { C, ROOF, add, barn, beam, boards, box, chimney, cottage, cyl, doorAt, gable, gableRoof, lantern, marketHall, rbox, ridge, shade, slope, stones, windowAt, woodSign, workshop } from "./farmHouses";

/**
 * Procedural building and prop models for the base. Each returns a Group whose origin is
 * the centre of its footprint at ground level, with named anchor Object3Ds where the game
 * logic needs positions (pads, output trays, piles).
 */

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

/** Turn a baked group about its local z axis forever (a waterwheel inside a frozen building): each frame, before it is
 * drawn, its meshes' world matrices get the turn (three recomputes them from the frozen local matrices every frame,
 * so nothing piles up). The shadow stays still, which nobody notices on a wheel. */
function spin(group: THREE.Object3D, speed: number): void {
  const rot = new THREE.Matrix4();
  group.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    me.onBeforeRender = () => {
      rot.makeRotationZ((-performance.now() / 1000) * speed);
      me.matrixWorld.multiplyMatrices(group.matrixWorld, rot);
    };
  });
}

/** A waterwheel facing +z, radius r, `w` wide: two rims, eight spokes, paddles between the rims, a hub. Centred. */
function waterwheel(r: number, w: number): THREE.Group {
  const g = new THREE.Group();
  for (const z of [-w / 2, w / 2]) {
    const rim = new THREE.TorusGeometry(r, 0.08, 8, 28);
    add(g, rim, C.woodDark, 0, 0, z);
    // Four boards across the wheel make its eight spokes.
    for (let i = 0; i < 4; i++) add(g, rbox(r * 2 - 0.1, 0.12, 0.1, 0.03), C.wood, 0, 0, z).rotation.z = (i * Math.PI) / 4;
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const p = add(g, box(0.34, 0.07, w + 0.08), C.woodLight, Math.cos(a) * (r - 0.12), Math.sin(a) * (r - 0.12), 0);
    p.rotation.z = a + Math.PI / 2;
  }
  const hub = cyl(0.26, 0.26, w + 0.3, 14);
  hub.rotateX(Math.PI / 2);
  add(g, hub, C.woodDark, 0, 0, 0);
  const axle = cyl(0.09, 0.09, w + 0.9, 10);
  axle.rotateX(Math.PI / 2);
  add(g, axle, C.iron, 0, 0, -0.2);
  return g;
}

/** A burlap sack of rice, standing (decor). */
function sack(parent: THREE.Object3D, x: number, z: number, s = 1, lean = 0): void {
  const prof = [[0, 0], [0.32, 0], [0.4, 0.1], [0.42, 0.34], [0.38, 0.58], [0.26, 0.74], [0.11, 0.84], [0.16, 0.95], [0, 0.97]].map(([a, b]) => new THREE.Vector2(a * s, b * s));
  const me = add(parent, new THREE.LatheGeometry(prof, 14), 0xd9b98a, x, 0, z);
  me.scale.z = 0.82;
  me.rotation.z = lean;
  add(parent, new THREE.TorusGeometry(0.1 * s, 0.03 * s, 6, 10), 0x9a6a3c, x - lean * 0.8 * s, 0.83 * s, z).rotation.x = Math.PI / 2;
}

/**
 * The Mill and the Forge (user 2026-10-28: rice and wood go to one house, metals and gems to the other). Both stand
 * in the furnace's collision box (Game: x −0.6 … +1.6 cells, z −1.9 … +0.15 cells round the spot); the pad (Furnace.ts)
 * is on the south-west cell in front, the output tray front-right as before.
 *
 * - Mill: a timber-framed mill house with wooden shingles; on its left a waterwheel turns in a stone basin, fed by a
 *   race beside the house; the hopper the sheaves fly into, sacks of rice; a lantern by the door glows while it works.
 * - Forge: a stone smithy with a slate roof, a hearth whose arched mouth glows while it works under a tall stone
 *   chimney, an anvil on a stump and a quench barrel under a lean-to, a heap of coal.
 */
export function furnaceModel(cell: number, kind: "mill" | "forge" = "mill"): { root: THREE.Group; mouth: THREE.Object3D; tray: THREE.Object3D; glow: THREE.Mesh; chimneys: THREE.Object3D[] } {
  const s = cell;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const glowMat = new THREE.MeshLambertMaterial({ color: kind === "mill" ? 0xffe2a0 : 0xffb347, emissive: kind === "mill" ? 0xffa53a : 0xff6a10 });
  const mouth = new THREE.Object3D();
  root.add(mouth);
  const chimneys: THREE.Object3D[] = [];
  let glow: THREE.Mesh;
  // Output tray (front-right, as the old furnace's): a sturdy table the products pile on, top at 0.52.
  const tray = new THREE.Group();
  tray.position.set(s * 1.0, 0, s * 0.35);
  const top = s * 0.85;
  if (kind === "mill") {
    add(tray, rbox(top, 0.12, top, 0.04), C.woodLight, 0, 0.46, 0);
    boards(tray, -top / 2, top / 2, 0.0, 0.4, top / 2 - 0.12, C.wood, { size: 0.2, t: 0.05, seed: 3 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(tray, box(0.14, 0.42, 0.14), C.woodDark, (sx * (top - 0.2)) / 2, 0.21, (sz * (top - 0.2)) / 2);
  } else {
    add(tray, rbox(top, 0.12, top, 0.04), 0x5e6268, 0, 0.46, 0);
    stones(tray, -top / 2, top / 2, 0.0, 0.4, top / 2 - 0.12, C.stone, { size: 0.2, seed: 9 });
    add(tray, box(top - 0.1, 0.4, top - 0.24), C.stoneDark, 0, 0.2, -0.05);
  }
  bakeColors(tray);
  root.add(tray);
  const trayTop = new THREE.Object3D();
  trayTop.position.y = 0.52;
  tray.add(trayTop);

  if (kind === "mill") {
    // The mill house: x 0.85 … 3.95, front at z 0.2, timber frame on cream plaster over a stone footing.
    const W = 3.1;
    const D = 4.8;
    const cx = 2.4;
    const front = 0.2;
    const zc = front - D / 2;
    const H = 3.4;
    const house = new THREE.Group();
    house.position.x = cx;
    body.add(house);
    add(house, box(W + 0.16, 0.55, D + 0.16), C.stoneDark, 0, 0.275, zc);
    stones(house, -W / 2 - 0.08, W / 2 + 0.08, 0.02, 0.53, front + 0.08, C.stone, { size: 0.26, seed: 4 });
    add(house, box(W, H - 0.55, D), C.plaster, 0, 0.55 + (H - 0.55) / 2, zc);
    for (const sx of [-1, 1]) add(house, rbox(0.22, H - 0.55, 0.14, 0.04), C.woodDark, sx * (W / 2 - 0.06), 0.55 + (H - 0.55) / 2, front + 0.04);
    add(house, rbox(W + 0.12, 0.2, 0.16, 0.05), C.woodDark, 0, H - 0.05, front + 0.04);
    add(house, rbox(W, 0.14, 0.12, 0.04), C.woodDark, 0, 0.62, front + 0.03);
    add(house, rbox(W, 0.14, 0.12, 0.04), C.woodDark, 0, 2.35, front + 0.03);
    for (const sx of [-1, 1]) {
      add(house, rbox(0.16, H - 0.7, 0.12, 0.04), C.woodDark, sx * 0.72, 0.62 + (H - 0.7) / 2, front + 0.03);
      beam(house, sx * (W / 2 - 0.1), 0.7, sx * 0.8, 2.3, front + 0.03, 0.12, 0.1, C.woodDark);
    }
    const rise = 1.75;
    for (const z of [front, front - D + 0.14]) gable(house, W, rise, H, z, C.plaster);
    add(house, rbox(0.14, rise * 0.7, 0.1, 0.04), C.woodDark, 0, H + rise * 0.35, front + 0.03);
    gableRoof(house, { w: W, d: D, y: H, rise, color: ROOF.tan, zc, over: 0.42, trim: C.woodDark, seed: 81 });
    // Double door behind the tray, a hatch above it with a chute down to the tray.
    doorAt(house, -0.36, front, 0.68, 2.0, 0x8a5a32, { y0: 0.55 });
    doorAt(house, 0.36, front, 0.68, 2.0, 0x8a5a32, { y0: 0.55 });
    add(house, rbox(0.95, 0.75, 0.08, 0.04), C.woodDark, 0, H - 0.6, front + 0.04);
    add(house, box(0.75, 0.55, 0.06), C.interior, 0, H - 0.6, front + 0.06);
    const chute = add(house, box(0.62, 0.06, 1.4), C.woodLight, 0, 2.05, front + 0.45);
    chute.rotation.x = 0.75;
    for (const sx of [-1, 1]) {
      const side = add(house, box(0.06, 0.16, 1.4), C.wood, sx * 0.32, 2.1, front + 0.45);
      side.rotation.x = 0.75;
    }
    windowAt(house, -1.0, 2.95, front, 0.5, 0.42, { frame: C.woodDark });
    // The lantern's glass is the glow Furnace.ts pulses: kept out of the bake, on its own material.
    glow = lantern(house, 1.25, 2.15, front, glowMat);
    glow.removeFromParent();
    glow.position.x += cx;
    root.add(glow);
    chimneys.push(chimney(house, 0.6, zc - 1.2, H + 0.6, H + 2.1, C.stone, 0.5));
    const sign = woodSign(["MILL"], 1.7, 0.58);
    sign.position.set(0, H + 0.42, front + 0.22);
    sign.rotation.x = -0.22;
    house.add(sign);
    // The mill race on the left: a stone-lined channel of water running front to back beside the house, the wheel
    // turning in it on its axle, held by a stone pier behind.
    const wx = -0.4;
    const wz = -1.7;
    const wr = 1.22;
    const wy = 0.32 + wr - 0.18;
    for (const sx of [-1, 1]) add(body, box(0.32, 0.55, 4.1), C.stoneDark, wx + sx * 0.82, 0.275, -2.55);
    // Stones on the outer (left) wall: laid along a turned group's x, which runs to world +z.
    const course = new THREE.Group();
    stones(course, -4.55, -0.55, 0.02, 0.53, 0, C.stone, { size: 0.26, seed: 6 });
    course.rotation.y = -Math.PI / 2;
    course.position.x = wx - 0.98;
    body.add(course);
    add(body, box(1.9, 0.12, 4.1), C.stoneDark, wx, 0.06, -2.55);
    const water = add(body, box(1.36, 0.05, 4.05), 0x3fa8d8, wx, 0.42, -2.55);
    water.castShadow = false;
    for (const z of [-0.6, -4.55]) add(body, rbox(1.95, 0.6, 0.32, 0.06), C.stone, wx, 0.3, z);
    add(body, rbox(0.7, wy + 0.2, 0.5, 0.08), C.stone, wx, (wy + 0.2) / 2, wz - 0.65);
    stones(body, wx - 0.35, wx + 0.35, 0.05, wy + 0.1, wz - 0.4, C.stone, { size: 0.28, seed: 8 });
    // Ripples where the wheel churns the water.
    for (const dz of [-0.3, 0.35]) add(body, box(0.9, 0.02, 0.12), 0xd8f2fb, wx, 0.46, wz + dz).castShadow = false;
    // The hopper the raw goods fly into, and sacks of rice by the basin.
    add(body, rbox(0.82, 0.55, 0.82, 0.05), C.wood, 0.42, 1.42, 0.0);
    add(body, new THREE.CylinderGeometry(0.42, 0.14, 0.5, 4, 1).rotateY(Math.PI / 4), C.woodDark, 0.42, 0.95, 0.0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(body, box(0.1, 1.4, 0.1), C.woodDark, 0.42 + sx * 0.34, 0.7, sz * 0.34);
    add(body, box(0.66, 0.1, 0.66), C.hay, 0.42, 1.7, 0.0);
    mouth.position.set(0.42, 1.8, 0.0);
    sack(body, -0.35, 0.12, 1, 0.05);
    sack(body, -0.95, 0.18, 0.9, -0.08);
    sack(body, -0.62, -0.12, 0.85, 0.1);
    bakeColors(body);
    const wheel = waterwheel(wr, 0.55);
    bakeColors(wheel);
    wheel.position.set(wx, wy, wz);
    spin(wheel, 0.7);
    root.add(wheel);
  } else {
    // The smithy: stone walls x −1.45 … 2.65, front at z −0.7, slate roof; a lean-to over the work area in front.
    const W = 4.1;
    const D = 3.9;
    const cx = 0.6;
    const front = -0.7;
    const zc = front - D / 2;
    const H = 2.9;
    const house = new THREE.Group();
    house.position.x = cx;
    body.add(house);
    add(house, box(W, H, D), C.stoneDark, 0, H / 2, zc);
    stones(house, -W / 2, W / 2, 0, H - 0.05, front, C.stone, { size: 0.42, seed: 12 });
    const rise = 1.6;
    for (const z of [front, front - D + 0.14]) gable(house, W, rise, H, z, C.stoneDark);
    stones(house, -1.0, 1.0, H, H + 0.55, front, C.stone, { size: 0.3, seed: 14 });
    gableRoof(house, { w: W, d: D, y: H, rise, color: ROOF.slate, zc, over: 0.36, trim: C.woodDark, seed: 91 });
    windowAt(house, 1.45, 1.95, front + 0.1, 0.62, 0.58, { frame: C.woodDark, shutter: 0x5a6e8a });
    const sign = woodSign(["FORGE"], 1.9, 0.6);
    sign.position.set(0.1, H + 0.36, front + 0.25);
    sign.rotation.x = -0.22;
    house.add(sign);
    // Lean-to: posts and a slate slope from the wall out over the tray.
    for (const [x, z] of [[0.45, 0.22], [3.82, 0.22], [3.82, -0.62]] as const) add(body, rbox(0.18, 2.45, 0.18, 0.05), C.woodDark, x, 1.22, z);
    add(body, rbox(3.6, 0.16, 0.18, 0.05), C.woodDark, 2.13, 2.42, 0.22);
    const lean = new THREE.Group();
    lean.rotation.y = Math.PI / 2;
    lean.position.set(2.13, 0, 0);
    // In the rotated group local x runs to world −z: eave at world z 0.45, wall at −0.7.
    slope(lean, -0.45, 2.42, 0.72, 2.95, 3.9, ROOF.slate, 0, 95);
    body.add(lean);
    // The hearth: a stone block with an arched mouth, under a hood and a tall chimney.
    const hx = -0.58;
    const hz = -0.2;
    add(body, box(1.8, 1.45, 1.0), C.stoneDark, hx, 0.725, hz);
    stones(body, hx - 0.9, hx + 0.9, 0, 1.45, hz + 0.5, C.stone, { size: 0.3, seed: 16 });
    add(body, box(0.98, 0.86, 0.1), 0x1e1612, hx, 0.62, hz + 0.53);
    const arch = new THREE.TorusGeometry(0.5, 0.12, 8, 16, Math.PI);
    add(body, arch, C.stone, hx, 0.95, hz + 0.62);
    for (const sx of [-1, 1]) add(body, rbox(0.24, 0.8, 0.24, 0.05), C.stone, hx + sx * 0.5, 0.45, hz + 0.6);
    // A sloped stone cap over the hearth back to the wall; the chimney rises through the roof behind it.
    const cap = add(body, rbox(1.9, 0.3, 1.2, 0.08), C.stone, hx, 1.55, hz - 0.1);
    cap.rotation.x = 0.22;
    chimneys.push(chimney(body, hx - 0.25, -1.7, 1.5, 6.1, C.stone, 0.95));
    const fire = new THREE.Shape();
    fire.moveTo(-0.38, 0);
    fire.lineTo(0.38, 0);
    fire.lineTo(0.38, 0.42);
    fire.absarc(0, 0.42, 0.38, 0, Math.PI, false);
    fire.closePath();
    glow = new THREE.Mesh(new THREE.ShapeGeometry(fire, 10), glowMat);
    glow.position.set(hx, 0.2, hz + 0.6);
    mouth.position.set(hx, 0.8, hz + 0.5);
    // Coals in the mouth (dark), a coal heap to the left, anvil on a stump, a quench barrel, tongs on the wall.
    for (let i = 0; i < 6; i++) add(body, new THREE.SphereGeometry(0.11, 8, 6), 0x2a2420, hx - 0.3 + i * 0.12, 0.26, hz + 0.6 + (i % 2) * 0.05);
    for (let i = 0; i < 9; i++) add(body, new THREE.SphereGeometry(0.13 + (i % 3) * 0.03, 8, 6), 0x2e2a28, -1.25 + (i % 3) * 0.17, 0.1 + Math.floor(i / 3) * 0.12, 0.2 + ((i * 7) % 3) * 0.04);
    add(body, cyl(0.3, 0.34, 0.55, 14), 0x8a5a32, 1.02, 0.275, -0.32);
    add(body, cyl(0.24, 0.24, 0.02, 14), C.woodLight, 1.02, 0.56, -0.32);
    add(body, rbox(0.34, 0.16, 0.3, 0.04), 0x3e4248, 1.02, 0.65, -0.32);
    add(body, rbox(0.18, 0.18, 0.2, 0.03), 0x3e4248, 1.02, 0.8, -0.32);
    add(body, rbox(0.62, 0.16, 0.3, 0.05), 0x4a4f56, 1.02, 0.96, -0.32);
    const horn = new THREE.ConeGeometry(0.11, 0.36, 10);
    horn.rotateZ(Math.PI / 2);
    add(body, horn, 0x4a4f56, 0.6, 0.97, -0.32);
    add(body, box(0.08, 0.06, 0.4), 0x8a5a32, 1.1, 1.08, -0.3).rotation.y = 0.5;
    add(body, rbox(0.14, 0.12, 0.22, 0.03), 0x3e4248, 1.02, 1.1, -0.18);
    add(body, new THREE.LatheGeometry([[0, 0], [0.36, 0], [0.42, 0.4], [0.36, 0.8], [0, 0.8]].map(([a, b]) => new THREE.Vector2(a, b)), 14), 0x8a5a32, 3.35, 0, -0.38);
    add(body, cyl(0.37, 0.37, 0.03, 14), 0x3f8fc0, 3.35, 0.78, -0.38);
    for (const y of [0.16, 0.64]) add(body, cyl(0.42, 0.42, 0.06, 14), C.iron, 3.35, y, -0.38);
    for (let i = 0; i < 3; i++) add(body, box(0.05, 0.6, 0.04), C.iron, 2.1 + i * 0.3, 1.6, -0.62);
    bakeColors(body);
    root.add(glow);
  }
  return { root, mouth, tray: trayTop, glow, chimneys };
}

/** Entry buildings (props for EntryBuilding / SalesStand), baked. */
function baked(g: THREE.Group): THREE.Group {
  bakeColors(g);
  return g;
}
export const farmhandsModel = (): THREE.Group => baked(cottage("FARMHANDS"));
export const farmShopModel = (): THREE.Group => baked(barn("FARM SHOP"));
export const marketModel = (): THREE.Group => baked(marketHall("MARKET"));

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

/** The Workshop (upgrades) with its quest beacon. */
export function upgradeModel(cell: number): { root: THREE.Group; beacon: THREE.Object3D } {
  const root = baked(workshop("UPGRADES"));
  const beacon = beaconModel();
  beacon.position.set(0, cell * 1.8 * GRAND + 2.4, -cell * 0.2);
  root.add(beacon);
  return { root, beacon };
}

/**
 * The Fuel depot (the oil station): a red diesel tank on a timber stand with a hose, an old pump, jerrycans; the
 * rack's anchor where the cans pile, and a wooden crate for empties beside the pad. In the oil station's collision
 * box (Game: x −1.0 … +1.1 cells, z −1.35 … −0.2 cells).
 */
export function oilStationModel(cell: number): { root: THREE.Group; barrels: THREE.Object3D } {
  const root = new THREE.Group();
  const s = cell;
  const d = new THREE.Group();
  // Stand: four legs, braces, cradle boards; the tank on it.
  const tz = -1.95;
  const tx = -0.75;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) add(d, rbox(0.2, 1.45, 0.2, 0.05), C.woodDark, tx + sx * 1.15, 0.72, tz + sz * 0.55);
  for (const sz of [-1, 1]) beam(d, tx - 1.15, 0.3, tx + 1.15, 1.25, tz + sz * 0.55, 0.1, 0.08, C.wood);
  for (const sx of [-1, 0.0, 1]) add(d, rbox(0.22, 0.16, 1.4, 0.05), C.wood, tx + sx * 1.0, 1.48, tz);
  const tank = cyl(0.78, 0.78, 3.0, 22);
  tank.rotateZ(Math.PI / 2);
  add(d, tank, 0xd0412f, tx, 2.28, tz);
  for (const sx of [-1, 1]) {
    const cap = new THREE.SphereGeometry(0.78, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.3, 1);
    cap.rotateZ((-sx * Math.PI) / 2);
    add(d, cap, 0xd0412f, tx + sx * 1.5, 2.28, tz);
    const band = cyl(0.8, 0.8, 0.1, 22);
    band.rotateZ(Math.PI / 2);
    add(d, band, 0x8a2a20, tx + sx * 1.05, 2.28, tz);
  }
  add(d, cyl(0.16, 0.16, 0.2, 12), 0x8a2a20, tx + 0.5, 3.1, tz);
  // A painted band across the tank's front with the word on a sign.
  const word = woodSign(["FUEL"], 1.3, 0.48, { paint: "#f2e6c8", text: "#d0412f" });
  word.position.set(tx, 2.3, tz + 0.82);
  d.add(word);
  // Hose from the tank down to a hook post, the nozzle hanging on it.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(tx + 1.2, 1.6, tz + 0.5),
    new THREE.Vector3(tx + 1.5, 0.9, tz + 0.75),
    new THREE.Vector3(tx + 1.95, 0.55, tz + 0.95),
    new THREE.Vector3(tx + 2.25, 1.15, tz + 1.05),
  ]);
  add(d, new THREE.TubeGeometry(curve, 16, 0.05, 6), 0x2f2c2a, 0, 0, 0);
  add(d, cyl(0.07, 0.07, 0.14, 8), 0xd0412f, tx + 2.25, 1.22, tz + 1.05);
  // The pump: a rounded red cabinet, a white top with a dial.
  const px = 1.85;
  const pz = -1.15;
  add(d, rbox(0.72, 1.55, 0.55, 0.12), 0xd0412f, px, 0.775, pz);
  add(d, rbox(0.62, 0.36, 0.5, 0.1), 0xfff4e0, px, 1.72, pz);
  const dial = cyl(0.17, 0.17, 0.05, 16);
  dial.rotateX(Math.PI / 2);
  add(d, dial, 0xfffcf2, px, 1.12, pz + 0.29);
  add(d, box(0.02, 0.13, 0.02), 0x2c2a28, px + 0.03, 1.15, pz + 0.32).rotation.z = -0.6;
  add(d, rbox(0.12, 0.3, 0.1, 0.03), 0x2f2c2a, px + 0.42, 0.95, pz + 0.05);
  // Jerrycans by the pump.
  for (const [x, z, c, r] of [[0.85, -0.85, 0xd0412f, 0.1], [1.25, -0.72, 0x4f9a3a, -0.15], [2.55, -0.72, 0xd0412f, 0.2]] as const) {
    const can = new THREE.Group();
    add(can, rbox(0.4, 0.52, 0.2, 0.05), c, 0, 0.26, 0);
    add(can, box(0.24, 0.06, 0.06), shade(c, 0.7), -0.04, 0.56, 0);
    add(can, cyl(0.04, 0.04, 0.1, 8), 0xe2b443, 0.13, 0.56, 0);
    can.position.set(x, 0, z);
    can.rotation.y = r;
    d.add(can);
  }
  // A crate for empty cans (the bin pad's), slats and a dark inside.
  const bin = new THREE.Group();
  const bw = s * 0.55;
  add(bin, box(bw, 0.06, bw), C.interior, 0, 0.9, 0);
  for (const sz of [-1, 1]) boards(bin, -bw / 2, bw / 2, 0, 0.95, sz > 0 ? bw / 2 - 0.06 : -bw / 2, C.woodLight, { horizontal: true, size: 0.3, t: 0.06, seed: 5 });
  for (const sx of [-1, 1]) add(bin, box(0.06, 0.95, bw), shade(C.woodLight, 0.9), (sx * bw) / 2 - sx * 0.03, 0.475, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(bin, box(0.1, 1.0, 0.1), C.woodDark, sx * (bw / 2 - 0.02), 0.5, sz * (bw / 2 - 0.02));
  bin.position.set(s * 0.95, 0, s * 0.6);
  d.add(bin);
  bakeColors(d);
  root.add(d);
  const barrels = new THREE.Object3D();
  barrels.position.set(-s * 0.2, 0.05, s * 0.35);
  root.add(barrels);
  return { root, barrels };
}

/* ---------- the crew's Noodle Stall (user 2026-10-24: a restaurant; Farm Valley: noodles) ----------
 * The reference's break area is a pizza stand with tables under umbrellas. Ours is a wooden noodle stall with a
 * tiled roof and red lanterns, and its spots are for eating, drinking tea or just sitting back. Sized for our
 * people (~2.6 tall): the chairs and tables fit the seated pose in characters.ts (feet on the ground).
 */

/** Top of a chair seat and of a table. */
const SEAT_Y = 0.6;
const TABLE_Y = 1.0;

/** The stall's sign: the name on top, what it serves below, on a red board with a gold border. */
function stallSign(w: number, h: number): THREE.Mesh {
  const px = 128;
  const tex = cashTexture(Math.round(w * px), Math.round(h * px), (g) => {
    const W = g.canvas.width;
    const H = g.canvas.height;
    g.fillStyle = "#b8322a";
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 4, W - 8, H - 8, H * 0.18);
    else g.rect(4, 4, W - 8, H - 8);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = "#ffcf4a";
    g.stroke();
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff4dc";
    g.shadowColor = "rgba(0,0,0,0.35)";
    g.shadowOffsetY = 5;
    g.font = `${Math.round(H * 0.5)}px "Lilita One", system-ui, sans-serif`;
    g.fillText("NOODLES", W / 2, H * 0.42);
    g.fillStyle = "#ffcf4a";
    g.font = `${Math.round(H * 0.2)}px "Lilita One", system-ui, sans-serif`;
    g.fillText("HOT SOUP  •  TEA", W / 2, H * 0.8);
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
    g.font = `${Math.round(H * 0.12)}px "Lilita One", system-ui, sans-serif`;
    ["NOODLES", "BUNS", "TEA", "JUICE"].forEach((t, i) => {
      g.textAlign = "left";
      g.fillStyle = "#f6f1e6";
      g.fillText(t, W * 0.1, H * (0.4 + i * 0.15));
      g.textAlign = "right";
      g.fillStyle = "#ffd34d";
      g.fillText(`$${[5, 3, 2, 3][i]}`, W * 0.9, H * (0.4 + i * 0.15));
    });
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

/**
 * A steamed bun on its paper (the workers' snack: characters.ts brings it to the mouth; the name stays from the
 * burger it replaced). Radius r.
 */
export function burgerMesh(r = 0.12): THREE.Group {
  const g = new THREE.Group();
  const paper = add(g, cyl(r * 1.05, r * 1.05, r * 0.06, 12), 0xf2e2b8, 0, r * 0.03, 0);
  paper.castShadow = false;
  const bun = new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  bun.scale(1, 0.85, 1);
  add(g, bun, 0xfffaf0, 0, r * 0.05, 0);
  add(g, new THREE.ConeGeometry(r * 0.28, r * 0.3, 8), 0xf6ecd8, 0, r * 0.95, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = add(g, box(r * 0.08, r * 0.45, r * 0.06), 0xeee2c8, Math.cos(a) * r * 0.35, r * 0.72, Math.sin(a) * r * 0.35);
    p.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
  }
  bakeColors(g);
  return g;
}

/** A cup of iced tea or juice with a lid and a straw. */
export function cupMesh(h = 0.26, color = 0xe0483a): THREE.Group {
  const g = new THREE.Group();
  add(g, cyl(h * 0.3, h * 0.24, h, 12), color, 0, h / 2, 0);
  add(g, cyl(h * 0.285, h * 0.27, h * 0.25, 12), 0xffffff, 0, h * 0.5, 0);
  add(g, cyl(h * 0.32, h * 0.32, h * 0.07, 12), 0xffffff, 0, h, 0);
  add(g, cyl(h * 0.035, h * 0.035, h * 0.55, 5), 0x7cc24a, h * 0.06, h * 1.2, 0).rotation.z = -0.25;
  bakeColors(g);
  return g;
}

/** A bowl of noodle soup with chopsticks across it. */
function noodleBowl(r = 0.2): THREE.Group {
  const g = new THREE.Group();
  const prof = [[0, 0], [r * 0.45, 0], [r * 0.5, r * 0.08], [r * 0.85, r * 0.35], [r, r * 0.62], [r * 0.94, r * 0.64], [r * 0.8, r * 0.4], [0, r * 0.32]].map(([a, b]) => new THREE.Vector2(a, b));
  add(g, new THREE.LatheGeometry(prof, 18), 0xf6f2ea, 0, 0, 0);
  add(g, new THREE.TorusGeometry(r * 0.97, r * 0.04, 6, 20).rotateX(Math.PI / 2), 0x3a6ec0, 0, r * 0.63, 0);
  add(g, cyl(r * 0.88, r * 0.88, 0.02, 18), 0xe8b04a, 0, r * 0.56, 0);
  for (let i = 0; i < 5; i++) add(g, new THREE.TorusGeometry(r * (0.2 + i * 0.12), 0.012, 4, 14).rotateX(Math.PI / 2), 0xffe7a0, 0, r * 0.585, 0);
  add(g, new THREE.SphereGeometry(r * 0.16, 8, 6), 0x5fae3f, r * 0.35, r * 0.6, -r * 0.2);
  add(g, cyl(r * 0.16, r * 0.16, 0.02, 10), 0xf2a0a0, -r * 0.3, r * 0.6, r * 0.25);
  for (const dz of [-0.03, 0.03]) add(g, cyl(0.01, 0.012, r * 2.4, 5), 0x8a5a2b, 0.02, r * 0.72, dz).rotation.z = Math.PI / 2 - 0.12;
  return g;
}

function bowlOn(x: number, z: number, r = 0.18): THREE.Group {
  const g = noodleBowl(r);
  g.position.set(x, TABLE_Y, z);
  return g;
}

/**
 * The Noodle Stall, front (serving window, counter, door) facing +z. It stays inside the box Game makes solid for the
 * break area's building (x ±3, z −2.25 … +0.75). `userData.counter`: the spot in front of the counter (local).
 */
export function restaurantModel(): THREE.Group {
  const root = new THREE.Group();
  const H = 3.5;
  const W = 5.5;
  const D = 2.6;
  const front = 0.45;
  const zc = front - D / 2;
  add(root, box(W + 0.14, 0.4, D + 0.14), C.stoneDark, 0, 0.2, zc);
  stones(root, -W / 2 - 0.07, W / 2 + 0.07, 0.02, 0.38, front + 0.07, C.stone, { size: 0.18, seed: 31 });
  add(root, box(W, H - 0.4, D), 0xc58f55, 0, 0.4 + (H - 0.4) / 2, zc);
  boards(root, -W / 2, W / 2, 0.4, H, front, 0xc58f55, { size: 0.4, seed: 33 });
  for (const sx of [-1, 1]) add(root, rbox(0.22, H - 0.4, 0.16, 0.04), C.woodDark, sx * (W / 2 - 0.06), 0.4 + (H - 0.4) / 2, front + 0.1);
  add(root, rbox(W + 0.1, 0.2, 0.18, 0.05), C.woodDark, 0, H - 0.08, front + 0.1);
  // Tiled roof, ridge along x (in a turned group local x runs to world −z), corners turned up at the eaves.
  const rf = new THREE.Group();
  rf.rotation.y = Math.PI / 2;
  const roofC = 0xa8402e;
  slope(rf, -(front + 0.55), H - 0.1, -zc, H + 1.15, W + 0.7, roofC, 0, 51);
  slope(rf, -(front - D - 0.45), H - 0.1, -zc, H + 1.15, W + 0.7, roofC, 0, 53);
  ridge(rf, -zc, H + 1.27, W + 0.76, roofC);
  root.add(rf);
  for (const sx of [-1, 1])
    for (const [z, y] of [[front + 0.55, H - 0.1], [front - D - 0.45, H - 0.1]] as const) {
      const horn = add(root, new THREE.ConeGeometry(0.1, 0.5, 8), shade(roofC, 0.8), sx * (W / 2 + 0.4), y + 0.12, z);
      horn.rotation.z = -sx * 1.0;
    }
  for (const sx of [-1, 1]) add(root, new THREE.SphereGeometry(0.16, 10, 8), shade(roofC, 0.8), sx * (W / 2 + 0.38), H + 1.27, zc);
  // Serving window: dark kitchen, the menu, a frame, a short blue curtain, the counter with a pot and bowls.
  const wx = -0.45;
  const ww = 2.7;
  add(root, box(ww, 1.4, 0.06), C.interior, wx, 2.2, front + 0.08);
  const menu = menuBoard(1.0, 0.85);
  menu.position.set(wx + 0.75, 2.2, front + 0.13);
  root.add(menu);
  for (const [x, y, w, h] of [[wx, 2.95, ww + 0.2, 0.14], [wx - ww / 2, 2.2, 0.14, 1.55], [wx + ww / 2, 2.2, 0.14, 1.55]])
    add(root, rbox(w, h, 0.14, 0.04), C.woodDark, x, y, front + 0.12);
  for (let i = 0; i < 5; i++) add(root, box(ww / 5 - 0.05, 0.42, 0.03), i % 2 ? 0x2f5590 : 0x3a64a8, wx - ww / 2 + (ww / 5) * (i + 0.5), 2.68, front + 0.2);
  add(root, rbox(ww + 0.34, 0.12, 0.45, 0.04), C.woodLight, wx, 1.48, front + 0.2);
  boards(root, wx - ww / 2 - 0.15, wx + ww / 2 + 0.15, 0.4, 1.42, front + 0.12, 0xb5803f, { horizontal: true, size: 0.34, t: 0.05, seed: 37 });
  // A big pot with steam, bowls stacked, a bowl ready, a bun.
  add(root, cyl(0.3, 0.26, 0.42, 16), 0x55585e, wx - 0.85, 1.75, front + 0.22);
  add(root, cyl(0.32, 0.32, 0.05, 16), 0x3e4248, wx - 0.85, 1.97, front + 0.22);
  for (const [dx, dy, r] of [[0, 0.32, 0.18], [0.12, 0.55, 0.14], [-0.06, 0.74, 0.11]] as const)
    add(root, new THREE.SphereGeometry(r, 10, 8), 0xffffff, wx - 0.85 + dx, 1.97 + dy, front + 0.22, { opacity: 0.55 }).castShadow = false;
  for (let i = 0; i < 4; i++) add(root, cyl(0.15, 0.1, 0.08, 14), 0xf6f2ea, wx - 0.2, 1.58 + i * 0.07, front + 0.22);
  const ready = noodleBowl(0.17);
  ready.position.set(wx + 0.25, 1.54, front + 0.22);
  root.add(ready);
  const bun = burgerMesh(0.11);
  bun.position.set(wx + 0.65, 1.54, front + 0.25);
  root.add(bun);
  // Red lanterns along the eave.
  for (const x of [-2.2, 1.35]) {
    add(root, cyl(0.012, 0.012, 0.35, 4), C.iron, x, H - 0.25, front + 0.45);
    const lan = new THREE.SphereGeometry(0.22, 12, 9);
    lan.scale(1, 1.2, 1);
    add(root, lan, 0xe8402f, x, H - 0.65, front + 0.45, { emissive: 0x5a1408 });
    add(root, cyl(0.11, 0.11, 0.05, 8), 0x2c2420, x, H - 0.38, front + 0.45);
    add(root, cyl(0.11, 0.11, 0.05, 8), 0x2c2420, x, H - 0.92, front + 0.45);
  }
  // Door.
  doorAt(root, 1.95, front + 0.08, 1.0, 2.5, 0x8a4a2e, { y0: 0.4 });
  // A wooden drinks cabinet by the window, glass front, bottles.
  add(root, rbox(0.74, 2.2, 0.42, 0.05), C.woodDark, -2.32, 0.4 + 1.1, front + 0.1);
  add(root, box(0.56, 1.6, 0.03), 0xbfe8f5, -2.32, 1.5, front + 0.32, { opacity: 0.55 });
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) add(root, cyl(0.05, 0.06, 0.32, 6), [0xff8a1f, 0x4cc94a, 0x3a8ee6][(r + c) % 3], -2.5 + c * 0.18, 0.98 + r * 0.5, front + 0.2);
  // The sign on the roof, leaning back toward the camera.
  const sign = stallSign(4.2, 1.3);
  sign.position.set(0, H + 1.55, zc + 0.75);
  sign.rotation.x = -0.3;
  root.add(sign);
  add(root, box(4.3, 1.4, 0.08), C.woodDark, 0, H + 1.54, zc + 0.7).rotation.x = -0.3;
  for (const x of [-1.6, 1.6]) add(root, rbox(0.14, 1.1, 0.14, 0.04), C.woodDark, x, H + 0.8, zc + 0.55);
  root.userData.counter = new THREE.Vector3(wx, 0, front + 1.5);
  bakeColors(root);
  return root;
}

export type SpotKind = "eat" | "drink" | "rest";

/** A wooden chair facing `face` (atan2 convention: 0 = +z): seat just ahead of where the person stands, back behind. */
function chair(color: number, round: boolean, face: number): THREE.Group {
  const g = new THREE.Group();
  add(g, round ? cyl(0.3, 0.3, 0.07, 14) : rbox(0.6, 0.07, 0.6, 0.03), round ? C.woodLight : C.wood, 0, SEAT_Y - 0.035, 0.08);
  add(g, round ? cyl(0.26, 0.26, 0.06, 14) : rbox(0.5, 0.06, 0.5, 0.03), color, 0, SEAT_Y + 0.02, 0.08);
  for (const [x, z] of [[-0.24, -0.16], [0.24, -0.16], [-0.24, 0.32], [0.24, 0.32]]) add(g, cyl(0.035, 0.035, SEAT_Y - 0.07, 6), C.woodDark, x, (SEAT_Y - 0.07) / 2, z);
  const back = add(g, rbox(0.6, 0.62, 0.07, 0.03), C.wood, 0, SEAT_Y + 0.35, -0.26);
  back.rotation.x = -0.12;
  g.rotation.y = face;
  return g;
}

/**
 * One spot of the break area: its furniture, and where its two people go (local x/z) and the way they face.
 * eat: a wooden table with bowls of noodles; drink: a round table with tea; rest: two armchairs and a side table.
 */
export function breakSpotModel(kind: SpotKind): { root: THREE.Group; seats: { x: number; z: number; face: number }[] } {
  const root = new THREE.Group();
  if (kind === "rest") {
    // Two wooden armchairs side by side facing the camera, a side table with a plant between them, on a straw mat.
    const rug = add(root, box(3.1, 0.02, 1.7), 0xd9c08a, 0, 0.012, 0.05);
    rug.castShadow = false;
    for (const x of [-1.2, -0.4, 0.4, 1.2]) add(root, box(0.04, 0.025, 1.68), 0xc4a66a, x, 0.016, 0.05).castShadow = false;
    const seats: { x: number; z: number; face: number }[] = [];
    for (const x of [-1.0, 1.0]) {
      const c = new THREE.Group();
      add(c, rbox(0.9, SEAT_Y - 0.16, 0.74, 0.06), C.wood, 0, (SEAT_Y - 0.16) / 2 + 0.02, 0.04);
      add(c, rbox(0.82, 0.16, 0.68, 0.07), 0x7cc07c, 0, SEAT_Y - 0.08, 0.08);
      const back = add(c, rbox(0.92, 0.85, 0.2, 0.07), C.wood, 0, SEAT_Y + 0.34, -0.3);
      back.rotation.x = -0.1;
      add(c, rbox(0.78, 0.6, 0.1, 0.06), 0x6cb06c, 0, SEAT_Y + 0.36, -0.2).rotation.x = -0.1;
      for (const ax of [-0.52, 0.52]) add(c, rbox(0.16, 0.34, 0.76, 0.05), C.woodDark, ax, SEAT_Y + 0.08, 0.04);
      c.position.x = x;
      root.add(c);
      seats.push({ x, z: 0, face: 0 });
    }
    add(root, cyl(0.28, 0.28, 0.05, 14), C.woodLight, 0, 0.62, -0.1);
    add(root, cyl(0.05, 0.08, 0.6, 8), C.woodDark, 0, 0.3, -0.1);
    add(root, cyl(0.12, 0.09, 0.2, 10), 0xb5603a, 0, 0.75, -0.1);
    add(root, new THREE.SphereGeometry(0.22, 12, 9), 0x4fae3f, 0, 1.0, -0.1);
    bakeColors(root);
    return { root, seats };
  }
  const seats = [
    { x: -1.12, z: 0, face: Math.PI / 2 },
    { x: 1.12, z: 0, face: -Math.PI / 2 },
  ];
  const eat = kind === "eat";
  add(root, eat ? rbox(1.35, 0.08, 0.95, 0.03) : cyl(0.62, 0.62, 0.07, 18), eat ? C.wood : C.woodLight, 0, TABLE_Y - 0.04, 0);
  if (eat) for (const x of [-0.45, 0, 0.45]) add(root, box(0.02, 0.085, 0.94), shade(C.wood, 0.8), x, TABLE_Y - 0.035, 0);
  add(root, cyl(0.08, 0.1, TABLE_Y - 0.08, 8), C.woodDark, 0, (TABLE_Y - 0.08) / 2, 0);
  add(root, cyl(0.38, 0.42, 0.06, 14), C.woodDark, 0, 0.03, 0);
  for (const s of seats) {
    const c = chair(eat ? 0xd8503c : 0x5fae6a, !eat, s.face);
    c.position.set(s.x, 0, s.z);
    root.add(c);
  }
  if (eat) {
    root.add(bowlOn(-0.38, 0.05), bowlOn(0.38, -0.05));
    for (const [x, c] of [[-0.06, 0x7a3a1e], [0.08, 0xd8302c]] as const) add(root, cyl(0.05, 0.055, 0.22, 8), c, x, TABLE_Y + 0.11, -0.3);
  } else {
    for (const [x, z] of [[-0.3, 0.1], [0.3, -0.1]] as const) {
      add(root, cyl(0.08, 0.06, 0.1, 12), 0xf6f2ea, x, TABLE_Y + 0.05, z);
      add(root, cyl(0.07, 0.07, 0.01, 12), 0xb0782a, x, TABLE_Y + 0.095, z);
    }
    const pot = new THREE.SphereGeometry(0.15, 14, 10);
    pot.scale(1, 0.85, 1);
    add(root, pot, 0x4a7ab8, 0, TABLE_Y + 0.13, 0.25);
    add(root, cyl(0.02, 0.03, 0.18, 6), 0x4a7ab8, 0.15, TABLE_Y + 0.16, 0.25).rotation.z = -0.9;
    add(root, new THREE.TorusGeometry(0.07, 0.015, 5, 10, Math.PI), 0x8a5a2b, 0, TABLE_Y + 0.26, 0.25);
  }
  bakeColors(root);
  return { root, seats };
}

/**
 * The delivery pickup (the sales truck): Kenney's flatbed pickup in farm colours (red cab, cream trim), wooden stake
 * sides round the bed and a stack of produce crates behind the cab; cab facing +X (the way it drives in); the load
 * sits on the bed.
 */
export function truckModel(): { root: THREE.Group; bed: THREE.Object3D; wheels: THREE.Object3D[] } {
  const root = new THREE.Group();
  const body = prop("truckflat", 8.6);
  body.rotation.y = Math.PI / 2;
  root.add(body);
  farmLivery(body, "red", true);
  const s = propSize(body);
  const wheels: THREE.Object3D[] = [];
  body.traverse((o) => {
    if (o.name.startsWith("wheel-")) wheels.push(o);
  });
  const deco = new THREE.Group();
  const by = s.y * 0.47;
  const x0 = -s.x * 0.47;
  const x1 = -s.x * 0.02;
  const zw = s.z * 0.44;
  for (const sz of [-1, 1]) {
    for (let i = 0; i <= 4; i++) add(deco, rbox(0.12, 0.85, 0.1, 0.03), C.woodDark, x0 + ((x1 - x0) * i) / 4, by + 0.42, sz * zw);
    for (const y of [0.3, 0.7]) add(deco, rbox(x1 - x0 + 0.1, 0.14, 0.07, 0.03), C.woodLight, (x0 + x1) / 2, by + y, sz * zw);
  }
  for (const y of [0.3, 0.7]) add(deco, rbox(0.07, 0.14, zw * 2, 0.03), C.woodLight, x0, by + y, 0);
  // Produce crates stacked against the cab.
  const crates: [number, number, number, number][] = [[0, -0.42, 0, 0xf0862a], [0, 0.42, 0, 0x7cc24a], [0, 0, 1, 0xe23b30]];
  for (const [dx, dz, lvl, c] of crates) {
    const cx = x1 - 0.5 + dx;
    const cy = by + 0.02 + lvl * 0.5;
    add(deco, box(0.75, 0.45, 0.78), C.woodLight, cx, cy + 0.225, dz);
    add(deco, box(0.77, 0.08, 0.8), shade(C.woodLight, 0.82), cx, cy + 0.32, dz);
    for (let i = 0; i < 4; i++) add(deco, new THREE.SphereGeometry(0.14, 10, 8), c, cx + (i % 2 ? 0.16 : -0.16), cy + 0.5, dz + (i < 2 ? 0.16 : -0.16));
  }
  bakeColors(deco);
  root.add(deco);
  const bedTop = new THREE.Object3D();
  bedTop.position.set(-s.x * 0.24, by, 0);
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

/** A fuel drum. */
export const barrelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.75, 14);
export function barrelMesh(): THREE.Mesh {
  // A red diesel drum (Farm Valley; Mars Miner's was a glowing teal fuel cell).
  const me = new THREE.Mesh(barrelGeo, mat(0xc8432f));
  me.castShadow = true;
  return me;
}
