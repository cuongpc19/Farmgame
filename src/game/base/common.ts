import { GAMEPLAY, PACE } from "../data";
export { upValue, upValue2 } from "../state";

/** Unit ↔ building transfer tick (BuildingStackingSender.SEND_INTERVAL = 0.2 s). */
export const GAMEPLAY_TRANSFER = GAMEPLAY.stackTransferIntervalSeconds;
/**
 * Pads at buildings move items this many times as fast as the original (user 2026-10-21: "really fast,
 * 10x"): 0.02 s an item instead of 0.2. Loose chunks out in the quarry keep their pace (Mining).
 */
export const PAD_SPEED = 10;
/** Building → back (furnace tray, ore storage, oil rack, auto digger pile). */
export const PICKUP_TRANSFER = GAMEPLAY_TRANSFER / PACE.pickup / PAD_SPEED;
/** Back → pad (REFINING, SELL, a minecart). */
export const UNLOAD_TRANSFER = GAMEPLAY_TRANSFER / PACE.unload / PAD_SPEED;
