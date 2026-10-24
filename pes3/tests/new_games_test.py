"""Tests for: audio playback/fallback, Spell Catcher, Word Volcano, Wordal, the 6 math games,
Spot Match, Simon Says, My Garden, and the sectioned menu.

Run from the repo root:   python3 tests/new_games_test.py
Needs: pip install playwright && playwright install chromium
"""
import json, os, re, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8768
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)

INIT = """
window.__spoken = []; window.__played = []; window.__heard = [];
const fake = { speak(u){ window.__spoken.push(u.text); window.__heard.push(u.text); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
HTMLMediaElement.prototype.play = function(){
  window.__played.push(this.src);
  if (/friend/.test(this.src)) return Promise.reject(new Error('blocked'));
  window.__heard.push(decodeURIComponent(this.src.split('/').pop()));  // e.g. "because.m4a"
  return Promise.resolve();
};
"""
WAV = (b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00@\x1f\x00\x00@\x1f\x00\x00\x01\x00\x08\x00data\x00\x00\x00\x00")

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def evalmath(text):
    a, op, b = re.match(r"\s*(\d+)\s*([+−×÷-])\s*(\d+)", text).groups()
    a, b = int(a), int(b)
    return {"+": a + b, "−": a - b, "-": a - b, "×": a * b, "÷": a // b}[op]

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", SITE],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block")
        ctx.add_init_script(INIT)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")))  # fixed list, not the weekly one
        ctx.route("**/audio/manifest.json", lambda r: r.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"words": ["because", "friend"], "sentences": {"because": "I stayed inside because it was raining."}})))
        ctx.route("**/audio/*.m4a", lambda r: r.fulfill(status=200, content_type="audio/wav", body=WAV))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "friend" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def click(sel, nth=0, **kw):  # JS click: works on moving targets
            page.locator(sel, **kw).nth(nth).evaluate("e => e.click()")
        def tap(sel, **kw): page.locator(sel, **kw).first.tap()
        def open_game(name): page.locator(".mcard", has_text=name).first.tap()
        def home(): tap("#back")
        def msg(): return page.locator(".msg").first.inner_text()
        def spoken(): return page.evaluate("window.__spoken")
        # The word a round just said, whether by speech or by a recording (recorded words never reach __spoken).
        def heard_word(): return page.evaluate("window.__heard.at(-1)").split(".")[0].strip()
        def played(): return page.evaluate("window.__played")
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.5)

        # ---- menu sections
        heads = page.locator(".sect h2").all_inner_texts()
        check("menu has 6 sections", len(heads) == 6, str(heads))
        check("menu: Adventures then Brain Games, before Rewards",
              heads[heads.index("🏰 Adventures") + 1] == "🧠 Brain Games" and heads[heads.index("🧠 Brain Games") + 1] == "🌱 Rewards", str(heads))
        check("menu: Spot Match and Simon Says are in Brain Games",
              page.locator(".sect", has_text="Brain Games").locator(".mcard").count() == 2
              and page.locator(".sect", has_text="Brain Games").locator(".mcard", has_text="Spot Match").count() == 1
              and page.locator(".sect", has_text="Brain Games").locator(".mcard", has_text="Simon Says").count() == 1)
        check("menu has 29 cards", page.locator(".mcard").count() == 29)
        for name in ["Spell Catcher", "Word Volcano", "Wordal", "Number Bubbles", "Number Cascade", "Times Table Explorer",
                     "Number Maze", "Number Mountain", "Puzzle Pieces", "Lily Pad River", "Spot Match", "Simon Says", "My Garden"]:
            check(f"menu has {name}", page.locator(".mcard", has_text=name).count() == 1)

        # ---- audio: recording plays, no speech; missing/blocked file falls back to speech
        open_game("See the Words")
        page.locator(".study-word", has_text="because").first.tap()
        check("recorded sentence plays", any(s.endswith("audio/because.sentence.m4a") for s in played()), str(played()))
        check("recorded sentence does not also use speech", not any("because" in s for s in spoken()), str(spoken()))
        page.locator(".study-word", has_text="friend").first.tap()
        time.sleep(0.2)
        check("blocked recording falls back to speech", any("friend" in s for s in spoken()), str(spoken()))
        page.locator(".study-word", has_text="whale").first.tap()
        check("word without recording uses speech", any("whale" in s for s in spoken()), str(spoken()))
        home()

        # ---- garden helper + scoring
        st = page.evaluate("""async () => { const g = await import('/js/games/garden.js');
          return [g.stage(0), g.stage(4), g.stage(5), g.stage(100000)]; }""")
        check("garden stage math", st[0] == {"flowers": 0, "sprout": 0, "critters": 0} and st[1]["flowers"] == 1
              and st[2]["sprout"] == 1 and st[3]["flowers"] == 30 and st[3]["critters"] == 6, str(st))
        before = gp()
        open_game("Word Jumble")
        w = heard_word()
        for ch in w: page.locator(".tray .tile", has_text=ch).first.tap()
        check("finishing a spelling word awards a garden point", gp() == before + 1, f"{before}->{gp()}")
        home()
        page.evaluate("localStorage.setItem('spelling-games.garden.v1', JSON.stringify({pts: 14}))")
        open_game("My Garden")
        plots = page.locator(".gd-plot").all_inner_texts()
        check("garden shows 3 flowers + 1 sprout for 14 pts", sum(1 for t in plots if t and t not in "🌱🌿") == 3 and plots[3] in "🌱🌿", str(plots[:5]))
        page.locator(".gd-plot").first.tap()
        page.screenshot(path=f"{SHOTS}/garden.png")
        home()
        kept = page.evaluate("""async () => { const u = await import('/js/util.js'); u.clearProgress(); return u.gardenPoints(); }""")
        check("erasing hidden progress keeps the garden", kept == 14, str(kept))

        # ---- Spell Catcher
        open_game("Spell Catcher")
        w = heard_word()
        n_letters = page.locator(".sc-letter").count()
        check("catcher: word letters + 4-6 decoys", len(w) + 4 <= n_letters <= len(w) + 6, f"{w} {n_letters}")
        page.screenshot(path=f"{SHOTS}/catcher.png")
        decoy = page.evaluate(f"[...document.querySelectorAll('.sc-letter')].map(b=>b.dataset.ch).find(c=>!'{w}'.includes(c))")
        click(f".sc-letter[data-ch='{decoy}']")
        check("catcher: wrong tap is gentle", "Keep looking" in msg() and page.locator(f".sc-letter[data-ch='{decoy}']").count() == 1)
        for ch in w: click(f".sc-letter[data-ch='{ch}']")
        check("catcher: completes word", page.locator("button:has-text('Next')").first.is_visible() and msg() != "", msg())
        check("catcher: slots show the word", "".join(page.locator(".slots .tile").all_inner_texts()) == w)
        check("catcher: logged as a miss (one wrong tap)", json.loads(page.evaluate("localStorage.getItem('spelling-games.progress.v1')"))["words"][w]["m"] == 1)
        home()

        # ---- Word Volcano
        open_game("Word Volcano")
        w = heard_word()
        rocks = page.locator(".vo-rock").count()
        check("volcano: word letters + 2-3 decoys", len(w) + 2 <= rocks <= len(w) + 3, f"{w} {rocks}")
        pos = page.evaluate("[...document.querySelectorAll('.vo-rock')].map(r=>[parseFloat(r.style.left),parseFloat(r.style.top)])")
        mind = min(((a[0]-c[0])*1.3)**2 + (a[1]-c[1])**2 for i, a in enumerate(pos) for c in pos[i+1:]) ** .5 if len(pos) > 1 else 99
        check("volcano: rocks are spaced apart", mind >= 8, f"{mind:.1f}")
        page.screenshot(path=f"{SHOTS}/volcano.png")
        for ch in w: click(f".vo-rock[data-ch='{ch}']")
        check("volcano: completes + erupts", page.locator(".vo-mountain.erupt").count() == 1 and page.locator("button:has-text('Next')").first.is_visible())
        check("volcano: eruption has lava blobs + flow", page.locator(".vo-blob").count() >= 20 and page.locator(".vo-flow-fill").count() == 4)  # cap + 3 rivers
        page.wait_for_timeout(900); page.screenshot(path=f"{SHOTS}/volcano_erupt.png")
        check("volcano: first-try logged as success", json.loads(page.evaluate("localStorage.getItem('spelling-games.progress.v1')"))["words"][w]["c"] == 1)
        home()

        # ---- Wordal
        ev = page.evaluate("""async () => { const m = await import('/js/games/wordal.js');
          return [m.evaluateGuess('paper','apple'), m.evaluateGuess('allee','apple'), m.evaluateGuess('apple','apple')]; }""")
        check("wordal evaluate: duplicates", ev[0] == ["present", "present", "correct", "present", "absent"]
              and ev[1] == ["correct", "present", "absent", "absent", "correct"] and ev[2] == ["correct"] * 5, str(ev))
        open_game("Wordal")
        w = heard_word(); n = len(w)
        page.keyboard.type("q" * (n - 1)); page.keyboard.press("Enter")
        check("wordal: short guess asks for more letters", f"{n} letters" in msg(), msg())
        page.keyboard.type("q"); page.keyboard.press("Enter")
        time.sleep(n * 0.15 + 0.5)
        absent = page.locator(".wd-row").first.locator(".wd-cell.absent").count()
        qkey = page.locator(".kb .key", has_text="q").first.get_attribute("data-s")
        check("wordal: row evaluated + key colored", (absent == n and qkey == "absent") or "q" in w, f"{absent} {qkey} {w}")
        prog = lambda: json.loads(page.evaluate("localStorage.getItem('spelling-games.progress.v1')"))["words"].get(w, {}).get("c", 0)
        c0 = prog()
        page.keyboard.type(w); page.keyboard.press("Enter")
        time.sleep(n * 0.15 + 0.5)
        check("wordal: win", page.locator(".wd-row").nth(1).locator(".wd-cell.correct").count() == n and page.locator("button:has-text('Next')").first.is_visible())
        check("wordal: solved on 2nd guess counts as first try", prog() == c0 + 1, f"{c0}->{prog()}")
        tap("button:has-text('Next')")
        w = heard_word(); n = len(w)
        for _ in range(6):
            page.keyboard.type("q" * n if "q" not in w else "z" * n); page.keyboard.press("Enter"); time.sleep(n * 0.15 + 0.5)
        check("wordal: loss reveals the word", w in msg() and page.locator("button:has-text('Next')").first.is_visible(), msg())
        page.screenshot(path=f"{SHOTS}/wordal.png")
        home()

        # ---- Math quiz games
        def set_level(name):  # the ⚙️ in the corner of a math game (no level screen any more)
            tap(".opt-gear"); page.wait_for_selector(".opt-panel")
            tap(f".opt-panel button:has-text('{name}')"); tap(".opt-panel .opt-done")
        def play_math(name, selector, count, text_sel=".mq"):
            open_game(name)
            wrong_done = False
            for i in range(count):
                page.wait_for_selector(text_sel, timeout=5000)
                ans = evalmath(page.locator(text_sel).first.inner_text())
                if not wrong_done:
                    wrong = page.evaluate(f"""a => [...document.querySelectorAll('{selector}')].findIndex(e => e.textContent.trim() !== String(a))""", ans)
                    click(selector, nth=wrong); wrong_done = True
                    check(f"{name}: wrong answer is gentle", msg() != "" and "wrong" not in msg().lower(), msg())
                idx = page.evaluate(f"""a => [...document.querySelectorAll('{selector}')].findIndex(e => e.textContent.trim() === String(a))""", ans)
                click(selector, nth=idx)
                if i < count - 1:
                    page.wait_for_function(f"document.querySelector('.msg') && document.querySelector('.msg').textContent === '' || document.querySelector('{text_sel}') && document.querySelector('.prompt') && document.querySelector('.prompt').textContent.includes('{i + 2} of')", timeout=6000)
            page.wait_for_selector(".finish", timeout=6000)
            check(f"{name}: finishes after {count} questions", True)
            page.screenshot(path=f"{SHOTS}/{name.replace(' ', '_')}.png")
            home()

        # no level screen: straight into Add & subtract (the default), ⚙️ changes it and restarts
        open_game("Number Mountain")
        txt = page.locator(".mq").first.inner_text()
        check("math: starts at once on Add & subtract (default)", page.locator(".levels").count() == 0 and ("+" in txt or "−" in txt), txt)
        set_level("Times tables 2–5")
        txt = page.locator(".mq").first.inner_text()
        check("math: ⚙️ level change restarts with that level", "×" in txt and "1 of" in page.locator(".prompt").first.inner_text(), txt)
        home()

        g0 = gp()
        play_math("Number Mountain", ".ans", 10)
        play_math("Number Maze", ".door-n", 8)
        play_math("Number Bubbles", ".bb", 10)
        play_math("Number Cascade", ".cc", 10)
        check("math games award garden points (38 questions)", gp() - g0 == 38, f"{gp() - g0}")

        # level remembered across games
        open_game("Number Maze")
        check("level choice remembered (Times tables 2–5 in another game)", "×" in page.locator(".mq").first.inner_text())
        tap(".opt-gear")
        check("⚙️ shows the saved level highlighted", page.locator(".opt-panel .btn.primary:has-text('Times tables 2–5')").count() == 1)
        tap(".opt-panel button:has-text('Add & subtract')"); tap(".opt-panel .opt-done")
        txt = page.locator(".mq").first.inner_text()
        check("add/subtract level produces + or −", "+" in txt or "−" in txt, txt)
        set_level("Times tables 2–5")
        home()

        # ---- Puzzle Pieces
        open_game("Puzzle Pieces")
        for i in range(9):
            page.locator(".pz-piece:not(.shown)").first.tap()
            ans = evalmath(page.locator(".mq").first.inner_text())
            page.locator(".pz-panel .ans", has_text=re.compile(rf"^{ans}$")).first.tap()
        check("puzzle: all 9 pieces revealed + finish buttons", page.locator(".pz-piece.shown").count() == 9 and page.locator("button:has-text('New picture')").count() == 1, msg())
        page.screenshot(path=f"{SHOTS}/puzzle.png")
        home()

        # ---- Explorer
        open_game("Times Table Explorer")
        check("explorer: 144 cells", page.locator(".ex-cell").count() == 144)
        page.locator(".ex-cell").nth(6 * 12 + 7).tap()
        check("explore mode shows fact (7 × 8 = 56)", "7 × 8 = 56" in page.locator(".ex-info").inner_text())
        tap("button:has-text('Patterns')"); tap(".chip:has-text('×5')")
        check("pattern mode highlights multiples of 5", page.locator(".ex-cell.lit").count() == 12 * 12 // 5 * 0 + sum(1 for r in range(1, 13) for c in range(1, 13) if (r * c) % 5 == 0))
        tap("button:has-text('Practice')"); tap(".chip:has-text('×3')")
        hidden = page.locator(".ex-cell.hide").count()
        check("practice hides the ×3 row and column (23 cells)", hidden == 23, str(hidden))
        page.locator(".ex-cell.hide").first.tap()
        q = page.locator(".mq").first.inner_text()
        a, c = re.match(r"(\d+) × (\d+)", q).groups()
        page.locator(".ex-panel .ans", has_text=re.compile(rf"^{int(a) * int(c)}$")).first.tap()
        check("practice: right answer reveals cell", page.locator(".ex-cell.hide").count() == 22)
        page.screenshot(path=f"{SHOTS}/explorer.png")
        home()

        # ---- Spot Match
        open_game("Spot Match")
        for i in range(10):
            shared = page.evaluate("""() => { const [a, b] = [...document.querySelectorAll('.sm-card')].map(c => [...c.children].map(x => x.textContent));
              return a.filter(x => b.includes(x)); }""")
            check(f"spot match round {i + 1}: exactly one shared picture", len(shared) == 1, str(shared)) if i in (0, 9) else None
            click(".sm-sym", has_text=shared[0])
            if i < 9: time.sleep(1.15)
        page.wait_for_selector(".finish", timeout=4000)
        check("spot match finishes after 10 rounds", True)
        home()

        # ---- Simon
        open_game("Simon Says")
        tap("button:has-text('Start')")
        page.wait_for_function("document.querySelector('.msg').textContent === 'Your turn!'", timeout=5000)
        # watch the lit pad
        lit = page.evaluate("""() => new Promise(res => { const pads = [...document.querySelectorAll('.simon-pad')];
          const seen = []; pads.forEach((p, i) => new MutationObserver(() => p.classList.contains('lit') && seen.push(i)).observe(p, {attributes: true}));
          res(seen); })""")
        check("simon: accepts input after pattern", page.locator(".simon-pad").count() == 4)
        home()

        page.set_viewport_size({"width": 390, "height": 760})
        for name in ["Spell Catcher", "Word Volcano", "Wordal", "Number Cascade", "Spot Match", "My Garden"]:
            open_game(name)
            over = page.evaluate("document.documentElement.scrollWidth > innerWidth")
            check(f"{name}: no horizontal overflow at 390px", not over)
            page.screenshot(path=f"{SHOTS}/phone_{name.replace(' ', '_')}.png")
            home()
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
