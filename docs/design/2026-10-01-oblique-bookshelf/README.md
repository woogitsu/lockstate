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

## Footprint and scale correction — 2026-10-02
The existing source remains unchanged. Evaluated mesh bounds were X[-.975,.975], Y[-.56,.41], Z[0,2.1], outside its authoritative2x1 minimum-corner footprint. The shared fixture export now translates X by1 and contracts Y by.85 around the footprint centre: X[.025,1.975], Y[.024,.8485]. It targets[1,.5,1.05] and exports72poses at256x256/4tile orthographic span, matching64pixels per tile. This replaces the older128px/2.95span framing whose nominal64pixels-per-tile metadata did not match the real camera.
Two complete exports have identical manifest SHA2566722915a4f0e4f7f2ad733a012c99760e46e38a88f397875f0f560e8b8c0b350. The front40degree preview was opened. Integrity checks every frame byte and source hash, dimensions, footprint-centred target and scale. TargetX0 catalogue mutation is red; exact restoration plus shared catalogue/static gates25green/1skipped. Actual player construction, SaveLoad and pixel-consumer proof remain pending. Superseded original PNG files are retained until reference/history cleanup checks, so this checkpoint does not delete them or claim deployed availability.
