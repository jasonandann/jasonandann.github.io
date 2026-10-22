# Spelling Time

Static spelling-practice games for a weekly school word list. Plain HTML/CSS/JavaScript: no build step, no dependencies, no server. Works on iPad (touch) and Chromebook (touch or keyboard).

## Each week

1. Edit `words.txt` (one word per line).
2. Optional check: `python3 tools/check_words.py` (also flags words missing from the dictionary, which is usually a typo)
3. `git add words.txt && git commit -m "Week of ..." && git push`

The site loads `words.txt` fresh each visit (`cache: 'no-cache'`), so the new list appears once GitHub Pages republishes (usually about a minute; not verified for your setup).

### `words.txt` format

```
# Week of Oct 26          <- first comment line is shown as the list name
because | I stayed inside because it was raining.
friend
```

- Lowercase or uppercase both fine; duplicates are ignored.
- ` | sentence` is optional. If present it is read aloud with the word ("word. sentence. word.") in Listen & Type and the study list.
- Words with apostrophes or hyphens work in Listen & Type, Fill the Blanks, Memory, and Look-Cover-Write-Check. Word Jumble and Word Search skip them (letters only). Word Search also skips words longer than 14 letters.

## Games

Home screen sections: **Spelling**, **Math**, **Fun**, **Rewards**.

**Spelling** (use `words.txt`; each finished word is recorded in the hidden progress)

| Game | What she does |
|---|---|
| Word Jumble | Hears the word, taps shuffled letters into order |
| Listen & Type | Hears the word (and sentence), types it. Closest to the real test |
| Fill the Blanks | Taps the missing letters on an on-screen keyboard |
| Spell Catcher | Letters drift down like rain; tap them in spelling order (they loop, never lost) |
| Word Volcano | Letters are rocks on a volcano; tap in order. Lava rises as she gets letters right |
| Wordal | Wordle-style: six tries to spell the word she hears. Grey/yellow/green, no dictionary check |
| Memory Match | Flips cards to find each word's pair (speaks the word on flip) |
| Word Search | Drags across letters, or taps first and last letter |
| Baffle | Boggle-style 5×5 letter grid: slides across touching letters to make words (see below) |
| Look, Cover, Write, Check | Studies the word, hides it, writes it from memory, compares |
| See the Words | Study list; tap a word to hear it |

**Math** (grade-3 style; each game starts with a level choice that is remembered: add/subtract within 100, times tables 2-5, 2-10, or times and division). Number Bubbles, Number Cascade, Times Table Explorer (explore / practice / patterns), Number Maze, Number Mountain, Puzzle Pieces. Not recorded in the hidden progress.

**Fun**: Zombie Trail (below), Lily Pad River (lily pads with answers float down a river; tap the right one and the frog hops on. Spelling, math or both: for spelling she hears the word and picks the correct spelling from look-alike misspellings such as *bunnys* / *bunnyes*. Wrong pads just sink a little; pads loop forever, so nothing is missed. Spelling answers count in the hidden progress like the spelling games), Spot Match (find the one picture on both cards, no timer), Simon Says (copy the colour pattern; a slip just replays the pattern).

**Rewards**: My Garden. Every finished question in any game (right first time or not) is one point; every 4 points grows a flower, and butterflies and bees arrive later. It only grows, never shrinks, and shows no numbers. Stored in `localStorage` (`spelling-games.garden.v1`); the parent panel's "Erase history" does not touch it.

The new spelling and math games are original vanilla-JS re-implementations of the mechanics in [Spellbound](https://github.com/benSlaughter/spellbound) (MIT per its README); none of its code was copied. Differences from Spellbound, chosen for a child who discourages easily: no timers, no best scores, no unlock gating, no lives.

### Baffle

A 5×5 grid of letters. Slide a finger across letters that touch (diagonals count, each letter once), or tap them one by one and tap the last one again (or ✔ Check).

- Each new board is generated in the browser from `words.txt` (no extra weekly step): it hides as many list words as it can fit, whatever this week's rule is. Typical result: about 13–17 of 22 for a y/ies week, 8–9 of 12 sight words. Long words and words with many doubled letters fit less often.
- List words found go under ⭐ Spelling words (spoken aloud). Any other real word goes in the 🫙 Bonus jar. Made-up words get "Hmm, I don't know that word. Try another!" Words in `words.txt` are always accepted even if the dictionary lacks them.
- No timer, no count. **💡 Hints** (off by default, remembered per device) shows a row of empty boxes per hidden list word, filled in as she finds them.
- After 8 minutes, 40 tries, or 12 tries in a row with nothing new, it offers "Getting tired? Let's take a break!" (Keep playing / All done). All done shows what she found and an optional "Peek at the hiding words". Tune these at the top of `js/games/baffle.js`.
- Every new word (list or bonus) is a garden point. Baffle does not record hidden progress.
- Dictionary: `dict/words.txt`, built by `python3 tools/make_dictionary.py` from the public-domain [ENABLE list](https://github.com/dolph/dictionary) (3–12 letters, about 152k words, 1.4 MB; downloaded only when Baffle opens). ENABLE is from about 2000, so newer words (email, selfie) are missing, and it includes Scrabble oddities (aah, zax). `tools/blocklist.txt` removes swear words and slurs; add to it and re-run the script. To switch to [SCOWL](http://wordlist.aspell.net/) later, pass its word file to the script.

### Zombie Trail

Roll a die, answer a question. Right: move ahead by the roll. Wrong: move back by the roll. Landing on a 🚀 shortcut jumps you ahead; landing on a 🧟 zombie sends you back (arrows and "→ 23" / "← 11" labels show where). Reach square 35 (🏁) to win; you do not need an exact roll.

- Setup screen: 1 or 2 players (taking turns on one device), questions = Spelling / Math / Both, and **Second chance** (on by default: one more try before moving back; turn it off for the strict rules).
- A new random board is generated each game (4 shortcuts, 5 zombies; jumps never chain).
- Spelling questions use your `words.txt` (hear the word, type it) and are recorded in the hidden progress like the other spelling games. Math (grade-3 style add/subtract within 100, times tables up to 10, matching division) is not recorded.
- Tune the math or the board in `mathProblem()` / `makeBoard()` at the top of `js/games/zombie.js`.

Design choices for a child who discourages easily: no scores, counters, timers, or "wrong" messages. Misses get "Almost! Try again." After repeated misses the word is shown so she can see it, then the game moves on. Rounds are about 10 words; words she has needed help with are quietly chosen more often.

The on-screen keyboard avoids iPad autocorrect and predictive text. A physical keyboard also works.

## Hidden progress (grown-ups only)

Spelling questions in Jumble, Fill, Listen & Type, Spell Catcher, Word Volcano, Wordal, Look-Cover-Write-Check, and Zombie Trail record, per word, whether she got it on the first try or needed help. Memory Match, Word Search, Baffle, the math games, Spot Match, Simon Says, and Zombie Trail math questions do not record anything. In Wordal, "first try" means solved within the first two guesses.

Open the panel from the home screen by either:
- tapping the **"Spelling Time" title 5 times within 3 seconds**, or
- typing **parent** on a keyboard.

Nothing visible links to it. Data lives in `localStorage` for that browser on that device only (not synced between iPad and Chromebook). Browsers can clear site storage (Safari in particular if the site goes unused for a while), so treat it as a convenience, not a record.

## Better pronunciation (optional): pre-generated audio

Browser text-to-speech sometimes mangles words. On a Mac you can record each word with the built-in `say`:

```
python3 tools/make_audio.py --list-voices      # pick a voice
python3 tools/make_audio.py --voice Samantha    # makes audio/<word>.m4a (+ .sentence.m4a) and audio/manifest.json
git add audio && git commit -m "Audio for this week" && git push
```

- Only missing or changed files are made; `--dry-run` previews, `--force` redoes everything, `--direct` skips `afconvert` (say writes .m4a itself).
- The page plays a recording when `audio/manifest.json` lists it, and falls back to the browser voice for any word without one (or if playback fails).
- Each run that makes files also writes `review/<date_time>.m3u8` (gitignored) listing just those files. Open it in VLC/IINA, or play them in Terminal, which prints each path first:
  `grep -v '^#' review/<file>.m3u8 | while read -r f; do echo "$f"; afplay "$f"; done`
- Fix a bad pronunciation with a line like `read = reed` in `audio/pronunciations.txt`, then rerun with `--force`.
- Uses only the macOS built-ins (`say`: [man page](https://ss64.com/mac/say.html); `afconvert`). Not part of MacPorts. Premium/Siri voices are better but are downloaded in System Settings > Accessibility > Spoken Content.
- Unverified: the script was tested only against stub `say`/`afconvert`, not a real Mac; the `afconvert` flags are from memory (use `--direct` if they fail); and Apple's licence terms for redistributing recordings of its voices in a public repo were not checked, so consider a private repo.

## Test locally

`fetch()` does not work from `file://`, so serve the folder:

```
python3 -m http.server 8000
# open http://localhost:8000
```

Automated browser tests (optional): `pip install playwright && playwright install chromium`, then `python3 tests/smoke_test.py`, `python3 tests/zombie_test.py`, `python3 tests/new_games_test.py`, `python3 tests/baffle_test.py`, `python3 tests/river_test.py`. The tests use their own word list (`tests/fixtures/words.txt`), so editing `words.txt` never breaks them. See `CLAUDE.md`.

## Publish with GitHub Pages

1. Push this folder to a GitHub repository (root of the `main` branch).
2. Repository **Settings > Pages**: set the source to deploy from the `main` branch, `/ (root)`.
3. Custom subdomain (e.g. `spelling.yourdomain.com`): in **Settings > Pages > Custom domain** enter it and save (this commits a `CNAME` file; pull it afterwards). At your DNS provider add a `CNAME` record for that subdomain pointing to `<your-github-username>.github.io` (no repository name). Then enable **Enforce HTTPS** once available (can take up to 24 hours). Details: <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>

The page includes `noindex` so search engines are asked not to list it. That is a request, not access control: anyone with the URL can open it.

## Files

```
index.html           page shell
words.txt            the weekly list (the only file you normally edit)
css/style.css
js/app.js            menu + routing + hidden parent triggers
js/util.js           parsing, speech, on-screen keyboard, progress, round runner
js/parent.js         grown-ups panel
js/math.js           math question generator, level picker, quiz loop
js/games/*.js        one file per game (mathquiz.js holds 5 math games)
audio/               optional recordings + manifest.json + pronunciations.txt
dict/words.txt       real-word list for Baffle (generated; see tools/make_dictionary.py)
tests/               Playwright tests
CLAUDE.md            context for Claude Code
tools/check_words.py optional list checker
tools/make_audio.py  optional macOS audio generator
tools/make_dictionary.py + blocklist.txt   rebuilds dict/words.txt
```

## Known limits

- Without recordings, speech uses the browser's built-in text-to-speech. Voice quality differs by device, and on iOS speech only plays after a tap (the games speak on taps, and every game has a 🔊 button).
- If a device has no text-to-speech at all, the hear-it games lose their audio prompt.
- Wordal and Puzzle Pieces may scroll a little on phones and very short screens; they are tuned for iPad and Chromebook sizes.
- Not tested on a real iPad/Safari: tests use desktop Chromium with touch emulation.
