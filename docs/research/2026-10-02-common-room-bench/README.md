# Common Room bench skin for the existing object

`common-room-basic` places two copies of the existing 2×1 `object.bench`. Until this branch, those benches used the corridor bench art. This is a visual variant for the same object: two separate upholstered places on a petrol-steel frame with warm timber arms. It does not introduce a new buildable, price, function or save identity. The source is `assets/source/blender/furniture.common-room.upholstered-bench.blend`, authored by `tooling/blender/create-common-room-bench.py` in Blender 5.2.1.

The evaluated mesh bounds, including modifiers, are X **[0.12,1.88]**, Y **[0.10,0.88]**, Z **[0,0.9906]**. This keeps every visible vertex inside the occupied 2×1 squares with a minimum-corner origin. The [contact sheet](poses.png) samples four headings at three elevations. Separate seat pads and the center seam stay distinct while the 45° preview keeps the authored outline inside transparent borders.

The exporter renders 12 yaw positions (0° to 330° by 30°) and six elevations (20° to 70° by 10°), 72 SHA-named 256×256 PNGs. Source and manifest target `[1,0.5,0.52]`; orthographic span 4 tiles gives exactly **256/4 = 64 px/tile**. It strips volatile PNG metadata and rejects any non-transparent border pixel. Two complete Blender exports produced the same manifest SHA-256 `fffa2fbc8e5533883fb3e984328970ef1148d2955b1f5092c5ca54d100ed5995`.

The focused art test checks source and every frame hash plus camera scale. Corrupting only the first frame's expected SHA gave a real byte-hash mismatch (red 1/1); changing the exporter span from 4.0 to 3.7 gave 69.189 instead of 64 px/tile (red 1/1); restored art test green 1/1. Contextual rendering and real player Build/Save/Load remain separate acceptance work.
