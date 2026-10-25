# Baffle look-ahead experiments (parked branch)

**Status: parked, not merged. Kept for reference (Jason, 2026-10-25).**
Branch `claude/baffle-lookahead-paths`, started from master after PR #15 (issue #6). Master's look-ahead
is still the PR #15 version: a yellow ring on each touching tile that leads to an unfound list word.

## Goal
After she picks letters, tint every remaining path to an unfound spelling-list word, one colour per
"branch" (the next tile), with alpha by how many words pass through a tile, so overlapping branches blend.
Jason's example: on `ate / cin / qpz / szz` with tip, tin, ten listed and tips not, tapping T tints I-P
and I-N one colour and E-N another; S stays plain.

## What was tried, and why each was dropped (commit order)
| Commit | Attempt | Outcome |
|---|---|---|
| `2b1c6a9` | Tint **every** route of every word | On boards with repeated letters (Jason's HU + two R's/Y's/S's, hurry/hurries) both branches covered the same tiles and blended into one flat mauve. |
| `efc1cbc` | **One route per word**, the `findPath` route the Hint uses; recomputes if she takes another route | Kept. Fixed the mush. `lookaheadBranches()` is a pure exported function. |
| `594bd6a` | Shared tiles: stacked alpha layers vs **diagonal** split vs reordered "better blend" palette | Equal-alpha pink + teal blends to grey (looks "disabled"). Diagonal implies coming from the coloured side; stripes have the same problem. |
| `441c016`, `ff1e733` | **Checkerboard** of branch colours (conic-gradient cells); first 8x8 too fine/pale, then 4x4 at alpha >= 0.4 | Directionless and readable for 2 branches. Chosen over blend modes. |
| `1b33d9a` | 3-4 branches: 3 wedges repeated, then 4-quarter cells with a blank quarter for 3 | 3 wedges repeated into upward chevrons (direction again); blank-quarter version looked goofy. |
| `7bf6fe3` | 3 branches: one **6-slice pie** (1,2,3,1,2,3) centred on the letter | Each colour faces itself across the centre, reading as a line. 12 slices has the same flaw. |
| `94f0643` | **9-slice pie** (colours 120 degrees apart; odd repeats never face themselves); 5+ go round once. Colour-blind palette (below) | Best of the attempts, but Jason wasn't happy with the overall look and parked it. |

Rule worth keeping: for a radial split, each colour must repeat an **odd** number of times, or it ends up
opposite itself. Checkerboards also line up same colours on diagonals (weaker, since cells are small).

## How rare are overlaps? (`tools/lookahead/overlap.py`)
150 generated boards per list, nothing found yet (worst case):

| List | Point in play | Branches shown | Most branches on one tile |
|---|---|---|---|
| Oct 28 `words.txt` (22 y/ies words) | after 1st letter | 1: 91%, 2: 8.5%, 3: 0.1% | 1: 98.5%, 2: 1.5% |
| | each step along a hidden word | 1: 76%, 2: 24%, 3: 0.2% | 1: 97.7%, 2: 2.3% |
| `tests/fixtures/words.txt` (12 mixed) | after 1st letter | 1: 85%, 2: 9%, 3: 6% | 1: 91%, 2: 9% |
| | each step along a hidden word | 1: 92%, 2: 4%, 3: 4% | 1: 95%, 2: 5% |

3+ branches on one tile never occurred. Words sharing a start (bunny/bunnies) stay in one branch; an
overlap needs words that split right after her letters and meet again later (bunnies/butterflies on one
I-E-S). Lists built around a shared ending (-ing, -tion) would make it more common.

## Colour blindness (`tools/lookahead/cvd.py`, `cvd_search.py`, `sim_img.py`)
Machado et al. 2009 simulation (severity 1.0) of the tile tint (alpha 0.4 over white), smallest CIE76
distance between any two of the first four colours (about 5+ is noticeable side by side):

| Palette | Normal | Protan | Deutan | Tritan |
|---|---|---|---|---|
| Old: pink, teal, orange, lime | 35.6 | 14.8 | **2.4** (pink/teal) | 6.8 |
| New: orange (230,159,0), cyan (102,204,238), purple (170,51,119), green (34,136,51) | 27.7 | 17.8 | 14.5 | 12.7 |
| New, first two only (the common 2-branch case) | 47.4 | 44.6 | 47.8 | 39.1 |

Picked from [Okabe-Ito](https://jfly.uni-koeln.de/color/) and [Paul Tol](https://personal.sron.nl/~pault/)
colours, excluding grey (looks "disabled") and anything within 30 of the selected-tile indigo. With
deuteranopia purple/green become grey/khaki, the closest pair. Simulation only; not tested with people.

## TEST ONLY code to remove before any PR
In `js/games/baffle.js`, `css/style.css` (`.bf-test`), `tests/baffle_test.py` (search `TEST ONLY`):
- Fixed boards: bunny/butterfly `UBPHS NEUTN NDRRT YIAFE ESLYA` (your `words.txt`) and a vowel board
  `KQZXK KZAEK QZBTS KZIOK QXZKQ` with its own lists (bats/bets/bits, + bots). Add `?random` to the URL
  for normal boards; the tests do.
- On-screen toggle: shared-tile mode Checkered / Better blend / Both (key `spelling-games.baffle.overlap`)
  and board Bunny (2) / 3-way / 4-way (key `spelling-games.baffle.testboard`).
- Keep only the chosen mode; drop `BLEND_RGB` if blend is not kept.

## Picking it up again
1. `git checkout claude/baffle-lookahead-paths`, then `git merge origin/master`. Master has moved a lot since
   (about 75 PRs by 2026-10-25), so expect conflicts in `pes3/CLAUDE.md`, `pes3/README.md`,
   `pes3/css/style.css`, `pes3/js/games/baffle.js` and the tests.
2. Run `python3 tests/baffle_test.py` from `pes3/` (86 checks at park time), then the rest of the suites
   that master's `CLAUDE.md` lists.
3. Look at it: `python3 -m http.server 8000` in `pes3/`, open Baffle, tap B, flip the test toggle.
   `tools/lookahead/compare.py` and `multi.py` take the same screenshots.
4. Tests in cloud sessions: `pip install playwright==1.56.0` matches the preinstalled Chromium.
