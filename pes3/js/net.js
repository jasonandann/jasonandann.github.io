// Two-device play without a server of our own: WebRTC with the signalling carried by the users (issue #71).
// The host makes an offer and texts it as a link; the guest opens it, makes an answer and texts back a reply link
// (or a code to paste). Then the two browsers talk directly over an encrypted data channel.
// Only public STUN is used (to learn each side's public address); there is no TURN, so networks with symmetric
// NAT (some cellular carriers) are expected to fail. net-test.html measures exactly that.

export const STUN = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];
const GATHER_MS = 6000;     // stop waiting for ICE candidates after this; use what we have
const MAX_CODE = 8000;      // characters; a real code is ~500-1000
const MAX_SDP = 64 * 1024;  // bytes after inflating (guards against a crafted link)
const CHANNEL = 'pes3-net'; // BroadcastChannel: reply link (new tab) -> waiting tab, same browser only

/* ---------- code <-> object: JSON, deflate-raw, base64url ('z' prefix), or plain JSON ('j') if unsupported ---------- */
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes, stream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { reader.cancel(); throw new Error('code too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function encode(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') return 'z' + b64u(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j' + b64u(json);
}

export async function decode(code) {
  code = String(code || '').trim();
  const m = code.match(/#[oa]=([A-Za-z0-9_-]+)/); // a whole link pasted instead of the code
  if (m) code = m[1];
  if (!/^[zj][A-Za-z0-9_-]+$/.test(code) || code.length > MAX_CODE) throw new Error('not a game code');
  let obj;
  try { // a link cut short in a message: bad base64, truncated deflate or JSON
    let bytes = unb64u(code.slice(1));
    if (code[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_SDP);
    obj = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw new Error(e.message === 'code too large' ? e.message : 'not a game code (maybe cut short?)');
  }
  if (!obj || obj.v !== 1 || typeof obj.id !== 'string' || typeof obj.sdp !== 'string' || !['offer', 'answer'].includes(obj.kind)) {
    throw new Error('not a game code');
  }
  return obj;
}

/* ---------- peer connection ---------- */
function iceServers(stun) { return stun && stun.length ? [{ urls: stun }] : []; }

function newPeer(stun, onEvent) {
  const pc = new RTCPeerConnection({ iceServers: iceServers(stun) });
  // negotiated: both sides create the same channel up front, so neither waits for ondatachannel
  const channel = pc.createDataChannel('game', { negotiated: true, id: 0, ordered: true });
  const info = { candidates: { host: 0, srflx: 0, relay: 0, prflx: 0 }, gatherMs: 0 };
  pc.addEventListener('icecandidate', (e) => {
    const t = e.candidate && e.candidate.type;
    if (t) { info.candidates[t] = (info.candidates[t] || 0) + 1; onEvent('candidate', t); }
  });
  pc.addEventListener('connectionstatechange', () => onEvent('state', pc.connectionState));
  pc.addEventListener('iceconnectionstatechange', () => onEvent('ice', pc.iceConnectionState));
  return { pc, channel, info };
}

// Waits for the candidates to be in the local description (no trickle ICE: the link must be complete).
// Ends 'complete' (the browser says so), 'quiet' (we have a usable candidate and nothing new came for QUIET_MS:
// some browsers/networks never report complete, e.g. a STUN server that doesn't answer) or 'timeout'.
// Usable = a public (srflx) address when STUN is configured, else any host address.
const QUIET_MS = 1000;
function gathered(pc, info, wantSrflx, ms = GATHER_MS) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve('complete');
  return new Promise((resolve) => {
    let quiet = null;
    const usable = () => (wantSrflx ? info.candidates.srflx > 0 : info.candidates.host > 0);
    const done = (how) => {
      pc.removeEventListener('icegatheringstatechange', onState);
      pc.removeEventListener('icecandidate', onCandidate);
      clearTimeout(timer); clearTimeout(quiet);
      resolve(how);
    };
    const onState = () => { if (pc.iceGatheringState === 'complete') done('complete'); };
    const onCandidate = () => { clearTimeout(quiet); if (usable()) quiet = setTimeout(() => done('quiet'), QUIET_MS); };
    const timer = setTimeout(() => done('timeout'), ms);
    pc.addEventListener('icegatheringstatechange', onState);
    pc.addEventListener('icecandidate', onCandidate);
    onCandidate(); // candidates that arrived before we started waiting
  });
}

const randomId = () => b64u(crypto.getRandomValues(new Uint8Array(6)));

async function finish(peer, kind, id, stun) {
  const t0 = performance.now();
  peer.info.gatherEnd = await gathered(peer.pc, peer.info, stun.length > 0);
  peer.info.gatherMs = Math.round(performance.now() - t0);
  peer.id = id;
  peer.code = await encode({ v: 1, kind, id, sdp: peer.pc.localDescription.sdp });
  return peer;
}

// Host: make the offer. Returns {pc, channel, info, id, code}; text `code` (as a link) to the guest.
export async function host({ stun = STUN, onEvent = () => {} } = {}) {
  const peer = newPeer(stun, onEvent);
  await peer.pc.setLocalDescription(await peer.pc.createOffer());
  return finish(peer, 'offer', randomId(), stun);
}

// Guest: answer the host's offer code. Returns the same shape; `code` goes back to the host.
export async function join(offerCode, { stun = STUN, onEvent = () => {} } = {}) {
  const offer = await decode(offerCode);
  if (offer.kind !== 'offer') throw new Error('this is a reply code, not an invitation');
  const peer = newPeer(stun, onEvent);
  await peer.pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
  await peer.pc.setLocalDescription(await peer.pc.createAnswer());
  return finish(peer, 'answer', offer.id, stun);
}

// Host: apply the guest's reply. Throws if it answers a different invitation.
export async function accept(hostPeer, answerCode) {
  const answer = typeof answerCode === 'string' ? await decode(answerCode) : answerCode;
  if (answer.kind !== 'answer') throw new Error('this is an invitation, not a reply');
  if (answer.id !== hostPeer.id) throw new Error('this reply is for a different invitation');
  if (hostPeer.pc.signalingState !== 'have-local-offer') throw new Error('already connected or closed');
  await hostPeer.pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
}

/* ---------- links ---------- */
export const linkFor = (kind, code, base = location.origin + location.pathname + location.search) => `${base}#${kind === 'offer' ? 'o' : 'a'}=${code}`;

export function fromHash(hash = location.hash) {
  const m = String(hash).match(/^#([oa])=([A-Za-z0-9_-]+)$/);
  return m ? { kind: m[1] === 'o' ? 'offer' : 'answer', code: m[2] } : null;
}

/* ---------- reply link opened in a new tab -> the tab that is waiting for it ---------- */
// Waiting tab: calls onAnswer(code) for replies matching `id`, and acknowledges them.
export function listenForReply(id, onAnswer) {
  if (typeof BroadcastChannel !== 'function') return () => {};
  const bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = async (e) => {
    const m = e.data || {};
    if (m.type !== 'answer' || typeof m.code !== 'string') return;
    let obj;
    try { obj = await decode(m.code); } catch { return; }
    if (obj.id !== id) return;
    bc.postMessage({ type: 'ack', id });
    onAnswer(m.code);
  };
  return () => bc.close();
}

// Reply tab: hands the code to a waiting tab. Resolves true if one acknowledged within `ms`.
export async function deliverReply(code, ms = 1500) {
  if (typeof BroadcastChannel !== 'function') return false;
  let id;
  try { id = (await decode(code)).id; } catch { return false; }
  const bc = new BroadcastChannel(CHANNEL);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { bc.close(); resolve(false); }, ms);
    bc.onmessage = (e) => { if (e.data && e.data.type === 'ack' && e.data.id === id) { clearTimeout(timer); bc.close(); resolve(true); } };
    bc.postMessage({ type: 'answer', code });
  });
}

/* ---------- diagnostics ---------- */
// The candidate pair actually in use: local/remote type (host = same network, srflx = through NAT, relay = TURN).
export async function selectedPair(pc) {
  const stats = await pc.getStats();
  let pair = null;
  stats.forEach((s) => {
    if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
  });
  if (!pair) stats.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
  if (!pair) return null;
  const local = stats.get(pair.localCandidateId) || {};
  const remote = stats.get(pair.remoteCandidateId) || {};
  return {
    local: local.candidateType, remote: remote.candidateType,
    protocol: local.protocol, rttMs: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
  };
}
