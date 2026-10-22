// Real-word check shared by word games (Baffle, and later others).
// dict/words.txt is built by tools/make_dictionary.py (ENABLE list, 3-12 letters, blocklist removed).
// Words in the weekly words.txt are always real, even if the dictionary lacks them.

export const MIN_LEN = 3;
let loading = null;
let words = null;
let sorted = [];   // the same words in order, for prefix lookups

// Starts the download once; later calls reuse it. Resolves to a Set (empty if the file is missing).
export function loadDictionary(url = 'dict/words.txt') {
  if (!loading) {
    loading = fetch(url)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '')
      .then((text) => {
        sorted = text.split('\n').map((w) => w.trim()).filter(Boolean).sort();
        words = new Set(sorted);
        return words;
      });
  }
  return loading;
}

// null while the dictionary is still loading (or failed): callers decide how to be gentle about it.
export function dictionaryReady() {
  return words !== null && words.size > 0;
}

export function inDictionary(word) {
  return !!words && word.length >= MIN_LEN && words.has(word);
}

// True if some dictionary word starts with p (binary search; false while loading).
export function hasPrefix(p) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < p) lo = mid + 1; else hi = mid;
  }
  return lo < sorted.length && sorted[lo].startsWith(p);
}
