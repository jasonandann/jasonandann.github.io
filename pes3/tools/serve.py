"""Local server that behaves like GitHub Pages, for trying the offline copy and updates (issue #13).

    python3 tools/serve.py            # then open http://localhost:8000/pes3/
    python3 tools/serve.py --port 8080

Serves the repository root (so /pes3/ and /images/ work as on the real site) with Pages-style headers:
ETag "<hex deploy time>-<hex size>", 304 on If-None-Match, Cache-Control: max-age=600.
"Deploy time" = the newest modification time of any file in the repository, so saving any file looks
like a new deploy to every file, as on Pages. Plain `python3 -m http.server` sends no ETags, so the
app can't tell whether a set of files is from one deploy and never applies an update.
Stop it with Ctrl-C to simulate being offline. Only listens on localhost.
"""
import argparse
import os
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # repository root (parent of pes3/)
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


class Pages(SimpleHTTPRequestHandler):
    def send_head(self):
        self._etag = None
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
