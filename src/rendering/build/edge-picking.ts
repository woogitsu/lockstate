import { TILE_SIZE_PX, worldToTile } from '../tile-metrics';

/**
 * Turning a point on the world into the tile edge a player meant.
 *
 * Pure geometry: no Phaser, no DOM, no simulation. It is the whole of the
 * "which edge did I just click" decision, so it can be reasoned about in a
 * unit test instead of by waving a mouse at a canvas.
 *
 * ### Why the pointer picks the edge, and not a separate control
 *
 * A wall lives on a tile edge, not on a tile (`docs/WORLD.md`). A pointer
 * lands somewhere *inside* a tile, and the part of the tile it lands in
 * already says which edge was meant -- near the top means the north edge,
 * near the left means the west edge. Making the player state that again in a
 * second control would be asking for information the gesture already carried.
 *
 * All four sides are pickable even though the world stores only two, because
 * "the bottom of this tile" and "the top of the tile below" are the same
 * edge: a south pick resolves to the north edge of `(x, y + 1)`, and an east
 * pick to the west edge of `(x + 1, y)`. The player never has to know that.
 */

export type BuildEdgeId = 'north' | 'west';

export interface EdgeTarget {
  readonly tileX: number;
  readonly tileY: number;
  readonly edge: BuildEdgeId;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A drag longer than this is clamped rather than obeyed.
 *
 * A run is one command per segment, and a careless flick across a zoomed-out
 * world would otherwise submit hundreds of build orders in one gesture --
 * every one of them consuming materials, and every one of them needing an
 * undo. Sixty-four is far longer than any wall a player draws deliberately
 * and far shorter than an accident.
 */
export const MAX_RUN_SEGMENTS = 64;

/**
 * An edge's identity as a string, for a `Set` or a `Map` key.
 *
 * **It has no caller in `src/`, and the module that wants it cannot have it.**
 * `BuildTool.deduplicate` (`src/ui/build-tool.ts`) de-duplicates a run by
 * exactly this format, written out inline -- cited by symbol because the line
 * number this used to give, `:138`, had drifted onto an unrelated method.
 * Calling this instead would be a **value** import
 * from `src/rendering/` into `src/ui/` -- which
 * `tests/unit/ui-orchestration-boundaries.test.ts` records as forbidden for
 * that file, in terms that are about intent rather than mechanics: *"a value
 * import from `src/rendering/` would mean the orchestrator had started calling
 * into the renderer rather than being handed its reports."*
 *
 * So this is deliberately not shared, and deliberately not deleted either:
 * #141 lists it among the exports with no reference anywhere and explicitly
 * does not propose deleting them. What was missing is the third option, and
 * measuring it sharpened what #141 called a two-implementation pair: the two
 * strings are identical today, but only **this** one is a contract, because
 * only this one is exported. `BuildTool`'s copy is a private `Set` key, so any
 * injective function of the same three fields would serve equally -- reordering
 * its fields is a mutation that survives, correctly.
 *
 * `tests/unit/edge-key-agreement.test.ts` therefore pins two different things:
 * this function's exact format, as the exported contract it is, and that
 * `BuildTool` de-duplicates by the same three fields. Dropping `edge` from its
 * key fails; renaming the separator here fails.
 *
 * A renderer-side caller may still appear; the format is the natural one for
 * an `EdgeTarget`, and `edgeTargetsEqual` beside it is already used by
 * `world-scene.ts`.
 */
export function edgeTargetKey(target: EdgeTarget): string {
  return `${target.tileX},${target.tileY},${target.edge}`;
}

export function edgeTargetsEqual(left: EdgeTarget | undefined, right: EdgeTarget | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.tileX === right.tileX && left.tileY === right.tileY && left.edge === right.edge;
}

/**
 * The edge nearest a world point.
 *
 * Ties break towards north, then west -- the two edges the world actually
 * stores -- so a pick that lands exactly on a corner is still a single,
 * repeatable answer rather than a coin toss. Which edge a near-corner pick
 * resolves to is exactly what the on-screen ghost exists to show before the
 * player commits.
 */
export function pickEdgeAtWorld(point: WorldPoint): EdgeTarget {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('World point must be finite.');
  }

  const tileX = worldToTile(point.x);
  const tileY = worldToTile(point.y);
  const withinX = point.x / TILE_SIZE_PX - tileX;
  const withinY = point.y / TILE_SIZE_PX - tileY;

  const toNorth = withinY;
  const toSouth = 1 - withinY;
  const toWest = withinX;
  const toEast = 1 - withinX;
  const nearest = Math.min(toNorth, toWest, toSouth, toEast);

  if (nearest === toNorth) return { tileX, tileY, edge: 'north' };
  if (nearest === toWest) return { tileX, tileY, edge: 'west' };
  // The two sides the world keeps no slot of its own for.
  if (nearest === toSouth) return { tileX, tileY: tileY + 1, edge: 'north' };
  return { tileX: tileX + 1, tileY, edge: 'west' };
}

/**
 * How far a drag must travel before it counts as a drag rather than a click.
 *
 * Half a tile: far enough that a shaky tap is still a tap, close enough that
 * a deliberate drag is recognised before the hand has left the first tile.
 */
export const DRAG_AXIS_THRESHOLD_PX = TILE_SIZE_PX / 2;

/**
 * The edge nearest a point *on a given axis*.
 *
 * A run along x is made of north edges, a run along y of west edges. Once the
 * drag has said which way it is going, the only question left is which of the
 * two candidate edges on that axis the press was nearer -- the top of this
 * tile or the top of the next one down; the left of this tile or the left of
 * the one to its right.
 *
 * ### The mid-line is a tie, and it breaks towards the pressed tile (#886)
 *
 * A press exactly halfway down a tile is not nearer either of its two
 * horizontal edges, and one halfway across is not nearer either of its
 * vertical ones. The comparison used to be `< 0.5`, which sent that press to
 * the tile **below** or to the **right** -- a tile the player did not press.
 * Two things it contradicted, and the second is the one a player sees:
 *
 * - `edgeRunFromDrag` below states the division of labour as *"The press says
 *   which tile; the drag says which way"*, and `pickEdgeAtWorld` above states
 *   its own tie rule as *"towards north, then west"*, which is towards the
 *   pressed tile. On the mid-line this function disagreed with both.
 * - The hover ghost is painted from `pickEdgeAtWorld` and the run from this
 *   function (`previewHover` and `extendBuild` in
 *   `src/rendering/scene/world-scene.ts`), so hovering a tile's centre drew
 *   the wall on that tile's top line and then dragging sideways moved it to
 *   the line below -- with the edge *kind* unchanged, so nothing the player
 *   could see explained the jump. A preview that moves for no visible reason
 *   is the one thing `BuildOverlay` exists to prevent.
 *
 * Found while measuring issue #886, whose premise -- that four wall drags
 * around a rectangle do not enclose it -- is refuted: four drags traced along
 * the tile boundary lines lay exactly the `2 * (width + height)` perimeter
 * edges and the room zones first time. What the reproduction had hit was this
 * tie, reached exactly because a press at a tile centre is on both mid-lines
 * at once. `tests/browser/playtest-886-do-four-drags-enclose.playtest.ts` is
 * the measurement.
 *
 * It does **not** make a drag through the tile centres enclose the tiles it
 * crossed, and no rule here could: the mid-line is equidistant from the two
 * lines the wall could go on, so whichever way the tie falls, two of the four
 * sides land one tile from where a player aiming at the middle of a row of
 * tiles meant them. What changes is that the ghost and the run agree, and that
 * the run starts on the tile that was pressed.
 */
export function pickEdgeOnAxis(point: WorldPoint, axis: 'x' | 'y'): EdgeTarget {
  const tileX = worldToTile(point.x);
  const tileY = worldToTile(point.y);
  if (axis === 'x') {
    const withinY = point.y / TILE_SIZE_PX - tileY;
    return { tileX, tileY: withinY <= 0.5 ? tileY : tileY + 1, edge: 'north' };
  }
  const withinX = point.x / TILE_SIZE_PX - tileX;
  return { tileX: withinX <= 0.5 ? tileX : tileX + 1, tileY, edge: 'west' };
}

/**
 * The whole gesture: what a press at `press` dragged to `current` asks for.
 *
 * A press that has barely moved is a click, and a click is exactly the
 * nearest edge -- all four sides live, corner included, so pointing at the
 * bottom of a tile places the wall you are pointing at.
 *
 * Once the drag has clearly committed to a direction, that direction picks
 * the axis and the axis re-picks the edge. An earlier version locked the axis
 * to whichever edge the press happened to land nearest, and it was wrong in
 * the hand: pressing a hair left of centre and dragging *sideways* laid a
 * single vertical segment and no run at all. The press says which tile; the
 * drag says which way. Both are information the gesture already carried, and
 * the ghost shows the answer before the player commits to it.
 */
export function edgeRunFromDrag(press: WorldPoint, current: WorldPoint): readonly EdgeTarget[] {
  const dx = current.x - press.x;
  const dy = current.y - press.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_AXIS_THRESHOLD_PX) {
    return [pickEdgeAtWorld(press)];
  }
  return edgeRunBetween(pickEdgeOnAxis(press, Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'), current);
}

/**
 * The run of edges from `anchor` towards `point`, once the axis is settled.
 *
 * A north edge runs east-west and a west edge runs north-south, so the anchor
 * fixes the axis here -- choosing it is `edgeRunFromDrag`'s job, one level up,
 * where the drag direction is known.
 *
 * Always ascending, whichever way the drag went, so the same wall submits the
 * same commands in the same order (`docs/DETERMINISM.md`). Always includes
 * the anchor, so a press with no movement is a run of one -- a tap and a drag
 * are the same code path.
 */
export function edgeRunBetween(anchor: EdgeTarget, point: WorldPoint): readonly EdgeTarget[] {
  const alongX = anchor.edge === 'north';
  const from = alongX ? anchor.tileX : anchor.tileY;
  const rawTo = alongX ? worldToTile(point.x) : worldToTile(point.y);
  const direction = rawTo >= from ? 1 : -1;
  const span = Math.min(Math.abs(rawTo - from), MAX_RUN_SEGMENTS - 1);
  const to = from + direction * span;

  const segments: EdgeTarget[] = [];
  for (let value = Math.min(from, to); value <= Math.max(from, to); value += 1) {
    segments.push(
      alongX
        ? { tileX: value, tileY: anchor.tileY, edge: 'north' }
        : { tileX: anchor.tileX, tileY: value, edge: 'west' },
    );
  }
  return segments;
}

/**
 * What the renderer needs from whoever owns the build tool.
 *
 * A port, not a class: the scene must not know that a build order is a
 * protocol command, and `src/rendering/**` may not submit one (pinned by
 * `tests/unit/rendering-module-boundaries.test.ts`). The scene reports a
 * gesture; the composition root turns it into commands.
 */
export interface BuildToolPort {
  /** True while world pointer input should build instead of pan. */
  isArmed(): boolean;
  /** The player finished a gesture. Segments are canonical and de-duplicated. */
  place(segments: readonly EdgeTarget[]): void;
  /** Live feedback for the panel's readout. `undefined` when nothing is targeted. */
  target?(segments: readonly EdgeTarget[] | undefined): void;
}

/**
 * What the renderer needs from whoever owns the edit history (#261).
 *
 * The same shape and the same reason as `BuildToolPort` above: the scene is
 * where a key press is recognised -- it owns the keyboard adapter and the
 * context set that keeps a control quiet while a text field has focus -- and
 * it may not turn one into a command. It reports the request; the composition
 * root decides what an undo is.
 *
 * A **separate** port rather than two more methods on `BuildToolPort`, because
 * the two answer different questions. `BuildToolPort` is asked whether the
 * world pointer builds and is handed the gesture it drew; undo is neither, and
 * it must work whether or not a tool is armed. One object may implement both
 * -- `BuildTool` does -- and nothing here requires that.
 *
 * It lives beside `BuildToolPort` in this file for the reason that one does:
 * these are the ports the scene is given, and the picking helpers above are
 * what it uses to fill one of them.
 */
export interface EditHistoryPort {
  /** The player asked for the last thing they did to be reversed. */
  undo(): void;
  /** The player asked for the last thing they undid to be reapplied. */
  redo(): void;
}

/**
 * What the renderer needs from whoever owns *arming* (issue #959).
 *
 * A **third** port beside `BuildToolPort` and `EditHistoryPort`, and a
 * separate one for the reason `EditHistoryPort` is separate: it answers a
 * different question. `BuildToolPort` is *asked* whether the world pointer
 * builds and is handed the gesture it drew; this is *told* that the player
 * has put the tool down, and it is not the build tool's alone -- one press of
 * `Escape` means "put down whatever I am holding", and which of the three
 * tools that is lives in the HUD, on whichever panel armed it.
 *
 * So the scene names no tool here, deliberately. It has three ports and a
 * documented arbitration between them (`isBuildArmed`/`isObjectArmed`/
 * `isRoomArmed`), and a scene that chose which one to stand down would be
 * running that arbitration a second time, in a place where being wrong means
 * the player's pointer stays taken. The composition root already holds the
 * one answer.
 *
 * Absent, `Escape` does exactly what it did before this port existed: it
 * abandons whatever gesture is in progress and leaves the arming alone. That
 * is the state of every harness that supplies no arming owner.
 */
export interface ToolStandDownPort {
  /**
   * The player asked for the armed tool to be put down.
   *
   * Unconditional, and asked even when nothing is armed -- for the reason
   * `BuildTool.undo` is unconditional. Whether anything was armed is the
   * HUD's own state, and a scene that filtered on its own read of it would
   * make the key work only when the renderer and the panel happened to agree.
   */
  standDown(): void;
}
