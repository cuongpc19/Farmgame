import * as THREE from "three";
import { EQUIP, CELL, type EquipDef } from "../data";
import { bakeColors, mat, makeVehicleModel } from "../models";
import { C, add, boards, rbox, woodSign } from "../world/farmHouses";
import { haybaleGeometry, tintedInstances, tintedMaterial } from "../world/farmScenery";
import { gearModel } from "../characters";
import { floorText } from "../world/props";
import { Zone } from "./Zone";
import { S, equipPrice, stageNumber } from "../state";
import { fmt } from "../ui/Hud";
import type { Stage3D } from "../engine/Stage3D";
import { events } from "../systems/Events";

/** Wide plank flooring (the barn's floor): boards along x with soft seams, grain and nail heads; repeats. */
function plankTexture(rx: number, ry: number): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const tones = ["#b07a46", "#a8713f", "#bb8550", "#a06a3a"];
  const n = 6;
  const h = S / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = tones[i % tones.length];
    g.fillRect(0, i * h, S, h);
    g.strokeStyle = "rgba(70,40,15,0.22)";
    g.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const y = i * h + h * (0.25 + k * 0.25);
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(S * 0.3, y + 3, S * 0.6, y - 3, S, y);
      g.stroke();
    }
    g.fillStyle = "rgba(50,28,10,0.5)";
    g.fillRect(0, i * h, S, 3);
    // A board joint, staggered, with nails.
    const jx = ((i * 97) % 5) * (S / 5) + S / 10;
    g.fillRect(jx, i * h, 3, h);
    g.fillStyle = "rgba(40,30,20,0.7)";
    for (const dx of [-6, 8]) for (const dy of [0.3, 0.7]) g.fillRect(jx + dx, i * h + h * dy, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}

/** Where the interior is built: far from the map so it never shows from the quarry. */
export const SHOP_ORIGIN = new THREE.Vector3(400, 0, 400);

interface Slot {
  key: string;
  def: EquipDef;
  plate: Zone;
  display: THREE.Group;
  crate: THREE.Group;
  pos: THREE.Vector3;
}

/** Back row: the stage 1-2 machines. Middle row: stage 3+ machines, in unlock order. */
const HEAVY = ["wheelbarrow", "hydraulicBreaker", "wheelLoader", "rollerCrusher", "dumpTruck", "allTerrainVehicle"];
const HEAVY_LATE = ["drillCrusher", "haulTruck", "fuelTruck", "crushHammer", "wheelCrusher", "infernoBreaker"];
/** Front counters, in unlock order. */
const LIGHT = ["sledgehammer", "jackhammer", "cargoPack", "largeHandDrill", "exoCarrier", "knuckleDriller"];
/** Spacing of the slots along a row. */
const STEP = 4.6;

/** A light tool laid on its counter (top 1.0), or a back carrier standing on it, three-quarter on. */
function lightDisplay(key: string): THREE.Group {
  const { g, kind } = gearModel(key);
  const holder = new THREE.Group();
  holder.add(g);
  if (kind === "back") {
    holder.scale.setScalar(1.45);
    holder.rotation.y = Math.PI * 0.8;
  } else {
    // Length along X; drills top side up, hammers / picks with the head lying flat.
    const m = new THREE.Matrix4();
    if (kind === "drill") m.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
    else m.makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1));
    g.quaternion.setFromRotationMatrix(m);
    holder.scale.setScalar(1.55);
  }
  // Centred on the counter, resting on its top.
  holder.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(holder);
  const c = bb.getCenter(new THREE.Vector3());
  holder.position.set(-c.x, 1.0 - bb.min.y, -c.z);
  return holder;
}

/**
 * The Farm Shop's interior (the reference's Machinery Center): a barn hall (Farm Valley) with a plank
 * floor, red board walls with white trim, a big painted FARM SHOP sign, hay bales and lanterns. Back row = stage 1-2 heavy equipment for rent (this stage), middle row = the
 * stage 3+ machines, front counters = light equipment for sale (yours forever). Standing on an
 * item's floor plate pops its card (name, subtitle, stars, flavour, price / lock / SOLD OUT);
 * tap the price to buy. Locked items sit in padlocked FRAGILE crates stencilled with the stage
 * that opens them. The ENTER pad inside the door leads back out.
 */
export class ShopInterior {
  readonly root = new THREE.Group();
  readonly exit: Zone;
  readonly entry = new THREE.Vector3();
  /** World position of the ATM (FREE CASH offer from stage 2). */
  readonly atmPos = new THREE.Vector3();
  readonly bounds: { x0: number; x1: number; z0: number; z1: number };
  readonly solids: { x0: number; x1: number; z0: number; z1: number }[] = [];
  private slots: Slot[] = [];
  private card: HTMLDivElement;
  private active: Slot | null = null;
  onBuy: ((key: string) => void) | null = null;
  onRent: ((key: string) => void) | null = null;

  constructor(scene: THREE.Scene, uiRoot: HTMLElement, private stage: Stage3D) {
    const o = SHOP_ORIGIN;
    this.root.position.copy(o);
    scene.add(this.root);
    // Three rows from the back wall: stage 1-2 machines, stage 3+ machines, light-tool counters.
    const W = 30;
    const D = 28;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), new THREE.MeshLambertMaterial({ map: plankTexture(W / 4, D / 4) }));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    // The barn's walls (baked): red boards with white trim, a hayloft beam, bales and lanterns.
    const hall = new THREE.Group();
    add(hall, new THREE.BoxGeometry(W, 6, 0.5), C.barnRed, 0, 3, -D / 2);
    boards(hall, -W / 2, W / 2, 0, 6, -D / 2 + 0.25, C.barnRed, { size: 0.5, t: 0.06, seed: 3 });
    for (const sx of [-1, 1]) {
      add(hall, new THREE.BoxGeometry(0.5, 3, D), C.barnRed, (sx * W) / 2, 1.5, 0);
      boards(hall, -D / 2, D / 2, 0, 3, 0, C.barnRed, { size: 0.5, t: 0.05, seed: 5 });
      const side = hall.children.slice(-Math.round(D / 0.5));
      for (const b of side) {
        b.position.set((sx * W) / 2 - sx * 0.28, b.position.y, b.position.x);
        b.rotation.y = Math.PI / 2;
      }
      add(hall, rbox(0.3, 3.1, 0.3, 0.06), C.trim, (sx * W) / 2 - sx * 0.1, 1.55, -D / 2 + 0.4);
      add(hall, rbox(0.3, 0.2, D, 0.06), C.trim, (sx * W) / 2 - sx * 0.1, 3.0, 0);
    }
    add(hall, rbox(W, 0.24, 0.3, 0.06), C.trim, 0, 3.0, -D / 2 + 0.3);
    add(hall, rbox(W, 0.24, 0.3, 0.06), C.trim, 0, 5.9, -D / 2 + 0.3);
    for (const x of [-W / 2 + 0.4, -6, 6, W / 2 - 0.4]) add(hall, rbox(0.3, 6, 0.3, 0.06), C.trim, x, 3, -D / 2 + 0.35);
    // Lanterns on the side walls.
    for (const sx of [-1, 1])
      for (const z of [-6, 2, 9]) {
        add(hall, new THREE.BoxGeometry(0.1, 0.1, 0.5), C.iron, (sx * W) / 2 - sx * 0.45, 2.6, z).rotation.y = Math.PI / 2;
        add(hall, new THREE.CylinderGeometry(0.16, 0.13, 0.36, 10), 0xffe2a0, (sx * W) / 2 - sx * 0.7, 2.3, z, { emissive: 0xffa53a });
        add(hall, new THREE.ConeGeometry(0.22, 0.16, 10), C.iron, (sx * W) / 2 - sx * 0.7, 2.56, z);
      }
    bakeColors(hall);
    this.root.add(hall);
    // Hay bales stacked in the back corners (one instanced mesh).
    const bales: { m: THREE.Matrix4; a: number; b: number }[] = [];
    const bale = (x: number, y: number, z: number, r: number) =>
      bales.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r), new THREE.Vector3(1, 1, 1)), a: 0xf0c85a, b: 0xd8572f });
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) bale(sx * (W / 2 - 1.3), i * 0.8, D / 2 - 1.2 - i * 0.05, Math.PI / 2 + i * 0.05);
      for (let i = 0; i < 2; i++) bale(sx * (W / 2 - 2.5), i * 0.8, D / 2 - 1.4, Math.PI / 2 - 0.08);
      bale(sx * (W / 2 - 1.3), 0, D / 2 - 3.0, 0.1);
    }
    const hay = tintedInstances(haybaleGeometry(), tintedMaterial("straw", 6), bales);
    if (hay) this.root.add(hay);
    const sign = woodSign(["FARM SHOP"], 7, 1.6);
    sign.position.set(0, 4.5, -D / 2 + 0.4);
    // Dark surround so the far-away farm never shows around the hall.
    const void_ = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshBasicMaterial({ color: 0x241a12 }));
    void_.rotation.x = -Math.PI / 2;
    void_.position.y = -0.45;
    this.root.add(floor, sign, void_);
    // The cash box at the left (an ATM before; closed in stage 1): a wooden cabinet with brass trim.
    const atm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 1), mat(0x8a5a32));
    atm.position.set(-W / 2 + 1.6, 1.3, -D / 2 + 1.2);
    const led = floorText(stageNumber() >= 2 ? "ATM" : "ATM CLOSED", 1.4, 0.4, { color: "#ff4a3a" });
    led.rotation.x = 0;
    led.position.set(-W / 2 + 1.6, 2.2, -D / 2 + 1.72);
    this.root.add(atm, led);
    this.solids.push(this.rect(-W / 2 + 0.8, -D / 2 + 0.7, 1.7, 1.2));
    this.atmPos.set(o.x - W / 2 + 1.6, 0, o.z - D / 2 + 1.2);

    this.bounds = { x0: o.x - W / 2 + 0.8, x1: o.x + W / 2 - 0.8, z0: o.z - D / 2 + 0.8, z1: o.z + D / 2 - 0.8 };
    // Door + exit pad at the front (south).
    this.exit = new Zone(scene, new THREE.Vector3(o.x, 0, o.z + D / 2 - 2), CELL * 1.1, "ENTER");
    this.entry.set(o.x, 0, o.z + D / 2 - 4.6);

    const x = (i: number, n: number) => (i - (n - 1) / 2) * STEP;
    HEAVY.forEach((k, i) => this.addSlot(k, new THREE.Vector3(x(i, HEAVY.length), 0, -D / 2 + 4.2), true));
    HEAVY_LATE.forEach((k, i) => this.addSlot(k, new THREE.Vector3(x(i, HEAVY_LATE.length), 0, -1.6), true));
    LIGHT.forEach((k, i) => this.addSlot(k, new THREE.Vector3(x(i, LIGHT.length), 0, 5.2), false));

    this.card = document.createElement("div");
    this.card.className = "icard hit";
    this.card.style.display = "none";
    uiRoot.appendChild(this.card);
    this.card.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.card.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-buy]") as HTMLElement | null;
      if (!b || b.classList.contains("off") || !this.active) return;
      if (this.active.def.rental) this.onRent?.(this.active.key);
      else this.onBuy?.(this.active.key);
      this.refresh();
      this.renderCard();
    });
    this.refresh();
  }

  private rect(cx: number, cz: number, w: number, d: number) {
    const o = SHOP_ORIGIN;
    return { x0: o.x + cx - w / 2, x1: o.x + cx + w / 2, z0: o.z + cz - d / 2, z1: o.z + cz + d / 2 };
  }

  private addSlot(key: string, local: THREE.Vector3, heavy: boolean): void {
    const def = EQUIP[key];
    if (!def) return;
    const display = new THREE.Group();
    // Footprint (x, z) of what stands in the slot: at least the crate's.
    let fw = 2.7;
    let fd = 2.5;
    if (heavy) {
      const m = makeVehicleModel(key);
      m.root.scale.setScalar(1.05);
      display.add(m.root);
      const size = new THREE.Box3().setFromObject(m.root).getSize(new THREE.Vector3());
      fw = Math.max(fw, Math.min(3.4, size.x));
      fd = Math.max(fd, size.z);
    } else {
      // Light tools on a wooden counter.
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.92, 1.6), mat(C.wood));
      counter.position.y = 0.46;
      const top = new THREE.Mesh(rbox(2.75, 0.1, 1.72, 0.04), mat(C.woodLight));
      top.position.y = 0.96;
      display.add(counter, top);
      display.add(lightDisplay(key));
      fd = 1.7;
    }
    display.position.copy(local);
    display.rotation.y = heavy ? 0 : 0.3;
    this.root.add(display);
    const crate = new THREE.Group();
    // A wooden crate: pale boards, darker frame, an iron padlock.
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.4), mat(0xd2a066));
    box.position.y = 1.1;
    for (const [w, h, x, y] of [[2.66, 0.2, 0, 0.12], [2.66, 0.2, 0, 2.1], [0.2, 2.2, -1.22, 1.1], [0.2, 2.2, 1.22, 1.1]] as const) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.46), mat(0x9a6a3c));
      f.position.set(x, y, 0);
      crate.add(f);
    }
    const lock = new THREE.Mesh(rbox(0.55, 0.5, 0.15, 0.06), mat(0x4a4642));
    lock.position.set(0, 1.2, 1.25);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 6, 12, Math.PI), mat(0xe2b443));
    shackle.position.set(0, 1.45, 1.25);
    crate.add(shackle);
    const label = floorText("FRAGILE", 2.2, 0.5, { color: "#6b3f2a" });
    label.rotation.x = 0;
    label.position.set(0, 1.9, 1.21);
    crate.add(box, lock, label);
    // Stencilled stage number: a hall full of crates still says which opens when.
    if (def.unlock.type === "ReachStage" && def.unlock.value > 1) {
      const st = floorText(`STAGE ${def.unlock.value}`, 2.0, 0.42, { color: "#4a2a1e" });
      st.rotation.x = 0;
      st.position.set(0, 0.55, 1.21);
      crate.add(st);
    }
    // The crate's plain parts bake into one mesh (its stencils keep their textures).
    bakeColors(crate);
    crate.position.copy(local);
    this.root.add(crate);
    // The plate sits just in front of the item (long machines push it forward).
    const plateC = SHOP_ORIGIN.clone().add(local).add(new THREE.Vector3(0, 0, heavy ? Math.max(2.6, fd / 2 + 1.0) : 2.2));
    const plate = new Zone(this.root.parent as THREE.Scene, plateC, 2.4, "");
    this.slots.push({ key, def, plate, display, crate, pos: plateC });
    this.solids.push(this.rect(local.x, local.z, heavy ? Math.max(3, fw - 0.2) : 2.7, heavy ? Math.max(3, fd - 0.4) : fd));
  }

  private lockText(def: EquipDef): string | null {
    if (def.unlock.type === "ReachStage" && stageNumber() < def.unlock.value) return `First, Reach Stage ${def.unlock.value}`;
    if (def.unlock.type === "UnlockEquipment") {
      const need = Object.values(EQUIP).find((x) => x.id === def.unlock.value);
      if (need && !S.unlocked.includes(need.key)) return `First, ${need.rental ? "Rent" : "Buy"} ${need.name}`;
    }
    return null;
  }

  private soldOut(s: Slot): boolean {
    return s.def.rental ? S.run.rentals.includes(s.key) : S.owned.includes(s.key);
  }

  /** Update crates (locked) / displays / plate captions. */
  refresh(): void {
    for (const s of this.slots) {
      const locked = !!this.lockText(s.def);
      s.crate.visible = locked;
      s.display.visible = !locked && !this.soldOut(s);
      const caption = this.soldOut(s) ? "SOLD OUT" : `$ ${fmt(equipPrice(s.key))}`;
      s.plate.setText(caption, this.soldOut(s) ? "#cfd4db" : "#ffd34d");
    }
  }

  private renderCard(): void {
    const s = this.active;
    if (!s) {
      this.card.style.display = "none";
      return;
    }
    const d = s.def;
    const lock = this.lockText(d);
    const price = equipPrice(s.key);
    const stars = Array.from({ length: 5 }, (_, i) => `<i class="${i <= d.tier ? "on" : ""}">★</i>`).join("");
    let btn: string;
    if (this.soldOut(s)) btn = `<div class="ic-sold">SOLD OUT${d.rental ? "<small>It's waiting at the farm.</small>" : ""}</div>`;
    else if (lock) btn = `<div class="ic-lock">${lock}</div>`;
    else btn = `<button class="ic-buy ${S.cash >= price ? "" : "off"}" data-buy="1"><i class="ico cash"></i>${fmt(price)}</button>`;
    this.card.innerHTML = `${d.rental ? `<div class="ic-rent">Rent</div>` : ""}<div class="ic-name">${d.name}</div><div class="ic-sub">${d.desc}</div><div class="ic-stars">${stars}</div><div class="ic-flavor">${d.detail}</div>${btn}`;
    this.card.style.display = "";
  }

  /** Per frame while inside: which plate is the player on → item card. */
  update(player: THREE.Vector3): void {
    const on = this.slots.find((s) => s.plate.contains(player)) ?? null;
    if (on !== this.active) {
      this.active = on;
      this.renderCard();
      if (on) events.emit("shopCardShown", { key: on.key });
    }
    if (this.active) {
      const p = { x: 0, y: 0, visible: false };
      this.stage.toScreen(this.active.pos.clone().setY(4.5).setZ(this.active.pos.z - 2.4), p);
      this.card.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
  }

  hideCard(): void {
    this.active = null;
    this.card.style.display = "none";
  }

  platePos(key: string): THREE.Vector3 | null {
    return this.slots.find((s) => s.key === key)?.pos.clone() ?? null;
  }

  /** Points for the first-visit camera tour: across the machines, then the tool counters. */
  tour(): THREE.Vector3[] {
    return ["wheelbarrow", "rollerCrusher", "cargoPack"].map((k) => this.platePos(k)).filter(Boolean) as THREE.Vector3[];
  }
}
