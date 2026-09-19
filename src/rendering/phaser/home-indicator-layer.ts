import type Phaser from 'phaser';
import { type CameraState, type HomeIndicator, type WorldBounds, offscreenHomeIndicator } from '../camera';
import { OWNED_OUTLINE_COLOR } from '../world/appearance';

/**
 * Above every build preview, because it is the one mark on screen that is not
 * about the world under the pointer: a player who cannot see their prison is
 * not mid-gesture, and if the two ever coincide the answer on screen should be
 * defined rather than whichever drew last (`AreaOverlay` makes the same
 * argument one step lower).
 */
const HOME_INDICATOR_DEPTH = 1_000_000_002;

/** How far inside the viewport edge the glyph rides, in screen pixels. */
const INSET_PX = 34;

/** Half the chevron's span across the direction it points, in screen pixels. */
const HALF_SPAN_PX = 13;
/** How far the chevron reaches along the direction it points, from its base. */
const REACH_PX = 20;
/** The notch cut into the chevron's base, so it reads as an arrow rather than a triangle. */
const NOTCH_PX = 7;

const DISC_RADIUS_PX = 20;
const DISC_FILL = 0x05070a;
const DISC_FILL_ALPHA = 0.72;
const STROKE_WIDTH = 2;

/**
 * The "your prison is that way" marker (issue #794).
 *
 * The issue named three possible shapes -- clamp the pan, add a return-to-prison
 * control, or show something at the edge -- and this is the third.
 * `offscreenHomeIndicator` carries why a clamp was rejected on measurement; the
 * reason a marker was preferred to a control is that the control answers a
 * different question. Pressing a button moves the camera and tells the player
 * nothing; an arrow on the edge says *which way* and *how the view relates to
 * the world*, which is the sentence the issue actually reports missing
 * (*"nothing on it indicating which direction their prison is"*). It also costs
 * no HUD slot, on a HUD already measured at 44% of a 1280x720 canvas (#792),
 * and takes no agency: the pan stays free.
 *
 * Wordless on purpose. A glyph is true of any world; a sentence about distance
 * or direction would be a player-visible promise this layer would then have to
 * keep at every zoom, and `AGENTS.md`'s fourth reservation is about exactly
 * that. `hud.minimap.navigable` already tells a lost player there is a surface
 * to press; this tells them which way to look.
 *
 * Drawn at `setScrollFactor(0)`, so it is pinned to the viewport rather than to
 * the world -- which is the whole point, since the world it refers to is off
 * screen. Purely presentational: it reads a camera and a rectangle and writes
 * one `Graphics`; nothing here reaches the simulation.
 *
 * **Measured limitation, stated here rather than left for a player to find:
 * part of the ring this glyph rides is behind opaque HUD chrome.** `.hud` is
 * `position: fixed; inset: 0` over the whole canvas (`src/ui/hud/hud.css`), and
 * Phaser's camera viewport is the whole canvas, so an inset measured from the
 * viewport edge is not measured from the edge of the map the player can see.
 * Measured on the assembled page at 1280x720, zoom 100%, by reading
 * `document.elementFromPoint` at the four cardinal ring positions and the
 * bounding boxes of every `.hud` descendant with an opaque background: the
 * **due-north** position (640, 34) is inside `.hud-strip` (0,0 1280x81) and the
 * **due-east** position (1246, 360) is inside `.save-panel` (1004,147
 * 264x221). Due west and due south were clear, as is every bearing whose ring
 * point misses those boxes. Taken over the ring's perimeter at that viewport,
 * the top edge is wholly covered and roughly half the right edge is.
 *
 * **It is reported and not worked around, because the fix is not local to this
 * file.** Insetting far enough to clear the chrome means 101 px at the top and
 * 284 px at the right, which is no longer an edge marker; insetting correctly
 * means the renderer knowing which region of the canvas the HUD occupies, and
 * no such thing exists in this tree -- there is no safe-area rectangle, no
 * custom property and no port carrying one, so building one is a boundary
 * decision (`AGENTS.md` 1 and 3) rather than a constant to tune here. Against
 * the state issue #794 reports -- a black screen with nothing on it at all --
 * a marker visible on most bearings is strictly better than none, and the
 * bearings it is not visible on are recorded above for whoever takes the
 * safe-area question.
 */
export class HomeIndicatorLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private lastMark: HomeIndicator | undefined;

  public constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(HOME_INDICATOR_DEPTH);
    this.graphics.setScrollFactor(0);
  }

  /**
   * Redraws for this frame.
   *
   * `target` is `undefined` before any world has been published to the feed --
   * the state of a page with no prison at all, where there is nothing to point
   * at and the empty screen is honest.
   */
  public update(camera: CameraState, target: WorldBounds | undefined): void {
    this.graphics.clear();
    this.lastMark = undefined;
    if (target === undefined) return;
    const indicator = offscreenHomeIndicator(camera, target, INSET_PX);
    if (indicator === undefined) return;
    this.lastMark = indicator;

    const { x, y } = indicator.position;
    this.graphics.fillStyle(DISC_FILL, DISC_FILL_ALPHA);
    this.graphics.fillCircle(x, y, DISC_RADIUS_PX);
    this.graphics.lineStyle(STROKE_WIDTH, OWNED_OUTLINE_COLOR, 1);
    this.graphics.strokeCircle(x, y, DISC_RADIUS_PX);

    const cos = Math.cos(indicator.angleRadians);
    const sin = Math.sin(indicator.angleRadians);
    // The chevron in its own frame -- pointing along +x -- rotated by the same
    // angle rather than by a `Graphics` transform, so the disc above and the
    // arrow inside it cannot drift apart.
    const local: readonly (readonly [number, number])[] = [
      [REACH_PX / 2, 0],
      [-REACH_PX / 2, -HALF_SPAN_PX],
      [-REACH_PX / 2 + NOTCH_PX, 0],
      [-REACH_PX / 2, HALF_SPAN_PX],
    ];
    this.graphics.fillStyle(OWNED_OUTLINE_COLOR, 1);
    this.graphics.beginPath();
    local.forEach(([lx, ly], index) => {
      const px = x + lx * cos - ly * sin;
      const py = y + lx * sin + ly * cos;
      if (index === 0) this.graphics.moveTo(px, py);
      else this.graphics.lineTo(px, py);
    });
    this.graphics.closePath();
    this.graphics.fillPath();
  }

  /**
   * What was drawn on the last `update`, or `undefined` if nothing was --
   * diagnostics, in the same spirit as `WorldScene.rendererStats`.
   *
   * Recorded rather than recomputed on demand, because the question a caller
   * has is "what is on screen" and a second call to `offscreenHomeIndicator`
   * would answer "what would be on screen now", which is a different question
   * the moment the camera has moved since the frame.
   */
  public get mark(): HomeIndicator | undefined {
    return this.lastMark;
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
