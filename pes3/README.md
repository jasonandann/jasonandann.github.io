# Spelling Time

Static spelling-practice games for a weekly school word list. Plain HTML/CSS/JavaScript: no build step, no dependencies, no server. Works on iPad (touch) and Chromebook (touch or keyboard).

## Each week

1. Edit `words.txt` (one word per line).
2. Optional check: `python3 tools/check_words.py` (also flags words missing from the dictionary, which is usually a typo)
3. `git add words.txt && git commit -m "Week of ..." && git push`

GitHub Pages republishes in under a minute (36–41 s measured twice on 2026-10-22). The app checks for a new list each time it opens or comes back to the front, and reloads with it when she is on the home menu (see [Offline and updates](#offline-and-updates)). Nothing else to do.

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

Home screen sections: **Spelling**, **Math**, **Coding**, **Adventures** (games that ask spelling, math or both), **Brain Games** (no spelling or math), **Rewards**.

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

**Math** (grade-3 style; each game starts with a level choice that is remembered: add/subtract within 100, times tables 2-5, 2-10, or times and division). Number Bubbles, Number Cascade, Times Table Explorer (explore / practice / patterns), Number Maze, Number Mountain, Puzzle Pieces. Lily Pad River (under Adventures) can also do math. Not recorded in the hidden progress.

**Coding**: Robot Course, Turtle Draw and Code Studio (below). All three share one engine in `js/code/`.

**Adventures**: Zombie Trail (below), Battle Buddies and Dragon Egg Quest (below), Lily Pad River (lily pads with answers float down a river; tap the right one and the frog hops on. Spelling, math or both: for spelling she hears the word and picks the correct spelling from look-alike misspellings such as *bunnys* / *bunnyes*, plus two other words from the list. Each wrong answer is on the river once, and a wrong pad just sinks a little; pads loop forever, so nothing is missed. Spelling answers count in the hidden progress like the spelling games).

**Brain Games**: Spot Match (find the one picture on both cards, no timer), Simon Says (copy the colour pattern; a slip just replays the pattern).

**Rewards**: My Garden. Every finished question in any game (right first time or not) is one point; every 4 points grows a flower, and butterflies and bees arrive later. It only grows, never shrinks, and shows no numbers. Stored in `localStorage` (`spelling-games.garden.v1`); the parent panel's "Erase history" does not touch it.

### Linking straight to a game

Add `#<name>` to the address, e.g. `https://jasonandann.net/pes3/#robot`. The page shows that game's card with a **▶ Tap to start** button: the tap is needed because an iPad only lets a page speak inside a tap. While a game is open the address bar shows its link (so you can copy it); **‹ Home** clears it. An unknown name just shows the menu. Names are not case-sensitive. The names live in `SECTIONS` in `js/app.js` (`id`).

| Spelling | | Math | | Coding / Adventures / Brain Games / Rewards | |
|---|---|---|---|---|---|
| See the Words | `#words` | Number Bubbles | `#bubbles` | Robot Course | `#robot` |
| Word Jumble | `#jumble` | Number Cascade | `#cascade` | Zombie Trail | `#zombie` |
| Fill the Blanks | `#blanks` | Times Table Explorer | `#times` | Lily Pad River | `#river` |
| Look, Cover, Write, Check | `#lcwc` | Number Maze | `#maze` | Battle Buddies | `#battle` |
| Spell Catcher | `#catcher` | Number Mountain | `#mountain` | Simon Says | `#simon` |
| Word Volcano | `#volcano` | Puzzle Pieces | `#puzzle` | My Garden | `#garden` |
| Memory Match | `#memory` | | | Turtle Draw | `#turtle` |
| Baffle | `#baffle` | | | Code Studio | `#studio` |
| Word Search | `#search` | | | Spot Match | `#spot` |
| Wordal | `#wordal` | | | Dragon Egg Quest | `#quest` |
| Listen & Type | `#listen` | | | | |

The new spelling and math games are original vanilla-JS re-implementations of the mechanics in [Spellbound](https://github.com/benSlaughter/spellbound) (MIT per its README); none of its code was copied. Differences from Spellbound, chosen for a child who discourages easily: no timers, no best scores, no unlock gating, no lives.

### Baffle

A 5×5 grid of letters. Slide a finger across letters that touch (diagonals count, each letter once), or tap them one by one and tap the last one again (or ✔ Check).

- Each new board is generated in the browser from `words.txt` (no extra weekly step): it hides as many list words as it can fit, whatever this week's rule is. Typical result: about 13–17 of 22 for a y/ies week, 8–9 of 12 sight words. Long words and words with many doubled letters fit less often.
- List words found go under ⭐ Spelling words (spoken aloud). Any other real word goes in the 🫙 Bonus jar. Made-up words get "Hmm, I don't know that word. Try another!" Words in `words.txt` are always accepted even if the dictionary lacks them.
- No timer, no count. A row of empty boxes per hidden list word is always shown, filled in as she finds them.
- **💡 Hint** blinks the next letter of a list word: with nothing picked it says the next open word (shortest first) and blinks its first letter; after she has picked letters it blinks the letter that continues *her* path (so the right one of two **b**s). It keeps as many of her letters as still fit an open list word and drops the rest; if none fit, it clears them and blinks a start. If her letters fit two open words, it sticks with the word it last hinted, otherwise the first slot, and says the word aloud whenever it switches words. Its slot is outlined in yellow.
- **Look-ahead** lights (yellow ring) the touching tiles that can still lead to a spelling-list word she hasn't found yet (dictionary words are ignored here, so it points only at this week's words). The current word turns green when it spells one.
- Look-ahead setting is in the parent panel: **Auto** (default), **Always on**, or **Off**. In Auto it turns off for a new board once a share of this week's list words (default 75%) are *fluent* = found N times in a row with no hint (default 2; a hinted find resets that word to 0, so it can come back on). Both numbers are set in the parent panel. Stats are per word, so new weekly words start at 0 and look-ahead comes back each week; words repeated from an earlier week keep their streak.
- After 8 minutes, 40 tries, or 12 tries in a row with nothing new, it offers "Getting tired? Let's take a break!" (Keep playing / All done). All done shows what she found and an optional "Peek at the hiding words". Tune these at the top of `js/games/baffle.js`.
- Every new word (list or bonus) is a garden point. Baffle keeps its own hidden per-word stats (found with no hint / with look-ahead off / with a hint / in a row), shown in the parent panel; it does not touch the main progress table.
- Dictionary: `dict/words.txt`, built by `python3 tools/make_dictionary.py` from the public-domain [ENABLE list](https://github.com/dolph/dictionary) (3–12 letters, about 152k words, 1.4 MB; downloaded only when Baffle opens). ENABLE is from about 2000, so newer words (email, selfie) are missing, and it includes Scrabble oddities (aah, zax). `tools/blocklist.txt` removes swear words and slurs; add to it and re-run the script. To switch to [SCOWL](http://wordlist.aspell.net/) later, pass its word file to the script.

### Code Studio

A small sprite playground in the style of [ScratchJr](https://www.scratchjr.org/): emoji sprites on a stage, each with picture-block scripts.

- **Stage:** 20×15 squares; 🖼️ picks one of 8 backdrops (plain, sky, grass, space, ocean, city, sunset, night). 1–4 sprites from an emoji list (➕ adds one; tap the selected sprite's button to change or remove it). Drag a sprite on the stage, or tap an empty spot, to set where it starts.
- **Scripts:** each sprite has one or more scripts. The yellow block at the start says when it runs: 🏁 when ▶ is tapped, or 👆 when that sprite is tapped (also while other scripts are running). Tap it to switch or remove the script; ➕ New script adds another.
- **Blocks** (tabs): **Move** ➡️ ⬅️ ⬆️ ⬇️ *n* squares, ¼ / ½ turns (arrow + word), 🏠 go home; **Looks** 💬 say (a phrase list or ⌨️ type your own with the device's keyboard), 🎈 grow, 🤏 shrink, 🙈 hide, 👀 show; **Sound** 🎵 note (do re mi…), 💥 pop; **Control** ⏱️ wait (half-seconds), 🔁 repeat *n*, ♾️ forever, ⏹️ stop. Tap a chip to change it, move it one place (◀ / ▶) or remove it; drag to reorder. 🔁/♾️ open a box like Turtle Draw (one box inside another at most).
- **▶** puts every sprite back where it starts, then runs all 🏁 scripts at the same time; **⏹** stops everything (forever too). Leaving the game also stops it. Moves stop at the edge of the stage. Code can't be changed while it runs ("Tap ⏹ to change the code").
- **💾 Save** with a picture and an optional name; **📂** lists projects to open or delete (asks first); up to 12. What she is working on is also kept as a draft, so Home doesn't lose it.
- No garden points (there is no "finished" moment, and points per run would be easy to farm).
- Stored on the device only: `spelling-games.studio.projects.v1`, `.studio.draft.v1`.

### Turtle Draw

Logo-style drawing ([what is Logo](https://el.media.mit.edu/logo-foundation/what_is_logo/logo_programming.html)): she builds a program from blocks and a turtle draws it. The turtle starts in the middle facing up with its pencil down.

- **Blocks:** ⬆️ forward / ⬇️ back (tap the chip to pick a distance, 10 to 200 counting by tens; 50 to start), ↺ ↻ ¼ and ½ turns (arrow + word), ✏️ pencil down / pencil up (the same pencil turned upside down), 🎨 colour (picks from 8), 🔁 repeat. Tapping 🔁 opens a box: blocks go inside until ✅ Close the box. A box can hold one more box. Tap any chip to change its number or colour, move it one place (◀ / ▶), or remove it; drag a chip to move it within its row or its box (dragging a box's 🔁 chip moves the whole box; moving steps into or out of a box is not supported yet); ✕ Undo removes the last step.
- ▶ Play draws from the start every time, 👣 Step draws one block, ⏹ stops. 🐢/🐇 sets the speed (remembered). If the turtle would leave the canvas it stops at the edge.
- **📝 Logo** shows the same program as real Logo text, one line per block, e.g. `REPEAT 4 [FORWARD 50 RIGHT 90] ; RIGHT 90 = ¼ turn ↻ clockwise`. Logo's `RIGHT` is clockwise and `LEFT` counter-clockwise; colours use the usual Logo numbers (`SETPENCOLOR 4` = red, [FMSLogo's table](https://fmslogo.sourceforge.io/manual/command-setpencolor.html)). Read-only for now.
- **🖍️ Free draw** + **🖼️ My drawings**: 💾 Save keeps the picture and its program on this device (up to 12; 1 garden point each, at most 3 per visit). Tap a drawing to open it again; 🗑 deletes it (asks first).
- **🎯 Copy the shape**: 10 shapes (line, L, U, square, rectangle, plus sign, staircase, dashed line, square spiral, window) shown as a faint outline. Covering the outline gives a sparkle, a garden point and a ⭐ on the picker; otherwise just "Try changing a step!" Drawing a side in two pieces counts; scribbling over everything does not.
- Stored on the device only: `spelling-games.turtle.gallery.v1`, `.turtle.done.v1`, `.turtle.fast`.

### Robot Course

A virtual copy of her Fisher-Price Code 'n Learn Kinderbot (Code mode only), drawn from scratch. She punches steps into the robot's head, presses the orange key, and watches it drive on a grid.

- **Head** = the toy's layout and colours: 10 lights on top; green ⬆ forward (top), red ⬇ back (bottom), blue ↺ ¼ counter-clockwise (left), purple ↻ ¼ clockwise (right), white blank centre, yellow ✕ undo the last step (bottom-left), orange ▶ run (bottom-right; becomes ⏹ while running). Turn keys show the arrow and the word. The toy's grey mode keys are left out.
- Each key adds a chip in that key's colour (no 10-step limit; the strip wraps). Tap a chip for a small menu: ◀ Move left / Move right ▶, or 🗑️ Remove (tapping no longer deletes straight away, so a slipped drag can't lose a step). Chips can also be dragged to a new place (the toy only has backspace). Off the head: 👣 Step (one step per tap) and 🧹 Clear all (asks first). On a keyboard: arrows add steps, Backspace = ✕, Enter = run.
- The robot only moves on ▶. The light and chip for the current step glow (step 11 carries on from the first light). A bump into a wall, cone or the edge is a "bonk" wiggle: the robot stops, that chip pulses, "Let's fix the plan!", program kept. Not reaching the flag: "Almost! Add more steps?" Either way, after a moment a faded copy of the robot stays where it stopped, orange arrows show the path it took, and the robot goes back to its start square (always marked with a dashed outline and an arrow for the way it faces). They stay while she edits and clear when she runs again. ⏹ leaves the robot where it is.
- Reaching 🏁: dance, confetti, 1 garden point (every time). 💎 gems are optional and just for fun.
- **🗺️ Courses**: 18 ready-made courses in `js/games/robot-levels.js` (5×5 to 7×7): straight lines, one turn, two turns, turn around, gems, mazes. All open; a finished one gets a ⭐ on the picker. Each has a known solution the tests run.
- **🧱 Build my own**: 6×6 grid; pick 🧱 wall, cone (a drawn orange traffic cone), 💎 gem, 🏁 flag, 🤖 robot (tap it again to turn it) or 🧽 eraser and tap squares; tap a piece again to remove it. Walls can also be dragged: slide a finger across squares to build a long wall (starting on a wall takes walls away instead). The other pieces are one square each. 💾 Save course keeps it on this device (up to 12); 🤖 Code it! drives it. Remove one with the 🗑 on its tile in the list, or 🗑️ Delete course in the builder (both ask first).
- First launch asks her to name the robot with the device's own keyboard (optional; "Skip" = Robo). ✏️ Rename is on the picker.
- Stored on the device only: `spelling-games.robot.name`, `.robot.done.v1` (finished course ids), `.robot.mine.v1` (her courses). Not in the hidden progress.

### Battle Buddies

Two buddies face each other, each with a row of hearts (3, 5 or 7). Players take turns; each turn is one question (Spelling / Math / Both, plus the shared math level). Right answer (second chance included): your buddy sends a ✨ sparkle that pops one of the other side's hearts. Not right this time: no sparkle, and nothing is lost. Pop all the other side's hearts to win.

- **1 player** plays the computer (🤖, named after her Robot Course robot, else Robo). **How tricky**: Easy / Just right (default) / Tricky.
- The computer follows her quietly: `js/games/battle-bot.js` keeps a hidden estimate per kind (spelling, and each math level): a weighted average of her answers (right first time = 1, on the second chance = ½, else 0) that leans on recent turns. On an ordinary turn the computer's chance of being right is her estimate minus a random 8–20% of it (Just right; Easy 25–40%, Tricky 2–8%), so strictly below her. On a "lucky" turn (12%; Easy 5%, Tricky 20%) it plays at her level or up to 8% above (Easy 5%, Tricky 10%). Tune `BOT_LEVELS`.
- Its mistakes are believable (`js/mistakes.js`) and explained afterwards. Spelling: sounds-like spellings (*becuz*, *cood*, *whail*, *sed*, *peeple*), y/ie traps, doubled/undoubled letters, swapped vowels; never a real word or another list word. Math: forgot to carry (47 + 38 = 75), the "wrote 15 in the ones place" slip (715), subtracting the smaller digit from the bigger (53 − 27 = 34), borrowing without taking the ten away (36), a times-table neighbour (7 × 8 = 63), the wrong operation, one off. These follow the classic "buggy procedure" studies (Brown & Burton 1978) and table-neighbour errors (Campbell & Graham 1985). Questions are single operations, so there are no order-of-operations slips.
- **2 players** take turns on one device; no computer.
- Spelling answers count in the hidden progress (hers only, never the computer's); every answer of hers is a garden point. Grown-ups panel **Erase history** also clears the computer's estimate. Options are remembered on the device (`spelling-games.battle.options`); estimate `spelling-games.battle.skill.v1`.
- Hearts and a winner are new for this site (the other games avoid anything that looks like losing). The copy stays gentle ("No sparkle this time", "Robo wins this time! That was a close one. Rematch?"), and with Just right she should win most games. Watch how she takes a loss; Easy is there if needed.

### Dragon Egg Quest

An Oregon Trail-style journey: carry a dragon egg from Willow Village to Dragon Mountain with Pip the pony. The trail map shows the stops: Willow Village (shop) → Whispering Woods → Rushing River → a fork (🌉 Troll Bridge, short, or 🌼 Sunny Meadow, long and restful) → Market Town (shop) → Crystal Caves → a fork (🏔️ Windy Pass, short, or 🦉 Owl Tower, long) → Dragon Mountain, where the egg hatches and she names the baby dragon (device keyboard). Her dragons line up on the setup screen.

- Each trail step eats a 🍎 snack and may bring an event (berries, rain, a lost horseshoe, a faded sign, a cheeky squirrel, a wizard…); most events ask a question (Spelling / Math / Both), and a right answer turns out a bit better. The river has three ways across (wade: 1 question, raft: 2, ferry: 4 🪙). Shops ask a money word problem for her math level (change, totals, "how many can you buy").
- Nothing is ever lost for good: a missed answer costs at most one snack, running out of snacks means a stop to find food, a shop never refuses her, and every trip ends with the egg hatching. About 15–20 questions per trip.
- The trip is saved as she goes (`spelling-games.quest.save.v1`): **Continue the quest** next time. Dragons: `spelling-games.quest.dragons.v1`. **🔊 Read to me** reads each scene aloud.
- All story text is in `js/games/quest-story.js` (stops, events, prices); edit freely.

### Zombie Trail

Roll a die, answer a question. Right: move ahead by the roll. Wrong: move back by the roll. Landing on a 🚀 shortcut jumps you ahead; landing on a 🧟 zombie sends you back (arrows and "→ 23" / "← 11" labels show where). Reach square 35 (🏁) to win; you do not need an exact roll.

- Setup screen: 1 or 2 players (taking turns on one device) and questions = Spelling / Math / Both. **⚙️ More options** opens a pop-up with the rest (a one-line summary shows under the button; choices are remembered on that device):
  - **Zombies**: 1-4 (default 3).
  - **Jump size**: how far a 🚀 rocket sends you ahead and a 🧟 zombie sends you back, 3-5 up to 8-10 (default 7-9).
  - **After a zombie is hit**: it stays (default) or fades away for the rest of the game.
  - **Second chance**: on by default (one more try before moving back); turn it off for the strict rules.
- A new random board is generated each game (4 rockets plus the chosen number of zombies). Jumps never chain, no two zombies sit on consecutive squares, and where it fits, no zombie is within 6 squares after another zombie's landing spot, so the roll right after a zombie can't land on another one. With 7+ jumps it can't land on the same zombie either. With 4 zombies at jump size 5-7 or 6-8 that doesn't always fit, and the game quietly drops that last rule for that board.
- Spelling questions use your `words.txt` (hear the word, type it) and are recorded in the hidden progress like the other spelling games. Math (grade-3 style add/subtract within 100, times tables up to 10, matching division) is not recorded.
- Tune the math or the board in `mathProblem()` / `makeBoard()` at the top of `js/games/zombie.js`.

Design choices for a child who discourages easily: no scores, counters, timers, or "wrong" messages. Misses get "Almost! Try again." After repeated misses the word is shown so she can see it, then the game moves on. Rounds are about 10 words; words she has needed help with are quietly chosen more often.

The on-screen keyboard avoids iPad autocorrect and predictive text. A physical keyboard also works. In the grown-ups panel, **Spelling keyboard → Let her choose ABC or QWERTY** adds an ABC | QWERTY switch to the keyboard: ABC puts the letters in alphabet order (bigger keys on a phone, vowels lightly tinted). Her choice is remembered on that device; the default is QWERTY only. On touch screens, the letter under her finger pops up above the key while she presses it (either layout), like a phone keyboard.

## Hidden progress (grown-ups only)

Spelling questions in Jumble, Fill, Listen & Type, Spell Catcher, Word Volcano, Wordal, Look-Cover-Write-Check, Zombie Trail, Lily Pad River, Battle Buddies and Dragon Egg Quest record, per word, whether she got it on the first try or needed help. Memory Match, Word Search, Baffle (its own stats, above), the math games, Robot Course, Turtle Draw, Code Studio, Spot Match, Simon Says, and math questions in the mixed games do not record anything (Battle Buddies keeps its own hidden estimate, above). In Wordal, "first try" means solved within the first two guesses.

Open the panel from the home screen by either:
- tapping the **"Spelling Time" title 5 times within 3 seconds**, or
- typing **parent** on a keyboard.

Nothing visible links to it.

**Passcode.** The first time the panel opens it asks you to choose a 4–6 digit passcode (typed twice), or tap **Don't use a passcode** if you don't want one (you can set one later in the panel). With a passcode it then shows a **recovery code** (like `7K3Q-M9TD`): write it down or take a photo, and keep it where your child can't see it. Nothing is saved until you tap **I've saved it**, so the passcode can never be saved without you having seen its code; if the device refuses to save, or the passcode was changed in another tab meanwhile, it says "Not saved" and nothing changes. After that the panel asks for the passcode every time it opens. After 3 wrong tries it waits 30 seconds, then twice as long after each further wrong try (up to an hour), even if the page is reloaded. **Forgot it?** Tap *Forgot passcode?* and enter the recovery code to choose a new passcode (you get a new recovery code too). Without the recovery code there is deliberately no reset inside the app, because a child could use it too; the only way out is clearing the website's data in the browser settings, which also erases the practice history, the garden and saved coding projects. Inside the panel: *Change passcode* (keeps the recovery code), *New recovery code* (the old one stops working) and *Turn off passcode*. The passcode is stored as a salted hash, not as the digits. It keeps a curious child out; it is not real security (anyone with the browser's developer tools can get past it). Set it up yourself before your child finds the panel.

**https only.** The passcode needs the browser's Web Crypto, which plain `http://` doesn't have. The page sends `http://` visits on a real host name to `https://` (also turn on *Enforce HTTPS* in the repo's Settings → Pages, so the server does it first). Testing on `http://localhost` works; on `http://<IP address>` (another device on the home network) the panel stays shut and says it needs https, unless you chose no passcode.

Data lives in `localStorage` for that browser on that device only (not synced between iPad and Chromebook). Browsers can clear site storage (Safari in particular if the site goes unused for a while), so treat it as a convenience, not a record.

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

## Offline and updates

The site saves an offline copy of itself (every game, the dictionary, the recordings) the first time it opens with internet, and from then on opens from that copy, online or not. Built for the iPad Home Screen app and the Chromebook app; it works the same in a normal browser tab. Code: `sw.js` (a service worker) and `js/offline.js`.

- **Install:** iPad: Safari > Share > Add to Home Screen. Chromebook: Chrome's install icon at the right of the address bar, or Install in Chrome's ⋮ menu (the menu wording varies between Chrome versions). Open it once with internet so the offline copy is saved.
- **Updates (words, games, fixes):** just push. The app checks when it starts and whenever it comes back to the front (switching back to it on the iPad counts). If anything changed, the new files are downloaded in the background and the app reloads **on the home menu**. A game in progress is never interrupted: the update waits until she taps Home. No notice is shown.
- **Offline:** she gets the last copy that was saved (last week's list if this week's never arrived). The update check fails silently.
- **Grown-ups panel > App updates:** shows how many files are saved and when. **Check for updates** checks now and reloads (use after a code push if you don't want to wait). **Reset offline copy** deletes the saved files and downloads them again; progress, Baffle stats and the garden are kept (they live in `localStorage`, not in the offline copy). Prefer these over deleting the Home Screen icon or clearing website data, which can erase her progress.
- **How it decides something changed:** GitHub Pages ETags are `"<deploy time>-<file size>"` in hex, so every push changes every ETag, even for untouched files. The quick check asks for `words.txt` (compares the text) and `js/app.js` (compares the ETag); if either moved, or the last full check is over 6 hours old, every saved file is compared by size and content, and only real changes trigger a reload.
- **Avoiding a half-updated app:** a push can land while the app is checking, and the CDN can briefly hand out an old copy of a file. A new copy is used only if all its code and text files carry the same deploy time (within 20 s); otherwise the app keeps its current copy and tries again a few seconds later, then at the next check. The grown-ups panel shows the last result. This relies on GitHub's current ETag format (not documented by GitHub); see CLAUDE.md for the assumptions.
- **Self-repair:** a small script in `index.html` (outside the app's code) asks for a full re-check and reloads if the app has not started within 10 seconds or hits a script error while starting. After start-up, a script error also triggers a full re-check (applied on the home menu). Details in issue #13.

### Turning the offline copy off

If the offline copy ever misbehaves and you want the plain online site back on every device:

```
cp tools/sw-off.js sw.js
git commit -am "Turn off the offline copy" && git push
```

Leave that file in place. **Don't just delete `sw.js` or revert the change:** a device that already has the offline copy keeps it when `sw.js` disappears, and would stay on the old copy with nothing left to update it. Browsers re-download `sw.js` on every launch, so each device picks up the kill switch the next time the app opens with internet; it deletes the saved files and switches itself off (progress, Baffle stats and the garden are kept). To turn offline back on later, `git checkout <commit> -- sw.js` with the real one and push.

### Try it on your Mac

Service workers only run over https or on `localhost`, so test on the Mac itself (an iPad pointed at the Mac's address over plain http gets no offline copy). Use the bundled server, not `python3 -m http.server`: it sends GitHub Pages-style ETags, which the update check relies on (with plain `http.server` updates are never applied).

```
python3 tools/serve.py          # serves the whole repository; open http://localhost:8000/pes3/
```

1. **First load:** open the page in Chrome (or Safari). In Chrome, DevTools > Application shows the service worker and, under Cache storage, a `pes3-c1-…` cache. Type `parent` on the home screen: App updates should say "Offline copy: N files".
2. **Offline:** stop the server (Ctrl-C) and reload: the app still opens; open a few games, including Baffle and one with recordings.
3. **New list at the menu:** start the server again first (`python3 tools/serve.py`; nothing can update while it is stopped). Change the first line of `words.txt` (the list title) and save. Switch to another tab in the same Chrome window and back (clicking another app's window may not count as hiding the page). Within a second or two the menu reloads with the new title; if not, the grown-ups panel's "Last check" line says why.
4. **New list during a game:** open a game, change the title again, switch away and back: the game must not reset. Tap Home: the new title appears.
5. **Code change:** edit any file under `js/`; the next return to the tab picks it up the same way.
6. **Install as an app (optional):** Chrome's install icon in the address bar opens it in its own window, like the Chromebook app.
7. **Kill switch (optional):** `cp tools/sw-off.js sw.js`, reload twice: DevTools shows no service worker and no `pes3-` cache. Then `git checkout sw.js` to restore the real one (don't commit the kill switch by accident).
8. **Clean up:** grown-ups panel > Reset offline copy, or DevTools > Application > Clear site data. `localhost` has its own storage, separate from the real site, so this doesn't touch her data on jasonandann.net.

## Test locally

`fetch()` does not work from `file://`, so serve the folder (`python3 tools/serve.py` from `pes3/` also works and is needed for the offline copy to pick up edits, see above):

```
python3 -m http.server 8000
# open http://localhost:8000
```

Automated browser tests (optional): `pip install playwright && playwright install chromium`, then `python3 tests/smoke_test.py`, `python3 tests/zombie_test.py`, `python3 tests/new_games_test.py`, `python3 tests/baffle_test.py`, `python3 tests/river_test.py`, `python3 tests/robot_test.py`, `python3 tests/turtle_test.py`, `python3 tests/studio_test.py`, `python3 tests/deeplink_test.py`, `python3 tests/keyboard_test.py`, `python3 tests/parent_test.py`, `python3 tests/battle_test.py`, `python3 tests/quest_test.py`, `python3 tests/wordsearch_test.py`, `python3 tests/sw_test.py` (offline copy and updates; serves a temporary copy of the site that imitates GitHub Pages). The tests use their own word list (`tests/fixtures/words.txt`), so editing `words.txt` never breaks them. See `CLAUDE.md`.

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
js/settings.js       grown-ups settings (passcode and, later, parental controls)
js/passcode.js       passcode hashing, wrong-try waits, recovery code
js/parent-lock.js    passcode screens in front of the panel
js/offline.js        registers sw.js, update checks, reload on the home menu
js/math.js           math question generator, level picker, quiz loop
js/challenge.js      one question with an answer box (Battle Buddies, Dragon Egg Quest)
js/mistakes.js       believable misspellings and math slips
js/games/*.js        one file per game (mathquiz.js holds 5 math games; robot-levels.js = Robot Course maps; quest-story.js = Dragon Egg Quest's story; battle-bot.js = the computer player)
js/code/             shared coding engine (program walker/runner, step chips, turn words, beeps)
audio/               optional recordings + manifest.json + pronunciations.txt
dict/words.txt       real-word list for Baffle (generated; see tools/make_dictionary.py)
tests/               Playwright tests
sw.js                offline copy + update checks (service worker)
manifest.webmanifest  app name/icons for installing (Chromebook)
icons/               192/512 px app icons (upscaled from ../images/pes-logo.png; replace with sharper ones any time)
CLAUDE.md            context for Claude Code
tools/check_words.py optional list checker
tools/make_audio.py  optional macOS audio generator
tools/make_dictionary.py + blocklist.txt   rebuilds dict/words.txt
tools/serve.py       local server that behaves like GitHub Pages (for trying the offline copy)
tools/sw-off.js      kill switch: copy over sw.js to turn the offline copy off everywhere
```

## Known limits

- Without recordings, speech uses the browser's built-in text-to-speech. Voice quality differs by device, and on iOS speech only plays after a tap (the games speak on taps, and every game has a 🔊 button).
- If a device has no text-to-speech at all, the hear-it games lose their audio prompt.
- Wordal and Puzzle Pieces may scroll a little on phones and very short screens; they are tuned for iPad and Chromebook sizes.
- Not tested on a real iPad/Safari: tests use desktop Chromium with touch emulation. That includes the offline copy and updates (service workers behave differently in Safari, and a Home Screen app may keep its own storage separate from Safari).
