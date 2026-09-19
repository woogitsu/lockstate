import type { EntityId } from '../entity/entity-store';
import type { SimulationEventLog } from '../events';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import {
  ASSAULT_PARTICIPANT_COUNT,
  ASSAULT_SEVERITY_CEILING,
  DEFAULT_ASSAULT_POLICY,
  DEFAULT_ESCAPE_ATTEMPT_POLICY,
  canAttemptEscape,
  rankFlashpoints,
  scoreAssaultPressure,
  scoreEscapeAttemptPressure,
  type AssaultPolicy,
  type EscapeAttemptPolicy,
  type PrisonerFlashpoint,
} from './flashpoint';
import { GangRegistry, resolveRetaliationRisk } from './gangs';
import { IncidentLog, type IncidentCauseFactor, type IncidentType, type OpenIncidentInput } from './incident';
import { SectorRiskTracker, type SectorRiskSample } from './sector-risk';

/**
 * Supplies each sector's current risk inputs from real simulation state.
 * Injected rather than reaching into every subsystem directly, so this
 * system depends on none of them concretely -- the same decoupling
 * `SearchSystem`'s `CategoryConcealmentResolver` (#27) uses, and
 * `DeliveryBayCarryRoute`'s `RoomInstanceSource`
 * (`src/simulation/operations/delivery-route.ts`) after it.
 *
 * **This sentence cited a second precedent that no longer exists**, and it is
 * corrected rather than overwritten (`docs/AGENT_WORKFLOW.md` §4): it read
 * *"the same decoupling `JobSystem`'s `JobWorkerAdapter` (#25) and
 * `SearchSystem`'s `CategoryConcealmentResolver` (#27) use"*.
 * [ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) deleted both
 * `JobSystem` and `JobWorkerAdapter` -- decision 4 names the adapter's
 * *"prisoners today, staff later"* generality as the thing that deliberately
 * did not survive -- so the pattern is still the pattern and one of its two
 * examples had to be replaced. The replacement is the port that took the same
 * job in the same layer: a structural interface that keeps `operations/` from
 * importing `prisoners/` for one query.
 */
export type SectorRiskSampler = (sectorId: string, tick: number) => SectorRiskSample;

/** Which prisoners are in a sector right now -- again injected, since sector membership is session/scenario knowledge. */
export type SectorOccupantResolver = (sectorId: string) => readonly EntityId[];

/**
 * Each occupant's own pressures, in the same ascending-entity-id order
 * `SectorOccupantResolver` answers in -- injected for the reason the two
 * resolvers above are, and answered in a session from the real prisoner
 * components and the real contraband registry
 * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)).
 *
 * Optional at the constructor: a session that supplies no sampler produces
 * riots and gang retaliations exactly as it did before, which is what keeps
 * every existing fixture of this class honest about what it is testing.
 */
export type PrisonerFlashpointSampler = (sectorId: string, tick: number) => readonly PrisonerFlashpoint[];

/**
 * How long a sector stays quiet after an incident opens in it -- two in-game
 * days (`DAY_LENGTH_TICKS` is 2,400).
 *
 * A **directional default, not a balance decision**, and the reason it exists
 * at all is a measurement. `resetStreak` on its own makes one sustained window
 * produce one incident, but it says nothing about the *next* window: in a
 * prison whose conditions do not improve, every sample after the incident
 * closes is hot again, so the sector re-arms in `sustainedSamplesRequired`
 * samples and riots again. Measured on this tree before the quiet period
 * existed: an overcrowded, unguarded starter prison opened **49 riots in 20
 * in-game days**, roughly one every ten hours, each one a fresh record with
 * fresh disciplinary points. That is a nuisance rather than a stake.
 *
 * Measured from the previous incident's *start* rather than its end, which is
 * the simpler statement and the stricter one: `responseDeadlineTicks` is 600,
 * so the incident itself is inside the window and about 4,200 ticks of quiet
 * follow it whether it was contained or lapsed.
 *
 * It is a floor on the interval and not a fixed cadence. Sampling continues
 * through the window, so a sector that genuinely calms down inside it resets
 * its streak and has to earn `sustainedSamplesRequired` all over again; a
 * sector whose conditions never improve fires again on the first sample past
 * the window, which is the intended reading of "nothing was fixed".
 */
export const DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT = 4_800;

/**
 * How many prisoners have to be standing in a sector before its sustained risk
 * can become a **riot**.
 *
 * Two, and the number is the whole of the argument: a riot is a collective act,
 * and `IncidentLog` already carries `'assault'` for what one prisoner does.
 * `IncidentResponseSystem.lapse` injures every participant and
 * `respondersPerSeverityPoint` sizes the response from severity, so a
 * one-participant severity-7 riot is a prisoner rioting against themselves
 * while four guards are dispatched to contain it. Once occupancy stopped
 * meaning "standing on one particular tile" and started meaning "in the
 * prison", that case became reachable in the smallest prison a player can
 * build: one furnished cell, one prisoner, and no toilet, shower or yard, whose
 * needs sit around half unmet for ever.
 *
 * **What it deliberately does not do is suppress the risk.** A sector below the
 * floor still samples, still scores and still accumulates its streak; it simply
 * has nobody to riot. The pressure is real and it is recorded — it becomes an
 * incident on the sampling point after the second prisoner arrives, not two
 * windows later.
 *
 * Directional default, not a balance decision.
 */
export const DEFAULT_MINIMUM_RIOT_PARTICIPANTS = 2;

/**
 * How long a sector stays quiet after an **assault** opens in it -- one in-game
 * day.
 *
 * Half the riot's window, and the ratio is the argument: an assault is two
 * people, a riot is everybody, and the quiet period is what makes an incident
 * an event rather than a ticker. A prison that neglects one person badly enough
 * to produce assaults should produce them noticeably more often than it
 * produces riots, and still not more than once a day.
 *
 * Per type since ADR 0061 -- see `IncidentLog.lastIncidentStartedAtTick`, which
 * is where the reason a sector-wide window could not carry three producers is
 * written down. Directional default, not a balance decision.
 */
export const DEFAULT_SECTOR_QUIET_TICKS_AFTER_ASSAULT = 2_400;

/**
 * How long a sector stays quiet after an **escape attempt** opens in it -- five
 * in-game days.
 *
 * The longest of the three, because it has the largest consequence: an escape
 * attempt nobody contains means the prisoner is gone (ADR 0061 decision 5), and
 * a prison losing somebody every other day is not a stake, it is an emptying
 * room. Directional default, not a balance decision.
 */
export const DEFAULT_SECTOR_QUIET_TICKS_AFTER_ESCAPE_ATTEMPT = 12_000;

export interface IncidentTriggerMetrics {
  readonly incidentsTriggered: number;
  readonly riotsTriggered: number;
  readonly retaliationsTriggered: number;
}

/**
 * The two counters ADR 0061's producers add.
 *
 * A **separate interface, read off the incident log rather than accumulated**,
 * and both halves of that are deliberate. `IncidentTriggerMetrics` above is
 * persisted (`incidentsSectionSchema.trigger.metrics`, `.strict()`), so adding
 * fields to it is a save-schema edit; and it does not need to be, because the
 * log already records every incident's `type` and `all()` is already sorted and
 * already read by `summarizeIncidents` and `buildDisciplinaryIndex`. A counter
 * that can be derived from persisted state and is only ever *reported* is the
 * kind of duplicate ADR 0032 decision 1 declined a save bump for.
 */
export interface IncidentTypeCounts {
  readonly assaultsTriggered: number;
  readonly escapeAttemptsTriggered: number;
}

/** Derived, never accumulated: counts `type` over the whole log. See `IncidentTypeCounts`. */
export function countIncidentsByType(incidents: IncidentLog): IncidentTypeCounts {
  let assaultsTriggered = 0;
  let escapeAttemptsTriggered = 0;
  for (const incident of incidents.all()) {
    if (incident.type === 'assault') assaultsTriggered += 1;
    else if (incident.type === 'escape-attempt') escapeAttemptsTriggered += 1;
  }
  return { assaultsTriggered, escapeAttemptsTriggered };
}

/**
 * Turns sustained sector conditions into incidents -- issue #28's "riot
 * trigger based on sustained sector unhappiness/risk inputs rather than a
 * one-tick threshold" and "gang membership/territory/retaliation alters
 * risk/action scoring without nondeterministic iteration."
 *
 * Runs on a multi-rate schedule (every 50 ticks), so one "sample" is a
 * sampling point, not a kernel tick: the risk tracker's sustained window
 * therefore spans real simulated time rather than twelve consecutive
 * frames. Every iteration order here is explicitly sorted (sector ids,
 * gang ids, entity ids), never `Map` order.
 *
 * **Four gates stand between a hot sector and a riot**, and they are listed
 * here because reading `update` alone makes them look like one condition:
 *
 * 1. `SectorRiskTracker.isSustainedHot` -- the window, `sustainedSamplesRequired`
 *    consecutive hot samples, reset outright by one cool one.
 * 2. `openIncidentsInSector` -- one open incident per sector, so a riot inside
 *    a riot is not a second record.
 * 3. `isQuiet` -- `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT` since the last
 *    incident *opened*, which is what stops a prison nobody fixes from
 *    producing one riot per window for ever
 *    ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
 *    decision 4).
 * 4. `minimumRiotParticipants` -- a riot is a collective act, so a sector with
 *    one prisoner in it accumulates risk and has nobody to riot.
 *
 * Gates 3 and 4 arrived with ADR 0048 and only became necessary once occupancy
 * meant "in the prison" rather than "on one tile": before that the trigger
 * could not fire in a playable prison at all, so nothing could fire it too
 * often or with too few people.
 *
 * ## What this docblock said until ADR 0061, and what it says now
 *
 * It said this system's subject was the riot, and every gate above is still
 * about the riot. **It is no longer the only thing produced here.** Since
 * [ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)
 * three of `IncidentType`'s four members have a producer in `src/`:
 *
 * - `'riot'`, from the sector's sustained mean, unchanged and gated as above;
 * - `'escape-attempt'`, from one prisoner's sentence, tier and holdings;
 * - `'assault'`, from one prisoner's own unmet needs and holdings.
 *
 * The two new ones read `PrisonerFlashpointSampler` instead of
 * `SectorRiskSampler`, and the difference is the point rather than a detail:
 * `needsPressure` is a *mean over the sector*, and an act one prisoner commits
 * cannot be read off an average that a single well-served neighbour pulls back
 * under the line. `flashpoint.ts` carries that argument in full, including why
 * neither of them keeps a sustained window when the riot does.
 *
 * Gate 2 is shared by all three; gate 3 is now asked **per type**
 * (`IncidentLog.lastIncidentStartedAtTick`), because one window shared between
 * three producers would let whichever fired first silence the other two.
 * `'gang-retaliation'` still has no producer of its own -- it needs
 * `GangRegistry` entries nothing in `src/` writes -- and that is the one member
 * of the union ADR 0061 did not reach.
 *
 * **THAT LAST SENTENCE IS FALSE AS OF
 * [ADR 0103](../../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md),
 * and it is kept rather than overwritten because it is the state this file
 * described from ADR 0061 until then** (`docs/AGENT_WORKFLOW.md` §4). All four
 * members of the union now have a producer in `src/`: `default-gangs.ts`
 * registers two gangs onto the watched sector at session creation,
 * `IntakeSystem` assigns `high-risk` arrivals to one, and
 * `IncidentResponseSystem`'s adjudication of a cross-gang assault writes the
 * grudge `resolveRetaliationRisk` reads. `tryOpenRetaliation` below is
 * unchanged except for decision 4's guard, which refuses a pair whose members
 * have gone.
 */
export class IncidentTriggerSystem implements SystemRegistration {
  public readonly id = 'incidents.trigger';
  public readonly order = 285;
  public readonly schedule = { intervalTicks: 50, phaseTicks: 0 };

  private incidentsTriggered = 0;
  private riotsTriggered = 0;
  private retaliationsTriggered = 0;
  private sequence = 0;

  public constructor(
    private readonly incidents: IncidentLog,
    private readonly risk: SectorRiskTracker,
    private readonly gangs: GangRegistry,
    private readonly sectorIds: readonly string[],
    private readonly sampleRisk: SectorRiskSampler,
    private readonly resolveOccupants: SectorOccupantResolver,
    /**
     * The session's `SimulationEventLog`, and required rather than defaulted
     * for the reason `PayrollSystem` states about its own: *"a `PayrollSystem`
     * with no sink would go on billing silently, which is the defect issue
     * #507 exists to close."* This system is the only thing in `src/` that
     * opens an incident, so a trigger system with no sink is precisely issue
     * #555 -- a riot happening and the Alerts section reading "No active
     * alerts".
     *
     * Declared here, before the eight defaulted parameters below, because
     * TypeScript forbids a required parameter after an optional one. Every
     * call site is a reviewed edit rather than a silent widening: there are
     * four in the repository.
     */
    private readonly events: SimulationEventLog,
    /** Retaliation risk at/above which a gang-retaliation incident fires. Directional default, not a balance decision. */
    private readonly retaliationThreshold: number = 0.6,
    /** How long after an incident opens this sector may not open another. See `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT`. */
    private readonly quietTicksAfterIncident: number = DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT,
    /** How many occupants a sector needs before a riot can open in it. See `DEFAULT_MINIMUM_RIOT_PARTICIPANTS`. */
    private readonly minimumRiotParticipants: number = DEFAULT_MINIMUM_RIOT_PARTICIPANTS,
    /**
     * Each occupant's own pressures. Omitted, this system opens `'riot'` and
     * `'gang-retaliation'` and nothing else -- which is what it did before
     * ADR 0061 and what every fixture predating it expects.
     */
    private readonly sampleFlashpoints?: PrisonerFlashpointSampler,
    private readonly assaultPolicy: AssaultPolicy = DEFAULT_ASSAULT_POLICY,
    private readonly escapePolicy: EscapeAttemptPolicy = DEFAULT_ESCAPE_ATTEMPT_POLICY,
    private readonly quietTicksAfterAssault: number = DEFAULT_SECTOR_QUIET_TICKS_AFTER_ASSAULT,
    private readonly quietTicksAfterEscapeAttempt: number = DEFAULT_SECTOR_QUIET_TICKS_AFTER_ESCAPE_ATTEMPT,
  ) {}

  /**
   * Whether this sector is still inside the quiet period the last incident
   * bought it. Sampling continues through it -- the score and the streak are
   * still recorded, so a sector that calms down inside the window loses its
   * streak and has to rebuild it -- and only the *opening* of a new incident
   * is withheld.
   */
  private isQuiet(sectorId: string, tick: number, type: IncidentType, quietTicks: number): boolean {
    const lastStart = this.incidents.lastIncidentStartedAtTick(sectorId, type);
    return lastStart !== undefined && tick - lastStart < quietTicks;
  }

  public getMetrics(): IncidentTriggerMetrics {
    return { incidentsTriggered: this.incidentsTriggered, riotsTriggered: this.riotsTriggered, retaliationsTriggered: this.retaliationsTriggered };
  }

  public update(context: SimulationContext): void {
    for (const sectorId of [...this.sectorIds].sort()) {
      const sample = this.sampleRisk(sectorId, context.tick);
      const score = this.risk.sample(sectorId, sample);

      // One open incident per sector at a time -- a riot inside a riot is not a
      // second record, and this keeps response staffing attributable. It is
      // still *one* across all four types since ADR 0061 and not one per type:
      // `IncidentResponseSystem` claims responders out of a shared pool and
      // locks the sector down by sector id, so two open records in one sector
      // would be two responses fighting over one lockdown. The cost is that an
      // assault can delay a riot by at most `responseDeadlineTicks` (600), and
      // that is the whole of it -- the quiet periods below are per type, so
      // nothing is silenced for a window.
      if (this.incidents.openIncidentsInSector(sectorId).length > 0) continue;

      if (this.risk.isSustainedHot(sectorId) && !this.isQuiet(sectorId, context.tick, 'riot', this.quietTicksAfterIncident)) {
        // Resolved once and handed to `openRiot`, so the participants a riot
        // records are the same occupants its gate was decided on -- there is no
        // second walk in between for a prisoner to move during.
        const occupants = this.resolveOccupants(sectorId);
        if (occupants.length >= this.minimumRiotParticipants) {
          this.openRiot(sectorId, score, sample, occupants, context.tick);
          continue;
        }
      }

      // The two producers ADR 0061 adds, in descending consequence: an escape
      // attempt is the larger event and gets first refusal on the sector's one
      // open slot. Both read the individual rather than the sector mean, and
      // both are skipped entirely by a session that supplied no sampler.
      if (this.sampleFlashpoints !== undefined) {
        const flashpoints = this.sampleFlashpoints(sectorId, context.tick);
        if (this.tryOpenEscapeAttempt(sectorId, sample, flashpoints, context.tick)) continue;
        if (this.tryOpenAssault(sectorId, sample, flashpoints, context.tick)) continue;
      }

      if (this.isQuiet(sectorId, context.tick, 'gang-retaliation', this.quietTicksAfterIncident)) continue;
      this.tryOpenRetaliation(sectorId, context.tick);
    }
  }

  /**
   * The one prisoner closest to getting out, if they are over the line.
   *
   * Names **one** participant, which is the difference from every other
   * producer here and is the honest count: an escape attempt is one person
   * leaving, `IncidentOutcome.escaped` is a fact about them, and ADR 0061
   * decision 5 makes a lapsed one mean they are gone. A list would make it
   * several people gone at once on a single roll.
   */
  private tryOpenEscapeAttempt(
    sectorId: string,
    sample: SectorRiskSample,
    flashpoints: readonly PrisonerFlashpoint[],
    tick: number,
  ): boolean {
    // The two gates, before anything is scored: only a prisoner the prison
    // classified high risk, and only one carrying something, has an escape
    // attempt in them whatever the rest of their record says. See
    // `DEFAULT_ESCAPE_ATTEMPT_POLICY`.
    const candidates = flashpoints.filter((flashpoint) => canAttemptEscape(flashpoint));
    if (candidates.length === 0) return false;
    if (this.isQuiet(sectorId, tick, 'escape-attempt', this.quietTicksAfterEscapeAttempt)) return false;

    const ranked = rankFlashpoints(candidates, (flashpoint) =>
      scoreEscapeAttemptPressure(flashpoint, sample.staffingShortfall, this.escapePolicy),
    );
    const candidate = ranked[0]!;
    if (candidate.score < this.escapePolicy.threshold) return false;

    const source = candidates.find((flashpoint) => flashpoint.entityId === candidate.entityId)!;
    this.openIncident(
      {
        id: this.nextIncidentId('escape-attempt'),
        type: 'escape-attempt',
        sectorId,
        participantIds: [candidate.entityId],
        severity: Math.max(1, Math.min(10, Math.round(candidate.score * 10))),
        causeFactors: [
          { kind: 'escape-pressure', value: candidate.score },
          { kind: 'sentence-remaining', value: source.sentenceRemaining },
          { kind: 'risk-tier', value: source.riskTier },
          { kind: 'contraband-severity', value: source.contrabandSeverity },
          { kind: 'staffing-shortfall', value: sample.staffingShortfall },
        ],
      },
      tick,
    );
    this.incidentsTriggered += 1;
    return true;
  }

  /**
   * The two prisoners the prison has failed most, if the worse of them is over
   * the line.
   *
   * The pair is *the top two of the ranking*, not "the worst one plus whoever
   * happens to be nearest": there is no proximity model to ask, and inventing
   * one here -- a tile-radius scan, a shared-cell rule -- would be a spatial
   * containment rule decided in a trigger, which is what
   * `sector-occupancy.ts`'s header warns against doing anywhere but in a module
   * that is about the rule. Reading it as "the two people in the worst state
   * are the two in the fight" is a statement the state supports; anything
   * finer is not. See ADR 0061's open questions for the cell-sharing refinement
   * this leaves for #79.
   */
  private tryOpenAssault(
    sectorId: string,
    sample: SectorRiskSample,
    flashpoints: readonly PrisonerFlashpoint[],
    tick: number,
  ): boolean {
    if (flashpoints.length < ASSAULT_PARTICIPANT_COUNT) return false;
    // **Only in a sector that is not already heading for a riot.**
    //
    // The assault score is the sector score with one prisoner's deficit
    // substituted for the mean, so in any prison whose mean is hot there are
    // individuals who are hot too -- and the riot needs twelve consecutive hot
    // samples where this needs none, so without this line the assault fired
    // first and took the sector's one open incident slot every single time.
    // Measured on this tree: `tests/integration/riot-regime-loop.test.ts`'s
    // two-prisoner neglected prison produced an assault at tick 13,250 instead
    // of the riot the whole of ADR 0057 is about.
    //
    // `getConsecutiveHotSamples === 0` is "the last sample was cool", which is
    // the strictest available reading and the one that makes the two producers
    // complementary rather than competing: a riot is what a prison does when
    // its conditions are collectively bad, and an assault is what happens in a
    // prison that is not having one. See ADR 0061 decision 3.
    if (this.risk.getConsecutiveHotSamples(sectorId) > 0) return false;
    if (this.isQuiet(sectorId, tick, 'assault', this.quietTicksAfterAssault)) return false;

    const ranked = rankFlashpoints(flashpoints, (flashpoint) =>
      scoreAssaultPressure(flashpoint, sample.staffingShortfall, this.assaultPolicy),
    );
    const worst = ranked[0]!;
    if (worst.score < this.assaultPolicy.threshold) return false;

    const participants = ranked.slice(0, ASSAULT_PARTICIPANT_COUNT);
    const source = flashpoints.find((flashpoint) => flashpoint.entityId === worst.entityId)!;
    this.openIncident(
      {
        id: this.nextIncidentId('assault'),
        type: 'assault',
        sectorId,
        participantIds: participants.map((participant) => participant.entityId).sort((a, b) => a - b),
        // Scaled into the assault band rather than onto the shared 0-10 scale.
        // See `ASSAULT_SEVERITY_CEILING`, which carries the measurement.
        severity: Math.max(1, Math.min(ASSAULT_SEVERITY_CEILING, Math.round(worst.score * ASSAULT_SEVERITY_CEILING))),
        // The worst-ranked of the pair, named before `participantIds` above
        // sorts the two into a canonical order that no longer says which was
        // which (issue #80, ADR 00XX). `worst` is `ranked[0]` -- the entity
        // `scoreAssaultPressure` finds a reason for -- not a struck-first
        // determination.
        instigatorId: worst.entityId,
        causeFactors: [
          { kind: 'assault-pressure', value: worst.score },
          { kind: 'need-deficit', value: source.needDeficit },
          { kind: 'contraband-severity', value: source.contrabandSeverity },
          { kind: 'staffing-shortfall', value: sample.staffingShortfall },
        ],
      },
      tick,
    );
    this.incidentsTriggered += 1;
    return true;
  }

  /**
   * Opens the incident **and** tells the player it opened -- the one door all
   * four producers below go through (#555).
   *
   * A wrapper rather than four `recordIncidentOpened` calls beside four
   * `this.incidents.open` calls, for the reason `adjudicateAssaultIfAny` is
   * one in `IncidentResponseSystem`: *"so the two call sites cannot drift
   * about which incidents earn a sanction"*. There are four here, and a fifth
   * producer added later inherits the announcement instead of having to
   * remember it -- which is exactly what did not happen to the deleted
   * `toIncidentAlert` (`incident-summary.ts` has that story).
   *
   * **This is where the volume is bounded, not at `MAX_EVENT_ALERT_ROWS`.**
   * Every caller below has already passed `isQuiet` for its own `(sector,
   * kind)` pair before reaching this, so the pace is the quiet period rather
   * than the sampling cadence: at most one riot or gang-retaliation event per
   * sector per `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT` (4,800 ticks, two
   * in-game days), one assault per 2,400 and one escape attempt per 12,000.
   * Nothing downstream has to filter, which is the property `PayrollSystem`
   * describes as getting *"for free rather than from a filter downstream"*.
   *
   * `participantIds.length` is the count, read off the input this system just
   * built rather than off the record it just wrote: `IncidentLog.open` copies
   * the list and changes nothing about it, so the two are the same number, and
   * reading the input needs no `get` round trip.
   */
  private openIncident(input: OpenIncidentInput, tick: number): void {
    this.incidents.open(input, tick);
    this.events.recordIncidentOpened(input.type, input.participantIds.length, tick);
  }

  private nextIncidentId(type: IncidentType): string {
    this.sequence += 1;
    return `incident.${type}.${this.sequence}`;
  }

  private openRiot(sectorId: string, score: number, sample: SectorRiskSample, occupants: readonly EntityId[], tick: number): void {
    const causeFactors: readonly IncidentCauseFactor[] = [
      { kind: 'sustained-sector-risk', value: score },
      { kind: 'needs-pressure', value: sample.needsPressure },
      { kind: 'staffing-shortfall', value: sample.staffingShortfall },
      { kind: 'contraband-pressure', value: sample.contrabandPressure },
    ];
    this.openIncident(
      {
        id: this.nextIncidentId('riot'),
        type: 'riot',
        sectorId,
        participantIds: [...occupants].sort((a, b) => a - b),
        severity: Math.max(1, Math.min(10, Math.round(score * 10))),
        causeFactors,
      },
      tick,
    );
    this.risk.resetStreak(sectorId); // one sustained window -> one incident, not one per subsequent sample
    this.incidentsTriggered += 1;
    this.riotsTriggered += 1;
  }

  private tryOpenRetaliation(sectorId: string, tick: number): void {
    const claimants = this.gangs.gangsClaiming(sectorId);
    for (const offendedGangId of claimants) {
      for (const [offended, offending] of this.gangs.allGrudges()) {
        if (offended !== offendedGangId) continue;
        const risk = resolveRetaliationRisk(this.gangs, offended, offending, sectorId);
        if (risk < this.retaliationThreshold) continue;

        // **A retaliation nobody is in is refused**
        // ([ADR 0103](../../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
        // decision 4, from its Context 6).
        //
        // Membership is not static: `releasePrisoner` drops a departing
        // prisoner's membership (`src/simulation/prisoners/release.ts:211`), so
        // a gang can be emptied between the tick a grudge is recorded and the
        // tick it is acted on. Without this line that produces a prison-wide
        // lockdown, a severity-at-least-6 danger alert and the sentence
        // `'Two gangs are settling a score.'` with an empty participant list --
        // `IncidentLog.open` validates nothing about that list's length. That
        // is `AGENTS.md`'s fourth reservation reached from inside the
        // mechanism rather than a theoretical worry.
        //
        // A **narrowing** of the gate above, not a lowered floor: the risk
        // threshold is untouched and this asks a second question the sentence
        // has always implied. Both sides, because the sentence says "two
        // gangs" and one of them being empty makes it as false as both being.
        const offendedMembers = this.gangs.membersOf(offended);
        const offendingMembers = this.gangs.membersOf(offending);
        if (offendedMembers.length === 0 || offendingMembers.length === 0) continue;

        const participants = [...offendedMembers, ...offendingMembers].sort((a, b) => a - b);
        this.openIncident(
          {
            id: this.nextIncidentId('gang-retaliation'),
            type: 'gang-retaliation',
            sectorId,
            participantIds: participants,
            severity: Math.max(1, Math.min(10, Math.round(risk * 10))),
            causeFactors: [
              { kind: 'gang-grudge', value: this.gangs.getGrudge(offended, offending) },
              { kind: 'retaliation-risk', value: risk },
            ],
          },
          tick,
        );
        this.gangs.clearGrudge(offended, offending); // acted on -- not a permanent standing grievance
        this.incidentsTriggered += 1;
        this.retaliationsTriggered += 1;
        return; // one incident per sector per sampling point
      }
    }
  }

  public getSnapshot(): { readonly metrics: IncidentTriggerMetrics; readonly sequence: number } {
    return { metrics: this.getMetrics(), sequence: this.sequence };
  }

  public loadSnapshot(snapshot: ReturnType<IncidentTriggerSystem['getSnapshot']>): void {
    this.incidentsTriggered = snapshot.metrics.incidentsTriggered;
    this.riotsTriggered = snapshot.metrics.riotsTriggered;
    this.retaliationsTriggered = snapshot.metrics.retaliationsTriggered;
    this.sequence = snapshot.sequence;
  }
}
