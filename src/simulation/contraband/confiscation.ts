import type { EntityId } from '../entity/entity-store';
import type { ContrabandHolder, ContrabandProvenance } from './item';

/**
 * Issue #27's "confiscation records provenance/evidence and emits typed
 * downstream events" -- the evidence chain a future incident/disciplinary
 * system (#28) consumes. Carries the item's full provenance and the
 * holder it was found at, not just its id, so a downstream consumer never
 * needs to re-look-up an item that may since have been further processed.
 */
export interface ConfiscationEvent {
  readonly itemId: string;
  readonly categoryId: string;
  readonly provenance: ContrabandProvenance;
  readonly foundAtHolder: ContrabandHolder;
  readonly searchOrderId: string;
  readonly foundByGuardId: EntityId;
  readonly tick: number;
}

/**
 * Append-only evidence log. `drain` (not `all`) is how a downstream
 * consumer (#28, not built yet) would take ownership of pending events
 * without this ledger growing unbounded across a long session; `all`
 * stays available for read-only inspection/tests that shouldn't mutate
 * consumption state.
 *
 * **"read-only inspection/tests" is narrower than what reads it now, and the
 * sentence is corrected rather than replaced (2026-08-31, issue #703 ruling
 * 3).** `all()` has two *production* readers on the presentation side:
 * `projectContraband` (`hud/contraband`, which has a route and no panel yet)
 * and `projectStatusStrip`, which reads it to name the contraband the status
 * strip's **Contraband** chip is counting -- a surface that is on screen at
 * every viewport with nothing opened. Neither may call `drain`, and both say so
 * at their own sites; what the original sentence was distinguishing --
 * inspection from consumption -- is exactly the distinction that keeps them
 * safe, so it stands.
 *
 * **`drain` still has no caller in `src/`**, which is what makes the strip's
 * reading of this ledger sound today. It is not assumed:
 * `projectStatusStrip` publishes a category name only while
 * `all().length` matches the count `SearchSystem` reports, so a future
 * consumer that does drain makes the badge disappear rather than lie.
 */
export class ConfiscationLedger {
  private readonly events: ConfiscationEvent[] = [];

  public record(event: ConfiscationEvent): void {
    this.events.push(event);
  }

  /** Chronological (append) order -- read-only, does not consume. */
  public all(): readonly ConfiscationEvent[] {
    return [...this.events];
  }

  /** Chronological order; removes every returned event from the ledger. */
  public drain(): readonly ConfiscationEvent[] {
    const drained = [...this.events];
    this.events.length = 0;
    return drained;
  }

  public getSnapshot(): readonly ConfiscationEvent[] {
    return this.all();
  }

  public loadSnapshot(snapshot: readonly ConfiscationEvent[]): void {
    this.events.length = 0;
    this.events.push(...snapshot.map((event) => ({ ...event })));
  }
}
