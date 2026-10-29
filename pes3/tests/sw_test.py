"""Offline copy + update checks (issue #13): sw.js and js/offline.js.

Serves a temporary copy of the site laid out like the real one (/pes3/, /images/) from a server that
mimics a static host: ETag = "<hex mtime>-<hex size>", 304 on If-None-Match, Cache-Control max-age=600 (the app
must not depend on them: one section serves no ETags at all), plus /pes3/version.json built from the files
(tools/make_manifest.py), which the tests can take away, break or freeze (MAN). A "deploy" rewrites files and
re-stamps every file's mtime. "Offline" = server stopped.
"""
import io, json, os, shutil, sys, tempfile, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SITE / "tools"))
from make_manifest import build as build_manifest, dumps as dump_manifest
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
shutil.copytree(SITE, APP, ignore=shutil.ignore_patterns("tests", "tools", "review", "__pycache__", ".*", "version.json"))
shutil.copy(SITE / "tests" / "fixtures" / "words.txt", APP / "words.txt")
(ROOT / "images").mkdir()
shutil.copy(SITE.parent / "images" / "pes-logo.png", ROOT / "images" / "pes-logo.png")

stamp = [1_790_000_000]
def deploy(changes=None):
    """Write changed files, then give every file a new mtime (= new ETag), like a GitHub Pages deploy.
    Each changed file appears whole and already stamped (written aside, then renamed in): a request that lands
    mid-write once got an empty file with a real-clock Last-Modified, later than every fake stamp, so the test
    server answered If-Modified-Since with 304 from then on and every check stayed 'mixed'."""
    stamp[0] += 100
    for rel, text in (changes or {}).items():
        tmp = APP / (rel + ".deploying")
        tmp.write_text(text)
        os.utime(tmp, (stamp[0], stamp[0]))
        os.replace(tmp, APP / rel)
    for p in ROOT.rglob("*"):
        if p.is_file():
            os.utime(p, (stamp[0], stamp[0]))
deploy()

SLOW = {}  # path -> seconds to wait before answering (lets a "deploy" land in the middle of a check)
ETAGS = {"mode": "pages"}  # "pages" = "<hex mtime>-<hex size>"; "none" = no ETag or Cache-Control header at all
MAN = {"mode": "live", "frozen": b""}  # version.json: "live" = built from the files now, "off" = 404, "bad" = not JSON, "frozen" = an old copy
STALE = {}  # path -> (bytes, etag): keep serving an old copy, like a CDN server that missed the purge
BROKEN = set()  # paths whose requests get no response at all (connection closed): a failed fetch while online

def frozen(rel):
    """The file as it is now (bytes + Pages-style ETag), to keep serving after the next deploy."""
    f = APP / rel
    st = f.stat()
    return f.read_bytes(), f'"{int(st.st_mtime):x}-{st.st_size:x}"'

class Pages(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a):
        pass
    def send_head(self):
        if self.command == "GET":  # only downloads are slow, so the HEAD probes around a round stay quick
            time.sleep(SLOW.get(self.path.split("?")[0], 0))
        self._etag = None
        if self.path.split("?")[0] == "/pes3/version.json" and MAN["mode"] != "off":
            body = {"live": lambda: dump_manifest(build_manifest(APP)).encode(), "bad": lambda: b"<html>not json</html>",
                    "frozen": lambda: MAN["frozen"]}[MAN["mode"]]()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return io.BytesIO(body)
        if self.path.split("?")[0] in BROKEN:
            self.close_connection = True
            return None
        if self.path.split("?")[0] in STALE:
            body, self._etag = STALE[self.path.split("?")[0]]
            if self.headers.get("If-None-Match", "").replace("W/", "") == self._etag:
                self.send_response(304)
                self.end_headers()
                return None
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(self.path.split("?")[0]))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return io.BytesIO(body)
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, "index.html")
        if os.path.isfile(path):
            st = os.stat(path)
            if ETAGS["mode"] == "none":
                self._etag = None
            else:
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
        def launch_checked(timeout=20):  # the page's own check after this load has finished (it is posted after settle()'s warm)
            end = time.time() + timeout
            while time.time() < end:
                try:
                    if page.evaluate("async () => { const s = await (await import('./js/offline.js')).offlineStatus(); return !!(s && s.last && s.last.at > performance.timeOrigin); }"):
                        return True
                except Exception:
                    pass  # the page reloaded under us
                time.sleep(0.2)
            return False
        def hold():  # sit in a game, so an update announced by the worker waits for Home instead of reloading
            page.locator(".mcard", has_text="See the Words").first.tap()
            page.wait_for_selector("#back:not([hidden])")
        def relaunch():  # a launch opens start_url (no #game), unlike a plain reload, which keeps a deep link
            page.evaluate("location.hash && history.replaceState(null, '', location.pathname)")
            page.reload()
        def unlock(pin="1234"):
            # grown-ups passcode (issue #32; tests/parent_test.py): set it the first time, else type it
            page.wait_for_selector(".overlay .pin-pad, .overlay h2:has-text('Grown-ups only')")
            if page.locator(".overlay .pin-pad").count():
                setup = page.locator(".overlay h2", has_text="Set a").count() == 1
                page.keyboard.type(pin); page.keyboard.press("Enter")
                if setup:
                    page.keyboard.type(pin); page.keyboard.press("Enter")
                    page.locator(".overlay [data-act='saved']").first.tap()
            page.wait_for_selector(".overlay h2:has-text('Grown-ups only')")
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
        check("menu shows 29 cards", page.locator(".mcard").count() == 29)
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
        settle()  # the launch check also fetches what the first copy lacks and remembers version.json: let it finish before going offline

        # ---- offline: opens from the saved copy, every game opens, no errors from the check
        stop()
        relaunch()
        check("offline: menu loads", page.locator(".mcard").count() == 29)
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
        check("offline: all 28 games open", not failed, ", ".join(failed))
        page.locator(".mcard", has_text="Baffle").first.tap()
        page.wait_for_selector(".bf-tile")
        ready = page.evaluate("async () => { const d = await import('./js/dictionary.js'); await d.loadDictionary(); return d.dictionaryReady() && d.inDictionary('cat'); }")
        check("offline: Baffle board + dictionary from the saved copy", page.locator(".bf-tile").count() == 25 and ready)
        page.locator("#back").click()
        page.locator(".mcard", has_text="Guess What").first.tap()
        page.wait_for_selector(".gw-start", timeout=10000)
        check("offline: Guess What gets its word sounds from the saved copy", page.locator(".gw-start").count() == 1)
        page.locator("#back").click()
        rng = page.evaluate("""async () => { const r = await fetch('audio/puppy.m4a', { headers: { Range: 'bytes=0-9' } });
            return { s: r.status, n: (await r.arrayBuffer()).byteLength, cr: r.headers.get('Content-Range') }; }""")
        check("offline: recordings answer byte-range requests (206)", rng["s"] == 206 and rng["n"] == 10 and rng["cr"].startswith("bytes 0-9/"), str(rng))
        mark()
        ctx.set_offline(True)  # navigator.onLine = false, as on a device with no network
        r = off("o.checkForUpdates(false)")
        r2 = off("o.checkForUpdates(true)")
        check("offline: update check fails quietly, no reload", marked() and (r or {}).get("result") == "offline" and (r2 or {}).get("result") == "offline", f"{r} {r2}")
        page.keyboard.type("parent"); unlock()
        page.wait_for_function("document.querySelector('.offline-status') && document.querySelector('.offline-status').textContent.includes('Last check')", timeout=5000)
        st = page.locator(".offline-status").inner_text()
        check("offline: parent panel says no internet", "no internet" in st and "couldn" not in st, st)
        page.screenshot(path=f"{SHOTS}/sw_offline.png")
        page.keyboard.press("Escape")
        ctx.set_offline(False)
        # Server down but the browser thinks it is online (wifi without internet): not "no internet", but "couldn't finish"
        r = off("o.checkForUpdates(true)")
        check("server unreachable while online: result 'error' with the URL", (r or {}).get("result") == "error" and URL in (r or {}).get("error", ""), str(r))

        # ---- a deploy that changes nothing here (push elsewhere on the site): no reload, new ETags remembered
        start()
        deploy()
        mark()
        r0 = off("o.checkForUpdates(false)")  # every file has a new time stamp, but the manifest (content hashes) is the same
        r = off("o.checkForUpdates(true)")
        check("no-change deploy: quick probe sees nothing, full compare finds nothing to update",
              r0 == {"updated": False, "result": "quiet"} and r == {"updated": False, "result": "same"} and marked(), f"{r0} {r}")
        man_cached = page.evaluate(f"async () => (await (await caches.open('{gen0}')).match('__manifest__')).json().then(m => m.v)")
        man_server = page.evaluate("fetch('version.json').then(r => r.json()).then(m => m.v)")
        check("no-change deploy: the site's version (version.json) is remembered with the copy", man_cached == man_server, f"{man_cached} vs {man_server}")
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
        # The reload above runs a full check on launch (which may swap and reload again). Wait until a check after the
        # latest load finds nothing new: otherwise a check still running can pick up the next deploy itself and leave
        # the mid-game check nothing to find (a race that more files to compare made likely).
        settled, t0 = False, time.time()
        while not settled and time.time() - t0 < 30:
            try: settled = page.evaluate("async () => { const s = await (await import('./js/offline.js')).offlineStatus(); return !!(s && s.last && s.last.at > performance.timeOrigin && s.last.result === 'same'); }")
            except Exception: pass  # the page reloaded under us
            if not settled: time.sleep(0.2)
        page.wait_for_selector(".mcard")
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

        # ---- a deploy lands in the middle of a check, whichever file arrives late: never a mixed copy
        def race(slow):
            settle()
            hold()
            simon0 = (APP / "js/games/simon.js").read_text()
            app0 = (APP / "js/app.js").read_text()
            deploy({"js/app.js": "// A\n" + app0, "js/games/simon.js": simon0 + "\n// A\n"})
            SLOW["/pes3/" + slow] = 1.5
            threading.Timer(0.5, deploy, args=[{"js/app.js": "// B\n" + app0, "js/games/simon.js": simon0 + "\n// B\n"}]).start()
            r = page.evaluate(SW_ASK, {"type": "check", "full": True})
            SLOW.clear()
            a_txt = page.evaluate("fetch('js/app.js').then(r => r.text())")
            s_txt = page.evaluate("fetch('js/games/simon.js').then(r => r.text())")
            # (a check the worker started by itself, e.g. after a file was fetched on first use, may have swapped B in first:
            # then ours finds nothing left to do. Either way the copy in use must be one version.)
            check(f"deploy during a check ({slow} late): one consistent version", r.get("result") in ("swapped", "same") and a_txt.startswith("// B") and s_txt.rstrip().endswith("// B"),
                  f"{r} app={a_txt[:5]!r} simon={s_txt.rstrip()[-5:]!r}")
            deploy({"js/app.js": app0, "js/games/simon.js": simon0})
            page.evaluate(SW_ASK, {"type": "check", "full": True})
            relaunch()
        race("js/games/simon.js")
        race("js/app.js")

        # ---- a CDN server keeps sending an old copy of one file after a deploy: keep the current copy, then catch up
        settle()
        hold()
        app0 = (APP / "js/app.js").read_text()
        simon0 = (APP / "js/games/simon.js").read_text()
        STALE["/pes3/js/games/simon.js"] = frozen("js/games/simon.js")
        deploy({"js/app.js": "// C\n" + app0, "js/games/simon.js": simon0 + "\n// C\n"})
        t0 = time.time()
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        a_txt = page.evaluate("fetch('js/app.js').then(r => r.text())")
        check("stale CDN file: set is mixed, current copy kept", r == {"updated": False, "result": "mixed"} and not a_txt.startswith("// C"), f"{r} {a_txt[:5]!r}")
        check("stale CDN file: retried before giving up (~9 s of waits)", time.time() - t0 > 8, f"{time.time() - t0:.1f} s")
        lastf = page.evaluate(SW_ASK, {"type": "status"})["last"]
        check("stale CDN file: the panel's status names the file that doesn't match version.json", lastf.get("files") == ["js/games/simon.js"], str(lastf))
        STALE.clear()
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        s_txt = page.evaluate("fetch('js/games/simon.js').then(r => r.text())")
        check("stale CDN file: once the CDN catches up, the new copy goes in", r.get("updated") is True and s_txt.rstrip().endswith("// C"), str(r))
        deploy({"js/app.js": app0, "js/games/simon.js": simon0})
        page.evaluate(SW_ASK, {"type": "check", "full": True})
        relaunch()
        settle()

        # ---- one file's request fails while online (issue #24): 'error' naming the file, current copy kept, panel says so
        before_list = listname()
        simon_txt0 = (APP / "js/games/simon.js").read_text()
        BROKEN.add("/pes3/js/games/simon.js")
        deploy({"words.txt": fixture.replace("Week of Oct 26", "Week of Broken"), "js/games/simon.js": simon_txt0 + "\n// broken-test\n"})
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        check("broken file: result 'error' naming the file, no update", r.get("result") == "error" and r.get("updated") is False
              and "js/games/simon.js" in r.get("error", ""), str(r))
        words_now = page.evaluate("fetch('words.txt').then(r => r.text())")
        check("broken file: current copy kept", "Week of Broken" not in words_now and listname() == before_list, words_now[:30])
        st = page.evaluate(SW_ASK, {"type": "status"})["last"]
        check("broken file: status().last carries the error", st["result"] == "error" and "js/games/simon.js" in st.get("error", ""), str(st))
        page.keyboard.type("parent"); unlock()
        page.wait_for_function("document.querySelector('.offline-status') && document.querySelector('.offline-status').textContent.includes('Last check')", timeout=5000)
        st = page.locator(".offline-status").inner_text()
        check("broken file: parent panel says couldn't finish + the path", "couldn’t finish (" in st and "js/games/simon.js" in st and "no internet" not in st, st)
        page.screenshot(path=f"{SHOTS}/sw_check_error.png")
        page.keyboard.press("Escape")
        BROKEN.clear()
        deploy({"words.txt": fixture.replace("Week of Oct 26", "Week of Nov 9"), "js/games/simon.js": simon_txt0})
        page.evaluate(SW_ASK, {"type": "check", "full": True})
        relaunch()
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
        relaunch()
        page.wait_for_selector(".mcard")
        check("offline after the update: new module still loads", page.evaluate("window.__newgame === 1"))
        start()
        settle()

        SET_VS_MANIFEST = """async () => {
            const man = await (await fetch('version.json')).json();
            const k = await (async () => { for (const n of (await caches.keys()).filter(n => n.startsWith('pes3-c1-')).sort().reverse()) if (await (await caches.open(n)).match('__complete__')) return n; })();
            const c = await caches.open(k); const base = new URL('./', location.href).href; const bad = []; let n = 0;
            for (const r of await c.keys()) {
              const rel = r.url.startsWith(base) && !r.url.includes('?') ? (r.url.slice(base.length) || 'index.html') : null;
              if (!rel || !man.files[rel]) continue;
              const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await c.match(r)).arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
              n++; if (h !== man.files[rel]) bad.push(rel);
            }
            const mine = await (await c.match('__manifest__')).json();
            return { n, bad, same: mine.v === man.v }; }"""
        status = lambda: page.evaluate(SW_ASK, {"type": "status"})

        # ---- a file fetched outside a check (first use of a new file) makes the worker re-check the whole set
        deploy({"js/extra.js": "// extra\n"})
        before = status()["last"]["at"]
        page.evaluate("fetch('js/extra.js').then(r => r.text())")
        page.wait_for_function("1", timeout=1000)
        time.sleep(6)
        st = status()
        sv = page.evaluate(SET_VS_MANIFEST)
        check("runtime addition: worker re-checked the whole set by itself", st["last"]["at"] > before and st["last"]["full"], str(st["last"]))
        check("runtime addition: every file in the copy matches version.json, which is the one remembered", sv["n"] > 90 and not sv["bad"] and sv["same"], str(sv))

        # ---- a quick probe becomes a full check when the last full one is over 6 hours old
        page.evaluate("localStorage.setItem('spelling-games.offline.fullcheck', String(Date.now() - 7 * 3600 * 1000))")
        r1 = off("o.checkForUpdates(false)")
        r2 = off("o.checkForUpdates(false)")
        check("6 h rule: stale full check -> probe runs a full compare, next probe is quick", r1["result"] == "same" and r2["result"] == "quiet", f"{r1} {r2}")

        # ---- a script error after start asks for a full check (no reload unless something changed)
        before = status()["last"]["at"]
        mark()
        page.evaluate("window.dispatchEvent(new ErrorEvent('error', { message: 'test' }))")
        time.sleep(1.5)
        st = status()
        check("script error: triggers a full check, no reload", st["last"]["at"] > before and st["last"]["full"] and marked(), str(st["last"]))

        # ---- watchdog: a broken offline copy repairs itself (outside the app's modules)
        def break_copy(js):
            # Each scenario is a fresh breakage: forget the watchdog's "repaired less than a minute ago" guard.
            page.evaluate("sessionStorage.removeItem('pes3.watchdog')")
            page.evaluate("""async (js) => { const k = (await caches.keys()).filter(n => n.startsWith('pes3-c1-')).sort().pop();
                const c = await caches.open(k); const old = await c.match('js/app.js');
                await c.put('js/app.js', new Response(js, { headers: { 'Content-Type': 'text/javascript', 'ETag': old.headers.get('etag') } })); }""", js)
        app_now = (APP / "js/app.js").read_text()
        n_err = len(errors)
        break_copy("import { nope } from './util.js';\n" + app_now)
        relaunch()
        page.wait_for_function("window.__started === true && !!document.querySelector('.mcard')", timeout=20000)
        check("watchdog: copy with a missing import repairs itself and starts", page.locator(".mcard").count() == 29)
        broken_errs = errors[n_err:]
        del errors[n_err:]
        check("watchdog: (the broken load did raise the import error)", any("nope" in e for e in broken_errs), "; ".join(broken_errs[:2]))
        settle()
        break_copy("// does nothing\n")
        t0 = time.time()
        relaunch()
        page.wait_for_function("window.__started === true && !!document.querySelector('.mcard')", timeout=25000)
        check("watchdog: copy that never starts (no error) repairs itself after ~10 s", time.time() - t0 > 9, f"{time.time() - t0:.1f} s")
        settle()
        navs = []
        page.on("framenavigated", lambda f: navs.append(f.url) if f == page.main_frame else None)
        break_copy("// does nothing\n")
        stop()
        relaunch()
        time.sleep(13)
        check("watchdog offline: no reload loop", len(navs) == 1 and not page.evaluate("window.__started === true"), str(navs))
        start()
        relaunch()
        page.wait_for_function("window.__started === true && !!document.querySelector('.mcard')", timeout=25000)
        check("watchdog: back online, the next launch repairs it", page.locator(".mcard").count() == 29)
        settle()

        # ---- no ETag or Cache-Control headers at all: nothing depends on them
        ETAGS["mode"] = "none"
        hold()
        r = page.evaluate(SW_ASK, {"type": "check", "full": False})
        check("no ETags: quick probe sees nothing new", r == {"updated": False, "result": "quiet"}, str(r))
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        check("no ETags: full compare finds nothing new", r == {"updated": False, "result": "same"}, str(r))
        page.locator("#back").click()
        race("js/games/simon.js")
        race("js/app.js")
        ETAGS["mode"] = "pages"
        settle()

        # ---- no usable version.json (not built, or the host answered with a page): compare bytes, still one version at a time
        for mode, label in (("off", "missing"), ("bad", "not JSON")):
            MAN["mode"] = mode
            settle(); hold()
            r = page.evaluate(SW_ASK, {"type": "check", "full": False})
            check(f"version.json {label}: the quick probe can't tell, so every file is compared; nothing new",
                  r == {"updated": False, "result": "same", "note": "no-manifest"}, str(r))
            page.locator("#back").click()
        MAN["mode"] = "off"
        settle(); hold()
        simon = (APP / "js/games/simon.js").read_text()
        deploy({"js/games/simon.js": simon + "\n// nm\n"})
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        txt = page.evaluate("fetch('js/games/simon.js').then(r => r.text())")
        check("no version.json: a changed file is found and swapped in", r == {"updated": True, "result": "swapped", "note": "no-manifest"} and txt.rstrip().endswith("// nm"), f"{r} {txt[-12:]!r}")
        page.locator("#back").click()
        relaunch()
        race("js/games/simon.js")
        race("js/app.js")
        MAN["mode"] = "live"
        relaunch()
        settle()

        # ---- an old-layout copy (no remembered version.json) is brought up to date without a reload
        launch_checked()
        gen_before = page.evaluate(CACHED)["live"]
        page.evaluate("""async () => { const k = await (async () => { for (const n of (await caches.keys()).filter(n => n.startsWith('pes3-c1-')).sort().reverse()) if (await (await caches.open(n)).match('__complete__')) return n; })();
            await (await caches.open(k)).delete('__manifest__'); }""")
        r = page.evaluate(SW_ASK, {"type": "check", "full": False})
        sv = page.evaluate(SET_VS_MANIFEST)
        check("old copy without a remembered version.json: compared once, then remembered", r == {"updated": False, "result": "same"} and sv["same"] and not sv["bad"], f"{r} {sv}")

        # ---- a listed file the copy doesn't have (this week's recording, a new module) is fetched into it, no reload
        page.evaluate("""async () => { const k = await (async () => { for (const n of (await caches.keys()).filter(n => n.startsWith('pes3-c1-')).sort().reverse()) if (await (await caches.open(n)).match('__complete__')) return n; })();
            await (await caches.open(k)).delete('audio/puppy.m4a'); }""")
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        c = page.evaluate(CACHED)
        check("missing listed file: fetched into the copy in use, no new generation", r == {"updated": False, "result": "same"}
              and c["live"] == gen_before and any(u.endswith("audio/puppy.m4a") for u in c["urls"]), f"{r} {c['live']} vs {gen_before}")

        # ---- a version.json that is out of date (the build didn't run): found out at once, bytes decide, the panel says so
        settle(); hold()
        MAN["frozen"] = dump_manifest(build_manifest(APP)).encode()
        MAN["mode"] = "frozen"
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        check("out-of-date version.json, nothing deployed yet: copy and site agree", r == {"updated": False, "result": "same"}, str(r))
        app_now = (APP / "js/app.js").read_text()
        deploy({"js/app.js": app_now + "\n// stale\n"})
        t0 = time.time()
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        txt = page.evaluate("fetch('js/app.js').then(r => r.text())")
        check("out-of-date version.json: a changed canary file (app.js) still arrives, with no 9 s of retries",
              r == {"updated": True, "result": "swapped", "note": "stale-manifest"} and txt.rstrip().endswith("// stale") and time.time() - t0 < 8, f"{r} {time.time() - t0:.1f} s")
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        check("out-of-date version.json: the next check says the same, nothing new", r == {"updated": False, "result": "same", "note": "stale-manifest"}, str(r))
        page.locator("#back").click()
        page.wait_for_selector(".mcard")
        page.keyboard.type("parent"); unlock()
        page.wait_for_function("document.querySelector('.offline-status') && document.querySelector('.offline-status').textContent.includes('Last check')", timeout=5000)
        st = page.locator(".offline-status").inner_text()
        check("out-of-date version.json: the panel tells the grown-up to rebuild it", "version.json" in st and "out of date" in st, st)
        page.keyboard.press("Escape")
        MAN["mode"] = "live"
        r = page.evaluate(SW_ASK, {"type": "check", "full": True})
        check("version.json caught up: back to normal, no note", r == {"updated": False, "result": "same"}, str(r))
        relaunch()
        settle()

        # ---- parent panel: status, Check for updates, Reset offline copy (keeps localStorage)
        page.evaluate("localStorage.setItem('spelling-games.garden.v1', JSON.stringify({ points: 7 }))")
        page.keyboard.type("parent"); unlock()
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
        page.keyboard.type("parent"); unlock()
        page.wait_for_selector(".panel")
        page.once("dialog", lambda d: d.accept())
        mark()
        page.locator(".panel button", has_text="Reset offline copy").click()
        page.wait_for_function("!window.__mark", timeout=15000)
        page.wait_for_selector(".mcard")
        c = wait_cached(len(want))
        check("parent: Reset makes a fresh offline copy", c["live"] and c["live"] != gen1 and len(c["urls"]) >= len(want), f"{gen1} -> {c['live']}")
        check("parent: Reset keeps the garden (localStorage)", page.evaluate("JSON.parse(localStorage.getItem('spelling-games.garden.v1')).points") == 7)

        # ---- kill switch: tools/sw-off.js pushed as sw.js turns the offline copy off, without a reload loop
        settle()
        shutil.copy(SITE / "tools" / "sw-off.js", APP / "sw.js")
        deploy()
        page.evaluate("navigator.serviceWorker.getRegistration().then(r => r && r.update())")
        GONE = """async () => ({ caches: (await caches.keys()).filter(n => n.startsWith('pes3-')).length,
                                regs: (await navigator.serviceWorker.getRegistrations()).length })"""
        def wait_gone(timeout=15):
            end = time.time() + timeout
            while time.time() < end and page.evaluate(GONE) != {"caches": 0, "regs": 0}:
                time.sleep(0.3)
            return page.evaluate(GONE)
        g = wait_gone()
        check("kill switch: offline copy deleted and worker unregistered", g == {"caches": 0, "regs": 0}, str(g))
        for n in range(2):  # two launches: each registers the kill switch again, which removes itself again
            relaunch()
            page.wait_for_selector(".mcard")
            mark()
            time.sleep(4)
            g = wait_gone()
            check(f"kill switch launch {n + 1}: app works from the site, no reload, stays off",
                  marked() and page.locator(".mcard").count() == 29 and g == {"caches": 0, "regs": 0}, str(g))
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
