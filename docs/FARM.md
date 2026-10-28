# Farm game: names, story and look

Working title **Farm Valley** (temporary; the user picks the final name). Started 2026-10-28 from Candy Miner
(`C:\CuongPC\Game\CandyMiner`, commit f60aa34), itself Mars Miner / Quarry Crush. The user turned the candy theme
down ("not pretty") and asked for a farm-and-trade game: harvest rice (one swipe), chop trees of many kinds (old trees
take long), dig gold, rare ores and diamonds. **Nothing about candy, space or quarries stays** in what the player
sees or reads. Repo: https://github.com/cuongpc19/Farmgame.

## Story

Auntie Hoa ran the valley farm for forty years. Her knees are done, so she hands it to the player (she calls them
"dear" or "Farmer"). The fields are ripe and nobody has harvested them, the orchards and woods have run wild, and
there is an old gold mine in the hills behind. Harvest, chop and dig; take it to the Mill and the Forge; sell at the
Market; buy tools and tractors; hire farmhands. Each stage is a new plot of the valley. Her grandson Little Bao
runs errands and explains things. Warm, funny, short lines. English only.

| Internal id | Name |
|---|---|
| speaker `hank` | **Auntie Hoa** (the farm's owner, retiring) |
| speaker `sofia` | **Little Bao** (her grandson, the helper) |
| the player | "Farmer" / "dear" |

## What is on the land (src/game/farm.ts)

Ore keys stay the ids. `kind` decides the model, the tool, the motion and the items:

| kind | tool and motion | ore keys (species) |
|---|---|---|
| crop | **sickle**, one low sweep, always one hit | limestone (rice) |
| wood | **axe**, a side chop at the trunk; the tree shakes, falls away on the last hit | sandstone (bamboo), obsidian (pine), coal (maple), granite (birch), yooperlite (cherry), basalt (banyan), ice (snowy pine), cinnabar (palm) |
| fruit | axe, as wood; drops fruit | dunite (orange), bronzite (mango) |
| ore | **pickaxe**, overhead | copper, iron, manganese (tin), silver, gold, bismuth (platinum), cobalt |
| gem | pickaxe | lapisLazuli (lapis), quartz, amber, amethyst, emerald, aquamarine, opal, zircon (topaz), ruby, tanzanite (sapphire), diamond |
| chest | pickaxe | mystery (treasure chest) |

The player holds the tool for what is in front of them: sickle for rice, axe for trees, pickaxe for rock. Bought
tools add power; how each looks comes later.

Item names (`text.json` `ores`, one per key, used on the price board): Rice, Bamboo, Oranges, Pine, Maple, Birch,
Mangoes, Cherry Wood, Banyan Wood, Snow Pine, Palm, Copper, Iron, Tin, Silver, Gold, Platinum, Cobalt, Lapis,
Quartz, Amber, Amethyst, Emerald, Aquamarine, Opal, Topaz, Ruby, Sapphire, Diamond, Treasure.

Raw → product: rice sheaf → rice sack; log → planks; fruit → fruit crate; ore chunk → bar; crystal → cut gem.

## Buildings

| Internal | Name (sign / pad) |
|---|---|
| furnace | **Mill** (sign MILL, pad MILL): rice, wood, fruit |
| forge (new) | **Forge** (sign FORGE, pad FORGE): ores, gems, chests |
| salesStand | **Market** (sign MARKET, pad SELL); pickup trucks drive the goods away |
| machineryShop | **Farm Shop** (sign FARM SHOP): tools, tractors to rent |
| upgradeBuilding | **Workshop** (sign UPGRADES) |
| workerBuilding | **Farmhands' House** (sign FARMHANDS) |
| cafeteria | **Noodle Stall** (sign NOODLES), tables for the farmhands |
| oilStation | **Fuel** (pad FUEL): diesel cans for the machines |
| oreStorage | **Storage** |
| HQ tower | **Farm Office** |

Base (scripts/townbase.py `MOVES`): north row Farm Shop · Workshop · Forge · Mill (Mill = the stage's furnace spot,
storage behind it); south row Farmhands' House · Fuel · price board · Market.

## Stages

1 Golden Paddies · 2 Bamboo Grove · 3 Orange Orchard · 4 Pine Ridge · 5 Mango Hills · 6 Cherry Blossom Valley ·
7 Maple Woods · 8 Snowy Pines · 9 Crystal Lake · 10 The Old Gold Mine.

## Look

Bright, smooth cartoon (not flat-shaded low-poly; the user's other game Building Dream is low-poly wheat, pines and a
scarecrow, and this one must not look like it). A rice-paddy countryside: golden rice with a glint of water between
the clumps, bamboo, fruit trees, big old trees, grey rocks with gold veins and crystals at the far end. Grass green
ground, warm earth paths, wooden farm buildings with red / green / blue roofs, a little river. The player is a farmer:
wide straw hat, rolled sleeves, work trousers, boots. Farmhands vary (straw hat, conical hat, cap, bandana).

## Later (user 2026-10-28, "do it later")

- Stage 1 has only two kinds of rock; every later stage opens one new kind of rock (ore / gem).
- Later stages bring more ancient trees, harder to chop.
