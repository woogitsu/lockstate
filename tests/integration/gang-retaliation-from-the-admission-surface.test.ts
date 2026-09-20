import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTOR_QUIET_TICKS_AFTER_RETALIATION } from '../../src/simulation/incidents/trigger-system';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Does the sentence *"Two gangs are settling a score."* reach a player of
 * the game as it ships — not of a fixture built to reach it?**
 * (Issue [#979](https://github.com/woogitsu/lockstate/issues/979);
 * [ADR 0103](../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md),
 * accepted 2026-09-08, open question 5 answered 2026-09-09, open question 2
 * on 2026-09-10 and open question 6 on 2026-09-11.)
 *
 * ## The gap this closes, stated as the difference between two fixtures
 *
 * `tests/integration/gang-grudge-loop.test.ts` proves the whole chain runs,
 * and it admits with **`priorIncidents: 2`** — its own header says that is
 * "the one field that differs" and that the field is what puts an arrival in
 * reach of the high-risk floor at intake. **The game cannot send that value.**
 * `src/main.ts:1178` is `const ADMISSION_REQUEST = { priorIncidents: 0 } as const;`
 * and `:3432` passes `ADMISSION_REQUEST.priorIncidents` into the one
 * `AdmitPrisoner` command the interface builds, so every prisoner any player
 * has ever admitted arrived at `0`.
 *
 * `tests/integration/gang-membership-at-review.test.ts` does admit at `0`, and
 * stops at membership and release: no assault between its members, no grudge
 * and no retaliation. So between the two files the chain was proved in halves,
 * and **no test on this tree ran the whole of it from the admission the
 * interface actually makes**. That is issue #979's first acceptance criterion
 * read strictly — *"a session a player can start"* — and this file is it.
 *
 * ## Every figure here was read off a real run and written out
 *
 * Never computed from the code under test, which is the discipline
 * `incident-trigger-reachability.test.ts`, `gang-grudge-loop.test.ts` and
 * `gang-membership-at-review.test.ts` all use. They are properties of the
 * classification review cadence, `CROSS_GANG_ASSAULT_GRUDGE_WEIGHT`,
 * `retaliationThreshold` and `defaultGangIdForArrival` together; if any of
 * those moves these lines have to move and a reviewer has to see them.
 *
 * **No string is authored, edited or added by this file**, and none is needed:
 * `'hud.alert.event.incidents.gang-retaliation-opened'` already exists and
 * takes no parameters. What is asserted is the thing `AGENTS.md`'s fourth
 * reservation is about — that the incident the sentence describes has two
 * gangs in it and a participant list that is not empty at the moment the
 * sentence is put on the channel.
 */

const DAY = 2_400;
const ARRIVAL = { x: 16, y: 16 } as const;
/**
 * `priorIncidents: 0` is the whole point of this file: it is the only value
 * `src/main.ts`'s `ADMISSION_REQUEST` can send.
 */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;
const CELL_COUNT = 8;

/** Measured: the first classification review that writes `high-risk` in this prison. */
const FIRST_REVIEW_TICK = 48_000;
/** Measured on seed `0x0cc0`: the tick the first cross-gang grudge is written. */
const FIRST_GRUDGE_TICK = 53_261;
/** Measured on seed `0x0cc0`: the tick the first gang retaliation opens. */
const FIRST_RETALIATION_TICK = 55_700;

function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A bed-only prison with a single guard on post, built from nothing but
 * commands a player can send.
 *
 * The same neglected shape `risk-tier-neglect-reachability.test.ts` and
 * `gang-membership-at-review.test.ts` use, plus **one guard** — which is the
 * load-bearing difference and is measured rather than assumed in the last case
 * below: unguarded, this prison's population collapses before the review that
 * would make anybody a gang member matters.
 */
function buildPrison(seed: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  const cells = Array.from({ length: CELL_COUNT }, (_unused, index) => cellRect(index));

  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: CELL_COUNT }));
  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  cells.forEach((rect, index) => submit(runtime, `zone-c${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  cells.forEach((rect, index) =>
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y })),
  );

  stepTo(runtime, 1_000);
  submit(runtime, 'hire0', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  for (let index = 0; index < CELL_COUNT; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  // A refused command would make every figure below a measurement of a
  // different prison, so it is checked rather than assumed.
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

/**
 * **The prison of a given seed, carried forward to a given tick, built once.**
 *
 * Two of the three cases below want seed `0x0cc0` at
 * `FIRST_RETALIATION_TICK + 1`: the chain case walks there through its
 * checkpoints, and the alerts-channel case walked there again from nothing.
 * That second walk is 54,700 ticks of the same simulation for a reading --
 * the order of two entries in an append-only event log -- that the first
 * walk's runtime already holds. Measured on this tree, this file alone on an
 * idle four-core container, two runs each way: the alerts case **219ms /
 * 223ms before, 1ms after**, and the file's test time **1.24s / 1.22s before,
 * 1.02s / 1.04s after**.
 *
 * **It is a cache, not a coupling, and the `kernel.tick > tick` branch is what
 * makes that true.** Every caller states the tick it needs and gets a runtime
 * at exactly that tick. A caller that asks for an *earlier* tick than the
 * cached runtime has reached cannot be served by it -- a stepped kernel does
 * not go back -- so it gets a freshly built one instead. So each case still
 * passes on its own with `-t`, and still passes if the cases are reordered:
 * the chain case's checkpoint assertions at 48,000 cannot silently read a
 * runtime some other case had already carried past them. Checked rather than
 * argued: three runs under `--sequence.shuffle.tests`, all three orderings
 * green, including the two that put the alerts case ahead of the chain case.
 */
const PRISONS = new Map<number, SimulationRuntime>();

function advanced(seed: number, tick: number): SimulationRuntime {
  let runtime = PRISONS.get(seed);
  if (runtime === undefined || runtime.kernel.tick > tick) {
    runtime = buildPrison(seed);
    PRISONS.set(seed, runtime);
  }
  stepTo(runtime, tick);
  return runtime;
}

function incidentsOfType(runtime: SimulationRuntime, type: string): readonly { readonly startedAtTick: number; readonly severity: number; readonly participantIds: readonly number[] }[] {
  return runtime.incidents
    .all()
    .filter((incident) => incident.type === type)
    .slice()
    .sort((a, b) => a.startedAtTick - b.startedAtTick);
}

describe('a gang retaliation from the admission the interface actually makes (#979)', () => {
  /**
   * The chain in one run, with the tick of each link written out.
   *
   * Measured on seed `0x0cc0`: nobody is a gang member at intake, because
   * `priorIncidents: 0` cannot score the high-risk floor; entities 1 and 2
   * fight every 2,400 ticks from tick 11,350 and are the only two the
   * disciplinary record carries to tier 3; the review at 48,000 puts them in a
   * gang each, on entity-id parity; the first assault to *adjudicate* with both
   * of them in a gang writes the grudge at 53,261; and the retaliation opens at
   * 55,700.
   */
  it('reaches a gang retaliation at priorIncidents: 0, and the incident the sentence describes is not empty', () => {
    const runtime = advanced(0x0cc0, 1_000);

    // The two gangs exist from session creation and nobody is in one.
    expect(runtime.gangs.all().map((gang) => gang.id)).toEqual(['gang.alpha', 'gang.beta']);
    expect(runtime.gangs.membersOf('gang.alpha')).toEqual([]);
    expect(runtime.gangs.membersOf('gang.beta')).toEqual([]);

    // Assaults run for nineteen in-game hours' worth of ticks before anybody
    // is in a gang, and not one of them writes a grudge -- which is what makes
    // the write below about membership rather than about assaults.
    stepTo(runtime, FIRST_REVIEW_TICK - 1);
    expect(incidentsOfType(runtime, 'assault').length).toBeGreaterThan(0);
    expect(runtime.gangs.allGrudges()).toEqual([]);

    stepTo(runtime, FIRST_REVIEW_TICK);
    // **The two lines below swapped on 2026-09-19** and nothing else in this
    // case did. Under entity-id parity entity 2 was `gang.alpha` and entity 1
    // was `gang.beta`; under the amended rule the first prisoner to reach
    // `high-risk` takes the empty `gang.alpha` and the second takes the other.
    // The pair still straddles the two gangs -- on this seed it did so by luck
    // before and does so by construction now, which is the whole amendment.
    expect(runtime.gangs.membersOf('gang.alpha')).toEqual([1]);
    expect(runtime.gangs.membersOf('gang.beta')).toEqual([2]);
    // Both were admitted at the interface's `priorIncidents` and are high-risk
    // now: the tier came from what happened in the prison, not from the gate.
    for (const entityId of [1, 2]) {
      expect(runtime.prisoners.records.priorIncidentsAtIntake[entityId]).toBe(0);
      expect(runtime.prisoners.records.riskTier[entityId]).toBe(3);
    }

    stepTo(runtime, FIRST_GRUDGE_TICK);
    // Half weight each way, both directions -- ADR 0103 open question 2.
    expect(runtime.gangs.allGrudges()).toEqual([
      ['gang.alpha', 'gang.beta', 0.2],
      ['gang.beta', 'gang.alpha', 0.2],
    ]);

    // One tick past the recorded start: the incident is written during the
    // step that carries the kernel to 55,701, and `startedAtTick` is the tick
    // the sampling point belonged to.
    stepTo(runtime, FIRST_RETALIATION_TICK + 1);
    const retaliations = incidentsOfType(runtime, 'gang-retaliation');
    expect(retaliations).toHaveLength(1);
    expect(retaliations[0]!.startedAtTick).toBe(FIRST_RETALIATION_TICK);
    expect(retaliations[0]!.severity).toBe(6);

    // **This is the assertion `AGENTS.md`'s fourth reservation is about.** The
    // sentence `'Two gangs are settling a score.'` is put on the channel for
    // this incident, and the incident has a member of each gang in it.
    expect(retaliations[0]!.participantIds).toEqual([1, 2]);
    expect(runtime.gangs.getGangOf(retaliations[0]!.participantIds[0]!)).toBe('gang.alpha');
    expect(runtime.gangs.getGangOf(retaliations[0]!.participantIds[1]!)).toBe('gang.beta');
  });

  it('puts it on the alerts channel, after the assault it came from', () => {
    const runtime = advanced(0x0cc0, FIRST_RETALIATION_TICK + 1);

    const types = runtime.events.getSnapshot().records.map((record) => record.type);
    const assaultAt = types.indexOf('incidents.assault-opened');
    const retaliationAt = types.indexOf('incidents.gang-retaliation-opened');
    expect(retaliationAt, 'the retaliation alert must reach the channel').toBeGreaterThanOrEqual(0);
    expect(assaultAt).toBeGreaterThanOrEqual(0);
    expect(retaliationAt).toBeGreaterThan(assaultAt);
  });

  /**
   * **This case used to be the measured NEGATIVE, and the 2026-09-19 amendment
   * is what turned it round. Its old text is kept verbatim below, because it
   * is the defect that was fixed and a reader should see the finding rather
   * than the repair alone:**
   *
   * > `defaultGangIdForArrival` splits members on `entityId % 2`
   * > (`src/simulation/incidents/default-gangs.ts`), and in a prison of this
   * > shape the only prisoners who ever reach tier 3 are the ones who keep
   * > fighting each other. So whether a session can *ever* produce a
   * > retaliation is decided by the parity of two entity ids.
   * >
   * > Measured over 90 in-game days on seed `0x0cc3`, the same prison and the
   * > same commands: entities **1 and 5** are the pair, both odd, both in
   * > `gang.beta` — 85 assaults, **zero** grudges and **zero** retaliations,
   * > for the life of the prison.
   * >
   * > This is not asserted as desirable. It is asserted so that a change to
   * > the membership rule has to come past it.
   *
   * It came past it. The rule now fills the smaller gang, so the same pair —
   * still entities 1 and 5, still both odd, still the only two this prison
   * carries to tier 3 — lands one in each gang, and the same 85 assaults that
   * bought nothing now buy a retaliation. **Seed `0x0cc3` is one of the three
   * of twelve that could never meet this mechanism at all**; `0x0cc9` (0 and
   * 4) and `0x0cca` (4 and 6) are the other two, and all three retaliate now.
   *
   * **And it is asserted at a cadence rather than as a metronome.** Seven
   * retaliations in ninety in-game days, exactly 24,000 ticks apart, where the
   * seeds that did fire before fired thirty-four times at 4,800 — see
   * `DEFAULT_SECTOR_QUIET_TICKS_AFTER_RETALIATION`.
   */
  it('produces retaliations for a same-parity pair, which the parity split could not (#979, ruled 2026-09-19)', () => {
    const runtime = advanced(0x0cc3, 1_000 + 90 * DAY);

    const assaults = incidentsOfType(runtime, 'assault');
    expect(assaults.length).toBe(85);
    expect(new Set(assaults.map((assault) => assault.participantIds.join('/')))).toEqual(new Set(['1/5']));

    // The pair is unchanged and so is its parity: what changed is the rule
    // that reads it. Under `entityId % 2` both of these were `gang.beta`.
    expect(runtime.gangs.membersOf('gang.alpha')).toEqual([1]);
    expect(runtime.gangs.membersOf('gang.beta')).toEqual([5]);

    const retaliations = incidentsOfType(runtime, 'gang-retaliation');
    expect(retaliations.length).toBe(7); // was 0, for ever
    expect(retaliations[0]!.startedAtTick).toBe(55_700);

    // **The reservation-4 assertion, on every one of them rather than on the
    // first.** `'Two gangs are settling a score.'` is put on the channel for
    // each of these, and a retaliation with an empty participant list would
    // make that sentence false. Decision 4's guard is what refuses one; this
    // asserts the guard was never the thing that had to fire here.
    for (const retaliation of retaliations) {
      expect(retaliation.participantIds).toEqual([1, 5]);
    }

    // **The severities are the cost of the longer window and are asserted
    // rather than glossed.** The ledger goes on accruing through the quiet
    // period and `GangRegistry` clamps a grudge at 1, so the first retaliation
    // fires at the threshold (0.4, risk 0.6, severity 6) and every later one
    // fires off a saturated ledger (grudge 1, risk 1, severity 10). Before
    // 2026-09-19 all thirty-four on a firing seed were severity 6. Fewer and
    // harder is the trade the cadence change makes, and this line is where a
    // reviewer sees it.
    expect(retaliations.map((retaliation) => retaliation.severity)).toEqual([6, 10, 10, 10, 10, 10, 10]);

    // The cadence, asserted as the gap rather than as seven ticks.
    for (let index = 1; index < retaliations.length; index += 1) {
      expect(retaliations[index]!.startedAtTick - retaliations[index - 1]!.startedAtTick).toBe(
        DEFAULT_SECTOR_QUIET_TICKS_AFTER_RETALIATION,
      );
    }
    /*
     * The only test in this file that advances a whole simulated season, and
     * the only one with no headroom under the root config's 5 s default. It
     * costs 1,121 ms in this container against 533 ms and 1 ms for its two
     * siblings; CI's self-hosted runners have been measured at roughly four
     * times this container's wall clock under load, which puts it over.
     * It went over on run 35089456268 -- "Test timed out in 5000ms" at this
     * `it`, in a job whose other 5,359 tests passed and whose diff was one
     * regex in a foundation test. 30 s is the figure the neighbouring
     * integration files already use for a run of this length --
     * `contended-shower-fairness.test.ts` and `economy-loan-recovery.test.ts`
     * carry `}, 30_000)`, and the runs that advance further carry 60_000,
     * 120_000 and 300_000.
     *
     * **Re-measured 2026-09-18 after a top-up merge of `origin/main`, because
     * raising a budget is the wrong fix for a test that got slower rather than
     * one that was always long.** Three alternating runs of this test at the
     * branch's original base `54adc87c` and at the merged tree, same
     * container, same order: 1129/942/787 ms at the base against 965/988/796
     * ms merged. The two are the same measurement inside the container's own
     * noise, across some sixty intervening commits, so nothing regressed --
     * the cost is the 90 simulated days themselves, and the 5 s it exceeds is
     * a global default in `vitest.config.ts` chosen for tests that do not
     * advance a clock at all.
     *
     * **That pair did not span `adad4f08` (#1291, the #961 resident ceiling),
     * and re-measured across it the two are *not* the same number** -- which
     * is recorded here rather than left under the sentence above, because the
     * sentence above was true of the window it measured and is not true of
     * this one. Three alternating pairs, `eeda2e53` against the tree merged
     * with `23374859`, same container, same order, load average 28 because
     * nine other agents were running suites in it: 3372/2620/2831 ms before
     * against 4223/3972/3190 ms after -- means of 2941 and 3795, and the
     * later tree is the slower one in all three pairs.
     *
     * **That is a measurement and not a diagnosis.** The ceiling makes
     * `residentCapacity` a `min(sum, ceiling)` over every room and moves who
     * is housed, so more work per admitted prisoner is what the feature is;
     * nothing here establishes it as a defect, and the conclusion this comment
     * draws does not depend on which it is. What it depends on is that the
     * test does the same 90 simulated days it always did, and that at load
     * this container reports it at 2.6-4.2 s against a 5 s budget -- a
     * coin-flip rather than a margin. Measured the same afternoon on the same
     * container, five unrelated tests that also advance a clock lost that
     * coin-flip on `Test timed out in 5000ms` --
     * `tests/determinism/contended-scan-order.test.ts`,
     * `tests/integration/canteen-shape-hunger-comparison.test.ts`,
     * `tests/integration/contraband-search-duty.test.ts`,
     * `tests/integration/incident-trigger-reachability.test.ts` and
     * `tests/integration/risk-tier-neglect-reachability.test.ts` -- on a tree
     * that carries none of this branch's change, and passed when the load fell.
     * This file is one instance of that class; the class is the 5 s default,
     * and widening it is a decision about `vitest.config.ts` rather than about
     * this test.
     */
  }, 30_000);
});
