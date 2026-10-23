"""Tests for the grown-ups passcode (issue #32): first-time setup, entry, wrong-try waits,
recovery code, change passcode, new recovery code, and no lock without Web Crypto.

Run from the repo root:   python3 tests/parent_test.py
Needs: pip install playwright && playwright install chromium
"""
import json, os, re, subprocess, sys, tempfile, time
from pathlib import Path
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

        # ---------- first time: setup ----------
        open_lock()
        check("first open asks to set a passcode (no panel yet)", "Set a grown-ups passcode" in h2() and not panel_open() and page.locator(".pin-pad .pin-key").count() == 12)
        page.keyboard.type("parent")
        check("typing 'parent' again doesn't stack a second overlay", page.locator(".overlay").count() == 1)
        tap("[data-act='cancel']")
        check("Cancel closes and saves nothing", page.locator(".overlay").count() == 0 and settings() is None)

        open_lock()
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
        code = page.locator(".recovery-code").inner_text()
        check("recovery code shown once, XXXX-XXXX without I/L/O/U", re.fullmatch(r"[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}", code) is not None, code)
        page.screenshot(path=f"{SHOTS}/parent-recovery.png")
        s = settings()
        check("passcode stored as salted PBKDF2 (no plain text)", s and set(s["pin"]) == {"salt", "hash", "iter"} and s["pin"]["iter"] == 600000
              and "1234" not in json.dumps(s["pin"]["hash"] + s["pin"]["salt"]) or False, json.dumps(s)[:200])
        check("recovery code stored hashed too", s and "hash" in s["recovery"] and code.replace("-", "") not in json.dumps(s))
        tap("[data-act='saved']")
        check("after setup the panel opens", panel_open())
        check("panel has a Passcode section", page.locator(".overlay h3", has_text="Passcode").count() == 1)
        page.locator(".overlay .row button", has_text="Let her choose").first.tap()
        check("changing a setting reopens the panel without asking again", panel_open())
        page.keyboard.press("Escape")
        check("Escape closes the panel", page.locator(".overlay").count() == 0)

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
        page.once("dialog", lambda d: d.accept())
        page.locator(".overlay button", has_text="Erase history").tap()
        check("Erase history keeps the passcode and reopens the panel", panel_open() and settings()["pin"] is not None)

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
        pin("1357"); pin("1357"); page.keyboard.press("Escape")  # mid-save: must not lose the recovery code
        page.wait_for_selector(".recovery-code")
        check("Escape while saving is ignored (the recovery code still shows)", page.locator(".overlay .recovery-code").count() == 1)
        code2 = page.locator(".recovery-code").inner_text()
        check("a reset shows a new recovery code", code2 != code)
        tap("[data-act='saved']")
        check("after the reset the panel opens", panel_open())

        # ---------- new recovery code ----------
        tap("[data-act='new-code']"); page.wait_for_selector(".recovery-code")
        code3 = page.locator(".recovery-code").inner_text()
        check("New recovery code shows a different code", code3 not in (code, code2))
        tap("[data-act='saved']")
        check("then back to the panel", panel_open())
        page.keyboard.press("Escape"); open_lock(); tap("[data-act='forgot']")
        page.locator(".overlay .text-in").fill(code2); tap("[data-act='reset']"); wait_text(".overlay .msg", "match")
        check("the replaced recovery code no longer works", "doesn’t match" in msg())
        tap("[data-act='back']")
        check("Back returns to the passcode pad", "Enter the passcode" in prompt())
        page.keyboard.press("Escape")

        # ---------- no Web Crypto (plain http on a LAN address): panel opens unlocked, says so ----------
        page2 = new_page(INIT + "Object.defineProperty(window.crypto, 'subtle', { get: () => undefined });")
        page2.keyboard.type("parent"); page2.wait_for_selector(".overlay")
        check("without Web Crypto the panel opens with a 'not locked' note",
              page2.locator(".overlay h2", has_text="Grown-ups only").count() == 1 and page2.locator(".overlay .nolock").count() == 1
              and page2.locator(".overlay h3", has_text="Passcode").count() == 0)

        b.close()
finally:
    server.terminate()

check("no page errors", not errors, "; ".join(errors[:5]))
bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
sys.exit(1 if bad else 0)
