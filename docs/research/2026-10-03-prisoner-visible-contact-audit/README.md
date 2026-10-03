# Released Prisoner: visible body contacts and unchanged canonical fit

2026-10-03; isolated source baseline `5008b18920edce057bd4d21446ddfcac1ac8586e`.

## Decision

**Keep the existing model unchanged.** Fresh real Blender inspection found no
material visible gap that warrants adding or replacing a part. This builds on
the [earlier source/camera audit](../2026-10-03-prisoner-legacy-camera-audit/README.md),
which had already retained all 48 meshes, eight complete stored material graphs,
all eight animation poses and reproduced 18 historical canonical poses. That
report was read before this pass; no previous geometry repair is duplicated.

The released source is `assets/source/blender/actor.prisoner.base.blend`, SHA256
`48e3457298d9d3a2cc9dcd39725ba263450bffea27df05d42fe90afc6e659c0b`.
The actual actor mapping maps `actor.prisoner` to `actor.prisoner.base`.
No production change is retained in the source, canonical descriptor, canonical PNG, runtime mapping, movement,
persistence, palette or producer files.

## Fresh actual geometry evidence

Pinned Blender 5.2.1 LTS opened the actual source. The
[audit/guard](../../../tooling/research/audit-prisoner-visible-contacts.py) evaluates
real post-modifier world triangles and tests points inside both solids using BVH
ray parity. Twenty structural contacts pass in **every one of eight animation
poses**, **160 actual interior witnesses** total:

- Torso → hips → trouser legs → shoes → soles.
- Torso → neck → head → hair.
- Torso → sleeves → forearms → hands; retained cuffs attach to the sleeves.
- Retained rolled trouser hems attach to their respective legs.

The overlap search checks a bounded interior grid; an unsuccessful midpoint alone
is not treated as proof of a gap. Contacts are not inferred from AABB overlap or
part names. Small decoration seams are not promoted into structural defects.

The fresh raw meshes/modifiers, complete shader graphs including packed texture
hashes, action curves, evaluated eight-pose records, geometric normal records
and source bounds all equal the earlier actual source inventory. All 48 original
parts remain. See [fresh source/contact receipt](./actual-source-contacts-and-fit.json).

## Four fresh canonical angle replays

Only four source replays were rendered: yaws −135°, −45°, 45°, 135°, elevation45°.
This adds the two rear diagonal angles to the previous 18-pose investigation
without rerendering an entire catalog. All four decoded RGBA arrays match their
current published canonical frames exactly: **zero changed pixels**. The
[comparison receipt](./fresh-four-canonical-replays.json) retains exact canonical
paths, both byte hashes and alpha bounds. Replay PNG bytes differ because the
existing diagnostic normalization encoder differs from the historical metadata
encoder; the decoded image is identical.

The opened [published/replay inspection sheet](./published-and-fresh-blender-four-angles.png)
shows actual source pixels at nearest-neighbour ×3, labelled accordingly. The
earlier 18-pose canonical sheet was also opened. Torso/neck, shoulders, arms,
hands, trouser legs and boots read as a connected existing character in the
examined angles. The orange cloth, ID patch, dark hair and boots remain original.
No artificial mounting piece, micro-gap bridge or new concept is added.

Historical accepted source fit is retained: SpriteRoot scale0.5, ortho8, camera
radius12, target0/0/0, original historical studio lighting. Runtime descriptor
remains 512×512, nominal64, pivot256/256 and target0/0/0. The current role exporter
handles Cook/Medic/Staff with different source-camera settings; it is not used to
replace the Prisoner's accepted fit. The replay uses the same recovered settings
as the existing historical diagnostic and saves no source changes.

## Real semantic mutation → RED → exact restoration → GREEN

One actual production `.blend` was mutated by Blender in this own worktree:
`Head.location.z += 0.6`, then the real source was saved. The unchanged guard
reopened that file and failed on `Neck / Head at frame 1`, **before** checking
the source hash or comparing retained inventories. This proves the contact
guard reads actual geometry rather than only rejecting a digest change.

Original source bytes were then restored exactly. A fresh Blender guard run
passed all 160 contacts and all retained records. The descriptor stayed byte
exact and all **72 canonical PNG byte hashes remained unchanged** throughout.
See [control receipt](./actual-production-mutation-control.json),
[actual Blender mutation](./actual-production-head-mutation.log),
[semantic RED](./red-actual-detached-head.log) and
[exact-restoration GREEN](./green-exact-restored-source.log).

Each Blender process was terminal before the next: one process, one thread,
four renders total. No browser/server or native run was started. This is source,
geometry and canonical-raster evidence, not admitted-Prisoner native acceptance
or visual acceptance of the new whole prison at its final camera zoom.

## Concrete next existing subject

Inspect the existing **Cook**, `assets/source/blender/actor.cook.base.blend`,
published by `public/game-content/oblique-actor-cook.v1.json` and used by the real
`actor.cook` mapping. Its apron/cap silhouette is relevant to the newly built
Kitchen. Check the original apron/body contacts and current canonical angled
poses through `render-role-actors-oblique.py -- --asset-id cook --preview`,
preserving the Cook's own existing camera and source. This is a proposed next
audit, not a claim that Cook has a defect or permission to change its scale.

## Replay

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --threads 1 --python-exit-code 1 --python tooling/research/audit-prisoner-visible-contacts.py -- --render
```

Omit `-- --render` for the real source/contact guard alone. Outputs are ignored
under `assets/intermediate/prisoner-visible-contact-audit`; the canonical source
and rendered catalog are never written by this audit command.
