"""Tests for the Fill the Blanks engine (js/blanks.js) in its three menu cards (Spelling, Vocabulary, Math)
and Bridge Builder (Adventures).

Run from the repo root:   python3 tests/blanks_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, re, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8785
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
OPS = {"+": lambda a, b: a + b, "−": lambda a, b: a - b, "×": lambda a, b: a * b, "÷": lambda a, b: a / b if b and a % b == 0 else None}

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

        def tap(sel, **kw): page.locator(sel, **kw).first.tap()
        def heard(): return page.evaluate("window.__heard.slice()")
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def vprog(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.vocab.progress.v1')||'{\"words\":{}}').words")
        def msg(): return page.locator(".fb-q .msg").first.inner_text()
        def fits():
            return page.evaluate("[document.documentElement.scrollHeight <= innerHeight + 1, document.documentElement.scrollWidth <= innerWidth + 1, document.documentElement.scrollHeight]")
        def open_card(section, name):
            page.goto(URL); page.wait_for_selector(".mcard")
            page.locator(".sect", has_text=section).locator(".mcard", has_text=name).first.tap()

        page.goto(URL); page.wait_for_selector(".mcard")
        V = page.evaluate("""async () => { const v = await import('/js/vocab.js');
          return v.parseVocab(await (await fetch('/vocab.txt')).text()).words; }""")
        W = {e["word"]: e for e in V}

        # ---- engine units
        cl = page.evaluate("""async () => { const v = await import('/js/vocab.js'); const ws = v.parseVocab(await (await fetch('/vocab.txt')).text()).words;
          const f = (w) => v.clozes(ws.find(e => e.word === w))[0] || null; return [f('gather'), f('brave'), f('quickly'), f('enormous')]; }""")
        check("cloze: finds a form of the word (gathered)", cl[0] and cl[0]["token"] == "gathered" and cl[0]["before"] == "We ", str(cl[0]))
        check("cloze: exact word", cl[1] and cl[1]["token"] == "brave")
        check("cloze: a sentence without the word -> none (meaning clue instead)", cl[2] is None and cl[3] is None)
        check("several sentences: parsed in order, empty parts skipped", W["gather"]["sentences"] == ["We gathered leaves into a pile.", "Bees gather nectar from flowers.", "This line never uses the word."]
              and W["brave"]["sentences"] == ["The brave knight met the dragon."] and W["shelter"]["sentences"] == [], str(W["gather"]["sentences"]))
        ms = page.evaluate("""async () => { const v = await import('/js/vocab.js'); const bl = await import('/js/blanks.js');
          const ws = v.parseVocab(await (await fetch('/vocab.txt')).text()).words; const g = ws.find(e => e.word === 'gather');
          const lines = Array.from({length: 60}, () => bl.vocabLine(g).before);
          return { usable: v.clozes(g).length, seen: [...new Set(lines)], repeats: lines.filter((x, i) => i && x === lines[i - 1]).length,
            can: ws.filter(v.canBlank).map(e => e.word) }; }""")
        check("several sentences: the one without the word is left out", ms["usable"] == 2, str(ms))
        check("several sentences: both get used, never the same one twice in a row", sorted(ms["seen"]) == ["Bees ", "We "] and ms["repeats"] == 0, str(ms))
        check("canBlank: a word needs a meaning or a usable sentence", "shelter" not in ms["can"] and "gather" in ms["can"] and len(ms["can"]) == 10, str(ms["can"]))
        st = page.evaluate("""async () => { const m = await import('/js/blanks.js'); const n = {a:0,b:0,op:0,ans:0}; let ok = true, signsAdd = new Set();
          for (let i = 0; i < 4000; i++) { const lv = ['add','t5','t10','div'][i % 4]; const p = m.mathPuzzle(lv); n[p.hide]++;
            const v = {'+': p.a + p.b, '−': p.a - p.b, '×': p.a * p.b, '÷': p.a / p.b}[p.op]; if (v !== p.ans) ok = false;
            if (lv === 'add') p.signs.forEach(s => signsAdd.add(s)); }
          return {n, ok, signsAdd: [...signsAdd]}; }""")
        n = st["n"]
        check("math puzzles are true sums", st["ok"])
        check("math blanks: numbers in the sum most (~55%), then the sign (~30%), the answer least (~15%)",
              0.5 < (n["a"] + n["b"]) / 4000 < 0.6 and 0.26 < n["op"] / 4000 < 0.34 and 0.12 < n["ans"] / 4000 < 0.18, str(n))
        check("math blanks: add level offers only + and − as signs", sorted(st["signsAdd"]) == ["+", "−"], str(st["signsAdd"]))

        # ---- menu
        check("menu has 34 cards", page.locator(".mcard").count() == 34)
        for sec in ["Spelling", "Vocabulary", "Math"]:
            check(f"Fill the Blanks is in {sec}", page.locator(".sect", has_text=sec).locator(".mcard", has_text="Fill the Blanks").count() == 1)
        check("Bridge Builder is in Adventures", page.locator(".sect", has_text="Adventures").locator(".mcard", has_text="Bridge Builder").count() == 1)

        # ---- answer helpers (read the screen, answer like she would)
        def vocab_answer():
            text = page.locator(".fb-sentence").inner_text()
            for w, e in W.items():
                if e["def"] and e["def"] in text: return w
                for sen in e["sentences"]:
                    if sen.split(" ")[-1] in text and sen.split(" ")[0] in text: return w
            raise AssertionError(text)
        def math_state():
            hide = page.locator(".fb-q").get_attribute("data-hide")
            parts = page.locator(".fb-eq .tile").all_inner_texts()
            return hide, [t.strip() for t in parts]
        def math_answer():
            hide, (a, op, b_, _, c) = math_state()
            if hide == "op": return next(s for s, f in OPS.items() if f(int(a), int(b_)) == int(c))
            if hide == "ans": return str(int(OPS[op](int(a), int(b_))))
            for x in range(0, 1000):
                if (hide == "a" and OPS[op](x, int(b_)) == int(c)) or (hide == "b" and OPS[op](int(a), x) == int(c)): return str(x)
        def answer_math():
            ans = math_answer()
            if page.locator(".fb-q").get_attribute("data-hide") == "op": tap(f".fb-sign[data-s='{ans}']")
            else:
                for d in ans: tap(f".numpad .key[aria-label='{d}']")
                tap(".fb-q button:has-text('Check')")
        def answer_spell():
            word = heard()[-1].split(".")[0].strip()
            tiles = page.locator(".fb-q .slots .tile")
            missing = "".join(word[i] for i in range(tiles.count()) if "slot" in (tiles.nth(i).get_attribute("class") or ""))
            page.keyboard.type(missing)
        def answer_vocab():
            if page.locator(".fb-tile").count(): tap(f".fb-tile[data-w='{vocab_answer()}']")
            else:
                page.keyboard.type(vocab_answer()); page.keyboard.press("Enter")
        def answer():
            kind = page.locator(".fb-q").get_attribute("data-kind")
            {"spell": answer_spell, "vocab": answer_vocab, "math": answer_math}[kind]()
            return kind

        # ---- Vocabulary: tiles
        page.evaluate("localStorage.removeItem('spelling-games.vblanks.options')")
        open_card("Vocabulary", "Fill the Blanks"); page.wait_for_selector(".fb-q")
        check("vocab: 4 word tiles", page.locator(".fb-tile").count() == 4)
        check("vocab: the line is read aloud with 'blank'", "blank" in heard()[-1].lower(), str(heard()[-1:]))
        r = fits()
        check("vocab: fits 1024x768", r[0] and r[1], str(r))
        page.screenshot(path=os.path.join(SHOTS, "blanks_vocab.png"))
        ans = vocab_answer()
        wrong = [t for t in page.eval_on_selector_all(".fb-tile", "els => els.map(e => e.dataset.w)") if t != ans]
        tap(f".fb-tile[data-w='{wrong[0]}']")
        check("vocab: a wrong tile greys out, gently", page.locator(f".fb-tile[data-w='{wrong[0]}']").is_disabled() and "wrong" not in msg().lower())
        tap(f".fb-tile[data-w='{wrong[1]}']")
        check("vocab: 2 slips -> the right tile glows", page.locator(f".fb-tile.glow[data-w='{ans}']").count() == 1)
        before = gp()
        tap(f".fb-tile[data-w='{ans}']")
        gap = page.locator(".fb-gap").inner_text()
        check("vocab: right tile fills the gap (the sentence's form, e.g. gathered) + Next", gap in (ans, "gathered") and page.locator(".fb-gap.filled").count() == 1
              and page.locator(".fb-next:visible").count() == 1, gap)
        check("vocab: logged (needed help) + garden point", vprog().get(ans) == {"c": 0, "m": 1} and gp() == before + 1, f"{vprog()} {before}->{gp()}")
        seen = {ans}; sentences = 0
        for _ in range(12):
            if page.locator(".finish").count(): break
            tap(".fb-next")
            if page.locator(".finish").count(): break
            if page.locator(".fb-sentence", has_text="means").count() == 0: sentences += 1
            seen.add(vocab_answer()); answer_vocab()
        check("vocab: 10 questions, then the finish screen", page.locator(".finish").count() == 1 and len(seen) == 10, str(seen))
        check("vocab: words with a sentence use it, others the meaning clue", sentences >= 1 and "shelter" not in seen, f"{sentences} sentences, {seen}")

        # ---- Vocabulary: typing (⚙️)
        page.locator(".finish button", has_text="Play again").tap()
        tap(".opt-gear"); page.wait_for_selector(".opt-panel")
        tap(".opt-panel button:has-text('Type the word')"); tap(".opt-panel .opt-done")
        page.wait_for_selector(".fb-q .kb")
        check("vocab typing: keyboard instead of tiles", page.locator(".fb-tile").count() == 0 and page.locator(".fb-q .kb").count() == 1)
        ans = vocab_answer()
        page.keyboard.type("zz"); page.keyboard.press("Enter")
        check("vocab typing: a miss hints the first letter", f"“{ans[0]}”" in msg(), msg())
        page.keyboard.type("zz"); page.keyboard.press("Enter")
        check("vocab typing: second miss shows the word, then Next", ans in msg() and page.locator(".fb-next:visible").count() == 1, msg())
        tap(".fb-next")
        ans = vocab_answer()
        for ch in ans: tap(f".fb-q .kb .key:text-is('{ch}')")
        tap(".fb-q button:has-text('Check')")
        check("vocab typing: typed right on the on-screen keyboard", page.locator(".fb-gap.filled").count() == 1 and page.locator(".fb-next:visible").count() == 1)
        page.screenshot(path=os.path.join(SHOTS, "blanks_vocab_type.png"))
        r = fits()
        check("vocab typing: fits 1024x768", r[0] and r[1], str(r))
        page.evaluate("localStorage.removeItem('spelling-games.vblanks.options')")

        # ---- Math
        page.evaluate("localStorage.setItem('spelling-games.mathlevel', 't10')")
        open_card("Math", "Fill the Blanks"); page.wait_for_selector(".fb-q")
        hides = set(); before = gp()
        for i in range(10):
            hide, parts = math_state(); hides.add(hide)
            check_fit = fits() if i == 0 else None
            if i == 0:
                check("math: one blank in 'a op b = c'", len(parts) == 5 and parts[3] == "=" and page.locator(".fb-eq .tile.slot").count() == 1, str(parts))
                check("math: fits 1024x768", check_fit[0] and check_fit[1], str(check_fit))
                page.screenshot(path=os.path.join(SHOTS, "blanks_math.png"))
            answer_math()
            tap(".fb-next")
        check("math: 10 questions, a garden point each, then finish", page.locator(".finish").count() == 1 and gp() == before + 10, f"{before}->{gp()}")
        # a sign question and a number miss, staged
        page.locator(".finish button", has_text="Play again").tap()
        for _ in range(40):
            if page.locator(".fb-q").get_attribute("data-hide") == "op": break
            answer_math(); tap(".fb-next")
        if page.locator(".fb-q").get_attribute("data-hide") == "op":
            check("math sign: 4 signs at a times level", page.locator(".fb-sign").count() == 4)
            ans = math_answer()
            wrong = [s for s in OPS if s != ans and OPS[s](*[int(x) for x in (math_state()[1][0], math_state()[1][2])]) != int(math_state()[1][4])]
            tap(f".fb-sign[data-s='{wrong[0]}']"); tap(f".fb-sign[data-s='{wrong[1]}']")
            check("math sign: 2 slips -> the sign glows", page.locator(".fb-sign.glow").count() == 1)
            tap(f".fb-sign[data-s='{ans}']")
            check("math sign: right sign fills the blank", page.locator(".fb-eq .tile.filled").inner_text().strip() == ans)
        else:
            check("math sign: a sign question came up", False)

        # ---- Spelling (the old game, now on the engine)
        open_card("Spelling", "Fill the Blanks"); page.wait_for_selector(".fb-q")
        check("spelling: missing letters + keyboard, as before", page.locator(".fb-q .slots .tile.slot").count() >= 1 and page.locator(".fb-q .kb").count() == 1)
        answer_spell()
        check("spelling: done -> Next", page.locator(".fb-next:visible").count() == 1 and page.locator(".slots.good").count() == 1)

        # ---- Bridge Builder
        page.evaluate("localStorage.setItem('spelling-games.mathlevel', 'add')")
        page.evaluate("localStorage.removeItem('spelling-games.bridge.options')")
        open_card("Adventures", "Bridge Builder"); page.wait_for_selector(".br-start")
        check("bridge: start screen = critters + Options", page.locator(".br-pick").count() == 6 and page.locator(".opt-more").count() == 1
              and "Mix" in page.locator(".opt-summary").inner_text() and "3 bridges" in page.locator(".opt-summary").inner_text(), page.locator(".opt-summary").inner_text())
        tap(".opt-more"); page.wait_for_selector(".opt-panel")
        tap(".opt-panel .seg:has-text('How many bridges') button:text-is('2')"); tap(".opt-panel .opt-done")
        check("bridge options: 2 bridges saved", "2 bridges" in page.locator(".opt-summary").inner_text())
        mirrored = page.eval_on_selector_all(".br-pick .br-body", "els => els.map(e => getComputedStyle(e).transform)")
        check("bridge: every critter on the start screen is mirrored to face right", mirrored and all(t.startswith("matrix(-1") for t in mirrored), str(mirrored))
        tap(".br-pick[data-c='🐢']"); page.wait_for_selector(".br-scene")
        check("bridge: scene with 4 empty planks, the turtle on the cliff", page.locator(".br-plank").count() == 4 and page.locator(".br-plank.on").count() == 0
              and page.locator(".br-critter").inner_text() == "🐢" and page.locator(".br-critter").get_attribute("data-pos") == "0")
        r = fits()
        check("bridge: fits 1024x768 with a question", r[0] and r[1], str(r))
        page.screenshot(path=os.path.join(SHOTS, "bridge.png"))
        kinds = []
        kinds.append(answer())
        check("bridge: a right answer lays a plank and the critter walks onto it", page.locator(".br-plank.on").count() == 1 and page.locator(".br-critter").get_attribute("data-pos") == "1"
              and page.locator(".br-critter.walking").count() == 1)
        check("bridge: the walking critter faces right (mirrored)", page.evaluate("parseFloat(getComputedStyle(document.querySelector('.br-critter .br-body')).transform.slice(7))") < 0)  # x scale (rotates a little mid-step)
        time.sleep(0.9)
        check("bridge: it stops stepping once it's there", page.locator(".br-critter.walking").count() == 0)
        tap(".br-next")
        # a math miss lays no plank
        for _ in range(6):
            if page.locator(".fb-q").get_attribute("data-kind") == "math" and page.locator(".fb-q").get_attribute("data-hide") != "op": break
            kinds.append(answer()); tap(".br-next")
        if page.locator(".fb-q").get_attribute("data-kind") == "math" and page.locator(".fb-q").get_attribute("data-hide") != "op":
            planks = page.locator(".br-plank.on").count()
            for _ in range(2):
                tap(".numpad .key[aria-label='9']"); tap(".numpad .key[aria-label='9']"); tap(".numpad .key[aria-label='9']")
                tap(".fb-q button:has-text('Check')")
            check("bridge: a shown answer lays no plank, gently", page.locator(".br-plank.on").count() == planks and "another" in page.locator(".br-msg").inner_text(), page.locator(".br-msg").inner_text())
            tap(".br-next")
        crossed = False
        for _ in range(30):
            if page.locator(".finish").count(): break
            kinds.append(answer())
            if page.locator(".br-critter[data-pos=across]").count(): crossed = True
            page.wait_for_selector(".br-next:visible"); tap(".br-next")
        check("bridge: a full bridge -> the critter walks across", crossed)
        check("bridge: 2 bridges -> the finish screen", page.locator(".finish").count() == 1)
        check("bridge mix: spelling, vocabulary and math all asked", {"spell", "vocab", "math"} <= set(kinds), str(kinds))
        # the tallest question (spelling + keyboard) under the scene
        page.evaluate("localStorage.setItem('spelling-games.bridge.options', JSON.stringify({mode: 'spell', bridges: 2}))")
        open_card("Adventures", "Bridge Builder"); page.wait_for_selector(".br-start")
        tap(".br-pick"); page.wait_for_selector(".fb-q[data-kind=spell]")
        answer()
        r = fits()
        check("bridge: spelling question + keyboard + Next fits 1024x768", r[0] and r[1] and page.locator(".br-next").bounding_box()["y"] + 60 <= 768, str(r))
        page.screenshot(path=os.path.join(SHOTS, "bridge_spell.png"))
        page.set_viewport_size({"width": 390, "height": 760})
        open_card("Adventures", "Bridge Builder"); page.wait_for_selector(".br-start")
        tap(".br-pick"); page.wait_for_selector(".br-scene")
        r = fits()
        check("bridge: phone, no sideways scroll", r[1], str(r))
        page.screenshot(path=os.path.join(SHOTS, "bridge_phone.png"), full_page=True)
        b.close()
finally:
    server.kill()

check("no page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
