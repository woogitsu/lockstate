import type { ObjectToolPort, TileRect } from '../rendering/build/area-picking';
import type { HudObjectPlacement, HudWorldObjectSource } from './hud';

/**
 * The armed object tool: the thing that turns "the player pressed this tile"
 * into a placement the HUD can dispatch.
 *
 * The third sibling of `BuildTool` and `RoomTool`, at the same layer and for
 * the same reason. It sits at the composition root, between two things that
 * must not know about each other: the renderer reports a *tile* and may not
 * submit a command (`tests/unit/rendering-module-boundaries.test.ts`), and the
 * HUD reports *intents* and may not import the simulation at all
 * (`AGENTS.md` boundary 1).
 *
 * ### Why a third class rather than a mode on `BuildTool`
 *
 * `BuildTool` implements two ports on one object, and its own comment gives the
 * rule for when that is right: the two are "asked different questions" but "the
 * routing is identical". Here the routing is *not* identical -- a wall gesture
 * leaves as a run of edges and this leaves as one tile -- and the state is not
 * either: this one holds a **footprint**, which the renderer asks for on every
 * paint and which a class that lays walls has no concept of. `RoomTool` was
 * split from `BuildTool` on exactly this reasoning one gesture earlier.
 *
 * ### It does not know what an object *is*
 *
 * No catalogue, no capabilities, no capacity rule. It holds the selected
 * buildable id because the intent carries one, and it holds the footprint
 * because the renderer has to draw it -- both handed in by the composition root,
 * which is the one layer that already knows the simulation's ids and the HUD's
 * keys. Every judgement about whether the tile is acceptable is the
 * simulation's, and every judgement about how to say so is the panel's.
 */
export class ObjectTool implements ObjectToolPort, HudWorldObjectSource {
  private armed = false;
  private definitionId: string | undefined;
  private tileFootprint: { readonly width: number; readonly height: number } | undefined;

  /**
   * Where a finished gesture goes.
   *
   * Attached after mounting rather than taken by construction, exactly as
   * `BuildTool.attachOrders` and `RoomTool.attachGestures` are, and for the same
   * reason: the HUD does not exist yet when the tool is built. Unattached, a
   * gesture is dropped, which is the honest behaviour for a page that has a
   * world and no interface and cannot happen in the running application.
   */
  private placements: ((placement: HudObjectPlacement) => void) | undefined;

  public attachPlacements(place: (placement: HudObjectPlacement) => void): void {
    this.placements = place;
  }

  /**
   * Arms or disarms the tool.
   *
   * Arming needs **both** a buildable and a footprint, for the reason
   * `BuildTool.setArmed` needs a buildable: an armed tool with nothing to draw
   * would take over the pointer and then show nothing, which reads as a broken
   * world rather than as a missing selection. The footprint is the object's, in
   * tiles, and it comes from the composition root because it is content.
   */
  public setArmed(
    armed: boolean,
    selection?: { readonly definitionId: string; readonly footprint: { readonly width: number; readonly height: number } },
  ): void {
    if (selection !== undefined) {
      this.definitionId = selection.definitionId;
      this.tileFootprint = selection.footprint;
    }
    this.armed = armed && this.definitionId !== undefined && this.tileFootprint !== undefined;
  }

  public isArmed(): boolean {
    return this.armed;
  }

  public footprint(): { readonly width: number; readonly height: number } | undefined {
    return this.armed ? this.tileFootprint : undefined;
  }

  public get selectedDefinitionId(): string | undefined {
    return this.definitionId;
  }

  /**
   * The pointer moved. Reported to nobody today, and declared anyway.
   *
   * `ObjectToolPort.target` is optional and this implementation is the honest
   * minimum: the footprint rectangle drawn in the world *is* the readout, and
   * the Build panel's target line is edge-shaped (`BuildPanelTarget` carries an
   * `edge` and a segment count), so routing a tile through it would print
   * "north" beside a bed. Giving the panel an object-shaped readout is a
   * surface change with its own layout budget, and it is not phase 1's.
   */
  public target(_rect: TileRect | undefined): void {
    // Intentionally empty; see the comment above.
  }

  /**
   * The gesture finished. One press, one object, one command.
   *
   * A disarmed tool or a tool with no selection places nothing. The second is
   * unreachable -- `setArmed` refuses to arm without both -- and returning
   * keeps it that way rather than asserting it.
   */
  public place(tile: { readonly tileX: number; readonly tileY: number }): void {
    const definitionId = this.definitionId;
    if (!this.armed || definitionId === undefined) return;
    this.placements?.({ definitionId, x: tile.tileX, y: tile.tileY });
  }
}
