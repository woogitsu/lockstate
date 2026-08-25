import type { ObjectToolPort, TileRect } from '../rendering/build/area-picking';
import type { HudObjectGesture, HudWorldObjectSource } from './hud';

/**
 * What the preview covers while the tool is armed to remove: one tile.
 *
 * Not the selected row's footprint, and not the footprint of whatever is under
 * the pointer. The first would draw a 1x2 rectangle for a press that removes a
 * 3x2 table; the second is not knowable on this thread, because the placed
 * objects live in the simulation worker.
 */
const REMOVAL_FOOTPRINT = { width: 1, height: 1 } as const;

/**
 * The armed object tool: the thing that turns "the player pressed this tile"
 * into a placement -- or, since ADR 0028 phase 3, a removal -- the HUD can
 * dispatch.
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
 *
 * ### Removal is a mode, not a fourth tool
 *
 * `RoomTool` set the precedent one gesture earlier and the argument is the same:
 * placing and removing are the same gesture -- one press, one tile -- reported
 * to the same consumer, differing only in what the press means and which colour
 * the ghost is drawn in. A fourth class would duplicate `attachGestures`, the
 * arming arbitration and the footprint, to hold one boolean. What made `RoomTool`
 * a separate class from `BuildTool` was a different *shape*; this is not one.
 */
export class ObjectTool implements ObjectToolPort, HudWorldObjectSource {
  private armed = false;
  private removing = false;
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
  private gestures: ((gesture: HudObjectGesture) => void) | undefined;

  public attachGestures(report: (gesture: HudObjectGesture) => void): void {
    this.gestures = report;
  }

  /**
   * Arms or disarms the tool, to place or to remove.
   *
   * Arming to **place** needs both a buildable and a footprint, for the reason
   * `BuildTool.setArmed` needs a buildable: an armed tool with nothing to draw
   * would take over the pointer and then show nothing, which reads as a broken
   * world rather than as a missing selection. The footprint is the object's, in
   * tiles, and it comes from the composition root because it is content.
   *
   * Arming to **remove** needs neither, and that asymmetry is the whole point of
   * the mode -- the same one `RoomTool.setArmed` records for un-designating. A
   * removal names no object type: what goes is whatever is standing on the tile
   * the player pressed. Requiring a selection first would put a rule in front of
   * the control that exists to undo a mistake, and it would bite hardest in the
   * case that mistake is: the player chose the wrong row, placed it, and now
   * wants it gone.
   *
   * `removing` persists across a call that omits it, exactly as `roomId` and the
   * footprint do, so a selection change while removing does not silently put the
   * tool back into placing.
   */
  public setArmed(
    armed: boolean,
    options: {
      readonly definitionId?: string;
      readonly footprint?: { readonly width: number; readonly height: number };
      readonly removing?: boolean;
    } = {},
  ): void {
    if (options.definitionId !== undefined) this.definitionId = options.definitionId;
    if (options.footprint !== undefined) this.tileFootprint = options.footprint;
    this.removing = options.removing ?? this.removing;
    this.armed =
      armed && (this.removing || (this.definitionId !== undefined && this.tileFootprint !== undefined));
  }

  public isArmed(): boolean {
    return this.armed;
  }

  public isRemoving(): boolean {
    return this.armed && this.removing;
  }

  /**
   * The rectangle the preview should draw.
   *
   * `1x1` while removing, and the port states why: the object that will go may
   * be any size, and its size lives in the worker. One tile is exactly what the
   * press means.
   */
  public footprint(): { readonly width: number; readonly height: number } | undefined {
    if (!this.armed) return undefined;
    return this.removing ? REMOVAL_FOOTPRINT : this.tileFootprint;
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
   * The gesture finished. One press, one tile, one command.
   *
   * Which command is decided **here** and not in the scene, because this is the
   * layer that holds the mode and the scene may not decide what a press means.
   * Removing reports the tile alone; placing reports the tile and the selected
   * buildable.
   *
   * A disarmed tool reports nothing. A tool armed to place with no selection
   * also reports nothing, and that case is unreachable -- `setArmed` refuses to
   * arm to place without both halves -- so returning keeps it unreachable rather
   * than asserting it.
   */
  public place(tile: { readonly tileX: number; readonly tileY: number }): void {
    if (!this.armed) return;
    if (this.removing) {
      this.gestures?.({ kind: 'remove', x: tile.tileX, y: tile.tileY });
      return;
    }
    const definitionId = this.definitionId;
    if (definitionId === undefined) return;
    this.gestures?.({ kind: 'place', definitionId, x: tile.tileX, y: tile.tileY });
  }
}
