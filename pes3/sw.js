// Offline copy and updates for the study games (issue #13). Plain service worker: no build step, no file list.
//
// Serving: cache first, so the app opens instantly and works offline. Files are cached as they are fetched,
// and the page sends a "warm" list (every file it loaded, plus the dictionary and recordings) after it starts.
//
// Updates: the page asks for a "check" on launch (full) and when the app comes back to the front (probe).
// Changed files go into a new cache generation that replaces the old one only once it is complete, and only
// if every code/text file in it comes from the same deploy (see consistent()). The page reloads on the home menu.
//
// GitHub Pages ETags are "<hex deploy time>-<hex size>" (measured 2026-10-22): every deploy changes every ETag,
// even for unchanged files, and the time part can differ by a second between files. So sizes and bytes decide
// whether a file changed, a file's ETag is only compared with its own stored ETag, and the time parts of a whole
// set say whether the set is from one deploy.

const PREFIX = 'pes3-c1-'; // cache generations are PREFIX + timestamp; bump "c1" only if this layout changes
const DONE = '__complete__'; // written last: a generation without it is unfinished
const BIG = /\/dict\/|\.(m4a|png)$/; // data (recordings, dictionary, images): checked by size first, downloaded only if it moved
const TAG = /^(?:W\/)?"([0-9a-f]+)-([0-9a-f]+)"$/; // nginx-style ETag: hex mtime - hex size
// One deploy stamps its files within about a second of each other (one sample: 1 s); deploys are 30+ s apart
// (36 s and 41 s from merge to stamp in two samples). Files more than WINDOW seconds apart = mixed deploys.
const WINDOW = 20;
const RETRY_MS = [3000, 6000]; // waits before the 2nd and 3rd round when a set is mixed (mid-deploy, CDN catching up)

const abs = (u) => new URL(u, self.registration.scope).href;
const isDone = (req) => req.url.endsWith('/' + DONE);
// Stored and served copies say "no-cache", so the browser always comes back to this worker. With GitHub's
// max-age=600, Chrome reused a still-fresh in-memory module on reload and skipped the worker, so an update
// would not have shown for up to 10 minutes (seen in tests/sw_test.py).
function keep(res) {
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
const tagPart = (tag, i) => { const m = TAG.exec(tag || ''); return m ? parseInt(m[i], 16) : null; };
const timeOf = (tag) => tagPart(tag, 1);
const sizeOf = (tag) => tagPart(tag, 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const etagOf = (res) => res.headers.get('etag');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // Drop caches from an older layout (pes3-* but not PREFIX), then take over open pages.
  for (const n of await caches.keys()) if (n.startsWith('pes3-') && !n.startsWith(PREFIX)) await caches.delete(n);
  await self.clients.claim();
})()));

/* ---------- which cache is live ---------- */
let live = null; // Promise<name|null>, remembered while this worker runs

async function findLive() {
  const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX)).sort().reverse(); // newest first
  for (const n of names) if (await (await caches.open(n)).match(DONE)) return n;
  return null;
}
const getLive = () => (live ||= findLive());

async function promote(name) {
  live = Promise.resolve(name);
  for (const n of await caches.keys()) if (n.startsWith(PREFIX) && n !== name) await caches.delete(n);
}

async function newName() {
  const cur = await getLive();
  const t = Math.max(Date.now(), cur ? Number(cur.slice(PREFIX.length)) + 1 : 0);
  return PREFIX + t;
}

/* ---------- serving ---------- */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(serve(req, e));
});

async function serve(req, e) {
  const name = await getLive();
  const cache = name ? await caches.open(name) : null;
  const nav = req.mode === 'navigate';
  const hit = cache && await cache.match(req, { ignoreSearch: nav });
  if (hit) return req.headers.has('range') ? ranged(hit, req.headers.get('range')) : hit;
  try {
    const res = await fetch(req);
    // Keep new files (a game opened for the first time). Partial (range) responses are never stored.
    if (!cache || res.status !== 200 || res.type !== 'basic' || res.redirected || req.headers.has('range')) return res;
    const kept = keep(res);
    await cache.put(req, kept.clone());
    e.waitUntil(verifySoon()); // the new file may be from a newer deploy than the rest: re-check the whole set
    return kept;
  } catch (err) {
    const home = nav && cache && ((await cache.match(abs('./'))) || (await cache.match(abs('index.html'))));
    if (home) return home;
    throw err;
  }
}

// Audio elements (Safari in particular) ask for byte ranges; answer them from the cached file.
async function ranged(res, range) {
  const buf = await res.arrayBuffer();
  const len = buf.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start = m && m[1] !== '' ? Number(m[1]) : 0;
  let end = m && m[2] !== '' ? Math.min(Number(m[2]), len - 1) : len - 1;
  if (m && m[1] === '' && m[2] !== '') { start = Math.max(0, len - Number(m[2])); end = len - 1; } // "bytes=-500"
  if (!m || start > end || start >= len) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${len}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${len}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

/* ---------- messages from the page ---------- */
// One job at a time (warm and check both rewrite caches). Status answers right away.
let chain = Promise.resolve();
const queue = (job) => (chain = chain.then(job, job));

self.addEventListener('message', (e) => {
  const { type, urls, full } = e.data || {};
  const port = e.ports[0];
  const reply = (v) => port && port.postMessage(v);
  let work;
  if (type === 'warm') work = queue(() => warm(urls || []));
  else if (type === 'check') work = queue(() => check(!!full));
  else if (type === 'status') work = status();
  else return;
  e.waitUntil(work.then(reply, (err) => reply({ error: String(err && err.message || err) })));
});

// Tells every open page that a new copy is in place; each reloads when she is on the home menu.
async function broadcast() {
  for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'updated' });
}

// A full check a few seconds after files were added outside a check (one at a time).
let verifying = null;
function verifySoon() {
  return (verifying ||= sleep(RETRY_MS[0]).then(() => { verifying = null; return queue(() => check(true)); }));
}

// Adds any listed file that is not cached yet. The first warm creates the first generation.
// (The page runs a full check right after, which holds the new files to the same rules as an update.)
async function warm(urls) {
  let name = await getLive();
  const fresh = !name;
  if (fresh) name = await newName();
  const cache = await caches.open(name);
  let added = 0;
  await Promise.all([...new Set(urls.map(abs))].map(async (u) => {
    if (u === abs('sw.js') || (await cache.match(u))) return;
    try {
      const res = await fetch(u, { cache: 'no-cache' });
      if (res.status === 200 && !res.redirected) { await cache.put(u, keep(res)); added++; }
    } catch { /* offline or gone: the next warm tries again */ }
  }));
  if (fresh) {
    await cache.put(DONE, new Response(String(Date.now())));
    await promote(name);
  }
  return { added };
}

/* ---------- update check ---------- */
let last = null; // { at, full, result } of the latest check, shown in the parent panel

// result: 'quiet' (probe saw nothing) | 'same' (compared everything, nothing changed) | 'swapped' (new copy in use)
//       | 'mixed' (the site's files were from different deploys every round; the current copy is kept) | 'offline'
async function check(full) {
  let result = 'quiet';
  try {
    for (let round = 0; round <= RETRY_MS.length; round++) {
      if (round) await sleep(RETRY_MS[round - 1]);
      result = await checkOnce(full || round > 0);
      if (result !== 'mixed') break;
    }
  } catch {
    result = 'offline';
  }
  last = { at: Date.now(), full: full || result !== 'quiet', result };
  if (result === 'swapped') await broadcast();
  return { updated: result === 'swapped', result };
}

// One round. Any network error throws (offline keeps the current copy).
async function checkOnce(full) {
  const name = await getLive();
  if (!name) return 'quiet';
  const cache = await caches.open(name);
  if (!full && !(await probe(cache))) return 'quiet';

  const marker = () => fetch(abs('js/app.js'), { method: 'HEAD', cache: 'no-store' }).then(etagOf);
  const before = await marker();
  const keys = (await cache.keys()).filter((r) => !isDone(r));
  const seen = await Promise.all(keys.map(async (req) => ({ req, ...(await fresher(req.url, await cache.match(req))) })));
  const after = await marker();

  // Only text/code files can break each other; recordings and the dictionary are data.
  const tags = seen.filter((s) => !BIG.test(s.req.url) && s.state !== 'gone').map((s) => s.tag);
  if (!consistent(tags, before, after)) return 'mixed';

  if (!seen.some((s) => s.state === 'changed' || s.state === 'gone')) {
    // Same bytes from a newer deploy: store them in place so the next probe compares against the new ETags.
    for (const s of seen) if (s.state === 'same' && s.res) await cache.put(s.req, s.res);
    return 'same';
  }
  const nextName = await newName();
  const next = await caches.open(nextName);
  for (const s of seen) if (s.state !== 'gone') await next.put(s.req, s.res || (await cache.match(s.req)));
  await next.put(DONE, new Response(String(Date.now())));
  await promote(nextName);
  return 'swapped';
}

// Is this set of files from one deploy? Each ETag carries its file's deploy time, so this holds whatever order
// the files arrived in, and whichever CDN server sent each one. If the ETags can't be read (GitHub changed the
// format), fall back to: js/app.js had the same ETag before and after the whole round.
function consistent(tags, before, after) {
  const times = tags.map(timeOf);
  if (times.length && times.every((t) => t !== null)) return Math.max(...times) - Math.min(...times) <= WINDOW;
  return !!before && before === after;
}

async function probe(cache) {
  const w = abs('words.txt');
  const a = abs('js/app.js');
  const [oldW, oldA] = await Promise.all([cache.match(w), cache.match(a)]);
  if (!oldW || !oldA) return true;
  const [resW, head] = await Promise.all([fetch(w, { cache: 'no-cache' }), fetch(a, { method: 'HEAD', cache: 'no-store' })]);
  if (resW.status === 200 && !(await same(resW, oldW))) return true;
  const before = etagOf(oldA);
  const now = etagOf(head);
  if (!TAG.test(before || '') || !TAG.test(now || '')) return true; // unknown ETag scheme: check everything
  return before !== now;
}

// What the site has now for one cached file:
//   { state: 'same' | 'changed' | 'gone' | 'kept', res?: Response to store, tag: ETag of the version that would be kept }
// 'kept' = the site answered with an error: keep the cached copy (its old ETag then makes the set look mixed).
async function fresher(url, old) {
  if (BIG.test(url)) {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (head.status === 404) return { state: 'gone' };
    if (!head.ok) return { state: 'kept', tag: etagOf(old) };
    const before = etagOf(old);
    const now = etagOf(head);
    if (!before || !now || before === now) return { state: 'same', tag: before }; // nothing to go on, or identical
    const size = sizeOf(before);
    if (size !== null && size === sizeOf(now)) return { state: 'same', tag: before }; // same size: same recording/list
  }
  const got = await fetch(url, { cache: 'no-cache' });
  if (got.status === 404) return { state: 'gone' };
  if (got.status !== 200) return { state: 'kept', tag: etagOf(old) };
  const res = keep(got);
  return { state: (await same(res.clone(), old)) ? 'same' : 'changed', res, tag: etagOf(res) };
}

async function same(a, b) {
  const [x, y] = await Promise.all([a.arrayBuffer(), b.clone().arrayBuffer()]);
  if (x.byteLength !== y.byteLength) return false;
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
  return true;
}

async function status() {
  const name = await getLive();
  if (!name) return { files: 0, last };
  const keys = await (await caches.open(name)).keys();
  return { files: keys.filter((r) => !isDone(r)).length, since: Number(name.slice(PREFIX.length)), last };
}
