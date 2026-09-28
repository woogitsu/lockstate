# Corridor bench refinement — 2026-09-24

`corridor-bench-multiview-v3.png` is an original generated modelling reference showing one matching 2×1 institutional bench from directly overhead, front, side and oblique views. The built-in image generator did not expose a backend model version. The concept is a reference and is not copied into the runtime sprite.

The Blender model retains the buildable `object.bench` footprint and its `furniture.corridor.bench.variants` ID. Four individually textured oak slats have a softened crown and a visible thin highlight, with dark seams between them. Exposed blue-grey steel end brackets and four compact bolted floor plates give the overhead silhouette a readable frame. The wood uses the existing packed source texture with a different deterministic coordinate offset and tint per plank; all runtime pixels still come from Blender's pinned orthographic pipeline.

The change is visual only. Seating capability, construction definition, room requirements and collision footprint remain as before.
