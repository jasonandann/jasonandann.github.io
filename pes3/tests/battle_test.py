"""Tests for Battle Buddies: believable computer mistakes, the computer's skill rule, 1- and 2-player games.

Run from the repo root:   python3 tests/battle_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, re, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8780
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")
LIST = [l.split("|")[0].strip() for l in open(FIXTURE) if l.strip() and not l.startswith("#")]

INIT = """
window.__heard = [];
const fake = { speak(u){ window.__heard.push(u.text); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
localStorage.setItem('spelling-games.battle.fast', '1');
"""

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def evalmath(text):
    a, op, b = re.match(r"\s*(\d+)\s*([+−×÷])\s*(\d+)", text).groups()
    a, b = int(a), int(b)
    return {"+": a + b, "−": a - b, "×": a * b, "÷": a // b}[op]

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
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def hearts(): return page.evaluate("[...document.querySelectorAll('.bt-side')].map(e => +e.dataset.hearts)")
        def bot(ok): page.evaluate(f"document.querySelector('.game').__battle.botNext = {'true' if ok else 'false'}")
        def type_answer(s):
            for ch in s: tap(f".ch-q .key:text-is('{ch}')")
            tap(".ch-q button:has-text('Check')")
        def answer_math_right():
            type_answer(str(evalmath(page.locator(".ch-q .bigword").inner_text())))
        def answer_wrong():  # two misses (second chance on), then OK
            for _ in range(2):
                type_answer("1" if page.locator(".ch-q .bigword").count() else "zq")
            tap(".ch-q button:has-text('OK')")
        def wait_next(): page.wait_for_selector(".bt-next, .bt-go, .bt-finish", timeout=8000)
        def options(*labels):  # open ⚙️ Options, tap each choice by its text, Done
            tap(".bt-setup .opt-more"); page.wait_for_selector(".opt-panel")
            for t in labels: page.locator(".opt-panel .btn").get_by_text(t, exact=t.isdigit()).first.tap()
            tap(".opt-panel .opt-done")
        def love(): return page.evaluate("document.querySelector('.game').__battle.state()")

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.5)
        check("menu has 29 cards", page.locator(".mcard").count() == 29)
        check("menu: Battle Buddies is in the Adventures section", page.locator(".sect", has_text="Adventures").locator(".mcard", has_text="Battle Buddies").count() == 1)

        # ---- believable math slips
        slips = page.evaluate("""async () => { const m = await import('/js/mistakes.js');
          const many = (t, a) => [...new Set(Array.from({length: 400}, () => m.mathSlip(t, a).value))].sort((x, y) => x - y);
          return { add: many('47 + 38', 85), sub: many('53 − 27', 26), mul: many('7 × 8', 56), div: many('56 ÷ 7', 8),
                   why: m.mathSlip('47 + 38', 85, () => 0).why }; }""")
        check("math slips: 47 + 38 -> no carry (75), 715, took away (9), ±1, +10", set(slips["add"]) <= {75, 715, 9, 84, 86, 95} and 75 in slips["add"], str(slips["add"]))
        check("math slips: 53 − 27 -> smaller-from-larger (34), forgot to decrement (36), added (80), ±1", set(slips["sub"]) <= {34, 36, 80, 25, 27} and 34 in slips["sub"] and 36 in slips["sub"], str(slips["sub"]))
        check("math slips: 7 × 8 -> table neighbours (63, 49, 64, 48) or added (15)", set(slips["mul"]) <= {63, 49, 64, 48, 15} and len(slips["mul"]) >= 4, str(slips["mul"]))
        check("math slips: 56 ÷ 7 -> 9, 7, or 49", set(slips["div"]) <= {9, 7, 49}, str(slips["div"]))
        check("math slip explains itself (forgot to carry)", "carry" in slips["why"], slips["why"])
        gen = page.evaluate("""async () => { const m = await import('/js/mistakes.js'); const q = await import('/js/math.js');
          const bad = [];
          for (const lv of ['add', 't5', 't10', 'div']) for (let i = 0; i < 300; i++) {
            const x = q.makeQuestion(lv); const s = m.mathSlip(x.text, x.answer);
            if (!Number.isInteger(s.value) || s.value < 0 || s.value === x.answer || !s.why) bad.push(x.text + ' -> ' + s.value); }
          return bad; }""")
        check("math slips: never the answer, never negative, always explained (1200 questions)", not gen, ", ".join(gen[:5]))

        # ---- believable spelling slips
        sp = page.evaluate("""async (list) => { const d = await import('/js/dictionary.js'); await d.loadDictionary();
          const m = await import('/js/mistakes.js'); const avoid = new Set(list); const bad = [];
          for (const w of list) for (let i = 0; i < 60; i++) { const s = m.spellingSlip(w, avoid);
            if (s === w || avoid.has(s) || d.inDictionary(s) || Math.abs(s.length - w.length) > 3 || !/^[a-z]+$/.test(s)) bad.push(w + ' -> ' + s); }
          const sl = (w) => m.soundsLike(w, avoid);
          return { bad, phone: sl('phone'), because: sl('because'), could: sl('could'), whale: sl('whale'), said: sl('said'), people: sl('people') }; }""", LIST)
        check("spelling slips: never right, never a real word or list word, letters only", not sp["bad"], ", ".join(sp["bad"][:6]))
        check("sounds-like slips: phone -> fone, because -> becuz, could -> cood", "fone" in sp["phone"] and "becuz" in sp["because"] and "cood" in sp["could"], str([sp["phone"], sp["because"], sp["could"]]))
        check("sounds-like slips: whale -> whail, said -> sed, people -> peeple", "whail" in sp["whale"] and "sed" in sp["said"] and "peeple" in sp["people"], str([sp["whale"], sp["said"], sp["people"]]))

        # ---- the computer's skill rule
        rule = page.evaluate("""async () => { const m = await import('/js/games/battle-bot.js');
          const out = {};
          for (const lv of ['easy', 'right', 'tricky']) {
            const d = m.BOT_LEVELS[lv]; let below = true, lucky = 0, sum = 0, max = 0; const N = 4000;
            for (const sk of [0.3, 0.6, 0.9]) for (let i = 0; i < N; i++) {
              const c = m.botChance(sk, lv); sum += c - sk; if (c >= sk) { lucky++; max = Math.max(max, c - sk); } }
            // forced draws: a non-lucky turn is strictly below her skill, a lucky one is at or a little above it
            for (const sk of [0.2, 0.5, 1]) {
              const seq = [0.99, 0.5]; let k = 0; if (!(m.botChance(sk, lv, () => seq[k++]) < sk)) below = false; }
            const seqL = [0, 1]; let j = 0; const l = m.botChance(0.5, lv, () => seqL[j++]);
            out[lv] = { below, luckyShare: lucky / (3 * N), want: d.lucky, meanGap: sum / (3 * N), max, luckyTop: l, boost: d.boost };
          }
          m.clearSkill(); const s0 = m.skillOf('spell');
          for (let i = 0; i < 8; i++) m.noteResult('spell', 1); const up = m.skillOf('spell');
          for (let i = 0; i < 8; i++) m.noteResult('spell', 0); const down = m.skillOf('spell');
          m.clearSkill();
          return { out, s0, up, down }; }""")
        for lv, r in rule["out"].items():
            check(f"computer ({lv}): ordinary turns are strictly below her skill", r["below"], str(r))
            check(f"computer ({lv}): lucky turns ≈ {r['want']:.0%} and at most {r['boost']} above her", abs(r["luckyShare"] - r["want"]) < 0.03 and r["max"] <= r["boost"] + 1e-9 and 0.5 <= r["luckyTop"] <= 0.5 + r["boost"], str(r))
            check(f"computer ({lv}): on average below her", r["meanGap"] < 0, str(r))
        check("skill estimate starts at a guess, rises with right answers, falls with misses", rule["up"] > rule["s0"] > rule["down"], str(rule))

        # ---- 1 player vs the computer, math
        g0 = gp()
        page.locator(".mcard", has_text="Battle Buddies").first.tap()
        check("setup: players, buddies and theme on the start screen", all(page.locator(f".bt-setup button:has-text('{t}')").count() >= 1 for t in ["1 player", "2 players", "Love meter", "Battle"]))
        check("setup: questions, level, how tricky, hearts are not on the start screen",
              all(page.locator(f".bt-setup button:text-is('{t}')").count() == 0 for t in ["Spelling", "Both", "Easy", "Just right", "Tricky", "3", "7"]))
        check("setup: defaults = Love meter; Both · Add & subtract · Just right · 5 hearts · Race",
              page.locator(".bt-setup button.primary:has-text('Love meter')").count() == 1
              and page.locator(".opt-summary").inner_text() == "Both · Add & subtract · Robo: Just right · 5 hearts · Race", page.locator(".opt-summary").inner_text())
        check("setup: 8 buddies to pick", page.locator(".bt-pick").count() == 8)
        tap(".bt-setup .opt-more"); page.wait_for_selector(".opt-panel")
        check("options: how to play, questions, level, how tricky, hearts", all(page.locator(f".opt-panel button:has-text('{t}')").count() >= 1
              for t in ["Race", "Together", "Spelling", "Math", "Both", "Add & subtract", "Easy", "Just right", "Tricky", "3", "7"]))
        tap(".opt-panel .opt-done")
        tap(".bt-setup button:has-text('Battle')")
        check("battle theme: no Race/Together option", (tap(".bt-setup .opt-more"), page.locator(".opt-panel button:has-text('Together')").count())[1] == 0)
        tap(".opt-panel .opt-done")
        options("Math", "Times tables 2–5", "3")
        check("options summary updates", page.locator(".opt-summary").inner_text() == "Math · Times tables 2–5 · Robo: Just right · 3 hearts", page.locator(".opt-summary").inner_text())
        tap(".bt-setup .bt-pick[data-a='🦊']")
        page.screenshot(path=f"{SHOTS}/battle_setup.png")
        tap(".bt-setup button:has-text('Start!')")
        check("arena: you (🦊) vs 🤖, 3 hearts each", page.locator(".bt-side.s0 .bt-face").inner_text() == "🦊" and page.locator(".bt-side.s1 .bt-face").inner_text() == "🤖" and hearts() == [3, 3], str(hearts()))
        tap(".bt-go")
        bot(False)
        check("your turn: a math question with a number pad", page.locator(".ch-q .bigword").count() == 1 and page.locator(".ch-q .numpad").count() == 1)
        page.screenshot(path=f"{SHOTS}/battle_question.png")
        answer_math_right()
        page.wait_for_function("document.querySelector('.bt-side.s1').dataset.hearts === '2'", timeout=5000)
        check("right answer: a sparkle pops one of the computer's hearts", hearts() == [3, 2], str(hearts()))
        check("popped heart shows 🤍", page.locator(".bt-side.s1 .bt-heart.pop").count() == 1)
        # computer's turn: forced slip, explained, no harm to anyone
        page.wait_for_selector(".bt-next", timeout=8000)
        m = page.locator(".bt-panel > .msg").inner_text()
        check("computer slip: says what it wrote, why, and the right answer", m.startswith("Oops!") and "=" in m and hearts() == [3, 2], m)
        check("computer slip: its wrong answer is shown", page.locator(".bt-typed.bt-oops").count() == 1)
        page.screenshot(path=f"{SHOTS}/battle_bot_slip.png")
        tap(".bt-next")
        check("'Your turn' starts your question at once", page.locator(".ch-q").count() == 1)
        bot(True)
        answer_wrong()
        check("not right this time: no sparkle, nobody loses a heart", "No sparkle" in page.locator(".bt-panel > .msg").inner_text() and hearts() == [3, 2])
        page.wait_for_function("document.querySelector('.bt-side.s0').dataset.hearts === '2'", timeout=8000)
        check("computer gets one right: it pops one of yours", hearts() == [2, 2], str(hearts()))
        sk = page.evaluate("JSON.parse(localStorage.getItem('spelling-games.battle.skill.v1') || '{}')")
        check("her answers are tracked quietly per kind (math:t5)", "math:t5" in sk and sk["math:t5"]["n"] == 2, str(sk))
        # play on to a win
        for _ in range(4):
            wait_next()
            if page.locator(".bt-finish").count(): break
            tap(".bt-next")
            bot(False)
            answer_math_right()
            page.wait_for_selector(".bt-next, .bt-finish", timeout=8000)
            if page.locator(".bt-finish").count(): break
        page.wait_for_selector(".bt-finish", timeout=8000)
        check("win screen: 'You win!' with Rematch / Change buddies / Home", "You win!" in page.locator(".bt-finish").inner_text() and page.locator(".bt-finish button").count() == 3)
        check("garden points for her answers", gp() > g0, f"{g0} -> {gp()}")
        page.screenshot(path=f"{SHOTS}/battle_win.png")
        tap(".bt-finish button:has-text('Rematch')")
        check("rematch: hearts are full again", hearts() == [3, 3])
        home()

        # ---- the computer can win (gently)
        page.locator(".mcard", has_text="Battle Buddies").first.tap()
        tap(".bt-setup button:has-text('Start!')")
        for _ in range(3):
            tap(".bt-go") if page.locator(".bt-go").count() else tap(".bt-next")
            bot(True)
            answer_wrong()
            page.wait_for_selector(".bt-next, .bt-finish", timeout=8000)
            if page.locator(".bt-finish").count(): break
        t = page.locator(".bt-finish").inner_text()
        check("computer wins: 'wins this time', offers a rematch, no 'lose' wording", "wins this time" in t and "Rematch" in t and not re.search(r"\blos[et]", t.lower()), t)
        home()

        # ---- spelling: hear the word, the computer's misspelling is believable and marked
        page.locator(".mcard", has_text="Battle Buddies").first.tap()
        options("Spelling")
        tap(".bt-setup button:has-text('Start!')")
        n0 = len(page.evaluate("window.__heard"))
        tap(".bt-go")
        heard = page.evaluate("window.__heard")
        check("spelling turn speaks the word inside the tap", len(heard) > n0, str(heard[-1:]))
        word = next((w for w in LIST if w in heard[-1].lower()), None)
        check("spoken word is a list word", word is not None, heard[-1])
        bot(False)  # decided before her answer, so the computer's turn can't start first
        type_answer(word)
        page.wait_for_selector(".bt-next", timeout=8000)
        m = page.locator(".bt-panel > .msg").inner_text()
        wrote = re.search(r"wrote “([a-z]+)”", m)
        check("computer misspelling: shown with the right spelling", wrote and "It’s spelled" in m, m)
        check("computer misspelling: differing letters are marked", page.locator(".bt-typed .off").count() >= 1 or (wrote and len(wrote.group(1)) != len(m.split('spelled ')[-1].rstrip('.'))), m)
        prog = page.evaluate("Object.keys(JSON.parse(localStorage.getItem('spelling-games.progress.v1')||'{\"words\":{}}').words)")
        check("her spelling word is logged; the computer's word is not", word in prog and len(prog) == 1, str(prog))
        page.screenshot(path=f"{SHOTS}/battle_spell_slip.png")
        home()

        # ---- 2 players
        page.locator(".mcard", has_text="Battle Buddies").first.tap()
        tap(".bt-setup button:has-text('2 players')"); options("Math")
        check("2 players: two buddy rows; a buddy taken by one player is greyed for the other", page.locator(".bt-setup .bt-picks").count() == 2 and page.locator(".bt-pick:disabled").count() == 2)
        tap(".bt-setup .opt-more")
        check("2 players: no 'How tricky' option", page.locator(".opt-panel button:has-text('Just right')").count() == 0)
        tap(".opt-panel .opt-done")
        tap(".bt-setup button:has-text('Start!')")
        check("2 players: no computer in the arena", "🤖" not in page.locator(".bt-arena").inner_text())
        tap(".bt-go"); answer_math_right()
        page.wait_for_selector(".bt-next")
        check("2 players: next button names Player 2", "Player 2" in page.locator(".bt-next").inner_text(), page.locator(".bt-next").inner_text())
        tap(".bt-next")
        check("2 players: Player 2's side is highlighted", page.locator(".bt-side.s1.on").count() == 1)
        home()

        # ---- 💗 love meter, race (1 player, math, 3 hearts to fill)
        page.locator(".mcard", has_text="Battle Buddies").first.tap()
        tap(".bt-setup button:has-text('1 player')"); tap(".bt-setup button:has-text('Love meter')"); options("Race")
        tap(".bt-setup button:has-text('Start!')")
        st = love()
        check("love: empty meters, no hearts to lose", st["love"] == [0, 0] and st["goal"] == 3 and page.locator(".bt-side .bt-meter").count() == 2
              and page.locator(".bt-side[data-hearts]").count() == 0)
        tap(".bt-go"); bot(False); answer_math_right()
        page.wait_for_function("document.querySelector('.bt-side.s0').dataset.love === '1'", timeout=5000)
        check("love: a right answer floats a heart into YOUR meter; nobody loses anything", love()["love"] == [1, 0]
              and page.locator(".bt-side.s0 .bt-heart:text-is('💗')").count() == 1 and page.locator(".bt-side.s1 .bt-heart:text-is('💗')").count() == 0)
        page.wait_for_selector(".bt-next", timeout=8000)
        check("love: computer slip leaves both meters as they were", love()["love"] == [1, 0])
        tap(".bt-next"); bot(True); answer_wrong()
        check("love: not right this time = 'No heart this time'", "No heart" in page.locator(".bt-panel > .msg").inner_text())
        page.wait_for_function("document.querySelector('.bt-side.s1').dataset.love === '1'", timeout=8000)
        check("love: the computer's right answer fills its own meter, not yours", love()["love"] == [1, 1])
        for _ in range(6):
            wait_next()
            if page.locator(".bt-finish").count(): break
            tap(".bt-next"); bot(False); answer_math_right()
            page.wait_for_selector(".bt-next, .bt-finish", timeout=8000)
        t = page.locator(".bt-finish").inner_text()
        check("love: first to fill wins, gently ('You filled your love meter!', Play again)", "You filled your love meter!" in t and "Play again" in t and page.locator(".confetti").count() == 1, t)
        page.screenshot(path=f"{SHOTS}/battle_love_win.png")
        tap(".bt-finish button:has-text('Play again')")
        for _ in range(4):
            tap(".bt-go") if page.locator(".bt-go").count() else tap(".bt-next")
            bot(True); answer_wrong()
            page.wait_for_selector(".bt-next, .bt-finish", timeout=8000)
            if page.locator(".bt-finish").count(): break
        t = page.locator(".bt-finish").inner_text()
        check("love: the computer can fill first (no confetti, no 'lose')", "filled the love meter first" in t and page.locator(".confetti").count() == 0
              and not re.search(r"\blos[et]", t.lower()), t)
        home()

        # ---- 💗 together: one shared meter of 2 x hearts
        page.locator(".mcard", has_text="Battle Buddies").first.tap()
        options("Together")
        check("together: summary says Together", page.locator(".opt-summary").inner_text().endswith("Together"))
        tap(".bt-setup button:has-text('Start!')")
        check("together: one shared meter of 6, none on the buddies", love()["goal"] == 6 and page.locator(".bt-shared .bt-heart").count() == 6
              and page.locator(".bt-side .bt-meter").count() == 0)
        tap(".bt-go"); bot(True); answer_math_right()
        page.wait_for_function("document.querySelector('.bt-shared').dataset.love === '2'", timeout=8000)
        check("together: her heart and the computer's both go into the shared meter", love()["shared"] == 2)
        page.screenshot(path=f"{SHOTS}/battle_together.png")
        for _ in range(6):
            wait_next()
            if page.locator(".bt-finish").count(): break
            tap(".bt-next"); bot(True); answer_math_right()
            page.wait_for_selector(".bt-next, .bt-finish", timeout=8000)
        t = page.locator(".bt-finish").inner_text()
        check("together: everyone wins with confetti", "together" in t and page.locator(".confetti").count() == 1, t)
        home()

        # ---- phone layout
        page.set_viewport_size({"width": 390, "height": 760})
        page.locator(".mcard", has_text="Battle Buddies").first.tap()
        tap(".bt-setup button:has-text('Start!')"); tap(".bt-go")
        w = page.evaluate("document.documentElement.scrollWidth")
        check("phone: no sideways scroll", w <= 390, str(w))
        page.screenshot(path=f"{SHOTS}/battle_phone.png", full_page=True)
        home()

        check("no console/page errors", not errors, "; ".join(errors[:3]))
        b.close()
finally:
    server.terminate()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
