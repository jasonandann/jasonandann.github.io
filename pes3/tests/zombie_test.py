import os, tempfile
from pathlib import Path
import json, re, subprocess, sys, time, os
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8766
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)

FAKE_TTS = """
window.__spoken = [];
const fake = { speak(u){ window.__spoken.push(u.text); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
"""
results, errors = [], []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", SITE],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True)
        ctx.add_init_script(FAKE_TTS)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")))  # fixed list, not the weekly one
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        tap = lambda sel, **kw: page.locator(sel, **kw).first.tap()
        def spoken_word(): return page.evaluate("window.__spoken[window.__spoken.length-1]").split(".")[0].strip()
        def pos(i=0): return int(page.locator(f".pawn.p{i}").get_attribute("data-pos"))
        def type_text(s):
            for ch in s: page.locator(".zt-q .kb .key", has_text=ch).first.tap()
        def open_zombie():
            page.goto(URL); page.wait_for_selector(".mcard")
            tap(".mcard:has-text('Zombie Trail')")
        def pick(label): tap(f".zt-setup .btn:has-text('{label}')")

        # ---------- setup screen
        open_zombie()
        check("setup screen shown", page.locator(".zt-setup h2").inner_text().endswith("Zombie Trail"))
        check("defaults: 1 player / spelling / 3 zombies / second chance on",
              page.locator(".zt-setup .btn.primary").all_inner_texts() == ["1 player", "Spelling", "3", "On", "Start!"],
              str(page.locator(".zt-setup .btn.primary").all_inner_texts()))
        pick("Both")
        tap(".zt-setup .btn:has-text('Start!')")
        page.wait_for_selector(".zt-board")

        # ---------- board structure
        check("board has 36 squares", page.locator(".sq").count() == 36)
        specials = page.eval_on_selector_all(".sq", "els=>els.map(e=>({i:+e.dataset.i,k:e.dataset.kind,to:e.dataset.to===''?null:+e.dataset.to}))")
        sc = {s["i"]: s["to"] for s in specials if s["k"] == "shortcut"}
        zb = {s["i"]: s["to"] for s in specials if s["k"] == "zombie"}
        check("4 shortcuts go forward 5-10", len(sc) == 4 and all(5 <= t - f <= 10 for f, t in sc.items()), str(sc))
        check("3 zombies (default) go back 4-9", len(zb) == 3 and all(4 <= f - t <= 9 for f, t in zb.items()), str(zb))
        dests = list(sc.values()) + list(zb.values()); srcs = list(sc) + list(zb)
        check("no chaining (destinations are never special squares)", not (set(dests) & set(srcs)) and len(set(dests + srcs)) == 14)
        # many generated boards: exact zombie count for every option, never two zombies on consecutive squares
        gen = page.evaluate("""async () => {
          const m = await import('./js/games/zombie.js');
          const bad = [];
          for (const n of m.ZOMBIE_COUNTS) for (let k = 0; k < 400; k++) {
            const z = Object.keys(m.makeBoard(n).zombies).map(Number);
            if (z.length !== n) bad.push(`n=${n} got ${z.length}`);
            for (const a of z) if (z.includes(a + 1)) bad.push(`n=${n} ${a},${a + 1}`);
          }
          return { counts: m.ZOMBIE_COUNTS, bad: bad.slice(0, 5) };
        }""")
        check("zombie options are 1-5", gen["counts"] == [1, 2, 3, 4, 5], str(gen["counts"]))
        check("2000 boards: exact zombie count, no two zombies in a row", not gen["bad"], str(gen["bad"]))
        check("squares 0,1,34,35 not special", not ({0, 1, 34, 35} & set(srcs + dests)))
        check("pawn starts at 0", pos() == 0)
        # serpentine geometry: square 5 is far right bottom row, 6 is far right one row up, 11 far left
        geo = page.eval_on_selector_all(".sq", "els=>els.map(e=>[+e.dataset.i,e.style.gridColumn,e.style.gridRow])")
        g = {i: (c, r) for i, c, r in geo}
        check("serpentine layout (0 bottom-left, 5 bottom-right, 6 above 5, 35 top)", g[0] == ("1", "6") and g[5] == ("6", "6") and g[6] == ("6", "5") and g[11] == ("1", "5") and g[35][1] == "1", str((g[0], g[5], g[6], g[11], g[35])))
        page.screenshot(path=f"{SHOTS}/zombie_board.png")

        # ---------- play full games (as many as needed to exercise every outcome), steering turns
        seen = {"shortcut": 0, "zombie": 0, "wrong_back": 0, "wrong_at_start": 0, "second_chance": 0, "math": 0, "spell": 0, "win": False}
        problems = []
        games = 0
        while True:
            games += 1
            specials = page.eval_on_selector_all(".sq", "els=>els.map(e=>({i:+e.dataset.i,k:e.dataset.kind,to:e.dataset.to===''?null:+e.dataset.to}))")
            sc = {s_["i"]: s_["to"] for s_ in specials if s_["k"] == "shortcut"}
            zb = {s_["i"]: s_["to"] for s_ in specials if s_["k"] == "zombie"}
            turns = 0
            while turns < 200:
                turns += 1
                if page.locator(".finish").count(): break
                tap("button:has-text('Roll')")
                page.wait_for_selector(".zt-q")
                n = int(page.locator(".zt-die .die").get_attribute("data-n"))
                if not 1 <= n <= 6: problems.append(f"bad die {n}")
                cur = pos()
                good, bad = min(35, cur + n), max(0, cur - n)
                is_math = page.locator(".zt-q .bigword").count() == 1
                if is_math:
                    seen["math"] += 1
                    m = re.match(r"(\d+) ([+−×÷]) (\d+) = \?", page.locator(".zt-q .bigword").inner_text())
                    a_, op, c_ = int(m[1]), m[2], int(m[3])
                    ans = str({"+": a_ + c_, "−": a_ - c_, "×": a_ * c_, "÷": a_ // c_}[op])
                else:
                    seen["spell"] += 1
                    ans = spoken_word()
                    if page.locator(".zt-q .hear .btn.speaker").count() != 1: problems.append("no hear button")
                # steer toward outcomes not yet seen; otherwise just make progress
                want_right = True
                if good in sc: want_right = True
                elif good in zb and seen["zombie"] < 1: want_right = True
                elif bad in zb and seen["zombie"] < 1 and cur > 0: want_right = False
                elif bad in sc and seen["shortcut"] < 2 and cur > 0 and bad != cur: want_right = False
                elif good in zb: want_right = False
                elif cur == 0 and seen["wrong_at_start"] == 0: want_right = False
                elif cur > 0 and seen["wrong_back"] == 0: want_right = False
                wrong_txt = "0" if is_math else "zz"
                if want_right:
                    type_text(ans); tap(".zt-q button:has-text('Check')")
                    target = good
                else:
                    type_text(wrong_txt); tap(".zt-q button:has-text('Check')")
                    if "answer is" not in page.locator(".zt-q .msg").inner_text(): seen["second_chance"] += 1
                    type_text(wrong_txt); tap(".zt-q button:has-text('Check')")
                    note = page.locator(".zt-q .msg").inner_text()
                    if f"The answer is {ans}." != note: problems.append(f"reveal text {note!r} vs {ans!r}")
                    tap(".zt-q button:has-text('OK')")
                    target = bad
                    seen["wrong_at_start" if cur == 0 else "wrong_back"] += 1
                expected = target
                if target in sc: expected = sc[target]; seen["shortcut"] += 1
                elif target in zb: expected = zb[target]; seen["zombie"] += 1
                page.wait_for_function("document.querySelector('.finish') || [...document.querySelectorAll('button')].some(b=>b.textContent.includes('Roll'))", timeout=20000)
                got = pos()
                if got != expected:
                    problems.append(f"game {games} turn {turns}: cur={cur} n={n} right={want_right} expected {expected} got {got}")
            if page.locator(".finish").count() != 1: break
            done = seen["shortcut"] >= 1 and seen["zombie"] >= 1 and seen["wrong_back"] >= 1 and seen["wrong_at_start"] >= 1 and seen["second_chance"] >= 1 and seen["math"] >= 1 and seen["spell"] >= 1
            if done or games >= 8: break
            tap(".finish button:has-text('Play again')"); tap(".zt-setup .btn:has-text('Start!')"); page.wait_for_selector(".zt-board")
        print(f"(played {games} game(s); outcomes seen: {seen})")
        check("game reached the finish", page.locator(".finish").count() == 1, f"turns={turns}")
        check("every move landed where the rules say", not problems, "; ".join(problems[:4]))
        check("covered: shortcut landing", seen["shortcut"] >= 1, str(seen))
        check("covered: zombie landing", seen["zombie"] >= 1, str(seen))
        check("covered: wrong answer moves back", seen["wrong_back"] >= 1, str(seen))
        check("covered: wrong answer at start stays at 0", seen["wrong_at_start"] >= 1, str(seen))
        check("covered: second chance retry message", seen["second_chance"] >= 1, str(seen))
        check("both question types appeared", seen["math"] >= 1 and seen["spell"] >= 1, str(seen))
        check("win screen text", "made it to the finish" in page.locator(".finish h2").inner_text())
        page.screenshot(path=f"{SHOTS}/zombie_win.png")
        prog = json.loads(page.evaluate("localStorage.getItem('spelling-games.progress.v1')") or "{}")
        check("spelling questions were logged to hidden progress", sum(v["c"] + v["m"] for v in prog.get("words", {}).values()) >= seen["spell"], str(prog)[:200])

        # ---------- play again -> setup; two players, second chance off
        tap(".finish button:has-text('Play again')")
        check("play again returns to setup", page.locator(".zt-setup").count() == 1)
        pick("2 players"); pick("Math"); tap(".zt-setup .btn:has-text('Off')")
        page.locator(".zt-setup .btn").get_by_text("5", exact=True).tap()
        tap(".zt-setup .btn:has-text('Start!')"); page.wait_for_selector(".zt-board")
        check("chosen zombie count (5) used on the board", page.locator(".sq[data-kind='zombie']").count() == 5)
        check("zombie count remembered", page.evaluate("localStorage.getItem('spelling-games.zombie.count')") == "5")
        check("two pawns present", page.locator(".pawn").count() == 2)
        check("P1 status first", "Player 1's turn" in page.locator(".zt-status").inner_text())
        tap("button:has-text('Roll')"); page.wait_for_selector(".zt-q")
        # second chance OFF: one wrong answer reveals immediately
        type_text("0"); tap(".zt-q button:has-text('Check')")
        check("second chance off: reveal after 1 miss", page.locator(".zt-q button:has-text('OK')").count() == 1)
        tap(".zt-q button:has-text('OK')")
        page.wait_for_function("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Roll'))", timeout=20000)
        check("turn passes to Player 2", "Player 2's turn" in page.locator(".zt-status").inner_text())
        tap("button:has-text('Roll')"); page.wait_for_selector(".zt-q")
        page.screenshot(path=f"{SHOTS}/zombie_math.png")
        # physical keyboard on math
        a = re.match(r"(\d+) ([+−×÷]) (\d+) = \?", page.locator(".zt-q .bigword").inner_text())
        x, op, y = int(a[1]), a[2], int(a[3])
        page.keyboard.type(str({"+": x + y, "−": x - y, "×": x * y, "÷": x // y}[op]))
        page.keyboard.press("Enter")
        check("physical keyboard answers math", page.locator(".zt-q .typed.good").count() == 1)
        page.wait_for_function("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Roll'))", timeout=20000)
        check("P2 moved forward, P1 unchanged-or-moved sanely", pos(1) > 0)

        # ---------- leaving mid-game must not throw (timers/keys cleaned)
        tap("button:has-text('Roll')"); page.wait_for_selector(".zt-q")
        tap("#back")
        page.keyboard.type("hello"); time.sleep(1.2)
        check("home after leaving mid-question", page.locator(".mcard").count() == 22)

        # ---------- phone layout
        page.set_viewport_size({"width": 390, "height": 800})
        open_zombie(); tap(".zt-setup .btn:has-text('Start!')"); page.wait_for_selector(".zt-board")
        tap("button:has-text('Roll')"); page.wait_for_selector(".zt-q")
        page.screenshot(path=f"{SHOTS}/zombie_phone.png", full_page=True)
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
