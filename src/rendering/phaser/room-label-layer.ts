import type Phaser from 'phaser';
import { ROOM_LABEL_DEPTH } from '../depth';
import type { RenderFrame } from '../feed/render-feed';
import { TILE_SIZE_PX, type TileRange } from '../tile-metrics';
import {
  ROOM_LABEL_COLOR,
  ROOM_LABEL_FONT_FAMILY,
  ROOM_LABEL_FONT_SIZE_PX,
  ROOM_LABEL_OUTLINE_COLOR,
  ROOM_LABEL_OUTLINE_WIDTH_PX,
  roomLabelFits,
} from '../world/appearance';
import { planRoomLabels, type RoomLabelPlacement } from '../world/room-labels';

/**
 * Writes each room's type name across its floor.
 *
 * ## What it answers, and why it is not the tint
 *
 * A play-test on 2026-09-06 measured the shipped category tints and found the
 * tightest room pair -- Reception against Kitchen -- separated by Euclidean
 * **3.57** RGB units against a per-pixel standard deviation of **15.54**: 0.23
 * of the noise it is drawn on, invisible at every zoom tested. It then measured
 * that eighteen evenly spaced hues would still leave the worst pair at **5.30**
 * with an arithmetic ceiling of **6.02**, so the channel cannot be fixed by
 * respacing it. Asked what should make a room legible instead, the owner ruled
 * *"Nazwa tekstem na mapie"* -- the name, as text on the map. This is that.
 *
 * ## Why this is a separate module from `TileLayer`, and a separate one from
 * ADR 0097's
 *
 * Not `TileLayer`, because a `Text` is not a `Graphics`: the tile layer's whole
 * cost model is one buffer per chunk and one per row, and a name belongs to a
 * *room*, which is neither. A room crossing a chunk boundary would be named
 * twice by anything keyed on a chunk -- ADR 0098 option C names that artefact
 * exactly -- and `room-labels.ts` exists to key on the region instead.
 *
 * Not ADR 0097's accepted per-room condition module either, and this is the
 * judgement the brief asked for. That module is defined by two properties this
 * one does not share: it is keyed by room **instance**, and it repaints on the
 * `simulation/delta` cadence because a 30-second-stale claim about whether a
 * cell is *working* is a false claim (ADR 0097 decision 2). A room's **type**
 * does not change while the prison runs, so it needs neither -- ADR 0098
 * decision 2 reason 3 says so in as many words: *"Identity is exactly the kind
 * of fact that bound is harmless for"*. Building a name on a delta channel that
 * does not exist yet would be paying transport for a fact the geometry snapshot
 * already carries.
 *
 * ## What the 30-second geometry window does to a name (issue #1037)
 *
 * The frame this reads is the same frame the floor under it was painted from:
 * `frame.world` is the only source for both, and the plan is rebuilt on exactly
 * the event `TileLayer` repaints on -- a change of `frame.revision`. So a name
 * can be stale, by up to the 30-second consistency poll, and it cannot be
 * *inconsistent*: a name says what the drawn frame says the floor beneath it is.
 * A room deleted twenty seconds ago is still drawn with its tint and still
 * carries its name, and the name is no more wrong than the floor. That is the
 * truth condition this feature is built against -- what the drawn frame holds,
 * not what the simulation currently holds -- and the channel that narrows the
 * window is being decided elsewhere.
 *
 * ## Cost
 *
 * One `Text` per *visible named region*, pooled on exactly the two events
 * `TileLayer` pools on -- a region scrolling out of view, and a new revision --
 * plus one more this layer has of its own: nothing at all on a zoom change,
 * because a zoom is a `setScale` on objects that already exist.
 *
 * The count is bounded by rooms on screen, which is tens, against the thousands
 * of tiles under them. `planRoomLabels` runs once per revision, not per frame.
 */
export class RoomLabelLayer {
  private readonly live = new Map<number, Phaser.GameObjects.Text>();
  private readonly pool: Phaser.GameObjects.Text[] = [];
  private plan: readonly RoomLabelPlacement[] = [];
  private plannedRevision = -1;
  /** Reused across frames so culling allocates nothing. */
  private readonly liveKeys = new Set<number>();

  /**
   * `nameFor` is handed in rather than derived here, for the reason
   * `AreaOverlay.update`'s tint is: the word is a localization decision and
   * localization lives at the composition root, three layers away. This module
   * is given **the text to draw**, never a message key and never a catalogue --
   * the same shape `WorldSceneOptions.roomTint` documents for a colour.
   */
  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly nameFor: (zoningNumericId: number) => string | undefined,
  ) {}

  /**
   * `zoom` is the camera's, and it is a parameter rather than a read off
   * `scene.cameras` so that the two things this method does with it -- sizing
   * and the fit test -- provably use one value. A method that read the camera
   * twice could scale a label against one zoom and admit it against another.
   */
  public update(frame: RenderFrame, range: TileRange, zoom: number): void {
    if (frame.revision !== this.plannedRevision) {
      this.plannedRevision = frame.revision;
      this.plan = planRoomLabels(frame.world);
      this.releaseAll();
    }
    if (!Number.isFinite(zoom) || zoom <= 0) return;

    this.liveKeys.clear();
    for (let index = 0; index < this.plan.length; index += 1) {
      const placement = this.plan[index] as RoomLabelPlacement;
      if (!overlaps(placement, range)) continue;
      const name = this.nameFor(placement.zoningNumericId);
      // A zoning id this build's catalogue does not name gets no label at all.
      // The floor is still tinted and still zoned; what is refused is inventing
      // a word for it, which is the half of `AGENTS.md` reservation 4 that the
      // 2026-09-04 release did not touch.
      if (name === undefined || name.length === 0) continue;

      const label = this.acquire(index);
      if (label.text !== name) label.setText(name);
      label.setPosition(placement.centreTileX * TILE_SIZE_PX, placement.centreTileY * TILE_SIZE_PX);
      // The reciprocal of the camera zoom, so one texture pixel is one screen
      // pixel at every zoom in `ZOOM_BOUNDS`: the name is the same size to the
      // player zoomed right out as zoomed right in, and it is never resampled.
      label.setScale(1 / zoom);
      const fits = roomLabelFits(label.width, placement.spanTiles, TILE_SIZE_PX, zoom);
      label.setVisible(fits);
      this.liveKeys.add(index);
    }

    for (const [key, label] of this.live) {
      if (this.liveKeys.has(key)) continue;
      this.live.delete(key);
      this.recycle(label);
    }
  }

  /** Live plus pooled, for the same budget assertions `TileLayer.pooledObjectCount` serves. */
  public get pooledObjectCount(): number {
    return this.live.size + this.pool.length;
  }

  /**
   * What is actually written on the map right now: one entry per name a player
   * can read, in the plan's north-to-south order.
   *
   * Read by `tests/browser/room-label-harness.ts` and by nothing in the game.
   * It reports the *drawn* state rather than the plan -- a placement whose name
   * does not fit at this zoom is absent -- because "is the name on screen" is
   * the claim the browser gate is for, and a plan is not a screen.
   */
  public get drawn(): readonly { readonly text: string; readonly worldX: number; readonly worldY: number }[] {
    const drawn: { text: string; worldX: number; worldY: number }[] = [];
    for (let index = 0; index < this.plan.length; index += 1) {
      const label = this.live.get(index);
      if (label === undefined || !label.visible) continue;
      drawn.push({ text: label.text, worldX: label.x, worldY: label.y });
    }
    return drawn;
  }

  public destroy(): void {
    for (const label of this.live.values()) label.destroy();
    for (const label of this.pool) label.destroy();
    this.live.clear();
    this.pool.length = 0;
    this.plan = [];
    this.plannedRevision = -1;
  }

  private acquire(key: number): Phaser.GameObjects.Text {
    const existing = this.live.get(key);
    if (existing !== undefined) return existing;
    const pooled = this.pool.pop();
    if (pooled !== undefined) {
      pooled.setVisible(true);
      this.live.set(key, pooled);
      return pooled;
    }
    const created = this.scene.add
      .text(0, 0, '', {
        fontFamily: ROOM_LABEL_FONT_FAMILY,
        fontSize: `${String(ROOM_LABEL_FONT_SIZE_PX)}px`,
        color: ROOM_LABEL_COLOR,
        stroke: ROOM_LABEL_OUTLINE_COLOR,
        strokeThickness: ROOM_LABEL_OUTLINE_WIDTH_PX,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(ROOM_LABEL_DEPTH);
    this.live.set(key, created);
    return created;
  }

  private recycle(label: Phaser.GameObjects.Text): void {
    label.setVisible(false);
    this.pool.push(label);
  }

  private releaseAll(): void {
    for (const [key, label] of this.live) {
      this.live.delete(key);
      this.recycle(label);
    }
  }
}

/**
 * Whether the rectangle the name is written in is on screen at all.
 *
 * The *room's* rectangle, not the text's box, and that is the conservative
 * direction on purpose: `roomLabelFits` only ever admits a name narrower than
 * `spanTiles`, so a name whose room is off screen cannot have glyphs on screen.
 */
function overlaps(placement: RoomLabelPlacement, range: TileRange): boolean {
  const halfWidth = placement.spanTiles / 2;
  const halfHeight = placement.spanRows / 2;
  return (
    placement.centreTileX + halfWidth >= range.minTileX &&
    placement.centreTileX - halfWidth <= range.maxTileX + 1 &&
    placement.centreTileY + halfHeight >= range.minTileY &&
    placement.centreTileY - halfHeight <= range.maxTileY + 1
  );
}
