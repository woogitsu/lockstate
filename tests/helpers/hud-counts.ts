import type { WorkerToMainMessage } from '../../src/simulation/protocol/types';
import type { HudCountsViewModel } from '../../src/ui/hud/view-model';
import { hudCountsFromWorkerMessage } from '../../src/ui/simulation-counts';

/**
 * The row of figures a `simulation/status-counts` publication translates to,
 * failing the test if the translator said anything else.
 *
 * It exists because `hudCountsFromWorkerMessage` answers three things since
 * issue #1191 -- a row, `'none'` for a stopped session, and `undefined` for a
 * message that said nothing about the counts -- and a test that reads a figure
 * off a publication wants the first of those and has nothing to say about the
 * other two. Narrowing it here rather than with `!` in each caller keeps the
 * distinction the issue introduced: a suite that stops distinguishing them with
 * a non-null assertion is a suite that would pass again if the translator
 * started answering `'none'` for a running prison.
 */
export function reportedCounts(message: WorkerToMainMessage): HudCountsViewModel {
  const counts = hudCountsFromWorkerMessage(message);
  if (counts === undefined) {
    throw new Error('the production translator said nothing about a counts publication');
  }
  if (counts === 'none') {
    throw new Error('the production translator read this publication as a stopped session');
  }
  return counts;
}

/**
 * A prison reporting nothing: every required figure on `HudCountsViewModel`
 * published as a real `0`.
 *
 * **Not the empty view model's row, because there is no longer one** (issue
 * #1191). `EMPTY_HUD_VIEW_MODEL` used to carry a complete row of zeros for the
 * state before any prison had reported, and tests borrowed it whenever they
 * wanted a *reported* zero -- which is exactly the conflation that issue
 * closed. Absence is now absence; this is the other fact, and it has its own
 * name.
 */
export const ZEROED_COUNTS: HudCountsViewModel = {
  prisoners: 0,
  prisonerCapacity: 0,
  occupiedPlaces: 0,
  staff: 0,
  staffUnassigned: 0,
  rooms: 0,
  prisonersCovered: 0,
  prisonersUnderstaffed: 0,
  prisonersUnguarded: 0,
  prisonersHighRisk: 0,
  activeIncidents: 0,
  contrabandFound: 0,
  treasuryMinorUnits: 0,
  stateIncomeAccruedTodayMinorUnits: 0,
};
