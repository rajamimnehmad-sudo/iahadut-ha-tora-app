"""Create transparent, tightly framed copies; never alter source files."""
from pathlib import Path
from urllib.request import urlopen
from html.parser import HTMLParser
from collections import deque
from PIL import Image
import io
import json

ROOT = Path(__file__).resolve().parents[1]
class Logos(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.logos = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'div' and attrs.get('class') == 'trusted-brands-group':
            self.active = True
        if tag == 'img' and self.active and attrs.get('alt'):
            self.logos.append((attrs['src'], attrs['alt']))
    def handle_endtag(self, tag):
        if tag == 'div':
            self.active = False

sources = json.loads((ROOT / 'scripts/brand-logo-sources.json').read_text())
originals = ROOT / 'release-artifacts/brand-logo-originals'
output = ROOT / 'web/assets/brands'
originals.mkdir(parents=True, exist_ok=True)
output.mkdir(parents=True, exist_ok=True)
manifest = []
for index, entry in enumerate(sources):
    url, name = entry['source'], entry['name']
    source = originals / f'{index:02d}-{url.rsplit("/", 1)[-1]}'
    raw = source.read_bytes() if source.exists() else urlopen(url).read()
    if not source.exists():
        source.write_bytes(raw)
    image = Image.open(io.BytesIO(raw)).convert('RGBA')
    pixels = image.load()
    width, height = image.size
    # Only remove neutral, light pixels connected to the outside. Enclosed
    # white lettering and white regions inside the marks remain intact.
    def background(x, y):
        r, g, b, a = pixels[x, y]
        return a < 20 or (min(r, g, b) >= 222 and max(r, g, b) - min(r, g, b) < 32)
    queue = deque((x, y) for x in range(width) for y in (0, height-1))
    queue.extend((x, y) for y in range(height) for x in (0, width-1))
    visited = set()
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited or not (0 <= x < width and 0 <= y < height):
            continue
        visited.add((x, y))
        if not background(x, y):
            continue
        r, g, b, a = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        queue.extend(((x-1, y), (x+1, y), (x, y-1), (x, y+1)))
    bounds = image.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    if not bounds:
        raise ValueError(f'Empty logo: {name}')
    trimmed = image.crop(bounds)
    trimmed.thumbnail((140, 68), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (152, 80), (0, 0, 0, 0))
    canvas.alpha_composite(trimmed, ((152-trimmed.width)//2, (80-trimmed.height)//2))
    filename = f'brand-{index:02d}.png'
    trimmed.save(output / filename)
    scale = min(90 / trimmed.width, 44 / trimmed.height)
    manifest.append({'source': url, 'name': name, 'asset': f'assets/brands/{filename}', 'bounds': bounds, 'displayWidth': round(trimmed.width * scale), 'displayHeight': round(trimmed.height * scale)})
sheet = Image.new('RGB', (608, 560), '#e3f0e8')
for index in range(len(manifest)):
    logo = Image.open(output / f'brand-{index:02d}.png')
    sheet.paste(logo, ((index % 4)*152, (index // 4)*80), logo)
sheet.save('/tmp/iahadut-brand-contact-sheet.png')
print(json.dumps(manifest))
