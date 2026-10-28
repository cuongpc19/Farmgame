import "./style.css";
import { platform } from "./platform";

const w = window as unknown as { __err?: string };
window.addEventListener("error", (e) => {
  w.__err = String(e.error?.stack ?? e.message);
  console.error(w.__err);
});
platform.loadingStart();
// ⚠ The game is imported only once the host is up (or has clearly not come): init() preloads the
// cloud save, and the game reads its save and settings the moment its modules load.
// init() never throws and never hangs (it owns its timeout).
platform
  .init()
  .then(() => import("./boot"))
  .catch((e) => {
    w.__err = String((e as Error)?.stack ?? e);
    console.error(w.__err);
  });
