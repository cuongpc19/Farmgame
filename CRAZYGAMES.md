# Shipping Quarry Crush to CrazyGames

What to do, in order. General rules for every game in this folder:
`C:\CuongPC\Game\CRAZYGAMES_RULES.md`. The SDK layer is ported from Ring Twist
(`Rotate Ring/src/platform_crazy.js`), the version that passed the portal's SDK detection.

## ⚠ Before the first submission

`npm run build:crazy` ends with **"CHUA NEN NOP"** while `src/game/data.ts` reads
`src/data/orig/`: the stages, quests, dialogue and economy decoded from the original game's APK
(see CLAUDE.md, "The economy is the ORIGINAL game's — temporary"). The build is complete and
uploadable, but that data has to be replaced before the game goes public. The check looks at the
source, not the bundle: Vite drops the JSON `_note` fields that name the original, so the bundle
looks clean while still carrying its data.

## 1. Every update

```bash
npx tsc --noEmit
npm run build:crazy        # node scripts/build-target.mjs crazy -> dist/ = THE UPLOAD
```

It must print:

```
Ban "crazy": 9 file · 2.90 MB
  OK  duoi 20 MB - du dieu kien len trang chu ban mobile
  OK  9 file - tran la 1500
  OK  duong dan tuong doi
  OK  co SDK CrazyGames (2 file)
  OK  dist/privacy.html (ban de host cho o Privacy policy URL)
```

Then: Developer Portal → the game → **Builds / Files** → drag the **contents of `dist/`**
(`index.html`, `privacy.html`, `assets/`, `fonts/`) into the upload zone. **Do not zip** (the box
rejects archives). **Never drag the repo** (`scripts/preview`, the harness and `store/` must not
reach a reviewer).

⚠ `npm run build` (the web build for the phone artifact) also writes `dist/`. Always run
`npm run build:crazy` last before uploading; `grep -c sdk.crazygames.com dist/index.html` must
say 1.

## 2. What the crazy build does differently

One codebase; the host is picked at build time by the `virtual:platform` alias
(`vite.config.ts`, `VITE_TARGET`), so a web build cannot contain the SDK.

| | `src/platform/crazy.ts` | why |
|---|---|---|
| SDK tag | async `<script>` in `<head>` + loader with timeouts | a blocking tag can hang the page; adblock never fires `onerror` |
| Late SDK | adopted whenever `init()` finishes, even after the 2.5 s boot budget | Ring Twist's first upload: "No detected SDK functionalities" (slow from Vietnam) |
| Save | `localStorage` + `SDK.data`, newest copy wins (`<key>.t` stamps) | cloud save without overwriting a newer save |
| Boot order | `main.ts` awaits `platform.init()`, then imports `boot.ts` (the game) | the cloud save is preloaded during init; the game chunk is modulepreloaded meanwhile |
| loading / gameplay | `loadingStart/Stop` around boot; `gameplayStart/Stop` from one pause flag (`Game.tellHost`) | dialogue, spotlights, every sheet, stage clear, HQ and ads count as paused |
| happytime | on STAGE COMPLETE | |
| Mute | `game.settings.muteAudio` + listener, and `?muteAudio=true` without an SDK | outranks the in-game switches (`audio.muteFor("host")`) |
| Ads | `platform.rewarded()` → `requestAd("rewarded")` | **switched off for now** (`src/game/ads.ts`, `ADS_ON = false`): every ad-gated thing is FREE |
| Settings | PRIVACY button (in-page policy) instead of SUPPORT / RESTORE; no "prototype" note | no outbound links, no dead buttons |
| Dev tools | no `window.__game`, `?speed`, `?reset` | a console cheat handle is a dev tool |
| Keys | arrows / space `preventDefault` | they would scroll the host page around the iframe |

Checks that need a browser (dev server running, then a preview of `dist/`):

```bash
npx vite preview --port 4173 --strictPort &
QC_URL=http://localhost:4173/ node scripts/shot.mjs --plan scripts/plans/crazy.json --ready "!document.getElementById('boot')"
QC_URL=http://localhost:4173/ node scripts/shot.mjs --plan scripts/plans/crazy.json --ready "!document.getElementById('boot')" --hang-sdk
```

The console must show `CrazyGames HTML SDK initialized`, `Requesting game loading start/stop`,
`gameplay start/stop` and `Get "qc_save"`; with `--hang-sdk` (the SDK request never answers, like
an adblocker) the game must still boot. `crazy_ad.json` exercises a rewarded ad against a
`VITE_TARGET=crazy npx vite --port 5174` dev server (only meaningful with `ADS_ON = true`).

## 3. First submission

- [ ] Replace `src/data/orig` (above)
- [ ] Payment details set up (before submitting)
- [x] Privacy policy hosted: **https://querry-crush.web.app/privacy.html** (the URL for
      the form; the same text is in the game: Settings → PRIVACY). Contact: binhp8973@gmail.com
- [x] Covers: `store/crazygames/cover-1920x1080.png`, `cover-800x1200.png`, `cover-800x800.png` (2026-10-21: generated art in
  `store/source/gen-*.png`, one subject: the hydraulic breaker and its driver smashing an ore cube; title by
  `scripts/store/cover-art.html`, one line on the square. A busier first set is in `store/source/v1-busy/`)
- [ ] Preview videos (recorded by hand): `preview-1920x1080.mp4`, `preview-1080x1620.mp4`
- [x] Title, description, controls, tags, form answers: `store/crazygames/listing.md`
- [ ] Run the portal's Quality Assurance Tool; clear every warning; switch Progress Save on

## 4. Updating the hosted privacy page

Since 2026-10-20 it lives on **this game's own Firebase project** `querry-crush` (owner account
cuongpc19@gmail.com; the CLI uses it in this folder by default, set with `firebase login:use`),
next to the telemetry dashboard (ANALYTICS.md). Edit `src/privacy.html`, then:

```bash
npx firebase-tools deploy --only hosting     # runs scripts/stats/site.mjs first (privacy.html + quests.json)
```

The site holds only our files (`site/`), so a deploy cannot delete another game's page. The old
copy at `hop-n-7d1af.web.app/quarry-crush/privacy.html` (Pixel Flow's site, 2026-10-19) is stale:
it still says nothing is collected. Never give that URL to the form.

## 5. Never change after launch

- ⚠ **The `qc_` storage prefix** (`src/game/save.ts`). Progress Save restores keys verbatim, so
  renamed keys bring back a save the game no longer reads.
