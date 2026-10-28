# Bulldozer Master — original data, decoded (stages 1–2)

> **TEMPORARY reference.** Numbers copied from the original game (Supercent, Unity) for prototyping at the user's request. Replace them before publishing.
> Machine-readable copy: `src/data/orig/*.json` (see its README). This document explains what the numbers mean and how sure we are of each one.

**Sources.**
- The 117 TextAssets: JSON tables. The ones used most are StageData_218, QuestData_58, StatUpgradeLevelData_70, RemoteConfig_112 and Locale_277 (English column).
- `global-metadata.dat` (IL2CPP v31), parsed with a custom reader. It gave every enum name and value (category/object types, quest types, condition types, stat types…), every class field list, every method name and the compile-time constants (`const` fields).
- `MapToolSettings` (the map editor's ScriptableObject), read as raw bytes. It gave the cell size and the footprint of every object type.
- Three frames from the stage-1 gameplay video, used for cross-checks.

**Confidence tags:**
- **DATA**: a value read directly from a table or constant.
- **CODE-NAME**: deduced from class, method or field names in the metadata.
- **INFERRED**: reasoning only; there is no code to confirm it.
- **VIDEO**: seen in the gameplay video.

---

## 0. One-paragraph summary of the core loop (stage 1)

1. **Mine.** The player walks into a flat field of 2.5 m cube blocks and the pickaxe auto-hits them. Each block drops **6 mineral chunks**: one each time it loses 25 % of its HP, plus 2 when it breaks. Chunks within the absorb range are vacuumed into the cargo (wooden carrier: 5 items).
2. **Smelt.** The player drops minerals on the **REFINING** pad. The furnace turns 1 mineral into 1 ingot (2 on a crit), one at a time.
3. **Sell.** The player carries ingots to the **SELL** pad. Sales trucks take loads of 2–5 ingots and drop a pile of cash for the player to collect. Raw minerals cannot be sold in the main mode.
4. **Track progress.** Every ingot sold advances the **stage progress** (sold items ÷ all drop items of the map).
5. **Spend.** Cash buys quarry upgrades, buys light tools (kept forever) and rents heavy machines (this stage only). Heavy machines burn fuel, which comes as oil barrels from the Oil Station.
6. **Automate.** A minecart (100 slots, on rails) carries minerals from deep in the quarry to an ore storage pad next to the furnace. From 20–40 % progress, workers can be hired (miners or carriers).
7. **Clear.** At **80 % progress** the stage-clear button appears. Clearing gives a Gear reward, then the player contracts the next quarry.
8. **Guide.** A single linear quest card guides everything above, together with short dialogue pop-ups.

---

## 1. Stage object model (StageJson)

`StageData.StageJson` holds base64-encoded, gzip-compressed JSON of the map-editor class `MapTool.Data.MapToolSaveData`:

```
{gridWidth:1000, gridHeight:1000, totalOreCount, totalDropItemCount,
 objects:[{category, objectType, offset{x,y,z}, rotation{x,y,z}, startCell{x,y}, paramData:"p1,p2,p3,p4,p5",
           oreGroupData{sizeX,sizeZ,weightInfos[{oreType,weight}],cellOreTypes[]}}]}
```

- **Cell size = 2.5 world units.** DATA: `MapToolSettings._cellSize = 2.5`, which equals `MineBlockModule.BLOCK_SIZE = 2.5` and `AutoDiggerTriggeredAction.ORE_BLOCK_SIZE = 2.5`. One ore block = one cell = a 2.5 × 2.5 × 2.5 cube.
- **Axes.** `startCell.y` is the world Z axis. +x is screen-right and +z is "up the screen" (away from the camera, into the quarry). VIDEO: the building row Shop → Upgrade → Oil → Furnace → Worker → Cafeteria runs left to right with x increasing, and the quarry lies north (+z) of the base.
- **Grid.** 1000 × 1000 cells, but each map only uses about 35 × 100 cells around (500, 500). Stage 1 uses x 483–518, z 484–579 (≈ 90 × 240 world units).
- **Anchors.**
  - Ore groups: `startCell` is the group's **top-left** cell (min x, **max z**). The group extends +x by `sizeX` and −z by `sizeZ`, and its `rotation` does **not** change the footprint. Evidence: with this rule, all 57 stages have 0 duplicated cells and every ore sits on a ground tile. With a min-corner rule there are 13,287 conflicts. The resolved block counts then equal `totalOreCount` exactly: 1204 / 984 / 12.
  - Every other object: `startCell` is its min corner, and its footprint comes from `MapToolSettings` (table below). A 90°/270° rotation swaps w/h. INFERRED: buildings land exactly on the HomeArea tiles with this rule.
- **`cellOreTypes`.** Holds sizeX·sizeZ ore ids. Index i → column `i % sizeX`, row `i // sizeX` counted from the top row (INFERRED; the fills are weighted-random, so the order is visually irrelevant).
  - If the list is empty, the group is filled at runtime from `weightInfos`. One stage-1 group (16 × 4 limestone/copper/iron band at the quarry mouth) does this; we generated it with a fixed seed.
- **`totalDropItemCount` = totalOreCount × 6** in every stage. This is the denominator of stage progress (§8).

### Object types present in stages 60101, 1, 2

Category and type names come from the enums `MapTool.Enums.EMapToolCategoryType` / `EMapToolObjectType` (DATA). Footprints and layers come from MapToolSettings (DATA).

| cat | type | enum name | footprint (cells) | meaning (evidence) | 60101 | S1 | S2 |
|---|---|---|---|---|---|---|---|
| 1 Common | 1002 | ObstacleArea | 4×4 | impassable cliff/rock tile around the play area (layer 9) | 27 | 62 | 62 |
| 1 | 1003 | GroundArea | 4×4 | walkable dirt tile; `GroundAreaController` builds the floor mesh from these | 11 | 134 | 100 |
| 1 | 1004 | HomeArea | 4×4 | base camp. `HomeAreaManager` + condition `PlayerInBase` (used by RV boosts) | 6 | 14 | 14 |
| 2 Building | 2001 | Building_WokerHire | 3×3 | Worker building / job board (`EBuildingType.WorkerBuilding`) | – | 1 | 1 |
| 2 | 2002 | Building_Furnace | 3×3 | Furnace = smelter + REFINING pad | – | 1 | 1 |
| 2 | 2003 | Building_SalesStand | 3×3 | SELL pad + truck lane + cash pile | – | 1 | 1 |
| 2 | 2004 | Building_Shop | 3×3 | Machinery Shop (buy light / rent heavy equipment) | – | 1 | 1 |
| 2 | 2005 | Building_Upgrade | 3×3 | Upgrade building (quarry stat upgrades) | – | 1 | 1 |
| 2 | 2006 | Building_OilStation | 3×3 | Oil station (fuel barrels) + waste-oil bin | – | 1 | 1 |
| 2 | 2007 | Building_OreStorage | 2×2 | Minecart unload pad, placed at the rail end point | – | 1 | 1 |
| 3 Etc | 3001 | MetalBarrier | 1×1 | fence posts along the base edges (rotY 90) | 9 | 23 | 12 |
| 3 | 3002 | Road | 3×3 | road tiles at the map edges = sales-truck lane entry/exit | 3 | 2 | 2 |
| 3 | 3003 | PriceSign | 1×1 | price board next to the SELL pad (`PriceSignDisplay`). VIDEO: shows 10$…300$ | – | 1 | 1 |
| 3 | 3004 | Mountain | 5×5 | decorative mountain (offset y −1) | 1 | – | – |
| 3 | 3005 | WorkerRecoverPoint | 1×1 | where tired workers go (same cell as the worker spawn) | – | 1 | 1 |
| 4 Ore | 4001 | OreGroup | sizeX×sizeZ | block field; `oreGroupData` = per-cell ore ids + weights | 2 | 20 | 29 |
| 5 Structure | 5001 | AutoDigger | 3×3 | auto-mining structure on an ore deposit, `paramData[0]` = StructureGroupID | – | – | 1 |
| 6 Cafeteria | 6001 | Cafeteria_Truck | 3×3 | food truck (worker stamina recovery) | – | 1 | 1 |
| 6 | 6002–6004 | Cafeteria_Table1-3 | 1×1 | cafeteria tables. Tables can be unlocked (`CafeteriaTable._rvPayPlatform`) | – | 3 | 3 |
| 9 Minecart | 9001 | Minecart | 2×2 | minecart, `paramData[0]` = StructureGroupID (101/102/103, 201/202); rotY = initial rail direction | – | 3 | 2 |
| 9 | 9002 | MinecartRailGuide | 2×2 | rail turn marker: the rail continues in this object's rotY | – | 4 | 3 |
| 9 | 9003 | MinecartRailEndPoint | 2×2 | rail terminus at the base (next to OreStorage) | – | 1 | 1 |
| 10 SpawnPoint | 10001 | PlayerSpawnPoint | 1×1 | player start | 1 | 1 | 1 |
| 10 | 10002 | WorkerSpawnPoint | 1×1 | hired workers appear here | – | 1 | 1 |
| 10 | 10003 | VehicleSpawnPoint | 1×1 | 7 parking slots where rented vehicles appear | – | 7 | 7 |

Types not used in these three maps (category 5 ExtraOilStation, 7 Harvester, 8 Bridges, 11 pre-placed vehicles, 2008 event sales stand, 3006/3007, 1005 random-spot) belong to later stages or event modes.
- Stage 100101 (mode 1, `Order −1`, "Lonely Barrens" clone) has three random-fill ore groups and pre-placed Crush Hammer / Inferno Breaker (11005/11006). It is not in the normal progression; it is probably an ad-creative or test map.

**Rail path rule (INFERRED, works for all 5 minecarts).**
- Start at the minecart cell and step one cell at a time in its rotY direction (0 = +z, 90 = +x, 180 = −z, 270 = −x).
- On a RailGuide cell, take the guide's rotY. Stop on the EndPoint. The rail is 2 cells wide.
- Waypoints are stored in `structures[].railWaypoints`.
- Some rail cells pass through ore blocks: 4 cells in stage 1, 16 and 56 in stage 2. The class `MinecartRail` has a `_mineBlockDamager` and a `Co_BuildTracks` coroutine, so building the track breaks the blocks in its way (CODE-NAME).

### Stage 1 / Stage 2 / Onboarding layouts (cell coordinates, min corners)

| object | Stage 1 "Lonely Barrens" | Stage 2 "Leaf Island" |
|---|---|---|
| Machinery Shop | (493,493) | (490,481) |
| Upgrade | (496,493) | (493,481) |
| Oil Station | (499,493) | (496,481) |
| Furnace | (505,493) | (503,481) |
| Worker bldg | (508,493) | (506,481) |
| Cafeteria truck / tables | (511,493) / x513 z489-492 | (509,481) / x511 z477-480 |
| SELL pad / price sign | (501,488) / (499,488) | (499,476) / (498,477) |
| Ore storage / rail end | (505,497) / (507,497) | (503,484) / (503,486) |
| Player spawn | (502,496) | (500,483) |
| Vehicle spawns | z490, x495..507 step 2 | z478, x492..504 step 2 |
| Worker spawn = recover pt | (509,490) | (507,478) |
| Minecarts | g101 (507,505) **free**; g102 (507,529) RV; g103 (507,553) RV — all rot 90 → rail E then S to the end point | g201 (493,502) RV; g202 (507,522) RV — rot 180 |
| Auto Digger | – | g203 (497,507) RV, on an Emerald deposit of 300 |
| Quarry | one 16 × 76 field, x495-510 z500-575 | irregular field x483-518 z490-533 |
| Ore blocks / drops | 1204 / 7224 | 984 / 5904 |

**Onboarding 60101 "Frost Path"** (GameModeType 4 = `OnboardingStage`): a small base and 12 **Ice** blocks (mode-4 HP = 1) arranged as rows of 4+4+2+2 between the base and a decorative mountain. There are no buildings, and the clear condition is 100 % (`OnboardingStageProgressUI.CLEAR_PROGRESS_CONDITION = 1`). Reward: 50 BizPoint.
- It is **not** the first-session tutorial. It is the World-Map/LiveOps intro, in the `BulldozerMaster.LiveOps.OnboardingStage` namespace.
- Its dialogue is `ONBOARDING_LIVEOPS_FIRST_ENTER_*`: "This is the Asia mining site! … a massive ice vein is blocking the way…". ContinentType 5 = Asia.
- The world map unlocks at Stage 3, 50 % (`OnboardingCatalog.WORLD_MAP_LOCK_CONDITION_GROUP_ID = 1201`).
- **The first session starts directly in stage 1.**

---

## 2. Ores (stages 1–2 + Ice)

Sources: OreData, OreStatData (mode 1), MineBlockDropData, StackingItemData, SalesStandData, SmelterData. All values are DATA. "#blocks" counts the resolved map cells.

| id | ore | cat | HP (mode1) | res | drops | mineral id | ingot id | ingot $ | smelt s | smelt speed stat | #blocks S1 | #blocks S2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 101 | Limestone | rock | 50 | 1 | 4x1 + 2 = 6 | 10101 | 20101 | 10 | 1 | SmeltingSpeedRockMulti | 454 | 0 |
| 103 | Sandstone | rock | 150 | 1 | 4x1 + 2 = 6 | 10103 | 20103 | 12 | 1.2 | SmeltingSpeedRockMulti | 390 | 295 |
| 104 | Dunite | rock | 200 | 1 | 4x1 + 2 = 6 | 10104 | 20104 | 12 | 1.25 | SmeltingSpeedRockMulti | 0 | 185 |
| 110 | Ice | rock | 1000 (onboarding: 1) | 1 | 4x1 + 2 = 6 | 10110 | 20110 | 15 | 1.75 | SmeltingSpeedRockMulti | 0 | 0 |
| 201 | Copper | metal | 150 | 1 | 4x1 + 2 = 6 | 10201 | 20201 | 20 | 1.2 | SmeltingSpeedMetalMulti | 63 | 53 |
| 202 | Iron | metal | 400 | 1 | 4x1 + 2 = 6 | 10202 | 20202 | 25 | 1.5 | SmeltingSpeedMetalMulti | 63 | 0 |
| 203 | Manganese | metal | 600 | 1 | 4x1 + 2 = 6 | 10203 | 20203 | 30 | 1.75 | SmeltingSpeedMetalMulti | 60 | 0 |
| 204 | Silver | metal | 800 | 1 | 4x1 + 2 = 6 | 10204 | 20204 | 45 | 2 | SmeltingSpeedMetalMulti | 28 | 140 |
| 205 | Gold | metal | 1000 | 1 | 4x1 + 2 = 6 | 10205 | 20205 | 60 | 2.25 | SmeltingSpeedMetalMulti | 67 | 154 |
| 302 | Amber | jewel | 750 | 1 | 4x1 + 2 = 6 | 10302 | 20302 | 80 | 2.75 | SmeltingSpeedJewelMulti | 23 | 0 |
| 303 | Amethyst | jewel | 1000 | 1 | 4x1 + 2 = 6 | 10303 | 20303 | 100 | 3 | SmeltingSpeedJewelMulti | 50 | 0 |
| 310 | Emerald | jewel | 2250 | 1 | 4x1 + 2 = 6 | 10310 | 20310 | 120 | 3.4 | SmeltingSpeedJewelMulti | 0 | 157 |
| 312 | Diamond | jewel | 2500 | 1 | 4x1 + 2 = 6 | 10312 | 20312 | 300 | 4.5 | SmeltingSpeedJewelMulti | 6 | 0 |

- **Drops.** `DropCount 4`, `MidDropAmount 1`, `FinalDropAmount 2` → 4 chunks while being damaged, 2 on destruction. The mineral and the drop are the same item; there is no separate "mid/final" item.
  - The method `MineBlockInst.GetDropStageIndex(hp, maxHP, dropStageCount)` drops 1 chunk each time HP crosses another 25 % (INFERRED from the name). Total = 6, matching `totalDropItemCount`.
- **Weights.** Every mineral, ingot and oil barrel weighs 1, so cargo capacity = item count.
- **Prices.** Ingot prices = price board in the video (10, 12, 20, 25, 30, 45, 60, 80, 100, 300 $) — VIDEO.
  - SalesStandData also lists raw-mineral prices (5–30). They are only used by the event sales stand (2008). In the main mode "Can't sell 'em raw" (dialogue ONBOARDING_SMELT_1).
- **Ore HP stage multiplier** (StageMultiplierData, mode 1): ×1 for stages 1–10, ×2 for 11–20, ×3 at 21. Resistance is 1 everywhere.
- **Break random reward.** `MineBlockBreakRewardData` gives secretary gifts at RandomRate 120–210 (per 10,000, INFERRED). This only starts from stage 4 (`MIN_LIKEABILITY_REWARD_STAGE_LEVEL = 4`), so ignore it for the prototype. XP per block = 0 in mode 1.
- **Key resource** (contract screen): Stage 1 = Amethyst, Stage 2 = Emerald.
- **Potential income if everything is smelted and sold:**
  - Stage 1: 166,650 $ (80 % ≈ 133k).
  - Stage 2: 247,200 $.
  - Compare CashTarget = 120,000 for both (§8).

---

## 3. Player and equipment

**Starter kit** (DATA, `MineUnitController.DEFAULT_MINING_HAND_TOOL_ID = 100`, `DEFAULT_CARRYING_HAND_TOOL_ID = 200`, HandToolData `IsStarter`):
- **Pickaxe**: power 10, attack interval 1.0 s, detection range 1.
- **Wooden Carrier**: cargo 5, absorb range 2.
- **Player**: move speed 6.
- Mining range 1.5 (`PlayerBehaviorStateMachine.MINING_RANGE`). A critical hit does ×2 damage (`DamageHandler.CRITICAL_DAMAGE_MULTIPLIER`).

**Equipment reachable in stages 1–2** (EquipmentData + EquipmentStatData + StatConstantData + level-0 of StatUpgradeLevelData):

| id | name | kind | ownership | price | unlock | base stats |
|---|---|---|---|---|---|---|
| 100 | Pickaxe | mining hand tool | permanent | starter | – | power 10, interval 1.0 s |
| 101 | Sledgehammer | mining hand tool | permanent | 250 | reach stage 1 | power 50, interval 1.5 s |
| 102 | Jackhammer | mining hand tool | permanent | 5,000 | reach stage 2 | power 20, interval 0.25 s |
| 200 | Wooden Carrier | carrying hand tool | permanent | starter | – | cargo 5, absorb 2 |
| 201 | Cargo Pack | carrying hand tool | permanent | 6,500 | reach stage 2 | cargo 40, absorb 2 |
| 401 | Wheelbarrow | carrying vehicle, no fuel | **rental** | 300 | reach stage 1 | cargo 25, absorb 3, uses player move speed |
| 405 | Wheel Loader | resource-carrying vehicle | rental | 1,500 | after Wheelbarrow (401) | cargo 35, absorb 5, move 6, fuel 30, fuel eff 1.8 |
| 301 | Hydraulic Breaker | mining vehicle | rental | 2,500 | reach stage 1 | power 25, interval 0.15 s, move 6, fuel 30, fuel eff 1.8 |
| 302 | Roller Crusher | mining vehicle | rental | 6,500 | reach stage 2 | power 65, interval 0.4 s, move 6, fuel 36, eff 1.25 |
| 402 | Dump Truck | resource-carrying vehicle | rental | 5,500 | reach stage 2 | cargo 70, absorb 5, move 6, fuel 36, eff 1.25 |
| 403 | All-Terrain Vehicle | oil-carrying vehicle | rental | 6,500 | after Dump Truck (402) | move 12, cargo 5 (carries oil barrels) |

- **Rental prices scale with the stage** (`UseMultiplier = 1`, StageMultiplierData `Stage_HeavyTech_Purchase_Multiplier`): ×1.0 in stage 1, **×1.2 in stage 2** (e.g. Hydraulic Breaker 3,000 in stage 2). Hand tools do not scale.
- **Rentals and hand tools.** "Nice, you rented heavy equipment! Yours for this stage — rent again next time." A debug literal `ResetRentalEquipmentPurchases` exists. Hand tools: "Once it's yours, it's yours forever." Bought tools are equipped from the equipment inventory and can be lent to workers.
- **Later equipment** (not in stages 1–2): Large Hand Drill (15,000, stage 3), Exo-Carrier (18,000, stage 3), Drill Crusher (25,000, stage 3), Haul Truck (27,500, stage 3), Fuel Truck (25,000, stage 3), Knuckle Driller (30,000, stage 7; the only overheat tool: OverheatData max 100, start rate 0.6), Crush Hammer (35,000, stage 7), Wheel Crusher (42,500, stage 10), Inferno Breaker (60,000, stage 12). Titan Drill and Impact Hauler come from IAP or offers.
- **Fuel** (DATA constants):
  - Tank 30–36. One oil barrel = **5 fuel** (`VehicleFuelPerOilItem`, `VehicleBase.OIL_PER_ITEM`).
  - At 0 fuel, move speed ×0.05 (`VehicleEmptyFuelMoveSpeedMulti`, "It'll barely move without gas").
  - The Oil Station is locked until you rent a fuel-powered vehicle ("RENT FUEL-POWERED EQUIPMENT"). It then produces barrels, holding up to 9 (`OilStationInst.MAX_WEIGHT = 9`). The player carries them to the vehicle, which absorbs a barrel every 0.1 s.
  - Excess barrels go into the waste-oil bin (`OilTrashCan`, absorb tick 0.1 s).
- **Mount / dismount.** You can only dismount when fully stopped (dialogue). Rented vehicles appear on the base vehicle-spawn slots.
- **VIDEO cross-check.** The player shows CARGO [x/9], which is Wooden Carrier level 4 (5 + 4). A yellow wheel loader has an OIL bar. The parked wheelbarrow and the quest "Mount Wheelbarrow 0/1 → 25 $" match the data. The note "CARGO [0/25]" in the video brief equals Wheelbarrow cargo 25, not Wheel Loader (35).

---

## 4. Quarry stat upgrades (Upgrade building)

StatUpgradeTypeData / StatUpgradeLevelData, mode 1, continent 0 (DATA).
- Each stat has **levels 0–99**. Level 0 = base value. `price[L]` = cash to go from L−1 to L.
- `ResearchTime = 0` for every mode-1 row, so upgrades are instant. Cash only.
- The full arrays are in `economy.statUpgrades.*.priceToReach / value`.
- Visibility: INFERRED that an upgrade only appears once its equipment is owned or rented (`StatUpgradeManager.IsActiveTypeDef`). The upgrade popup recommends equipment 200 (Wooden Carrier) first (`StatUpgradePopup.RECOMMENDED_EQUIPMENT_ID = 200`).

| key | stat (target - name) | L0 | L1 | L5 | L10 | L20 | L50 | L99 | price L1 | L5 | L10 | L20 | L50 | L99 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| playerMoveSpeed | Player - Move Speed | 6 | 6.05 | 6.25 | 6.5 | 6.98 | 7.88 | 9.35 | 366 | 769 | 1903 | 10724 | 187063 | 19959920 |
| pickaxeAttackPower | Pickaxe - Mining Power | 10 | 10.4 | 12 | 14 | 18 | 27.8 | 35.6 | 10 | 21 | 52 | 293 | 5111 | 545353 |
| sledgeHammerAttackPower | Sledgehammer - Mining Power | 50 | 50.5 | 52.5 | 55 | 60 | 75 | 99.5 | 35 | 73 | 181 | 1025 | 17886 | 1908734 |
| jackhammerAttackPower | Jackhammer - Mining Power | 20 | 20.5 | 22.5 | 25 | 30 | 44.9 | 62.5 | 100 | 208 | 516 | 2929 | 51102 | 5453525 |
| woodenCarrierCargo | Wooden Carrier - Cargo | 5 | 6 | 10 | 15 | 25 | 55 | 104 | 12 | 25 | 62 | 352 | 6133 | 654423 |
| enhancedBackpackCargo | Cargo Pack - Cargo | 40 | 41 | 45 | 50 | 60 | 90 | 139 | 150 | 312 | 774 | 4393 | 76653 | 8180287 |
| wheelBarrowCargo | Wheelbarrow - Cargo | 25 | 26 | 30 | 35 | 45 | 75 | 124 | 50 | 104 | 258 | 1465 | 25551 | 2726763 |
| smelterSmeltingSpeed | Furnace - Processing Speed | 1 | 1.25 | 2.25 | 3.4 | 4.9 | 9.1 | 14 | 275 | 577 | 1427 | 8043 | 140297 | 14969940 |
| salesTruckWeightMin | Sales Trucks - Sales Capacity (min-max load) | 2-5 | 2-6 | 2-10 | 5-12 | 5-22 | 17-40 | 35-71 | 275 | 577 | 1427 | 8043 | 140297 | 14969940 |
| hydraulicBreakerAttackPower | Hydraulic Breaker - Mining Power | 25 | 26 | 30 | 35 | 45 | 75 | 124 | 100 | 208 | 516 | 2929 | 51102 | 5453525 |
| hydraulicBreakerMoveSpeed | Hydraulic Breaker - Move Speed | 6 | 6.05 | 6.25 | 6.5 | 7 | 8.5 | 10.95 | 50 | 104 | 258 | 1465 | 25551 | 2726763 |
| hydraulicBreakerFuelEfficiency | Hydraulic Breaker - Fuel Eff. | 1.8 | 1.85 | 2.05 | 2.3 | 2.8 | 4.3 | 5.95 | 50 | 104 | 258 | 1465 | 25551 | 2726763 |
| wheelLoaderCargo | Wheel Loader - Cargo | 35 | 36 | 40 | 45 | 55 | 85 | 134 | 50 | 104 | 258 | 1465 | 25551 | 2726763 |
| wheelLoaderMoveSpeed | Wheel Loader - Move Speed | 6 | 6.05 | 6.25 | 6.5 | 7 | 8.5 | 10.95 | 50 | 104 | 258 | 1465 | 25551 | 2726763 |
| wheelLoaderFuelEfficiency | Wheel Loader - Fuel Eff. | 1.8 | 1.85 | 2.05 | 2.3 | 2.8 | 4.3 | 5.95 | 50 | 104 | 258 | 1465 | 25551 | 2726763 |
| rollerCrusherAttackPower | Roller Crusher - Mining Power | 65 | 66 | 70 | 75 | 85 | 115 | 164 | 250 | 519 | 1290 | 7322 | 127755 | 13633811 |
| rollerCrusherMoveSpeed | Roller Crusher - Move Speed | 6 | 6.05 | 6.25 | 6.5 | 7 | 8.5 | 10.95 | 200 | 415 | 1032 | 5858 | 102204 | 10907049 |
| rollerCrusherFuelEfficiency | Roller Crusher - Fuel Eff. | 1.25 | 1.3 | 1.5 | 1.75 | 2.25 | 3.75 | 6.2 | 200 | 415 | 1032 | 5858 | 102204 | 10907049 |
| dumpTruckCargo | Dump Truck - Cargo | 70 | 72 | 80 | 89 | 99 | 129 | 178 | 250 | 519 | 1290 | 7322 | 127755 | 13633811 |
| dumpTruckMoveSpeed | Dump Truck - Move Speed | 6 | 6.05 | 6.25 | 6.5 | 7 | 8.5 | 10.95 | 250 | 519 | 1290 | 7322 | 127755 | 13633811 |
| dumpTruckFuelEfficiency | Dump Truck - Fuel Eff. | 1.25 | 1.3 | 1.5 | 1.75 | 2.25 | 3.75 | 6.2 | 250 | 519 | 1290 | 7322 | 127755 | 13633811 |
| atvMoveSpeed | All-Terrain Vehicle - Move Speed | 12 | 12.1 | 12.5 | 13 | 14 | 15.95 | 18.4 | 250 | 519 | 1290 | 7322 | 127755 | 13633811 |

First 15 levels of the upgrades the first session actually uses:

| stat | L0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pickaxe power | 10 | 10.4 | 10.8 | 11.2 | 11.6 | 12 | 12.4 | 12.8 | 13.2 | 13.6 | 14 | 14.4 | 14.8 | 15.2 | 15.6 | 16 |
| price | 0 | 10 | 12 | 15 | 18 | 21 | 25 | 30 | 36 | 43 | 52 | 62 | 75 | 90 | 107 | 129 |
| Wooden Carrier cargo | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
| price | 0 | 12 | 15 | 18 | 21 | 25 | 30 | 36 | 43 | 52 | 62 | 75 | 90 | 107 | 129 | 155 |
| Player move speed | 6 | 6.05 | 6.1 | 6.15 | 6.2 | 6.25 | 6.3 | 6.35 | 6.4 | 6.45 | 6.5 | 6.55 | 6.6 | 6.65 | 6.7 | 6.75 |
| price | 0 | 366 | 439 | 549 | 659 | 769 | 915 | 1098 | 1318 | 1574 | 1903 | 2269 | 2745 | 3294 | 3916 | 4721 |
| Furnace speed | 1 | 1.25 | 1.5 | 1.75 | 2 | 2.25 | 2.5 | 2.75 | 3 | 3.25 | 3.4 | 3.55 | 3.7 | 3.85 | 4 | 4.15 |
| price | 0 | 275 | 329 | 412 | 494 | 577 | 686 | 824 | 989 | 1181 | 1427 | 1702 | 2059 | 2471 | 2937 | 3541 |
| Sales trucks (min-max) | 2-5 | 2-6 | 2-7 | 2-8 | 2-9 | 2-10 | 3-10 | 4-10 | 5-10 | 5-11 | 5-12 | 5-13 | 5-14 | 5-15 | 5-16 | 5-17 |
| price | 0 | 275 | 329 | 412 | 494 | 577 | 686 | 824 | 989 | 1181 | 1427 | 1702 | 2059 | 2471 | 2937 | 3541 |
| Sledgehammer power | 50 | 50.5 | 51 | 51.5 | 52 | 52.5 | 53 | 53.5 | 54 | 54.5 | 55 | 55.5 | 56 | 56.5 | 57 | 57.5 |
| price | 0 | 35 | 42 | 51 | 61 | 73 | 88 | 105 | 126 | 151 | 181 | 217 | 261 | 313 | 375 | 450 |
| Wheelbarrow cargo | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 |
| price | 0 | 50 | 60 | 72 | 87 | 104 | 125 | 150 | 180 | 215 | 258 | 310 | 372 | 446 | 535 | 642 |
| Hydraulic Breaker power | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 |
| price | 0 | 100 | 120 | 144 | 173 | 208 | 249 | 299 | 359 | 430 | 516 | 620 | 744 | 892 | 1070 | 1284 |

- **Price curves.** Prices grow about ×1.2 per level, rounded. Several stats share one curve: Furnace and Sales Trucks are identical, and Wheelbarrow, Wheel Loader and the Hydraulic Breaker move/fuel stats are identical.
- **Persistence.** Quarry upgrades are stored per (game mode, continent), not per stage (`SaveData_StatUpgradeV2._statInfoDict`). `ResetGameModeStatInfos` only targets event modes. So they most likely **persist across main stages** (INFERRED; see Unknowns).

---

## 5. Buildings and structures

| building | behaviour (CODE-NAME + dialogue + video) | key numbers |
|---|---|---|
| Furnace (REFINING pad) | Player or carrier workers drop minerals on the pad (`SmelterInst.AddItemToInputInventory`). It smelts **one item at a time**: duration = `SmelterData.RefiningTime / furnace speed` (category multi applies). Output: 1 ingot, or 2 on a crit (`SMELTING_RESULT_ITEM_DEFAULT_COUNT = 1`, `CRITICAL_COUNT = 2`, crit chance stat `SmeltingCriticalChance`, 0 in stage 1). Ingots pile next to the furnace (VIDEO "LOAD: 22") | speed L0 1.0 |
| SELL pad (Sales Stand) | Accepts ingots. Trucks queue on the road lane. Each truck gets a random target weight in [SalesTruckWeightMin, Max] (`GenerateTruckWeight`), fills from the pad (`TryFillTruck`, partial-sell after a timeout), leaves, and the cash is **stacked at the money place** for the player to walk over (`MoneyPlace`, `EarnMoney`). Price per ingot = `GetFinalPrice` = table price + Sales-office bonuses (none in stages 1–2). Each sold item → `StageProgressionManager.OnSalesStandSell(count)` | truck grade by load: basic ≥1, advanced ≥20, premium ≥35 |
| Machinery Shop | Walk in (ENTER) → buy light / rent heavy equipment. The free-cash "ATM" RV boost lives here | |
| Upgrade building (OPEN) | Quarry stat upgrades (§4) | |
| Oil Station | Locked until a fuel vehicle is rented, then it produces oil barrels (max 9 waiting). The waste-oil bin next to it unlocks too | 5 fuel / barrel |
| Ore Storage | 2 × 2 pad at the rail end. The minecart unloads here (0.03 s/item); the building hands items to units (`BuildingStackingSender`, 0.2 s) | |
| Worker building | Job board + worker management (assign light equipment to workers). Locked label "STAGE 1 [40%]" (VIDEO + locale `BUILDING_WORKER_LOCKED`) | |
| Cafeteria (truck + 3 tables) | Workers with 0 stamina queue, sit, eat and recover; more seats = less waiting | recover 50 s |

**Structures** (StructureExpansionData + OreDepositData; prices are all 0):

| stage | group | type | unlock | notes |
|---|---|---|---|---|
| 1 | 101 | Minecart | **Free** | (507,505), the near minecart |
| 1 | 102, 103 | Minecart | rewarded ad (`trolley_rv`) | mid and far minecarts |
| 2 | 201, 202 | Minecart | rewarded ad | |
| 2 | 203 | Auto Digger | rewarded ad (`mining_auto`) | sits on an **Emerald deposit of 300**. `AutoDiggerActor.DIG_INTERVAL = 1 s` → INFERRED: 1 emerald mineral per second into an unlimited output pile until the deposit is empty |

**Minecart** (DATA constants):
- Capacity **100** (`MinecartInst.INPUT_WEIGHT_LIMIT`; VIDEO "CARGO [58/100]").
- States: Idle → LoadCargo → MoveForward → UnloadCargo → MoveBackward.
- The player feeds minerals within the interaction radius, then presses the depart button (`MinecartUI`, VIDEO green play button). `LOAD_CARGO_WAIT_TIME = 3 s`.
- It rides the rail to the end point and unloads into Ore Storage at 0.03 s/item (×10 speed-up option), then returns.
- Expansion placements are ad slots (`ERewardedPlacement`: 8 `trolley_rv`, 9 `bridge1_rv`, 11 `mining_auto`, 13 `fuel_add`).

---

## 6. Workers

Sources: WorkerHiringProfileData / StatData / RecruitData (mode 1), StageData.MaxWorkerCount, RemoteConfig.

- **Max workers per stage:** stage 1 = **5**, stage 2 = **4** (fallback 6). They are hired **for the current stage only** ("Hired for this stage only. Declined applicants may return.").
- **Unlock:** condition group 1003 = `ProgressReached(stage 1, 20 %)` (DATA). The building label says "STAGE 1 [40%]", and the quest chain asks to hire right after the 40 % quest.
- **Recruiting:** every **180 s** a batch of **3** applicants appears and stays **120 s** (RecruitData Interval / ResumeCount / Duration; field meaning INFERRED from names).
  - The first two applicants are fixed: profile 3 Earl (Carrying), then profile 2 Roy (Mining) (`ONBOARDING_WORKER_*`).
  - The first hire is free ("I pulled some strings — cost is covered").
  - The hire price is ×1.1 in stage 2 (ItemMultiplier WorkerHiring).
- **Roles:**
  - Mining workers auto-mine blocks (range 1.5).
  - Carrying workers pick up dropped minerals (within 1.5) and deliver them to the furnace (`CarryingWorkerState_MovingToSmelter`).
  - Workers can use light equipment the player owns (assign it in the Worker building).
- **Stamina:** workers spend stamina while working (StaminaEfficiency 1). At 0 they walk to the cafeteria / recover point and recover in `StaminaRecoverTimeBase = 50 s`.

| id | name | role | tier | hire $ | move | stamina | power | cargo | trait |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Bud Wilson | Mining | 2 | 1200 | 5 | 94 | 25* | 3 | Fracturer |
| 2 | Roy Miller | Mining | 0 | 300 | 4 | 79 | 10* | 2 | Fracturer |
| 3 | Earl Johnson | Carrying | 2 | 1500 | 4 | 59 | 5 | 18* | Heavy Lifter |
| 4 | Suzy Baker | Carrying | 0 | 400 | 5* | 53 | 2 | 3 | High Stepper |
| 5 | Fred Murphy | Mining | 1 | 500 | 5 | 79 | 13* | 2 | Fracturer |
| 6 | Rosie Martinez | Mining | 1 | 500 | 4 | 121* | 4 | 3 | Long Runner |
| 7 | Kaya Stone | Carrying | 1 | 800 | 6.8* | 56 | 4 | 5 | High Stepper |
| 8 | Petra Novak | Carrying | 2 | 1300 | 4.6 | 63* | 16 | 4 | Fracturer |
| 9 | Carlos Mendoza | Mining | 0 | 300 | 4 | 88* | 4 | 10 | Heavy Lifter |
| 10 | Erik Hansen | Mining | 3 | 2000 | 5 | 73 | 42* | 25 | Powerhouse |
| 11 | Grace Kim | Carrying | 2 | 1300 | 4.2 | 95* | 6 | 5 | Long Runner |

`*` = the stat highlighted on the applicant card (`IsRecommendStat`). Profile `Chance` is 1 for everyone (uniform pick, INFERRED).

---

## 7. Tutorial: quest chain and onboarding dialogue

### 7.1 Guide quests

Sources: QuestData group 1 in `NextId` order; rewards resolved via QuestRewardData (`ItemType`, `RewardValue` used raw); the quest card text is filled in.
- Only one quest is active at a time. It completes automatically and pays its reward.
- `GuideType`: **CameraDirecting** = the camera pans to the target named in "guide"; **ToastMessage** = a toast text appears.
- Group 1 covers stages 1–4. The chain is group 1 → group 2 (looped 6×) → group 1000 (infinite loop), with `UseMultiplier` rewards ×1.0–2.0 by level.

| # | id | stage | type | text | target | reward | guide |
|---|---|---|---|---|---|---|---|
| 1 | 1001 | 1 | DestroyOre | Break Ores | 1 | 2 Money | Camera: MineBlock |
| 2 | 1002 | 1 | CollectMineral | Collect Minerals | 5 | 2 Money | Toast: Collect Minerals! |
| 3 | 1003 | 1 | ReturnMineralToSmelter | Deliver Minerals to the Furnace | 5 | 2 Money | Camera: Smelter |
| 4 | 1004 | 1 | SellIngot | Sell Ingots | 3 | 2 Gem | Camera: SalesStand |
| 5 | 1005 | 1 | EnterBuilding (Upgrade) | Go to Upgrade | 1 | 40 Money | Camera: UpgradeBuilding |
| 6 | 1006 | 1 | FieldUpgrade | Upgrade at Quarry | 3 | 1 Gem | Camera: UpgradeBuilding |
| 7 | 1007 | 1 | DestroyOreByCategory (Rock) | Break Rocky Ores | 3 | 5 Money | Camera: RockMineBlock |
| 8 | 1008 | 1 | HoldCurrency | Hold 250 or more Cash | 250 | 1 Gem | Toast: Save Cash for Better Equipment! |
| 9 | 1009 | 1 | EnterBuilding (Shop) | Go to Machinery Center | 1 | 7 Money | Camera: ShopBuilding |
| 10 | 1010 | 1 | PurchaseLightEquip | Purchase Sledgehammer | 1 | 2 Gem | Camera: ShopBuilding |
| 11 | 1011 | 1 | DestroyOre | Break Ores | 20 | 10 Money | Camera: MineBlock |
| 12 | 1012 | 1 | ReturnMineralToSmelter | Deliver Minerals to the Furnace | 50 | 15 Money | Camera: Smelter |
| 13 | 1013 | 1 | HoldCurrency | Hold 300 or more Cash | 300 | 1 Gem | Toast: Save Cash… |
| 14 | 1014 | 1 | EnterBuilding (Shop) | Go to Machinery Center | 1 | 20 Money | Camera: ShopBuilding |
| 15 | 1015 | 1 | RentHeavyEquip | Rent Wheelbarrow | 1 | 2 Gem | Camera: ShopBuilding |
| 16 | 1016 | 1 | VehicleMounted | Mount Wheelbarrow | 1 | 25 Money (VIDEO ✓) | Camera: Wheelbarrow |
| 17 | 1017 | 1 | ReturnMineralToSmelter | Deliver Minerals to the Furnace | 100 | 25 Money | Camera: Smelter |
| 18 | 1018 | 1 | SellIngot | Sell Ingots | 50 | 30 Money | Camera: SalesStand |
| 19 | 1019 | 1 | FieldUpgrade | Upgrade at Quarry | 5 | 1 Gem | Camera: UpgradeBuilding |
| 20 | 1020 | 1 | HoldCurrency | Hold 2500 or more Cash | 2500 | 35 Money | Toast: Save Cash… |
| 21 | 1021 | 1 | RentHeavyEquip (any) | Rent Any Heavy Equipment | 2 | 3 Gem | Camera: ShopBuilding |
| 22 | 1022 | 1 | VehicleMounted (any) | Mount Any Heavy Equipment | 1 | 40 Money | Camera: HydraulicBreaker |
| 23 | 1023 | 1 | DestroyOre | Break Ores | 100 | 45 Money | Camera: MineBlock |
| 24 | 1024 | 1 | FieldUpgrade | Upgrade at Quarry | 7 | 45 Money | Camera: UpgradeBuilding |
| 25 | 1025 | 1 | DestroyOreByCategory (Metal) | Break Metal Ores | 10 | 55 Money | Camera: MetalMineBlock |
| 26 | 1026 | 1 | StageProgression | Break 40% Ores on Stage 1 | 40 | 2 Gem | Toast: Smash Rocks! |
| 27 | 1027 | 1 | HireWorker (any) | Hire 1 Workers | 1 | 1 Gem | Camera: WorkerBuilding |
| 28 | 1028 | 1 | DestroyOre | Break Ores | 150 | 50 Money | Camera: MineBlock |
| 29 | 1029 | 1 | FieldUpgrade | Upgrade at Quarry | 15 | 60 Money | Camera: UpgradeBuilding |
| 30 | 1030 | 1 | StageProgression | Break 80% Ores on Stage 1 | 80 | 1 Gem | Toast: Smash Rocks! |
| 31 | 1031 | 1 | StageCleared | Clear Stage 1 | 1 | 2 Gem | Toast: Clear the Stage! |
| 32 | 1032 | 1→2 | StageContract | Contract a New Quarry | 1 | 1 Gem | Toast: Pick Your Next Quarry! |
| 33 | 1033 | 2 | DestroyOre | Break Ores | 50 | 65 Money | Camera: MineBlock |
| 34 | 1034 | 2 | HireWorker | Hire 1 Workers | 1 | 70 Money | Camera: WorkerBuilding |
| 35 | 1035 | 2 | SellIngotByCategory (Jewel) | Sell Jewel Ingots | 50 | 80 Money | Camera: SalesStand |
| 36 | 1036 | 2 | FieldUpgrade | Upgrade at Quarry | 5 | 75 Money | Camera: UpgradeBuilding |
| 37 | 1037 | 2 | RentHeavyEquip | Rent Roller Crusher | 1 | 1 Gem | Camera: ShopBuilding |
| 38 | 1038 | 2 | ManagementUpgrade | Upgrade at Company | 2 | 75 Money | Toast: Upgrade at Your Company! |
| 39 | 1039 | 2 | DestroyOre | Break Ores | 100 | 80 Money | Camera: MineBlock |
| 40 | 1040 | 2 | StageProgression | Break 40% Ores on Stage 2 | 40 | 1 Gem | Toast: Smash Rocks! |
| 41 | 1041 | 2 | HireWorker | Hire 3 Workers | 3 | 85 Money | Camera: WorkerBuilding |
| 42 | 1042 | 2 | PurchaseLightEquip | Purchase Jackhammer | 1 | 2 Gem | Camera: ShopBuilding |
| 43 | 1043 | 2 | FieldUpgrade | Upgrade at Quarry | 10 | 75 Money | Camera: UpgradeBuilding |
| 44 | 1044 | 2 | StageProgression | Break 60% Ores on Stage 2 | 60 | 2 Gem | Toast: Smash Rocks! |
| 45 | 1045 | 2 | DestroyOre | Break Ores | 100 | 90 Money | Camera: MineBlock |
| 46 | 1046 | 2 | SellIngot | Sell Ingots | 200 | 90 Money | Camera: SalesStand |
| 47 | 1047 | 2 | StageProgression | Break 80% Ores on Stage 2 | 80 | 1 Gem | Toast: Smash Rocks! |
| 48 | 1048 | 2 | StageCleared | Clear Stage 2 | 2 | 2 Gem | Toast: Clear the Stage! |
| 49 | 1049 | 2→3 | StageContract | Contract a New Quarry | 1 | 1 Gem | Toast: Pick Your Next Quarry! |

How each quest type counts (method names in `GuideQuestManager`):

| quest type | what it counts | source event |
|---|---|---|
| DestroyOre | blocks destroyed | `OnOreDestroyed` |
| CollectMineral | chunks picked up | `OnMineralCollected` |
| ReturnMineralToSmelter | minerals put into the furnace | `OnMineralReturnedToSmelter` |
| SellIngot | ingots sold | `OnIngotSold` |
| FieldUpgrade | quarry upgrades bought | `OnStatUpgraded` |
| HoldCurrency | current cash ≥ target | – |
| RentHeavyEquip "any", target 2 | rentals owned; Wheelbarrow + Hydraulic Breaker count, INFERRED | `GetHeavyEquipValue` |
| StageProgression | stage progress %, the same measure as the clear rule | – |
| EnterBuilding | building entered (`OnBuildingEntry`): Condition 105 = Upgrade, 104 = Shop (EUnit) | `OnBuildingEntry` |

Quest group 3 (3001–3057) exists in the data but no quest group links to it. All its rewards are 1 cash, so it is a placeholder or an A/B variant; ignore it.

### 7.2 Onboarding dialogue sequence

Onboarding is code-driven. The ids come from `EOnboardingType`; the trigger evidence comes from `OnboardingItem_*` fields and constants and from condition groups; the lines come from Locale `ONBOARDING_*` (English). Speakers are **Foreman Hank** (core) and **Secretary Sofia** (company).

| # | id | step | trigger | lines |
|---|---|---|---|---|
| 1 | 101 | Core_Mine | game start; ends when cargo is full (`_isCargoFull`) | "Well, look who finally showed up! Ready to smash some rocks?" |
| 2 | 102 | Core_Smelt | camera to the furnace; ends when a smelt finishes | "Nice haul! Can't sell 'em raw though — head to the furnace and start smelting!" |
| 3 | 103/104 | Core_GetIngot / Core_Sell | pick up the ingot (`_isIngotCollected`), deliver it to SELL (`_isIngotDelivered`) | (arrow only) |
| 4 | 201 | EnterUpgrade | quest 1005 (`QUEST_ID_ENTER_UPGRADE = 1005`) | "You've saved enough — time to upgrade! Better gear makes everything easier." |
| 5 | 301/302 | Shop_Enter / Shop_Inside | quest 1009 (`QUEST_ID_ENTER_SHOP = 1009`) | "You've got enough for new gear! Let's go shopping!" / "Buy light equipment or rent heavy equipment here." |
| 6 | 401 | PurchasedHandTool | after the Sledgehammer | "Nice, you got light equipment! Once it's yours, it's yours forever." + equipment-inventory hint |
| 7 | 501/502 | PurchasedVehicle / VehicleMountGuide | first rental, first mount | "…Yours for this stage — rent again next time." / dismount only when stopped |
| 8 | 1501/601 | OilStationFirstUnlocked / Refuel | first fuel vehicle; first empty tank | "Grab the fuel from the tank, then dump the rest in the waste oil bin." / "Uh oh, out of fuel… grab fuel barrels from base manually." |
| 9 | 901–903 | WorkerHiringStarted / WorkerManagement / WorkerCafeteria | hiring unlocks (20–40 %) | "Getting tough solo, huh? Let's hire some workers!" … "cost is covered. Just sign!" … cafeteria explanation |
| 10 | 804 | CompanyOpened | Stage 1 ≥ 60 % (`COMPANY_LOCK_CONDITION_GROUP_ID = 203`) | "Quarry's running smooth! I'm Sofia, your new Secretary." |
| 11 | 1101 | StageClearCondition | progress ≥ 80 % | "You've met the stage clear condition! … that's the bare minimum … cashing out your resources first pays off big." |
| 12 | 802 | NextStage | Next button → HQ → Contract Room | "That's everything! Ready to head back to the quarry?" |
| 13 | 801 / 803 / 1201 | EnterLightTech / EnterManagement / CashbackOpened | stage 2 / stage 2 ≥ 40 % / stage 2 | Light Equipment Workshop, Heavy Equipment Center (needs Gear), cash-spending rebate |

All lines, in order, are in `economy.onboardingSequence`.

---

## 8. Stage progression, clear and reward

- **Progress %** (CODE-NAME, high confidence):

  ```
  progress = itemsSoldAtSalesStand / MaxDropItemCountInStage
  ```

  - `StageProgressionManager` only has the methods `OnUpdateMaxDropItemCount(maxDropItemCount)` and `OnSalesStandSell(count)`.
  - Its only save field is `SalesStandSellCompletedCount`.
  - `MaxDropItemCountInStage` = the map's `totalDropItemCount`: 7224 in stage 1, 5904 in stage 2.
  - So progress rises when ingots are **sold**, not when blocks break. The quest text "Break X% Ores" simplifies this.
  - Crit-smelted ingots probably push progress slightly faster (INFERRED).
- **Clear condition:** `MAIN_CLEAR_PROGRESS_CONDITION = 80` (RemoteConfig) × `StageProgressUI.CLEAR_PROGRESS_CONDITION_MULTIPLIER = 0.01`.
  - At ≥ 80 % a stage-clear button appears on the HUD progress bar (VIDEO: bar labelled "Stage 1 7 %" with "Next").
  - The player may keep mining first ("cashing out your resources first pays off big").
- **Clear flow** (CODE-NAME: `StageManager.StartStageClearFlow`, popups `ResultMeter`, `ResultReward`, `StageClearOffer`, `ContractRoom`):
  1. **Result meter.** `MineMeterManager` (`GameModeMineMeterData`: mode 1 uses it) shows Ore mined %, Cash earned, Mining/Hauling %, and the top 4 workers.
  2. **Reward popup.** Stage `RewardGroup`, plus any pending cashback. Stage-clear rewards:

     | stage clear | reward group | reward |
     |---|---|---|
     | Stage 1 | 101 | **550 Gear** |
     | Stage 2 | 102 | **400 Gear** |
     | Stage 3 | 103 | 550 Gear |
     | Onboarding 60101 | 1064 | 50 BizPoint |

  3. **Stage Clear Offer.** An IAP pack (StageClearOfferData; ignore).
  4. **Contract Room.** Pick the next stage from the next `ContractGroup` (group size ≤ 3, `StageManager.MAX_STAGE_GROUP_SIZE`; the data has 1 stage per group, so stage 1 → stage 2). Quest 1032 "Contract a New Quarry".
  5. The next stage loads. Main stages loop after stage 10 (`IsLooped`).
- **Reset vs keep at the stage change:**
  - Reset (DATA/dialogue): rentals (heavy equipment), hired workers, and the structures and minecarts of the map. Every stage's map is its own.
  - Kept: hand tools, gems, gear, and the company tree.
  - Cash and quarry upgrades: INFERRED kept (see Unknowns).
- **CashTarget** (120,000 for stages 1 and 2) is used by **Cashback**: `CashbackManager.GetCashTarget / GetCurrentMoneySpent / GetProgress`.
  - Milestones are reached when the cash **spent in this stage** reaches 20/40/60/80/100 % of CashTarget.
  - Rewards: 5 Gear, 10 Gear, 1 Gem, 25 Gear, 45 Gear.
  - Each milestone also requires `StageLevel ≥ 2`, so cashback is **inactive in stage 1**.
  - CashTarget roughly equals the stage's 80 % income (stage 1: ≈133k).
- **XP / levels:** **none in the main mode.** `MineBlockBreakRewardData.Exp = 0` for mode 1. `GameModeLevelData` (24 levels, required XP 12 … 3,990) and Card Draft (stat/skill cards on level-up and stage clear) belong only to the Lost Mine event (mode 3).
- **HUD:**
  - Mode-1 UI list (GameModeUIData): CashBack, Contents, Currency, PlayerBuff, Camera, StageProgress, ShopEquipment, VehicleMount, Minecart, Cargo, AutoPlay, EquipInventory, WorldMapEvent, Management, ContentOffer, RvBoost, WorkerHiring, Option, VehicleInfo, GuideQuest, ManagementQuarry, ResumeNotification.
  - Currency HUD: Cash and Gem always visible; Gear and Research Point from stage ≥ 2.
  - The `MiningCombo` UI (+1 % move speed per consecutive ore) is not listed for any mode, so it is treated as disabled.

---

## 9. Rewarded-ad boosts (RvBoostData, game mode 0 = main)

Shared settings:
- **Ad tiles** appear on the floor near the player (RemoteConfig `RV_BOOST_TILE_INTERVAL 30 s`, `RV_BOOST_TILE_DURATION 20 s`).
- **UI offers** appear every 180 s for 20 s.
- `cool` = cooldown after use.
- **FreeTrial** rows duplicate 1001–1003, 3001 and 5001–5003 with the extra condition `StageLevelLessOrEqual 1`. INFERRED: in stage 1 each boost can be tried once without an ad.
- Every boost also requires `HasUnlockedEquipment 301`. INFERRED: boosts start appearing after the Hydraulic Breaker has been rented.

| id | name | where | effect (BuffData / EffectData) | duration | cool | extra conditions |
|---|---|---|---|---|---|---|
| 1001 | SPEED BOOST | floor tile | +30 % move speed, +23 % attack speed (`CommonAttackIntervalMulti 0.23`) for player + light-equipment workers | 300 s | 300 s | – |
| 1002 | DAMAGE BOOST | floor tile | +50 % mining power | 180 s | 180 s | ore within 7.5, can mine |
| 1003 | MAGNET BOOST | floor tile | unlimited cargo (`CommonCargoBase +1e8`) and absorb range ×3 (+200 %) | 15 s | 30 s | cargo ≥ 66 %, ≥ 200 chunks on the ground |
| 3001 | FREE CASH | HUD | +3,500 cash × stage multiplier (stage 2 ×1.4) | instant | 180 s | ≤ 6/day |
| 3002 | FREE GEAR | HUD (HQ popup) | +200 gear (stage 2 ×1.2) | instant | 180 s | ≤ 6/day, management popup open |
| 3003 | FREE GEM | HUD | +10 gems | instant | 180 s | ≤ 2/day |
| 5001 | FURNACE OVERLOAD | furnace | smelting speed +100 % | 180 s | 180 s | progress ≥ 80 %, **or** ≥ 150 minerals queued and player in base |
| 5002 | SPECIAL ORDER | SELL pad | a special truck instantly sells 300 cargo | instant | 180 s | progress ≥ 80 % and ≥ 1 on the pad, **or** ≥ 100 on the pad and player in base |
| 5003 | STAFF PIZZA PARTY | cafeteria | workers fully recover + unlimited stamina | 180 s | 180 s | player in base |
| 7001 | FREE CASH (ATM) | machinery shop | +3,500 cash | instant | 30 s | stage ≥ 2, inside the shop, ≤ 2/day |
| 8001 | MYSTERY GIFT BOX | 3D gift (Mystery ore) | +3 legendary secretary gifts (meta) | – | – | – |

---

## 10. Relevant config and constants

**RemoteConfig_112** (latest version):

| key | value |
|---|---|
| `MAIN_CLEAR_PROGRESS_CONDITION` | 80 |
| `URGENT_CLEAR_PROGRESS_CONDITION` | 95 (event mode) |
| `ONBOARDING_WORKER_FIRST_ID` / `_ROLE` | 3 / 2 (carrier) |
| `ONBOARDING_WORKER_SECOND_ID` / `_ROLE` | 2 / 1 (miner) |
| `RV_BOOST_*` | money 3,500, gear 200, gem 10, ATM 3,500 |
| `RV_BOOST_STOPPED_TIME` | 0.1 |
| `RV_HARVESTER_CARGO` / `_DURATION` | 500 / 300 |
| `TREE_SKIP_SECONDS` | 900 |
| `RV_RESEARCH_MULTI` | 2 |
| Interstitials | first after 200 s, then every 180 s (`IS_ON = 1`) |
| `DYNAMITE_COOL_TIME` | 1 |
| `OIL_TRASH_ABSORB_START_DELAY` / `_TICK_INTERVAL` | 0.3 / 0.1 |

**GlobalConfig:**

| key | value |
|---|---|
| `IS_SAMPLE` | 1 |
| `RND_MAX_SECOND` | 21,600 (research lab idle cap 6 h) |
| `RVBOOST_NO_COOL_CONDITON` | 1401 |
| `LOST_MINE_DAILY_ENTRY_PLAY_BUFFER_RATIO` | 0.025 |

**StatConstantData** (base values not covered by upgrades):

| stat | value |
|---|---|
| `CharacterMoveSpeedMulti`, `VehicleMoveSpeedMulti` | 0.01 |
| `VehicleFuelAmountBase` | 30 |
| `VehicleFuelEfficiencyMulti` | 0.03 |
| `VehicleFuelPerOilItem` | 5 |
| `VehicleEmptyFuelMoveSpeedMulti` | 0.05 |
| `AtvCargoBase` | 5 |
| `SmelterSmeltingSpeedMulti` | 0.01 |
| Attack interval base | Pickaxe 1, Sledgehammer 1.5, Jackhammer / Large Drill / Titan / Knuckle 0.25, Hydraulic Breaker 0.15, Roller Crusher 0.4, Drill Crusher 0.15, Crush Hammer 0.15, Inferno Breaker 3, Wheel Crusher 0.667 |
| Detection range base | 1 (Titan Drill 1.8) |
| Fuel amount base | Hydraulic Breaker 30, Roller Crusher 36, Drill Crusher 45, Dump Truck 36, Haul Truck 48, Wheel Loader 30, Wheel Crusher 60, Fuel Truck 30 |
| Absorb range base | carriers 2, Wheelbarrow 3, trucks / loader 5 |
| `StaminaEfficiencyBase` | 1 |
| `StaminaRecoverTimeBase` | 50 |

**Code constants** (from il2cpp `const` fields):

| constant | value |
|---|---|
| `BLOCK_SIZE` | 2.5 |
| `CRITICAL_DAMAGE_MULTIPLIER` | 2 |
| `MINING_RANGE` | 1.5 |
| Minecart `INPUT_WEIGHT_LIMIT` | 100 |
| Minecart `LOAD_CARGO_WAIT_TIME` | 3 |
| Minecart unload interval | 0.03 |
| Stacking `SEND_INTERVAL` | 0.2 s (unit ↔ building transfer tick) |
| Drop `COLLECT_DELAY_SEC` | 0.5 |
| Oil station `MAX_WEIGHT` | 9 |
| Extra oil station `GENERATE_INTERVAL` | 0.5 |
| Auto digger `DIG_INTERVAL` | 1 |
| Truck grades | 1 / 20 / 35 |
| `MAX_HIRED_WORKER_COUNT_FALLBACK` | 6 |
| `MAX_STAGE_GROUP_SIZE` | 3 |
| Guide quest `DEFAULT_START_GROUP_ID` / `INFINITE_LOOP_GROUP_ID` | 1 / 1000 |
| `ISPlacementUpgrade` (interstitial after upgrades) | `MIN_STAGE 1`, `REQUIRED_COUNT 10` |

---

## 11. Meta systems (outside the 2-stage loop, noted only)

**Company HQ** (Management), opening at stage 1, 60 %. Floors:

| floor | what it does | unlocks at |
|---|---|---|
| Contract Room | contracting the next quarry; this is the part stages 1–2 need | always |
| Light Equipment Workshop | cash-priced tree nodes with research timers of 5 s – 8 h, e.g. Pickaxe +10 % power for 1,650 | stage 2 |
| Heavy Equipment Center | Gear-priced tree nodes, e.g. Hydraulic Breaker +5 % power for 250 Gear | stage 2, 40 % |
| Research Laboratory | idle rewards: 15 cash/min, 2 gear/min, 60 RP/20 min | stage 4 |
| Sales Office | ingot price bonuses | stage 5 |
| HR | worker stats | stage 6 |

Tree nodes for light/heavy tech are in `economy.management.treeNodes`.

**Not needed for the prototype:** secretaries (stat bonuses, gifts), world map and Urgent Mining Contract events (mode 2, Bonds), Lost Mine (mode 3, XP/levels, card draft, triggered actions), IAP shop, piggy bank, stage-clear and founder offers, 3-day supply, season pass, dynamite (event mode), interstitial ads.

---

## 12. Inferred formulas (no code available; each marked INFERRED)

1. **Damage.** `damage per hit = AttackPowerFinal / resistance` (resistance is 1 in mode 1), ×2 on a crit. `AttackPowerFinal = Base × (1 + Σ Multi)`; Base is the upgrade value. Hits come every `AttackIntervalFinal = Base / (1 + Σ intervalMulti)`, so the speed boost's 0.23 cuts the interval to about 0.81×.
   - Examples:

     | equipment | DPS | Limestone (50 HP) | Gold (1000 HP) |
     |---|---|---|---|
     | Pickaxe | 10 | 5 hits | 100 s |
     | Sledgehammer | 33 | – | 30 s |
     | Hydraulic Breaker | 167 | – | 6 s |

   - Evidence: Base/Multi/Final stat triplets (`EStatCalcType` Value/Percentage), `DamageHandler`, `CRITICAL_DAMAGE_MULTIPLIER`.
2. **Drops.** A block with `maxHP` drops `MidDropAmount` at each 25 % HP threshold crossed (4 stages), then `FinalDropAmount` (2) when destroyed. One hit that crosses several thresholds drops several chunks. Chunks are physics items on the ground; a unit absorbs every chunk within `absorbRange` while it has free cargo (`cargo` = item count, since weight is 1).
3. **Cargo.** Capacity = `CargoFinal` of the carrying tool or vehicle. Hand cargo and vehicle cargo are separate: a mounted vehicle uses its own cargo. Delivering = standing on a pad, which transfers 1 item every 0.2 s (`SEND_INTERVAL`).
4. **Smelt.** `time per item = RefiningTime / (SmeltingSpeedFinal × (1 + category multi + RV multi))`. Output 1 ingot (crit chance → 2).
5. **Income.** `cash per truck = Σ ingot price` of the items loaded. A truck's load is a random integer in [min, max] from the Sales Trucks upgrade, and trucks keep arriving while ingots are on the pad. The expected stage income is about Σ blocks × 6 × ingot price (stage 1 ≈ 167k).
6. **Progress.** `progress = soldCount / (6 × blockCount)`, clear at ≥ 0.80.
7. **Fuel.** Fuel drains while the vehicle moves or works at about `1 / FuelEfficiency` units per second. Example: Hydraulic Breaker tank 30, efficiency 1.8 → ~54 s of work per tank, or 1 barrel ≈ 9 s. At 0 fuel the vehicle moves at 5 % speed. (Only the stat names are known: higher efficiency = slower drain.)
8. **Rental price** = `EquipmentData.Price × StageMultiplier.HeavyTech(stage)`. Worker hire price = profile price × `ItemMultiplier.WorkerHiring(stage)`. RV cash = 3,500 × `ItemMultiplier.RV_EarnItem(stage)`.
9. **Cashback progress** = cash spent in this stage / CashTarget.
10. **Worker stamina.** It falls by `StaminaEfficiency` per action (per hit or per item carried). At 0 the worker goes to the cafeteria and recovers in 50 s.
11. **Minecart departure.** The player presses depart; the cart may also auto-depart when full after `LOAD_CARGO_WAIT_TIME 3 s`. Cart speed comes from the prefab (`_baseSpeed` and the acceleration curves), which was not read.

## 13. Unknowns

- **Persistence at stage change:**
  - Does **cash** carry over? Do **quarry upgrades** persist?
  - Leaning yes (per-mode save keys, no reset method). The prices go to 20M at level 99, which suggests a long-term track.
  - Decide for the prototype; probably keep both.
- **Exact rules** for fuel consumption, sales-truck arrival rate and speed, minecart travel speed, player auto-target logic, how far the Sledgehammer's AoE reaches (`EDamageSplitStyle`), and worker stamina drain. These live in code or prefabs and are not in the tables.
- **Worker unlock threshold:** condition 20 %, label 40 %. Use 20 % for the unlock and 40 % for the quest.
- **`HasUnlockedEquipment 301` gating of RV boosts:** "rented once" vs "unlocked in shop".
- **Cell ordering inside ore groups and the origin of world coordinates.** Both are visually irrelevant; an arbitrary origin is used.
- **Whether workers also carry ingots to the SELL pad.** Their state machine only lists drop-item → furnace, so assume they do not.
- **Prefab visuals and sizes** of buildings beyond their cell footprints (not extracted, by design).

## 14. Files

- **`src/data/orig/stage1.json`, `stage2.json`, `onboarding.json`.** Each holds:
  - id, name, mode, difficulty, contract type, key ore, max workers, cashTarget
  - `clear` (rule, reward, cashback)
  - rent and ore-HP multipliers
  - grid and coordinate notes
  - totals: the original counts and the resolved blocks by ore, plus potential income
  - `areas`: ground, home and obstacle 4 × 4 rects
  - `buildings`, `structures` (with expansion / unlock and rail waypoints), `cafeteria`, `spawns`, `props`
  - `oreGroups` (weights, generated flag) and `blocks` `[{x, z, ore}]`
- **`src/data/orig/economy.json`.** Currencies, ores, oil, stage and item multipliers, equipment, statUpgrades (100 levels), statConstants, gameplayConstants, buildings, structures, workers, quests (groups 1, 2, 1000), onboardingSequence, rewards, rvBoosts, management (floors and tree nodes), xpLevels (Lost Mine only), remoteConfigRelevant.
- **Decoder scripts** (scratch, not in the repo): `…/scratchpad/apktest/work/decode/`. Includes `meta.py` (il2cpp enums and fields), `allconsts.py`, `methods.py`, `mts_parse.py` (MapToolSettings) and `build_outputs.py`.
