"""Offline copy + update checks (issue #13): sw.js and js/offline.js.

Serves a temporary copy of the site laid out like the real one (/pes3/, /images/) from a server that
mimics GitHub Pages: ETag = "<hex mtime>-<hex size>", 304 on If-None-Match, Cache-Control max-age=600.
A "deploy" rewrites files and re-stamps every file's mtime, like Pages does. "Offline" = server stopped.
"""
import os, shutil, sys, tempfile, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parent.parent
PORT = 8771
URL = f"http://localhost:{PORT}/pes3/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)

FAKE_TTS = """
const fake = { speak(){}, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
"""

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

# ---- temporary copy of the site
ROOT = Path(tempfile.mkdtemp(prefix="pes3-sw-"))
APP = ROOT / "pes3"
shutil.copytree(SITE, APP, ignore=shutil.ignore_patterns("tests", "tools", "review", "__pycache__", ".*"))
shutil.copy(SITE / "tests" / "fixtures" / "words.txt", APP / "words.txt")
(ROOT / "images").mkdir()
shutil.copy(SITE.parent / "images" / "pes-logo.png", ROOT / "images" / "pes-logo.png")

stamp = [1_790_000_000]
def deploy(changes=None):
    """Write changed files, then give every file a new mtime (= new ETag), like a GitHub Pages deploy."""
    for rel, text in (changes or {}).items():
        (APP / rel).write_text(text)
    stamp[0] += 100
    for p in ROOT.rglob("*"):
        if p.is_file():
            os.utime(p, (stamp[0], stamp[0]))
deploy()

SLOW = {}  # path -> seconds to wait before answering (lets a "deploy" land in the middle of a check)

class Pages(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a):
        pass
    def send_head(self):
        time.sleep(SLOW.get(self.path.split("?")[0], 0))
        self._etag = None
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, "index.html")
        if os.path.isfile(path):
            st = os.stat(path)
            self._etag = f'"{int(st.st_mtime):x}-{st.st_size:x}"'
            if self.headers.get("If-None-Match", "").replace("W/", "") == self._etag:
                self.send_response(304)
                self.end_headers()
                return None
        return super().send_head()
    def end_headers(self):
        if getattr(self, "_etag", None):
            self.send_header("ETag", self._etag)
            self.send_header("Cache-Control", "max-age=600")
        super().end_headers()

server = None
def start():
    global server
    server = ThreadingHTTPServer(("localhost", PORT), Pages)
    threading.Thread(target=server.serve_forever, daemon=True).start()
def stop():
    server.shutdown()
    server.server_close()

def expected_urls():
    import json
    rel = ["", "index.html", "manifest.webmanifest", "words.txt", "audio/manifest.json", "dict/words.txt", "css/style.css"]
    rel += [str(p.relative_to(APP)) for p in sorted((APP / "js").rglob("*.js"))]
    rel += [str(p.relative_to(APP)) for p in sorted((APP / "icons").glob("*.png"))]
    m = json.loads((APP / "audio" / "manifest.json").read_text())
    rel += [f"audio/{s}.m4a" for s in m.get("words", [])] + [f"audio/{s}.sentence.m4a" for s in m.get("sentences", {})]
    return [URL + r for r in rel] + [f"http://localhost:{PORT}/images/pes-logo.png"]

CACHED = """async () => {
  const names = (await caches.keys()).filter(n => n.startsWith('pes3-c1-')).sort();
  const out = { names, live: null, urls: [] };
  for (const n of names.reverse()) {
    const c = await caches.open(n);
    if (await c.match('__complete__')) { out.live = n; out.urls = (await c.keys()).map(r => r.url); break; }
  }
  return out;
}"""

start()
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True)
        ctx.add_init_script(FAKE_TTS)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)

        off = lambda js: page.evaluate(f"async () => {{ const o = await import('./js/offline.js'); return {js}; }}")
        def kick(full="false"):  # start a check without waiting: an update reloads the page under evaluate()
            page.evaluate(f"() => {{ import('./js/offline.js').then(o => o.checkForUpdates({full})); }}")
        SW_ASK = """(msg) => new Promise(res => { const ch = new MessageChannel(); ch.port1.onmessage = e => res(e.data);
            navigator.serviceWorker.controller.postMessage(msg, [ch.port2]); })"""
        def settle():  # wait until the worker has finished its queued jobs (e.g. the launch check)
            page.wait_for_selector(".mcard")
            page.wait_for_function("!!navigator.serviceWorker.controller")
            page.evaluate(SW_ASK, {"type": "warm", "urls": []})
        def mark():
            page.evaluate("window.__mark = 1")
        def marked():
            return page.evaluate("window.__mark === 1")
        def listname():
            page.wait_for_selector(".mcard")
            return page.locator(".listname").inner_text()
        def wait_cached(n, timeout=20):
            end = time.time() + timeout
            while time.time() < end:
                c = page.evaluate(CACHED)
                if len(c["urls"]) >= n:
                    return c
                time.sleep(0.3)
            return page.evaluate(CACHED)

        # ---- first visit online: worker installs, takes over, and saves everything
        page.goto(URL)
        check("menu shows 23 cards", page.locator(".mcard").count() == 23)
        want = expected_urls()
        c = wait_cached(len(want) - 1)  # (+1 for "./" vs index.html both cached; "" is the directory URL)
        missing = [u for u in want if u not in c["urls"]]
        check("worker controls the page", page.evaluate("!!navigator.serviceWorker.controller"))
        check("offline copy has every js/css/audio/dict/icon file", not missing, ", ".join(missing[:6]))
        check("one complete cache generation", len(c["names"]) == 1, str(c["names"]))
        check("manifest linked", page.evaluate("!!document.querySelector('link[rel=manifest]')"))
        mf = page.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
        check("manifest: standalone, scoped to /pes3/, 192+512 icons",
              mf["display"] == "standalone" and mf["scope"] == "./" and {i["sizes"] for i in mf["icons"]} == {"192x192", "512x512"}, str(mf))
        gen0 = c["live"]

        # ---- offline: opens from the saved copy, every game opens, no errors from the check
        stop()
        page.reload()
        check("offline: menu loads", page.locator(".mcard").count() == 23)
        check("offline: last list shown", "Week of Oct 26" in listname(), listname())
        names = page.locator(".mcard .name").all_inner_texts()
        failed = []
        for i, name in enumerate(names):
            page.locator(".mcard").nth(i).tap()
            time.sleep(0.25)
            if page.locator("#app .game").count() != 1:
                failed.append(name)
            page.locator("#back").click()
            page.wait_for_selector(".mcard")
        check("offline: all 23 games open", not failed, ", ".join(failed))
        page.locator(".mcard", has_text="Baffle").first.tap()
        page.wait_for_selector(".bf-tile")
        ready = page.evaluate("async () => { const d = await import('./js/dictionary.js'); await d.loadDictionary(); return d.dictionaryReady() && d.inDictionary('cat'); }")
        check("offline: Baffle board + dictionary from the saved copy", page.locator(".bf-tile").count() == 25 and ready)
        page.locator("#back").click()
        rng = page.evaluate("""async () => { const r = await fetch('audio/puppy.m4a', { headers: { Range: 'bytes=0-9' } });
            return { s: r.status, n: (await r.arrayBuffer()).byteLength, cr: r.headers.get('Content-Range') }; }""")
        check("offline: recordings answer byte-range requests (206)", rng["s"] == 206 and rng["n"] == 10 and rng["cr"].startswith("bytes 0-9/"), str(rng))
        mark()
        r = off("o.checkForUpdates(false)")
        r2 = off("o.checkForUpdates(true)")
        check("offline: update check fails quietly, no reload", marked() and not (r or {}).get("updated") and not (r2 or {}).get("updated"), f"{r} {r2}")
        page.screenshot(path=f"{SHOTS}/sw_offline.png")

        # ---- a deploy that changes nothing here (push elsewhere on the site): no reload, new ETags remembered
        start()
        deploy()
        mark()
        r = off("o.checkForUpdates(false)")
        check("no-change deploy: probe finds nothing to update", r == {"updated": False} and marked(), str(r))
        tag_cached = page.evaluate(f"async () => (await (await caches.open('{gen0}')).match('js/app.js')).headers.get('etag')")
        tag_server = page.evaluate("fetch('http://localhost:%d/pes3/js/app.js?x', { method: 'HEAD' }).then(r => r.headers.get('etag'))" % PORT)
        check("no-change deploy: app.js's new ETag stored in place", tag_cached == tag_server, f"{tag_cached} vs {tag_server}")
        check("no-change deploy: same cache generation", page.evaluate(CACHED)["live"] == gen0)

        # ---- weekly list pushed while on the home menu: coming back to the app reloads with the new list
        fixture = (APP / "words.txt").read_text()
        deploy({"words.txt": fixture.replace("Week of Oct 26", "Week of Nov 2") + "\nrainbow\n"})
        mark()
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_function("!window.__mark && document.querySelector('.listname') && document.querySelector('.listname').textContent.includes('Nov 2')", timeout=15000)
        check("new list on the menu after return to the app", "Nov 2" in listname())
        c = page.evaluate(CACHED)
        check("old cache generation removed after the swap", len(c["names"]) == 1 and c["live"] != gen0, str(c["names"]))

        # ---- list pushed during a game: the game is never reset; the update waits for Home
        page.locator(".mcard", has_text="Word Jumble").first.tap()
        page.wait_for_selector(".tray .tile")
        mark()
        deploy({"words.txt": fixture.replace("Week of Oct 26", "Week of Nov 9")})
        r = off("o.checkForUpdates(false)")
        time.sleep(1)
        check("mid-game: update found", (r or {}).get("updated") is True, str(r))
        check("mid-game: game not reset", marked() and page.locator(".tray .tile").count() > 0 and page.locator("#back").is_visible())
        page.locator("#back").click()
        page.wait_for_function("!window.__mark && document.querySelector('.listname') && document.querySelector('.listname').textContent.includes('Nov 9')", timeout=15000)
        check("mid-game: Home loads the new list", "Nov 9" in listname())

        # ---- a deploy lands in the middle of a check: no mixed old/new files are left behind
        settle()
        simon0 = (APP / "js/games/simon.js").read_text()
        app0 = (APP / "js/app.js").read_text()
        deploy({"js/app.js": "// A\n" + app0, "js/games/simon.js": simon0 + "\n// A\n"})
        SLOW["/pes3/js/games/simon.js"] = 1.5
        threading.Timer(0.5, deploy, args=[{"js/app.js": "// B\n" + app0, "js/games/simon.js": simon0 + "\n// B\n"}]).start()
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        SLOW.clear()
        a_txt = page.evaluate("fetch('js/app.js').then(r => r.text())")
        s_txt = page.evaluate("fetch('js/games/simon.js').then(r => r.text())")
        check("deploy during a check: ends with one consistent version", r == {"updated": True} and a_txt.startswith("// B") and s_txt.rstrip().endswith("// B"),
              f"{r} app={a_txt[:5]!r} simon={s_txt.rstrip()[-5:]!r}")
        page.reload()
        settle()

        # ---- code-only change (bug fix in one game) and a brand-new module, then offline again
        simon = (APP / "js/games/simon.js").read_text()
        appjs = (APP / "js/app.js").read_text()
        deploy({
            "js/games/simon.js": simon + "\n// fixed v2\n",
            "js/games/newgame.js": "window.__newgame = 1;\nexport {};\n",
            "js/app.js": "import './games/newgame.js';\n" + appjs,
        })
        mark()
        kick()
        page.wait_for_function("!window.__mark && window.__newgame === 1", timeout=15000)
        txt = page.evaluate("fetch('js/games/simon.js').then(r => r.text())")
        check("code fix reaches the app (served from the new copy)", txt.rstrip().endswith("// fixed v2"))
        check("new game module loaded after the update", page.evaluate("window.__newgame === 1"))
        stop()
        page.reload()
        page.wait_for_selector(".mcard")
        check("offline after the update: new module still loads", page.evaluate("window.__newgame === 1"))
        start()

        # ---- parent panel: status, Check for updates, Reset offline copy (keeps localStorage)
        page.evaluate("localStorage.setItem('spelling-games.garden.v1', JSON.stringify({ points: 7 }))")
        page.keyboard.type("parent")
        page.wait_for_selector(".panel")
        page.wait_for_function("document.querySelector('.offline-status').textContent.includes('files')", timeout=5000)
        st = page.locator(".offline-status").inner_text()
        check("parent: App updates section with offline status", page.locator(".panel h3", has_text="App updates").count() == 1 and "Offline copy:" in st, st)
        page.screenshot(path=f"{SHOTS}/sw_parent.png")
        mark()
        page.locator(".panel button", has_text="Check for updates").click()
        page.wait_for_function("!window.__mark", timeout=15000)
        page.wait_for_selector(".mcard")
        check("parent: Check for updates reloads the app", True)
        gen1 = page.evaluate(CACHED)["live"]
        page.keyboard.type("parent")
        page.wait_for_selector(".panel")
        page.once("dialog", lambda d: d.accept())
        mark()
        page.locator(".panel button", has_text="Reset offline copy").click()
        page.wait_for_function("!window.__mark", timeout=15000)
        page.wait_for_selector(".mcard")
        c = wait_cached(len(want))
        check("parent: Reset makes a fresh offline copy", c["live"] and c["live"] != gen1 and len(c["urls"]) >= len(want), f"{gen1} -> {c['live']}")
        check("parent: Reset keeps the garden (localStorage)", page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')).points") == 7)
        b.close()
finally:
    try:
        stop()
    except Exception:
        pass
    shutil.rmtree(ROOT, ignore_errors=True)

check("no console/page errors", not errors, "; ".join(errors[:5]))
fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
