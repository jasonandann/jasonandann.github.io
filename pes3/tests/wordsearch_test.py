# Word Search touch handling (issue #51): release uses the line on screen, diagonals snap, overshoot by one
# letter is forgiven, a second finger is ignored, a stray tap doesn't swallow the next drag, misses show.
import os, tempfile
from pathlib import Path
import subprocess, sys, time
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8778
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)

FAKE_TTS = """
window.__spoken = [];
const fake = { speak(u){ window.__spoken.push(u.text); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
"""
DIRS8 = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]

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
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block", is_mobile=False)
        ctx.add_init_script(FAKE_TTS)
        ctx.route(URL + "words.txt", lambda r: r.fulfill(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")))
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        cdp = ctx.new_cdp_session(page)

        # ---- snapEnd (pure)
        snap = page.goto(URL) and page.wait_for_selector(".mcard") and page.evaluate("""async () => {
          const { snapEnd } = await import('./js/games/wordsearch.js');
          const s = { r: 5, c: 5 };
          const at = (dr, dc) => ({ x: 5.5 + dc, y: 5.5 + dr });
          const pick = (o) => [o.dir, o.len, o.r, o.c];
          return {
            wobblyDiag: pick(snapEnd(s, { x: 5.5 + 3.3, y: 5.5 + 2.7 }, 12, null)),
            upLeft: pick(snapEnd(s, at(-2.2, -1.8), 12, null)),
            inStart: pick(snapEnd(s, at(0.3, -0.4), 12, null)),
            keepLen: snapEnd(s, at(0, 2.7), 12, { dir: 0, len: 2 }).len,
            growLen: snapEnd(s, at(0, 2.8), 12, { dir: 0, len: 2 }).len,
            keepShrink: snapEnd(s, at(0, 1.3), 12, { dir: 0, len: 2 }).len,
            shrink: snapEnd(s, at(0, 1.2), 12, { dir: 0, len: 2 }).len,
            keepDir: snapEnd(s, { x: 5.5 + 3 * Math.cos(0.45), y: 5.5 + 3 * Math.sin(0.45) }, 12, { dir: 0, len: 3 }).dir,
            swingDir: snapEnd(s, { x: 5.5 + 3 * Math.cos(0.6), y: 5.5 + 3 * Math.sin(0.6) }, 12, { dir: 0, len: 3 }).dir,
            edge: pick(snapEnd({ r: 0, c: 8 }, { x: 30, y: 0.5 }, 10, null)),
          };
        }""")
        check("snap: wobbly diagonal snaps to down-right x3", snap["wobblyDiag"] == [1, 3, 8, 8], str(snap["wobblyDiag"]))
        check("snap: up-left diagonal", snap["upLeft"] == [5, 2, 3, 3], str(snap["upLeft"]))
        check("snap: inside the first letter = no line", snap["inStart"][1] == 0, str(snap["inStart"]))
        check("snap: grows only a quarter cell into the next letter", snap["keepLen"] == 2 and snap["growLen"] == 3, str(snap))
        check("snap: shrinks only a quarter cell into the previous letter", snap["keepShrink"] == 2 and snap["shrink"] == 1, str(snap))
        check("snap: direction holds just past the boundary, then swings", snap["keepDir"] == 0 and snap["swingDir"] == 1, str(snap))
        check("snap: line stops at the grid edge", snap["edge"] == [0, 1, 0, 9], str(snap["edge"]))

        # ---- a puzzle with at least one diagonal word
        def read():
            return page.evaluate("""() => {
              const g = document.querySelector('.ws-grid'); const n = +g.style.getPropertyValue('--n');
              const grid = Array.from({length:n},()=>Array(n).fill(''));
              document.querySelectorAll('.cell').forEach(c=>{ grid[+c.dataset.r][+c.dataset.c] = c.textContent; });
              return {n, grid, words: [...document.querySelectorAll('.chip')].map(c=>c.textContent.toUpperCase())};
            }""")
        def locate(n, grid, word):
            for dr, dc in [(0, 1), (1, 0), (1, 1)]:
                for r in range(n):
                    for c in range(n):
                        er, ec = r + dr * (len(word) - 1), c + dc * (len(word) - 1)
                        if er < n and ec < n and all(grid[r + dr * k][c + dc * k] == word[k] for k in range(len(word))):
                            return {"word": word, "r": r, "c": c, "dr": dr, "dc": dc}
            return None
        def load():  # open a fresh puzzle (each test needs an unfound word; boards have only 6)
            global n, grid, todo, b00, pitch
            page.goto(URL); page.wait_for_selector(".mcard")
            page.locator(".mcard", has_text="Word Search").first.tap()
            page.wait_for_selector(".ws-grid .cell")
            info = read(); n, grid = info["n"], info["grid"]
            spots = [locate(n, grid, w) for w in info["words"]]
            todo = [x for x in spots if x]
            b00 = page.locator(".cell[data-r='0'][data-c='0']").bounding_box()
            pitch = page.locator(".cell[data-r='0'][data-c='1']").bounding_box()["x"] - b00["x"]
            return spots
        spots = load()
        check("every word is findable in the grid", all(spots), str(spots))
        page.screenshot(path=f"{SHOTS}/wordsearch-touch.png")
        def pt(r, c):  # fractional cell coords -> page px (cell centres at integer r, c)
            return {"x": b00["x"] + b00["width"] / 2 + c * pitch, "y": b00["y"] + b00["height"] / 2 + r * pitch}
        def touch(kind, points):
            cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})
        def drag(path, rest=0.15):
            touch("touchStart", [{**pt(*path[0]), "id": 1}])
            for q in path[1:]:
                touch("touchMove", [{**pt(*q), "id": 1}])
            time.sleep(rest)  # rest before lifting: no fling (see CLAUDE.md)
            touch("touchEnd", [])
            time.sleep(0.25)
        def line(s, a, b, steps=8, perp=0.0):  # from letter a to letter b of spot s (b may run past the end)
            out = []
            for t in range(steps + 1):
                k = a + (b - a) * t / steps
                q = perp * t / steps  # drifts off the line as the drag goes on
                out.append((s["r"] + s["dr"] * k + s["dc"] * q, s["c"] + s["dc"] * k - s["dr"] * q))
            return out
        def tap(r, c):
            touch("touchStart", [{**pt(r, c), "id": 1}]); time.sleep(0.05); touch("touchEnd", []); time.sleep(0.25)
        found = lambda w: page.locator(".chip.found", has_text=w.lower()).count() == 1
        is_found_cell = lambda r, c: page.locator(f".cell.found[data-r='{r}'][data-c='{c}']").count() == 1
        sel_count = lambda: page.locator(".cell.sel").count()
        def room(s, k):  # k letters past the end still inside the grid
            L = len(s["word"]) - 1 + k
            return s["r"] + s["dr"] * L < n and s["c"] + s["dc"] * L < n
        def peek(pred=lambda s: True):  # an unfound word matching pred, opening new puzzles until one has it
            for attempt in range(30):
                s = next((x for x in todo if pred(x)), None)
                if s: return s
                load()
            raise RuntimeError("no puzzle had a matching word in 30 tries")
        def take(pred=lambda s: True):
            s = peek(pred); todo.remove(s); return s

        # 1. wobbly diagonal: drifts to 0.6 cell off the line, so the finger ends on a neighbouring letter
        s = take(lambda s: s["dr"] and s["dc"])
        drag(line(s, 0, len(s["word"]) - 1, perp=0.6))
        check("diagonal drag ending on a neighbouring letter (0.6 cell off-line) is accepted", found(s["word"]), s["word"])

        # 2. the lift drifts into the gap past the last letter (old code: gap -> treated as a tap, word lost)
        s = take(lambda s: room(s, 1))
        L = len(s["word"]) - 1
        drag(line(s, 0, L) + [(s["r"] + s["dr"] * (L + 0.5), s["c"] + s["dc"] * (L + 0.5))])
        check("lift drifting onto the gap after the last letter still counts", found(s["word"]), s["word"])
        check("no tap left pending after that drag", sel_count() == 0, str(sel_count()))

        # 3. overshoot by one letter: accepted, only the word's letters are coloured
        s = take(lambda s: room(s, 1))
        L = len(s["word"])
        er, ec = s["r"] + s["dr"] * L, s["c"] + s["dc"] * L
        before = is_found_cell(er, ec)
        drag(line(s, 0, L))
        check("overshoot by one letter is accepted", found(s["word"]), s["word"])
        check("the extra letter is not coloured", is_found_cell(er, ec) == before)

        # 4. overshoot by two letters is a miss, and the checked letters fade (.miss)
        s = peek(lambda s: room(s, 2))
        drag(line(s, 0, len(s["word"]) + 1))
        check("overshoot by two letters is not accepted", not found(s["word"]), s["word"])
        check("a miss marks the checked letters", page.locator(".cell.miss").count() == len(s["word"]) + 2,
              str(page.locator(".cell.miss").count()))

        # 5. a stray tap doesn't swallow the next drag (old code: next pointerdown ended a tap-tap selection)
        s = take()
        far = next(((r, c) for r in range(n) for c in range(n)
                    if (r - s["r"]) * s["dc"] != (c - s["c"]) * s["dr"] and abs(r - s["r"]) != abs(c - s["c"]) and r != s["r"] and c != s["c"]), (0, 0))
        tap(*far)
        check("a tap leaves one letter waiting", sel_count() == 1, str(sel_count()))
        drag(line(s, 0, len(s["word"]) - 1))
        check("a drag after a stray tap still finds the word", found(s["word"]), s["word"])

        # 6. a second finger (resting palm) is ignored
        s = take()
        L = len(s["word"]) - 1
        path = line(s, 0, L)
        touch("touchStart", [{**pt(*path[0]), "id": 1}])
        for q in path[1:4]:
            touch("touchMove", [{**pt(*q), "id": 1}])
        palm = {**pt(n - 1, 0), "id": 2}
        touch("touchStart", [{**pt(*path[3]), "id": 1}, palm])
        for q in path[4:]:
            touch("touchMove", [{**pt(*q), "id": 1}, palm])
        touch("touchMove", [{**pt(*path[-1]), "id": 1}, {**pt(n - 2, 1), "id": 2}])  # palm shifts too
        time.sleep(0.15)
        touch("touchEnd", [{**pt(*path[-1]), "id": 1}])  # palm lifts first
        touch("touchEnd", [])
        time.sleep(0.25)
        check("a second finger doesn't break the drag", found(s["word"]), s["word"])

        # 7. sliding back to the first letter cancels (no stray tap pending)
        s = peek()
        drag(line(s, 0, 2) + list(reversed(line(s, 0, 2))))
        check("drag out and back to the first letter selects nothing", sel_count() == 0, str(sel_count()))

        # 8. tap-tap still works
        s = take()
        L = len(s["word"]) - 1
        tap(s["r"], s["c"]); tap(s["r"] + s["dr"] * L, s["c"] + s["dc"] * L)
        check("tap first + last letter still finds the word", found(s["word"]), s["word"])

        # 9. mouse drags still work (lifted a few px past the last letter)
        s = take()
        L = len(s["word"]) - 1
        a, z = pt(s["r"], s["c"]), pt(s["r"] + s["dr"] * L, s["c"] + s["dc"] * L)
        page.mouse.move(a["x"], a["y"]); page.mouse.down(); page.mouse.move(z["x"], z["y"], steps=6)
        page.mouse.move(z["x"] + 4, z["y"] + 4); page.mouse.up()
        time.sleep(0.2)
        check("mouse drag still finds a word", found(s["word"]), s["word"])

        check("no console/page errors", not errors, "; ".join(errors[:3]))
        b.close()
finally:
    server.terminate()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
