"""Tests for the two-device link spike (js/net.js + net-test.html).

Two browser contexts stand in for two devices (separate storage, so BroadcastChannel can't cross between them).
No STUN (?stun=none): the sandbox has no internet, and on one machine host candidates are enough. Chromium's
mDNS hiding of local addresses is switched off so those host candidates resolve.

Run from the repo root:   python3 tests/net_test.py
Needs: pip install playwright && playwright install chromium
"""
import os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8781
URL = f"http://localhost:{PORT}/net-test.html?stun=none"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)

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
        b = p.chromium.launch(args=["--disable-features=WebRtcHideLocalIpsWithMdns"])

        def device():
            ctx = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True, service_workers="block")
            return ctx
        def watch(page, who):
            page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
            page.on("console", lambda m: errors.append(f"{who} console.{m.type}: {m.text}") if m.type == "error" and "favicon" not in m.text and "pes-logo" not in m.text else None)
            return page
        def net(page, key): return page.evaluate(f"window.__net && window.__net[{key!r}]")
        def wait_net(page, key, timeout=15000):
            page.wait_for_function(f"window.__net && window.__net[{key!r}]", timeout=timeout)
            return net(page, key)

        # ---- codec: round trip, garbage, a crafted link that inflates hugely
        A = device(); a = watch(A.new_page(), "A")
        a.goto(URL); a.wait_for_selector("#invite")
        codec = a.evaluate("""async () => {
          const n = await import('./js/net.js');
          const obj = {v: 1, kind: 'offer', id: 'abc', sdp: 'v=0\\r\\n' + 'a=x\\r\\n'.repeat(50)};
          const code = await n.encode(obj);
          const back = await n.decode(code);
          const viaLink = await n.decode(n.linkFor('offer', code, 'https://x.test/p'));
          const bad = async (c) => { try { await n.decode(c); return 'accepted'; } catch (e) { return e.message; } };
          // ~1 MB of spaces deflates to a short code: decode must stop at its size limit
          const big = new TextEncoder().encode(JSON.stringify({v: 1, kind: 'offer', id: 'x', sdp: ' '.repeat(1 << 20)}));
          const zs = new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'));
          const zb = new Uint8Array(await new Response(zs).arrayBuffer());
          const bomb = 'z' + btoa(String.fromCharCode(...zb)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
          return { same: JSON.stringify(back) === JSON.stringify(obj), viaLink: viaLink.id === 'abc', prefix: code[0],
                   len: code.length, garbage: await bad('hello'), wrongShape: await bad(await n.encode({v: 2})),
                   bomb: await bad(bomb), bombLen: bomb.length, cut: await bad(code.slice(0, code.length - 7)),
                   hash: n.fromHash('#o=zAbC_-'), hashBad: n.fromHash('#o=a b') };
        }""")
        check("codec: decode(encode(x)) == x", codec["same"])
        check("codec: compressed ('z' prefix)", codec["prefix"] == "z", codec["prefix"])
        check("codec: a whole pasted link decodes too", codec["viaLink"])
        check("codec: garbage is refused", codec["garbage"] == "not a game code", codec["garbage"])
        check("codec: wrong shape is refused", codec["wrongShape"] == "not a game code", codec["wrongShape"])
        check("codec: a short link that inflates to 1 MB is refused", codec["bomb"] == "code too large" and codec["bombLen"] < 8000, f"{codec['bomb']} len={codec['bombLen']}")
        check("codec: a code cut short gets a friendly message", codec["cut"].startswith("not a game code"), codec["cut"])
        check("fromHash: reads #o=, refuses junk", codec["hash"] == {"kind": "offer", "code": "zAbC_-"} and codec["hashBad"] is None, str(codec["hash"]))

        # ---- full flow with the reply link: A invites, B joins, A opens B's reply in a new tab
        a.tap("#invite")
        link = wait_net(a, "link")
        check("A: invite link made", link.startswith(f"http://localhost:{PORT}/net-test.html?stun=none#o=z"), link[:80])
        check("A: invite link is text-message sized (< 2000 chars)", len(link) < 2000, str(len(link)))
        check("A: hash removed after reading (reload won't reuse a code)", "#" not in a.url, a.url)
        a.screenshot(path=os.path.join(SHOTS, "net-a-invite.png"))

        B = device(); bp = watch(B.new_page(), "B")
        bp.goto(link); bp.wait_for_selector("#joinBtn")
        check("B: sees the invitation", "Invitation" in bp.locator("#status").inner_text())
        check("B: hash removed after reading", "#" not in bp.url, bp.url)
        bp.tap("#joinBtn")
        reply = wait_net(bp, "link")
        check("B: reply link made", "#a=z" in reply, reply[:80])
        bp.screenshot(path=os.path.join(SHOTS, "net-b-reply.png"))

        a2 = watch(A.new_page(), "A2")
        a2.goto(reply)
        a2.wait_for_function("window.__net && window.__net.delivered !== undefined", timeout=5000)
        check("A2: reply handed to the waiting tab", net(a2, "delivered") is True)
        check("A2: tells her to switch back", "Go back" in a2.locator("#status").inner_text())

        wait_net(a, "connected"); wait_net(bp, "connected")
        check("A: connected", a.locator("#status").inner_text().startswith("Connected"))
        check("B: connected", bp.locator("#status").inner_text().startswith("Connected"))
        a.fill("#msg", "hi grandma"); a.tap("#say")
        bp.wait_for_function("window.__net.received.length > 0", timeout=5000)
        check("A -> B message arrives", net(bp, "received") == ["hi grandma"], str(net(bp, "received")))
        bp.fill("#msg", "hello!"); bp.press("#msg", "Enter")
        a.wait_for_function("window.__net.received.length > 0", timeout=5000)
        check("B -> A message arrives (Enter sends)", net(a, "received") == ["hello!"], str(net(a, "received")))
        check("chat text shown as text, not HTML", a.locator("#chat p").last.inner_text() == "Them: hello!")
        pair = wait_net(a, "pair")
        check("A: report names the path (host -> host on one machine)", pair and pair.get("local") == "host" and pair.get("remote") in ("host", "prflx"), str(pair))
        rtt = wait_net(a, "rtt", timeout=20000)
        check("A: round-trip time measured", rtt is not None and rtt < 1000, str(rtt))
        log = a.locator("#log").inner_text()
        gather_ms = int(log.split("after ")[1].split(" ms")[0])
        check("A: gathering stops within ~2 s even when the browser never says complete", gather_ms < 2500, str(gather_ms))
        check("A: report has role, gathering, link age at reply", "role: host (A)" in log and "gathering ended" in log and "when the link was" in log, log[:300])
        a.screenshot(path=os.path.join(SHOTS, "net-a-live.png"))

        # ---- a second reply to the same invitation is refused
        msg = a.evaluate("async (c) => { try { await (await import('./js/net.js')).decode(c); } catch (e) { return e.message; } return 'ok'; }", net(bp, "answerCode"))
        check("answer code still decodes (sanity)", msg == "ok", msg)
        a.evaluate("c => window.__net.paste(c)", net(bp, "answerCode"))
        time.sleep(0.3)
        check("A: second reply ignored once connected", a.locator("#status").inner_text().startswith("Connected"))

        # ---- paste flow + wrong-invitation reply, on fresh pages
        old_answer = net(bp, "answerCode")
        a3 = watch(A.new_page(), "A3"); a3.goto(URL); a3.tap("#invite"); link3 = wait_net(a3, "link")
        a3.fill("#reply", old_answer); a3.tap("#connect"); time.sleep(0.3)
        check("A3: a reply for a different invitation is refused", "different invitation" in a3.locator("#status").inner_text(), a3.locator("#status").inner_text())
        b3 = watch(B.new_page(), "B3"); b3.goto(link3); b3.tap("#joinBtn"); reply3 = wait_net(b3, "link")
        a3.fill("#reply", reply3); a3.tap("#connect")  # the whole link pasted, as from Messages
        wait_net(a3, "connected"); wait_net(b3, "connected")
        check("paste flow: both connected", True)

        # ---- reply opened where no tab is waiting (e.g. Safari vs Home Screen app): shows a code to paste
        C = device(); c = watch(C.new_page(), "C")
        c.goto(reply3); c.wait_for_function("window.__net && window.__net.delivered !== undefined", timeout=5000)
        check("no waiting tab: delivered = false", net(c, "delivered") is False)
        check("no waiting tab: shows the code to copy", c.locator("#link").input_value() == net(b3, "answerCode") and c.locator("#send").inner_text() == "Copy code")
        c.screenshot(path=os.path.join(SHOTS, "net-c-fallback.png"))

        # ---- a reply code pasted as the invitation is refused politely
        d = watch(B.new_page(), "D"); d.goto(f"http://localhost:{PORT}/net-test.html?stun=none#o={net(b3, 'answerCode')}")
        d.tap("#joinBtn"); time.sleep(0.3)
        check("reply code used as invitation: polite refusal", "reply code, not an invitation" in d.locator("#status").inner_text(), d.locator("#status").inner_text())
        b.close()
finally:
    server.terminate()

check("no console/page errors", not errors, "; ".join(errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
