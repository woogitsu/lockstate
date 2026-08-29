import type { NeedId } from './needs';
import type { ActionCategory } from './regime';

export type ActionTarget =
  | { readonly kind: 'own-accommodation' }
  | { readonly kind: 'room-catalog-id'; readonly roomCatalogId: string };

export interface ActionDefinition {
  readonly id: string;
  readonly category: ActionCategory;
  /** Level gained per tick while performing (see action-system.ts) -- data, not a per-action if-chain. */
  readonly needEffectsPerTick: Partial<Record<NeedId, number>>;
  readonly target: ActionTarget;
  /**
   * Room instance must have an object with this capability tag
   * (src/content/object-catalog.ts), and since issue #326 it is also **the
   * ceiling the room admits this action against**: the summed footprint width
   * of the objects in the room carrying this capability, and nothing else's.
   *
   * **Absent means any instance of the target room type qualifies, and the
   * ceiling comes from the room's own ground rather than from its objects** --
   * so a `room-catalog-id` action leaves this out only when the room really is
   * bounded by space and not by furniture. `room.yard` is the one such room in
   * `src/content/room-catalog.ts`: it requires no object at all.
   * `action.common-room-recreation` and `action.classroom-education` had this
   * absent too and were not such rooms -- `room.common-room` requires two
   * benches and `room.classroom` a bookshelf and four chairs -- so they now
   * name the capability those objects already carried.
   *
   * **Both previous readings of "absent" are kept rather than overwritten**,
   * because each was right about what it denied. Before issue #326 the
   * object-footprint rule applied to an objectless room and read as a ceiling
   * of **zero**, admitting nobody to 64 tiles of open ground. #326 replaced
   * that with **no ceiling at all**, and this docblock said so: *"no
   * object-derived ceiling applies ... the room really is unbounded by
   * furniture."* Still true of objects, and issue #532 measured what it meant
   * for people -- see `RoomInstanceRegistry.concurrentUseCapacityFor`.
   */
  readonly requiredObjectCapability?: string;
  readonly minDurationTicks: number;
}

/**
 * Representative candidate-action set (issue #24) spanning every core
 * need and regime category. Deliberately small and data-driven -- adding
 * a new action is one more entry here, never a new branch in
 * utility-ai.ts or action-system.ts.
 *
 * ## Append. Never insert, never reorder, never rename.
 *
 * `CurrentActionComponent.actionIndex` is a **positional** index into this
 * array (`components.ts`'s `actionIndexOf` is `findIndex` over it), and the
 * save carries that integer verbatim -- `save-schema.ts`'s `actionIndex` is a
 * bare `z.array(z.number().int())` with no id anywhere near it. Its sibling
 * `needs` object in the same schema is keyed **by name** and says why in a
 * comment: *"reordering `NEED_IDS` in the simulation must not silently
 * reinterpret an existing save's levels as a different need."* Nothing gives
 * this array that protection.
 *
 * So an entry inserted anywhere but the end shifts every index above it and
 * silently reinterprets every in-flight action in every existing save: a
 * prisoner who was showering resumes doing something else, at the same phase
 * and the same `phaseStartedAtTick`, with no error, no decode failure and no
 * `SAVE_SCHEMA_VERSION` mismatch to notice it by. Appending moves no existing
 * index, so it needs no migration and no version bump -- which is the only
 * reason a catalogue entry is a content change here rather than a persistence
 * one ([ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * decision 1 corrects issue #440 on exactly this point).
 *
 * `tests/unit/prisoners-action-catalog.test.ts` is the gate that fails on an
 * insertion, a reorder or a rename; this paragraph is only the reason.
 */
export const DEFAULT_ACTIONS: readonly ActionDefinition[] = [
  {
    /*
     * **`safety` is no longer one of this action's effects** (issue #588, the
     * owner's ruling on issue #599). It carried `safety: 0.2` -- twenty times
     * the decay rate of the day -- which made a bed, and not a guard, the
     * thing that kept a prisoner safe. Two consequences were measured before
     * it was removed:
     *
     * - Any prisoner with a furnished cell sat at 237 or above for ever
     *   (`tests/integration/room-gated-needs.test.ts`), so the state's
     *   40-per-unmet-need withholding never once fired on `safety` in a prison
     *   that had built cells. The ruling's own reading of the old numbers --
     *   40 permanently withheld and no play able to move it -- has the sign
     *   the wrong way round; see `NEED_DECAY_PER_TICK` in `./needs.ts`.
     * - `sampleSectorRisk` already records the same fact from the other side:
     *   its `needsPressure` term *"used to be the `safety` deficit alone,
     *   which `action.sleep` restores twenty times faster than it decays, so
     *   the term was pinned near zero for anybody with a bed"*
     *   (`src/simulation/incidents/sector-risk.ts`). It measured homelessness.
     *
     * The ruling makes coverage the instrument for `safety`, and an
     * instrument that a bed overrides twenty to one is not one. Sleeping still
     * restores `sleep`; being guarded restores `safety`
     * (`SafetyCoverageSystem`).
     *
     * **This is a change to an existing entry's effects and not an insertion**,
     * so no index in this array moves and the paragraph above this array about
     * appending does not apply: every in-flight action in every existing save
     * still decodes to the action it was.
     */
    id: 'action.sleep', category: 'sleep', target: { kind: 'own-accommodation' },
    requiredObjectCapability: 'sleep-surface', needEffectsPerTick: { sleep: 2 }, minDurationTicks: 200,
  },
  {
    id: 'action.eat-meal', category: 'meal', target: { kind: 'room-catalog-id', roomCatalogId: 'room.canteen' },
    requiredObjectCapability: 'dining', needEffectsPerTick: { hunger: 4 }, minDurationTicks: 40,
  },
  {
    id: 'action.eat-in-cell', category: 'meal', target: { kind: 'own-accommodation' },
    needEffectsPerTick: { hunger: 3 }, minDurationTicks: 40,
  },
  {
    id: 'action.use-toilet', category: 'hygiene', target: { kind: 'own-accommodation' },
    requiredObjectCapability: 'sanitation', needEffectsPerTick: { bladder: 5 }, minDurationTicks: 10,
  },
  {
    id: 'action.shower', category: 'hygiene', target: { kind: 'room-catalog-id', roomCatalogId: 'room.shower-room' },
    requiredObjectCapability: 'hygiene', needEffectsPerTick: { hygiene: 4 }, minDurationTicks: 30,
  },
  {
    /*
     * **`safety: 0.1` stays**, and the asymmetry with `action.sleep` above is
     * deliberate rather than an oversight (issue #588). Two reasons, and the
     * second is the load-bearing one:
     *
     * - It is dominated rather than dominant. A yard session is about 212
     *   ticks of an in-game day (`tests/integration/room-gated-needs.test.ts`
     *   measures 2,116 over ten days), so it returns about 21 levels a day
     *   against the 120 `safety` now loses -- a top-up a prison that built a
     *   yard gets, not an override of what coverage decides.
     * - It is what orders this action above `action.common-room-recreation`
     *   for a prisoner whose `recreation` is already full.
     *   `tests/integration/yard-and-common-room.test.ts` drives both scores
     *   over the whole grid of `recreation` x `safety` levels and pins the
     *   yard at or above the common room everywhere, with equality **only**
     *   where both deficits are zero. Dropping the term would make the two
     *   actions tie wherever `recreation` alone is full, which is a change to
     *   what a prisoner does rather than to what a need means.
     */
    id: 'action.yard-recreation', category: 'recreation', target: { kind: 'room-catalog-id', roomCatalogId: 'room.yard' },
    needEffectsPerTick: { recreation: 3, safety: 0.1 }, minDurationTicks: 100,
  },
  {
    id: 'action.common-room-recreation', category: 'recreation', target: { kind: 'room-catalog-id', roomCatalogId: 'room.common-room' },
    requiredObjectCapability: 'recreation', needEffectsPerTick: { recreation: 2 }, minDurationTicks: 80,
  },
  {
    id: 'action.classroom-education', category: 'education', target: { kind: 'room-catalog-id', roomCatalogId: 'room.classroom' },
    requiredObjectCapability: 'education', needEffectsPerTick: { recreation: 1 }, minDurationTicks: 120,
  },
  /*
   * Association: the out-of-cell time a regime block grants rather than an
   * activity it provides. **Appended, and the paragraph above this array is
   * why that word carries the whole change.**
   *
   * `ACTION_CATEGORIES` has had `'free-association'` since issue #24 and two
   * of `GENERAL_POPULATION_REGIME`'s ten blocks allow it, but nothing was ever
   * authored under it. `RIOT_ALLOWED_CATEGORIES` is
   * `['free-association', 'recreation']` (`../incidents/riot-regime.ts`), both
   * recreation actions target a zoned room, and a room the player has not
   * zoned resolves to nothing -- so a rioting prisoner in a prison with no
   * yard and no common room had **no candidate at all** and
   * `beginNextAction` fell through to `unmetDemandCycles` for every
   * reconsideration of every day the riot lasted.
   *
   * Three choices, in the order they were decided:
   *
   * - **`own-accommodation`, with no `requiredObjectCapability`.** An entry
   *   that exists to close a hole has to resolve wherever the hole opens, and
   *   a `room-catalog-id` target would need the very room whose absence opens
   *   it. `own-accommodation` resolves by instance id and re-checks neither
   *   the capability nor the concurrent-use ceiling
   *   (`action-system.ts`'s `resolveTargetInstance` and `claimUseIfNeeded`),
   *   so a capability named here would be data nothing reads --
   *   `action.eat-in-cell` names none for the same reason. The prisoner
   *   associates on their own wing; a dedicated association room is content
   *   this catalogue does not have and a player cannot yet zone.
   * - **No need effect at all, which is what makes appending it to a live
   *   catalogue safe.** `scoreAction` sums `deficit x effect` over the
   *   action's effects, so an action with none scores exactly 0 -- the
   *   minimum any candidate can score, since no effect is negative. It can
   *   therefore never displace an action addressing a need that is even
   *   slightly unmet, in any block, in any prison. It is reached when nothing
   *   better resolves, and in an exact 0-0 tie, where every legal alternative
   *   is at `NEED_MAX` and there is by definition nothing to lose by
   *   associating instead. Whether association should *serve* a need is a
   *   balance question ADR 0042 routes to its own step 4, and answering it
   *   here would trade that invariant for a number nobody has decided.
   * - **60 ticks**, three `ActionSystem` reconsideration cycles. Long enough
   *   to read as an activity in `projectPrisonerDetail` rather than as a
   *   flicker between idle cycles; short enough that a prisoner takes up a
   *   yard, a shower or a meal soon after the player provides one. A long
   *   commitment to an action that fulfils nothing is the one way this entry
   *   could make a prison worse than it found it.
   *
   * **It fulfils no need, and `ActionSystem` therefore does not stamp
   *   `needFulfilledLastTick` while it runs** -- see `continuePerforming`,
   *   which learned to ask rather than assume when this entry arrived.
   */
  {
    id: 'action.free-association', category: 'free-association', target: { kind: 'own-accommodation' },
    needEffectsPerTick: {}, minDurationTicks: 60,
  },
  /*
   * Prison labour, and the seventh category's first content. **Appended, for
   * the reason the paragraph above this array gives at length.**
   *
   * `'work'` has been in `ACTION_CATEGORIES` since issue #24 and
   * `GENERAL_POPULATION_REGIME` gives it 1,000 of the day's 2,400 ticks across
   * two blocks. Issue #440 reads that as 1,000 ticks with nothing to do; the
   * measurement says otherwise, and the difference is why this entry is a
   * *room* action rather than a second `own-accommodation` terminal. Both of
   * those blocks also allow `education`, and in a prison with a furnished
   * classroom they are already full: measured on the real kernel over ten
   * in-game days, `action.classroom-education` performs 9,000 of their 10,000
   * ticks. **No block of any schedule this repository ships or builds at
   * runtime allows `work` alone**, so the empty category was costing zero
   * ticks and an `own-accommodation` work action would have moved no number
   * that a prisoner or a player can see. What was actually empty is a prison
   * with no rooms in it, and `regime.ts` closes that.
   *
   * So this entry is authored for what it *adds*, not for a hole it plugs:
   *
   * - **`room.laundry`, because the room is already in the game and nothing
   *   has ever used it.** It is zonable (`src/content/room-catalog.ts`),
   *   furnishable (`washing-machine-brick`, two bricks apiece), and
   *   `src/simulation/construction/definition.ts` records of its capability
   *   that it "is gated by **nothing**: no entry in `DEFAULT_ACTIONS` names it
   *   and no other room requires it, so a furnished `room.laundry` reads both
   *   its requirements satisfied and changes no prisoner's behaviour ... a
   *   laundry job system is what would consume it". This is that consumer. The
   *   comment is corrected in the same commit rather than left to rot.
   * - **`hygiene`, at 1 against `action.shower`'s 4**, which is the content
   *   convention the catalogue already uses for a second route to a need
   *   (`action.eat-in-cell` gains 3 against `action.eat-meal`'s 4;
   *   `action.common-room-recreation` 2 against `action.yard-recreation`'s 3).
   *   Hygiene rather than an invented need because `room.laundry`'s own
   *   authored `category` in the room catalogue is `'hygiene'` -- content that
   *   has said what this room is for since it shipped, with no code reading
   *   it. It also gives the two work/education blocks a second thing to be
   *   for: `action.classroom-education` gains `recreation: 1` there, so a
   *   prisoner in a prison with both takes whichever of boredom and grime is
   *   the worse today, and a player choosing which room to build is making a
   *   real choice rather than a cosmetic one.
   * - **It does not give `hygiene` a cell-side route, and that is the
   *   decision rather than an omission.** `hygiene` and `recreation` stay
   *   room-gated (issue #436, [ADR 0054](../../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)):
   *   since ADR 0048 made `needsPressure` the mean deficit over all six needs,
   *   an unmet need is what a riot is made of, and a cell-side sibling for
   *   every need would delete the pressure that makes building a shower room
   *   or a yard worth doing.
   * - **120 ticks**, the same shift as `action.classroom-education`, because
   *   the two share both work blocks and an unequal duration would decide
   *   which of them a block is mostly spent on for reasons unrelated to need.
   */
  {
    id: 'action.laundry-work', category: 'work', target: { kind: 'room-catalog-id', roomCatalogId: 'room.laundry' },
    requiredObjectCapability: 'laundry', needEffectsPerTick: { hygiene: 1 }, minDurationTicks: 120,
  },
  /*
   * The kitchen's first executable line, and the second member of `work`.
   * **Appended, for the reason the paragraph above this array gives at
   * length.**
   *
   * Issue #532 measured what `room.kitchen` was: a player could wall it, zone
   * it, furnish it with a stove, a prep counter and a fridge, be told by the
   * Rooms panel that every requirement was met, and nothing would ever happen
   * in it. `tests/foundation/unconsumed-content-contract.test.ts` said the same
   * thing from the other end -- *"Declared with no reader anywhere"* -- and a
   * grep for the id returned the catalogue row, a locale string and a comment.
   * This entry is the reader.
   *
   * **Every figure in it is `action.laundry-work`'s, applied to this room, and
   * nothing here is a new number.** That is deliberate: the laundry entry
   * argued each of its choices at length two comments up, and re-deciding them
   * for a second room would be inventing a balance question rather than
   * answering one.
   *
   * - **`room.kitchen`, and `'food-preparation'`.** The capability is already
   *   declared by `object.stove` and `object.prep-counter` in
   *   `src/content/object-catalog.ts`, and both are authored requirements of
   *   this room, so the ceiling comes out of footprints this tree already
   *   ships: each is 2 tiles wide, so `concurrentUse(kitchen,
   *   'food-preparation')` is **4** at the room's catalogue minimum -- the same
   *   arithmetic, and the same answer, as the furnished laundry's four workers.
   *   `object.fridge`'s `'food-storage'` is deliberately *not* named: one
   *   action consumes one capability (issue #326), and gating on the fridge
   *   would make a cold store a work station.
   * - **`hunger`, at 1 against `action.eat-meal`'s 4**, which is the
   *   convention the catalogue already uses for a second route to a need
   *   (`action.laundry-work` gains `hygiene` at 1 against `action.shower`'s 4;
   *   `action.eat-in-cell` 3 against `action.eat-meal`'s 4). Hunger rather
   *   than an invented need because `room.kitchen`'s own authored `category`
   *   in the room catalogue is `'food'` -- exactly the reading that gave the
   *   laundry `hygiene` from its authored `'hygiene'`. A prisoner on kitchen
   *   duty eats a little of what passes through their hands; nothing is
   *   produced, stored or delivered.
   * - **It is a place to work, and explicitly *not* a supplier of the
   *   canteen.** `action.eat-meal` gates on `'dining'` in `room.canteen` and
   *   gains `hunger` directly; no meal exists as an item, no `item.food-ration`
   *   moves, and `room.canteen` does not ask whether anybody cooked. Making
   *   the kitchen feed the canteen means a production chain --
   *   `docs/research/audit-2026-08-26/10-product-roadmap.md` scopes that as its
   *   own "Food chain (kitchen -> cook -> ration -> canteen)" row at size L --
   *   and it would be architecture decided inside a content module. This entry
   *   deliberately leaves that row exactly where it is.
   * - **120 ticks**, the same shift as `action.classroom-education` and
   *   `action.laundry-work`, and for the reason the laundry entry states: the
   *   three now share both work blocks, and an unequal duration would decide
   *   which of them a block is mostly spent on for reasons unrelated to need.
   *
   * What it adds to a day, rather than what it plugs: the two work/education
   * blocks (500-1,000 and 1,300-1,800 of `GENERAL_POPULATION_REGIME`) now offer
   * three things instead of two, and a prisoner in a prison with all three
   * takes whichever of boredom, grime and hunger is worst today. A player
   * choosing between a classroom, a laundry and a kitchen is making a real
   * choice between three needs rather than picking the only room that does
   * anything.
   */
  {
    id: 'action.kitchen-work', category: 'work', target: { kind: 'room-catalog-id', roomCatalogId: 'room.kitchen' },
    requiredObjectCapability: 'food-preparation', needEffectsPerTick: { hunger: 1 }, minDurationTicks: 120,
  },
];
