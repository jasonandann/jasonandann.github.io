"""Keep the Content-Security-Policy <meta> tag in index.html in step with its inline <script> blocks.

    python3 tools/csp.py           # rewrite the tag (run after editing ANY inline <script> in index.html)
    python3 tools/csp.py --check   # exit 1 if the tag is missing or stale (tests/csp_test.py runs this)

The policy allows scripts from this site plus each inline <script> by its SHA-256, so an injected script
(for example from a customer's word list) does not run. A hash covers the exact text between the tags,
including whitespace: changing one character in an inline script changes its hash, the browser then
refuses the script, and the page shows "Loading..." forever. Hence this tool and its test.

GitHub Pages cannot send headers, so the policy is a <meta> tag. A meta tag cannot carry frame-ancestors,
report-uri or sandbox, and has no report-only mode. On Cloudflare, send the same policy as a real header.
"""
import base64
import hashlib
import re
import sys
from pathlib import Path

INDEX = Path(__file__).resolve().parent.parent / "index.html"

# {hashes} = the quoted 'sha256-...' sources, one per inline script, in page order.
POLICY = (
    "default-src 'self'; "
    "script-src 'self' {hashes}; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "media-src 'self'; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'none'; "
    "form-action 'self'"
)

INLINE = re.compile(r"<script(?![^>]*\bsrc\s*=)[^>]*>(.*?)</script>", re.S | re.I)
META = re.compile(r'[ \t]*<meta http-equiv="Content-Security-Policy" content="[^"]*">\n?')


def inline_hashes(html):
    """'sha256-...' source for every inline <script> in the page, in order."""
    return ["'sha256-%s'" % base64.b64encode(hashlib.sha256(m.encode("utf-8")).digest()).decode()
            for m in INLINE.findall(html)]


def policy(html):
    return POLICY.format(hashes=" ".join(inline_hashes(html)))


def with_tag(html):
    """html with the CSP meta tag present, current, and placed before the first <script>."""
    body = META.sub("", html)
    tag = '  <meta http-equiv="Content-Security-Policy" content="%s">\n' % policy(body)
    anchor = re.search(r'<meta charset="utf-8">\n', body)
    if not anchor:
        raise SystemExit("index.html: no <meta charset> line to put the policy after")
    return body[:anchor.end()] + tag + body[anchor.end():]


def main():
    html = INDEX.read_text(encoding="utf-8")
    want = with_tag(html)
    if "--check" in sys.argv:
        if want == html:
            print("CSP meta tag is current (%d inline script hashes)" % len(inline_hashes(html)))
            return 0
        print("CSP meta tag is missing or stale: run  python3 tools/csp.py  and commit index.html")
        return 1
    if want == html:
        print("CSP meta tag already current")
    else:
        INDEX.write_text(want, encoding="utf-8")
        print("index.html updated (%d inline script hashes)" % len(inline_hashes(want)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
