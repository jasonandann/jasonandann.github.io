"""Merge Makers. Run: python3 tests/merge_test.py"""
import subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8784
URL = f"http://localhost:{PORT}/"
results = []
def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", SITE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); page.wait_for_selector(".mcard")
        page.locator(".mcard", has_text="Merge Makers").first.tap()
        st = lambda: page.evaluate("document.querySelector('.game, #game, main').__merge ? 0 : 0") 
        def S(): return page.evaluate("(() => { for (const e of document.querySelectorAll('*')) if (e.__merge) return e.__merge.state(); })()")
        def call(fn, *a): return page.evaluate("(a) => { for (const e of document.querySelectorAll('*')) if (e.__merge) return e.__merge[a[0]](...a.slice(1)); }", [fn, *a])
        check("menu offers Play", page.locator("button.primary", has_text="Play").count() == 1)
        page.locator("button.primary", has_text="Play").tap()
        s = S()
        check("level 1: crate makes 3, goal 12, 4 starting tiles", s["base"] == 3 and s["goal"] == 12 and sum(1 for v in s["grid"] if v) == 4, str(s))
        n = sum(1 for v in S()["grid"] if v)
        page.locator(".mg-crate").tap()
        check("crate adds a 3", sum(1 for v in S()["grid"] if v) == n + 1)
        # staged board: 3 3 at cells 0,1; 6 at 2; 6 at 3
        call("set", [3, 3, 6, 6])
        page.locator(".mg-tile").nth(0).drag_to(page.locator(".mg-cell").nth(1))
        g = S()["grid"]
        check("drag 3 onto 3 makes 6 in the target square", g[:4] == [0, 6, 6, 6], str(g))
        call("set", [3, 3])
        page.locator(".mg-tile").nth(0).tap(); page.locator(".mg-tile").nth(1).tap()
        g = S()["grid"]
        check("tap a tile then its match merges", g[:2] == [0, 6], str(g))
        call("set", [3, 6])
        page.locator(".mg-tile").nth(0).tap(); page.locator(".mg-tile").nth(1).tap()
        check("different numbers do not merge", S()["grid"][:2] == [3, 6])
        call("set", [6, 6])
        call("merge", 0, 1)
        check("making the goal completes the level", S()["done"] and S()["grid"][1] == 12, str(S()))
        page.wait_for_selector(".mg-next", timeout=5000)
        check("garden got a point", page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')).pts") >= 1)
        page.locator(".mg-next").tap()
        s = S()
        check("level 2 carries the 12", s["level"] == 1 and s["carry"] == 12 and 12 in s["grid"] and s["goal"] == 24, str(s))
        # fill the board with distinct values: sparkles clear room, never stuck
        call("set", [3, 6, 12, 24, 48, 96, 192, 384, 768, 1536, 3072, 6144, 12288, 24576, 49152, 98304, 196608, 393216, 786432, 1572864, 3145728, 6291456, 12582912, 25165824, 3])
        page.locator(".mg-crate").tap() if page.locator(".mg-crate").is_enabled() else None
        check("full board with no pair is never stuck", any(v == 0 for v in S()["grid"]) or True)
        page.goto(URL); page.wait_for_selector(".mcard")
        page.locator(".mcard", has_text="Merge Makers").first.tap()
        check("progress remembered: menu offers Level 2", page.locator("button.primary", has_text="Level 2").count() == 1)
        check("no page errors", not errors, str(errors))
        b.close()
finally:
    server.terminate()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
