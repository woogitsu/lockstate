# Reception desk before and after

The Full HD Reception was built in the real app, saved, loaded, and photographed at −45°, 0°, and +45° yaw (45° tilt).

| yaw | before | after |
| --- | --- | --- |
| −45° | [before](before-yaw-minus45.png) | [after](after-yaw-minus45.png) |
| 0° | [before](before-yaw0.png) | [after](after-yaw0.png) |
| +45° | [before](before-yaw45.png) | [after](after-yaw45.png) |

Before, the 2×1 desk footprint was a flat blue-grey slab. Its fixed 0° desktop sample had one RGB colour (one unique colour in the 125×20 pixel check). After mapping the isolated employee desk source, the same sample has 246 colours from the lamp, ledger, paper tray, cup and desk edge. The browser test requires more than 100 colours and also verifies three poses after Save/Load.

The source is a deterministic Blender extraction of the existing employee-desk catalog collection. It preserves the 2×1 footprint, origin, picking and collision; only the oblique art mapping and rendered poses change.
