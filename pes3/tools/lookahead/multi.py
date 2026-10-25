# Screenshots the 3-way and 4-way TEST boards after tapping B. Run from pes3/: python3 tools/lookahead/multi.py <output-dir>
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8797", "--directory", "."], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1024, "height": 768}, device_scale_factor=2)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://localhost:8797/"); pg.wait_for_selector(".mcard")
        pg.evaluate("['overlap', 'testboard'].forEach(k => localStorage.removeItem('spelling-games.baffle.' + k))")
        pg.locator(".mcard", has_text="Baffle").first.click(); pg.wait_for_selector(".bf-tile")
        for k in ["three", "four"]:
            pg.locator(f".bf-test button[data-board='{k}']").click(); time.sleep(0.3)
            print(k, "board:", "".join(pg.locator(".bf-tile").all_inner_texts()), "slots:", pg.locator(".bf-slots").count())
            pg.locator(".bf-tile[data-i='12']").click(); time.sleep(0.4)
            for i in (13, 14):
                print("  tile", i, pg.evaluate(f"document.querySelector(\".bf-tile[data-i='{i}']\").style.backgroundImage").count("rgba(") // 2, "colour stops")
            g = pg.locator(".bf-grid").bounding_box(); t = pg.locator(".bf-test").bounding_box()
            x0, y0 = g["x"] - 8, min(g["y"], t["y"]) - 8
            pg.screenshot(path=f"{S}/{k}-way.png".replace("three-way", "3-way").replace("four-way", "4-way"),
                          clip={"x": x0, "y": y0, "width": t["x"] + t["width"] + 8 - x0, "height": max(g["y"] + g["height"], t["y"] + t["height"]) + 8 - y0})
        pg.locator(".bf-test button[data-board='bunny']").click(); time.sleep(0.3)
        print("bunny board back:", "".join(pg.locator(".bf-tile").all_inner_texts()), "slots:", pg.locator(".bf-slots").count())
        b.close()
finally:
    srv.terminate()
print("errors:", errs)
