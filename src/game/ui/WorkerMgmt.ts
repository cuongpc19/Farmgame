import { EQUIP, WORKER_PROFILES } from "../data";
import { S, power, interval, cargo } from "../state";
import { Sheet, ICON } from "./Panels";
import { workerPic } from "./faces";

/** Light tools a worker can use, by role (basic gear is always available and isn't listed). */
export const BASIC_GEAR: Record<"Mining" | "Carrying", string> = { Mining: "pickaxe", Carrying: "woodenCarrier" };
const SUB: Record<"Mining" | "Carrying", string> = { Mining: "MiningTool", Carrying: "CarryingTool" };

/** Who holds a light tool right now: "player", a worker profile id, or null (free). */
export function gearHolder(key: string): "player" | number | null {
  if (S.equipMining === key || S.equipCarrying === key) return "player";
  for (const [id, k] of Object.entries(S.run.gear ?? {})) if (k === key) return Number(id);
  return null;
}

const nameOf = (id: number) => WORKER_PROFILES.find((p) => p.id === id)?.name.split(" ")[0] ?? "Worker";

/**
 * WORKER MANAGEMENT (reference §3.10): hired workers, each with an equipment slot. Workers can
 * use the player's light equipment — "Free slot? Hit Equip. In use? Exchange it. Take it back
 * anytime you need it!" Buttons lead to the Job Board for more hires.
 */
export class WorkerMgmtPanel extends Sheet {
  onAssign: ((workerId: number, key: string | null) => void) | null = null;
  onJobBoard: (() => void) | null = null;
  /** Applicants waiting on the Job Board (badge on "Check Applications"). */
  applicants = 0;
  maxWorkers = 5;
  /** Worker whose slot is being chosen, or null for the list. */
  private picking: number | null = null;

  constructor(host: HTMLElement) {
    super(host, "FARMHANDS");
    this.body.addEventListener("click", (e) => {
      if (this.ghost(e)) return;
      const t = e.target as HTMLElement;
      const slot = t.closest("[data-slot]") as HTMLElement | null;
      const pick = t.closest("[data-pick]") as HTMLElement | null;
      if (t.closest("[data-back]")) {
        this.picking = null;
        this.render();
      } else if (t.closest("[data-board]")) this.onJobBoard?.();
      else if (slot) {
        this.picking = Number(slot.dataset.slot);
        this.render();
      } else if (pick && this.picking !== null && !pick.classList.contains("off")) {
        const key = pick.dataset.pick === "" ? null : pick.dataset.pick!;
        this.onAssign?.(this.picking, key);
        this.picking = null;
        this.render();
      }
    });
  }

  close(): void {
    this.picking = null;
    super.close();
  }

  private toolStat(key: string): string {
    const e = EQUIP[key];
    return e?.sub === "MiningTool" ? `⚒ ${+power(key).toFixed(1)} · ⏱ ${+interval(key).toFixed(2)}s` : `📦 ${cargo(key)}`;
  }

  render(): void {
    const scroll = this.body.scrollTop;
    queueMicrotask(() => (this.body.scrollTop = scroll));
    if (this.picking !== null) return this.renderPicker(this.picking);
    const hired = S.run.workers.map((id) => WORKER_PROFILES.find((p) => p.id === id)).filter((p) => !!p);
    const rows = hired.map((p) => {
      const key = S.run.gear?.[String(p!.id)] ?? BASIC_GEAR[p!.role];
      const basic = key === BASIC_GEAR[p!.role];
      return `<div class="row worker">
        ${workerPic(p!.id, p!.role)}
        <div class="r-mid"><div class="r-name">${p!.name}</div><div class="r-sub">${p!.role === "Mining" ? "Harvester" : "Hauler"} · ${p!.trait}</div>
          <div class="r-stats">${ICON[key] ?? "🔧"} ${EQUIP[key]?.name ?? key}${basic ? " <small>(basic)</small>" : ""}</div></div>
        <button class="r-buy ${basic ? "" : "eq"}" data-slot="${p!.id}">${basic ? "EQUIP" : "CHANGE"}</button></div>`;
    });
    const empty = `<div class="sh-note">No farmhands yet.</div>`;
    const badge = this.applicants > 0 ? ` <b class="wm-badge">${this.applicants}</b>` : "";
    this.body.innerHTML = `<div class="sh-note">Farmhands: ${hired.length}/${this.maxWorkers} · this stage only</div>${rows.join("") || empty}
      <div class="wm-actions"><button class="r-buy" data-board="1">HIRE MORE HANDS!</button><button class="r-buy blue" data-board="1">Check Applications${badge}</button></div>`;
  }

  private renderPicker(workerId: number): void {
    const p = WORKER_PROFILES.find((x) => x.id === workerId);
    if (!p) {
      this.picking = null;
      return this.render();
    }
    const current = S.run.gear?.[String(workerId)] ?? null;
    const tools = S.owned.filter((k) => EQUIP[k]?.sub === SUB[p.role] && k !== BASIC_GEAR[p.role]);
    const rows = tools.map((k) => {
      const holder = gearHolder(k);
      const mine = holder === workerId;
      const status = mine ? "Equipped" : holder === "player" ? "In use: You" : holder !== null ? `In use: ${nameOf(holder)}` : "Free";
      const btn = mine ? "EQUIPPED" : holder === null ? "EQUIP" : "EXCHANGE";
      return `<div class="row"><div class="r-ico">${ICON[k] ?? "🔧"}</div><div class="r-mid"><div class="r-name">${EQUIP[k].name}</div>
        <div class="r-sub">${status}</div><div class="r-stats">${this.toolStat(k)}</div></div>
        <button class="r-buy ${mine ? "off eq" : holder === null ? "" : "blue"}" data-pick="${k}">${btn}</button></div>`;
    });
    const basic = BASIC_GEAR[p.role];
    const back = current ? `<div class="row"><div class="r-ico">${ICON[basic] ?? "🔧"}</div><div class="r-mid"><div class="r-name">${EQUIP[basic]?.name ?? basic} <small>(basic)</small></div><div class="r-sub">Return the tool to you</div></div><button class="r-buy" data-pick="">TAKE BACK</button></div>` : "";
    const none = `<div class="sh-note">No ${p.role === "Mining" ? "harvest" : "carrying"} tools to lend yet. Buy some at the Farm Shop.</div>`;
    this.body.innerHTML = `<button class="wm-back" data-back="1">◂ ${p.name}</button>${rows.join("") || none}${back}`;
  }
}
