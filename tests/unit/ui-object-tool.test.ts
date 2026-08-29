import { describe, expect, it } from 'vitest';

import { footprintRectAt, pickTileAtWorld } from '../../src/rendering/build/area-picking';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import type { BuildPanelTarget, HudObjectGesture } from '../../src/ui/hud';
import { ObjectTool } from '../../src/ui/object-tool';

/**
 * The object gesture, from a press on the world to something the HUD can
 * dispatch -- and, since ADR 0028 phase 3, from the same press to a *removal*.
 *
 * Two layers meet here and neither may know the other: `src/rendering/**` may
 * not submit a command, and the HUD may not import the simulation. So the
 * geometry is a pure function in the renderer, the routing is a class at the
 * composition root, and both are provable with no browser and no DOM --
 * `docs/TESTING.md`'s "use the lowest layer that proves the behavior". The
 * *rendered* half is `tests/browser/`'s.
 *
 * ## What these are written against
 *
 * A removal that only worked from the keyboard. `Undo` is bound to `KeyZ` and
 * nothing else, so before this mode existed a misplaced object was permanent for
 * the session on a touch device. The whole of the fix on this side is that the
 * tool can be armed to remove and that a press then reports a *removal*, so
 * these tests are one per link in that chain: arming with no selection, the two
 * gesture kinds a press produces, the one-tile ghost, and the mode surviving a
 * change of selected row.
 */

const at = (tileX: number, tileY: number) => ({
  x: (tileX + 0.5) * TILE_SIZE_PX,
  y: (tileY + 0.5) * TILE_SIZE_PX,
});

/** A tool with somewhere for gestures to go, and the list they went to. */
function armedTool(): { readonly tool: ObjectTool; readonly gestures: HudObjectGesture[] } {
  const gestures: HudObjectGesture[] = [];
  const tool = new ObjectTool();
  tool.attachGestures((gesture) => gestures.push(gesture));
  return { tool, gestures };
}

/** What the scene does with a press: pick the tile under the pointer, then hand the tool its anchor. */
function pressAt(tool: ObjectTool, tileX: number, tileY: number): void {
  const rect = pickTileAtWorld(at(tileX, tileY));
  tool.place({ tileX: rect.tileX, tileY: rect.tileY });
}

describe('a press becomes a placement or a removal, decided by the mode', () => {
  it('reports a placement carrying the selected buildable', () => {
    const { tool, gestures } = armedTool();
    tool.setArmed(true, { definitionId: 'bed-wooden', footprint: { width: 1, height: 2 } });

    pressAt(tool, 4, 6);

    expect(gestures).toEqual([{ kind: 'place', definitionId: 'bed-wooden', x: 4, y: 6 }]);
  });

  it('reports a removal carrying the tile and no buildable at all', () => {
    const { tool, gestures } = armedTool();
    tool.setArmed(true, { removing: true });

    pressAt(tool, 4, 7);

    // No `definitionId`, because a removal names no object type: what goes is
    // whatever is standing on the tile. A gesture that carried one would have
    // every consumer told to ignore a field.
    expect(gestures).toEqual([{ kind: 'remove', x: 4, y: 7 }]);
  });

  it('arms to remove with nothing selected, which is the point of the mode', () => {
    // A fresh tool has never been handed a buildable or a footprint, so it
    // cannot arm to place -- and it must still arm to remove, or a player whose
    // mistake was their first gesture could not undo it without a keyboard.
    const { tool, gestures } = armedTool();

    expect(tool.setArmed(true), 'arming to place needs a selection').toBeUndefined();
    expect(tool.isArmed()).toBe(false);

    tool.setArmed(true, { removing: true });
    expect(tool.isArmed()).toBe(true);
    expect(tool.isRemoving()).toBe(true);
    pressAt(tool, 9, 9);
    expect(gestures).toEqual([{ kind: 'remove', x: 9, y: 9 }]);
  });

  it('draws one tile while removing, whatever the selected row would have placed', () => {
    const { tool } = armedTool();
    tool.setArmed(true, { definitionId: 'bed-wooden', footprint: { width: 1, height: 2 } });
    expect(tool.footprint()).toEqual({ width: 1, height: 2 });

    tool.setArmed(true, { removing: true });

    // Not the bed's 1x2 and not the footprint of whatever is under the pointer
    // -- which is not knowable on this thread, because the placed objects live
    // in the simulation worker. One tile is exactly what the press means, and
    // `footprintRectAt` turns it into the rectangle the overlay draws.
    expect(tool.footprint()).toEqual({ width: 1, height: 1 });
    expect(footprintRectAt({ tileX: 3, tileY: 4 }, tool.footprint()!)).toEqual({ tileX: 3, tileY: 4, width: 1, height: 1 });
  });

  it('keeps the removal mode when the selected row changes underneath it', () => {
    // The Build panel repaints the armed tool whenever the selection moves, and
    // the call it makes carries no `removing`. If the mode reset there, choosing
    // a different row mid-removal would silently hand the pointer back to
    // placing and the next press would build something.
    const { tool, gestures } = armedTool();
    tool.setArmed(true, { removing: true });
    tool.setArmed(true, { definitionId: 'toilet-brick', footprint: { width: 1, height: 1 } });

    expect(tool.isRemoving()).toBe(true);
    pressAt(tool, 2, 2);
    expect(gestures).toEqual([{ kind: 'remove', x: 2, y: 2 }]);
  });

  it('leaves the removal mode on request, and then places again', () => {
    const { tool, gestures } = armedTool();
    tool.setArmed(true, { definitionId: 'bed-wooden', footprint: { width: 1, height: 2 } });
    tool.setArmed(true, { removing: true });
    tool.setArmed(true, { removing: false });

    // The selection it was last given is still there -- each tool keeps the last
    // one, exactly as `BuildTool.setArmed` always has -- so leaving the mode
    // does not cost the player their row.
    expect(tool.isRemoving()).toBe(false);
    expect(tool.selectedDefinitionId).toBe('bed-wooden');
    pressAt(tool, 5, 5);
    expect(gestures).toEqual([{ kind: 'place', definitionId: 'bed-wooden', x: 5, y: 5 }]);
  });

  it('reports nothing at all once disarmed, in either mode', () => {
    // Disarming has to stop the gesture and not merely change what it means: a
    // tool that kept reporting would delete things on a world the player thought
    // they were only looking at.
    const { tool, gestures } = armedTool();
    tool.setArmed(true, { removing: true });
    tool.setArmed(false);

    expect(tool.isArmed()).toBe(false);
    expect(tool.isRemoving()).toBe(false);
    expect(tool.footprint()).toBeUndefined();
    pressAt(tool, 1, 1);
    expect(gestures).toEqual([]);
  });

  it('says it is not removing while it is disarmed, even with the mode latched', () => {
    // `isRemoving()` answers the scene's question "which preview do I draw", and
    // the scene asks it whether or not the tool is armed. A latched mode on a
    // disarmed tool must read as not removing, or the overlay would paint a
    // removal ghost over a world nobody armed.
    const { tool } = armedTool();
    tool.setArmed(true, { removing: true });
    tool.setArmed(false);
    expect(tool.isRemoving()).toBe(false);

    tool.setArmed(true);
    expect(tool.isRemoving(), 'the mode is remembered, so re-arming resumes it').toBe(true);
  });
});

/**
 * The live readout, issue #550.
 *
 * The tool declared `target` and left it empty through phase 1, on the argument
 * that the Build panel's line was edge-shaped. The consequence was not a blank
 * line: the wall tool published its aims into that same line and was disarmed
 * without withdrawing them, so with a bed armed the panel named a tile the
 * player had finished with. `tests/unit/ui-build-target-readout.test.ts` holds
 * the whole sequence; these hold this tool's two halves of it.
 */
describe('the object tool says where the press would land', () => {
  function watched(): { readonly tool: ObjectTool; readonly aims: (BuildPanelTarget | undefined)[] } {
    const aims: (BuildPanelTarget | undefined)[] = [];
    const tool = new ObjectTool();
    tool.attachReadout((target) => aims.push(target));
    return { tool, aims };
  }

  it('reports the anchor tile, not the rectangle the ghost is drawing', () => {
    // The scene hands in the footprint, because that is what it paints. What the
    // readout answers is *where*, and where is the tile the press names -- the
    // same one `place` reports and the same one the command carries. A 1x2 bed
    // hovering over 4,6 is a press on 4,6.
    const { tool, aims } = watched();
    tool.setArmed(true, { definitionId: 'bed-wooden', footprint: { width: 1, height: 2 } });

    tool.target(footprintRectAt(pickTileAtWorld(at(4, 6)), { width: 1, height: 2 }));

    expect(aims).toEqual([{ x: 4, y: 6 }]);
  });

  it('reports no edge, because a tile has none', () => {
    // The line a bed reports into is shared with the wall tool, whose aims carry
    // an edge and a segment count. An object aim that carried either would have
    // the panel print "North" beside a bed.
    const { tool, aims } = watched();
    tool.setArmed(true, { removing: true });

    tool.target(footprintRectAt(pickTileAtWorld(at(9, 2)), { width: 1, height: 1 }));

    expect(aims.at(-1)).not.toHaveProperty('edge');
    expect(aims.at(-1)).not.toHaveProperty('segments');
  });

  it('withdraws its aim when it is disarmed', () => {
    const { tool, aims } = watched();
    tool.setArmed(true, { removing: true });
    tool.target(footprintRectAt(pickTileAtWorld(at(9, 2)), { width: 1, height: 1 }));
    expect(aims.at(-1)).toEqual({ x: 9, y: 2 });

    tool.setArmed(false);

    expect(aims.at(-1), 'a disarmed tool is aimed at nothing').toBeUndefined();
  });

  it('drops an aim when nothing is attached, which is a page with a world and no interface', () => {
    const tool = new ObjectTool();
    tool.setArmed(true, { removing: true });
    expect(() => tool.target(undefined)).not.toThrow();
    expect(() => tool.setArmed(false)).not.toThrow();
  });
});
