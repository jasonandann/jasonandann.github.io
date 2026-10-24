"""Tests for Dragon Egg Quest: shop sums, a whole trip to the finale, forks, river, snacks, saving, dragons.

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
SAVE = "spelling-games.quest.save.v1"
DRAGONS = "spelling-games.quest.dragons.v1"

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
    if "How many snacks can you buy" in prompt: return n[1] // n[0]
    if "How many coins is that" in prompt: return n[0] * n[1]
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
        def save(): return page.evaluate(f"JSON.parse(localStorage.getItem('{SAVE}'))")
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def bag(): return page.evaluate("({ snacks: +document.querySelector('[data-snacks]').dataset.snacks, coins: +document.querySelector('[data-coins]').dataset.coins })")
        def type_answer(s):
            for ch in s: tap(f".ch-q .key:text-is('{ch}')")
            tap(".ch-q button:has-text('Check')")
        def answer(right=True):
            """Answer the open question (right, or missed twice then OK). Returns the kind."""
            big = page.locator(".ch-q .bigword")
            if big.count():
                t = big.inner_text()
                val = evalmath(t) if "=" in t else word_problem(page.locator(".ch-q .prompt").inner_text())
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
        def opener():
            page.locator(".mcard", has_text="Dragon Egg Quest").first.tap()
            page.wait_for_selector(".qt-setup")

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.5)
        check("menu: Dragon Egg Quest is in the Fun section", page.locator(".sect", has_text="Fun").locator(".mcard", has_text="Dragon Egg Quest").count() == 1)

        # ---- shop sums match their stories, and never need more coins than she could have
        shop = page.evaluate("""async () => { const m = await import('/js/games/quest.js'); const out = [];
          for (const lv of ['add', 't5', 't10', 'div']) for (const coins of [0, 4, 10, 25, 60]) for (let i = 0; i < 40; i++) out.push({ lv, coins, ...m.storeProblem(lv, coins, 'Mr. Pepper') });
          return out; }""")
        bad = [s for s in shop if word_problem(s["prompt"]) != s["answer"] or s["answer"] < 0 or s["snacks"] < 1]
        check("shop word problems: the answer matches the story (800 problems)", not bad, str(bad[:2]))
        check("shop: 'get back' change never goes below zero, divisions are exact", all(s["answer"] >= 0 for s in shop) and all(re.findall(r"\d+", s["prompt"]) and int(re.findall(r"\d+", s["prompt"])[1]) % int(re.findall(r"\d+", s["prompt"])[0]) == 0 for s in shop if s["lv"] == "div"))

        # ---- setup
        opener()
        check("setup: Spelling / Math / Both and math levels", all(page.locator(f".qt-setup button:has-text('{t}')").count() == 1 for t in ["Spelling", "Math", "Both", "Times tables 2–5"]))
        check("setup: no saved trip -> just 'Start the quest!'", page.locator(".qt-continue").count() == 0 and "Start the quest" in page.locator(".qt-new").inner_text())
        page.screenshot(path=f"{SHOTS}/quest_setup.png")
        tap(".qt-setup button:has-text('Math')"); tap(".qt-setup button:has-text('Times tables 2–5')")
        tap(".qt-new")
        check("village: story + map + bag (6 snacks, 10 coins)", "Willow Village" in page.locator(".qt-scene").inner_text() and page.locator(".qt-stop").count() == 8 and bag() == {"snacks": 6, "coins": 10}, str(bag()))
        check("map: forks are ❓ until chosen", page.locator(".qt-stop", has_text="❓").count() == 2)
        n0 = len(page.evaluate("window.__heard"))
        tap(".qt-read")
        check("🔊 Read to me speaks the story", len(page.evaluate("window.__heard")) == n0 + 1 and "dragon egg" in page.evaluate("window.__heard")[-1].lower())
        page.screenshot(path=f"{SHOTS}/quest_village.png")
        tap(".qt-act button:has-text('Buy snacks')")
        check("shop (math): a word problem; the sum itself is hidden", page.locator(".ch-q .bigword").inner_text().startswith("?") and "coins" in page.locator(".ch-q .prompt").inner_text())
        prompt = page.locator(".ch-q .prompt").inner_text()
        cost = int(re.findall(r"\d+", prompt)[0]) * int(re.findall(r"\d+", prompt)[1])
        got = int(re.findall(r"\d+", prompt)[0])
        g0 = gp()
        answer(True)
        bg = bag()
        check("shop: snacks bought, coins paid (never below zero)", bg["snacks"] == 6 + got and bg["coins"] == max(0, 10 - cost), f"{prompt} -> {bg}")
        check("garden point for the shop question", gp() == g0 + 1)
        page.screenshot(path=f"{SHOTS}/quest_shop_done.png")

        # ---- walk the whole trail, picking the short way at fork 1 and the long way at fork 2, ferry if possible
        seen, kinds, guard, misses = set(), [], 0, 0
        while guard < 120:
            guard += 1
            if page.locator(".ch-q").count():
                kinds.append(answer(right=(guard % 4 != 0)))  # miss now and then: never a dead end
                continue
            if page.locator(".qt-way[data-way='ferry']").count():
                seen.add("river")
                page.locator(".qt-way[data-way='raft']").first.tap()
                continue
            ways = page.locator(".qt-way")
            if ways.count():
                title = page.locator(".qt-title").inner_text()
                seen.add(title)
                ways.nth(0 if "fork" in title.lower() else 1).tap()
                continue
            if page.locator(".qt-act button:has-text('Hatch')").count(): break
            st = save()
            if st and st["snacks"] < 0: misses += 1
            page.locator(".qt-act button.primary").first.tap()
        check("trail: reached Dragon Mountain", page.locator(".qt-act button:has-text('Hatch')").count() == 1, f"after {guard} taps")
        check("trail: both forks and the river came up", "A fork in the road" in seen and "Almost there!" in seen and "river" in seen, str(seen))
        st = save()
        check("trail: the fork choices are remembered (bridge, then tower)", st["ways"] == {"fork1": 0, "fork2": 1}, str(st["ways"]))
        check("trail: snacks never go below zero", misses == 0 and st["snacks"] >= 0)
        check("trail: a dozen-plus questions on the way", len(kinds) >= 12, str(len(kinds)))
        check("map: every stop before the mountain is done", page.locator(".qt-stop.done").count() == 7, str(page.locator(".qt-stop.done").count()))
        page.screenshot(path=f"{SHOTS}/quest_mountain.png")

        # ---- the egg hatches; name the dragon
        tap(".qt-act button:has-text('Hatch')")
        check("hatch: a baby dragon and a name box (device keyboard)", page.locator(".qt-dragon.hatched").count() == 1 and page.locator(".qt-act input.text-in").count() == 1)
        page.screenshot(path=f"{SHOTS}/quest_hatch.png")
        page.locator(".qt-act input.text-in").fill("Sparky")
        tap(".qt-name")
        check("end: 'Sparky is home!'", "Sparky is home!" in page.locator(".qt-end").inner_text())
        dr = page.evaluate(f"JSON.parse(localStorage.getItem('{DRAGONS}'))")
        check("dragon saved with its colour; the trip save is cleared", len(dr) == 1 and dr[0]["name"] == "Sparky" and dr[0]["color"] and save() is None, str(dr))
        tap(".qt-end button:has-text('Another quest')")
        check("setup shows the dragons she brought home", "Sparky" in page.locator(".qt-shelf").inner_text())
        home()

        # ---- save and continue; a blank name gets a suggested one
        opener()
        tap(".qt-setup button:has-text('Spelling')")
        tap(".qt-new")
        tap(".qt-act button:has-text('No thanks')")  # leave the village: first trail step
        # spelling questions speak the word inside the tap that showed them
        while page.locator(".ch-q").count() == 0 and page.locator(".qt-title", has_text="Whispering Woods").count() == 0:
            page.locator(".qt-act button.primary").first.tap()
        before = save()
        home()
        opener()
        check("setup: a saved trip offers 'Continue the quest' + 'Start over'", page.locator(".qt-continue").count() == 1 and "Start over" in page.locator(".qt-new").inner_text())
        tap(".qt-continue")
        check("continue: same snacks, coins and place", bag() == {"snacks": before["snacks"], "coins": before["coins"]} and save()["i"] == before["i"], f"{before} vs {bag()}")
        check("continue: 'Back on the trail' or the stop she was at", page.locator(".qt-title", has_text="Back on the trail").count() == 1 or page.locator(".qt-title", has_text="Whispering Woods").count() == 1)
        home()

        # ---- out of snacks: a stop to find food (never a dead end)
        page.evaluate(f"localStorage.setItem('{SAVE}', JSON.stringify({{ v: 1, i: 1, leg: 0, atStop: false, ways: {{}}, snacks: 1, coins: 0, color: 'blue', seen: [] }}))")
        opener()
        tap(".qt-continue")
        n0 = len(page.evaluate("window.__heard"))
        tap(".qt-act button:has-text('Keep going')")
        check("out of snacks: forage scene with a question", "Out of snacks" in page.locator(".qt-scene").inner_text() and page.locator(".ch-q").count() == 1)
        check("spelling question spoken inside the Keep going tap", len(page.evaluate("window.__heard")) > n0)
        answer(False)
        check("forage, not right this time: still finds food (+2)", bag()["snacks"] == 2, str(bag()))
        home()

        # ---- river: ferry needs coins
        page.evaluate(f"localStorage.setItem('{SAVE}', JSON.stringify({{ v: 1, i: 2, leg: 0, atStop: true, ways: {{}}, snacks: 5, coins: 2, color: 'gold', seen: [] }}))")
        opener(); tap(".qt-continue")
        check("river: three ways; ferry greyed with too few coins", page.locator(".qt-way").count() == 3 and page.locator(".qt-way[data-way='ferry']").is_disabled())
        page.screenshot(path=f"{SHOTS}/quest_river.png")
        home()
        page.evaluate(f"localStorage.setItem('{SAVE}', JSON.stringify({{ v: 1, i: 2, leg: 0, atStop: true, ways: {{}}, snacks: 5, coins: 9, color: 'gold', seen: [] }}))")
        opener(); tap(".qt-continue"); tap(".qt-way[data-way='ferry']")
        check("river: the ferry costs 4 coins", bag()["coins"] == 5, str(bag()))
        home()

        # ---- a broken save is ignored
        page.evaluate(f"localStorage.setItem('{SAVE}', '{{\"v\":1,\"i\":99}}')")
        opener()
        check("bad save: no Continue button", page.locator(".qt-continue").count() == 0)
        home()

        # ---- phone layout
        page.set_viewport_size({"width": 390, "height": 760})
        opener(); tap(".qt-new")
        w = page.evaluate("document.documentElement.scrollWidth")
        check("phone: no sideways scroll", w <= 390, str(w))
        page.screenshot(path=f"{SHOTS}/quest_phone.png", full_page=True)
        home()

        check("no console/page errors", not errors, "; ".join(errors[:3]))
        b.close()
finally:
    server.terminate()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
