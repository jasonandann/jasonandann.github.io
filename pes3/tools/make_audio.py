#!/usr/bin/env python3
"""Pre-generate spoken audio for words.txt using macOS `say` (+ `afconvert`).

Run on a Mac after editing words.txt, then commit the audio/ folder:

    python3 tools/make_audio.py                 # only missing/changed files
    python3 tools/make_audio.py --list-voices   # English voices on this Mac
    python3 tools/make_audio.py --voice Ava --rate 140
    python3 tools/make_audio.py --dry-run       # show what would be made
    python3 tools/make_audio.py --force         # regenerate everything
    python3 tools/make_audio.py --direct        # skip afconvert (say writes .m4a itself)

Output (served by the site; the page falls back to browser speech if a file is missing):
    audio/<slug>.m4a            the word on its own
    audio/<slug>.sentence.m4a   "word. sentence. word."  (only if words.txt has a sentence)
    audio/manifest.json         {"voice", "rate", "words": [slug...], "sentences": {slug: text}}
    review/<YYYY-MM-DD_HH-MM-SS>.m3u8   playlist of the files made this run (gitignored), to listen
                                and check them: open in VLC/IINA, or in Terminal:
        grep -v '^#' review/<file>.m3u8 | while read -r f; do echo "$f"; afplay "$f"; done

slug = word lowercased, runs of non [a-z0-9] replaced by "_" (same rule as js/util.js).

Pronunciation fixes: add lines `word = text to say instead` to audio/pronunciations.txt,
e.g. `read = reed`. The override replaces the word wherever it is spoken. After changing an
override, rerun with --force (or delete that word's files).

Not tested against a real Mac by the author: only against stub `say`/`afconvert`.
The afconvert flags below (-f m4af -d aac -b 64000) are from memory; if afconvert rejects them,
use --direct. Apple's voices may have licensing limits on redistribution; check before making
the repo public.
"""
import argparse
import json
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
REVIEW = ROOT / "review"


def slug(word):
    return re.sub(r"[^a-z0-9]+", "_", word.lower())


def parse_words(path):
    """Same rules as parseWords() in js/util.js."""
    seen, out = set(), []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        w, _, rest = line.partition("|")
        word = w.strip().lower()
        if word and word not in seen:
            seen.add(word)
            out.append((word, rest.strip()))
    return out


def parse_overrides(path):
    out = {}
    if path.exists():
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                out[k.strip().lower()] = v.strip()
    return out


def run(cmd, text=None):
    return subprocess.run(cmd, input=text, capture_output=True, text=True, check=True)


def list_voices():
    out = run(["say", "-v", "?"]).stdout
    voices = []
    for line in out.splitlines():
        m = re.match(r"^(.+?)\s{2,}(\S+)\s+#", line)  # "Name   en_US   # sample"
        if m:
            voices.append((m.group(1).strip(), m.group(2)))
    return voices


def synth(text, dest, voice, rate, direct):
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        if direct:
            tmp = Path(td) / "out.m4a"
            run(["say", "-v", voice, "-r", str(rate), "-o", str(tmp), "--data-format=aac", "-f", "-"], text)
        else:
            aiff = Path(td) / "out.aiff"
            tmp = Path(td) / "out.m4a"
            run(["say", "-v", voice, "-r", str(rate), "-o", str(aiff), "-f", "-"], text)
            run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", str(aiff), str(tmp)])
        if not tmp.exists() or tmp.stat().st_size == 0:
            raise RuntimeError(f"no audio produced for {dest.name}")
        shutil.move(str(tmp), str(dest))


def write_playlist(made_files):
    """Write review/<timestamp>.m3u8 listing (path, spoken text) pairs; return its path."""
    REVIEW.mkdir(exist_ok=True)
    path = REVIEW / f"{datetime.now():%Y-%m-%d_%H-%M-%S}.m3u8"
    lines = ["#EXTM3U"]
    for dest, text in made_files:
        lines += [f"#EXTINF:-1,{text}", str(dest.resolve())]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--words", type=Path, default=ROOT / "words.txt")
    ap.add_argument("--voice", default="Samantha")
    ap.add_argument("--rate", type=int, default=140, help="words per minute (default 140; say's normal is ~175)")
    ap.add_argument("--list-voices", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--direct", action="store_true", help="let say write .m4a itself (no afconvert)")
    args = ap.parse_args()

    if platform.system() != "Darwin":
        sys.exit("error: this script needs macOS (`say`, `afconvert`).")
    for tool in ("say",) + (() if args.direct else ("afconvert",)):
        if not shutil.which(tool):
            sys.exit(f"error: `{tool}` not found on PATH.")

    voices = list_voices()
    if args.list_voices:
        for name, lang in voices:
            if lang.lower().startswith("en"):
                print(f"{name}\t{lang}")
        return
    if voices and args.voice not in {n for n, _ in voices}:
        sys.exit(f"error: voice '{args.voice}' not installed. Try --list-voices.")
    if not args.words.exists():
        sys.exit(f"error: {args.words} not found")

    entries = parse_words(args.words)
    if not entries:
        sys.exit("error: no words found")
    over = parse_overrides(AUDIO / "pronunciations.txt")
    say_word = lambda w: over.get(w, w)

    mpath = AUDIO / "manifest.json"
    try:
        old = json.loads(mpath.read_text())
    except (OSError, ValueError):
        old = {}
    changed_voice = old.get("voice") not in (None, args.voice) or old.get("rate") not in (None, args.rate)
    if changed_voice and not args.force:
        print(f"note: voice/rate differs from existing audio ({old.get('voice')}, {old.get('rate')}); "
              "use --force to regenerate everything with the new settings.")
    old_sent = old.get("sentences", {})

    manifest = {"voice": args.voice, "rate": args.rate, "words": [], "sentences": {}}
    made = skipped = failed = 0
    made_files = []
    for word, sentence in entries:
        s = slug(word)
        jobs = [(AUDIO / f"{s}.m4a", say_word(word), "words", s, None)]
        if sentence:
            jobs.append((AUDIO / f"{s}.sentence.m4a", f"{say_word(word)}. {sentence.rstrip(' .')}. {say_word(word)}.",
                         "sentences", s, sentence))
        for dest, text, kind, key, sent in jobs:
            stale = kind == "sentences" and old_sent.get(key) != sent
            if dest.exists() and not args.force and not stale:
                skipped += 1
            elif args.dry_run:
                print(f"would make {dest.name}: {text!r}")
                continue
            else:
                try:
                    synth(text, dest, args.voice, args.rate, args.direct)
                    print(f"made {dest.name}")
                    made += 1
                    made_files.append((dest, text))
                except (subprocess.CalledProcessError, RuntimeError, OSError) as e:
                    detail = getattr(e, "stderr", "") or str(e)
                    print(f"FAILED {dest.name}: {detail.strip()}", file=sys.stderr)
                    failed += 1
                    continue
            if kind == "words":
                manifest["words"].append(key)
            else:
                manifest["sentences"][key] = sent

    if args.dry_run:
        print("dry run: nothing written")
        return
    AUDIO.mkdir(exist_ok=True)
    mpath.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")
    print(f"done: {made} made, {skipped} unchanged, {failed} failed -> {mpath.relative_to(ROOT)}")
    if made_files:
        print(f"review playlist: {write_playlist(made_files).relative_to(ROOT)}")
    print("Words no longer in words.txt keep their old files; delete audio/*.m4a to clean up.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
