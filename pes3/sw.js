// Offline copy and updates for the study games (issue #13). Plain service worker: no build step, no file list.
//
// Serving: cache first, so the app opens instantly and works offline. Files are cached as they are fetched,
// and the page sends a "warm" list (every file it loaded, plus the dictionary and recordings) after it starts.
//
// Updates: the page asks for a "check" on launch (full) and when the app comes back to the front (probe).
// Changed files go into a new cache generation that replaces the old one only once it is complete, and only
// if the whole set matches one version of the site. The page reloads on the home menu.
//
// Knowing what changed and that the set is from one deploy: the site publishes version.json (tools/make_manifest.py,
// run by the host's build): {v, files: {path: sha256}}. A copy is used only if every file's bytes match that manifest
// and the manifest did not change during the round. No HTTP header (ETag, Last-Modified) is read.
// Without a usable manifest (missing, malformed) the worker compares bytes instead: a changed file must read the
// same twice, big data files are skipped when their Content-Length is unchanged. If the manifest is stale (the
// bytes are not what it says, yet it is the same version we already hold) it is ignored the same way.

const PREFIX = 'pes3-c1-'; // cache generations are PREFIX + timestamp; bump "c1" only if this layout changes
const DONE = '__complete__'; // written last: a generation without it is unfinished
const MAN = '__manifest__'; // the version.json this generation was checked against (absent = none)
const BIG = /\/dict\/|\.(m4a|png)$/; // data (recordings, dictionary, images): without a manifest, skipped when the size is unchanged
// Small files that are always downloaded and held against the manifest, even when our copy matches it. They are what
// changes in nearly every release (the weekly list, the entry page, the app), so a stale manifest shows up here.
const CANARY = new Set(['index.html', 'js/app.js', 'words.txt']);
const RETRY_MS = [3000, 6000]; // waits before the 2nd and 3rd round when a set is mixed (mid-deploy, CDN catching up)

const abs = (u) => new URL(u, self.registration.scope).href;
const isMeta = (req) => req.url.endsWith('/' + DONE) || req.url.endsWith('/' + MAN);
// Stored and served copies say "no-cache", so the browser always comes back to this worker. With GitHub's
// max-age=600, Chrome reused a still-fresh in-memory module on reload and skipped the worker, so an update
// would not have shown for up to 10 minutes (seen in tests/sw_test.py).
function keep(res) {
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Path of a URL inside the scope ('' = the start page = index.html); null for other origins and query strings.
function relOf(url) {
  const u = new URL(url);
  const scope = new URL(self.registration.scope);
  if (u.origin !== scope.origin || u.search || !u.pathname.startsWith(scope.pathname)) return null;
  return u.pathname.slice(scope.pathname.length) || 'index.html';
}
async function sha256(buf) {
  const d = await self.crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const HEX64 = /^[0-9a-f]{64}$/;
function validManifest(m) {
  if (!m || typeof m.v !== 'string' || !m.files || typeof m.files !== 'object') return null;
  return Object.values(m.files).every((h) => HEX64.test(h)) ? m : null;
}
// The site's current manifest, or null if it has none (404, not JSON, wrong shape). A network failure throws.
async function fetchManifest() {
  const u = abs('version.json');
  const res = await naming(u, fetch(u, { cache: 'no-store' }));
  if (res.status !== 200) return null;
  try { return validManifest(await res.json()); } catch { return null; }
}
async function readManifest(cache) {
  const r = await cache.match(MAN);
  if (!r) return null;
  try { return validManifest(await r.json()); } catch { return null; }
}
const putManifest = (cache, m) => (m ? cache.put(MAN, new Response(JSON.stringify(m))) : cache.delete(MAN));

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
  if (relOf(req.url) === 'version.json') return; // the manifest always comes from the network, never from this cache
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
    if (u === abs('sw.js') || u === abs('version.json') || (await cache.match(u))) return;
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
let last = null; // { at, full, result, note?, files?, error? } of the latest check, shown in the parent panel

// result: 'quiet' (probe saw nothing) | 'same' (compared everything, nothing changed) | 'swapped' (new copy in use)
//       | 'mixed' (the site's files did not agree with each other or with its manifest every round; the current copy is kept)
//       | 'offline' (the browser says there is no network) | 'error' (anything else failed; `error` says what)
// note: 'no-manifest' (compared bytes, the site has no usable version.json) | 'stale-manifest' (the site's version.json
//       does not describe its files, so it was ignored); files: the paths that disagreed with the manifest.
// A failed check never changes the copy in use; the next check tries again. navigator.onLine is only a hint:
// true doesn't mean the site answers, so a failure while "online" is an 'error', not 'offline' (issue #24).
async function check(full) {
  let out = { result: 'quiet' };
  let error = null;
  try {
    for (let round = 0; round <= RETRY_MS.length; round++) {
      if (round) await sleep(RETRY_MS[round - 1]);
      out = await checkOnce(full || round > 0, false);
      if (out.result !== 'mixed') break;
      if (out.stale) { out = await checkOnce(true, true); break; } // a manifest that is wrong for good: waiting won't fix it
    }
  } catch (err) {
    if (self.navigator.onLine === false) out = { result: 'offline' };
    else { out = { result: 'error' }; error = String(err && err.message || err); }
  }
  const { result, note, files } = out;
  last = { at: Date.now(), full: full || result !== 'quiet', result, ...(note && { note }), ...(files && { files }), ...(error && { error }) };
  if (result === 'swapped') await broadcast();
  return { updated: result === 'swapped', result, ...(note && { note }), ...(error && { error }) };
}

// A failed request or body read during a check names its file ("Failed to fetch (…/js/games/simon.js)").
const naming = (url, p) => p.catch((err) => {
  if (err && err.named) throw err;
  throw Object.assign(new Error(`${String(err && err.message || err)} (${url})`), { named: true });
});

// One round. Any failure throws (the current copy is kept). `trust`: ignore the site's manifest (it is stale).
// Returns { result, note?, files?, stale? }.
async function checkOnce(full, trust) {
  const name = await getLive();
  if (!name) return { result: 'quiet' };
  const cache = await caches.open(name);
  const oldMan = await readManifest(cache);
  const m1 = await fetchManifest();
  if (!full && !(await probe(cache, oldMan, m1))) return { result: 'quiet' };

  const man = trust ? null : m1;
  const keys = (await cache.keys()).filter((r) => !isMeta(r));
  const seen = await Promise.all(keys.map(async (req) => ({ req, ...(await naming(req.url, fresher(req, await cache.match(req), man))) })));
  if (man) { // listed files this copy doesn't have yet (a new game module, this week's recordings): fetch and check them too
    const have = new Set(keys.map((r) => relOf(r.url)));
    for (const rel of Object.keys(man.files)) {
      if (have.has(rel) || rel === 'index.html') continue; // (a host may redirect index.html to ./)
      const req = new Request(abs(rel));
      seen.push({ req, ...(await naming(req.url, fresher(req, null, man))) });
    }
  }
  if (!man) { // no manifest to prove a set is one version: every changed file must read the same twice
    for (const s of seen) {
      if (s.state !== 'changed') continue;
      const again = await naming(s.req.url, fetch(s.req.url, { cache: 'no-cache' }));
      if (again.status !== 200 || !(await naming(s.req.url, same(again, s.res.clone())))) { s.state = 'off'; s.rel = relOf(s.req.url); }
    }
  }

  if (man) { // the manifest must not have moved during the round
    const m2 = await fetchManifest();
    if (!m2 || m2.v !== man.v) return { result: 'mixed' };
  }
  const off = seen.filter((s) => s.state === 'off');
  if (off.length) {
    // Same version as the copy we hold, yet the site's bytes are not what it says: the manifest is stale, not mid-deploy.
    const stale = !!(man && oldMan && oldMan.v === man.v);
    return { result: 'mixed', stale, files: off.map((s) => s.rel) };
  }

  const note = trust ? 'stale-manifest' : man ? undefined : 'no-manifest';
  if (!seen.some((s) => s.state === 'changed' || s.state === 'gone')) {
    // Nothing the app is running changes. Files it didn't have yet join the copy in use (no reload for those).
    for (const s of seen) if (s.state === 'added') await cache.put(s.req, s.res);
    await putManifest(cache, m1);
    return { result: 'same', note };
  }
  const nextName = await newName();
  const next = await caches.open(nextName);
  for (const s of seen) if (s.state !== 'gone') await next.put(s.req, s.res || (await cache.match(s.req)));
  await putManifest(next, m1);
  await next.put(DONE, new Response(String(Date.now())));
  await promote(nextName);
  return { result: 'swapped', note };
}

// Is there anything new? words.txt is read every time (it is the file that changes weekly, and a stale manifest can't hide it);
// the manifest's version says whether anything else changed. No manifest to compare: not sure, so check everything.
async function probe(cache, oldMan, m1) {
  const w = abs('words.txt');
  const oldW = await cache.match(w);
  if (!oldW) return true;
  const resW = await naming(w, fetch(w, { cache: 'no-cache' }));
  if (resW.status === 200 && !(await naming(w, same(resW, oldW)))) return true;
  return !(m1 && oldMan && m1.v === oldMan.v);
}

// What the site has now for one cached file (`old` is null for a listed file we don't have yet):
//   { state: 'same' | 'changed' | 'added' | 'gone' | 'off', res?: Response to store, rel?: path (for 'off') }
// 'off' = could not get a copy that agrees with the manifest (wrong bytes or an error answer): the set is not one version.
async function fresher(req, old, man) {
  const url = req.url;
  const rel = relOf(url);
  const want = man && rel !== null ? man.files[rel] : undefined;
  if (want) {
    const oldHash = old ? await sha256(await old.clone().arrayBuffer()) : null;
    if (oldHash === want && !CANARY.has(rel)) return { state: 'same' }; // the manifest says it is unchanged: nothing to download
    const got = await fetch(url, { cache: 'no-cache' });
    if (got.status !== 200 || got.redirected) return { state: 'off', rel };
    const res = keep(got);
    const now = await sha256(await res.clone().arrayBuffer());
    if (now !== want) return { state: 'off', rel };
    return { state: !old ? 'added' : now === oldHash ? 'same' : 'changed', res };
  }
  // Not in the manifest (or no manifest): compare bytes.
  if (BIG.test(url) && old) {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (head.status === 404) return { state: 'gone' };
    if (!head.ok) return { state: 'off', rel };
    const len = Number(head.headers.get('content-length'));
    if (len && len === (await old.clone().arrayBuffer()).byteLength) return { state: 'same' }; // same size: same recording/list
  }
  const got = await fetch(url, { cache: 'no-cache' });
  if (got.status === 404) return { state: old ? 'gone' : 'off', rel };
  if (got.status !== 200) return { state: 'off', rel };
  const res = keep(got);
  if (!old) return { state: 'added', res };
  return { state: (await same(res.clone(), old)) ? 'same' : 'changed', res };
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
  return { files: keys.filter((r) => !isMeta(r)).length, since: Number(name.slice(PREFIX.length)), last };
}
