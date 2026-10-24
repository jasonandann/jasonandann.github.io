#!/usr/bin/env python3
"""Build dict/sounds.txt, the pronunciations Guess What uses (issue #57).

Usage:  python3 tools/make_sounds.py [path/or/URL/to/cmudict.dict]

Source: the CMU Pronouncing Dictionary (https://github.com/cmusphinx/cmudict,
BSD-style licence; its notice is copied to dict/CMUDICT-LICENSE.txt and must
stay with the data). Keeps the words of dict/words.txt (ENABLE, so the same
real words Baffle knows), plus 1-2 letter words and words with an apostrophe,
which ENABLE leaves out. Each line: `word PH PH PH|PH PH` (ARPAbet, stress
digits kept; alternative pronunciations separated by |).
Run this only when changing the source; the weekly words.txt workflow does
not need it (a weekly word missing here is just left out of Guess What, and
tools/check_words.py says so).
"""
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

REPO = "https://raw.githubusercontent.com/cmusphinx/cmudict/master/"
root = Path(__file__).resolve().parent.parent


def fetch(src: str) -> str:
    if re.match(r"https?://", src):
        with urllib.request.urlopen(src, timeout=60) as r:
            return r.read().decode("utf-8")
    return Path(src).read_text(encoding="utf-8")


src = sys.argv[1] if len(sys.argv) > 1 else REPO + "cmudict.dict"
prons: dict[str, list[str]] = defaultdict(list)
for line in fetch(src).splitlines():
    line = line.split("#")[0].strip()  # cmudict.dict puts comments after '#'
    if not line:
        continue
    word, *phones = line.split()
    word = re.sub(r"\(\d+\)$", "", word.lower())
    p = " ".join(phones)
    if phones and p not in prons[word]:
        prons[word].append(p)

enable = set((root / "dict" / "words.txt").read_text(encoding="utf-8").split())
kept = {w: v for w, v in prons.items()
        if re.fullmatch(r"[a-z']+", w) and (w in enable or len(w) <= 2 or "'" in w)}

out = root / "dict" / "sounds.txt"
header = "# CMU Pronouncing Dictionary subset (tools/make_sounds.py). Copyright (C) 1993-2015 Carnegie Mellon University. See CMUDICT-LICENSE.txt.\n"
out.write_text(header + "".join(f"{w} {'|'.join(v)}\n" for w, v in sorted(kept.items())), encoding="utf-8")
if not re.match(r"https?://", src):
    print("note: local source; dict/CMUDICT-LICENSE.txt left as it is")
else:
    (root / "dict" / "CMUDICT-LICENSE.txt").write_text(fetch(REPO + "LICENSE"), encoding="utf-8")
print(f"{len(kept)} words -> {out.relative_to(root)} ({out.stat().st_size // 1024} KB)")
