import { WORKER_PROFILES } from "../data";
import player from "../../assets/workers/player.png?inline";
import w1 from "../../assets/workers/1.png?inline";
import w2 from "../../assets/workers/2.png?inline";
import w3 from "../../assets/workers/3.png?inline";
import w4 from "../../assets/workers/4.png?inline";
import w5 from "../../assets/workers/5.png?inline";
import w6 from "../../assets/workers/6.png?inline";
import w7 from "../../assets/workers/7.png?inline";
import w8 from "../../assets/workers/8.png?inline";
import w9 from "../../assets/workers/9.png?inline";
import w10 from "../../assets/workers/10.png?inline";
import w11 from "../../assets/workers/11.png?inline";

/**
 * Crew portraits (user 2026-10-24: the Job Board and crew lists showed ⛏️ / 📦 where the reference shows
 * each worker's face). Photographed from the game's own 3D workers, each in their own style (characters.ts
 * CREW), by scripts/make-portraits.mjs; re-run it after changing a style.
 */
const FACES: Record<string, string> = { player, 1: w1, 2: w2, 3: w3, 4: w4, 5: w5, 6: w6, 7: w7, 8: w8, 9: w9, 10: w10, 11: w11 };

/** `<img>` of this worker profile (or the player), or "" when there is none. */
export function face(id: number | "player" | undefined, cls = "face"): string {
  const src = id === undefined ? undefined : FACES[String(id)];
  return src ? `<img class="${cls}" src="${src}" alt="">` : "";
}

/** The portrait for a name in the stage's crew report ("PLAYER" or a worker's name). */
export function faceByName(name: string, cls?: string): string {
  return face(name === "PLAYER" ? "player" : WORKER_PROFILES.find((p) => p.name === name)?.id, cls);
}

/** The picture slot of a worker row: the face with the role in a corner, or the role alone. */
export function workerPic(id: number, role: string): string {
  const roleIco = role === "Mining" ? "🌾" : "🧺";
  const img = face(id);
  return img ? `<div class="r-ico r-face">${img}<i class="r-role">${roleIco}</i></div>` : `<div class="r-ico">${roleIco}</div>`;
}
