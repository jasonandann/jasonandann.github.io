"""Tests for Guess What (issue #57): the sound engine (js/sounds.js + dict/sounds.txt) and the game.

Run from the repo root:   python3 tests/guesswhat_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8782
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
localStorage.setItem('spelling-games.guesswhat.fast', '1');
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
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=FIXTURE))
        ctx.route("**/audio/manifest.json", lambda r: r.fulfill(status=404))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "manifest" not in m.text and "404" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def tap(sel, **kw): page.locator(sel, **kw).first.tap()
        def state(): return page.evaluate("(() => { const s = document.querySelector('.game').__gw.state(); delete s.q; return s; })()")
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def heard(): return page.evaluate("window.__heard.slice()")
        def msg(): return page.locator(".gw-panel .msg").inner_text()
        def down_cards(): return page.evaluate("[...document.querySelectorAll('.gw-card.down')].map(e => e.dataset.w)")
        def opt(key, val): tap(f"[data-opt='{key}:{val}']")
        def open_game(play="solo", flip="me"):
            page.goto(URL); page.wait_for_selector(".mcard")
            tap(".mcard", has_text="Guess What"); page.wait_for_selector(".gw-start", timeout=10000)
            opt("play", play)
            tap(".opt-more"); page.wait_for_selector(".opt-panel")
            tap(".opt-panel button:has-text('" + ("Help me" if flip == "auto" else "I do it") + "')"); tap(".opt-panel .opt-done")
            tap(".gw-start")
            page.wait_for_selector(".gw-card")
        def flip_right():  # put down exactly the cards the answer ruled out, then Done
            s = state()
            for w in s["words"]:
                if w not in s["possible"] and w not in s["down"]: tap(f".gw-card[data-w='{w}']")
            tap(".gw-done")
        def wait_phase(*ph, timeout=5):
            end = time.time() + timeout
            while time.time() < end:
                if state()["phase"] in ph: return True
                time.sleep(0.05)
            return False

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.3)
        check("menu has 28 cards", page.locator(".mcard").count() == 28)
        check("menu: Guess What is the last Spelling card",
              page.locator(".sect", has_text="Spelling").locator(".mcard").last.inner_text().find("Guess What") >= 0)

        # ---- sound engine
        eng = page.evaluate("""async (list) => { const s = await import('/js/sounds.js'); await s.loadSounds();
          const A = (fam, key, w) => s.answer(s.makeQuestion(fam, key), w);
          const bad = [];
          for (const [fam, t] of [['start', s.STARTS], ['end', s.ENDS], ['vowel', s.VOWELS]])
            for (const k of Object.keys(t)) if (A(fam, k, s.exampleWord(t[k])) !== true) bad.push(fam + ':' + k + ' ' + s.exampleWord(t[k]));
          const qs = s.splitting(list);
          const notSplit = qs.filter((q) => { const a = list.map((w) => s.answer(q, w)); return a.includes(null) || !a.includes(true) || !a.includes(false); }).map((q) => q.id);
          return { bad, known: list.filter(s.knowsSound), n: qs.length, notSplit,
            dryEnd: A('end', 'AY', 'dry'), puppyEnd: A('end', 'IY', 'puppy'), driesEnd: A('end', 'Z', 'dries'),
            puppyBike: A('end', 'AY', 'puppy'), live: A('vowel', 'AY', 'live'), becauseBeats: A('beats', 2, 'because'),
            whaleW: A('start', 'W', 'whale'), aboutBug: A('vowel', 'AH', 'about'), carryHair: A('vowel', 'AIR', 'carry'),
            knee: A('start', 'N', 'knee'), carVowel: A('vowel', 'AA', 'car'), nope: A('beats', 1, 'zzqx'),
            yIes: s.splitting(['dry', 'puppy']).map((q) => q.id), same: s.splitting(['their', 'there']).length,
            butterfly: A('beats', 3, 'butterfly') }; }""", LIST)
        check("engine: every example word has its own sound (start/end/vowel tables)", not eng["bad"], ", ".join(eng["bad"]))
        check("engine: all 12 fixture words are in dict/sounds.txt", len(eng["known"]) == 12, str(eng["known"]))
        check("engine: splitting() offers only questions with yes AND no, all answered for sure", eng["n"] > 5 and not eng["notSplit"], str(eng["notSplit"]))
        check("engine: dry ends like pie, puppy ends like tree, dries ends like buzz",
              eng["dryEnd"] is True and eng["puppyEnd"] is True and eng["driesEnd"] is True and eng["puppyBike"] is False)
        check("engine: dry vs puppy splits on the last sound (the y/ies rule)", "end:AY" in eng["yIes"] and "end:IY" in eng["yIes"], str(eng["yIes"]))
        check("engine: two pronunciations that disagree -> no answer (live, whale)", eng["live"] is None and eng["whaleW"] is None)
        check("engine: because has 2 beats in every pronunciation; butterfly 3", eng["becauseBeats"] is True and eng["butterfly"] is True)
        check("engine: unstressed 'a' in about is not the u in bug", eng["aboutBug"] is False)
        check("engine: vowel before r is its own sound (carry ~ hair, car is not hot)", eng["carryHair"] is True and eng["carVowel"] is False)
        check("engine: knee starts with the n sound (silent k)", eng["knee"] is True)
        check("engine: unknown word -> no answer", eng["nope"] is None)
        check("engine: homophones (their/there) have no splitting question", eng["same"] == 0)

        # ---- solo, I put the cards down
        g0 = gp()
        open_game("solo", "me")
        s = state()
        check("solo: 12 cards, sorted, secret is one of them", s["words"] == sorted(LIST) and s["secret"] in s["words"] and page.locator(".gw-card").count() == 12)
        check("solo: tabs and question buttons show", page.locator(".gw-tab").count() == 4 and page.locator(".gw-q").count() > 0)
        page.screenshot(path=os.path.join(SHOTS, "guesswhat_ask.png"))

        # A card that still fits is stood back up on Done.
        tap(".gw-q")
        s = state()
        spoken = heard()[-1]
        check("ask: speaks the question with the answer", spoken.startswith("Does your word") and (spoken.endswith("Yes!") or spoken.endswith("No.")), spoken)
        check("ask: every remaining word fits the answer, the secret among them", s["secret"] in s["possible"] and len(s["possible"]) < 12)
        fits = next(w for w in s["possible"])
        tap(f".gw-card[data-w='{fits}']")
        check("flip: a tapped card goes down (pending)", fits in down_cards())
        tap(".gw-done")
        check("flip: a card that still fits stands up again, gently", fits not in down_cards() and "stays up" in msg(), msg())
        # Done with some missed -> "Look again", then Done again puts them down for her.
        tap(".gw-done")
        missing = len(state()["words"]) - len(state()["possible"])
        check("flip: missing cards -> 'Look again' first", missing == 0 or "Look again" in msg(), msg())
        tap(".gw-done")
        wait_phase("ask", "guess")
        s = state()
        check("flip: second Done puts the missed cards down; board = what's still possible",
              sorted(set(s["words"]) - set(s["down"])) == sorted(s["possible"]), f'{s["down"]} {s["possible"]}')
        check("flip: a finished question is a garden point", gp() == g0 + 1, f"{g0} -> {gp()}")

        # Play on correctly until the guess.
        for _ in range(12):
            if state()["phase"] != "ask": break
            tap(".gw-q"); flip_right(); wait_phase("ask", "guess")
        s = state()
        check("solo: questions narrow it down to a guess", s["phase"] == "guess", s["phase"])
        # a wrong guess first, if there is one to make
        wrong = [w for w in s["possible"] if w != s["secret"]]
        if wrong:
            tap(f".gw-card[data-w='{wrong[0]}']")
            check("guess: wrong guess puts that card down ('Not …')", wrong[0] in down_cards() and "Not" in msg())
            wait_phase("ask", "guess")
            if state()["phase"] == "ask":
                tap(".gw-know")
        tap(f".gw-card[data-w='{state()['secret']}']")
        page.wait_for_selector(".gw-end")
        check("solo: right guess wins (found card, celebration)", "You found it" in page.locator(".gw-end").inner_text()
              and page.locator(".gw-card.found").count() == 1 and page.locator(".confetti").count() == 1)
        page.screenshot(path=os.path.join(SHOTS, "guesswhat_won.png"))
        tap(".gw-again"); page.wait_for_selector(".gw-q")
        check("play again: a fresh board", state()["down"] == [] and len(state()["possible"]) == 12)

        # "I know it!" then back
        tap(".gw-know")
        check("I know it!: guess mode with a way back", state()["phase"] == "guess" and page.locator(".gw-back").count() == 1)
        tap(".gw-back")
        check("I know it!: back to questions", state()["phase"] == "ask" and page.locator(".gw-q").count() > 0)

        # ---- solo, Help me (cards go down by themselves)
        open_game("solo", "auto")
        tap(".gw-q")
        s = state()
        check("help me: ruled-out cards go down at once", sorted(set(s["words"]) - set(s["down"])) == sorted(s["possible"]))
        tap(".gw-done")
        check("help me: Next goes on", wait_phase("ask", "guess"))

        # ---- take turns
        open_game("turns", "me")
        check("turns: asks her to pick a secret word", "Pick your secret word" in page.locator(".gw-panel").inner_text())
        mine = LIST[0]
        tap(f".gw-card[data-w='{mine}']")
        check("turns: her word is marked and shown", state()["mine"] == mine and page.locator(".gw-card.mine").count() == 1
              and mine in page.locator(".gw-mine").inner_text())
        check("turns: the computer's word is a different word", state()["secret"] != mine)
        check("turns: the computer's cards show as tiles", page.locator(".gw-bot-tile").count() == 12)
        tap(".gw-next")
        tap(".gw-q"); flip_right()
        page.wait_for_selector(".gw-botgo", timeout=5000)
        tap(".gw-botgo")
        if page.locator(".gw-yes").count():
            q = page.locator(".gw-botq").inner_text()
            check("bot turn: asks about her word out loud", heard()[-1].startswith("Does your word"), heard()[-1])
            truth = page.evaluate("""async (args) => { const s = await import('/js/sounds.js');
              const qs = s.splitting(args.left); const q = qs.find((x) => '🤖 ' + x.ask('your word') === args.q);
              return s.answer(q, args.mine); }""", {"left": state()["botPossible"], "q": q, "mine": mine})
            g1 = gp()
            tap(".gw-no" if truth else ".gw-yes")
            check("bot turn: a slip -> listen again, no penalty", "listen again" in msg().lower() and page.locator(".gw-yes").count() == 1, msg())
            tap(".gw-yes" if truth else ".gw-no")
            s = state()
            check("bot turn: her answer narrows the computer's cards, her word kept", mine in s["botPossible"] and len(s["botPossible"]) < 12)
            check("bot turn: answering is a garden point", gp() == g1 + 1)
            check("bot turn: tiles fade for the computer's ruled-out words", page.locator(".gw-bot-tile.down").count() == 12 - len(s["botPossible"]))
        # Keep playing honestly, but she only makes wrong guesses, so the computer finds her word.
        def truthful():
            q = page.locator(".gw-botq").inner_text()
            t = page.evaluate("""async (args) => { const s = await import('/js/sounds.js');
              const q = s.splitting(args.left).find((x) => '🤖 ' + x.ask('your word') === args.q); return s.answer(q, args.mine); }""",
              {"left": state()["botPossible"], "q": q, "mine": mine})
            tap(".gw-yes" if t else ".gw-no")
        # The race is random (her wrong guesses vs the computer's random questions), so allow a few games.
        for game in range(6):
            for _ in range(60):
                if os.environ.get("GW_DEBUG"): print("  ", state()["phase"], len(state()["botPossible"]), len(state()["possible"]))
                if page.locator(".gw-end").count(): break
                if page.locator(".gw-yes").count(): truthful(); continue
                if page.locator(".gw-botgo").count(): tap(".gw-botgo"); continue
                if page.locator(".gw-next").count(): tap(".gw-next"); continue
                s = state()
                if s["phase"] == "pick": tap(f".gw-card[data-w='{mine}']"); continue
                if s["phase"] == "ask": tap(".gw-know"); continue
                if s["phase"] == "guess":
                    wrong = [w for w in s["words"] if w not in s["down"] and w != s["secret"]]
                    tap(f".gw-card[data-w='{(wrong or [s['secret']])[0]}']"); time.sleep(0.2); continue
                time.sleep(0.1)
            if "guessed your word" in page.locator(".gw-end").inner_text(): break
            tap(".gw-again"); page.wait_for_selector(".gw-card")
        end = page.locator(".gw-end").inner_text() if page.locator(".gw-end").count() else ""
        check("turns: the computer can find her word (gentle end, no confetti)", "guessed your word" in end and page.locator(".confetti").count() == 0, end)
        page.screenshot(path=os.path.join(SHOTS, "guesswhat_turns.png"))

        # ---- options are remembered
        page.goto(URL); page.wait_for_selector(".mcard"); tap(".mcard", has_text="Guess What"); page.wait_for_selector(".gw-start")
        check("options remembered (turns, I do it)", page.locator("[data-opt='play:turns'].primary").count() == 1 and page.locator(".opt-summary").inner_text() == "Putting cards down: I do it")
        check("start screen: only Just me / Take turns; cards-down is under ⚙️ Options", page.locator("[data-opt^='flip:']").count() == 0 and page.locator(".opt-more").count() == 1)

        # ---- phone width
        page.set_viewport_size({"width": 390, "height": 760})
        tap("[data-opt='play:solo']"); tap(".gw-start"); page.wait_for_selector(".gw-q")
        sw = page.evaluate("document.documentElement.scrollWidth")
        check("phone: no sideways scroll", sw <= 390, str(sw))
        check("phone: cards are touch-sized (>= 44px tall)", page.locator(".gw-card").first.bounding_box()["height"] >= 44)
        page.screenshot(path=os.path.join(SHOTS, "guesswhat_phone.png"), full_page=True)
        tap("#back"); page.wait_for_selector(".mcard")
        check("home mid-game", page.locator(".mcard").count() == 28)
        page.set_viewport_size({"width": 1024, "height": 768})

        # ---- too few words it can say
        ctx2 = b.new_context(viewport={"width": 1024, "height": 768}, service_workers="block")
        ctx2.add_init_script(INIT)
        ctx2.route(URL + "words.txt", lambda r: r.fulfill(body="# tiny\nzzqx\nfriend\nwhale\nqqzv\n", content_type="text/plain"))
        p2 = ctx2.new_page(); p2.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        p2.goto(URL); p2.wait_for_selector(".mcard"); p2.locator(".mcard", has_text="Guess What").first.click()
        p2.wait_for_selector(".note:has-text('needs at least')", timeout=10000)
        check("too few known words: a gentle note", "This list has 2" in p2.locator(".note").inner_text(), p2.locator(".note").inner_text())
        ctx2.close()
        b.close()
finally:
    server.kill()

check("no page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
