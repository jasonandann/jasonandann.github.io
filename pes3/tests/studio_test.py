"""Tests for Code Studio (ScratchJr-style) and the engine's threads()/forever.

Run from the repo root:   python3 tests/studio_test.py
Needs: pip install playwright && playwright install chromium
"""
import json, os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8774
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")

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
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block")
        ctx.add_init_script(INIT)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=FIXTURE))
        ctx.route("**/audio/manifest.json", lambda r: r.fulfill(status=404))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "manifest" not in m.text and "404" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def tap(sel, **kw): page.locator(sel, **kw).first.tap()
        def home(): tap("#back")
        def msg(): return page.locator(".st-wrap .msg").first.inner_text()
        def open_studio(): page.locator(".mcard", has_text="Code Studio").first.tap(); page.wait_for_selector(".st-stage")
        def cat(c): tap(f".st-cat[data-cat='{c}']")
        def key(op): tap(f".st-keys [data-op='{op}']")
        def sprite(i): return page.evaluate(f"(d => ({{x: +d.x, y: +d.y, dir: +d.dir, size: +d.size, hidden: d.hidden === '1'}}))(document.querySelectorAll('.st-sprite')[{i}].dataset)")
        def project(): return page.evaluate("document.querySelector('.game').__studio()")
        def chips(): return page.evaluate("[...document.querySelectorAll('.st-script')].map(s => [...s.querySelectorAll('.code-chip')].map(c => c.dataset.path + ':' + c.dataset.op))")
        def steps(): return page.evaluate("import('./js/games/studio.js').then(m => m.debugSteps())")
        def running(): return page.locator(".st-wrap.running").count() == 1
        def setnum(path, v, script=0):
            page.locator(".st-script").nth(script).locator(f".code-chip[data-path='{path}']").tap()
            tap(f".overlay .tt-num[data-v='{v}']")
        def tap_sprite(i):  # stage taps are pointer events on the stage; Playwright tap() sends real touch events
            page.locator(".st-sprite").nth(i).tap()

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.3)
        names = page.evaluate("[...[...document.querySelectorAll('.sect')].find(s => s.textContent.includes('Coding')).querySelectorAll('.mcard .name')].map(n => n.textContent)")
        check("menu: Code Studio is the third Coding card", names == ["Robot Course", "Turtle Draw", "Code Studio"], str(names))

        # ---------- engine: threads + forever ----------
        eng = page.evaluate("""async () => {
          const e = await import('./js/code/engine.js');
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          const log = [];
          let changes = 0;
          const th = e.threads({ exec: async ({ block }, ctx, alive) => { log.push(ctx.name + block.op); await sleep(60); return block.op === 'stop' ? 'stop' : undefined; },
                                 onChange: () => changes++ });
          const t0 = performance.now();
          th.start('a', [{ op: '1' }, { op: '2' }, { op: '3' }], { name: 'a' });
          th.start('b', [{ op: '1' }, { op: '2' }, { op: '3' }], { name: 'b' });
          while (th.running()) await sleep(10);
          const both = performance.now() - t0;
          const order = log.splice(0).join(' ');
          // forever: runs until stopAll, never freezes the page (timers still fire)
          let timers = 0; const tick = setInterval(() => timers++, 5);
          th.start('f', [{ op: 'forever', body: [{ op: 'x' }] }], { name: 'f' });
          await sleep(300);
          const runningForever = th.running('f');
          th.stopAll();
          const afterStop = log.length; await sleep(200); const stillLogging = log.length > afterStop + 1;
          // empty forever: still yields to the page
          const t1 = timers;
          const th2 = e.threads({ exec: async () => {} });
          th2.start('e', [{ op: 'forever', body: [] }], {});
          await sleep(100);
          const timersDuringEmpty = timers - t1;
          th2.stopAll(); clearInterval(tick);
          // 'stop' block stops every thread
          log.length = 0;
          th.start('s1', [{ op: 'forever', body: [{ op: 'y' }] }], { name: 's1' });
          th.start('s2', [{ op: 'w' }, { op: 'stop' }], { name: 's2' });
          await sleep(400);
          const stopped = !th.running();
          // walk: forever with the normal budget is capped
          const it = e.walk([{ op: 'forever', body: [] }]); let n, c = 0; while (!(n = it.next()).done) c++;
          return { both, order, runningForever, stillLogging, timersDuringEmpty, stopped, cappedRet: n.value, capped: c, changes };
        }""")
        check("threads: two scripts run at the same time (3 steps each ≈ 180 ms, not 360)", eng["both"] < 300, f"{eng['both']:.0f} ms")
        check("threads: steps interleave", eng["order"].startswith("a1 b1 a2 b2"), eng["order"])
        check("threads: forever keeps running", eng["runningForever"])
        check("threads: stopAll stops forever", not eng["stillLogging"])
        check("threads: an empty forever never freezes the page", eng["timersDuringEmpty"] > 5, str(eng["timersDuringEmpty"]))
        check("threads: a ⏹ stop block stops every thread", eng["stopped"])
        check("walk: forever is capped by the normal step budget", eng["cappedRet"] == "capped" and eng["capped"] == 500)

        # ---------- model ----------
        mdl = page.evaluate("""async () => { const m = await import('./js/games/studio.js');
          const rt = { x: 18, y: 1, dir: 0, size: 1, hidden: false }, home = { x: 3, y: 10, dir: 0 };
          return { right: m.stepSprite(rt, home, { op: 'right', arg: 10 }).x, up: m.stepSprite(rt, home, { op: 'up', arg: 5 }).y,
                   home: m.stepSprite(rt, home, { op: 'home' }), grow: m.stepSprite(rt, home, { op: 'grow' }).size,
                   turn: m.stepSprite(rt, home, { op: 'turnL2' }).dir, cols: m.COLS, rows: m.ROWS, bds: m.BACKDROPS.length }; }""")
        check("model: moving off the stage stays at the edge", mdl["right"] == mdl["cols"] - 1 and mdl["up"] == 0, str(mdl))
        check("model: go home, grow, ½ turn", mdl["home"]["x"] == 3 and mdl["home"]["y"] == 10 and mdl["grow"] == 1.25 and mdl["turn"] == -2, str(mdl))
        check("backdrops: 6-8 to pick from", 6 <= mdl["bds"] <= 8)

        # ---------- editing by tap ----------
        open_studio()
        check("starts with one 🐱 and an empty 🏁 script", page.locator(".st-sprite").count() == 1 and page.locator(".st-event[data-ev='flag']").count() == 1)
        check("block categories: Move, Looks, Sound, Control", page.evaluate("[...document.querySelectorAll('.st-cat')].map(c => c.dataset.cat)") == ["motion", "looks", "sound", "control"])
        check("turn blocks show arrow + word", "↻" in page.locator(".st-keys [data-op='turnR']").inner_text() and "clockwise" in page.locator(".st-keys [data-op='turnR']").inner_text())
        key("right")
        setnum("0", 5)
        check("tap a move chip to set how far", chips()[0] == ["0:right"] and "right 5" in page.locator(".code-chip[data-path='0']").inner_text())
        cat("looks"); key("say")
        check("💬 opens the phrase picker", page.locator(".overlay .st-phrases button").count() >= 6)
        tap(".overlay [data-act='type']")
        for ch in "hello": tap(f".overlay .kb .key:text-is('{ch}')")
        tap(".overlay button:has-text('Done')")
        check("💬 type my own words (on-screen keyboard)", project()["sprites"][0]["scripts"][0]["blocks"][1] == {"op": "say", "arg": "Hello"}, str(project()["sprites"][0]["scripts"][0]["blocks"]))
        cat("sound"); key("note"); tap(".overlay .tt-num[data-v='4']")
        check("🎵 note picker", project()["sprites"][0]["scripts"][0]["blocks"][2] == {"op": "note", "arg": 4})
        cat("control"); key("wait")
        setnum("3", 1)
        check("⏱ wait in half-seconds", "wait ½ s" in page.locator(".code-chip[data-path='3']").inner_text())
        page.locator(".code-chip[data-path='3']").tap()
        check("menu title looks like the chip", page.evaluate("""(sel) => { const c = document.querySelector(sel), f = document.querySelector('.overlay .code-menu-title .code-face');
            const col = (e) => [...e.classList].find(k => k.startsWith('c-'));
            return !!f && col(f) === col(c) && f.querySelector('.ci').textContent === c.querySelector('.ci').textContent
              && f.querySelector('.cw').textContent === c.querySelector('.cw').textContent
              && getComputedStyle(f).borderColor === getComputedStyle(c).borderColor && getComputedStyle(f).backgroundColor === getComputedStyle(c).backgroundColor; }""", ".code-chip[data-path='3']"))
        tap(".overlay [data-act='shift-left']")
        check("chip menu ◀ moves a block left", [c.split(":")[1] for c in chips()[0]] == ["right", "say", "wait", "note"], str(chips()))
        tap(".overlay [data-act='shift-right']"); tap(".overlay button:has-text('Done')")
        check("…and ▶ moves it back", [c.split(":")[1] for c in chips()[0]] == ["right", "say", "note", "wait"], str(chips()))
        # second sprite with its own 🏁 script
        tap("[data-act='add-sprite']"); tap(".overlay [data-v='🐶']")
        check("➕ adds a sprite and selects it", page.locator(".st-sprite").count() == 2 and page.locator(".st-pick.sel").inner_text() == "🐶")
        cat("motion"); key("up"); setnum("0", 4)
        d0, c0 = sprite(1), sprite(0)
        # ---------- ▶: both 🏁 scripts at once ----------
        tap(".st-flag")
        time.sleep(0.45)
        mid0, mid1 = sprite(0), sprite(1)
        check("▶ starts both sprites' 🏁 scripts at the same time", mid0["x"] > c0["x"] and mid1["y"] < d0["y"], f"{mid0} {mid1}")
        page.wait_for_function("!document.querySelector('.st-wrap.running')", timeout=10000)
        check("cat moved right 5, dog up 4", sprite(0)["x"] == c0["x"] + 5 and sprite(1)["y"] == d0["y"] - 4, f"{sprite(0)} {sprite(1)}")
        # ---------- 👆 tap script, while a forever runs ----------
        tap(".st-pick[data-id='s1']")
        tap("[data-act='new-script']")
        tap(".overlay [data-ev='tap']")
        check("➕ New script with 👆 start", page.locator(".st-script").count() == 2 and page.locator(".st-script.sel .st-event[data-ev='tap']").count() == 1)
        cat("looks"); key("say"); tap(".overlay [data-v='Yay!']")
        tap(".st-pick[data-id='s2']")
        cat("control"); key("forever"); cat("motion"); key("right"); key("left"); tap("[data-op='close']")
        check("♾️ forever is a box", page.locator(".code-box .code-chip[data-op='forever']").count() == 1 and chips()[0][-2:] == ["1.0:right", "1.1:left"], str(chips()))
        tap(".st-flag")
        time.sleep(3.2)
        check("forever keeps the dog moving", running())
        tap_sprite(0)
        page.wait_for_selector(".st-sprite[data-id='s1'] .st-bubble:not([hidden])", timeout=2000)
        check("👆 tapping the cat runs its tap script while others run", page.locator(".st-sprite[data-id='s1'] .st-bubble").inner_text() == "Yay!" and running())
        page.screenshot(path=f"{SHOTS}/studio_running.png")
        check("tapping a sprite selects it", page.locator(".st-pick.sel").get_attribute("data-id") == "s1")
        tap(".st-cat[data-cat='motion']"); key("down")
        check("editing is paused while running (gentle note)", "⏹" in msg() and len(project()["sprites"][0]["scripts"][0]["blocks"]) == 4, msg())
        tap(".st-stop")
        time.sleep(0.4)
        n0 = steps(); x0 = sprite(1)["x"]; time.sleep(0.8)
        check("⏹ stops forever (no more steps, dog stays put)", steps() == n0 and sprite(1)["x"] == x0 and not running())
        # leaving the game stops it too
        tap(".st-flag"); time.sleep(0.6)
        check("forever running again", running())
        home(); time.sleep(0.2)
        n0 = steps(); time.sleep(0.8)
        check("leaving the game stops forever scripts", steps() == n0, f"{n0} -> {steps()}")
        # ---------- the edge ----------
        open_studio()
        check("project kept after Home (draft)", page.locator(".st-sprite").count() == 2)
        check("the first sprite is selected on open", page.locator(".st-pick.sel").get_attribute("data-id") == "s1")
        tap(".st-pick[data-id='s1']")  # tapping the selected sprite = its menu
        check("tap the selected sprite again: change / remove menu", page.locator(".overlay [data-act='remove-sprite']").count() == 1)
        tap(".overlay button:has-text('Done')")
        tap(".st-event >> nth=0"); tap(".overlay [data-act='remove-script']"); tap(".overlay button:has-text('Yes')")
        tap(".st-event >> nth=0"); tap(".overlay [data-act='remove-script']"); tap(".overlay button:has-text('Yes')")
        tap("[data-act='new-script']"); tap(".overlay [data-ev='flag']")
        cat("motion"); key("right"); setnum("0", 10); key("right"); setnum("1", 10); key("up"); setnum("2", 10); key("up"); setnum("3", 10)
        tap(".st-flag")
        page.wait_for_function("(d => d.x === '19' && d.y === '0')(document.querySelector('.st-sprite[data-id=s1]').dataset)", timeout=15000)
        check("moving off the stage: stays at the edge, no errors", sprite(0)["x"] == 19 and sprite(0)["y"] == 0 and not errors, str(sprite(0)))
        tap(".st-stop"); time.sleep(0.3)
        # move the cat's home by tapping the stage, drag the dog
        st = page.locator(".st-stage").bounding_box()
        page.touchscreen.tap(st["x"] + st["width"] * 0.1 / 2 + 2, st["y"] + st["height"] * 0.5)
        check("tap the empty stage = move the selected sprite there", project()["sprites"][0]["x"] in (0, 1) and project()["sprites"][0]["y"] == 7, str(project()["sprites"][0]))
        # backdrop
        tap(".st-top button:has-text('🖼️')"); tap(".overlay .st-bd[data-v='space']")
        check("backdrop picker", "bd-space" in page.locator(".st-stage").get_attribute("class") and project()["backdrop"] == "space")

        # ---------- save / reload / delete ----------
        tap("[data-tool='save']")
        tap(".overlay .tt-num[data-v='🚀']")
        for ch in "zoom": tap(f".overlay .kb .key:text-is('{ch}')")
        tap(".overlay [data-act='save']")
        saved = page.evaluate("JSON.parse(localStorage.getItem('spelling-games.studio.projects.v1'))")
        check("💾 saves the project with its picture + name", len(saved) == 1 and saved[0]["icon"] == "🚀" and saved[0]["name"] == "zoom" and "Saved" in msg(), msg())
        stored = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('spelling-games.studio.projects.v1'))[0])")
        page.reload(); page.wait_for_selector(".mcard")
        page.evaluate("localStorage.removeItem('spelling-games.studio.draft.v1')")
        open_studio()
        check("a new visit without a draft starts fresh", page.locator(".st-sprite").count() == 1 and project()["id"] is None)
        tap("[data-tool='projects']")
        check("📂 lists saved projects", page.locator(".st-proj").count() == 1 and "Zoom" in page.locator(".st-proj").inner_text())
        tap(".st-proj")
        check("a saved project reloads byte-identical", page.evaluate("JSON.stringify(document.querySelector('.game').__studio())") == stored)
        check("…and shows its sprites and backdrop", page.locator(".st-sprite").count() == 2 and "bd-space" in page.locator(".st-stage").get_attribute("class"))
        tap("[data-tool='save']"); tap(".overlay [data-act='save']")
        check("💾 again saves over the same project", len(page.evaluate("JSON.parse(localStorage.getItem('spelling-games.studio.projects.v1'))")) == 1)
        tap("[data-tool='save']"); tap(".overlay [data-act='save-new']")
        check("📄 Save as new makes a copy", len(page.evaluate("JSON.parse(localStorage.getItem('spelling-games.studio.projects.v1'))")) == 2)
        tap("[data-tool='projects']")
        tap(".tt-gal .rb-del >> nth=0")
        check("🗑 asks first", page.locator(".overlay", has_text="Delete").count() == 1)
        tap(".overlay button:has-text('No')")
        check("'No' keeps it", page.locator(".st-proj").count() == 2)
        tap(".tt-gal .rb-del >> nth=0"); tap(".overlay button:has-text('Yes')")
        check("🗑 deletes it", page.locator(".st-proj").count() == 1 and len(page.evaluate("JSON.parse(localStorage.getItem('spelling-games.studio.projects.v1'))")) == 1)
        tap(".st-new")
        check("➕ New project", page.locator(".st-sprite").count() == 1 and project()["sprites"][0]["scripts"][0]["blocks"] == [])
        home()

        # ---------- layout + touch targets ----------
        open_studio()
        cat("control"); key("repeat"); cat("motion"); key("right"); key("turnR"); tap("[data-op='close']"); cat("looks"); key("say"); tap(".overlay [data-v='Hi!']")
        fits = page.evaluate("document.scrollingElement.scrollHeight <= innerHeight + 1")
        check("1024x768: stage, blocks and scripts fit without scrolling", fits, str(page.evaluate("[document.scrollingElement.scrollHeight, innerHeight]")))
        page.screenshot(path=f"{SHOTS}/studio_1024.png")
        small = page.evaluate("Math.min(...[...document.querySelectorAll('.st-keys .tt-key, .st-cat, .code-chip, .st-event, .st-pick, .st-top .btn')].map(e => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))")
        check("touch targets >= 44px", small >= 44, str(small))
        home()
        page.set_viewport_size({"width": 390, "height": 760})
        open_studio()
        check("phone: no horizontal overflow", not page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        page.screenshot(path=f"{SHOTS}/studio_phone.png", full_page=True)
        home()
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
