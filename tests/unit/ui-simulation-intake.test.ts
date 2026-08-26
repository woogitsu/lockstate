import { describe, expect, it } from 'vitest';
import type { PrisonerPopulationCountsViewModel } from '../../src/simulation/presentation/prisoner-projection';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { IntakePipelineReader, intakePipelineFromProjection } from '../../src/ui/simulation-intake';
import type { ProjectionMessageChannel } from '../../src/ui/simulation-projections';

/**
 * The main thread's translator for the intake pipeline, proven with no worker
 * and no DOM.
 *
 * The fact this readout exists to carry is one the prison already knows and
 * nothing on screen said: an arrival that has been classified and is waiting
 * for a cell is *not* refused, it is queued behind a room that has no bed in it
 * yet (`src/simulation/prisoners/intake-system.ts`, ADR 0028 decision 8). The
 * strip counts that prisoner among the population, so the player sees a
 * number go up and nothing happen.
 *
 * Two claims are worth asserting here and they are different in kind. The pure
 * mapping is one: **which stages are still waiting, and which two are
 * terminal**, because collapsing those together is the readout saying that
 * somebody who can never be housed is merely being processed. The reader is the
 * other: `hud/prisoner-population` carries no list, so it must be asked for
 * with no window at all -- the worker refuses `offset`/`limit` on a projection
 * that has no page (`src/simulation/worker/projection-catalog.ts`).
 *
 * ## Why the expectations are written out
 *
 * Every stage id and every message key below is a literal. A fixture that
 * derived its expected keys with `deriveSimulationMessageKey` would supply both
 * sides of the comparison and hold for any implementation, including one that
 * labelled every row with the same key (#375's class of defect).
 */

/**
 * One prisoner in each of the six stages the projection always reports.
 *
 * `projectPrisonerPopulationCounts` emits all six in declared order whether or
 * not anybody is in them, which is the property the "drops empty stages" case
 * below is about -- the projection is deliberately not doing that filtering.
 */
const population = (
  counts: Partial<Record<string, number>> = {},
): PrisonerPopulationCountsViewModel => {
  const of = (stage: string, fallback: number): number => counts[stage] ?? fallback;
  const byIntakeStage = [
    { intakeStage: 'queued' as const, count: of('queued', 1) },
    { intakeStage: 'reception' as const, count: of('reception', 1) },
    { intakeStage: 'classification' as const, count: of('classification', 1) },
    { intakeStage: 'accommodation-assignment' as const, count: of('accommodation-assignment', 1) },
    { intakeStage: 'completed' as const, count: of('completed', 1) },
    { intakeStage: 'failed' as const, count: of('failed', 1) },
  ];
  return {
    total: byIntakeStage.reduce((sum, entry) => sum + entry.count, 0),
    byIntakeStage,
    byClassificationGroupId: [
      { classificationGroupId: 'general-population', count: 2 },
      { classificationGroupId: 'high-risk', count: 0 },
    ],
    unclassified: 3,
  };
};

describe('what the Intake panel is told about the pipeline', () => {
  it('counts the arrivals still moving through intake, and neither terminal stage among them', () => {
    // Six prisoners, one per stage: four are still in the pipeline, one is
    // admitted and one can never be housed. `waiting: 6` would be the readout
    // claiming the prison is processing people it has already finished with.
    const pipeline = intakePipelineFromProjection(population());
    expect(pipeline.waiting).toBe(4);
    expect(pipeline.failed).toBe(1);
    expect(pipeline.total).toBe(6);
  });

  it('names each waiting stage with a key derived from its own id', () => {
    const pipeline = intakePipelineFromProjection(population());
    expect(pipeline.stages).toEqual([
      { stageId: 'queued', labelKey: 'intake-stage.queued.name', count: 1 },
      { stageId: 'reception', labelKey: 'intake-stage.reception.name', count: 1 },
      { stageId: 'classification', labelKey: 'intake-stage.classification.name', count: 1 },
      { stageId: 'accommodation-assignment', labelKey: 'intake-stage.accommodation-assignment.name', count: 1 },
    ]);
  });

  it('drops the stages holding nobody, so a row does not appear and vanish', () => {
    // The projection reports all six stages whether or not anybody is in them.
    // A panel that rendered them all would carry four permanent lines saying
    // zero, which is how a readout becomes furniture a player stops reading.
    const pipeline = intakePipelineFromProjection(
      population({ queued: 0, reception: 0, classification: 0, 'accommodation-assignment': 3 }),
    );
    expect(pipeline.stages).toEqual([
      { stageId: 'accommodation-assignment', labelKey: 'intake-stage.accommodation-assignment.name', count: 3 },
    ]);
    expect(pipeline.waiting).toBe(3);
  });

  it('keeps the projection\'s declared stage order rather than sorting by size', () => {
    // Ascending pipeline order is the order an arrival passes through, so the
    // rows read as a progression. Sorting by count would put the same prison
    // in a different order on the next publication.
    const pipeline = intakePipelineFromProjection(
      population({ queued: 1, reception: 9, classification: 4, 'accommodation-assignment': 2 }),
    );
    expect(pipeline.stages.map((stage) => stage.stageId)).toEqual([
      'queued',
      'reception',
      'classification',
      'accommodation-assignment',
    ]);
  });

  it('reports terminal failures separately, because they are waiting for nothing', () => {
    // `'failed'` is terminal (ADR 0028 decision 8): no branch of the intake
    // stage machine matches it, so registering a cell later does not release
    // the prisoner. Counting it as "waiting" would promise a player that
    // building something will help.
    const pipeline = intakePipelineFromProjection(
      population({ queued: 0, reception: 0, classification: 0, 'accommodation-assignment': 0, completed: 4, failed: 2 }),
    );
    expect(pipeline).toEqual({ waiting: 0, failed: 2, total: 6, stages: [] });
  });

  it('says an empty prison is empty rather than saying nothing', () => {
    const pipeline = intakePipelineFromProjection({
      total: 0,
      byIntakeStage: [
        { intakeStage: 'queued', count: 0 },
        { intakeStage: 'reception', count: 0 },
        { intakeStage: 'classification', count: 0 },
        { intakeStage: 'accommodation-assignment', count: 0 },
        { intakeStage: 'completed', count: 0 },
        { intakeStage: 'failed', count: 0 },
      ],
      byClassificationGroupId: [],
      unclassified: 0,
    });
    expect(pipeline).toEqual({ waiting: 0, failed: 0, total: 0, stages: [] });
  });
});

class FakeChannel implements ProjectionMessageChannel {
  public readonly sent: MainToWorkerMessage[] = [];
  private handler: ((message: WorkerToMainMessage) => void) | undefined;

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.handler = handler;
  }

  public send(message: MainToWorkerMessage): void {
    this.sent.push(message);
  }

  public reply(index: number, view: PrisonerPopulationCountsViewModel): void {
    if (this.handler === undefined) throw new Error('The reader registered no listener.');
    const replyTo = (this.sent[index] as { messageId: string }).messageId;
    this.handler({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `reply-${replyTo}`,
      replyTo,
      kind: 'simulation/projection',
      payload: {
        projectionId: 'hud/prisoner-population',
        tick: 96,
        view: {
          transport: 'structured-clone',
          schemaId: 'lockstate.hud-view-model.prisoner-population',
          schemaVersion: 1,
          data: view as never,
        },
      },
    } as WorkerToMainMessage);
  }
}

describe('the reader that asks for the pipeline', () => {
  it('asks for the population projection with no window at all', async () => {
    /*
     * `hud/prisoner-population` is declared `paged: false`, and the worker
     * refuses a window on a projection that has no list rather than ignoring
     * one -- so an `offset` or a `limit` here is not a harmless extra field, it
     * is a request that comes back as `invalid-payload` and a readout that
     * never paints.
     */
    const channel = new FakeChannel();
    const reader = new IntakePipelineReader(channel, { generateMessageId: () => 'req-1' });

    const pending = reader.read();
    expect(channel.sent).toEqual([
      {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'req-1',
        kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/prisoner-population' },
      },
    ]);

    channel.reply(0, population({ queued: 0, reception: 0, classification: 0, 'accommodation-assignment': 2, completed: 0, failed: 0 }));
    await expect(pending).resolves.toEqual({
      waiting: 2,
      failed: 0,
      total: 2,
      stages: [
        { stageId: 'accommodation-assignment', labelKey: 'intake-stage.accommodation-assignment.name', count: 2 },
      ],
    });
  });

  it('refuses to stack a second question while the first is unanswered', async () => {
    /*
     * It is driven by the counts publication, which arrives up to twice a
     * second. A reader that queued one request per publication would build a
     * backlog against a busy worker, and every answer in it would be about a
     * prison several ticks stale.
     */
    const channel = new FakeChannel();
    let next = 0;
    const reader = new IntakePipelineReader(channel, { generateMessageId: () => `req-${String((next += 1))}` });

    const first = reader.read();
    // `undefined` is "already asking", not an answer -- a caller must leave
    // what is on screen alone rather than blanking it.
    await expect(reader.read()).resolves.toBeUndefined();
    expect(channel.sent).toHaveLength(1);

    channel.reply(0, population());
    await first;

    // And it asks again once the answer is in.
    const third = reader.read();
    expect(channel.sent).toHaveLength(2);
    channel.reply(1, population());
    await third;
  });

  it('rejects when it is disposed with a question outstanding, so the caller can take the block off', async () => {
    const channel = new FakeChannel();
    const reader = new IntakePipelineReader(channel, { generateMessageId: () => 'req-1', replyTimeoutMs: 20 });
    const pending = reader.read();
    reader.dispose();
    await expect(pending).rejects.toThrow();
  });
});
