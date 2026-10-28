# src/data/orig — original-game numbers

**TEMPORARY — numbers copied from the original game for prototyping at the user's request; replace before publishing.**

Source: the original *Bulldozer Master: Crush & Mine* (Supercent) data tables, decoded from the APK.
Full explanation, evidence and the list of INFERRED values: `docs/ORIGINAL_DATA.md`.

| File | Contents |
|---|---|
| `stage1.json` | Stage 1 "Lonely Barrens": 1204 ore blocks (cell + ore key), areas, buildings, minecarts + rail waypoints, spawns, clear rule, reward |
| `stage2.json` | Stage 2 "Leaf Island": 984 blocks, 2 minecarts, Auto Digger on an Emerald deposit, etc. |
| `onboarding.json` | Stage 60101 "Frost Path" (12 Ice blocks). In the original it is the World-Map event intro, **not** the stage-1 tutorial; optional warm-up map |
| `economy.json` | Ores (HP, drops, smelt time, ingot price), equipment, quarry stat upgrades (levels 0-99), constants, buildings, structures, workers, quest chain, onboarding dialogue, rewards, RV boosts, company meta, remote config |

Conventions
- Cells are integers `(x, z)`; `+x` = east (screen right), `+z` = north (into the quarry). 1 cell = 1 block = 2.5 world units.
- Every rect is `{x, z, w, h}` = min corner + size in cells (already normalised; raw ore groups store their top-left cell).
- Ore keys (`limestone`, `copper`, ...) index `economy.ores`.
- Money values are raw in-game cash (ingots sell for 10-300).
- Fields whose name or note says INFERRED come from reasoning, not from a table value.

Regenerate: `python -I build_outputs.py` in the scratch `apktest/work/decode/` folder (it reads the decoded tables, which are not part of this repo).
