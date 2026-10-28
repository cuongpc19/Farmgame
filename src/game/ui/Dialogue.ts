import { SPEAKER_NAMES } from "../data";
import { HANK_SVG, SOFIA_SVG } from "./portraits";

/**
 * Onboarding dialogue, styled after the reference: the world dims, a black gradient panel
 * rises from the bottom, the speaker's portrait stands at the left, a yellow bar + yellow
 * name, and the line types on (~40 chars/s) with a ▶ when complete. Tap: finish the line,
 * tap again: next line. Gameplay input is blocked while open (the caller checks `open`).
 */
export class Dialogue {
  private root: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private faceEl: HTMLDivElement;
  private nextEl: HTMLDivElement;
  private queue: { speaker: "hank" | "sofia"; lines: string[]; done: () => void }[] = [];
  private lines: string[] = [];
  private done: (() => void) | null = null;
  private typed = 0;
  private timer = 0;
  open = false;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "dlg hit";
    this.root.innerHTML = `<div class="dlg-dim"></div><div class="dlg-panel"><div class="dlg-face"></div><div class="dlg-box"><div class="dlg-name"></div><div class="dlg-text"></div></div><div class="dlg-next">▶</div></div>`;
    host.appendChild(this.root);
    this.nameEl = this.root.querySelector(".dlg-name")!;
    this.textEl = this.root.querySelector(".dlg-text")!;
    this.faceEl = this.root.querySelector(".dlg-face")!;
    this.nextEl = this.root.querySelector(".dlg-next")!;
    this.root.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.advance();
    });
  }

  say(speaker: "hank" | "sofia", lines: string[]): Promise<void> {
    return new Promise((res) => {
      if (!lines.length) return res();
      this.queue.push({ speaker, lines: [...lines], done: res });
      if (!this.open) this.next();
    });
  }

  private next(): void {
    const n = this.queue.shift();
    if (!n) {
      this.open = false;
      this.root.classList.remove("on");
      return;
    }
    this.open = true;
    this.lines = n.lines;
    this.done = n.done;
    this.nameEl.textContent = SPEAKER_NAMES[n.speaker] ?? n.speaker;
    this.faceEl.innerHTML = n.speaker === "hank" ? HANK_SVG : SOFIA_SVG;
    this.root.classList.add("on");
    this.show();
  }

  private show(): void {
    clearInterval(this.timer);
    const line = this.lines[0] ?? "";
    this.typed = 0;
    this.textEl.textContent = "";
    this.nextEl.style.visibility = "hidden";
    this.timer = window.setInterval(() => {
      this.typed = Math.min(line.length, this.typed + 2);
      this.textEl.textContent = line.slice(0, this.typed);
      if (this.typed >= line.length) this.finishLine();
    }, 50);
  }

  private finishLine(): void {
    clearInterval(this.timer);
    this.textEl.textContent = this.lines[0] ?? "";
    this.typed = this.textEl.textContent.length;
    this.nextEl.style.visibility = "visible";
  }

  private advance(): void {
    if (this.typed < (this.lines[0]?.length ?? 0)) return this.finishLine();
    this.lines.shift();
    if (this.lines.length) return this.show();
    const d = this.done;
    this.done = null;
    d?.();
    this.next();
  }
}
