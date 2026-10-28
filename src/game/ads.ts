/**
 * Rewarded ads on/off. **Off for now** (2026-10-19, user: "phần quảng cáo tạm thời bỏ đi, cho
 * free hết"): every ad-gated thing (boosts, minecarts, the Auto Digger, cafeteria tables) is
 * granted at once, labelled FREE. The plumbing stays: `AdSim` → `platform.rewarded()` on
 * CrazyGames, the 2-second stand-in elsewhere. Flip this to bring them back.
 */
export const ADS_ON = false;

/** Label for an ad-gated pad / button. */
export function adLabel(): string {
  return ADS_ON ? `<span class="rv">▶ AD</span>` : "FREE";
}
