// Picks the implementation by alias (`vite.config.ts`, from VITE_TARGET), so the one you did not
// select is never read at all and `grep -rc crazygames dist/` is a real proof.
export { platform } from "virtual:platform";
export type { Platform, PlatformStorage } from "./base";
