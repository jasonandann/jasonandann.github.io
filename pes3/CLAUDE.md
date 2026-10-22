# CLAUDE.md — Spelling Time (project context for Claude Code)

## Goal
Static games site for Jason's Grade-3 daughter: spelling (weekly `words.txt`), math, fun, and a garden reward. Hosted on GitHub Pages at his domain. Targets: iPad (Safari) + touch Chromebook. **She discourages easily**: no visible scores/timers/streaks/"wrong"/lives; progress is hidden (parent panel only); rewards are positive-only.

## User prefs (Jason)
Java dev + cybersecurity background, learning Python (prefer Python for tooling). macOS primary, **MacPorts not Homebrew**. Power user, AI novice (suggest prompting/context tips). Wants concise answers, inline source URLs, no sycophancy, explicit uncertainty.

## Hard constraints
- Plain HTML/CSS/vanilla JS ES modules. **No build, no deps, no server, no framework.** Keep it that way.
- Weekly workflow = edit `words.txt` -> `git commit/push`. Don't add steps to it.
- `speechSynthesis`/`Audio.play()` must run synchronously inside the tap (iOS). Games speak at round start from the tap that began the round; `open()` in `js/app.js` mounts synchronously.
- On-screen keyboard (avoids iPad autocorrect) + physical keys. Touch targets >= ~44px.
- Spellbound (github.com/benSlaughter/spellbound, MIT per README, no LICENSE file) is a mechanics reference only; games were rewritten, no code copied.

## Layout
```
index.html  words.txt  README.md  CLAUDE.md
css/style.css                      all styles (sections per game)
js/app.js                          SECTIONS menu, open()/home(), hidden parent triggers
js/dictionary.js                   loadDictionary/inDictionary (dict/words.txt, shared by word games)
js/util.js                         el, parseWords/loadWords, progress, garden, speech+audio, keyboard, scope, finish, rounds
js/math.js                         makeQuestion(s), choices, pickLevel, quiz() loop
js/parent.js                       grown-ups panel
js/games/*.js                      jumble typeit fillblank catcher volcano wordal memory wordsearch lcwc words
                                   baffle  zombie  mathquiz(mountain river maze bubbles cascade)  puzzle explorer
                                   spotmatch simon garden
audio/manifest.json (+*.m4a, pronunciations.txt)   optional recordings
dict/words.txt                     generated: ENABLE 3-12 letters minus tools/blocklist.txt
tools/check_words.py  tools/make_audio.py  tools/make_dictionary.py (+ blocklist.txt)
tests/smoke_test.py zombie_test.py new_games_test.py baffle_test.py zombie_shots.py  tests/fixtures/words.txt
```

## Contracts
- Game module: `export function mount(root, entries, api)`; `api={home}`; may return a cleanup fn. `mathquiz.js` exports objects `{mount}` (e.g. `mq.river`).
- `app.js` `SECTIONS=[{title,needsWords?,games:[{icon,name,blurb,needsWords?,mod}]}]`. Adding a game = new file + one entry. Menu currently 22 cards (tests assert this).
- `words.txt`: first `#` line = list title; `word | optional sentence`; dupes ignored; lowercase.
- Spelling games use `rounds(root, entries, api, renderRound, {perRound=10})`; `renderRound({entry,next,root,later,onLeave})`; call `logRound(word, firstTry)` **once** per word. `chooseWords` quietly favours missed words.
- `logRound` also calls `award()` (+1 garden point per finished word, right or not). Math games call `award()` per answered question via `quiz()`. Garden: 4 pts/flower, cap 30 plots, only grows. Keys: `spelling-games.progress.v1` (hidden), `spelling-games.garden.v1`, `spelling-games.mathlevel`. `clearProgress()` must NOT clear the garden.
- Wordal "first try" = solved within 2 guesses. Math, Spot Match, Simon, Memory, Word Search, Baffle don't log progress.
- Baffle: 5x5, `generate(words)` (greedy embed + simulated annealing, 8 restarts x 4000 iters, 400 ms budget) maximises how many list words are traceable; `findPath(grid, word)`. Targets = list words on the board; any other `inDictionary` word (3+ letters) = bonus; list words always valid. `award()` per new word. No visible count; hints (slots) off by default, key `spelling-games.baffle.hints`. Break prompt after 8 min / 40 tries / 12 stuck tries. Blocklist lines ending `+` also drop s/es/ed/ing/er/ers forms; others are exact.
- Tests route `words.txt` to `tests/fixtures/words.txt` (12 words, "Week of Oct 26") so the weekly list never breaks them.
- Parent panel: 5 taps within 3s on `#title`, or type `parent` on home (not in a game). Nothing visible links to it.
- Audio: `speakWord(entryOrString)` / `speakSentence(entry)` play `audio/<slug>.m4a` / `<slug>.sentence.m4a` if `audio/manifest.json` `{words:[slug],sentences:{slug:text}}` lists it (sentence text must match words.txt), else fall back to speechSynthesis (also on play() failure). slug = lowercase, non-[a-z0-9] runs -> `_`.
- Math levels: add (within 100), t5, t10, div. Kid-gentle copy: "Try again!", never "wrong".
- Zombie Trail: 6x6 serpentine (0..35), 4 shortcuts (+5..10), 5 zombies (-4..-9), no exact finish, clamp at 0, Second chance default ON; DOM exposes `data-pos`, `data-kind`, `data-to` for tests.

## Commands
```
python3 -m http.server 8000            # fetch() needs http, not file://
python3 tools/check_words.py           # validate words.txt
python3 tools/make_audio.py --dry-run  # macOS only (say + afconvert); see README
pip install playwright && playwright install chromium   # tests only
python3 tools/make_dictionary.py       # only when changing the source list or blocklist
python3 tests/smoke_test.py && python3 tests/zombie_test.py && python3 tests/new_games_test.py && python3 tests/baffle_test.py   # 41 + 28 + 68 + 46 checks
```
Tests start their own `http.server` (ports 8765/8766/8768/8769), stub speechSynthesis, write screenshots to the OS temp dir `spelling-shots`.

## Status / verified
Passing: all four suites above on desktop Chromium with touch emulation; layouts checked at 1024x768 (no scroll), 1024x660 and 390x760 (small overflow in Wordal on phone, Puzzle/Explorer at 660).

## Not verified / caveats
- **Never run on a real iPad/Safari or Chromebook.** iOS audio unlock, `touch-action` drag in Word Search and Baffle, Baffle generation speed on an iPad (about 0.3 s in sandbox Chromium), and speech voices are untested there.
- `tools/make_audio.py` default path (`say` -> `afconvert -f m4af -d aac -b 64000`) verified on Jason's Mac 2026-10-21; `--direct` (`say -o x.m4a --data-format=aac`) still unverified. Each run writes `review/<timestamp>.m3u8` (gitignored) of files it made. Apple voice redistribution terms unchecked (consider a private repo). Premium voice names unverified.
- GitHub Pages republish delay (~1 min) not verified for his setup.
- Sandbox emoji font lacked some glyphs in screenshots (blank garden cell); likely fine on Apple devices, unchecked.
- Spellbound math "spaced repetition" stats and unlock gating were deliberately not ported.

## Ideas not done
Wordscapes-style "Word Wheel" (letter wheel + crossword) discussed; needs a word-frequency source for crossword fillers (SCOWL sizes) — reuse js/dictionary.js. Per-word pronunciation overrides are only in `make_audio.py` (not browser TTS); reduce Wordal/Puzzle height on short screens; Google Cloud TTS was discussed as an alternative; it needs an API key, so on a static site it only works if audio is pre-generated and committed (same pipeline as `make_audio.py`).

## Working style for this repo
Keep files small, no build tooling; test new games with Playwright (use JS `click()` on moving targets such as falling letters/bubbles); keep copy encouraging; run all four suites before delivering. Git commits (if made): follow Jason's instructions; none requested so far.
