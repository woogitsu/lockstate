# Runtime art pipeline

`assets/source/` contains immutable intake sheets and Blender source files. It is
never loaded by the game. `assets/intermediate/` holds ignored render frames.
Final atlases and manifests are generated into `public/assets/actors/`, where
Vite publishes them as static runtime assets.

The production path is:

1. Build or place a versioned `.blend` source file in `assets/source/blender/`.
2. Render directional frames with `tooling/blender/export-directional-sprites.py`.
3. Pack and validate them with `tooling/blender/pack-sprite-atlas.py`.

Run `./tooling/blender/build-prisoner-base.ps1` to rebuild the starter actor
set (prisoner, guard, medic, cook and staff), frames, production atlases and
final manifests in one operation.

## Pinned toolchain

The pipeline is pinned to one Blender version, declared once as
`SUPPORTED_BLENDER_VERSION` in
[`tooling/blender/pipeline_common.py`](../tooling/blender/pipeline_common.py).
Every Blender script asserts `bpy.app.version` against it and refuses to run on
anything else, because a mismatched toolchain does not fail on its own — it
renders, it validates and it produces subtly different pixels.

The pin is **Blender 5.2**, the version that authored the committed atlases
under `public/assets/actors/` (their `.blend` headers record `v0502`). Set
`LOCKSTATE_ALLOW_BLENDER_MISMATCH=1` to downgrade the assertion to a warning for
deliberate investigation on another build; output produced that way must not be
committed.

Blender is always invoked with `--background --factory-startup`, so user
preferences, enabled add-ons and startup files cannot influence a render.

## Reproducibility

Two independent runs of the whole chain, from the same inputs, must produce
byte-identical atlases and manifests. That is checked by:

```bash
node tooling/verify-pipeline-determinism.mjs --mode scene   # seconds
node tooling/verify-pipeline-determinism.mjs --mode full    # minutes: renders and packs
```

It builds the pipeline twice into scratch directories outside the repository and
compares SHA-256 digests of the source-scene fingerprint, the packed atlas PNGs,
the atlas manifest and `asset-registry.json`. It deliberately does not compare
the intermediate render frames: Blender stamps `Date`, `RenderTime` and the
absolute source `.blend` path into every rendered PNG as `tEXt` chunks, so those
files can never be byte-stable. `tests/determinism/art-pipeline-determinism.test.ts`
runs the fast mode when Blender is available and guards the individual
determinism fixes when it is not.

See the reproducibility section of [`docs/ART_PIPELINE.md`](../docs/ART_PIPELINE.md)
for what was measured and what is still open.

## Manual invocation

The canonical eight-direction and manifest contracts are in `assets/contracts/`;
a renderer may consume the generated manifest without knowing anything about
Blender.

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
$flags = '--background', '--factory-startup', '--python-exit-code', '1'
& $blender @flags --python tooling/blender/create-prisoner-base.py -- --asset-id actor.prisoner.base --output assets/source/blender/actor.prisoner.base.blend
& $blender @flags assets/source/blender/actor.prisoner.base.blend --python tooling/blender/export-directional-sprites.py -- --asset-id actor.prisoner.base --output assets/intermediate
& $blender @flags --python tooling/blender/pack-sprite-atlas.py -- --input assets/intermediate/actor.prisoner.base --contract assets/contracts/character-8-direction.contract.json --output public/assets/actors
```

`assets/intermediate/` is deliberately ignored. Final runtime atlases are
versioned Git LFS artifacts, so a production build publishes exactly the sprites
that were reviewed. Keep source renders and the final atlas manifest separate so
source art can be re-cropped or re-rendered deterministically.
