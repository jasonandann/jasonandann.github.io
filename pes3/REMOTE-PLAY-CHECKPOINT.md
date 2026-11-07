# Remote multiplayer for the pes3 games: discussion checkpoint

Status: **ideation only** (discussed 2026-10/11). No code written. Related: the pes3 migration to its own repo on Cloudflare (games2study.app).

## Goal
Play the existing multiplayer games with the Grade-3 daughter from separate devices, not on the same Wi-Fi or in the same place. Semi-synchronous: make a move, close the app, get notified when it's your turn.

## Technical findings
- **iMessage:** no API to send from a web page or server, so it can't be automatic. An `sms:` link or `navigator.share` opens Messages prefilled, and the user taps Send. Good for sending the invite link only.
- **Official bot or messaging APIs** that can message a player with no user action: Telegram bot, Discord webhook, Slack, email, SMS via Twilio (costs money).
- **Mobile notifications:** the same Web Push mechanism as desktop (Push API + Notification API + service worker + push subscription).
  - Android Chrome: works in a normal browser tab.
  - iOS/iPadOS: works since 16.4, but only for an installed Home Screen PWA (Share, then Add to Home Screen). No permission prompt in a plain Safari tab.
  - Needs a server to send the push (VAPID keys). A Cloudflare Worker can do it.
  - Simpler alternative: ntfy.sh or Pushover. One HTTP POST, but each player installs an app.
- **Shared state** needs a small backend both browsers can reach: Cloudflare Durable Objects or KV, or Firebase/Supabase. A gist or shared doc is possible, but write tokens can't live in client JS, so put a tiny Worker in front.

## Design sketch (two known players, so no accounts, lobby, or anti-cheat)
- Private room: link or short code like `FOX-42`, shared over iMessage.
- Each device remembers "I'm player N in room X" in `localStorage`.
- Turn-based flow: open, see whose turn, move, close. Optional push when it's your turn; without it she'd have to check manually or get a text.
- Rooms expire after a while; an unfinished game survives a closed tab.
- A single "Play with Dad" button that remembers the room would suit a kid better than typing codes.
- A friendly "waiting for Dad..." screen, with no visible timer (the discouragement rules in CLAUDE.md still apply).

## What the code looks like (read 2026-11)
All multiplayer games are **turn-based**:
- `js/games/battle.js` (Battle Buddies): strict alternation. The "Race" and "Together" options only change the win condition. It has a `hooks.state` exposing `{turn, hearts, love, shared, goal, theme, play}` and a "▶ Go!" tap before each turn (needed for iOS speech).
- `js/games/cave.js` (Crystal Cave): `st.turn`, `holder`, `passTo()` pass-the-device screens, serializable `st` plus `save()`; rules in `cave/rules.js` and `cave/bot.js` (UI and rules are separate). Has per-player hands and mid-turn "ask a teammate for a card" requests.
- `js/games/zombie.js` (Zombie Trail): board race, roll, answer, move. Turn-based.
- `js/games/guesswhat.js`: "Take turns" is against the computer only.
- Everything else is single-player.

Complications:
1. Private per-player data (Cave hands, per-player `spell`/`math` levels), so each device needs its own view.
2. Questions and answers run locally on each device (iOS speech must fire in the tap). The opponent only needs the turn's result.
3. Answer checks run client-side, so they aren't tamper-proof. Fine for family use; the server can just relay.
4. **Conflict with a hard constraint:** CLAUDE.md says "No build, no deps, no server, no framework." Remote play needs a Worker. Proposal: keep it a separate optional component used only when choosing "Play online"; offline single-device games and the weekly `words.txt` workflow stay untouched.

## Recommended path (not yet agreed)
1. Worker with a Durable Object per game room (holds state, validates turn order) at games2study.app.
2. Start with **Battle Buddies** (two sides, strict alternation, smallest state). Crystal Cave second (hidden hands, mid-turn help).
3. Build a shared "room" wrapper so sync is written once and games plug in, instead of per game.
4. Notifications: Web Push first; optional ntfy or Telegram fallback.

## Open questions
- Which game does she most want to play remotely first? (Battle Buddies suggested.)
- What devices do you each use (iPhone, iPad, Android, Chromebook, laptop)? iOS means the Home Screen PWA step for push.
- Is adding a Worker acceptable next to the "no server" rule, or use only a third-party hosted real-time DB?
- Sequence: do the Cloudflare/games2study.app migration first, or alongside, or wait?
- Is hidden-information strictness (server filtering each player's view) needed, or fine to ignore for family play?
