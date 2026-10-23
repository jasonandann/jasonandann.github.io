// Shared coding engine for the 💻 Coding games (Robot Course, Turtle Draw, Code Studio).
// A program is plain JSON: an array of blocks {op, arg?, body?}; `body` is the inner list of a
// `repeat` (arg = how many times). Nothing here touches the DOM: each game supplies exec().

// Caps so a program can never freeze the iPad. budget counts every step run AND every pass
// through a repeat, so even repeat 99 of repeat 99 of nothing stops quickly.
export const LIMITS = { maxRepeat: 20, budget: 500 };

// Yields {block, path, n} for each step to run, in order. path = indexes from the top level
// down (e.g. [2, 0] = first block inside the repeat at index 2). Returns 'capped' if it stopped
// at a limit before the end, else undefined.
export function* walk(program, { maxRepeat = LIMITS.maxRepeat, budget = LIMITS.budget } = {}) {
  let left = budget;
  let n = 0;
  let capped = false;
  function* go(list, path) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.op === 'repeat') {
        const times = Math.max(0, Math.min(maxRepeat, Math.floor(Number(b.arg) || 0)));
        if (b.arg > maxRepeat) capped = true;
        for (let k = 0; k < times; k++) {
          if (left <= 0) { capped = true; return; }
          left--;
          yield* go(b.body || [], [...path, i]);
        }
      } else {
        if (left <= 0) { capped = true; return; }
        left--;
        yield { block: b, path: [...path, i], n: n++ };
      }
    }
  }
  yield* go(program, []);
  return capped ? 'capped' : undefined;
}

// Plays a program one step at a time.
//   program(): the current program (read when a run starts)
//   exec(item): async; animates one step. Return a truthy reason (e.g. 'goal', 'bonk') to end the run.
//   onStart(): async; called before the first step of each run (e.g. move the robot back to start)
//   onActive(item|null): the step being run, for highlighting
//   onEnd(reason, item): 'end' (ran out of steps), 'capped', 'stopped', or exec's reason
// play() runs from the beginning; step() runs one step, continuing the current run; stop() halts.
// While a step's animation is still going, play/step are ignored; after stop()/reset() they wait
// for that last animation to finish instead, so a quick tap is never lost.
export function runner({ program, exec, onStart, onActive, onEnd }) {
  let it = null;
  let upcoming = null;
  let playing = false;
  let busy = false;
  let busyGen = -1;
  let settled = Promise.resolve();
  let gen = 0;

  // Runs fn (onStart or exec) and remembers it, so a stale one can be waited for.
  async function track(g, fn) {
    busy = true;
    busyGen = g;
    let done;
    settled = new Promise((res) => { done = res; });
    try { return await fn(); } finally { busy = false; done(); }
  }
  // true = go ahead; false = a live step is still animating (ignore the tap).
  async function ready() {
    if (!busy) return true;
    if (busyGen === gen) return false;
    await settled;
    return !busy;
  }

  function finish(reason, item) {
    it = null;
    playing = false;
    if (onActive) onActive(null);
    if (onEnd) onEnd(reason, item);
  }

  // Runs the next step. Resolves true if there is more to run.
  async function advance(g) {
    if (!it) {
      it = walk(program());
      upcoming = it.next();
      if (onStart) await track(g, onStart);
      if (g !== gen) return false;
    }
    const cur = upcoming;
    if (cur.done) { finish(cur.value || 'end'); return false; }
    if (onActive) onActive(cur.value);
    const why = await track(g, () => exec(cur.value));
    if (g !== gen) return false;
    if (why) { finish(why, cur.value); return false; }
    upcoming = it.next();
    if (upcoming.done) { finish(upcoming.value || 'end'); return false; }
    return true;
  }

  return {
    get playing() { return playing; },
    get busy() { return busy; },
    // True between the first step() of a run and its end.
    get midway() { return !!it; },
    async play() {
      if (playing || !(await ready()) || playing) return;
      playing = true;
      it = null;
      const g = ++gen;
      while (playing && g === gen && await advance(g)) { /* next step */ }
    },
    async step() {
      if (playing || !(await ready()) || playing) return;
      await advance(gen);
    },
    stop() {
      if (!playing && !it) return;
      gen++;
      finish('stopped');
    },
    // Forget a half-finished step() run (the program changed). No onEnd.
    reset() {
      gen++;
      it = null;
      playing = false;
      if (onActive) onActive(null);
    },
  };
}
