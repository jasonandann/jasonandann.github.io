"""Deep links: index.html#<id> shows a Tap-to-start card for that game; the hash follows the screen."""
import json, os, re, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8775
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)

FAKE_TTS = """
window.__spoken = [];
const fake = { speak(u){ window.__spoken.push(u.text); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
"""

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

# The ids live in app.js; read them from there so a new game is covered automatically.
src = Path(SITE, "js/app.js").read_text()
IDS = re.findall(r"id: '([^']*)', name: '([^']*)'", src)
# Games that ship off (issue #33: `off: true`, hidden until a grown-up turns them on) are turned on here,
# so every id is covered; hiding itself is tested in parent_test (and cave_test).
OFF = re.findall(r"id: '([^']*)'[^\n]*\boff: true", src)
SHOW_ALL = f"localStorage.setItem('spelling-games.parent.v1', JSON.stringify({{ games: {json.dumps({i: True for i in OFF})} }}));"

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", SITE],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block")
        ctx.add_init_script(FAKE_TTS + SHOW_ALL)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        hash_ = lambda: page.evaluate("location.hash")

        # every card on the menu must have an id (a new game added without one fails here, by name)
        page.goto(URL); page.wait_for_selector(".menu .mcard")
        cards = page.locator(".menu .mcard .name").all_inner_texts()
        missing = [n for n in cards if n not in {name for _, name in IDS}]
        check("every menu game has an id", cards and not missing and len(IDS) == len(cards), f"no id: {missing}" if missing else f"{len(IDS)} ids, {len(cards)} cards")
        check("ids are unique", len({i for i, _ in IDS}) == len(IDS))
        check("ids are short lowercase slugs", all(re.fullmatch(r"[a-z0-9-]{2,12}", i) for i, _ in IDS), str([i for i, _ in IDS]))

        # every id: fresh load -> gate card with that game's name; nothing spoken before the tap
        bad = []
        for gid, name in IDS:
            page.goto(f"{URL}#{gid}"); page.wait_for_selector(".start-gate .mcard")
            if name not in page.locator(".start-gate .name").inner_text() or page.locator(".menu").count():
                bad.append(gid)
        check("every #id shows its own start card", not bad, str(bad))

        # tap to start mounts the game inside the tap (speech allowed on iOS)
        page.goto(f"{URL}#jumble"); page.wait_for_selector(".start-gate")
        check("gate: nothing spoken before the tap", page.evaluate("window.__spoken.length") == 0)
        check("gate: Home button visible", page.locator("#back").is_visible())
        page.screenshot(path=f"{SHOTS}/deeplink_gate.png")
        page.locator(".start-gate .mcard").tap()
        check("tap starts the game and speaks", page.locator(".game .tray").count() == 1 and page.evaluate("window.__spoken.length") > 0)
        check("hash kept while playing", hash_() == "#jumble", hash_())
        page.locator("#back").tap()
        check("Home clears the hash and shows the menu", hash_() == "" and page.locator(".menu .mcard").count() == len(cards), hash_())

        # opening from the menu sets the hash (so the address bar can be copied)
        page.locator(".mcard", has_text="Robot Course").first.tap()
        check("menu tap sets #robot", hash_() == "#robot", hash_())
        page.locator("#back").tap()

        # unknown / mixed case
        page.goto(f"{URL}#nope"); page.wait_for_selector(".menu .mcard")
        check("unknown id -> menu, hash cleared", hash_() == "", hash_())
        page.goto(f"{URL}#Robot"); page.wait_for_selector(".start-gate")
        check("ids are case-insensitive", "Robot Course" in page.locator(".start-gate .name").inner_text())

        # hash change while the page is open (e.g. a link) -> that game's card; empty hash -> menu
        page.evaluate("location.hash = '#simon'"); page.wait_for_selector(".start-gate .name:has-text('Simon')")
        check("hashchange shows the new game's card", True)
        page.evaluate("location.hash = ''"); page.wait_for_selector(".menu .mcard")
        check("clearing the hash returns to the menu", page.locator(".start-gate").count() == 0)

        # history: playing a game adds no Back entries
        n = page.evaluate("history.length")
        page.locator(".mcard", has_text="Wordal").first.tap(); page.locator("#back").tap()
        check("no history entries added", page.evaluate("history.length") == n)

        page.set_viewport_size({"width": 390, "height": 760})
        page.goto(f"{URL}#river"); page.wait_for_selector(".start-gate")
        page.screenshot(path=f"{SHOTS}/deeplink_gate_phone.png")
        check("gate fits a phone (no sideways scroll)", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
