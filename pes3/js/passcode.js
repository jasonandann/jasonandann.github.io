// Grown-ups passcode (issue #32): stored as salted PBKDF2-SHA-256, never in plain text.
// This stops a curious child, not DevTools: a 4-6 digit passcode kept on the device can be
// brute-forced offline in seconds. A forgotten passcode is reset with the recovery code shown
// once at setup; there is deliberately no reset without it (a child could use that too).
import { getSettings, updateSettings } from './settings.js';

export const PIN_MIN = 4;
export const PIN_MAX = 6;
const ITER = 600000; // OWASP's PBKDF2-HMAC-SHA256 figure; ~0.3 s in desktop Chromium
const FREE_TRIES = 3; // wrong tries before a wait starts
const FIRST_WAIT = 30 * 1000; // then 30 s, doubling each wrong try, up to an hour
const MAX_WAIT = 60 * 60 * 1000;
// Crockford base32 (no I, L, O, U): easy to read off paper and type back.
const CODE_ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Web Crypto only exists on https and localhost. Without it there is no passcode (see parent.js).
export const canHash = typeof crypto !== 'undefined' && !!crypto.subtle;

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(secret, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  return toB64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function makeRecord(secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toB64(salt), hash: await derive(secret, salt, ITER), iter: ITER };
}
async function matches(record, secret) {
  return !!record && (await derive(secret, fromB64(record.salt), record.iter)) === record.hash;
}

export const validPin = (pin) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
export const hasPin = () => !!getSettings().pin;

export async function setPin(pin) {
  if (!validPin(pin)) throw new Error('passcode must be 4-6 digits');
  updateSettings({ pin: await makeRecord(pin), lock: { fails: 0, until: 0 } });
}

// A new recovery code: returned once for the grown-up to write down; only its hash is kept.
export async function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = [...bytes].map((b) => CODE_ABC[b % 32]).join('');
  updateSettings({ recovery: await makeRecord(code) });
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
// Forgiving input: case, spaces and dashes don't matter; O reads as 0, I and L as 1.
export const normalizeCode = (s) => String(s).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

// Milliseconds until another try is allowed (0 = now). Moving the device clock defeats this.
export function waitLeft(now = Date.now()) {
  return Math.max(0, getSettings().lock.until - now);
}

// 'ok' | 'wrong' | 'locked'. Passcode and recovery-code tries share one counter.
async function attempt(record, secret) {
  if (waitLeft() > 0) return 'locked';
  if (await matches(record, secret)) {
    updateSettings({ lock: { fails: 0, until: 0 } });
    return 'ok';
  }
  const fails = getSettings().lock.fails + 1;
  const wait = fails < FREE_TRIES ? 0 : Math.min(MAX_WAIT, FIRST_WAIT * 2 ** (fails - FREE_TRIES));
  updateSettings({ lock: { fails, until: wait ? Date.now() + wait : 0 } });
  return 'wrong';
}
export const tryPin = (pin) => attempt(getSettings().pin, pin);
export const tryRecovery = (code) => attempt(getSettings().recovery, normalizeCode(code));
