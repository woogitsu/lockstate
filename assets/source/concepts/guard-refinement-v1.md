# Guard silhouette refinement

`guard-refinement-multiview-v1.png` is an original four-view concept reference,
generated with the built-in imagegen tool on 2026-09-24. It is not a runtime
sprite. The front, back, side and high three-quarter views guided the guard-only
Blender model revision in `tooling/blender/create-prisoner-base.py`.

Prompt: Original game character concept sheet, four consistent views of one
stylized prison security guard character for an original top-down management
simulation. Full body in every panel. Practical navy uniform with structured
short-sleeve shirt, slate shoulder epaulettes visible from overhead, matching
patrol cap with a simple geometric silver badge, dark duty belt, radio pouch,
keys, trousers and boots. Warm expressive face, restrained fabric wear, crisp
silhouette at 64-pixel character height. No weapon, text, logo, prison scene,
interface or imitation of another game's artwork.

The implemented revision keeps the rig, eight direction order, walk cycle and
foot pivot unchanged. Compact slate shoulder tabs and a top-facing cap mark
make the guard recognizable from the game's oblique camera without bright
wing-like shoulder shapes. The first render's larger, near-white tabs were
rejected after viewing the full idle atlas at game scale.
