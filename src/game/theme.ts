import * as THREE from "three";

/**
 * Farm Valley's look (2026-10-28, from Candy Miner; names and story: docs/FARM.md): a rice-paddy countryside on a
 * grassy plot by a river. Grass-green fields, warm earth yards and roads, grey rocky hills with moss on top, an
 * earth-and-stone bank down to the water round the plot and in the gaps, a blue sky with soft white clouds. Bright,
 * smooth cartoon, not flat-shaded low-poly. Every world colour that is not a cell's own lives here, so the look can be
 * tuned in one place. All textures are drawn on canvases (no image files).
 */
export const THEME = {
  /** Fog and the haze at the horizon (the backdrop's lower half is drawn in this colour). */
  sky: 0xcfe9f8,
  fogNear: 80,
  fogFar: 150,
  /** Sky / ground colours of the hemisphere light, and the sun. */
  hemiSky: 0xeef7ff,
  hemiGround: 0x7d9a5a,
  hemiIntensity: 1.3,
  sun: 0xfff1d6,
  sunIntensity: 2.05,
  /** The field (the ground under the cells): fresh grass. */
  field: "#8fcb57",
  fieldDots: ["#7dbb48", "#a5d968", "#6aa83d", "#b6e07a"],
  /** The base yard: packed warm earth. */
  yard: "#dcb27a",
  yardDots: ["#c99c63", "#e8c592", "#b98a55", "#efd3a6"],
  /** The delivery road: a darker earth road. */
  road: 0xb88a58,
  roadTex: "#b98c5a",
  roadDots: ["#a57a4a", "#c99f6c", "#8f6a42", "#d6b07c"],
  /** Rocky hills (cliff tiles, the stage 9 knoll): grey stone, moss on top. */
  rock: 0x9a9690,
  rockDark: 0x7d7a75,
  moss: 0x79b04a,
  /** The meadow round the plot, its earth bank and the water. */
  meadow: "#77bd4f",
  meadowDots: ["#66ad42", "#8ccc5e", "#5a9e3a", "#9fd86e"],
  earth: 0x9c6b42,
  water: "#45b3e0",
  /** Fences and lamp posts: warm wood; lanterns glow. */
  wood: 0x9a6a3c,
  woodDark: 0x6e4a28,
  woodLight: 0xc4925a,
  lantern: 0xffe2a0,
  lanternGlow: 0xffa53a,
  /** Bushes, flowers and reeds round the plot. */
  bushes: [0x5fae3f, 0x4f9c38, 0x72bd4a, 0x3f8a33],
  flowers: [0xffffff, 0xffd84a, 0xff7aa8, 0xb48cff, 0xff8a3d, 0x7fc8ff],
};

/** Rng for the drawn backdrop and textures (same look every load). */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft round cloud of overlapping circles. */
function puff(g: CanvasRenderingContext2D, x: number, y: number, w: number, r: () => number, color: string): void {
  g.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    const px = x + (r() - 0.5) * w;
    const py = y + (r() - 0.6) * w * 0.22;
    const rad = w * (0.16 + r() * 0.15);
    g.beginPath();
    g.arc(px, py, rad, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * The sky behind everything, as the scene background (fixed to the screen): a blue gradient fading to the haze of
 * the fog toward the bottom, soft white clouds with a pale blue underside.
 */
export function skyBackdrop(): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const r = rng(2026);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#5fb6f2");
  sky.addColorStop(0.45, "#9fd5f7");
  sky.addColorStop(0.78, "#cfe9f8");
  sky.addColorStop(1, "#e2f2fb");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {
    const x = r() * W;
    const y = H * (0.06 + r() * 0.62);
    const w = 110 + r() * 190;
    g.globalAlpha = 0.6 + r() * 0.35;
    puff(g, x, y + w * 0.07, w, rng(i * 31 + 7), "#d6e9f6");
    puff(g, x, y, w, rng(i * 31 + 7), "#ffffff");
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Draw `fn` at (x, y) and at its wrapped copies, so a texture tiles without seams. */
function wrapped(S: number, x: number, y: number, reach: number, fn: (x: number, y: number) => void): void {
  for (const ox of [-S, 0, S])
    for (const oy of [-S, 0, S]) {
      const px = x + ox;
      const py = y + oy;
      if (px < -reach || px > S + reach || py < -reach || py > S + reach) continue;
      fn(px, py);
    }
}

function canvasTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * Ground that tiles: `base` with big soft patches of its `dots` colours, short strokes (grass blades or grit), and
 * optionally pebbles, grass tufts and little flowers. Everything is soft and a few pixels wide: thin hard lines
 * shimmer as the camera scrolls (CLAUDE.md, floor tiles).
 */
export function groundTexture(
  base: string,
  dots: string[],
  o: { size?: number; seed?: number; blades?: number; pebbles?: number; flowers?: number; tufts?: number } = {},
): THREE.CanvasTexture {
  const S = o.size ?? 256;
  const k = S / 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const r = rng(o.seed ?? 11);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  // Soft patches.
  for (let i = 0; i < 26; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = (30 + r() * 60) * k;
    const col = dots[i % dots.length];
    wrapped(S, x, y, rad, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, col);
      gr.addColorStop(1, col + "00");
      g.globalAlpha = 0.45;
      g.fillStyle = gr;
      g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
  g.globalAlpha = 1;
  // Blades / grit: short soft strokes.
  g.lineCap = "round";
  for (let i = 0; i < (o.blades ?? 900) * k * k; i++) {
    const x = r() * S;
    const y = r() * S;
    const len = (3 + r() * 5) * k;
    const lean = (r() - 0.5) * 0.9;
    g.strokeStyle = dots[Math.floor(r() * dots.length)];
    g.globalAlpha = 0.55 + r() * 0.4;
    g.lineWidth = (1.4 + r() * 1.2) * k;
    wrapped(S, x, y, 10 * k, (px, py) => {
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.sin(lean) * len, py - Math.cos(lean) * len);
      g.stroke();
    });
  }
  g.globalAlpha = 1;
  // Grass tufts (on earth): little fans of green blades.
  for (let i = 0; i < (o.tufts ?? 0) * k * k; i++) {
    const x = r() * S;
    const y = r() * S;
    wrapped(S, x, y, 12 * k, (px, py) => {
      for (let b = 0; b < 5; b++) {
        const a = -0.9 + b * 0.45;
        g.strokeStyle = b % 2 ? "#6fae3e" : "#8cc757";
        g.lineWidth = 2 * k;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.sin(a) * 8 * k, py - Math.cos(a) * 9 * k);
        g.stroke();
      }
    });
  }
  // Pebbles: a shadow, the stone, a highlight.
  for (let i = 0; i < (o.pebbles ?? 0) * k * k; i++) {
    const x = r() * S;
    const y = r() * S;
    const w = (2 + r() * 2.6) * k;
    const h = w * (0.6 + r() * 0.25);
    const tone = 170 + Math.floor(r() * 40);
    wrapped(S, x, y, 10 * k, (px, py) => {
      g.fillStyle = "rgba(70,45,25,0.3)";
      g.beginPath();
      g.ellipse(px + 1 * k, py + 1.2 * k, w, h, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgb(${tone},${tone - 14},${tone - 34})`;
      g.beginPath();
      g.ellipse(px, py, w, h, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.beginPath();
      g.ellipse(px - w * 0.3, py - h * 0.35, w * 0.4, h * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  // Little flowers: five dots round a yellow eye.
  const FL = ["#ffffff", "#ffe066", "#ff9cc2", "#c9a8ff"];
  for (let i = 0; i < (o.flowers ?? 0) * k * k; i++) {
    const x = r() * S;
    const y = r() * S;
    const col = FL[Math.floor(r() * FL.length)];
    const rad = (1.6 + r() * 0.8) * k;
    wrapped(S, x, y, 8 * k, (px, py) => {
      g.fillStyle = col;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(px + Math.cos(a) * rad, py + Math.sin(a) * rad, rad * 0.8, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#f2b630";
      g.beginPath();
      g.arc(px, py, rad * 0.6, 0, Math.PI * 2);
      g.fill();
    });
  }
  return canvasTexture(c);
}

/** Water that tiles: blue with lighter ripple bands and a few white glints (MapView scrolls it slowly). */
export function waterTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const r = rng(77);
  g.fillStyle = THEME.water;
  g.fillRect(0, 0, S, S);
  // Deeper and lighter patches.
  for (let i = 0; i < 14; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 30 + r() * 50;
    const col = r() < 0.5 ? "#2f97c9" : "#6cc8ec";
    wrapped(S, x, y, rad, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, col);
      gr.addColorStop(1, col + "00");
      g.globalAlpha = 0.5;
      g.fillStyle = gr;
      g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
  g.globalAlpha = 1;
  // Ripples: short soft arcs.
  g.lineCap = "round";
  for (let i = 0; i < 70; i++) {
    const x = r() * S;
    const y = r() * S;
    const w = 10 + r() * 22;
    g.strokeStyle = r() < 0.75 ? "rgba(170,228,250,0.75)" : "rgba(255,255,255,0.85)";
    g.lineWidth = 2 + r() * 1.5;
    wrapped(S, x, y, w, (px, py) => {
      g.beginPath();
      g.moveTo(px - w / 2, py);
      g.quadraticCurveTo(px, py - 4, px + w / 2, py);
      g.stroke();
    });
  }
  // Glints.
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 18; i++) {
    const x = r() * S;
    const y = r() * S;
    wrapped(S, x, y, 6, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, 2.6, 1.2, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  return canvasTexture(c);
}

/**
 * The plot's bank down to the river: a grass lip with blades hanging over, warm earth with stones in it, darker
 * wet earth and boulders toward the waterline. Repeats along the side; canvas top = the top of the slab (MapView
 * maps v so the waterline falls at about 0.5 of the canvas).
 */
export function bankTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const r = rng(5);
  const earth = g.createLinearGradient(0, 0, 0, H);
  earth.addColorStop(0, "#a8744a");
  earth.addColorStop(0.3, "#93623c");
  earth.addColorStop(0.5, "#7a5132");
  earth.addColorStop(1, "#4a3424");
  g.fillStyle = earth;
  g.fillRect(0, 0, W, H);
  // Soft strata.
  for (const [y, col] of [[0.17, "rgba(190,140,90,0.45)"], [0.27, "rgba(120,80,48,0.4)"], [0.36, "rgba(180,130,85,0.35)"]] as const) {
    g.fillStyle = col;
    g.fillRect(0, y * H, W, 6);
  }
  // Stones in the earth: grey, rounded, lit from above.
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    const y = H * (0.12 + r() * 0.32);
    const w = 4 + r() * 9;
    const h = w * (0.6 + r() * 0.3);
    const tone = 130 + Math.floor(r() * 60);
    wrapped(W, x, y, 20, (px, py) => {
      g.fillStyle = "rgba(40,25,15,0.35)";
      g.beginPath();
      g.ellipse(px + 1, py + 2, w, h, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgb(${tone},${tone - 4},${tone - 10})`;
      g.beginPath();
      g.ellipse(px, py, w, h, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.3)";
      g.beginPath();
      g.ellipse(px - w * 0.25, py - h * 0.35, w * 0.45, h * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  // Boulders along the waterline.
  for (let x = 0; x < W; x += 14 + r() * 12) {
    const w = 10 + r() * 10;
    const tone = 120 + Math.floor(r() * 40);
    const y = H * (0.44 + r() * 0.06);
    wrapped(W, x, y, 30, (px, py) => {
      g.fillStyle = `rgb(${tone},${tone - 2},${tone - 6})`;
      g.beginPath();
      g.ellipse(px, py, w, w * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.25)";
      g.beginPath();
      g.ellipse(px - w * 0.2, py - w * 0.3, w * 0.5, w * 0.25, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  // The grass lip, with blades hanging over the edge.
  g.fillStyle = THEME.meadow;
  g.fillRect(0, 0, W, H * 0.06);
  g.lineCap = "round";
  for (let x = 0; x < W; x += 3) {
    const len = 5 + r() * 14;
    g.strokeStyle = r() < 0.5 ? "#6aae44" : "#86c95a";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, H * 0.05);
    g.lineTo(x + (r() - 0.5) * 4, H * 0.05 + len);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

