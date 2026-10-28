import * as THREE from "three";

/**
 * Candy Miner's look (2026-10-28, reskinned from Mars Miner; names and story: docs/CANDY.md): a candy island floating
 * over clouds in a pastel sky. Biscuit ground, a cream deck under the houses, chocolate cliffs, cake layers down the
 * island's sides, gumdrops and lollipops round the quarry. Every world colour that is not a candy block's own lives
 * here, so the theme can be tuned in one place.
 */
export const THEME = {
  /** Fog and the sky behind the island (the background texture is drawn around this colour). */
  sky: 0xf6d6ea,
  fogNear: 80,
  fogFar: 150,
  /** Sky / ground colours of the hemisphere light, and the sun. */
  hemiSky: 0xfff2fb,
  hemiGround: 0x9a6a5a,
  hemiIntensity: 1.35,
  sun: 0xfff4e6,
  sunIntensity: 2.0,
  /** Quarry floor: biscuit with crumbs, and sprinkles. */
  floor: "#e2b07a",
  floorDots: ["#c98f58", "#efc595", "#b97e4a", "#f3d2a8"],
  sprinkles: ["#ff6fa5", "#5fd3b5", "#ffd166", "#8fb8ff", "#c79bff", "#ffffff"],
  /** Base floor: vanilla cream. */
  deck: "#fbecd8",
  deckDots: ["#f3dcc0", "#fff6ea", "#efd2b2"],
  /** The delivery-van road: chocolate. */
  road: 0x9a5c3c,
  /** Cliff pillars and the stage 9 knoll: chocolate. */
  cliff: 0x8a5232,
  knoll: 0x7a4a30,
  /** The island's top round the used area (pink frosting), its cake sides and its chocolate underside. */
  crust: "#f7b6cf",
  crustDots: ["#f59cc0", "#fbd0e0", "#ffffff", "#f28ab4"],
  underside: 0x5a3324,
  /** Barriers: candy canes. Lamps: lollipop pink with a warm glow. */
  barrier: 0xffffff,
  barrierBand: 0xe8395a,
  barrierLeg: 0xe8395a,
  lampPole: 0xfff0f6,
  lampHead: 0xfff1c9,
  lampGlow: 0xffb04a,
  /** Stage 1's yard (the lawn beside the base): mint frosting, with gift boxes and candy jars. */
  apron: 0x9fe3c8,
  containers: [0xff8fb8, 0x8fe0c8, 0xffd98a, 0xb9a4ff, 0xffffff, 0x8fc8ff],
  barrels: [0xff6fa5, 0x5fd3b5, 0xffd166, 0xc79bff],
  /** Gumdrops and lollipops on the frosting round the quarry. */
  gumdrops: [0xff5c8a, 0x4fd1a5, 0xffc93c, 0x9b7bff, 0x5fb8ff, 0xff8a3d],
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

function puff(g: CanvasRenderingContext2D, x: number, y: number, w: number, r: () => number, color: string): void {
  g.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const px = x + (r() - 0.5) * w;
    const py = y + (r() - 0.5) * w * 0.25;
    const rad = w * (0.18 + r() * 0.16);
    g.beginPath();
    g.arc(px, py, rad, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * The sky behind everything, as the scene background (fixed to the screen): a pastel gradient from sky blue to pink,
 * a soft rainbow and fluffy clouds.
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
  sky.addColorStop(0, "#9fd8ff");
  sky.addColorStop(0.45, "#cfe3ff");
  sky.addColorStop(0.8, "#f6d6ea");
  sky.addColorStop(1, "#ffd9e6");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // A soft rainbow, top left.
  const bands = ["#ff8fa3", "#ffbf80", "#fff09a", "#a8f0b0", "#9fd0ff", "#c8a8ff"];
  g.globalAlpha = 0.28;
  g.lineWidth = 22;
  bands.forEach((col, i) => {
    g.strokeStyle = col;
    g.beginPath();
    g.arc(W * 0.18, H * 0.62, W * 0.42 - i * 22, Math.PI * 1.08, Math.PI * 1.62);
    g.stroke();
  });
  g.globalAlpha = 1;
  // Clouds: white puffs with a pink underside.
  for (let i = 0; i < 16; i++) {
    const x = r() * W;
    const y = H * (0.08 + r() * 0.8);
    const w = 90 + r() * 170;
    g.globalAlpha = 0.55 + r() * 0.35;
    puff(g, x, y + w * 0.08, w, rng(i * 31 + 7), "#ffd3e6");
    puff(g, x, y, w, rng(i * 31 + 7), "#ffffff");
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A gap's surface: clouds far below, so a gap reads as a drop off the island, not a pond. */
export function cloudTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const r = rng(77);
  g.fillStyle = "#f3c7dc";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.5 + r() * 0.5;
    // Wrapped so the tile repeats without seams.
    const x = r() * S;
    const y = r() * S;
    const w = 50 + r() * 70;
    for (const [ox, oy] of [[0, 0], [-S, 0], [S, 0], [0, -S], [0, S]]) puff(g, x + ox, y + oy, w, rng(i * 13 + 3), r() < 0.5 ? "#ffffff" : "#ffe6f1");
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The island's sides: layers of cake, sponge and cream with a jam stripe, and frosting dripping over the top edge.
 * Repeats along the side; `v` runs from the bottom (0) to the top (1) of the slab.
 */
export function cakeSideTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const r = rng(5);
  const layers: [number, string][] = [
    [0.0, "#7a4a30"],
    [0.18, "#f2d1a0"],
    [0.36, "#fff6ec"],
    [0.42, "#e8395a"],
    [0.47, "#fff6ec"],
    [0.53, "#e9be86"],
    [0.74, "#fff6ec"],
    [0.8, "#f7b6cf"],
  ];
  layers.forEach(([y0, col], i) => {
    const y1 = i + 1 < layers.length ? layers[i + 1][0] : 1;
    g.fillStyle = col;
    g.fillRect(0, H - y1 * H, W, (y1 - y0) * H + 1);
  });
  // Sponge crumbs.
  for (let i = 0; i < 500; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(150,95,50,0.25)" : "rgba(255,255,255,0.25)";
    g.fillRect(r() * W, H - (0.18 + r() * 0.56) * H, 2, 2);
  }
  // Frosting drips over the top edge.
  g.fillStyle = "#f7b6cf";
  for (let x = 0; x < W; x += 16 + r() * 18) {
    const len = 10 + r() * 34;
    g.beginPath();
    g.roundRect(x, H * 0.2 - 4, 12, len, 6);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** A lollipop's face: a white swirl on a light ground, tinted per lollipop by its instance colour. */
export function lollipopTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, S, S);
  g.strokeStyle = "#d8c8d0";
  g.lineWidth = 9;
  g.beginPath();
  for (let a = 0; a < Math.PI * 7; a += 0.08) {
    const rad = (a / (Math.PI * 7)) * S * 0.5;
    const x = S / 2 + Math.cos(a) * rad;
    const y = S / 2 + Math.sin(a) * rad;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * How much colour the land round the quarry has (Candy Miner's story: Baron Sourpuss's sour spell drained it; every
 * block freed brings some back). 0 = grey, 1 = full colour. Game sets it from the stage's progress toward the clear
 * line; the base and the candy blocks always keep their colours, so the first look is never grey.
 */
export const landColour = { value: 1 };

/** Let a material be drained toward grey by `landColour` (after its texture and instance colours). */
export function sourable<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLandColour = landColour;
    sh.fragmentShader =
      "uniform float uLandColour;\n" +
      sh.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n  diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))) * vec3(0.78, 0.8, 0.72), diffuseColor.rgb, uLandColour);",
      );
  };
  return m;
}
