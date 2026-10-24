// Offline copy and updates (issue #13; the logic is in ../sw.js).
// Registers the service worker, tells it which files to keep, and asks it to check for updates
// on launch and whenever the app comes back to the front. An update reloads the page only on the
// home menu, never in the middle of a game. Without service workers (file://, old browsers) all of this is a no-op.
// The start-up watchdog in index.html covers the case where this module never runs (a broken copy).

const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null;
const FULL_KEY = 'spelling-games.offline.fullcheck'; // when the last full check ran (ms)
const FULL_EVERY = 6 * 3600 * 1000; // a probe becomes a full check if the last one is older than this
const ERROR_GAP = 5 * 60 * 1000; // at most one error-triggered full check per 5 minutes
let registered = false;
let pending = false;
let busy = () => false;
let lastErrorCheck = 0;

// A new copy is in place: reload now on the menu, or when she next goes Home.
function apply() {
  if (busy()) pending = true;
  else location.reload();
}

const readFull = () => { try { return Number(localStorage.getItem(FULL_KEY)) || 0; } catch { return 0; } };
const saveFull = () => { try { localStorage.setItem(FULL_KEY, String(Date.now())); } catch { /* ignore */ } };

// Sends a message to the active worker and resolves with its reply (null if there is none in time).
async function ask(msg, ms = 60000) {
  if (!registered) return null;
  const reg = await sw.ready;
  if (!reg.active) return null;
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), ms);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
    reg.active.postMessage(msg, [ch.port2]);
  });
}

// Everything the page loaded, plus files it only loads later (dictionary, recordings, icons).
async function warmList() {
  const urls = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
    '../images/pes-logo.png', 'words.txt', 'audio/manifest.json', 'dict/words.txt', 'dict/sounds.txt'];
  for (const r of performance.getEntriesByType('resource')) urls.push(r.name);
  try {
    const m = await (await fetch('audio/manifest.json')).json();
    for (const s of m.words || []) urls.push(`audio/${s}.m4a`);
    for (const s of Object.keys(m.sentences || {})) urls.push(`audio/${s}.sentence.m4a`);
  } catch { /* no recordings */ }
  return urls
    .map((u) => new URL(u, location.href))
    .filter((u) => u.origin === location.origin)
    .map((u) => u.href.split('#')[0]);
}

// isBusy() says whether an update has to wait (she is in a game). Call once, after the menu is up.
export async function initOffline(isBusy) {
  busy = isBusy;
  if (!sw || !window.isSecureContext) return;
  try {
    await sw.register('sw.js', { updateViaCache: 'none' });
  } catch { return; } // blocked or unsupported: the site still works online
  registered = true;
  sw.addEventListener('message', (e) => { if (e.data && e.data.type === 'updated') apply(); });
  sw.startMessages();
  // A script error may mean a bad mix of files: compare the copy with the site (applies only if something changed).
  const onError = () => {
    if (Date.now() - lastErrorCheck < ERROR_GAP) return;
    lastErrorCheck = Date.now();
    checkForUpdates(true);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await ask({ type: 'warm', urls: await warmList() });
  checkForUpdates(true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    checkForUpdates(false);
    sw.getRegistration().then((r) => r && r.update()).catch(() => {}); // picks up a changed sw.js
  });
}

// full=false: quick probe (words.txt + js/app.js); full=true: compare every cached file.
// The worker also announces a new copy to every open page ('updated' message), so both paths call apply().
export async function checkForUpdates(full = false) {
  const r = await ask({ type: 'check', full: full || Date.now() - readFull() > FULL_EVERY });
  if (r && ['same', 'swapped', 'mixed'].includes(r.result)) saveFull();
  if (r && r.updated) apply();
  return r;
}

// Called by home(): applies an update that arrived during a game. Returns true if the page is reloading.
export function reloadIfPending() {
  if (pending) location.reload();
  return pending;
}

/* ---------- parent panel ---------- */
export async function offlineStatus() {
  if (!sw || !window.isSecureContext) return null;
  return (await ask({ type: 'status' }, 5000)) || { files: 0 };
}

// "Check for updates": full check, then reload either way (also picks up a new sw.js).
export async function updateNow() {
  if (registered) {
    await ask({ type: 'check', full: true });
    await sw.getRegistration().then((r) => r && r.update()).catch(() => {});
  }
  location.reload();
}

// "Reset offline copy": deletes the cached files and the worker. Never touches localStorage
// (garden, progress, Baffle stats). The next load downloads everything again.
export async function resetOffline() {
  try {
    for (const n of await caches.keys()) if (n.startsWith('pes3-')) await caches.delete(n);
    if (sw) for (const r of await sw.getRegistrations()) if (r.scope.startsWith(new URL('./', location.href).href)) await r.unregister();
  } catch { /* nothing to reset */ }
  location.reload();
}
