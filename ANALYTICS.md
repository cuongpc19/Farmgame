# Telemetry: how far players get

The game writes short play records to the Realtime Database of **its own Firebase project**,
node `/qc`. The dashboard `site/stats.html`, on that project's Hosting, reads them. Built
2026-10-20 to the shape of the sibling games' stats pages (Pixel Flow, Seat Jam). It is a separate
project, not Pixel Flow's `hop-n-7d1af`: the user chose that, and the project is owned by another
Google account than the CLI's `binhp8973@gmail.com`.

**Two channels, like the sibling games** (user 2026-10-20):

| question | source |
|---|---|
| How many people right now, from which countries, daily users, retention, engagement time | **Google Analytics 4** → Firebase console → Analytics (§6) |
| How far players get (per quest / stage), what they buy, FPS, errors, single players | **Realtime Database** → `stats.html` / `pull.mjs` |

⚠ Google Analytics went in on 2026-10-20 (later the same day as the rows). Until then, the
console's "users in last 30 minutes" card counted nobody (user: "it looks wrong"). It counts only
players whose browser let gtag.js load. The dashboard's own cards **Đang online** (a row in the
last 6 min and not a `hide`; beats come every 5 min) and **Hoạt động 30 phút** count everyone, and
its source table shows the share of beats where GA loaded (`ga`).

## 1. The project

| | value |
|---|---|
| Firebase project | **`querry-crush`** ("Quarry Crush", number 619587022473), owner **cuongpc19@gmail.com** |
| CLI account | `firebase login:use cuongpc19@gmail.com` was set **for this folder**, so plain `npx firebase-tools …` here acts as that account (other game folders keep binhp8973@gmail.com) |
| Database | `https://querry-crush-default-rtdb.asia-southeast1.firebasedatabase.app`, Singapore. ⚠ The same URL is in `src/game/telemetry.ts` (`DB`) and `site/stats.html` (`CONFIG`). |
| Web app | "Quarry Crush stats", `1:619587022473:web:cac083a617da5ba0de2058` (its public config is in `site/stats.html`) |
| Dashboard | **https://querry-crush.web.app/stats.html** |
| Privacy page | **https://querry-crush.web.app/privacy.html** (the URL for the CrazyGames form) |

Set up on 2026-10-20:
- Rules deployed and probed from outside (§4).
- Rows from the game, sent with `?tele=1` from a headless run and from a real browser tab on the
  dev server, arrived and were read back with `pull.mjs`.
- Hosting deployed. `*.local.json` answers 404 there.

GA4 measurement id **`G-5SBXQR5X6G`** (the web app's stream, from `apps:sdkconfig`), in
`src/game/analytics.ts`.

**The read uid** in `database.rules.json` is `1f3HImf6Jcbl0ohHQk0oy9w0jw13` (cuongpc19@gmail.com,
2026-10-20). Any other account that signs in sees "Bị từ chối đọc" with its own uid; that is the
rule working. A second reader means adding that uid and running
`npx firebase-tools deploy --only database` again. `pull.mjs` needs no uid (it reads as owner).

## 2. What the game sends (`src/game/telemetry.ts`)

One `fetch` POST per row, fire and forget, with no SDK. No Content-Type header, so it is a simple
request with no CORS preflight, which a `keepalive` send from a closing tab might not survive.

| `ev` | when | extra fields |
|---|---|---|
| `open` | the game is playable (also when a tab returns after 30 min away) | `boot` ms since page start, `lang`, `tz`, `mob` (touch), `land`, `pm` (Perf. Mode) |
| `beat` | after 1 min of visible play, then every 5 min | `fps` (average while playing, menus excluded), `pm`, `ga` (gtag.js loaded, §6), the **work report** (below) |
| `quest` | a guide quest pays out | `qid`, `qt` (its text as shown) |
| `clear` | STAGE COMPLETE (after the bonus screen) | `cl` = stage |
| `buy` | upgrade / tool / rental / hire / HQ research applied; a boost or gift taken (since 2026-10-22) | `kind` (`up` `tool` `rent` `hire` `hq` `boost`), `key`, `lv` (upgrades) |
| `hide` | tab hidden or page left (also the reload of a stage change) | the **work report** (below) |
| `seen` | since 2026-10-22: a building entered (`key` = `building:shop` / `building:upgrade`), the walk-in shop left (`left:shop`), EQUIPMENT opened (`panel:equipment`), an item card in the walk-in shop (`card:<equipment key>`), a boost / gift offer coming up (`offer:<key>`, keys below); once per key per quest per page load (the row's `qi` says which quest) | `key` |
| `err` | `window.onerror` / unhandled rejection, at most 3 per page | `msg` |
| `fail` | boot failed (no game at all) | `msg`, `boot` |

**Every row also carries a snapshot.** That is why the furthest point a player reached can be read
from any of their rows, whatever window the dashboard loads:

| field | meaning |
|---|---|
| `sid` | **save code** (since 2026-10-21): 10 random characters kept in the save (`S.sid`), made on the first row. The CrazyGames cloud save carries it, so one player on two browsers shares it; Reset progress makes a new one. The dashboard joins device and save codes into one player. |
| `dev` | device code: 10 random characters, in `localStorage["qc.device"]`, which is **outside the save**. Reset progress keeps it, and the CrazyGames cloud save never carries it. |
| `first`, `n` | when that code was made (client clock), and the session count on this device |
| `ses`, `ss` | session code (`sessionStorage["qc.session"]`, so a stage-change reload continues it; a new one after 30 min away), and seconds into it |
| `st`, `pct`, `qi`, `cash` | stage number, % of its blocks broken, quests done (`S.quest.index`), cash |
| `pl` | **play time** in seconds, kept in the save (`S.played`). It counts only while the tab is visible and with a touch or key in the last 2 minutes, so it resets with the progress. |
| `build` | `BUILD_VERSION-<git short hash>`, with `+` when the tree was dirty (`vite.config.ts`) |
| `host`, `from` | `web` / `crazy`, and the page's hostname (how test rows are told apart) |
| `bot` | 1 on automated runs (sent only with `?tele=1`) |
| `at` | **server** timestamp (`{".sv":"timestamp"}`; the rules require `=== now`) |

**Boost / gift keys** (`seen` offer:<key>, `buy` boost <key>; `Boosts.ts` events `boostOffered` / `boostTaken`): the boost id for a
floor tile (1001-1003), the HUD offer (3001-3003), a facility button (5001 furnace, 5002 SELL, 5003 pizza truck, 7001 ATM);
`gift1001`-`gift1003` for the welcome gift cans; `5003b` for the extra STAFF PIZZA PARTY and `3001b` for the extra FREE CASH on quest 1026 (below). The dashboard
names them from `site/quests.json` (`scripts/stats/site.mjs`) and lists them under "Boost / quà" with "Đã thấy".

**Work report** (`beat` and `hide`, since 2026-10-21; user: players stall on quest 26 "clear 40 %" and the
rows could not say why). What happened since the previous `beat` / `hide` of this page, then it starts over
(`telemetry.ts` `WorkProbe`, fed by `Game.workProbe` and `teleBroke`):

| field | meaning |
|---|---|
| `tw`, `ta` | seconds with the tab visible; of those, with a touch or key in the last 2 min |
| `bp`, `bv`, `bw` | blocks broken by the player on foot, by a machine, by the crew |
| `tv`, `td`, `tf` | seconds driving a machine (since 2026-10-22 not the wheelbarrow); driving on an empty tank; with a full back (or full machine) |
| `tb` | seconds pushing the wheelbarrow (since 2026-10-22) |
| `wk`, `wi`, `wr` | worker-seconds blocked on the way (`WorkerUnit.blocked`: pushed back, or no way to the goal); with no block / chunk to go to (`seek`); tired or resting |
| `wn`, `wm` | crew size and miners, when sent |
| `fr` | blocks with an open side on walkable ground, when sent |
| `hb`, `hv` | median hits to break one of those with the player's hand tool / the machine driven or last ridden (0 = none) |

Check: `QC_URL="http://localhost:5173/?tele=log" node scripts/shot.mjs --plan scripts/plans/tele_work.json`
(a crew of 3, the player walking into the face, the first beat after 60 s, then a `pagehide`).
`seen` rows and `tb`: plan `tele_seen` (same `QC_URL`, `--size 393x760`: the shop, the breaker's card, a ride on the
wheelbarrow, then the breaker). Why `seen` (user 2026-10-22): a phone player sat on "Rent a Heavy Machine" for over an hour
with the cash for it, and nothing said whether they ever went into the shop.

**Switches.**
- `?tele=log` keeps rows in `window.__tele` instead of sending them. Plan `tele`:
  `QC_URL="http://localhost:5173/?tele=log" node scripts/shot.mjs --plan scripts/plans/tele.json`.
- `?tele=0` sends nothing.
- `?tele=1` sends even from a test run.
- ⚠ **Headless runs send nothing by default.** `scripts/shot.mjs` always adds `?gfx=`, and its
  Chrome does not report `navigator.webdriver`. The `?gfx` check is what keeps test plans out of
  the database.
- At most 400 rows per page load.

## 3. Reading it

- **Dashboard:** `https://querry-crush.web.app/stats.html` (Google sign-in; one uid may read). Sections:
  - cards: players, sessions, played over 1 min, session and play time, first sale, stage clears,
    D1/D7, JS errors;
  - **by day**, then the same columns **by phone / computer** (`mob` of the open row), for the whole window and per day
    (both at the top since 2026-10-22). **D1** = of the players whose first day is that day, the share with a session that
    STARTS on the next calendar day (a session running past midnight is not a return; until 2026-10-22 it was), counted
    up to now while that next day is still running (user 2026-10-22: no waiting for it to end); D7 the same 7 days on;
  - **milestones**;
  - **per-quest funnel**, stages 1-4 (all of quest group 1 as data.ts plays it): reached / done / step conversion /
    stopped here / gone > 24 h / play time at completion;
  - **milestones**: the rental and hire steps count real purchases (`buy` rows), not quests: the first rental quest is the
    wheelbarrow, and "Hire a Worker" only comes after 40 % of stage 1 while workers open (and get hired) at 20 %;
  - purchases: **Xem thẻ** = players who stood on that item's card in the shop (`seen`), next to the buyers;
  - **why slow** (`tWhy`): the work reports summed by the quest being played: % of the stage per minute, blocks per
    minute by the player / machines / crew, time driving, dry, full, crew blocked / idle / resting, open face, hits
    per block;
  - % reached inside each stage;
  - player list;
  - purchases;
  - devices / FPS / load time;
  - sources;
  - builds;
  - errors.

  Filters: window, dates (Vietnam time or UTC), test devices hidden, new players only, build,
  device codes to leave out (each device's code is in Settings → PRIVACY & CREDITS). Definitions are
  at the bottom of the page.
- **Terminal:** `node scripts/stats/pull.mjs [--days 30] [--all] [--out site/rows.local.json]` reads
  as project owner through the CLI (no uid needed) and prints rows by event and build, plus a
  histogram of the furthest quest.
- **Local preview:**
  - `node scripts/stats/site.mjs && node scripts/stats/fake.mjs`, then open
    `http://localhost:5173/site/stats.html?local=sample` (400 made-up players);
  - or `?local=rows` after `pull.mjs --out site/rows.local.json`.
  - `?local` works only on localhost / LAN, and `*.local.json` is never deployed (firebase.json `ignore`).
  - Plan `stats_why` (`--size 1280x900`, same `QC_URL` / `--ready`) checks the why-slow table and merged players;
    `stats_device` (`?local=rows`) the order of the top sections, the phone / computer table and the stage 1-4 quest list.
  - Plan `stats_page` (`--size 1280x900`) and `stats_phone` (`--size 390x844`) snap it, with
    `QC_URL="http://localhost:5173/site/stats.html?local=sample" --ready "document.querySelectorAll('#cards .card').length > 3"`.

**Test rows** are kept, not blocked: a blocked row is gone for good, while a filtered one is still
there when the question changes. They are filtered on read:
- `from` is localhost, a LAN address, a cloudflare tunnel or the claude.ai artifact;
- or `bot` is set.

## 4. Rules (`database.rules.json`)

**Write-only for the world.**
- **Writes.** Anyone may add a row (`$row: .write = !data.exists()`), and nobody may change or
  delete one. Only known fields of the right type and size get in (`$other: false`), and `ev` and
  `kind` must be one of the listed values.
- **Reads.** Exactly one uid may read. ⚠ Never widen that to `auth != null`, which means any Google
  account. A uid is per project; it is shown on the dashboard after a denied sign-in.
- `.indexOn: ["at"]` lets the dashboard download only its window.

⚠ **A new field or `ev` value needs the rules deployed BEFORE the build that sends it.** A refused
write is silent, because the game never reads the answer. Update `src/privacy.html` the same day.

Probe after every rules deploy:
- `GET <db>/qc.json` with no auth → `Permission denied`;
- `POST {"junk":1}` → `Permission denied`;
- a real-shaped row → written, and readable with `pull.mjs`.

## 5. Things not to break

- `src/privacy.html` lists every field. It has three destinations:
  - the in-game sheet;
  - `dist/privacy.html` (`build-target.mjs`);
  - the hosted `site/privacy.html` (`scripts/stats/site.mjs`, through `scripts/privacy-page.mjs`).
- `site/stats.html` must never ride into `dist/`. Vite builds only from `index.html`, so it doesn't.
- `teleBoot()` runs first in `boot.ts`, so a game that never starts still writes `fail`.
  `teleStart()` runs once the Game exists, and `teleFrame()` once per drawn frame (`Game.frame`).
- The `qc.device` key must stay out of the `qc_` prefix. That prefix is the save: CrazyGames' cloud
  save restores it, and `?reset=1` wipes it.
- Spark plan limits: 1 GB stored, 10 GB/month downloaded. A row is ~250 bytes, and an hour of play
  is about 30-60 rows. Prune old rows (`database:remove` by range) long before that matters.

## 6. Google Analytics (`src/game/analytics.ts`)

The sibling games' way:
- It uses gtag.js, not the Firebase SDK (the SDK would add ~31 KB to the bundle and still load gtag.js).
- `gtag` pushes `arguments`, never an array: gtag.js drops arrays silently. That is how Pixel
  Flow's first GA build sent nothing.

| event | when | params |
|---|---|---|
| `level_start` | 4 s after the game is playable (each page load, so each stage) | `level`, `level_name` ("Stage N") |
| `quest_complete` | a guide quest pays out | `quest_id`, `quest_index` (1-based), `stage` |
| `level_end` | STAGE COMPLETE | `level`, `level_name`, `success: true` |

GA adds its own `first_visit`, `session_start`, `page_view` and `user_engagement`.

- **Loaded 4 s after the game is playable** (`teleStart`), never on the boot path.
- **Never on test runs or dev machines** (`telemetry.isTestRun`: `?gfx`, webdriver, localhost /
  LAN / tunnel / artifact hosts). Every dev reload would otherwise be a new user.
- `?ga=log` queues the calls in `window.dataLayer` without loading the script. Plan `ga`
  (`QC_URL="http://localhost:5173/?tele=log&ga=log"`) checks they are `Arguments` objects in the
  right order. `?ga=0` turns GA off.
- Telemetry beats carry `ga` (1 = gtag.js arrived). All zeros from real players means GA is
  blocked (adblock, host CSP), not broken code.
- **Splitting by quest or stage** needs custom dimensions, which are **not retroactive**: GA4 →
  Admin → Custom definitions → Create custom dimension, Scope **Event**, parameters `quest_index`,
  `stage`, `level`. Reports lag 24-48 h. Realtime (~1 min) and DebugView are live.
- `src/privacy.html` names Google Analytics, the `_ga` identifiers and what Google receives.
