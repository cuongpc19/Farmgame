# The game data the build ships (src/data/game/), made from the decoded tables in src/data/orig/
# with every piece of the original's writing removed: dialogue, quest texts, blurbs, worker
# names, research / floor / boost titles, stage names and the decoder's notes. What the player
# reads comes only from src/data/text.json. Numbers and identifiers stay.
#
#   python -I scripts/slimdata.py        (economy + stages 2-10 via stagevar.py; stage 1: stagegen.py write)
#
# src/data/game/ORIGIN.json lists what is still the original's; build-target.mjs reads it and
# prints "CHUA NEN NOP" while it is not empty.
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, "src/data/orig"), os.path.join(ROOT, "src/data/game")

# Prose anywhere in the tables (decoder notes, explanations, failure messages nobody shows).
DROP_ANYWHERE = {"_note", "_source", "note", "notes", "conditionMeaning", "trigger", "valueType", "scaledBy", "use",
                 "cashbackNote", "coords", "progressFormula", "firstHireFree_dialogue", "failText"}

# The original quest-guide toasts, by the key our wording has in text.json "toasts".
TOASTS = {"Collect Minerals!": "collect", "Save Cash for Better Equipment!": "save", "Smash Rocks!": "smash",
          "Clear the Stage!": "clear", "Pick Your Next Quarry!": "pick", "Upgrade at Your Company!": "hq",
          "Claim Idle Rewards!": "idle"}

def scrub(o):
    if isinstance(o, dict):
        return {k: scrub(v) for k, v in o.items() if k not in DROP_ANYWHERE}
    if isinstance(o, list):
        return [scrub(v) for v in o]
    return o

def economy():
    e = scrub(json.load(open(os.path.join(SRC, "economy.json"), encoding="utf-8")))
    for u in e["statUpgrades"].values():
        if isinstance(u.get("levels"), str): del u["levels"]
    for b in e["buildings"].values():
        b.pop("role", None)
    # The main chain (group 1, then group 2 six times, then group 1000 for ever); texts come from text.json.
    e["quests"] = {k: v for k, v in e["quests"].items() if k in ("startGroup", "groupChain", "group1", "group2", "group1000", "multiplierByLevel_forUseMultiplierQuests")}
    for q in e["quests"]["group1"] + e["quests"]["group2"] + e["quests"]["group1000"]:
        q["text"] = ""
        # Guide toasts become keys into text.json "toasts".
        if (q.get("guide") or {}).get("type") == "ToastMessage": q["guide"]["detail"] = TOASTS[q["guide"]["detail"]]
    for d in e["onboardingSequence"]: d["dialogue"] = []
    for q in e["equipment"].values():
        q.pop("description", None); q.pop("detail", None)
    for p in e["workers"]["profiles"]:
        p["name"] = p["trait"] = p["desc"] = ""
    for b in e["rvBoosts"]["boosts"]:
        b["title"] = b["description"] = ""
    for f in e["management"]["floors"]:
        f["name"] = ""; f["title"] = None if f.get("title") is None else ""
    for n in e["management"]["treeNodes"]:
        n["title"] = ""
    return e

def stage(raw):
    s = scrub(raw)
    s["name"] = ""
    return s

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    dump = lambda name, obj: json.dump(obj, open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
    dump("economy.json", economy())
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import stagevar
    for n in range(2, 11): stagevar.write(n)
    origin = {
        "economy.json": "numbers decoded from the original APK: ore HP and prices, equipment, upgrade curves, quest chain targets and rewards, workers, HQ research, boosts (carrier cargo x PACE.cargo at runtime; prices are the decoded ones)",
        "stage2-10.json": "the original stages' maps, mirrored with the ores dealt again (stagevar.py; same shapes and per-ore counts), and their stage fields (clear rule, rewards, contract); the base is ours (townbase.py)",
        "stage1.json": "quarry (stagegen.py) and base (townbase.py) are ours; the stage fields (clear rule, rewards, contract) are the original's",
    }
    json.dump(origin, open(os.path.join(OUT, "ORIGIN.json"), "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=2)
    print("wrote", OUT)
