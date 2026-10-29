"""Local server that behaves like GitHub Pages, for trying the offline copy and updates (issue #13).

    python3 tools/serve.py            # then open http://localhost:8000/pes3/
    python3 tools/serve.py --port 8080

Serves the repository root (so /pes3/ and /images/ work as on the real site) with Pages-style headers:
ETag "<hex deploy time>-<hex size>", 304 on If-None-Match, Cache-Control: max-age=600. The app does not
read ETags; they are only here to look like the real host.
/pes3/version.json is built on the fly from the files (tools/make_manifest.py), as the host's build would,
so edits show up as updates. Plain `python3 -m http.server` has no version.json: the app then compares
file bytes (slower, same result).
Stop it with Ctrl-C to simulate being offline. Only listens on localhost.
"""
import argparse
import io
import os
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent  # the folder with index.html (pes3/)
ROOT = SITE.parent  # repository root
sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_manifest import build, dumps  # noqa: E402
_manifest = {}
_deploy = {"at": 0.0, "time": 0}


def deploy_time():
    """Newest mtime under ROOT (skipping .git), rescanned at most once a second."""
    now = time.time()
    if now - _deploy["at"] > 1:
        newest = 0
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "__pycache__"]
            for f in filenames:
                try:
                    newest = max(newest, int(os.stat(os.path.join(dirpath, f)).st_mtime))
                except OSError:
                    pass
        _deploy.update(at=now, time=newest)
    return _deploy["time"]


def manifest_bytes():
    """version.json as the host's build would make it (tools/make_manifest.py), rebuilt when any file changes."""
    stamp = deploy_time()
    if _manifest.get("stamp") != stamp:
        _manifest.update(stamp=stamp, body=dumps(build(SITE)).encode())
    return _manifest["body"]


class Pages(SimpleHTTPRequestHandler):
    def send_head(self):
        self._etag = None
        if self.path.split("?")[0] == f"/{SITE.name}/version.json":
            body = manifest_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "max-age=600")
            self.end_headers()
            return io.BytesIO(body)
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, "index.html")
        if os.path.isfile(path):
            self._etag = f'"{deploy_time():x}-{os.path.getsize(path):x}"'
            if self.headers.get("If-None-Match", "").replace("W/", "") == self._etag:
                self.send_response(304)
                self.end_headers()
                return None
        return super().send_head()

    def end_headers(self):
        if getattr(self, "_etag", None):
            self.send_header("ETag", self._etag)
            self.send_header("Cache-Control", "max-age=600")
        super().end_headers()


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    server = ThreadingHTTPServer(("localhost", args.port), partial(Pages, directory=str(ROOT)))
    print(f"Serving {ROOT} like GitHub Pages at http://localhost:{args.port}/pes3/  (Ctrl-C = go offline)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped (the app should keep working from its offline copy).")


if __name__ == "__main__":
    main()
