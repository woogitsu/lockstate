import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import type { StaffViewModel } from '../../src/simulation/presentation/staff-projection';
import { HUD_MESSAGE_KEY, describeStaffCoverage } from '../../src/ui/hud';
import type { ProjectionMessageChannel } from '../../src/ui/simulation-projections';
import { StaffCoverageReader, staffCoverageFromProjection } from '../../src/ui/simulation-staff-coverage';

/**
 * The translator between `hud/staff` and what the Staff panel's coverage block
 * renders, and the rule that decides what it says
 * ([ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md)
 * consequence 1).
 *
 * Three claims, different in kind.
 *
 * **That the mapping decides nothing the simulation decided.** The three
 * figures are the projection's own. In particular `shortage` is *carried* and
 * never recomputed: `projectStaff` sums the per-sector shortfalls, so a prison
 * with one sector over-staffed and another short has a real shortage that
 * `required - assigned` nets away to zero. The fixture below authors a case
 * where the two answers differ, which is the only way to tell a copy from a
 * subtraction.
 *
 * **That the three states are the three states.** `describeStaffCoverage` is
 * where "understaffed" and "unguarded" stop being the same sentence, and ADR
 * 0048 decision 5's ladder is why they are not: a prison missing amenities riots
 * *only if it is also unguarded*, so nobody-on-duty is the rung where one hire
 * changes the outcome rather than a worse shade of short.
 *
 * **That every key it can produce resolves to a real sentence with its
 * placeholder filled.** `tests/unit/ui-hud-messages.test.ts` proves each key
 * resolves; it calls every message without parameters, so a `{count}` left
 * unfilled by the panel's own branching is invisible to it. This file renders
 * each of the three sentences the way the panel renders it.
 */

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

/**
 * A `hud/staff` reply with the totals written out.
 *
 * `totals` is authored rather than summed from `coverage`, deliberately: a
 * fixture that derived it would be asserting that this test can add up, and the
 * production question is whether the *mapping* copies what the worker sent.
 */
function staffView(totals: { required: number; assigned: number; shortage: number }): StaffViewModel {
  return {
    schemaVersion: 1,
    roster: { total: 0, offset: 0, limit: 0, rows: [] },
    countsByRoleId: [],
    countsByDeploymentPhase: [],
    coverage: [],
    totals: { hired: 0, unassigned: 0, ...totals },
  } as unknown as StaffViewModel;
}

describe('the mapping carries three figures and computes none of them', () => {
  it('copies required, assigned and shortage off the projection’s own totals', () => {
    expect(staffCoverageFromProjection(staffView({ required: 2, assigned: 1, shortage: 1 }))).toEqual({
      required: 2,
      assigned: 1,
      shortage: 1,
    });
  });

  it('keeps the summed shortage rather than the difference, so two sectors cannot net out', () => {
    // One sector wants 1 and has 3; another wants 3 and has 1. Summed the
    // prison has 4 assigned against 4 required -- and it is still one guard
    // short somewhere, which is what `projectStaff` reports and what a
    // subtraction here would erase.
    const model = staffCoverageFromProjection(staffView({ required: 4, assigned: 4, shortage: 2 }));
    expect(model.shortage).toBe(2);
    expect(model.required - model.assigned).toBe(0);
    // And the readout says so, which is the half that reaches the player.
    expect(describeStaffCoverage(model).badgeKey).toBe(HUD_MESSAGE_KEY.securityCoverageShort);
  });
});

describe('the block says one of three things, and which one is a decision', () => {
  it('says the prison has what it asks for when nothing is short', () => {
    expect(describeStaffCoverage({ required: 2, assigned: 2, shortage: 0 })).toEqual({
      tone: 'success',
      badgeKey: HUD_MESSAGE_KEY.securityCoverageMet,
      hintKey: HUD_MESSAGE_KEY.securityCoverageMetHint,
      hireCount: 0,
    });
  });

  it('says understaffed, and how many more, when some of the requirement is met', () => {
    // The exact state a 12-bed prison holding 12 with one guard is in: the
    // requirement went to 2 at the ninth prisoner and one hire has answered it.
    expect(describeStaffCoverage({ required: 2, assigned: 1, shortage: 1 })).toEqual({
      tone: 'warning',
      badgeKey: HUD_MESSAGE_KEY.securityCoverageShort,
      hintKey: HUD_MESSAGE_KEY.securityCoverageShortHint,
      hireCount: 1,
    });
  });

  it('says unguarded, not understaffed, when nobody is on duty at all', () => {
    // ADR 0048 decision 5: a prison missing toilets, showers and a yard riots
    // *only if it is also unguarded*, so this is a different prison from the
    // one above rather than a worse one, and it gets a different word.
    expect(describeStaffCoverage({ required: 2, assigned: 0, shortage: 2 })).toEqual({
      tone: 'danger',
      badgeKey: HUD_MESSAGE_KEY.securityCoverageUnguarded,
      hintKey: HUD_MESSAGE_KEY.securityCoverageUnguardedHint,
      hireCount: 2,
    });
  });

  it('puts the boundary between unguarded and understaffed at the first assigned guard', () => {
    // One guard, in a prison that wants three, is understaffed and not
    // unguarded -- the boundary the tone rule turns on, asserted either side of
    // itself rather than only inside each band.
    expect(describeStaffCoverage({ required: 3, assigned: 0, shortage: 3 }).tone).toBe('danger');
    expect(describeStaffCoverage({ required: 3, assigned: 1, shortage: 2 }).tone).toBe('warning');
  });

  it('calls a prison that asks for nobody covered rather than unguarded', () => {
    // A `DeploymentSchedule` of zero is an *exemption* a save can carry (ADR
    // 0048 decision 3), not a small requirement. "Unguarded" would be a warning
    // about a prison the simulation is not asking anything of. Unreachable from
    // `applyDefaultSecuritySector`, which authors a floor of one.
    expect(describeStaffCoverage({ required: 0, assigned: 0, shortage: 0 }).tone).toBe('success');
  });
});

describe('every sentence the block can render is real text with its placeholders filled', () => {
  const render = (coverage: { required: number; assigned: number; shortage: number }): string => {
    const readout = describeStaffCoverage(coverage);
    return readout.hireCount > 0
      ? localizer.format(readout.hintKey, { count: localizer.formatNumber(readout.hireCount) })
      : localizer.format(readout.hintKey);
  };

  it('names the number of hires in the sentence a short prison reads', () => {
    const short = render({ required: 2, assigned: 1, shortage: 1 });
    expect(short).toContain('1');
    expect(short).not.toContain('{');
    expect(short).not.toBe(HUD_MESSAGE_KEY.securityCoverageShortHint);

    const unguarded = render({ required: 4, assigned: 0, shortage: 4 });
    expect(unguarded).toContain('4');
    expect(unguarded).not.toContain('{');
    expect(unguarded).not.toBe(HUD_MESSAGE_KEY.securityCoverageUnguardedHint);
  });

  it('leaves no placeholder in the covered sentence, which declares none', () => {
    const met = render({ required: 1, assigned: 1, shortage: 0 });
    expect(met).not.toContain('{');
    expect(met).not.toBe(HUD_MESSAGE_KEY.securityCoverageMetHint);
    expect(met.trim().length).toBeGreaterThan(0);
  });

  it('renders the header pair the way the panel renders it', () => {
    // `{assigned} of {required}` -- the shape `hud.status.occupancy-value`
    // already set for a figure against its ceiling.
    const summary = localizer.format(HUD_MESSAGE_KEY.securityCoverageSummary, {
      assigned: localizer.formatNumber(1),
      required: localizer.formatNumber(2),
    });
    expect(summary).toContain('1');
    expect(summary).toContain('2');
    expect(summary).not.toContain('{');
  });

  it('gives each of the three states a badge word, so the colour never stands alone', () => {
    const words = [
      HUD_MESSAGE_KEY.securityCoverageMet,
      HUD_MESSAGE_KEY.securityCoverageShort,
      HUD_MESSAGE_KEY.securityCoverageUnguarded,
    ].map((key) => localizer.format(key));
    for (const word of words) expect(word.trim().length).toBeGreaterThan(0);
    // Three words, not one word three times: a badge that read the same in
    // every state would be a colour standing alone after all.
    expect(new Set(words).size).toBe(3);
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

  public reply(index: number, view: StaffViewModel | undefined): void {
    if (this.handler === undefined) throw new Error('The reader registered no listener.');
    const replyTo = (this.sent[index] as { messageId: string }).messageId;
    this.handler({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `reply-${replyTo}`,
      replyTo,
      kind: 'simulation/projection',
      payload: {
        projectionId: 'hud/staff',
        tick: 949,
        page: { total: 0, offset: 0, limit: 0 },
        ...(view === undefined
          ? {}
          : {
              view: {
                transport: 'structured-clone' as const,
                schemaId: 'lockstate.hud-view-model.staff',
                schemaVersion: 1,
                data: view as never,
              },
            }),
      },
    } as WorkerToMainMessage);
  }
}

describe('the reader asks for the figures and none of the rows', () => {
  it('names hud/staff and a window of zero, because the block draws no roster row', async () => {
    const channel = new FakeChannel();
    const reader = new StaffCoverageReader(channel, { generateMessageId: () => 'req-1', replyTimeoutMs: 1_000 });
    // Caught rather than left floating: `dispose` rejects whatever is in
    // flight, which is the behaviour under test one file over and an unhandled
    // rejection here.
    const pending = reader.read().catch(() => undefined);

    expect(channel.sent).toEqual([
      {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'req-1',
        kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/staff', limit: 0 },
      },
    ]);
    reader.dispose();
    await pending;
  });

  it('answers with the totals a real reply carries', async () => {
    const channel = new FakeChannel();
    const reader = new StaffCoverageReader(channel, { generateMessageId: () => 'req-1', replyTimeoutMs: 1_000 });
    const pending = reader.read();
    channel.reply(0, staffView({ required: 2, assigned: 0, shortage: 2 }));
    await expect(pending).resolves.toEqual({ required: 2, assigned: 0, shortage: 2 });
    reader.dispose();
  });

  it('refuses to stack, so a cadence cannot queue a second question', async () => {
    // The rule every reader on this channel follows: `undefined` here is "a read
    // was already in flight", which the composition root must not paint.
    const channel = new FakeChannel();
    let next = 0;
    const reader = new StaffCoverageReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const first = reader.read();
    await expect(reader.read()).resolves.toBeUndefined();
    expect(channel.sent).toHaveLength(1);

    channel.reply(0, staffView({ required: 1, assigned: 1, shortage: 0 }));
    await expect(first).resolves.toEqual({ required: 1, assigned: 1, shortage: 0 });

    // And it is a latch rather than a one-shot: the next cadence asks again.
    const third = reader.read().catch(() => undefined);
    expect(channel.sent).toHaveLength(2);
    reader.dispose();
    await third;
  });

  it('answers undefined for a reply that carried no view, rather than inventing zeroes', async () => {
    // Zeroes would render as a green "Covered" over a prison nothing answered
    // for, which is the one thing a warning must never do.
    const channel = new FakeChannel();
    const reader = new StaffCoverageReader(channel, { generateMessageId: () => 'req-1', replyTimeoutMs: 1_000 });
    const pending = reader.read();
    channel.reply(0, undefined);
    await expect(pending).resolves.toBeUndefined();
    reader.dispose();
  });
});
