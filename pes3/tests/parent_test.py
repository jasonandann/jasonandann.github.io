"""Tests for the grown-ups passcode (issue #32): first-time setup, entry, wrong-try waits,
recovery code, change passcode, new recovery code, and no lock without Web Crypto.

Run from the repo root:   python3 tests/parent_test.py
Needs: pip install playwright && playwright install chromium
"""
import json, os, re, subprocess, sys, tempfile, time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8777
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")
KEY = "spelling-games.parent.v1"

INIT = """
const fake = { speak(){}, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
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

        def new_page(init=INIT):
            ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block")
            ctx.add_init_script(init)
            ctx.route(URL + "words.txt", lambda r: r.fulfill(path=FIXTURE))
            ctx.route("**/audio/manifest.json", lambda r: r.fulfill(status=404))
            pg = ctx.new_page()
            pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "manifest" not in m.text and "404" not in m.text else None)
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            pg.goto(URL); pg.wait_for_selector(".mcard"); time.sleep(0.2)
            return pg

        page = new_page()
        def tap(sel): page.locator(sel).first.tap()
        def settings(): return json.loads(page.evaluate(f"localStorage.getItem('{KEY}')") or "null")
        def open_lock(): page.keyboard.type("parent"); page.wait_for_selector(".overlay")
        def h2(): return page.locator(".overlay h2").inner_text()
        def msg(): return page.locator(".overlay .msg").inner_text()
        def prompt(): return page.locator(".overlay .pin-prompt").inner_text()
        def dots_on(): return page.locator(".pin-dots span.on").count()
        def pin(digits, ok=True):
            for d in digits: tap(f".pin-key[data-k='{d}']")
            if ok: tap(".pin-key[data-k='ok']")
        def wait_text(sel, text, timeout=5000):
            page.wait_for_function("([s, t]) => (document.querySelector(s) || {}).textContent?.includes(t)", arg=[sel, text], timeout=timeout)
        def panel_open(): return page.locator(".overlay h2", has_text="Grown-ups only").count() == 1

        # ---------- first time: set a passcode, or choose none ----------
        open_lock()
        check("first open asks to set a passcode (no panel yet)", "Set a grown-ups passcode" in h2() and not panel_open() and page.locator(".pin-pad .pin-key").count() == 12)
        check("…and offers 'Don't use a passcode'", page.locator(".overlay [data-act='none']").count() == 1)
        page.keyboard.type("parent")
        check("typing 'parent' again doesn't stack a second overlay", page.locator(".overlay").count() == 1)
        tap("[data-act='cancel']")
        check("Cancel closes and saves nothing", page.locator(".overlay").count() == 0 and settings() is None)
        open_lock(); tap("[data-act='none']")
        check("'Don't use a passcode' explains first", "No passcode?" in h2() and "your child" in page.locator(".overlay").inner_text())
        tap("[data-act='back']")
        check("Back returns to choosing a passcode", "Choose" in prompt())
        tap("[data-act='none']"); tap("[data-act='none-confirm']"); page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("no passcode: the panel opens, saved as noPasscode", panel_open() and settings()["noPasscode"] is True and settings()["pin"] is None)
        check("no passcode: the panel offers 'Set a passcode'", page.locator(".overlay [data-act='set-pin']").count() == 1 and page.locator(".overlay [data-act='change-pin']").count() == 0)
        page.keyboard.press("Escape"); page.keyboard.type("parent")
        check("no passcode: next time the panel opens straight away", panel_open() and page.locator(".pin-pad").count() == 0)

        # ---------- set a passcode from the panel: the code is shown BEFORE anything is saved ----------
        tap("[data-act='set-pin']")
        check("Set a passcode opens setup (no 'Don't use' there)", "Set a passcode" in h2() and page.locator(".overlay [data-act='none']").count() == 0)
        pin("123", ok=False)
        check("OK is off below 4 digits", page.locator(".pin-key[data-k='ok']").is_disabled() and dots_on() == 3)
        tap(".pin-key[data-k='back']")
        check("⌫ removes a digit", dots_on() == 2)
        tap(".pin-key[data-k='back']"); tap(".pin-key[data-k='back']")
        pin("1234567", ok=False)
        check("at most 6 digits", dots_on() == 6)
        for _ in range(6): tap(".pin-key[data-k='back']")
        pin("1234")
        check("asks for the passcode again", "again" in prompt())
        pin("1235")
        check("a mismatch starts over", "didn’t match" in msg() and "Choose" in prompt())
        pin("1234"); pin("1234")
        page.wait_for_selector(".recovery-code")
        check("recovery code shown, nothing saved yet", settings()["pin"] is None and settings()["noPasscode"] is True)
        tap("[data-act='cancel']")
        check("Cancel on the code screen: back to the panel, still no passcode", panel_open() and settings()["pin"] is None)
        tap("[data-act='set-pin']"); pin("1234"); pin("1234"); page.wait_for_selector(".recovery-code")
        code = page.locator(".recovery-code").inner_text()
        check("recovery code XXXX-XXXX without I/L/O/U", re.fullmatch(r"[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}", code) is not None, code)
        page.screenshot(path=f"{SHOTS}/parent-recovery.png")
        tap("[data-act='saved']"); page.keyboard.press("Escape")  # Escape mid-save must not lose anything
        page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("I've saved it: passcode + code saved together, panel back", panel_open())
        s = settings()
        check("passcode stored as salted PBKDF2 (no plain text)", s and set(s["pin"]) == {"salt", "hash", "iter"} and s["pin"]["iter"] == 600000
              and s["noPasscode"] is False and "1234" not in json.dumps(s["pin"]["hash"] + s["pin"]["salt"]) or False, json.dumps(s)[:200])
        check("recovery code stored hashed too", s and "hash" in s["recovery"] and code.replace("-", "") not in json.dumps(s))
        check("panel now offers Change / New code / Turn off", all(page.locator(f".overlay [data-act='{a}']").count() == 1 for a in ("change-pin", "new-code", "pin-off")))
        page.locator(".overlay .row button", has_text="Let her choose").first.tap()
        check("changing a setting reopens the panel without asking again", panel_open())
        page.keyboard.press("Escape")

        # ---------- entry ----------
        open_lock()
        check("next time it asks for the passcode", "Grown-ups passcode" in h2() and "Enter the passcode" in prompt())
        page.screenshot(path=f"{SHOTS}/parent-pin.png")
        pin("0000"); wait_text(".overlay .msg", "not it")
        check("a wrong passcode doesn't open the panel", not panel_open() and dots_on() == 0)
        pin("1234"); page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("the right passcode opens the panel", panel_open() and settings()["lock"]["fails"] == 0)
        page.keyboard.press("Escape")
        open_lock()
        page.keyboard.type("1234"); page.keyboard.press("Enter")
        page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("a physical keyboard works on the pad (digits + Enter)", panel_open())
        page.keyboard.press("Escape")
        open_lock(); page.keyboard.press("Escape")
        check("Escape closes the passcode screen", page.locator(".overlay").count() == 0)

        # ---------- wrong tries: a growing wait that survives a reload ----------
        open_lock()
        for _ in range(3):  # each check sets 'Checking…' inside the tap; wait for its answer
            pin("9999"); page.wait_for_function("!['', 'Checking…'].includes(document.querySelector('.overlay .msg').textContent)")
        check("3 wrong tries start a 30 s wait", "Too many tries" in msg() and re.search(r"in (2\d|30) s", msg()) is not None, msg())
        pin("1234", ok=False); page.keyboard.press("Enter")
        check("during the wait the pad is off (even the right passcode)", not panel_open() and dots_on() == 0 and page.locator(".pin-key[data-k='ok']").is_disabled())
        page.reload(); page.wait_for_selector(".mcard"); time.sleep(0.2)
        open_lock()
        check("the wait survives a reload", "Too many tries" in msg(), msg())
        page.keyboard.press("Escape")
        # pretend the wait is over (the clock is the only thing that moves it)
        page.evaluate(f"(() => {{ const s = JSON.parse(localStorage.getItem('{KEY}')); s.lock.until = Date.now() - 1; localStorage.setItem('{KEY}', JSON.stringify(s)); }})()")
        open_lock()
        pin("9999"); wait_text(".overlay .msg", "Too many")
        check("the next wrong try doubles the wait (1 min)", "1 min" in msg(), msg())
        page.evaluate(f"(() => {{ const s = JSON.parse(localStorage.getItem('{KEY}')); s.lock.until = Date.now() - 1; localStorage.setItem('{KEY}', JSON.stringify(s)); }})()")
        page.keyboard.press("Escape"); open_lock()
        pin("1234"); page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("after the wait the right passcode works and resets the count", panel_open() and settings()["lock"] == {"fails": 0, "until": 0})

        # ---------- Erase history keeps the passcode ----------
        page.evaluate("localStorage.setItem('spelling-games.battle.skill.v1', JSON.stringify({ spell: { p: 0.9, n: 5 } }))")
        page.once("dialog", lambda d: d.accept())
        page.locator(".overlay button", has_text="Erase history").tap()
        check("Erase history keeps the passcode and reopens the panel", panel_open() and settings()["pin"] is not None)
        check("Erase history also clears Battle Buddies' hidden skill estimate", page.evaluate("localStorage.getItem('spelling-games.battle.skill.v1')") is None)

        # ---------- change passcode (keeps the recovery code) ----------
        rec_before = settings()["recovery"]
        tap("[data-act='change-pin']")
        check("Change passcode opens setup", "Change passcode" in h2())
        tap("[data-act='cancel']")
        check("Cancel goes back to the panel, passcode unchanged", panel_open())
        tap("[data-act='change-pin']")
        pin("2468"); pin("2468"); page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("new passcode saved, recovery code kept", settings()["recovery"] == rec_before)
        page.keyboard.press("Escape"); open_lock()
        pin("1234"); wait_text(".overlay .msg", "not it")
        check("the old passcode no longer works", not panel_open())
        pin("2468"); page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("the new passcode works", panel_open())

        # ---------- forgot passcode ----------
        page.keyboard.press("Escape"); open_lock()
        tap("[data-act='forgot']")
        check("Forgot passcode? asks for the recovery code", "Forgot" in h2() and page.locator(".overlay .text-in").count() == 1)
        page.locator(".overlay .text-in").fill("ZZZZ-ZZZZ"); tap("[data-act='reset']"); wait_text(".overlay .msg", "match")
        check("a wrong recovery code is refused", "doesn’t match" in msg())
        page.locator(".overlay .text-in").fill(code.replace("-", " ").lower()); page.keyboard.press("Enter")
        page.wait_for_selector(".overlay h2:has-text('New passcode')")
        check("the recovery code works (any case, spaces instead of dash)", "New passcode" in h2())
        pin("1357"); pin("1357"); page.wait_for_selector(".recovery-code")
        code2 = page.locator(".recovery-code").inner_text()
        check("a reset shows a new recovery code", code2 != code)
        tap("[data-act='saved']"); page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("after the reset the panel opens", panel_open())

        # ---------- new recovery code ----------
        rec = settings()["recovery"]
        tap("[data-act='new-code']"); page.wait_for_selector(".recovery-code")
        code3 = page.locator(".recovery-code").inner_text()
        check("New recovery code shows a different code, not saved yet", code3 not in (code, code2) and settings()["recovery"] == rec)
        tap("[data-act='saved']"); page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("then saved, back to the panel", panel_open() and settings()["recovery"] != rec)

        # another tab/window changed the passcode meanwhile: refuse, change nothing
        before = page.evaluate(f"localStorage.getItem('{KEY}')")
        tap("[data-act='new-code']"); page.wait_for_selector(".recovery-code")
        page.evaluate(f"(() => {{ const s = JSON.parse(localStorage.getItem('{KEY}')); s.recovery = {{ salt: 'AA==', hash: 'other', iter: 1 }}; localStorage.setItem('{KEY}', JSON.stringify(s)); }})()")
        tap("[data-act='saved']"); page.wait_for_selector(".overlay h2:has-text('Not saved')")
        check("changed in another tab: 'Not saved', nothing changed", "another tab" in page.locator(".overlay").inner_text() and settings()["recovery"]["hash"] == "other")
        tap("[data-act='cancel']")
        check("Close goes back to the panel", panel_open())
        page.evaluate(f"(b) => localStorage.setItem('{KEY}', b)", before)

        # storage refuses the write: 'Not saved', old passcode still in place
        tap("[data-act='change-pin']"); pin("8642"); pin("8642", ok=False)
        page.evaluate("() => { window.__setItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); }; }")
        tap(".pin-key[data-k='ok']"); page.wait_for_selector(".overlay h2:has-text('Not saved')")
        page.evaluate("() => { Storage.prototype.setItem = window.__setItem; }")
        check("storage full/blocked: 'Not saved', nothing changed", "wouldn’t save" in page.locator(".overlay").inner_text() and page.evaluate(f"localStorage.getItem('{KEY}')") == before)
        tap("[data-act='cancel']")
        page.keyboard.press("Escape"); open_lock(); tap("[data-act='forgot']")
        page.locator(".overlay .text-in").fill(code2); tap("[data-act='reset']"); wait_text(".overlay .msg", "match")
        check("the replaced recovery code no longer works", "doesn’t match" in msg())
        tap("[data-act='back']")
        check("Back returns to the passcode pad", "Enter the passcode" in prompt())
        pin("1357"); page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("the failed change kept the old passcode", panel_open())

        # ---------- turn the passcode off ----------
        page.once("dialog", lambda d: d.accept())
        tap("[data-act='pin-off']")
        s = settings()
        check("Turn off passcode: removes passcode + code", panel_open() and s["pin"] is None and s["recovery"] is None and s["noPasscode"] is True)
        page.keyboard.press("Escape"); page.keyboard.type("parent")
        check("…and the panel opens without asking", panel_open() and page.locator(".pin-pad").count() == 0)
        page.keyboard.press("Escape")

        # ---------- games on/off (issue #33) ----------
        def cards(): return page.locator(".mcard .name").all_inner_texts()
        def heads(): return page.locator(".sect h2").all_inner_texts()
        n0 = len(cards())
        page.keyboard.type("parent"); page.wait_for_selector(".overlay .game-toggles")
        boxes = page.locator(".game-toggle input")
        check("games list: one checkbox per game, grouped by section, all on by default",
              boxes.count() == n0 and page.locator(".game-sect").count() == len(heads()) and all(boxes.nth(i).is_checked() for i in range(boxes.count())), f"{boxes.count()} vs {n0}")
        page.locator(".game-toggle input[data-game='simon']").uncheck()
        check("unticking saves at once, by game id", settings()["games"] == {"simon": False}, str(settings().get("games")))
        page.keyboard.press("Escape")
        check("closing the panel redraws the menu without the hidden game", "Simon Says" not in cards() and len(cards()) == n0 - 1)
        page.goto(URL + "#simon"); page.wait_for_selector(".mcard"); time.sleep(0.2)
        check("a link to a hidden game opens the menu", page.locator(".start-gate").count() == 0 and page.url.endswith("/") and len(cards()) == n0 - 1, page.url)
        page.keyboard.type("parent"); page.wait_for_selector(".overlay .game-toggles")
        check("the hidden game shows unticked", not page.locator(".game-toggle input[data-game='simon']").is_checked())
        page.locator(".game-toggle input[data-game='spot']").uncheck()
        page.keyboard.press("Escape")
        check("a section with no games left is hidden", "🧠 Brain Games" not in heads() and "🏰 Adventures" in heads(), str(heads()))
        page.keyboard.type("parent"); page.wait_for_selector(".overlay .game-toggles")
        page.locator(".game-toggle input[data-game='simon']").check(); page.locator(".game-toggle input[data-game='spot']").check()
        tap(".overlay button:has-text('Close')")
        check("ticking them again brings them back", len(cards()) == n0 and "🧠 Brain Games" in heads())
        d = page.evaluate("""async () => { const s = await import('/js/settings.js'); const g = { id: 'zz-new', off: true };
          const a = s.gameOn(g); s.setGameOn('zz-new', true); const b = s.gameOn(g); s.setGameOn('zz-new', false); return [a, b, s.gameOn(g), s.gameOn({ id: 'simon' })]; }""")
        check("a new game marked off stays hidden until a grown-up turns it on", d == [False, True, False, True], str(d))
        page.evaluate("(async () => { const s = await import('/js/settings.js'); const g = s.getSettings().games; delete g['zz-new']; s.updateSettings({ games: g }); })()")
        page.goto(URL); page.wait_for_selector(".mcard")

        # ---------- no Web Crypto (plain http on a LAN address): the panel stays shut ----------
        page2 = new_page(INIT + "Object.defineProperty(window.crypto, 'subtle', { get: () => undefined });")
        page2.keyboard.type("parent"); page2.wait_for_selector(".overlay")
        check("without Web Crypto the panel stays shut and says it needs https",
              page2.locator(".overlay .needs-https").count() == 1 and page2.locator(".overlay h3").count() == 0 and page2.locator(".pin-pad").count() == 0)
        page2.keyboard.press("Escape")
        page2.evaluate(f"localStorage.setItem('{KEY}', JSON.stringify({{ noPasscode: true }}))")
        page2.keyboard.type("parent"); page2.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
        check("…unless the grown-up chose no passcode (then it opens; setting one needs https)",
              page2.locator(".overlay h3", has_text="Passcode").count() == 1 and "needs a secure connection" in page2.locator(".overlay").inner_text())

        # ---------- http -> https for real host names only ----------
        index = Path(SITE, "index.html").read_text()
        ctx3 = b.new_context(service_workers="block")
        ctx3.route("http://games.example.com/**", lambda r: r.fulfill(body=index, content_type="text/html") if urlparse(r.request.url).path == "/pes3/" else r.fulfill(status=404))
        ctx3.route("https://games.example.com/**", lambda r: r.fulfill(body="<p id=secure>secure</p>", content_type="text/html"))
        ctx3.route("http://192.168.1.20:8000/**", lambda r: r.fulfill(body=index, content_type="text/html") if urlparse(r.request.url).path == "/pes3/" else r.fulfill(status=404))
        page3 = ctx3.new_page()
        page3.goto("http://games.example.com/pes3/?x=1#robot"); page3.wait_for_selector("#secure")
        check("http on a real host name redirects to https (path, query, #game kept)", page3.url == "https://games.example.com/pes3/?x=1#robot", page3.url)
        page3.goto("http://192.168.1.20:8000/pes3/"); time.sleep(0.3)
        check("http on an IP address (home-network testing) is left alone", page3.url == "http://192.168.1.20:8000/pes3/", page3.url)
        check("http://localhost is left alone (every other suite runs there)", page.url.startswith("http://localhost:"), page.url)
        ctx3.close()

        b.close()
finally:
    server.terminate()

check("no page errors", not errors, "; ".join(errors[:5]))
bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
sys.exit(1 if bad else 0)
