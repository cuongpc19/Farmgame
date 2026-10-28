import * as THREE from "three";

/** Cartoon dust puff: a soft disc, lighter toward the top-left, with a feathered edge. */
function puffTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(25, 23, 3, 32, 32, 31);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.5, "rgba(236,236,236,0.95)");
  grd.addColorStop(0.82, "rgba(200,200,200,0.55)");
  grd.addColorStop(1, "rgba(190,190,190,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(32, 32, 31, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Impact star / glint: four sharp rays over a soft glow. */
function starTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(0.3, "rgba(255,255,255,0.35)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#fff";
  for (let k = 0; k < 4; k++) {
    g.save();
    g.translate(32, 32);
    g.rotate((k * Math.PI) / 2);
    g.beginPath();
    g.moveTo(0, -31);
    g.lineTo(3.5, -4);
    g.lineTo(-3.5, -4);
    g.closePath();
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Kind = "puff" | "flash" | "glint" | "twinkle";

interface Bit {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  kind: Kind;
  vel: THREE.Vector3;
  life: number;
  max: number;
  s0: number;
  s1: number;
  a0: number;
  spin: number;
}

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
  r0: number;
  r1: number;
}

/**
 * Pooled, camera-facing effects for hits and breaks (reference: every block break blooms
 * into a soft dust cloud with a pop of light, and ore veins glint as they scatter):
 * - puff:  soft dust balls that swell, drift up and fade;
 * - flash: a short white star where the pick lands / the block bursts;
 * - glint: small twinkling stars in the ore colour;
 * - ring:  a flat shock ring on the ground.
 * Transparent, no depth write, no shadows; old bits are recycled when a pool is full.
 */
export class Fx {
  private bits: Bit[] = [];
  private rings: Ring[] = [];
  private nextBit = 0;
  private nextRing = 0;
  private puffTex = puffTexture();
  private starTex = starTexture();
  private col = new THREE.Color();

  constructor(
    private scene: THREE.Scene,
    private cap = 90,
    private ringCap = 8,
  ) {}

  /** `n` dust puffs around `at` (spread = radius), swelling from `size` to ~2.4× `size`. */
  puff(at: THREE.Vector3, color: number, n: number, size: number, spread: number, rise = 1): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = spread * (0.35 + Math.random() * 0.65);
      const b = this.bit("puff", this.puffTex);
      b.sprite.position.set(at.x + Math.cos(a) * r * 0.5, at.y + Math.random() * spread * 0.4, at.z + Math.sin(a) * r * 0.5);
      b.vel.set(Math.cos(a) * r * 2.2, (0.9 + Math.random() * 1.3) * rise, Math.sin(a) * r * 2.2);
      b.max = b.life = 0.6 + Math.random() * 0.4;
      b.s0 = size * (0.7 + Math.random() * 0.5);
      b.s1 = b.s0 * (2.2 + Math.random() * 0.9);
      b.a0 = 0.92;
      b.spin = (Math.random() - 0.5) * 2;
      // Dusty: the rock colour washed toward white, each puff a little different.
      b.mat.color.setHex(color).lerp(this.col.setHex(0xfff1dc), 0.3 + Math.random() * 0.2);
    }
  }

  /** A short star of light at `at`. */
  flash(at: THREE.Vector3, size: number, color = 0xffffff): void {
    const b = this.bit("flash", this.starTex);
    b.sprite.position.copy(at);
    b.vel.set(0, 0, 0);
    b.max = b.life = 0.16;
    b.s0 = size * 0.4;
    b.s1 = size;
    b.a0 = 1;
    b.spin = 0;
    b.mat.rotation = Math.random() * Math.PI;
    b.mat.color.setHex(color);
  }

  /** A star that swells and shrinks in place (shine on polished things). */
  twinkle(at: THREE.Vector3, size: number, color = 0xffffff): void {
    const b = this.bit("twinkle", this.starTex);
    b.sprite.position.copy(at);
    b.vel.set(0, 0, 0);
    b.max = b.life = 0.5;
    b.s0 = b.s1 = size;
    b.a0 = 1;
    b.spin = 1.5;
    b.mat.color.setHex(color);
  }

  /** `n` twinkling stars in `color` thrown out of `at`. */
  glint(at: THREE.Vector3, color: number, n: number, size: number): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const b = this.bit("glint", this.starTex);
      b.sprite.position.copy(at);
      const sp = 2 + Math.random() * 2.5;
      b.vel.set(Math.cos(a) * sp, 5 + Math.random() * 3, Math.sin(a) * sp);
      b.max = b.life = 0.55 + Math.random() * 0.3;
      b.s0 = b.s1 = size * (0.7 + Math.random() * 0.6);
      b.a0 = 1;
      b.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5);
      // Lighter than the ore so it reads as a sparkle, not a chip.
      b.mat.color.setHex(color).lerp(this.col.setHex(0xffffff), 0.45);
    }
  }

  /** Flat shock ring on the ground growing from r0 to r1. */
  ring(at: THREE.Vector3, r0: number, r1: number, color = 0xfff3d6): void {
    let r = this.rings.length < this.ringCap ? null : this.rings[this.nextRing];
    if (!r) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 40), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      r = { mesh, mat, life: 0, max: 1, r0: 1, r1: 1 };
      this.rings.push(r);
    } else this.nextRing = (this.nextRing + 1) % this.ringCap;
    r.mat.color.setHex(color);
    r.mesh.position.set(at.x, 0.08, at.z);
    r.mesh.visible = true;
    r.max = r.life = 0.38;
    r.r0 = r0;
    r.r1 = r1;
  }

  private bit(kind: Kind, tex: THREE.Texture): Bit {
    let b: Bit;
    if (this.bits.length < this.cap) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      sprite.renderOrder = 3;
      this.scene.add(sprite);
      b = { sprite, mat, kind, vel: new THREE.Vector3(), life: 0, max: 1, s0: 1, s1: 1, a0: 1, spin: 0 };
      this.bits.push(b);
    } else {
      b = this.bits[this.nextBit];
      this.nextBit = (this.nextBit + 1) % this.cap;
    }
    b.kind = kind;
    if (b.mat.map !== tex) {
      b.mat.map = tex;
      b.mat.needsUpdate = true;
    }
    // Light flashes add up; dust is plain alpha.
    const blend = kind === "puff" ? THREE.NormalBlending : THREE.AdditiveBlending;
    if (b.mat.blending !== blend) {
      b.mat.blending = blend;
      b.mat.needsUpdate = true;
    }
    b.mat.rotation = 0;
    b.sprite.visible = true;
    return b;
  }

  update(dt: number): void {
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.sprite.visible = false;
        continue;
      }
      const t = 1 - b.life / b.max;
      if (b.kind === "puff") {
        // Fast swell that eases out, drifting up and slowing down.
        const e = 1 - (1 - t) * (1 - t) * (1 - t);
        b.sprite.scale.setScalar(b.s0 + (b.s1 - b.s0) * e);
        b.vel.multiplyScalar(Math.max(0, 1 - dt * 3.2));
        b.mat.opacity = b.a0 * (t < 0.15 ? t / 0.15 : Math.pow(1 - (t - 0.15) / 0.85, 1.6));
        b.mat.rotation += b.spin * dt;
      } else if (b.kind === "twinkle") {
        const e = Math.sin(t * Math.PI);
        b.sprite.scale.setScalar(b.s0 * e);
        b.mat.opacity = b.a0 * e;
        b.mat.rotation += b.spin * dt;
      } else if (b.kind === "flash") {
        const e = Math.min(1, t * 3);
        b.sprite.scale.setScalar(b.s0 + (b.s1 - b.s0) * e);
        b.mat.opacity = b.a0 * (1 - t);
      } else {
        b.vel.y -= 16 * dt;
        b.sprite.scale.setScalar(b.s0 * (0.6 + 0.4 * Math.abs(Math.sin(t * 14))));
        b.mat.opacity = b.a0 * Math.min(1, (1 - t) * 3);
        b.mat.rotation += b.spin * dt;
      }
      b.sprite.position.addScaledVector(b.vel, dt);
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const t = 1 - r.life / r.max;
      const e = 1 - (1 - t) * (1 - t);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      r.mat.opacity = 0.7 * (1 - t);
    }
  }
}
