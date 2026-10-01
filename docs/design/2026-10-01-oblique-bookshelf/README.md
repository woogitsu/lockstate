# Oblique library bookshelf

This module replaces the flat library bookshelf art in the adjustable oblique camera lane.

## Authored source

- Blender source: `assets/source/blender/furniture.library.bookshelf.variants.blend`
- Rebuild script: `assets/source/blender/scripts/build_library_bookshelf.py`
- Manifest: `public/game-content/oblique-furniture.library-bookshelf.v1.json`
- Runtime registry: `public/game-content/oblique-module-registry.v1.json`
- Object mapping: `object.bookshelf` → `furniture.library.bookshelf.variants`

The source is procedural and renders an institutional 2×1 bookshelf with oak frame,
steel dividers, two open rows and varied book spines. The authored pose grid is 12
rotations (30° increments) by six elevations (20°, 30°, 40°, 50°, 60°, 70°), 72
transparent 128×128 PNG frames. The camera uses an orthographic projection so each
frame remains stable when the player changes the angle in the game.

## Verification

The frames and blend file were rendered locally with Blender 5.2.1 LTS using the
rebuild script. The manifest contains a SHA-256 for the source and each frame; the
registry and runtime mapping use the same canonical asset id. `pnpm typecheck` and
full tests are delegated to CI because this checkout has no installed dependencies
and the workspace currently pins pnpm 11.22.0.
