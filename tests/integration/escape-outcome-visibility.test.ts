import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { SimulationEventLog } from '../../src/simulation/events';
import { IncidentLog } from '../../src/simulation/incidents/incident';
import {
  DEFAULT_INCIDENT_RESPONSE_POLICY,
  IncidentResponseSystem,
} from '../../src/simulation/incidents/response-system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { projectIncidents } from '../../src/simulation/presentation/incident-projection';
import {
  SIMULATION_EVENT_TYPES,
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationEvent,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import type { EntityId } from '../../src/simulation/entity/entity-store';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';

/**
 * **What the prison says when somebody gets out**
 * ([#683](https://github.com/matmaxalez/lockstate/issues/683)).
 *
 * A playtest of `main` measured an escape it could only find in the worker's
 * own event stream -- `incidents.escape-attempt-opened` at tick 48,000, a
 * population that fell in the window after it, and no `prisoners.discharged`
 * anywhere near it
 * (the playtest record `2026-08-30-playing-main-after-fifteen-changes.md`, on an
 * unmerged branch, so it is not spelled as a rooted path here). The claim
 * this file measures is the one #683 makes out of that: **a successful escape
 * and a contained attempt reach the player as the same two sentences.**
 *
 * ## It measures the claim, it does not fix it
 *
 * Nothing under `src/` is changed by this file, and nothing here authors a
 * sentence. What an escape *should* say is a new player-facing promise, which
 * `AGENTS.md`'s fourth exclusion reserves to the owner; this is the evidence
 * that the promise is missing, kept executable so it cannot rot the way a
 * paragraph about it would.
 *
 * ## Why both arms are real, and what is not
 *
 * Both runs drive the real `IncidentResponseSystem` over a real
 * `NavigationSystem`, a real `GuardRoster` and a real `SecuritySectorRegistry`,
 * and both record through the real `SimulationEventLog`. The two arms differ in
 * **one input, the guard count**, which is exactly the difference the prison
 * makes: three guards is `requiredResponderCount(6)` and contains it; none
 * leaves it to lapse at `responseDeadlineTicks`, and a lapsed escape attempt is
 * ADR 0061 decision 5's prisoner who is gone.
 *
 * The one thing not driven by a producer here is the *opening*: the incident is
 * opened on the log directly, and the opening event is recorded through the
 * same `SimulationEventLog.recordIncidentOpened` call `IncidentTriggerSystem`
 * makes, rather than by satisfying that system's gate. That gate -- tier 3 and
 * something in the prisoner's hands -- is measured end to end one file over, in
 * `tests/integration/incident-trigger-reachability.test.ts`, which builds a
 * prison out of player commands and loses two prisoners out of it. This file is
 * about what happens *after* an attempt opens, so it starts there.
 *
 * The severity is the lowest one the trigger can produce and is written down
 * rather than derived: `IncidentTriggerSystem.tryOpenEscapeAttempt` sets
 * `severity = round(score * 10)` and will not open below
 * `DEFAULT_ESCAPE_ATTEMPT_POLICY.threshold`, which is `0.6`. So 6 is the
 * cheapest attempt a prison can be asked to contain, and
 * `requiredResponderCount(6)` is 3.
 */

/** Distinct from the seeds and ids the incident suite already uses, so no shared fixture can make a result here true by accident. */
const INCIDENT_ID = 'incident-escape-683';

/** The one prisoner an escape attempt names. `IncidentTriggerSystem` never gives one more than a single participant. */
const ESCAPER: EntityId = 3 as EntityId;

/** The lowest severity `tryOpenEscapeAttempt` can produce -- see the header. `requiredResponderCount(6)` is 3. */
const SEVERITY = 6;

/** Cell index avoiding `buildCellBlockFixture`'s `i % 5 === 0` medical gating and `i % 7 === 0` closed doors -- the same one `incident-response.test.ts` picks, for the same reason. */
const OPEN_CELL_INDEX = 1;

/** Past `responseDeadlineTicks` (600) and `containmentTicks` (60) with room to spare, so both arms have reached a terminal state or failed loudly. */
const RUN_TICKS = 2_000;

interface AttemptOutcome {
  readonly state: string;
  readonly escaped: boolean;
  /** Every entity the response system handed to its `onPrisonerEscaped` port -- the departure ADR 0061 decision 5 ships with the flag. */
  readonly removedFromPrison: readonly EntityId[];
  readonly events: readonly SimulationEvent[];
  readonly escapesInProjection: number;
}

function runAttempt(guardCount: number): AttemptOutcome {
  const cellBlock = buildCellBlockFixture(8);
  const navigation = new NavigationSystem(
    cellBlock.world,
    { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 },
    cellBlock.doors,
  );
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const sectors = new SecuritySectorRegistry(cellBlock.doors);
  sectors.register({
    id: 'block-a',
    gradeId: 'grade.general',
    doorIds: [`cell-door-${String(OPEN_CELL_INDEX)}`],
    postTile: cellBlock.cellTiles[OPEN_CELL_INDEX]!,
  });

  const guards = new GuardRoster(64);
  for (let index = 0; index < guardCount; index += 1) {
    guards.hire('staff-role.guard', cellBlock.canteenTiles[index % cellBlock.canteenTiles.length]!);
  }

  const incidents = new IncidentLog();
  const events = new SimulationEventLog();
  const removedFromPrison: EntityId[] = [];
  const response = new IncidentResponseSystem(
    incidents,
    sectors,
    guards,
    navigation,
    events,
    DEFAULT_INCIDENT_RESPONSE_POLICY,
    undefined,
    () => [],
    (entityId) => removedFromPrison.push(entityId),
  );

  const kernel = new Kernel();
  kernel.registerSystem(navigation);
  kernel.registerSystem(response);

  // The order `IncidentTriggerSystem.openIncident` does it in: the record
  // first, then the event, at the same tick.
  incidents.open(
    { id: INCIDENT_ID, type: 'escape-attempt', sectorId: 'block-a', participantIds: [ESCAPER], severity: SEVERITY, causeFactors: [] },
    0,
  );
  events.recordIncidentOpened('escape-attempt', 1, 0);

  for (let tick = 0; tick < RUN_TICKS && incidents.openIncidentCount > 0; tick += 1) kernel.step();

  const incident = incidents.get(INCIDENT_ID)!;
  return {
    state: incident.state,
    escaped: incident.outcome?.escaped ?? false,
    removedFromPrison,
    events: events.since(0),
    escapesInProjection: projectIncidents({ incidents }, kernel.tick).summary.escapes,
  };
}

/**
 * The event as it reaches the main thread: through the protocol schema rather
 * than handed over as an object, so a payload the boundary would reject cannot
 * reach an assertion here. The same shape `incident-events-loop.test.ts` uses.
 */
function publication(event: SimulationEvent): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000683',
    kind: 'simulation/event',
    payload: { tick: event.tick + 1, event },
  }) as WorkerToMainMessage;
}

/**
 * What the player actually reads, resolved through the shipped catalogue.
 *
 * Deliberately not a list of event *types*: two runs whose type lists differ
 * could still say the same thing to a player, and two whose type lists agree
 * could still differ in the sentence or the colour. The claim on #683 is about
 * the sentence and the band, so that is what is compared.
 */
function sentencesFor(events: readonly SimulationEvent[]): readonly string[] {
  const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
  return events.map((event) => {
    const notice = hudEventNoticeFromWorkerMessage(publication(event));
    if (notice === undefined || notice === 'none') throw new Error(`${event.type} produced no notice`);
    return `${notice.severity}: ${localizer.format(notice.labelKey, notice.labelParameters)}`;
  });
}

describe('a prisoner who got out, and one the guards stopped (#683)', () => {
  it('tells the player the same two sentences either way', () => {
    const contained = runAttempt(3);
    const gotOut = runAttempt(0);

    /*
     * The premise first, and in the prison's own terms rather than the
     * channel's: without this the equality below would hold for two runs that
     * both contained the attempt, which is the way a test of an absence passes
     * for the wrong reason.
     */
    expect(contained.state, 'three guards is `requiredResponderCount(6)`, so the attempt is contained').toBe('resolved');
    expect(contained.escaped).toBe(false);
    expect(contained.removedFromPrison, 'and nobody left the prison').toEqual([]);

    expect(gotOut.state, 'with nobody to dispatch it lapses at the response deadline').toBe('lapsed');
    expect(gotOut.escaped, 'and a lapsed escape attempt is ADR 0061 decision 5').toBe(true);
    expect(gotOut.removedFromPrison, 'the participant is handed to the departure port and is gone').toEqual([ESCAPER]);

    /*
     * #683's claim. Both runs put exactly two rows on the events channel and
     * they are the same two rows, in the same order, in the same colours.
     */
    const containedSentences = sentencesFor(contained.events);
    const escapeSentences = sentencesFor(gotOut.events);

    expect(containedSentences, 'non-vacuous: the prison did say something in both arms').toEqual([
      'danger: A prisoner is trying to break out.',
      'info: The prison is under control again — no incident is still open.',
    ]);
    expect(
      escapeSentences,
      'a prisoner is gone and the player is told the same thing as when nobody was',
    ).toEqual(containedSentences);
  });

  it('has the fact, in a read model with a route out of the worker and no panel on the end of it', () => {
    const contained = runAttempt(3);
    const gotOut = runAttempt(0);

    /*
     * The distinguishing fact is not missing from the simulation -- it is
     * missing from the screen. `projectIncidents` counts it, per incident and
     * in the summary, and `hud/incidents` is catalogued and routed.
     *
     * What it has no reader for is asserted where it belongs and not
     * re-implemented here: `tests/foundation/projection-reachability-contract.test.ts`
     * names `hud/incidents` in `UNPAINTED_PROJECTION_IDS` -- "No reader" -- and
     * fails in both directions, so the day a panel paints it that entry goes
     * stale and this comment is corrected by the same change.
     */
    expect(gotOut.escapesInProjection, 'the projection knows exactly who got out').toBe(1);
    expect(contained.escapesInProjection).toBe(0);
  });

  it('states its own premise: no event on the channel distinguishes the two outcomes', () => {
    /*
     * The both-directions half, in the idiom
     * `projection-reachability-contract.test.ts` uses for the same kind of
     * claim. This file is only worth keeping while the absence it measures is
     * real: the moment an event type says an attempt succeeded, this assertion
     * fails, and whoever added it should re-measure the two arms above and
     * delete this test rather than extend the list.
     */
    const incidentEvents = SIMULATION_EVENT_TYPES.filter((type) => type.startsWith('incidents.'));
    expect(
      [...incidentEvents],
      'an incident event type was added or removed -- if it reports an outcome, #683 is answered and this file has to be re-measured',
    ).toEqual([
      'incidents.all-clear',
      'incidents.assault-opened',
      'incidents.escape-attempt-opened',
      'incidents.gang-retaliation-opened',
      'incidents.riot-opened',
    ]);
  });
});
