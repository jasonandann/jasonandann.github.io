# Screenshots the bunny board after tapping B in each shared-tile mode (needs the TEST ONLY toggle).
# Run from pes3/: python3 tools/lookahead/compare.py <output-dir>
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8796", "--directory", "."], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1024, "height": 768}, device_scale_factor=2)
        pg.goto("http://localhost:8796/"); pg.wait_for_selector(".mcard")
        pg.evaluate("localStorage.removeItem('spelling-games.baffle.overlap')")
        pg.locator(".mcard", has_text="Baffle").first.click(); pg.wait_for_selector(".bf-tile")
        pg.locator(".bf-tile[data-i='1']").click(); time.sleep(0.3)
        for i, (m, name) in enumerate([("checker", "checkered"), ("blend", "better-blend"), ("both", "both")], 1):
            pg.locator(f".bf-test button[data-mode='{m}']").click(); time.sleep(0.4)
            assert pg.locator(".bf-current").inner_text() == "B"
            g = pg.locator(".bf-grid").bounding_box(); t = pg.locator(".bf-test").bounding_box()
            x0, y0 = g["x"] - 8, min(g["y"], t["y"]) - 8
            pg.screenshot(path=f"{S}/{i}-{name}.png", clip={"x": x0, "y": y0, "width": t["x"] + t["width"] + 8 - x0, "height": g["y"] + g["height"] + 8 - y0})
            print(name, pg.evaluate("document.querySelector(\".bf-tile[data-i='16']\").style.backgroundImage")[:90])
        b.close()
finally:
    srv.terminate()
