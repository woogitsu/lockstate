# Runtime art pipeline

`assets/source/` contains immutable intake sheets and Blender source files. It is
never loaded by the game. `assets/intermediate/` holds ignored render frames.
Final atlases and manifests are generated into `public/assets/actors/`, where
Vite publishes them as static runtime assets.

The production path is:

1. Put a versioned `.blend` source file in `assets/source/blender/`.
2. Render directional frames with `tooling/blender/export-directional-sprites.py`.
3. Pack and validate them with `tooling/blender/pack-sprite-atlas.py`.

Both scripts run through Blender 5.2 in background mode. The canonical
eight-direction and manifest contracts are in `assets/contracts/`; a renderer
may consume the generated manifest without knowing anything about Blender.

Run `./tooling/blender/build-prisoner-base.ps1` to rebuild the starter actor
set (prisoner, guard, medic, cook and staff), frames, production atlases and
final manifests in one operation.

Example (PowerShell):

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $blender -b assets/source/blender/prisoner.base.blend --python tooling/blender/export-directional-sprites.py -- --asset-id actor.prisoner.base --output assets/intermediate
& $blender -b --python tooling/blender/pack-sprite-atlas.py -- --input assets/intermediate --contract assets/contracts/character-8-direction.contract.json --output public/assets/actors
```

`assets/intermediate/` is deliberately ignored. Final runtime atlases are
versioned Git LFS artifacts, so a production build publishes exactly the sprites
that were reviewed. Keep source renders and the final atlas manifest separate so
source art can be re-cropped or re-rendered deterministically.
