// Self-hosted web build, the dev server and the claude.ai artifact. Every host hook is a no-op
// and storage is plain `localStorage`. Nothing here names a host SDK, so a `web` build cannot
// contain one.

import { localStore, muteParam, type Platform } from "./base";

export const platform: Platform = {
  name: "web",
  async init() {},
  storage: localStore,
  loadingStart() {},
  loadingStop() {},
  gameplayStart() {},
  gameplayStop() {},
  happytime() {},
  preferredLang: () => null,
  hostMuted: muteParam,
  onHostMuteChange() {},
  canReward: () => false,
  rewarded: async () => false,
};
