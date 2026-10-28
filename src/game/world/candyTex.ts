import * as THREE from "three";
import { rng } from "../theme";

/**
 * Candy blocks (Candy Miner, 2026-10-28; Mars Miner's were stone with ore veins, `rockTex.ts`): every kind of block is
 * a candy with its own pattern, drawn on a canvas (no image files) and shown on a shiny Phong material, so hard
 * candy and gummies catch the light and sugar or chocolate stay softer. The pattern and colours per ore key are in
 * data.ts (`PALETTE`); names in docs/CANDY.md.
 *
 * The texture is an atlas: its upper half is the block's top face, its lower half the sides (BlockField maps the
 * cube's UVs that way, `candyUVs`), so a block reads as a sweet, not a stone (user 2026-10-28: "still looks like
 * breaking rocks"): sugar cubes are little iced cakes with glaze running down the sides, hard candy shows a peppermint
 * pinwheel on top, licorice a wheel, chocolate a bar of squares, frosted blocks drip icing.
 */
export type CandyPattern = "sugar" | "choco" | "caramel" | "gummy" | "swirl" | "sprinkle" | "honeycomb" | "crystal" | "licorice" | "pearl" | "glow";

export interface CandyLook {
  pattern: CandyPattern;
  base: number;
  /** Second colour of the pattern (stripes, nuts, glow spots…). */
  accent?: number;
}

const css = (c: THREE.Color, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
const SPRINKLES = ["#ff5c8a", "#4fd1a5", "#ffc93c", "#9b7bff", "#5fb8ff", "#ff8a3d", "#ffffff"];

/** How shiny each candy is (Phong shininess). */
const SHINE: Record<CandyPattern, number> = {
  sugar: 40,
  choco: 30,
  caramel: 70,
  gummy: 80,
  swirl: 90,
  sprinkle: 30,
  honeycomb: 55,
  crystal: 100,
  licorice: 70,
  pearl: 90,
  glow: 60,
};

/** Which candies wear icing: a glazed top with drips down the sides (in `drip` colour, or white). */
const ICED: Partial<Record<CandyPattern, "white" | "dark">> = { sugar: "white", sprinkle: "white", caramel: "dark" };

const S = 128;

function sprinkles(g: CanvasRenderingContext2D, r: () => number, n: number, y0 = 0, h = S): void {
  for (let i = 0; i < n; i++) {
    g.save();
    g.translate(r() * S, y0 + r() * h);
    g.rotate(r() * Math.PI);
    g.fillStyle = SPRINKLES[i % SPRINKLES.length];
    g.beginPath();
    g.roundRect(-6, -2, 12, 4, 2);
    g.fill();
    g.restore();
  }
}

/** The candy's own pattern over a S x S square at the origin (the caller translates and clips). */
function pattern(g: CanvasRenderingContext2D, look: CandyLook, r: () => number, top: boolean): void {
  const base = new THREE.Color(look.base);
  const accent = new THREE.Color(look.accent ?? 0xffffff);
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.35);
  const dark = base.clone().multiplyScalar(0.72);
  g.fillStyle = css(base);
  g.fillRect(0, 0, S, S);
  switch (look.pattern) {
    case "sugar": {
      // Top: a smooth glaze with a soft highlight and a few sprinkles. Sides: a layer cake, sponge and a cream filling
      // (sugar crystals, grey specks on a darker side, read as granite once the block wore white or sky blue).
      if (top) {
        const grd = g.createRadialGradient(S * 0.35, S * 0.3, 4, S * 0.5, S * 0.5, S * 0.75);
        grd.addColorStop(0, "rgba(255,255,255,0.6)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, S, S);
        sprinkles(g, r, 6, S * 0.25, S * 0.5);
      } else {
        g.fillStyle = css(base.clone().multiplyScalar(0.86));
        g.fillRect(0, 0, S, S);
        // Crumb: soft lighter dots.
        for (let i = 0; i < 220; i++) {
          g.fillStyle = "rgba(255,255,255,0.3)";
          g.beginPath();
          g.arc(r() * S, r() * S, 1 + r() * 1.8, 0, Math.PI * 2);
          g.fill();
        }
        // The cream filling, a little wavy, with a shadow line under it.
        const y = S * 0.56;
        const band = (dy: number, h: number, fill: string) => {
          g.fillStyle = fill;
          g.beginPath();
          g.moveTo(0, y + dy);
          for (let x = 0; x <= S; x += 8) g.lineTo(x, y + dy + Math.sin(x * 0.09) * 2.5);
          for (let x = S; x >= 0; x -= 8) g.lineTo(x, y + dy + h + Math.sin(x * 0.09 + 1) * 2.5);
          g.closePath();
          g.fill();
        };
        band(4, 6, "rgba(120,60,80,0.18)");
        band(0, S * 0.1, "#ffffff");
      }
      break;
    }
    case "choco": {
      // A chocolate bar: 2 x 2 raised squares (top), a layered bar seen from the side.
      if (top) {
        const n = 2;
        const cell = S / n;
        const inset = 9;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const x = i * cell + inset;
            const y = j * cell + inset;
            const w = cell - inset * 2;
            g.fillStyle = css(dark);
            g.fillRect(x - 3, y - 3, w + 6, w + 6);
            g.fillStyle = css(light.clone().lerp(base, 0.5));
            g.fillRect(x - 3, y - 3, w + 6, 4);
            g.fillRect(x - 3, y - 3, 4, w + 6);
            g.fillStyle = css(base.clone().multiplyScalar(1.05));
            g.fillRect(x, y, w, w);
          }
      } else {
        for (const [y, h, c] of [[0.3, 0.06, light], [0.62, 0.05, dark]] as const) {
          g.fillStyle = css(c, 0.7);
          g.fillRect(0, S * y, S, S * h);
        }
        g.fillStyle = css(dark, 0.6);
        g.fillRect(S / 2 - 2, 0, 4, S);
      }
      break;
    }
    case "caramel": {
      // Glossy caramel / toffee: soft darker swirls, light streaks, nuts when there is an accent.
      for (let i = 0; i < 14; i++) {
        g.strokeStyle = css(r() < 0.5 ? dark : light, 0.35);
        g.lineWidth = 3 + r() * 5;
        g.beginPath();
        g.arc(r() * S, r() * S, 10 + r() * 30, r() * 6, r() * 6 + 1.5 + r() * 2);
        g.stroke();
      }
      if (look.accent !== undefined)
        for (let i = 0; i < 16; i++) {
          g.fillStyle = css(accent, 0.9);
          g.beginPath();
          g.ellipse(r() * S, r() * S, 3 + r() * 4, 2 + r() * 3, r() * 3, 0, Math.PI * 2);
          g.fill();
        }
      break;
    }
    case "gummy": {
      // A gummy: deep colour, a big soft highlight, a dusting of sugar.
      const grd = g.createRadialGradient(S * 0.3, S * 0.3, 2, S * 0.3, S * 0.3, S * 0.75);
      grd.addColorStop(0, css(light, 0.85));
      grd.addColorStop(1, css(dark, 0.6));
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 220; i++) {
        g.fillStyle = "rgba(255,255,255,0.55)";
        g.fillRect(r() * S, r() * S, 1.5, 1.5);
      }
      break;
    }
    case "swirl": {
      if (top) {
        // A peppermint seen from above: a pinwheel of accent wedges from the centre.
        const n = 8;
        g.fillStyle = css(accent);
        for (let k = 0; k < n; k += 2) {
          g.beginPath();
          g.moveTo(S / 2, S / 2);
          for (let a = 0; a <= 1; a += 0.1) {
            const t = ((k + a) / n) * Math.PI * 2 + a * 0.5;
            g.lineTo(S / 2 + Math.cos(t) * S * 0.75, S / 2 + Math.sin(t) * S * 0.75);
          }
          g.closePath();
          g.fill();
        }
        g.fillStyle = css(base);
        g.beginPath();
        g.arc(S / 2, S / 2, 7, 0, Math.PI * 2);
        g.fill();
      } else {
        // Hard candy stripes.
        g.save();
        g.translate(S / 2, S / 2);
        g.rotate(-Math.PI / 4);
        g.fillStyle = css(accent);
        for (let x = -S; x < S; x += 26) g.fillRect(x, -S, 12, S * 2);
        g.restore();
      }
      break;
    }
    case "sprinkle": {
      // Frosting with rainbow sprinkles (sides: fewer, under the drips).
      sprinkles(g, r, top ? 46 : 18);
      break;
    }
    case "honeycomb": {
      // Honeycomb toffee: a hexagon grid, darker walls, lighter cells.
      const R = 13;
      const h = Math.sqrt(3) * R;
      for (let row = -1; row < S / h + 1; row++)
        for (let col = -1; col < S / (R * 1.5) + 1; col++) {
          const cx = col * R * 1.5;
          const cy = row * h + (col & 1 ? h / 2 : 0);
          g.beginPath();
          for (let k = 0; k < 6; k++) g.lineTo(cx + Math.cos((k * Math.PI) / 3) * (R - 2), cy + Math.sin((k * Math.PI) / 3) * (R - 2));
          g.closePath();
          g.fillStyle = css(light, 0.6);
          g.fill();
          g.strokeStyle = css(dark, 0.9);
          g.lineWidth = 2.5;
          g.stroke();
        }
      break;
    }
    case "crystal": {
      // Rock candy / sugar glass: random facets, lighter and darker.
      for (let i = 0; i < 26; i++) {
        const x = r() * S;
        const y = r() * S;
        const rad = 8 + r() * 20;
        g.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + r() * 0.6;
          g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
        }
        g.closePath();
        g.fillStyle = r() < 0.5 ? css(light, 0.5) : css(dark, 0.25);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.6)";
        g.lineWidth = 1;
        g.stroke();
      }
      break;
    }
    case "licorice": {
      if (top) {
        // A licorice allsort seen from above: nested squares of black, white and the accent colour.
        const ring = (inset: number, col: string) => {
          g.fillStyle = col;
          g.beginPath();
          g.roundRect(inset, inset, S - inset * 2, S - inset * 2, 10);
          g.fill();
        };
        ring(18, "#ffffff");
        ring(32, look.accent !== undefined ? css(accent) : "#ffd166");
        ring(52, css(base));
      } else {
        g.strokeStyle = css(light, 0.45);
        g.lineWidth = 3;
        for (let x = -S; x < S * 2; x += 11) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + S * 0.6, S);
          g.stroke();
        }
        if (look.accent !== undefined) {
          g.fillStyle = css(accent);
          g.fillRect(0, S * 0.4, S, S * 0.2);
        }
      }
      break;
    }
    case "pearl": {
      // Sugar pearls: rows of shiny balls.
      for (let y = 10; y < S; y += 22)
        for (let x = 10 + ((y / 22) % 2) * 11; x < S; x += 22) {
          const grd = g.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
          grd.addColorStop(0, "#ffffff");
          grd.addColorStop(0.6, css(base));
          grd.addColorStop(1, css(dark));
          g.fillStyle = grd;
          g.beginPath();
          g.arc(x, y, 9.5, 0, Math.PI * 2);
          g.fill();
        }
      break;
    }
    case "glow": {
      // Glow candy: a dark sweet with bright, soft spots.
      for (let i = 0; i < 9; i++) {
        const x = r() * S;
        const y = r() * S;
        const grd = g.createRadialGradient(x, y, 0, x, y, 9 + r() * 10);
        grd.addColorStop(0, css(accent, 1));
        grd.addColorStop(1, css(accent, 0));
        g.fillStyle = grd;
        g.fillRect(x - 20, y - 20, 40, 40);
      }
      break;
    }
  }
}

/** Icing running down a side from its top edge (y = 0): a band, then rounded drips of different lengths. */
function drips(g: CanvasRenderingContext2D, r: () => number, color: string): void {
  g.fillStyle = color;
  g.fillRect(0, 0, S, 10);
  for (let x = -4; x < S; x += 12 + r() * 10) {
    const w = 9 + r() * 7;
    const len = 14 + r() * 34;
    g.beginPath();
    g.roundRect(x, 0, w, len, w / 2);
    g.fill();
  }
}

export function candyTexture(look: CandyLook, seed: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S * 2;
  const g = c.getContext("2d")!;
  const r = rng(seed * 7919 + 13);
  const base = new THREE.Color(look.base);
  const iced = ICED[look.pattern];
  for (const top of [true, false]) {
    g.save();
    g.translate(0, top ? 0 : S);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    pattern(g, look, r, top);
    if (iced && !top) drips(g, r, iced === "dark" ? css(base.clone().multiplyScalar(0.7)) : "#ffffff");
    if (iced === "white" && top && look.pattern === "sprinkle") {
      // Already frosting all over.
    }
    // The top's rim catches the light; the sides darken a little toward the ground.
    if (top) {
      g.strokeStyle = "rgba(255,255,255,0.45)";
      g.lineWidth = 8;
      g.strokeRect(4, 4, S - 8, S - 8);
    } else {
      const grd = g.createLinearGradient(0, S * 0.45, 0, S);
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(90,30,60,0.14)");
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Give a block geometry atlas UVs for `candyTexture`: faces pointing up take the upper half (seen from above), every
 * other face the lower half, with v from the bottom (0) to the top edge (0.5), so drips hang from the top edge.
 */
export function candyUVs(geo: THREE.BufferGeometry, w: number, h: number, d: number): void {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / w + 0.5;
    const y = pos.getY(i) / h;
    const z = pos.getZ(i) / d + 0.5;
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    if (ny > 0.6) {
      uv[i * 2] = x;
      uv[i * 2 + 1] = 0.5 + (1 - z) * 0.5;
    } else {
      // Along the face: x for the front and back, z for the left and right.
      uv[i * 2] = Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 1 - z : z) : nz > 0 ? x : 1 - x;
      uv[i * 2 + 1] = Math.min(0.5, Math.max(0, y * 0.5)) - 0.002;
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

const mats = new Map<string, THREE.MeshPhongMaterial>();

/** One material per kind of candy block (cached: every chunk of blocks of that kind shares it). */
export function candyMaterial(look: CandyLook, seed: number): THREE.MeshPhongMaterial {
  const key = `${look.pattern}|${look.base}|${look.accent}|${seed}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshPhongMaterial({ map: candyTexture(look, seed), shininess: SHINE[look.pattern], specular: 0x383838 });
    mats.set(key, m);
  }
  return m;
}
