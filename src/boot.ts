import { Game } from "./game/Game";
import { loadCharacters } from "./game/characters";
import { loadProps } from "./game/props3d";
import { platform } from "./platform";
import { muteFor } from "./game/audio";
import { teleBoot, teleFail, teleStart } from "./game/telemetry";

/**
 * Everything that reads the save or the settings starts here, imported by main.ts only after
 * `platform.init()`: on CrazyGames the player's cloud save is preloaded during init, and a read
 * before it would see the local copy.
 */
const w = window as unknown as { __game?: Game; __err?: string };
// Telemetry first, so a game that never starts is still counted (and its error kept).
teleBoot();
// The host's mute (and `?muteAudio=true`) outranks every in-game switch.
muteFor("host", platform.hostMuted());
platform.onHostMuteChange((m) => muteFor("host", m));
// Canvas text (pad captions, signs) needs the font loaded before it is drawn.
const fonts = document.fonts?.load('32px "Lilita One"').catch(() => undefined);
// Character and machine models are parsed first (the boot screen stays up meanwhile), then the game starts.
Promise.all([loadCharacters(), loadProps(), fonts])
  .then(() => {
    const game = new Game(document.getElementById("app")!, document.getElementById("ui")!);
    // Test handle for scripts/shot.mjs (headless runs drive the game through it). Not in a
    // CrazyGames production build: a console cheat handle is a dev tool.
    if (__TARGET__ !== "crazy" || import.meta.env.DEV) w.__game = game;
    // Test links: `?prog=40&cash=10000&quest=1027` (Game.debug.fromUrl). Never in the CrazyGames build.
    if (__TARGET__ !== "crazy") game.debug.fromUrl();
    teleStart(() => game.progress(), game.workProbe());
  })
  .catch((e) => {
    w.__err = String((e as Error)?.stack ?? e);
    console.error(w.__err);
    teleFail(String((e as Error)?.message ?? e));
  })
  .finally(() => {
    platform.loadingStop();
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      setTimeout(() => boot.remove(), 400);
    }
  });
