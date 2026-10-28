import * as THREE from "three";
import { Stage3D } from "./engine/Stage3D";
import { Input } from "./engine/Input";
import { initAudio, musicState, sfx } from "./audio";
import { CELL, DIALOGUE, EQUIP, EQUIP_BY_ID, GAMEPLAY, OIL_ITEM, ORES, QUESTS, STAGES, EASE, WORKER_PROFILES, WORKER_RULES, itemColor, itemKind, motionOfOre, oreOfItemId, stageIndexOf, stageMult, STRUCTURE_INFO, type StageDef, type QuestDef, type EquipDef, type OreDef } from "./data";
import { BlockField, type Block } from "./world/BlockField";
import { Drops } from "./world/Drops";
import { Flyers } from "./world/Flyers";
import { MapView } from "./world/MapView";
import { Dust } from "./world/Dust";
import { Shards } from "./world/Shards";
import { Fx } from "./world/Fx";
import { freeze } from "./engine/freeze";
import { Cracks } from "./world/Cracks";
import { Labels, type Label } from "./ui/Labels";
import { Hud } from "./ui/Hud";
import { Dialogue } from "./ui/Dialogue";
import { GuideArrow } from "./ui/GuideArrow";
import { setToolHeat } from "./characters";
import { UpgradePanel, ShopPanel, Sheet, ICON } from "./ui/Panels";
import { AdSim, StageClearFlow, WorkersPanel } from "./ui/Popups";
import { ADS_ON } from "./ads";
import { HqTower } from "./ui/HqTower";
import { platform } from "../platform";
import { getSetting } from "./settings";
import { teleBroke, teleFrame, type WorkProbe } from "./telemetry";
import { ResearchPanel } from "./ui/ResearchPanel";
import { EquipPanel, SettingsPanel } from "./ui/EquipPanel";
import { WorkerMgmtPanel, gearHolder } from "./ui/WorkerMgmt";
import { Spotlight } from "./ui/Spotlight";
import { Mining, type Miner } from "./systems/Mining";
import { events, Ticker } from "./systems/Events";
import { Quests } from "./systems/Quests";
import { Boosts, buffs, buffClock } from "./systems/Boosts";
import { Comeback } from "./systems/Comeback";

import { Player } from "./actors/Player";
import { Vehicle } from "./actors/Vehicle";
import { WorkerUnit, type WorkerWorld } from "./actors/WorkerUnit";
import { Minecart } from "./base/Minecart";
import { ShopInterior } from "./base/ShopInterior";
import { AutoDigger } from "./base/AutoDigger";
import { Bridge } from "./base/Bridge";
import { Harvester } from "./actors/Harvester";
import { Nav } from "./world/Nav";
import type { Actor } from "./base/Actor";
import type { BaseCtx } from "./base/Ctx";
import { Furnace } from "./base/Furnace";
import { farmLook, houseOf, isCrop } from "./farm";
import { SpriteNodes } from "./world/spriteNodes";
import { Felled } from "./world/Felled";
import { SalesStand } from "./base/SalesStand";
import { EntryBuilding, OilStation, OreStorage, Cafeteria } from "./base/Buildings";
import { priceBoard } from "./base/PriceBoard";
import {
  S, stageDef, stageNumber, addCash, isBroken, markBroken, power, interval, cargo, absorb, moveSpeed, flush, markDirty, onBeforeSave,
  spendCash, nextPrice, equipPrice, freshRun, resetBroken, level,
} from "./state";

/** The exo-carrier's "walk faster" (its moveSpeed stat is empty in the data; +15 % is ours). */
const exoSpeed = () => (S.equipCarrying === "exoCarrier" ? 1.15 : 1);

/** The home tab under the player shows until this quest index is done (1010: Buy the Sledgehammer). */
const HOME_HINT_UNTIL = QUESTS.findIndex((q) => q.id === 1010);
/** The guide arrow walks the player through the loop until this quest index is done (1006: first upgrades). */
const LOOP_TAUGHT = QUESTS.findIndex((q) => q.id === 1006);
/**
 * …and keeps pointing the way to money (furnace, SELL, cash) until this one is done (1010: Buy the
 * Sledgehammer), the arrow only, no camera pans. User 2026-10-24: 24 % of players quit on "Save Up 250
 * Cash", the first quest without the arrow; many mined on with a full back and never sold.
 */
const MONEY_TAUGHT = QUESTS.findIndex((q) => q.id === 1010);
/** After that the arrow comes back once the player has got nowhere for this many seconds (user 2026-10-24: "about 30 s"). */
const STUCK_GUIDE = 30;
/** How far the player walks on to the next block by himself after mining (Game.autoMine): 2.5 cells. */
const AUTO_MINE_REACH = CELL * 2.5;
/** …but only this many seconds after the last touch or key (ours). */
const AUTO_MINE_IDLE = 90;
/** Play time before the auto-mining tip (line 1601) comes up, mid-swing (user 2026-10-22: about 10 minutes). */
const AUTO_MINE_TIP_AFTER = 600;
/** The bubble over a resting worker: icon, words and height above their feet, by what they do at the restaurant. */
const REST_BUBBLE: Record<"eat" | "drink" | "rest" | "wait", [string, string, number]> = {
  eat: ["🍜", "EATING", 3.0],
  drink: ["🥤", "DRINKING", 3.0],
  rest: ["💤", "RESTING", 3.0],
  wait: ["🪑", "NO SEAT", 3.5],
};
/** The first quest that asks for HQ research (1038): the Heavy Machine floor opens with it, not at 40 %. */
const FIRST_RESEARCH_QUEST = QUESTS.findIndex((q) => q.type === "ManagementUpgrade");

interface Solid {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * Owns one running quarry (stage): scenery, blocks, loose chunks, the base buildings,
 * vehicles, the player, quests/dialogue/UI and every system that ticks each frame.
 */
export class Game implements BaseCtx {
  readonly stage: Stage3D;
  readonly input: Input;
  readonly labels: Labels;
  readonly hud: Hud;
  readonly dialogue: Dialogue;
  readonly scene: THREE.Scene;
  readonly upgradePanel: UpgradePanel;
  /** Cash last frame: open sheets re-check their buy buttons when it changes. */
  private lastCash = -1;
  readonly shopPanel: ShopPanel;
  readonly workersPanel: WorkersPanel;
  readonly workerMgmt: WorkerMgmtPanel;
  /** HUD chip: applicants waiting / countdown to the next batch ("NEW candidate"). */
  private candChip!: HTMLButtonElement;
  /** Right-edge vehicle tab (after the first rental): tap a machine to find it, "i" for info. */
  private vtab!: HTMLDivElement;
  private vtabKey = "";
  readonly hqPanel: ResearchPanel;
  readonly hqTower: HqTower;
  /** Research ids whose "complete!" toast was shown (they wait for APPLY). */
  private researchToasted = new Set<number>();
  readonly ad: AdSim;
  readonly clearFlow: StageClearFlow;
  readonly equipPanel: EquipPanel;
  readonly spot: Spotlight;
  readonly settingsPanel: SettingsPanel;
  private readonly uiRoot: HTMLElement;
  minecarts: Minecart[] = [];
  workers: WorkerUnit[] = [];
  diggers: AutoDigger[] = [];
  bridges: Bridge[] = [];
  /** Oil stations out in the quarry (stages 3+). */
  extraOil: OilStation[] = [];
  harvesters: Harvester[] = [];
  /** Ground routing for workers and harvesters (islands joined by bridges). */
  readonly nav = new Nav();
  boosts!: Boosts;
  /** Sugar bees and the daily treats calendar (reasons to come back tomorrow). */
  comeback!: Comeback;
  private claimed = new Set<Block>();
  private applicantT = 0;
  private clearing = false;
  /** Last gameplay state told to the host (null = nothing told yet). */
  private hostPlaying: boolean | null = null;
  private adAsk = 0;
  st!: StageDef;
  map!: MapView;
  field!: BlockField;
  drops!: Drops;
  flyers!: Flyers;
  dust!: Dust;
  slabs!: Dust;
  shards!: Shards;
  fx!: Fx;
  cracks!: Cracks;
  /** Trees toppling and rice folding down after the last blow. */
  felled!: Felled;
  mining!: Mining;
  player!: Player;
  /** The Mill (rice, wood, fruit); the stage's furnace spot. */
  furnace!: Furnace;
  /** The Forge (metals, gems), beside the Mill. */
  forge!: Furnace;
  /** Both processing houses. */
  houses: Furnace[] = [];
  sales!: SalesStand;
  upgradeB!: EntryBuilding;
  shopB!: EntryBuilding;
  workerB!: EntryBuilding;
  oil!: OilStation;
  storage!: OreStorage;
  cafeteria!: Cafeteria;
  quests!: Quests;
  arrow!: GuideArrow;
  vehicles: Vehicle[] = [];
  driving: Vehicle | null = null;
  /** The last machine you climbed onto: when its tank runs dry you are led to oil and back to it. */
  private lastRide: Vehicle | null = null;
  /** Machines whose dry tank was already announced (cleared once they have oil again). */
  private dryNoted = new Set<Vehicle>();
  /** The refuel arrow shows until this game time: 30 s from running dry at most (user 2026-10-20). */
  private refuelUntil = 0;
  ready = false;
  time = 0;
  /** Test-only fast-forward (`?speed=4`); simulated in fixed sub-steps. */
  /** `?speed=N` fast-forwards (headless runs); a cheat, so not in the CrazyGames build. */
  timeScale = __TARGET__ === "crazy" ? 1 : Number(new URLSearchParams(location.search).get("speed") ?? 1) || 1;
  private solids: Solid[] = [];
  private last = performance.now();
  private cargoLabel!: Label;
  private homeLabel!: Label;
  private cargoAt = new THREE.Vector3();
  private homeAt = new THREE.Vector3();
  private homePos = new THREE.Vector3();
  /** Knuckle Driller heat 0-100, and whether it is cooling down from full heat. */
  heat = 0;
  overheated = false;
  /** Last time the player (or the machine they drive) hit a block: the guide arrow waits. */
  private minedAt = -99;
  private zoomNow = 1;
  private nearOre: Block[] = [];
  private fuelLabels = new Map<Vehicle, Label>();
  /** The "resting" bubble over each hired worker (shown while they rest). */
  private restLabels = new Map<WorkerUnit, Label>();
  private pinLabels = new Map<Vehicle, Label>();
  /** Rented vehicles dropping onto their parking slot (delivery animation). */
  private deliveries: { v: Vehicle; t: number }[] = [];
  private stoppedT = 0;
  shopIn!: ShopInterior;
  inShop = false;
  private shopArmed = false;
  private shopVisited = false;
  /** Vehicles rented inside the shop drop in at base once the player walks out. */
  private pendingDeliveries: Vehicle[] = [];
  /** The first rented vehicle: its mount pin gets the spotlight when it lands. */
  private pinSpotFor: Vehicle | null = null;
  private oilLinePending = false;
  /** Camera pan requested while a dialogue was open (runs when it closes). */
  private pendingPan: THREE.Vector3 | null = null;
  private lastPanAt = -99;
  private lastPan = new THREE.Vector3(1e9, 0, 0);
  /** Dialogues on screen now, with callbacks waiting for them to close. */
  private saying = new Map<number, (() => void)[]>();
  private mountHold = 0;
  private refuelTick = new Ticker();
  private directT = 0;
  /** World z south of the last quarry row: beyond it the player is in the base camp. */
  private baseLine = 0;
  private directP = new THREE.Vector3();
  private vehicleSlots: THREE.Vector3[] = [];
  private tmp = new THREE.Vector3();

  constructor(host: HTMLElement, uiRoot: HTMLElement) {
    this.stage = new Stage3D(host);
    this.scene = this.stage.scene;
    this.input = new Input(host);
    this.input.onFirstPress = initAudio;
    this.labels = new Labels(uiRoot, this.stage);
    this.hud = new Hud(uiRoot);
    this.dialogue = new Dialogue(uiRoot);
    this.upgradePanel = new UpgradePanel(uiRoot);
    this.shopPanel = new ShopPanel(uiRoot);
    this.workersPanel = new WorkersPanel(uiRoot);
    this.workerMgmt = new WorkerMgmtPanel(uiRoot);
    this.workerMgmt.onAssign = (id, key) => this.assignGear(id, key);
    this.workerMgmt.onJobBoard = () => {
      this.workerMgmt.close();
      this.openJobBoard();
    };
    this.candChip = document.createElement("button");
    this.candChip.className = "newcand hit";
    this.candChip.style.display = "none";
    this.candChip.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.candChip.addEventListener("click", () => this.openJobBoard());
    uiRoot.appendChild(this.candChip);
    this.vtab = document.createElement("div");
    this.vtab.className = "vtab hit";
    this.vtab.style.display = "none";
    this.vtab.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.vtab.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest("[data-veh]") as HTMLElement | null;
      if (b) {
        const v = this.vehicles.find((x) => x.key === b.dataset.veh);
        if (v) this.directCamera(v.pos);
      } else if (t.closest("[data-vinfo]")) {
        const lines = this.vehicles.map((v) => `${EQUIP[v.key]?.name ?? v.key}: ${v.fuelled ? `fuel ${Math.round((v.fuel / Math.max(1, v.tank)) * 100)}%` : "no fuel needed"}${v.carries ? ` · cargo ${v.stack.count}/${v.stack.capacity}` : ""}`);
        this.hud.toast(lines.join("  ·  ") || "No machines rented", 3500);
      }
    });
    uiRoot.appendChild(this.vtab);
    this.hqPanel = new ResearchPanel(uiRoot);
    this.hqTower = new HqTower(uiRoot);
    this.ad = new AdSim(uiRoot);
    this.clearFlow = new StageClearFlow(uiRoot);
    this.equipPanel = new EquipPanel(uiRoot);
    this.spot = new Spotlight(uiRoot);
    this.settingsPanel = new SettingsPanel(uiRoot);
    this.uiRoot = uiRoot;
    this.wireUi();
    this.loadStage();
    requestAnimationFrame((t) => this.frame(t));
    this.ready = true;
  }

  /** Test hooks (headless runs): jump progress / cash without playing for an hour. */
  readonly debug = {
    /** Background music: "off", "rendering" or "playing" (plan `music`). */
    music: () => musicState(),
    /** Seconds left on each boost (plan `gifts`). */
    buffs: () => {
      const t = buffClock();
      const r = (u: number) => Math.max(0, Math.round(u - t));
      return { speed: r(buffs.speedUntil), damage: r(buffs.damageUntil), magnet: r(buffs.magnetUntil), furnace: r(buffs.furnaceUntil) };
    },
    /** Count `n` ingots as sold and break the matching blocks (6 drops each), farthest first. */
    sell: (n: number) => {
      S.run.sold += n;
      this.debug.mine(Math.round(n / 6));
    },
    /** Break `n` blocks silently (no drops), farthest from the base first. */
    mine: (n: number) => {
      const alive = this.field.blocks.filter((b) => b.alive).sort((a, b) => a.cz - b.cz);
      for (const b of alive.slice(0, n)) {
        this.field.kill(b);
        markBroken(b.i, this.st.blocks.length);
      }
      markDirty();
    },
    cash: (n: number) => {
      S.cash += n;
      markDirty();
    },
    quest: () => QUESTS[S.quest.index]?.id ?? null,
    quests: () => QUESTS.map((q) => [q.id, q.text]),
    state: () => S,
    /** Store captures: every dialogue counts as seen (no lines pop up mid-take). */
    quiet: () => {
      for (const d of DIALOGUE) if (!S.dialogues.includes(d.id)) S.dialogues.push(d.id);
      markDirty();
    },
    /** Store captures: `n` workers of a role join at once, free. */
    crew: (role: string, n: number) => {
      for (const p of WORKER_PROFILES.filter((x) => x.role === role && !S.run.workers.includes(x.id)).slice(0, n)) {
        S.run.workers.push(p.id);
        this.spawnWorker(p.id);
      }
      markDirty();
    },
    /** Tests: start stage level `n` afresh (cash, tools and upgrades stay), like a contract does. */
    stage: (n: number) => {
      this.leaving = true;
      S.run = freshRun(n);
      resetBroken();
      markDirty();
      flush();
      location.reload();
    },
    skipTo: (id: number) => {
      S.quest.index = Math.max(0, QUESTS.findIndex((q) => q.id === id));
      S.quest.progress = 0;
      markDirty();
    },
    /**
     * Test links (web / dev builds only, boot.ts): `?prog=40&cash=10000&quest=1027` start this
     * stage at 40 % broken (farthest blocks first, the front stays), with 10,000 cash, on quest
     * 1027; with `quest`, the onboarding lines before the crew's (ids below 900) count as seen.
     * `?stage=5` first moves to stage level 5 as if the contracts before it were signed: a fresh
     * quarry, the onboarding lines seen, the quest chain on from the contract that leads there, and
     * every tool and machine of the earlier stages counted as used once (shop items wait on that).
     * The page reloads into it and the other parameters apply after the reload.
     * The parameters strip themselves, so a reload plays on instead of setting it all again.
     */
    fromUrl: () => {
      const q = new URLSearchParams(location.search);
      if (!["stage", "prog", "cash", "quest"].some((k) => q.has(k))) return;
      const stage = Math.floor(Number(q.get("stage")));
      q.delete("stage");
      if (stage >= 1 && stage !== this.level) {
        this.leaving = true;
        S.run = freshRun(stage);
        S.gift = 0;
        resetBroken();
        for (const d of DIALOGUE) if (d.id < 800 && !S.dialogues.includes(d.id)) S.dialogues.push(d.id);
        let at = 0;
        let signed = 0;
        QUESTS.forEach((x, i) => {
          if (x.type === "StageContract" && ++signed < stage) at = i + 1;
        });
        S.quest = { index: at, progress: 0 };
        for (let grew = stage >= 2; grew; ) {
          grew = false;
          for (const e of Object.values(EQUIP)) {
            if (S.unlocked.includes(e.key)) continue;
            const u = e.unlock;
            const used = u.type === "ReachStage" ? stage > u.value : u.type === "UnlockEquipment" ? S.unlocked.includes(EQUIP_BY_ID.get(u.value)?.key ?? "") : true;
            if (used) (S.unlocked.push(e.key), (grew = true));
          }
        }
        markDirty();
        flush();
        const rest = q.toString();
        history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
        location.reload();
        return;
      }
      const quest = Number(q.get("quest"));
      if (quest) {
        for (const d of DIALOGUE) if (d.id < 900 && !S.dialogues.includes(d.id)) S.dialogues.push(d.id);
        this.debug.skipTo(quest);
      }
      const prog = Number(q.get("prog"));
      if (prog > 0) {
        const total = this.field.blocks.length;
        const want = Math.min(total, Math.round((total * prog) / 100));
        const have = total - this.field.remaining;
        if (want > have) this.debug.mine(want - have);
      }
      if (q.has("cash")) S.cash = Math.max(0, Number(q.get("cash")) || 0);
      markDirty();
      for (const k of ["prog", "cash", "quest"]) q.delete(k);
      const rest = q.toString();
      history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
    },
  };

  /* ---------- BaseCtx ---------- */
  actors(): Actor[] {
    return [this.controlled(), ...this.workers];
  }
  /** Stage level (1, 2, 3, …; past 10 the maps come round again). */
  get level(): number {
    return stageNumber();
  }
  controlled(): Actor {
    return this.driving ?? this.player;
  }
  stageNo(): number {
    return this.level;
  }

  /* ---------- setup ---------- */

  private wireUi(): void {
    this.hud.exitBtn.addEventListener("click", () => this.dismount());
    this.upgradePanel.onClose = () => this.upgradeB?.close();
    this.shopPanel.onClose = () => this.shopB?.close();
    this.upgradePanel.onBuy = (k) => this.buyUpgrade(k);
    this.upgradePanel.saving = () => {
      const q = this.quests.cur();
      return q?.type === "HoldCurrency" ? q.text : null;
    };
    Sheet.onPoor = () => {
      sfx.deny();
      this.hud.toast("Not enough cash!");
    };
    this.shopPanel.onBuy = (k) => this.buyTool(k);
    this.shopPanel.onRent = (k) => this.rent(k);
    this.shopPanel.onEquip = (k) => this.equip(k);
    events.on("cashCollected", (e) => {
      S.run.earned += e.amount;
    });
    events.on("mineralToSmelter", (e) => {
      const k = e.by ?? "PLAYER";
      S.run.hauled[k] = (S.run.hauled[k] ?? 0) + e.count;
    });
    this.workersPanel.onClose = () => this.workerB?.close();
    this.workersPanel.onDecline = (id) => {
      this.workersPanel.applicants = this.workersPanel.applicants.filter((a) => a.profile.id !== id);
      S.run.applicants = this.workersPanel.applicants.map((a) => a.profile.id);
      markDirty();
      this.workersPanel.render(this.time);
    };
    this.workersPanel.onHire = (id) => this.hire(id);
    this.workersPanel.onFull = () => {
      sfx.deny();
      this.hud.toast(`Team full: ${S.run.workers.length}/${this.st.maxWorkers} farmhands`);
    };
    this.workersPanel.priceOf = (p) => this.hirePrice(p.price);
    this.hqPanel.onResearch = (id) => this.research(id);
    this.hqPanel.onApply = (id) => this.applyResearch(id);
    this.hqPanel.onClose = () => this.hqTower.setBadge(this.hqPanel.hasAlert("light"));
    this.hud.companyBtn.addEventListener("click", () => this.openCompany());
    this.hud.onNext = () => void this.clearStage();
    this.input.steerFrom(this.hud.toolsBtn);
    this.refreshToolsBtn();
    this.hud.toolsBtn.addEventListener("click", () => {
      events.emit("panelOpened", { panel: "equipment" });
      this.equipPanel.render();
      this.equipPanel.open();
    });
    this.equipPanel.onEquip = (k) => {
      this.equip(k);
      this.equipPanel.render();
    };
    this.hud.settingsBtn.addEventListener("click", () => {
      this.settingsPanel.render();
      this.settingsPanel.open();
    });
  }

  private loadStage(): void {
    const scene = this.scene;
    this.st = stageDef();
    this.st.clearPercent = Math.min(this.st.clearPercent, EASE.clear);
    this.map = new MapView(scene, this.st);
    const lookByOre = new Map(this.st.blocks.map((b) => [b.ore.id, b.ore]));
    this.field = new BlockField(
      scene,
      this.st.blocks.map((b) => ({ cx: b.cx, cz: b.cz, ore: b.ore.id, hp: b.ore.hp * this.st.oreHpMult * stageMult(stageNumber()).oreHpMultiplier * EASE.hp })),
      CELL,
      (oreId) => {
        const key = lookByOre.get(oreId)?.key ?? "";
        return { key, kind: farmLook(key).kind };
      },
      new SpriteNodes(CELL),
      CELL,
    );
    for (let i = 0; i < this.st.blocks.length; i++) if (isBroken(i, this.st.blocks.length)) this.field.kill(this.field.blocks[i]);
    this.baseLine = Math.max(...this.field.blocks.map((b) => b.cz)) * CELL + CELL * 1.5;
    this.drops = new Drops(scene, itemColor, 3000, 0.6);
    // Nowhere a chunk can't be picked up from: unbroken ore, off the walkable ground (the stage 1 lawn,
    // water, cliffs) or inside a building (user 2026-10-23: a chunk on the lawn held a carrier there).
    this.drops.blocked = (x, z) =>
      this.oreAt(x, z) || !this.map.inside(x, z) || this.solids.some((s) => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
    this.flyers = new Flyers(scene, 0.6);
    this.dust = new Dust(scene);
    this.slabs = new Dust(scene, 48, "slab");
    // 9 chips a hit (more with a crew swinging), so a bigger pool before old chips get reused mid-air.
    this.shards = new Shards(scene, 200);
    this.fx = new Fx(scene);
    this.cracks = new Cracks(scene, CELL, CELL);
    this.felled = new Felled(scene);
    // A felled tree hits the ground: a puff of dust and leaves where its crown lands.
    this.felled.onLand = (x, z, away, scale) => {
      const side = Math.sin(away) >= 0 ? 1 : -1;
      const at = new THREE.Vector3(x + side * CELL * 1.3 * scale, CELL * 0.15, z);
      this.fx.puff(at, 0xd8c8a8, 6, CELL * 0.45, CELL * 0.3, 0.7);
      this.dust.burst(at, 0x6aa84a, 8, 0.9);
    };
    this.mining = new Mining(this.field, this.drops, (b) => this.st.blocks[b.i].ore, {
      onHit: (b, ore, miner) => this.hitFx(b, ore, miner, false),
      onBreak: (b, ore, miner) => {
        // The gift box is an ad offer in the original: none while ads are off (ads.ts).
        if (ore.key === "mystery" && ADS_ON) {
          const at = this.field.center(b, new THREE.Vector3());
          this.askAd("Treasure Chest", () => this.mysteryGift(at));
        }
        const who = (miner as { label?: string }).label ?? "PLAYER";
        S.run.mined[who] = (S.run.mined[who] ?? 0) + 1;
        teleBroke(miner instanceof WorkerUnit ? "bw" : miner === this.player ? "bp" : "bv");
        this.hitFx(b, ore, miner, true);
        if (this.driving) this.stage.shake(0.15);
        markBroken(b.i, this.st.blocks.length);
        events.emit("oreDestroyed", { category: ore.category, ore: ore.key });
      },
      onCollect: (_i, c) => {
        sfx.pickup();
        events.emit("mineralCollected", { count: 1 });
        if (c.stack.full) events.emit("cargoFull", {});
      },
    });

    this.player = new Player(scene);
    const sp = this.st.spawns.find((s) => s.type === "playerSpawnPoint");
    this.player.pos.set(sp?.wx ?? 0, 0, sp?.wz ?? 0);
    // Start right at the work (user 2026-10-28: "start the player beside the rice field"): in front of the rice
    // nearest the houses, facing it (the fields lie north, toward -z).
    const rice = this.nearestBlock(this.player.pos, (b) => isCrop(this.st.blocks[b.i].ore));
    if (rice) {
      this.player.pos.set(rice.cx * CELL, 0, rice.cz * CELL + CELL * 0.85);
      this.player.facing = Math.PI;
    }
    this.refreshPlayerStats();
    // CARGO pill sits under the player's feet, the home tab below it (reference layout).
    this.cargoLabel = this.labels.add(this.cargoAt, "cargo", "");
    this.homeLabel = this.labels.add(this.homeAt, "home", "");
    this.homePos.set(sp?.wx ?? 0, 0, sp?.wz ?? 0);
    this.vehicleSlots = this.st.spawns
      .filter((s) => s.type === "vehicleSpawnPoint")
      .map((s) => new THREE.Vector3(s.wx, 0, s.wz))
      .sort((a, b) => a.x - b.x);

    this.buildBase();
    this.shopIn = new ShopInterior(scene, this.uiRoot, this.stage);
    // Scenery that never moves stops rebuilding its matrices every frame (engine/freeze.ts):
    // the map, the walk-in shop, the entry buildings (their beacons keep bobbing).
    freeze(this.map.group);
    freeze(this.shopIn.root);
    for (const b of [this.upgradeB, this.shopB, this.workerB]) if (b) freeze(b.root, [b.beacon]);
    this.shopIn.onBuy = (k) => this.buyTool(k);
    this.shopIn.onRent = (k) => this.rent(k);
    this.arrow = new GuideArrow(scene);
    this.quests = new Quests({
      hud: this.hud,
      guideTarget: (d) => this.guideTarget(d),
      directCamera: (p) => this.directCamera(p),
      // No pan to the first rock (1001) or to the furnace (1003) (user 2026-10-22): the arrow shows the way.
      // Nor to something right beside you (same day: at the furnace, quest 1004 panned from REFINING to the tray).
      pans: (q) => q.id !== 1001 && q.id !== 1003 && (this.learning() || this.newThing(q)) && !this.beside(this.guideTarget(q.guide.detail)),
      progress: () => this.progress(),
      stageNo: () => this.level,
      rentals: () => S.run.rentals,
      onQuestStart: (q) => this.onQuestStart(q),
      // "Head to Upgrades" waits until the first sale's cash is in your pocket (user 2026-10-22): first the
      // cash, then line 201 ("That's a nice pile of cash"), the pan and the arrow to the Upgrade building.
      waitCard: (q) => (q.id === 1005 && this.sales.moneyToSave > 0 ? "Collect Your Cash" : null),
      carriedMinerals: () => this.controlled().stack.items.filter((i) => itemKind(i) === "mineral").length,
      owned: (k) => S.owned.includes(k),
      workersHired: () => S.run.workers.length,
      mountedKey: () => this.driving?.key ?? null,
      inside: () => (this.inShop ? "shop" : null),
    });
    // Unfinished quests carry over into the next quarry (reference: the card keeps going;
    // "…on Stage 1" goals count as done once stage 1 is behind you).
    for (const k of S.run.rentals) this.spawnVehicle(k);
    // Reloaded in the middle of the first-rental guide: show it again, then the mount pin.
    if (this.vehicles.length && !S.dialogues.includes(501)) this.once(501, () => this.spotMount(this.vehicles[0]));
    if (S.run.rentals.some((k) => (EQUIP[k]?.stats.fuelAmount ?? 0) > 0)) this.oil.unlock();
    this.buildStructures();
    for (const id of S.run.workers) this.spawnWorker(id);
    this.restoreTransit();
    if (S.leftover) {
      const n = S.leftover;
      delete S.leftover;
      markDirty();
      setTimeout(() => this.hud.toast(`Last plot's leftover harvest sold: +$${n.toLocaleString("en-US")}`, 4000), 2500);
    }
    // This quarry got a new map since the last visit (state.ts relayout): its progress stays, plus a gift.
    if (S.mapGift) {
      const n = S.mapGift;
      delete S.mapGift;
      markDirty();
      setTimeout(() => this.hud.toast(`🗺️ New map for this plot! Your progress stays, and here's +$${n.toLocaleString("en-US")}`, 5000), 2500);
    }
    onBeforeSave(() => this.saveTransit());
    // Items move without other state changing: keep the snapshot fresh.
    setInterval(markDirty, 3000);
    this.boosts = new Boosts(
      {
        scene: this.scene,
        hud: this.hud,
        ad: this.ad,
        playerPos: () => this.controlled().pos,
        stageNo: () => this.level,
        oreNear: (r) => this.field.near(this.controlled().pos.x, this.controlled().pos.z, r).length > 0,
        toScreen: (p, out) => this.stage.toScreen(p, out),
        progress: () => this.progress(),
        // Base camp = the paved strip south of the quarry (anything below the last block row).
        inBase: () => !this.inShop && this.controlled().pos.z > this.baseLine,
        inShop: () => this.inShop,
        facility: (k) => {
          if (k === "furnace") return { pos: this.furnace.zone.center, stack: this.furnace.queue.length + this.forge.queue.length };
          if (k === "sales") return { pos: this.sales.zone.center, stack: this.sales.pile.count };
          if (k === "cafeteria") return { pos: this.cafeteria.offerAt, stack: 0 };
          return this.inShop ? { pos: this.shopIn.atmPos, stack: 0 } : null;
        },
        hasWorkers: () => this.workers.length > 0,
        cargoFill: () => this.player.stack.count / Math.max(1, this.player.stack.capacity),
        groundChunks: () => this.drops.resting,
        spotNear: (r) => this.openGroundNear(r),
        spotOnWay: () => this.openGroundOnWay(),
        busy: () => this.dialogue.open || this.spot.open || this.directT > 0 || this.clearing,
        instantSell: (n) => this.sales.instantSell(n),
        workersRecover: () => this.workers.forEach((w) => w.recover()),
      },
      this.uiRoot,
    );
    this.comeback = new Comeback(
      {
        hud: this.hud,
        boosts: this.boosts,
        calm: () =>
          !this.dialogue.open && !this.spot.open && this.directT <= 0 && !this.clearing && !this.hqTower.isOpen && !this.hqPanel.isOpen && !document.querySelector(".sheet.on"),
      },
      this.uiRoot,
    );
    this.stage.follow(this.player.pos, true);
    // No opening line (user 2026-10-21): quest 1001's arrow leads straight to the first rock.
    // Dialogue 101 is simply never played, nor 102 ("take it to the furnace", user 2026-10-22).
    // Sofia's cashback lines come a little while into stage 2 (reference ~40 s), see tickProgression.
  }

  /**
   * A Mystery block broke and the ad was watched (the original's 3D gift box, RvBoost 8001): cash
   * worth 20 of this stage's best ingots (ours: the original gives meta gifts we don't have).
   */
  private mysteryGift(at: THREE.Vector3): void {
    const best = Math.max(...this.st.blocks.map((b) => (b.ore.key === "mystery" ? 0 : b.ore.ingotPrice)));
    const amount = best * 20;
    addCash(amount);
    S.run.earned += amount;
    markDirty();
    sfx.reward();
    this.labels.pop(at.clone().setY(3), `🎁 MYSTERY BOX +${amount.toLocaleString("en-US")}`, "hint");
  }

  /** Room for a boost can (a pad 2.6 wide) at (x, z): on the map, clear of blocks and buildings. */
  private openGround(x: number, z: number): boolean {
    for (const [dx, dz] of [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]])
      if (!this.map.inside(x + dx, z + dz) || this.field.at(Math.round((x + dx) / CELL), Math.round((z + dz) / CELL))) return false;
    return !this.solids.some((s) => x > s.x0 - 1.3 && x < s.x1 + 1.3 && z > s.z0 - 1.3 && z < s.z1 + 1.3);
  }

  /** Open ground about r from the player: a ring of 12 directions from a random one, at a few distances. */
  private openGroundNear(r: number): THREE.Vector3 | null {
    const p = this.controlled().pos;
    const a0 = Math.random() * Math.PI * 2;
    for (const k of [1, 0.7, 1.4, 0.45, 2])
      for (let i = 0; i < 12; i++) {
        const a = a0 + (i * Math.PI) / 6;
        const x = p.x + Math.cos(a) * r * k;
        const z = p.z + Math.sin(a) * r * k;
        if (this.openGround(x, z)) return new THREE.Vector3(x, 0, z);
      }
    return null;
  }

  /**
   * Open ground on the way from the player to the nearest rock, the one quest 1001's arrow points at (the first gift
   * can, user 2026-10-27: there from the first second, where the walk to the first rock passes): about halfway, then
   * nearer either end, never on the player's feet.
   */
  private openGroundOnWay(): THREE.Vector3 | null {
    const p = this.controlled().pos;
    const b = this.nearestBlock(p);
    if (!b) return null;
    const rock = this.field.center(b, new THREE.Vector3());
    for (const t of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75]) {
      const x = p.x + (rock.x - p.x) * t;
      const z = p.z + (rock.z - p.z) * t;
      if (Math.hypot(x - p.x, z - p.z) >= 2.5 && this.openGround(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  /** Structure group info of this map: expansion levels, auto digger deposits. */
  private structureInfo(g: number | undefined): any[] {
    return STRUCTURE_INFO[`stage${this.st.order}`]?.[String(g ?? -1)] ?? [];
  }

  /** Walkable ground changed (a bridge built or widened): decks, then the routing grid. */
  private refreshGround(): void {
    for (const b of this.bridges) this.map.setBridge(b.groupId, b.footRect, b.wheelRect);
    this.nav.build(this.map.walk, this.map.wheel, this.solids);
  }

  private buildStructures(): void {
    // A knoll (stage 9) is solid ground nobody walks through.
    for (const pr of this.st.props)
      if (pr.type === "mountain") this.solids.push({ x0: pr.wx - pr.w * CELL * 0.42, x1: pr.wx + pr.w * CELL * 0.42, z0: pr.wz - pr.h * CELL * 0.42, z1: pr.wz + pr.h * CELL * 0.42 });
    for (const sdef of this.st.structures) {
      const unlocked = sdef.payType !== "RV" || S.run.structures.includes(sdef.groupId ?? -1);
      if (sdef.type === "minecart") {
        // Every cart starts inactive with an ACTIVATE pad: FREE for the first, ad for the rest.
        const active = S.run.structures.includes(sdef.groupId ?? -1);
        const m = new Minecart(this, sdef, this.storage, this.uiRoot, !active, sdef.payType !== "RV");
        const buildTrack = () => {
          // The track is built through any ore lying on it (MinecartRail._mineBlockDamager):
          // those blocks break like mined ones and drop their chunks (6 each) to collect.
          for (const c of m.railCells) {
            const b = this.field.at(c.cx, c.cz);
            if (!b) continue;
            const ore = this.st.blocks[b.i].ore;
            const at = this.field.center(b, new THREE.Vector3()).setY(CELL * 0.7);
            this.field.kill(b);
            markBroken(b.i, this.st.blocks.length);
            this.drops.burst(at, ore.mineralId, 6, 1.0);
            events.emit("oreDestroyed", { category: ore.category, ore: ore.key });
          }
        };
        if (active) buildTrack();
        m.onActivated = () => {
          buildTrack();
          if (!S.run.structures.includes(m.groupId)) S.run.structures.push(m.groupId);
          markDirty();
          this.directCamera(m.home);
        };
        m.onUnlockRequest = () => {
          if (m.free) m.unlock();
          else this.askAd("Activate Rail Cart", () => m.unlock());
        };
        this.minecarts.push(m);
      } else if (sdef.type === "autoDigger") {
        const dep = this.structureInfo(sdef.groupId).find((x) => x.oreDeposit)?.oreDeposit;
        const d = new AutoDigger(this, sdef, unlocked, dep ? { ore: dep.ore, amount: dep.oreAmount } : undefined);
        d.onUnlockRequest = () =>
          this.askAd("Unlock Auto Digger", () => {
            d.unlock();
            S.run.structures.push(sdef.groupId ?? 0);
            markDirty();
          });
        this.diggers.push(d);
        this.solids.push({ x0: sdef.wx - CELL * 1.1, x1: sdef.wx + CELL * 1.1, z0: sdef.wz - CELL * 1.1, z1: sdef.wz + CELL * 0.4 });
      } else if (sdef.type === "extraOilStation") {
        const o = new OilStation(this, sdef, true);
        o.onBackFull = () => this.backFullAtOil();
        if (unlocked) o.unlock();
        o.onActivateRequest = () =>
          this.askAd("Activate Fuel Pump", () => {
            o.unlock();
            if (!S.run.structures.includes(sdef.groupId ?? 0)) S.run.structures.push(sdef.groupId ?? 0);
            markDirty();
          });
        this.extraOil.push(o);
        this.solids.push({ x0: sdef.wx - CELL * 1.0, x1: sdef.wx + CELL * 1.1, z0: sdef.wz - CELL * 1.35, z1: sdef.wz - CELL * 0.2 });
      } else if (sdef.type === "bridge") {
        const g = sdef.groupId ?? 0;
        const b = new Bridge(this, { ...sdef, raw: { ...sdef.raw, expansion: this.structureInfo(g).filter((x) => x.level) } }, S.run.structures.includes(g) ? 2 : 0);
        b.onRequest = () => {
          const done = () => {
            b.advance();
            if (!S.run.structures.includes(g)) S.run.structures.push(g);
            markDirty();
          };
          if (b.nextPrice && b.nextPrice > 0) {
            if (!spendCash(b.nextPrice)) return Sheet.onPoor?.();
            sfx.buy();
            done();
          } else if (b.nextIsAd) this.askAd(b.onFoot ? "Widen Bridge" : "Build Bridge", done);
          else done();
        };
        b.onChange = () => this.refreshGround();
        this.bridges.push(b);
      } else if (sdef.type === "harvester") {
        const h = new Harvester(this, sdef, this.drops, this.mining, this.nav, this.field, this.storage, (q, r) => {
          this.field.collide(q, r);
          this.collideSolids(q, r);
          this.map.clamp(q, r, true);
        });
        if (unlocked) h.unlock();
        h.onUnlockRequest = () =>
          this.askAd("Activate Auto Harvester", () => {
            h.unlock();
            if (!S.run.structures.includes(sdef.groupId ?? 0)) S.run.structures.push(sdef.groupId ?? 0);
            markDirty();
          });
        this.harvesters.push(h);
      }
    }
    this.refreshGround();
  }

  /**
   * gameplayStart / gameplayStop for the host, from one pause flag (not from each call site:
   * the one you miss is where an ad lands mid-play). Dialogue, spotlights, every sheet, the
   * stage-clear flow, the HQ tower and a running ad all count as "not playing".
   */
  private tellHost(): void {
    const paused =
      this.dialogue.open || this.spot.open || this.clearing || this.ad.busy || this.hqTower.isOpen || Sheet.all.some((s) => s.isOpen);
    const playing = !paused;
    if (playing === this.hostPlaying) return;
    this.hostPlaying = playing;
    if (playing) platform.gameplayStart();
    else platform.gameplayStop();
  }

  /** Offer a rewarded ad (at most once per ~2 s). */
  private askAd(what: string, then: () => void): void {
    if (this.ad.busy || this.time < this.adAsk) return;
    this.adAsk = this.time + 2;
    void this.ad.show(what).then((ok) => ok && then());
  }

  /* ---------- workers ---------- */

  private workerWorld(): WorkerWorld {
    const rest = this.st.spawns.find((s) => s.type === "workerSpawnPoint");
    return {
      field: this.field,
      drops: this.drops,
      mining: this.mining,
      padFor: (item) => this.houseFor(item).zone.center,
      storagePad: this.storage.zone.center,
      storageCount: () => this.storage.pile.count,
      seats: this.cafeteria.seats,
      rest: new THREE.Vector3(rest?.wx ?? 0, 0, rest?.wz ?? 0),
      claimSeat: (who) => this.cafeteria.claim(who),
      releaseSeat: (who) => this.cafeteria.release(who),
      queueSpot: (who) => this.cafeteria.queueSpot(who),
      collide: (p, r) => {
        this.field.collide(p, r);
        this.collideSolids(p, r);
        this.map.clamp(p, r);
      },
      route: (from, to, out) => this.nav.route(from, to, this.oreAt, this.roomToWalk, out),
      nearest: (from, want, out) => this.nav.nearest(from, want, this.oreAt, this.roomToWalk, out),
      nearestDrop: (from, avoid, out) => this.nearestDrop(from, avoid, out),
      claimed: this.claimed,
    };
  }

  /**
   * The nearest loose chunk by walking (Nav.nearest), skipping any within 3 m of `avoid`. Chunks
   * are bucketed by the fine grid's half cells (their edges fall on multiples of 1.25 m).
   */
  private nearestDrop(from: THREE.Vector3, avoid: THREE.Vector3 | null, out: THREE.Vector3[]): THREE.Vector3 | null {
    const key = (x: number, z: number) => (Math.floor(x / 1.25) + 10000) * 20000 + Math.floor(z / 1.25) + 10000;
    const cells = new Set<number>();
    for (const d of this.drops.list) {
      if (d.state !== "rest" || (avoid && d.pos.distanceToSquared(avoid) <= 9)) continue;
      cells.add(key(d.pos.x, d.pos.z));
    }
    if (!cells.size) return null;
    return this.nav.nearest(from, (x, z) => cells.has(key(x, z)), this.oreAt, this.roomToWalk, out);
  }

  /** An unbroken ore block on the cell under (x, z)? */
  private oreAt = (x: number, z: number): boolean => this.field.at(Math.round(x / CELL), Math.round(z / CELL)) !== null;

  /** Room for a worker's body (0.6) at (x, z): on the ground, clear of buildings and of ore blocks. */
  private roomToWalk = (x: number, z: number): boolean => {
    if (!this.nav.roomOnGround(x, z)) return false;
    const ci = Math.round(x / CELL);
    const cj = Math.round(z / CELL);
    const half = CELL / 2 + 0.6;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++)
        if (this.field.at(ci + di, cj + dj) && Math.abs(x - (ci + di) * CELL) < half && Math.abs(z - (cj + dj) * CELL) < half) return false;
    return true;
  };

  /**
   * Workers never stand inside each other (user 2026-10-21: two waited on the same spot by the
   * truck): overlapping ones are pushed apart, a seated one stays put.
   */
  private spreadWorkers(): void {
    const ws = this.workers;
    for (let i = 0; i < ws.length; i++)
      for (let j = i + 1; j < ws.length; j++) {
        const a = ws[i];
        const b = ws[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius - 0.2;
        if (d >= min) continue;
        const sa = a.state === "resting";
        const sb = b.state === "resting";
        if (sa && sb) continue;
        const ux = d > 1e-4 ? dx / d : 1;
        const uz = d > 1e-4 ? dz / d : 0;
        const push = min - d;
        const ka = sa ? 0 : sb ? 1 : 0.5;
        const kb = sb ? 0 : sa ? 1 : 0.5;
        a.pos.x -= ux * push * ka;
        a.pos.z -= uz * push * ka;
        b.pos.x += ux * push * kb;
        b.pos.z += uz * push * kb;
        for (const w of [a, b]) {
          this.field.collide(w.pos, w.radius);
          this.collideSolids(w.pos, w.radius);
          this.map.clamp(w.pos, w.radius);
        }
      }
  }

  private spawnWorker(id: number): void {
    const prof = WORKER_PROFILES.find((p) => p.id === id);
    if (!prof) return;
    const sp = this.st.spawns.find((s) => s.type === "workerSpawnPoint");
    const w = new WorkerUnit(this.scene, prof, this.workerWorld(), new THREE.Vector3(sp?.wx ?? 0, 0, sp?.wz ?? 0));
    w.setGear(S.run.gear?.[String(id)] ?? null);
    this.workers.push(w);
    const l = this.labels.add(w.model.root, "rest", "", 3.5);
    this.labels.show(l, false);
    this.restLabels.set(w, l);
  }

  /** The first hire ever is free ("I pulled some strings — cost is covered"). */
  private hirePrice(base: number): number {
    if (!S.dialogues.includes(-901)) return 0;
    const mult = WORKER_RULES.hirePriceMult;
    return Math.round(base * (mult[String(Math.min(stageNumber(), Math.max(...Object.keys(mult).map(Number))))] ?? 1));
  }

  private hire(id: number): void {
    const prof = WORKER_PROFILES.find((p) => p.id === id);
    if (!prof || S.run.workers.length >= this.st.maxWorkers) return sfx.deny();
    const price = this.hirePrice(prof.price);
    if (price > 0 && !spendCash(price)) return sfx.deny();
    if (!S.dialogues.includes(-901)) S.dialogues.push(-901);
    S.run.workers.push(id);
    markDirty();
    this.spawnWorker(id);
    this.workersPanel.applicants = this.workersPanel.applicants.filter((a) => a.profile.id !== id);
    sfx.unlock();
    events.emit("workerHired", { profile: id });
    this.workersPanel.render(this.time);
  }

  /* ---------- company HQ ---------- */

  private researchFloors(): void {
    this.hqPanel.lightOpen = true;
    // The Heavy Machine floor (Gear research) opens at stage 2's 40 %, or with quest 1038 "Research at HQ"
    // when that comes first (playtest 2026-10-24: at ~17 % only cash research was open, two of them cost
    // 5,225 with 3,500 in hand, while the Gear from the stage 1 clear lay unused).
    this.hqPanel.heavyOpen = this.level > 2 || (this.level === 2 && (this.progress() >= 40 || S.quest.index >= FIRST_RESEARCH_QUEST));
  }

  /** COMPANY button: the HQ tower with STAGE INFO (stage 2+); stage 1 only teases it. */
  private openCompany(): void {
    if (this.level < 2) return this.hud.toast("Opens after this stage!");
    if (this.clearing || this.hqTower.isOpen) return;
    this.researchFloors();
    const heavy = this.hqPanel.heavyOpen;
    void this.hqTower.open({
      mode: "info",
      workshopBuilt: true,
      heavy: heavy ? "built" : "soon",
      badge: this.hqPanel.hasAlert("light"),
      heavyBadge: heavy && this.hqPanel.hasAlert("heavy"),
      onUpgrade: () => this.openResearch("light"),
      onHeavyUpgrade: () => this.openResearch("heavy"),
      info: [
        { label: "LAND", value: this.st.name },
        { label: "PROGRESS", value: `${this.progress().toFixed(1)}%` },
      ],
    });
  }

  /**
   * Quest 1038 "Research at HQ" (playtest 2026-10-24): it only toasted "Level up at HQ!", and the HQ is a
   * small corner button nobody had pointed at. Mia says the Heavy Machine floor is open (803), then the
   * spotlight shows the HQ button and lets go into the tower (like `spotMount`).
   */
  private researchQuestIntro(): void {
    const spot = (tries = 90) => {
      if (this.clearing || this.hqTower.isOpen || this.quests.cur()?.type !== "ManagementUpgrade") return;
      // Lines still queued (the oil line, cashback) or a sheet open: wait, the dimmed screen would cover their buttons.
      if (this.dialogue.open || this.spot.open || this.inShop || document.querySelector(".sheet.on, .modal.on")) {
        if (tries > 0) setTimeout(() => spot(tries - 1), 1000);
        return;
      }
      void this.spot.show(this.hud.companyBtn, { hint: "Research at HQ!", anyTapAfter: 4 }).then(() => this.openCompany());
    };
    if (S.dialogues.includes(803)) spot();
    else this.once(803, () => spot());
  }

  private openResearch(floor: "light" | "heavy"): void {
    this.researchFloors();
    this.hqPanel.floor = floor;
    this.hqPanel.render();
    this.hqPanel.open();
  }

  /** APPLY on a finished research node: the effect starts now (reference flow). */
  private applyResearch(id: number): void {
    const r = S.mgmt.research;
    if (!r || r.id !== id || Date.now() < r.endsAt) return;
    S.mgmt.done.push(r.id);
    S.mgmt.research = null;
    markDirty();
    this.refreshPlayerStats();
    for (const w of this.workers) w.setGear(S.run.gear?.[String(w.profile.id)] ?? null);
    sfx.unlock();
    events.emit("managementUpgraded", { node: id });
    this.hqPanel.render();
    this.hqTower.setBadge(this.hqPanel.hasAlert("light"));
  }

  private research(id: number): void {
    const n = ResearchPanel.nodes().find((x) => x.id === id);
    if (!n || S.mgmt.research) return sfx.deny();
    if (n.currency === "Gear") {
      if (S.gear < n.price) return sfx.deny();
      S.gear -= n.price;
    } else if (!spendCash(n.price)) return sfx.deny();
    S.mgmt.research = { id, endsAt: Date.now() + n.researchSeconds * 1000 };
    markDirty();
    sfx.buy();
    this.hqPanel.render();
  }

  private tickResearch(): void {
    const r = S.mgmt.research;
    if (!r) return;
    // Finished research waits for APPLY in the workshop; say so once.
    if (Date.now() >= r.endsAt && !this.researchToasted.has(r.id)) {
      this.researchToasted.add(r.id);
      sfx.unlock();
      const n = ResearchPanel.nodes().find((x) => x.id === r.id);
      this.hud.toast(`${n?.title ?? "Research"} complete! Apply it at the Farm Office.`);
      this.hqTower.setBadge(true);
    }
  }

  /* ---------- progression ---------- */

  private progressT = 0;
  private tickProgression(dt: number): void {
    if ((this.progressT -= dt) > 0) return;
    this.progressT = 0.5;
    const pct = this.progress();
    if (this.level >= 2 && this.time > 40) this.once(1201);
    // First worker heading for a break: Hank points out the break area (903).
    if (!S.dialogues.includes(903) && this.workers.some((w) => w.state === "tired" || w.state === "resting")) {
      const c = this.cafeteria.seats[0];
      if (c) this.directCamera(c.pos);
      this.once(903);
    }
    // The Machinery Center opens once quest 1008 "Hold 250 or more Cash" is done (stage 1).
    const i1008 = QUESTS.findIndex((q) => q.id === 1008);
    this.shopB.setLocked(this.level === 1 && S.quest.index <= i1008, "OPENS AFTER<br>A QUEST");
    // Worker hiring opens at 20 % (condition group 1003).
    if (this.workerB.locked && (this.level > 1 || pct >= 20)) {
      this.workerB.setLocked(false);
      if (!this.workersPanel.restore(this.time)) this.workersPanel.roll(this.time, !S.dialogues.includes(-901), WORKER_RULES.onboarding.map((o) => o.profileId));
      this.applicantT = this.time;
      this.workerIntro();
      if (this.level > 1 && !S.run.appsToast) {
        S.run.appsToast = true;
        markDirty();
        this.hud.toast("New job applications!");
      }
    }
    if (!this.workerB.locked && this.time - this.applicantT >= (WORKER_RULES.recruit?.intervalSeconds ?? 180)) {
      this.applicantT = this.time;
      this.workersPanel.roll(this.time, false, []);
    }
    // Company HQ opens at stage 1, 60 %.
    const company = this.level >= 2 || pct >= 60;
    this.hud.companyBtn.style.display = company ? "" : "none";
    // A red "!" on it while a quest wants research there (1038; playtest 2026-10-24: nobody found HQ).
    const bang = company && this.level >= 2 && this.quests.cur()?.type === "ManagementUpgrade";
    if (this.hud.companyBtn.classList.contains("bang") !== bang) this.hud.companyBtn.classList.toggle("bang", bang);
    if (company && this.level === 1) this.once(804);
    if (this.level === 2 && pct >= 40) this.once(803);
    if (pct >= this.st.clearPercent && !S.run.clearHinted) {
      S.run.clearHinted = true;
      markDirty();
      this.once(1101);
    }
    // Cashback (stage ≥ 2): milestones of cash spent vs. the stage's cash target.
    if (this.level >= 2) {
      const ms = this.st.cashback;
      const k = S.run.spent / Math.max(1, this.st.cashTarget);
      while (S.run.cashbackClaimed < ms.length && k >= ms[S.run.cashbackClaimed].fraction) {
        const m = ms[S.run.cashbackClaimed++];
        if (m.item === "Gem") S.gems += m.amount;
        else S.gear += m.amount;
        markDirty();
        sfx.reward();
        this.hud.toast(`Cashback! +${m.amount} ${m.item}`);
      }
    }
  }

  /** Show a dialogue once ever; resolves when it closes (immediately if already seen). */
  private onceP(id: number): Promise<void> {
    return new Promise((res) => {
      if (S.dialogues.includes(id)) return res();
      this.once(id, res);
    });
  }

  /** "Clear Stage": STAGE COMPLETE → BONUS REWARDS → Sofia at HQ → Contract Room → next quarry. */
  private async clearStage(): Promise<void> {
    if (this.clearing || this.progress() < this.st.clearPercent) return;
    this.clearing = true;
    const next = STAGES[stageIndexOf(this.level + 1)] ?? null;
    const broken = this.st.blocks.length - this.field.remaining;
    const totMined = Object.values(S.run.mined).reduce((a, b) => a + b, 0) || 1;
    const totHauled = Object.values(S.run.hauled).reduce((a, b) => a + b, 0) || 1;
    const names = new Set(["PLAYER", ...Object.keys(S.run.mined), ...Object.keys(S.run.hauled)]);
    const workers = [...names]
      .map((n) => ({ name: n, mining: Math.round(((S.run.mined[n] ?? 0) / totMined) * 100), hauling: Math.round(((S.run.hauled[n] ?? 0) / totHauled) * 100) }))
      .sort((x, y) => y.mining + y.hauling - (x.mining + x.hauling));
    const stats = {
      stage: this.level,
      name: this.st.name,
      oreMined: broken,
      oreTotal: this.st.blocks.length,
      cashEarned: S.run.earned,
      workers,
      reward: this.st.reward,
      next: next
        ? {
            order: this.level + 1,
            name: next.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
            keyOre: ORES[next.keyOre]?.name ?? next.keyOre,
            difficulty: next.difficulty,
            client: next.client,
            detected: next.blocks.length,
            bonus: next.reward.find((r) => r.item === "Gear")?.amount ?? 0,
          }
        : null,
    };
    if (!S.run.rewarded) {
      platform.happytime();
      await this.clearFlow.results(stats);
      const from = await this.clearFlow.bonus(stats);
      for (const r of this.st.reward) {
        if (r.item === "Gear") S.gear += r.amount;
        else if (r.item === "Gem") S.gems += r.amount;
      }
      S.run.rewarded = true;
      markDirty();
      flush();
      sfx.reward();
      this.hud.flyIcons("gear", from, 8);
      events.emit("stageCleared", { stage: this.level });
    }
    if (!next) {
      this.hud.toast("More plots coming soon!");
      this.clearing = false;
      return;
    }
    // HQ hand-off (reference §5): the tower reveal, Sofia on the new workshop, a look at the
    // light-equipment upgrades, then NEXT STAGE → Contract Room.
    if (!S.dialogues.includes(801)) {
      const l801 = DIALOGUE.find((d) => d.id === 801)?.lines ?? [];
      await this.hqTower.reveal();
      await this.dialogue.say("sofia", l801.slice(0, 2));
      await this.spot.show(this.hqTower.upgradeButton());
      this.openResearch("light");
      if (l801.length > 2) await this.dialogue.say("sofia", l801.slice(2));
      if (this.hqPanel.isOpen)
        await new Promise<void>((res) => {
          const prev = this.hqPanel.onClose;
          this.hqPanel.onClose = () => {
            this.hqPanel.onClose = prev;
            prev?.();
            res();
          };
        });
      await this.hqTower.scaffoldNext();
      S.dialogues.push(801);
      markDirty();
    }
    await this.onceP(802);
    const pick = await this.hqTower.open({ mode: "next", workshopBuilt: true, badge: this.hqPanel.hasAlert("light"), onUpgrade: () => this.openResearch("light") });
    if (pick === "close") {
      this.clearing = false;
      return;
    }
    if (!(await this.clearFlow.contract(stats))) {
      this.hqTower.close();
      this.clearing = false;
      return;
    }
    events.emit("stageContracted", { stage: next.order });
    await this.dialogue.say("sofia", ["Deal signed! Let's bring in the harvest!"]);
    // Workers, machines and the map are per stage, like the original (user 2026-10-25, after a day of keeping the
    // machines: rent again on every new stage); cash, upgrades, tools, gems, gear stay. Whatever was still on the
    // way to a sale is bought out (`leftovers`), and the new stage opens with a round of gift boosts (`S.gift`).
    const left = this.leftovers();
    this.leaving = true;
    S.run = freshRun(stageNumber() + 1);
    S.gift = 0;
    if (left > 0) {
      S.cash += left;
      S.leftover = left;
    }
    resetBroken();
    markDirty();
    flush();
    document.body.classList.add("fadeout");
    setTimeout(() => location.reload(), 450);
  }

  /**
   * What a hit and the last blow look like (farm game, user 2026-10-28): rice gives off straw and grain and folds down
   * flat when cut; a tree spits wood chips and shakes leaves out of its crown, and topples on the last blow (Felled); a
   * rock throws stone chips and bits of its vein, sparks, and bursts into chunks.
   */
  private hitFx(b: Block, ore: OreDef, miner: Miner, broke: boolean): void {
    const fl = farmLook(ore.key);
    const c = this.field.center(b, this.tmp).setY(0);
    const to = new THREE.Vector3(miner.pos.x - c.x, 0, miner.pos.z - c.z).normalize();
    const pose = broke ? this.field.pose(b) : null;
    if (fl.kind === "crop") {
      const at = c.clone().addScaledVector(to, CELL * 0.25).setY(CELL * 0.3);
      this.dust.burst(at, fl.crown, broke ? 7 : 4, 1.2);
      this.dust.burst(at, fl.main, broke ? 5 : 3, 1.0);
      if (pose) this.felled.add(pose.geo, pose.mat, c.x, c.z, pose.yaw, pose.scale, b.away, "crop", pose.billboard, pose.depth, pose.flip);
      sfx.reap();
      return;
    }
    if (fl.kind === "wood" || fl.kind === "fruit") {
      const face = c.clone().addScaledVector(to, CELL * 0.3).setY(CELL * 0.4);
      // Chips of pale wood off the cut, leaves (and now and then a fruit-coloured bit) shaken out of the crown.
      this.dust.burst(face, fl.product, broke ? 10 : 6, 1.15);
      const crown = c.clone().setY(CELL * 1.5);
      this.dust.burst(crown, fl.crown, broke ? 14 : 5, broke ? 1.2 : 0.75);
      if (fl.extra !== undefined) this.dust.burst(crown, fl.extra, broke ? 5 : 2, 0.8);
      this.fx.puff(face, 0xe8dcc0, 2, CELL * 0.2, CELL * 0.18, 0.5);
      if (pose) {
        this.felled.add(pose.geo, pose.mat, c.x, c.z, pose.yaw, pose.scale, b.away, "tree", pose.billboard, pose.depth, pose.flip);
        sfx.chop();
        sfx.fall();
      } else sfx.chop();
      return;
    }
    // Rock: stone chips, bits of the vein / crystal, sparks; the last blow bursts it.
    const face = c.clone().addScaledVector(to, CELL * 0.4).setY(CELL * 0.45);
    const lean = to.clone().multiplyScalar(0.3);
    const stone = this.field.chipMaterial(0x8c8378);
    const vein = this.field.chipMaterial(fl.crown);
    if (!broke) {
      sfx.hit();
      this.shards.burst(face, stone, 3, CELL * 0.28, 1.3, lean, 0.6, 1.35);
      this.shards.burst(face, vein, 2, CELL * 0.18, 1.4, lean, 0.6, 1.35);
      this.dust.burst(face, 0xa39a8e, 6, 1.1);
      this.fx.flash(face, CELL * 0.7);
      this.fx.glint(face, fl.crown, 2, CELL * 0.2);
      return;
    }
    sfx.breakBlock();
    const at = c.clone().setY(CELL * 0.35);
    this.shards.burst(at, stone, 5, CELL * 0.55, 1.1, undefined, 1, 1, true);
    this.shards.burst(at.clone().setY(CELL * 0.5), vein, 5, CELL * 0.25, 1.3);
    this.shards.burst(at.clone().setY(CELL * 0.5), stone, 5, CELL * 0.2, 1.5);
    this.dust.burst(at, 0xa39a8e, 12, 1.3);
    this.fx.flash(at.clone().setY(CELL * 0.5), CELL * 1.4);
    this.fx.puff(at.clone().setY(CELL * 0.4), 0xc8bfb2, 8, CELL * 0.4, CELL * 0.55);
    this.fx.ring(at, CELL * 0.3, CELL * 1.0);
    this.fx.glint(at.clone().setY(CELL * 0.6), fl.crown, 6, CELL * 0.3);
  }

  private buildBase(): void {
    const roads = this.st.props.filter((p) => p.type === "road");
    const s = CELL;
    const shed = (b: { wx: number; wz: number }) => ({ x0: b.wx - s * 1.3, x1: b.wx + s * 1.3, z0: b.wz - s * 1.45, z1: b.wz + s * 0.3 });
    for (const b of this.st.buildings) {
      switch (b.type) {
        case "furnace":
        case "forge": {
          const h = new Furnace(this, b, b.type === "forge" ? "forge" : "mill");
          if (b.type === "forge") this.forge = h;
          else this.furnace = h;
          this.houses.push(h);
          this.solids.push({ x0: b.wx - s * 0.6, x1: b.wx + s * 1.6, z0: b.wz - s * 1.9, z1: b.wz + s * 0.15 });
          break;
        }
        case "salesStand":
          // Trading house: its SELL / CASH pads go on the side facing the furnace (user).
          {
            const f = this.st.buildings.find((x) => x.type === "furnace");
            this.sales = new SalesStand(this, b, roads, f && f.wx < b.wx ? -1 : 1);
          }
          this.solids.push(shed(b));
          break;
        case "upgradeBuilding":
          this.upgradeB = new EntryBuilding(this, "upgrade", b);
          this.solids.push(shed(b));
          break;
        case "machineryShop":
          this.shopB = new EntryBuilding(this, "shop", b);
          this.solids.push(shed(b));
          break;
        case "workerBuilding":
          this.workerB = new EntryBuilding(this, "worker", b);
          this.solids.push(shed(b));
          break;
        case "oilStation":
          this.oil = new OilStation(this, b);
          this.oil.onBackFull = () => this.backFullAtOil();
          this.solids.push({ x0: b.wx - s * 1.0, x1: b.wx + s * 1.1, z0: b.wz - s * 1.35, z1: b.wz - s * 0.2 });
          break;
        case "oreStorage":
          this.storage = new OreStorage(this, b);
          break;
      }
    }
    // The price list stands beside the trading house, on the side away from its pads.
    {
      const ores = [...new Set(this.st.blocks.map((b) => b.ore))];
      this.solids.push(priceBoard(this.scene, this.sales.boardAt.right, this.sales.boardAt.front, ores));
    }
    this.cafeteria = new Cafeteria(this, this.st.cafeteria);
    this.cafeteria.onUnlock = () => this.ad.show("MORE SEATS");
    for (const c of this.st.cafeteria)
      if (c.type === "cafeteriaTruck") this.solids.push({ x0: c.wx - s * 1.2, x1: c.wx + s * 1.2, z0: c.wz - s * 0.9, z1: c.wz + s * 0.3 });

    this.upgradeB.onOpen = () => {
      events.emit("buildingEntered", { building: "upgrade" });
      this.upgradePanel.render();
      this.upgradePanel.open();
    };
    this.upgradeB.onClose = () => this.upgradePanel.close();
    this.shopB.onOpen = () => this.enterShop();
    this.shopB.onClose = () => this.shopPanel.close();
    this.workerB.setLocked(true, "HARVEST 20% FIRST");
    this.workerB.lockHint = "Keep harvesting to unlock farmhands!";
    this.shopB.lockHint = "Finish your quests to open this!";
    this.workerB.onOpen = () => {
      // The building is Worker Management; the Job Board is one tap away.
      this.workerMgmt.maxWorkers = this.st.maxWorkers;
      this.workerMgmt.applicants = this.liveApplicants();
      this.workerMgmt.render();
      this.workerMgmt.open();
      this.once(902);
    };
    this.workerB.onClose = () => {
      this.workersPanel.close();
      this.workerMgmt.close();
    };
  }

  /* ---------- player & equipment ---------- */

  refreshPlayerStats(): void {
    const p = this.player;
    p.power = power(S.equipMining);
    p.interval = interval(S.equipMining);
    p.stack.capacity = cargo(S.equipCarrying);
    p.absorb = absorb(S.equipCarrying);
    p.speed = moveSpeed("player") * exoSpeed() * EASE.walk;
    for (const v of this.vehicles) v.refresh();
  }

  private buyUpgrade(k: string): void {
    const price = nextPrice(k);
    if (price === null || !spendCash(price)) return sfx.deny();
    S.upgrades[k] = level(k) + 1;
    markDirty();
    sfx.buy();
    this.refreshPlayerStats();
    events.emit("statUpgraded", { key: k, level: S.upgrades[k] });
    this.upgradePanel.render();
  }

  private buyTool(k: string): void {
    if (S.owned.includes(k) || !spendCash(equipPrice(k))) return sfx.deny();
    S.owned.push(k);
    if (!S.unlocked.includes(k)) S.unlocked.push(k);
    this.equip(k);
    sfx.unlock();
    events.emit("lightEquipPurchased", { key: k });
    this.refreshToolsBtn();
    this.shopPanel.render();
    // Gus's two lines only: the new tool is already in hand, so no spotlight on EQUIPMENT and no
    // inventory forced open (user 2026-10-22: three of five players who quit on quest 1011 "Smash Ore"
    // left within a minute of buying their first tool, after that step and still in the hall).
    this.once(401);
  }

  /**
   * EQUIPMENT only once there is something to swap: the starter pickaxe and wooden carrier are
   * all a new player has, and the button sits where a right thumb steers (user: it popped up
   * twice in the first minutes on an iPhone). The first tool bought brings it in (dialogue 401
   * names it).
   */
  private refreshToolsBtn(): void {
    const show = S.owned.some((k) => k !== "pickaxe" && k !== "woodenCarrier");
    const want = show ? "" : "none";
    if (this.hud.toolsBtn.style.display !== want) this.hud.toolsBtn.style.display = want;
  }

  private equip(k: string): void {
    const e = EQUIP[k];
    if (!e || !S.owned.includes(k)) return;
    // "Take it back anytime you need it": a tool lent to a worker comes back to you.
    const holder = gearHolder(k);
    if (typeof holder === "number") this.assignGear(holder, null);
    if (e.sub === "MiningTool") S.equipMining = k;
    else if (e.sub === "CarryingTool") S.equipCarrying = k;
    markDirty();
    this.refreshPlayerStats();
    this.shopPanel.render();
  }

  private rent(k: string): void {
    if (S.run.rentals.includes(k) || !spendCash(equipPrice(k))) return sfx.deny();
    S.run.rentals.push(k);
    if (!S.unlocked.includes(k)) S.unlocked.push(k);
    markDirty();
    sfx.unlock();
    const v = this.spawnVehicle(k, !this.inShop);
    if (this.inShop) {
      v.model.root.visible = false;
      this.pendingDeliveries.push(v);
    }
    events.emit("heavyEquipRented", { key: k });
    this.shopPanel.render();
    if (!S.dialogues.includes(501) && !this.pinSpotFor) this.pinSpotFor = v;
    this.once(501);
    if (v.fuelled && this.oil.locked) {
      this.oil.unlock();
      // Hank explains the oil station once the machine has landed, with the camera on it.
      this.oilLinePending = true;
      if (!this.inShop) this.playOilLine();
    }
  }

  private spawnVehicle(k: string, deliver = false): Vehicle {
    const v = new Vehicle(this.scene, k);
    v.pos.copy(this.parkingSpot());
    v.facing = Math.PI;
    v.update(0);
    this.vehicles.push(v);
    if (v.fuelled) this.fuelLabels.set(v, this.labels.add(v.model.root, "fuel", "", 3.3)); // under the mount pin (6.2), whose tail reaches 4.6
    // Green map-pin with a steering wheel over every parked vehicle: tap it (or walk in) to mount.
    const pin = this.labels.add(v.model.root, "pin", `<button class="mpin">⎈</button><div class="vdist"></div>`, 6.2);
    pin.el.style.pointerEvents = "auto";
    pin.el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (this.driving || this.dialogue.open) return;
      if (Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z) > 9) return this.hud.toast("Move closer to climb in!");
      this.mount(v);
    });
    this.pinLabels.set(v, pin);
    if (deliver) {
      v.model.root.position.y = 9;
      this.deliveries.push({ v, t: 0 });
    }
    return v;
  }

  /**
   * Where the next machine parks: the map's spots in turn, then open ground round them, clear of the others
   * (machines are kept for good, so a player can have more of them than the map has spots).
   */
  private parkingSpot(): THREE.Vector3 {
    const slots = this.vehicleSlots;
    const n = this.vehicles.length;
    if (!slots.length) return this.player.pos.clone();
    if (n < slots.length) return slots[n].clone();
    for (const r of [3.5, 5, 6.5, 8])
      for (const base of slots)
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const x = base.x + Math.cos(a) * r;
          const z = base.z + Math.sin(a) * r;
          if (this.openGround(x, z) && this.vehicles.every((v) => Math.hypot(v.pos.x - x, v.pos.z - z) > 3.2)) return new THREE.Vector3(x, 0, z);
        }
    return slots[n % slots.length].clone();
  }

  private mount(v: Vehicle): void {
    // Hand cargo moves into a carrying vehicle when you climb on (reference: "5/25").
    if (v.carries && v.key !== "allTerrainVehicle") {
      for (let i = this.player.stack.items.length - 1; i >= 0 && !v.stack.full; i--) {
        const it = this.player.stack.items[i];
        if (v.accepts(it)) {
          this.player.stack.take((x) => x === it);
          v.stack.push(it);
        }
      }
    }
    this.driving = v;
    this.lastRide = v;
    v.driven = true;
    this.player.driving = v.key !== "wheelbarrow";
    this.hud.showExit(true);
    sfx.engine(true);
    events.emit("vehicleMounted", { key: v.key });
    // "Getting off is just as easy — hit the dismount button": spotlight it (ref/20).
    this.once(502, () => {
      if (this.driving === v && !v.moving) void this.spot.show(this.hud.exitBtn).then(() => this.dismount());
    });
  }

  dismount(): void {
    const v = this.driving;
    if (!v || v.moving) return;
    v.driven = false;
    this.driving = null;
    this.player.driving = false;
    // Step out to the vehicle's left side.
    const side = v.facing + Math.PI / 2;
    this.player.pos.set(v.pos.x + Math.sin(side) * (v.radius + 0.9), 0, v.pos.z + Math.cos(side) * (v.radius + 0.9));
    this.mountHold = -1; // no instant re-mount until the player walks away
    this.hud.showExit(false);
  }

  /* ---------- Machinery Center ---------- */

  private fade(then: () => void): void {
    document.body.classList.add("blink");
    setTimeout(() => {
      then();
      setTimeout(() => document.body.classList.remove("blink"), 60);
    }, 220);
  }

  private enterShop(): void {
    if (this.inShop) return;
    this.fade(() => {
      this.inShop = true;
      this.shopArmed = false;
      this.player.pos.copy(this.shopIn.entry);
      this.player.facing = Math.PI;
      this.shopIn.refresh();
      this.stage.follow(this.player.pos, true);
      events.emit("buildingEntered", { building: "shop" });
      if (!this.shopVisited && !S.dialogues.includes(302)) {
        // First visit: Hank's line, then a quick camera tour across the shelves.
        this.once(302, () => {
          const pts = this.shopIn.tour();
          pts.forEach((pt, i) => setTimeout(() => this.directCamera(pt), i * 1300));
        });
      }
      this.shopVisited = true;
    });
  }

  private exitShop(): void {
    events.emit("buildingLeft", { building: "shop" });
    this.fade(() => {
      this.inShop = false;
      this.shopIn.hideCard();
      this.player.pos.copy(this.shopB.zone.center).add(new THREE.Vector3(0, 0, CELL * 1.0));
      this.stage.follow(this.player.pos, true);
      for (const v of this.pendingDeliveries) {
        v.model.root.visible = true;
        v.model.root.position.y = 9;
        this.deliveries.push({ v, t: 0 });
      }
      if (!this.pendingDeliveries.length) this.playOilLine();
      this.pendingDeliveries = [];
      // A quest that started inside (its camera pan only showed the door): show where to go now.
      const q = this.quests.cur();
      if (q?.guide.type === "CameraDirecting" && (this.learning() || this.newThing(q))) {
        const t = this.guideTarget(q.guide.detail);
        if (t) setTimeout(() => this.directCamera(t), 400);
      }
    });
  }

  private pushOut(p: THREE.Vector3, r: number, s: Solid): void {
    const qx = Math.max(s.x0, Math.min(p.x, s.x1));
    const qz = Math.max(s.z0, Math.min(p.z, s.z1));
    const dx = p.x - qx;
    const dz = p.z - qz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (r - d);
      p.z += (dz / d) * (r - d);
    } else p.z = s.z1 + r;
  }

  /* ---------- guidance ---------- */

  /** Pan the camera to a point for 1.5 s — after any open dialogue, never twice in a row. */
  directCamera(p: THREE.Vector3): void {
    if (this.dialogue.open) {
      this.pendingPan = p.clone();
      return;
    }
    if (this.time - this.lastPanAt < 4 && this.lastPan.distanceTo(p) < 2) return;
    this.lastPanAt = this.time;
    this.lastPan.copy(p);
    this.directP.copy(p);
    this.directT = 1.5;
  }

  /**
   * Show an onboarding dialogue once ever (by id). It is recorded as seen when it closes,
   * so a reload in the middle replays it (and whatever its callback starts).
   */
  once(id: number, after?: () => void): void {
    if (S.dialogues.includes(id)) return;
    const waiting = this.saying.get(id);
    if (waiting) {
      if (after) waiting.push(after);
      return;
    }
    const d = DIALOGUE.find((x) => x.id === id);
    const done = () => {
      if (!S.dialogues.includes(id)) S.dialogues.push(id);
      markDirty();
      const cbs = this.saying.get(id) ?? [];
      this.saying.delete(id);
      for (const cb of cbs) cb();
    };
    this.saying.set(id, after ? [after] : []);
    if (!d || !d.lines.length) return done();
    void this.dialogue.say(this.speaker(id), d.lines).then(done);
  }

  private speaker(id: number): "hank" | "sofia" {
    return id === 804 || id === 801 || id === 802 || id === 803 || id === 1201 ? "sofia" : "hank";
  }

  /**
   * Spotlight a parked vehicle's mount pin; tapping it mounts. The camera stays on the vehicle
   * while the spotlight is up (user 2026-10-20 on an iPhone: the pan back to the player took the
   * pin off screen, the spotlight followed it there and the dimmed screen took every tap).
   */
  private spotMount(v: Vehicle): void {
    this.directCamera(v.pos);
    setTimeout(() => {
      const pin = this.pinLabels.get(v);
      if (!pin || this.driving || this.inShop) return;
      this.spotFocus = v;
      void this.spot.show(pin.el.querySelector("button") ?? pin.el).then(() => {
        this.spotFocus = null;
        if (!this.driving) this.mount(v);
      });
    }, 1500);
  }
  /** Vehicle the camera holds on while its mount pin has the spotlight. */
  private spotFocus: Vehicle | null = null;

  private playOilLine(): void {
    if (!this.oilLinePending) return;
    this.oilLinePending = false;
    this.directCamera(this.oil.zone.center);
    this.once(1501);
  }

  /**
   * Workers unlocked (901): the foreman's first lines, the Job Board opens on the third, and the
   * rest of his lines follow when you close it (reference order).
   */
  private workerIntro(): void {
    if (S.dialogues.includes(901) || this.saying.has(901)) return;
    const d = DIALOGUE.find((x) => x.id === 901);
    const lines = d?.lines ?? [];
    // The Job Board opens after the third line ("...the first one's on the house. Sign right here!").
    const cut = Math.min(3, lines.length);
    this.saying.set(901, []);
    this.directCamera(this.workerB.zone.center);
    void this.dialogue.say("hank", lines.slice(0, cut)).then(() => {
      this.workersPanel.maxWorkers = this.st.maxWorkers;
      this.workersPanel.render(this.time);
      this.workersPanel.open();
      const wait = setInterval(() => {
        if (this.workersPanel.isOpen) return;
        clearInterval(wait);
        void this.dialogue.say("hank", lines.slice(cut)).then(() => {
          S.dialogues.push(901);
          this.saying.delete(901);
          markDirty();
        });
      }, 300);
    });
  }

  private onQuestStart(q: QuestDef): void {
    if (q.id === 1005) this.once(201);
    if (q.id === 1009) this.once(301);
    if (q.type === "ManagementUpgrade" && this.level >= 2) this.researchQuestIntro();
  }

  private nearestBlock(from: THREE.Vector3, pred?: (b: Block) => boolean): Block | null {
    let best: Block | null = null;
    let bd = Infinity;
    for (const b of this.field.blocks) {
      if (!b.alive || (pred && !pred(b))) continue;
      const d = (b.cx * CELL - from.x) ** 2 + (b.cz * CELL - from.z) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  guideTarget(detail: string): THREE.Vector3 | null {
    const from = this.controlled().pos;
    // Inside the Machinery Center everything outside is reached through the door.
    if (this.inShop && detail !== "ShopBuilding") return this.shopIn.exit.center.clone();
    const carried = this.controlled().stack.items;
    switch (detail) {
      case "MineBlock":
      case "RockMineBlock":
      case "MetalMineBlock": {
        const cat = detail === "RockMineBlock" ? "rock" : detail === "MetalMineBlock" ? "metal" : null;
        const b = this.nearestBlock(from, cat ? (x) => this.st.blocks[x.i].ore.category === cat : undefined);
        return b ? this.field.center(b, new THREE.Vector3()).setY(0) : null;
      }
      case "Smelter": {
        // Nothing to deliver yet: go mine first.
        if (!carried.some((i) => itemKind(i) === "mineral")) {
          const b = this.nearestBlock(from);
          if (b) return this.field.center(b, new THREE.Vector3()).setY(0);
        }
        return this.rawPad(carried).clone();
      }
      case "SalesStand": {
        if (this.sales.moneyWaiting > 0) return this.sales.moneyPos.clone();
        // No ingots on you: pick them up at the furnace tray first (reference 103/104).
        const tray = this.trayWaiting();
        if (!carried.some((i) => itemKind(i) === "ingot") && tray) return tray.trayPos.clone();
      }
        return this.sales.zone.center.clone();
      case "UpgradeBuilding":
        return this.upgradeB.zone.center.clone();
      case "ShopBuilding": {
        if (!this.inShop) return this.shopB.zone.center.clone();
        // The quest's own item; "rent / buy any" (1021 Rent a Heavy Machine) points at the cheapest
        // one on sale. It used to point at the door: a player in the hall with the cash to rent
        // was sent back out (user 2026-10-20).
        const q = this.quests?.cur();
        const key = q && q.condition ? EQUIP_BY_ID.get(q.condition)?.key : q?.type === "RentHeavyEquip" || q?.type === "PurchaseLightEquip" ? this.shopPick(q.type === "RentHeavyEquip") : undefined;
        return (key ? this.shopIn.platePos(key) : null) ?? this.shopIn.exit.center.clone();
      }
      case "WorkerBuilding":
        return this.workerB.zone.center.clone();
      case "Wheelbarrow":
      case "HydraulicBreaker": {
        const key = detail === "Wheelbarrow" ? "wheelbarrow" : "hydraulicBreaker";
        const v = this.vehicles.find((x) => x.key === key) ?? this.vehicles[0];
        return v ? v.pos.clone() : this.shopB.zone.center.clone();
      }
    }
    return null;
  }

  /** Seconds of play in which the player got nowhere (`stuckKey` unchanged); see `updateStuck`. */
  private stuckT = 0;
  private stuckKey = "";

  /**
   * Past the Sledgehammer the arrow is back only for a player who has got nowhere for STUCK_GUIDE
   * seconds (user 2026-10-24: guide again, not too often): the quest has not moved on, and nothing
   * was picked up, delivered, sold or spent. Mining on with a full back counts as getting nowhere,
   * unless the quest is to clear the stage. Menus, dialogue and camera pans stop the clock.
   */
  private updateStuck(dt: number): void {
    const q = this.quests.cur();
    const clear = q?.type === "StageProgression" ? Math.floor(this.progress()) : 0;
    const key = `${S.quest.index}|${S.quest.progress}|${Math.floor(S.cash)}|${this.controlled().stack.count}|${clear}|${this.inShop}|${!!this.driving}`;
    if (key !== this.stuckKey) {
      this.stuckKey = key;
      this.stuckT = 0;
    } else if (this.hostPlaying && this.directT <= 0) this.stuckT += dt;
  }

  /**
   * Where the green chevrons lead (user 2026-10-19: only when the quest needs it and there is
   * something to do right now). An empty tank first (reference §3.8), then cash on the CASH spot
   * while you're around the base. Nothing calls you home while you mine with room on your back,
   * and a building is pointed at once you can pay for what the quest wants there; until then
   * only the next step toward that money (ingots to SELL, a load to the furnace, the tray).
   * The whole loop is shown until the Sledgehammer is bought; after that only for something new,
   * or once the player is stuck (`updateStuck`).
   */
  private arrowTarget(): THREE.Vector3 | null {
    const oil = this.refuelTarget();
    if (oil) return oil;
    const q = this.quests.guided();
    const stuck = this.stuckT >= STUCK_GUIDE;
    const learning = this.learning() || (this.level === 1 && S.quest.index <= MONEY_TAUGHT) || stuck;
    // In the Machinery Center with nothing to buy there now (no buy / rent quest, or not the cash for
    // it): the door (user 2026-10-22: after the first tool a player stood in the hall with no arrow).
    if (this.inShop && !this.dialogue.open) {
      const cost = q && (q.type === "PurchaseLightEquip" || q.type === "RentHeavyEquip") ? this.questCost(q) : undefined;
      if (cost === undefined || cost === null || S.cash < cost) return this.shopIn.exit.center.clone();
    }
    // Past the tutorial only something new gets the arrow (user: the loop needs no guide by then).
    if (!learning && !(q && this.newThing(q))) return null;
    const camera = q?.guide.type === "CameraDirecting";
    if (this.inShop) return q && camera ? this.guideTarget(q.guide.detail) : null;
    const me = this.controlled();
    const busy = this.busyMining();
    const ahead = this.sales.cashAhead;
    const cashSpot = this.sales.moneyPos;
    const holding = (k: string) => me.stack.items.some((i) => itemKind(i) === k);
    if (this.quests.waiting) return busy ? null : cashSpot;
    if (learning && !busy && !holding("ingot")) {
      // Cash waiting while you're around the base; a sale running while you're at the market.
      const d = Math.hypot(me.pos.x - cashSpot.x, me.pos.z - cashSpot.z);
      if ((ahead > 0 && d < CELL * 9) || (this.sales.selling && d < CELL * 3.2)) return cashSpot;
    }
    if (!q) return null;
    const cost = this.questCost(q);
    if (cost === undefined) return null;
    if (cost !== null && S.cash < cost) {
      if (S.cash + ahead >= cost) return cashSpot;
      if (!learning) return null;
      // Stuck with empty hands and nothing in the furnace: back to the ore.
      return this.earnStep(busy) ?? (stuck && !busy ? this.guideTarget("MineBlock") : null);
    }
    if (!camera) return null;
    switch (q.guide.detail) {
      case "Smelter":
        if (busy) return null;
        return holding("mineral") ? this.rawPad(this.controlled().stack.items) : this.guideTarget("MineBlock");
      case "SalesStand":
        if (busy) return null;
        return this.earnStep(busy) ?? (this.sales.selling ? cashSpot : this.guideTarget("MineBlock"));
    }
    return this.guideTarget(q.guide.detail);
  }

  /**
   * A dry tank (the machine you drive, or the last one you got off) leads to oil: the nearest open
   * OIL pad, then, with barrels on your back, back to that machine (user 2026-10-20: running dry
   * had no guide; the arrow used to vanish the moment you got off to fetch oil).
   */
  private refuelTarget(): THREE.Vector3 | null {
    const v = this.driving ?? this.lastRide;
    if (this.time > this.refuelUntil || this.inShop || !v || !v.empty || !this.vehicles.includes(v)) return null;
    const me = this.controlled();
    if (!this.driving && me.stack.items.includes(OIL_ITEM)) return v.pos;
    // A full back takes no barrels at OIL (playtest 2026-10-24: players stood on the pad, nothing came):
    // unload first, at REFINING / SELL.
    if (!this.driving && me.stack.full) return this.earnStep(false);
    let best: THREE.Vector3 | null = null;
    for (const o of [this.oil, ...this.extraOil])
      if (!o.locked && (!best || o.zone.center.distanceToSquared(me.pos) < best.distanceToSquared(me.pos))) best = o.zone.center;
    return best;
  }

  private backFullSaid = -99;
  /** On OIL with a full back (playtest 2026-10-24: the pad gave nothing and said nothing). */
  private backFullAtOil(): void {
    if (this.time - this.backFullSaid < 6) return;
    this.backFullSaid = this.time;
    this.hud.toast("Basket full! Drop your load at MILL or FORGE, then grab fuel");
  }

  /** The tank just ran dry under you: say what to do, and the first time show where the oil is. */
  private outOfOil(v: Vehicle): void {
    this.refuelUntil = this.time + 30;
    events.emit("fuelEmpty", { key: v.key });
    this.hud.toast("Out of fuel! Drive back to FUEL, or bring cans from it");
    if (S.dialogues.includes(-902)) return;
    S.dialogues.push(-902);
    markDirty();
    const at = this.refuelTarget();
    if (at) this.directCamera(at.clone());
  }

  /** Auto-mining (`autoMine`): the spot beside the next block, the way there, the last search. */
  private autoGoal: THREE.Vector3 | null = null;
  private autoPath: THREE.Vector3[] = [];
  private autoLookAt = -99;
  private autoDir = new THREE.Vector3();
  /** Game time of the last touch / mouse hold / key press. */
  private touchedAt = 0;

  /**
   * The player let go right after mining and nothing is left in reach: the direction to the
   * nearest block with a free side, by walking, within AUTO_MINE_REACH (user 2026-10-22: "if the
   * worker was smashing rocks, he goes on to the one beside it"). A full back does not stop it (the
   * player mines on with a full back too, chunks wait on the ground); AUTO_MINE_IDLE after the last
   * touch or key it does (no mining the quarry away while nobody plays). Not in a vehicle or the
   * shop. Null = stand still.
   */
  private autoMine(): THREE.Vector3 | null {
    const p = this.player;
    if (!this.autoGoal && this.time - this.minedAt > 2) return null;
    if (this.time - this.touchedAt > AUTO_MINE_IDLE || this.mining.target(p)) return null;
    // Put somewhere else meanwhile (off a vehicle, out of the shop): the old goal is not "beside" any more.
    if (this.autoGoal && Math.hypot(this.autoGoal.x - p.pos.x, this.autoGoal.z - p.pos.z) > AUTO_MINE_REACH + CELL) this.autoGoal = null;
    if (!this.autoGoal) {
      if (this.time - this.autoLookAt < 1) return null;
      this.autoLookAt = this.time;
      const f = this.field;
      const r2 = AUTO_MINE_REACH * AUTO_MINE_REACH;
      this.autoGoal = this.nav.nearest(
        p.pos,
        (x, z) => {
          if ((x - p.pos.x) ** 2 + (z - p.pos.z) ** 2 > r2) return false;
          // A half cell touches the two ore cells on its own sides (as WorkerUnit.pickBlock).
          const ci = Math.round(x / CELL);
          const cj = Math.round(z / CELL);
          return !!(f.at(ci + (x > ci * CELL ? 1 : -1), cj) || f.at(ci, cj + (z > cj * CELL ? 1 : -1)));
        },
        this.oreAt,
        this.roomToWalk,
        this.autoPath,
      );
      if (!this.autoGoal) return null;
    }
    while (this.autoPath.length > 1 && Math.hypot(this.autoPath[0].x - p.pos.x, this.autoPath[0].z - p.pos.z) < 0.35) this.autoPath.shift();
    const to = this.autoPath[0] ?? this.autoGoal;
    const dx = to.x - p.pos.x;
    const dz = to.z - p.pos.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.2) return null;
    return this.autoDir.set(dx / l, 0, dz / l);
  }

  /** Once, after AUTO_MINE_TIP_AFTER of play, mid-swing: Gus tells the player about hands-off mining. */
  private autoTip(): void {
    if ((S.played ?? 0) >= AUTO_MINE_TIP_AFTER && !S.dialogues.includes(1601) && !this.spot.open && this.directT <= 0) this.once(1601);
  }

  /** Within 3 cells of whoever you control: already on screen, no camera pan needed. */
  private beside(p: THREE.Vector3 | null): boolean {
    if (!p) return false;
    const me = this.controlled().pos;
    return Math.hypot(p.x - me.x, p.z - me.z) < CELL * 3;
  }

  /** Stage 1 until the first upgrades are bought (quest 1006): the loop is still being learnt. */
  private learning(): boolean {
    return this.level === 1 && S.quest.index <= LOOP_TAUGHT;
  }

  /**
   * A quest that brings something new keeps its arrow and camera pan after the tutorial: a
   * building to visit, a tool to buy, a machine to rent or drive, the first hire ever. Routine
   * ones (mine, smelt, sell, upgrade, save up, clear N %) get the quest card only.
   */
  private newThing(q: QuestDef): boolean {
    if (q.type === "HireWorker") return !S.dialogues.includes(-901);
    // Quest 1019 "Buy an Upgrade" x5 (user 2026-10-22): of five players who quit on it, two had the
    // cash and bought no upgrade at all (one rented machines instead). The Upgrade building was last
    // pointed out at quest 1005, minutes earlier: pan to it again, and the arrow once one is affordable.
    if (q.id === 1019) return true;
    return q.type === "EnterBuilding" || q.type === "PurchaseLightEquip" || q.type === "RentHeavyEquip" || q.type === "VehicleMounted";
  }

  /** Swinging at ore (or right next to it) with room left on your back. */
  private busyMining(): boolean {
    const me = this.controlled();
    if (me.stack.capacity > 0 && me.stack.full) return false;
    return this.time - this.minedAt < 2.5 || this.field.near(me.pos.x, me.pos.z, CELL * 1.6, this.nearOre).length > 0;
  }

  /** The next step toward money; null while mining or when there is nothing to carry. */
  private earnStep(busy: boolean): THREE.Vector3 | null {
    if (busy) return null;
    const items = this.controlled().stack.items;
    if (items.some((i) => itemKind(i) === "ingot")) return this.sales.zone.center;
    if (items.some((i) => itemKind(i) === "mineral")) return this.rawPad(items);
    return this.trayWaiting()?.trayPos ?? null;
  }

  /** The processing house that takes a raw item, or made a product (the Mill or the Forge). */
  houseFor(item: number): Furnace {
    const ore = oreOfItemId(item);
    return ore && houseOf(ore) === "forge" ? this.forge : this.furnace;
  }

  /** Where the raw items on a back go first: the pad of the house that takes the first of them. */
  private rawPad(items: number[]): THREE.Vector3 {
    const raw = items.find((i) => itemKind(i) === "mineral");
    return (raw === undefined ? this.furnace : this.houseFor(raw)).zone.center;
  }

  /** A house with products on its tray (or on their way), the fuller tray first. */
  private trayWaiting(): Furnace | null {
    let best: Furnace | null = null;
    for (const h of this.houses) {
      if (h.output.count === 0 && !h.busy) continue;
      if (!best || h.output.count > best.output.count) best = h;
    }
    return best;
  }

  /** Machines (rentals) or hand tools on sale now that you don't have yet, cheapest first. */
  private onSale(rental: boolean): { key: string; price: number }[] {
    const open = (e: EquipDef) => {
      if (e.unlock.type === "ReachStage") return this.level >= e.unlock.value;
      if (e.unlock.type === "UnlockEquipment") {
        const need = EQUIP_BY_ID.get(e.unlock.value);
        return !need || S.unlocked.includes(need.key);
      }
      return true;
    };
    return Object.values(EQUIP)
      .filter((e) => e.category !== "Character" && e.price > 0 && e.rental === rental && open(e))
      .filter((e) => !(rental ? S.run.rentals : S.owned).includes(e.key))
      .map((e) => ({ key: e.key, price: equipPrice(e.key) }))
      .sort((a, b) => a.price - b.price);
  }

  private cheapestOnSale(rental: boolean): string | undefined {
    return this.onSale(rental)[0]?.key;
  }

  /**
   * What a "rent / buy any" quest points at in the hall: the dearest one you can pay for now,
   * else the cheapest. At 1021 (right after "Save Up 2,500") that is the Hydraulic Breaker the
   * next quest asks you to drive, not the cheaper Wheel Loader.
   */
  private shopPick(rental: boolean): string | undefined {
    const all = this.onSale(rental);
    const can = all.filter((x) => x.price <= S.cash);
    return (can.length ? can[can.length - 1] : all[0])?.key;
  }

  /**
   * Cash the quest's next action costs: null when it costs nothing (or isn't a purchase),
   * undefined when it can't be done right now (no applicants, every machine rented).
   */
  private questCost(q: QuestDef): number | null | undefined {
    const key = q.condition ? EQUIP_BY_ID.get(q.condition)?.key : undefined;
    const cheapest = (rental: boolean) => {
      const k = this.cheapestOnSale(rental);
      return k ? equipPrice(k) : undefined;
    };
    switch (q.type) {
      case "HoldCurrency":
        return q.target;
      case "FieldUpgrade":
        return this.upgradePanel.cheapest();
      case "PurchaseLightEquip":
        return key ? equipPrice(key) : cheapest(false);
      case "RentHeavyEquip":
        return key ? equipPrice(key) : cheapest(true);
      case "HireWorker": {
        if (this.workerB.locked || S.run.workers.length >= this.st.maxWorkers) return undefined;
        const ps = this.workersPanel.applicants.filter((a) => a.until > this.time).map((a) => this.hirePrice(a.profile.price));
        return ps.length ? Math.min(...ps) : undefined;
      }
    }
    return null;
  }

  /* ---------- workers: job board, management, gear ---------- */

  private liveApplicants(): number {
    return this.workersPanel.applicants.filter((a) => a.until > this.time).length;
  }

  private openJobBoard(): void {
    if (this.workerB.locked) return;
    this.workersPanel.maxWorkers = this.st.maxWorkers;
    this.workersPanel.render(this.time);
    this.workersPanel.open();
  }

  /** Lend a light tool to a worker (null = back to basic gear). Takes it from whoever had it. */
  private assignGear(workerId: number, key: string | null): void {
    const gear = (S.run.gear ??= {});
    if (key) {
      const holder = gearHolder(key);
      if (holder === "player") {
        const e = EQUIP[key];
        if (e?.sub === "MiningTool") S.equipMining = "pickaxe";
        else S.equipCarrying = "woodenCarrier";
        this.refreshPlayerStats();
      } else if (typeof holder === "number") {
        delete gear[String(holder)];
        this.workers.find((w) => w.profile.id === holder)?.setGear(null);
      }
      gear[String(workerId)] = key;
    } else delete gear[String(workerId)];
    this.workers.find((w) => w.profile.id === workerId)?.setGear(key);
    markDirty();
    sfx.buy();
    this.equipPanel.render();
  }

  private updateVtab(): void {
    const show = this.vehicles.length > 0 && !this.inShop;
    if (!show) {
      if (this.vtab.style.display !== "none") this.vtab.style.display = "none";
      return;
    }
    const key = this.vehicles.map((v) => `${v.key}:${v.driven ? 1 : 0}:${v.fuelled && v.empty ? 1 : 0}`).join(",");
    if (key !== this.vtabKey) {
      this.vtabKey = key;
      this.vtab.innerHTML =
        this.vehicles.map((v) => `<button data-veh="${v.key}" class="${v.driven ? "on" : ""}">${ICON[v.key] ?? "🚜"}${v.fuelled && v.empty ? "<i></i>" : ""}</button>`).join("") +
        `<button class="vinfo" data-vinfo="1">i</button>`;
    }
    if (this.vtab.style.display === "none") this.vtab.style.display = "";
  }

  /** "NEW candidate" chip: applicants waiting, or the countdown to the next batch. */
  private updateCandChip(): void {
    const show = !this.workerB.locked && !this.inShop && S.run.workers.length < this.st.maxWorkers;
    if (!show) {
      if (this.candChip.style.display !== "none") this.candChip.style.display = "none";
      return;
    }
    const n = this.liveApplicants();
    const left = Math.max(0, Math.ceil(this.applicantT + (WORKER_RULES.recruit?.intervalSeconds ?? 180) - this.time));
    const html = n > 0 ? `🧑‍🌾<b>NEW</b><i>${n}</i>` : `🧑‍🌾<small>NEW in</small><b>${left}s</b>`;
    if (this.candChip.innerHTML !== html) this.candChip.innerHTML = html;
    if (this.candChip.style.display === "none") this.candChip.style.display = "";
  }

  /* ---------- items in transit (save / restore) ---------- */

  /**
   * Set when this page hands over to another stage (contract, test links): the run in the save is
   * the new stage's, so the reload's `pagehide` save must not write this quarry's chunks, back, furnace
   * and sell pile into it (playtest 2026-10-24: a stage 2 player arrived with stage 1 ore on the back).
   */
  private leaving = false;

  /**
   * What the ore and ingots still on their way to a sale are worth (back, machines, furnace, SELL
   * pipeline, storage, carts) at ingot prices, plus the cash waiting on the CASH spot: paid out when
   * the stage is left. Chunks still lying in the quarry stay behind.
   */
  private leftovers(): number {
    const items = [
      ...this.player.stack.items,
      ...this.vehicles.flatMap((v) => v.stack.items),
      ...this.houses.flatMap((h) => [...h.pending(), ...h.output.items]),
      ...this.sales.itemsToSave,
      ...this.storage.pile.items,
      ...this.minecarts.flatMap((m) => m.stack.items),
    ];
    let value = 0;
    for (const it of items) value += oreOfItemId(it)?.ingotPrice ?? 0;
    return Math.round(value + this.sales.moneyToSave);
  }

  private saveTransit(): void {
    if (this.leaving) return;
    const ground: number[] = [];
    for (const d of this.drops.list) if (d.state === "rest" || d.state === "fly") ground.push(d.item, +d.pos.x.toFixed(2), +d.pos.z.toFixed(2));
    const vehicles: Record<string, { items: number[]; fuel: number }> = {};
    for (const v of this.vehicles) vehicles[v.key] = { items: [...v.stack.items], fuel: +v.fuel.toFixed(2) };
    S.run.transit = {
      ground,
      player: [...this.player.stack.items],
      vehicles,
      furnaceQueue: this.furnace.pending(),
      furnaceOut: [...this.furnace.output.items],
      forgeQueue: this.forge.pending(),
      forgeOut: [...this.forge.output.items],
      sellPile: this.sales.itemsToSave,
      pallet: this.sales.moneyToSave,
      storage: [...this.storage.pile.items],
      carts: this.minecarts.map((m) => [...m.stack.items]),
      diggers: Object.fromEntries(this.diggers.map((d) => [String(d.groupId), d.left])),
    };
  }

  private restoreTransit(): void {
    const t = S.run.transit;
    if (!t) return;
    for (let i = 0; i + 2 < t.ground.length; i += 3) this.drops.place(t.ground[i], t.ground[i + 1], t.ground[i + 2]);
    for (const it of t.player) if (!this.player.stack.full) this.player.stack.push(it);
    for (const v of this.vehicles) {
      const sv = t.vehicles[v.key];
      if (!sv) continue;
      if (v.tank) v.fuel = Math.min(v.tank, sv.fuel);
      for (const it of sv.items) if (!v.stack.full) v.stack.push(it);
    }
    // Each item back into the house that takes it (a save from before the Forge holds everything in the furnace's).
    for (const it of [...t.furnaceQueue, ...(t.forgeQueue ?? [])]) this.houseFor(it).queue.push(it);
    for (const it of [...t.furnaceOut, ...(t.forgeOut ?? [])]) this.houseFor(it).output.push(it);
    for (const it of t.sellPile) this.sales.pile.push(it);
    if (t.pallet > 0) this.sales.addPallet(t.pallet);
    for (const it of t.storage) this.storage.pile.push(it);
    t.carts.forEach((items, i) => {
      const m = this.minecarts[i];
      if (m) for (const it of items) if (!m.stack.full) m.stack.push(it);
    });
    for (const d of this.diggers) {
      const left = t.diggers?.[String(d.groupId)];
      if (left !== undefined) d.left = left;
    }
    if (this.diggers[0] && t.diggerLeft !== undefined && !t.diggers) this.diggers[0].left = t.diggerLeft;
  }

  /* ---------- progress ---------- */

  /**
   * Stage progress = share of the quarry's blocks broken. The original counts mined ore,
   * not sales: the bar moves on the first block (0.1 % = 1/1204) before anything is sold,
   * and its result screen reads "Ore Mined 968 [80%]" at the 80 % clear (968/1204).
   */
  progress(): number {
    const total = this.field.blocks.length || 1;
    return ((total - this.field.remaining) / total) * 100;
  }

  /**
   * What telemetry's work report reads (telemetry.ts WorkProbe; user 2026-10-21: players stall on
   * quest 26 and the rows could not say why): the player's and the crew's state every frame, and
   * how hard the quarry face is when a report goes out.
   */
  workProbe(): WorkProbe {
    return {
      frame: () => {
        const v = this.driving;
        let blocked = 0;
        let idle = 0;
        let rest = 0;
        for (const w of this.workers) {
          if (w.state === "tired" || w.state === "resting") rest++;
          else if (w.state === "seek") idle++;
          else if (w.blocked) blocked++;
        }
        const barrow = v?.key === "wheelbarrow";
        return { driving: !!v && !barrow, barrow, dry: !!v?.empty, full: v ? v.stack.capacity > 0 && v.stack.full : this.player.stack.full, blocked, idle, rest };
      },
      face: () => {
        // Blocks with an open side on the ground (a cell nobody's ore fills, on a walkable tile).
        const hp: number[] = [];
        for (const b of this.field.blocks) {
          if (!b.alive) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const cx = b.cx + dx;
            const cz = b.cz + dz;
            if (this.field.at(cx, cz) || !this.map.inside(cx * CELL, cz * CELL)) continue;
            hp.push(b.hp);
            break;
          }
        }
        hp.sort((a, b) => a - b);
        const mid = hp[hp.length >> 1] ?? 0;
        const hits = (m: { power: number; powerMul: number } | null) => (m && m.power > 0 && mid > 0 ? Math.ceil(mid / (m.power * m.powerMul)) : 0);
        const v = this.driving ?? this.lastRide;
        return {
          wn: this.workers.length,
          wm: this.workers.filter((w) => w.profile.role === "Mining").length,
          fr: hp.length,
          hb: hits(this.player),
          hv: hits(v),
        };
      },
    };
  }

  /* ---------- frame ---------- */

  private collideSolids(p: THREE.Vector3, r: number): void {
    for (const s of this.solids) {
      const qx = Math.max(s.x0, Math.min(p.x, s.x1));
      const qz = Math.max(s.z0, Math.min(p.z, s.z1));
      const dx = p.x - qx;
      const dz = p.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
      } else {
        const left = p.x - s.x0, right = s.x1 - p.x, top = p.z - s.z0, bot = s.z1 - p.z;
        const m = Math.min(left, right, top, bot);
        if (m === left) p.x = s.x0 - r;
        else if (m === right) p.x = s.x1 + r;
        else if (m === top) p.z = s.z0 - r;
        else p.z = s.z1 + r;
      }
    }
  }

  private frame(now: number): void {
    // Frame-rate cap: 60 fps normally (a 120/144 Hz screen would otherwise draw everything
    // twice as often for no visible gain), 30 in Perf. Mode, 20 while a menu, sheet or line
    // of dialogue has the player's attention. Every skipped frame is CPU and GPU not spent,
    // which is what keeps a laptop's fans down (user, 2026-10-19).
    const fps = this.hostPlaying === false ? 20 : getSetting("perfMode") ? 30 : 60;
    if (now - this.last < 1000 / (fps + 4)) {
      requestAnimationFrame((t) => this.frame(t));
      return;
    }
    teleFrame((now - this.last) / 1000, this.hostPlaying === true);
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    let left = raw * this.timeScale;
    while (left > 1e-6) {
      const dt = Math.min(0.05, left);
      left -= dt;
      this.update(dt);
    }
    this.stage.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * Camera distance: machines pull back. On foot it stays put, phones included (user 2026-10-22: the
   * phone camera pulling back while walking and coming in again changed the zoom too much).
   */
  private updateZoom(): void {
    const v = this.driving;
    const want = v && v.key !== "wheelbarrow" ? 1.25 : 1;
    if (want !== this.zoomNow) {
      this.zoomNow = want;
      this.stage.zoom(want);
    }
  }

  private update(dt: number): void {
    this.time += dt;
    this.input.poll();
    if (this.input.active) this.touchedAt = this.time;
    const locked = this.dialogue.open || this.directT > 0 || this.spot.open || this.hqTower.isOpen || this.hqPanel.isOpen;
    const vx = locked ? 0 : this.input.vec.x;
    const vz = locked ? 0 : this.input.vec.y;
    if (this.pendingPan && !this.dialogue.open) {
      const p = this.pendingPan;
      this.pendingPan = null;
      this.directCamera(p);
    }
    if (this.directT > 0 && !this.dialogue.open) this.directT -= dt;

    const p = this.player;
    const v = this.driving;
    // Buffs from boosts.
    const bt = buffClock();
    const spd = bt < buffs.speedUntil;
    p.speed = moveSpeed("player") * (spd ? 1.3 : 1) * exoSpeed() * EASE.walk;
    p.intervalMul = spd ? 0.23 : 0;
    // The crew too (RvBoost 1001: player + light-equipment workers; user 2026-10-21: the card said so).
    for (const w of this.workers) {
      w.speedMul = spd ? 1.3 : 1;
      w.intervalMul = spd ? 0.23 : 0;
    }
    p.powerMul = bt < buffs.damageUntil ? 1.5 : 1;
    // FURNACE OVERLOAD: SmelterSmeltingSpeedRVMulti +1.
    for (const h of this.houses) h.speedMul = bt < buffs.furnaceUntil ? 2 : 1;
    const magnet = bt < buffs.magnetUntil;
    p.stack.capacity = magnet ? 999 : cargo(S.equipCarrying);
    p.absorb = absorb(S.equipCarrying) * (magnet ? 3 : 1);
    if (v) {
      v.powerMul = p.powerMul;
      v.drive(vx, vz, dt);
      this.field.collide(v.pos, v.radius);
      this.collideSolids(v.pos, v.radius);
      this.map.clamp(v.pos, v.radius, true);
      if (v.mines && !v.empty) {
        const hit = this.mining.mine(v, dt);
        if (hit) {
          this.minedAt = this.time;
          v.hitAnim();
          this.stage.shake(0.08);
        }
      }
      if (v.carries && v.key !== "allTerrainVehicle") this.mining.collect(v);
      // The player rides along (wheelbarrow: walks behind it, pushing).
      const back = v.key === "wheelbarrow" ? 1.6 : 0;
      p.pos.set(v.pos.x - Math.sin(v.facing) * back, 0, v.pos.z - Math.cos(v.facing) * back);
      p.facing = v.facing;
      p.walking(v.moving, dt);
      if (v.empty && v.fuelled) this.once(601);
      this.updateAtvRefuel(dt);
    } else if (this.inShop) {
      p.move(vx, vz, dt);
      const b = this.shopIn.bounds;
      for (const s of this.shopIn.solids) this.pushOut(p.pos, p.radius, s);
      p.pos.x = Math.max(b.x0, Math.min(b.x1, p.pos.x));
      p.pos.z = Math.max(b.z0, Math.min(b.z1, p.pos.z));
      this.shopIn.update(p.pos);
      const onExit = this.shopIn.exit.contains(p.pos);
      if (!onExit) this.shopArmed = true;
      else if (this.shopArmed) this.exitShop();
    } else {
      // Hands off right after mining (user 2026-10-22): walk on to the next block beside you.
      const auto = !this.input.active && !locked ? this.autoMine() : null;
      if (!auto) this.autoGoal = null;
      p.move(auto ? auto.x : vx, auto ? auto.z : vz, dt);
      this.field.collide(p.pos, p.radius);
      this.collideSolids(p.pos, p.radius);
      this.map.clamp(p.pos, p.radius);
      // Knuckle Driller (stage 7+): every hit heats it; at full heat it stops until it has cooled
      // to 60 % (OverheatData: max 100, start rate 0.6; the cooling speed is ours).
      const hot = S.equipMining === "knuckleDriller";
      if (hot) {
        this.heat = Math.max(0, this.heat - dt * 25);
        if (this.overheated && this.heat <= 60) this.overheated = false;
        setToolHeat(p.model, this.heat / 100);
      } else this.heat = 0;
      // The tool in hand and how it swings follow what is in front: sickle for rice, axe for trees, pickaxe for rock.
      const ahead = this.mining.target(p);
      if (ahead) p.model.motion = motionOfOre(ahead.ore);
      const hit = hot && this.overheated ? null : this.mining.mine(p, dt);
      if (hit && hot) {
        this.heat = Math.min(100, this.heat + (EQUIP.knuckleDriller?.stats.overheatAddAmount ?? 3.125));
        if (this.heat >= 100) {
          this.overheated = true;
          this.labels.pop(p.pos.clone().setY(3.2), "🔥 OVERHEATED!", "hint");
        }
      }
      if (hit) {
        this.minedAt = this.time;
        p.swing();
        p.faceToward(this.field.center(hit, this.tmp), dt);
        this.autoTip();
      }
      this.mining.collect(p);
      this.updateMountAndRefuel(dt);
    }
    p.update(dt);
    const me = this.controlled().pos;
    this.cargoAt.set(me.x, 0, me.z + 1.5);
    this.homeAt.set(me.x, 0, me.z + 2.9);
    this.labels.set(this.cargoLabel, this.cargoText());
    this.labels.set(this.homeLabel, this.homeText(me));

    for (let i = this.deliveries.length - 1; i >= 0; i--) {
      const d = this.deliveries[i];
      d.t += dt;
      const k = Math.min(1, d.t / 0.55);
      d.v.model.root.position.y = 9 * (1 - k * k);
      if (k >= 1) {
        this.deliveries.splice(i, 1);
        const at = d.v.pos.clone().setY(0.5);
        this.dust.burst(at, 0xc8b8a0, 14, 1.3);
        for (const c of [0xff5a4a, 0xffd34d, 0x46b4ff, 0x4cc94a, 0xb05cff]) this.dust.burst(at.clone().setY(2.5), c, 5, 1.6);
        sfx.unlock();
        if (this.pinSpotFor === d.v) {
          this.pinSpotFor = null;
          this.spotMount(d.v);
        } else if (this.oilLinePending && d.v.fuelled) this.playOilLine();
      }
    }
    this.updateFuelTrucks(dt);
    for (const veh of this.vehicles) {
      if (!this.deliveries.some((d) => d.v === veh)) veh.update(dt);
      const pin = this.pinLabels.get(veh);
      if (pin) {
        this.labels.show(pin, !veh.driven);
        // Parked away from you: "▼ 12m" under the pin (reference: in-world distance tag).
        const me = this.controlled().pos;
        const dist = Math.hypot(veh.pos.x - me.x, veh.pos.z - me.z);
        const tag = pin.el.querySelector(".vdist") as HTMLElement | null;
        const txt = !veh.driven && dist > 6 ? `▼ ${Math.round(dist / 2.5)}m` : "";
        if (tag && tag.textContent !== txt) tag.textContent = txt;
      }
      if (!veh.empty) this.dryNoted.delete(veh);
      else if (veh.driven && !this.dryNoted.has(veh)) {
        this.dryNoted.add(veh);
        this.outOfOil(veh);
      }
      const fl = this.fuelLabels.get(veh);
      if (fl) {
        // The OIL bar over every fuel machine (reference ref/27): green, yellow under half, red and
        // blinking under a fifth, dark when dry. User 2026-10-21: there was no way to see fuel running low
        // (the bar had no styles, only the word OIL showed).
        const k = veh.tank ? veh.fuel / veh.tank : 0;
        const tone = k <= 0 ? "dry" : k < 0.2 ? "low" : k < 0.5 ? "mid" : "";
        this.labels.set(fl, `<div class="fuelbar ${tone}"><i style="width:${Math.ceil(k * 100)}%"></i><b>FUEL</b></div>`);
      }
    }

    for (const h of this.houses) h.update(dt);
    this.sales.update(dt);
    this.upgradeB.update(dt);
    this.shopB.update(dt);
    this.workerB.update(dt);
    this.oil.update(dt);
    this.storage.update(dt);
    if (S.cash !== this.lastCash) {
      this.lastCash = S.cash;
      Sheet.refreshAfford();
    }
    this.cafeteria.update(dt);
    this.updateCandChip();
    this.updateVtab();
    for (const m of this.minecarts) m.update(dt, this.controlled());
    for (const d of this.diggers) d.update(dt, this.controlled());
    for (const b of this.bridges) b.update(dt, this.controlled());
    for (const o of this.extraOil) o.update(dt);
    for (const h of this.harvesters) h.update(dt, this.controlled());
    for (const w of this.workers) {
      w.update(dt);
      // A resting worker says so in a bubble over their head, the bar filling as they rest (user 2026-10-23), and
      // what they are doing at the restaurant (2026-10-24): eating, drinking, resting or waiting for a seat.
      const l = this.restLabels.get(w);
      const k = w.restDone;
      if (!l) continue;
      this.labels.show(l, k !== null);
      if (k === null) continue;
      const [icon, text, y] = REST_BUBBLE[w.restKind ?? "wait"];
      l.offsetY = y;
      this.labels.set(l, `<div class="restbub"><b><span>${icon}</span>${text}</b><div class="tbar"><i style="width:${Math.round(k * 20) * 5}%"></i></div></div>`);
    }
    this.spreadWorkers();
    this.boosts.update(dt);
    this.comeback.update(dt);
    this.tickProgression(dt);
    this.tickResearch();
    if (this.workersPanel.isOpen && Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.workersPanel.render(this.time);
    this.quests.update(dt);

    this.field.update(dt);
    this.drops.update(dt);
    this.flyers.update(dt);
    this.dust.update(dt);
    this.slabs.update(dt);
    this.shards.update(dt);
    this.felled.update(dt);
    this.fx.update(dt);
    // Fresh bars and gems on the Forge's tray catch the light now and then.
    if (this.forge.output.count > 0 && Math.random() < dt * 1.6) {
      const p = this.forge.output.topWorld(this.tmp);
      p.x += (Math.random() - 0.5) * 1.1;
      p.z += (Math.random() - 0.5) * 0.8;
      p.y += 0.15 - Math.random() * 0.3;
      this.fx.twinkle(p, 0.7 + Math.random() * 0.4);
    }
    this.cracks.update();
    const focus = this.directT > 0 ? this.directP : this.spotFocus && this.spot.open ? this.spotFocus.pos : this.controlled().pos;
    this.updateZoom();
    this.stage.follow(focus);
    this.stage.update(dt);
    this.tellHost();
    this.arrow.update(dt, this.controlled().pos);
    this.updateStuck(dt);
    this.arrow.set(this.directT > 0 || this.dialogue.open ? null : this.arrowTarget());
    // Dismount button: next to the vehicle, only once it has fully stopped.
    if (this.driving) {
      this.stoppedT = this.driving.moving ? 0 : this.stoppedT + dt;
      const show = this.stoppedT > 0.15;
      this.hud.showExit(show);
      if (show) {
        const sp = { x: 0, y: 0, visible: false };
        this.stage.toScreen(this.driving.pos.clone().setX(this.driving.pos.x + 2.2), sp);
        const left = `${Math.round(sp.x - 32)}px`;
        const top = `${Math.round(sp.y - 32)}px`;
        if (this.hud.exitBtn.style.left !== left) this.hud.exitBtn.style.left = left;
        if (this.hud.exitBtn.style.top !== top) this.hud.exitBtn.style.top = top;
      }
    }
    this.labels.update();
    this.hud.setStage(this.level, this.progress(), this.st.clearPercent);
    this.hud.setCurrency(S.cash, S.gems, S.gear, this.level >= 2);
    // Green "!" over the building the current quest points to.
    const g = this.quests.waiting ? undefined : this.quests.cur()?.guide;
    const guided = g?.type === "CameraDirecting" ? g.detail : "";
    if (this.upgradeB.beacon) this.upgradeB.beacon.visible = guided === "UpgradeBuilding";
    if (this.shopB.beacon) this.shopB.beacon.visible = guided === "ShopBuilding" && !this.shopB.locked;
    if (this.workerB.beacon) this.workerB.beacon.visible = guided === "WorkerBuilding" && !this.workerB.locked;
    flush();
  }

  private cargoText(): string {
    if (this.driving && !this.driving.carries) return "";
    const a = this.driving ?? this.player;
    if (a.stack.full) return `<div class="cpill max">MAX</div>`;
    const k = Math.min(100, (a.stack.count / Math.max(1, a.stack.capacity)) * 100);
    return `<div class="cpill"><i style="width:${k.toFixed(0)}%"></i><span>CARGO [${a.stack.count}/${a.stack.capacity}]</span></div>`;
  }

  /**
   * House icon + distance + arrow toward base, shown when away from it, and only while the
   * player is learning the way (user 2026-10-19): stage 1 until the Sledgehammer quest is done.
   */
  private homeText(me: THREE.Vector3): string {
    if (this.level > 1 || S.quest.index > HOME_HINT_UNTIL) return "";
    const d = Math.hypot(me.x - this.homePos.x, me.z - this.homePos.z);
    if (d < 12 || this.inShop) return "";
    const a = { x: 0, y: 0, visible: false };
    const b = { x: 0, y: 0, visible: false };
    this.stage.toScreen(me, a);
    this.stage.toScreen(this.homePos, b);
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return `<div class="hometab"><b>⌂</b>${Math.round(d)}m</div><i class="harrow" style="transform:rotate(${ang.toFixed(0)}deg)">➤</i>`;
  }

  /**
   * Fuel trucks (stage 3+): top up any thirsty machine beside them from their reserve (a barrel
   * flies over for show), and refill the reserve fast while parked on an open oil station's pad:
   * one barrel off the rack = 50 fuel (topping up 850 one 5-fuel barrel at a time was 170 trips).
   */
  private fuelTick = new Ticker();
  private updateFuelTrucks(dt: number): void {
    const busy = (v: Vehicle) => this.pendingDeliveries.includes(v) || this.deliveries.some((d) => d.v === v);
    for (const ft of this.vehicles) {
      if (!ft.feeds || busy(ft)) continue;
      const fed = ft.refuelNearby(this.vehicles.filter((v) => !busy(v)), dt);
      if (fed) this.flyers.launch(ft.stack.topWorld(), fed.model.root, itemColor(OIL_ITEM), () => sfx.drop(), { offset: new THREE.Vector3(0, 2, 0), item: OIL_ITEM });
    }
    const ft = this.driving;
    const station = ft?.feeds ? [this.oil, ...this.extraOil].find((o) => !o.locked && o.zone.contains(ft.pos, 1)) : undefined;
    if (!ft || !station || ft.fuel >= ft.tank - 0.5) return this.fuelTick.reset();
    this.fuelTick.tick(dt, 0.12, () => {
      if (ft.fuel >= ft.tank - 0.5) return false;
      const it = station.rack.pop();
      if (it === null) return false;
      this.flyers.launch(station.rack.topWorld(), ft.model.root, itemColor(OIL_ITEM), () => {
        ft.fuel = Math.min(ft.tank, ft.fuel + 50);
        sfx.drop();
      }, { offset: new THREE.Vector3(0, 2, 0), item: OIL_ITEM });
      return true;
    });
  }

  /** On foot: stand still next to a parked vehicle to mount; carry oil next to one to refuel. */
  /** Driving the ATV with barrels on its rack: refuel any thirsty machine parked next to it. */
  private atvTick = new Ticker();
  private updateAtvRefuel(dt: number): void {
    const atv = this.driving;
    if (!atv || !atv.accepts(OIL_ITEM) || !atv.stack.items.includes(OIL_ITEM)) return this.atvTick.reset();
    const target = this.vehicles.find((v) => v !== atv && v.fuelled && v.fuel < v.tank - 0.5 && Math.hypot(v.pos.x - atv.pos.x, v.pos.z - atv.pos.z) < v.radius + atv.radius + 1.5);
    if (!target) return this.atvTick.reset();
    this.atvTick.tick(dt, GAMEPLAY.stackTransferIntervalSeconds, () => {
      if (target.fuel >= target.tank - 0.5) return false;
      const it = atv.stack.take((i) => i === OIL_ITEM);
      if (it === null) return false;
      this.flyers.launch(atv.stack.topWorld(), target.model.root, itemColor(OIL_ITEM), () => {
        target.addFuel();
        sfx.drop();
      }, { offset: new THREE.Vector3(0, 2, 0), item: OIL_ITEM });
      return true;
    });
  }

  private updateMountAndRefuel(dt: number): void {
    const p = this.player;
    let near: Vehicle | null = null;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
      if (d < v.radius + 1.3) near = v;
    }
    if (!near) {
      if (this.mountHold < 0) this.mountHold = 0;
      this.refuelTick.reset();
      return;
    }
    if (near.fuelled && p.stack.items.includes(OIL_ITEM) && near.fuel < near.tank - 0.5) {
      const target = near;
      this.refuelTick.tick(dt, 0.1, () => {
        if (target.fuel >= target.tank - 0.5) return false;
        const it = p.stack.take((i) => i === OIL_ITEM);
        if (it === null) return false;
        this.flyers.launch(p.stack.topWorld(), target.model.root, itemColor(OIL_ITEM), () => {
          target.addFuel();
          sfx.drop();
        }, { offset: new THREE.Vector3(0, 2, 0), item: OIL_ITEM });
        return true;
      });
      return;
    }
    // Walk into a parked vehicle to climb on (after a dismount, step away first).
    const d = Math.hypot(near.pos.x - p.pos.x, near.pos.z - p.pos.z);
    if (this.mountHold < 0) {
      if (d > near.radius + 2) this.mountHold = 0;
      return;
    }
    // Only a player who steers there climbs on: auto-mine's own walk kept seating them in machines
    // parked by the face, and walking past a dry one (it crawls) is never a wish to drive it; its pin
    // still mounts it (playtest 2026-10-24: four unwanted rides in twenty minutes).
    if (p.moving && this.input.active && !near.empty && d < near.radius + 0.9) this.mount(near);
  }
}
