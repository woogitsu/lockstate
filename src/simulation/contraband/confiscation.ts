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
