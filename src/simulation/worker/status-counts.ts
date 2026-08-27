import { projectStatusStrip } from '../presentation/status-strip-projection';
import type { SimulationStatusCounts } from '../protocol/types';
import type { SimulationRuntime } from '../runtime/new-session';

/**
 * The status-strip counts for a whole session runtime, ready to post.
 *
 * `src/simulation/presentation/` deliberately takes narrow, per-projection
 * source shapes so a test can drive one projection without standing up the
 * session graph. Something still has to know which registry of a real
 * `SimulationRuntime` answers which of those shapes, and that is worker-shell
 * knowledge rather than projection knowledge -- so it lives here, next to the
 * state machine that owns the runtime, and keeps ADR 0003 decision 12 ("the
 * worker adapter must remain thin") true of the state machine itself.
 *
 * `tick` is passed in rather than read off `runtime.kernel`, matching
 * `StatusStripSource.tick`: the caller decides which tick this readout is
 * about, and the same value is what stamps the message.
 *
 * **A read, and only a read.** `projectStatusStrip` is a pure function over
 * the registries it is handed (`docs/HUD_PROJECTIONS.md` contract 1); nothing
 * here calls the kernel, steps a system or writes to simulation state.
 * `tests/determinism/status-counts-publication.test.ts` is the executable
 * form of that claim.
 *
 * The projection's other two blocks -- `clock` and `regime` -- are computed
 * and dropped. They are where the projection's `BoundedValue`s live
 * (`dayProgress`, `blockProgress`), and this channel carries integers only.
 *
 * That used to be load-bearing for a reason that no longer exists: the two
 * fill rules disagreed for every small-but-nonzero value, so carrying
 * `filled` across this boundary would have settled an open product question
 * by accident (issue #123, item 1). It is settled -- `toBoundedValue` and
 * `filledSegments` implement one rule now, pinned by
 * `tests/unit/segment-fill-agreement.test.ts` -- so what keeps the blocks out
 * is ordinary scope, not correctness. The clock already reaches the HUD as a
 * tick position through `simulation/clock-state` and the HUD computes its own
 * day-progress figure from that (`src/ui/hud/projection.ts`), so nothing the
 * strip renders is missing. Whoever needs the regime blocks should widen this
 * channel rather than work around it.
 */
export function projectStatusCounts(runtime: SimulationRuntime, tick: number): SimulationStatusCounts {
  return projectStatusStrip({
    tick,
    // `PrisonerOperationsRuntime` owns the room-instance registry, so it
    // answers both the prisoner source and the room source.
    prisoners: runtime.prisoners,
    rooms: runtime.prisoners,
    // The policy object `IntakeSystem` itself holds, not a second default:
    // `accommodationCapacity` is the denominator the strip divides by, and a
    // session running a custom policy must not have the readout and the
    // housing rule disagree about which rooms are accommodation.
    accommodationPolicy: runtime.prisoners.accommodationPolicy,
    staff: runtime.securityGuards,
    incidents: runtime.incidents,
    searchSystem: runtime.searchSystem,
    treasury: runtime.treasury,
  }).counts;
}

/**
 * Whether two readouts say the same thing.
 *
 * Every field of `SimulationStatusCounts` is a number, so comparing the keys
 * of one against the other compares the whole payload -- there is no nested
 * object or array to miss. Both arguments come from `projectStatusCounts`
 * within one worker, so they always have the same key set.
 *
 * This is what makes a steady prison cost the boundary nothing: the
 * publication is skipped when nothing it reports has changed.
 */
export function statusCountsEqual(left: SimulationStatusCounts, right: SimulationStatusCounts): boolean {
  for (const key of Object.keys(left) as readonly (keyof SimulationStatusCounts)[]) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}
