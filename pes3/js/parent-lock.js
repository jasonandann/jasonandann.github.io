// Passcode screens in front of the grown-ups panel (issue #32): first-time setup, entry,
// "Forgot passcode?" with the recovery code, change passcode, new recovery code.
// All grown-up facing; the child only ever sees them if she finds the hidden panel.
import { el, textInput } from './util.js';
import { PIN_MIN, PIN_MAX, hasPin, setPin, newRecoveryCode, tryPin, tryRecovery, waitLeft } from './passcode.js';

const waitText = (ms) => {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
};

// Digit pad (big keys for touch; digits, Backspace and Enter on a keyboard also work).
function pinPad(onDone) {
  let value = '';
  let busy = false;
  const dots = el('div', { class: 'pin-dots', 'aria-hidden': 'true' });
  const ok = el('button', { class: 'btn primary pin-key', type: 'button', 'data-k': 'ok', onclick: () => submit() }, 'OK');
  const draw = () => {
    dots.replaceChildren(...Array.from({ length: Math.max(PIN_MIN, value.length) }, (_, i) => el('span', { class: i < value.length ? 'on' : '' })));
    ok.disabled = busy || value.length < PIN_MIN;
  };
  const press = (d) => { if (!busy && value.length < PIN_MAX) { value += d; draw(); } };
  const back = () => { if (!busy) { value = value.slice(0, -1); draw(); } };
  const submit = () => { if (!ok.disabled) onDone(value); };
  const key = (label, run, k = label) => el('button', { class: 'btn pin-key', type: 'button', 'data-k': k, onclick: run }, label);
  const node = el('div', { class: 'pin' }, dots,
    el('div', { class: 'pin-pad' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d))),
      key('⌫', back, 'back'), key('0', () => press('0')), ok));
  draw();
  return {
    node,
    onKey(e) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') submit();
      else return;
      e.preventDefault();
    },
    reset() { value = ''; draw(); },
    setBusy(b) { busy = b; node.classList.toggle('busy', b); draw(); },
  };
}

// One overlay whose panel content is swapped from screen to screen.
function lockOverlay(onCancel) {
  let keys = null;
  let timer = null;
  let saving = false; // a passcode/code is being saved: no Escape/Cancel, or the recovery code would never be shown
  const panel = el('div', { class: 'panel lock' });
  const overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, panel);
  const onKey = (e) => {
    if (e.key === 'Escape') { if (!saving) { close(); onCancel(); } } else if (keys && e.target.tagName !== 'INPUT') keys(e);
  };
  function close() {
    clearInterval(timer);
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  return {
    close,
    // kids = screen content; onKeys = key handler for this screen (or null)
    show(kids, onKeys = null) {
      clearInterval(timer);
      keys = onKeys;
      panel.replaceChildren(...kids);
    },
    every(ms, fn) { clearInterval(timer); timer = setInterval(fn, ms); },
    stop() { clearInterval(timer); },
    setSaving(b) { saving = b; },
    cancelBtn: (label = 'Cancel') => el('button', { class: 'btn', type: 'button', 'data-act': 'cancel', onclick: () => { if (!saving) { close(); onCancel(); } } }, label),
  };
}

// Choose a passcode, type it again, then (newCode) show a new recovery code once.
function setupScreens(ui, { title, intro, newCode, after }) {
  const step = (prompt, note, onValue) => {
    const msg = el('p', { class: 'msg', 'aria-live': 'polite' }, note || '');
    const pad = pinPad((v) => onValue(v, pad, msg));
    ui.show([el('h2', {}, title), intro ? el('p', { class: 'small' }, intro) : null, el('p', { class: 'pin-prompt' }, prompt), msg, pad.node,
      el('div', { class: 'row' }, ui.cancelBtn())], pad.onKey);
  };
  const first = (note) => step(`Choose a passcode: ${PIN_MIN} to ${PIN_MAX} digits.`, note, (a) =>
    step('Enter it again.', '', async (b, pad, msg) => {
      if (a !== b) return first('Those didn’t match. Let’s start again.');
      pad.setBusy(true); msg.textContent = 'Saving…'; ui.setSaving(true);
      await setPin(a);
      const code = newCode ? await newRecoveryCode() : null;
      ui.setSaving(false);
      if (code) showCode(ui, code, after);
      else { ui.close(); after(); }
    }));
  first();
}

function showCode(ui, code, after) {
  ui.show([
    el('h2', {}, 'Recovery code'),
    el('p', { class: 'recovery-code' }, code),
    el('p', {}, 'Write this down or take a photo, and keep it where your child can’t see it. It is the only way to reset a forgotten passcode on this device. It won’t be shown again.'),
    el('div', { class: 'row' }, el('button', { class: 'btn primary', type: 'button', 'data-act': 'saved', onclick: () => { ui.close(); after(); } }, 'I’ve saved it')),
  ]);
}

function entryScreen(ui, onUnlock) {
  const msg = el('p', { class: 'msg', 'aria-live': 'polite' });
  const pad = pinPad(async (v) => {
    pad.setBusy(true); msg.textContent = 'Checking…';
    const r = await tryPin(v);
    if (r === 'ok') { ui.close(); return onUnlock(); }
    pad.reset();
    showWait(r === 'locked' ? '' : 'That’s not it.');
  });
  // Too many wrong tries: the pad stays off until the wait is over (also after a reload).
  const showWait = (note) => {
    const left = waitLeft();
    pad.setBusy(left > 0);
    msg.textContent = left > 0 ? `Too many tries. Try again in ${waitText(left)}.` : note;
    if (left > 0) ui.every(1000, () => showWait(''));
    else ui.stop();
  };
  ui.show([el('h2', {}, 'Grown-ups passcode'), el('p', { class: 'pin-prompt' }, 'Enter the passcode.'), msg, pad.node,
    el('div', { class: 'row' },
      el('button', { class: 'btn', type: 'button', 'data-act': 'forgot', onclick: () => forgotScreen(ui, onUnlock) }, 'Forgot passcode?'),
      ui.cancelBtn())], pad.onKey);
  showWait('');
}

function forgotScreen(ui, onUnlock) {
  const msg = el('p', { class: 'msg', 'aria-live': 'polite' });
  const input = textInput({ max: 12, placeholder: 'XXXX-XXXX', label: 'Recovery code', capitalize: 'characters' });
  const go = el('button', { class: 'btn primary', type: 'button', 'data-act': 'reset', onclick: () => check() }, 'Reset passcode');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  async function check() {
    const left = waitLeft();
    if (left > 0) { msg.textContent = `Too many tries. Try again in ${waitText(left)}.`; return; }
    go.disabled = true; msg.textContent = 'Checking…';
    const r = await tryRecovery(input.value);
    go.disabled = false;
    if (r === 'ok') return setupScreens(ui, { title: 'New passcode', newCode: true, after: onUnlock });
    msg.textContent = r === 'locked' || waitLeft() > 0 ? `Too many tries. Try again in ${waitText(waitLeft())}.` : 'That code doesn’t match.';
  }
  ui.show([
    el('h2', {}, 'Forgot the passcode?'),
    el('p', {}, 'Enter the recovery code you saved when the passcode was set.'),
    input, msg,
    el('div', { class: 'row' }, go,
      el('button', { class: 'btn', type: 'button', 'data-act': 'back', onclick: () => entryScreen(ui, onUnlock) }, 'Back')),
    el('p', { class: 'small' }, 'No recovery code? The only other way is to clear this website’s data in the browser’s settings. That also erases the practice history, the garden and saved coding projects on this device.'),
  ]);
  input.focus();
}

// Before the panel opens: set a passcode the first time, otherwise ask for it.
export function unlock(onUnlock) {
  const ui = lockOverlay(() => {});
  if (hasPin()) entryScreen(ui, onUnlock);
  else {
    setupScreens(ui, {
      title: 'Set a grown-ups passcode',
      intro: 'The passcode keeps this panel (and its settings) away from your child. You’ll be asked for it each time it opens.',
      newCode: true, after: onUnlock,
    });
  }
}

// From inside the panel (already unlocked). onDone reopens the panel, also after Cancel.
export function changePasscode(onDone) {
  setupScreens(lockOverlay(onDone), { title: 'Change passcode', newCode: false, after: onDone });
}
export async function replaceRecoveryCode(onDone) {
  const ui = lockOverlay(onDone); // up before the ~0.3 s hash, so the app stays "busy" (no update reload)
  ui.show([el('h2', {}, 'Recovery code'), el('p', { class: 'msg' }, 'Making a new code…')]);
  ui.setSaving(true);
  const code = await newRecoveryCode();
  ui.setSaving(false);
  showCode(ui, code, onDone);
}
