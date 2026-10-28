# Candy Miner: story, names and look (from Mars Miner, 2026-10-28)

Candy Miner is the same play as Mars Miner (break blocks → carry → cook → sell → upgrades, machines, crew) in a new
world with its own story. Working title; the store name is still open (never anything close to "Candy Crush", a King
trademark). This is the reference every string and asset follows. Mars Miner's names (docs in that repo) are gone.

## Story

Candy Valley used to be the sweetest place in the world. **Baron Sourpuss** hated it: he cast a sour spell that froze
the valley's candy into hard blocks and drained its colour. **Granny Gigi**, who ran the valley's old candy factory, is
too old to dig it all out, so she hands the factory to the player (her grandchild, called "Boss" or "sweetie"). Every
block the player breaks frees candy for the factory; cooked treats are sold at the Sweet Shop, the money buys tools,
machines and helpers, and bit by bit the valley gets its colour back. Each stage is one land of the valley; at the end
of each land the Baron's **Sour Golem** guards it (a later update: a giant block to smash). Light, cheerful, silly,
never mean; the Baron is a grumpy cartoon villain, not scary. Players are kids and casual players on CrazyGames: short
words, read at a glance.

## People

| Mars Miner | Candy Miner |
|---|---|
| Captain Rex (speaker `hank`) | **Granny Gigi**: the player's grandma, retired candy maker; warm, funny, proud, a bit cheeky |
| Nova (speaker `sofia`) | **Coco**: the factory manager; upbeat, quick, organised, loves numbers |
| (none) | **Baron Sourpuss**: the villain, only talked about (and his Sour Golems) |
| the player: Commander | the player: **Boss** (Gigi also says "sweetie") |
| crew | **crew** of candy makers (hired workers keep their names) |

## Places and things (old → new)

| Mars Miner | Candy Miner |
|---|---|
| dig site, asteroid | **land** (stage N is "a land of Candy Valley"; UI keeps "Stage N") |
| Hangar (tool shop, rentals) | **Garage** (sign: GARAGE) |
| Upgrade Lab | **Upgrade Kitchen** (sign: UPGRADE) |
| Crew Quarters | **Crew Cottage** (sign: CREW) |
| Mission HQ | **Candy HQ** |
| Refinery / REFINE | **Candy Factory** / pad COOK |
| Trade Post / SELL | **Sweet Shop** / pad SELL |
| cargo ships | **delivery vans** |
| bars (ingots) | **treats** (a cooked block is a box of treats) |
| Fuel Depot / fuel / fuel cells | **Syrup Pump** / **syrup** / **syrup jars** |
| rail cart | **candy cart** |
| Space Canteen, CREW FEAST | **Picnic Café**, **CREW PICNIC** |
| supply drones | **sugar bees** (gather cash while you're away) |
| daily supply | **daily treats** |
| cash ($), gems, gear | unchanged |

Ore categories (quest texts): rock → **soft candy**, metal → **hard candy**, jewel → **gem candy**.

Tools (hand): Pickaxe → **Candy Pick** · Sledgehammer → **Sugar Mallet** · Jackhammer → **Mixer Drill** · Large Hand Drill
→ **Big Mixer** · Knuckle Driller → **Turbo Mixer** · Wooden Carrier → **Candy Basket** · Cargo Pack → **Treat Pack** ·
Exo-Carrier → **Power Suit**.

Machines (rentals): Wheelbarrow → **Wagon** · Wheel Loader → **Scoop Truck** · Hydraulic Breaker → **Smash Truck** · Roller
Crusher → **Pin Roller** · Dump Truck → **Hauler** · All-Terrain Vehicle → **Syrup Buggy** · Drill Crusher → **Drill Truck** ·
Crush Hammer → **Hammer Truck** · Haul Truck → **Mega Hauler** · Fuel Truck → **Syrup Tanker** · Wheel Crusher → **Cake
Wheel** · Inferno Breaker → **Mega Smasher**.

Ores (text.json `ores`, by ore key): limestone **Sugar Cube** · sandstone **Caramel** · dunite **Mint** · ice **Ice Candy** ·
copper **Toffee** · iron **Licorice** · manganese **Grape Gum** · silver **Silver Pearl** · gold **Honeycomb** · amber
**Butterscotch** · amethyst **Plum Jelly** · emerald **Lime Gummy** · diamond **Rock Candy** · bronzite **Brittle** · obsidian
**Dark Chocolate** · bismuth **Rainbow Candy** · basalt **Milk Chocolate** · aquamarine **Blue Raspberry** · yooperlite **Glow
Candy** · opal **Unicorn Candy** · zircon **Sour Drop** · ruby **Cherry Drop** · coal **Cocoa** · quartz **Sugar Glass** ·
lapisLazuli **Blueberry Gum** · tanzanite **Berry Swirl** · mystery **Mystery Box**.

Boosts: SPEED / POWER / MAGNET BOOST stay · furnace boost → **FACTORY RUSH** · special order → **BIG ORDER** · crew party →
**CREW PICNIC** · FREE CASH / GEAR / GEM stay.

Stage names (order 1-10): **Sugar Hills · Chocolate River · Gummy Swamp · Lollipop Woods · Ice Cream Glacier · Cotton
Cloud Peaks · Caramel Canyon · Licorice Caves · Rainbow Falls · Sourpuss Castle**.

## Look

`src/game/theme.ts` holds the world colours. A candy island floating over pink-and-white clouds in a pastel sky; biscuit
ground, a cream deck for the base, chocolate cliffs, an island underside of cake layers; gumdrops and lollipops for
scenery; candy blocks (sugar cubes, chocolate squares, glossy hard candy) that crack into coloured chunks. Buildings are
gingerbread houses with icing roofs; machines are painted pink / cream / mint with chocolate darks; people are candy
makers (chef hats, pastel uniforms, aprons). UI: chocolate-plum panels, pink and lemon accents, cream cards.
