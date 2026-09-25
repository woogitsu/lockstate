# Prisoner actor concept, revision 2

The eight-view sheet `prisoner-actor-eight-view-v2.png` and the cotton swatch `../textures/prisoner-jumpsuit-orange-v2.png` were generated on 2026-09-23 with the Codex image-generation tool. Its underlying model version is not exposed. The owner's Prison Architect screenshots guided the desired in-game readability and richness; the concept depicts an original character and does not copy any game asset.

`tooling/blender/create-prisoner-base.py` builds the source scene from this reference. It preserves the versioned eight-direction contract and existing 256×384 frame and foot pivot. The cotton swatch is packed into the `.blend`; no generated concept sheet is used directly as a runtime sprite. The shipped idle and walk atlases come from the pinned Blender 5.2 pipeline.
