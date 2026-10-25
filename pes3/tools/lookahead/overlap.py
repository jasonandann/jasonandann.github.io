# How often do look-ahead branches overlap on one tile? Generates 150 boards per list and measures
# every first-letter tap and every step along a hidden word. Run from pes3/: python3 tools/lookahead/overlap.py
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright
def words(path): return [l.split("|")[0].strip() for l in open(path) if l.strip() and not l.startswith("#")]
LISTS = {"words.txt (y/ies)": words("words.txt"), "fixture (Oct 26)": words("tests/fixtures/words.txt")}
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8793", "--directory", "."], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); pg.goto("http://localhost:8793/js/games/baffle.js")
        for name, ws in LISTS.items():
            r = pg.evaluate("""async (ws) => { const m = await import('/js/games/baffle.js');
              const tally = (h, k) => { h[k] = (h[k] || 0) + 1; };
              const out = {first: {br: {}, ov: {}}, route: {br: {}, ov: {}}, boards: 0};
              for (let n = 0; n < 150; n++) {
                // the game passes up to 24 list words to generate(); this list fits in one board
                const { grid, hidden } = m.generate(ws.filter(w => /^[a-z]+$/.test(w) && w.length >= 2));
                out.boards++;
                const measure = (kind, path) => {
                  const br = m.lookaheadBranches(grid, ws, path);
                  if (!br.length) return;
                  const cover = {};
                  br.forEach(b => { for (const c of b.tiles.keys()) cover[c] = (cover[c] || 0) + 1; });
                  tally(out[kind].br, br.length);
                  tally(out[kind].ov, Math.max(...Object.values(cover)));
                };
                for (let i = 0; i < 25; i++) measure('first', [i]);            // any first letter she taps
                for (const w of hidden) { const r = m.findPath(grid, w);       // every step along a real word
                  for (let k = 1; k < w.length; k++) measure('route', r.slice(0, k)); }
              }
              return out; }""", ws)
            print(f"\n== {name}: {len(ws)} words, {r['boards']} boards, nothing found yet (worst case)")
            for kind, label in [("first", "after the 1st letter"), ("route", "at each step along a hidden word")]:
                for key, what in [("br", "branches shown"), ("ov", "most branches on one tile")]:
                    h = {int(k): v for k, v in r[kind][key].items()}; tot = sum(h.values())
                    print(f"  {label:34} {what:26} " + "  ".join(f"{k}:{100*v/tot:4.1f}%" for k, v in sorted(h.items())))
        b.close()
finally:
    srv.terminate()
