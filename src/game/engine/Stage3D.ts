import * as THREE from "three";
import { getSetting, onSettingsChange } from "../settings";
import { THEME, skyBackdrop } from "../theme";

/**
 * Renderer, scene, lights and the follow camera.
 *
 * The camera is a fixed-angle 3/4 top-down rig (like the reference game): it never rotates,
 * it only slides to keep the player in frame. Portrait screens get a taller view (more
 * quarry ahead of the player), landscape screens a wider one, at the same pitch.
 */
export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;

  /** World point the camera looks at (smoothed toward `target`). */
  private focus = new THREE.Vector3();
  private target = new THREE.Vector3();
  /** Distance from focus to camera; animated for unlock zoom-outs. */
  private dist = 40;
  private distTarget = 40;
  /** World units that must fit across a portrait screen / down a landscape one. */
  private viewSpan = 13.5;
  private zoomMul = 1;
  private shakeT = 0;
  private shakeAmp = 0;
  private readonly pitch = THREE.MathUtils.degToRad(57);
  private readonly yaw = THREE.MathUtils.degToRad(0);

  /** `?gfx=low` (headless test runs): no shadows, DPR 0.6 — wins over the Settings switch. */
  private readonly low = new URLSearchParams(location.search).get("gfx") === "low";
  /** `?gfx=high` (headless look shots, `--hq`): full quality whatever the Settings switch says. */
  private readonly high = new URLSearchParams(location.search).get("gfx") === "high";
  /** Fixed when the WebGL context is created; a change only applies after a reload. */
  private readonly antialias: boolean;
  private static current: Stage3D | null = null;

  constructor(private host: HTMLElement) {
    Stage3D.current = this;
    this.antialias = this.wantAntialias();
    this.renderer = new THREE.WebGLRenderer({ antialias: this.antialias, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    // A pastel sky behind the candy island (Candy Miner); the fog fades the far frosting into its colour.
    this.scene.background = skyBackdrop();
    this.scene.fog = new THREE.Fog(THEME.sky, THEME.fogNear, THEME.fogFar);

    // Far plane at the fog's end: anything beyond it is fully fogged anyway, so it is not drawn.
    // Near plane 3, not 1: the camera never comes closer than that, and depth precision is set
    // mostly by the near plane (thin layers like the floor tiles z-fought at 1).
    this.camera = new THREE.PerspectiveCamera(40, 1, 3, 150);

    const hemi = new THREE.HemisphereLight(THEME.hemiSky, THEME.hemiGround, THEME.hemiIntensity);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(THEME.sun, THEME.sunIntensity);
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = this.sun.shadow.camera;
    s.left = -32; s.right = 32; s.top = 32; s.bottom = -32; s.near = 1; s.far = 120;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.applyShadows();

    window.addEventListener("resize", () => this.resize());
    this.resize();
    // Perf. Mode applies live (resolution + shadows); only antialias waits for a reload.
    onSettingsChange((k) => {
      if (k === "perfMode") this.applyQuality();
    });
  }

  /** True when the current settings want something only a reload can apply (antialias). */
  static restartPending(): boolean {
    const s = Stage3D.current;
    return !!s && s.antialias !== s.wantAntialias();
  }

  private perf(): boolean {
    return this.low || (!this.high && getSetting("perfMode"));
  }

  private pixelRatio(): number {
    const dev = window.devicePixelRatio || 1;
    if (this.low) return 0.6;
    return this.perf() ? Math.min(dev, 1) : Math.min(dev, 2);
  }

  /** Antialias only pays off on low-DPR screens; high-DPR phones are sharp enough without it. */
  private wantAntialias(): boolean {
    return !this.perf() && this.pixelRatio() < 1.5;
  }

  private applyQuality(): void {
    const dpr = this.pixelRatio();
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr); // also resizes the buffer
    this.applyShadows();
  }

  private applyShadows(): void {
    const on = !this.perf();
    const changed = this.renderer.shadowMap.enabled !== on || this.sun.castShadow !== on;
    this.renderer.shadowMap.enabled = on;
    // Toggling the light's castShadow changes the lights hash, so every lit material gets a new
    // program next frame — including ones not in the scene right now (pooled props).
    this.sun.castShadow = on;
    if (!changed) return;
    if (!on && this.sun.shadow.map) {
      this.sun.shadow.map.dispose(); // free the 1024² depth target; rebuilt when shadows return
      this.sun.shadow.map = null;
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
  }

  /** Canvas size in CSS px, cached on resize (see toScreen). */
  private viewW = 1;
  private viewH = 1;
  private projected = new THREE.Vector3();

  resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait needs a wider vertical FOV so the sides of the quarry stay visible.
    this.camera.fov = w < h ? 46 : 34;
    this.camera.updateProjectionMatrix();
    this.distTarget = this.baseDist();
  }

  /** Camera distance that fits `viewSpan` across (portrait) or down (landscape) the screen. */
  private baseDist(): number {
    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const half = this.camera.aspect < 1 ? Math.atan(Math.tan(vf / 2) * this.camera.aspect) : vf / 2;
    // Landscape (CrazyGames desktop frame) shows more of the quarry vertically.
    const span = this.camera.aspect < 1 ? this.viewSpan : this.viewSpan * 1.45;
    return (span / 2 / Math.tan(half)) * this.zoomMul;
  }

  /** Where the camera should look; the rig eases toward it every frame. */
  follow(p: THREE.Vector3, snap = false): void {
    this.target.copy(p);
    if (snap) {
      this.focus.copy(p);
      this.dist = this.distTarget;
    }
  }

  /** Scale the view (1 = normal; >1 pulls back, e.g. when driving a vehicle). */
  zoom(mul: number): void {
    this.zoomMul = mul;
    this.distTarget = this.baseDist();
  }

  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = 0.18;
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 6);
    this.focus.lerp(this.target, k);
    this.dist += (this.distTarget - this.dist) * (1 - Math.exp(-dt * 3));

    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.dist);
    this.camera.position.copy(this.focus).add(off);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT / 0.18);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    } else this.shakeAmp = 0;
    this.camera.lookAt(this.focus);

    // Keep the shadow frustum centred on the player so a small shadow map stays sharp.
    this.sun.position.set(this.focus.x + 16, this.focus.y + 40, this.focus.z + 12);
    this.sun.target.position.copy(this.focus);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Project a world point to CSS pixels (for HUD labels above objects). */
  /**
   * ⚠ Uses the size cached on resize, never `canvas.clientWidth`: Labels writes each label's
   * transform and then projects the next one, so reading layout here forced a full layout per
   * label per frame (~7% of a frame on a weak machine). One reused vector, no allocation.
   */
  toScreen(p: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void {
    const v = this.projected.copy(p).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.viewW;
    out.y = (-v.y * 0.5 + 0.5) * this.viewH;
    out.visible = v.z < 1 && v.z > -1;
  }
}
