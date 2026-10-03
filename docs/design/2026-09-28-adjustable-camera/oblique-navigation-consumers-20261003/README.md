# Angled navigation consumers audit — 2026-10-03

Base `3fabd094e0`, own worktree. Browser exclusively root; no server/browser launched. No production source change or defect reproduced.

The actual ObliqueWorldScene registered callbacks execute middle pan, right yaw/elevation drag and diagonal off-centre wheel while whole-square Build stays armed. The real scene minimap sink is then read after its normal update. An independent linear view basis and generic 2×2 determinant solve provide the ground corners; expectations do not call production projection/inverse or the minimap producer. The actual unchanged main bridge pick/project bodies are evaluated against that scene and checked for every corner of a4×7 whole-footprint rectangle, plus the real scene whole-square hover and final one-click command destination.

Twelve representative cases cover yaw/elevation (-45/20,0/45,37/53,90/80,217/25,323/65) and CSS/backing coordinate ratios1/2. These ratios test physical display conversion, not claimed native accessibility100/200% acceptance. Source rendering/input callbacks and camera state remain real; Phaser engine hosting, texture loading, repaint destinations and worker command sink are doubles. Minimap data uses real SparseWorld/WorldRenderView with shifted loaded bounds. No simulation service, art, layout or save changes.

This supplements the existing144 pose/fit/resize matrix by exercising the minimap consumer and actual navigation sequence in one pipeline. Fresh remote search `oblique minimap camera` and full Issues1914/1955 confirm existing stationary-preview and anchored-wheel contracts, which remain controls here. The source has not reproduced a new defect; no Issue is created.

Baseline12GREEN. Producer-negative proof is pending root's narrow temporary source mutation lease. Native/full-runtime acceptance is not claimed.
