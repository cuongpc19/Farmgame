import * as THREE from "three";
import type { OreCategory, OreDef } from "../data";
import { freeze } from "../engine/freeze";
import { farmLook, type FarmKind } from "../farm";

/**
 * The price list beside the SELL pad (user, 2026-10-19: "prices matter, write them clearly and
 * with pictures: how much is a common rock, how much a rare one"). It replaced a small upright
 * board whose truncated names read squashed under the 57° camera.
 *
 * A wooden board on two posts, tilted back so it faces the camera almost square on (Farm Valley).
 * One row per tier (FARM / METALS / GEMS, 1–3 stars), and per product a little picture of what is
 * sold (a rice sack, planks, a crate of fruit, a bar, a cut gem; farm.ts kinds) in its colour, the
 * name and the price, large. Only the products of this stage, cheapest first.
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
  { cat: "rock", name: "FARM", stars: 1, tint: "#6fae3e" },
  { cat: "metal", name: "METALS", stars: 2, tint: "#c8743a" },
  { cat: "jewel", name: "GEMS", stars: 3, tint: "#9a5ad8" },
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

  const steel = new THREE.MeshLambertMaterial({ color: 0x6e4a28 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x8a5a2e });
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

  // Planks: warm wood in horizontal boards, a little grain, dark seams.
  g.fillStyle = "#8a5a32";
  g.fillRect(0, 0, c.width, c.height);
  const plank = u(0.42);
  for (let y = 0, i = 0; y < c.height; y += plank, i++) {
    g.fillStyle = i % 2 ? "rgba(255,220,170,0.07)" : "rgba(40,20,8,0.08)";
    g.fillRect(0, y, c.width, plank);
    g.strokeStyle = "rgba(40,20,8,0.16)";
    g.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const gy = y + plank * (0.2 + ((k * 37 + i * 13) % 60) / 100);
      g.beginPath();
      g.moveTo((((k * 97 + i * 31) % 100) / 100) * c.width * 0.5, gy);
      g.bezierCurveTo(c.width * 0.4, gy + 4, c.width * 0.6, gy - 4, c.width * (0.6 + ((k * 13) % 40) / 100), gy);
      g.stroke();
    }
    g.fillStyle = "rgba(30,15,5,0.5)";
    g.fillRect(0, y, c.width, 3);
  }

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
      product(g, farmLook(o.key).kind, cx, u(y + 0.36), u(0.82), farmLook(o.key).product);
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

/** The picture of a product: what the Mill or the Forge makes of this kind (farm.ts), in its colour. */
function product(g: CanvasRenderingContext2D, kind: FarmKind, cx: number, cy: number, w: number, color: number): void {
  const base = new THREE.Color(color);
  const shade = (k: number) => "#" + base.clone().multiplyScalar(k).getHexString();
  g.lineJoin = "round";
  const outline = (lw = Math.max(2, w * 0.03)) => {
    g.strokeStyle = "rgba(20,12,6,0.7)";
    g.lineWidth = lw;
    g.stroke();
  };
  const shadow = (rx: number, y: number) => {
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.ellipse(cx, y, rx, w * 0.06, 0, 0, Math.PI * 2);
    g.fill();
  };
  if (kind === "crop") {
    // A plump rice sack tied at the top, grains printed on it.
    const h = w * 0.62;
    const yb = cy + h / 2;
    shadow(w * 0.3, yb + w * 0.01);
    g.beginPath();
    g.moveTo(cx - w * 0.26, yb);
    g.bezierCurveTo(cx - w * 0.36, yb - h * 0.5, cx - w * 0.24, yb - h * 0.9, cx - w * 0.1, yb - h * 0.88);
    g.lineTo(cx - w * 0.16, yb - h * 1.02);
    g.lineTo(cx + w * 0.16, yb - h * 1.02);
    g.lineTo(cx + w * 0.1, yb - h * 0.88);
    g.bezierCurveTo(cx + w * 0.24, yb - h * 0.9, cx + w * 0.36, yb - h * 0.5, cx + w * 0.26, yb);
    g.closePath();
    const sk = g.createLinearGradient(cx - w * 0.3, 0, cx + w * 0.3, 0);
    sk.addColorStop(0, "#d9bf8c");
    sk.addColorStop(0.45, "#f3e2bc");
    sk.addColorStop(1, "#c4a672");
    g.fillStyle = sk;
    g.fill();
    outline();
    g.fillStyle = "#9a6a3c";
    g.fillRect(cx - w * 0.12, yb - h * 0.9, w * 0.24, w * 0.04);
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.3;
      g.fillStyle = "#e8b84a";
      g.beginPath();
      g.ellipse(cx + Math.sin(a) * w * 0.1, yb - h * 0.42 - Math.cos(a) * w * 0.1, w * 0.035, w * 0.06, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#6fae3e";
    g.beginPath();
    g.ellipse(cx, yb - h * 0.3, w * 0.12, w * 0.035, 0, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "wood") {
    // A bundle of three planks, their ends toward the right, a rope round them.
    const pw = w * 0.62;
    const ph = w * 0.12;
    shadow(pw * 0.6, cy + ph * 1.9);
    for (let i = 0; i < 3; i++) {
      const y = cy + ph * 1.2 - i * ph * 1.02;
      const x = cx - pw / 2 + (i % 2) * w * 0.04 - w * 0.02;
      roundRect(g, x, y - ph / 2, pw, ph, ph * 0.25);
      g.fillStyle = shade(1 - i * 0.04);
      g.fill();
      outline();
      g.strokeStyle = shade(0.75);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x + pw * 0.1, y);
      g.lineTo(x + pw * 0.8, y + ph * 0.1);
      g.stroke();
      g.fillStyle = shade(1.15);
      roundRect(g, x + pw - ph * 0.9, y - ph / 2 + 2, ph * 0.8, ph - 4, ph * 0.2);
      g.fill();
    }
    g.fillStyle = "#7a4a2a";
    g.fillRect(cx - w * 0.04, cy - ph * 1.5, w * 0.06, ph * 3.4);
  } else if (kind === "fruit") {
    // A crate with fruit heaped on it.
    const cw = w * 0.6;
    const ch = w * 0.24;
    const yb = cy + w * 0.24;
    shadow(cw * 0.6, yb + 2);
    const fruit = (fx: number, fy: number, k: number) => {
      g.beginPath();
      g.arc(fx, fy, w * 0.11, 0, Math.PI * 2);
      g.fillStyle = shade(k);
      g.fill();
      outline(1.5);
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.beginPath();
      g.arc(fx - w * 0.035, fy - w * 0.04, w * 0.03, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#4f9a3a";
      g.beginPath();
      g.ellipse(fx + w * 0.03, fy - w * 0.11, w * 0.04, w * 0.018, -0.5, 0, Math.PI * 2);
      g.fill();
    };
    for (let i = 0; i < 4; i++) fruit(cx - cw * 0.36 + i * cw * 0.24, yb - ch - w * 0.05 - (i % 2) * w * 0.03, 1);
    fruit(cx, yb - ch - w * 0.17, 1.05);
    roundRect(g, cx - cw / 2, yb - ch, cw, ch, w * 0.02);
    g.fillStyle = "#c48c52";
    g.fill();
    outline();
    g.fillStyle = "rgba(60,30,10,0.35)";
    g.fillRect(cx - cw / 2 + 2, yb - ch / 2 - 1, cw - 4, 3);
  } else if (kind === "gem") {
    // A cut gem: table on top, crown facets, a pointed pavilion.
    const gw = w * 0.5;
    const yt = cy - w * 0.16;
    const yg = cy - w * 0.04;
    const yp = cy + w * 0.3;
    shadow(gw * 0.5, yp + w * 0.02);
    const path = (a: number[][]) => {
      g.beginPath();
      a.forEach(([x, y], i) => (i ? g.lineTo(cx + x, y) : g.moveTo(cx + x, y)));
      g.closePath();
    };
    const facet = (a: number[][], k: number) => {
      path(a);
      g.fillStyle = shade(k);
      g.fill();
    };
    const outer = [[-gw * 0.28, yt], [gw * 0.28, yt], [gw * 0.5, yg], [0, yp], [-gw * 0.5, yg]];
    facet(outer, 0.85);
    facet([[-gw * 0.28, yt], [gw * 0.28, yt], [gw * 0.16, yg], [-gw * 0.16, yg]], 1.35);
    facet([[gw * 0.28, yt], [gw * 0.5, yg], [gw * 0.16, yg]], 1.05);
    facet([[-gw * 0.28, yt], [-gw * 0.5, yg], [-gw * 0.16, yg]], 1.15);
    facet([[-gw * 0.16, yg], [gw * 0.16, yg], [0, yp]], 1.0);
    facet([[gw * 0.16, yg], [gw * 0.5, yg], [0, yp]], 0.7);
    path(outer);
    outline();
    glint(g, cx + gw * 0.22, yt + w * 0.02, w * 0.12);
  } else if (kind === "chest") {
    // Gold coins in a little heap.
    shadow(w * 0.3, cy + w * 0.22);
    for (const [dx, dy] of [[-0.14, 0.12], [0.14, 0.12], [0, 0.1], [-0.07, 0.0], [0.08, -0.01], [0, -0.1]]) {
      g.beginPath();
      g.ellipse(cx + dx * w, cy + dy * w, w * 0.13, w * 0.07, 0, 0, Math.PI * 2);
      g.fillStyle = shade(1);
      g.fill();
      outline(1.5);
      g.fillStyle = shade(1.3);
      g.beginPath();
      g.ellipse(cx + dx * w, cy + dy * w - 1, w * 0.07, w * 0.035, 0, 0, Math.PI * 2);
      g.fill();
    }
    glint(g, cx + w * 0.1, cy - w * 0.14, w * 0.1);
  } else ingot(g, cx, cy, w, color, false);
}

/** A cast bar seen from the front and a little above, like the ones on the Forge's tray. */
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
