"""Write version.json: a SHA-256 for every file the app can be served, so sw.js can tell what changed.

    python3 tools/make_manifest.py                # writes version.json next to index.html
    python3 tools/make_manifest.py --check        # exit 1 if version.json is missing or out of date

Run it as the host's build command (Cloudflare: "python3 tools/make_manifest.py"); it is not committed.
Without it the app still updates (sw.js falls back to comparing file bytes), only less precisely and with
more downloading. Format: {"v": "<16 hex>", "files": {"js/app.js": "<64 hex>", ...}}; "v" is a hash of
all the file hashes, so it changes whenever any file does.
"""
import argparse, hashlib, json, sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"tests", "tools", "review", "__pycache__", "node_modules"}
SKIP_NAMES = {"version.json", "sw.js", "CLAUDE.md", "README.md", ".DS_Store"}  # sw.js: browsers fetch it themselves


def build(root=SITE):
    root = Path(root)
    files = {}
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root)
        if not p.is_file() or p.name in SKIP_NAMES or p.name.startswith(".") or SKIP_DIRS & set(rel.parts[:-1]):
            continue
        files[rel.as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
    summary = "\n".join(f"{k} {h}" for k, h in files.items()).encode()
    return {"v": hashlib.sha256(summary).hexdigest()[:16], "files": files}


def dumps(manifest):
    return json.dumps(manifest, separators=(",", ":"), sort_keys=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(SITE), help="site folder (default: the folder holding index.html)")
    ap.add_argument("--check", action="store_true", help="only report whether version.json is current")
    args = ap.parse_args()
    out = Path(args.root) / "version.json"
    text = dumps(build(args.root))
    if args.check:
        ok = out.is_file() and out.read_text() == text
        print("version.json is current" if ok else "version.json is missing or out of date")
        sys.exit(0 if ok else 1)
    out.write_text(text)
    print(f"wrote {out} ({len(json.loads(text)['files'])} files)")


if __name__ == "__main__":
    main()
