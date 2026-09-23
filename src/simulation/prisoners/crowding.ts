import { NEED_IDS, type NeedId } from './needs';
import { DEFAULT_ACCOMMODATION_POLICY, resolveAccommodationTargets, type AccommodationPolicy, type AccommodationTarget } from './intake-system';
import type { RoomInstance } from './room-instance-registry';

/**
 * **Crowding accelerates the decay of `safety` and `hygiene`** -- issue #586,
 * under the owner's ruling recorded on that issue on 2026-08-29.
 *
 * ## The ruling this implements, and its provenance
 *
 * Issue #586 put three instruments for punishing an over-full prison to the
 * owner: a *cliff* (pay only up to certified capacity), a *curve* (withhold
 * non-linearly above 100%), and the corpus's third position. The ruling,
 * posted on the issue under the heading *"OWNER RULING, 2026-08-29: no new tax
 * -- give the existing withhold something to read"*, chose the third:
 *
 * > *"Do not add a new overcrowding tax. The 40-withhold IS the tax. Give it
 * > something to read."*
 *
 * and stated what that means concretely: *"Crowding accelerates the decay of
 * the needs the 300/260/.../60 schedule already prices -- safety and hygiene
 * first -- so a packed prison loses income through the line the player is
 * already watching, rather than through a second line they have to learn."*
 * Both the cliff and the curve were declined **as instruments**.
 *
 * **The weaker provenance is recorded as such**, in the terms `AGENTS.md`
 * uses for its own entries: the quoted sentence is the design corpus's
 * (`docs/research/design-search-2026-08-29/README.md` quotes it as the
 * sharpest document's), and the comment recording the owner's choice of it
 * was written by an agent session and posted from the owner's account. It is
 * the same shape as the 2026-08-29 rulings on #585, #588/#599 and #589 that
 * this tree already builds on.
 *
 * **What the ruling authorises is the mechanism, not the values.** The two
 * slopes below are this repository's, chosen against the measurement in
 * `tests/integration/crowding-need-decay.test.ts` and argued at their
 * declaration.
 *
 * ## What "crowded" means here
 *
 * `population > accommodationCapacity`: more living prisoners than there are
 * places to sleep in the room types an arrival may be housed in. The
 * numerator is every prisoner the runtime holds -- the same set whose needs
 * `NeedsDecaySystem` decays and the same figure the status strip's
 * `PRISONERS` chip states -- and the denominator is
 * `accommodationCapacityOf` below, the same figure that chip's capacity bar is
 * drawn against. So the chip that turns red past capacity is, by construction,
 * the chip that says this term is running; the two cannot disagree about when
 * a prison is over-full.
 *
 * Prison-wide rather than per sector. The shipped topology is one derived
 * sector (ADR 0048 decision 1), and which sector a *room* is in is still a
 * proposal (ADR 0110), so a per-sector ratio would need a room-to-sector
 * mapping this tree has not accepted. Issue #586's own sources are split on
 * the grain (C35 is per sector; B1, B2, D2 and D35 are prison-wide), and the
 * prison-wide one is the one whose denominator the player can already read.
 *
 * **A prison with no accommodation at all is not crowded, it is unfurnished.**
 * `capacity === 0` gives no excess. That is
 * [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)'s
 * prison, which pays nobody -- the income line walks occupied places, and it
 * has none -- so the term would have no 40s to read there and could only add
 * incident pressure to the one prison that ADR exists to protect.
 *
 * ## Why decay, and why it needs no ramp of its own
 *
 * Issue #586 asks that *"the ramp should cross a day boundary rather than
 * apply instantly"*, and it asks it of the **cliff**: a payment clamp flips a
 * day's income on one admission. This term moves a *rate*, and a rate reaches
 * the income line only by integrating over time -- a covered prisoner at full
 * `safety` held at 150% occupancy takes 10,200 ticks, four and a quarter
 * in-game days, to reach `STATE_INCOME_UNMET_NEED_LEVEL`. The ramp is the
 * decay itself, so no day-boundary sample is kept and **nothing is
 * persisted**: the excess is a pure function of the entity store's liveness
 * and the room registry's derived capacities, both already in the save, and
 * `SAVE_SCHEMA_VERSION` does not move.
 *
 * No RNG stream and no clock (`docs/DETERMINISM.md`).
 */

/**
 * How far above capacity the prison is, in permille of capacity, clamped at
 * `CROWDING_EXCESS_CAP_PERMILLE`.
 *
 * `floor((population - capacity) * 1000 / capacity)`, integer arithmetic
 * only, so the same prison always reads the same excess on every platform.
 * `0` when the prison is at or under capacity and when it has no capacity at
 * all (see the module docblock for why an unfurnished prison is not crowded).
 */
export function crowdingExcessPermille(population: number, capacity: number): number {
  if (capacity <= 0 || population <= capacity) return 0;
  return Math.min(CROWDING_EXCESS_CAP_PERMILLE, Math.floor(((population - capacity) * 1000) / capacity));
}

/**
 * The excess at which the term stops growing: **1000 permille, twice the
 * prison's capacity.** Past that point every additional prisoner is already
 * an unhoused one in a prison that holds as many again as it has beds for,
 * and a rate that went on climbing would only drive the housed population's
 * two needs to zero faster than any response could be built -- the "arrears
 * spiral" issue #586 names as the accepted cost, with no floor under it.
 */
export const CROWDING_EXCESS_CAP_PERMILLE = 1000;

/**
 * **Extra decay, in stored units per tick (`NEED_SCALE` per level), at the
 * cap** -- the slope of the term. Authored in stored units rather than as a
 * multiplier of `NEED_DECAY_PER_TICK`, which is issue #978's first legal
 * shape: a factor times a scaled rate is not generally a whole number, and a
 * `Math.round` that silently cleared the difference would make the authored
 * and the executed rate differ with every test green. A slope in whole stored
 * units, floored at the excess actually reached, is whole by construction;
 * `tests/unit/prisoners-crowding.test.ts` pins that it is.
 *
 * Only the two needs the ruling names. The other four are untouched,
 * deliberately: `hunger`, `sleep` and `bladder` are served from the cell and
 * the canteen and crowding does not change how much of them a prisoner needs,
 * and `recreation` is the owner's *"the point"* half of #599 -- it is meant to
 * be slow.
 *
 * ## `safety`: 40 at the cap, which is 0.20 of a level per tick
 *
 * Chosen against the coverage ladder it has to be read beside, whose net
 * rates `SAFETY_COVERAGE_PROVISION_PER_TICK`'s docblock tabulates: a
 * `covered` prisoner gains 6 stored units a tick (+0.03), an `understaffed`
 * one loses 2 (-0.01), an `unguarded` one loses 10 (-0.05). At this slope,
 * with "full to unmet" the 40,800 stored units from `NEED_MAX` down to
 * `STATE_INCOME_UNMET_NEED_LEVEL`:
 *
 * | occupancy | extra | covered net | full to unmet, covered | understaffed | unguarded |
 * | --- | --- | --- | --- | --- | --- |
 * | 110% | 4 | +2 | never | 6,800 ticks (was 20,400) | 2,915 (was 4,080) |
 * | 115% | 6 | 0 | never | 5,100 | 2,550 |
 * | 125% | 10 | -4 | **10,200** (4.25 days) | 3,400 | 2,040 |
 * | 150% | 20 | -14 | 2,915 (1.2 days) | 1,855 | 1,360 |
 * | 200% | 40 | -34 | 1,200 (half a day) | 972 | 816 |
 *
 * So the rungs keep their order at every occupancy, and **full coverage
 * absorbs mild crowding and not heavy crowding**: a staffed prison can carry
 * about 115% of its beds without its paying prisoners' `safety` moving at
 * all, and past that it pays the `safety` 40 on every housed prisoner within
 * days however many guards it hires. That is the decision issue #586 says the
 * player should be making -- *"whether the next intake is worth its income
 * after the crowding cost"* -- with an emergency margin rather than a cliff at
 * 100%, which is what batch B1's `design (2)` asks for (*"over-capacity play
 * stays viable as an emergency option but becomes visibly and financially
 * painful"*). An understaffed prison feels it from the first unhoused
 * prisoner, which is right: the ladder already says that prison is short, and
 * crowding is what makes the shortfall cost sooner.
 *
 * **Why 40 and not the 20 this was first drafted at.** At 20 the covered
 * break-even sat at 130%, and the measurement
 * (`tests/integration/crowding-need-decay.test.ts`'s fixture, twelve beds,
 * fully staffed) showed sixteen prisoners -- 133% -- costing nothing over ten
 * in-game days. Batch D's D3 carries the one diagnostic the corpus offers
 * for this exact question: *"`O/K >= 1.25` sustained for three days with no
 * consequence means overcrowding is too cheap"*. At 40, 125% reaches the
 * unmet line in 10,200 ticks from full, which is that diagnostic's window
 * give or take a day, and 117% still costs nothing.
 *
 * ## `hygiene`: 8 at the cap, which is 0.04 of a level per tick
 *
 * `hygiene` decays at 4 stored units a tick and is restored in a shower room
 * (`action.shower`, and at a quarter of that rate by laundry work -- ADR 0054's
 * room-gated needs), so this is three times the base rate at 200% and one and
 * a half times it at 125%. It is the half of the term that a *guard* cannot
 * answer and a *shower room* can, which is the other thing issue #586 says an
 * over-full expansion should be judged by: *"a cell block without enough
 * toilets, showers or yard becomes a bad expansion"*. A slope matching
 * `safety`'s 40 would be eleven times the base rate at the cap and make
 * `hygiene` the whole of the term; 4 would add a quarter of the base rate at
 * 125%. Measured on the fixture named above, 8 moves `hygiene` for a minority
 * of a crowded prison rather than for all of it -- one to four of twelve
 * housed prisoners at the unmet line after ten days, where the uncrowded tree
 * had none or one -- so it is
 * the smaller half by design.
 *
 * A **directional default, not a committed balance decision**, in the sense
 * `DEFAULT_SECTOR_RISK_POLICY` uses the phrase.
 */
export const CROWDING_EXTRA_DECAY_SCALED_PER_TICK_AT_CAP: Readonly<Partial<Record<NeedId, number>>> = Object.freeze({
  safety: 40,
  hygiene: 8,
});

/**
 * The extra stored units per tick one need decays by at `excessPermille`:
 * `floor(slope * excess / CROWDING_EXCESS_CAP_PERMILLE)`, whole by
 * construction. `0` for every need the table does not name.
 */
export function crowdingExtraDecayScaledPerTick(needId: NeedId, excessPermille: number): number {
  const slope = CROWDING_EXTRA_DECAY_SCALED_PER_TICK_AT_CAP[needId];
  if (slope === undefined || excessPermille <= 0) return 0;
  return Math.floor((slope * Math.min(excessPermille, CROWDING_EXCESS_CAP_PERMILLE)) / CROWDING_EXCESS_CAP_PERMILLE);
}

/** The extra decay of every need at one excess, in `NEED_IDS` order -- what `NeedsDecaySystem` reads once per update rather than once per prisoner. */
export function crowdingExtraDecayTable(excessPermille: number): Readonly<Record<NeedId, number>> {
  if (excessPermille <= 0) return NO_CROWDING;
  const table = { ...NO_CROWDING };
  for (const needId of NEED_IDS) table[needId] = crowdingExtraDecayScaledPerTick(needId, excessPermille);
  return table;
}

/** Every need at zero, built once, so an uncrowded prison -- the ordinary case -- allocates nothing for this per update. */
const NO_CROWDING: Readonly<Record<NeedId, number>> = Object.freeze(
  Object.fromEntries(NEED_IDS.map((needId) => [needId, 0])) as Record<NeedId, number>,
);

/**
 * Whether the term is **running** at this population and capacity: some need
 * decays faster than it would in an uncrowded prison.
 *
 * Not `population > capacity`. The floor in `crowdingExtraDecayScaledPerTick`
 * means one prisoner over a large prison's capacity can produce an excess too
 * small to move either rate, and a readout that said the prison was paying for
 * crowding while nothing decayed faster would be a sentence the code does not
 * keep (`AGENTS.md` reservation 4). This is the predicate the status strip's
 * `'prisoners.overcrowded'` condition stands on, so the sentence and the
 * arithmetic are one test.
 */
export function isCrowdingAcceleratingDecay(population: number, capacity: number): boolean {
  const excess = crowdingExcessPermille(population, capacity);
  for (const needId of NEED_IDS) {
    if (crowdingExtraDecayScaledPerTick(needId, excess) > 0) return true;
  }
  return false;
}

/** What `accommodationCapacityOf` reads -- `RoomInstanceRegistry`, narrowed. */
export interface AccommodationCapacitySource {
  allByRoomCatalogId(roomCatalogId: string): readonly RoomInstance[];
}

/**
 * How many prisoners the prison has somewhere to sleep: the summed
 * `residentCapacity` of the room instances some arrival could be housed in
 * under `policy`, each instance counted once.
 *
 * **Moved here from `src/simulation/presentation/status-strip-projection.ts`**,
 * which now calls it, so the capacity the strip's `PRISONERS` chip is drawn
 * against and the capacity this term measures crowding against are one
 * function rather than two that could come to disagree.
 *
 * **The capability is checked, not assumed.** For the shipped policy it is
 * redundant -- `residentCapacity` is nonzero only when a `'sleep-surface'`
 * object stands in the room, so the two conditions coincide -- but a policy
 * naming any other capability would make them come apart, and the gate
 * `findAvailableResidence` applies is the capability one.
 *
 * **Instances are counted once.** Two targets may name one room type (under
 * different capability requirements), and a room with four beds is four
 * places however many ways a prisoner could be sent to it: each room type is
 * walked once, and an instance counts if any target naming that type accepts
 * it. That is the same answer the `Set` of instance ids this used to carry
 * gave, without building one per call.
 *
 * Deterministic: `allByRoomCatalogId` returns its cached ascending-instance-id
 * sort and the target list is authored. `O(accommodation instances)`, with no
 * allocation proportional to them.
 */
export function accommodationCapacityOf(
  roomInstances: AccommodationCapacitySource,
  policy: AccommodationPolicy = DEFAULT_ACCOMMODATION_POLICY,
): number {
  const targets = resolveAccommodationTargets(policy);
  let capacity = 0;

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const target = targets[targetIndex]!;
    // Only a room type that two targets name can have an instance counted
    // twice, so only that room type pays for the `Set`. Under the shipped
    // policy none does, and the walk is a plain sum -- which matters since
    // #586, because `NeedsDecaySystem` now asks this every ten ticks and a
    // prison of 5,000 has thousands of cells (`tests/perf/crowding-need-decay.perf.ts`).
    const sharedRoomType = targets.some(
      (other, otherIndex) => otherIndex !== targetIndex && other.roomCatalogId === target.roomCatalogId,
    );
    if (sharedRoomType && targets.findIndex((other) => other.roomCatalogId === target.roomCatalogId) !== targetIndex) {
      continue; // walked once, below, from the first target naming this room type
    }
    const namingThisRoomType = sharedRoomType ? targets.filter((other) => other.roomCatalogId === target.roomCatalogId) : [target];
    for (const instance of roomInstances.allByRoomCatalogId(target.roomCatalogId)) {
      // An instance is a place for an arrival if *any* target naming its room
      // type accepts it -- counted once however many do.
      if (namingThisRoomType.some((candidate) => acceptsInstance(candidate, instance))) capacity += instance.residentCapacity;
    }
  }

  return capacity;
}

function acceptsInstance(target: AccommodationTarget, instance: RoomInstance): boolean {
  return target.requiredObjectCapability === undefined || instance.objectCapabilities.includes(target.requiredObjectCapability);
}
