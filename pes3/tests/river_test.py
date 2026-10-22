"""Tests for Lily Pad River: setup, moving pads, math / spelling / both, misspellings, gentle feedback.

Run from the repo root:   python3 tests/river_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, re, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8770
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
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True)
        ctx.add_init_script(INIT)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=FIXTURE))
        ctx.route("**/audio/manifest.json", lambda r: r.fulfill(status=404))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "manifest" not in m.text and "404" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def tap(sel, **kw): page.locator(sel, **kw).first.tap()
        def home(): tap("#back")
        def msg(): return page.locator(".msg").first.inner_text()
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def prog(): return page.evaluate("Object.values(JSON.parse(localStorage.getItem('spelling-games.progress.v1')||'{\"words\":{}}').words).reduce((s, w) => s + w.c + w.m, 0)")
        def pad_values(): return page.evaluate("[...document.querySelectorAll('.lp-pad')].map(e => e.dataset.v)")
        def click_pad(v): page.locator(f".lp-pad[data-v='{v}']").first.evaluate("e => e.click()")  # JS click: pads move
        def opener(mode, level=None):
            page.locator(".mcard", has_text="Lily Pad River").first.tap()
            tap(f".zt-setup button:has-text('{mode}')")
            if level: tap(f".zt-setup button:has-text('{level}')")
            tap("button:has-text('Start!')")
            page.wait_for_selector(".lp-pad")

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.5)
        check("menu: Lily Pad River is in the Fun section",
              page.locator(".sect", has_text="Fun").locator(".mcard", has_text="Lily Pad River").count() == 1)
        check("menu: old Number River is gone", page.locator(".mcard", has_text="Number River").count() == 0)

        # ---- setup
        page.locator(".mcard", has_text="Lily Pad River").first.tap()
        check("setup offers Spelling / Math / Both", all(page.locator(f".zt-setup button:has-text('{t}')").count() == 1 for t in ["Spelling", "Math", "Both"]))
        check("setup shows math levels unless Spelling", page.locator(".zt-setup button:has-text('Times tables 2–5')").count() == 1)
        tap(".zt-setup button:has-text('Spelling')")
        check("Spelling hides math levels", page.locator(".zt-setup button:has-text('Times tables 2–5')").count() == 0)
        page.screenshot(path=f"{SHOTS}/river_setup.png")
        home()

        # ---- math: 10 questions, pads move, wrong is gentle and sinks, right hops the frog on
        g0 = gp(); p0 = prog()
        opener("Math", "Times tables 2–5")
        check("math: 2 lanes x 4 pads", page.locator(".lp-lane").count() == 2 and page.locator(".lp-pad").count() == 8)
        x0 = page.evaluate("[...document.querySelectorAll('.lp-pad')].map(e => e.getBoundingClientRect().x)")
        time.sleep(0.6)
        x1 = page.evaluate("[...document.querySelectorAll('.lp-pad')].map(e => e.getBoundingClientRect().x)")
        check("math: pads float to the right", all(b > a for a, b in zip(x0, x1)), f"{x0} -> {x1}")
        overlap = page.evaluate("""() => [...document.querySelectorAll('.lp-lane')].some(l => {
            const r = [...l.children].map(e => e.getBoundingClientRect()).sort((a, b) => a.x - b.x);
            return r.some((a, i) => i && a.x < r[i - 1].x + r[i - 1].width - 1); })""")
        check("math: pads in a lane never overlap", not overlap)
        for i in range(10):
            page.wait_for_function(f"document.querySelector('.prompt') && document.querySelector('.prompt').textContent.includes('{i + 1} of')", timeout=6000)
            ans = evalmath(page.locator(".mq").inner_text())
            vals = pad_values()
            check(f"math q{i + 1}: each lane has the answer once", vals[:4].count(str(ans)) == 1 and vals[4:].count(str(ans)) == 1, str(vals)) if i in (0, 9) else None
            if i == 0:
                wrong = next(v for v in vals if v != str(ans))
                click_pad(wrong)
                check("math: wrong answer is gentle", msg() != "" and "wrong" not in msg().lower(), msg())
                check("math: wrong value sinks in both lanes", page.locator(f".lp-pad.sunk[data-v='{wrong}']").count() == 2)
                click_pad(next(v for v in vals if v not in (wrong, str(ans))))
                check("math: answer glows after 2 tries", page.locator(f".lp-pad.glow[data-v='{ans}']").count() == 2)
            click_pad(ans)
            if i == 0:
                check("math: frog hops onto the right pad", page.locator(".lp-pad.right .lp-frog").count() == 1)
                page.screenshot(path=f"{SHOTS}/river_math_right.png")
        page.wait_for_selector(".finish", timeout=6000)
        check("math: finishes after 10", True)
        check("math: +10 garden points, no hidden progress", gp() - g0 == 10 and prog() == p0, f"{gp() - g0} {prog() - p0}")
        home()

        # ---- spelling: hear the word, pick its spelling, Next button (speech needs a tap on iPad)
        g0 = gp(); p0 = prog()
        opener("Spelling")
        for i in range(10):
            page.wait_for_function(f"document.querySelector('.prompt').textContent.includes('{i + 1} of')", timeout=6000)
            word = page.evaluate("window.__heard.at(-1)")
            vals = pad_values()
            if i == 0:
                page.screenshot(path=f"{SHOTS}/river_spelling.png")
                lane = vals[:4]
                check("spelling: says a list word", word in LIST, word)
                check("spelling: 4 different choices, one is the word", len(set(lane)) == 4 and word in lane, str(lane))
                check("spelling: misspellings are not other list words", not [v for v in lane if v != word and v in LIST] or len(word) <= 3, str(lane))
                click_pad(next(v for v in vals if v != word))
                check("spelling: wrong pick is gentle", "wrong" not in msg().lower() and msg() != "", msg())
            click_pad(word)
            if i < 9:
                page.wait_for_selector("button:has-text('Next'):visible", timeout=3000)
                tap("button:has-text('Next')")
        page.wait_for_selector(".finish", timeout=6000)
        check("spelling: finishes after 10", True)
        check("spelling: logs 10 words (1 miss) + 10 garden points", prog() - p0 == 10 and gp() - g0 == 10, f"{prog() - p0} {gp() - g0}")
        home()

        # ---- both: mix of spelling and math
        opener("Both", "Times tables 2–5")
        kinds = set()
        for i in range(10):
            page.wait_for_function(f"document.querySelector('.prompt').textContent.includes('{i + 1} of')", timeout=6000)
            if page.locator(".mq").count():
                kinds.add("math"); click_pad(evalmath(page.locator(".mq").inner_text()))
            else:
                kinds.add("spell"); click_pad(page.evaluate("window.__heard.at(-1)"))
            if i < 9:
                page.wait_for_function(f"document.querySelector('.prompt').textContent.includes('{i + 2} of') || [...document.querySelectorAll('button')].some(b => b.textContent.includes('Next') && !b.hidden)", timeout=6000)
                if page.locator("button:has-text('Next'):visible").count(): tap("button:has-text('Next')")
        page.wait_for_selector(".finish", timeout=6000)
        check("both: finishes after 10", True)
        check("both: mode remembered", page.evaluate("localStorage.getItem('spelling-games.river.mode')") == "both")
        print("  (both mode kinds seen: %s)" % sorted(kinds))
        home()

        # ---- misspelling generator
        res = page.evaluate("""async (list) => { const d = await import('./js/dictionary.js'); await d.loadDictionary();
            const r = await import('./js/games/river.js');
            const out = {};
            for (const w of [...list, 'bunnies', 'puppy', 'carried']) out[w] = r.misspellings(w, new Set(list));
            out.__real = [...list, 'bunnies', 'puppy'].flatMap(w => out[w].filter(m => d.inDictionary(m)));
            return out; }""", LIST)
        check("misspell: never the word itself", all(w not in res[w] for w in LIST))
        check("misspell: never a real dictionary word", not res["__real"], str(res["__real"]))
        check("misspell: bunnies -> bunnys/bunnyes trap", any(m in res["bunnies"][:2] for m in ["bunnys", "bunnyes", "bunneys", "bunnees"]), str(res["bunnies"][:3]))
        check("misspell: friend -> freind available", "freind" in res["friend"], str(res["friend"]))
        check("misspell: no duplicates", all(len(v) == len(set(v)) for k, v in res.items() if not k.startswith("__")))

        # ---- small screens + reduced motion
        page.set_viewport_size({"width": 390, "height": 760})
        opener("Spelling")
        check("phone: no horizontal overflow", not page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        page.screenshot(path=f"{SHOTS}/river_phone.png")
        home()
        page.emulate_media(reduced_motion="reduce")
        opener("Math", "Times tables 2–5")
        x0 = page.evaluate("[...document.querySelectorAll('.lp-pad')].map(e => e.getBoundingClientRect().x)")
        time.sleep(0.4)
        x1 = page.evaluate("[...document.querySelectorAll('.lp-pad')].map(e => e.getBoundingClientRect().x)")
        inside = page.evaluate("""() => { const r = document.querySelector('.lp-river').getBoundingClientRect();
            return [...document.querySelectorAll('.lp-pad')].every(e => { const b = e.getBoundingClientRect(); return b.x >= r.x - 1 && b.right <= r.right + 1; }); }""")
        check("reduced motion: pads sit still, all visible", x0 == x1 and inside)
        page.screenshot(path=f"{SHOTS}/river_reduced_motion.png")
        home()
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
