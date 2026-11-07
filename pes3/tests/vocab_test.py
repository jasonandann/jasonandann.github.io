"""Tests for the Vocabulary section: vocab.txt parsing (js/vocab.js), Match the Meaning (drag and tap),
Word Wise (multiple choice), layouts without scrolling, and a missing vocab.txt.

Run from the repo root:   python3 tests/vocab_test.py
Needs: pip install playwright && playwright install chromium
"""
import json, os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8784
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
POS = ["noun", "verb", "adjective", "adverb"]

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

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", SITE],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block")
        ctx.add_init_script(INIT)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=os.path.join(FIX, "words.txt")))
        ctx.route(URL + "vocab.txt", lambda r: r.fulfill(path=os.path.join(FIX, "vocab.txt")))
        ctx.route("**/audio/manifest.json", lambda r: r.fulfill(status=404))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "404" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        cdp = ctx.new_cdp_session(page)

        def tap(sel, **kw): page.locator(sel, **kw).first.tap()
        def heard(): return page.evaluate("window.__heard.slice()")
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def vprog(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.vocab.progress.v1')||'{\"words\":{}}').words")
        def msg(): return page.locator(".game .msg").first.inner_text()
        def no_scroll():
            return page.evaluate("[document.documentElement.scrollHeight <= innerHeight + 1, document.documentElement.scrollWidth <= innerWidth + 1,"
                                 " document.documentElement.scrollHeight, innerHeight]")
        def open_game(name):
            page.goto(URL); page.wait_for_selector(".mcard")
            tap(".mcard", has_text=name)
        def center(loc):
            bb = loc.bounding_box(); return bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        def drag(src, dst, steps=8, rest=0.15):  # a real touch drag (CDP); rests before lifting (no fling, see CLAUDE.md)
            (x0, y0), (x1, y1) = center(src), center(dst)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0, "id": 1}]})
            for i in range(1, steps + 1):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + (x1 - x0) * i / steps, "y": y0 + (y1 - y0) * i / steps, "id": 1}]})
            time.sleep(rest)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            time.sleep(0.25)

        page.goto(URL); page.wait_for_selector(".mcard")

        # ---- parsing
        parsed = page.evaluate("""async () => { const v = await import('/js/vocab.js');
          return v.parseVocab(await (await fetch('/vocab.txt')).text()); }""")
        W = {e["word"]: e for e in parsed["words"]}
        check("vocab: title from the first # line", parsed["title"] == "Vocab fixture", parsed["title"])
        check("vocab: duplicates ignored (case-insensitive)", len(parsed["words"]) == 11 and W["brave"]["pos"] == "adjective", str(len(parsed["words"])))
        check("vocab: abbreviations become full names (adj., v)", W["curious"]["pos"] == "adjective" and W["examine"]["pos"] == "verb")
        check("vocab: 'word | meaning' = meaning, no part of speech", W["predict"]["pos"] == "" and W["predict"]["def"].startswith("to say"))
        check("vocab: 'word | noun' = part of speech, no meaning", W["shelter"]["pos"] == "noun" and W["shelter"]["def"] == "")
        sizes = page.evaluate("async () => { const m = await import('/js/games/vocabmatch.js'); return [2,3,4,5,7,10,12].map(m.boardSizes); }")
        check("match: board sizes never leave a board of one", sizes == [[2], [3], [2, 2], [3, 2], [3, 2, 2], [3, 3, 2, 2], [3, 3, 3, 3]], str(sizes))

        # ---- menu
        heads = page.locator(".sect h2").all_inner_texts()
        check("menu: Vocabulary section right after Spelling", heads[1] == "📚 Vocabulary", str(heads))
        check("menu: 3 vocabulary games", page.locator(".sect", has_text="Vocabulary").locator(".mcard").count() == 3)
        check("menu has 34 cards", page.locator(".mcard").count() == 34)

        # ---- Match the Meaning: drag meanings onto words (board 1 with Mix)
        open_game("Match the Meaning"); page.wait_for_selector(".vm-spot")
        check("match: 3 words and 3 meaning cards", page.locator(".vm-spot.vm-word").count() == 3 and page.locator(".vm-card.vm-def").count() == 3)
        check("match: board 1 asks to drag meanings", "meaning" in page.locator(".prompt").inner_text())
        r = no_scroll()
        check("match: fits a 1024x768 iPad screen (no scroll)", r[0] and r[1], str(r))
        page.screenshot(path=os.path.join(SHOTS, "vocab_match.png"))
        spots = page.locator(".vm-spot")
        w0 = spots.nth(0).get_attribute("data-w"); w1 = spots.nth(1).get_attribute("data-w")
        card = page.locator(f".vm-card[data-w='{w0}']")
        before = gp()
        drag(card, spots.nth(1))
        check("match: a wrong drop slides back", page.locator(".vm-card.placed").count() == 0 and any(t in msg() for t in ("Almost", "close", "Not quite")), msg())
        drag(card, spots.nth(2) if spots.nth(2).get_attribute("data-w") != w0 else spots.nth(1))
        check("match: two slips -> its word glows", page.locator(f".vm-spot.glow[data-w='{w0}']").count() == 1)
        drag(card, spots.nth(0))
        check("match: dragging onto its word places it", page.locator(f".vm-spot.done[data-w='{w0}'] .vm-card.placed").count() == 1)
        check("match: logged once as needed help, +1 garden", vprog().get(w0) == {"c": 0, "m": 1} and gp() == before + 1, f"{vprog()} {before}->{gp()}")
        n_heard = len(heard())
        tap(f".vm-card[data-w='{w1}']")
        check("match: tapping a card selects it and reads the meaning", page.locator(f".vm-card.sel[data-w='{w1}']").count() == 1
              and len(heard()) > n_heard and heard()[-1] == W[w1]["def"], str(heard()[-3:]))
        tap(f".vm-spot[data-w='{w1}']")
        check("match: then tapping its word places it (first try)", page.locator(f".vm-spot.done[data-w='{w1}']").count() == 1 and vprog().get(w1) == {"c": 1, "m": 0})
        w2 = page.locator(".vm-spot:not(.done)").first.get_attribute("data-w")
        drag(page.locator(f".vm-card[data-w='{w2}']"), page.locator(f".vm-spot[data-w='{w2}']"))
        check("match: board done -> cheer", "matched" in msg(), msg())
        page.wait_for_selector(".vm-card.vm-word", timeout=5000)
        check("match: board 2 (Mix) drags words onto meanings", page.locator(".vm-spot.vm-def").count() == 3 and "word to its meaning" in page.locator(".prompt").inner_text())
        page.screenshot(path=os.path.join(SHOTS, "vocab_match2.png"))
        # finish the game by taps (boards 2-4)
        for _ in range(3):
            page.wait_for_selector(".vm-card:not(.placed)", timeout=5000)
            for w in page.eval_on_selector_all(".vm-card:not(.placed)", "els => els.map(e => e.dataset.w)"):
                tap(f".vm-card[data-w='{w}']"); tap(f".vm-spot[data-w='{w}']")
            time.sleep(0.2)
        page.wait_for_selector(".finish", timeout=5000)
        check("match: 10 words with meanings = 4 boards, then the finish screen", len(vprog()) == 10 and "shelter" not in vprog(), str(sorted(vprog())))

        # ---- Match options: Words only
        page.locator(".finish button", has_text="Play again").tap()
        tap(".opt-gear"); page.wait_for_selector(".opt-panel")
        tap(".opt-panel button:has-text('Words')"); tap(".opt-panel .opt-done")
        page.wait_for_selector(".vm-card.vm-word")
        check("match options: Words = drag words onto meanings from board 1", page.locator(".vm-spot.vm-def").count() >= 2)
        check("match options: saved", json.loads(page.evaluate("localStorage.getItem('spelling-games.vmatch.options')"))["drag"] == "word")

        # ---- phone layout
        page.set_viewport_size({"width": 390, "height": 760})
        open_game("Match the Meaning"); page.wait_for_selector(".vm-spot")
        r = no_scroll()
        check("match: phone 390x760, no sideways scroll", r[1], str(r))
        check("match: phone 390x760 fits without scrolling", r[0], str(r))
        page.screenshot(path=os.path.join(SHOTS, "vocab_match_phone.png"))
        page.set_viewport_size({"width": 1024, "height": 768})

        # ---- Word Wise
        page.evaluate("localStorage.removeItem('spelling-games.vocab.progress.v1')")
        def set_kind(kind):
            page.evaluate(f"localStorage.setItem('spelling-games.vquiz.options', JSON.stringify({{kind: '{kind}'}}))")
        def state():
            return page.evaluate("""(() => ({ prompt: document.querySelector('.prompt').innerText,
              shown: document.querySelector('.vq-shown span').innerText,
              choices: [...document.querySelectorAll('.vq-choice')].map(b => b.dataset.c) }))()""")
        def answer_for(st):
            if "part of speech" in st["prompt"]: return W[st["shown"]]["pos"]
            if "mean?" in st["prompt"]: return W[st["shown"]]["def"]
            return next(w for w, e in W.items() if e["def"] == st["shown"])

        set_kind("pos")
        open_game("Word Wise"); page.wait_for_selector(".vq-choice")
        st = state()
        check("quiz pos: 4 choices = noun/verb/adjective/adverb", sorted(st["choices"]) == sorted(POS), str(st))
        check("quiz pos: the word is read aloud at the start", heard() and heard()[-1] == st["shown"], str(heard()[-2:]))
        r = no_scroll()
        check("quiz: fits 1024x768 (no scroll)", r[0] and r[1], str(r))
        ans = answer_for(st)
        wrong = [c for c in st["choices"] if c != ans]
        tap(f".vq-choice[data-c='{wrong[0]}']")
        check("quiz: a miss greys that choice, gently", page.locator(f".vq-choice[data-c='{wrong[0]}']").is_disabled() and "wrong" not in msg().lower(), msg())
        tap(f".vq-choice[data-c='{wrong[1]}']")
        check("quiz: two misses -> the answer glows", page.locator(f".vq-choice.glow[data-c='{ans}']").count() == 1)
        tap(f".vq-choice[data-c='{ans}']")
        check("quiz: right -> entry shown + Next", page.locator(".vq-entry").count() == 1 and st["shown"] in page.locator(".vq-entry").inner_text()
              and page.locator(".vq-next").count() == 1)
        check("quiz: logged as needed help", vprog().get(st["shown"]) == {"c": 0, "m": 1}, str(vprog()))
        seen = [st["shown"]]
        tap(".vq-next")
        st2 = state()
        check("quiz: Next reads the next word (inside the tap)", heard()[-1] == st2["shown"] and st2["shown"] != st["shown"], str(heard()[-2:]))
        for _ in range(20):
            if page.locator(".finish").count(): break
            st = state(); seen.append(st["shown"])
            tap(f".vq-choice[data-c='{answer_for(st)}']"); tap(".vq-next")
        check("quiz pos: 10 questions, all words with a part of speech, none twice",
              page.locator(".finish").count() == 1 and len(seen) == 10 and len(set(seen)) == 10 and "predict" not in seen, str(seen))

        # meanings
        set_kind("def")
        open_game("Word Wise"); page.wait_for_selector(".vq-choice")
        st = state()
        check("quiz def: 4 different meanings incl. the right one", len(set(st["choices"])) == 4 and W[st["shown"]]["def"] in st["choices"], str(st))
        same = [c for c in st["choices"] if c != W[st["shown"]]["def"]]
        pos = W[st["shown"]]["pos"]
        n_same = sum(1 for w, e in W.items() if e["pos"] == pos and e["def"] and w != st["shown"])
        got_same = sum(1 for c in same if any(e["def"] == c and e["pos"] == pos for e in W.values()))
        check("quiz def: other meanings of the same part of speech come first", got_same == min(3, n_same), f"{got_same} of {n_same}")
        page.screenshot(path=os.path.join(SHOTS, "vocab_quiz_def.png"))
        tap(f".vq-choice[data-c='{W[st['shown']]['def']}']")
        check("quiz def: first-try right logged", vprog().get(st["shown"], {}).get("c", 0) >= 1)

        # words (meaning shown)
        set_kind("word")
        open_game("Word Wise"); page.wait_for_selector(".vq-choice")
        st = state()
        ans = answer_for(st)
        check("quiz word: a meaning is shown, 4 words to pick from", len(st["choices"]) == 4 and ans in st["choices"] and "shelter" not in st["choices"], str(st))
        check("quiz word: the meaning is read aloud", heard()[-1] == st["shown"])
        page.set_viewport_size({"width": 390, "height": 760})
        r = no_scroll()
        check("quiz: phone, no sideways scroll", r[1], str(r))
        page.screenshot(path=os.path.join(SHOTS, "vocab_quiz_phone.png"))
        page.set_viewport_size({"width": 1024, "height": 768})

        # mix via the options pop-up
        tap(".opt-gear"); page.wait_for_selector(".opt-panel")
        tap(".opt-panel button:has-text('Mix')"); tap(".opt-panel .opt-done")
        kinds = set()
        for _ in range(20):
            page.wait_for_selector(".vq-choice, .finish")
            if page.locator(".finish").count(): break
            st = state()
            kinds.add("pos" if "part of speech" in st["prompt"] else "def" if "mean?" in st["prompt"] else "word")
            tap(f".vq-choice[data-c='{answer_for(st)}']"); tap(".vq-next")
        check("quiz mix: all three kinds in one game", kinds == {"pos", "def", "word"}, str(kinds))

        # ---- no vocab.txt
        ctx2 = b.new_context(viewport={"width": 1024, "height": 768}, service_workers="block")
        ctx2.add_init_script(INIT)
        ctx2.route(URL + "words.txt", lambda r: r.fulfill(path=os.path.join(FIX, "words.txt")))
        ctx2.route(URL + "vocab.txt", lambda r: r.fulfill(status=404))
        p2 = ctx2.new_page(); p2.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        p2.goto(URL); p2.wait_for_selector(".mcard")
        check("no vocab.txt: spelling still works (menu loads)", p2.locator(".mcard").count() == 34)
        p2.locator(".mcard", has_text="Word Wise").first.click()
        check("no vocab.txt: a gentle note", "vocab.txt" in p2.locator(".note").inner_text())
        ctx2.close()
        b.close()
finally:
    server.kill()

check("no page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
