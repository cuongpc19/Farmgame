import * as THREE from "three";
import { EQUIP, CELL, type EquipDef } from "../data";
import { mat, makeVehicleModel } from "../models";
import { gearModel } from "../characters";
import { floorText, signBoard } from "../world/props";
import { Zone } from "./Zone";
import { S, equipPrice, stageNumber } from "../state";
import { fmt } from "../ui/Hud";
import type { Stage3D } from "../engine/Stage3D";
import { events } from "../systems/Events";

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
 * Machinery Center interior (reference): a concrete hall with a wooden back wall and a big
 * SHOP sign. Back row = stage 1-2 heavy equipment for rent (this stage), middle row = the
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
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), mat(0x9a6248));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, 6, 0.5), mat(0x6b3f2a));
    back.position.set(0, 3, -D / 2);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, D), mat(0xff8fb8));
    sideL.position.set(-W / 2, 1.5, 0);
    const sideR = sideL.clone();
    sideR.position.x = W / 2;
    const sign = signBoard(["GARAGE"], 7, 1.6, "#ff6fa5", "#ffffff");
    sign.position.set(0, 4.5, -D / 2 + 0.3);
    // Dark surround so the far-away sea never shows around the hall.
    const void_ = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshBasicMaterial({ color: 0x2a1620 }));
    void_.rotation.x = -Math.PI / 2;
    void_.position.y = -0.45;
    this.root.add(floor, back, sideL, sideR, sign, void_);
    // Plank lines on the back wall.
    for (let i = 0; i < 6; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.1), mat(0xfff3e2));
      plank.position.set(0, 0.6 + i, -D / 2 + 0.3);
      this.root.add(plank);
    }
    // ATM at the left (closed in stage 1).
    const atm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 1), mat(0x4fd1a5));
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
      // Light tools on a yellow counter.
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.6), mat(0xffd166));
      counter.position.y = 0.5;
      display.add(counter);
      display.add(lightDisplay(key));
      fd = 1.7;
    }
    display.position.copy(local);
    display.rotation.y = heavy ? 0 : 0.3;
    this.root.add(display);
    const crate = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.4), mat(0xc9b0ff));
    box.position.y = 1.1;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.15), mat(0xff6fa5));
    lock.position.set(0, 1.2, 1.25);
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
    if (this.soldOut(s)) btn = `<div class="ic-sold">SOLD OUT${d.rental ? "<small>It's waiting at base camp.</small>" : ""}</div>`;
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
