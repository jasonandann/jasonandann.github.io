"""Tests for Turtle Draw (Logo-style) and the shared chip strip's repeat boxes.

Run from the repo root:   python3 tests/turtle_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8773
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")

INIT = """
const fake = { speak(){}, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
if (!sessionStorage.getItem('tt-init')) { sessionStorage.setItem('tt-init', '1'); localStorage.setItem('spelling-games.turtle.fast', 'true'); }
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
        def msg(): return page.locator(".tt-wrap .msg").first.inner_text()
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def key(op): tap(f".tt-key[data-op='{op}']")
        def keys(*ops):
            for o in ops: key(o)
        def program(): return page.evaluate("[...document.querySelectorAll('.code-chip')].map(c => c.dataset.path + ':' + c.dataset.op)")
        def turtle(): return page.evaluate("(({x, y, h, pen}) => [+x, +y, +h, pen])(document.querySelector('.tt-turtle').dataset)")
        def run(timeout=20000):
            tap(".tt-play")
            page.wait_for_function("document.querySelector('.tt-play').textContent.includes('Play') && document.querySelector('.tt-wrap .msg').textContent !== ''", timeout=timeout)
        def open_turtle(): page.locator(".mcard", has_text="Turtle Draw").first.tap(); page.wait_for_selector(".tt-stage")
        def ink(x, y, level=200):  # is there a pixel darker than `level` near canvas unit (x, y)? (grid lines are lighter)
            return page.evaluate(f"""(() => {{ const c = document.querySelector('.tt-canvas'), k = c.width / 400, d = c.getContext('2d');
                const px = d.getImageData(Math.round({x} * k) - 2, Math.round({y} * k) - 2, 5, 5).data;
                for (let i = 0; i < px.length; i += 4) if (px[i] < {level} || px[i + 1] < {level} || px[i + 2] < {level}) return true; return false; }})()""")
        def clear():
            if page.locator(".code-chip").count():
                tap("[data-tool='clear']"); tap(".overlay button:has-text('Yes')")
        def set_num(path, v):
            tap(f".code-chip[data-path='{path}']"); tap(f".overlay .tt-num[data-v='{v}']")

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.3)
        check("menu: Turtle Draw in 💻 Coding after Robot Course",
              page.evaluate("[...document.querySelectorAll('.sect')].find(s => s.textContent.includes('Coding')).querySelectorAll('.mcard .name')[1].textContent") == "Turtle Draw")

        # ---------- model checks (pure functions) ----------
        m = page.evaluate("""async () => {
          const t = await import('./js/games/turtle.js'); const { SHAPES } = await import('./js/games/turtle-shapes.js');
          const F = (n) => ({ op: 'fwd', arg: n }), R = { op: 'right' }, L = { op: 'left' };
          const square = [{ op: 'repeat', arg: 4, body: [F(50), R] }];
          const sq = t.trace(square);
          const off = t.trace([F(200), F(200), R, F(300)]);
          const wrongSquare = [{ op: 'repeat', arg: 4, body: [F(80), L] }];
          const sqT = t.trace(SHAPES.find(s => s.id === 'square').solution).segs;
          const scribble = t.trace([{ op: 'repeat', arg: 4, body: [F(150), R, F(10), R, F(150), L, F(10), L] }, ...SHAPES.find(s => s.id === 'square').solution]).segs;
          const halves = t.trace([F(40), F(40), R, F(80), R, F(80), R, F(80)]).segs;
          return {
            logo: t.toLogo(square),
            nested: t.toLogo([{ op: 'repeat', arg: 2, body: [{ op: 'repeat', arg: 3, body: [F(10)] }, { op: 'penup' }, { op: 'color', arg: 4 }, { op: 'left2' }] }]),
            lines: t.logoLines([F(50), R, { op: 'left' }, { op: 'right2' }, { op: 'color', arg: 1 }, ...square]),
            sqBack: [sq.st.x, sq.st.y, sq.st.h], sqSegs: sq.segs.length,
            off: [off.st.x, off.st.y, off.edge],
            pen: t.trace([{ op: 'penup' }, F(50), { op: 'pendown' }, F(50)]).segs.map(s => [s.y1, s.y2]),
            shapes: SHAPES.map(s => { const r = t.trace(s.solution); return [s.id, t.matches(r.segs, r.segs), r.edge, r.segs.length > 0]; }),
            wrong: t.matches(sqT, t.trace(wrongSquare).segs),
            scribble: t.matches(sqT, scribble),
            halves: t.matches(sqT, halves),
            nShapes: SHAPES.length,
            nested2: SHAPES.some(s => s.solution.some(b => b.op === 'repeat' && b.body.some(c => c.op === 'repeat'))),
          };
        }""")
        check("text: square = REPEAT 4 [FORWARD 50 RIGHT 90]", m["logo"] == "REPEAT 4 [FORWARD 50 RIGHT 90]", m["logo"])
        check("text: nested repeat, pen, colour, ½ turn", m["nested"] == "REPEAT 2 [REPEAT 3 [FORWARD 10] PENUP SETPENCOLOR 4 LEFT 180]", m["nested"])
        L = m["lines"]
        check("text view: turns explained with ¼/½ + arrow + word", L[1] == "RIGHT 90 ; ¼ turn ↻ clockwise" and L[2] == "LEFT 90 ; ¼ turn ↺ counter-clockwise" and L[3] == "RIGHT 180 ; ½ turn ↻ clockwise", str(L))
        check("text view: colour named, repeat line keeps exact text + note", L[4] == "SETPENCOLOR 1 ; blue" and L[5].startswith("REPEAT 4 [FORWARD 50 RIGHT 90] ;"), str(L))
        check("model: square returns home facing up", m["sqBack"] == [200, 200, 0] and m["sqSegs"] == 4, str(m["sqBack"]))
        check("model: leaving the canvas clamps at the edge, no error", m["off"] == [400, 0, True], str(m["off"]))
        check("model: pencil up moves without drawing", m["pen"] == [[150, 100]], str(m["pen"]))
        check("shapes: 8+ copy-the-shape targets", m["nShapes"] >= 8, str(m["nShapes"]))
        bad = [s for s in m["shapes"] if not (s[1] and not s[2] and s[3])]
        check("shapes: each reference solution matches its outline and fits the canvas", not bad, str(bad))
        check("shapes: one uses a repeat inside a repeat", m["nested2"])
        check("match: a mirrored square does not match", not m["wrong"])
        check("match: scribbling over everything does not match", not m["scribble"])
        check("match: drawing a side in two pieces still matches", m["halves"])

        # ---------- free draw: blocks, chips, repeat box, run ----------
        open_turtle()
        check("free draw opens with the turtle in the middle, pencil down", turtle() == [200, 200, 0, "down"], str(turtle()))
        check("all block keys present", all(page.locator(f".tt-key[data-op='{o}']").count() == 1 for o in ["fwd", "back", "left", "right", "left2", "right2", "pendown", "penup", "color", "repeat"]))
        rot = page.evaluate("[getComputedStyle(document.querySelector(\".tt-key[data-op='penup'] .ci\")).transform, getComputedStyle(document.querySelector(\".tt-key[data-op='pendown'] .ci\")).transform]")
        check("pencil up = same ✏️ rotated 180°, pencil down not rotated", rot == ["matrix(-1, 0, 0, -1, 0, 0)", "none"], str(rot))
        check("turn keys show arrow + word", "↻" in page.locator(".tt-key[data-op='right']").inner_text() and "clockwise" in page.locator(".tt-key[data-op='right']").inner_text() and "counter-clockwise" in page.locator(".tt-key[data-op='left2']").inner_text())
        key("repeat")
        check("🔁 opens a box; ✅ appears", page.locator(".code-box.open").count() == 1 and page.locator(".tt-close").is_visible())
        keys("fwd", "right")
        check("blocks tapped while open go inside the box", program() == ["0:repeat", "0.0:fwd", "0.1:right"], str(program()))
        check("forward defaults to 50", "forward 50" in page.locator(".code-chip[data-path='0.0']").inner_text())
        key("close")
        check("✅ closes the box", page.locator(".code-box.open").count() == 0 and not page.locator(".tt-close").is_visible())
        page.locator("button:has-text('📝 Logo')").tap()
        check("📝 Logo shows the exact text", page.locator(".tt-logo").inner_text().startswith("REPEAT 4 [FORWARD 50 RIGHT 90]"), page.locator(".tt-logo").inner_text())
        page.screenshot(path=f"{SHOTS}/turtle_square_program.png")
        run()
        check("square: turtle back home after REPEAT 4", turtle()[:3] == [200, 200, 0], str(turtle()))
        check("square: lines drawn on the canvas", ink(200, 175) and ink(225, 150) and ink(250, 175) and ink(225, 200))
        check("square: nothing drawn off the path", not ink(100, 300))
        check("finished free draw: 'Ta-da!'", "Ta-da" in msg(), msg())
        page.screenshot(path=f"{SHOTS}/turtle_square.png")

        # number picker, counting by tens
        tap(".code-chip[data-path='0.0']")
        nums = page.evaluate("[...document.querySelectorAll('.overlay .tt-num')].map(b => +b.dataset.v)")
        check("distance picker: 10 to 200 by tens", nums == list(range(10, 201, 10)), str(nums))
        tap(".overlay .tt-num[data-v='80']")
        check("tap a chip to change its number", "forward 80" in page.locator(".code-chip[data-path='0.0']").inner_text())
        set_num("0", 2)
        check("repeat count changes", "repeat 2" in page.locator(".code-chip[data-path='0']").inner_text() and "REPEAT 2 [FORWARD 80 RIGHT 90]" in page.locator(".tt-logo").inner_text())

        # nesting: one box inside another, not deeper
        tap(".code-chip[data-path='0']"); tap(".overlay button:has-text('Put more steps')")
        check("➕ reopens a box for more steps", page.locator(".code-box.open").count() == 1)
        key("repeat")
        check("a box can hold one more box", program()[-1] == "0.2:repeat" and page.locator(".code-box .code-box.open").count() == 1)
        check("…but not a third level (🔁 disabled)", page.locator(".tt-key[data-op='repeat']").is_disabled())
        key("fwd")
        check("inner box gets the step", program()[-1] == "0.2.0:fwd", str(program()))
        keys("close", "close")
        check("🔁 enabled again after closing", not page.locator(".tt-key[data-op='repeat']").is_disabled())
        check("text view shows nested box", "REPEAT 2 [FORWARD 80 RIGHT 90 REPEAT 4 [FORWARD 50]]" in page.locator(".tt-logo").inner_text(), page.locator(".tt-logo").inner_text())

        # undo + remove
        tap("[data-tool='undo']"); time.sleep(0.35)
        check("✕ Undo removes the last top-level step (the box)", program() == [], str(program()))
        keys("fwd", "penup", "fwd", "pendown", "color")
        check("🎨 opens the colour picker", page.locator(".overlay .tt-swatch").count() == 8)
        tap(".overlay .tt-swatch[data-v='1']")
        check("colour chip shows its colour", "blue" in page.locator(".code-chip[data-op='color']").inner_text() and "SETPENCOLOR 1" in page.locator(".tt-logo").inner_text())
        key("fwd")
        tap(".code-chip[data-path='0']"); tap(".overlay [data-act='remove']"); time.sleep(0.35)
        check("chip 🗑️ Remove takes it away", program()[0] == "0:penup", str(program()))
        page.evaluate("window.__pens = []; new MutationObserver(() => window.__pens.push(document.querySelector('.tt-turtle').dataset.pen)).observe(document.querySelector('.tt-turtle'), { attributes: true, attributeFilter: ['data-pen'] })")
        run()
        check("turtle's pencil flips up and back down while running", "up" in page.evaluate("window.__pens") and turtle()[3] == "down")
        check("pencil up: no line on the first 50", not ink(200, 175) and ink(200, 125))
        blue = page.evaluate("""(() => { const c = document.querySelector('.tt-canvas'), k = c.width / 400; const p = c.getContext('2d').getImageData(200 * k, 125 * k, 1, 1).data; return [p[0], p[1], p[2]]; })()""")
        check("colour block draws in that colour", blue[2] > 150 and blue[0] < 100, str(blue))

        # off the canvas, step, stop
        clear()
        keys("fwd", "fwd", "fwd", "fwd", "fwd"); set_num("0", 200); set_num("1", 200)
        run()
        check("off the canvas: stops at the edge, gentle message", turtle()[1] == 0 and "edge" in msg() and not errors, msg())
        clear()
        keys("fwd", "right", "fwd")
        tap("[data-tool='step']"); page.wait_for_selector(".code-chip.now")
        page.wait_for_function("document.querySelector('.tt-turtle').dataset.y === '150'")
        check("👣 Step runs one block", turtle()[:2] == [200, 150] and page.locator(".code-chip.now").get_attribute("data-path") == "0")
        time.sleep(0.3); tap("[data-tool='step']"); time.sleep(0.5)
        check("👣 again: the next block", turtle()[2] == 1)
        page.locator("button:has-text('🐇 Fast')").tap()
        check("speed toggle", page.locator("button:has-text('🐢 Slow')").count() == 1 and page.evaluate("localStorage.getItem('spelling-games.turtle.fast')") == "false")
        for _ in range(4): keys("fwd", "back")
        tap(".tt-play"); time.sleep(0.6)
        check("▶ becomes ⏹ while running", "Stop" in page.locator(".tt-play").inner_text())
        tap(".tt-play"); page.wait_for_function("document.querySelector('.tt-play').textContent.includes('Play')")
        check("⏹ stops, program kept", "Stopped" in msg() and len(program()) == 11, msg())
        page.locator("button:has-text('🐢 Slow')").tap()

        # ---------- gallery ----------
        clear()
        key("repeat"); keys("fwd", "right", "close")
        g0 = gp()
        tap("[data-tool='save']")
        gal = page.evaluate("JSON.parse(localStorage.getItem('spelling-games.turtle.gallery.v1'))")
        check("💾 Save stores drawing + program", len(gal) == 1 and gal[0]["program"][0]["op"] == "repeat" and gal[0]["thumb"].startswith("data:image/png"), str(gal)[:200])
        check("💾 Save: +1 garden point", gp() - g0 == 1)
        for _ in range(3): tap("[data-tool='save']")
        check("save points capped at 3 per visit", gp() - g0 == 3, str(gp() - g0))
        page.reload(); page.wait_for_selector(".mcard"); open_turtle()
        tap(".rb-tab:has-text('My drawings')")
        check("gallery lists saved drawings after reload", page.locator(".tt-gal").count() == 4)
        tap(".tt-gal .tt-tile >> nth=0")
        check("open a drawing: program and picture come back", program() == ["0:repeat", "0.0:fwd", "0.1:right"] and ink(200, 175), str(program()))
        tap(".rb-tab:has-text('My drawings')")
        tap(".tt-gal .rb-del >> nth=0")
        check("🗑 asks first", page.locator(".overlay", has_text="Delete").count() == 1)
        tap(".overlay button:has-text('No')")
        check("'No' keeps it", page.locator(".tt-gal").count() == 4)
        tap(".tt-gal .rb-del >> nth=0"); tap(".overlay button:has-text('Yes')")
        check("🗑 deletes it", page.locator(".tt-gal").count() == 3 and len(page.evaluate("JSON.parse(localStorage.getItem('spelling-games.turtle.gallery.v1'))")) == 3)

        # ---------- copy the shape ----------
        tap(".rb-tab:has-text('Copy the shape')")
        check("shape picker: every shape has a tile with a picture", page.locator(".tt-tile").count() == m["nShapes"] and page.locator(".tt-tile img").count() == m["nShapes"])
        tap(".tt-tile[data-id='square']")
        check("shape: faint outline shown before coding", ink(200, 160, 236) and not ink(200, 160))
        g0 = gp()
        key("repeat"); keys("fwd", "left", "close")
        set_num("0.0", 80)
        run()
        check("shape miss: only 'Try changing a step!'", msg() == "Try changing a step!" and gp() == g0, msg())
        tap(".code-chip[data-path='0.1']"); tap(".overlay [data-act='remove']"); time.sleep(0.35)
        tap(".code-chip[data-path='0']"); tap(".overlay button:has-text('Put more steps')")
        key("right"); key("close")
        run()
        check("shape match: sparkle + garden point", "✨" in msg() and gp() - g0 == 1 and page.locator(".confetti").count() == 1, msg())
        check("shape match: Next shape button", page.locator("button:has-text('Next shape')").count() == 1)
        page.screenshot(path=f"{SHOTS}/turtle_shape.png")
        tap("button:has-text('All shapes')")
        check("matched shape gets a ⭐", page.locator(".tt-tile.done[data-id='square'] .rb-star").count() == 1)
        home()

        # ---------- layout ----------
        open_turtle()
        key("repeat"); keys("fwd", "right", "fwd", "left", "close"); keys("fwd", "right", "color"); tap(".overlay .tt-swatch[data-v='2']")
        fits = page.evaluate("document.scrollingElement.scrollHeight <= innerHeight + 1")
        check("1024x768: canvas, blocks, chips and controls fit without scrolling", fits, str(page.evaluate("[document.scrollingElement.scrollHeight, innerHeight]")))
        page.screenshot(path=f"{SHOTS}/turtle_1024.png")
        home()
        page.set_viewport_size({"width": 390, "height": 760})
        open_turtle(); key("repeat"); keys("fwd", "right", "close")
        check("phone: no horizontal overflow", not page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        sq = page.evaluate("(() => { const r = document.querySelector('.tt-stage').getBoundingClientRect(); return [r.width, r.height]; })()")
        check("phone: canvas stays square and fits the width", abs(sq[0] - sq[1]) < 2 and sq[0] <= 390, str(sq))
        small = page.evaluate("Math.min(...[...document.querySelectorAll('.tt-key:not([hidden]), .code-chip, .tt-controls .btn')].map(e => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))")
        check("phone: touch targets >= 44px", small >= 44, str(small))
        page.screenshot(path=f"{SHOTS}/turtle_phone.png", full_page=True)
        home()
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
