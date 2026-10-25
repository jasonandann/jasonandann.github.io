"""Content-Security-Policy (index.html <meta>, tools/csp.py): hashes current, policy enforced, no game trips it."""
import importlib.util
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8784
URL = f"http://localhost:{PORT}/"
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")

FAKE_TTS = """
window.__spoken = [];
const fake = { speak(u){ window.__spoken.push(u.text); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
"""
# every CSP violation the page reports (the browser fires this event on the document)
WATCH = """
window.__csp = [];
document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || e.sample || '')));
"""

spec = importlib.util.spec_from_file_location("csp", os.path.join(SITE, "tools", "csp.py"))
csp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(csp)

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

# ---- the file itself (no browser)
html = Path(SITE, "index.html").read_text(encoding="utf-8")
r = subprocess.run([sys.executable, os.path.join(SITE, "tools", "csp.py"), "--check"], capture_output=True, text=True)
check("csp.py --check: tag is current", r.returncode == 0, r.stdout.strip())
check("two inline scripts are hashed (redirect + watchdog)", len(csp.inline_hashes(html)) == 2, str(len(csp.inline_hashes(html))))
meta = html.find('http-equiv="Content-Security-Policy"')
check("policy meta comes before the first <script>", 0 < meta < html.find("<script"))
edited = html.replace("// https only", "// HTTPS only", 1)
check("editing an inline script makes the tag stale", edited != html and csp.with_tag(edited) != edited)
check("csp.py is idempotent", csp.with_tag(csp.with_tag(html)) == csp.with_tag(html))
check("policy has no unsafe-inline / unsafe-eval", "unsafe-" not in csp.policy(html))

# ---- in a browser
server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", SITE],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        def new_page(index_html=None):
            ctx = b.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, service_workers="block")
            ctx.add_init_script(FAKE_TTS)
            ctx.add_init_script(WATCH)
            ctx.route(URL + "words.txt", lambda r: r.fulfill(path=FIXTURE))
            if index_html is not None:
                ctx.route(URL, lambda r: r.fulfill(body=index_html, content_type="text/html"))
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            return ctx, pg

        # 1. the real page: starts, and every menu card opens without a violation
        ctx, page = new_page()
        page.goto(URL)
        page.wait_for_selector(".mcard")
        check("app starts under the policy (watchdog flag set)", page.evaluate("window.__started === true"))
        n = page.locator(".mcard").count()
        check("menu has cards to open", n >= 20, str(n))
        for i in range(n):
            page.locator(".mcard").nth(i).evaluate("e => e.click()")
            page.wait_for_timeout(250)
            page.evaluate("document.querySelector('#back').click()")
            page.wait_for_selector(".mcard")
        check("opening all %d games causes no CSP violation" % n, page.evaluate("window.__csp.length") == 0,
              "; ".join(page.evaluate("window.__csp")[:5]))

        # 2. an injected inline script is refused
        page.evaluate("""() => { const s = document.createElement('script');
                                 s.textContent = 'window.__injected = 1'; document.body.appendChild(s); }""")
        page.wait_for_timeout(200)
        check("injected inline script does not run", page.evaluate("window.__injected === undefined"))
        check("... and is reported as a violation", any(v.startswith("script-src") for v in page.evaluate("window.__csp")))
        page.evaluate("window.__csp.length = 0")
        # an inline event handler injected as markup is refused too
        page.evaluate("""() => { const d = document.createElement('div');
                                 d.innerHTML = '<img src=x onerror="window.__img = 1">'; document.body.appendChild(d); }""")
        page.wait_for_timeout(300)
        check("injected onerror handler does not run", page.evaluate("window.__img === undefined"))
        ctx.close()

        # 3. a changed inline script without a new hash is refused (what the test above guards against)
        broken = html.replace("// https only", "// HTTPS only", 1)
        ctx, page = new_page(broken)
        page.goto(URL)
        page.wait_for_timeout(500)
        check("an inline script whose hash is stale is blocked", any(v.startswith("script-src") for v in page.evaluate("window.__csp")))
        ctx.close()
        b.close()
finally:
    server.terminate()

check("no page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
