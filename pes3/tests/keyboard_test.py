"""Tests for the spelling keyboard: QWERTY by default, ABC layout only when a grown-up allows it, then her choice.

Run from the repo root:   python3 tests/keyboard_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8776
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")

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
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=FIXTURE))
        ctx.route("**/audio/manifest.json", lambda r: r.fulfill(status=404))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "manifest" not in m.text and "404" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def tap(sel, **kw): page.locator(sel, **kw).first.tap()
        def home(): tap("#back")
        def open_game(name): page.locator(".mcard", has_text=name).first.tap()
        def heard(): return page.evaluate("window.__heard.at(-1)").split(".")[0].strip()
        def letters(): return page.evaluate("[...document.querySelectorAll('.kb .key:not(.wide)')].map(k => k.textContent).join('')")
        def layout(): return page.evaluate("(document.querySelector('.kb').className.match(/kb-(\\w+)/) || [])[1]")
        def ls(k): return page.evaluate(f"localStorage.getItem('{k}')")
        def parent_panel():
            page.keyboard.type("parent"); page.wait_for_selector(".overlay h2:has-text('Grown-ups')")
        def type_on_screen(word):
            for ch in word: page.locator(".kb .key", has_text=ch).first.tap()

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.3)

        # ---------- default: QWERTY, no switch ----------
        open_game("Listen & Type"); page.wait_for_selector(".kb")
        check("default: QWERTY rows", layout() == "qwerty" and letters().startswith("qwertyuiop"), letters())
        check("default: no ABC/QWERTY switch (a grown-up must allow it first)", page.locator(".kb-switch").count() == 0)
        home()

        # ---------- parent panel setting ----------
        parent_panel()
        check("parent panel: Spelling keyboard section, QWERTY only selected", page.locator(".overlay h3:has-text('Spelling keyboard')").count() == 1
              and page.locator(".overlay [data-kb='qwerty']").get_attribute("aria-pressed") == "true")
        tap(".overlay [data-kb='choose']")
        check("parent: 'Let her choose' turns it on", ls("spelling-games.keyboard.abc") == "on"
              and page.locator(".overlay [data-kb='choose']").get_attribute("aria-pressed") == "true")
        tap(".overlay button:has-text('Close')")

        # ---------- she chooses ----------
        open_game("Listen & Type"); page.wait_for_selector(".kb")
        check("allowed: switch shows; iPad/desktop starts on QWERTY", page.locator(".kb-switch .kb-pick").count() == 2 and layout() == "qwerty"
              and page.locator(".kb-pick[data-layout='qwerty']").get_attribute("aria-pressed") == "true")
        tap(".kb-pick[data-layout='abc']")
        check("tap ABC: letters in alphabet order", layout() == "abc" and letters().startswith("abcdefghijklmnopqrstuvwxyz"), letters())
        check("her choice is remembered", ls("spelling-games.keyboard.layout") == "abc")
        vow = page.evaluate("""() => { const k = (c) => [...document.querySelectorAll('.kb .key')].find(e => e.textContent === c);
            const bg = (e) => getComputedStyle(e).backgroundColor; return { a: [k('a').classList.contains('vow'), bg(k('a'))], b: [k('b').classList.contains('vow'), bg(k('b'))],
              vow: [...document.querySelectorAll('.kb .key.vow')].map(e => e.textContent).join('') }; }""")
        check("ABC: vowels (a e i o u) get a very light tint, consonants stay white", vow["vow"] == "aeiou" and vow["a"][1] == "rgb(255, 244, 248)" and vow["b"][1] == "rgb(255, 255, 255)", str(vow))
        page.screenshot(path=f"{SHOTS}/keyboard_abc_ipad.png")
        w = heard()
        type_on_screen(w); tap("button:has-text('Check')")
        check("ABC keys type the word (Listen & Type accepts it)", page.locator(".typed.good").count() == 1, w)
        size = page.evaluate("Math.min(...[...document.querySelectorAll('.kb .key')].map(k => Math.min(k.getBoundingClientRect().width, k.getBoundingClientRect().height)))")
        check("ABC keys >= 44 px on iPad", size >= 44, str(size))
        home()
        open_game("Fill the Blanks"); page.wait_for_selector(".kb")
        check("the choice carries to other games (Fill the Blanks)", layout() == "abc")
        tap(".kb-pick[data-layout='qwerty']")
        check("…and she can switch back to QWERTY", layout() == "qwerty" and ls("spelling-games.keyboard.layout") == "qwerty" and page.locator(".kb .key.vow").count() == 0)
        home()

        # ---------- Wordal: key colours survive a switch; colours beat the vowel tint ----------
        open_game("Wordal"); page.wait_for_selector(".kb")
        w = heard(); n = len(w)
        guess = ("aeiou" * 3)[:n] if "a" not in w else ("eioub" * 3)[:n]
        page.keyboard.type(guess); page.keyboard.press("Enter")
        time.sleep(n * 0.15 + 0.6)
        before = page.evaluate("Object.fromEntries([...document.querySelectorAll('.kb .key[data-s]')].map(k => [k.textContent, k.dataset.s]))")
        tap(".kb-pick[data-layout='abc']")
        after = page.evaluate("Object.fromEntries([...document.querySelectorAll('.kb .key[data-s]')].map(k => [k.textContent, k.dataset.s]))")
        check("Wordal: key colours are kept when switching layout", before and before == after, f"{before} -> {after}")
        marked = next((c for c in after if c in "aeiou"), None)
        if marked:
            col = page.evaluate(f"getComputedStyle([...document.querySelectorAll('.kb .key')].find(e => e.textContent === '{marked}')).backgroundColor")
            check("Wordal: green/amber/grey always show over the vowel tint", col != "rgb(255, 244, 248)", f"{marked}: {col}")
        page.screenshot(path=f"{SHOTS}/keyboard_abc_wordal.png")
        home()

        # ---------- letter pop-up while a finger is on a key (both layouts) ----------
        def press(letter, kind="touch"):
            return page.evaluate(f"""() => {{ const k = [...document.querySelectorAll('.kb .key')].find(e => e.textContent === '{letter}');
                k.dispatchEvent(new PointerEvent('pointerdown', {{ bubbles: true, pointerType: '{kind}', isPrimary: true }}));
                const p = document.querySelector('.kb-preview'), r = k.getBoundingClientRect(), q = p.getBoundingClientRect(), kb = document.querySelector('.kb').getBoundingClientRect();
                return {{ shown: !p.hidden, text: p.textContent, above: q.bottom <= r.top + 4 && q.bottom >= r.top - 8,
                         over: q.left <= r.left + r.width / 2 && q.right >= r.left + r.width / 2, inside: q.left >= kb.left - 1 && q.right <= kb.right + 1, big: q.width >= r.width }}; }}""")
        def release(): page.evaluate("document.querySelector('.kb .key').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }))")
        def preview_hidden(): return page.evaluate("document.querySelector('.kb-preview').hidden")
        for lay in ("qwerty", "abc"):  # ends on ABC: the "last choice" checks below expect it
            open_game("Listen & Type"); page.wait_for_selector(".kb")
            tap(f".kb-pick[data-layout='{lay}']")
            for letter in ("g", "q", "p"):
                r = press(letter)
                check(f"{lay}: holding '{letter}' pops the letter up above the key, inside the keyboard", r["shown"] and r["text"] == letter and r["above"] and r["over"] and r["inside"] and r["big"], str(r))
                if letter == "g": page.screenshot(path=f"{SHOTS}/keyboard_preview_{lay}.png")
                release()
                check(f"{lay}: lifting the finger hides it", preview_hidden())
            r = press("e", "mouse")
            check(f"{lay}: no pop-up for mouse clicks", not r["shown"])
            home()
        open_game("Listen & Type"); page.wait_for_selector(".kb")
        r = press("a"); w = heard()
        check("pop-up never types: a real tap still types once", page.evaluate("document.querySelector('.typed').textContent.trim()") == "", w)
        release(); page.locator(".kb .key", has_text="a").first.tap()
        check("…and the tap types the letter", page.evaluate("document.querySelector('.typed').textContent.trim()") == "a" and preview_hidden())
        home()

        # ---------- turning it off ----------
        parent_panel(); tap(".overlay [data-kb='qwerty']"); tap(".overlay button:has-text('Close')")
        open_game("Listen & Type"); page.wait_for_selector(".kb")
        check("grown-up turns it off: QWERTY, no switch (even though she chose ABC)", layout() == "qwerty" and page.locator(".kb-switch").count() == 0)
        home()
        parent_panel(); tap(".overlay [data-kb='choose']"); tap(".overlay button:has-text('Close')")
        open_game("Listen & Type"); page.wait_for_selector(".kb")
        check("turned back on: her last choice (ABC) comes back", layout() == "abc")
        home()

        # ---------- phone ----------
        page.set_viewport_size({"width": 390, "height": 760})
        page.evaluate("localStorage.removeItem('spelling-games.keyboard.layout')")
        open_game("Listen & Type"); page.wait_for_selector(".kb")
        check("phone, no choice yet: starts on ABC", layout() == "abc")
        cols = page.evaluate("getComputedStyle(document.querySelector('.kb-grid')).gridTemplateColumns.split(' ').length")
        kw = page.evaluate("Math.min(...[...document.querySelectorAll('.kb .key:not(.wide)')].map(k => k.getBoundingClientRect().width))")
        check("phone ABC: 7 across, keys >= 44 px wide", cols == 7 and kw >= 44, f"{cols} cols, {kw:.0f} px")
        check("phone: no horizontal overflow", not page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        sw = page.evaluate("Math.min(...[...document.querySelectorAll('.kb-pick')].map(k => k.getBoundingClientRect().height))")
        check("switch buttons are big enough to tap (>= 44 px)", sw >= 44, str(sw))
        page.screenshot(path=f"{SHOTS}/keyboard_abc_phone.png", full_page=True)
        w = heard()
        page.keyboard.type(w); page.keyboard.press("Enter")
        check("a physical keyboard still works with ABC on screen", page.locator(".typed.good").count() == 1, w)
        home()
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
