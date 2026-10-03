"""Inspect four published Cook directions and one genuine producer replay.

Contact sheet contains only decoded existing PNG pixels, with nearest-neighbor
magnification and labels. No synthesized art and no published files modified.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/intermediate/cook-apron-cap-audit'
catalog = json.loads((ROOT / 'public/game-content/oblique-actor-cook.v1.json').read_text(encoding='utf-8-sig'))
rows = []
sheet = Image.new('RGB', (5 * 300, 370), '#e5e8ea')
draw = ImageDraw.Draw(sheet)
for index, yaw in enumerate((-135, -45, 45, 135)):
    frame = next(row for row in catalog['frames'] if row['yawDegrees'] == yaw and row['elevationDegrees'] == 45)
    path = ROOT / 'public' / frame['image'].lstrip('/')
    value = Image.open(path).convert('RGBA')
    box = value.getchannel('A').getbbox()
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    if sha != frame['sha256']:
        raise ValueError('Canonical Cook PNG hash mismatch')
    crop = value.crop(box).resize(((box[2] - box[0]) * 3, (box[3] - box[1]) * 3), Image.Resampling.NEAREST)
    sheet.paste(crop, (index * 300 + (300 - crop.width) // 2, 50), crop)
    draw.text((index * 300 + 12, 12), f'Published yaw {yaw}, elev 45 | x3', fill='#202428')
    rows.append({'yawDegrees': yaw, 'elevationDegrees': 45, 'path': path.relative_to(ROOT).as_posix(),
                 'sha256': sha, 'alphaBoundsPx': box})
    if yaw == 45:
        replay = OUT / 'actor-cook-yaw+45-elev45.png'
        fresh = Image.open(replay).convert('RGBA')
        changes = sum(a != b for a, b in zip(value.get_flattened_data(), fresh.get_flattened_data()))
        exact = path.read_bytes() == replay.read_bytes()
        if not exact or changes != 0:
            raise ValueError('Genuine original producer replay differs from published Cook PNG')
        fresh_crop = fresh.crop(box).resize(crop.size, Image.Resampling.NEAREST)
        sheet.paste(fresh_crop, (1200 + (300 - crop.width) // 2, 50), fresh_crop)
        draw.text((1212, 12), 'Fresh Blender yaw 45/elev 45 | x3', fill='#202428')
        replay_receipt = {'path': replay.relative_to(ROOT).as_posix(), 'sha256': sha,
                          'byteExactPublishedReplay': exact, 'changedRGBAPixels': changes}
sheet.save(OUT / 'four-published-views-and-one-real-replay.png')
(OUT / 'bounded-canonical-view-comparison.json').write_text(
    json.dumps({'publishedViews': rows, 'oneOriginalProducerReplay': replay_receipt,
                'sheet': 'four-published-views-and-one-real-replay.png',
                'sheetMethod': 'actual RGBA alpha crops, nearest-neighbor x3; labels only'}, indent=2) + '\n', encoding='utf-8')
print('COOK_ONE_REAL_REPLAY_BYTE_EXACT_GREEN; four published directions inspected, no new matrix')
