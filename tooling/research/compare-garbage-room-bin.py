"""Actual published bin/trolley render comparison; no new image concept."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/intermediate/garbage-room-bin-proof'
OUT.mkdir(parents=True, exist_ok=True)
original = json.loads((ROOT / 'public/game-content/oblique-fixture-cell-waste-bin.v1.json').read_text(encoding='utf-8-sig'))
authored_path = ROOT / 'public/game-content/oblique-fixture.garbage-room-waste-bin.v1.json'
authored = json.loads(authored_path.read_text(encoding='utf-8-sig'))
sheet = Image.new('RGB', (1200, 700), '#e5e8ea')
draw = ImageDraw.Draw(sheet)
rows = []
for index, yaw in enumerate((30, 120, 210, 300)):
    views = []
    for line, catalog in enumerate((original, authored)):
        frame = next(frame for frame in catalog['frames'] if (frame['yawDegrees'], frame['elevationDegrees']) == (yaw, 40))
        path = ROOT / 'public' / frame['image'].lstrip('/')
        png = path.read_bytes()
        if hashlib.sha256(png).hexdigest() != frame['sha256']:
            raise ValueError('Published bin frame hash mismatch')
        value = Image.open(path).convert('RGBA')
        views.append(value)
        bounds = value.getchannel('A').getbbox()
        crop = value.crop(bounds).resize(((bounds[2] - bounds[0]) * 3, (bounds[3] - bounds[1]) * 3), Image.Resampling.NEAREST)
        sheet.paste(crop, (index * 300 + (300 - crop.width) // 2, line * 350 + 55), crop)
        draw.text((index * 300 + 10, line * 350 + 12), f'{"Retained indoor bin" if line == 0 else "Refuse trolley"} yaw{yaw}/elev40 | x3', fill='#22262a')
    changed = sum(a != b for a, b in zip(views[0].get_flattened_data(), views[1].get_flattened_data()))
    rows.append({'yawDegrees': yaw, 'elevationDegrees': 40, 'changedRGBAPixels': changed,
                 'comparisonScope': 'actual full canvas; new deck lift and camera target height included'})
sheet.save(OUT / 'retained-bin-and-refuse-trolley-four-yaws.png')
receipt = {'sourceSHA256': authored['sourceSha256'], 'descriptorSHA256': hashlib.sha256(authored_path.read_bytes()).hexdigest(),
           'all72PublishedFrameHashes': authored['frames'], 'fourRealDirections': rows,
           'visualization': 'actual RGBA crops at nearest-neighbor x3, labels only; no generated concept'}
(OUT / 'source-descriptor72-and-four-yaw-comparison.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'sourceSHA256': receipt['sourceSHA256'], 'descriptorSHA256': receipt['descriptorSHA256'], 'fourRealDirections': rows}))
