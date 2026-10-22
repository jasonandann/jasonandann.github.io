// Offline copy and updates for the study games (issue #13). Plain service worker: no build step, no file list.
//
// Serving: cache first, so the app opens instantly and works offline. Files are cached as they are fetched,
// and the page sends a "warm" list (every file it loaded, plus the dictionary and recordings) after it starts.
//
// Updates: the page asks for a "check" on launch (full) and when the app comes back to the front (probe).
// Changed files go into a new cache generation that replaces the old one only once it is complete,
// so a page never mixes old and new modules. The page then reloads when she is on the home menu.
//
// GitHub Pages ETags are "<hex deploy time>-<hex size>" (measured 2026-10-22): every deploy changes every ETag,
// even for unchanged files, and the time part can differ by a second between files. So a file's ETag is only
// ever compared with its own stored ETag, and sizes and bytes, not ETags, decide whether a file really changed.

const PREFIX = 'pes3-c1-'; // cache generations are PREFIX + timestamp; bump "c1" only if this layout changes
const DONE = '__complete__'; // written last: a generation without it is unfinished
const BIG = /\/(audio|dict|icons|images)\/|\.(m4a|png)$/; // compared by size only, never downloaded just to compare
const TAG = /^(?:W\/)?"[0-9a-f]+-([0-9a-f]+)"$/; // nginx-style ETag; group 1 = size in hex

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
const sizeOf = (tag) => { const m = TAG.exec(tag || ''); return m ? parseInt(m[1], 16) : null; };

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
  e.respondWith(serve(req));
});

async function serve(req) {
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

// Adds any listed file that is not cached yet. The first warm creates the first generation.
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

// Probe (full=false): has words.txt or js/app.js changed? If so, or if full, compare every cached file.
// Any network error rejects, which the page ignores (offline keeps the current copy).
// A deploy that lands during a check can leave some files from before it and some from after, so after a swap
// app.js is asked for once more: if its ETag moved on, the check runs again (at most 3 rounds).
async function check(full) {
  let updated = false;
  for (let round = 0; round < 3; round++) {
    if (!(await checkOnce(full || round > 0))) break;
    updated = true;
    if (await steady()) break;
  }
  return { updated };
}

async function steady() {
  try {
    const a = abs('js/app.js');
    const [saved, head] = await Promise.all([
      caches.open(await getLive()).then((c) => c.match(a)),
      fetch(a, { method: 'HEAD', cache: 'no-store' }),
    ]);
    return !saved || saved.headers.get('etag') === head.headers.get('etag');
  } catch { return true; } // offline now: the next check will sort it out
}

// One pass. Returns true if a new generation was swapped in.
async function checkOnce(full) {
  const name = await getLive();
  if (!name) return false;
  const cache = await caches.open(name);
  if (!full && !(await probe(cache))) return false;

  const keys = (await cache.keys()).filter((r) => !isDone(r));
  const changed = new Map(); // url -> new Response, or null if the file is gone
  await Promise.all(keys.map(async (req) => {
    const old = await cache.match(req);
    const res = await fresher(req.url, old, cache);
    if (res !== undefined) changed.set(req.url, res);
  }));
  if (!changed.size) return false;

  const nextName = await newName();
  const next = await caches.open(nextName);
  for (const req of keys) {
    if (!changed.has(req.url)) await next.put(req, await cache.match(req));
    else if (changed.get(req.url)) await next.put(req, changed.get(req.url));
  }
  await next.put(DONE, new Response(String(Date.now())));
  await promote(nextName);
  return true;
}

async function probe(cache) {
  const w = abs('words.txt');
  const a = abs('js/app.js');
  const [oldW, oldA] = await Promise.all([cache.match(w), cache.match(a)]);
  if (!oldW || !oldA) return true;
  const [resW, head] = await Promise.all([fetch(w, { cache: 'no-cache' }), fetch(a, { method: 'HEAD', cache: 'no-store' })]);
  if (resW.status === 200 && !(await same(resW, oldW))) return true;
  const before = oldA.headers.get('etag');
  const now = head.headers.get('etag');
  if (!TAG.test(before || '') || !TAG.test(now || '')) return true; // unknown ETag scheme: check everything
  return before !== now;
}

// undefined = unchanged, Response = changed, null = gone from the site.
async function fresher(url, old, cache) {
  if (BIG.test(url)) {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (head.status === 404) return null;
    if (!head.ok) return undefined;
    const before = old.headers.get('etag');
    const now = head.headers.get('etag');
    if (!before || !now || before === now) return undefined; // nothing to go on, or identical
    const a = sizeOf(before);
    if (a !== null && a === sizeOf(now)) return undefined; // same size: treat as the same recording/list
  }
  const got = await fetch(url, { cache: 'no-cache' });
  if (got.status === 404) return null;
  if (got.status !== 200) return undefined;
  const res = keep(got);
  if (BIG.test(url)) return res;
  if (!(await same(res.clone(), old))) return res;
  // Same bytes from a newer deploy: store it in place so its new ETag is what the next probe compares with.
  await cache.put(url, res);
  return undefined;
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
  if (!name) return { files: 0 };
  const keys = await (await caches.open(name)).keys();
  return { files: keys.filter((r) => !isDone(r)).length, since: Number(name.slice(PREFIX.length)) };
}
