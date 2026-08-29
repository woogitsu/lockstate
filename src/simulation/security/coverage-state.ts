/**
 * **What a sector's guard coverage is, as one word** — the three-rung ladder
 * the Staff panel has read out since [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
 * consequence 1, lifted into the simulation because a second reader now needs
 * it (issue #588).
 *
 * `describeStaffCoverage` (`src/ui/hud/staff-panel.ts`) already decides these
 * three from `required`/`assigned`/`shortage` and argues the boundary at
 * length: *"a prison with nobody on duty is not a worse version of an
 * understaffed one; it is the rung where the cheapest possible action changes
 * the outcome, and it gets its own word."* Nothing here re-argues that. What
 * this module adds is that the same rung is now a **simulation** input —
 * `SafetyCoverageSystem` provisions the `safety` need from it — so the ladder
 * has to exist on the simulation side of the boundary as well.
 *
 * **It is a second copy and not a shared one, and that is a boundary
 * constraint rather than a choice.** `AGENTS.md` boundary 1 keeps
 * `src/ui/hud/**` from importing `src/simulation/**` at all, and
 * `tests/unit/ui-hud-messages.test.ts` enforces it, so the panel cannot call
 * this function and this function cannot call the panel's. What stands in for
 * a shared definition is
 * `tests/unit/security-coverage-state.test.ts`'s agreement case, which drives
 * both ladders over the same grid of `required`/`assigned`/`shortage` triples
 * and fails the day they disagree. A test that reads both is the only place
 * the two are allowed to meet.
 */
export const SECTOR_COVERAGE_STATES = ['covered', 'understaffed', 'unguarded'] as const;
export type SectorCoverageState = (typeof SECTOR_COVERAGE_STATES)[number];

/**
 * The rung `entry` sits on.
 *
 * The order of the tests is `describeStaffCoverage`'s own and is load-bearing:
 * "nobody on duty" is a **subset** of "short" rather than an alternative to
 * it, so it is asked first and the more specific answer wins.
 *
 * A sector that asks for nobody reads `covered`, which is the same answer the
 * panel gives and for the same reason: a `DeploymentSchedule` of zero is an
 * *exemption* a save can carry, and "this sector has the guards it asks for"
 * is true of a sector that asks for none. Since issue #533 that is also what
 * an **empty** sector reads, which matters here more than it does on the
 * panel: an empty sector has no occupant for `SafetyCoverageSystem` to
 * provision, so the answer is unobservable rather than generous.
 *
 * Structural over the three counts rather than over `(required, assigned)`,
 * because `shortage` is not always `required - assigned` at the call sites
 * that matter -- `HudStaffCoverageViewModel` carries a figure summed across
 * sectors -- and a function that recomputed it would answer a different
 * question from the one the panel answers.
 *
 * The parameter is a structural shape declared here rather than
 * `DeploymentSystem`'s `CoverageReportEntry`, so this module imports nothing
 * at all: `src/simulation/prisoners/needs.ts` reads the ladder, and it is a
 * leaf that the save codec and every needs fixture pull in. A `CoverageReportEntry`
 * satisfies it structurally, which `tests/unit/security-coverage-state.test.ts`
 * pins with a real report rather than a hand-built literal.
 */
export interface SectorCoverageCounts {
  readonly required: number;
  readonly assigned: number;
  readonly shortage: number;
}

export function resolveSectorCoverageState(entry: SectorCoverageCounts): SectorCoverageState {
  if (entry.required > 0 && entry.assigned <= 0) return 'unguarded';
  if (entry.shortage > 0) return 'understaffed';
  return 'covered';
}
