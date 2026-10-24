"""Tests for Monster Parade (issue #67): options, getting monsters ready (questions -> choices), the strip, the finale.

Run from the repo root:   python3 tests/parade_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, re, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8783
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
localStorage.setItem('spelling-games.parade.fast', '1');
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
        def state(): return page.evaluate("document.querySelector('.game').__parade.state()")
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def heard(): return page.evaluate("window.__heard.slice()")
        def options(*labels):
            tap(".pd-setup .opt-more"); page.wait_for_selector(".opt-panel")
            for t in labels: page.locator(".opt-panel .btn").get_by_text(t, exact=True).first.tap()
            tap(".opt-panel .opt-done")
        def open_parade():
            page.locator(".mcard", has_text="Monster Parade").first.tap()
            page.wait_for_selector(".pd-setup")
        def type_answer(s):
            for ch in s: tap(f".ch-q .key:text-is('{ch}')")
            tap(".ch-q button:has-text('Check')")
        def answer_right():
            if page.locator(".ch-q .bigword").count():
                type_answer(str(evalmath(page.locator(".ch-q .bigword").inner_text())))
            else:
                word = next(w for w in LIST if w in heard()[-1].lower())
                type_answer(word)
        def answer_wrong():  # second chance on: two misses, then OK
            for _ in range(2):
                if page.locator(".ch-q button:has-text('Check')").count() == 0: break
                type_answer("1" if page.locator(".ch-q .bigword").count() else "zq")
            tap(".ch-q button:has-text('OK')")
        def one_slot(pick=0):  # Next question -> right answer -> pick a choice
            tap(".pd-go"); answer_right()
            page.wait_for_selector(".pd-choice", timeout=5000)
            n = page.locator(".pd-choice").count()
            tap(f".pd-choice >> nth={pick}")
            return n
        def one_monster(name=None):
            if name is None: tap(".pd-skip")
            else:
                page.locator(".pd-panel .text-in").fill(name); tap(".pd-named")
            for _ in range(3): one_slot()
            page.wait_for_selector(".pd-next", timeout=5000)

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.3)
        check("menu has 28 cards", page.locator(".mcard").count() == 28)
        check("menu: Monster Parade is in Adventures", page.locator(".sect", has_text="Adventures").locator(".mcard", has_text="Monster Parade").count() == 1)

        # ---- art: every item renders and changes the picture
        arts = page.evaluate("""async () => { const a = await import('/js/games/parade/art.js'); const m = a.randomMonster(() => 0.3);
          const bare = a.scene(m); const bad = [];
          for (const slot of a.SLOTS) for (const it of a.ITEMS[slot]) { const s = a.scene(m, { [slot]: it.id });
            if (!s.includes('<svg') || s === bare) bad.push(slot + ':' + it.id); }
          return { bad, slots: a.SLOTS, n: a.SLOTS.map((s) => a.ITEMS[s].length) }; }""")
        check("art: every outfit, prop and ride draws something on the monster", not arts["bad"], ", ".join(arts["bad"]))
        check("art: three slots with at least 3 items each", len(arts["slots"]) == 3 and min(arts["n"]) >= 3, str(arts))

        # ---- start screen + options
        open_parade()
        check("start screen: one Start button and ⚙️ Options, no question choices on it",
              page.locator(".pd-setup .pd-start").count() == 1 and page.locator(".pd-setup .opt-more").count() == 1
              and page.locator(".pd-setup button:text-is('Math')").count() == 0)
        check("options summary = defaults (Both · Add & subtract? level · 4 monsters · second chance on)",
              re.fullmatch(r"Both · .+ · 4 monsters · second chance on", page.locator(".opt-summary").inner_text()) is not None, page.locator(".opt-summary").inner_text())
        page.screenshot(path=f"{SHOTS}/parade_start.png")
        tap(".pd-setup .opt-more"); page.wait_for_selector(".opt-panel")
        check("options: questions, math level, 3–7 monsters, second chance", all(page.locator(f".opt-panel button:text-is('{t}')").count() == 1
              for t in ["Spelling", "Math", "Both", "3", "4", "5", "6", "7", "On", "Off"]))
        page.screenshot(path=f"{SHOTS}/parade_options.png")
        tap(".opt-panel .opt-done")
        options("Math", "Times tables 2–5", "3")
        check("options summary updates", page.locator(".opt-summary").inner_text() == "Math · Times tables 2–5 · 3 monsters · second chance on", page.locator(".opt-summary").inner_text())
        home(); open_parade()
        check("options remembered", page.locator(".opt-summary").inner_text() == "Math · Times tables 2–5 · 3 monsters · second chance on")

        # ---- a 3-monster math parade
        g0 = gp()
        tap(".pd-start")
        check("stage: the monster is big (>= 50% of the window's height) and not moving", page.locator(".pd-stage").bounding_box()["height"] >= 0.5 * 768
              and "<animate" not in page.locator(".pd-stage").inner_html(), str(page.locator(".pd-stage").bounding_box()))
        check("a monster arrives with a name box and Skip", page.locator(".pd-stage svg").count() == 1 and page.locator(".pd-panel .text-in").count() == 1 and page.locator(".pd-skip").count() == 1)
        check("strip: 3 places, none ready yet", page.locator(".pd-spot").count() == 3 and page.locator(".pd-spot.done").count() == 0)
        page.locator(".pd-panel .text-in").fill("Gloopy"); tap(".pd-named")
        check("name typed is used", state()["current"]["name"] == "Gloopy" and "Gloopy" in page.locator(".pd-need").inner_text())
        check("needs something to wear first", state()["slot"] == "outfit")
        tap(".pd-go")
        check("a math question with a number pad", page.locator(".ch-q .bigword").count() == 1 and page.locator(".ch-q .numpad").count() == 1)
        page.screenshot(path=f"{SHOTS}/parade_question.png")
        answer_wrong()
        page.wait_for_selector(".pd-go", timeout=5000)
        check("not right: gentle 'try another', no item, same slot", "try another" in page.locator(".pd-panel .msg").inner_text()
              and state()["current"]["items"] == {} and state()["slot"] == "outfit", page.locator(".pd-panel .msg").inner_text())
        tap(".pd-go"); answer_right()
        page.wait_for_selector(".pd-choice", timeout=5000)
        ids = page.evaluate("[...document.querySelectorAll('.pd-choice')].map(b => b.dataset.id)")
        check("right: 3 different choices, each showing the monster wearing it", len(ids) == 3 and len(set(ids)) == 3 and page.locator(".pd-choice svg").count() == 3)
        page.screenshot(path=f"{SHOTS}/parade_choices.png")
        tap(".pd-choice >> nth=1")
        check("the picked item goes on the monster", state()["current"]["items"].get("outfit") == ids[1] and state()["slot"] == "prop")
        one_slot(); one_slot()
        page.wait_for_selector(".pd-next", timeout=5000)
        st = state()
        check("monster 1 ready: outfit + prop + ride, in the strip", len(st["ready"]) == 1 and set(st["ready"][0]["items"]) == {"outfit", "prop", "ride"}
              and page.locator(".pd-spot.done").count() == 1 and "Gloopy" in page.locator(".pd-line").inner_text())
        page.screenshot(path=f"{SHOTS}/parade_strip.png")
        tap(".pd-next")
        one_monster(None)
        check("Skip gives a fun name", state()["ready"][1]["name"] not in ("", None), str(state()["ready"]))
        tap(".pd-next")
        one_monster("Zap")
        check("last monster: button starts the parade", "Start the parade" in page.locator(".pd-next").inner_text())
        used = [m["items"]["outfit"] for m in state()["ready"]]
        check("choices prefer items not used yet (3 different outfits)", len(set(used)) == 3, str(used))
        tap(".pd-next")
        page.wait_for_selector(".pd-parade")
        check("finale: all 3 monsters on the road, Hooray, confetti", page.locator(".pd-marcher").count() == 3 and "Hooray" in page.locator(".pd-parade h2").inner_text()
              and page.locator(".confetti").count() >= 1)
        time.sleep(0.4)
        moving = page.evaluate("document.querySelector('.pd-row').getAnimations().length")
        check("finale: the parade rolls by (an animation is running)", moving >= 1, str(moving))
        mv = page.evaluate("""() => { const a = document.querySelector('.pd-row').getAnimations()[0]; const k = a.effect.getKeyframes();
          return { from: k[0].transform, to: k[k.length - 1].transform,
                   svgMove: [...document.querySelectorAll('.pd-marcher svg')].every((s) => s.innerHTML.includes('<animate')) }; }""")
        check("finale: rolls left to right", mv["from"].startswith("translateX(-") and not mv["to"].startswith("translateX(-"), str(mv))
        check("finale: monsters move (wheels/legs/bobbing in the SVG)", mv["svgMove"], str(mv))
        names = page.locator(".pd-marcher .pd-name").all_inner_texts()
        check("finale: the first monster ready leads (rightmost)", names[-1] == "Gloopy", str(names))
        page.screenshot(path=f"{SHOTS}/parade_finale.png")
        check("garden points for her answers (10 questions answered)", gp() - g0 == 10, f"{g0} -> {gp()}")
        tap(".pd-again")
        check("New parade starts over", page.locator(".pd-spot.done").count() == 0 and page.locator(".pd-panel .text-in").count() == 1)
        home()

        # ---- spelling: the word is spoken inside the tap and logged
        open_parade(); options("Spelling"); tap(".pd-start"); tap(".pd-skip")
        n0 = len(heard())
        tap(".pd-go")
        h = heard()
        word = next((w for w in LIST if len(h) > n0 and w in h[-1].lower()), None)
        check("spelling: the word is spoken from the Next question tap", word is not None, str(h[-1:]))
        type_answer(word)
        page.wait_for_selector(".pd-choice", timeout=5000)
        prog = page.evaluate("Object.keys(JSON.parse(localStorage.getItem('spelling-games.progress.v1')||'{\"words\":{}}').words)")
        check("spelling: the word is logged in the hidden progress", word in prog, str(prog))
        home()

        # ---- second chance off: one miss shows the answer
        open_parade(); options("Math", "Off"); tap(".pd-start"); tap(".pd-skip"); tap(".pd-go")
        type_answer("1")
        check("second chance off: one miss shows the answer (OK)", page.locator(".ch-q button:has-text('OK')").count() == 1)
        home()

        # ---- phone width + reduced motion finale
        page.set_viewport_size({"width": 390, "height": 760})
        open_parade(); options("On", "3"); tap(".pd-start"); tap(".pd-skip"); tap(".pd-go")
        w = page.evaluate("document.documentElement.scrollWidth")
        check("phone: no sideways scroll during a question", w <= 390, str(w))
        answer_right(); page.wait_for_selector(".pd-choice", timeout=5000)
        w = page.evaluate("document.documentElement.scrollWidth")
        check("phone: no sideways scroll with the 3 choices", w <= 390, str(w))
        check("phone: the monster nearly fills the width", page.locator(".pd-stage").bounding_box()["width"] >= 330, str(page.locator(".pd-stage").bounding_box()))
        page.screenshot(path=f"{SHOTS}/parade_phone.png", full_page=True)
        home()
        page.set_viewport_size({"width": 1024, "height": 768})

        ctx2 = b.new_context(viewport={"width": 1024, "height": 768}, service_workers="block", reduced_motion="reduce")
        ctx2.add_init_script(INIT)
        ctx2.add_init_script("localStorage.setItem('spelling-games.parade.options', JSON.stringify({mode:'math', count:3, second:true}))")
        ctx2.route(URL + "words.txt", lambda r: r.fulfill(path=FIXTURE))
        p2 = ctx2.new_page(); p2.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        p2.goto(URL); p2.wait_for_selector(".mcard")
        p2.locator(".mcard", has_text="Monster Parade").first.click()
        p2.evaluate("""() => { document.querySelector('.pd-start').click(); }""")
        # finish quickly through the page's own flow
        for _ in range(3):
            p2.locator(".pd-skip").first.click()
            for _ in range(3):
                p2.locator(".pd-go").first.click()
                t = p2.locator(".ch-q .bigword").inner_text()
                for ch in str(evalmath(t)): p2.locator(f".ch-q .key:text-is('{ch}')").first.click()
                p2.locator(".ch-q button:has-text('Check')").first.click()
                p2.wait_for_selector(".pd-choice", timeout=5000)
                p2.locator(".pd-choice").first.click()
            p2.wait_for_selector(".pd-next", timeout=5000)
            p2.locator(".pd-next").first.click()
        p2.wait_for_selector(".pd-parade")
        check("reduced motion: the parade is a still row, nothing moving in the pictures", p2.locator(".pd-road.still").count() == 1
              and "<animate" not in p2.locator(".pd-road").inner_html())
        ctx2.close()

        check("no console/page errors", not errors, "; ".join(errors[:3]))
        b.close()
finally:
    server.terminate()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
