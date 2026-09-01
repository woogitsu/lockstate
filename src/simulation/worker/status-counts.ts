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
    // The system itself, for `payroll`'s reason below: the census is a live
    // read of the last provisioning walk, so a hire that changes a sector's
    // rung reaches the strip on the next publication without anything here
    // having to notice.
    coverage: runtime.safetyCoverage,
    incidents: runtime.incidents,
    searchSystem: runtime.searchSystem,
    // The evidence log, read-only, so the strip can say *what* was found and
    // not only how much (issue #703 ruling 3). `ConfiscationLedger` itself
    // rather than a captured copy, for `payroll`'s reason below: the answer is
    // a live read over the ledger, so a confiscation between two publications
    // changes it without anything here having to notice.
    confiscations: runtime.confiscations,
    treasury: runtime.treasury,
    // The system itself rather than a captured pair of numbers: the bill is a
    // live read over the roster, so a hire between two publications changes it
    // without anything here having to notice.
    payroll: runtime.payroll,
    // `JustInTimeMaterialsService` itself, for `payroll`'s reason immediately
    // above: `.lastReport` is a live getter, so a purchase or a shortfall
    // between two publications reaches `PrisonCondition`'s
    // `'construction.unfunded'` member without anything here having to
    // notice ([ADR 0087](../../../docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md)
    // decision 2).
    materialsFunding: runtime.justInTimeMaterials,
  }).counts;
}

/**
 * Whether two readouts say the same thing.
 *
 * **Every field of `SimulationStatusCounts` used to be a number, and this
 * comment said so outright.** Two are not, now: `activeIncidentType` (issue
 * #506 finding 2) is a stable id or absent, and `contrabandNameKey` (issue
 * #703 ruling 3) is a message key or absent. `!==` still compares both
 * correctly -- string/string, `undefined`/`undefined` and the mixed cases all
 * compare exactly as a change-detector needs. What the old sentence was
 * really claiming still holds and is the part worth keeping: there is no
 * nested object or array to miss, so comparing the keys of one payload
 * against the other's compares the whole of it.
 *
 * **That last clause was falsified the day `conditions` was added (ADR 0087
 * decision 2), and is corrected here rather than silently, per
 * `docs/AGENT_WORKFLOW.md` §4.** `conditions` is a fresh array on every call
 * to `projectStatusStrip` -- `computeStandingPrisonConditions` allocates one
 * every time, even when its contents are unchanged -- so `!==` on it compares
 * object identity and answers `true` (changed) on **every** publication a
 * treasury or a build queue happens to touch, whether or not any condition
 * actually started or stopped standing. That would have made a steady but
 * insolvent prison publish twice a second forever, exactly the cost this
 * function exists to avoid. `key === 'conditions'` is checked first and
 * compared by content (length, then each id in the canonical order both
 * arrays share); every other key keeps the plain `!==` the paragraph above
 * still argues for.
 *
 * **The sentence that stood here next, kept because it records what was
 * believed:** *"Both arguments come from `projectStatusCounts` within one
 * worker, so they always have the same key set."* Corrected 2026-08-31 (issue
 * #703 ruling 3): they do not, and have not since `activeIncidentType` became
 * optional. `.optional()` on this payload means *absent*, deliberately -- the
 * pulled `hud/status-strip` route rejects an explicit `undefined` value -- so
 * a readout that can name a kind and one that cannot differ by a whole key.
 * `conditions` does not reopen this question: `projectStatusStrip` always
 * produces it (see its own doc comment), so both arguments here always carry
 * the key, and only the wire schema admits its absence.
 *
 * The loop walks `left`, so a key present only in `right` was invisible to it.
 * Nothing reachable was mis-skipped -- both optional keys appear and disappear
 * only on a tick where a count beside them also moved, `activeIncidents` for
 * one and `contrabandDiscovered` for the other -- but "no caller can currently
 * reach it" is not the property a change-detector should rest on, so the key
 * counts are compared outright. `docs/AGENT_WORKFLOW.md` §3: fix the class,
 * not the instance.
 *
 * This is what makes a steady prison cost the boundary nothing: the
 * publication is skipped when nothing it reports has changed.
 */
export function statusCountsEqual(left: SimulationStatusCounts, right: SimulationStatusCounts): boolean {
  if (Object.keys(left).length !== Object.keys(right).length) return false;
  for (const key of Object.keys(left) as readonly (keyof SimulationStatusCounts)[]) {
    if (key === 'conditions') {
      const leftConditions = left.conditions ?? [];
      const rightConditions = right.conditions ?? [];
      if (leftConditions.length !== rightConditions.length) return false;
      for (let index = 0; index < leftConditions.length; index += 1) {
        if (leftConditions[index] !== rightConditions[index]) return false;
      }
      continue;
    }
    if (left[key] !== right[key]) return false;
  }
  return true;
}
