import { describe, expect, it } from 'vitest';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import { OVERVIEW_ROWS } from '../../src/ui/hud/overview-panel';
import { hudOverviewFromWorkerMessage } from '../../src/ui/simulation-counts';
import type { WorkerToMainMessage } from '../../src/simulation/protocol/types';
import type { HudOverviewViewModel } from '../../src/ui/hud/view-model';

/**
 * What the Overview section states, and -- the half issue #1183 exists for --
 * what it states before any prison has reported.
 *
 * The default Vitest environment is `node` and the project ships no DOM
 * library, so `createOverviewPanel` cannot be called from here; the rendered
 * claims belong to `tests/browser/**`. What is provable here is the pair of
 * decisions that would be wrong in ways a screenshot would not show: which
 * published figure each row reads, and whether "no prison is reporting"
 * and "a prison reporting zero" can arrive as the same value.
 */

const readout: HudOverviewViewModel = {
  treasuryMinorUnits: 24_920,
  stateIncomeAccruedTodayMinorUnits: 10_667,
  dailyWageBillMinorUnits: 4_800,
};

/** A status-counts payload, filled with figures no two of which are equal. */
function statusCounts(overrides: Partial<Record<string, number>> = {}): WorkerToMainMessage {
  const counts = {
    prisoners: 142,
    prisonersInIntake: 3,
    prisonersHighRisk: 0,
    prisonersCovered: 100,
    prisonersUnderstaffed: 27,
    prisonersUnguarded: 15,
    rooms: 4,
    roomCapacity: 61,
    accommodationCapacity: 27,
    roomOccupants: 25,
    staff: 61,
    staffUnassigned: 2,
    activeIncidents: 0,
    contrabandFound: 0,
    treasuryMinorUnits: 24_920,
    treasuryOverdraftFloorMinorUnits: -2_500,
    stateIncomeAccruedTodayMinorUnits: 10_667,
    dailyWageBillMinorUnits: 4_800,
    ...overrides,
  };
  return { kind: 'simulation/status-counts', payload: { counts } } as unknown as WorkerToMainMessage;
}

describe('the Overview readout is made of published figures and nothing else', () => {
  it('reads each row off its own field, so no two rows can state the same number', () => {
    // Three distinct values in the fixture and three distinct reads: a row
    // wired to the wrong field shows up here, where a row wired to a computed
    // value could not exist at all -- `OVERVIEW_ROWS` takes readers over
    // `HudOverviewViewModel`, which carries no input to compute from.
    expect(OVERVIEW_ROWS.map((row) => [row.id, row.read(readout)])).toEqual([
      ['funds', 24_920],
      ['earned-today', 10_667],
      ['wages', 4_800],
    ]);
  });

  it('labels the two figures the status strip also shows with the strip\'s own words', () => {
    // Naming consistency, asserted rather than commented: one published number
    // under two different words on one screen is the split this reuse exists
    // to prevent.
    expect(OVERVIEW_ROWS.map((row) => row.labelKey)).toEqual([
      HUD_MESSAGE_KEY.funds,
      HUD_MESSAGE_KEY.earnedToday,
      HUD_MESSAGE_KEY.overviewWages,
    ]);
    for (const row of OVERVIEW_ROWS) {
      expect(defaultMessageCatalogEn.messages[row.labelKey], `${row.labelKey} resolves to nothing`).toBeDefined();
    }
  });
});

describe('empty cannot mean two things here (#1183, and #1184 is the counter-example)', () => {
  it('answers a readout for a publication', () => {
    expect(hudOverviewFromWorkerMessage(statusCounts())).toEqual(readout);
  });

  it('answers a readout of real zeros for a prison that reports zeros', () => {
    // The state a sentinel must not be confusable with: a prison that has
    // spoken and has nothing. It gets figures, not the sentence.
    expect(
      hudOverviewFromWorkerMessage(
        statusCounts({ treasuryMinorUnits: 0, stateIncomeAccruedTodayMinorUnits: 0, dailyWageBillMinorUnits: 0 }),
      ),
    ).toEqual({ treasuryMinorUnits: 0, stateIncomeAccruedTodayMinorUnits: 0, dailyWageBillMinorUnits: 0 });
  });

  it('answers `none` for a stopped session, rather than the empty prison the counts answer with', () => {
    const stopped = { kind: 'simulation/stopped', payload: {} } as unknown as WorkerToMainMessage;
    expect(hudOverviewFromWorkerMessage(stopped)).toBe('none');
  });

  it('answers nothing at all for a message that said nothing about the prison', () => {
    // `undefined` is "leave the field exactly as it was", which is what keeps a
    // clock heartbeat from blanking the readout twice a second.
    const clock = { kind: 'simulation/clock', payload: {} } as unknown as WorkerToMainMessage;
    expect(hudOverviewFromWorkerMessage(clock)).toBeUndefined();
  });
});
