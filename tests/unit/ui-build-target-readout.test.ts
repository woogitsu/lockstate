import { describe, expect, it } from 'vitest';

import { footprintRectAt, pickTileAtWorld } from '../../src/rendering/build/area-picking';
import { pickEdgeAtWorld } from '../../src/rendering/build/edge-picking';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import { Localizer, buildMessageCatalog, defaultMessageCatalogEn } from '../../src/services/localization';
import { BuildTool } from '../../src/ui/build-tool';
import { ObjectTool } from '../../src/ui/object-tool';
import { formatBuildTargetText, type BuildPanelTarget } from '../../src/ui/hud/build-panel';

/**
 * The Build panel's one live readout, labelled "Where", and the property it
 * exists for: **it names the tile the player is aiming at** (issue #550).
 *
 * ## What this is written against
 *
 * A readout that froze. With the wall tool armed it tracked the pointer
 * perfectly; the moment the player pressed "Remove", or selected a bed and
 * armed it, it kept showing the last edge the *wall* tool had reported and
 * showed it wherever the pointer went. Measured on the running game, pointer
 * only:
 *
 * ```
 * wall armed, pointer over 20,16  ->  "20, 16 · North"     (correct)
 * press Remove, pointer over  8,10 ->  "20, 16 · North"    (a lie)
 * press Remove, pointer over  5,18 ->  "20, 16 · North"    (the same lie)
 * bed armed,    pointer over  8,10 ->  "20, 16 · North"    (still)
 * ```
 *
 * A placeholder saying "Point at the world" is a control admitting it does not
 * know. A stale coordinate is a control asserting something false, on the one
 * line a player checks before deleting something.
 *
 * ## Why these assertions are shaped the way they are
 *
 * The defect had two halves and either alone reproduces it, so the assertions
 * are written to the *player's* claim rather than to either half:
 *
 * 1. the object tool published no aim at all (`ObjectTool.target` was empty), so
 *    nothing overwrote the line; and
 * 2. the wall tool was disarmed without withdrawing the aim it had published,
 *    so what stayed on the line was a specific wrong tile.
 *
 * An assertion written as "the readout equals whatever the last tool reported"
 * would have passed against both halves. These say what a player can find out:
 * aim somewhere, read the line, and the line names where you aimed.
 *
 * ## What this test does *not* cover, and why
 *
 * `src/main.ts` decides which of the two tools a row arms (its `arm-build-tool`
 * branch). It is the application's entry point -- importing it boots a Phaser
 * game -- so `armFromBuildPanel` below transcribes that arbitration rather than
 * calling it. A change to *which* tool gets armed will not fail here. What
 * fails here is any change that lets a tool keep an aim it no longer owns, or
 * that leaves a tool with no way to publish one, which is the whole of #550.
 *
 * DOM-free by necessity as well as by preference: `vitest.config.ts` runs in
 * `environment: 'node'`, so `createBuildPanel` cannot be called at all
 * (`docs/TESTING.md`). The two tools and `formatBuildTargetText` are the whole
 * decision; the panel's remaining job is to put that string in an element, and
 * `tests/browser/ui-shell.spec.ts` owns that.
 */

/** A world point in the middle of a tile, which is what a pointer over it produces. */
const overTile = (tileX: number, tileY: number) => ({
  x: (tileX + 0.5) * TILE_SIZE_PX,
  y: (tileY + 0.5) * TILE_SIZE_PX,
});

/**
 * A world point just inside a tile's north edge.
 *
 * Deliberately not the tile centre: `pickEdgeAtWorld` returns whichever of the
 * four sides is nearest, and the centre is equidistant from all of them. A
 * player aiming at a wall aims at an edge.
 */
const overNorthEdgeOf = (tileX: number, tileY: number) => ({
  x: (tileX + 0.5) * TILE_SIZE_PX,
  y: (tileY + 0.1) * TILE_SIZE_PX,
});

/**
 * The two tools and the one line they both report into.
 *
 * One sink for both, which is the arrangement in the running application: the
 * Build panel has exactly one `setTarget`, and the composition root and
 * `mountHud` each point a tool at it.
 */
function panelWithTools(): {
  readonly walls: BuildTool;
  readonly objects: ObjectTool;
  readonly shown: () => BuildPanelTarget | undefined;
} {
  let target: BuildPanelTarget | undefined;
  const walls = new BuildTool();
  const objects = new ObjectTool();
  walls.attachReadout((next) => {
    target = next;
  });
  objects.attachReadout((next) => {
    target = next;
  });
  return { walls, objects, shown: () => target };
}

/**
 * What `src/main.ts`'s `arm-build-tool` branch does with one press of the Build
 * panel's arm or remove control. Transcribed, not called -- see the file's own
 * note on what that does and does not cover.
 */
function armFromBuildPanel(
  tools: { readonly walls: BuildTool; readonly objects: ObjectTool },
  press: {
    readonly armed: boolean;
    readonly definitionId?: string;
    readonly footprint?: { readonly width: number; readonly height: number };
    readonly removing: boolean;
  },
): void {
  if (press.removing) {
    tools.walls.setArmed(false);
    tools.objects.setArmed(press.armed, { removing: true });
    return;
  }
  if (press.footprint !== undefined && press.definitionId !== undefined) {
    tools.walls.setArmed(false);
    tools.objects.setArmed(press.armed, {
      definitionId: press.definitionId,
      footprint: press.footprint,
      removing: false,
    });
    return;
  }
  tools.objects.setArmed(false, { removing: false });
  tools.walls.setArmed(press.armed, press.definitionId);
}

/** What the scene does on a hover: pick under the pointer, hand it to whichever tool is armed. */
function hoverAt(
  tools: { readonly walls: BuildTool; readonly objects: ObjectTool },
  tileX: number,
  tileY: number,
): void {
  if (tools.walls.isArmed()) {
    tools.walls.target([pickEdgeAtWorld(overNorthEdgeOf(tileX, tileY))]);
    return;
  }
  if (!tools.objects.isArmed()) return;
  const footprint = tools.objects.footprint();
  if (footprint === undefined) throw new Error('an armed object tool always has a footprint to draw');
  tools.objects.target(footprintRectAt(pickTileAtWorld(overTile(tileX, tileY)), footprint));
}

/**
 * Templates invented for this file, so the expected strings below can be
 * written out in full and can only come from the branch they name.
 *
 * A fixture that formatted its own expectation with the same function would
 * hold for any implementation, including the one that shipped the defect.
 */
const sentinels = buildMessageCatalog('en', {
  'build-edge.north.name': 'EDGE-NORTH-SENTINEL',
  'hud.build.target-none': 'NO-TARGET-SENTINEL',
  'hud.build.target-value': 'edge/{x}/{y}/{edge}',
  'hud.build.target-run': 'run/{count}/{x}/{y}/{edge}',
  'hud.build.target-tile': 'tile/{x}/{y}',
});
const sentinelLocalizer = new Localizer({ locale: 'en', catalogs: [sentinels] });
const readoutOf = (target: BuildPanelTarget | undefined): string =>
  formatBuildTargetText(
    (key, parameters) => (parameters === undefined ? sentinelLocalizer.format(key) : sentinelLocalizer.format(key, parameters)),
    target,
  );

describe('the Where readout names the tile the player is aiming at', () => {
  it('tracks the pointer while a wall is armed', () => {
    const tools = panelWithTools();
    armFromBuildPanel(tools, { armed: true, definitionId: 'wall-brick', removing: false });

    hoverAt(tools, 20, 16);
    expect(readoutOf(tools.shown())).toBe('edge/20/16/EDGE-NORTH-SENTINEL');

    hoverAt(tools, 8, 10);
    expect(readoutOf(tools.shown())).toBe('edge/8/10/EDGE-NORTH-SENTINEL');
  });

  it('names the tile a bed is aimed at, not the last edge the wall tool reported', () => {
    const tools = panelWithTools();
    armFromBuildPanel(tools, { armed: true, definitionId: 'wall-brick', removing: false });
    hoverAt(tools, 20, 16);

    // The player picks a bed. One control, two tools: the row decides.
    armFromBuildPanel(tools, {
      armed: true,
      definitionId: 'bed-wooden',
      footprint: { width: 1, height: 2 },
      removing: false,
    });
    hoverAt(tools, 8, 10);

    expect(readoutOf(tools.shown())).toBe('tile/8/10');
  });

  it('names the tile a removal is aimed at, wherever the wall tool was last pointed', () => {
    const tools = panelWithTools();
    armFromBuildPanel(tools, { armed: true, definitionId: 'wall-brick', removing: false });
    hoverAt(tools, 20, 16);

    armFromBuildPanel(tools, { armed: true, definitionId: 'wall-brick', removing: true });

    // Three aims, three answers. The measured defect gave "20, 16 · North" to
    // all three, so one assertion here would not have been enough to tell a
    // frozen line from a correct one.
    hoverAt(tools, 8, 10);
    expect(readoutOf(tools.shown())).toBe('tile/8/10');
    hoverAt(tools, 12, 13);
    expect(readoutOf(tools.shown())).toBe('tile/12/13');
    hoverAt(tools, 5, 18);
    expect(readoutOf(tools.shown())).toBe('tile/5/18');
  });

  it('says it is aimed at nothing between letting go of one tool and aiming the next', () => {
    const tools = panelWithTools();
    armFromBuildPanel(tools, { armed: true, definitionId: 'wall-brick', removing: false });
    hoverAt(tools, 20, 16);

    armFromBuildPanel(tools, { armed: true, definitionId: 'wall-brick', removing: true });

    // Nothing has been aimed under the new mode yet, and the honest answer is
    // the placeholder rather than the tile the previous gesture ended on. This
    // is the state the frozen readout was hiding.
    expect(readoutOf(tools.shown())).toBe('NO-TARGET-SENTINEL');
  });

  it('goes back to naming the edge when the wall tool takes the pointer back', () => {
    const tools = panelWithTools();
    armFromBuildPanel(tools, { armed: true, definitionId: 'wall-brick', removing: true });
    hoverAt(tools, 5, 18);

    armFromBuildPanel(tools, { armed: true, definitionId: 'wall-brick', removing: false });
    expect(readoutOf(tools.shown()), 'the removal aim outlived the removal').toBe('NO-TARGET-SENTINEL');

    hoverAt(tools, 12, 13);
    expect(readoutOf(tools.shown())).toBe('edge/12/13/EDGE-NORTH-SENTINEL');
  });

  it('clears when the player puts the pointer down entirely', () => {
    const tools = panelWithTools();
    armFromBuildPanel(tools, { armed: true, definitionId: 'bed-wooden', footprint: { width: 1, height: 2 }, removing: false });
    hoverAt(tools, 8, 10);
    expect(readoutOf(tools.shown())).toBe('tile/8/10');

    armFromBuildPanel(tools, { armed: false, definitionId: 'bed-wooden', removing: false });

    expect(readoutOf(tools.shown())).toBe('NO-TARGET-SENTINEL');
  });
});

/**
 * The sentinel templates above are invented, so on their own they would not
 * notice a shipped `hud.build.target-tile` that lost one of its coordinates --
 * the readout would name half a tile, which is the same class of defect
 * arriving through the catalog instead of through the tools. Asserted as a
 * difference and a containment rather than against transcribed English,
 * because the wording is content's to change.
 */
describe('the shipped strings say which tile, not just that there is one', () => {
  const shipped = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
  const format = (target: BuildPanelTarget | undefined): string =>
    formatBuildTargetText(
      (key, parameters) => (parameters === undefined ? shipped.format(key) : shipped.format(key, parameters)),
      target,
    );

  it('reads back both coordinates of a tile aim', () => {
    const aim = format({ x: 18, y: 15 });
    expect(aim, 'the tile readout drops a coordinate').toContain('18');
    expect(aim).toContain('15');
    expect(aim).not.toBe(format({ x: 15, y: 18 }));
  });

  it('says nothing about an edge for an aim that has none', () => {
    // A bed is not laid on a side of a tile, and a readout that named one would
    // be inventing a fact about the placement the player is about to make.
    const aim = format({ x: 18, y: 15 });
    expect(aim).not.toContain(shipped.format('build-edge.north.name'));
    expect(aim).not.toContain(shipped.format('build-edge.west.name'));
  });

  it('still distinguishes a tile aim from an edge aim on the same tile', () => {
    expect(format({ x: 18, y: 15 })).not.toBe(format({ x: 18, y: 15, edge: 'north', segments: 1 }));
  });
});
