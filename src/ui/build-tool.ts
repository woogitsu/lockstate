import type { BuildToolPort, EdgeTarget } from '../rendering/build/edge-picking';
import type { BuildPanelTarget, HudBuildOrder, HudWorldBuildSource } from './hud';

/**
 * The armed build tool: the thing that turns "the player dragged here" into
 * a build order the HUD can dispatch.
 *
 * It sits at the composition root's layer, between two things that must not
 * know about each other. The renderer reports *edges* -- it may not submit a
 * command (`tests/unit/rendering-module-boundaries.test.ts`) and must never
 * become the place a build is decided. The HUD reports *intents* -- it may
 * not import the simulation at all. This is where a gesture on the world
 * becomes an order in the HUD's own vocabulary, and it is the only place that
 * knows both halves.
 *
 * ### It no longer submits anything
 *
 * It used to assemble `PlaceBuildOrder` commands and hand them to the command
 * sender directly, which meant a refused wall reached a `console.warn` and
 * the player was told nothing -- while the Build panel's button, asking for
 * the identical command, painted a refusal line (issues #207, #225). The
 * gesture now leaves through `attachOrders` as a `HudBuildOrder`, the HUD
 * dispatches it as a `place-build-order` intent, and `src/main.ts` turns that
 * one intent into commands. One route, so one answer to "was the player
 * told".
 *
 * ### One gesture, one transaction
 *
 * A run leaves here as **one** order carrying every edge it covered, never as
 * one report per segment: a twelve-segment wall is one thing the player drew,
 * one thing to undo and one thing to be told about. The `transactionId` that
 * makes `ConstructionSystem.registerTransactionOrder` group it is generated
 * once per intent by the composition root, which is now the only place a
 * command is built.
 */

export class BuildTool implements BuildToolPort, HudWorldBuildSource {
  private armed = false;
  private definitionId: string | undefined;

  /**
   * Where a finished gesture goes, and the reason this class no longer knows
   * what a command is.
   *
   * Attached after mounting rather than taken by construction, for the same
   * reason `readout` is: the HUD does not exist yet when the tool is built.
   * Unattached, a gesture is dropped -- which is the honest behaviour for a
   * page that has a world but no interface, and cannot happen in the running
   * application, where `src/main.ts` mounts the HUD synchronously during
   * module evaluation and no pointer event can be dispatched before that.
   */
  private orders: ((order: HudBuildOrder) => void) | undefined;
  /**
   * Set after mounting, because the tool exists before the HUD does: the
   * renderer and this tool are constructed at boot, and `mountInterface`
   * runs after them (`src/main.ts`). Since #82 that mount is unconditional
   * and ahead of the persistence boot, so it no longer waits on persistence
   * -- but it still cannot precede the tool it is handed.
   */
  private readout: ((target: BuildPanelTarget | undefined) => void) | undefined;

  /** Points finished gestures at the mounted HUD's intent path. */
  public attachOrders(place: (order: HudBuildOrder) => void): void {
    this.orders = place;
  }

  /** Points the live readout at the mounted panel. */
  public attachReadout(readout: (target: BuildPanelTarget | undefined) => void): void {
    this.readout = readout;
  }

  /**
   * Arms or disarms the tool.
   *
   * Arming needs a buildable, because an armed tool with nothing selected
   * would take over the pointer and then refuse every gesture -- which reads
   * as a broken world, not as a missing selection.
   */
  public setArmed(armed: boolean, definitionId?: string): void {
    this.definitionId = definitionId ?? this.definitionId;
    this.armed = armed && this.definitionId !== undefined;
  }

  public setDefinition(definitionId: string): void {
    this.definitionId = definitionId;
  }

  public isArmed(): boolean {
    return this.armed;
  }

  public get selectedDefinitionId(): string | undefined {
    return this.definitionId;
  }

  /**
   * The pointer moved. Summarised into the one line the panel shows, rather
   * than handed over as a list: the panel is a readout of where the wall will
   * land, and a scrolling list of sixty-four coordinates is not a readout.
   */
  public target(segments: readonly EdgeTarget[] | undefined): void {
    if (this.readout === undefined) return;
    const first = segments?.[0];
    if (segments === undefined || first === undefined) {
      this.readout(undefined);
      return;
    }
    this.readout({ x: first.tileX, y: first.tileY, edge: first.edge, segments: segments.length });
  }

  /**
   * The gesture finished. Reported once, whole.
   *
   * Reported once and not once per segment: the HUD gates a command while one
   * is in flight, so a per-segment report would have every segment after the
   * first refused as busy, and it would ask the host for twelve unrelated
   * orders where the player drew one wall. `tests/unit/ui-build-tool.test.ts`
   * asserts the count rather than trusting this paragraph.
   */
  public place(segments: readonly EdgeTarget[]): void {
    const definitionId = this.definitionId;
    if (!this.armed || definitionId === undefined || segments.length === 0) return;

    const edges = this.deduplicate(segments).map((segment) => ({
      x: segment.tileX,
      y: segment.tileY,
      edge: segment.edge,
    }));
    this.orders?.({ definitionId, edges });
  }

  /**
   * A run cannot contain the same edge twice today, but a future
   * multi-axis gesture could, and two orders on one edge is exactly the case
   * `ConstructionSystem` has to reconcile when one of them is cancelled.
   * Cheaper to never create it.
   */
  private deduplicate(segments: readonly EdgeTarget[]): readonly EdgeTarget[] {
    const seen = new Set<string>();
    const unique: EdgeTarget[] = [];
    for (const segment of segments) {
      // Written out rather than calling `edgeTargetKey`, which produces this
      // exact string one module away in `src/rendering/build/edge-picking.ts`.
      // Not an oversight: that would be a **value** import from
      // `src/rendering/` into this file, and
      // `tests/unit/ui-orchestration-boundaries.test.ts` records this module's
      // rendering dependency as `type-only` with a reason that is about intent
      // -- a value import "would mean the orchestrator had started calling
      // into the renderer rather than being handed its reports". Relaxing that
      // to share a string formatter would be trading a stated boundary for
      // three lines.
      //
      // What has to hold is **not** that this string equals
      // `edgeTargetKey`'s. This key is private and never leaves the loop, so
      // any injective function of the three fields would de-duplicate the
      // same run -- measured: reordering these fields to
      // `edge,tileX,tileY` changes nothing any test can see, correctly.
      // What has to hold is that it keys on *the same three fields*, which is
      // what makes two orders on one edge impossible; dropping `edge` from it
      // fails `tests/unit/edge-key-agreement.test.ts`, and so does removing
      // the de-duplication. That file pins the equivalence, and pins
      // `edgeTargetKey`'s own format separately, because that one *is* a
      // contract -- it is exported.
      const key = `${segment.tileX},${segment.tileY},${segment.edge}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(segment);
    }
    return unique;
  }
}
