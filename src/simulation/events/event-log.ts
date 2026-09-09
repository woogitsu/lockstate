import type { BuildOrderLifecycleState } from '../construction/build-order';
import type { IncidentType } from '../incidents/incident';
import { simulationEventIdentity } from '../protocol/event-identity';
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
 * Whether one `Undo` press destroyed what had been spent on any of the orders
 * it reversed ([#927](https://github.com/matmaxalez/lockstate/issues/927)).
 *
 * The discriminator `recordConstructionUndone` splits its two sentences on, and
 * deliberately the whole of what crosses into this module about that press:
 * **not a count, not a figure, and not a list of states.** The owner's ruling
 * of 2026-09-01 on #749 declines the first two, and the third would be the
 * first by another name. `ConstructionSystem.undo` computes it as an or across
 * the transaction, where the orders and their pre-cancellation states are.
 *
 * A `type` and not a `boolean` so that the call site says which case it means;
 * see `recordConstructionUndone` for why each member is named what it is.
 */
export type ConstructionUndoSpendOutcome = 'nothing-destroyed' | 'spend-destroyed';

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
 * -- `SimulationWorkerStateMachine._publishedEventSequence`, beside the
 * refusal and
 * zoning sequences it already keeps for the same purpose -- and this class is
 * append-and-read only.
 *
 * Trimming on `record` is not an exception to that: it is driven by the
 * append, at the tick the append happens, and two runs of the same session
 * trim identically.
 *
 * ## What it deliberately does not do
 *
 * - **It was not snapshotted, and since 2026-09-01 it is.** The owner took
 *   [ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)'s
 *   decision 3 -- the log survives a reload -- and this is where that is held.
 *   The paragraph the decision overturned is kept rather than deleted, because
 *   what it argued is still true of the *band* and is the reason a restored
 *   record is replayed with `restored: true` and announces nothing:
 *
 *   > It is not snapshotted, on the same reasoning `RefusalLog` gives and
 *   > with one addition. A restored session starts with an empty log, so it
 *   > announces nothing that happened before the save. That is the honest
 *   > reading rather than a loss: an event is a statement that something
 *   > happened *now*, and a prison that announced last week's discharges on
 *   > load would be telling the player about a tick that is not the one they
 *   > are looking at. The *conditions* behind the events do persist and
 *   > re-announce themselves -- arrears are in the save (ADR 0049, "arrears are
 *   > *history*"), so the next failed payday says so again -- which is what
 *   > makes not persisting the log a formatting decision the save never has to
 *   > see rather than a fact the player loses. Recorded in
 *   > `docs/PERSISTENCE.md` and `docs/HUD_PROJECTIONS.md` beside `RefusalLog`'s
 *   > own entry rather than left to be discovered.
 *
 *   **What the owner's decision changes is who the replay is for.** A restored
 *   record does not go to the band and is not announced; it rebuilds the
 *   *log*, which is the surface a player scrolls back through, and the
 *   distinction is carried on the wire by one flag rather than inferred. The
 *   sentence above that has actually been falsified is the last one -- the
 *   exclusion is no longer what `docs/PERSISTENCE.md` records -- and the two
 *   documents are corrected in the same change. `RefusalLog` is **not**
 *   followed here: its own docblock prices carrying the refusal and refuses on
 *   what it would buy, the owner has not ruled on it, and a refusal has no
 *   dismissal either (`docs/HUD_PROJECTIONS.md` gap 34). The two logs stop
 *   being siblings in this one respect and that is a decision rather than an
 *   oversight.
 *
 *   What it costs is bounded by what the buffer holds:
 *   `MAX_BUFFERED_SIMULATION_EVENTS` records, so a save carries at most 64 of
 *   them and a session that recorded more comes back holding its newest 64.
 *   A row the live list had kept under ruling 11's evict-by-severity but whose
 *   record had already left this buffer is therefore gone across a reload.
 *   That is a real limit and it is stated rather than hidden: the alerts list
 *   keeps eight rows chosen by severity, this keeps sixty-four records chosen
 *   by age, and only the second of those is in the save because only the
 *   second of those is in the worker.
 * - **A dismissal marks a record; it never deletes one.** An event does not
 *   stop being true because a player has read it -- the whole argument in
 *   `src/ui/simulation-events.ts` for why no row is ever retired for being
 *   wrong -- so `dismiss` records that the player is done with it and leaves
 *   the record where it is. `since` then declines to hand it out again, which
 *   is what makes decision 3 survive the reload decision 4 grants.
 *
 *   **#749's five press-notices are carried by that same decision, and the
 *   argument this branch first made for them is withdrawn.** The paragraph
 *   below stood here while the log was not saved, and it said the opposite of
 *   what now happens:
 *
 *   > #749's five members have no condition behind them at all, and that makes
 *   > the exclusion stronger rather than weaker. "You cancelled that order" is
 *   > a notice about a press, not a state of the prison -- which is precisely
 *   > `RefusalLog`'s own reason for not being saved. Nothing re-announces them
 *   > after a load and nothing should: the press happened in a session that
 *   > has ended.
 *
 *   Its conclusion survives in the half that matters and its premise does not.
 *   A restored `construction.order-cancelled` record is **not** announced --
 *   `restored: true` is what stops it, and that is exactly the "nothing
 *   re-announces them after a load" the paragraph asked for. What is wrong is
 *   the inference from there to the save: the log is a scrollback now, and a
 *   player who cancelled an order before saving is owed that row when they come
 *   back for the same reason they are owed the riot. So the five ride the
 *   general rule with no exception of their own, and no member of
 *   `SIMULATION_EVENT_TYPES` is filtered out of the capture.
 * - **It carries no identity where the subject may be gone.** No entity id,
 *   no name, no tile -- the same line `SimulationRefusal` holds, and for a
 *   sharper reason here: the subject of a discharge event does not exist by
 *   the time the main thread reads it.
 *
 *   **This read "It carries no identity", flatly, until `recordResidentRelocated`
 *   below.** The sentence is narrowed rather than withdrawn, because the
 *   reason it gave is the whole of it and that reason is about *discharge*: a
 *   relocated resident is alive, housed, and already on the roster projection
 *   under the same entity id and the same two name halves. An event whose
 *   subject survives it may name them; one whose subject does not, may not.
 *   Both directions are marked here rather than overwritten
 *   (`docs/AGENT_WORKFLOW.md` section 4).
 *
 *   **And the second half of that narrowed sentence did not survive
 *   `recordEscapeSucceeded` below**, which names a subject who is emphatically
 *   gone -- `releasePrisoner` destroys the entity and releases the name before
 *   the main thread reads the event. Marked rather than overwritten, again,
 *   because the rule's *reason* is what moved: what a departed subject cannot
 *   support is a **lookup**, and neither of these two events looks anything
 *   up. Both carry the halves in the payload, so the sentence renders from
 *   what was true when it was recorded. The rule that survives all three
 *   readings is therefore: **this channel may name a subject whose name it
 *   carries, and may never carry an id a reader is invited to resolve.**
 *   `prisoners.discharged` still carries neither, and its schema still gives
 *   the original reason.
 *
 * Writing to it is deterministic. **The reason given here used to be "it is
 * written only from scheduled system updates", and #749 falsified that half**:
 * five members are written from *command handlers* --
 * `createConstructionCommandHandler` and `createSessionCommandHandler` -- when
 * a cancel, an undo or a redo the player asked for succeeds. Both directions
 * are marked rather than one overwritten (`docs/AGENT_WORKFLOW.md` section 4),
 * because the *conclusion* survives intact and it is the conclusion that
 * matters: a command is dispatched by the kernel at a tick, in submitted
 * sequence, and the values recorded are the ones that handler read at that
 * tick. Two runs of the same session still record the same events in the same
 * order. What has changed is only that "scheduled system update" is no longer
 * the complete list of writers.
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
  /**
   * The ordinals of the records a player has said they are done with (the
   * owner's decision 3 of 2026-09-01 on ADR 0084).
   *
   * A set of ordinals rather than a flag on the record, so the record itself
   * stays exactly the `SimulationEvent` the protocol declares and the wire
   * shape gains nothing: what is dismissed is a fact about this session's
   * *reading* of an event, not about the event.
   *
   * Bounded by the buffer. `append` drops a mark whose record has been trimmed
   * away, so this cannot outgrow `MAX_BUFFERED_SIMULATION_EVENTS` however many
   * rows a long session dismisses.
   */
  private _dismissed = new Set<number>();

  /** How many events this session has recorded, ever. */
  public get count(): number {
    return this._sequence;
  }

  /**
   * Records that the player has read a row and wants it gone (the owner's
   * decision 3 of 2026-09-01 on ADR 0084).
   *
   * ## What a dismissal names, and why it takes two ordinals
   *
   * A row on the alerts list is a **run** of arrivals that say the same thing
   * (`simulationEventIdentity`), so the gesture retires the run rather than
   * one arrival. `fromSequence` is the arrival the row began with -- the
   * record whose identity defines the run -- and `throughSequence` is the
   * newest arrival the player had actually seen when they pressed.
   *
   * The far end is what makes this safe against the race it would otherwise
   * have. A command is applied on a tick and a publication is not, so an
   * arrival can reach the screen between the press and this call; it carries a
   * higher ordinal than the player saw, so it is **not** dismissed and comes
   * back as a new row. That is ADR 0084's recurrence question -- *"is that a
   * new row or a return of the dismissed one?"* -- answered as a new row, in
   * the one place that can answer it, because what was dismissed is the
   * arrivals that were read.
   *
   * ## Why a dismissal this log cannot place is not a refusal
   *
   * A `fromSequence` no longer in the buffer, or one whose record was trimmed
   * between the press and the tick, marks nothing and reports `0`. There is no
   * refusal reason for it and none is wanted: the player asked for a row to be
   * gone, and a record this log has already dropped **is** gone -- from the
   * buffer, from the next save, and from anything a restore could rebuild. A
   * refusal would tell them their gesture failed when it did exactly what they
   * asked.
   *
   * Deterministic: it is applied from the command queue at the tick the
   * command is due, from values the command carries, so two runs of the same
   * session dismiss the same records.
   *
   * @returns How many records this marked. `0` means there was nothing left to
   * mark, which the caller treats as success -- see above.
   */
  public dismiss(fromSequence: number, throughSequence: number): number {
    const anchor = this._buffered.find((event) => event.sequence === fromSequence);
    if (anchor === undefined) return 0;
    const statement = simulationEventIdentity(anchor);
    let marked = 0;
    for (const event of this._buffered) {
      if (event.sequence < fromSequence || event.sequence > throughSequence) continue;
      if (this._dismissed.has(event.sequence)) continue;
      // The run, not the range. Another event type interleaved between two
      // arrivals of this one is a different row on the player's screen and
      // must not be retired by a gesture aimed at this one.
      if (simulationEventIdentity(event) !== statement) continue;
      this._dismissed.add(event.sequence);
      marked += 1;
    }
    return marked;
  }

  /**
   * What the save carries, so the log survives a reload (the owner's decision
   * 4 of 2026-09-01 on ADR 0084).
   *
   * The buffer as it stands and the marks against it, and the ordinal counter
   * that must not rewind -- a restored session that reissued ordinals it had
   * already used would give two different facts the same row identity, which
   * is the one thing `_sequence` exists to prevent.
   *
   * A read: it trims nothing, clears nothing and moves no watermark, exactly
   * as `since` does not.
   */
  public getSnapshot(): SimulationEventLogSnapshot {
    return {
      sequence: this._sequence,
      records: this._buffered.map((event) => ({ ...event })),
      // Sorted, so the payload is a function of the data rather than of the
      // order a player happened to press in -- `docs/DETERMINISM.md`'s
      // canonical-order rule, which the security section's sorted schedules
      // and watched sector ids already follow.
      dismissed: [...this._dismissed].sort((left, right) => left - right),
    };
  }

  /**
   * Puts a saved log back.
   *
   * Marks whose record is not in `records` are dropped rather than kept: they
   * can never be consulted again, because `since` only ever reads the buffer,
   * and keeping them would let a save grow a set nothing can bound.
   */
  public loadSnapshot(snapshot: SimulationEventLogSnapshot): void {
    this._buffered = snapshot.records.map((event) => ({ ...event }));
    const retained = new Set(this._buffered.map((event) => event.sequence));
    this._dismissed = new Set(snapshot.dismissed.filter((sequence) => retained.has(sequence)));
    // The highest ordinal the session ever issued, never the highest one the
    // buffer still holds: trimming does not rewind `_sequence` in a live
    // session and must not rewind it across a save either.
    this._sequence = Math.max(snapshot.sequence, ...this._buffered.map((event) => event.sequence), 0);
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
   * Records that one resident whose bed was taken away has been moved into
   * accommodation that exists
   * ([ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
   * decision A(i)).
   *
   * **One call per resident, not one per removal**, which is the opposite of
   * `recordDischarge` above and is decided by the sentence rather than by
   * this class: the owner's approved wording names one prisoner and one room,
   * so a removal that rehouses two residents says so twice. The caller is
   * `ObjectPlacementService`'s notice port, which is handed exactly the
   * per-resident split `PrisonerOperationsRuntime.relocateExcessResidentsOf`
   * returns.
   *
   * **Nothing is recorded for a resident who could *not* be moved.** ADR 0076
   * decision A(i) leaves them exactly where ADR 0028 decision 2 put them and
   * the owner has approved no sentence for that state, so saying anything here
   * would be inventing one. What the prison owes the player about a resident
   * sleeping in a bedless cell is an open question, not this method's silence
   * by oversight -- see `ExcessRelocationOutcome.stranded`.
   *
   * @param relocation Who moved and where to. `name` is absent only in a
   * session wired without an identity registry; the HUD then names them by
   * entity id, which is what the roster already does for the same case.
   */
  public recordResidentRelocated(
    relocation: {
      readonly entityId: number;
      readonly name?: { readonly givenName: string; readonly familyName: string };
      readonly roomNameKey: string;
    },
    tick: number,
  ): void {
    this.append({
      sequence: this._sequence + 1,
      tick,
      type: 'prisoners.relocated',
      entityId: relocation.entityId,
      ...(relocation.name === undefined ? {} : { name: { ...relocation.name } }),
      roomNameKey: relocation.roomNameKey,
    });
  }

  /**
   * Records that a rectangle the player designated is now a room of that type
   * ([#966](https://github.com/matmaxalez/lockstate/issues/966) site 2).
   *
   * **One call per accepted press**, like `recordResidentRelocated` above: the
   * caller is `createSessionCommandHandler`'s `ZoneRoom` branch, on the arm
   * where `RoomZoningService.zone` answered `'zoned'`.
   *
   * **Unguarded, because there is no figure to guard and the caller is what
   * bounds it** -- the same shape `recordIncidentsAllClear` relies on. A
   * refused press takes the other arm, which records a `RefusalLog` reason and
   * calls nothing here; re-deciding that here would be a second, weaker copy
   * of `zone`'s own answer.
   *
   * @param roomNameKey `ZoneRoomAccepted.roomNameKey` -- the room catalog's own
   * `nameKey`, from the definition `zone` decided the request against. Passed
   * through rather than derived from the instance's `roomCatalogId`, so the
   * word the player reads cannot disagree with the type the world recorded.
   */
  public recordRoomZoned(roomNameKey: string, tick: number): void {
    this.append({ sequence: this._sequence + 1, tick, type: 'rooms.zoned', roomNameKey });
  }

  /**
   * Records that a prisoner got out
   * ([#683](https://github.com/matmaxalez/lockstate/issues/683)).
   *
   * **One call per escapee**, like `recordResidentRelocated` above and unlike
   * `recordDischarge`, and decided the same way: the owner's approved sentence
   * names one prisoner. An escape attempt has exactly one participant
   * (`IncidentTriggerSystem.tryOpenEscapeAttempt`), so today that grain and
   * the incident's are the same; if an incident type ever lost more than one
   * person at once, this would say so once per person rather than aggregate
   * them behind a count the sentence has no placeholder for.
   *
   * **Unguarded, because there is no figure to guard, and the caller is what
   * bounds it.** `IncidentResponseSystem.lapse` records this only for a
   * participant its departure port confirms actually left -- the same shape
   * `recordIncidentsAllClear` below relies on, and for the same reason: a
   * second, weaker copy of the caller's rule here is how the two would come to
   * disagree.
   *
   * @param escape Who left. `name` is absent only in a session wired without
   * an identity registry, exactly as it is for a relocation; the HUD then
   * names them by entity id. The name must be read **before** the departure --
   * `releasePrisoner` releases it -- which is why the caller is handed it by
   * the port that performs the departure rather than looking it up here.
   */
  public recordEscapeSucceeded(
    escape: {
      readonly entityId: number;
      readonly name?: { readonly givenName: string; readonly familyName: string };
    },
    tick: number,
  ): void {
    this.append({
      sequence: this._sequence + 1,
      tick,
      type: 'incidents.escape-succeeded',
      entityId: escape.entityId,
      ...(escape.name === undefined ? {} : { name: { ...escape.name } }),
    });
  }

  /**
   * Records that a search found one contraband item (the owner's **ruling 13**
   * of 2026-08-31 on [#703](https://github.com/matmaxalez/lockstate/issues/703)).
   *
   * **One call per item found**, like `recordResidentRelocated` and
   * `recordEscapeSucceeded` above and unlike `recordDischarge`, and decided the
   * same way -- by the sentence: "Contraband found: {item}." names *one*
   * category, and a search that turns up a phone and a knife has no single word
   * for the pair. That is the corner `soleDiscoveredContrabandNameKey`
   * (`src/simulation/presentation/status-strip-projection.ts`) refuses to guess
   * at for the status chip, and naming each of several is the whole reason this
   * event exists beside that chip.
   *
   * **Unguarded, because there is no figure to guard and the caller is what
   * bounds it** -- the sentence `recordEscapeSucceeded` above uses, and the
   * shape `createResidentRelocationNotice` takes for the same problem one event
   * over. `SearchSystem` resolves the key through an injected catalog lookup
   * that may answer `undefined`, and it is *there* that a nameless category is
   * dropped, before this is called at all. A second check here would be a
   * weaker copy of that rule and is how the two would come to disagree.
   *
   * What stops a malformed key reaching a player is therefore the boundary
   * rather than this method: `categoryNameKey` is `identifierSchema` on the
   * wire, so an empty or space-bearing key is refused there -- pinned in
   * `tests/unit/ui-simulation-events.test.ts`. The alternative is worse than a
   * refusal, which is why it is checked somewhere:
   * `resolveLocalizationKey` renders an unknown key as itself, so the player
   * would read `contraband.unknown.name` inside an authored sentence.
   *
   * @param categoryNameKey The found item's category as the contraband
   * catalog's own `nameKey` -- one of the five `contraband.*.name` labels. A
   * key, never a word: ADR 0011, and the main thread resolves it.
   */
  public recordContrabandDiscovered(categoryNameKey: string, tick: number): void {
    this.append({ sequence: this._sequence + 1, tick, type: 'contraband.discovered', categoryNameKey });
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
   * Records that the treasury just fell to or below one insolvency rung's
   * floor -- the owner's ruling of 2026-09-01 on issue #767 (ADR 0087
   * decision 2's amendment).
   *
   * **The one call site is `InsolvencyRungSystem`**
   * (`src/simulation/economy/insolvency-rung-system.ts`), which is the only
   * thing in this codebase that tracks whether a rung was *already* standing
   * -- exactly the edge-detection `IncidentTriggerSystem`/`IncidentLog` do
   * for an incident's opening, and for the same reason: the *condition*
   * (`PrisonCondition` on `statusCountsSchema.conditions`) is a pure,
   * memory-free recomputation and must never be the thing deciding whether to
   * call this, or it would fire on every publication the prison stays
   * refused rather than once at the transition -- precisely ADR 0087 Cost 1,
   * a rung deep instead of a refusal reason deep.
   *
   * No figure is guarded here the way `recordUnpaidWages`'s `< 1` guards a
   * payday met in full: `rung` is a fact the caller has already established
   * by comparing two ticks, not a magnitude this method can independently
   * validate, so there is nothing to refuse.
   *
   * @param rung Which of ADR 0017 decision 8's ladder the balance just
   * crossed into. `'wages'` never reaches here: the third rung *is* the
   * treasury's floor (`INSOLVENCY_RUNG_FLOORS_MINOR_UNITS.wages`,
   * `-Infinity` clamped), and drawing on it is `PayrollSystem` failing to pay
   * in full, which `recordUnpaidWages` above already announces on its own
   * schedule -- once per in-game day, with the arrears carried. A third
   * member here would say the same thing on a different channel.
   */
  public recordInsolvencyRungCrossed(rung: 'deliveries' | 'construction', tick: number): void {
    this.append({
      sequence: this._sequence + 1,
      tick,
      type: rung === 'deliveries' ? 'economy.deliveries-refused' : 'economy.construction-refused',
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
   * Records that a build order the player asked to cancel was cancelled
   * (the owner's ruling of 2026-09-01 on
   * [#749](https://github.com/matmaxalez/lockstate/issues/749)).
   *
   * **Two sentences, split on whether the crew had started**, which is the
   * owner's answer to "one sentence or two" and their reasoning for it:
   * *"silence about a loss is the worst option"*. An order cancelled before the
   * crew reached it gives its money back; one cancelled past the point of no
   * return -- `'in-progress'` by ruling 20 of 2026-08-31, `'completed'` by the
   * owner's ruling of 2026-09-01, both argued at
   * `ConstructionSystem.cancelOrder` -- drops its allocation unreleased and
   * unpaid. Two different outcomes, so two different things to say.
   *
   * **The split was `'in-progress'` against everything else until
   * [#927](https://github.com/matmaxalez/lockstate/issues/927)**, which found
   * `'completed'` saying nothing at all; the paragraph below the `switch`
   * argument records what that silence rested on and why neither half of it
   * survived.
   *
   * **A `switch` over `BuildOrderLifecycleState` rather than a boolean the
   * caller computes**, for the reason `recordIncidentOpened` above switches
   * over `IncidentType`: exhaustiveness is the point. A ninth lifecycle state
   * fails to compile here until somebody has decided what the prison says when
   * an order in it is cancelled, and the two states that deliberately say
   * nothing say so at a site where the reason can be read.
   *
   * `BuildOrderLifecycleState` is imported for its type only, so this module
   * still runs no construction code -- the same shape the `IncidentType` import
   * above has.
   *
   * **`'completed'` recorded nothing until
   * [#927](https://github.com/matmaxalez/lockstate/issues/927), and both
   * reasons it gave had gone dead.** The paragraph is kept below rather than
   * deleted, because it is the argument that produced a silence about a
   * destroyed purchase and a reader needs to see why it stopped holding. It
   * read:
   *
   * > **`'completed'` records nothing, and it is the one exclusion worth
   * > arguing.** A completed order is cancellable and `cancelOrder` reverses
   * > the geometry it wrote, but neither approved sentence is true of it: the
   * > money did not come back (`refundSurplusOf` runs for `'approved'` and
   * > `'materials-pending'` only) and the materials are not gone either (ADR
   * > 0076 decision B puts them back in the container). No control can reach
   * > that press today -- `PENDING_BUILD_ORDER_STATES` excludes `'completed'`,
   * > so no Build-panel row names one -- and it is reachable only by an order
   * > finishing between a projection and the press that answers it. Saying one
   * > of the two sentences there would be a promise the code does not keep,
   * > which `AGENTS.md`'s fourth exclusion reserves to the owner; the sentence
   * > a cancelled *finished* order deserves is therefore recorded as owed,
   * > here, rather than guessed at.
   *
   * Both operands are false, so the conclusion inverts:
   *
   * - **The materials *are* gone.** The owner's ruling of 2026-09-01 --
   *   *"Taking a finished object away returns nothing. Not its materials, not
   *   its money."*, ADR 0076's amendment of that date -- reverses decision B,
   *   and `ConstructionSystem.cancelOrder` has followed it since:
   *   `destroysSpendOnCancel` holds `'completed'`, so the allocation is dropped
   *   unreleased and unpaid. The paragraph above was arguing from a decision the
   *   simulation had already stopped honouring.
   * - **A control does reach that press.** `ConstructionSystem.undo()` is
   *   *"cancel every order in this transaction, including a `completed` one"* in
   *   its own comment, and `KeyZ` is the ordinary press for it. The narrow
   *   version of the claim is the true one and is a different claim: no
   *   Build-panel *row* names a completed order, which is about the queue list
   *   and not about reachability.
   *
   * So the money still does not come back **and** the materials are destroyed,
   * which is precisely what `'construction.order-cancelled-underway'` says --
   * *"Anything already spent past the point of no return stays spent."* It is
   * that sentence's own condition rather than a stretch of it: the clause is
   * quantified over what was spent past the point of no return, and a finished
   * order is the furthest past it an order gets. So `'completed'` now records
   * the same event `'in-progress'` does, and the silence the owner's *"silence
   * about a loss is the worst option"* argued against is closed on the larger
   * of the two losses.
   *
   * **The event type keeps the name `-underway`, which describes the state
   * `'in-progress'` and not this one.** Renaming it is not available: saves
   * carry these records (`simulationEventSchema` is read by `save-schema.ts`)
   * and the type is a persisted discriminant. The name is developer-facing, the
   * sentence is what a player reads, and the sentence is true of both; the
   * schema in `src/simulation/protocol/types.ts` says so where the name is
   * declared.
   *
   * **`'cancelled'` and `'failed'` record nothing because they cannot happen**:
   * `cancelOrder` throws for both and the caller records only after it returns.
   * They are branches so the `switch` is exhaustive, not cases with a story.
   *
   * @param stateAtCancellation The order's state **read before**
   * `ConstructionSystem.cancelOrder` was called. Read after, every order is
   * `'cancelled'` and the distinction the two sentences exist for is gone.
   */
  public recordBuildOrderCancelled(stateAtCancellation: BuildOrderLifecycleState, tick: number): void {
    const sequence = this._sequence + 1;
    switch (stateAtCancellation) {
      case 'planned':
      case 'approved':
      case 'materials-pending':
      case 'assigned':
        this.append({ sequence, tick, type: 'construction.order-cancelled' });
        return;
      case 'in-progress':
      case 'completed':
        this.append({ sequence, tick, type: 'construction.order-cancelled-underway' });
        return;
      case 'cancelled':
      case 'failed':
        return;
    }
  }

  /**
   * Records that the build history was walked back one transaction (#749).
   *
   * **Unguarded here, and bounded by the caller** -- the shape
   * `recordIncidentsAllClear` below takes and for the same reason.
   * `ConstructionSystem.undo` answers whether it actually reversed anything,
   * and `createConstructionCommandHandler` calls this only when it did. A
   * second, weaker check here (is the undo stack empty?) would need this class
   * to know about construction, and is how the two would come to disagree.
   *
   * **No count**, which is the owner's ruling and not a shortcut: an undo
   * reverses a whole transaction, so a sentence naming one order would be a
   * small lie whenever a run of several was taken back, and surfacing the size
   * needs plumbing on `redoTransaction` that the ruling declines. Left known.
   *
   * **Two sentences since [#927](https://github.com/matmaxalez/lockstate/issues/927),
   * split on whether the transaction destroyed anything -- the same split
   * `recordBuildOrderCancelled` above has had since #749, on the channel that
   * can destroy strictly more.** `Undo` goes through
   * `ConstructionSystem.cancelOrder` for every order in the transaction,
   * `'completed'` ones included, so a `Z` on a finished wall takes the wall
   * down, refunds nothing and destroys the materials. It said *"the last change
   * to the build queue was undone"* and nothing else, which is true and is not
   * the part that mattered.
   *
   * **A named union rather than a `boolean`**, for the reason the `switch`
   * above is a `switch`: a call site reading `recordConstructionUndone(true,
   * tick)` says nothing about what is true, and the two members here have to
   * be told apart by somebody reading the handler. Not
   * `BuildOrderLifecycleState`, which is the discriminator on the other
   * channel: an undo reverses many orders in many states at once, so there is
   * no single state to pass, and the or-across-the-transaction is computed
   * where the orders are (`ConstructionSystem.undo`).
   *
   * **`'nothing-destroyed'` is the honest name for the other member, not
   * `'money-refunded'`.** A transaction of `'planned'` orders spent nothing and
   * refunds nothing, so a member claiming money came back would be false of it;
   * what both refundable cases share is only that nothing was destroyed, and
   * the shipped sentence for them says only that the change was undone.
   */
  /**
   * Records that `Undo` found a transaction and declined to reverse it, because
   * the player's latest action was not a change to the build queue
   * ([ADR 0104](../../docs/adr/0104-what-undo-takes-back.md) option 2, accepted
   * 2026-09-09, against [#956](https://github.com/woogitsu/lockstate/issues/956)).
   *
   * **Carries no count and no figure**, for the same ruling
   * `recordConstructionUndone` carries none: the owner's 2026-09-01 ruling on
   * #749 declines the transaction-size plumbing, and nothing about what was
   * *not* touched is more reportable than what was.
   *
   * Called only when `ConstructionSystem.undo()` answers
   * `refusedBecause: 'a-newer-action-came-after-it'`, never on the other
   * `reversed: false` shape -- a press against an empty history says nothing,
   * which is what it has always done.
   */
  public recordConstructionUndoRefused(tick: number): void {
    this.append({ sequence: this._sequence + 1, tick, type: 'construction.undo-refused-newer-action' });
  }

  public recordConstructionUndone(spend: ConstructionUndoSpendOutcome, tick: number): void {
    const sequence = this._sequence + 1;
    switch (spend) {
      case 'nothing-destroyed':
        this.append({ sequence, tick, type: 'construction.undone' });
        return;
      case 'spend-destroyed':
        this.append({ sequence, tick, type: 'construction.undone-spend-destroyed' });
        return;
    }
  }

  /**
   * Records that an object standing in the prison was taken away, and that what
   * it cost is gone with it
   * ([#945](https://github.com/matmaxalez/lockstate/issues/945)).
   *
   * **The silence this closes destroyed money and put nothing on screen.** #945
   * measured it at v0.0.451: a standing bed cost 65 on placement
   * (`25,000 -> 24,935`) and removing it moved the treasury not at all
   * (`24,935 -> 24,935`) with the sentence band `hidden` -- so nothing
   * distinguished it from a removal that had refunded. It survived #932, which
   * made `Undo` and `CancelBuildOrder` state-aware, because a standing object
   * reaches neither: `ObjectPlacementService.remove`'s first arm goes to
   * `PlacedObjectRegistry.remove` and never to `ConstructionSystem.cancelOrder`.
   *
   * **No discriminator, unlike `recordConstructionUndone` above, and that is a
   * fact about the route rather than a simplification.** That method splits two
   * sentences because an undo reverses orders in states that differ in whether
   * money comes back. This one has nothing to split: every buildable with a
   * `placesObjectId` in `BUILDABLE_REGISTRY` requires at least one material, so
   * a standing object always cost something, and the removal returns nothing
   * whatever it was -- the owner's ruling of 2026-09-01, *"Taking a finished
   * object away returns nothing. Not its materials, not its money."* A future
   * removal that gave something back would be a second event type, argued at
   * `objects.removed-spend-destroyed`'s schema, and not a second arm here.
   *
   * **Unguarded, because there is no figure to guard**, exactly as
   * `recordConstructionUndone` is. The caller records only on
   * `RemoveObjectOutcome.kind === 'removed'`, which is the arm that has already
   * dropped the registry row -- so this cannot report a removal that did not
   * happen, which is the promise-the-code-does-not-keep `AGENTS.md`'s fourth
   * exclusion reserves.
   */
  public recordObjectRemoved(tick: number): void {
    this.append({ sequence: this._sequence + 1, tick, type: 'objects.removed-spend-destroyed' });
  }

  /** Records that the build history was walked forward one transaction (#749). The mirror of `recordConstructionUndone` above, on every point. */
  public recordConstructionRedone(tick: number): void {
    this.append({ sequence: this._sequence + 1, tick, type: 'construction.redone' });
  }

  /**
   * Records that a delivery still on the road was cancelled, and what came back
   * (#749).
   *
   * **Guarded on the figure being a number rather than on it being positive**,
   * which is the opposite of `recordUnpaidWages` and `recordDischarge` above and
   * is deliberate: for those a zero means the thing did not happen, and here the
   * cancellation happened whatever the delivery had cost. The bound that matters
   * is the caller's -- `ProcurementSystem.cancel` answers `ok: false` for a
   * delivery that is not in flight, and that route records a refusal instead.
   *
   * @param refundedMinorUnits `PurchaseCancelOutcome.refundedMinorUnits`, which
   * is the delivery's *recorded* `paidMinorUnits`. Passed through rather than
   * recomputed, exactly as `ProcurementSystem.cancel` refunds it.
   */
  public recordDeliveryCancelled(refundedMinorUnits: number, tick: number): void {
    if (!Number.isSafeInteger(refundedMinorUnits) || refundedMinorUnits < 0) return;
    this.append({
      sequence: this._sequence + 1,
      tick,
      type: 'economy.delivery-cancelled',
      refundedMinorUnits,
    });
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
   * Records that the prison has nothing open any more **and that the last
   * thing to close was not contained** (issue #914's finding 4).
   *
   * The lapse half of `recordIncidentsAllClear` above, split off it for the
   * reason the schema in `src/simulation/protocol/types.ts` sets out: the two
   * endings cost a prison entirely different amounts and read as one row.
   * Unguarded and figure-free for exactly the sibling's reasons -- the caller
   * is what bounds it to at most one per return to calm, and this class knows
   * nothing about incidents.
   *
   * `IncidentResponseSystem.reportAllClearIfCalm` calls **one** of the two,
   * never both, so a return to calm is still one row on the alerts list.
   */
  public recordIncidentsAllClearAfterLapse(tick: number): void {
    this.append({ sequence: this._sequence + 1, tick, type: 'incidents.all-clear-after-lapse' });
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
    // A dismissed record is one the player has already read and retired, so it
    // is not handed out again -- which is what makes a dismissal survive the
    // reload it would otherwise be undone by, since a restore republishes this
    // buffer from ordinal zero. In a live session it changes nothing: a row
    // has to be published before it can be on screen to be dismissed.
    return this._buffered.filter((event) => event.sequence > after && !this._dismissed.has(event.sequence));
  }

  private append(event: SimulationEvent): void {
    this._sequence = event.sequence;
    this._buffered.push(event);
    if (this._buffered.length > MAX_BUFFERED_SIMULATION_EVENTS) {
      const overflow = this._buffered.length - MAX_BUFFERED_SIMULATION_EVENTS;
      const trimmed = this._buffered.slice(0, overflow);
      this._buffered = this._buffered.slice(overflow);
      // A mark against a record that has just been trimmed away can never be
      // read again -- `since` and `dismiss` both only ever look at the buffer
      // -- and keeping it would be the one thing on this class that grows with
      // the session. Walked over the records that left rather than over the
      // marks, which is both smaller (the overflow is one record per append)
      // and ordered: `docs/DETERMINISM.md`'s canonical-order rule is about not
      // enumerating a `Set` at all where an array will do.
      for (const event of trimmed) this._dismissed.delete(event.sequence);
    }
  }
}

/**
 * A saved log: the records the buffer held, the marks against them, and the
 * ordinal counter (the owner's decision 4 of 2026-09-01 on ADR 0084).
 *
 * Declared beside the class rather than in `src/persistence`, for the reason
 * every other subsystem snapshot is: the shape belongs to the thing that owns
 * the state, and `save-schema.ts` validates it at the boundary.
 */
export interface SimulationEventLogSnapshot {
  /** The highest ordinal the session had issued. Never rewound by trimming. */
  readonly sequence: number;
  /** The retained buffer, oldest first, at most `MAX_BUFFERED_SIMULATION_EVENTS` of them. */
  readonly records: readonly SimulationEvent[];
  /** Ascending ordinals of the records a player dismissed, each one of `records`. */
  readonly dismissed: readonly number[];
}
