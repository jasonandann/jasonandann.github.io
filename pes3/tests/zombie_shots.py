import os, tempfile
from pathlib import Path
import subprocess, sys, time
from playwright.sync_api import sync_playwright

SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots"); os.makedirs(SHOTS, exist_ok=True)
FAKE = "window.speechSynthesis={speak(){},cancel(){},getVoices(){return []}};window.SpeechSynthesisUtterance=function(t){this.text=t};"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8767", "--directory", str(Path(__file__).resolve().parent.parent)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, w, h in [("ipad_land", 1024, 768), ("ipad_land_safari", 1024, 660), ("chromebook", 1366, 650), ("phone", 390, 800)]:
            ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=True, service_workers="block")
            ctx.add_init_script(FAKE)
            ctx.route("http://localhost:8767/words.txt", lambda r: r.fulfill(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")))  # fixed list, not the weekly one
            pg = ctx.new_page()
            pg.goto("http://localhost:8767/"); pg.wait_for_selector(".mcard")
            pg.locator(".mcard", has_text="Zombie Trail").first.tap()
            pg.locator(".zt-setup .btn", has_text="Start!").first.tap()
            pg.wait_for_selector(".zt-board")
            pg.locator("button", has_text="Roll").first.tap(); pg.wait_for_selector(".zt-q")
            time.sleep(0.8)
            vis = pg.evaluate("""()=>{const r=e=>{const b=document.querySelector(e).getBoundingClientRect();return [Math.round(b.top),Math.round(b.bottom)]};
              return {win:innerHeight, check:r('.zt-q > .btn'), kb:r('.zt-q .kb'), board:r('.zt-board'), scrollY:Math.round(scrollY), docH:document.documentElement.scrollHeight}}""")
            print(name, vis)
            pg.screenshot(path=f"{SHOTS}/zt_{name}.png")
            ctx.close()
        b.close()
finally:
    srv.terminate()
