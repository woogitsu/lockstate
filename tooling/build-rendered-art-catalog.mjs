import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assertSourceInputsAreImages, readSourceHead } from './source-art-lfs-guard.mjs';

/**
 * The second publishing lane ADR 0100 accepted: a Blender render, not an
 * owner-supplied sheet.
 *
 * `tooling/build-source-art-catalog.mjs` hardcodes `dimensionsPx: {1448,1086}`
 * and one whole-sheet `sourceRectPx` for every entry, because every owner
 * sheet really is that size. Nothing about a render is like that -- each of the
 * 23 in `assets/rendered/environment/` has its own `sizePx`, its own
 * `footprintTiles` and its own `frameAspectDriftFromFootprint`
 * (`environment-objects.render.json`) -- so this is a sibling script with its
 * own output rather than a branch inside that one. ADR 0100's Decision
 * section names this exact split and why stretching the first generator's
 * schema was rejected.
 *
 * ## Why this publishes into `public/game-content/source-art/`, the same
 * directory the owner sheets use
 *
 * `public/_headers` already serves `/game-content/source-art/*` with
 * immutable, content-hash-keyed caching, and that rule is directory-wide --
 * ADR 0100 §Decision item 2 notes this is true "if reused verbatim" and that
 * reusing it needs no header change. Publishing into a sibling directory
 * would need a `public/_headers` edit, and that file is reserved to the owner
 * (`AGENTS.md` reservation 3) and was not released by ADR 0100's acceptance --
 * only the `ci.yml` LFS filter and decode assertion were. Reusing the
 * directory keeps this lane inside what was actually authorised.
 *
 * **The published filename still cannot reuse the render's own `assetId`
 * unqualified.** `fixture.cell.toilet_sink` already names a *different*,
 * already-published file in this same directory --
 * `public/game-content/source-art/fixture.cell.toilet_sink.<hash>.png`, the
 * owner's combined toilet+sink sheet, unread by any current sprite definition
 * but present because `build-source-art-catalog.mjs` publishes every intake
 * entry regardless of use. Two catalogs legitimately share this asset id (the
 * render and the owner sheet describe the same real-world object), so the
 * *published filename* carries a `rendered.` prefix the owner sheet's never
 * will, and every consumer of this catalog's `image` field is the one that
 * has to be able to tell the two apart.
 *
 * ## What is deliberately published and what is not
 *
 * `PUBLISHED_ASSET_IDS` below is not "all 23 renders `environment-objects.render.json`
 * describes" -- it is the render ids `src/rendering/assets/environment-sprites.ts`
 * actually declares (its `kind: 'rendered-art'` entries), the same "art
 * nothing draws costs nothing" rule `environmentSourceAssetIds()` already
 * enforces for the owner sheets. The brief that authorised this lane asked
 * for `object.toilet` proven on screen, not for the other 22 to ride along
 * unread; `tests/foundation/rendered-art-catalog-generator-contract.test.ts`
 * cross-checks this list against that file's declared ids so they cannot
 * drift apart silently.
 *
 * **Grown to four entries on 2026-09-06 (#1020), then back to three the next
 * day (#1059).** `object.bench`, `object.desk` and `object.storage-rack`
 * joined `object.toilet` in `environment-sprites.ts` after a per-object
 * legibility pass over the other 22 renders (`docs/adr/0100-*.md`,
 * `environment-art.ts`'s `OBJECTS_ON_COLOUR_FALLBACK` comment) found those
 * three, and only those three, worth their frame. `object.storage-rack` left
 * `environment-sprites.ts` again the next day, once a playtest actually built
 * one and looked at it: the render is a flat grey rectangle with a seam at
 * every zoom the game draws it at, which is the same "reads as a blob, not
 * the thing it names" failure the same pass had already refused for
 * `object.chair` (`environment-art.ts`'s `OBJECTS_ON_COLOUR_FALLBACK` comment
 * carries the reading in full). The rule above still holds either way: this
 * list follows that file rather than the other way round, so it shrank back
 * to three the moment the sprite registry did, and a fourth object gets a row
 * here only once it has one there again.
 *
 * **2026-09-23:** The storage rack returns with its own open-shelf model,
 * `furniture.storage.rack.wooden`; the closed locker remains unpublished.
 * `object.chair` now uses a separate slatted-back wooden model, not the
 * cushion-only visitor-chair render rejected by the same legibility pass.
 * The 3x2 canteen table is a separate model with three seats; the existing
 * 2x1 cell table-and-stool collection does not describe that buildable.
 */

const root = path.resolve(import.meta.dirname, '..');
const renderedDir = path.join(root, 'assets/rendered/environment');
const outputDir = path.join(root, 'public/game-content/source-art');
const outputManifest = path.join(root, 'public/game-content/rendered-art.v1.json');

/**
 * Ids this generator publishes. Kept here, rather than imported from
 * `rendered-sprites.ts`, because this script runs as plain Node ESM with no
 * TypeScript build step -- `tooling/build-source-art-catalog.mjs` reads its
 * input list from a JSON manifest for the identical reason. The foundation
 * test is what keeps the two lists honest, the same way `environment-art.test.ts`
 * keeps `OBJECTS_ON_COLOUR_FALLBACK` honest against the sprite registries.
 */
export const PUBLISHED_ASSET_IDS = [
  'door.interior.variants',
  'door.interior.face',
  'wall.interior.cap.overhead',
  'floor.linoleum.institutional',
  'floor.kitchen.nonslip',
  'floor.canteen.terrazzo',
  'floor.yard.compacted-earth',
  'floor.shower.ceramic',
  'fixture.cell.toilet_sink',
  'fixture.cell.waste_bin',
  'fixture.shower.head',
  'furniture.cell.bed.single.variants',
  'furniture.chair.wooden',
  'furniture.corridor.bench.variants',
  'furniture.dining.table.wooden',
  'furniture.kitchen.fridge',
  'furniture.delivery.dock_gate.closed',
  'furniture.kitchen.stove',
  'furniture.kitchen.prep_counter',
  'furniture.library.bookshelf',
  'furniture.laundry.washing_machine.twin',
  'furniture.medical.bed.single',
  'furniture.medical.cabinet',
  'furniture.office.desk.employee.variants',
  'furniture.security.surveillance_console',
  'furniture.storage.rack.wooden',
  'furniture.utility.control_panel',
  'wall.interior.face',
  'terrain.dirt.compacted',
  'terrain.grass.mown',
  'terrain.concrete.paving',
  'terrain.gravel.service_path',
  'terrain.rock.bedrock',
];

const sidecar = JSON.parse(await readFile(path.join(renderedDir, 'environment-objects.render.json'), 'utf8'));
if (sidecar.schemaVersion !== 1 || !Array.isArray(sidecar.entries)) {
  throw new Error('Invalid environment-objects.render.json sidecar.');
}
const sidecarById = new Map(sidecar.entries.map((entry) => [entry.assetId, entry]));
for (const assetId of PUBLISHED_ASSET_IDS) {
  if (!sidecarById.has(assetId)) {
    throw new Error(`PUBLISHED_ASSET_IDS names "${assetId}", which environment-objects.render.json does not describe.`);
  }
}

/*
 * Same reason `build-source-art-catalog.mjs` guards its own input directory:
 * `assets/rendered/environment/*.png` is git-lfs tracked (see the
 * `assets/rendered` rule in `.gitattributes`), so an unpulled checkout would
 * hash ~130 bytes of pointer text as if it were the render and publish that.
 * Awaited before anything is written, for the same reason the source-art
 * generator awaits its guard before its `rm`: a check that runs after the
 * damage is done is not a guard.
 */
await assertSourceInputsAreImages({ entries: PUBLISHED_ASSET_IDS, readHead: readSourceHead(renderedDir) });

await mkdir(outputDir, { recursive: true });
const entries = [];
for (const assetId of [...PUBLISHED_ASSET_IDS].sort()) {
  const sidecarEntry = sidecarById.get(assetId);
  const input = path.join(renderedDir, sidecarEntry.image);
  const buffer = await readFile(input);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (hash !== sidecarEntry.sha256) {
    throw new Error(
      `${sidecarEntry.image} does not match the sha256 environment-objects.render.json recorded for it ` +
        `(sidecar: ${sidecarEntry.sha256}, on disk: ${hash}). Refusing to publish a render the sidecar does not describe.`,
    );
  }
  const image = `rendered.${assetId}.${hash.slice(0, 12)}.png`;
  await copyFile(input, path.join(outputDir, image));
  entries.push({
    assetId,
    contentVersion: 1,
    image: `source-art/${image}`,
    sha256: hash,
    dimensionsPx: { width: sidecarEntry.sizePx.width, height: sidecarEntry.sizePx.height },
    footprintTiles: sidecarEntry.footprintTiles,
    frameTiles: sidecarEntry.frameTiles,
    frameAspectDriftFromFootprint: sidecarEntry.frameAspectDriftFromFootprint,
    sourceAttribution: {
      license: 'project-rendered, reproducible',
      producedBy: sidecar.producedBy,
      catalog: sidecar.catalog,
      blenderVersion: sidecar.blenderVersion,
    },
  });
}
await mkdir(path.dirname(outputManifest), { recursive: true });
await writeFile(outputManifest, `${JSON.stringify({ schemaVersion: 1, kind: 'lockstate.rendered-art-catalog', entries }, null, 2)}\n`);
console.log(`Generated ${entries.length} content-addressed rendered-art entries.`);
