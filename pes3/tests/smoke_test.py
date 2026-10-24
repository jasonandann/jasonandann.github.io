import os, tempfile
from pathlib import Path
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8765
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
import os; os.makedirs(SHOTS, exist_ok=True)

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

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", SITE],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block", is_mobile=False)
        ctx.add_init_script(FAKE_TTS)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")))  # fixed list, not the weekly one
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def spoken_word():
            return page.evaluate("window.__spoken[window.__spoken.length-1]").split(".")[0].strip()
        def tap(sel, **kw):
            page.locator(sel, **kw).first.tap()
        def open_game(name):
            page.locator(".mcard", has_text=name).first.tap()
        def home():
            tap("#back")
        def unlock(pin="1234"):
            # grown-ups passcode (issue #32; tests/parent_test.py): set it the first time, else type it
            page.wait_for_selector(".overlay .pin-pad, .overlay h2:has-text('Grown-ups only')")
            if page.locator(".overlay .pin-pad").count():
                setup = page.locator(".overlay h2", has_text="Set a").count() == 1
                page.keyboard.type(pin); page.keyboard.press("Enter")
                if setup:
                    page.keyboard.type(pin); page.keyboard.press("Enter")
                    tap(".overlay [data-act='saved']")
            page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        def msg():
            return page.locator(".msg").first.inner_text()
        def progress():
            return json.loads(page.evaluate("localStorage.getItem('spelling-games.progress.v1')") or "{}")

        # ---- load + menu
        page.goto(URL); page.wait_for_selector(".mcard")
        check("menu shows 29 cards", page.locator(".mcard").count() == 29)
        check("list title shown", "Week of Oct 26" in page.locator(".listname").inner_text())
        page.screenshot(path=f"{SHOTS}/menu.png")

        # ---- jumble: solve first try
        open_game("Word Jumble"); w = spoken_word()
        check("jumble speaks word on start", len(w) > 0 and w.isalpha(), w)
        page.screenshot(path=f"{SHOTS}/jumble.png")
        for ch in w:
            page.locator(".tray .tile", has_text=ch).first.tap()
        check("jumble solved -> cheer", msg() != "" and page.locator(".slots.good").count() == 1, msg())
        check("jumble Next visible", page.locator("button:has-text('Next')").first.is_visible())
        p1 = progress()
        check("jumble logged a first-try success", p1["words"].get(w, {}).get("c") == 1, str(p1))
        tap("button:has-text('Next')"); w2 = spoken_word()
        # wrong x3 -> reveal
        for attempt in range(3):
            letters = list(w2)
            # put letters in deliberately wrong order (reverse), unless palindrome-like
            wrong = letters[::-1] if letters[::-1] != letters else letters[1:] + letters[:1]
            for ch in wrong:
                if page.locator(".slots .tile.slot:not(.filled)").count() == 0: break
                page.locator(".tray .tile", has_text=ch).first.tap()
            time.sleep(1.1)  # wait for reset or reveal
        txt = msg()
        check("jumble reveals after 3 misses", "Here is the word" in txt, txt)
        p2 = progress()
        check("jumble logged miss", p2["words"].get(w2, {}).get("m") == 1, str(p2["words"].get(w2)))
        home()

        # ---- fill blanks
        open_game("Fill the Blanks"); w = spoken_word()
        blanks = page.locator(".slots .tile.slot").count()
        check("fill has blanks", 1 <= blanks < len(w), f"{blanks} of {len(w)}")
        # wrong letter first on first blank
        sel_idx = page.evaluate("[...document.querySelectorAll('.slots > *')].findIndex(e=>e.classList.contains('sel'))")
        wrong = next(c for c in "qxzjv" if c != w[sel_idx])
        page.locator(".kb .key", has_text=wrong).first.tap()
        check("fill wrong letter gentle msg", "different letter" in msg().lower(), msg())
        for _ in range(blanks):
            idx = page.evaluate("[...document.querySelectorAll('.slots > *')].findIndex(e=>e.classList.contains('sel'))")
            if idx < 0: break
            page.locator(".kb .key", has_text=w[idx]).first.tap()
        check("fill completed", page.locator(".slots.good").count() == 1 and msg() != "", msg())
        page.screenshot(path=f"{SHOTS}/fill.png")
        home()

        # ---- listen & type: wrong, wrong(reveal), right
        open_game("Listen & Type"); w = spoken_word()
        def type_word(s):
            for ch in s:
                page.locator(".kb .key", has_text=ch).first.tap()
        type_word("zz"); tap("button:has-text('Check')")
        check("typeit wrong 1 -> retry msg", "hear it again" in msg(), msg())
        type_word("zz"); tap("button:has-text('Check')")
        check("typeit wrong 2 -> reveal shown", page.locator(".reveal").is_visible() and page.locator(".reveal").inner_text() == w)
        type_word(w); tap("button:has-text('Check')")
        check("typeit solved after reveal", page.locator(".typed.good").count() == 1)
        check("typeit logged as miss", progress()["words"][w]["m"] >= 1)
        page.screenshot(path=f"{SHOTS}/typeit.png")
        # physical keyboard path on next word
        tap("button:has-text('Next')"); w = spoken_word()
        page.keyboard.type(w); page.keyboard.press("Enter")
        check("typeit physical keyboard works", page.locator(".typed.good").count() == 1)
        home()

        # ---- look cover write check
        open_game("Look, Cover"); w = spoken_word()
        check("lcwc shows big word", page.locator(".bigword").inner_text() == w)
        tap("button:has-text('Cover it')")
        check("lcwc hides word", page.locator(".bigword").count() == 0)
        type_word("zz"); tap("button:has-text('Check')")
        check("lcwc wrong -> look again offered", page.locator("button:has-text('Look again')").count() == 1)
        tap("button:has-text('Look again')"); tap("button:has-text('Cover it')")
        type_word(w); tap("button:has-text('Check')")
        check("lcwc solved on 2nd try", page.locator(".compare .ok").count() == len(w))
        home()

        # ---- memory
        open_game("Memory Match")
        words = page.eval_on_selector_all(".card .back", "els=>els.map(e=>e.textContent)")
        check("memory has 12 cards (6 pairs)", len(words) == 12 and len(set(words)) == 6, str(words))
        page.screenshot(path=f"{SHOTS}/memory.png")
        # mismatch + lock
        i = 0; j = next(k for k in range(12) if words[k] != words[i]); k3 = next(k for k in range(12) if k not in (i, j))
        cards = page.locator(".card")
        cards.nth(i).tap(); cards.nth(j).tap(); cards.nth(k3).tap()
        check("memory locks during mismatch", page.locator(".card.open").count() == 2)
        time.sleep(1.5)
        check("memory flips mismatch back", page.locator(".card.open").count() == 0)
        by = {}
        for idx, wd in enumerate(words): by.setdefault(wd, []).append(idx)
        for wd, (a, c) in by.items():
            cards.nth(a).tap(); cards.nth(c).tap()
        check("memory win message", "matched them all" in msg(), msg())
        check("memory play-again/home buttons", page.locator("button:has-text('Play again')").count() == 1)
        home()

        # ---- word search
        open_game("Word Search")
        info = page.evaluate("""() => {
          const g = document.querySelector('.ws-grid'); const n = +g.style.getPropertyValue('--n');
          const grid = Array.from({length:n},()=>Array(n).fill(''));
          document.querySelectorAll('.cell').forEach(c=>{ grid[+c.dataset.r][+c.dataset.c] = c.textContent; });
          const words = [...document.querySelectorAll('.chip')].map(c=>c.textContent.toUpperCase());
          return {n, grid, words};
        }""")
        n, grid, wl = info["n"], info["grid"], info["words"]
        check("wordsearch grid sized 8-12", 8 <= n <= 12, str(n))
        check("wordsearch has <=6 words", 1 <= len(wl) <= 6, str(wl))
        def find(word):
            for dr, dc in [(0,1),(1,0),(1,1)]:
                for r in range(n):
                    for c in range(n):
                        er, ec = r+dr*(len(word)-1), c+dc*(len(word)-1)
                        if er >= n or ec >= n: continue
                        if all(grid[r+dr*k][c+dc*k] == word[k] for k in range(len(word))):
                            return (r, c), (er, ec)
            return None
        def center(rc):
            bb = page.locator(f".cell[data-r='{rc[0]}'][data-c='{rc[1]}']").bounding_box()
            return bb["x"] + bb["width"]/2, bb["y"] + bb["height"]/2
        spots = {w: find(w) for w in wl}
        check("wordsearch: every word is findable in the grid", all(spots.values()), str([w for w,s in spots.items() if not s]))
        page.screenshot(path=f"{SHOTS}/wordsearch.png")
        ordered = list(spots.items())
        # word 0: tap-tap (touch)
        (s, e) = ordered[0][1]
        (x1, y1), (x2, y2) = center(s), center(e)
        page.touchscreen.tap(x1, y1); page.touchscreen.tap(x2, y2)
        found = lambda: page.locator(".chip.found").count()
        check("wordsearch tap-tap selects a word", found() == 1, str(found()))
        # word 1: real touch drag through CDP
        if len(ordered) > 1:
            (s, e) = ordered[1][1]
            (x1, y1), (x2, y2) = center(s), center(e)
            cdp = ctx.new_cdp_session(page)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x1, "y": y1}]})
            for t in range(1, 6):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x1+(x2-x1)*t/5, "y": y1+(y2-y1)*t/5}]})
            # Rest the finger before lifting. Lifting at full speed starts a fling in Chromium, and the next
            # tap within ~1 s only stops the fling: no click (it made the Home tap below flaky).
            time.sleep(0.15)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            time.sleep(0.2)
            check("wordsearch touch-drag selects a word", found() == 2, str(found()))
        # a wrong drag should be silently ignored
        page.mouse.move(*center((0, 0))); page.mouse.down(); page.mouse.move(*center((0, 1)), steps=2); page.mouse.up()
        # remaining: mouse drag
        for w_, (s, e) in ordered[2:]:
            (x1, y1), (x2, y2) = center(s), center(e)
            page.mouse.move(x1, y1); page.mouse.down(); page.mouse.move(x2, y2, steps=6); page.mouse.up()
        time.sleep(0.2)
        check("wordsearch all words found + win", "found them all" in msg(), f"{found()}/{len(wl)} {msg()}")
        home()

        # ---- study list
        open_game("See the Words")
        check("study lists all 12 words", page.locator(".study-word").count() == 12)
        page.locator(".study-word", has_text="because").first.tap()
        check("study speaks word + sentence", "because" in spoken_word() and "raining" in page.evaluate("window.__spoken.at(-1)"))
        home()

        # ---- hidden parent panel
        check("no parent UI visible on menu", page.locator("text=Grown-ups").count() == 0 and page.locator("text=progress").count() == 0)
        for _ in range(5): page.locator("#title").tap()
        page.wait_for_selector(".overlay")
        check("5 taps ask for a grown-ups passcode first", page.locator(".overlay .pin-pad").count() == 1)
        unlock()
        check("parent panel opens via 5 taps", "Grown-ups only" in page.locator(".panel h2").inner_text())
        check("parent panel lists 12 words", page.locator(".panel table").first.locator("tbody tr").count() == 12)
        page.screenshot(path=f"{SHOTS}/parent.png")
        tap(".panel button:has-text('Close')")
        check("parent panel closes", page.locator(".overlay").count() == 0)
        page.keyboard.type("parent")
        check("parent panel opens via typing 'parent'", page.locator(".overlay").count() == 1)
        page.keyboard.press("Escape")
        check("parent panel closes with Escape", page.locator(".overlay").count() == 0)
        # parent keys must NOT fire inside a game
        open_game("Listen & Type"); page.keyboard.type("parent")
        check("typing 'parent' in a game does not open panel", page.locator(".overlay").count() == 0)
        home()

        # ---- phone-size layout sanity
        page.set_viewport_size({"width": 390, "height": 760})
        open_game("Memory Match"); page.screenshot(path=f"{SHOTS}/memory_phone.png"); home()
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
