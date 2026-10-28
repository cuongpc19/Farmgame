import { EQUIP } from "../data";
import { S, power, interval, cargo, resetProgress } from "../state";
import { Sheet, ICON } from "./Panels";
import { sfx } from "../audio";
import { BUILD_VERSION, getSetting, toggleSetting, type SettingFlag } from "../settings";
import { Stage3D } from "../engine/Stage3D";
import { deviceCode } from "../telemetry";
import "./settings.css";
import privacyHtml from "../../privacy.html?raw";

/** Equipment inventory (bottom-right button): equip owned light tools. */
export class EquipPanel extends Sheet {
  onEquip: ((key: string) => void) | null = null;

  constructor(host: HTMLElement) {
    super(host, "EQUIPMENT");
    this.body.addEventListener("click", (e) => {
      if (this.ghost(e)) return;
      const b = (e.target as HTMLElement).closest("[data-eq]") as HTMLElement | null;
      if (b && !b.classList.contains("off")) this.onEquip?.(b.dataset.eq!);
    });
  }

  render(): void {
    // Keep the list where it was (a re-render must not jump the rows under the finger).
    const scroll = this.body.scrollTop;
    queueMicrotask(() => (this.body.scrollTop = scroll));
    const rows = S.owned
      .map((k) => EQUIP[k])
      .filter(Boolean)
      .map((e) => {
        const on = S.equipMining === e.key || S.equipCarrying === e.key;
        const stat = e.sub === "MiningTool" ? `⚒ ${+power(e.key).toFixed(1)} · ⏱ ${+interval(e.key).toFixed(2)}s` : `📦 ${cargo(e.key)}`;
        return `<div class="row"><div class="r-ico">${ICON[e.key] ?? "🔧"}</div><div class="r-mid"><div class="r-name">${e.name}</div><div class="r-sub">${e.sub === "MiningTool" ? "Mining tool" : "Carrying tool"}</div><div class="r-stats">${stat}</div></div>
          <button class="r-buy ${on ? "off eq" : ""}" data-eq="${e.key}">${on ? "EQUIPPED" : "EQUIP"}</button></div>`;
      });
    const rentals = S.run.rentals.map((k) => EQUIP[k]?.name ?? k).join(", ") || "none";
    this.body.innerHTML = `${rows.join("")}<div class="sh-note">Rented this stage: ${rentals}</div>`;
  }
}

/**
 * Settings: Perf. Mode first (on by default), Music / SFX, PRIVACY & CREDITS, then the
 * progress reset. No SUPPORT CENTER / RESTORE PURCHASES (no store, no support site) and no
 * vibration switch (user, 2026-10-19).
 */
export class SettingsPanel extends Sheet {
  /** Reset needs a second tap (no confirm() dialog: the artifact viewer suppresses it). */
  private armed = false;
  /** The policy, same page (CrazyGames bans outbound links). */
  private privacy: PrivacyPanel;

  constructor(host: HTMLElement) {
    super(host, "Setting", "settings");
    this.privacy = new PrivacyPanel(host);
    this.body.addEventListener("click", (e) => {
      if (this.ghost(e)) return;
      const t = e.target as HTMLElement;
      const flag = t.closest("[data-set]") as HTMLElement | null;
      if (flag) {
        const k = flag.dataset.set as SettingFlag;
        toggleSetting(k);
        sfx.tap(); // silent when SFX was just switched off
        this.render();
        return;
      }
      const k = (t.closest("[data-k]") as HTMLElement | null)?.dataset.k;
      if (k === "privacy") this.privacy.open();
      else if (k === "reset") {
        if (!this.armed) {
          this.armed = true;
          this.render();
          return;
        }
        resetProgress();
      }
    });
  }

  close(): void {
    this.armed = false;
    this.privacy.close();
    super.close();
  }

  private toggle(k: SettingFlag, ico: string, name: string, sub: string, extra = ""): string {
    const on = getSetting(k);
    return `<div class="set-row" data-set="${k}"><div class="set-ico">${ico}</div>
      <div class="set-mid"><div class="set-name">${name}</div><div class="set-sub">${sub}</div>${extra}</div>
      <button class="tg ${on ? "on" : ""}" data-set="${k}" role="switch" aria-checked="${on}" aria-label="${name}"><span>${on ? "ON" : "OFF"}</span><i></i></button></div>`;
  }

  render(): void {
    const scroll = this.body.scrollTop;
    queueMicrotask(() => (this.body.scrollTop = scroll));
    const restart = Stage3D.restartPending() ? `<div class="set-warn">Edge smoothing applies after restart</div>` : "";
    this.body.innerHTML = `
      ${this.toggle("perfMode", "⚡", "Perf. Mode", "Lower resolution, no shadows, 30 fps", restart)}
      ${this.toggle("music", "🎵", "Music", "Workshop groove")}
      ${this.toggle("sfx", "🔊", "SFX", "Mining, coins &amp; buttons")}
      <div class="set-btns"><button class="set-blue" data-k="privacy">PRIVACY &amp; CREDITS</button></div>
      <div class="set-row"><div class="set-ico">🗑️</div><div class="set-mid"><div class="set-name">Reset progress</div><div class="set-sub">Start again from Stage 1</div></div>
        <button class="set-danger ${this.armed ? "armed" : ""}" data-k="reset">${this.armed ? "TAP AGAIN" : "RESET"}</button></div>
      <div class="set-ver">Build Version ${BUILD_VERSION}</div>`;
  }
}

/**
 * Privacy policy (`src/privacy.html`) and the model credits under it. ⚠ The credits must stay
 * reachable in the game: three models are CC-BY 3.0, which requires attribution (they moved
 * here from the Settings sheet, user 2026-10-19).
 */
const CREDITS = `<h2>Credits</h2>
<p>3D models: Bulldozer and Wheelbarrow by Poly by Google, Dump truck by jeremy (CC-BY 3.0,
via Poly Pizza). Workers by Quaternius; vehicles, buildings and props by Kenney (CC0).</p>`;

class PrivacyPanel extends Sheet {
  constructor(host: HTMLElement) {
    super(host, "Privacy & Credits", "privacy");
    // The device code: what a player quotes to have their play records deleted (and what we type
    // into the stats page to leave our own devices out).
    const code = `<p class="dev-code">Your device code: <code>${deviceCode()}</code></p>`;
    this.body.innerHTML = privacyHtml.replace(/<!--[\s\S]*?-->/g, "").trim() + code + CREDITS;
  }
}
