import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import type { PrisonerPopulationCountsViewModel } from '../simulation/presentation/prisoner-projection';
import type { HudIntakePipelineViewModel, HudIntakeStageViewModel } from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads where the prison's arrivals are in intake, over the projection channel,
 * and turns it into what the Intake panel renders.
 *
 * ## The gap this closes
 *
 * The simulation has been able to answer this since #261: every prisoner record
 * carries an `intakeStage`, and `projectPrisonerPopulationCounts` has grouped
 * the live population by it -- for every one of the six stages, in declared
 * order, whether or not anybody is in them -- for as long as the read-model
 * layer has existed. Nothing under `src/ui/` asked. `hud/prisoner-population`
 * was one of the ten catalogued projections with a route out of the worker and
 * nobody on the end of it (`docs/HUD_PROJECTIONS.md` section 9), so the panel
 * that admits a prisoner could not say what became of them.
 *
 * What that costs a player is specific rather than cosmetic. An arrival waiting
 * at `accommodation-assignment` is **not** refused: `IntakeSystem` keeps the
 * stage and retries, and a cell with no bed in it derives `residentCapacity: 0`
 * so it houses nobody until an object lands in it (ADR 0028 decision 8). The
 * status strip counts that prisoner among the population all the while. So the
 * player pressed Admit, watched the number go up, watched nothing else happen,
 * and had nothing on screen that named the wait or what ends it.
 *
 * ## The seventh translator, and why it is a class
 *
 * It joins `simulation-clock.ts`, `simulation-counts.ts`, `simulation-alerts.ts`,
 * `simulation-zoning.ts`, `simulation-room-needs.ts` and
 * `simulation-build-queue.ts` outside `src/ui/hud/`, and it is here for the
 * reason they all are: the HUD imports nothing from `src/simulation/**`
 * (`AGENTS.md` boundary 1, enforced by `tests/unit/ui-hud-messages.test.ts`),
 * so a module that has to know both a projection's shape and a view model sits
 * outside it.
 *
 * A class rather than a function of a message, exactly like the last two: the
 * pipeline is a **pull**, correlated by `messageId` (ADR 0003 decision 2), so
 * this holds the requester that asks. The mapping is a pure function --
 * `intakePipelineFromProjection` -- so what the panel is told can be proven
 * with no worker, no channel and no DOM.
 *
 * ## What it caches, and what it must not
 *
 * Nothing, for the reason `SimulationProjectionRequester`'s own header gives: a
 * cache here is a second, stale copy of the prison on the thread that may not
 * hold one. Every `read()` is a fresh question and a caller that stops asking
 * costs the worker nothing -- which is what makes an `O(live entities)`
 * liveness scan affordable on a cadence while the Overview tab is showing, and
 * free at every other moment.
 */

/**
 * The stage vocabulary, taken from the read model rather than from the
 * simulation's own declaration.
 *
 * `IntakeStage` is declared in `src/simulation/prisoners/components.ts`, and
 * naming it from here would make this module's only simulation dependency a
 * *deep* one. The projection already carries the same union on the field this
 * module reads, so deriving it from the view-model shape keeps the dependency
 * exactly where every other translator's is -- on `src/simulation/presentation/`
 * -- while still failing to compile if a stage is renamed.
 */
type ProjectedIntakeStage = PrisonerPopulationCountsViewModel['byIntakeStage'][number]['intakeStage'];

/**
 * The two stages intake is finished with.
 *
 * Declared as what is **terminal** rather than as what is waiting, so that a
 * stage added to `INTAKE_STAGES` later is counted as in progress and appears on
 * the readout, rather than being silently dropped from both figures. Getting
 * that default the wrong way round is how a new stage would become invisible.
 *
 * `'completed'` is an admitted prisoner, who is the population the status strip
 * already counts. `'failed'` is terminal in the stronger sense -- no branch of
 * the stage machine matches it, so nothing the player builds afterwards
 * releases that arrival (ADR 0028 decision 8) -- which is why it is reported on
 * its own rather than added to `waiting`.
 */
const TERMINAL_INTAKE_STAGES: readonly ProjectedIntakeStage[] = ['completed', 'failed'];

/**
 * What the panel renders, from one projection reply.
 *
 * Pure, and it decides nothing the simulation decided: the counts are the
 * projection's, the order is the projection's declared pipeline order -- which
 * is the order an arrival passes through, so the rows read as a progression --
 * and the only things added are the classification of a stage as terminal or
 * not and the message key for its id.
 *
 * A stage holding nobody is dropped rather than carried as a zero. The
 * projection deliberately emits all six *"so a HUD row does not appear and
 * vanish"*, which is the right contract for a projection and the wrong one for
 * this panel: four permanent lines reading zero in a panel that exists because
 * there was no room for a second button is how a readout becomes furniture.
 */
export function intakePipelineFromProjection(view: PrisonerPopulationCountsViewModel): HudIntakePipelineViewModel {
  const stages: HudIntakeStageViewModel[] = [];
  let waiting = 0;
  let failed = 0;

  for (const entry of view.byIntakeStage) {
    if (TERMINAL_INTAKE_STAGES.includes(entry.intakeStage)) {
      // Of the two, only `failed` is reported here. `completed` is the admitted
      // population, and that figure is already on the status strip -- printing
      // it again in the panel that admits people would be two definitions of
      // one number, which is the drift every other readout here avoids.
      if (entry.intakeStage === 'failed') failed += entry.count;
      continue;
    }
    waiting += entry.count;
    if (entry.count <= 0) continue;
    stages.push({
      stageId: entry.intakeStage,
      // Derived, never hand-authored (ADR 0011): `intake-stage` in
      // `src/content/simulation-message-keys.ts` labels every member of
      // `INTAKE_STAGES`, and a second spelling of those six here would be the
      // one that goes stale when a stage is renamed.
      labelKey: deriveSimulationMessageKey('intake-stage', entry.intakeStage),
      count: entry.count,
    });
  }

  return { waiting, failed, total: view.total, stages };
}

export class IntakePipelineReader {
  private readonly requester: SimulationProjectionRequester;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  /**
   * **One message with no window on it**, whatever the population.
   *
   * `hud/prisoner-population` is declared `paged: false`, and the worker
   * refuses `offset`/`limit` on a projection that has no list rather than
   * ignoring them -- so a window here would not be a harmless extra field, it
   * would be an `invalid-payload` and a readout that never paints. It needs
   * none: the reply is six stage counts and two group counts whatever the
   * prison holds, which is the same property that makes the status counts
   * publishable (`docs/HUD_PROJECTIONS.md` contract 5).
   *
   * `undefined` while another read is in flight, exactly as `RoomNeedsReader`
   * and `BuildQueueReader` answer: a caller on a cadence must not queue a
   * second question about a prison it has not heard the answer for once, and
   * returning rather than throwing keeps that a non-event.
   */
  public async read(): Promise<HudIntakePipelineViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<PrisonerPopulationCountsViewModel>('hud/prisoner-population');
      if (reply.view === undefined) return undefined;
      return intakePipelineFromProjection(reply.view);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
