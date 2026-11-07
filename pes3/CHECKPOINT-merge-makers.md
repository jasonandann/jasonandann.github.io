# Checkpoint: Merge Makers (2026-11-06)

Branch `claude/merge-makers` (renamed from a worktree branch; never reviewed or merged, no PR yet).

## What was asked
Jason's daughter loves the Merge Smith sub-game in Royal Match. He wanted a version for these study games using numbers instead of objects. First idea: powers of 2. Refined by Jason into a **count-by chain**: merge 3s to reach 12; the 12 is carried into the next level, where more 3s make another 12 for 24; then 6s make 24 for 48; and so on. Goal numbers have many factors, which is the math tie-in.

## Decisions (Jason's answers)
- Merge by dragging a tile onto an equal one (tap-then-tap also works).
- New tiles come from a tap-to-make crate (no auto-spawn, no timer, nothing to lose).
- Goal = reach the level's number; the goal tile carries into the next level (his Merge Smith idea).
- No study questions ("primarily a game"): lives under Brain Games. Math shows only as the sum after each merge ("6 + 6 = 12").

## Built
`js/games/merge.js` (+ `LEVELS`), `css/style.css` (Merge Makers section), `js/app.js` entry (`#merge`), `tests/merge_test.py` (12 checks, port 8784), CLAUDE.md entry. Menu is now 30 cards (31 with Crystal Cave on): the card-count checks in the other test files were bumped.

## Guessed / open
- Jason's level example repeated goal 48 with different bases (24 + four 6s; four 12s). I read it as "same goal, different starting number" and built: 3->12, 3->24 (+12), 6->48 (+24), 12->48 (+24), 6/12/24->96 (+48), 12/24->192 (+96). Confirm with him; edit `LEVELS`.
- Ideas offered, not built: a "count by 6s" row per level; a "4 x 6 = 24" line when a level ends.
- Nobody has tried it on an iPad or with her.
- Branch name still says "powers-of-2"-ish history only in commit/branch discussion; game is count-by, not powers of 2.

## Tests
All suites pass except `sw_test.py`, which is flaky independent of this change (failed on a clean checkout too; different check each run).

## Related, separate: pes3 migration
Unrelated to this branch: moving pes3 to its own repo on Cloudflare (games2study.app). See Jason's notes; open items include hostname choice and how progress moves origin.
