# Bulldozer Master: Crush & Mine — original flow & UI spec (stage 1 → stage 2)

> **Internal design reference only.** This describes the original game (Supercent) as seen in public gameplay videos, so we can rebuild its core loop in a Three.js prototype. Texts are quoted verbatim so the prototype can use them as placeholders; replace them before anything ships.
> Numbers decoded from the APK (HP, prices, upgrade curves, quest chain, rewards) live in **[ORIGINAL_DATA.md](ORIGINAL_DATA.md)**. This document covers **what the player sees and does, in order**, and cross-checks the data where the videos show it.
> Reference frames: [`ref/`](ref/). Every `![..](ref/..)` below is a real frame from the videos.

**Confidence tags:** **SEEN** = on screen in at least one video · **DATA** = from ORIGINAL_DATA.md · **INFERRED** = deduced, not shown · **UNSURE** = conflicting or partly visible.

---

## 0. Sources and build differences

| tag | video (YouTube id) | upload | device / build | covers |
|---|---|---|---|---|
| **ST** | STANY "Gameplay Walkthrough Part 1 - Tutorial" (VRtwaZx-4Fc), 21:20 | 2026-09-27 | Android phone, **portrait**, **build 11.0.0** (seen in Settings) | Fresh install. Full tutorial 0:00 → shop, wheelbarrow rental. The player never buys the Sledgehammer, so the quest chain stalls. Stage 1 3.5 % at the end. |
| **P1** | Pryszard "Part 1" (ovlJLqLo9I8), 21:24 | 2026-08-03 | iPad, landscape, **older build** | Fresh save. Tutorial (opening line cut), Sledgehammer, wheelbarrow, minecart, Hydraulic Breaker, fuel, boosts, IAP shop intro. Stage 1 0 → 16 %. |
| **P2** | Pryszard "Part 2" (ZvYnKFfRzRo), 18:15 | 2026-09-17 | same save as P1 | Stage 1 16 → 41 %: workers, more vehicles, layers. See §3.10. |
| **P3** | Pryszard "Part 3 - Stage 1 Completed" (GiQcNPhPdTU), 24:26 | 2026-09-29 | iPad, **new save**, newer build | Starts again at 0.7 % with **gems 470 and a big heavy loader already at the base**. INFERRED: the Founder's Pack "Rent-Free Hybrid Dozer" IAP. Stage 1 → 80 % in 22.5 min, **stage clear, HQ, contract, Stage 2 start**. |
| **GV** | GameVe "DAY 18 STAGE 2 UNLOCKED" (STXVuFNxgeg), 5:15 | – | phone, portrait | Contract details and the Stage 2 HUD of a free-to-play save (cross-check). |
| – | JuniorForGaming "Tutorial & Highlight" (8lnWgp9CkCI), first 3 min | 2026-08-13 | landscape, older build | Mid stage 1 with wheel loader + minecart. Bottom-right button reads "LIGHT TECH" (older name). Used for cross-checks only. |

**Differences between builds** (the prototype should follow the **newer** one, i.e. ST/P3):

| item | older build (P1, Aug 2026) | newer build (ST 11.0.0 / P3, Sep 2026) |
|---|---|---|
| shop building sign / quest text | "MACHINERY SHOP" / "Go to Machinery" | "MACHINERY CENTER" / "Go to Machinery Center" |
| "Go to Upgrade" reward | 2 cash | **40 cash** (= DATA) |
| Player Move Speed first upgrade price | 10 | **366** (= DATA) |
| Worker building lock label | "BREAK 40% ORE" | **"BREAK 20% ORE"** (= DATA 20 %) |
| cargo label | "CARGO (4/5)" | "CARGO [4/5]" |
| bottom-right button | "LIGHT TECH" (8lnW) / "LIGHT EQUIPMENT" (P1) | "LIGHT EQUIPMENT" |
| Machinery Center before quest 1008 | always open | locked: padlock + **"UNLOCKS AFTER QUEST CLEAR"** |

**Not seen anywhere:** app start, splash or loading screens, title screen, name entry and consent dialogs. Every channel cuts straight to gameplay, and DATA says the first session starts directly in stage 1. The prototype can open on a minimal loading screen, then go straight into stage 1 with Hank's first line.

---

## 1. First launch → tutorial

### 1.1 Presentation rules used by every tutorial step

- **Dialogue box** (SEEN, `ref/01`):
  - Bottom ~30 % of the screen becomes a black gradient panel and the world behind dims ~40 %.
  - Foreman Hank's portrait (hard hat, blue plaid shirt, arms crossed) stands at the left, overlapping the panel top.
  - Then a thin **yellow vertical bar**, the name **"Foreman Hank"** in bold yellow, and the line in white below it, 1–2 lines.
  - The text types on at ~40 chars/s. A small white **▶** appears at the right when it is complete.
  - **Tap anywhere** to advance. Each line stays ~1–3 s in the videos.
  - Gameplay pauses while the box is open (INFERRED: the player never moves during a line).
- **Quest card** (top-left): exactly one active quest. It completes by itself; there is no claim button.
  - On completion the card is replaced for ~1 s by a bright green pill **"✔ COMPLETE!"** (`ref/04`).
  - The reward icons (green bill bundles or pink gems) burst out of it and fly in arcs to the matching top-right counter, which rolls up.
  - The next quest card then slides in.
- **Guide pointers:**
  1. **Green chevron trail.** Small bright-green triangles lie flat on the ground every ~1 m and point from the player to the target. They animate (march) toward it and redraw as the player moves (`ref/02`, `ref/06`).
  2. **Green "!" marker.** A green inverted triangle with a white "!" floats and bobs above the target building (UPGRADE, MACHINERY CENTER, WORKER).
  3. **Camera directing.** At the start of some quests the camera glides to the target (~1 s), holds ~1–2 s, and glides back. DATA lists `GuideType` CameraDirecting vs ToastMessage per quest.
  4. **Spotlight.** The whole screen dims except a circle or rect around one button (mount pin, dismount button, LIGHT EQUIPMENT button). Only that button can be tapped (`ref/19`, `ref/20`).
- **Toasts.** Small dark rounded tooltips near the quest card, e.g. "Gem / Rare and precious gemstone" the first time a new resource is collected. Or floating text over a building, e.g. "Keep playing to unlock workers!" when standing at the locked Worker building (`ref/21`).

### 1.2 Step-by-step tutorial

Times are video time (mm:ss). ST = new build, P1 = older build. Quest ids and rewards match DATA §7.1 exactly; the only difference is the older build's 2-cash "Go to Upgrade".

| # | trigger | on-screen text (verbatim) | pointer / camera | what the player must do | result / unlock | ST | P1 |
|---|---|---|---|---|---|---|---|
| 1 | game start, player at base facing the quarry | Hank: **"Well, look who finally showed up! Ready to smash some rocks?"** | none | tap | box closes | 0:00–0:04 | (cut) |
| 2 | quest **"Break Ores" 0/1** (reward 💵2) | – | chevrons from the player to the nearest block at the quarry edge (an orange copper block in ST) | walk into a block; the pickaxe swings by itself | first block breaks (ST 0:22.6, a grey stone next to the copper) → COMPLETE, cash 0→2 | 0:04–0:23 | 0:06–0:07 |
| 3 | quest **"Collect Minerals" 0/5** (💵2) | (DATA toast "Collect Minerals!", not readable in the videos) | none | keep mining; chunks fly onto the carrier by themselves | cargo 5/5 → the label turns into a red **MAX** pill → COMPLETE | 0:23–0:30 | 0:08–0:28 |
| 4 | cargo full (DATA onboarding 101 ends) | Hank: **"Nice haul! Can't sell 'em raw though — head to the furnace and start smelting!"** | camera glides to the furnace; chevrons to the **REFINING** pad | – | – | 0:30–0:34 | 0:44–0:49 |
| 5 | quest **"Deliver Minerals to the Furnace" 0/5** (💵2) | – | chevrons → REFINING pad | stand on the REFINING pad | chunks hop off the carrier one by one; "LOAD: n" counts; the furnace starts → COMPLETE | 0:34–0:37 | 0:49–0:54 |
| 6 | quest **"Sell Ingots" 0/3** (💎2) | – | chevrons: furnace output tray → **SELL** pad by the road | walk over the output tray (ingots auto-pick), then stand on SELL | ingots hop onto the blue truck ("1/4"…"4/4"); the truck drives off; a cash pile appears → COMPLETE, gems 0→2 | 0:37–0:45 | 0:53–1:15 |
| 7 | after the quest | Hank: **"You've saved enough — time to upgrade! Better gear makes everything easier."** | camera pans to the **UPGRADE** building (green "!" marker); chevrons SELL → **OPEN** pad | walk over the cash pile (bills fly to the HUD), then go to OPEN | – | 0:46–0:55 | 1:16–1:26 |
| 8 | quest **"Go to Upgrade" 0/1** (💵40; older build 💵2) | – | – | stand on the OPEN pad | **UPGRADE panel** slides up → COMPLETE | 0:55–0:56 | 1:26 |
| 9 | quest **"Upgrade at Quarry" 0/3** (💎1) | Wooden Carrier row has a red **"Recommended"** ribbon | – | buy 3 upgrades (ST: Pickaxe 10, Pickaxe 12, Carrier 12…) | COMPLETE after the 3rd buy; the panel stays open until X | 0:56–1:04 | 1:27–1:32 |
| 10 | quest **"Break Rocky Ores" 0/3** (💵5) | – | camera: a rock block | break 3 grey (limestone) blocks | COMPLETE | 1:04–~3:00 | 1:33–2:35 |
| 11 | quest **"Hold 250 or more Cash" x/250** (💎1) | (DATA toast "Save Cash for Better Equipment!") | none | keep selling until cash ≥ 250 | COMPLETE. ST: MACHINERY CENTER unlocks; before this it shows a padlock + "UNLOCKS AFTER QUEST CLEAR" (`ref/11`) | ~3:00–4:08 | 2:35–4:20 |
| 12 | after the quest | Hank: **"You've got enough for new gear! Let's go shopping!"** | green "!" over MACHINERY CENTER; chevrons → **ENTER** pad (`ref/12`) | – | – | 4:09–4:11 | 4:20–4:23 |
| 13 | quest **"Go to Machinery Center" 0/1** (💵7) | – | – | stand on ENTER | quick fade → shop interior → COMPLETE | 4:11–4:18 | 4:23–4:36 |
| 14 | inside the shop | Hank: **"Buy light equipment or rent heavy equipment here."** (`ref/13`) | camera pans across all the shop shelves (~4 s, `ref/15`), then back to the player | – | – | 4:18–4:26 | 4:36–4:42 |
| 15 | quest **"Purchase Sledgehammer" 0/1** (💎2) | item card "Sledgehammer / It's hammer time! / ★★ / Swing it like you mean it! / 250" | camera directing on the shop | stand at the Sledgehammer pedestal ($250) and buy | plate → "SOLD OUT" → COMPLETE | (ST never bought it; the quest stays to the end of the video) | 4:38–4:46 |
| 16 | first hand tool bought | Hank: **"Nice, you got light equipment! Once it's yours, it's yours forever."** → **"Check your equipment inventory in the bottom menu to equip or unequip as needed."** | **spotlight** on the bottom-right **LIGHT EQUIPMENT** button | tap it | **INVENTORY** opens (`ref/24`); the player closes it with X | – | 4:46–4:58 |
| 17 | quests 1011–1014 | "Break Ores" 0/20 (💵10) → "Deliver Minerals to the Furnace" 0/50 (💵15) → "Hold 300 or more Cash" (💎1) → "Go to Machinery Center" (💵20) | camera directing per DATA | free play | – | – | 4:58–11:25 |
| 18 | quest **"Rent Wheelbarrow"** (💎2) | card "Wheelbarrow [Rent] / Helps carry materials! / ★ / Load it up and roll out! / 300" (`ref/16`) | – | rent the Wheelbarrow, $300 | plate "SOLD OUT / Check out the base camp." | ST 5:34 (rented early, before the quest) | 6:36 (also early); quest auto-completes at 11:26 |
| 19 | first rental | Hank: **"Nice, you rented heavy equipment! Yours for this stage — rent again next time."** (`ref/17`) | – | tap | ⚠ the real **Google Play in-app review sheet** pops up here in both builds ("Not now" / "Submit"); skip it in the prototype | 5:36–5:38 | 6:38–6:40 |
| 20 | – | Hank: **"Your equipment should be at base camp by now. Go check it out!"** | – | walk out through the shop's ENTER pad | outside: the vehicle **drops onto a spawn slot by the shop with a dust puff + confetti** (`ref/18`) | 5:42–5:48 | 6:42–6:43 |
| 21 | quest **"Mount Wheelbarrow" 0/1** (💵25) | – | a green round map-pin with a white steering-wheel icon floats over the vehicle; **spotlight** on it (`ref/19`) | walk into it or tap it | mounted; CARGO label switches to the vehicle's "[0/25]" | 5:55–5:57 | 6:49–6:50 |
| 22 | first mount | Hank: **"Well, well! You mounted the heavy equipment! Good work."** → **"Getting off is just as easy — hit the dismount button."** (**spotlight** on the red round dismount button with a white exit-arrow, under the vehicle, `ref/20`) → **"One catch — the dismount button only appears when fully stopped."** → **"Safety first! Make sure you're fully stopped before dismounting. Every time!"** | spotlight | tap through | tutorial chain ends; from here on it is quests only | 5:57–6:10 | 6:51–6:57 |

**Tutorial length:** core loop taught by **0:56** (first upgrade panel); shop and first vehicle by **~6:10** (ST) / **~7:00** (P1). After that the guide is just the quest card plus event dialogues (§3.11).

### 1.3 Later one-off dialogues (event-triggered, in order of appearance)

| when | lines (verbatim) | seen |
|---|---|---|
| minecart found in the quarry | pad "ACTIVATE / FREE" in front of it (no dialogue) | P1 7:33 |
| first fuel vehicle rented → Oil Station unlocks | **"Grab the fuel from the tank, then dump the rest in the waste oil bin here."** | P3 0:17 |
| first IAP-shop unlock (older build, after the Hydraulic Breaker rental) | **"Hey, the Shop's open! They sent over a welcome gift!"** (an ad-skip-ticket card flies to a new HUD row) → **"Grab more at the Shop anytime. Handy, right?"** → **"Alright, let's swing by the Shop!"** → (IAP shop opens) **"Welcome to the Shop! You'll find all kinds of useful items here!"** → **"Take your time! Oh, and grab your Daily Offer to celebrate the opening!"** | P1 13:53–14:08 |
| fuel tank empty | **"Uh oh, out of fuel. It'll barely move without gas."** → **"Till you rent a Fuel Truck, grab fuel barrels from base manually. Go fill it up!"** (`ref/27`) | P1 15:20, P3 7:00 |
| worker hiring unlocks (20 % in DATA) | **"Getting tough solo, huh? Let's hire some workers!"** → **"Applications come in from time to time. Keep an eye out — they won't wait forever!"** → **"I pulled some strings — cost is covered. Just sign!"** → (Job Board) → **"Done here? Swing by the Worker Management building — I'll show you around!"** | P3 5:55–6:06 |
| Worker Management first visit | **"Best part? Your workers can use your light equipment! Let me show you."** → **"They start with basic gear — just assign yours to the slot and they'll get right to work!"** → **"Free slot? Hit Equip. In use? Exchange it. Take it back anytime you need it!"** → **"Not much gear now, but this'll come in handy later. Let's get back to work!"** | P3 6:43–6:48 |
| break area (cafeteria) | **"See the break area next door? Workers rest there when their stamina runs out."** → **"Big crew? Consider expanding the area — not enough seats and most won't get proper rest."** | P3 7:58–8:02 |
| stage 1 ≥ 60 % (company opens) | Secretary **Sofia** (purple hair, glasses; same box layout): **"Quarry's running smooth! I'm Sofia, your new Secretary."** → **"Sorry to interrupt. Come back to HQ when you're done. I'll be waiting."**; tapping the company button then shows the toast **"Unlocks after this stage!"** | P3 17:06–17:18 |
| stage progress ≥ 80 % | see §5 | P3 22:29 |

### 1.4 Camera

- **Fixed-angle 3/4 top-down perspective** looking "north" into the quarry. SEEN pitch ≈ 55–60° from horizontal; no yaw, no player rotation of the camera.
  - The base is at the bottom (south), with the road and trucks at the very bottom. The quarry field extends north.
  - The field is a raised plateau of cubes on a cliff above the sea (the ocean is visible at the field's sides later on, `ref/31`).
- **Follow:** the camera smoothly follows the player (slight lag), keeping the player at ~45–50 % of the screen height. When mounted, it follows the vehicle.
  - Portrait (phone) shows roughly 5 blocks across; landscape (iPad) roughly 10–12 blocks across at the same distance. The prototype should keep the same vertical framing and let the width vary.
- **UNSURE:** the camera may pull back a little while driving the big heavy vehicles (P3 frames look wider than the on-foot frames), but no animated zoom was isolated.
- **Camera directing** (quest start, §1.1): glide to the target, ~1–2 s hold, glide back. ST 0:50 pans to UPGRADE; P1 0:47 pans to the furnace; 4:22 pans across the whole shop interior.
- **Vehicle delivery:** after renting, the next time the player is outside, the vehicle is shown dropping in at the base (ST: seen on exit). P1 13:45: a short **cutscene** fades to black, shows the base with the excavator appearing with a sparkle, then fades back into the shop.
- **Building transitions:** ENTER on the Machinery Center does a ~0.5 s fade to black → interior (same camera rig, grey floor). The ENTER pad inside the door leads back out.
- **No zoom-out on unlocks** was seen for stage 1. Unlocks are shown by camera directing to the object, not by zooming out. The only "reveal" shots are the HQ tower scroll (§5).

---

## 2. Controls

| action | how it works (SEEN unless tagged) |
|---|---|
| **Move** | Drag anywhere; **no joystick graphic is ever drawn** (ST, P1, P3). INFERRED: invisible floating joystick, where the touch-down point is the centre and the drag direction sets heading at full speed. The character turns to face the move direction. Base move speed 6 u/s (DATA). |
| **Mine** | Automatic. Walking into or stopping next to a block (range 1.5, DATA) makes the pickaxe swing at it on a timer (pickaxe 1.0 s/swing, sledgehammer 1.5 s, DATA). There is no button. Moving away stops it. |
| **Pick up chunks** | Automatic. Chunks that drop within the absorb range (carrier 2, wheelbarrow 3, vehicles 5, DATA) **fly in an arc onto the carrier on the player's back** and stack as a visible column. Ingots on the furnace tray and oil barrels on the oil pad are picked up the same way by walking over them. |
| **Carry limit** | `CARGO [x/y]` pill under the player. At y it becomes a red **"MAX"** pill and pickup stops; chunks stay on the ground and can be collected later. |
| **Pads** (ENTER, OPEN, REFINING, SELL, DUMP OIL, ACTIVATE FREE) | Rounded-square white outline on the ground with a bold white italic label; counter text under it ("LOAD: 0"). **Step on it to trigger it.** Buildings react in ~0.3–0.5 s. **No progress ring was seen in any video.** Transfer pads (REFINING, SELL, DUMP OIL) move **one item at a time** from the cargo for as long as the player stands on them (DATA: 0.2 s per item). |
| **Buy upgrades** | Tap the green price button in the UPGRADE panel. Instant (DATA: research time 0). Close with the red round X. |
| **Buy / rent equipment** | In the shop, walking to the item's floor plate pops its **item card** above the item, and the purchase follows ~0.8 s later. **UNSURE** whether that is a tap on the card's green price button or automatic. Recommended prototype behaviour: card appears when standing on the plate; tap the price button to buy. |
| **Mount a vehicle** | A green map-pin with a white steering-wheel icon floats above every unmounted owned vehicle. Walk into the vehicle or tap the pin. |
| **Dismount** | A red round button with a white exit icon appears under/next to the vehicle **only when the vehicle is fully stopped**. Tap it. Mining, refining and selling happen on foot or with the vehicle's own cargo. |
| **Collect cash** | Walk near the cash pile by the SELL pad. Bills fly to the player, then to the HUD counter. |
| **Minecart** | Walk next to the cart to transfer the cargo into it. Tap the green **▶** pin above it to send it (§3.9). |
| **UI buttons** | ⚙ top-left (Settings); 2nd icon top-left (UNSURE: camera/view toggle; DATA lists a "Camera" HUD element); bottom-right **LIGHT EQUIPMENT** (inventory); later **SHOP** (IAP) and **COMPANY** (HQ, stage 2). |

---

## 3. Core loop in detail

### 3.1 Blocks and mining

- **Field:** a grid of 2.5 m cubes (DATA cell size), all the same height, laid out as a long plateau north of the base. Ore types are mixed in bands (`ref/02`, `ref/31`):
  - **Front:** grey **limestone** with orange/green-speckled **copper**, blue-grey **iron** with cyan crystal knobs, and white/silver ore.
  - **Deeper:** pale yellow **sandstone** with **gold** nuggets and big orange gold blocks.
  - **Far end:** dense **purple amethyst** crystals.
  - Gems (cyan crystal "Gem" blocks) show a tooltip "Gem / Rare and precious gemstone" the first time.
  - The mined-out floor is brown dirt. Stage 2 is beige sandstone with rust-red copper and **green emerald** blocks (`ref/39`).
- **Hits per block:** HP ÷ mining power (DATA HP: limestone 50, copper 150, iron 400, silver 800, gold 1000, amethyst 1000, diamond 2500; pickaxe power 10 at Lv 0). SEEN:
  - First copper block at Lv-1 pickaxe ≈ 12–15 swings (~15 s).
  - A silver/metal block took ~45 s with a lightly upgraded pickaxe (ST 16:25–17:15).
  - The blue-crystal iron block did not break after ~35 s at pickaxe Lv 5 (P1 1:44–2:20).
  - The sledgehammer breaks plain stone in about one swing and visibly faster everywhere. The Hydraulic Breaker breaks blocks every ~0.5 s, several at once.
- **Crack stages** (`ref/03`):
  - Dark crack lines spread across the block's top face from the hit side, getting denser in roughly **3–4 visible steps**.
  - Each 25 % of HP lost drops 1 chunk: 4 chunks while being damaged + 2 on destruction = 6 (DATA).
  - Every hit shows small white/orange sparks and chips.
- **Break** (`ref/05`):
  - The block splits into **4–6 large slab pieces** in the block's colour that tumble outward with physics and fade within ~1 s.
  - The **mineral chunks** are small irregular lumps in the ore's colour (grey, orange, cyan, gold, purple). They pop up and **fly straight to the carrier** if there is room; otherwise they land and stay on the ground.
- **Neighbour blocks** also show cracks from side hits (UNSURE whether splash damage exists; DATA trait "Fracturer" suggests multi-block hits for some workers and tools).

### 3.2 Carrying

- Starter **Wooden Carrier**: a wooden frame on the back, capacity 5 (DATA). The chunks stack in one tall column behind the player's head, and the column grows visibly with each item (`ref/06`).
- With the upgrades seen: 9 (P1 1:40), 11 (ST 3:00); stage 2 104 → 130 after research (P3).
- Vehicles have **their own cargo**: wheelbarrow 25, wheel loader 35, dump truck 70, minecart 100 (DATA). While mounted the label shows the vehicle cargo. When the player re-mounts, hand cargo is transferred into the vehicle (ST 7:04: walked up with chunks, mounted, label "5/25").
- **Home indicator** under the cargo pill: a white house icon + distance "28m" + a small white arrow pointing toward the base. It is shown whenever the player is away from the base.

### 3.3 Furnace / refining (`ref/07`)

- Building: a grey industrial furnace with chimneys (smoke puffs), a glowing orange mouth and a hopper on top. A white **REFINING** pad sits on its left, with "LOAD: n" under it.
- Standing on the pad, the chunks hop from the carrier onto the pad one by one (stacked as a pile on the pad). The furnace pulls them in **one at a time**.
  - A small **orange progress bar with the remaining seconds** ("0.3", "0.8") floats above the furnace (~1–3.4 s per item depending on ore, DATA).
- Each smelted item slides down a chute as an **ingot** (a coloured bar) onto the **output tray** in front, which shows its own "LOAD: n". Stacks there can grow huge (P1 "LOAD: 322").
- The player picks ingots up by walking over the tray. Workers (carriers) can also feed the furnace (§3.10).

### 3.4 Selling (`ref/08`, `ref/22`)

- The **SELL** pad sits next to the road at the bottom of the base, with "LOAD: n" under it. A **price sign** stands beside it showing the ingot icon → price:
  - 10$ grey/white, 12$ cream, 20$ orange (copper), 25$ light blue (iron)
  - 30$ purple-grey, 45$ silver, 60$ gold, 80$ orange-black (amber)
  - 100$ purple (amethyst), 300$ diamond
  - These match the DATA ingot prices.
- **Blue flatbed trucks** queue on the road. The front truck parks at the pad with a big white outlined counter **"0/4"** over its cab. The capacity is random within the Sales Trucks range (Lv 1: 2–5; SEEN 0/2…0/6).
  - Ingots hop from the pad/cargo into the truck bed and stack visibly.
  - When full, the truck drives off to the right, a **pile of green cash bundles** appears on the ground beside the pad, and the next truck pulls in ("0/5").
  - Ingots left over wait on the pad (LOAD: 1) for the next truck.
- **Raw chunks cannot be sold.** Standing on SELL with raw stone does nothing (P1 0:16).
- **Stage progress rises when ingots are sold** (DATA formula: sold / total drops). SEEN: the bar stalls while the player is at the base doing upgrades.

### 3.5 Upgrade building and panel (`ref/09`)

- Building: a white/black boxy machine with a vent stack and "UPGRADE" lettering, a green "!" marker when the quest points there, and an **OPEN** pad in front.
- **Panel** (slides up from the bottom; covers the lower ~65 % in portrait, nearly full in landscape; the world above is dimmed):
  - Header: full-width **yellow/orange metal plate** with a bolt at each end, black bold **"UPGRADE"**, and a **red round X** at the right (portrait) or top-centre (landscape).
  - Note line: ⚠ yellow triangle + **"Equipped & rented items shown first."**
  - A scrolling list of **light-grey cards**. Each card has:
    - an item render on the left;
    - a small round badge at the top-left of the render: green ⏩ = speed stat, red ⬆ = power, yellow box = capacity;
    - a bold black name and a grey stat subtitle;
    - two lines **"Lv.1 ➤ Lv.2"** / **"+10 ➤ +10.4"**, current values in black and next values in yellow;
    - a big button on the right: **green with a cash icon and white price** when affordable, **grey with a red price** when not;
    - optionally a red **"Recommended"** ribbon at the top-right corner of the card.
  - Buying: a white shine sweeps across the card and the numbers pop; quest counters update immediately.
- **Rows seen in stage 1** (new build, ST 0:57; prices = DATA curve):

  | row | subtitle | Lv.1 ➤ Lv.2 values | first prices seen |
  |---|---|---|---|
  | Player | Move Speed | +6 ➤ +6.05 | 366 |
  | Pickaxe | Mining Power | +10 ➤ +10.4 | 10, 12, 15, 18, 21 … (Lv.8 ➤ 9 = 36, Lv.11 ➤ 12 = 62) |
  | Wooden Carrier | Cargo Capacity | +5 ➤ +6 | 12, 15, 18, 21 … (Lv.7 ➤ 8 = 36) |
  | Furnace | Processing Speed | +1 ➤ +1.25 | 275, then 329 |
  | Sales Trucks | Sales Capacity | 2~5 ➤ 2~6 | 275, then 329 |
  | Wheelbarrow (after renting it) | Cargo Capacity | +25 ➤ +26 | 50, then 60 |
  | Sledgehammer / Hydraulic Breaker / Wheel Loader … | Mining Power / Move Speed / Fuel Eff. / Cargo | DATA §4 | appear once owned or rented |

  - **Row order:** the equipped tool and rented items come first ("Equipped & rented items shown first.").
  - P3: an un-equipped Pickaxe row shows **"Equip First"** instead of a price.
  - Older build order: Furnace, Sales Trucks, Pickaxe, Wooden Carrier, Player.

### 3.6 Machinery Center (shop) (`ref/12`–`ref/17`)

- **Outside:** a yellow shipping-container building, sign **"MACHINERY CENTER"**, with an **ENTER** pad in front. It is locked (padlock + "UNLOCKS AFTER QUEST CLEAR") until quest 1008 "Hold 250 or more Cash" completes.
- **Inside:** a grey concrete hall with a wooden back wall and a big white **"SHOP"** sign. The ENTER pad inside the door is the exit.
  - An ATM at the left (red LED "ATM CLOSED"; DATA: free-cash rewarded ad from stage 2).
  - **Back row = heavy equipment (rent, this stage only):**
    - Wheelbarrow **$ 300** (red **"RECOMMENDED"** banner)
    - Excavator with hydraulic breaker **$ 2.5K**
    - Locked crates: wheel loader **$ 1.5K**, then $ 6.5K, $ 6.5K, $ 25K, $ 27.5K …
  - **Front yellow counters = light equipment (buy, permanent):**
    - Sledgehammer on a pedestal **$ 250**
    - Crates **$ 5K** (Jackhammer), **$ 15K**, **$ 30K** …
    - "COMING SOON" slots
  - Locked items are wooden **FRAGILE crates** with a padlock and a stencilled vehicle silhouette. The price strip on the floor is dark grey with yellow "$ 6.5K" text.
- **Item card** (pops above the item when the player stands at its plate):
  - Dark translucent card; blue **"Rent"** tag at the top-left for heavy equipment; ⓘ at the top-right.
  - White bold name, yellow subtitle, **5 stars** (filled yellow / empty grey), a render, a white flavour line.
  - Bottom: **green price button** (affordable) / **grey** (not) / **red lock text** (e.g. "First, Buy Wheelbarrow", "First, Reach Stage 2").

  | item | subtitle | stars | flavour | price / state |
  |---|---|---|---|---|
  | Sledgehammer | It's hammer time! | ★★ | Swing it like you mean it! | 250 |
  | Jackhammer | Breaks rocks super fast! | ★★★ | No rock stands a chance! | "First, Reach Stage 2" |
  | Large Hand Drill | Heavy-duty rock breaker! | ★★★★ | Bores through the toughest rock! | "First, Reach Stage 3" |
  | Wheelbarrow [Rent] | Helps carry materials! | ★ | Load it up and roll out! | 300 |
  | Hydraulic Breaker [Rent] | Hydraulic rock breaking! | ★★ | Pressure-powered precision! | 2.5K |
  | Wheel Loader [Rent] | Powers through any haul! | ★★ | Hauls more so you work less! | 1.5K, or "First, Buy Wheelbarrow" |

- **After buying:** the floor plate turns grey with the item icon and **"SOLD OUT"**; rentals add **"Check out the base camp."** The rented vehicle appears on a base spawn slot.

### 3.7 Vehicles

- **Wheelbarrow** (rent $300, no fuel):
  - A yellow barrow the player pushes; cargo 25. It **cannot mine**.
  - Loop SEEN (ST 6:40–7:10): park next to the ore → dismount → mine on foot (hand cargo fills) → walk back and mount (hand cargo moves into the barrow) → drive to REFINING.
  - While parked away from the player, an **in-world distance tag** with a yellow arrow ("6m") points to it.
- **Hydraulic Breaker** (yellow excavator #95, rent $2.5K, fuel):
  - Mining vehicle: the hammer arm smashes blocks very fast and chunks spray over the floor. It carries nothing (cargo 0), so the player dismounts to collect or uses the minecart (P1 14:11–15:20).
  - An **orange "OIL" bar** floats above it and empties as it works. Treads leave marks on the dirt (`ref/26`).
- **Wheel Loader** (rent $1.5K after the Wheelbarrow; cargo 35, fuel): pushes and scoops chunks with its bucket and shows "MAX" when full (8lnW, P3).
- **Heavy loader / "Hybrid Dozer"** (P3; INFERRED IAP from the Founder's Pack "Rent-Free Hybrid Dozer!"): a big yellow loader that both crushes blocks and carries. It is why P3 progresses so fast.
- **Mount / dismount** rules (§2). The red dismount button only appears when the vehicle is fully stopped.
- **HUD tab:** after the first rental, a white square tab with a loader icon, a red dot and a "◂" arrow sits on the **right screen edge**, with a yellow **"i"** button below it.
  - Neither was opened in any video. INFERRED: a vehicle list / locate shortcut and "vehicle info" (DATA HUD list has "VehicleMount" and "VehicleInfo").

### 3.8 Oil / fuel (`ref/27`, `ref/28`)

- **Oil Station:** a white fuel-pump kiosk labelled "OIL". It is locked (padlock + **"RENT / FUEL-POWERED / EQUIPMENT"**) until the first fuel vehicle is rented.
  - Then it produces orange **oil barrels** onto a 3×3 pad beside it (max 9, DATA).
  - A waste bin with a **"DUMP OIL"** pad sits next to it ("LOAD: n"). Extra barrels can be dumped there (Hank: "…dump the rest in the waste oil bin here.").
- **Refuel:** walk over the barrels (they stack on the carrier: "CARGO 5/9"), walk to the vehicle, and the barrels fly into it. The OIL bar refills (P1 15:47–15:55). DATA: 1 barrel = 5 fuel, tank 30–36.
- **Empty tank:** the OIL bar goes dark, the vehicle crawls (×0.05 speed), and Hank's two lines play. A green chevron trail then leads back to the base.

### 3.9 Minecart and rails (`ref/25`)

- A rusty **minecart** sits in a pit deep in the quarry, revealed when the surrounding blocks are mined. In front of it is a pad **"ACTIVATE / FREE"** (the first cart is free; the next carts are rewarded-ad pads, DATA).
- Standing on the pad activates it: a **rail track** appears, running along the field's east edge down to the base. The cart shows "CARGO [0/100]".
- Walking next to the cart pours the carried chunks into it; they pile up as tall columns.
- **Send:** tap the green round **▶** pin above the cart. The cart rolls along the rail (~2.5 s) to a white-outlined unload square (Ore Storage) next to the furnace, tips over and dumps its load there. The player or carrier workers pick it up from there.
- UNSURE: whether it returns to the quarry automatically (P1 saw it waiting at the base end; DATA says it moves back).

### 3.10 Workers

- **WORKER building:** a blue dome with "WORKER" lettering and a padlock. Locked label **"BREAK 20% ORE"** (new build), plus the floating hint "Keep playing to unlock workers!" (`ref/21`).
- **Unlock** (P3 5:55 at ~19–20 %): Hank's hiring lines (§1.3), then the **Job Board** popup.
- **Job Board** ("Job Board [2/2]"):
  - Applicant cards: portrait, name, ROLE (Mining / Carrying), TRAIT (e.g. "Heavy Lifter", "Fracturer"), stats DMG / SPD / CAP / STA, and the buttons **DECLINE** / **HIRE**.
  - The first hire is free ("cost is covered"); later hires cost cash (red price).
  - "Hired for this stage only. Declined applicants may return." "Hired Workers: 0/4" (stage 2).
  - A "NEW candidate" HUD icon with a countdown (e.g. "116s") shows when the next batch arrives.
- **WORKER MANAGEMENT** screen: a list of hired workers (e.g. Earl Johnson with a carrier, Roy Miller with a pickaxe), each with an equipment slot, plus **"HIRE MORE WORKERS!"** and **"Check Applications"**. Empty state: "No applications right now. Please check back later."
- **Behaviour:** mining workers auto-mine blocks; carrying workers bring dropped chunks to the furnace. Stamina runs out → they walk to the **break area** (red PIZZA truck + picnic tables) to rest (DATA 50 s).
- **Result screen:** the stage-clear panel lists the "Top 4 Workers" with Mining % / Hauling % (§5).

### 3.11 Quest card sequence (stage 1 → 2)

The full chain with ids and rewards is DATA §7.1. The video timestamps confirm it, in order:

| # | card text (verbatim) | reward | P1 (F2P, older build) | P3 (fast save) |
|---|---|---|---|---|
| 1 | Break Ores 0/1 | 💵2 | 0:06 | – (started at #2) |
| 2 | Collect Minerals 0/5 | 💵2 | 0:08 | 0:00 |
| 3 | Deliver Minerals to the Furnace 0/5 | 💵2 | 0:29 | 0:30 |
| 4 | Sell Ingots 0/3 | 💎2 | 0:53 | 0:55 |
| 5 | Go to Upgrade 0/1 | 💵40 (older build 💵2) | 1:16 | 2:45 |
| 6 | Upgrade at Quarry 0/3 | 💎1 | 1:27 | 2:55 |
| 7 | Break Rocky Ores 0/3 | 💵5 | 1:33 | 3:00 |
| 8 | Hold 250 or more Cash | 💎1 | 2:35 | (skipped, already rich) |
| 9 | Go to Machinery Center 0/1 | 💵7 | 4:23 | 3:35 |
| 10 | Purchase Sledgehammer 0/1 | 💎2 | 4:38 | 3:55 |
| 11 | Break Ores 0/20 | 💵10 | 4:47 | 7:20 |
| 12 | Deliver Minerals to the Furnace 0/50 | 💵15 | 7:29 | 8:20 |
| 13 | Hold 300 or more Cash | 💎1 | (skipped) | 8:51 |
| 14 | Go to Machinery Center 0/1 | 💵20 | 8:56 | 8:53 |
| 15 | Rent Wheelbarrow | 💎2 | 11:26 (instant) | (instant) |
| 16 | Mount Wheelbarrow 0/1 | 💵25 | 11:27–15:35 | 10:10 |
| 17 | Deliver Minerals to the Furnace 0/100 | 💵25 | 15:35 | – |
| 18 | Sell Ingots 0/50 | 💵30 | 18:32 | 10:25 |
| 19 | Upgrade at Quarry 0/5 | 💎1 | 20:05 → P2 | 10:30 |
| 20–21 | Hold 2500 or more Cash / Rent Any Heavy Equipment | 💵35 / 💎3 | P2 | – |
| 22 | Mount Any Heavy Equipment 0/1 | 💵40 | P2 | 10:55 |
| 23 | Break Ores 0/100 | 💵45 | P2 | 11:00 |
| 24 | Upgrade at Quarry 0/7 | 💵45 | P2 end (41 %) | 12:35 → still active at stage clear and **carried into stage 2** |
| 25–32 | Break Metal Ores 10 → Break 40% Ores on Stage 1 → Hire 1 Workers → Break Ores 150 → Upgrade at Quarry 15 → Break 80% Ores on Stage 1 → Clear Stage 1 → Contract a New Quarry | DATA | – | – |

- **Quests block the chain.** The card stays on the current quest until it is done. ST never bought the Sledgehammer, so "Purchase Sledgehammer 0/1" stayed on screen for 16 minutes.
- A quest whose condition is already true completes **instantly** when it appears (P1 "Rent Wheelbarrow", P3 "Hold 300 or more Cash").

---

## 4. HUD and screens

### 4.1 In-game HUD (portrait reference = ST; landscape = P1/P3)

| position | element | look |
|---|---|---|
| top-left | ⚙ settings icon and a 2nd icon (box with arrow; UNSURE function) | white glyphs with a dark outline, no background |
| top-left, below | **quest card** | dark translucent rounded rect (~160×60 px at 488 wide); white bold title (1–2 lines); thin grey bar with blue fill and "x/y" in small white; a **cyan square reward tile** at the right with a green bill-stack or pink gem icon and the amount in white at its bottom-right |
| top-left, under the card | buff timers | yellow ring with an icon (energy can) and seconds left, e.g. "292" (SPEED BOOST) |
| top-centre | **"Stage 1"** + progress bar | white bold title with a dark outline; under it a dark bar (~135 px) with a **yellow fill** and white **"0.7%"** (1 decimal in the new build, integer % in the older one); a thin yellow vertical tick at **80 %** of the width with a tiny "Next" label under it (= clear threshold); when ≥ 80 % a **green "Clear Stage" button** appears under the bar |
| top-right | currency pills | dark rounded pills, icon left, white number right: **cash** (green bill) and **gems** (pink gem). Later rows: ad-skip **tickets** (yellow card, after the IAP shop unlock), **gears** (silver cog, from stage clear) and a **blue potion** (stage 2, unknown use). Number format: plain below 1,000, then "1.02K", "2.50K" |
| right edge, mid | vehicle tab + "i" (after the first rental) | white square with a loader icon, red dot, "◂"; yellow square with "i" |
| bottom-right | **LIGHT EQUIPMENT** | dark rounded square, yellow jackhammer icon, tiny white caption; opens INVENTORY. Later **SHOP** (yellow shop-front) in the older build and **COMPANY** (yellow building, red badge) in stage 2 |
| left edge | offers | gift icon with sparkles (Founder's Pack, P1 14:09); stage-2 offer timer "2d 23h" |
| world space | under the player | `CARGO [x/y]` pill (dark, yellow fill bar) / red "MAX"; house icon + distance + arrow; vehicle: orange "OIL" bar; green mount pin; red dismount button |
| world space | pads | white outlined rounded squares + bold italic label, "LOAD: n" below |
| world space | trucks | big white outlined "n/m" over the cab |

- **Absent:** joystick, minimap, XP/level, damage numbers, energy/stamina for the player.
- **Colours** (approximate, from frames):

  | element | colour |
  |---|---|
  | quest COMPLETE pill | green #3DCB45 |
  | dialogue name | yellow #FFD21F |
  | panel headers | orange-yellow #F2B01E |
  | buy buttons | green #39C23C |
  | Recommended ribbon | red #D93030 |
  | MAX pill | red #E03535 |
  | progress fill | yellow #F5C518 |

### 4.2 Screen / popup list

| # | screen | opened by | contents (verbatim) | close | ref |
|---|---|---|---|---|---|
| S1 | Dialogue box (Hank / Sofia) | events | §1.1 | tap | 01, 27 |
| S2 | UPGRADE panel | OPEN pad | §3.5 | red X | 09 |
| S3 | Machinery Center interior + item cards | ENTER pad | §3.6 | ENTER pad inside the door | 13–17 |
| S4 | INVENTORY | LIGHT EQUIPMENT button | top half: 3D character on a beach background with two slot cards ("Sledgehammer" ★★, "Wooden Carrier" ★); yellow header "INVENTORY"; a grid of item cards with a green "EQUIPPED" tag | red X under the character | 24 |
| S5 | Settings | ⚙ | orange header **"Setting"** + red X; rows with toggles: **Ambience**, **SFX** (green = on), **Vibration**, **Perf. Mode** (red = off); "Language" dropdown **"English"**; blue buttons **SUPPORT CENTER**, **RESTORE PURCHASES**; "Build Version 11.0.0" | red X | 10 |
| S6 | Job Board | Worker unlock / building | §3.10 | X | 30 |
| S7 | Worker Management | WORKER building pad | §3.10 | X | – |
| S8 | Boost offer popup | timer / floor tile | white card with a render on top: **"SPEED BOOST" / "+30% Move Speed" / "⏱ For 5 Minutes"** / green **FREE** button (first time; later an ad icon), red X below. DAMAGE BOOST is the same layout (§4.3) | X | 29 |
| S9 | IAP Shop (older build, after the first heavy rental) | SHOP button | FOUNDER'S PACK ("No Forced Ads! / 20 Ad Skip Tickets / Rent-Free Hybrid Dozer!"), NO ADS PACK, WEEKLY BUNDLES, AD SKIP TICKET, CASH (8,000 / 24,000 / 70,000 for 60 / 160 / 340 gems), GEAR, GEM, DAILY OFFER | X | – (out of scope) |
| S10 | Clear Stage dialogue + button | progress ≥ 80 % | §5 | – | 32 |
| S11 | STAGE COMPLETE | Clear Stage button | §5 | tap | 33 |
| S12 | BONUS REWARDS | tap | §5 | Claim | 34 |
| S13 | HQ tower (company) | after claim; COMPANY button in stage 2 | §5 | "Quarry" button | 35 |
| S14 | Light Equipment Upgrade (research tree) | UPGRADE on the workshop floor | §5 | X | 36 |
| S15 | Contract Room | NEXT STAGE | §5 | CONTRACT / X | 37, 38 |
| S16 | Stage 1 Clear Offer (IAP) | stage 2 load | §5 | X | – |
| S17 | Google Play in-app review | first rental | system UI | Not now | – (skip) |

### 4.3 Rewarded-ad offers (what was seen; the full list is DATA §9)

- **SPEED BOOST** popup (P1 15:13): +30 % move speed for 5 min. The first one shows a **FREE** button (DATA FreeTrial in stage 1); then a ring timer sits under the quest card.
- **DAMAGE BOOST** popup (P2, see §3.10 addendum).
- **Floor boost tiles:** a 3D can/canister pickup lying in the field with a ring label ("MAGNET BOOST", "SPEED BOOST") and a **yellow countdown bar** with seconds ("4.8", "19"). It disappears when the time runs out (DATA tiles: every 30 s, they last 20 s).
- **Minecart pads** "ACTIVATE" with an ad icon for the second and third carts (DATA). The first is "FREE".
- No forced interstitials are visible (the channels may have cut them). The ATM inside the shop says "ATM CLOSED" in stage 1.

---

## 5. Stage clear → stage 2 (P3 22:29–24:26; seconds are absolute video time)

**Trigger:** stage progress **≥ 80 %** (bar 79.9 → 80.1 % at 1349.5 s; the yellow "Next" tick sits there).
- Clearing is **optional**. The player can keep mining and the bar keeps rising (80.3 % seen). Hank says so.

| step | t (s) | duration | what is on screen (verbatim) | input |
|---|---|---|---|---|
| 1 | 1349.5 | – | a **green "Clear Stage" button** (white text, ~110×45 px at 1280 wide) appears **directly under the Stage progress bar** (`ref/32`) | – |
| 2 | 1349.9–1354.2 | ~4.3 s | Hank: **"You've met the stage clear condition! Nice work!"** → **"Just so you know — that's the bare minimum."** → **"You can move on, but cashing out your resources first pays off big. Your call!"** | tap ×3 |
| 3 | ~1354.8 | – | player taps **Clear Stage** | tap |
| 4 | 1354.9–1361.2 | ~6.3 s | **STAGE COMPLETE** panel (`ref/33`) pops in (scale-up ~0.1 s) over the dimmed quarry. | tap ("TAP TO CONTINUE" appears at ~1360.5 and pulses) |

**STAGE COMPLETE panel (step 4) layout, top to bottom:**
- A smiling hero (overalls, pickaxe on the shoulder) on green rays with sparkles.
- An orange metal plate **"STAGE COMPLETE"**.
- A dark brown **"Work Result"** band with two stats:
  - cash-stack icon, **"Cash Earned"**, **"11,120"**;
  - hammer/ore icon, **"Ore Mined"**, **"968 [80%]"** (yellow digits).
  - Both count up over ~0.9 s (517/48 → … → 11,120/968).
- **"Top 4 Workers"** with the legend ● Mining (blue) ● Hauling (orange). Four rows: round portrait, name, "x% / y%", and a stacked blue+orange bar that fills over ~0.7 s:
  - PLAYER 65 % / 24 %
  - Kaya Stone 0 % / 40 %
  - Earl Johnson 0 % / 35 %
  - Roy Miller 20 % / 0 %
- **There is no ×2 / ad / "No thanks" option.**

| step | t (s) | duration | what is on screen (verbatim) | input |
|---|---|---|---|---|
| 5 | 1361.7–1365.8 | ~4 s | **BONUS REWARDS** screen (dark navy, `ref/34`): hero (fist pump) on top; band **"◆ BONUS REWARDS ◆"**; subtitle **"Completion Bonus"**; one white tile with a silver **gear** icon and **"550"**; a green **"Claim"** button (greyed for 0.1 s, then active). No ad / ×2. On Claim, ~8 gear icons fly to the top-right, where a new **gear counter "550"** row appears | tap Claim |
| 6 | 1366–1380 | ~14 s | **HQ tower reveal** (`ref/35`): a portrait-shaped strip over a city skyline, details below | none (cinematic) |
| 7 | 1380.3–1381.8 | – | Sofia: **"What do you think of the new office? Let's build it up together!"** → **"While you're here, let's check out light equipment upgrades! This way!"** → spotlight on **UPGRADE** | tap UPGRADE |
| 8 | 1383.5–1385 | – | **"Light Equipment Upgrade"** popup (`ref/36`), details below. Sofia: **"This is the Light Equipment Workshop. Upgrade your gear here — visit often!"** | X |
| 9 | 1385.5–1389 | – | dust + flash: the "STAGE 2 [40%]" floor becomes **"COMING SOON"** scaffolding. Sofia: **"That's everything! Ready to head back to the quarry?"** | tap |
| 10 | 1390–1391 | – | a cyan **"NEXT STAGE"** button at the bottom of the tower (and a "Quarry" button bottom-right) | tap NEXT STAGE |
| 11 | 1392–1394 | – | **Contract Room** popup (`ref/37`), details below | tap card → CONTRACT |
| 12 | 1394.4–1396.3 | ~2 s | a red **"APPROVED"** stamp slams onto the folder (`ref/38`). Sofia: **"Contract confirmed! Time to break some rocks!"** → fade to black | – |
| 13 | ~1396.5 | – | **Stage 2 loads** (see "Stage 2 start" below) | – |

**HQ tower (step 6), in order:**
1. The camera starts at ground level on the **"CONTRACT ROOM"** floor (a secretary's office), with a scaffold floor above it: **"COMING SOON / CLEAR STAGE 1 FIRST"**.
2. It scrolls up past locked floors (grey, padlock): **"LOCKED / STAGE 2 [40%]"**, **"LOCKED / CLEAR STAGE 3 FIRST"**, **"… STAGE 4 FIRST"**, **"… STAGE 5 FIRST"**.
3. A roof sign **"BULLDOZER MASTER.inc"** with gears drops in. The hero cheers next to a blue/white italic banner **"Global NO.1 Construction Company!"**.
4. The camera scrolls back down. The scaffold floor builds with dust and a white flash into **"LIGHT EQUIPMENT WORKSHOP"** (cyan title, tool racks, a mechanic), with a green **"UPGRADE"** button carrying a red "!" badge.

**Light Equipment Upgrade popup (step 8):**
- A yellow drill picture sits above an orange title bar **"Light Equipment Upgrade"** with a red X.
- Tabs **"MINING"** (active, orange) and **"CARRYING"**, each with a red "!".
- A vertical node tree on paper: the first node (gloved hand + pickaxe) has a "!"; the nodes below show padlocks.

**Contract Room (step 11):**
- Sofia's bubble: **"Choose your next contract!" / "Cannot be changed once confirmed."**
- **One** orange folder card: red ribbon **"Recommended"**, title **"Leaf Island"**, tag **"Easy"**, a polaroid of an island map. A red X sits below.
- Tapping the card opens the detail view:
  - bubble **"Would you like to select?" / "Check the quarry details below. Cannot be changed once confirmed."**;
  - round stamp **"EASY"**;
  - fields **DETECTED ORE 984**, **KEY RESOURCE Emerald**, **CLIENT Corporate**, **BONUS ⚙ 400**;
  - a big green **"CONTRACT"** button.

**Stage 2 start (step 13):**
- A toast with Sofia's icon and a red badge "3": **"New Applications Received!" / "3 new worker(s) available for hire!"**
- 1397.75: the IAP popup **"Stage 1 Clear Offer"** ("300% Value", 150 gems + 60K cash, "Claim your special growth pack!", price button, "Offer Expires In: 2d 23h", X). Out of scope for the prototype: skip it, or show a placeholder.
- The camera zooms in onto the player at the Stage 2 base (~1 s).
- HUD **"Stage 2" 0.0 %** with the same "Next" tick (`ref/39`).
- The **quest card carries over unfinished** (P3 "Upgrade at Quarry 0/7"; GV "Break Ores 42/150").
- A new **COMPANY** button sits under LIGHT EQUIPMENT (bottom-right). It opens the HQ tower, now showing a cyan **"STAGE INFO"** button instead of NEXT STAGE.
- Research in the workshop:
  - Node card → green price button with a timer chip → grey **"RESEARCHING"** countdown → **"COMPLETE"** → green **"APPLY"** → **"APPLIED"** (check mark on the node).
  - Examples: Pickaxe "Flexible Handle" +10 % Mining Power, 5 s, 1.6K; Wooden Carrier "Reinforced Frame" +10 % Cargo, 5 s, 1.9K; Pickaxe "Sharpened Head" +20 %, 5 s, 3.3K; Sledgehammer "Reinforced Shaft" +7 %, 50 s, 7.1K.
  - Locked node toast: **"Purchase Cargo Pack first!"**
- About 40 s into stage 2, the **"Cash Spending Reward"** bar (milestone 120K, 4 blue chests + 1 gold chest) appears with Sofia: **"Great news, boss! We're now earning rebates from our vendors!"** → **"Not bad, right? Spend more, get more back!"** → **"Equipment, hiring, upgrades — hit the threshold and rewards are yours!"**

**What carries over and what resets:**

| item | stage 1 → stage 2 | evidence |
|---|---|---|
| gems, tickets, gears | **kept** (483 / 24 / 550) | P3 HUD |
| cash | **kept** (INFERRED; GV starts stage 2 with 1.02K) | GV |
| quarry upgrade levels (Pickaxe, Carrier, Furnace, Sales Trucks…) | **kept** (Pickaxe Lv 13, Carrier Lv 28, Furnace Lv 9, Trucks Lv 7 at stage 2 start) | GV upgrade panel |
| owned light equipment (Sledgehammer…) | **kept** ("SOLD OUT" in the stage 2 shop) | GV |
| research tree, HQ floors | **kept** (meta) | P3 |
| active quest | **kept**, unfinished | P3, GV |
| rented heavy equipment, fuel | **reset**: OIL station locked again ("RENT FUEL-POWERED EQUIPMENT"); shop rentals priced ×1.2 (DATA) | P3 |
| hired workers | **reset** ("Hired for this stage only", "Hired Workers: 0/4") | GV |
| progress %, map, minecarts | **reset**: new map "Leaf Island", 984 ore blocks, key resource Emerald | P3 |
| base buildings | same set and same left-to-right order on the new map | P3 |

---

## 6. Juice and feedback

- **Mining:**
  - pickaxe swing animation (~1 swing/s) with sparks and small chips at the impact point;
  - crack decals grow in 3–4 steps;
  - **no floating damage numbers**;
  - on break, 4–6 big slabs in the block's colour tumble out with physics and fade, and a dust puff.
  - **Camera shake:** none obvious on foot. UNSURE: light shake with the hydraulic breaker or heavy loader.
- **Pickup:** chunks pop up and **arc onto the carrier**, stacking one by one into a visibly growing column. The cargo pill fill animates. At full, a **red MAX pill**.
- **Pads:** items hop **one at a time** in arcs (cargo → pad → furnace hopper; pad → truck bed), with counters ticking.
- **Furnace:** chimney smoke puffs, a glowing mouth, a small timer bar above it; ingots slide down the chute onto a growing stack.
- **Sell:** the truck counter "n/m" increments; the full truck drives off; a **cash bundle pile** spawns; walking near makes the bills **fly to the player then to the HUD**, and the counter rolls up.
- **Quest complete:** green **"✔ COMPLETE!"** pill pop, reward icons burst and fly to the HUD counter.
- **Purchase:** a white shine sweeps across the upgrade card and the numbers pop.
- **Equipment delivery:** the vehicle drops in at a base slot with a **dust cloud + confetti** (`ref/18`).
- **Vehicles:** tread marks on dirt; the OIL bar drains; chunks spray when the breaker hits.
- **Guidance:** marching green chevrons, a bobbing green "!" marker, spotlight dimming.
- **Stage complete:**
  - green rays and sparkles behind the hero;
  - number count-ups;
  - worker bars fill;
  - "TAP TO CONTINUE" pulses;
  - gear icons fly to the HUD on Claim;
  - HQ floor build: dust + white flash;
  - the APPROVED stamp slams down.
- **Sound:** no audio analysis was done. The Settings screen proves separate **Ambience** and **SFX** channels and **Vibration** (haptics). The prototype should give each hit, break, pickup, sale, quest-complete and purchase a short SFX, plus quarry ambience.

---

## 7. Timings

**Milestones** (video time; ST = new build without the sledgehammer, P1 = older build F2P, P3 = with the IAP dozer):

| milestone | ST | P1 | P3 |
|---|---|---|---|
| first block broken | 0:23 | 0:07 | – |
| first refine | 0:36 | 0:19 | ~0:30 |
| first sale | 0:43 | 1:10 | 0:55–2:45 |
| **first upgrade** | **0:58** | **1:27** | 2:54 |
| first shop visit | 4:18 | 3:22 (4:36 via quest) | 3:53 |
| first light tool (Sledgehammer) | never | 4:44 | ~7:15 |
| **first vehicle** (Wheelbarrow rented / mounted) | **5:34 / 5:57** | **6:36 / 6:50** | (dozer from 0:19) |
| minecart activated / first send | – | 7:41 / 8:32 | ~1:30 |
| first fuel vehicle (Hydraulic Breaker) | – | 13:45 | – |
| workers unlocked | – | P2 | 5:55 (~19–20 %) |
| Sofia / company (60 %) | – | – | 17:06 |
| **80 % → Clear Stage** | – | – | **22:29** |
| stage 2 gameplay | – | – | 23:16 |

**Stage 1 progress over time:**

| video time | ST % | P1 % | P3 % |
|---|---|---|---|
| 1:00 | 0.2 | 0 | 4.0 |
| 2:00 | 0.4 | 0 | 7.1 |
| 5:00 | 0.7 | 0 | 12.5 |
| 7:00 | 0.9 | 1 | 21.5 |
| 10:00 | 1.2 | 3 | 36.1 |
| 12:00 | 1.5 | 4 | ~43 |
| 15:00 | 1.9 | 6 | 54.1 |
| 18:00 | 2.5 | 15 | 64.0 |
| 20:00 | 3.2 | 15 | 71.1 |
| 21:20 | 3.5 | 16 | 74.8 |
| 22:29 | – | – | **80.1 → Clear Stage** |

Continuation of P1 in P2 (same save): see §7.1.

**Readings:**
- **ST** (no sledgehammer, wheelbarrow only) shows how slow pickaxe-only play is: 3.5 % in 21 min.
- **P1** is the normal F2P path: progress takes off only once heavy equipment arrives (Hydraulic Breaker at 13:45 → 4 % to 15 % in 3 minutes).
- **P3** with a big heavy vehicle from the start clears in **22.5 min**.
- **For the prototype:** aim for the tutorial done by ~1 min, the shop by ~4 min, the first vehicle by ~6 min and a fuel vehicle by ~12 min. Set the stage-1 length to ~20–30 min of play, by scaling the map down or the progress formula.

### 7.1 P2 addendum

(To be filled from the P2 analysis: worker unlock time and %, vehicles rented, progress readings 21:24 → ~39:40, DAMAGE BOOST, sandstone layer.)

---

## 8. Stage 1 timeline (first frame → stage 2 start)

The tutorial section uses **ST** times (new build). The mid-stage uses **P1 → P2** (one F2P save, P2 time = P1 end + P2 time). The clear sequence uses **P3** times (relative times in brackets).

| # | t | src | event | screen / pointer | progress |
|---|---|---|---|---|---|
| 1 | 0:00 | ST | spawn at base; Hank "Well, look who finally showed up!…" | dialogue | 0.0 % |
| 2 | 0:04 | ST | quest Break Ores 0/1; chevrons to the quarry edge | quest card | 0.0 |
| 3 | 0:23 | ST | first block breaks; COMPLETE (+2 cash); Collect Minerals 0/5 | COMPLETE pill | 0.1 |
| 4 | 0:30 | ST | cargo MAX; Hank "Nice haul!…"; camera → furnace | dialogue, chevrons | 0.2 |
| 5 | 0:34 | ST | Deliver Minerals to the Furnace 0/5; stand on REFINING | pad | 0.2 |
| 6 | 0:37 | ST | Sell Ingots 0/3; pick ingots from the tray → SELL; truck 0/4 | truck counter | 0.2 |
| 7 | 0:45 | ST | COMPLETE (+2 gems); truck leaves; cash pile | – | 0.2 |
| 8 | 0:46 | ST | Hank "You've saved enough — time to upgrade!…"; camera → UPGRADE; Go to Upgrade | dialogue, ! marker | 0.2 |
| 9 | 0:56 | ST | OPEN pad → UPGRADE panel; COMPLETE (+40); Upgrade at Quarry 0/3 | S2 | 0.2 |
| 10 | 1:04 | ST | 3 upgrades → COMPLETE (+1 gem); Break Rocky Ores 0/3 | – | 0.2 |
| 11 | ~3:00 | ST | Hold 250 or more Cash | toast | 0.5 |
| 12 | 4:08 | ST | COMPLETE; Machinery Center unlocks; Hank "You've got enough for new gear!…" | ! marker | 0.7 |
| 13 | 4:18 | ST | ENTER → shop; Hank "Buy light equipment or rent heavy equipment here."; camera tour; Purchase Sledgehammer | S3 | 0.7 |
| 14 | (4:44) | P1 | Sledgehammer bought; "Nice, you got light equipment!…"; spotlight → INVENTORY | S4 | 0 (P1 scale) |
| 15 | 5:34 | ST | Wheelbarrow rented; "Nice, you rented heavy equipment!…"; "Your equipment should be at base camp…" | S3 → base | 0.8 |
| 16 | 5:48 | ST | wheelbarrow drops with confetti; mount spotlight; Hank's mount/dismount lines | spotlight | 0.8 |
| 17 | 7:41 | P1 | minecart "ACTIVATE / FREE"; rail appears; first send 8:32 | pins | 2–3 % |
| 18 | 11:26 | P1 | Rent Wheelbarrow (instant) → Mount Wheelbarrow | – | 4 % |
| 19 | 13:45 | P1 | Hydraulic Breaker rented (2.5K); delivery cutscene; Oil Station unlocks | cutscene | 4 % |
| 20 | 13:53 | P1 | IAP shop intro (older build; out of scope) | S9 | 4 % |
| 21 | 14:11 | P1 | breaker mounted; fast mining | – | 5 → 15 % |
| 22 | 15:13 | P1 | SPEED BOOST popup (FREE) | S8 | 8 % |
| 23 | 15:20 | P1 | out of fuel; Hank lines; refuel from barrels 15:55 | – | 8–9 % |
| 24 | 21:24 | P1 | end of P1; Upgrade at Quarry 0/5 | – | 16 % |
| 25 | 21:24–~39:40 | P2 | see §7.1 (workers unlock ≈ 20 %, more rentals) | – | 16 → 41 % |
| 26 | P3 17:06 | P3 | (≈60 %) Sofia intro; company "Unlocks after this stage!" | dialogue | 59.5 % |
| 27 | P3 22:29.5 (T+0) | P3 | 80 % reached → Clear Stage button; Hank's 3 lines | S10 | 80.1 % |
| 28 | T+5.3 s | P3 | Clear Stage → STAGE COMPLETE (6.3 s) | S11 | – |
| 29 | T+12.2 s | P3 | BONUS REWARDS: 550 gears → Claim | S12 | – |
| 30 | T+16.5 s | P3 | HQ tower reveal (14 s) | S13 | – |
| 31 | T+30.8 s | P3 | Sofia; Light Equipment Upgrade popup | S14 | – |
| 32 | T+40.5 s | P3 | NEXT STAGE → Contract Room → Leaf Island → CONTRACT → APPROVED | S15 | – |
| 33 | T+47 s | P3 | **Stage 2 starts**: toast "New Applications Received!", Stage 1 Clear Offer (IAP), HUD "Stage 2 0.0%" | S16 | 0.0 % (stage 2) |

**Estimated F2P total for stage 1:** P1+P2 reach 41 % at ~40 min. At the P2 rate, 80 % comes at **~65–75 min** (INFERRED). P3 with an IAP heavy vehicle: 22.5 min.

---

## 9. Open questions / unsure points

1. **Shop purchase input.** Tap the card's button, or auto-buy after standing? Same question for the possible hold time on ENTER/OPEN pads: no progress ring was visible, and they act within ~0.5 s.
2. **Right-edge vehicle tab and "i" button.** Never opened.
3. **Second top-left icon.** Never tapped.
4. **Camera zoom while driving heavy vehicles.** Not isolated.
5. **Minecart auto-return.** Not seen.
6. **Gem / cash rewards from rewarded ads.** The first SPEED BOOST was FREE (no ad shown); the channels may cut ads.
7. **P3 is not a clean F2P save.** It starts with 470 gems and a heavy loader (likely IAP). Its timings are an upper bound on speed.
8. **Cash carry-over to stage 2.** Inferred from one video (GV: 1.02K at stage 2 start); P3's cash counter is hidden by a watermark.
9. **The first stage-2-specific quest was not seen.** The stage-1 quest carries over; DATA says 1033 "Break Ores 50" follows "Contract a New Quarry".
10. **Contract Room choice.** Only one contract card was offered (stage 1 → 2), matching DATA (one stage per contract group).
11. **Opening line in the older build.** It was cut from P1, so we cannot tell whether the older build had it.

---

## 10. Reference frames (`docs/ref/`)

Portrait frames (488×1080) are from **ST** (new build); 1280×720 frames are from **P1/P3**.

| file | shows |
|---|---|
| 01_tutorial_intro_hank.jpg | first frame: Hank dialogue box, Stage 1 0.0 %, quest card "Break Ores" |
| 02_tutorial_chevrons_to_ore.jpg | green chevron trail to the first ore block; HUD |
| 03_mining_crack_stages.jpg | pickaxe hitting; crack lines on the block top |
| 04_quest_complete_banner.jpg | green "✔ COMPLETE!" pill with bills flying; broken slabs |
| 05_block_break_chunks.jpg | copper block shattering into big slabs |
| 06_cargo_max_chevrons_refining.jpg | red MAX pill, chevrons to the REFINING pad |
| 07_refining_pad_furnace.jpg | REFINING pad LOAD counter, furnace, output tray |
| 08_sell_pad_truck_counter.jpg | SELL pad, blue truck "4/4", cash pile |
| 09_upgrade_panel_first.jpg | UPGRADE panel (Player / Pickaxe / Wooden Carrier [Recommended] / Furnace / Sales Trucks) |
| 10_settings_popup.jpg | Settings popup with toggles, build 11.0.0 |
| 11_machinery_center_locked.jpg | Machinery Center "UNLOCKS AFTER QUEST CLEAR", UPGRADE OPEN pad |
| 12_machinery_center_enter_pad.jpg | Machinery Center with green ! marker, ENTER pad, chevrons |
| 13_shop_interior_hank.jpg | inside the shop, Hank "Buy light equipment or rent heavy equipment here." |
| 14_shop_card_hydraulic_breaker.jpg | item card: Hydraulic Breaker [Rent] 2.5K |
| 15_shop_card_wheel_loader_locked.jpg | item card: Wheel Loader "First, Buy Wheelbarrow" |
| 16_shop_card_wheelbarrow.jpg | item card: Wheelbarrow 300, RECOMMENDED plate |
| 17_shop_sold_out_hank.jpg | SOLD OUT plate "Check out the base camp." + Hank |
| 18_vehicle_delivery_confetti.jpg | wheelbarrow dropping at base with dust + confetti |
| 19_mount_pin_spotlight.jpg | spotlight tutorial on the green mount pin |
| 20_dismount_button_spotlight.jpg | spotlight on the red dismount button, CARGO [0/25] |
| 21_worker_building_locked.jpg | WORKER dome, "BREAK 20% ORE", "Keep playing to unlock workers!" |
| 22_price_board.jpg | sell price sign (10$ … 300$) |
| 23_base_overview_landscape.jpg | whole base row in landscape (older build): shop, upgrade, oil, refining, worker, pizza truck, trucks |
| 24_inventory_light_equipment.jpg | INVENTORY screen |
| 25_minecart_activate_free.jpg | minecart in its pit with the "ACTIVATE FREE" pad |
| 26_excavator_mount_oil_bar.jpg | Hydraulic Breaker at base with OIL bar + mount pin; ticket row; SHOP button |
| 27_out_of_fuel_dialogue.jpg | out-of-fuel Hank line, empty OIL bar, boost ring timer |
| 28_fuel_barrels_boost_pickup.jpg | oil barrels on the pad, floor boost pickup with countdown |
| 29_speed_boost_popup.jpg | SPEED BOOST "+30% Move Speed / For 5 Minutes / FREE" |
| 30_job_board_hire.jpg | Job Board / hiring (P2) |
| 31_field_layers_sandstone_gold_amethyst.jpg | deep field: sandstone, gold, amethyst; heavy loader |
| 32_clear_stage_button.jpg | green "Clear Stage" button under the bar + Hank |
| 33_stage_complete_panel.jpg | STAGE COMPLETE: Work Result + Top 4 Workers |
| 34_bonus_rewards_claim.jpg | BONUS REWARDS, Completion Bonus 550 gears, Claim |
| 35_hq_tower_workshop.jpg | HQ tower: locked floors, LIGHT EQUIPMENT WORKSHOP [UPGRADE], CONTRACT ROOM |
| 36_light_equipment_upgrade_tree.jpg | Light Equipment Upgrade tree (MINING / CARRYING) |
| 37_contract_detail.jpg | Contract: Leaf Island, EASY, 984 / Emerald / Corporate / 400, CONTRACT |
| 38_contract_approved.jpg | APPROVED stamp, "Contract confirmed! Time to break some rocks!" |
| 39_stage2_start_hud.jpg | Stage 2 base and HUD at 0.0 % (gear row, COMPANY button) |
