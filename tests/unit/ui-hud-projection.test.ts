import { describe, expect, it } from 'vitest';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import {
  dayProgressPercent,
  displayDay,
  nextFastForwardSpeed,
  occupancyTone,
  projectStatusMetrics,
  refusalMessageKey,
  severityLabelKey,
  severityTone,
  summariseAlerts,
  transportPressedStates,
} from '../../src/ui/hud/projection';
import {
  EMPTY_HUD_VIEW_MODEL,
  UNKNOWN_HUD_CLOCK,
  type HudAlertViewModel,
  type HudClockViewModel,
  type HudCountsViewModel,
  type HudSeverity,
  type HudSpeed,
} from '../../src/ui/hud/view-model';
import { DEFAULT_BAR_SEGMENTS, filledSegments } from '../../src/ui/primitives/segmented-bar';

/**
 * The view-model → display mapping that decides what the HUD says.
 *
 * `status-strip.ts` builds its DOM by walking `projectStatusMetrics` and
 * these formatters and does nothing else, so proving the mapping here pins
 * everything the strip is told to show -- headlessly, in the default `node`
 * environment, exactly as `ui-save-panel-status.test.ts` does for the save
 * panel. It does not prove the DOM it builds: there is no DOM in this
 * environment and nothing here imports `status-strip.ts`, so the rendered
 * output is asserted in `tests/browser/ui-shell.spec.ts` instead.
 */

function clock(overrides: Partial<HudClockViewModel> = {}): HudClockViewModel {
  return { day: 1, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1, ...overrides };
}

function counts(overrides: Partial<HudCountsViewModel> = {}): HudCountsViewModel {
  return {
    prisoners: 0,
    prisonerCapacity: 0,
    staff: 0,
    rooms: 0,
    activeIncidents: 0,
    contrabandFound: 0,
    treasuryMinorUnits: 0,
    stateIncomeAccruedTodayMinorUnits: 0,
    ...overrides,
  };
}

describe('status strip: which metrics exist, in what order', () => {
  it('projects exactly the seven declared metrics, in a fixed order', () => {
    // Order is part of the contract: a HUD whose metrics move between builds
    // is one a player has to re-read every time. It was five until the
    // treasury balance joined them (#96), and six until #29's "earned today"
    // joined it. Each new chip goes on the **end**, so every metric a player
    // already knows keeps its position -- which is why `funds` is still sixth
    // rather than being pushed along by the figure that belongs beside it.
    expect(projectStatusMetrics(counts()).map((metric) => metric.id)).toEqual([
      'prisoners',
      'staff',
      'rooms',
      'incidents',
      'contraband',
      'funds',
      'earned-today',
    ]);
  });

  it('carries message keys, never text', () => {
    // ADR 0011: the view layer holds keys; a translated string never becomes
    // an identifier and never travels back toward the simulation.
    const labels = projectStatusMetrics(counts()).map((metric) => metric.labelKey);
    expect(labels).toEqual([
      HUD_MESSAGE_KEY.prisoners,
      HUD_MESSAGE_KEY.staff,
      HUD_MESSAGE_KEY.rooms,
      HUD_MESSAGE_KEY.incidents,
      HUD_MESSAGE_KEY.contraband,
      HUD_MESSAGE_KEY.funds,
      HUD_MESSAGE_KEY.earnedToday,
    ]);
    for (const label of labels) expect(label).toMatch(/^hud\.[a-z.-]+$/);
  });

  it('renders a balance and no budget, cost or income metric', () => {
    /*
     * This used to forbid every money word outright, because there was no
     * economy and a HUD slot is where a fake number starts. #96 built one, so
     * the rule narrows rather than being dropped: a **balance** the
     * simulation publishes may be shown; anything implying the half that does
     * not exist may not.
     *
     * **The sentence here used to be false and is kept in both directions.**
     * It read: *"Nothing credits or debits the treasury on a schedule -- no
     * income, no payroll, no running cost -- so a `budget`, a `cost` or a
     * `wage` on the strip would be a number no system produces."* The income
     * clause stopped being true at `4f711d5` (#311), which is the change that
     * added the `earned-today` metric this same file asserts on; the payroll
     * clause stopped being true with ADR 0042 step 3.
     *
     * What the assertion below still guards, and it is a real thing: the
     * simulation now publishes `dailyWageBillMinorUnits` and
     * `unpaidWagesMinorUnits` and **the strip renders neither**, so a money
     * word appearing here would be a metric with nothing behind it -- exactly
     * the failure the original rule was written for, arrived at from the
     * opposite side. `fund` is admitted only as the metric id and label key.
     */
    const metrics = projectStatusMetrics(counts({ prisoners: 12, treasuryMinorUnits: 24_920 }));
    const serialized = JSON.stringify(metrics);

    expect(serialized).not.toMatch(/money|budget|cash|currency|cost|price|income|wage|salary/i);

    const funds = metrics.find((metric) => metric.id === 'funds');
    expect(funds?.value, 'the balance is shown in the units the simulation holds it in').toBe(24_920);
    expect(funds?.capacity, 'a balance has no maximum to be a share of').toBeUndefined();
    expect(funds?.tone, 'a low-funds threshold would be a balance decision, and nothing pays in').toBeUndefined();
    expect(funds?.badge).toBeUndefined();
  });

  it('passes the counts through unchanged', () => {
    // Every figure distinct, and the accrual deliberately not a round
    // fraction of the balance: two chips carrying the same units are exactly
    // where a projection that read the wrong field would still look right.
    const metrics = projectStatusMetrics(
      counts({
        prisoners: 142,
        staff: 27,
        rooms: 61,
        contrabandFound: 8,
        treasuryMinorUnits: 24_920,
        stateIncomeAccruedTodayMinorUnits: 10_667,
      }),
    );
    expect(metrics.map((metric) => metric.value)).toEqual([142, 27, 61, 0, 8, 24_920, 10_667]);
  });
});

describe('status strip: tone and badges', () => {
  it('states the incident condition in words, so colour is never the only signal', () => {
    const clear = projectStatusMetrics(counts({ activeIncidents: 0 }))[3];
    expect(clear?.badge).toEqual({ tone: 'success', textKey: HUD_MESSAGE_KEY.incidentsClear });
    expect(clear?.tone).toBeUndefined();

    const active = projectStatusMetrics(counts({ activeIncidents: 3 }))[3];
    expect(active?.badge).toEqual({ tone: 'danger', textKey: HUD_MESSAGE_KEY.incidentsActive });
    expect(active?.tone).toBe('danger');
  });

  it('names the open incident kind on the badge when the worker could name one (issue #506 finding 2)', () => {
    // The whole point of this fix: a player can now tell a riot from an
    // assault from the badge word itself, not only from the count going 0 to
    // 1. `'incident-type.riot.name'` is the exact shape
    // `deriveSimulationMessageKey('incident-type', 'riot')` produces
    // (`src/content/simulation-message-keys.ts`), reused here as a plain
    // string so this file stays in `environment: 'node'` with no simulation
    // import.
    const riot = projectStatusMetrics(
      counts({ activeIncidents: 1, activeIncidentTypeLabelKey: 'incident-type.riot.name' }),
    )[3];
    expect(riot?.badge).toEqual({ tone: 'danger', textKey: 'incident-type.riot.name' });
    expect(riot?.tone).toBe('danger');

    // The count alone still cannot say more than one sector's worth of
    // incidents agree on a kind (ADR 0061 decision 6), and that case is
    // `activeIncidentTypeLabelKey` absent -- the strip falls back to the
    // generic wording the case above already covers, rather than guessing.
    const mixed = projectStatusMetrics(counts({ activeIncidents: 2 }))[3];
    expect(mixed?.badge).toEqual({ tone: 'danger', textKey: HUD_MESSAGE_KEY.incidentsActive });
  });

  it('marks confiscated contraband as a warning only once there is some', () => {
    expect(projectStatusMetrics(counts({ contrabandFound: 0 }))[4]?.tone).toBeUndefined();
    expect(projectStatusMetrics(counts({ contrabandFound: 1 }))[4]?.tone).toBe('warning');
  });

  it('omits the occupancy bar when capacity is unknown rather than guessing one', () => {
    expect(projectStatusMetrics(counts({ prisoners: 10, prisonerCapacity: 0 }))[0]?.capacity).toBeUndefined();
    expect(projectStatusMetrics(counts({ prisoners: 10, prisonerCapacity: 40 }))[0]?.capacity).toBe(40);
  });
});

describe('occupancyTone', () => {
  it.each([
    [0, 100, undefined],
    [89, 100, undefined],
    [90, 100, 'warning'],
    [100, 100, 'warning'],
    [101, 100, 'danger'],
  ])('%i of %i reads as %s', (prisoners, capacity, expected) => {
    expect(occupancyTone(prisoners, capacity)).toBe(expected);
  });

  it('has no opinion without a capacity', () => {
    // A status strip where several things are permanently amber teaches
    // players to ignore amber.
    expect(occupancyTone(50, 0)).toBeUndefined();
    expect(occupancyTone(50, Number.NaN)).toBeUndefined();
  });
});

describe('filledSegments', () => {
  it('lights one segment for any non-zero value, and never rounds it away', () => {
    // 1/180 rounds to zero segments. An empty bar would say "nothing here",
    // which is a different fact from "one".
    expect(filledSegments(1, 180)).toBe(1);
    expect(filledSegments(0, 180)).toBe(0);
  });

  it('fills completely at and above the maximum', () => {
    expect(filledSegments(180, 180)).toBe(DEFAULT_BAR_SEGMENTS);
    expect(filledSegments(500, 180)).toBe(DEFAULT_BAR_SEGMENTS);
  });

  it('scales in between', () => {
    expect(filledSegments(50, 100)).toBe(5);
    expect(filledSegments(51, 100)).toBe(6);
  });

  it('lights nothing for an unbounded or nonsensical maximum', () => {
    expect(filledSegments(5, 0)).toBe(0);
    expect(filledSegments(5, -1)).toBe(0);
    expect(filledSegments(Number.NaN, 100)).toBe(0);
    expect(filledSegments(5, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('respects a custom segment count', () => {
    expect(filledSegments(1, 4, 4)).toBe(1);
    expect(filledSegments(4, 4, 4)).toBe(4);
  });
});

describe('clock readout', () => {
  // `DAY_LENGTH_TICKS` at the time of writing. Spelled out rather than
  // imported: the HUD may not import the simulation, and the point of the
  // view model carrying `dayLengthTicks` is that this number is *not* baked
  // into the display layer. The cases below therefore use several lengths.
  const DAY = 2_400;

  it.each([
    [0, DAY, 0],
    [1, DAY, 0],
    [DAY / 4, DAY, 25],
    [DAY / 2, DAY, 50],
    [DAY - 1, DAY, 99],
    [50, 100, 50],
    [3, 8, 37],
  ])('tick %i of a %i-tick day is %i%% through it', (tickOfDay, dayLengthTicks, expected) => {
    expect(dayProgressPercent(tickOfDay, dayLengthTicks)).toBe(expected);
  });

  it('floors, so a day is never reported as over before it is', () => {
    // The same rule `BoundedValue.filled` follows: rounding would report
    // 99.6% of the way through day 3 as day 3 being finished, which is a
    // thing a player would act on.
    expect(dayProgressPercent(999, 1_000)).toBe(99);
    expect(dayProgressPercent(996, 1_000)).toBe(99);
  });

  it('reports the position as unknown when the day length is', () => {
    // `0` is what `UNKNOWN_HUD_CLOCK` carries: no session has reported a
    // clock, so there is no day to be part of the way through.
    expect(dayProgressPercent(0, 0)).toBeUndefined();
    expect(dayProgressPercent(120, 0)).toBeUndefined();
    expect(dayProgressPercent(120, -5)).toBeUndefined();
    expect(dayProgressPercent(Number.NaN, DAY)).toBeUndefined();
    expect(dayProgressPercent(0, Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('wraps rather than throwing on a position outside the day', () => {
    // A readout that lands one tick either side of the day boundary must
    // still render something.
    expect(dayProgressPercent(DAY, DAY)).toBe(0);
    expect(dayProgressPercent(DAY + DAY / 2, DAY)).toBe(50);
    expect(dayProgressPercent(-1, DAY)).toBe(99);
  });

  it('never claims a day number the simulation has not reported', () => {
    expect(displayDay(1)).toBe(1);
    expect(displayDay(12.7)).toBe(12);
    // `0` is the "no session" value, and it must not become "day 1": a
    // confident day counter for a prison that is not running is exactly the
    // kind of state-shaped decoration the HUD may not show.
    expect(displayDay(0)).toBeUndefined();
    expect(displayDay(-4)).toBeUndefined();
    expect(displayDay(Number.NaN)).toBeUndefined();
  });

  it('maps the no-session clock itself to nothing, day and position both', () => {
    // Deliberately fed from `UNKNOWN_HUD_CLOCK` rather than from literal
    // zeroes. The assertions above pin what the formatters do with `0`; this
    // one pins that the sentinel the HUD actually paints before any session
    // exists *is* one of those values. Asserting the sentinel against itself
    // would be tautological, and a sentinel changed to `day: 1` would then
    // reach the screen as "Day 1" for a prison that is not running, with the
    // browser suite as the only guard.
    expect(displayDay(UNKNOWN_HUD_CLOCK.day)).toBeUndefined();
    expect(dayProgressPercent(UNKNOWN_HUD_CLOCK.tickOfDay, UNKNOWN_HUD_CLOCK.dayLengthTicks)).toBeUndefined();

    // And the same for the view model a first paint uses, which is what
    // `src/main.ts` hands the HUD before the worker has answered.
    const empty = EMPTY_HUD_VIEW_MODEL.clock;
    expect(displayDay(empty.day)).toBeUndefined();
    expect(dayProgressPercent(empty.tickOfDay, empty.dayLengthTicks)).toBeUndefined();
    // And it reads as paused, so the transport does not show a simulation
    // that is running when none exists.
    expect(transportPressedStates(empty).pause).toBe(true);
  });
});

describe('transport controls', () => {
  it('shows exactly one control pressed, so the three read as a state', () => {
    const cases: readonly { mode: 'paused' | 'running'; speed: HudSpeed }[] = [
      { mode: 'paused', speed: 1 },
      { mode: 'paused', speed: 4 },
      { mode: 'running', speed: 1 },
      { mode: 'running', speed: 2 },
      { mode: 'running', speed: 4 },
    ];
    for (const { mode, speed } of cases) {
      const pressed = transportPressedStates(clock({ mode, speed }));
      expect(Object.values(pressed).filter(Boolean)).toHaveLength(1);
    }
  });

  it('pauses regardless of speed, and distinguishes normal speed from fast', () => {
    expect(transportPressedStates(clock({ mode: 'paused', speed: 4 })).pause).toBe(true);
    expect(transportPressedStates(clock({ mode: 'running', speed: 1 })).play).toBe(true);
    expect(transportPressedStates(clock({ mode: 'running', speed: 2 })).fastForward).toBe(true);
  });

  it('cycles fast-forward between the two fast speeds instead of dead-ending', () => {
    // Returning to x1 is what the play button is for, so no tap is ambiguous.
    expect(nextFastForwardSpeed(1)).toBe(2);
    expect(nextFastForwardSpeed(2)).toBe(4);
    expect(nextFastForwardSpeed(4)).toBe(2);
  });
});

describe('severity', () => {
  it('pairs every severity with both a tone and a word', () => {
    for (const severity of ['info', 'warning', 'danger'] as const) {
      expect(severityTone(severity)).toBeTruthy();
      expect(severityLabelKey(severity)).toMatch(/^hud\.severity\./);
    }
  });
});

/**
 * Issue #207: which refusals the player is told about, and which ones would
 * be a false statement on screen.
 *
 * The mapping is the whole decision. Every intent the HUD can dispatch is
 * enumerated here -- all eight `HudIntent` kinds, the five commands that
 * produce a message and the three chrome intents that must not -- rather than
 * only the ones that produce a message, so an intent added later fails this
 * test instead of silently landing in whichever half of the rule its
 * `default` case happens to be.
 */
describe('refusalMessageKey: what a refused control says', () => {
  it('names an outcome for each command, and five different ones', () => {
    // A command changes nothing locally, so a refusal means the prison is
    // exactly as it was and nothing on screen says so unless this does.
    const keys = [
      refusalMessageKey('set-clock'),
      refusalMessageKey('place-build-order'),
      refusalMessageKey('purchase-materials'),
      refusalMessageKey('undo'),
      refusalMessageKey('redo'),
    ];
    expect(keys).toEqual([
      HUD_MESSAGE_KEY.refusalSetClock,
      HUD_MESSAGE_KEY.refusalPlaceBuildOrder,
      HUD_MESSAGE_KEY.refusalPurchaseMaterials,
      HUD_MESSAGE_KEY.refusalUndo,
      HUD_MESSAGE_KEY.refusalRedo,
    ]);
    // Not one generic sentence: each of the five leaves the prison in a
    // different state, and two of them are not a button at all -- the undo
    // pair is the case where the player pressed a key (#261), so the line is
    // the whole report -- while a refused purchase is the one that is about
    // money (#89). "That was refused" without saying what would leave them
    // guessing whether their wall is still queued and whether they paid.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('says nothing about a chrome intent, which has already been applied', () => {
    // Selecting a tab, folding a panel and arming the build tool all happen
    // locally before the host is told. "That did not go through" about a tab
    // that visibly did is a false statement, and the host still gets the
    // failure through `onError`.
    for (const actionId of ['select-tab', 'toggle-panel', 'arm-build-tool']) {
      expect(refusalMessageKey(actionId), actionId).toBeUndefined();
    }
  });

  it('says nothing about an action it has never heard of', () => {
    expect(refusalMessageKey('teleport-prisoner')).toBeUndefined();
  });
});

/**
 * What the *folded* alerts header says for itself (issue #569).
 *
 * The defect this guards is not a wrong string, it is a sentence rendered into
 * a 0x0 box: a designation refused `zone.not-enclosed` put its explanation in
 * the DOM under a header reading `ALERTS` and nothing else, so the press read
 * to the player as a press that did nothing. The rendered box is asserted in
 * `tests/browser/ui-shell.spec.ts`, because only a browser has one. What is
 * provable here is the decision behind it, which is why it is a pure function
 * at all -- `hud.ts` never runs in this environment.
 */
describe('summariseAlerts: what a folded alerts header has to say', () => {
  const alert = (id: string, severity: HudSeverity): HudAlertViewModel => ({
    id,
    labelKey: 'hud.alerts.empty',
    severity,
  });

  it('says nothing at all when there is nothing to say', () => {
    // The half that keeps `INITIAL_HUD_SHELL_STATE`'s reason for folding
    // intact: a quiet prison must stay exactly as quiet as it was.
    expect(summariseAlerts([])).toBeUndefined();
  });

  it('counts every row, not the rows one severity happens to have', () => {
    const summary = summariseAlerts([alert('a', 'info'), alert('b', 'warning'), alert('c', 'info')]);
    expect(summary?.count).toBe(3);
  });

  it('reports the worst severity present, not the first and not the last', () => {
    // Ordered so that neither "first" nor "last" would give the right answer:
    // a badge that took either would say Info for a list holding a danger.
    const summary = summariseAlerts([alert('a', 'info'), alert('b', 'danger'), alert('c', 'info')]);
    expect(summary?.severity).toBe('danger');
    expect(summary?.tone).toBe(severityTone('danger'));
  });

  it('ranks warning above info and danger above warning', () => {
    expect(summariseAlerts([alert('a', 'info'), alert('b', 'warning')])?.severity).toBe('warning');
    expect(summariseAlerts([alert('a', 'warning'), alert('b', 'danger')])?.severity).toBe('danger');
  });

  it('carries the tone that matches the severity it reported', () => {
    // Not a re-derivation of the mapping: `severityTone` is the one place the
    // pairing is written, so asking it here is asking the same source the
    // rows in the list itself ask.
    for (const severity of ['info', 'warning', 'danger'] as const) {
      const summary = summariseAlerts([alert('only', severity)]);
      expect(summary?.tone).toBe(severityTone(severity));
    }
  });

  it('is the sentence the folded header actually has a key for', () => {
    // The badge text is `HUD_MESSAGE_KEY.alertsCount` with `{count}`, and that
    // key has to resolve in the bundled catalog or the header would carry a
    // raw identifier. `ui-hud-messages.test.ts` owns the catalog sweep; this
    // pins that the count this function returns is what fills it.
    expect(HUD_MESSAGE_KEY.alertsCount).toBe('hud.alerts.count');
    expect(summariseAlerts([alert('a', 'warning'), alert('b', 'warning')])?.count).toBe(2);
  });
});
