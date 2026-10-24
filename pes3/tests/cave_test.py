"""Tests for Crystal Cave (issue #61): the question layer, the rules, computer heroes, and whole games on screen
(team game to the end, save + continue, pass-and-play with help hand-offs, brave try, backing away).

Run from the repo root:   python3 tests/cave_test.py
Needs: pip install playwright && playwright install chromium
"""
import json, os, re, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = str(Path(__file__).resolve().parent.parent)
PORT = 8781
URL = f"http://localhost:{PORT}/"
SHOTS = os.path.join(tempfile.gettempdir(), "spelling-shots")
os.makedirs(SHOTS, exist_ok=True)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "words.txt")
LIST = [l.split("|")[0].strip() for l in open(FIXTURE) if l.strip() and not l.startswith("#")]

INIT = """
window.__heard = [];
const fake = { speak(u){ window.__heard.push(u.text); }, cancel(){}, getVoices(){ return []; }, onvoiceschanged: null };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
localStorage.setItem('spelling-games.cave.fast', '1');
"""

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def evalmath(text):
    a, op, b = re.match(r"\s*(\d+)\s*([+−×÷])\s*(\d+)", text).groups()
    a, b = int(a), int(b)
    return {"+": a + b, "−": a - b, "×": a * b, "÷": a // b}[op]

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
        def js(expr): return page.evaluate(expr)
        def state(): return js("document.querySelector('.game').__cave.state()")
        def gp(): return js("JSON.parse(localStorage.getItem('spelling-games.garden.v1')||'{\"pts\":0}').pts")
        def progress_words(): return js("Object.keys((JSON.parse(localStorage.getItem('spelling-games.progress.v1')||'{}').words)||{})")
        def bot(ok): js(f"document.querySelector('.game').__cave.botNext = {'true' if ok else 'false'}")
        def heard_word():
            t = js("window.__heard[window.__heard.length - 1] || ''")
            return t.split(".")[0].strip().lower()
        def type_answer(s):
            for ch in s: tap(f".ch-q .key:text-is('{ch}')")
            tap(".ch-q button:has-text('Check')")
        def answer(right=True):
            js("document.querySelector('.ch-q').dataset.mark = '1'")
            math = page.locator(".ch-q .bigword").count() > 0
            if right:
                type_answer(str(evalmath(page.locator(".ch-q .bigword").inner_text())) if math else heard_word())
            else:
                for _ in range(2):
                    if page.locator(".ch-q .key").count() == 0: break
                    type_answer("1" if math else "zq")
                if page.locator(".ch-q button:has-text('OK')").count(): tap(".ch-q button:has-text('OK')")
            try: page.wait_for_selector(".ch-q[data-mark] .kb", state="detached", timeout=5000)
            except Exception:
                print("ANSWER STUCK", right, js("window.__heard.slice(-3)"), page.locator(".cv-panel").inner_text()[:300].replace("\n", " / "))
                page.screenshot(path=f"{SHOTS}/cave_stuck.png"); raise
        def mutate(code):  # change the live game state (st) from the test
            js(f"(() => {{ const st = document.querySelector('.game').__cave.state(); {code} }})()")
        def open_cave():
            page.locator(".mcard", has_text="Crystal Cave").first.tap()
            page.wait_for_selector(".cv-setup")

        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.5)
        # Off by default while it's being tested (issue #33): no card, and a link to it opens the menu.
        check("off by default: 27 cards, no Crystal Cave", page.locator(".mcard").count() == 27 and page.locator(".mcard", has_text="Crystal Cave").count() == 0)
        page.goto(URL + "#cave"); page.wait_for_selector(".mcard"); time.sleep(0.2)
        check("off by default: a #cave link opens the menu", page.locator(".start-gate").count() == 0 and page.locator(".cv-setup").count() == 0)
        js("(async () => { const s = await import('/js/settings.js'); s.setGameOn('cave', true); })()")
        page.goto(URL); page.wait_for_selector(".mcard"); time.sleep(0.3)
        check("turned on in the grown-ups settings: menu has 28 cards", page.locator(".mcard").count() == 28)
        check("menu: Crystal Cave is in the Adventures section", page.locator(".sect", has_text="Adventures").locator(".mcard", has_text="Crystal Cave").count() == 1)

        # ---------------- question layer ----------------
        q = js("""async () => { const m = await import('/js/questions.js'); const out = {};
          for (const lv of ['add', 't5', 't10', 'div']) for (const t of [1, 2, 3]) out[lv + t] = Array.from({ length: 300 }, () => m.mathQuestion(lv, t));
          return { qs: out, starter: m.STARTER }; }""")
        bad = [x for k, v in q["qs"].items() for x in v if evalmath(x["text"]) != x["answer"] or x["answer"] < 0]
        check("math tiers: every answer matches its sum, none negative (3600 questions)", not bad, str(bad[:3]))
        def nums(k): return [[int(n) for n in re.findall(r"\d+", x["text"])] for x in q["qs"][k]]
        check("add tier 1: within 20", all(x["answer"] <= 20 and max(n) <= 20 for x, n in zip(q["qs"]["add1"], nums("add1"))))
        check("add tier 3: two-digit sums (math.js 'add')", all(max(n) >= 5 for n in nums("add3")) and any(x["answer"] > 50 for x in q["qs"]["add3"]))
        check("t10 tiers: ×2/5/10, then ×3/4/6, then ×7/8/9", all({2, 5, 10} & set(n) for n in nums("t101")) and all({3, 4, 6} & set(n) for n in nums("t102")) and all({7, 8, 9} & set(n) for n in nums("t103")))
        check("t5 tier 3 stays in tables 2–5", all(min(n) <= 5 for n in nums("t53")))
        check("div tiers: times first, then ÷ by 2–5/10, then ÷ by 6–9", all("×" in x["text"] for x in q["qs"]["div1"]) and all("÷" in x["text"] for x in q["qs"]["div2"] + q["qs"]["div3"]) and all(int(re.findall(r"\d+", x["text"])[1]) >= 6 for x in q["qs"]["div3"]))
        st_words = [w for t in ["1", "2", "3"] for w in q["starter"][t]]
        check("starter words: 3 grades of Dolch, letters only, no sound-alikes (to/two, their/there, ...)",
              all(q["starter"][t] for t in ["1", "2", "3"]) and all(re.fullmatch(r"[a-z]{2,}", w) for w in st_words) and not ({"to", "two", "too", "their", "there", "right", "write", "know", "no", "by", "buy"} & set(st_words)), str(len(st_words)))
        gw = js("""async () => { const d = await import('/js/dictionary.js'); await d.loadDictionary(); const m = await import('/js/questions.js');
          const t = [1, 2, 3].map((k) => m.grownupWords(k)); return { n: t.map((x) => x.length), lens: t.map((x) => [Math.min(...x.map((w) => w.length)), Math.max(...x.map((w) => w.length))]),
            odd: t.flat().filter((w) => /q(?!u)|(.)\\1\\1/.test(w)).slice(0, 3), sample: t.map((x) => x.slice(0, 3)) }; }""")
        check("grown-up words: Baffle dictionary by length (6 / 7 / 8–9), odd-looking ones skipped", gw["lens"] == [[6, 6], [7, 7], [8, 9]] and all(n > 1000 for n in gw["n"]) and not gw["odd"], json.dumps(gw))
        qq = js("""async () => { const m = await import('/js/questions.js');
          const noList = m.questioner({ spell: 'list', math: 't5', entries: [] });
          const a = Array.from({ length: 20 }, () => noList('spell', 1));
          const ent = [{ word: 'cat', sentence: '' }, { word: 'friend', sentence: '' }, { word: 'because', sentence: '' }, { word: 'water', sentence: '' }, { word: 'people', sentence: '' }, { word: 'about', sentence: '' }];
          const mine = m.questioner({ spell: 'list', math: 'add', entries: ent });
          const short = Array.from({ length: 20 }, () => mine('spell', 1).entry.word), long = Array.from({ length: 20 }, () => mine('spell', 3).entry.word);
          const either = Array.from({ length: 200 }, () => mine('either', 2).kind);
          return { fall: a.every((x) => x.kind === 'spell' && x.source === 'starter'), short: [...new Set(short)], long: [...new Set(long)],
                   mathKind: mine('math', 2).kind, either: [either.filter((k) => k === 'spell').length, either.filter((k) => k === 'math').length] }; }""")
        check("questioner: no word list -> Starter words", qq["fall"])
        check("questioner: her list by length (tier 1 short words, tier 3 long words)", set(qq["short"]) <= {"cat", "water", "about"} and set(qq["long"]) <= {"because", "people"}, json.dumps(qq))
        check("questioner: 'either' gives both kinds", qq["either"][0] > 40 and qq["either"][1] > 40, str(qq["either"]))

        # ---------------- rules ----------------
        r = js("""async () => { const R = await import('/js/games/cave/rules.js'); const out = {};
          const P = (n, humans = 1) => Array.from({ length: n }, (_, k) => ({ name: 'P' + k, hero: R.HEROES[k].id, human: k < humans }));
          for (const l of ['short', 'medium', 'long']) {
            const b = R.boardOf(l), seen = new Set([b.entry]), todo = [b.entry];
            while (todo.length) { const i = todo.pop(); for (const j of R.neighbours(b, i)) if (!seen.has(j)) { seen.add(j); todo.push(j); } }
            const st = R.newGame({ players: P(2), layout: l });
            const c = {}; st.tiles.forEach((t) => { c[t.color] = (c[t.color] || 0) + 1; });
            const redOk = st.tiles.every((t) => (t.color === 'red') === b.red.includes(t.room));
            out[l] = { reach: seen.size === b.cells.length, colors: c, redOk, start: R.explorable(st), entry: b.entry, goal: st.goal };
          }
          const st = R.newGame({ players: P(4, 2) });
          out.coop = [R.newGame({ players: P(3, 1) }).coop, st.coop];
          out.start = st.players.map((p) => [p.hero, p.cards.power, p.cards.wisdom, p.cards.magic, p.hearts, !!p.quest]);
          out.order = R.helpOrder(st, 0).concat(['|'], R.helpOrder(st, 2));
          out.short1 = R.shortfall({ power: 1, wisdom: 0, magic: 3 }, { power: 2, magic: 1, any: 2 });
          const cards = { power: 2, wisdom: 1, magic: 3 }; out.spent = R.pay(cards, { power: 1, any: 2 }); out.left = cards;
          const p = st.players[0]; p.hearts = 1; out.h = [R.loseHeart(st, 0), p.hearts, p.skip, R.loseHeart(st, 0), p.hearts, p.skip];
          p.quest = { name: 'T', need: { power: 2 }, stars: 2 }; p.cards = { power: 2, wisdom: 0, magic: 0 };
          const q = R.checkQuest(st, 0); out.quest = [q && q.name, p.gain.quests, p.done.length];
          p.quest = { name: 'U', need: { scared: 9 }, stars: 2 }; out.quest2 = R.checkQuest(st, 0);
          // final turns: once every tile is open, each player gets two more turns
          const f = R.newGame({ players: P(2) }); f.tiles.forEach((t) => { t.state = 'done'; }); f.tiles[3].state = 'up';
          let n = 0; while (!f.over && n < 20) { R.endTurn(f); n++; } out.final = n;
          const g = R.newGame({ players: P(2) }); g.tiles.forEach((t) => { t.state = 'done'; }); R.endTurn(g); out.finalNone = g.over;
          // Kind Badges are kept until used (nothing happens when one is earned)
          const k = R.newGame({ players: P(2) }); const k1 = k.players[1]; const before = JSON.stringify([k1.hearts, k1.cards, k1.found.length]);
          out.kids = Array.from({ length: 20 }, () => R.drawKind(k, 1).effect); out.kidCards = k1.kindCards;
          out.kept = [k1.badges.length, JSON.stringify([k1.hearts, k1.cards, k1.found.length]) === before, R.drawKind(k, 1) === null, k1.kindCards];
          const u = R.newGame({ players: P(2) }); const p1 = u.players[1];
          p1.badges = [{ name: 'Extra Heart', effect: 'heart' }, { name: 'Bonus Card', effect: 'card' }, { name: 'Treasure Map', effect: 'treasure' }, { name: 'Gold Star', effect: 'star' }];
          const s0 = R.score(p1).kind;
          out.use = [R.useBadge(u, 1, 1, 'wisdom').kind, p1.cards.wisdom, !!R.useBadge(u, 1, 1).treasure, p1.found.length, R.useBadge(u, 1, 1), p1.hearts];
          out.use.push(R.useBadge(u, 1, 0) && p1.hearts, p1.badges.map((b) => b.effect), s0);
          p1.hearts = 5; p1.badges.push({ name: 'Extra Heart', effect: 'heart' }); out.full = [R.usable(p1, p1.badges[1]), R.useBadge(u, 1, 1)];
          const c = R.newGame({ players: P(2) }); c.players[0].badges = [{ effect: 'heart' }, { effect: 'treasure' }, { effect: 'card' }, { effect: 'star' }];
          const h0 = c.players[0].hearts; c.tiles.forEach((t) => { t.state = 'done'; }); R.endTurn(c);
          out.cash = [c.over, c.players[0].hearts - h0, c.players[0].found.length, c.players[0].badges.map((b) => b.effect), R.score(c.players[0]).kind];
          out.goals = ['short', 'long'].map((l) => [1, 4].map((n) => R.newGame({ players: P(n, 1), layout: l }).goal[1]));
          return out; }""")
        check("boards: every square reachable from the way in (short, medium, long)", all(r[l]["reach"] for l in ["short", "medium", "long"]))
        check("boards: tile colours 5/5/6, 8/7/10 and 12/12/18 (the board game's 42)", r["short"]["colors"] == {"green": 5, "gray": 5, "red": 6} and r["medium"]["colors"] == {"green": 8, "gray": 7, "red": 10} and r["long"]["colors"] == {"green": 12, "gray": 12, "red": 18}, json.dumps({l: r[l]["colors"] for l in ["short", "medium", "long"]}))
        check("boards: red tiles only in the red rooms", all(r[l]["redOk"] for l in ["short", "medium", "long"]))
        check("start: only the square at the way in can be explored", all(r[l]["start"] == [r[l]["entry"]] for l in ["short", "medium", "long"]))
        check("one person = team game, two people = competitive", r["coop"] == [True, False])
        check("heroes start with 3 hearts, a quest and one card of their kind (viking/knight power, elf wisdom, wizard magic)",
              r["start"] == [["viking", 1, 0, 0, 3, True], ["knight", 1, 0, 0, 3, True], ["elf", 0, 1, 0, 3, True], ["wizard", 0, 0, 1, 3, True]], str(r["start"]))
        check("help is asked counter-clockwise", r["order"] == [3, 2, 1, "|", 1, 0, 3], str(r["order"]))
        check("shortfall counts 'any' from spare cards", r["short1"] == {"power": 1, "wisdom": 0, "magic": 0, "any": 0, "total": 1}, str(r["short1"]))
        check("paying 'any' uses the kind you have most of", r["spent"] == {"power": 1, "wisdom": 0, "magic": 2} and r["left"] == {"power": 1, "wisdom": 1, "magic": 1}, str(r))
        check("hearts: lose one; with none left, rest a turn and get one back", r["h"] == ["heart", 0, False, "rest", 1, True], str(r["h"]))
        check("quests: done at end of turn -> stars + a new quest; not done -> nothing", r["quest"] == ["T", 2, 1] and r["quest2"] is None, str(r["quest"]))
        check("last turns: two more each once every tile is explored", r["final"] == 5, str(r["final"]))
        check("last turns: none if nothing is left to do", r["finalNone"])
        check("Kind Badges: heart / card / star / treasure, counted", set(r["kids"]) <= {"heart", "card", "star", "treasure"} and r["kidCards"] == 20)
        check("Kind Badges are kept, not used at once (20 in hand, nothing else changed); none left -> still counted", r["kept"] == [20, True, True, 21], str(r["kept"]))
        check("using badges: Bonus Card -> the card she picks; Treasure Map -> a treasure; Gold Star can't be used, counts as a star; Extra Heart +1",
              r["use"] == ["wisdom", 1, True, 1, None, 3, 4, ["star"], 1], str(r["use"]))
        check("an Extra Heart can't be used with full hearts (5)", r["full"] == [False, None], str(r["full"]))
        check("game end: unused hearts and treasure maps are cashed in; bonus cards aren't; gold stars count", r["cash"] == [True, 1, 1, ["card", "star"], 1], str(r["cash"]))
        check("team targets grow with the cave and the team", r["goals"][0][0] < r["goals"][0][1] and r["goals"][0][1] < r["goals"][1][1], str(r["goals"]))

        bots = js("""async () => { const R = await import('/js/games/cave/rules.js'); const B = await import('/js/games/cave/bot.js');
          const P = (n, humans) => Array.from({ length: n }, (_, k) => ({ name: 'P' + k, hero: R.HEROES[k].id, human: k < humans }));
          const st = R.newGame({ players: P(2, 2), bot: 'nomercy' });
          st.tiles.forEach((t, i) => { if (i !== st.tiles.length - 4) t.state = 'done'; });
          const reds = st.tiles.map((t, i) => i).filter((i) => st.tiles[i].color === 'red');
          st.tiles.forEach((t, i) => { t.state = 'done'; }); st.tiles[13].state = 'down'; st.tiles[12].state = 'down';
          st.tiles[13].color = 'red'; st.tiles[12].color = 'green'; st.tiles[8].state = 'done'; st.tiles[9].state = 'done';
          const mean = Array.from({ length: 20 }, () => B.chooseAction(st, 1).tile);
          st.bot = 'right'; st.players[1].cards = { power: 0, wisdom: 0, magic: 0 };
          const meek = Array.from({ length: 20 }, () => B.chooseAction(st, 1).tile);
          const coop = R.newGame({ players: P(3, 1) });
          const help = [Array.from({ length: 50 }, () => B.willHelp(coop, 1, 0)).every(Boolean),
            Array.from({ length: 400 }, () => B.willHelp({ ...st, bot: 'nomercy' }, 1, 0)).filter(Boolean).length];
          const ch = [B.answerChance('nomercy', 3, 0.5), B.answerChance('normal', 1, 0.5), B.answerChance('normal', 3, 0.5)];
          const right = Array.from({ length: 400 }, () => B.answerChance('right', 2, 0.8));
          // whole games between computer heroes always finish
          let unfinished = 0;
          for (let g = 0; g < 40; g++) {
            const s = R.newGame({ players: P(3, 0), layout: ['short', 'medium', 'long'][g % 3], bot: ['right', 'normal', 'nomercy'][g % 3] }); let guard = 0;
            while (!s.over && guard++ < 1500) {
              const i = s.turn, p = s.players[i];
              if (p.skip) { p.skip = false; R.endTurn(s); continue; }
              const plan = B.chooseAction(s, i);
              if (plan.type === 'explore') {
                const t = s.tiles[plan.tile], c = t.card;
                if (c.kind === 'ability') { t.state = 'done'; for (const k of R.KINDS) p.cards[k] += c.gives[k] || 0; }
                else if (c.kind === 'treasure') { t.state = 'done'; R.drawTreasure(s, i); }
                else t.state = 'up';
              } else if (plan.type === 'fight') {
                const needs = s.tiles[plan.tile].card.needs;
                for (const h of R.helpOrder(s, i)) while (!R.canPay(p.cards, needs) && R.canGive(s.players[h].cards, R.shortfall(p.cards, needs)) && B.willHelp(s, h, i))
                  R.give(s, h, i, R.usefulKind(s.players[h].cards, R.shortfall(p.cards, needs)));
                if (R.canPay(p.cards, needs)) R.scare(s, i, plan.tile); else R.loseHeart(s, i);
              }
              else if (plan.type === 'buy') R.buy(s, i, plan.tile);
              R.checkQuest(s, i); R.endTurn(s);
            }
            if (!s.over) unfinished++;
          }
          return { mean: [...new Set(mean)], meek: [...new Set(meek)], help, ch, rightMax: Math.max(...right), unfinished }; }""")
        check("No Mercy heads for red tiles; a computer hero with few cards stays on green", bots["mean"] == [13] and bots["meek"] == [12], json.dumps(bots))
        check("team computer heroes always help; No Mercy rivals sometimes (about 35%)", bots["help"][0] and 90 < bots["help"][1] < 190, str(bots["help"]))
        check("answer chances: No Mercy 95%; Normal 85% (green) .. 65% (red); Just right stays below 95%", bots["ch"] == [0.95, 0.85, 0.65] and bots["rightMax"] <= 0.95, str(bots["ch"]))
        check("40 computer-only games (all sizes and levels) all finish", bots["unfinished"] == 0, str(bots["unfinished"]))

        # ---------------- setup screen ----------------
        open_cave()
        check("setup: 4 seats; seat 1 is you, seat 2 a computer hero by default", page.locator(".cv-seat").count() == 4 and page.locator(".cv-seat[data-seat='1'] .cv-types .primary").inner_text().endswith("Computer"))
        check("setup: team game line for one person", "Team game" in page.locator(".cv-mode").inner_text())
        check("setup: a hero another seat has is greyed", page.locator(".cv-seat[data-seat='0'] .cv-heropick[data-hero='viking']").is_disabled())
        tap(".cv-seat[data-seat='2'] .cv-types button[data-type='person']")
        check("setup: a Person seat has a name box and Math/Words levels", page.locator(".cv-seat[data-seat='2'] .cv-name").count() == 1 and page.locator(".cv-seat[data-seat='2'] .cv-math").count() == 1 and page.locator(".cv-seat[data-seat='2'] .cv-spell").count() == 1)
        check("setup: two people = most stars wins", "Most stars" in page.locator(".cv-mode").inner_text())
        check("setup: the new seat got a free hero", page.locator(".cv-seat[data-seat='2'] .cv-heropick.primary").get_attribute("data-hero") not in ["elf", "viking"])
        check("setup: computer levels Just right / Normal / No Mercy", page.locator(".cv-botlevel button").all_inner_texts() == ["🌱 Just right", "⚔️ Normal", "🔥 No Mercy"])
        tap(".cv-seat[data-seat='2'] .cv-types button[data-type='off']")
        tap(".cv-more"); page.wait_for_selector(".cv-opts")
        check("More options: Short / Medium / Long caves", page.locator(".cv-opts button[data-len]").count() == 3)
        tap(".cv-opts button[data-len='short']"); tap(".cv-opts button:has-text('Done')")
        page.screenshot(path=f"{SHOTS}/cave_setup.png", full_page=True)
        page.locator(".cv-seat[data-seat='0'] .cv-name").fill("Mia")

        # ---------------- team game to the end ----------------
        g0, w0 = gp(), len(progress_words())
        tap(".cv-start"); page.wait_for_selector(".cv-board")
        s = state()
        check("team game: started with Mia + Brynja, cooperative", [p["name"] for p in s["players"]] == ["Mia", "Brynja"] and s["coop"])
        check("team game: board shows 16 tiles, one glowing", page.locator(".cv-tile").count() == 16 and page.locator(".cv-tile.can").count() == 1)
        page.screenshot(path=f"{SHOTS}/cave_board.png")
        mine_q, guard, seen, t0 = 0, 0, set(), time.time()
        while time.time() - t0 < 150:
            guard += 1
            if page.locator(".cv-finish").count(): break
            if page.locator(".ch-q .kb").count():
                mine_q += 1; answer(right=(mine_q % 5 != 0)); continue
            clicked = False
            for sel in [f"{x}:not([disabled])" for x in [".cv-nextq", ".cv-scare", ".cv-help", ".cv-give", ".cv-buy", ".cv-brave", ".cv-anypick", ".cv-ok", ".cv-next", ".cv-me"]] + [".cv-tile.can"]:
                if page.locator(sel).count():
                    seen.add(sel)
                    if sel == ".cv-tile.can":
                        if page.locator(".cv-tile.can.down").count(): tap(".cv-tile.can.down")
                        else: tap(sel)
                    else:
                        try: page.locator(sel).first.tap(timeout=5000)
                        except Exception:
                            page.screenshot(path=f"{SHOTS}/cave_stuck.png")
                            print("STUCK on", sel, "|", page.locator(".cv-panel").inner_text()[:400].replace("\n", " / "))
                            raise
                    clicked = True
                    break
            if not clicked:
                if page.locator(".cv-passturn:not([disabled])").count(): tap(".cv-passturn"); continue
                time.sleep(0.05)
        if not page.locator(".cv-finish").count():
            s = state(); print("NOT DONE", s["turn"], s["final"], s["turns"], [t["state"] for t in s["tiles"]], page.locator(".cv-panel").inner_text()[:300])
        check("team game: reached the end", page.locator(".cv-finish").count() == 1, f"after {guard} steps; seen {sorted(seen)}")
        s = state()
        check("team game: every tile was explored", all(t["state"] != "down" for t in s["tiles"]))
        check("team game: she answered questions; garden grew by one per question", mine_q > 3 and gp() - g0 == mine_q, f"{mine_q} questions, garden +{gp() - g0}")
        check("team game: her list words were logged in the hidden progress", len(progress_words()) >= w0, str(progress_words()))
        check("team game: end shows team stars and both heroes", page.locator(".cv-result").count() == 2 and "stars together" in page.locator(".cv-finish").inner_text())
        check("team game: the saved game is cleared at the end", js("localStorage.getItem('spelling-games.cave.save.v1')") is None)
        page.screenshot(path=f"{SHOTS}/cave_end.png")

        # ---------------- save + continue ----------------
        tap(".cv-change"); page.wait_for_selector(".cv-setup")
        tap(".cv-start"); page.wait_for_selector(".cv-tile.can")
        mutate("st.tiles[12].card = { kind: 'ability', color: st.tiles[12].color, name: 'Test Spark', gives: { power: 1 }, id: 99 };")
        tap(".cv-tile.can")
        page.wait_for_selector(".ch-q .bigword")
        answer(True)
        page.wait_for_selector(".cv-ok"); tap(".cv-ok")
        page.wait_for_selector(".cv-next", timeout=8000)  # Brynja played; Mia's turn is next
        saved = js("JSON.parse(localStorage.getItem('spelling-games.cave.save.v1'))")
        check("save: the game is saved after each turn", saved and saved["st"]["players"][0]["cards"]["power"] >= 1 and saved["st"]["tiles"][12]["state"] == "done", str(saved and saved["st"]["players"][0]["cards"]))
        home(); open_cave()
        check("continue: button offered", page.locator(".cv-continue").count() == 1)
        tap(".cv-continue"); page.wait_for_selector(".cv-board")
        s2 = state()
        check("continue: same game state (tiles, cards, turn)", [t["state"] for t in s2["tiles"]] == [t["state"] for t in saved["st"]["tiles"]] and s2["players"][0]["cards"] == saved["st"]["players"][0]["cards"] and s2["turn"] == saved["st"]["turn"])

        # ---------------- pass-and-play (competitive) ----------------
        home(); open_cave()
        tap(".cv-seat[data-seat='1'] .cv-types button[data-type='person']")
        page.locator(".cv-seat[data-seat='1'] .cv-name").fill("Dad")
        page.locator(".cv-seat[data-seat='1'] .cv-spell").select_option("grownup")
        page.locator(".cv-seat[data-seat='1'] .cv-math").select_option("add")
        tap(".cv-start"); page.wait_for_selector(".cv-tile.can")
        s = state()
        check("competitive: two people, not cooperative; stars shown per player", not s["coop"] and page.locator(".cv-stars").count() == 2)
        # Mia explores a gem she can't afford: turn ends; then "Pass to Dad"
        mutate("const t = st.tiles[12]; t.card = { kind: 'item', color: t.color, name: 'Test Gem', needs: { magic: 3 }, stars: 3, look: { color: '#f00' }, id: 98 };")
        tap(".cv-tile.can")
        page.wait_for_selector(".cv-ok"); tap(".cv-ok")
        page.wait_for_selector(".cv-next")
        check("pass-and-play: 'Pass to Dad' after her turn", "Pass to Dad" in page.locator(".cv-next").inner_text())
        tap(".cv-next"); page.wait_for_selector(".cv-tile.can")
        check("pass-and-play: Dad's turn", "Dad" in page.locator(".cv-status").inner_text())
        # Dad: a spelling card -> a Grown-up word; nothing recorded for her
        g1, w1 = gp(), progress_words()
        mutate("const t = st.tiles[8]; t.card = { kind: 'ability', color: t.color, name: 'Test Book', gives: { wisdom: 1 }, id: 97 };")
        tap(".cv-tile.can.down")
        page.wait_for_selector(".ch-q .kb")
        word = heard_word()
        check("Dad's spelling word is a Grown-up word (6+ letters, not her list)", len(word) >= 6 and word not in LIST, word)
        answer(True)
        page.wait_for_selector(".cv-ok")
        check("Dad's answers don't touch her garden or hidden progress", gp() == g1 and progress_words() == w1)
        check("Dad earned his Wisdom card", state()["players"][1]["cards"]["wisdom"] == 1)
        tap(".cv-ok"); page.wait_for_selector(".cv-next")
        check("pass-and-play: 'Pass to Mia' next", "Pass to Mia" in page.locator(".cv-next").inner_text())
        tap(".cv-next"); page.wait_for_selector(".cv-tile.can")
        # Mia meets a bad guy needing Wisdom; Dad has one -> help hand-off
        mutate("""st.players[0].cards = { power: 0, wisdom: 0, magic: 0 };
                  const i = [...document.querySelectorAll('.cv-tile.can.down')].map((e) => +e.dataset.i)[0];
                  st.tiles[i].card = { kind: 'monster', color: st.tiles[i].color, name: 'Test Bat', needs: { wisdom: 1 }, stars: 2, look: { shape: 'bat', color: '#000' }, id: 96 }; window.__monster = i;""")
        tap(f".cv-tile[data-i='{js('window.__monster')}']")
        page.wait_for_selector(".cv-help")
        check("bad guy: Ask for help / Brave try / Back away offered", page.locator(".cv-brave").count() == 1 and page.locator(".cv-back").count() == 1)
        tap(".cv-help")
        page.wait_for_selector(".cv-me")
        check("help: device passed to Dad first", "Dad" in page.locator(".cv-me").inner_text())
        tap(".cv-me"); page.wait_for_selector(".cv-give"); tap(".cv-give")
        page.wait_for_selector(".cv-me", timeout=8000)
        check("help: then back to Mia", "Mia" in page.locator(".cv-me").inner_text())
        s = state()
        check("help: Dad gave the card and earned a Kind Badge", s["players"][0]["cards"]["wisdom"] == 1 and s["players"][1]["kindCards"] == 1 and len(s["players"][1]["badges"]) == 1)
        check("help: Dad's badge shows on his row, named", page.locator(".cv-player[data-p='1'] .cv-badge").count() == 1 and s["players"][1]["badges"][0]["name"] in page.locator(".cv-player[data-p='1'] .cv-badge").inner_text())
        tap(".cv-me"); page.wait_for_selector(".cv-scare"); tap(".cv-scare")
        page.wait_for_selector(".cv-ok")
        s = state()
        check("scared away: Mia gets its stars; it's gone from the board", s["players"][0]["gain"]["monsters"] == 2 and s["tiles"][js("window.__monster")]["state"] == "done")
        tap(".cv-ok"); page.wait_for_selector(".cv-next"); tap(".cv-next"); page.wait_for_selector(".cv-tile.can")
        # Dad: brave try against a bad guy needing 1 Power (math, one tier harder), nobody can help
        mutate("""st.players.forEach((p) => { p.cards = { power: 0, wisdom: 0, magic: 0 }; });
                  const i = [...document.querySelectorAll('.cv-tile.can.down')].map((e) => +e.dataset.i)[0];
                  st.tiles[i].card = { kind: 'monster', color: 'green', name: 'Test Mole', needs: { power: 1 }, stars: 2, look: { shape: 'mole', color: '#000' }, id: 95 }; st.tiles[i].color = 'green'; window.__monster = i;""")
        tap(f".cv-tile[data-i='{js('window.__monster')}']")
        page.wait_for_selector(".cv-brave")
        check("no help button when nobody has a card to give", page.locator(".cv-help").count() == 0)
        tap(".cv-brave"); page.wait_for_selector(".ch-q .bigword")
        bw = page.locator(".ch-q .bigword").inner_text()
        check("brave try: a harder math question (green -> tier 2 for 'add': not within 20)", evalmath(bw) > 20 or max(int(n) for n in re.findall(r"\d+", bw)) > 20, bw)
        answer(True)
        page.wait_for_selector(".cv-ok")
        s = state()
        check("brave try: all right -> scared away", s["tiles"][js("window.__monster")]["state"] == "done" and s["players"][1]["scared"] == 1)
        tap(".cv-ok"); page.wait_for_selector(".cv-next"); tap(".cv-next"); page.wait_for_selector(".cv-tile.can")
        # Mia backs away from a bad guy: loses a heart; at 0 she rests next turn and gets one back
        mutate("""st.players[0].hearts = 0; st.players.forEach((p) => { p.cards = { power: 0, wisdom: 0, magic: 0 }; });
                  const i = [...document.querySelectorAll('.cv-tile.can.down')].map((e) => +e.dataset.i)[0];
                  st.tiles[i].card = { kind: 'monster', color: st.tiles[i].color, name: 'Test Ghost', needs: { magic: 2 }, stars: 3, look: { shape: 'ghost', color: '#000' }, id: 94 }; window.__monster = i;""")
        tap(f".cv-tile[data-i='{js('window.__monster')}']")
        page.wait_for_selector(".cv-back"); tap(".cv-back")
        page.wait_for_selector(".cv-ok")
        s = state()
        check("back away at 0 hearts: rests next turn, gets a heart back; the bad guy stays", s["players"][0]["skip"] and s["players"][0]["hearts"] == 1 and s["tiles"][js("window.__monster")]["state"] == "up")
        check("a waiting bad guy shows on the board with what it needs", page.locator(f".cv-tile[data-i='{js('window.__monster')}'] .cv-need").count() == 2)
        page.screenshot(path=f"{SHOTS}/cave_pvp.png")
        # Dad uses a Bonus Card badge to cover the one card he is missing
        tap(".cv-ok"); page.wait_for_selector(".cv-next"); tap(".cv-next"); page.wait_for_selector(".cv-tile.can")
        mutate("""st.players.forEach((p) => { p.cards = { power: 0, wisdom: 0, magic: 0 }; });
                  st.players[1].badges = [{ name: 'Bonus Card', icon: '🃏', effect: 'card', text: 'a card' }, { name: 'Gold Star', icon: '⭐', effect: 'star', text: '1 star' }];
                  const i = [...document.querySelectorAll('.cv-tile.can.down')].map((e) => +e.dataset.i)[0];
                  st.tiles[i].card = { kind: 'monster', color: st.tiles[i].color, name: 'Test Slime', needs: { power: 1 }, stars: 2, look: { shape: 'slime', color: '#000' }, id: 93 }; window.__monster = i;""")
        tap(f".cv-tile[data-i='{js('window.__monster')}']")
        page.wait_for_selector(".cv-usebadge")
        check("badges: only usable ones get a Use button (Bonus Card, not Gold Star)", page.locator(".cv-usebadge").count() == 1 and page.locator(".cv-usebadge[data-effect='card']").count() == 1)
        tap(".cv-usebadge"); page.wait_for_selector(".cv-bonuspick")
        check("Bonus Card: the missing kind is suggested", "primary" in (page.locator(".cv-bonuspick[data-k='power']").get_attribute("class") or ""))
        tap(".cv-bonuspick[data-k='power']"); page.wait_for_selector(".cv-scare")
        s = state()
        check("Bonus Card became a Power card; now he can scare it away", s["players"][1]["cards"]["power"] == 1 and [b["effect"] for b in s["players"][1]["badges"]] == ["star"])
        tap(".cv-scare"); page.wait_for_selector(".cv-ok")
        check("scared away with the badge's card", state()["tiles"][js("window.__monster")]["state"] == "done")

        home()
        check("no console errors", not errors, "; ".join(errors[:5]))
        b.close()
finally:
    server.terminate()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
print("PASS no console/page errors" if not errors else f"FAIL errors: {errors[:5]}")
sys.exit(1 if failed or errors else 0)
