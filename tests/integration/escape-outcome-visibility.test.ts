import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { SimulationEventLog } from '../../src/simulation/events';
import { IncidentLog } from '../../src/simulation/incidents/incident';
import {
  DEFAULT_INCIDENT_RESPONSE_POLICY,
  IncidentResponseSystem,
  type EscapedPrisoner,
} from '../../src/simulation/incidents/response-system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { projectIncidents } from '../../src/simulation/presentation/incident-projection';
import {
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationEvent,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import type { EntityId } from '../../src/simulation/entity/entity-store';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { resolveHudLabelParameters } from '../../src/ui/hud/label-parameters';
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
 * unmerged branch, so it is not spelled as a rooted path here).
 *
 * ## This file measured an absence first, and now measures the sentence
 *
 * **Both directions are kept rather than overwritten** (`docs/AGENT_WORKFLOW.md`
 * section 4). As first written it asserted #683's claim -- *"a successful
 * escape and a contained attempt reach the player as the same two
 * sentences"* -- and it held: both arms produced `A prisoner is trying to break
 * out.` and then `The prison is under control again -- no incident is still
 * open.`, byte for byte, in the same colours. It also carried a third test
 * pinning the incident event vocabulary, whose comment instructed whoever
 * added an outcome event to re-measure the two arms and **delete** it rather
 * than extend the list. That is what happened, and this is the re-measurement.
 *
 * The owner ruled the sentence on 2026-08-30 and it is reproduced exactly, in
 * `src/content/default-locale-en.ts` and nowhere else; this file resolves it
 * through the shipped catalogue rather than restating it, except in the one
 * assertion whose whole job is to say what a player reads.
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

/** The name the fixture's departure port answers with, so the sentence has two halves to assemble through `hud.regime.roster-name`. */
const ESCAPER_NAME = { givenName: 'Ada', familyName: 'Bell' } as const;

interface AttemptOutcome {
  readonly state: string;
  readonly escaped: boolean;
  /** Every entity the response system handed to its `onPrisonerEscaped` port -- the departure ADR 0061 decision 5 ships with the flag. */
  readonly removedFromPrison: readonly EntityId[];
  readonly events: readonly SimulationEvent[];
  readonly escapesInProjection: number;
}

/**
 * What the departure answers with, which is the fixture's whole other input.
 *
 * `IncidentResponseSystem`'s `onPrisonerEscaped` port performs the departure
 * and reports who left, because a name is readable only until
 * `releasePrisoner` releases it (#683). The three answers a real session can
 * produce are all reachable from here: a named prisoner, an unnamed one (a
 * session wired without an identity registry), and nobody at all (a release
 * the prisoner runtime refused).
 */
type Departure = (entityId: EntityId) => EscapedPrisoner | undefined;

const DEPARTED_NAMED: Departure = () => ({ name: ESCAPER_NAME });

function runAttempt(guardCount: number, departure: Departure = DEPARTED_NAMED): AttemptOutcome {
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
    (entityId) => {
      removedFromPrison.push(entityId);
      return departure(entityId);
    },
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
 *
 * **Through `resolveHudLabelParameters`, which is the half that has teeth
 * here.** That is what `hud.ts` renders with, and the escape sentence's
 * `{name}` is a `HudMessageParameterViewModel` rather than a plain value:
 * formatting from `notice.labelParameters` alone -- which this function did
 * while the two arms were identical and no event on the channel carried a
 * name -- would put the literal `{name}` in the string below and let it
 * through, because `interpolate` deliberately leaves an unsubstituted
 * placeholder visible. `eventParameterMessages` is the site that fills it and
 * the one site of the five this change touches that the compiler does **not**
 * force, so it is guarded here and, for every event type at once, in
 * `tests/unit/ui-simulation-events.test.ts`.
 */
function sentencesFor(events: readonly SimulationEvent[]): readonly string[] {
  const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
  return events.map((event) => {
    const notice = hudEventNoticeFromWorkerMessage(publication(event));
    if (notice === undefined || notice === 'none') throw new Error(`${event.type} produced no notice`);
    const parameters = resolveHudLabelParameters((key, values) => localizer.format(key, values), notice);
    return `${notice.severity}: ${localizer.format(notice.labelKey, parameters)}`;
  });
}

describe('a prisoner who got out, and one the guards stopped (#683)', () => {
  it('names the escapee and says why nobody stopped them', () => {
    const contained = runAttempt(3);
    const gotOut = runAttempt(0);

    /*
     * The premise first, and in the prison's own terms rather than the
     * channel's: without this the comparison below would hold for two runs that
     * both contained the attempt, which is the way a test of a difference
     * passes for the wrong reason.
     */
    expect(contained.state, 'three guards is `requiredResponderCount(6)`, so the attempt is contained').toBe('resolved');
    expect(contained.escaped).toBe(false);
    expect(contained.removedFromPrison, 'and nobody left the prison').toEqual([]);

    expect(gotOut.state, 'with nobody to dispatch it lapses at the response deadline').toBe('lapsed');
    expect(gotOut.escaped, 'and a lapsed escape attempt is ADR 0061 decision 5').toBe(true);
    expect(gotOut.removedFromPrison, 'the participant is handed to the departure port and is gone').toEqual([ESCAPER]);

    /*
     * #683 answered. The contained arm is unchanged -- the two rows it always
     * had -- and the escape arm now has a third between them, in the `danger`
     * band, naming the person the prison lost.
     *
     * The escape sentence is spelled out rather than compared against a
     * catalogue lookup, because a fixture that read the string out of the file
     * under test would pass for any string at all: this is the one assertion
     * whose subject is *what a player reads*, so it is written the way a player
     * reads it. It is the owner's wording, reproduced exactly.
     */
    expect(sentencesFor(contained.events), 'a contained attempt still says only that it started and that it ended').toEqual([
      'danger: A prisoner is trying to break out.',
      'info: The prison is under control again — no incident is still open.',
    ]);
    expect(sentencesFor(gotOut.events), 'and an escape says so, in the moment, with a name and a cause').toEqual([
      'danger: A prisoner is trying to break out.',
      'danger: Ada Bell broke out — no guard reached them in time.',
      'info: The prison is under control again — no incident is still open.',
    ]);
  });

  it('names them by entity id rather than saying nothing, when the session minted no name', () => {
    /*
     * The fallback `prisoners.relocated` already uses, on the same
     * `hud.regime.roster-unnamed` key and with no new copy authored for it: a
     * session wired without an identity registry mints nobody, and the
     * departure port then answers that somebody left without saying who. No
     * path in `src/` produces it -- `createNewSimulationRuntime` always wires a
     * registry -- which is why it is pinned rather than left to be discovered.
     *
     * It is also the assertion that would catch the `{name}` placeholder
     * surviving on the *unnamed* branch specifically, which the named case
     * above cannot.
     */
    const gotOut = runAttempt(0, () => ({}));
    expect(sentencesFor(gotOut.events).at(1)).toBe('danger: Prisoner 3 broke out — no guard reached them in time.');
  });

  it('says nothing when the departure did not happen', () => {
    /*
     * `releasePrisoner` answers `false` for an entity that is not a live
     * prisoner, and the port passes that on as `undefined`. The incident record
     * still reads `escaped: true` -- that is the incident's own finding and
     * this test does not touch it -- but the prison does not tell the player it
     * lost somebody it did not lose, which is the promise-the-code-does-not-keep
     * case `AGENTS.md` reserves to the owner.
     *
     * The `escaped` assertion is what stops this passing vacuously: without it
     * a fixture whose attempt never lapsed would also produce two rows.
     */
    const refused = runAttempt(0, () => undefined);
    expect(refused.escaped, 'the attempt still lapsed and the record still says so').toBe(true);
    expect(sentencesFor(refused.events), 'and the channel says only what it always said').toEqual([
      'danger: A prisoner is trying to break out.',
      'info: The prison is under control again — no incident is still open.',
    ]);
  });

  it('has the fact, in a read model with a route out of the worker and no panel on the end of it', () => {
    const contained = runAttempt(3);
    const gotOut = runAttempt(0);

    /*
     * The distinguishing fact was never missing from the simulation -- it was
     * missing from the screen, and the sentence above is the pixel it now
     * reaches. `projectIncidents` counts it per incident and in the summary,
     * and `hud/incidents` is catalogued and routed.
     *
     * **The panel is still unbuilt and this file does not build it.** The
     * band is the moment; the panel is the aftermath. That absence is asserted
     * where it belongs and not re-implemented here:
     * `tests/foundation/projection-reachability-contract.test.ts` names
     * `hud/incidents` in `UNPAINTED_PROJECTION_IDS` -- "No reader" -- and fails
     * in both directions, so the day a panel paints it that entry goes stale
     * and this comment is corrected by the same change.
     */
    expect(gotOut.escapesInProjection, 'the projection knows exactly who got out').toBe(1);
    expect(contained.escapesInProjection).toBe(0);
  });
});
