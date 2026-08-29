import type { IncidentType } from '../incidents/incident';
import type { SimulationEvent } from '../protocol/types';

/**
 * The bound on how many events the log retains at once -- **published ones
 * included**.
 *
 * **This said "un-published", and that is wrong about what the buffer holds.**
 * `append` trims `_buffered` unconditionally on every append, and `since` only
 * *filters* what is already retained; the publisher's watermark lives outside
 * this class entirely, on the worker state machine. So the limit is reached by
 * the **65th event of a session**, however promptly each was published, not by
 * a 65th that nobody drained.
 *
 * What the old sentence was right about is the condition under which an event
 * is actually **lost**: that still takes the tick loop emitting more than this
 * many between two publications -- a wake apart, in practice -- which takes a
 * prison discharging on a tick while payday falls on the same one, twice over.
 * The two claims were run together, and only the second one held. It exists so the log
 * cannot grow with the session if a publisher ever stops draining it: an
 * unbounded buffer behind a consumer that has gone away is the failure
 * `docs/HUD_PROJECTIONS.md` contract 5 forbids on the cadence channel, and
 * nothing about this channel being push makes that safe.
 *
 * Overflow drops the **oldest**, which is the right end for a notice channel:
 * the player is being told what just happened, and losing the newest to keep
 * a stale one would be the wrong sentence on screen. `sequence` does not
 * rewind when a record is dropped, so a consumer can still see that it
 * missed something.
 */
export const MAX_BUFFERED_SIMULATION_EVENTS = 64;

/**
 * What the prison has just done, for the events channel to carry.
 *
 * ## Why this is a queue where `RefusalLog` is a single record
 *
 * `RefusalLog` holds exactly one refusal and says at length why: its route
 * out is `simulation/status-counts`, a snapshot on a cadence that is
 * rate-limited and skippable, so the only honest thing to put on it is state
 * that is a function of the events so far. This log's route out is
 * `simulation/event`, which is posted once per event and coalesced by
 * nothing, so the events themselves are exactly what it may carry -- and must
 * carry, because these are not levels. "Two prisoners finished their
 * sentences" is true once, at a tick; there is no current value of it to
 * republish, and re-asserting it twice a second would tell the player it had
 * happened again.
 *
 * That is the whole reason issue #507 is a channel rather than two more
 * siblings of `counts`. `refusal` and `zoning` are levels and belong there;
 * these are occurrences and do not.
 *
 * ## Why publication does not drain it
 *
 * `since` is a **read**. `tests/determinism/status-counts-publication.test.ts`
 * pins the rule that publishing changes nothing the kernel can observe, and
 * ADR 0020's determinism contract is why: a publication is driven by
 * wall-clock time, so a tick that behaved differently because a publication
 * had happened would make the simulation depend on how fast the machine ran.
 * A `drain()` would be exactly that. So the watermark lives on the publisher
 * -- `WorkerStateMachine._publishedEventSequence`, beside the refusal and
 * zoning sequences it already keeps for the same purpose -- and this class is
 * append-and-read only.
 *
 * Trimming on `record` is not an exception to that: it is driven by the
 * append, at the tick the append happens, and two runs of the same session
 * trim identically.
 *
 * ## What it deliberately does not do
 *
 * - **It is not snapshotted**, on the same reasoning `RefusalLog` gives and
 *   with one addition. A restored session starts with an empty log, so it
 *   announces nothing that happened before the save. That is the honest
 *   reading rather than a loss: an event is a statement that something
 *   happened *now*, and a prison that announced last week's discharges on
 *   load would be telling the player about a tick that is not the one they
 *   are looking at. The *conditions* behind the events do persist and
 *   re-announce themselves -- arrears are in the save (ADR 0049, "arrears are
 *   *history*"), so the next failed payday says so again -- which is what
 *   makes not persisting the log a formatting decision the save never has to
 *   see rather than a fact the player loses. Recorded in
 *   `docs/PERSISTENCE.md` and `docs/HUD_PROJECTIONS.md` beside `RefusalLog`'s
 *   own entry rather than left to be discovered.
 * - **It carries no identity.** No entity id, no name, no tile -- the same
 *   line `SimulationRefusal` holds, and for a sharper reason here: the
 *   subject of a discharge event does not exist by the time the main thread
 *   reads it.
 *
 * Writing to it is deterministic: it is written only from scheduled system
 * updates, at the tick the thing happened, from values those systems decided.
 * Two runs of the same session record the same events in the same order.
 */
export class SimulationEventLog {
  /**
   * The total number of events ever recorded. Monotonic, and never rewound by
   * trimming -- it answers "how many things has this session had to say",
   * and dropping the oldest buffered record does not undo the fact that it
   * happened. It is also the row identity the HUD keys on and the watermark
   * the publisher compares, which is why it must not repeat a value.
   */
  private _sequence = 0;
  private _buffered: SimulationEvent[] = [];

  /** How many events this session has recorded, ever. */
  public get count(): number {
    return this._sequence;
  }

  /**
   * Records that prisoners left because their sentences ended (ADR 0050).
   *
   * @param count How many left on this tick, aggregated by the caller. One
   * event per tick rather than one per prisoner: `PrisonerDischargeSystem`
   * releases everybody due in a single pass, and a player reads that as one
   * occurrence. A `count` below 1 records nothing -- "nobody was discharged"
   * is not an event, it is every other tick -- rather than emitting an event
   * the protocol's own `min(1)` would then reject at the boundary.
   */
  public recordDischarge(count: number, tick: number): void {
    if (!Number.isSafeInteger(count) || count < 1) return;
    this.append({ sequence: this._sequence + 1, tick, type: 'prisoners.discharged', count });
  }

  /**
   * Records that a payday could not be met in full (ADR 0049).
   *
   * @param unpaidWagesMinorUnits The arrears *after* this payday, which is
   * what `PayrollSystem.unpaidWagesMinorUnits` then reports and what the save
   * carries. Guarded like `recordDischarge`: a payday met in full leaves no
   * arrears and is not an event.
   */
  public recordUnpaidWages(unpaidWagesMinorUnits: number, tick: number): void {
    if (!Number.isSafeInteger(unpaidWagesMinorUnits) || unpaidWagesMinorUnits < 1) return;
    this.append({
      sequence: this._sequence + 1,
      tick,
      type: 'economy.wages-unpaid',
      unpaidWagesMinorUnits,
    });
  }

  /**
   * Records that an incident opened (issue #555).
   *
   * **A `switch` over `IncidentType` rather than a lookup**, because the
   * union's members do not all carry the same figure -- see the schemas in
   * `src/simulation/protocol/types.ts` for why only the riot carries
   * `participantCount` -- and because exhaustiveness here is what
   * matters: a fifth `IncidentType` fails to compile in this method until
   * somebody has decided
   * what the prison says when it opens, which is the same guarantee
   * `EVENT_PRESENTATION` gives on the other side of the wire.
   *
   * `IncidentType` is imported for its type only, so this module still runs no
   * incident code; `src/simulation/protocol/types.ts` re-declares the same
   * vocabulary locally and holds the two together with `AssertSame`.
   *
   * @param participantCount How many prisoners are in it. Guarded like
   * `recordDischarge` and for the same reason, and guarded for all four types
   * even though only the riot carries the figure onto the wire: an incident
   * nobody is in is not something the prison has to say, whatever its kind,
   * and a guard that applied to one member would be an invitation to add the
   * fifth type to the unguarded half.
   */
  public recordIncidentOpened(type: IncidentType, participantCount: number, tick: number): void {
    if (!Number.isSafeInteger(participantCount) || participantCount < 1) return;
    const sequence = this._sequence + 1;
    switch (type) {
      case 'riot':
        this.append({ sequence, tick, type: 'incidents.riot-opened', participantCount });
        return;
      case 'gang-retaliation':
        this.append({ sequence, tick, type: 'incidents.gang-retaliation-opened' });
        return;
      case 'assault':
        this.append({ sequence, tick, type: 'incidents.assault-opened' });
        return;
      case 'escape-attempt':
        this.append({ sequence, tick, type: 'incidents.escape-attempt-opened' });
        return;
    }
  }

  /**
   * Records that the prison has nothing open any more (issue #555).
   *
   * Unguarded, because there is no figure to guard: what makes this at most
   * one event per return to calm is the caller, which records it only on a
   * terminal transition that leaves `IncidentLog.openIncidentCount` at zero.
   * Deliberately not re-checked here -- this class knows nothing about
   * incidents, and a second, weaker copy of the rule is how the two would come
   * to disagree.
   */
  public recordIncidentsAllClear(tick: number): void {
    this.append({ sequence: this._sequence + 1, tick, type: 'incidents.all-clear' });
  }

  /**
   * Every buffered event whose `sequence` is greater than `after`, oldest
   * first.
   *
   * A read: it does not trim, does not clear and does not move a watermark.
   * The caller owns the watermark; see the class comment.
   *
   * Ascending `sequence` rather than insertion order as a coincidence --
   * `docs/DETERMINISM.md`'s canonical-order rule wants an iteration order that
   * is a property of the data, and `sequence` is assigned at append so the two
   * orders are the same by construction.
   */
  public since(after: number): readonly SimulationEvent[] {
    return this._buffered.filter((event) => event.sequence > after);
  }

  private append(event: SimulationEvent): void {
    this._sequence = event.sequence;
    this._buffered.push(event);
    if (this._buffered.length > MAX_BUFFERED_SIMULATION_EVENTS) {
      this._buffered = this._buffered.slice(this._buffered.length - MAX_BUFFERED_SIMULATION_EVENTS);
    }
  }
}
