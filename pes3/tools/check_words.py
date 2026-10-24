#!/usr/bin/env python3
"""Sanity-check words.txt before you push it.

Usage:  python3 tools/check_words.py [path/to/words.txt]

Exit code 1 if there is a hard problem (no words); otherwise 0. Warnings are
informational: the games adapt (e.g. Jumble and Word Search skip words that
contain apostrophes or hyphens).
"""
import re
import sys
from pathlib import Path

MAX_SEARCH_LEN = 14  # longest word Word Search can place

ROOT = Path(__file__).resolve().parent.parent
path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "words.txt"
dict_path = ROOT / "dict" / "words.txt"  # built by tools/make_dictionary.py
dictionary = set(dict_path.read_text(encoding="utf-8").split()) if dict_path.exists() else set()
sounds_path = ROOT / "dict" / "sounds.txt"  # built by tools/make_sounds.py (Guess What)
sounds = {l.split(" ", 1)[0] for l in sounds_path.read_text(encoding="utf-8").splitlines()
          if l and not l.startswith("#")} if sounds_path.exists() else set()
if not path.exists():
    sys.exit(f"error: {path} not found")

title = None
words: list[tuple[str, str]] = []
for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
    line = raw.strip()
    if not line:
        continue
    if line.startswith("#"):
        title = title or line.lstrip("# ").strip()
        continue
    word, _, sentence = line.partition("|")
    words.append((word.strip().lower(), sentence.strip()))

warnings: list[str] = []
seen: set[str] = set()
for word, _ in words:
    if word in seen:
        warnings.append(f"duplicate (ignored by the app): {word}")
    seen.add(word)
    if not re.fullmatch(r"[a-z]+", word):
        warnings.append(f"not letters-only (skipped in Jumble/Word Search): {word!r}")
    elif dictionary and 3 <= len(word) <= 12 and word not in dictionary:
        warnings.append(f"not in the dictionary, check the spelling (Baffle accepts it anyway): {word}")
    if sounds and word not in sounds:
        warnings.append(f"no pronunciation in dict/sounds.txt (left out of Guess What): {word}")
    if len(word) > MAX_SEARCH_LEN:
        warnings.append(f"longer than {MAX_SEARCH_LEN} letters (skipped in Word Search): {word}")

no_title = '(no title: add a first line like "# Week of Oct 26")'
print(f"List: {title or no_title}")
print(f"{len(seen)} unique words; {sum(1 for _, s in words if s)} with sentences")
for w in warnings:
    print(f"  warning: {w}")

if not seen:
    sys.exit("error: no words found")
