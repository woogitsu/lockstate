import type { BuildToolPort, EdgeTarget } from '../rendering/build/edge-picking';
import type { SimulationCommand } from '../simulation/protocol/commands';
import type { BuildPanelTarget } from './hud';

/**
 * The armed build tool: the thing that turns "the player dragged here" into
 * build orders.
 *
 * It sits at the composition root's layer, between two things that must not
 * know about each other. The renderer reports *edges* -- it may not submit a
 * command (`tests/unit/rendering-module-boundaries.test.ts`) and must never
 * become the place a build is decided. The HUD reports *intents* -- it may
 * not import the simulation at all. This is where a gesture becomes a
 * `PlaceBuildOrder`, and it is the only place that knows both halves.
 *
 * ### One gesture, one transaction
 *
 * Every segment of a run shares a `transactionId`, so a twelve-segment wall
 * undoes as one wall rather than as twelve taps on undo. That is what
 * `ConstructionSystem.registerTransactionOrder` is for, and it is the reason
 * a run is submitted as a batch here rather than one order at a time from the
 * scene.
 */

export interface BuildToolOptions {
  /** Posts a command to the worker. Throwing is how a refusal reaches the player. */
  readonly submit: (command: SimulationCommand) => void;
  readonly generateOrderId?: () => string;
  readonly generateTransactionId?: () => string;
  /** A refusal from the worker boundary -- reported, never swallowed. */
  readonly onError?: (error: Error) => void;
}

export class BuildTool implements BuildToolPort {
  private armed = false;
  private definitionId: string | undefined;

  private readonly submit: (command: SimulationCommand) => void;
  private readonly generateOrderId: () => string;
  private readonly generateTransactionId: () => string;
  private readonly onError: ((error: Error) => void) | undefined;
  /**
   * Set after mounting, because the tool exists before the HUD does: the
   * renderer and this tool are constructed at boot, and `mountInterface`
   * runs after them (`src/main.ts`). Since #82 that mount is unconditional
   * and ahead of the persistence boot, so it no longer waits on persistence
   * -- but it still cannot precede the tool it is handed.
   */
  private readout: ((target: BuildPanelTarget | undefined) => void) | undefined;

  public constructor(options: BuildToolOptions) {
    this.submit = options.submit;
    this.generateOrderId = options.generateOrderId ?? (() => `order-${crypto.randomUUID()}`);
    this.generateTransactionId = options.generateTransactionId ?? (() => `build-${crypto.randomUUID()}`);
    this.onError = options.onError;
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

  public place(segments: readonly EdgeTarget[]): void {
    const definitionId = this.definitionId;
    if (!this.armed || definitionId === undefined || segments.length === 0) return;

    const transactionId = this.generateTransactionId();
    for (const segment of this.deduplicate(segments)) {
      try {
        this.submit({
          type: 'PlaceBuildOrder',
          orderId: this.generateOrderId(),
          definitionId,
          x: segment.tileX,
          y: segment.tileY,
          edge: segment.edge,
          transactionId,
        });
      } catch (error) {
        // One refusal ends the run rather than firing eleven more doomed
        // commands at a worker that has already said no -- and the sequence
        // counter has to re-baseline before anything else is worth sending.
        this.onError?.(error instanceof Error ? error : new Error(String(error)));
        return;
      }
    }
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
