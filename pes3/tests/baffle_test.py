"""Tests for Baffle (5x5 letter grid), its generator, and the dictionary build.

Run from the repo root:   python3 tests/baffle_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8769
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")
LIST = [l.split("|")[0].strip() for l in Path(FIXTURE).read_text().splitlines() if l.strip() and not l.startswith("#")]

FAKE_TTS = """
window.__spoken = [];
const fake = { speak(u){ window.__spoken.push(u.text); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
"""

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

# ---- dictionary file (built by tools/make_dictionary.py)
dict_words = set(Path(SITE, "dict", "words.txt").read_text().split())
check("dictionary is big", len(dict_words) > 100000, str(len(dict_words)))
check("dictionary keeps 3-12 letter words only", all(3 <= len(w) <= 12 for w in dict_words))
check("dictionary has spy/spies/butterflies", {"spy", "spies", "butterflies"} <= dict_words)
check("blocklist removes words and + endings", not {"shit", "fucking", "spic"} & dict_words)
check("blocklist leaves look-alikes", {"spicy", "spiced", "assess", "cocker", "hello", "shell"} <= dict_words)

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", SITE],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True)
        ctx.add_init_script(FAKE_TTS)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=FIXTURE))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def tap(sel, **kw): page.locator(sel, **kw).first.tap()
        def open_game(name): page.locator(".mcard", has_text=name).first.tap()
        def home(): tap("#back")
        def msg(): return page.locator(".msg").first.inner_text()
        def spoken(): return page.evaluate("window.__spoken")
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def grid(): return page.evaluate("[...document.querySelectorAll('.bf-tile')].map(t => t.textContent.toLowerCase())")
        def center(i):
            bb = page.locator(f".bf-tile[data-i='{i}']").bounding_box()
            return bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        def path_of(word):
            return page.evaluate("async ([g, w]) => (await import('/js/games/baffle.js')).findPath(g, w)", [grid(), word])
        def touch_drag(path):
            cdp = ctx.new_cdp_session(page)
            pts = [center(i) for i in path]
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": pts[0][0], "y": pts[0][1]}]})
            for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
                for t in range(1, 5):
                    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x1 + (x2 - x1) * t / 4, "y": y1 + (y2 - y1) * t / 4}]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            time.sleep(0.15)
        def done(w): return page.locator(f".bf-slots.done[data-w='{w}']").count() == 1
        def lit(cls): return page.evaluate(f"[...document.querySelectorAll('.bf-tile.{cls}')].map(t => +t.dataset.i)")
        def stats(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.baffle.stats.v1')||'{\"words\":{}}')")
        def hint(): tap("button:has-text('Hint')"); time.sleep(0.05)
        def fits(word, start):  # can `word` be traced starting with exactly these tiles?
            return page.evaluate("async ([g, w, s]) => !!(await import('/js/games/baffle.js')).findPath(g, w, s)", [grid(), word, start])
        def mouse_drag(path):
            pts = [center(i) for i in path]
            page.mouse.move(*pts[0]); page.mouse.down()
            for pt in pts[1:]: page.mouse.move(*pt, steps=4)
            page.mouse.up(); time.sleep(0.15)

        page.goto(URL + "?random")  # TEST ONLY: random boards; page.wait_for_selector(".mcard")
        check("menu has 23 cards", page.locator(".mcard").count() == 23)
        check("Baffle is in the Spelling section", page.locator(".sect", has_text="Spelling").locator(".mcard", has_text="Baffle").count() == 1)

        # ---- generator (pure function)
        gen = page.evaluate("""async (words) => { const m = await import('/js/games/baffle.js');
          const out = []; for (let k = 0; k < 3; k++) { const t = performance.now(); const r = m.generate(words);
            out.push({n: r.grid.length, letters: r.grid.every(c => /^[a-z]$/.test(c)), hidden: r.hidden,
                      ok: r.hidden.every(w => m.findPath(r.grid, w)), ms: performance.now() - t}); }
          return out; }""", LIST)
        check("generator makes 25 letters", all(g["n"] == 25 and g["letters"] for g in gen))
        check("generator: every hidden word is traceable", all(g["ok"] for g in gen))
        check("generator hides at least 5 list words", all(len(g["hidden"]) >= 5 for g in gen), str([len(g["hidden"]) for g in gen]))
        check("generator stays within ~0.5 s", all(g["ms"] < 600 for g in gen), str([round(g["ms"]) for g in gen]))
        # look-ahead branches on the example board: T -> I (tip, tin) and T -> E (ten); 'tips' is not a list word
        ex = list("atexx" "cinxx" "qpzxx" "szzxx" "xxxxx")
        br = page.evaluate("async ([g, w]) => (await import('/js/games/baffle.js')).lookaheadBranches(g, w, [1]).map(b => [b.first, [...b.tiles]])", [ex, ["tip", "tin", "ten"]])
        check("look-ahead: one branch per next tile", [b[0] for b in br] == [2, 6], str(br))
        check("look-ahead: word counts per tile", dict(br[1][1]) == {6: 2, 7: 1, 11: 1} and dict(br[0][1]) == {2: 1, 7: 1}, str(br))
        check("look-ahead: S untinted when 'tips' isn't on the list", all(15 not in dict(t) for _, t in br))
        # Jason's board: from H-U, hurry/hurries could go R-R either way and end on either Y or S;
        # only one route per word is tinted, so there's one branch and the spare Y and S stay plain
        hb = list("hnnrp" "uryes" "yrips" "adppr" "lmuts")
        br = page.evaluate("async ([g, w]) => (await import('/js/games/baffle.js')).lookaheadBranches(g, w, [0, 5]).map(b => [b.first, [...b.tiles]])", [hb, ["hurry", "hurries"]])
        check("look-ahead: one route per word, not every route", br == [[6, [[6, 2], [11, 2], [7, 1], [12, 1], [8, 1], [9, 1]]]], str(br))
        yies = "puppy puppies penny pennies study studies carry carries butterfly butterflies lady ladies bunny bunnies dry dries hurry hurries marry marries".split()
        n_yies = page.evaluate("async (w) => (await import('/js/games/baffle.js')).generate(w).hidden.length", yies)
        check("generator: y/ies list hides 10+ of 20", n_yies >= 10, str(n_yies))

        # ---- play
        page.evaluate("['lookahead', 'stats.v1'].forEach(k => localStorage.removeItem('spelling-games.baffle.' + k))")
        open_game("Baffle")
        check("25 tiles", page.locator(".bf-tile").count() == 25)
        page.wait_for_function("fetch('/dict/words.txt').then(() => true)")
        g = grid()
        hidden = [w for w in LIST if path_of(w)]
        check("board hides some list words", len(hidden) >= 3, str(hidden))
        check("slots always shown, one row per hidden word", page.locator(".bf-slots").count() == len(hidden), f"{page.locator('.bf-slots').count()} vs {len(hidden)}")
        check("no Hints toggle any more", page.locator("button:has-text('Hide hints')").count() == 0)
        page.screenshot(path=f"{SHOTS}/baffle.png")

        before, n_spoken = gp(), len(spoken())
        touch_drag(path_of(hidden[0]))
        check("touch drag finds a list word", done(hidden[0]), msg())
        r0 = stats()["words"].get(hidden[0], {})
        check("unhinted find counts toward fluency", r0.get("solo") == 1 and r0.get("streak") == 1 and r0.get("helped") == 0, str(r0))
        check("found word is spoken", hidden[0] in " ".join(spoken()[n_spoken:]), str(spoken()[n_spoken:]))
        check("found word grows the garden", gp() == before + 1, f"{before}->{gp()}")
        mouse_drag(path_of(hidden[0]))
        check("repeat word is gently noted", "already" in msg(), msg())
        check("repeat word does not award", gp() == before + 1)

        # tap mode: tap letters one by one, then tap the last one again
        p1 = path_of(hidden[1])
        for i in p1: page.touchscreen.tap(*center(i))
        check("tapping letters builds the word", page.locator(".bf-current").inner_text().lower() == hidden[1])
        check("Check / Clear shown in tap mode", page.locator("button:has-text('Check')").is_visible() and page.locator("button:has-text('Clear')").is_visible())
        page.touchscreen.tap(*center(p1[-1]))
        check("tapping the last letter again checks it", done(hidden[1]), msg())

        # bonus word + nonsense, found by scanning the real dictionary against this board
        extra = page.evaluate("""async ([g, list]) => { const m = await import('/js/games/baffle.js');
          const dict = (await (await fetch('/dict/words.txt')).text()).split('\\n');
          const bonus = dict.find(w => w.length >= 3 && w.length <= 5 && !list.includes(w) && m.findPath(g, w));
          // nonsense: any 3-tile path that isn't a word
          let fake = null; const set = new Set(dict);
          for (let a = 0; a < 25 && !fake; a++) for (let b = 0; b < 25 && !fake; b++) for (let c = 0; c < 25 && !fake; c++) {
            if (a === b || b === c || a === c || !m.touching(a, b) || !m.touching(b, c)) continue;
            const w = g[a] + g[b] + g[c]; if (!set.has(w) && !list.includes(w)) fake = [a, b, c];
          }
          return {bonus, bonusPath: bonus && m.findPath(g, bonus), fake}; }""", [g, LIST])
        if extra["bonus"]:
            before = gp()
            mouse_drag(extra["bonusPath"])
            check("mouse drag finds a bonus word", page.locator(".chip.bonus", has_text=extra["bonus"]).count() >= 1, f"{extra['bonus']} {msg()}")
            check("bonus word grows the garden", gp() == before + 1)
        else:
            check("board has at least one bonus word", False, "".join(g))
        before = gp()
        mouse_drag(extra["fake"])
        check("non-word gets the gentle message", "don't know that word" in msg(), msg())
        check("non-word does not award", gp() == before)
        page.touchscreen.tap(*center(0)); tap("button:has-text('Clear')")
        check("Clear empties the current word", page.locator(".bf-current").inner_text() == "")
        check("found words fill their slots", page.locator(".bf-slots.done").count() == 2)

        # look-ahead (auto, nothing fluent yet -> on): lit tiles = neighbours that lead to an unfound word
        taken = [hidden[0], hidden[1]] + ([extra["bonus"]] if extra["bonus"] else [])
        check("no look-ahead before the first letter", lit("next") == [])
        target = hidden[2]
        tp = path_of(target)
        page.touchscreen.tap(*center(tp[0]))
        nxt = lit("next")
        check("look-ahead lights the next letter of a hidden word", tp[1] in nxt, f"{nxt} {tp}")
        expect = page.evaluate("""async ([g, start, list, taken]) => { const m = await import('/js/games/baffle.js');
          const words = list.filter(w => !taken.includes(w) && w.startsWith(g[start]));
          return m.neighbours(start).filter(j => words.some(w => m.findPath(g, w, [start, j]))).sort((a, b) => a - b); }""", [grid(), tp[0], LIST, taken])
        check("look-ahead = only tiles toward unfound spelling words", sorted(nxt) == expect, f"{sorted(nxt)} vs {expect}")
        # every remaining path is tinted, one translucent layer per branch through a tile (brute force in Python)
        def nbrs(i): return [r * 5 + c for r in range(i // 5 - 1, i // 5 + 2) for c in range(i % 5 - 1, i % 5 + 2)
                             if 0 <= r < 5 and 0 <= c < 5 and r * 5 + c != i]
        def routes(g, w, p):
            if len(p) == len(w): yield p[:]; return
            for j in nbrs(p[-1]):
                if j not in p and g[j] == w[len(p)]: p.append(j); yield from routes(g, w, p); p.pop()
        g = grid(); want = {}
        for w in [w for w in LIST if w not in taken and len(w) > 1 and w[0] == g[tp[0]]]:
            r = next(routes(g, w, [tp[0]]), None)  # one route per word: the first, as Hint picks it
            if r:
                for c in r[1:]: want.setdefault(c, set()).add(r[1])
        layers = page.evaluate("[...document.querySelectorAll('.bf-tile')].map(t => (t.style.backgroundImage.match(/linear-gradient/g) || []).length)")
        check("look-ahead tints exactly the tiles on remaining paths", {i for i, n in enumerate(layers) if n} == set(want), f"{sorted(i for i, n in enumerate(layers) if n)} vs {sorted(want)}")
        check("one colour layer per branch through a tile", all(layers[c] == len(br) for c, br in want.items()), str(layers))
        rings = page.evaluate("[...document.querySelectorAll('.bf-tile.next')].map(t => t.style.getPropertyValue('--ring'))")
        check("each branch's next tile has its own ring colour", len(set(rings)) == len(rings) and all(rings), str(rings))
        page.touchscreen.tap(*center(tp[1]))
        check("look-ahead follows the path", tp[0] not in lit("next") and tp[1] not in lit("next") and (len(tp) < 3 or tp[2] in lit("next")), str(lit("next")))
        page.screenshot(path=f"{SHOTS}/baffle_lookahead.png")
        tap("button:has-text('Clear')")

        # Hint button: blinks the start, then each next letter on her path; drops a wrong start
        left = sorted([w for w in hidden if w not in taken], key=lambda w: (len(w), w))
        n_spoken = len(spoken())
        hint()
        bl = lit("blink")
        check("hint blinks one tile", len(bl) == 1, str(bl))
        check("hint with no letters blinks the start of the first open slot", bl and fits(left[0], bl), f"{left[0]} {bl}")
        check("hint speaks that word", left[0] in " ".join(spoken()[n_spoken:]), str(spoken()[n_spoken:]))
        check("hinted slot is marked", page.locator(f".bf-slots.now[data-w='{left[0]}']").count() == 1)
        trail = [bl[0]]
        page.touchscreen.tap(*center(bl[0]))
        while len(trail) < len(left[0]):
            hint(); bl = lit("blink")
            if len(bl) != 1 or not fits(left[0], trail + bl): break
            trail += bl; page.touchscreen.tap(*center(bl[0]))
        check("each hint blinks the right next letter (right copy of repeated letters)", len(trail) == len(left[0]), f"{left[0]} {trail}")
        hint()
        check("hint on a finished word says to check it", "Check" in msg(), msg())
        page.touchscreen.tap(*center(trail[-1]))
        check("hinted word is found", done(left[0]), msg())
        r = stats()["words"].get(left[0], {})
        check("hinted find is logged as helped, streak reset", r.get("helped") == 1 and r.get("streak") == 0, str(r))
        # start on a letter no open slot begins with: the hint drops it and blinks a start instead
        firsts = {w[0] for w in left[1:]}
        wrong = next((i for i, c in enumerate(grid()) if c not in firsts), None)
        if wrong is not None and len(left) > 1:
            page.touchscreen.tap(*center(wrong)); hint()
            check("hint drops letters that lead away", page.locator(".bf-current").inner_text() == "", page.locator(".bf-current").inner_text())
            check("then blinks the start of the next open slot", fits(left[1], lit("blink")), f"{left[1]} {lit('blink')}")
        page.screenshot(path=f"{SHOTS}/baffle_hint.png")

        # fluency: auto turns look-ahead off once most list words were found twice in a row unhinted
        page.evaluate("""(list) => localStorage.setItem('spelling-games.baffle.stats.v1',
          JSON.stringify({games: 3, words: Object.fromEntries(list.map(w => [w, {solo: 2, helped: 0, free: 0, streak: 2}]))}))""", LIST)
        home(); open_game("Baffle")
        page.touchscreen.tap(*center(path_of([w for w in LIST if path_of(w)][0])[0]))
        check("auto: look-ahead off once the list is fluent", lit("next") == [], str(lit("next")))
        page.evaluate("localStorage.setItem('spelling-games.baffle.lookahead', 'on')")
        home(); open_game("Baffle")
        page.touchscreen.tap(*center(path_of([w for w in LIST if path_of(w)][0])[0]))
        check("'Always on' overrides fluency", len(lit("next")) > 0)
        page.evaluate("localStorage.setItem('spelling-games.baffle.lookahead', 'off')")
        page.evaluate("localStorage.removeItem('spelling-games.baffle.stats.v1')")
        home(); open_game("Baffle")
        page.touchscreen.tap(*center(path_of([w for w in LIST if path_of(w)][0])[0]))
        check("'Off' turns look-ahead off", lit("next") == [])
        home()
        page.keyboard.type("parent"); page.wait_for_selector(".overlay")
        check("parent panel shows Baffle look-ahead", "Baffle look-ahead" in page.locator(".panel").inner_text())
        tap(".panel button:has-text('Auto')")
        check("parent panel sets look-ahead to Auto", page.evaluate("localStorage.getItem('spelling-games.baffle.lookahead')") == "auto")
        check("parent panel explains auto state", "Auto: on now" in page.locator(".panel").inner_text(), page.locator(".panel").inner_text()[:300])
        page.locator(".panel .pick select").nth(0).select_option("1")
        page.locator(".panel .pick select").nth(1).select_option("0.5")
        fl = page.evaluate("JSON.parse(localStorage.getItem('spelling-games.baffle.fluency'))")
        check("parent panel saves the fluency rule", fl == {"streak": 1, "share": 0.5}, str(fl))
        check("panel text follows the new rule", "1+ times in a row" in page.locator(".panel").inner_text() and f"turns off at {(len(LIST) + 1) // 2}" in page.locator(".panel").inner_text())
        page.keyboard.press("Escape")
        # with streak 1 / 50%, half the list found once unhinted is enough to turn auto off
        page.evaluate("""(list) => localStorage.setItem('spelling-games.baffle.stats.v1',
          JSON.stringify({games: 1, words: Object.fromEntries(list.slice(0, Math.ceil(list.length / 2)).map(w => [w, {solo: 1, helped: 0, free: 0, streak: 1}]))}))""", LIST)
        open_game("Baffle")
        page.touchscreen.tap(*center(path_of([w for w in LIST if path_of(w)][0])[0]))
        check("auto uses the parent's fluency rule", lit("next") == [], str(lit("next")))
        page.evaluate("['fluency', 'stats.v1'].forEach(k => localStorage.removeItem('spelling-games.baffle.' + k))")
        home()
        page.keyboard.type("parent"); page.wait_for_selector(".overlay")
        page.keyboard.press("Escape")
        open_game("Baffle")

        # break prompt after many tries with nothing new; Keep playing, then All done -> peek
        g = grid()
        fake = page.evaluate("""async (g) => { const m = await import('/js/games/baffle.js');
          const set = new Set((await (await fetch('/dict/words.txt')).text()).split('\\n'));
          for (let a = 0; a < 25; a++) for (const b of [a + 1, a + 5]) for (const c of [b + 1, b + 5])
            if (c < 25 && m.touching(a, b) && m.touching(b, c) && !set.has(g[a] + g[b] + g[c])) return [a, b, c];
          return null; }""", g)
        for _ in range(12): mouse_drag(fake)
        check("break prompt appears after a stuck stretch", page.locator(".bf-break").count() == 1)
        check("break copy is friendly", "take a break" in page.locator(".bf-break").inner_text())
        page.screenshot(path=f"{SHOTS}/baffle_break.png")
        tap("button:has-text('Keep playing')")
        check("Keep playing closes it", page.locator(".bf-break").count() == 0)
        tap("button:has-text('All done')")
        check("All done shows a finish screen", page.locator(".finish").count() == 1)
        peek = page.locator("button:has-text('Peek')")
        if peek.count():
            peek.first.tap()
            check("peek reveals hiding words", page.locator(".finish .chips:not([hidden]) .chip").count() > 0)
        tap("button:has-text('New letters')")
        check("New letters starts a fresh board", page.locator(".bf-tile").count() == 25 and page.locator(".bf-slots.done").count() == 0)
        home()

        # TEST ONLY: fixed board (no ?random) and the shared-tile toggle. From B, bunnies and
        # butterflies both end on I-E-S (cells 16, 20, 21), so those tiles are on two branches.
        page3 = ctx.new_page()
        page3.route(URL + "words.txt", lambda r: r.fulfill(body="# test\nbunny\nbunnies\nbutterfly\nbutterflies\n"))
        page3.goto(URL); page3.wait_for_selector(".mcard")
        page3.evaluate("['lookahead', 'stats.v1', 'overlap', 'testboard'].forEach(k => localStorage.removeItem('spelling-games.baffle.' + k))")
        page3.locator(".mcard", has_text="Baffle").first.tap()
        check("test board is the fixed bunny/butterfly board", "".join(page3.locator(".bf-tile").all_inner_texts()) == "UBPHSNEUTNNDRRTYIAFEESLYA")
        page3.locator(".bf-tile[data-i='1']").tap()
        bg = lambda i: page3.evaluate(f"document.querySelector(\".bf-tile[data-i='{i}']\").style.backgroundImage")
        size = lambda i: page3.evaluate(f"document.querySelector(\".bf-tile[data-i='{i}']\").style.backgroundSize")
        check("checkered (default): shared tile is a two-colour checkerboard", bg(16).startswith("conic-gradient") and bg(16).count("rgba(") == 8 and "236, 72, 153" in bg(16) and "20, 184, 166" in bg(16) and size(16) == "50% 50%" and "0.4)" in bg(16), f"{bg(16)} {size(16)}")
        check("checkered: single-branch tile stays one solid colour", "conic" not in bg(15) and bg(15).count("linear-gradient") == 1 and size(15) == "", f"{bg(15)} {size(15)}")
        # TEST ONLY: 3- and 4-way boards (own word lists): from B, T and S are on every branch
        stops = lambda i: bg(i).count("rgba(") // 2
        page3.locator(".bf-test button[data-board='three']").tap(); page3.locator(".bf-tile[data-i='12']").tap()
        cols = lambda i: [c.split(")")[0] for c in bg(i).split("rgba(")[1::2]]  # one entry per slice
        check("3-way board: T and S are one pie, 6 slices = colours 1,2,3,1,2,3, not repeated", all(len(cols(i)) == 6 and cols(i)[:3] == cols(i)[3:] and len(set(cols(i))) == 3 and size(i) == "" for i in (13, 14)), f"{bg(13)} {size(13)}")
        page3.locator(".bf-test button[data-board='four']").tap(); page3.locator(".bf-tile[data-i='12']").tap()
        check("4-way board: T and S checkered in 4 colours", all(stops(i) == 4 and size(i) == "50% 50%" for i in (13, 14)), f"{bg(13)} {size(13)}")
        check("4-way colours: pink, teal, orange, lime", all(c in bg(13) for c in ("236, 72, 153", "20, 184, 166", "249, 115, 22", "132, 204, 22")), bg(13))
        page3.locator(".bf-test button[data-board='bunny']").tap(); page3.locator(".bf-tile[data-i='1']").tap()
        check("back on the bunny board with your words", "".join(page3.locator(".bf-tile").all_inner_texts()) == "UBPHSNEUTNNDRRTYIAFEESLYA" and page3.locator(".bf-slots").count() == 4)
        page3.locator(".bf-test button[data-mode='blend']").tap()
        check("better blend: shared tile stacks two layers with neighbouring hues", "conic" not in bg(16) and bg(16).count("linear-gradient") == 2 and "249, 115, 22" in bg(16) and size(16) == "", bg(16))
        check("toggle keeps her letters selected", page3.locator(".bf-current").inner_text() == "B")
        page3.locator(".bf-test button[data-mode='both']").tap()
        check("both: checkerboard with blend-friendly colours", bg(16).startswith("conic-gradient") and "249, 115, 22" in bg(16), bg(16))
        check("toggle setting is saved", page3.evaluate("localStorage.getItem('spelling-games.baffle.overlap')") == "both")
        page3.evaluate("localStorage.removeItem('spelling-games.baffle.overlap')")
        page3.close()

        # dictionary missing: list words still work, others are not called fake
        page2 = ctx.new_page(); page2.route("**/dict/words.txt", lambda r: r.fulfill(status=404, body=""))
        page2.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page2.goto(URL + "?random")  # TEST ONLY: random boards; page2.wait_for_selector(".mcard")
        page2.locator(".mcard", has_text="Baffle").first.tap()
        g2 = page2.evaluate("[...document.querySelectorAll('.bf-tile')].map(t => t.textContent.toLowerCase())")
        nonword = page2.evaluate("""async (g) => { const m = await import('/js/games/baffle.js');
          for (let a = 0; a < 25; a++) for (const b of [a + 1, a + 5]) for (const c of [b + 1, b + 5])
            if (c < 25 && m.touching(a, b) && m.touching(b, c)) return [a, b, c]; }""", g2)
        w2 = "".join(g2[i] for i in nonword)
        if w2 not in LIST:
            pts = [page2.locator(f".bf-tile[data-i='{i}']").bounding_box() for i in nonword]
            page2.mouse.move(pts[0]["x"] + 30, pts[0]["y"] + 30); page2.mouse.down()
            for bb in pts[1:]: page2.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, steps=4)
            page2.mouse.up(); time.sleep(0.15)
            check("no dictionary: gentle 'word book' message", "word book" in page2.locator(".msg").first.inner_text(), page2.locator(".msg").first.inner_text())
        page2.close()

        # layouts
        for (w, h) in [(1024, 768), (390, 760), (1366, 768)]:
            page.set_viewport_size({"width": w, "height": h})
            open_game("Baffle")
            over = page.evaluate("document.documentElement.scrollWidth > innerWidth")
            check(f"no horizontal overflow at {w}x{h}", not over)
            tile = page.locator(".bf-tile").first.bounding_box()
            check(f"tiles are big enough to tap at {w}x{h}", tile["width"] >= 44, str(round(tile["width"])))
            page.screenshot(path=f"{SHOTS}/baffle_{w}x{h}.png")
            home()
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
