import type {
  BuildToolPort,
  EdgeTarget,
  EditHistoryPort,
  ToolStandDownPort,
} from '../rendering/build/edge-picking';
import type {
  BuildPanelTarget,
  HudBuildOrder,
  HudEditHistorySource,
  HudHistoryDirection,
  HudToolStandDownSource,
  HudWorldBuildSource,
} from './hud';

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
 *
 * ### It carries the undo keys too (#261)
 *
 * The world's undo and redo keys leave the renderer through this same seam,
 * and the class implements a port for each: `BuildToolPort` for the gesture,
 * `EditHistoryPort` for a reversal. Two ports and one object, because the two
 * are asked different questions -- undo works whether or not the tool is
 * armed, and none of `armed`, `definitionId` or the segment buffer is
 * consulted by it -- while the routing is identical, so a second class would
 * duplicate `attachOrders` and the argument for it.
 *
 * ### And `Escape`'s arming half (#959)
 *
 * A third port, `ToolStandDownPort`, on the same argument one more time. It
 * reads oddly at first that the *build* tool carries a request that also puts
 * the **room** tool down, so the reason is worth stating: this class routes,
 * it does not decide. `standDown` consults none of `armed`, `definitionId` or
 * the segment buffer -- exactly as `undo` consults none of them -- and its
 * destination is the HUD, which is the only layer that knows which panel
 * armed which tool. A fourth class holding one forwarded call would duplicate
 * `attachOrders`, the after-mount attachment dance, and the argument for both.
 *
 * **This class never disarms itself here**, and that is deliberate. `armed`
 * on this object is a mirror of the Build panel's flag, kept in step by
 * `setArmed` from `src/main.ts`'s `arm-build-tool` handler; a tool that
 * cleared its own copy would be a second writer, and the panel's arm control
 * would go on saying "Stop placing" over a tool that had stopped. The request
 * goes to the panel, and the panel's answer comes back through the same
 * `setArmed` every other arming change uses.
 *
 * What undo reverses is the simulation's last transaction, which may be an
 * order this tool never saw: the Build panel's numeric route places one too.
 * The tool routes the request; it does not claim to own the history.
 *
 * The keys arrive here rather than at the command sender for the reason the
 * gesture does. A refusal raised on the renderer's key handler has nowhere to
 * be reported -- it reaches no control, no line and no player -- which is the
 * shape of the defect #225 removed from the drag.
 */

export class BuildTool
  implements
    BuildToolPort,
    EditHistoryPort,
    ToolStandDownPort,
    HudWorldBuildSource,
    HudEditHistorySource,
    HudToolStandDownSource
{
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

  /**
   * Where an undo or redo request goes, attached after mounting exactly as
   * `orders` is and for the same reason: the HUD does not exist yet when the
   * tool is built.
   */
  private history: ((direction: HudHistoryDirection) => void) | undefined;

  /**
   * Where "put the tool down" goes (#959), attached after mounting exactly as
   * `history` is and for the same reason.
   */
  private disarmRequest: (() => void) | undefined;

  /** Points finished gestures at the mounted HUD's intent path. */
  public attachOrders(place: (order: HudBuildOrder) => void): void {
    this.orders = place;
  }

  /** Points the world's undo and redo keys at the same path (#261). */
  public attachHistory(request: (direction: HudHistoryDirection) => void): void {
    this.history = request;
  }

  /** Points the world's "put the tool down" key at the same path (#959). */
  public attachStandDown(request: () => void): void {
    this.disarmRequest = request;
  }

  /**
   * The player asked for the armed tool to be put down (#959).
   *
   * Unconditional, exactly as `undo` is, and for a stronger version of the
   * same reason: whether anything is armed is the *panel's* state, and this
   * object's `armed` is only a mirror of it. Reading the mirror to decide
   * whether to forward would make `Escape` work only while the two agreed.
   *
   * Unattached, the request is dropped -- the honest behaviour for a page
   * with a world and no interface, and unreachable in the running
   * application, where `src/main.ts` mounts the HUD synchronously during
   * module evaluation and no key event can be dispatched before that.
   */
  public standDown(): void {
    this.disarmRequest?.();
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
    // A tool that is not armed is aimed at nothing, and says so (#550).
    //
    // Without this the panel's one live readout kept naming the last edge this
    // tool reported, for as long as the *next* tool held the pointer: the
    // composition root disarms this one and arms the object tool in the same
    // call, so a player who laid a wall at 20,16 and then pressed "Remove" was
    // told their deletion was landing on 20,16 wherever they aimed it. The
    // panel could not have caught it -- a tool armed to remove is armed, so its
    // own `if (!armed) setTarget(undefined)` never fires -- and the scene could
    // not either: its disarm sweep routes through `cancelBuild`, which returns
    // immediately when no pointer is down, which is every hover.
    //
    // So the withdrawal belongs to whoever made the claim. Published on the
    // way *out* rather than filtered on the way in, because the three tools
    // publish into one line and nothing downstream knows which of them is
    // currently allowed to.
    if (!this.armed) this.readout?.(undefined);
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
   * The player asked to take back the last thing they did.
   *
   * Unconditional, where `place` refuses a disarmed tool: what undo reverses
   * is a transaction the simulation is holding, not a gesture in progress, so
   * an armed check here would make the key work only while the tool happened
   * to be armed -- which no player would connect to anything. Unattached, the
   * request is dropped, the same honest behaviour a gesture gets on a page
   * with a world and no interface.
   */
  public undo(): void {
    this.history?.('undo');
  }

  public redo(): void {
    this.history?.('redo');
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
