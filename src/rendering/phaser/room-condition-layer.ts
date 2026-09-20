import type Phaser from 'phaser';
import { ROOM_CONDITION_MARK_DEPTH } from '../depth';
import type { RenderFrame } from '../feed/render-feed';
import { TILE_SIZE_PX, type TileRange } from '../tile-metrics';
import {
  ROOM_CONDITION_MARK_ALPHA,
  ROOM_CONDITION_MARK_BACKING_COLOR,
  ROOM_CONDITION_MARK_BACKING_WIDTH_PX,
  ROOM_CONDITION_MARK_COLOR,
  ROOM_CONDITION_MARK_INSET_PX,
  ROOM_CONDITION_MARK_WIDTH_PX,
} from '../world/appearance';
import { planRoomConditionMarks, type RoomConditionMark } from '../world/room-condition-marks';

/**
 * Draws one mark around every room nobody can get into.
 *
 * ## The defect this closes
 *
 * Issue #1022 measured a sealed cell against a working one -- same tiles, same
 * crop, same population -- at **6,061 differing pixels of 147,456 (4.11%)**,
 * and **3,072 of them are the door itself**. Everything else about the two
 * rooms was pixel-identical, so the world view said nothing about whether
 * either cell worked. With this layer the sealed one carries a boundary mark
 * and the working one carries none.
 *
 * ## Why this is its own module and not `TileLayer`
 *
 * ADR 0097 decision 2, in as many words: a live condition cue **must not** be
 * painted by `TileLayer`, because that layer repaints on a change of
 * `revision` or of visible range and `revision` is deliberately geometry-only
 * -- bumping it for a delta would throw away ADR 0040 slice 1's entire saving.
 * So the cue lives in a separate display object, keyed by room instance rather
 * than by tile, redrawn when a condition delta arrives. This is that module.
 *
 * It is also why this layer keys its redraw on the *plan* rather than on
 * `frame.revision`: the rectangles move with the revision, the ordinals move
 * with the delta, and only one of those is in `revision`.
 *
 * ## Cost
 *
 * One `Graphics`, cleared and re-stroked when the drawn plan changes or the
 * visible range moves. Two strokes per marked room, and the marked set is the
 * rooms that are *broken* -- in a prison that works, empty. `planRoomConditionMarks`
 * runs once per frame over two small lists (tens of rooms, not thousands of
 * tiles) and allocates nothing when either is empty.
 */
export class RoomConditionLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private drawnKey = '';

  public constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(ROOM_CONDITION_MARK_DEPTH);
  }

  public update(frame: RenderFrame, range: TileRange): void {
    const marks = planRoomConditionMarks(frame.rooms, frame.roomConditions);
    const visible: RoomConditionMark[] = [];
    for (const mark of marks) {
      if (!overlaps(mark, range)) continue;
      visible.push(mark);
    }

    // Re-stroking every frame would be a per-frame cost for a picture that
    // changes on a player's gesture; the key is what the strokes are a
    // function of, so an unchanged key is an unchanged picture. It is a string
    // rather than a revision because neither of this layer's two inputs has
    // one it could use (see the class comment).
    const key = visible.map((mark) => `${mark.instanceId}:${String(mark.condition)}`).join('|');
    if (key === this.drawnKey) return;
    this.drawnKey = key;

    this.graphics.clear();
    for (const mark of visible) {
      const left = mark.tileX * TILE_SIZE_PX + ROOM_CONDITION_MARK_INSET_PX;
      const top = mark.tileY * TILE_SIZE_PX + ROOM_CONDITION_MARK_INSET_PX;
      const width = mark.width * TILE_SIZE_PX - 2 * ROOM_CONDITION_MARK_INSET_PX;
      const height = mark.height * TILE_SIZE_PX - 2 * ROOM_CONDITION_MARK_INSET_PX;
      if (width <= 0 || height <= 0) continue;
      this.graphics.lineStyle(ROOM_CONDITION_MARK_BACKING_WIDTH_PX, ROOM_CONDITION_MARK_BACKING_COLOR, ROOM_CONDITION_MARK_ALPHA);
      this.graphics.strokeRect(left, top, width, height);
      this.graphics.lineStyle(ROOM_CONDITION_MARK_WIDTH_PX, ROOM_CONDITION_MARK_COLOR, ROOM_CONDITION_MARK_ALPHA);
      this.graphics.strokeRect(left, top, width, height);
    }
  }

  /**
   * What is actually marked on the map right now, in the plan's order.
   *
   * Read by `tests/browser/` and by nothing in the game, exactly as
   * `RoomLabelLayer.drawn` is: "is the mark on screen" is the claim a browser
   * gate is for, and a plan is not a screen.
   */
  public get drawn(): readonly string[] {
    return this.drawnKey === '' ? [] : this.drawnKey.split('|');
  }

  public destroy(): void {
    this.graphics.destroy();
    this.drawnKey = '';
  }
}

function overlaps(mark: RoomConditionMark, range: TileRange): boolean {
  return (
    mark.tileX <= range.maxTileX &&
    mark.tileX + mark.width - 1 >= range.minTileX &&
    mark.tileY <= range.maxTileY &&
    mark.tileY + mark.height - 1 >= range.minTileY
  );
}
