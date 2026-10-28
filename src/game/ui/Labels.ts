import * as THREE from "three";
import type { Stage3D } from "../engine/Stage3D";

/**
 * HTML labels pinned to world points (cargo counters, pad captions, prices, "MAX").
 * DOM text is crisper and cheaper to restyle than canvas sprites, and there are only ever
 * a few dozen of them on screen.
 */
export interface Label {
  el: HTMLDivElement;
  anchor: THREE.Object3D | THREE.Vector3;
  offsetY: number;
  visible: boolean;
  /** Last html / transform / display written: the DOM is touched only when they change. */
  html?: string;
  tf?: string;
  shown?: boolean;
}

export class Labels {
  private list: Label[] = [];
  private root: HTMLDivElement;
  private p = { x: 0, y: 0, visible: false };
  private v = new THREE.Vector3();

  constructor(host: HTMLElement, private stage: Stage3D) {
    this.root = document.createElement("div");
    this.root.className = "labels";
    host.appendChild(this.root);
  }

  add(anchor: THREE.Object3D | THREE.Vector3, cls: string, html = "", offsetY = 0): Label {
    const el = document.createElement("div");
    el.className = `wl ${cls}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    const l: Label = { el, anchor, offsetY, visible: true, html };
    this.list.push(l);
    return l;
  }

  remove(l: Label): void {
    l.el.remove();
    const i = this.list.indexOf(l);
    if (i >= 0) this.list.splice(i, 1);
  }

  /**
   * ⚠ Compared with the last string *written*, never with `el.innerHTML`: reading innerHTML
   * serialises the DOM every frame, and in Vietnamese the DOM holds the translated text, so it
   * never matched and every label was rewritten (and re-translated) 60 times a second.
   */
  set(l: Label, html: string): void {
    if (l.html === html) return;
    l.html = html;
    l.el.innerHTML = html;
  }

  show(l: Label, on: boolean): void {
    l.visible = on;
  }

  update(): void {
    for (const l of this.list) {
      let on = l.visible;
      if (on) {
        if (l.anchor instanceof THREE.Vector3) this.v.copy(l.anchor);
        else l.anchor.getWorldPosition(this.v);
        this.v.y += l.offsetY;
        this.stage.toScreen(this.v, this.p);
        on = this.p.visible;
      }
      if (on !== l.shown) {
        l.shown = on;
        l.el.style.display = on ? "" : "none";
      }
      if (!on) continue;
      const tf = `translate(${this.p.x.toFixed(1)}px, ${this.p.y.toFixed(1)}px) translate(-50%, -50%)`;
      if (tf !== l.tf) {
        l.tf = tf;
        l.el.style.transform = tf;
      }
    }
  }

  /** One-shot floating text that rises and fades (e.g. "+$120"). */
  pop(at: THREE.Vector3, html: string, cls = "pop"): void {
    this.stage.toScreen(at, this.p);
    if (!this.p.visible) return;
    const el = document.createElement("div");
    el.className = `wl ${cls}`;
    el.innerHTML = html;
    el.style.transform = `translate(${this.p.x}px, ${this.p.y}px) translate(-50%, -50%)`;
    this.root.appendChild(el);
    el.animate(
      [
        { transform: `translate(${this.p.x}px, ${this.p.y}px) translate(-50%, -50%) scale(0.6)`, opacity: 0 },
        { transform: `translate(${this.p.x}px, ${this.p.y - 20}px) translate(-50%, -50%) scale(1.1)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${this.p.x}px, ${this.p.y - 70}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
      ],
      { duration: 900, easing: "ease-out" },
    ).onfinish = () => el.remove();
  }
}
