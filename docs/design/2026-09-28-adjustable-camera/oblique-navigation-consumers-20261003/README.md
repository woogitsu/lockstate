# Angled navigation consumers audit — 2026-10-03

Base `3fabd094e0`, own worktree. Browser exclusively root; no server/browser launched. No production source change or defect reproduced.

The actual ObliqueWorldScene registered callbacks execute middle pan, right yaw/elevation drag and diagonal off-centre wheel while whole-square Build stays armed. The real scene minimap sink is then read after its normal update. An independent linear view basis and generic 2×2 determinant solve provide the ground corners; expectations do not call production projection/inverse or the minimap producer. The actual unchanged main bridge pick/project bodies are evaluated against that scene and checked for every corner of a4×7 whole-footprint rectangle, plus the real scene whole-square hover and final one-click command destination.

Twelve representative cases cover yaw/elevation (-45/20,0/45,37/53,90/80,217/25,323/65) and CSS/backing coordinate ratios1/2. These ratios test physical display conversion, not claimed native accessibility100/200% acceptance. Source rendering/input callbacks and camera state remain real; Phaser engine hosting, texture loading, repaint destinations and worker command sink are doubles. Minimap data uses real SparseWorld/WorldRenderView with shifted loaded bounds. No simulation service, art, layout or save changes.

This supplements the existing144 pose/fit/resize matrix by exercising the minimap consumer and actual navigation sequence in one pipeline. Fresh remote search `oblique minimap camera` and full Issues1914/1955 confirm existing stationary-preview and anchored-wheel contracts, which remain controls here. The source has not reproduced a new defect; no Issue is created.

## Producer negatives and restoration

Original focused12 cases pass. Both independently authorized producer mutations are unique one-site changes in this worktree, performed sequentially with finally byte-for-byte restore. A bounded50-case group includes the new12, the existing14 registered wheel-axis/anchor legal controls and24 actual World Camera/main adapter legal controls. Controls are necessary to show each mutation stays within its angled consumer surface.

| Run | Result | Runner duration |
| --- | --- | --- |
| Original combined baseline | 50 GREEN | 1.26 s |
| Actual Scene minimap viewport width halved | 12 RED /38 legal controls GREEN | 1.09 s |
| Exact Scene restore | 50 GREEN | 1.06 s |
| Actual main angled forward screen X shifted64 | 12 RED /38 legal controls GREEN | 1.04 s |
| Exact main restore | 50 GREEN | 1.10 s |

The first mutation fails the independent ground AABB right bound; the second fails true complete room-footprint forward corners by64 backing pixels (32 at CSS ratio2). Bounds/picking expectations never read main's forward result. Original camera wheel direction/anchor and World adapter controls remain green in both negatives. Mutation logs, exact unique strings and restored source hashes are committed.

App/tools TypeScript and strict standalone TypeScript for the new test pass. Production sources have zero final diff. The current angled producers are correct for this audited boundary; no permanent source fix or new Issue. Native/full-runtime acceptance is not claimed, and no CSSOM observer setup failure from the separate reference-fixture task is counted as product evidence here.
