"""Tests for Robot Course (virtual Kinderbot) and the shared coding engine in js/code/.

Run from the repo root:   python3 tests/robot_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8772
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")

INIT = """
const fake = { speak(){}, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
"""
OPKEY = {"f": "fwd", "b": "back", "l": "left", "r": "right"}

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
        def msg(): return page.locator(".rb-play .msg, .rb-edit .msg").first.inner_text()
        def gp(): return page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def keys(prog):
            for c in prog: tap(f".rb-key[data-key='{OPKEY[c]}']")
        def chips(): return page.evaluate("[...document.querySelectorAll('.code-chip')].map(c => c.dataset.op)")
        def bot(): return page.evaluate("(({x, y, d}) => [+x, +y, +d])(document.querySelector('.rb-bot').dataset)")
        def run(): tap(".rb-key[data-key='run']")
        def idle(timeout=20000):
            page.wait_for_function("!document.querySelector('.rb-head').classList.contains('running') && document.querySelector('.rb-play .msg').textContent !== ''", timeout=timeout)
        def open_robot():
            page.locator(".mcard", has_text="Robot Course").first.tap()
        def level(i):
            tap(f".rb-level >> nth={i}")
            page.wait_for_selector(".rb-head")

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.3)
        titles = page.evaluate("[...document.querySelectorAll('.sect h2')].map(h => h.textContent)")
        check("menu: 💻 Coding sits between Math and Adventures", titles.index("💻 Coding") == titles.index("➗ Math") + 1 and titles.index("🏰 Adventures") == titles.index("💻 Coding") + 1, str(titles))
        check("menu: Robot Course card in Coding", page.locator(".sect", has_text="Coding").locator(".mcard", has_text="Robot Course").count() == 1)

        # ---------- engine unit checks (js/code/engine.js) ----------
        eng = page.evaluate("""async () => {
          const e = await import('./js/code/engine.js');
          const all = (p, o) => { const it = e.walk(p, o); const out = []; let n; while (!(n = it.next()).done) out.push(n.value); return { out, ret: n.value }; };
          const flat = all([{op:'a'},{op:'b'},{op:'c'}]);
          const rep = all([{op:'x'},{op:'repeat', arg:3, body:[{op:'a'},{op:'b'}]}]);
          const t0 = performance.now();
          const big = all([{op:'repeat', arg:99, body:[{op:'repeat', arg:99, body:[{op:'f'}]}]}]);
          const hollow = all([{op:'repeat', arg:99, body:[{op:'repeat', arg:99, body:[{op:'repeat', arg:99, body:[]}]}]}]);
          const ms = performance.now() - t0;
          const clamp = all([{op:'repeat', arg:99, body:[{op:'a'}]}], { budget: 1000 });
          // runner with an instant fake exec
          const log = [];
          const mk = (prog, stopAt) => e.runner({ program: () => prog,
            onStart: async () => log.push('start'),
            exec: async ({ block }) => { log.push(block.op); return block.op === stopAt ? 'halt' : undefined; },
            onEnd: (why, item) => log.push('end:' + why + (item ? '@' + item.path.join('.') : '')) });
          const r1 = mk([{op:'a'},{op:'b'}]); await r1.play();
          const r2 = mk([{op:'a'},{op:'h'},{op:'c'}], 'h'); await r2.play();
          const r3 = mk([{op:'a'},{op:'b'}]); await r3.step(); const mid = r3.midway; await r3.step();
          const r4 = mk([{op:'a'},{op:'b'},{op:'c'}]); await r4.step(); r4.reset(); await r4.step();
          const r5 = mk([]); await r5.play();
          // stop part-way through a slow run
          const slow = e.runner({ program: () => [{op:'a'},{op:'b'},{op:'c'}], exec: () => new Promise(res => setTimeout(res, 50)),
            onEnd: (why) => log.push('slow:' + why) });
          const pr = slow.play(); await new Promise(res => setTimeout(res, 70)); slow.stop(); await pr;
          return { flat: flat.out.map(s => s.block.op + s.path.join('.') + ':' + s.n), flatRet: flat.ret,
                   rep: rep.out.map(s => s.block.op + s.path.join('.')), bigN: big.out.length, bigRet: big.ret,
                   hollowRet: hollow.ret, ms, clampN: clamp.out.length, clampRet: clamp.ret, limits: e.LIMITS, log, mid };
        }""")
        check("engine: walk yields each step with path and number", eng["flat"] == ["a0:0", "b1:1", "c2:2"] and eng["flatRet"] is None, str(eng["flat"]))
        check("engine: repeat runs its body N times, path points inside", eng["rep"] == ["x0", "a1.0", "b1.1", "a1.0", "b1.1", "a1.0", "b1.1"], str(eng["rep"]))
        check("engine: repeat 99 of repeat 99 stops at the step budget", 0 < eng["bigN"] <= eng["limits"]["budget"] and eng["bigRet"] == "capped", f"{eng['bigN']} {eng['bigRet']}")
        check("engine: empty nested repeats also stop (passes count too)", eng["hollowRet"] == "capped")
        check("engine: capped programs finish fast (no freeze)", eng["ms"] < 200, f"{eng['ms']:.0f} ms")
        check("engine: repeat count is clamped to maxRepeat", eng["clampN"] == eng["limits"]["maxRepeat"] and eng["clampRet"] == "capped", str(eng["clampN"]))
        log = eng["log"]
        check("engine: play runs onStart, every step, then end", log[:4] == ["start", "a", "b", "end:end"], str(log))
        check("engine: exec reason ends the run at that step", log[4:8] == ["start", "a", "h", "end:halt@1"], str(log[4:8]))
        check("engine: step() runs one at a time and continues", log[8:12] == ["start", "a", "b", "end:end"] and eng["mid"], str(log[8:12]))
        check("engine: reset() makes the next step start over", log[12:16] == ["start", "a", "start", "a"], str(log[12:16]))
        check("engine: empty program just ends", log[16:18] == ["start", "end:end"], str(log[16:18]))
        check("engine: stop() halts a run part-way", "slow:stopped" in log and log.count("slow:stopped") == 1, str(log))

        # ---------- every course is solvable with its known solution ----------
        sim = page.evaluate("""async () => {
          const g = await import('./js/games/robot.js'); const { LEVELS } = await import('./js/games/robot-levels.js');
          const sizes = LEVELS.map(l => [l.map[0].length, l.map.length]);
          return { n: LEVELS.length, ids: new Set(LEVELS.map(l => l.id)).size, sizes,
            even: LEVELS.every(l => l.map.every(r => r.length === l.map[0].length)),
            res: LEVELS.map(l => [l.name, g.simulate(l.map, g.fromSolution(l.solution)).result]),
            walls: LEVELS.map(l => l.map.join('').includes('#') || l.map.join('').includes('c')),
            gems: LEVELS.map(l => l.map.join('').includes('*')),
            short: g.simulate(LEVELS[0].map, g.fromSolution('fff')).result,
            bonk: g.simulate(LEVELS[0].map, g.fromSolution('lfff')),
            edge: g.simulate(LEVELS[0].map, g.fromSolution('b')).result,
            gem: g.simulate(LEVELS.find(l => l.id === 'gempath').map, g.fromSolution('fffrfff')).gems };
        }""")
        check("courses: 15+ ready-made courses", sim["n"] >= 15, str(sim["n"]))
        LAST_SOLUTION = page.evaluate("import('./js/games/robot-levels.js').then(m => m.LEVELS.at(-1).solution)")
        check("courses: unique ids, rectangular maps, 5x5 to 7x7", sim["ids"] == sim["n"] and sim["even"] and all(5 <= w <= 7 and 5 <= h <= 7 for w, h in sim["sizes"]), str(sim["sizes"]))
        bad = [n for n, r in sim["res"] if r != "goal"]
        check("courses: every known solution reaches the flag", not bad, str(bad))
        check("courses: ramp starts with no walls, ends with walls", not any(sim["walls"][:6]) and all(sim["walls"][-5:]))
        check("courses: some courses have optional gems", sum(sim["gems"]) >= 3)
        check("sim: too few steps = end, wall/edge = bonk at that step", sim["short"] == "end" and sim["bonk"]["result"] == "bonk" and sim["bonk"]["at"] == 3 and sim["edge"] == "bonk", str(sim["bonk"]))
        check("sim: gems collected on the way", sim["gem"] == 1)

        # ---------- first launch: name the robot ----------
        open_robot()
        check("first launch asks for a robot name", page.locator("text=Your robot needs a name!").count() == 1)
        inp = page.locator(".rb-name-input")
        check("name: a normal text box (device keyboard), no on-screen keyboard", inp.count() == 1 and page.locator(".rb-naming .kb").count() == 0)
        attrs = inp.evaluate("e => [e.getAttribute('autocorrect'), e.getAttribute('autocapitalize'), e.spellcheck, e.maxLength, document.activeElement === e, parseFloat(getComputedStyle(e).fontSize)]")
        check("name box: autocorrect off, capitalised, max 12, focused, big text (no iOS zoom)", attrs[:4] == ["off", "words", False, 12] and attrs[4] and attrs[5] >= 16, str(attrs))
        inp.fill("zip"); page.keyboard.press("Enter")
        check("name shown as '<name> is ready!'", page.locator("text=Zip is ready!").count() == 1)
        check("name stored", page.evaluate("localStorage.getItem('spelling-games.robot.name')") == "zip")
        tap(".rb-rename")
        check("✏️ Rename opens the box with the current name", page.locator(".rb-name-input").input_value() == "zip")
        page.locator(".rb-name-input").fill("Beep Boop"); tap("button:has-text(\"That's it!\")")
        check("rename with the button; spaces allowed", page.locator("text=Beep Boop is ready!").count() == 1)
        tap(".rb-rename"); page.locator(".rb-name-input").fill("zip"); page.keyboard.press("Enter")
        check("picker: 🗺️ Courses and 🧱 Build my own tabs", page.locator(".rb-tab", has_text="Courses").count() == 1 and page.locator(".rb-tab", has_text="Build my own").count() == 1)
        check("picker: all courses open, none finished yet", page.locator(".rb-level").count() == sim["n"] and page.locator(".rb-level.done").count() == 0 and page.locator(".rb-level:disabled").count() == 0)
        page.screenshot(path=f"{SHOTS}/robot_picker.png")

        # ---------- keypad matches the toy ----------
        level(0)
        lay = page.evaluate("""() => { const r = {}; for (const k of document.querySelectorAll('.rb-key')) { const b = k.getBoundingClientRect();
            r[k.dataset.key] = { x: b.x + b.width / 2, y: b.y + b.height / 2, bg: getComputedStyle(k).backgroundColor, text: k.textContent }; }
            const c = document.querySelector('.rb-centre').getBoundingClientRect(); r.centre = { x: c.x + c.width / 2, y: c.y + c.height / 2,
            bg: getComputedStyle(document.querySelector('.rb-centre')).backgroundColor, text: document.querySelector('.rb-centre').textContent }; return r; }""")
        C = lay["centre"]
        pos_ok = (abs(lay["fwd"]["x"] - C["x"]) < 3 and lay["fwd"]["y"] < C["y"] and abs(lay["back"]["x"] - C["x"]) < 3 and lay["back"]["y"] > C["y"]
                  and lay["left"]["x"] < C["x"] and abs(lay["left"]["y"] - C["y"]) < 3 and lay["right"]["x"] > C["x"] and abs(lay["right"]["y"] - C["y"]) < 3
                  and lay["undo"]["x"] < C["x"] and lay["undo"]["y"] > C["y"] and lay["run"]["x"] > C["x"] and lay["run"]["y"] > C["y"])
        check("keypad: forward top, back bottom, turns left/right, ✕ bottom-left, run bottom-right", pos_ok, str(lay))
        def hue(rgb):
            r_, g_, b_ = [int(v) for v in rgb[rgb.index("(") + 1:rgb.index(")")].split(",")[:3]]
            return "green" if g_ > r_ and g_ > b_ else "red" if r_ > 200 and g_ < 100 and b_ < 100 else "blue" if b_ > r_ and b_ > g_ and r_ < 100 else \
                "purple" if b_ > g_ and r_ > g_ else "yellow" if r_ > 200 and g_ > 180 and b_ < 100 else "orange" if r_ > 200 and 80 < g_ < 180 else "white" if min(r_, g_, b_) > 240 else rgb
        colours = {k: hue(lay[k]["bg"]) for k in ["fwd", "back", "left", "right", "undo", "run", "centre"]}
        check("keypad: toy colours (green/red/blue/purple/yellow/orange/white)", colours == {"fwd": "green", "back": "red", "left": "blue", "right": "purple", "undo": "yellow", "run": "orange", "centre": "white"}, str(colours))
        check("keypad: centre is blank", lay["centre"]["text"].strip() == "")
        check("keypad: turn keys show ↺/↻ and the word", "↺" in lay["left"]["text"] and "counter-clockwise" in lay["left"]["text"] and "↻" in lay["right"]["text"] and "clockwise" in lay["right"]["text"] and "counter" not in lay["right"]["text"])
        check("head: 10 lights", page.locator(".rb-light").count() == 10)

        # ---------- planning: chips, colours, undo, chip tap, no movement ----------
        keys("ffl")
        check("keys add matching chips", chips() == ["fwd", "fwd", "left"], str(chips()))
        cc = page.evaluate("[...document.querySelectorAll('.code-chip')].map(c => c.className)")
        check("chips carry their key's colour", "c-green" in cc[0] and "c-blue" in cc[2])
        check("turn chip shows icon + 'counter-clockwise'", "↺" in page.locator(".code-chip >> nth=2").inner_text() and "counter-clockwise" in page.locator(".code-chip >> nth=2").inner_text())
        check("robot does not move while planning", bot() == [0, 2, 1], str(bot()))
        tap(".rb-key[data-key='undo']"); time.sleep(0.35)
        check("✕ removes only the last step", chips() == ["fwd", "fwd"], str(chips()))
        keys("r"); tap(".code-chip >> nth=0")
        check("tapping a chip opens its menu (no instant delete)", page.locator(".overlay [data-act='remove']").count() == 1 and chips() == ["fwd", "fwd", "right"], str(chips()))
        check("menu title looks like the chip (same colour, icon, word)", page.evaluate("""(sel) => { const c = document.querySelector(sel), f = document.querySelector('.overlay .code-menu-title .code-face');
            const col = (e) => [...e.classList].find(k => k.startsWith('c-'));
            return !!f && col(f) === col(c) && f.querySelector('.ci').textContent === c.querySelector('.ci').textContent
              && f.querySelector('.cw').textContent === c.querySelector('.cw').textContent
              && getComputedStyle(f).borderColor === getComputedStyle(c).borderColor && getComputedStyle(f).backgroundColor === getComputedStyle(c).backgroundColor; }""", ".code-chip[data-i='0']"))
        check("…first chip can't move left", page.locator(".overlay [data-act='shift-left']").is_disabled() and not page.locator(".overlay [data-act='shift-right']").is_disabled())
        tap(".overlay [data-act='remove']"); time.sleep(0.35)
        check("🗑️ Remove in the menu deletes that chip", chips() == ["fwd", "right"] and page.locator(".overlay").count() == 0, str(chips()))
        check("clockwise chip shows ↻ + 'clockwise'", "↻" in page.locator(".code-chip >> nth=1").inner_text() and "clockwise" in page.locator(".code-chip >> nth=1").inner_text())
        page.keyboard.press("ArrowUp")
        check("physical arrow key adds a step", chips() == ["fwd", "right", "fwd"], str(chips()))
        def chip_drag(src, dst, side="after", hold=None):
            """Drag chip `src` (CSS) onto the before/after side of chip `dst` with the mouse."""
            a = page.locator(src).first.bounding_box(); z = page.locator(dst).first.bounding_box()
            page.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2); page.mouse.down()
            tx = z["x"] + (z["width"] * 0.85 if side == "after" else z["width"] * 0.15)
            page.mouse.move(tx, z["y"] + z["height"] / 2, steps=8)
            if hold: hold()
            page.mouse.up(); time.sleep(0.15)
        chip_drag(".code-chip[data-i='1']", ".code-chip[data-i='2']", "after",
                  hold=lambda: check("drag: a ghost chip follows and a drop bar shows", page.locator(".code-ghost").count() == 1 and page.locator(".code-drop:not([hidden])").count() == 1))
        check("drag a chip to a new place: order changes, nothing deleted", chips() == ["fwd", "fwd", "right"], str(chips()))
        chip_drag(".code-chip[data-i='2']", ".code-chip[data-i='0']", "before")
        check("drag to the front", chips() == ["right", "fwd", "fwd"], str(chips()))
        check("drag leaves no ghost or drop bar behind", page.locator(".code-ghost, .code-drop").count() == 0)
        a0 = page.locator(".code-chip[data-i='0']").bounding_box()
        page.mouse.move(a0["x"] + 30, a0["y"] + 30); page.mouse.down(); page.mouse.move(a0["x"] + 33, a0["y"] + 32); page.mouse.up(); time.sleep(0.35)
        check("a tiny wobble is a tap: opens the menu, deletes nothing", page.locator(".overlay [data-act='remove']").count() == 1 and chips() == ["right", "fwd", "fwd"], str(chips()))
        tap(".overlay [data-act='shift-right']")
        check("Move right ▶ moves it one place (menu stays open)", chips() == ["fwd", "right", "fwd"] and page.locator(".overlay [data-act='shift-right']").count() == 1, str(chips()))
        tap(".overlay [data-act='shift-right']")
        check("…again to the end; ▶ now greyed out", chips() == ["fwd", "fwd", "right"] and page.locator(".overlay [data-act='shift-right']").is_disabled(), str(chips()))
        tap(".overlay [data-act='shift-left']")
        check("◀ Move left moves it back", chips() == ["fwd", "right", "fwd"], str(chips()))
        tap(".overlay [data-act='shift-right']")
        tap(".overlay button:has-text('Done')")
        chip_drag(".code-chip[data-i='2']", ".code-chip[data-i='1']", "before")
        check("drag into the middle", chips() == ["fwd", "right", "fwd"], str(chips()))
        tap("[data-tool='clear']")
        check("🧹 Clear all asks first", page.locator(".overlay", has_text="Clear all steps?").count() == 1)
        tap(".overlay button:has-text('No')")
        check("…and 'No' keeps them", chips() == ["fwd", "right", "fwd"])
        tap("[data-tool='clear']"); tap(".overlay button:has-text('Yes')")
        check("…'Yes' clears them", chips() == [])

        # ---------- run to the flag ----------
        keys("ffff")
        page.evaluate("""() => { window.__seq = []; window.__lit = [];
          new MutationObserver(() => { const c = document.querySelector('.code-chip.now'); if (c && window.__seq.at(-1) !== c.dataset.i) window.__seq.push(c.dataset.i);
            const l = document.querySelector('.rb-light.on'); if (l) window.__lit.push(l.className); }).observe(document.querySelector('.rb-play'), { subtree: true, attributes: true, attributeFilter: ['class'] }); }""")
        g0 = gp()
        run()
        time.sleep(0.3)
        check("▶ becomes ⏹ while running", page.locator(".rb-key[data-key='run']").inner_text() == "⏹")
        page.screenshot(path=f"{SHOTS}/robot_running.png")
        idle()
        check("chips light in order as it runs", page.evaluate("window.__seq") == ["0", "1", "2", "3"], str(page.evaluate("window.__seq")))
        check("light bar glows in the step's colour", any("on" in c and "c-green" in c for c in page.evaluate("window.__lit")))
        check("flag reached: robot on the flag", bot()[:2] == [4, 2], str(bot()))
        check("flag reached: cheerful message", "🏁" in msg() and "made it" in msg(), msg())
        check("flag reached: +1 garden point", gp() - g0 == 1, str(gp() - g0))
        check("flag reached: happy dance + confetti", page.locator(".rb-body.dance.happy").count() == 1 and page.locator(".confetti").count() == 1)
        check("flag reached: Next course button", page.locator("button:has-text('Next course')").count() == 1)
        check("run key back to ▶", page.locator(".rb-key[data-key='run']").inner_text() == "▶")
        page.screenshot(path=f"{SHOTS}/robot_goal.png")
        run(); time.sleep(0.1)
        page.wait_for_function("document.querySelector('.rb-bot').dataset.x === '0'", timeout=3000)
        check("Play again: robot goes back to the start first", True)
        idle()
        check("…and every completion earns a point", gp() - g0 == 2, str(gp() - g0))
        tap("button:has-text('All courses')")
        check("finished course shows ⭐ on the picker (no count)", page.locator(".rb-level.done").count() == 1 and page.locator(".rb-level >> nth=0").locator(".rb-star").count() == 1)
        check("done list stored", page.evaluate("JSON.parse(localStorage.getItem('spelling-games.robot.done.v1'))") == ["straight"])

        # ---------- bonk: gentle, chip pulses, program kept ----------
        level(0)
        check("start square is marked", page.locator(".rb-start").count() == 1 and page.evaluate("document.querySelector('.rb-start').style.transform") == "translate(0%, 200%)")
        keys("lfff")
        g0 = gp()
        run(); idle()
        check("bonk: robot pauses where it bumped", bot() == [0, 0, 0], str(bot()))
        page.wait_for_selector(".rb-ghost", timeout=3000)
        page.wait_for_function("document.querySelector('.rb-bot').dataset.y === '2'", timeout=3000)
        time.sleep(0.4)
        ghost = page.evaluate("(({x, y, d}) => [+x, +y, +d])(document.querySelector('.rb-ghost').dataset)")
        check("bonk: then goes back to the start", bot() == [0, 2, 1], str(bot()))
        check("bonk: faded ghost robot stays where it bumped", ghost == [0, 0, 0], str(ghost))
        crumbs = page.evaluate("[...document.querySelectorAll('.rb-crumb')].map(c => [+c.dataset.x, +c.dataset.y])")
        check("bonk: breadcrumbs show the path it took", crumbs == [[0, 2], [0, 1]], str(crumbs))
        check("start marker still visible under the robot", page.locator(".rb-start").is_visible())
        check("bonk: 'Let's fix the plan!'", "Let's fix the plan!" in msg(), msg())
        check("bonk: no failure words", not any(w in msg().lower() for w in ["wrong", "fail", "✗", "no!"]))
        check("bonk: the chip that bumped pulses", page.evaluate("[...document.querySelectorAll('.code-chip')].findIndex(c => c.classList.contains('pulse'))") == 3)
        check("bonk: program unchanged", chips() == ["left", "fwd", "fwd", "fwd"])
        check("bonk: no garden point", gp() == g0)
        mcol = page.evaluate("getComputedStyle(document.querySelector('.rb-play .msg')).color")
        check("bonk: message not red", hue(mcol) != "red", mcol)
        page.screenshot(path=f"{SHOTS}/robot_bonk.png")
        # edit (✕ last), then fix the plan: robot fades back and tries again
        tap(".rb-key[data-key='undo']"); time.sleep(0.35)
        check("editing clears the pulse", page.locator(".code-chip.pulse").count() == 0)
        check("editing keeps the ghost and breadcrumbs", page.locator(".rb-ghost").count() == 1 and page.locator(".rb-crumb").count() == 2)
        tap("[data-tool='clear']"); tap(".overlay button:has-text('Yes')")
        keys("ff")
        run()
        page.wait_for_selector(".code-chip.now", timeout=3000)
        check("next run clears the old ghost and breadcrumbs", page.locator(".rb-ghost").count() == 0)
        idle()
        check("too few steps: 'Almost! Add more steps?'", "Almost! Add more steps?" in msg(), msg())
        page.wait_for_selector(".rb-ghost", timeout=3000)
        time.sleep(0.6)
        check("too few steps: ghost where it stopped, robot back home", page.evaluate("document.querySelector('.rb-ghost').dataset.x") == "2" and bot() == [0, 2, 1], str(bot()))

        # ---------- more than 10 steps, light bar carries on, ⏹ stops ----------
        tap("[data-tool='clear']"); tap(".overlay button:has-text('Yes')")
        keys("fb" * 6)
        check("more than 10 steps allowed", len(chips()) == 12)
        page.evaluate("window.__lit = []")
        run(); time.sleep(0.2)
        page.wait_for_function("document.querySelector('.code-chip.now') && document.querySelector('.code-chip.now').dataset.i === '10'", timeout=15000)
        chip_drag(".code-chip[data-i='0']", ".code-chip[data-i='1']", "after")
        check("no dragging while the robot runs", chips()[:2] == ["fwd", "back"] and page.locator(".code-ghost").count() == 0, str(chips()[:2]))
        check("step 11 lights the first light again", page.evaluate("[...document.querySelectorAll('.rb-light')].findIndex(l => l.classList.contains('on'))") == 0)
        tap(".rb-key[data-key='run']")
        idle()
        check("⏹ stops the run", "Stopped" in msg() and page.locator(".rb-key[data-key='run']").inner_text() == "▶", msg())
        check("⏹ keeps the program", len(chips()) == 12)

        # ---------- 👣 Step ----------
        tap("[data-tool='clear']"); tap(".overlay button:has-text('Yes')")
        keys("ffff")
        g0 = gp()
        tap("[data-tool='step']")
        page.wait_for_selector(".code-chip.now", timeout=3000)
        page.wait_for_function("document.querySelector('.rb-bot').dataset.x === '1'", timeout=3000)
        check("👣 Step runs one step", bot()[:2] == [1, 2] and page.evaluate("document.querySelector('.code-chip.now').dataset.i") == "0")
        time.sleep(0.8)
        check("…and waits", bot()[:2] == [1, 2])
        for k in range(3):
            time.sleep(0.7); tap("[data-tool='step']")  # a tap during a step's own move is ignored
            page.wait_for_function(f"document.querySelector('.rb-bot').dataset.x === '{k + 2}'", timeout=3000)
        idle()
        check("stepping to the flag celebrates too", "made it" in msg() and gp() - g0 == 1, msg())
        home()

        # ---------- a turn-around course with a solution typed on the keypad ----------
        open_robot(); level(7)
        keys("llfff")
        run(); idle()
        check("½ turn = two ¼ turns, then reaches the flag", "made it" in msg(), msg())
        home()

        # ---------- Build my own ----------
        open_robot(); tap(".rb-tab:has-text('Build my own')")
        tap(".rb-new")
        check("builder: wall hint mentions dragging", "drag" in msg(), msg())
        check("builder: no stray 'null' text on a new course (Jason saw one by Save)", not page.evaluate("document.querySelector('#app').innerText.includes('null')"))
        check("builder: palette has wall/cone/gem/flag/robot/eraser",
              all(page.locator(f".rb-tool[data-tool='{t}']").count() == 1 for t in ["wall", "cone", "gem", "flag", "robot", "erase"]))
        def cell(x, y): return f".rb-cell[data-x='{x}'][data-y='{y}']"
        tap(cell(0, 4))
        check("builder: tap places a wall", page.locator(cell(0, 4) + ".k-wall").count() == 1)
        def centre(x, y):
            r = page.locator(cell(x, y)).bounding_box(); return r["x"] + r["width"] / 2, r["y"] + r["height"] / 2
        def drag(cells, steps=6):
            page.mouse.move(*centre(*cells[0])); page.mouse.down()
            for c in cells[1:]: page.mouse.move(*centre(*c), steps=steps)
            page.mouse.up()
        walls = lambda: page.evaluate("[...document.querySelectorAll('.rb-edit .rb-cell.k-wall')].map(c => +c.dataset.x + ',' + c.dataset.y).sort()")
        drag([(1, 1), (4, 1)])
        check("builder: dragging 🧱 across squares builds a continuous wall", walls() == sorted(["0,4", "1,1", "2,1", "3,1", "4,1"]), str(walls()))
        drag([(1, 2), (1, 4)], steps=1)  # one big jump: the squares in between still fill in
        check("builder: a fast drag leaves no gaps", {"1,2", "1,3", "1,4"} <= set(walls()), str(walls()))
        drag([(2, 1), (4, 1)])
        check("builder: dragging from a wall takes walls away", "2,1" not in walls() and "4,1" not in walls() and "1,1" in walls(), str(walls()))
        drag([(0, 3), (0, 5), (1, 5)])
        check("builder: a wall drag never covers the robot", page.locator(cell(0, 5) + ".k-start").count() == 1 and "0,5" not in walls())
        for c in ["1,2", "1,3", "1,4", "1,1", "0,3"]:
            x, y = map(int, c.split(",")); tap(cell(x, y))
        tap(cell(1, 5))  # (dragged on as part of the robot test above)
        check("builder: tap a wall again removes it (back to just one wall)", walls() == ["0,4"], str(walls()))
        tap(".rb-tool[data-tool='cone']")
        drag([(2, 3), (4, 3)])
        check("builder: cones are one square each (drag places just the first)", page.locator(".rb-edit .rb-cell.k-cone").count() == 1 and page.locator(cell(2, 3) + ".k-cone").count() == 1)
        tap(cell(2, 3))
        tap(".rb-tool[data-tool='wall']")
        tap(".rb-tool[data-tool='cone']"); tap(cell(2, 2))
        tap(".rb-tool[data-tool='gem']"); tap(cell(1, 5))
        check("builder: cone and gem placed", page.locator(cell(2, 2) + ".k-cone").count() == 1 and page.locator(cell(1, 5) + ".k-gem").count() == 1)
        check("cone is a drawn orange cone, not 🚧 (looked like the flag)", page.locator(cell(2, 2) + " svg").count() == 1 and "🚧" not in page.locator(".rb-edit").inner_text())
        tap(cell(1, 5))
        check("builder: tap again removes it", page.locator(cell(1, 5) + ".k-gem").count() == 0)
        tap(".rb-tool[data-tool='gem']"); tap(cell(3, 5))
        tap(".rb-tool[data-tool='flag']"); tap(cell(5, 5))
        check("builder: flag moves (only one)", page.locator(".rb-cell.k-flag").count() == 1 and page.locator(cell(5, 5) + ".k-flag").count() == 1)
        tap(".rb-tool[data-tool='robot']"); tap(cell(0, 5))
        check("builder: tapping the robot turns it", page.evaluate(f"document.querySelector(\"{cell(0, 5)} .rb-mini\").style.transform") == "rotate(90deg)")
        tap("button:has-text('Save course')")
        saved = page.evaluate("JSON.parse(localStorage.getItem('spelling-games.robot.mine.v1'))")
        check("builder: saved to localStorage", len(saved) == 1 and saved[0]["map"][4] == "#....." and saved[0]["map"][5] == ">..*.F", str(saved))
        check("builder: says it saved", "Saved" in msg(), msg())
        check("builder: after saving, a Delete course button and no 'null'", page.locator("button:has-text('Delete course')").count() == 1 and not page.evaluate("document.querySelector('#app').innerText.includes('null')"))
        page.screenshot(path=f"{SHOTS}/robot_builder.png")
        page.reload(); page.wait_for_selector(".mcard")
        open_robot(); tap(".rb-tab:has-text('Build my own')")
        check("builder: saved course listed after reload", page.locator(".rb-mine", has_text="My course 1").count() == 1)
        tap(".rb-mine")
        check("builder: saved course reloads its pieces", page.locator(cell(0, 4) + ".k-wall").count() == 1 and page.locator(cell(2, 2) + ".k-cone").count() == 1 and page.locator(cell(3, 5) + ".k-gem").count() == 1)
        tap("button:has-text('Code it!')")
        g0 = gp()
        keys("fffff")
        run(); idle()
        check("builder: code the robot through her own course", "made it" in msg() and gp() - g0 == 1, msg())
        check("builder: gem collected on the way", page.locator(".k-gem.got").count() == 1)
        check("builder: own courses don't add level stars", page.evaluate("JSON.parse(localStorage.getItem('spelling-games.robot.done.v1'))") == ["straight", "turnaround"])
        tap("button:has-text('Change my course')")
        tap(".rb-tool[data-tool='wall']"); tap(cell(4, 5))
        tap("button:has-text('Code it!')")
        keys("fffff"); run(); idle()
        check("builder: changed course bonks on the new wall", "fix the plan" in msg(), msg())
        tap("button:has-text('Change course')")
        tap("button:has-text('Delete course')"); tap(".overlay button:has-text('Yes')")
        check("builder: delete removes it", page.evaluate("JSON.parse(localStorage.getItem('spelling-games.robot.mine.v1'))") == [] and page.locator(".rb-mine").count() == 0)
        # a new course, coded without saving, then back to the builder: still no 'null'
        tap(".rb-new"); tap("button:has-text('Code it!')"); tap("button:has-text('Change course')")
        check("builder: back from Code it on an unsaved course, no 'null'", page.locator(".rb-edit").count() == 1 and not page.evaluate("document.querySelector('#app').innerText.includes('null')"))
        tap("button:has-text('Save course')"); tap("button:has-text('My courses')")
        check("builder: each saved course has a 🗑 in the list", page.locator(".rb-mine-wrap .rb-del").count() == 1)
        tap(".rb-del")
        check("builder: 🗑 asks first", page.locator(".overlay", has_text="Delete").count() == 1)
        tap(".overlay button:has-text('No')")
        check("builder: 'No' keeps it", page.locator(".rb-mine").count() == 1)
        tap(".rb-del"); tap(".overlay button:has-text('Yes')")
        check("builder: 🗑 from the list deletes it", page.locator(".rb-mine").count() == 0 and page.evaluate("JSON.parse(localStorage.getItem('spelling-games.robot.mine.v1'))") == [])
        home()

        # ---------- last course: finish row has no 'null' (no Next course) ----------
        open_robot(); level(sim["n"] - 1)
        keys(LAST_SOLUTION)
        run(); idle(60000)
        check("last course: celebrates, no Next button, no 'null'", "made it" in msg() and page.locator("button:has-text('Next course')").count() == 0 and not page.evaluate("document.querySelector('#app').innerText.includes('null')"), msg())
        home()

        # ---------- layout ----------
        open_robot(); level(16)
        keys("ffrflfflffr")
        page.screenshot(path=f"{SHOTS}/robot_7x7.png")
        fits = page.evaluate("document.scrollingElement.scrollHeight <= innerHeight + 1")
        check("1024x768: 7x7 course + head + chips fit without scrolling", fits, str(page.evaluate("[document.scrollingElement.scrollHeight, innerHeight]")))
        home()
        page.set_viewport_size({"width": 390, "height": 760})
        open_robot(); level(3); keys("ffff")
        check("phone: no horizontal overflow", not page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        small = page.evaluate("Math.min(...[...document.querySelectorAll('.rb-key, .code-chip, .rb-tools .btn')].map(e => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))")
        check("phone: touch targets >= 44px", small >= 44, str(small))
        page.screenshot(path=f"{SHOTS}/robot_phone.png", full_page=True)
        home()
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
