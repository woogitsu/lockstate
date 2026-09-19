import { describe, expect, it } from 'vitest';
import { NEED_IDS } from '../../src/simulation/prisoners/needs';
import {
  projectPrisonerDetail,
  projectPrisonerRoster,
  type PrisonerDetailViewModel,
} from '../../src/simulation/presentation/prisoner-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import {
  PRISONER_DETAIL_NEED_ROW_LIMIT,
  PRISONER_ROSTER_ROW_LIMIT,
  describeNeed,
  describePrisonerNeed,
  describePrisonerRow,
  formatPrisonerName,
  refusalMessageKey,
} from '../../src/ui/hud';
import { PrisonerDetailReader, prisonerDetailFromProjection } from '../../src/ui/simulation-prisoner-detail';
import { prisonerRosterFromProjection } from '../../src/ui/simulation-prisoner-roster';
import type { ProjectionMessageChannel } from '../../src/ui/simulation-projections';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What the inspector is told about one prisoner** (issue #895).
 *
 * Every view model here is produced by the **real** projection over a real
 * runtime, never hand-written -- the rule
 * `tests/unit/ui-simulation-room-needs.test.ts` states for its own subject and
 * the reason issue #451's weakest claim needed an integration test to settle:
 * a mapping asserted against a fixture of the shape the projection is *hoped*
 * to have proves only that the fixture and the assertion agree. So the six
 * needs below are the six `projectPrisonerDetail` really publishes, in the
 * order it publishes them, with the `unmetForStateIncome` flag it really
 * computed from `STATE_INCOME_UNMET_NEED_LEVEL`.
 *
 * The reader's three states are asserted against the real class over a fake
 * *channel*, which is the same split that file makes: the projection is real
 * because its shape is the claim, and the transport is faked because a worker
 * is not.
 */

/** Distinct from every other seed in the suite, so a shared fixture cannot make these figures true by accident. */
const SEED = 0x895;

/** `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, written out -- the tile an admission arrives at. */
const ORIGIN = { x: 16, y: 16 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * One walled cell with a bed in it, built through the real command path.
 *
 * A cell rather than nothing, because `AdmitPrisoner` is refused outright in a
 * prison with no accommodation a new arrival could ever occupy -- so a fixture
 * that skipped this would have no prisoner to inspect and would fail for a
 * reason that has nothing to do with this file.
 */
function prisonWithOneCell(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(
    runtime,
    'buy-plank',
    packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 120 }),
  );
  const rect = { x: 4, y: 6, width: 2, height: 3 };
  wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect }));
  submit(
    runtime,
    'bed',
    packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: rect.x, y: rect.y }),
  );
  // 100 ticks of delivery delay plus build progress; 400 is the margin every
  // other integration fixture in this suite admits after.
  stepTo(runtime, 400);
  return runtime;
}

/** The one prisoner's entity id, off the roster projection -- the only place the id a row carries comes from. */
function soleEntityId(runtime: SimulationRuntime): number {
  const page = projectPrisonerRoster(runtime.prisoners, { limit: PRISONER_ROSTER_ROW_LIMIT }, {
    identity: runtime.actorIdentity,
  });
  expect(page.rows).toHaveLength(1);
  return page.rows[0]!.entityId;
}

function detailOf(runtime: SimulationRuntime, entityId: number): PrisonerDetailViewModel {
  const view = projectPrisonerDetail(runtime.prisoners, entityId, { identity: runtime.actorIdentity });
  expect(view, 'the projection had nothing to say about a prisoner it just listed').toBeDefined();
  return view!;
}

/** A prison holding one settled prisoner: admitted, housed, and classified. */
function oneSettledPrisoner(): { readonly runtime: SimulationRuntime; readonly entityId: number } {
  const runtime = prisonWithOneCell();
  submit(
    runtime,
    'admit-1',
    packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ORIGIN }),
  );
  // Far enough past the admission for the intake pipeline to have run every
  // stage, so `classified` is true and the badge word is a risk tier rather
  // than an intake stage. Both cases matter and the other one is below.
  stepTo(runtime, 1_200);
  return { runtime, entityId: soleEntityId(runtime) };
}

describe('the six needs the inspector is handed', () => {
  it('pools exactly as many need lines as the simulation declares needs', () => {
    /*
     * The number spelled on both sides of `AGENTS.md` boundary 1, held
     * together here -- the shape `tests/unit/regime-need-bar.test.ts` uses for
     * `NEED_BAR_MAX_PERMILLE` and `tests/unit/ui-simulation-room-needs.test.ts`
     * uses for its comparator.
     *
     * `PRISONER_DETAIL_NEED_ROW_LIMIT` is a **pool** and not a window: the
     * projection publishes every need, always, so a seventh need would be
     * dropped by the panel rather than drawn. This is what fails on the commit
     * that declares one.
     */
    expect(PRISONER_DETAIL_NEED_ROW_LIMIT).toBe(NEED_IDS.length);
  });

  it('carries every need the projection published, in the projection\'s own order', () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const projected = detailOf(runtime, entityId);
    const view = prisonerDetailFromProjection(projected);

    // The order is the projection's, asserted against the simulation's own
    // declaration rather than against a list written here: a mapping that
    // sorted -- by level, say, which is what the roster's single column
    // effectively is -- would reorder the block under a player on any tick two
    // needs crossed, and would put a second definition of "which need is
    // worst" on the thread that owns none.
    expect(view.needs.map((need) => need.needId)).toEqual([...NEED_IDS]);
    expect(view.needs).toHaveLength(PRISONER_DETAIL_NEED_ROW_LIMIT);

    // Every figure and every flag is the projection's, and the word is derived
    // from the id rather than stored beside it.
    view.needs.forEach((need, index) => {
      const source = projected.needs[index]!;
      expect(need.needId).toBe(source.needId);
      expect(need.labelKey).toBe(`need.${source.needId}.name`);
      expect(need.permille).toBe(source.level.permille);
      expect(need.unmetForStateIncome).toBe(source.unmetForStateIncome);
    });
  });

  it('says the same thing about a need as a roster row does about the same need', () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const view = prisonerDetailFromProjection(detailOf(runtime, entityId));
    const row = prisonerRosterFromProjection(
      projectPrisonerRoster(runtime.prisoners, { limit: PRISONER_ROSTER_ROW_LIMIT }, {
        identity: runtime.actorIdentity,
      }),
    ).rows[0]!;

    // The roster's `lowestNeed` is one of the six the inspector carries -- the
    // projection picked which, and neither mapping recomputes it -- so the two
    // surfaces must agree about that need in every field. A second copy of
    // `prisonerNeed` is what this fails on.
    const same = view.needs.find((need) => need.needId === row.lowestNeed.needId);
    expect(same, `the inspector does not carry the need the row calls lowest (${row.lowestNeed.needId})`).toBeDefined();
    expect(same!.labelKey).toBe(row.lowestNeed.labelKey);
    expect(same!.unmetForStateIncome).toBe(row.lowestNeed.unmetForStateIncome);

    // And the tone rule is one rule: `describePrisonerNeed` is `describeNeed`
    // applied to the row's worst need, which is all it has ever been.
    expect(describeNeed(row.lowestNeed)).toEqual(describePrisonerNeed(row));
  });

  it('tones a need on the state\'s line and on nothing else', () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const view = prisonerDetailFromProjection(detailOf(runtime, entityId));

    // Not a threshold comparison: the flag is the projection's, computed from
    // `STATE_INCOME_UNMET_NEED_LEVEL` by the same predicate `unmetNeedCount`
    // sums to compute the money. This asserts that the panel reads it and
    // nothing more -- `warning` says the prison is losing money over this need,
    // which is the strongest claim the code keeps.
    for (const need of view.needs) {
      expect(describeNeed(need).tone).toBe(need.unmetForStateIncome ? 'warning' : 'neutral');
    }
  });
});

describe('who the inspector says the prisoner is', () => {
  it('names them the way the row above them does, through one formatter', () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const view = prisonerDetailFromProjection(detailOf(runtime, entityId));
    const row = prisonerRosterFromProjection(
      projectPrisonerRoster(runtime.prisoners, { limit: PRISONER_ROSTER_ROW_LIMIT }, {
        identity: runtime.actorIdentity,
      }),
    ).rows[0]!;

    expect(view.entityId).toBe(row.entityId);
    expect(view.name).toEqual(row.name);
    // The heading and the row's name are the same function of the same fields,
    // which is why the block needs no authored heading of its own. `t` is the
    // identity here on purpose: what is asserted is that one formatter answers
    // for both, not what the locale says.
    const t = (key: string, parameters?: Readonly<Record<string, string | number | boolean>>): string =>
      `${key}|${JSON.stringify(parameters ?? {})}`;
    expect(formatPrisonerName(t, view)).toBe(formatPrisonerName(t, row));
  });

  it('badges a classified prisoner exactly as the row does', () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const view = prisonerDetailFromProjection(detailOf(runtime, entityId));
    const row = prisonerRosterFromProjection(
      projectPrisonerRoster(runtime.prisoners, { limit: PRISONER_ROSTER_ROW_LIMIT }, {
        identity: runtime.actorIdentity,
      }),
    ).rows[0]!;

    // Non-vacuity: this prisoner really has been through classification, so the
    // word under test is a tier and not an intake stage.
    expect(view.standingLabelKey).toMatch(/^risk-tier\.\d+\.name$/);
    expect(view.riskTier).toBe(row.riskTier);
    expect(view.classificationGroupId).toBe(row.classificationGroupId);
    // One decision, two surfaces. A prisoner reading `High` in `warning` on the
    // row and `Medium` in `caution` in the block below it is what this fails
    // on -- `describePrisonerRow` takes both because neither is a subtype of
    // the other.
    expect(describePrisonerRow(view)).toEqual(describePrisonerRow(row));
    expect(view.standingLabelKey).toBe(row.standingLabelKey);
  });

  it('badges an arrival by its intake stage, because the tier it carries is a zero nobody wrote', () => {
    const runtime = prisonWithOneCell();
    submit(
      runtime,
      'admit-1',
      packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ORIGIN }),
    );
    // No further steps: the arrival is in the intake pipeline and
    // classification has not run, which is the state `classified: false` exists
    // for -- `riskTier` is still the zero a fresh record holds, and that decodes
    // as "Minimal".
    const entityId = soleEntityId(runtime);
    const projected = detailOf(runtime, entityId);
    expect(projected.classified, 'the fixture admitted a prisoner who is already classified').toBe(false);

    const view = prisonerDetailFromProjection(projected);
    expect(view.standingLabelKey).toBe(`intake-stage.${projected.intakeStage}.name`);
    expect(view.riskTier).toBeUndefined();
    expect(view.classificationGroupId).toBeUndefined();
    // `info`, which is what an unclassified row reads: the block and the row
    // agree here too, and this is the branch a second copy of the rule would
    // get wrong -- reading `riskTier` without the flag shows every queued
    // arrival as an assessed low-risk prisoner.
    expect(describePrisonerRow(view).tone).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

class FakeChannel implements ProjectionMessageChannel {
  public readonly sent: MainToWorkerMessage[] = [];
  private handler: ((message: WorkerToMainMessage) => void) | undefined;

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.handler = handler;
  }

  public send(message: MainToWorkerMessage): void {
    this.sent.push(message);
  }

  public deliver(message: WorkerToMainMessage): void {
    if (this.handler === undefined) throw new Error('The reader registered no listener.');
    this.handler(message);
  }

  public idOf(index: number): string {
    return (this.sent[index] as { messageId: string }).messageId;
  }

  public payloadOf(index: number): Record<string, unknown> {
    return (this.sent[index] as { payload: Record<string, unknown> }).payload;
  }
}

const reply = (replyTo: string, data: unknown): WorkerToMainMessage =>
  ({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `reply-${replyTo}`,
    replyTo,
    kind: 'simulation/projection',
    payload: {
      projectionId: 'hud/prisoner-detail',
      tick: 7,
      view: {
        transport: 'structured-clone' as const,
        schemaId: 'lockstate.hud-view-model.prisoner-detail',
        schemaVersion: 1,
        data,
      },
    },
  }) as WorkerToMainMessage;

/** A reply with no `view`: the prisoner is not in the prison any more. */
const releasedReply = (replyTo: string): WorkerToMainMessage =>
  ({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `reply-${replyTo}`,
    replyTo,
    kind: 'simulation/projection',
    payload: { projectionId: 'hud/prisoner-detail', tick: 7 },
  }) as WorkerToMainMessage;

/** Lets a test act after the request has been sent and before the reply is delivered. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('the reader that asks the worker about one prisoner', () => {
  it('asks by entity target, once, with no window of its own', async () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const channel = new FakeChannel();
    let next = 0;
    const reader = new PrisonerDetailReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read(entityId);
    await settle();

    expect(channel.sent).toHaveLength(1);
    // The shape the catalog declares for this route -- `target: 'entity'`, so
    // an id target or no target at all is refused as `invalid-payload` by the
    // worker. And no `offset`: the whole reason an id is a safe name for a
    // person where a roster offset is not.
    expect(channel.payloadOf(0)).toMatchObject({
      projectionId: 'hud/prisoner-detail',
      target: { kind: 'entity', entityId },
    });
    expect(channel.payloadOf(0)['offset']).toBeUndefined();
    expect(channel.payloadOf(0)['limit']).toBeUndefined();

    channel.deliver(reply(channel.idOf(0), detailOf(runtime, entityId)));
    const read = await pending;
    expect(read.kind).toBe('detail');
    expect(read.kind === 'detail' && read.detail.entityId).toBe(entityId);
    expect(read.kind === 'detail' && read.detail.needs).toHaveLength(NEED_IDS.length);
  });

  it('answers `released` for a prisoner the worker has nothing to say about', async () => {
    /*
     * The state this reader exists to distinguish, and the one
     * `RoomNeedsReader` deliberately does not: `projectPrisonerDetail` returns
     * nothing for exactly one reason, `!entityStore.isAlive(entityId)`, and
     * `PROJECTION_CATALOG` says so in terms -- "Absent, not an error: a
     * prisoner released between the click and the reply is a race the UI
     * handles, not a protocol fault."
     *
     * A reader that answered `undefined` here, as the room readout does for its
     * own raced room, would leave the host unable to tell it from a skipped
     * read -- so the host would go on asking the worker about a released
     * prisoner for as long as the tab stayed open, and the panel would never
     * forget the selection.
     */
    const channel = new FakeChannel();
    let next = 0;
    const reader = new PrisonerDetailReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read(4_096);
    await settle();
    channel.deliver(releasedReply(channel.idOf(0)));

    await expect(pending).resolves.toEqual({ kind: 'released' });
  });

  it('answers `busy` rather than stacking a second question about the same prisoner', async () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const channel = new FakeChannel();
    let next = 0;
    const reader = new PrisonerDetailReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const first = reader.read(entityId);
    await settle();
    // The cadence comes round again before the worker has answered. One
    // message, not two: `busy` is not an answer, so a caller must leave what is
    // on screen alone rather than blanking it.
    await expect(reader.read(entityId)).resolves.toEqual({ kind: 'busy' });
    expect(channel.sent).toHaveLength(1);

    channel.deliver(reply(channel.idOf(0), detailOf(runtime, entityId)));
    expect((await first).kind).toBe('detail');

    // And the guard is released, so the next refresh really does ask again.
    const second = reader.read(entityId);
    await settle();
    expect(channel.sent).toHaveLength(2);
    channel.deliver(reply(channel.idOf(1), detailOf(runtime, entityId)));
    expect((await second).kind).toBe('detail');
  });

  it('rejects rather than answering when the worker refuses the request', async () => {
    const channel = new FakeChannel();
    let next = 0;
    const reader = new PrisonerDetailReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read(1);
    await settle();
    channel.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'reply-error',
      replyTo: channel.idOf(0),
      kind: 'protocol/error',
      payload: { code: 'invalid-payload', message: 'no such target', recoverable: true },
    } as WorkerToMainMessage);

    // A refusal is not a third state: it rejects, exactly as every other reader
    // on this channel does, and the host's `catch` takes the block off. Making
    // it a `kind` would put "the worker refused" and "the prisoner is gone" on
    // the same footing, and only the second is a fact about the prison.
    await expect(pending).rejects.toThrow(/invalid-payload/);

    // And the in-flight guard is released by the `finally`, so a rejected read
    // does not wedge the reader shut.
    const after = reader.read(1);
    await settle();
    expect(channel.sent).toHaveLength(2);
    channel.deliver(releasedReply(channel.idOf(1)));
    await expect(after).resolves.toEqual({ kind: 'released' });
  });
});

describe('choosing a prisoner is chrome', () => {
  it('has no refusal sentence, because the panel has already applied it', () => {
    // The rule `refusalMessageKey`'s own header states: a chrome intent has
    // already happened locally before the host is told, so "that did not go
    // through" about a row that visibly became checked would be a false
    // statement on screen. The failure still reaches the host through
    // `MountHudOptions.onError`.
    expect(refusalMessageKey('select-prisoner')).toBeUndefined();
  });
});

describe('the sentence shown in the inspector (#958)', () => {
  it('forwards the deadline at the observed tick and counts down with simulation time', () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const detail = detailOf(runtime, entityId);
    const tick = runtime.kernel.tick;
    expect(detail.classified).toBe(true);
    expect(detail.sentence.endTick).toBeGreaterThan(tick + 2400);
    const first = prisonerDetailFromProjection(detail, tick);
    expect(first.remainingSentenceTicks).toBe(detail.sentence.endTick - tick);
    // Same authoritative tick, as on a paused refresh: no wall clock advances it.
    expect(prisonerDetailFromProjection(detail, tick).remainingSentenceTicks).toBe(first.remainingSentenceTicks);
    stepTo(runtime, tick + 2400);
    expect(prisonerDetailFromProjection(detailOf(runtime, entityId), runtime.kernel.tick).remainingSentenceTicks)
      .toBe(first.remainingSentenceTicks! - 2400);
  });

  it('does not turn an unclassified arrival or a wrapped deadline into a release forecast', () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const detail = detailOf(runtime, entityId);
    expect(prisonerDetailFromProjection({ ...detail, classified: false }, runtime.kernel.tick).remainingSentenceTicks)
      .toBeUndefined();
    expect(prisonerDetailFromProjection({
      ...detail, sentence: { ...detail.sentence, endTick: 10, lengthTicks: 0xffff_ffff },
    }, runtime.kernel.tick).remainingSentenceTicks).toBeUndefined();
    expect(prisonerDetailFromProjection(detail).remainingSentenceTicks).toBeUndefined();
  });

  it('reads the tick from the correlated reply, and keeps the released path', async () => {
    const { runtime, entityId } = oneSettledPrisoner();
    const detail = detailOf(runtime, entityId);
    const channel = new FakeChannel();
    const reader = new PrisonerDetailReader(channel, { generateMessageId: () => 'sentence', replyTimeoutMs: 1000 });
    const pending = reader.read(entityId);
    await settle();
    channel.deliver(reply(channel.idOf(0), detail));
    const result = await pending;
    expect(result.kind).toBe('detail');
    if (result.kind !== 'detail') throw new Error('Expected the selected prisoner.');
    expect(result.detail.remainingSentenceTicks).toBe(detail.sentence.endTick - 7);
    const after = reader.read(entityId);
    await settle();
    channel.deliver(releasedReply(channel.idOf(1)));
    await expect(after).resolves.toEqual({ kind: 'released' });
    reader.dispose();
  });
});

