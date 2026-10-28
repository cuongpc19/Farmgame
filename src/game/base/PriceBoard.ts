import * as THREE from "three";
import type { OreCategory, OreDef } from "../data";
import { freeze } from "../engine/freeze";

/**
 * The price list beside the SELL pad (user, 2026-10-19: "prices matter, write them clearly and
 * with pictures: how much is a common rock, how much a rare one"). It replaced a small upright
 * board whose truncated names read squashed under the 57° camera.
 *
 * A display stand tilted back so the board faces the camera almost square on. One row per
 * tier (COMMON / METAL / RARE, 1–3 stars), and per ore an ingot drawn in its own colour, the
 * name and the price, large. Only the ores of this stage, cheapest first.
 */

/** Board layout, in world units (the canvas paints at PX pixels per unit). */
const PX = 170;
const PAD = 0.16;
const HEAD = 0.66;
const ROW = 1.36;
const GAP = 0.08;
const LABEL = 1.3;
const CELLW = 1.26;
/** Tilt back from upright: the camera pitch is 57°, so 40° leaves the board ~17° off square. */
const TILT = THREE.MathUtils.degToRad(40);
const LIFT = 0.42;

const TIERS: { cat: OreCategory; name: string; stars: number; tint: string }[] = [
  { cat: "rock", name: "SOFT", stars: 1, tint: "#ff8fb8" },
  { cat: "metal", name: "HARD", stars: 2, tint: "#d07a3c" },
  { cat: "jewel", name: "GEM", stars: 3, tint: "#a463f0" },
];

export interface Footprint {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Builds the stand with its right edge at `right` and its front (low) edge at `front`.
 * Returns its ground footprint, for the caller's solids.
 */
export function priceBoard(scene: THREE.Scene, right: number, front: number, ores: OreDef[]): Footprint {
  const rows = TIERS.map((t) => ({
    ...t,
    ores: ores.filter((o) => o.category === t.cat && o.ingotPrice > 0).sort((a, b) => a.ingotPrice - b.ingotPrice),
  })).filter((r) => r.ores.length > 0);
  const cols = Math.max(1, ...rows.map((r) => r.ores.length));
  const W = PAD * 2 + LABEL + cols * CELLW;
  const H = PAD * 2 + HEAD + rows.length * ROW + (rows.length - 1) * GAP;

  const tex = new THREE.CanvasTexture(paint(rows, W, H));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8; // three clamps to what the GPU allows; keeps the tilted text crisp
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H).translate(0, H / 2, 0.06), new THREE.MeshBasicMaterial({ map: tex }));

  const steel = new THREE.MeshLambertMaterial({ color: 0x3b4048 });
  const trim = new THREE.MeshLambertMaterial({ color: 0xf2b632 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.24, H + 0.24, 0.1).translate(0, H / 2, 0), trim);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, H + 0.1, 0.06).translate(0, H / 2, -0.07), steel);
  frame.castShadow = true;

  const tilt = new THREE.Group();
  tilt.position.y = LIFT;
  tilt.rotation.x = -TILT;
  tilt.add(back, frame, face);

  const g = new THREE.Group();
  g.add(tilt);
  // Two legs under the high back edge, two feet under the front.
  const up = Math.cos(TILT);
  const deep = Math.sin(TILT);
  const t = H * 0.72;
  const legH = LIFT + t * up;
  const legZ = -t * deep - 0.12;
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.55);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, legH, 0.16), steel);
    leg.position.set(x, legH / 2, legZ);
    leg.castShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, LIFT + 0.05, 0.3), steel);
    foot.position.set(x, (LIFT + 0.05) / 2, 0.02);
    g.add(leg, foot);
  }

  g.position.set(right - W / 2, 0, front);
  scene.add(g);
  freeze(g);
  return { x0: right - W - 0.1, x1: right + 0.1, z0: front - H * deep - 0.25, z1: front + 0.12 };
}

type Row = (typeof TIERS)[number] & { ores: OreDef[] };

function paint(rows: Row[], W: number, H: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(W * PX);
  c.height = Math.round(H * PX);
  const g = c.getContext("2d")!;
  const u = (v: number) => v * PX;
  const font = (em: number) => `${Math.round(u(em))}px "Lilita One", system-ui, sans-serif`;

  const bg = g.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, "#6b3f2a");
  bg.addColorStop(1, "#45261a");
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);

  // Title.
  g.textAlign = "center";
  g.textBaseline = "middle";
  const ty = u(PAD + HEAD * 0.5);
  outlined(g, "PRICE LIST", c.width / 2, ty, font(0.44), "#ffd84a", u(0.07));

  let y = PAD + HEAD;
  for (const r of rows) {
    // Tier band: tinted, with the tier name and its stars on the left.
    roundRect(g, u(PAD), u(y), u(W - PAD * 2), u(ROW), u(0.14));
    g.fillStyle = hexA(r.tint, 0.22);
    g.fill();
    roundRect(g, u(PAD), u(y), u(LABEL - 0.08), u(ROW), u(0.14));
    g.fillStyle = r.tint;
    g.fill();
    const lx = u(PAD + (LABEL - 0.08) / 2);
    outlined(g, r.name, lx, u(y + ROW * 0.4), fit(g, r.name, font(0.3), u(LABEL - 0.26)), "#ffffff", u(0.05));
    for (let i = 0; i < r.stars; i++) star(g, lx + u((i - (r.stars - 1) / 2) * 0.27), u(y + ROW * 0.72), u(0.12));

    r.ores.forEach((o, i) => {
      const cx = u(PAD + LABEL + CELLW * (i + 0.5));
      ingot(g, cx, u(y + 0.36), u(0.82), o.ingot, r.cat === "jewel");
      g.fillStyle = "#e9eef4";
      g.font = fit(g, o.name, font(0.21), u(CELLW - 0.12));
      g.fillText(o.name, cx, u(y + 0.75));
      outlined(g, `$${o.ingotPrice}`, cx, u(y + 1.08), fit(g, `$${o.ingotPrice}`, font(0.44), u(CELLW - 0.1)), "#ffd84a", u(0.07));
    });
    y += ROW + GAP;
  }
  return c;
}

/** Text with a dark outline (reads on any band colour). */
function outlined(g: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, fill: string, w: number): void {
  g.font = font;
  g.lineJoin = "round";
  g.lineWidth = w;
  g.strokeStyle = "rgba(10,14,20,0.85)";
  g.strokeText(s, x, y);
  g.fillStyle = fill;
  g.fillText(s, x, y);
}

/** `font` shrunk until `s` fits in `max` pixels. */
function fit(g: CanvasRenderingContext2D, s: string, font: string, max: number): string {
  g.font = font;
  const w = g.measureText(s).width;
  if (w <= max) return font;
  const px = parseFloat(font);
  return font.replace(/^\d+px/, `${Math.floor((px * max) / w)}px`);
}

/** A cast ingot seen from the front and a little above, like the ones on the furnace tray. */
function ingot(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, color: number, sparkle: boolean): void {
  const base = new THREE.Color(color);
  const shade = (k: number) => `#${base.clone().multiplyScalar(k).getHexString()}`;
  const h = w * 0.3; // front face height
  const d = w * 0.2; // top face depth on screen
  const bot = w / 2;
  const top = w * 0.38;
  const back = w * 0.3;
  const yb = cy + (h + d) / 2;
  const yt = yb - h;
  const yk = yt - d;

  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.ellipse(cx, yb + w * 0.03, bot * 1.05, w * 0.07, 0, 0, Math.PI * 2);
  g.fill();

  // Top face, then the front face, then the chamfer catching the light.
  g.beginPath();
  g.moveTo(cx - top, yt);
  g.lineTo(cx + top, yt);
  g.lineTo(cx + back, yk);
  g.lineTo(cx - back, yk);
  g.closePath();
  g.fillStyle = shade(1.3);
  g.fill();
  g.beginPath();
  g.moveTo(cx - bot, yb);
  g.lineTo(cx + bot, yb);
  g.lineTo(cx + top, yt);
  g.lineTo(cx - top, yt);
  g.closePath();
  const fr = g.createLinearGradient(0, yt, 0, yb);
  fr.addColorStop(0, shade(1.08));
  fr.addColorStop(1, shade(0.72));
  g.fillStyle = fr;
  g.fill();
  g.strokeStyle = shade(1.75);
  g.lineWidth = Math.max(2, w * 0.035);
  g.beginPath();
  g.moveTo(cx - top, yt);
  g.lineTo(cx + top, yt);
  g.stroke();
  g.strokeStyle = "rgba(10,14,20,0.6)";
  g.lineWidth = Math.max(2, w * 0.025);
  g.beginPath();
  g.moveTo(cx - bot, yb);
  g.lineTo(cx + bot, yb);
  g.lineTo(cx + top, yt);
  g.lineTo(cx + back, yk);
  g.lineTo(cx - back, yk);
  g.lineTo(cx - top, yt);
  g.closePath();
  g.stroke();
  if (sparkle) glint(g, cx + top * 0.85, yk + d * 0.2, w * 0.17);
}

function glint(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? r : r * 0.45;
    g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  g.closePath();
  g.fillStyle = "#ffd84a";
  g.fill();
  g.lineWidth = r * 0.22;
  g.strokeStyle = "rgba(10,14,20,0.7)";
  g.stroke();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
