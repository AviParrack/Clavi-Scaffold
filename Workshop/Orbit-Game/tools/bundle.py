# Inline all js into one self-contained html (for the playable Artifact link)
#   python3 tools/bundle.py  ->  dist/pocket-orbit.html
import re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'game/index.html').read_text()

def inline(m):
    src = (root / 'game' / m.group(1)).read_text()
    return f'<script>\n{src}\n</script>'

out = re.sub(r'<script src="([^"]+)"></script>', inline, html)
assert 'src="js/' not in out
out = re.sub(r'<!doctype html>|</?html[^>]*>|</?head>|</?body>', '', out)   # artifact host adds its own skeleton
dst = root / 'dist/pocket-orbit.html'
dst.parent.mkdir(exist_ok=True)
dst.write_text(out)
print(f'wrote {dst}  ({len(out) / 1024:.1f} KB)')
