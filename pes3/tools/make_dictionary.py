#!/usr/bin/env python3
"""Build dict/words.txt, the real-word list Baffle uses for bonus words.

Usage:  python3 tools/make_dictionary.py [path/or/URL/to/list.txt]

Default source: the ENABLE word list (public domain), via
https://github.com/dolph/dictionary. Keeps letters-only words of MIN..MAX
letters, then drops words in tools/blocklist.txt.
Run this only when changing the source or the blocklist; the weekly words.txt
workflow does not need it. To switch to SCOWL later, pass its word file here.
"""
import re
import sys
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt"
MIN, MAX = 3, 12  # 5x5 grid: longer words almost never fit
ENDINGS = ("", "s", "es", "ed", "ing", "er", "ers")  # only for blocklist lines ending in +

root = Path(__file__).resolve().parent.parent
src = sys.argv[1] if len(sys.argv) > 1 else SOURCE
if re.match(r"https?://", src):
    with urllib.request.urlopen(src, timeout=60) as r:
        text = r.read().decode("utf-8")
else:
    text = Path(src).read_text(encoding="utf-8")

blocked: set[str] = set()
for line in (root / "tools" / "blocklist.txt").read_text(encoding="utf-8").splitlines():
    w = line.strip().lower()
    if w.endswith("+"):
        blocked.update(w[:-1] + e for e in ENDINGS)
    elif w and not w.startswith("#"):
        blocked.add(w)

kept = sorted({w for w in (l.strip().lower() for l in text.splitlines())
               if MIN <= len(w) <= MAX and re.fullmatch(r"[a-z]+", w) and w not in blocked})
out = root / "dict" / "words.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("\n".join(kept) + "\n", encoding="utf-8")
print(f"{len(kept)} words -> {out.relative_to(root)} ({out.stat().st_size // 1024} KB)")
