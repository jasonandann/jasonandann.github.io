// Real-word check shared by word games (Baffle, and later others).
// dict/words.txt is built by tools/make_dictionary.py (ENABLE list, 3-12 letters, blocklist removed).
// Words in the weekly words.txt are always real, even if the dictionary lacks them.

export const MIN_LEN = 3;
let loading = null;
let words = null;

// Starts the download once; later calls reuse it. Resolves to a Set (empty if the file is missing).
export function loadDictionary(url = 'dict/words.txt') {
  if (!loading) {
    loading = fetch(url)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '')
      .then((text) => (words = new Set(text.split('\n').map((w) => w.trim()).filter(Boolean))));
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
