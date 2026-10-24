"""Tests for Study Quest: every story's data, shop sums, a whole trip through every story, forks, crossings,
food, saving, the shuffled Time Machine, Lost Library's torn pages, Seed Ark's garden plant, the old-save move.

Run from the repo root:   python3 tests/quest_test.py
Needs: pip install playwright && playwright install chromium
"""
import json, os, re, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8779
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")
LIST = [l.split("|")[0].strip() for l in open(FIXTURE) if l.strip() and not l.startswith("#")]
STORY_IDS = ["dragon", "island", "library", "lantern", "seeds", "pony", "time", "space"]
SAVE = lambda s: f"spelling-games.quest.{s}.save.v2"
FOUND = lambda s: f"spelling-games.quest.{s}.found.v1"

INIT = """
window.__heard = [];
const fake = { speak(u){ window.__heard.push(u.text); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
"""

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def evalmath(text):
    a, op, b = re.match(r"\s*(\d+)\s*([+−×÷])\s*(\d+)", text).groups()
    a, b = int(a), int(b)
    return {"+": a + b, "−": a - b, "×": a * b, "÷": a // b}[op]

def word_problem(prompt):
    n = [int(x) for x in re.findall(r"\d+", prompt)]
    if "get back" in prompt: return n[1] - n[0]
    if "for both" in prompt: return n[0] + n[1]
    if "can you buy" in prompt: return n[1] // n[0]
    if "is that" in prompt: return n[0] * n[1]
    raise ValueError(prompt)

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", SITE],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block")
        ctx.add_init_script(INIT)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=FIXTURE))
        ctx.route("**/audio/manifest.json", lambda r: r.fulfill(status=404))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "manifest" not in m.text and "404" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def tap(sel, **kw): page.locator(sel, **kw).first.tap()
        def home(): tap("#back")
        def save(s): return page.evaluate(f"JSON.parse(localStorage.getItem('{SAVE(s)}'))")
        def found(s): return page.evaluate(f"JSON.parse(localStorage.getItem('{FOUND(s)}') || '[]')")
        def bag(): return page.evaluate("({ food: +document.querySelector('[data-food]').dataset.food, money: +document.querySelector('[data-money]').dataset.money, token: document.querySelector('[data-token]') ? document.querySelector('[data-token]').textContent : null })")
        def type_answer(s):
            for ch in s: tap(f".ch-q .key:text-is('{ch}')")
            tap(".ch-q button:has-text('Check')")
        prompts = []
        def answer(right=True):
            """Answer the open question (right, or missed twice then OK). Returns the kind."""
            big = page.locator(".ch-q .bigword")
            prompt = page.locator(".ch-q .prompt").inner_text() if page.locator(".ch-q .prompt").count() else ""
            prompts.append(prompt)
            if big.count():
                t = big.inner_text()
                val = evalmath(t) if "=" in t else word_problem(prompt)
                if right: type_answer(str(val))
                else:
                    for _ in range(2): type_answer(str(val + 1))
                    tap(".ch-q button:has-text('OK')")
                kind = "math"
            else:
                heard = page.evaluate("window.__heard")[-1].lower()
                w = next(w for w in LIST if w in heard)
                if right: type_answer(w)
                else:
                    for _ in range(2): type_answer("zq")
                    tap(".ch-q button:has-text('OK')")
                kind = "spell"
            page.wait_for_selector(".ch-q", state="detached", timeout=5000)
            return kind
        def picker():
            page.locator(".mcard", has_text="Study Quest").first.tap()
            page.wait_for_selector(".qt-picks")
        def open_story(s):
            picker()
            tap(f".qt-pick[data-story='{s}']")
            page.wait_for_selector(f".qt-setup[data-story='{s}']")
        def play(s, way=0, miss_every=4, guard_max=160):
            """Tap through a whole trip from wherever it is to the finale button. Returns info."""
            info = {"titles": set(), "questions": 0, "food_ok": True, "orders": None}
            guard = 0
            while guard < guard_max:
                guard += 1
                if page.locator(".ch-q").count():
                    info["questions"] += 1
                    answer(right=(guard % miss_every != 0))
                    continue
                if page.locator(".qt-finale").count(): break
                ways = page.locator(".qt-way:not([disabled])")
                if ways.count():
                    info["titles"].add(page.locator(".qt-title").inner_text())
                    ways.nth(min(way, ways.count() - 1)).tap()
                    continue
                st = save(s)
                if st and st["food"] < 0: info["food_ok"] = False
                page.locator(".qt-act button.primary").first.tap()
            info["done"] = page.locator(".qt-finale").count() == 1
            info["guard"] = guard
            return info

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.5)
        check("menu: Study Quest is in the Fun section (no Dragon Egg Quest card)", page.locator(".sect", has_text="Fun").locator(".mcard", has_text="Study Quest").count() == 1 and page.locator(".mcard", has_text="Dragon Egg Quest").count() == 0)

        # ---- every story's data is complete and follows the kid rules
        bad = page.evaluate("async () => { const m = await import('/js/games/quests/index.js'); return { ids: m.STORIES.map(s => s.id), bad: m.STORIES.flatMap(m.checkStory) }; }")
        check("8 stories, in picker order", bad["ids"] == STORY_IDS, str(bad["ids"]))
        check("every story passes checkStory (stops, forks, crossings, events, finale, misses cost ≤ 1 food)", not bad["bad"], "; ".join(bad["bad"][:6]))

        # ---- shop sums use each story's words and match their stories
        shop = page.evaluate("""async () => { const m = await import('/js/games/quest.js'); const q = await import('/js/games/quests/index.js'); const out = [];
          for (const s of q.STORIES) for (const lv of ['add', 't5', 't10', 'div']) for (const coins of [0, 4, 10, 25, 60]) for (let i = 0; i < 12; i++)
            out.push({ story: s.id, money: s.money.name, lv, coins, ...m.storeProblem(s, lv, coins, 'the shopkeeper') });
          return out; }""")
        wrong = [s for s in shop if word_problem(s["prompt"]) != s["answer"] or s["answer"] < 0 or s["food"] < 1]
        check(f"shop word problems: answer matches the story ({len(shop)} problems, 8 stories)", not wrong, str(wrong[:2]))
        check("shop word problems use each story's money (shells, stars, crystals…)", all(s["money"] in s["prompt"] for s in shop), str([s for s in shop if s["money"] not in s["prompt"]][:1]))

        # ---- the picker
        picker()
        check("picker: one card per story", page.locator(".qt-pick").count() == 8)
        page.screenshot(path=f"{SHOTS}/quest_picker.png", full_page=True)
        tap(".qt-setup button:has-text('Math')"); tap(".qt-setup button:has-text('Times tables 2–5')")
        tap(".qt-pick[data-story='dragon']")
        check("story screen: name, blurb, Start, ‹ All quests", "Dragon Egg Quest" in page.locator(".qt-setup h2").inner_text() and page.locator(".qt-new").count() == 1 and page.locator(".qt-all").count() == 1)
        tap(".qt-all")
        check("‹ All quests goes back to the picker", page.locator(".qt-picks").count() == 1)
        home()

        # ---- Dragon Egg Quest in detail (math, Times tables 2–5)
        open_story("dragon")
        tap(".qt-new")
        check("dragon village: story + 8-stop map + bag (6 🍎, 10 🪙)", "Willow Village" in page.locator(".qt-scene").inner_text() and page.locator(".qt-stop").count() == 8 and bag()["food"] == 6 and bag()["money"] == 10, str(bag()))
        check("dragon map: forks are ❓ until chosen", page.locator(".qt-stop", has_text="❓").count() == 2)
        n0 = len(page.evaluate("window.__heard")); tap(".qt-read")
        check("🔊 Read to me speaks the story", len(page.evaluate("window.__heard")) == n0 + 1 and "dragon egg" in page.evaluate("window.__heard")[-1].lower())
        tap(".qt-act button:has-text('Buy snacks')")
        prompt = page.locator(".ch-q .prompt").inner_text()
        check("shop (math): a word problem in coins; the sum itself is hidden", page.locator(".ch-q .bigword").inner_text().startswith("?") and "coins" in prompt)
        n = [int(x) for x in re.findall(r"\d+", prompt)]
        answer(True)
        check("shop: food bought, coins paid (never below zero)", bag()["food"] == 6 + n[0] and bag()["money"] == max(0, 10 - n[0] * n[1]), f"{prompt} -> {bag()}")
        info = play("dragon", way=1)
        check("dragon: reached the finale", info["done"], f"after {info['guard']} taps")
        check("dragon: both forks and the river came up", {"A fork in the road", "Almost there!", "Rushing River"} <= info["titles"], str(info["titles"]))
        check("dragon: food never below zero; a dozen-plus questions", info["food_ok"] and info["questions"] >= 12, str(info["questions"]))
        check("dragon map: every stop before the mountain is done", page.locator(".qt-stop.done").count() == 7)
        tap(".qt-finale")
        check("hatch: a baby dragon and a name box (device keyboard)", page.locator(".qt-found.hatched").count() == 1 and page.locator(".qt-act input.text-in").count() == 1)
        page.locator(".qt-act input.text-in").fill("Sparky")
        tap(".qt-name")
        check("end: 'Sparky is home!'", "Sparky is home!" in page.locator(".qt-end").inner_text())
        check("dragon saved with its kind; the trip save is cleared", found("dragon")[-1]["name"] == "Sparky" and found("dragon")[-1]["kind"] and save("dragon") is None, str(found("dragon")))
        tap(".qt-end button:has-text('Go again')")
        check("story screen shows the dragons she brought home", "Sparky" in page.locator(".qt-shelf").inner_text())
        tap(".qt-all")
        check("picker card shows the collection count", "× 1" in page.locator(".qt-pick[data-story='dragon']").inner_text())
        home()

        # ---- every other story, start to finish (spelling + math), with its own finale
        for s in STORY_IDS[1:]:
            open_story(s)
            tap(".qt-setup button:has-text('Both')")
            tap(".qt-new")
            tap(".qt-act button.primary")  # shop: buy
            if page.locator(".ch-q").count(): answer(True)
            info = play(s, way=(0 if s != "space" else 1))
            check(f"{s}: reached the finale (food ≥ 0, {info['questions']} questions)", info["done"] and info["food_ok"] and info["questions"] >= 8, f"{info['guard']} taps, {info['questions']} q")
            if s == "library": check("library: all 5 pages found by the end", bag()["token"] == "📄 5/5", str(bag()))
            if s == "time": check("time: all 6 gears found by the end", bag()["token"] == "⚙️ 6/6", str(bag()))
            if s == "seeds": check("seeds: all 4 seeds gathered", bag()["token"] == "🌰 4/4", str(bag()))
            tap(".qt-finale")
            if page.locator(".qt-act input.text-in").count():
                page.locator(".qt-act input.text-in").fill("")  # blank = the suggested name
            tap(".qt-name")
            f = found(s)
            check(f"{s}: end screen, saved in its collection, trip cleared", page.locator(".qt-end").count() == 1 and len(f) == 1 and f[0]["name"] and save(s) is None, str(f))
            if s == "seeds":
                page.screenshot(path=f"{SHOTS}/quest_seeds_end.png")
                home()
                page.locator(".mcard", has_text="My Garden").first.tap()
                check("seeds: the special plant shows in My Garden", page.locator(".gd-special .gd-rare", has_text=f[0]["name"]).count() == 1)
                page.screenshot(path=f"{SHOTS}/garden_special.png")
            home()
        check("no story ever asked a question it couldn't frame", all(p is not None for p in prompts))

        # ---- Time Machine: middle stops shuffled each trip, first and last fixed, upcoming stops hidden
        orders = page.evaluate("async () => { const m = await import('/js/games/quest.js'); const q = await import('/js/games/quests/index.js'); const t = q.STORIES.find(s => s.id === 'time'); return Array.from({length: 30}, () => m.newOrder(t)); }")
        check("time: first and last stops fixed, the rest shuffled", all(o[0] == 0 and o[-1] == 7 and sorted(o) == list(range(8)) for o in orders) and len({tuple(o) for o in orders}) > 5)
        open_story("time"); tap(".qt-new")
        check("time map: the next stops are a surprise (❓)", page.locator(".qt-stop", has_text="❓").count() == 7)
        home()

        # ---- Lost Library: a spelling word with a list sentence becomes a torn page
        ctx2 = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block")
        ctx2.add_init_script(INIT)
        ctx2.route(URL + "words.txt", lambda r: r.fulfill(body="# Torn pages\nwhale | The whale swam past the boat.\nlight | Turn on the light please.\n", content_type="text/plain"))
        ctx2.route("**/audio/manifest.json", lambda r: r.fulfill(status=404))
        p2 = ctx2.new_page()
        p2.goto(URL); p2.wait_for_selector(".mcard")
        p2.locator(".mcard", has_text="Study Quest").first.tap()
        p2.locator(".qt-setup button:has-text('Spelling')").first.tap()
        p2.locator(".qt-pick[data-story='library']").first.tap()
        p2.locator(".qt-new").first.tap()
        p2.locator(".qt-act button.primary").first.tap()
        pr = p2.locator(".ch-q .prompt").inner_text()
        check("library: spelling shows the list sentence with the word missing", "A word is missing" in pr and "_____" in pr and "whale" not in pr.lower().split("“")[1] and "light" not in pr.lower().split("“")[1], pr)
        p2.screenshot(path=f"{SHOTS}/quest_library_blank.png")
        ctx2.close()

        # ---- save and continue; the picker shows a trip on the way
        open_story("island")
        tap(".qt-setup button:has-text('Spelling')")
        tap(".qt-new")
        tap(".qt-act button:has-text('No thanks')")
        while page.locator(".ch-q").count() == 0 and page.locator(".qt-title", has_text="Coral Reef").count() == 0:
            page.locator(".qt-act button.primary").first.tap()
        before = save("island")
        home()
        picker()
        check("picker: a saved trip shows '▶ On the way'", "On the way" in page.locator(".qt-pick[data-story='island']").inner_text())
        tap(".qt-pick[data-story='island']")
        check("story screen: 'Continue the quest' + 'Start over'", page.locator(".qt-continue").count() == 1 and "Start over" in page.locator(".qt-new").inner_text())
        tap(".qt-continue")
        check("continue: same food, money and place", bag()["food"] == before["food"] and bag()["money"] == before["money"] and save("island")["i"] == before["i"], f"{before} vs {bag()}")
        check("continue: the story's own words ('Back at sea' or the stop)", page.locator(".qt-title", has_text="Back at sea").count() == 1 or page.locator(".qt-title", has_text="Coral Reef").count() == 1)
        home()

        # ---- out of food: a stop to find more (never a dead end), in the story's words
        page.evaluate(f"localStorage.setItem('{SAVE('space')}', JSON.stringify({{ v: 2, i: 1, leg: 0, atStop: false, ways: {{}}, food: 1, money: 0, token: 0, kind: '', seen: [], order: null }}))")
        open_story("space"); tap(".qt-continue")
        n0 = len(page.evaluate("window.__heard"))
        tap(".qt-act button:has-text('Keep going')")
        check("out of fuel: a forage scene with a question", "Out of fuel cells" in page.locator(".qt-scene").inner_text() and page.locator(".ch-q").count() == 1)
        check("spelling question spoken inside the Keep going tap", len(page.evaluate("window.__heard")) > n0)
        answer(False)
        check("forage, not right this time: still finds food (+2)", bag()["food"] == 2, str(bag()))
        home()

        # ---- crossings: paid ways need enough money
        page.evaluate(f"localStorage.setItem('{SAVE('dragon')}', JSON.stringify({{ v: 2, i: 2, leg: 0, atStop: true, ways: {{}}, food: 5, money: 2, token: 0, kind: 'gold', seen: [], order: null }}))")
        open_story("dragon"); tap(".qt-continue")
        check("river: three ways; the ferry is greyed with too few coins", page.locator(".qt-way").count() == 3 and page.locator(".qt-way[data-way='ferry']").is_disabled())
        home()
        page.evaluate(f"localStorage.setItem('{SAVE('dragon')}', JSON.stringify({{ v: 2, i: 2, leg: 0, atStop: true, ways: {{}}, food: 5, money: 9, token: 0, kind: 'gold', seen: [], order: null }}))")
        open_story("dragon"); tap(".qt-continue"); tap(".qt-way[data-way='ferry']")
        check("river: the ferry costs 4 coins", bag()["money"] == 5, str(bag()))
        home()

        # ---- prizes are given once, even if she leaves mid-stop and comes back
        page.evaluate(f"localStorage.setItem('{SAVE('library')}', JSON.stringify({{ v: 2, i: 2, leg: 0, atStop: true, ways: {{}}, food: 5, money: 9, token: 1, kind: 'red', seen: [], order: null }}))")
        open_story("library"); tap(".qt-continue")
        home(); open_story("library"); tap(".qt-continue")
        tap(".qt-act button:has-text('No thanks')")
        check("library bakery: its page is given once, on leaving", save("library")["token"] == 2, str(save("library")))
        home()

        # ---- broken saves are ignored
        page.evaluate(f"localStorage.setItem('{SAVE('dragon')}', '{{\"v\":2,\"i\":99}}')")
        page.evaluate(f"localStorage.setItem('{SAVE('time')}', '{{\"v\":2,\"i\":1,\"order\":[0,1]}}')")
        open_story("dragon")
        check("bad save: no Continue button", page.locator(".qt-continue").count() == 0)
        tap(".qt-all"); tap(".qt-pick[data-story='time']")
        check("bad shuffled save (wrong order length): no Continue button", page.locator(".qt-continue").count() == 0)
        home()

        # ---- the first version's save and dragons move over once
        page.evaluate("""() => { localStorage.removeItem('spelling-games.quest.dragon.save.v2'); localStorage.removeItem('spelling-games.quest.dragon.found.v1');
          localStorage.setItem('spelling-games.quest.save.v1', JSON.stringify({ v: 1, i: 3, leg: 1, atStop: false, ways: { fork1: 1 }, snacks: 4, coins: 7, color: 'blue', seen: ['fox'] }));
          localStorage.setItem('spelling-games.quest.dragons.v1', JSON.stringify([{ name: 'Ember', color: 'pink', date: '2026-10-24' }])); }""")
        open_story("dragon")
        mig = page.evaluate("({ old: localStorage.getItem('spelling-games.quest.save.v1'), oldD: localStorage.getItem('spelling-games.quest.dragons.v1') })")
        check("old save moved: Continue offered, same place / food / money / fork", page.locator(".qt-continue").count() == 1 and save("dragon")["i"] == 3 and save("dragon")["food"] == 4 and save("dragon")["money"] == 7 and save("dragon")["ways"] == {"fork1": 1} and save("dragon")["kind"] == "blue", str(save("dragon")))
        check("old dragons moved (Ember, pink); old keys removed", found("dragon") == [{"name": "Ember", "kind": "pink", "date": "2026-10-24"}] and mig["old"] is None and mig["oldD"] is None, str(found("dragon")))
        tap(".qt-continue")
        check("moved trip continues 'Back on the trail'", page.locator(".qt-title", has_text="Back on the trail").count() == 1)
        home()

        # ---- phone layout
        page.set_viewport_size({"width": 390, "height": 760})
        picker()
        w1 = page.evaluate("document.documentElement.scrollWidth")
        page.screenshot(path=f"{SHOTS}/quest_picker_phone.png", full_page=True)
        tap(".qt-pick[data-story='pony']"); tap(".qt-new")
        w2 = page.evaluate("document.documentElement.scrollWidth")
        check("phone: no sideways scroll (picker, 8-stop map)", w1 <= 390 and w2 <= 390, f"{w1}, {w2}")
        page.screenshot(path=f"{SHOTS}/quest_phone.png", full_page=True)
        home()

        check("no console/page errors", not errors, "; ".join(errors[:3]))
        b.close()
finally:
    server.terminate()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
