import type { RoomToolPort, TileRect } from '../rendering/build/area-picking';
import type { WorldRenderView } from '../rendering/world/world-view';
import { roomPerimeterEnclosure, type RoomEnclosure } from '../simulation/rooms/enclosure';
import type { HudRoomArea, HudWorldRoomSource, HudRoomGesture } from './hud';

/**
 * The armed room tool: the thing that turns "the player dragged a rectangle
 * here" into a designation the HUD can dispatch.
 *
 * The sibling of `BuildTool`, at the same layer and for the same reason. It
 * sits at the composition root, between two things that must not know about
 * each other: the renderer reports a *rectangle in tiles* and may not submit a
 * command (`tests/unit/rendering-module-boundaries.test.ts`), and the HUD
 * reports *intents* and may not import the simulation at all. This is where a
 * gesture on the world becomes something in the HUD's own vocabulary.
 *
 * ### Why a second class rather than a mode on `BuildTool`
 *
 * `BuildTool` implements two ports on one object, and its own comment gives
 * the rule for when that is right: the two are "asked different questions" but
 * "the routing is identical, so a second class would duplicate `attachOrders`
 * and the argument for it". Here the routing is *not* identical. A build
 * gesture always means the same thing; a room gesture means one of two things
 * depending on a mode the panel owns, and it carries no definition id in one
 * of them. Folding that into `BuildTool` would put a `removing` flag on the
 * class that lays walls, where every reader of it would have to establish that
 * walls are never removed by a drag.
 *
 * ### One gesture, one designation
 *
 * A rectangle leaves here as **one** report, which is trivially true -- a
 * gesture is one rectangle by construction -- and worth stating because the
 * consequence is the interesting half: the simulation validates every tile
 * before writing any, so a 64x64 designation is one command, one outcome and
 * one thing the player is told about. That is unlike a wall run, which is one
 * command per edge and could be half refused.
 *
 * ### It does not know what a room *is*
 *
 * No catalogue, no minimum size. It holds the selected room id because the
 * intent carries one, and it holds whether the gesture removes because the
 * renderer has to know which preview to draw. Every judgement about whether
 * the rectangle is *acceptable* is the simulation's, and every judgement about
 * how to say so is the panel's.
 *
 * **It does know one geometric fact about a room, since issue #493: whether a
 * rectangle's own perimeter is walled in.** That is not the enclosure *rule* --
 * this class has no idea which room types require one, and never will, since
 * that is content the panel alone holds. It is the one measurement the panel
 * cannot take itself (`src/ui/hud/**` may not import the simulation) and the
 * renderer cannot decide (a renderer answering an acceptability question from
 * logic of its own would be a second source of truth, the same reasoning
 * `WorldRenderView.isTileOwned`'s own comment gives for ownership). So it sits
 * here, at the one seam that already knows both the world and the HUD's
 * vocabulary -- reusing `roomPerimeterEnclosure`, the identical function
 * `RoomZoningService.zone` refuses an open room by, rather than a second walk
 * of the same two edge layers that could silently disagree with it.
 */
export class RoomTool implements RoomToolPort, HudWorldRoomSource {
  private armed = false;
  private removing = false;
  private roomId: string | undefined;
  /**
   * The scene's own read of the world, current to within one rendered frame.
   *
   * `undefined` until the first frame, and while it is, `classifyArea` reports
   * `'open'` -- the same answer an empty `WorldRenderView` would give, since
   * every chunk reads as unmaterialised, but reached with no need to construct
   * one just to ask it. Never mutated here: `setWorld` replaces the reference
   * wholesale, exactly as `WorldRenderView.fromSnapshot` replaces the scene's
   * own copy, so this class never becomes a second owner of world state.
   */
  private world: WorldRenderView | undefined;

  /**
   * Where a finished gesture goes.
   *
   * Attached after mounting rather than taken by construction, exactly as
   * `BuildTool.attachOrders` is and for the same reason: the HUD does not exist
   * yet when the tool is built. Unattached, a gesture is dropped, which is the
   * honest behaviour for a page that has a world and no interface and cannot
   * happen in the running application.
   */
  private gestures: ((gesture: HudRoomGesture) => void) | undefined;

  /** Points the live readout at the mounted panel. */
  private readout: ((area: HudRoomArea | undefined) => void) | undefined;

  public attachGestures(place: (gesture: HudRoomGesture) => void): void {
    this.gestures = place;
  }

  public attachReadout(readout: (area: HudRoomArea | undefined) => void): void {
    this.readout = readout;
  }

  /**
   * Arms or disarms the tool.
   *
   * Arming to *create* needs a room type, for the reason `BuildTool.setArmed`
   * needs a buildable: an armed tool with nothing selected would take over the
   * pointer and then refuse every gesture, which reads as a broken world rather
   * than as a missing selection.
   *
   * Arming to *remove* needs nothing, and that asymmetry is the point of the
   * mode. A removal names no room type -- what comes out is whatever the
   * rectangle covers -- so requiring a selection before the player could undo a
   * mistake would be a rule with nothing behind it, and it would bite hardest
   * in the case removal exists for: a stray drag the player wants gone.
   */
  public setArmed(armed: boolean, options: { readonly roomId?: string; readonly removing?: boolean } = {}): void {
    if (options.roomId !== undefined) this.roomId = options.roomId;
    this.removing = options.removing ?? this.removing;
    this.armed = armed && (this.removing || this.roomId !== undefined);
    // A tool that is not armed is aimed at nothing, and says so -- the rule
    // `BuildTool.setArmed` records in full (#550).
    //
    // This surface reached the defect from a different direction than the Build
    // panel did, and it is the same defect: nothing else clears the Rooms
    // panel's "Area" line when the player presses "Draw on map" a second time,
    // so it kept naming the last rectangle the pointer passed over while the
    // pointer had been handed back to the camera. Leaving the tab already
    // cleared it; disarming on the tab did not.
    if (!this.armed) this.readout?.(undefined);
  }

  public isArmed(): boolean {
    return this.armed;
  }

  public isRemoving(): boolean {
    return this.armed && this.removing;
  }

  public get selectedRoomId(): string | undefined {
    return this.roomId;
  }

  /** The scene's newest read of the world. See the field's own comment. */
  public setWorld(world: WorldRenderView): void {
    this.world = world;
  }

  /**
   * Whether `area`'s own perimeter is walled in, against the newest world this
   * tool has been handed.
   *
   * Takes an `HudRoomArea` rather than a `TileRect`, unlike every other method
   * here: its two callers are both on the HUD side of the seam -- a finished
   * world gesture, already converted, and the panel's typed-coordinates form,
   * which never held a `TileRect` at all. `roomPerimeterEnclosure`'s own
   * `TileRectangle` is the same four readonly numbers as `HudRoomArea`, so the
   * value is handed through with no conversion and no second shape to keep in
   * step.
   */
  public classifyArea(area: HudRoomArea): RoomEnclosure {
    if (this.world === undefined) return 'open';
    return roomPerimeterEnclosure(this.world, area).enclosure;
  }

  /**
   * The pointer moved. Reported as the rectangle it is, unlike
   * `BuildTool.target`, which summarises a run into its first edge and a count.
   *
   * A wall run has to be summarised because a list of sixty-four coordinates is
   * not a readout. A rectangle already *is* the summary: four numbers say
   * exactly what the player is about to designate, and the two that matter most
   * -- the side lengths -- are what the minimum-size rule is checked against.
   */
  public target(rect: TileRect | undefined): void {
    if (this.readout === undefined) return;
    if (rect === undefined) {
      this.readout(undefined);
      return;
    }
    this.readout({ x: rect.tileX, y: rect.tileY, width: rect.width, height: rect.height });
  }

  /**
   * The gesture finished.
   *
   * A removal is reported with no room id, because it names no room type. A
   * designation with no selection is dropped rather than reported: the tool
   * could not have been armed to create without one, so this is unreachable
   * rather than merely unlikely, and returning keeps it that way.
   */
  public place(rect: TileRect): void {
    if (!this.armed || rect.width < 1 || rect.height < 1) return;
    const area: HudRoomArea = { x: rect.tileX, y: rect.tileY, width: rect.width, height: rect.height };
    if (this.removing) {
      this.gestures?.({ kind: 'remove', area });
      return;
    }
    const roomId = this.roomId;
    if (roomId === undefined) return;
    this.gestures?.({ kind: 'designate', roomId, area });
  }
}
