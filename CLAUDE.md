# Farm game (working title "Farm Valley") — project notes for Claude

A farm-and-trade arcade idle started 2026-10-28 from Candy Miner (C:\CuongPC\Game\CandyMiner f60aa34, itself Mars Miner
/ Quarry Crush; the user turned the candy theme down). Harvest rice (one swipe), chop trees of many kinds (old ones take
long), dig gold, rare ores and diamonds; process at the **Mill** (rice, wood, fruit) and the **Forge** (metals, gems);
sell at the Market. Repo: https://github.com/cuongpc19/Farmgame (the user asked for the new game to be committed there).
Names, story, buildings and look: **`docs/FARM.md`**; ideas from 12 farm / harvest / gold-digging games:
`docs/FARM_RESEARCH.md`. Nothing about candy, space or quarries may show. The notes below the line are still largely
Quarry Crush's (furnace = the Mill, trading house = the Market, oil = fuel, quarry = the fields, …).

- Dev: `npx vite --port 5175 --strictPort` (5173 Mars Miner, 5174 Candy Miner); plans with `QC_URL=http://localhost:5175/`.
- **What a cell is**: `src/game/farm.ts` maps every ore key (economy ids stay) to a kind (crop, wood, fruit, ore, gem,
  chest), a species and colours; `houseOf` (category rock → Mill, metal / jewel → Forge), `motionOfOre`, `isCrop`.
- **Cells are ChatGPT-drawn pictures** (user 2026-10-28: "for pretty rice and trees, try ChatGPT"; the procedural
  `world/farmNodes.ts` lost the side-by-side, `scripts/preview/field.html?src=sprites|nodes`): sheets on magenta drawn
  through the Codex CLI, cut and packed by `python -I scripts/sprites/nodes.py cut … / atlas` into
  `src/assets/farm/nodes.webp` + `nodes.json` (cut sprites kept in `art/sprites/`; DERIVED recolours veins / crystals
  for the ores and gems not drawn). `world/spriteNodes.ts`: each cell a quad facing the fixed camera (pitch 57°, yaw 0;
  quads are parallel, never cross, alpha test, no sorting), its foot moved toward the camera by the ground anchor; rice
  is two bunches a cell over a paddy-water square. Keep images small (user): 192 px slots, WebP q78.
- **Field** (`world/BlockField.ts`, takes a `NodeSource`): InstancedMesh per kind / variant / 8x8 chunk; a tree sways
  in its picture plane away from the axe, a rock judders; `world/Felled.ts` topples a tree / folds cut rice on the last
  blow; `Game.hitFx` (straw and grain, wood chips and leaves, stone chips and vein bits) and sounds `sfx.reap / chop /
  fall / hit / breakBlock`. Rice: any hit cuts it and a sweep cuts up to 3 rice cells side by side, 2 sheaves each
  (`Mining` CROP_SWEEP / CROP_DROPS).
- **Two processing houses**: `base/Furnace.ts` takes a house ("mill" | "forge") and only takes its own raw items
  (`takes`); `Game.houses`, `houseFor(item)`, guide targets via `rawPad` / `trayWaiting`; workers deliver house by
  house (`WorkerWorld.padFor`); transit saves `forgeQueue` / `forgeOut`. The Forge is a new building type placed by
  `scripts/townbase.py` (north row Farm Shop · Workshop · Forge · Mill, south row Farmhands' House · Fuel · price board ·
  Market). Stage 1 mixes orange trees, pines and maples into the bamboo (`stagegen.py` TREE_MIX, layout v4).
- **People** (`characters.ts`, reference sheet `docs/concept/characters.jpg`): farmers in straw hats or conical leaf
  hats, shirts (sleeves to the wrist or rolled), overalls; slimmer than Quarry Crush (`BULK`). Hand tools are a set
  picked by what is in front (`Character.motion`): sickle and a low one-handed sweep (reap), axe and a slanting two-handed
  chop (chop), pickaxe overhead (dig); `sledgehammer`'s slot is the steel tier.

## Inherited from Quarry Crush / Mars Miner

3D arcade-idle mining prototype (Three.js 0.185 + TypeScript + Vite), modelled on
*Bulldozer Master: Crush & Mine* (Supercent). The original's ten main stages with the full flow:
tutorial → mine/smelt/sell → upgrades/shop/rentals → workers/minecart → stage clear →
reward → contract room → next stage; after stage 10 the maps come round again as stage 11, 12, …
(harder ore, dearer rentals). User designs, Claude builds.

- Dev: `npm run dev` (phone on same wifi works, `host: true`) · Typecheck: `npx tsc --noEmit` · Build: `npm run build` (~2.8 MB JS, ~0.88 MB gzip)
- **CrazyGames**: `npm run build:crazy` → `dist/` is the upload (drag its contents, no zip). Everything about it,
  including the SDK layer (`src/platform/`), the form answers and what still blocks submission: `CRAZYGAMES.md`.
  Store covers: `store/crazygames/`, since 2026-10-21 from image-model art (`store/source/gen-wide|tall|square.png`, made
  without lettering) with the QUARRY CRUSH title put on by `scripts/store/cover-art.html?layout=…` (snap at the store
  size, `--ready "window.__ready === true"`); the older all-3D covers: `scripts/store/cover.html`. Listing text: `store/crazygames/listing.md`.
  ⚠ `npm run build` (web) writes `dist/` too: run `build:crazy` last before an upload.
- Ads are **off** (`src/game/ads.ts`, `ADS_ON = false`, user 2026-10-19). User 2026-10-20 (option A: as the original looks
  to a player who never watches an ad): one-time unlock pads (minecarts 2-3, cafeteria tables, bridges, auto digger,
  harvester, extra oil) are FREE (some bridges have no cash price, so hiding them would block the stage); offers that
  come back (boost tiles, FREE CASH / GEAR / GEM, furnace / special order / pizza, ATM, the mystery gift box) only
  show while their free trial lasts (`Boosts.offerable`: the original's FreeTrial rows 2001-2003, 4001,
  6001-6003, stage 1 only; ours since 2026-10-25, user: "boosts on the later stages, like stage 1": one free try of each on
  every stage after it too, kept in `S.run.trials`, while stage 1 keeps its tries in `S.dialogues`). **Gift boosts** (ours, same day): a new player gets a DAMAGE can (60 s) from the first second, on the way to the first
  rock (user 2026-10-27: "nearly every player should get it"; before, it dropped beside the first rock hit): halfway along
  the line from the player to the nearest block, the one quest 1001's arrow points at (`Game.openGroundOnWay`; cans only
  land on open ground, `openGround`: on the map, clear of blocks and buildings). It waits 120 s (`FIRST_GIFT_SECS`),
  walking within 2 m picks a gift can up (`GIFT_REACH`), and `S.gift` stays 0 until it is taken, so a reload drops it
  again. 30 s after it is taken (or gone) a
  SPEED can (60 s), 30 s after that a MAGNET can (15 s); walking onto a can gives the boost, an untaken can goes when
  the next one drops. The same round comes again 3 minutes after its last can, MAGNET included (stage 1 only until
  2026-10-25; now every stage, and a contract sets `S.gift` = 0 so each new stage opens with a round from its first hit), and the
MAGNET trial tile is offered like the others (user 2026-10-24: MAGNET back as before; on 2026-10-22 it had been cut to the
welcome round only because boosts made the wheelbarrow feel worth little). 2026-10-22 also: the wheelbarrow starts as if upgraded 4 times, Lv.5, cargo 29
(`START_LEVEL` in state.ts; saves below that are lifted to it). 2026-10-27 (user: "from the first second, smash and carry
more"): the pickaxe starts as if upgraded 5 times (Lv.6) and the wooden carrier 4 times (Lv.5, cargo 9). **Mars Miner
(user 2026-10-28: "no BIG GIFT; upgrade them from the start: two hits and a limestone is done")**: the pickaxe hits 2.1x the
original at every level (`PICKAXE_MUL` in data.ts; workers divide it back out in `WorkerUnit.setGear`), 25.2 at Lv.6, so
limestone (50 HP) takes 2 hits (a DAMAGE boost's +50 % leaves it at 2; it helps on the harder ores). Plan `start_gear`.
Quarry Crush's BIG GIFT (27 Oct: the first can x1000 for 5 minutes; telemetry 28 Oct: 29 % of players past 5 minutes
left right when it ran out, vs ~10 % before) is gone: every can and tile is the original's +50 % (user: "keep the boosts
as before"). Telemetry: about 63 % of new players who got the first can picked it up (25-27 Oct, median 4 s). Plan `boost_value` (`--size 393x760`). The gift timer and
  every can's countdown stop while dialogue, a spotlight or a camera pan is up (`busy`). `Boosts` GIFTS / GIFT_SECS,
  `S.gift` = welcome round progress (older saves skip it). Plan `gifts`. **Quest-26 pizza party** (user 2026-10-22: most players
  who leave stage 1 leave on quest 1026 "Clear 40%"): after 3 minutes of play on that quest (`S.quest.at` = `S.played` when it
  came up) one more free CREW BBQ PARTY (the reference's staff pizza party, renamed 2026-10-24 with the restaurant; icon 🍖)
  waits at the restaurant (`Boosts` PIZZA_BONUS, flag -15003; no Hydraulic Breaker
  needed; a toast says so once; used before the stage-1 trial). Plan `pizza_q26` (`QC_URL=…?tele=log`, `--size 393x760`).
  At the same 3 minutes a FREE CASH +3,500 (× stage multiplier) waits on the HUD button until tapped (user 2026-10-22;
  `CASH_BONUS`, flag -13001, telemetry key `3001b`; its toast waits 4.5 s after the pizza one; not the stage-1 trial,
  which only comes after the Hydraulic Breaker). Plan `cash_q26`.
- **Reasons to come back tomorrow** (Mars Miner, user 2026-10-28; Quarry Crush's D1 was 3-6 %; the original's systems
  looked up in its tables): `systems/Comeback.ts`, both opening at quest 1007 (index 6, the end of the tutorial; ~47 % of
  new players got there in Quarry Crush, ~1-2 min in) or on any later stage. **Supply drones** (the original's Research
  Laboratory, RndRewardData 15 cash a minute, at most 6 h, which it opens on stage 4): cash in real time, played or not,
  x the stage's FREE CASH multiplier (RV_EarnItem); the 🛸 button (right edge, under the chips / EQUIPMENT) shows the
  store, a tap opens the card with COLLECT; a page load with 10+ minutes in the store opens it as WELCOME BACK! (`S.drones`
  = when the store was last emptied). **Daily supply** (the original sells a 3-day supply): a free 7-day calendar, one crate
  per local calendar day, $200 / 1,000 / 1,500 + SPEED 5m / 2,000 / 3,000 + POWER 5m / 4,000 / 8,000 + all three 5m (x the same
  multiplier); a missed day is not lost, after day 7 the week starts again (`S.daily` = crates claimed, date of the last);
  the 📅 button has a red "!" while today's crate waits, and after a claim the card says what tomorrow brings. Day 1 is
  given at the unlock, then the drones' toast. Cards open by themselves only when nothing else is up (`calm`). Telemetry:
  `buy` kind boost, keys `drones`, `day1`…`day7`. Plan `comeback` (`--size 393x760`; it reloads the page once).
- **Telemetry** (user 2026-10-20: see how far players get): `src/game/telemetry.ts` posts rows (open / beat / quest /
  clear / buy / hide / err / fail, each with a progress snapshot) to this game's OWN Firebase project `querry-crush` (https://querry-crush.web.app/stats.html; not Pixel
  Flow's hop-n), read on `site/stats.html` (Firebase Hosting, Vietnamese labels). Rules `database.rules.json`, setup
  status and every field: `ANALYTICS.md`. ⚠ New field = deploy rules first + update `src/privacy.html`.
  Headless runs send nothing (`?gfx`); plan `tele` checks the rows with `?tele=log`. Every row carries a save code `sid`
  (in the save, so the cloud save joins one player's browsers); `beat` / `hide` carry a **work report** (user 2026-10-21:
  players stall on quest 26 and the rows could not say why): blocks by player / machine / crew, driving / dry / full
  time, crew blocked / idle / resting, open face and hits per block (`Game.workProbe`, plan `tele_work`); the dashboard
  sums it per quest in "Vì sao chậm" (plan `stats_why`). `seen` rows (2026-10-22): buildings entered and item cards looked
  at in the walk-in shop (`shopCardShown` event), plus wheelbarrow time `tb` apart from machines (plan `tele_seen`).
  Plan `crew_rest_share` measures the share of time the crew spends tired / resting (38 % with 2 seats; field 29 %).
  Boost / gift offers shown and taken: `seen` offer:<key> + `buy` kind `boost` (keys in ANALYTICS.md). Also `seen`
  left:shop (walked out of the hall) and panel:equipment (EQUIPMENT opened); every `seen` key once per quest per page. Plus Google Analytics 4 like the sibling games
  (`src/game/analytics.ts`, gtag.js 4 s into play, never on dev / test runs; plan `ga` with `?ga=log`), for the Firebase console's live / country screens.
- Headless checks: `node scripts/shot.mjs --plan scripts/plans/<plan>.json` (dev server must run).
  Plans: `loop` (mine→smelt→sell), `progress` (20/60/80 % unlocks), `clear` (stage clear → stage 2),
  `shop` (walk-in Machinery Center), `vehicles`, `workers2`, `touch` (finger drag), `beauty` (`--hq` look shots),
  `land` (`--size 1280x720`), `shopguide`, `equip2`, `boostobj`, `transit_a` then `transit_b --keep-save`,
  `upbuy` (cash arriving while the Upgrade sheet is open), `guide` (where the chevrons point in each situation), `reset` (Settings → RESET really starts over), `tools_drag` (`--size 393x760`: a touch starting on EQUIPMENT steers;
  only a quick tap opens it), `music` (render cost per slice, the loop starts after the first tap, the Settings switch, the 2 % / 5 % swell), `gifts` (`--size 393x760`: welcome boosts, offers with ads off),
  `price_look --hq` / `price_s2 --hq` (the price list in each stage), `fxlook --hq` (break FX stepped by hand
  at near-zero `timeScale`, so the quest camera stays put), `crazy` (a built `dist/` under
  `vite preview`: `QC_URL=http://localhost:4173/ … --ready "!document.getElementById('boot')"`, add
  `--hang-sdk` to simulate an adblocked SDK), `store_cover` (cover page, see CRAZYGAMES.md).
  `--boot-timeout <s>` for big windows / parallel runs. `debug.quiet()` marks every dialogue seen,
  `debug.crew(role, n)` adds free workers, `debug.state()` is the save object.
  **Test links for the user** (dev server / web build only, `debug.fromUrl`): `?reset=1&prog=40&cash=10000&quest=1027`
  starts stage 1 at 40 % broken with 10,000 cash on "Hire a Worker" (lines before the crew's count as seen); the
  parameters strip themselves after loading. `?reset=1&stage=5&cash=200000` starts stage level 5 as if the contracts
  before it were signed (quest chain from that contract, onboarding seen, earlier tools / machines count as used once;
  the page reloads once, then the other parameters apply). Plan `stage_link` (`QC_URL="http://localhost:5173/?stage=5&cash=200000"`).
  `__game.debug.skipTo(questId)` jumps the guide chain (e.g. 1009 to unlock the shop). Adds `?reset=1&gfx=low` by default; `--hq` adds `gfx=high` (full quality whatever the Settings switch says).
  `__game.debug.mine(n)` breaks n blocks silently (progress). `sell(n)` counts n ingots sold and
  breaks n/6 blocks. `cash(n)`. `timeScale` fast-forwards in fixed sub-steps.
  Parallel runs need their own `QC_CDP_PORT=94xx` (each port gets its own Chrome profile).
- Boot order: `main.ts` only starts the platform (`platform.init()`), then imports `boot.ts`, which is the
  game. Nothing that reads the save or settings may be imported by `main.ts` (cloud save arrives in init).
- Phone build away from home wifi: private claude.ai artifact https://claude.ai/artifact/Y5NVuKQCZaonKGrmJgY1yP.
  Update it with `npm run build && node scripts/inline.mjs dist <scratchpad>/quarry-crush.html`, then
  publish that file to the same URL. The script inlines JS, CSS and the font into one wrapper-less page.
  The host rejects U+FFFD and control characters, so write them as `\uFFFD` / `\b` escapes in source.
  The artifact never sees the query string, so `?reset` / `?gfx` / `?speed` do nothing there.

## ⚠ The economy is the ORIGINAL game's — temporary

**Stage 1's quarry is ours** (2026-10-19, user picked map idea A): a fan opening out from the
base, `src/data/game/stage1.json`, generated by `python -I scripts/stagegen.py write` (never edit the
JSON by hand; `preview <png> --angles 120,90` draws sketches). Since 2026-10-21 (user: rocks too far
from the houses, above all the furnace) it is layout `fan140-v2`: 140°, apex 4 cells behind the mouth
in line with the furnace (`FAN_CX` / `FAN_BACK` / `FAN_APRON`), so the first quarry row is a wide face
of rock right by the yard (walk from base avg 31 -> 23 cells, furnace -> nearest 200 blocks 18 -> 14).
**Ore ladder** (Mars Miner, user 2026-10-28: "at first two hits per limestone; only a while later the other rocks";
layout `fan140-v3`): `LADDER` in stagegen.py caps the hardest ore by walking rank from the base: the nearest 200 blocks
are limestone only, then up to 150 HP (sandstone, copper; quest 1025 wants 10 metal ores, players reach it ~320 blocks
in), 500 up to iron, 700 up to silver (800 HP), gold / amethyst / diamond only past that; same count per ore. Before
(Quarry Crush): 100 limestone with 4 soft accents in the front rows, then the original's profile (iron at block 103,
silver 111, gold 181). Telemetry (25-27 Oct, 5 hits a limestone): players broke ~16 blocks in 5 min, 39 in 10, 151 in 30.
The cliff walls beside the base became `areas.lawn` (grass; MapView puts no water there; user: "too
many unbreakable crates by the houses"). Original / v1 / v2 side by side: `docs/map/stage1_goc_cu_moi.png`. Same
1,204 blocks and per-ore counts as the original, dealt "richer the farther from base"; the base,
clear rule, rewards and contract fields are still the original's. Three open rail lanes run from the carts (101 near the mouth, 102
half way, 103 deep) to the storage. Changing a layout: bump `layoutId` in stagegen.py (stages 2-10: `LAYOUT` in stagevar.py). A save of another layout
(`relayout` in state.ts, user 2026-10-24) keeps the same number of blocks broken, nearest the base by walking first,
keeps everything else, and gets $3,500 (`MAP_GIFT`, toast "New map for this quarry!" once, `S.mapGift`). Before that
day the quarry restarted at 0 %, and one player on "Clear 40 %" left 9 s after. Plan `new_maps` (`--size 393x760`).
Tests: plans `fan_loop`, `fan_workers`, `fan_look` (`--size 1280x720`). Sketches: `docs/map_ideas/`.
The lawn beside the stage 1 base (`areas.lawn`, not walkable) is a storage yard (`world/yard.ts`, user 2026-10-21):
shipping containers, crate piles and barrels laid out per tile from a seed, three InstancedMeshes; scenery only.

**Stages 2-10 are the original's maps, reshaped by us** (user 2026-10-20, map idea E; 2026-10-24: "our own maps, but don't
change them too much"):
`python -I scripts/stagevar.py` (slimdata.py runs it) mirrors each quarry left <-> right about its
rail trunk (snapped to the 4x4 tile grid; then the storage and the rail below the quarry move 2
cells with it) and deals the ores again with the original's depth profile, same per-ore counts.
Since 2026-10-24 `reshape` gives every part of the quarry our own outline first: square corners bevel back to cliff
(convex ones only, two passes on big parts), a notch or two on long edges, then lobes into the surrounding cliff until
the part's blocks fit again (wide ones first; never with ground on opposite sides, so no gap between two arms closes;
on the map's outer cliff the void behind becomes new cliff), and the ore takes a new body inside (depth from the bare
rim plus seeded noise: ragged edges, clearings). Kept as they were: the parts and bridges between them, the rails
(ore still lies on them), the machines and pads (plus a free cell round them), each part's block count, and the
quarry front (the first tile row of ore and everything below it, ore included), so the walk from the houses is the
same. 10-32 % of the blocks moved per stage. Layout ids `ours-v1-sN` (before: `mirror-v1-sN`).
Then `open_front` turns the cliff between the base and the first ore row (within the base's width) into ground
(user 2026-10-21, stage 2: "rocks you can't break block the way from the houses to the quarry"; the mirror had put
the quarry's neck behind the worker building, so the north row faced a wall: Upgrade -> nearest ore 57 -> 26 m,
oil station 69 -> 32 m). A tile opens only when every cell round it is ground the base reaches on arrival or more
cliff: never a part behind a bridge or through ore, no new edge to the water. Ores and layout ids are unchanged, so
saves keep their quarry. Plan `stage2_front` (`--size 1280x720`: metres from each door to the nearest ore).
Drawings of every stage: `python -I scripts/mapdraw.py
src/data/game/stageN.json docs/map/stageN.png`. The decoded originals (`src/data/orig/stage3..10.json`)
come from `C:CuongPCGame	oolsapkulldozerdecodeuild_outputs.py` (tables + decoder kept there,
outside the repo). **Stage levels**: `S.run.level` 1, 2, 3, … (`stageNumber()`); the map is
`stageIndexOf(level)` (10 maps, looped); `stageMult(level)` gives ore HP (x2 from 11, x3 from 21)
and rental multipliers; old saves take `stageIndex + 1`. `__game.debug.stage(n)` starts level n
(tests). Plans `stages` (every stage loads), `stage3` (workers cross bridges), `loop10` (clear 10 → 11).
New things in stages 3+ (all from the original's map data; how they behave is INFERRED where the
tables say nothing):
- **Bridges** (`base/Bridge.ts`): footbridges (people only) a pad widens for machines (cash 1,500
  / 2,500 / 4,500, or an ad = FREE); machine bridges built free or on an ad pad. Rotation 90/270 runs
  north-south. Walkable ground is two lists in MapView (`walk` people, `wheel` machines; vehicles
  clamp with `vehicle = true`). Gaps next to ground get water.
- **Routing** (`world/Nav.ts`): nobody heads straight for a goal (islands, and every quarry is a wall of ore).
  Workers walk `Nav.route` on a fine grid (half cells; buildings grown by the 0.6 body, unbroken ore closed),
  breadth-first then pulled straight where the body fits, replanned every 1.5 s and when stuck; miners and
  carriers pick work with `Nav.nearest` (the nearest block with a free side / loose chunk BY WALKING, one search),
  and drop a goal at once when there is no way to it (user 2026-10-21: workers kept walking into ore and the
  furnace house; a coarse cell whose centre a building missed counted as open). Overlapping workers are pushed
  apart (`Game.spreadWorkers`); seatless ones wait on their own spot (`Cafeteria.queueSpot`). Plans
  `worker_stuck` (stuck seconds per worker), `crew_rest` (`--size 393x760`: queue + full Job Board). The auto
  harvester plans its own block-aware route on the ore-cell grid.
- **Auto diggers**: several per stage, each on its own deposit (ore + amount from OreDepositData,
  `STRUCTURE_INFO`); saved per structure group (`transit.diggers`).
- **Extra oil station** in the quarry (OilStation `extra`): ACTIVATE pad, a barrel every 0.5 s, no bin.
- **Auto harvester** (`actors/Harvester.ts`): ACTIVATE pad; collects loose chunks, tips them onto
  the storage at its return point. Load 40, speed 5, reach 3 are ours (no data).
- **Mystery ore**: with ads on, breaking one offers the original's gift box behind an ad (cash = 20 of the stage's
  best ingots, ours); with ads off, nothing.
- **Mountain** (stage 9): a rocky knoll prop + solid.
- **Knuckle Driller** heat: +3.125 per hit, full at 100, stops until it cools to 60 % (cooling 25/s is ours).
- **Later equipment** (EQUIP now takes every "ReachStage" item; IAP-only Titan Drill / Impact Hauler stay out):
  large hand drill, knuckle driller (stage 7), exo-carrier (+15 % walk speed, ours: its stat is empty),
  drill crusher (2 blocks a hit), crush hammer (stage 7, long reach), inferno breaker (stage 12, 7
  blocks: Mining sweeps a ring of 2 past 5 targets), haul truck, wheel crusher (stage 10, mines AND
  carries), fuel truck (`Vehicle.feeds`: feeds machines beside it from an 850 reserve; on an oil
  pad it refills 50 per barrel). Models: `makeVehicleModel(key)` in models.ts; hand tools and back
  carriers are real models now (`characters.ts` gear, read from the save every frame; workers use
  `S.run.gear`); `setToolHeat` tints the knuckle driller. The walk-in shop has three rows (stage 1-2
  machines, stage 3+ machines, light-tool counters). Plans `equip3` (stage 10), `equip3_inferno`
  (stage 12), `equip3_old` (stage 1-2 machines; `vehicles` parks the breaker where the fan has no ore).

**The base is ours** (`scripts/townbase.py`, run by stagegen.py for stage 1 and stagevar.py for
stages 2-10): north row machinery shop · oil station · Upgrade, one cell apart (user 2026-10-21: short walks
between them; `MOVES`) · (two-cell avenue) · furnace + ore
storage · worker building · cafeteria; the trading house stands right below the Upgrade building
(same column, user) by the road. Furnace, storage, worker building and cafeteria keep the stage's
spots (rails end at the storage); when the storage or a rail sits where the Upgrade / trading house
go (stage 3), `moves()` slides those, the oil station and the shop left. A player spawn that lands on
a building moves to the nearest free cell. Vehicle spots are picked from free cells off the avenue; street
lamps are prop `streetLamp` (MapView). The script stops with a message if anything overlaps.
**Selling is ours: the trading house** (`base/SalesStand.ts`, user 2026-10-19): drop ingots on SELL
(the drawn pad, inner side, facing the furnace) → belt into the house → out of the front door onto
the BUY spot by the road → trucks load there → coins hop truck → house → bundles on the CASH spot
(outer side, below SELL; CASH and BUY are not drawn, user). Saves keep every ingot in the pipeline
(`itemsToSave`) and every coin on its way (`moneyToSave`). Plans `town_look`, `town_s2` (stage 2).

**Pacing: Mars Miner runs much faster than the original** (user 2026-10-28: "progress much faster than before, quests
and power easier to reach"; Quarry Crush at the original's pace: median 6 min to the hammer quest, 35 to "Save 2500",
108 to stage 2). `PACE` in data.ts: price 0.5 (everything the player pays, and the "Save N" quests with it), mining 1.25
(swing 0.8 s), cargo 1.5 (carrier 9 -> 14, wheelbarrow 29 -> 44), plant 2 (furnace, oil, digger), truck 2, pickup / unload
1.5, quest 0.5 (counted quests: break 20 -> 10, refine 50 -> 25, break 150 -> 75; counts of 5 and under stay), reward 3 (quest
cash). Upgrade, hire and stage-progress quests and the 80 % clear rule are unchanged. Quarry Crush ran every knob at 1
from 2026-10-20 ("economy and progress exactly like the original"; x1.5 earlier that day).
**Except the pads at buildings** (`PAD_SPEED` = 10 in base/common.ts, user 2026-10-21: "really fast"): picking up
at STORAGE / the furnace tray / the oil rack / an auto digger pile and dropping onto REFINING / SELL / a minecart /
DUMP OIL go 10x the original (0.02 s an item). Loose chunks in the quarry keep the original pace. Plan `pad_speed`.
**The guide arrow is ours** (`Game.arrowTarget`, user 2026-10-19: only when the quest needs it and
there is something to do now): empty tank → oil; cash on the CASH spot while you're around the base
(or a sale running while you're at the market) → cash; nothing calls you home while you mine with
room on your back (`busyMining`: a hit in the last 2.5 s or ore within 1.6 cells); a building only
once you can pay for what the quest wants there (`questCost`), else the next step toward that money
(`earnStep`: ingots → SELL, minerals → furnace, ingots on the tray). Quest 1005 "Head to Upgrades" waits until the
first sale's cash is picked up (user 2026-10-22): meanwhile the card reads "Collect Your Cash" (no reward box), the
arrow points at the CASH spot and Upgrade has no "!"; then line 201, the pan and the arrow (`QuestHost.waitCard`,
`Quests.waiting`). Plan `cash_first` (`--size 393x760`). The camera pan at a quest's start
still uses `guideTarget`, and is skipped when that is within 3 cells of you (`Game.beside`; user 2026-10-22: at the
furnace, quest 1004 panned from REFINING to the tray 5 m away). Plan `opening_nopan` checks it. A page load replays
the current quest's start without the pan when it already played on this stage level (`S.quest.begun` = "index@level";
user: after a reload on 1004 the camera panned from the spawn to the tray); plan `reload_nopan`. All of that is the tutorial only (`learning`: stage 1 up to quest 1006, the
first upgrades; user: later it sent players running everywhere). After it, only a quest that brings
something new (`newThing`: a building to visit, a tool to buy, a machine to rent or drive, the first
hire ever) gets the arrow (once affordable) and its camera pan; routine quests get the card only. Exception: quest 1019
"Buy an Upgrade" x5 is treated as new (user 2026-10-22: two of five players who quit on it had the cash and bought no
upgrade; the Upgrade building was last pointed out at quest 1005). Plan `quest19_guide` (`--size 393x760`).
The home tab under the player shows until quest 1010. Plan `guide` checks each case.
**Arrow past the tutorial** (user 2026-10-24; telemetry: 24 % of players quit on "Save Up 250 Cash", the first quest without
the arrow, many mining on with a full back and never selling): the arrow (not the pans) keeps showing the money loop on
stage 1 until the Sledgehammer is bought (`MONEY_TAUGHT`, quest 1010). After that it comes back whenever the player has got
nowhere for 30 s (`STUCK_GUIDE`, `Game.updateStuck`: the quest has not moved, nothing picked up, delivered, sold or spent;
mining with a full back counts as stuck; menus, dialogue and pans stop the clock), and goes as soon as they do something;
stuck with empty hands it points at the nearest ore. The save-up quests say what the money is for (text 1008 "🔨 Save {0}
for the Sledgehammer", 1013, 1020), and while one runs the Upgrade sheet says upgrades spend the savings
(`UpgradePanel.saving`, `.sh-note.save`). Plan `save_up` (`--size 393x760`).
**OIL bar** over every fuel machine (`fuelLabels`, `.fuelbar` in style.css, like ref/27; user 2026-10-21: no way
to see fuel running low, the bar had no styles): green, yellow under 50 %, red and blinking under 20 %, dark when
dry; height 3.3, under the mount pin (6.2). Plan `fuel_bar` (`--size 393x760`).
**Dry tank** (`Game.refuelTarget` / `outOfOil`, user 2026-10-20: running dry had no guide): the toast "Out of oil! …"
each time, a camera pan to the oil the first time (flag -902 in `S.dialogues`), and the arrow leads from the
machine you drive OR the last one you got off (`lastRide`) to the nearest open OIL pad, then, with barrels on
your back, back to that machine; at most 30 s from running dry (`refuelUntil`, user), every new dry spell
starts its own 30 s. **In the hall**, a "rent / buy any" quest (1021) points at `shopPick`: the
dearest one you can pay for, else the cheapest (it used to point at the door). Plan `oil_guide` (`--size 393x760`).
**Playtest fixes 2026-10-24** (user: "milestones easier, the game still fun"; the report is
`C:\CuongPC\Game\testgame\QuarryCrush\PHAN_TICH_PLAYTEST.md`, players stopping at quests 26, 28, 33, 35, 38; the user kept
quests 28 / 35 and the crew as they are):
- **Oil.** A fuelled machine standing on an OIL pad is filled from the rack barrel by barrel (`OilStation` drive-in), and a
  dry one crawls at 35 % (`Vehicle.EMPTY_CRAWL`; the data's 5 % left the walk for barrels as the only way out). On foot
  with a full back the pad gives nothing: it now says "Back full! Drop your load at REFINING, then grab oil"
  (`OilStation.onBackFull`, every 6 s at most), and `refuelTarget` leads to REFINING / SELL first (`earnStep`), still
  within the user's 30 s. Toast on running dry: "Out of oil! Drive back to OIL, or bring barrels from it".
- **Walk-in mount** only while the player steers (`input.active`) and never into a dry machine (its pin still mounts it):
  auto-mine's own walk kept seating players in machines parked by the face.
- **Contract → next stage.** Machines are rented per stage again, like the original (user 2026-10-25: "buying and renting
  exactly like the original", every contract, 1 -> 2 included; line 501 and the shop row say so, RENTED). For one day
  (2026-10-24) they came along and then every machine ever rented was given back on every stage (`keepMachines`, gone):
  telemetry showed players no longer used the hand drill they bought, and the original balances the two by the rent
  (x1.2 at stage 2 … x2.4 at stage 10) against tools that are yours for good. Saves that got machines back that day
  keep them until their next contract. Machines beyond the map's 5-7 spots park on open ground (`Game.parkingSpot`).
  Plan `stage_boosts` (`QC_URL="http://localhost:5173/?reset=1&stage=2&cash=0"`, `--size 393x760`: gift round and free
  tries on stage 2, rent x1.2, the machine left behind at stage 3). The ore
  and ingots still on their way to a sale (back, machines, furnace, SELL pipeline, storage, carts) plus the CASH spot are
  bought out at ingot prices (`Game.leftovers`), toast "Last quarry's leftover ore sold: +$N" on the new stage
  (`S.leftover`). ⚠ Bug fixed with it: the reload's `pagehide` save wrote the old quarry's transit (back, chunks,
  furnace, SELL pile, pallet) into the new run; `Game.leaving` now stops `saveTransit` (contract, `debug.stage`, `?stage=`).
- **Quest 1038 "Research at HQ"** (the first `ManagementUpgrade` quest): the Heavy Machine floor (Gear research) opens with
  it instead of at stage 2's 40 % (`researchFloors`); at its start Mia says 803 (last line reworded), then a spotlight on the
  HQ button lets go into the tower (`researchQuestIntro`, like `spotMount`); a red "!" sits on the button while the
  quest is up (`.ic.bang`). Two Gear researches (250 + 200) finish it; before, only cash research was open (5,225 for two).
Plans: `playtest_oil` (`--size 393x760`), `playtest_contract` (`--size 393x760`, the `clear` flow with rentals and
leftovers), `playtest_q38` (`QC_URL="http://localhost:5173/?stage=2&cash=3500"`, `--size 393x760`).

**The game loads `src/data/game/`, never `src/data/orig/`** (2026-10-19, user: no original text in
the build). `python -I scripts/slimdata.py` makes `economy.json` + `stage2.json` from the decoded
tables with all of the original's writing removed (dialogue, quest texts, guide toasts, blurbs,
worker names, research / floor / boost titles, stage names, decoder notes); `stagegen.py write`
puts `stage1.json` through the same scrub. Rerun both after touching `src/data/orig`.
`src/data/game/ORIGIN.json` lists what is still the original's: `build:crazy` prints each entry as
"CHUA NEN NOP", and fails if the bundle contains any original string (it compares against
`src/data/orig`; phrases we kept on purpose live in text.json and are allowed).

**Text is ours** (2026-10-19, user: reword everything a little, dialogue included):
`src/data/text.json` is the only source of every string the game shows (quests, guide `toasts`,
dialogue, equipment blurbs, upgrade names, workers, boosts, HQ floors and research, stage names,
speaker names: Foreman Gus / Assistant Mia; internal speaker ids stay `hank` / `sofia`). Keys are
ids: quest / dialogue / worker / boost / HQ floor / HQ research ids, equipment and upgrade keys,
stage order. `data.ts` applies it. Dialogue entries keep their line counts (801 and 901 are played in parts by position). UI
sentences that were transcribed from the reference video were reworded in place. The three floor boosts are called SPEED BOOST,
POWER BOOST and MAGNET BOOST (generic names, kept on purpose; user 2026-10-21: clearer than our "Quick Hands" /
"Power Swing" / "Ore Magnet"); SPEED BOOST it speeds up the
hired crew as well as the player (+30 % walk, +23 % swing; `WorkerUnit.speedMul` / `intervalMul`, set in Game).
**Prices are the original's again** (user 2026-10-20; 20% off on 2026-10-19): `cheaper()` in `data.ts`
still applies `PACE.price` to everything the player pays (tools, rentals, upgrades, hires, research,
the "Save Up N Cash" quests and the cashback target) and returns the decoded number at 1. The quest
chain and every other number are still the original's. **Quest chain** (`QUESTS` in data.ts): group 1
(stages 1-4) once, group 2 six times, group 1000 sixty times (the original loops it for ever); saves
index into that list, so it only grows at the end. Idle-reward claims (ClaimRndReward) are left out
(no such system here). Rewards pay Money, Gem or Gear; groups 2 / 1000 scale with the stage level
(QuestMultiplierData). HireWorker condition 1 / 2 = a miner / a hauler. Texts for every id: text.json.

`src/data/orig/*.json` were decoded from the reference APK at the user's request (prototype only).
Replace before publishing. What each number means and how sure we are: `docs/ORIGINAL_DATA.md`
(read it before touching gameplay numbers). Visual/flow reference: `docs/ORIGINAL_FLOW.md` + `docs/ref/`
(written by a video-analysis pass; may arrive after this file). No original art/models are used.
Characters: Quaternius "Worker" (CC0, poly.pizza/m/Yg2bQZO6Hj; `src/assets/chars/`, packed by
`scripts/build-chars.mjs`, imported as `*.glb?inline` so the build stays one file), driven by
`src/game/characters.ts`: one mesh recoloured per person, lower/upper clip split, and procedural
posing in character space on top (two-handed pickaxe swing timed so the strike lands on the hit,
wheelbarrow hands, sitting). The user asked for small heads (no chibi) and readable back stacks
(carried items get a dark outline). Muscular (user 2026-10-22): `bulk()` pushes the bind-pose skin out along
its normals per bone (`BULK`: shoulders, chest, arms, fists) when the file loads; ⚠ the packed positions are
normalized int16 (-1..1), so they become floats first (a pushed fingertip wrapped round into a spike).
Preview: `/scripts/preview/chars.html?view=side|front|game`.
**Back stacks are one tall column** for the player and the crew (user 2026-10-22, like the reference: no second
column, the pile may reach the top of the screen): `Stack` size 0.75 (ingots at 70 % of it, layout `ingot`: user, bricks on the back were too big), up to 80 shown, each layer as tall as its
item (`itemHeight`). Raw ore (user 2026-10-22, reference video IMG_7001: "not square") is a jagged low-poly lump,
three shapes, lit per face: plain stone matte in its rock colour, ore with a vein a glossy lump in the vein colour; on
backs the lumps sit off line and tilted. Ingots are thick bricks (then made ~15 % smaller, user: too big) in a deeper take on the ingot colour (stone bricks
nearly matte, metals and jewels polished), each turned a little in a single column; piles space columns by the item's
footprint (`itemFootprint`). Same looks in flight and on the ground (`Drops`: one InstancedMesh per item and shape). Plan `carry_look`
(`--size 393x852 --hq`; `--dpr 2` for phone-sharp shots).
Blocks use painted canvas textures per ore (`world/rockTex.ts`) plus crystal nuggets; breaking
throws big and small chunks that reuse the block's material (`world/Shards.ts`) inside a dust
cloud with a flash, a ground ring and ore-coloured glints (`world/Fx.ts`, pooled sprites). Every hit
throws exaggerated chips (user 2026-10-21: bigger; then "more upward, less at the miner"; 2026-10-22: bigger
still): a wedge, 3 chunky + 5 small, mostly upward with a slight lean toward the miner (`Shards.burst` `flat` /
`up`); a break throws 5 huge wedges (`wedge`: jittered triangular slabs, like the reference's block splitting)
plus 10 lumps. Plan `fxlook`. No opening line:
dialogue 101 is never played; quest 1001's arrow leads to the first rock (user 2026-10-21). No camera pan to the first
rock (1001) or to the furnace (1003), and no line 102 "take it to the furnace" when the back fills (user 2026-10-22;
`pans` in Game). Plan `opening_nopan` (`--size 393x760`).
**One camera distance on foot**, phones included (user 2026-10-22: the phone pull-back to 1.18 while walking, back in
when mining or still, changed the zoom too much; it is gone). Machines still pull back to 1.25 (`Game.updateZoom`).
The price list beside SELL is `base/PriceBoard.ts` (user: prices must be clear, with pictures): a stand tilted
to face the 57° camera, rows COMMON / METAL / RARE by ore category, an ingot drawn in each ore's colour, big
prices, only this stage's ores. It is placed relative to the SELL pad (not the map's `priceSign` spot) and is a solid.
Ingots are chamfered cast bars with baked face shading on a shiny Phong material
(`world/itemGeo.ts` → `itemMaterial`), and they twinkle on the furnace tray. Cash on the CASH spot (user 2026-10-22:
the reference's money looks better): bundles of printed notes with a paper band (canvas textures, `props.ts cashMesh`),
a block 3 wide and 4 deep growing upward; flying cash is a bundle too. Base buildings (Machinery Center,
Upgrade, Worker = Kenney industrial buildings with the roof atlas cell repainted, see `ATLAS.roof`),
the foundry, oil tank and barrels are Kenney models too (the restaurant is procedural; van.glb is no longer bundled). They are squashed in depth to stay
inside the collision boxes in `Game.buildBase`, and stand 1.35x taller than modelled (`GRAND` in props.ts, user
2026-10-22: grander; height only). ⚠ Taller houses hide a player standing right behind them (the market). Cliffs use `rockTexture`. Vehicles and the sales truck
are model files (`src/game/props3d.ts`, `prop(name, length)` → faces +Z, on the ground), packed by
`scripts/build-props.mjs`. Sources and licences are in `src/assets/props/LICENSE.txt`. Three models
are CC-BY, credited in Settings → PRIVACY & CREDITS (and in the store description). Keep that credit reachable. The breaker and roller are a Kenney tractor plus procedural
arm/drum, and the ATV is still procedural. Preview: `/scripts/preview/machines.html`. Everything
else is procedural (`src/game/models.ts`, `src/game/world/props.ts`).

## Map

| Area | Files |
|---|---|
| Data access + coordinate conversion (cell → world: x=(x−500)·2.5, z=(500−z)·2.5) | `src/game/data.ts` |
| Save (`qc_` prefix), stats/upgrade math, HQ multipliers | `src/game/save.ts`, `src/game/state.ts` |
| Orchestrator (one stage per page load; stage change = save + reload) | `src/game/Game.ts` |
| Blocks / chunks / stacks / flying items / dust | `src/game/world/*` |
| Base buildings (pads = `Zone`) | `src/game/base/*` |
| Player, vehicles, worker AI | `src/game/actors/*` |
| Auto-mine & collect, quests, events, RV boosts | `src/game/systems/*` |
| HUD, sheets (upgrade/shop/workers/HQ/equipment/settings), dialogue, stage-clear modals | `src/game/ui/*` |

## Reference behaviour we copy (see docs/ORIGINAL_FLOW.md for the full list)

No joystick graphic · mining is automatic next to a block and keeps going after the finger is
lifted (user confirmed 2026-10-19: keep it like the original); ours on top (user 2026-10-22): let go right after
mining with nothing left in reach and the player walks on to the nearest block with a free side within 2.5 cells, by
walking, and smashes it, a full back or not, until 90 s after the last touch / key (`Game.autoMine`, `AUTO_MINE_*`); after
10 minutes of play Gus says so once, mid-swing (line 1601, ours, appended to DIALOGUE in data.ts). On foot only: machines later (user, same day). Plan `auto_mine` · dialogue = dimmed world + black gradient + typewriter · quest card turns
into a green "✔ COMPLETE!" pill · Machinery Center is a walk-in hall (`base/ShopInterior.ts`,
built at x/z = 400) locked until quest 1008 · vehicles: walk in or tap the green pin, dismount
button only when stopped, rentals drop in at base when you leave the shop · minecarts start
inactive behind an ACTIVATE pad (FREE / ad) · clear = STAGE COMPLETE → BONUS REWARDS (no ×2)
→ Sofia → Contract Room (APPROVED stamp) → reload into the next stage.

## HQ, workers, settings

- **English only** (Vietnamese was removed on 2026-10-19 at the user's request: no i18n module,
  no `vi.json`, no Paytone One; Lilita One is the only face).
- **HQ** (`ui/HqTower.ts`, `ui/ResearchPanel.ts`):
  - Clear flow: tower reveal → Sofia 801 → spotlight UPGRADE → research → `scaffoldNext()` →
    802 → NEXT STAGE → contract.
  - The COMPANY button opens the tower in "info" mode.
  - Finished research waits for APPLY (`applyResearch`).
- **Workers**:
  - The WORKER building opens Worker Management (`ui/WorkerMgmt.ts`), where tools are lent
    to workers via `S.run.gear`. The player equipping a lent tool takes it back.
  - The Job Board has DECLINE, and a "NEW candidate" chip counts down to the next batch.
  - **The break area is a restaurant** (user 2026-10-24; the reference has a pizza van and tables under umbrellas):
    `Cafeteria` in base/Buildings.ts puts `restaurantModel` (props.ts, procedural: serving window and counter with food,
    awning, menu, drinks fridge, door, a RESTAURANT / FOOD • DRINKS sign) on the map's truck spot, inside the same solid,
    and `breakSpotModel` on its three table spots, no umbrellas: a dining table (open from the start), a drinks table and
    two armchairs (`SPOTS`), 2 seats each. Spots 2–3 unlock on a pad (FREE with ads off) under a line saying what it adds
    (`SPOT_PAD`, labels `.wl.spotpad`). Seats are claimed (`Seat`: position, facing, kind); a worker sits down on the
    chair facing the table (armchairs face the camera) and eats (a burger to the mouth now and then, the head nods),
    drinks (a cup, the head tips back) or just rests (hands on the lap): `Character.activity` / `dine` / `rest`; tool
    and back carrier are put away meanwhile. Without a seat a worker waits standing at the counter, rest at half speed.
    The bubble over a resting worker (`restLabels`, `REST_BUBBLE`, `.restbub`) says 🍔 EATING / 🥤 DRINKING / 💤 RESTING /
    🪑 NO SEAT, with a bar filling as they rest. ⚠ The rig's feet are IK bones under Root (not under the shins) and the idle
    clip keys neither Hips nor Foot: never `turn()` those (the delta piles up every frame; a reclined pose spun the body
    under a sunbed), and the feet are pinned to the shins' ends while sitting (`pinFeet`, put back before the next mixer
    pass, since the mixer only writes a value that changed). The restaurant, the spots and the food / drink props are baked into
    vertex-coloured meshes (`bakeColors` in models.ts) and frozen: as ~100 loose primitives, each drawn again for shadows,
    the build of 2026-10-24 drew 316 calls at the base and 412 by the restaurant (190 / 226 before it), and stage 1 frame
    rates in the field fell (phones 55 -> 30 fps on quests 11-26); baked, 182 / 200. Bake any new procedural scenery the same way.
    Plans `restaurant` and `restaurant_bite`
    (`--size 393x760 --dpr 2 --hq`), `lawn_drops`, `crew_rest`.
  - **Each worker has their own style** (user 2026-10-24; the player is unchanged): `CREW` in characters.ts, by profile
    id, fitted to the card (name, trait, blurb): colours, headwear (the model's hard hat, cap, beanie, bandana or own
    hair), ponytail / bun, moustache / goatee / full beard, glasses, height and girth. Anything but the hard hat folds the
    model's hat into one point (`dress`); the model has hair under it (brows' material, shown in the hair colour).
    Headwear is one vertex-coloured mesh on the Head bone, sized from the measured head (`measureHead`, `headwear`). Ids
    without a style keep `workerLook`. Previews: `scripts/preview/crew.html?view=full|heads|back`, `portrait.html?grid=1`.
  - **Cheerful faces on styled workers** (user 2026-10-24: "faces look ugly", "not bright, not funny enough", then
    "fun, but no tongue out or wink", "no toothy grins, a smile is enough"): the model's brows hang over the top half
    of its small black eyes (a scowl); `measureHead` finds the brow vertices over the eyes and the eye vertices,
    `dress` folds them to a point, and `headwear` adds big round eyes (white, pupil, glint), arched brows, rosy cheeks
    and a closed smile (lower under a moustache). `Style.face`: `smile`, or `content` (eyes shut as happy arcs: Walt,
    Otis, Sven). The player keeps the model's own face. Portraits are shot brighter and warmer, the key
    light low enough to reach under a brim, the chin tilted up 0.12 rad, a tighter frame (`portrait.ts`).
  - **Portraits** (the reference's Job Board shows faces; ours had ⛏️ / 📦): `ui/faces.ts` on Job Board cards, Worker
    Management rows (role in a corner) and the stage-clear Top 4 Crew (round). PNGs in `src/assets/workers/` from
    `node scripts/make-portraits.mjs` (dev server running); re-run it after changing a style. Plan `crew_faces`
    (`--size 393x760`). ⚠ crew/portrait previews load their script from a .ts file: with an inline `<script type=module>`
    the dev server's HTML proxy failed ("No matching HTML proxy module", 2026-10-24) and nothing on the page ran
    (chars.html / icon.html are inline and failed the same way that day; restarting the dev server should fix them).
- **Settings** (`settings.ts`, `qc_settings`): Perf. Mode first (DPR <= 1, no shadows, 30 fps), then
  music and SFX, all applied live; PRIVACY & CREDITS; reset (`state.resetProgress`: writes a fresh save and blocks the autosave; deleting the key
  was not enough, the reload's `pagehide` emergency save wrote the old progress straight back; plan `reset`). **Perf. Mode is OFF (sharp) on every device** until the
  player turns it on (user 2026-10-20). The hardware guess (`engine/deviceTier.ts`) and the frame-rate fallback that
  switched it on by itself are gone (git history); a `perfAuto` in an old `qc_settings` is ignored, a player's own choice
  (`perfUser`) is kept. Plan `perf_default` covers the three cases. No vibration / haptics,
  no SUPPORT CENTER / RESTORE PURCHASES (user, 2026-10-19).

## Rules learned the hard way

- **Stage progress = blocks broken ÷ total blocks**, not ingots sold. Evidence: the original
  shows 0.1 % on the first block, before any sale, and its result screen reads "Ore Mined
  968 [80%]" (968/1204). DATA §8 was wrong about this.
- **Quest values that can already be true are polled**: carried minerals, rentals, owned tools,
  hires, mounted vehicle, being in the shop, and "…on Stage 1" goals once you are past stage 1.
  Unfinished quests carry into the next stage. Dialogues count as seen when they **close**,
  so a reload mid-line replays them. Camera pans wait for open dialogues.
- **Items in transit are saved** (`S.run.transit`): ground chunks, carried stacks, vehicle
  fuel and cargo, furnace queue and tray, SELL pile, cash pallet, storage, carts, digger.
- **Per-frame UI writes only on change.** HUD setters and `Labels` run every frame; they cache the
  last value written (`Labels.set` compares with the last *string written*, never `el.innerHTML`).
  Before 2026-10-19 they rewrote ~16 DOM nodes a frame (layout + style recalcs every frame), which
  kept a laptop's fans up even in Perf. Mode. Check with plan `perf_ui` (`{"metrics": ms}`
  step: script / layout / style per second, then the old behaviour emulated for comparison) and
  `{"profile": ms, "callers": "fn"}`. Frame cap (`Game.frame`): 60 fps, 30 in Perf. Mode, 20 behind
  menus / dialogue. The block field is one InstancedMesh per ore kind per 8x8-cell chunk so off-screen
  chunks are culled (`BlockField`, CHUNK); people are merged to 4 skinned meshes each (vertex colours,
  `characters.ts` mergeParts); the camera far plane sits at the fog's end and near = 3 (depth
  precision). Plans `perf_draw` (calls / triangles), `perf_calls` (what is drawn), `perf_tris`.
- **Static scenery is frozen** (`engine/freeze.ts`: `matrixAutoUpdate = false` after one compose):
  the map, the walk-in shop, the entry buildings (beacons stay live), the furnace hall (the tray
  pile stays live), the price sign, and the instanced pools' mesh objects. ⚠ A frozen object
  ignores later position / rotation / scale writes: anything that moves must be in `keep` or
  outside the frozen root. `Stage3D.toScreen` uses the canvas size cached on resize (reading
  `clientWidth` there forced a layout per label per frame). Plan `perf_cpu` (`{"cpuThrottle": 4}`)
  measures both against an emulation of the old behaviour.
- **Floor tiles = flat top + inset, lowered base** (`MapView.buildTiles`). Boxes butted together showed
  their side faces as one-pixel lines at the seams (and a base only 3 cm down z-fought through), which
  flickers as the camera scrolls and reads as stutter. No paving lines either, for the same reason.
- InstancedMesh pools whose instances move (`Drops`) need `frustumCulled = false`. Their
  bounding sphere is computed once, while everything is hidden, and then culls the lot.
- Sheets ignore trusted clicks within 450 ms of opening (`Sheet.ghost`). On phones the tap
  that opens a sheet otherwise lands on the row under the finger.
- **Buy buttons carry `data-price`** and `Sheet.refreshAfford()` re-greys them whenever cash
  changes. The quest reward for entering the Upgrade building lands a frame after the sheet
  renders; without the refresh every button stayed grey and dead. Tapping a grey one says
  "Not enough cash!" (`Sheet.poor`).

- **Patch sources with Node (`String.raw`), not Python here.** Python on this machine wrote `` in a regex as a
  backspace character (twice) and saved files with CRLF line endings. The project is LF.
- **Vite must ignore `scripts/.shots/`** (the headless Chrome profile lives there). Without the
  `server.watch.ignored` entry, Chrome's profile writes trigger endless page reloads mid-test.
- **`?reset=1` strips itself** from the URL after wiping the save, otherwise the stage-change reload
  wipes the save again.
- Headless rendering is software (SwiftShader, ~2–4 fps). Use `timeScale` and `gfx=low`; don't read
  a slow headless run as a performance problem on phones.
- Quests advance immediately on completion (the card just flashes) — events between quests must
  count toward the next one, or "Collect Minerals" can never be finished with a 5-slot carrier.
- Chunks burst toward the miner and are pushed out of solid blocks when they land; otherwise they
  settle inside unbroken blocks where nothing can collect them. Same for anywhere nobody walks (user 2026-10-23: a
  chunk on the stage 1 lawn held a carrier at its edge for good): `Drops.blocked` is also off the walkable ground
  (lawn, water, cliffs) or inside a building, a chunk walks back toward its miner or to the nearest open spot, and
  restored chunks do the same. A carrier that got as close as it can and still can't reach a chunk skips that spot
  for 25 s (`badGoal`). Plan `lawn_drops` (old rule: 60 of 60 chunks thrown at the lawn stayed there; now 0).
- Worker miners only target blocks with a **walkable** open side, and give a block up after 2 s
  without progress.
- **The EQUIPMENT corner is where a right thumb rests.** `Input.steerFrom(button)`: a touch that starts on it
  steers, and only a quick, still tap (< 10 px, < 600 ms) presses it; the leftover click of a drag or hold is
  swallowed. Before 2026-10-19 the stick ignored touches there and lifting the thumb opened EQUIPMENT (iPhone).
  Don't cancel `touchmove` before the slop: that also cancels the tap's click.
- **On phones EQUIPMENT sits top-right under the currency chips** (`@media (max-width: 600px), (hover: none) and (pointer: coarse)`
  in style.css; user 2026-10-20, third report: it still popped up now and then on an iPhone). Desktop keeps the original's bottom-right.
- **EQUIPMENT stays hidden until a tool beyond the starters is owned** (`Game.refreshToolsBtn`; user 2026-10-20:
  it still popped up twice in the first minutes on an iPhone), and a still tap within 0.8 s of a steering drag (or
  while another finger steers) is not a press (`Input.steeredAt`).
- **Background music is ours** (`music.ts`, user 2026-10-20: lively, "workers on the job", replaced the wind + engine hum):
  the "funk" loop (108 BPM, 16 bars, ~36 s), synthesised in the page. It renders in 5 ms slices between frames after the first tap
  (`renderSliced`; 0.1 s of work on a laptop; no step over 16 ms at 4x CPU throttle: keep per-sample work free of sin/exp/pow).
  Level (`audio.ts`): 4 % of full about 70 % of the time, swelling to 8 % now and then (`swell`; user: 20 %, then 5 %, then 2-5 %, then 4-8 %).
  Settings key `music`. Other styles to listen to: `node scripts/music-preview.mts <dir>` (folk / chip / funk WAV + MP3).
- **iOS silent switch**: Web Audio follows it unless the page asks for playback; `audio.ts playbackSession()` sets
  `navigator.audioSession.type = "playback"` (iOS 17+) or loops a silent <audio> (older), so sound plays like a video
  (and pauses music from other apps). User 2026-10-20: no sound in Chrome on an iPhone.
- **Spotlight hints** (user 2026-10-21: after the first tool, the bare ring round EQUIPMENT in the top corner went
  unseen on a phone and the player was stuck): `spot.show(el, { hint, anyTapAfter })` adds a bouncing bubble that
  points at the hole and stays on screen, and lets any tap go on after N s; `body.spotlit` hides the shop's item
  card. **The first tool no longer spotlights EQUIPMENT** (user 2026-10-22: three of five players who quit on quest 1011
  "Smash Ore" left within a minute of buying it, still in the hall; the tool is equipped already): dialogue 401 only.
  In the Machinery Center the arrow points at the door whenever the quest needs nothing there now (no buy / rent
  quest, or not the cash for it; `arrowTarget`). Plan `equip_first` (`QC_URL=…?tele=log`, `--size 393x760`).
- **A spotlight must never trap the player**: the camera holds on the vehicle while its mount pin is spotlit
  (`Game.spotFocus`; the pan back to the player took the pin off screen on an iPhone and the dimmed screen took every
  tap), and Spotlight lets any tap go whenever its target is off screen or hidden. Plan `mount_spot` (--size 393x760).
- **Toasts sit above sheets** (Hud.ts moves `.toast` out of the fixed `.hud` layer, z 35): "Not enough cash!" and
  "Crew full" are said over a sheet. On phones a toast sits at 180 px, between the quest card / EQUIPMENT and the
  boost timers (from 200 px) and above any sheet header.
- **Job Board when the crew is full**: every hire button reads CREW FULL and a tap says "Crew full: 5/5 workers"
  (user 2026-10-21: the buttons were grey and silent; the count sat at the top of the sheet, scrolled away).
- **Picture icons from our own 3D models** for every machine and the wheelbarrow (`pic` in ui/Panels.ts, class
  `ico-pic`, sized like an emoji; user 2026-10-21: first the crane emoji did not read as the Hydraulic Breaker, then
  the truck / motorbike emoji in the vehicle menu were confusing: "make them look exactly the same"). The vehicle
  menu, Upgrade rows, EQUIP / shop rows and research all read `ICON`. `node scripts/make-icons.mjs [keys]` (no key =
  every machine) renders `scripts/preview/icon.html` headless and writes `src/assets/icons/<key>.png`, 128 px cut to
  a 256-colour palette with Pillow (each one is inlined in the build, `?inline`). Plan `breaker_icon` (`--size 393x760`).
- **Quest card on phones** (`@media (max-width: 600px)` in style.css): about a third of the width, two lines,
  right under the stage bar, like the reference on mobile.
- **Test movement with a touch drag, not just keys.** Keys bypass the DOM, so an invisible overlay
  that swallows touches goes unnoticed. That happened once: `#ui .hit` outranked `.dlg`'s
  `pointer-events: none`, and the phone could not move at all. Plan `touch` (`{"drag": [...]}` step)
  checks this. Anything hidden by opacity under `#ui` needs an `#ui`-level selector.

## Inferred (not from data) — tune here

Fuel burn (1/eff per working second), truck speed/partial-sell wait, minecart speed (9 u/s), oil
station barrel rate (1.5 s), Roller Crusher sweep (3 blocks), worker stamina (−1 per hit/delivery).
See `docs/ORIGINAL_DATA.md` §12–13.
