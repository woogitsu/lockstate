import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { STATE_INCOME_UNMET_NEED_LEVEL } from '../../src/simulation/economy/income';
import type { StaffViewModel } from '../../src/simulation/presentation/staff-projection';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import {
  NEED_DECAY_PER_TICK,
  NEED_MAX,
  SAFETY_COVERAGE_PROVISION_MULTIPLIER,
  SAFETY_COVERAGE_PROVISION_PER_TICK,
} from '../../src/simulation/prisoners/needs';
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
      consequenceKey: HUD_MESSAGE_KEY.securityCoverageUnguardedConsequence,
      hireCount: 2,
    });
  });

  it('says what the rung costs on the unguarded rung and on neither other', () => {
    // The owner's wording of 2026-09-03 is a *second* fact about one rung, not
    // a fourth state, so the assertion that carries it is which rungs have it.
    // `undefined` on the other two is the multiplier and not a choice about
    // emphasis -- the coupling test below is where that is nailed down.
    expect(describeStaffCoverage({ required: 2, assigned: 0, shortage: 2 }).consequenceKey).toBe(
      HUD_MESSAGE_KEY.securityCoverageUnguardedConsequence,
    );
    expect(describeStaffCoverage({ required: 2, assigned: 1, shortage: 1 }).consequenceKey).toBeUndefined();
    expect(describeStaffCoverage({ required: 2, assigned: 2, shortage: 0 }).consequenceKey).toBeUndefined();
    // And a prison that asks for nobody, which reads `covered` rather than
    // `unguarded` (ADR 0048 decision 3's exemption): it has no occupant for
    // `SafetyCoverageSystem` to fail to provision, so the sentence would be a
    // warning about a prison the simulation is asking nothing of.
    expect(describeStaffCoverage({ required: 0, assigned: 0, shortage: 0 }).consequenceKey).toBeUndefined();
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

  /**
   * **The sentence the top rung says, verbatim, and the assertion it is no
   * longer allowed to make** (issue
   * [#941](https://github.com/matmaxalez/lockstate/issues/941)).
   *
   * **The expectation this replaces, quoted rather than deleted**
   * (`docs/AGENT_WORKFLOW.md` §4): nothing in this repository pinned the
   * covered rung's *content* at all -- the test directly above asserts only
   * that it has no placeholder and is not a raw key, and it passed unchanged
   * across this fix. The sentence it passed against was *"This prison has the
   * guards it asks for."*, and that absence of any content assertion is what
   * #941 §4 means by nothing having caught it.
   *
   * Pinned verbatim, because the owner's release of `AGENTS.md` reservation 4
   * on 2026-09-04 buys the harmonising pass in exchange for every authored
   * string being findable: a test that matched loosely would let the words
   * drift out from under that promise.
   *
   * `not.toContain('asks for')` is the half that would go red on a
   * *restoration* rather than on a typo -- the old sentence's own phrase, which
   * is what made the requirement read as the whole bill. See
   * `tests/integration/staff-coverage-readout.test.ts` for the measurement: at
   * exactly the requirement the responder pool is empty, and the panel's
   * figures are identical to a prison one hire past it.
   *
   * ## Widened on 2026-09-05 (issue #989), and the sentence it pinned is kept
   *
   * **This pinned *"Only free guards answer incidents."*, and that sentence was
   * true.** What retired it is that the free pool has two consumers and it
   * named one: `SearchSystem` staffs a contraband sweep from the same
   * `claimableGuardIds`, so the prison #941 measured could not search either.
   * The rung now reads *"Incidents and searches need free guards."* -- both
   * duties, no number, no outcome. The clause-by-clause proof and the clamp it
   * was measured against are in `hud.security.coverage-met-hint`'s own entry.
   *
   * **`not.toContain('only')` is deliberately absent**, and the omission is
   * worth stating: the replacement drops that word, but a future wording that
   * carried it would not be wrong, so pinning its absence would be pinning a
   * preference rather than a truth. The two duty words below are the truth
   * condition -- the sentence enumerates, and
   * `tests/foundation/claimable-guard-pool-contract.test.ts` is what fails when
   * the enumeration goes stale.
   */
  it('says what a free guard is for, and no longer that the prison is finished hiring', () => {
    const met = render({ required: 3, assigned: 3, shortage: 0 });

    expect(met).toBe('Incidents and searches need free guards.');
    // Both duties that draw on the pool, named. The verbatim assertion above
    // already covers this; these two are what a reviewer reads as the *reason*
    // the sentence is this long, and they survive a reworded fix.
    expect(met.toLowerCase()).toContain('incidents');
    expect(met.toLowerCase()).toContain('searches');
    // The phrase the sentence #941 replaced turned on. A regression to it fails
    // here even if the assertion above were relaxed one day.
    expect(met).not.toContain('asks for');
    // It promises no outcome: `describeStaffCoverage`'s docblock refuses "a
    // riot is coming" on measured grounds, and PR #854 refused an owner's
    // wording that said guards stop incidents.
    expect(met.toLowerCase()).not.toContain('riot');
    expect(met.toLowerCase()).not.toContain('safe');

    // Three sentences for three prisons, not one sentence with three badges --
    // and this is what fails if the branch is repointed at another rung's hint.
    const sentences = [
      met,
      render({ required: 3, assigned: 2, shortage: 1 }),
      render({ required: 3, assigned: 0, shortage: 3 }),
    ];
    expect(new Set(sentences).size).toBe(3);
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

  it('renders the consequence sentence whole, and it declares no placeholder to leave unfilled', () => {
    const readout = describeStaffCoverage({ required: 1, assigned: 0, shortage: 1 });
    // Narrowed rather than asserted non-null: the field is optional and the
    // test above is what proves this rung has it.
    const key = readout.consequenceKey;
    expect(key).toBeDefined();
    if (key === undefined) return;

    const sentence = localizer.format(key);
    expect(sentence).not.toBe(key);
    expect(sentence).not.toContain('{');
    // The panel calls `t(consequenceKey)` with no parameters, so a placeholder
    // authored into this sentence later would reach the player as literal
    // braces. That is the failure this line catches, and it is the reason the
    // sentence is a separate key from the hint rather than a clause of it.
    expect(sentence.trim().length).toBeGreaterThan(0);
  });
});

/**
 * **The sentence is a claim about a constant, so the constant is what guards
 * it** -- the owner's wording of 2026-09-03, *"No guard is posted here, so
 * nobody in this sector is kept safe."*
 *
 * Everything above proves the panel *says* it on the right rung. Nothing above
 * would notice the day it stopped being **true**, and that day is a balance
 * pass away: `SAFETY_COVERAGE_PROVISION_PER_TICK`'s own docblock calls itself
 * "a directional default, not a committed balance decision" and names the four
 * values the rate could take. What must not survive such a pass silently is a
 * player-facing sentence promising something the simulation no longer does
 * (`AGENTS.md`, exclusion 4).
 *
 * So this block asserts the mechanic the sentence names, from the simulation's
 * own modules, and it is deliberately in the file that owns what the block
 * says rather than beside the constants: a test next to `needs.ts` would fail
 * with "the multiplier moved", which is a balance decision somebody may well
 * be making on purpose, while a test here fails with *"the sentence on the
 * Staff panel is now false"*, which is the consequence they need to be shown.
 *
 * The imports cross the HUD's boundary on purpose and are allowed to: it is
 * `src/ui/hud/**` that may not import `src/simulation/**`
 * (`AGENTS.md` boundary 1, pinned by `tests/unit/ui-hud-messages.test.ts`), and
 * a test that reads both ladders is exactly the place the two are permitted to
 * meet -- the same standing `src/simulation/security/coverage-state.ts` gives
 * `tests/unit/security-coverage-state.test.ts` in its own words.
 */
describe('the unguarded consequence sentence is still true of the simulation it describes', () => {
  it('is the one rung that provisions nothing, which is what "nobody ... is kept safe" asserts', () => {
    expect(
      SAFETY_COVERAGE_PROVISION_MULTIPLIER.unguarded,
      'hud.security.coverage-unguarded-consequence says nobody in an unguarded sector is kept safe; ' +
        'a non-zero multiplier here means somebody is, and the sentence has to change with it',
    ).toBe(0);

    // And that the *other* two rungs do provision, which is what makes the
    // sentence exclusive to this one rather than merely emphatic about it. A
    // ladder where every rung provisioned nothing would satisfy the line above
    // and make `describeStaffCoverage`'s silence on the other two wrong.
    expect(SAFETY_COVERAGE_PROVISION_MULTIPLIER.covered).toBeGreaterThan(0);
    expect(SAFETY_COVERAGE_PROVISION_MULTIPLIER.understaffed).toBeGreaterThan(0);
  });

  it('leaves the need draining, so provisioning nothing is a cost and not a plateau', () => {
    // `SafetyCoverageSystem` never subtracts; `NeedsDecaySystem` does, at this
    // rate, regardless of coverage. Without a positive decay "provisions
    // nothing" would mean "nothing happens", and the sentence would be
    // describing a prison where an empty post costs the player nothing at all.
    expect(NEED_DECAY_PER_TICK.safety).toBeGreaterThan(0);

    // The figure the locale entry's comment quotes, derived here rather than
    // copied: full to the level the state withholds against, at the net rate an
    // unguarded sector leaves.
    const netPerTick = NEED_DECAY_PER_TICK.safety - SAFETY_COVERAGE_PROVISION_PER_TICK * SAFETY_COVERAGE_PROVISION_MULTIPLIER.unguarded;
    expect((NEED_MAX - STATE_INCOME_UNMET_NEED_LEVEL) / netPerTick).toBe(4080);
  });

  it('finds no other provisioner of safety, which is what makes coverage the whole of the claim', () => {
    // `action.sleep` carried `safety: 0.2` and `action.yard-recreation` carried
    // `safety: 0.1`; both were removed by issue #588 precisely so that coverage
    // would be the only instrument. If either came back, a prisoner with a bed
    // in an unguarded sector would be kept safe by their bed and the sentence
    // would be false for them.
    const providers = DEFAULT_ACTIONS.filter((action) => (action.needEffectsPerTick.safety ?? 0) > 0).map((action) => action.id);
    expect(
      providers,
      'an action that restores safety is a second provisioner, and hud.security.coverage-unguarded-consequence ' +
        'claims there is none',
    ).toEqual([]);

    // The control: the filter is looking at a real catalogue with real need
    // effects in it, so the empty result above is a finding rather than a
    // mis-spelled field name.
    expect(DEFAULT_ACTIONS.length).toBeGreaterThan(0);
    expect(DEFAULT_ACTIONS.some((action) => Object.keys(action.needEffectsPerTick).length > 0)).toBe(true);
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

/**
 * **The reserve rung (ADR 0095 decision 1, accepted by the owner on
 * 2026-09-23)**: the mapping carries the two figures it is decided from, and
 * the three strings it renders are pinned verbatim in both shipped languages
 * so the record `AGENTS.md` reservation 4 owes the owner cannot drift from what
 * the game says. Why each clause is true is argued in the English locale entry
 * for `hud.security.coverage-stretched`.
 */
describe('the reserve rung between covered and understaffed', () => {
  const polish = new Localizer({ locale: 'pl', catalogs: [messageCatalogPl, defaultMessageCatalogEn] });

  it('copies spare and reserve off the projection’s totals, and leaves an absent reserve absent', () => {
    const withReserve = { ...staffView({ required: 2, assigned: 2, shortage: 0 }) };
    const totals = { ...withReserve.totals, spare: 1, reserve: 5 };
    expect(staffCoverageFromProjection({ ...withReserve, totals })).toEqual({
      required: 2,
      assigned: 2,
      shortage: 0,
      spare: 1,
      reserve: 5,
    });
    const withoutReserve = staffCoverageFromProjection({ ...withReserve, totals: { ...withReserve.totals, spare: 1 } });
    expect('reserve' in withoutReserve).toBe(false);
  });

  it('renders the badge, the hint with its count, and the chip description, verbatim in English', () => {
    const readout = describeStaffCoverage({ required: 2, assigned: 2, shortage: 0, spare: 0, reserve: 5 });
    expect(localizer.format(readout.badgeKey)).toBe('Stretched');
    expect(localizer.format(readout.hintKey, { count: localizer.formatNumber(readout.hireCount) })).toBe(
      'Hire 5 more to answer the worst riot.',
    );
    expect(localizer.format(HUD_MESSAGE_KEY.securityCoverageStretchedDescription)).toBe(
      'Every post is staffed, but too few guards are free to answer the worst riot.',
    );
  });

  it('renders the same three, verbatim in Polish', () => {
    const readout = describeStaffCoverage({ required: 2, assigned: 2, shortage: 0, spare: 4, reserve: 5 });
    expect(polish.format(readout.badgeKey)).toBe('Na styk');
    expect(polish.format(readout.hintKey, { count: polish.formatNumber(readout.hireCount) })).toBe(
      'Zatrudnij jeszcze 1, aby odpowiedzieć na najgorszy bunt.',
    );
    expect(polish.format(HUD_MESSAGE_KEY.securityCoverageStretchedDescription)).toBe(
      'Wszystkie posterunki są obsadzone, ale wolnych strażników jest za mało, by odpowiedzieć na najgorszy bunt.',
    );
  });

  it('gives the four rungs four badge words and four hints', () => {
    const rungs = [
      { required: 2, assigned: 2, shortage: 0, spare: 5, reserve: 5 },
      { required: 2, assigned: 2, shortage: 0, spare: 0, reserve: 5 },
      { required: 2, assigned: 1, shortage: 1, spare: 0, reserve: 5 },
      { required: 2, assigned: 0, shortage: 2, spare: 0, reserve: 5 },
    ].map((coverage) => describeStaffCoverage(coverage));
    expect(rungs.map((readout) => readout.badgeKey)).toEqual([
      HUD_MESSAGE_KEY.securityCoverageMet,
      HUD_MESSAGE_KEY.securityCoverageStretched,
      HUD_MESSAGE_KEY.securityCoverageShort,
      HUD_MESSAGE_KEY.securityCoverageUnguarded,
    ]);
    expect(new Set(rungs.map((readout) => localizer.format(readout.badgeKey))).size).toBe(4);
    expect(new Set(rungs.map((readout) => readout.hintKey)).size).toBe(4);
    expect(new Set(rungs.map((readout) => readout.tone))).toEqual(new Set(['success', 'caution', 'warning', 'danger']));
  });
});
