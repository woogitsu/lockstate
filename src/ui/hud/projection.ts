import type { LocalizationKey } from '../../content/localization';
import { deriveSimulationMessageKey } from '../../content/simulation-message-keys';
import { deliveriesRungFloorMinorUnits, freshUnfurnishedPrison } from '../affordability';
import type { HostRefusalReason } from '../host-refusal';
import type { IconId } from '../primitives/icon';
import type { BadgeTone } from '../primitives/status-badge';
import { HUD_MESSAGE_KEY } from './messages';
import type {
  HudClockViewModel,
  HudCountsViewModel,
  HudRoomNeedsViewModel,
  HudSeverity,
  HudSpeed,
} from './view-model';

/**
 * Pure view-model → display-descriptor mapping.
 *
 * This is the layer that decides *what the HUD says*: which metrics exist,
 * in what order, with which icon, which message key and which tone. The DOM
 * builders in `status-strip.ts` and `hud.ts` do nothing but walk these
 * descriptors, so proving the mapping here pins everything the strip is told
 * to show -- in the default `node` Vitest environment, with no DOM, as
 * `tests/unit/ui-save-panel-status.test.ts` already does for the save panel.
 * The builders themselves are never executed there, which is why what they
 * put in the DOM is asserted in `tests/browser/ui-shell.spec.ts`.
 */

/**
 * What the strip shows where it has no value to show.
 *
 * Not a message key, and not an ADR 0011 exception: it is punctuation, the
 * same in every locale, and it says *nothing is known* rather than naming a
 * condition. The condition is named by the alerts region.
 *
 * **This used to be called `CLOCK_UNKNOWN_TEXT`, and that name no longer
 * exists anywhere in the tree** (issue #1191). The docblock above was already
 * general when the name was not: the metric chips paint this now too, for the
 * state the clock has always painted it for -- which is the whole of that
 * issue, since the two halves of one strip used to disagree about whether
 * anything was known.
 */
export const UNKNOWN_READOUT_TEXT = '--';

/**
 * The 1-based in-game day, or `undefined` when no session has reported one.
 *
 * `undefined` is a real state and not a defensive default. Before a session
 * exists the simulation has no clock, and "day 1" would be a claim about a
 * prison that is not running.
 */
export function displayDay(day: number): number | undefined {
  if (!Number.isFinite(day)) return undefined;
  const whole = Math.trunc(day);
  return whole >= 1 ? whole : undefined;
}

/**
 * How far through the in-game day, as a whole percent, or `undefined` when
 * the day length is unknown.
 *
 * **Not** an hour-of-day. The simulation defines a day as a budget of ticks
 * and nothing maps that budget onto a 24-hour dial (`docs/HUD_PROJECTIONS.md`,
 * gap 5), so this reports the position the simulation actually publishes.
 * Rendering it as `07:45` instead would put a time on screen that no system
 * produces, which is the same class of lie as a money counter with no economy
 * behind it.
 *
 * Floored: 99.6% of the way through a day must not read as a whole day gone.
 * That is the same half of the rule `BoundedValue.filled` obeys by reserving
 * its last segment for the true maximum (`docs/HUD_PROJECTIONS.md` section
 * 4), and only that half -- a bar's *other* rule, that any value above zero
 * lights one segment, is deliberately not copied here. One tick into a
 * thousand-tick day is 0% and reporting `0` says so truthfully; a percent has
 * a zero and a bar has no empty-but-not-nothing state to draw.
 *
 * A tick position outside the day wraps rather than throwing, so a readout
 * that arrives one tick either side of the day boundary still renders.
 */
export function dayProgressPercent(tickOfDay: number, dayLengthTicks: number): number | undefined {
  if (!Number.isFinite(tickOfDay) || !Number.isFinite(dayLengthTicks)) return undefined;
  const length = Math.trunc(dayLengthTicks);
  if (length <= 0) return undefined;
  const position = ((Math.trunc(tickOfDay) % length) + length) % length;
  return Math.floor((position * 100) / length);
}

/**
 * Where a fast-forward tap goes.
 *
 * `1 -> 2 -> 4 -> 2`: repeated taps toggle between the two fast speeds
 * rather than dead-ending at ×4 or silently dropping back to real time.
 * Returning to ×1 is what the play button is for, so no tap is ever
 * ambiguous about what it will do.
 */
export function nextFastForwardSpeed(current: HudSpeed): HudSpeed {
  switch (current) {
    case 1:
      return 2;
    case 2:
      return 4;
    case 4:
      return 2;
  }
}

export interface TransportPressedStates {
  readonly pause: boolean;
  readonly play: boolean;
  readonly fastForward: boolean;
}

/**
 * Exactly one transport control is pressed at any time, so the three
 * buttons read as a state, not as three independent switches.
 */
export function transportPressedStates(clock: HudClockViewModel): TransportPressedStates {
  if (clock.mode === 'paused') return { pause: true, play: false, fastForward: false };
  const fast = clock.speed > 1;
  return { pause: false, play: !fast, fastForward: fast };
}

export type HudMetricId =
  | 'prisoners'
  | 'high-risk'
  | 'staff'
  | 'coverage'
  | 'rooms'
  | 'incidents'
  | 'contraband'
  | 'funds'
  | 'earned-today';

/**
 * The `HIGH RISK` chip's label, and it is **not a new player-facing string**
 * (issue #703, the owner's fourth ruling of 2026-08-31).
 *
 * `classification-group.high-risk.name` is the key
 * `src/content/simulation-message-keys.ts` already authors for this exact
 * group -- "High Risk" -- and it is already on screen: the Regime panel's
 * timetable block heads the restricted block with it, resolved from the same
 * key through the same catalog. The chip counts the members of the group that
 * line names, so a second `hud.status.*` spelling of the same two words would
 * be the drift ADR 0011 separates its three namespaces to prevent, and
 * `AGENTS.md`'s fourth exclusion would make authoring one the owner's call
 * rather than this change's.
 *
 * Derived, never spelled out, which is `simulation-message-keys.ts`'s own rule:
 * renaming the group id renames the key and the pair stays one edit.
 *
 * **This is the first chip on the strip whose label is not a `hud.*` key**, and
 * it is not the first *label* -- the incidents badge has read an
 * `incident-type.*.name` since issue #506 finding 2, for the same reason and
 * with the same import. `tests/unit/ui-hud-messages.test.ts` walks every
 * descriptor's `labelKey` and used to require the HUD's own registry; it now
 * accepts either registry and resolves the key either way, which is the check
 * that actually matters (that the player sees words rather than a dotted id).
 *
 * The `'high-risk'` id is spelled here for the reason `describePrisonerRow`
 * spells it in `roster-panel.ts`: `CLASSIFICATION_GROUP_IDS` lives in
 * `src/simulation/prisoners/components.ts` and the HUD may not import the
 * simulation (`AGENTS.md` boundary 1). A wrong id would resolve to nothing and
 * render as the raw key, which `tests/browser/app-shell.spec.ts` asserts
 * against on the real page -- *paints the high-risk chip and orders the Regime
 * roster by tier (#703)*, which reads the chip's label and refuses any dotted
 * identifier anywhere in the strip.
 */
const HIGH_RISK_LABEL_KEY: LocalizationKey = deriveSimulationMessageKey('classification-group', 'high-risk');

/**
 * A localizable sentence a chip can carry, and the numbers it names.
 *
 * Extracted on 2026-09-01 because `HudMetricBadge` was no longer the only one:
 * the owner's ruling of that day gives the `FUNDS` chip a *description* as well
 * as a badge, and both are "a key plus the quantities the strip must format".
 * One shape means `status-strip.ts` formats both through the same function
 * rather than growing a second copy of it, which is what
 * `docs/AGENT_WORKFLOW.md` §3 means by looking one module over first.
 */
export interface HudMetricText {
  readonly textKey: LocalizationKey;
  /**
   * Placeholders for `textKey`, for a badge that states a **quantity** rather
   * than a condition -- rendered by `status-strip.ts` through the same
   * `HudLocalizer.formatNumber` a chip's own value goes through, so the two
   * group and localise identically (the owner's ruling 18 of 2026-08-31).
   *
   * Absent for every badge that names a state in one word, which is most of
   * them: a key with no placeholders and an empty parameter object are the same
   * rendered string, so "absent" carries the distinction rather than an empty
   * literal.
   *
   * ## Why the values are numbers and this layer does not render them
   *
   * `projection.ts` is a pure mapping proven in the `node` environment and has
   * no localizer; acquiring one would put an `Intl` call on the wrong side of
   * that line. So the projection names the quantity and the strip formats it,
   * which is the same division `labelKey` and `textKey` already make for text.
   *
   * **The field this replaced took `MessageParameters` and rendered through
   * `String()`,** which is `interpolate`'s fallback: `hud.status.funds-remaining`
   * under a chip reading `-100` would have said `2400 left` where the chip said
   * `-100`, and `{count} with no bed` -- the badge's text before issue #961 --
   * said `1240` under a chip reading `1,240`.
   * Identical below a thousand in `en`, which is why the older of the two ran
   * for two issues without anybody seeing it. The old field is gone rather than
   * kept beside this one: after issue #703's ruling 21 shortened the coverage
   * badge, no badge on this strip states anything but a number, so a second
   * channel would have had no producer. A badge that needs a *word* interpolated
   * is what would bring it back.
   */
  readonly numberParameters?: Readonly<Record<string, number>>;
}

export interface HudMetricBadge extends HudMetricText {
  readonly tone: BadgeTone;
}

export interface HudMetricDescriptor {
  readonly id: HudMetricId;
  readonly icon: IconId;
  readonly labelKey: LocalizationKey;
  /**
   * The number this chip states, or `undefined` because **no prison has
   * reported one** (issue #1191).
   *
   * `undefined` is a real state and not a defensive default, in exactly the
   * sense `displayDay` above already says it for the clock: before the first
   * `simulation/status-counts` publication, and after `simulation/stopped`,
   * there is nothing to count, and `0` there is a claim about a prison rather
   * than the absence of one. `status-strip.ts` paints `UNKNOWN_READOUT_TEXT`
   * for it -- the `--` the clock in the same strip has always painted.
   *
   * Every chip's value is absent together or present together, because they
   * come off one publication; the field is per-descriptor because that is
   * where the strip reads it.
   */
  readonly value: number | undefined;
  /** Present only for a bounded metric; drives the segmented bar. */
  readonly capacity: number | undefined;
  readonly tone: BadgeTone | undefined;
  readonly badge: HudMetricBadge | undefined;
  /**
   * A full sentence about what this chip's number means, rendered by
   * `status-strip.ts` into the chip's `title` **and** its screen-reader text --
   * the owner's ruling of 2026-09-01, and `undefined` on every chip but one.
   *
   * **This exists because a badge has a width and a sentence does not fit in
   * it.** The owner chose `{remaining} left before deliveries stop` for the
   * `FUNDS` badge; `tests/browser/ui-overdraft-badge.spec.ts` measured it at
   * +133px of chip and off the visible edge of the metrics row at 1280x800,
   * and the ruling that followed kept the short badge and moved the name of
   * the threshold here and into the refusal alert. `.ui-sr-only` is out of
   * flow, so this channel is free of width -- which is the whole reason it can
   * carry what the badge cannot.
   *
   * **It is not a hiding place, and that is a constraint rather than a
   * remark.** A hover tooltip is unreachable on touch and unseen by a player
   * who does not hover, so nothing may be said *only* here:
   * `tests/unit/ui-hud-funds-threshold-named.test.ts` requires the deliveries
   * rung to be named in the refusal alert as well, and fails if either place
   * drops it.
   */
  readonly description: HudMetricText | undefined;
}

/**
 * Occupancy tone.
 *
 * Over capacity is a real operational failure (prisoners with nowhere to
 * sleep), so it is `danger`; the 90% step is the early warning. Below that
 * the metric stays neutral -- a status strip where several things are always
 * amber teaches players to ignore amber.
 */
export function occupancyTone(prisoners: number, capacity: number): BadgeTone | undefined {
  if (capacity <= 0 || !Number.isFinite(capacity) || !Number.isFinite(prisoners)) return undefined;
  const ratio = prisoners / capacity;
  if (ratio > 1) return 'danger';
  if (ratio >= 0.9) return 'warning';
  return undefined;
}

/**
 * How many prisoners have no bed: the population, less the prisoners holding
 * a residency place that currently exists (issue #609).
 *
 * ## Why this is presentation and not a derived simulation figure
 *
 * `src/ui/simulation-counts.ts` states the rule this has to answer to: **the
 * HUD may not derive a simulation figure** (`AGENTS.md` boundary 1, enforced
 * by `tests/unit/ui-hud-messages.test.ts`). What that forbids is the HUD
 * becoming a *second authority* on a fact -- recomputing something the
 * simulation also computes, from inputs the simulation would weigh
 * differently, so that the two can disagree. `occupancyTone` below is the
 * standing precedent for what it does *not* forbid: it divides two published
 * counts to choose a colour, and has never been derivation.
 *
 * This subtraction is on that same side, and for a stronger reason than
 * precedent. Both operands are counts of **the same set of prisoners**,
 * published in the same payload from the same projection walk:
 * `occupiedPlaces` is the length of
 * `RoomInstanceRegistry.residentIdsWithExistingPlace()`, whose every entry is
 * the entity id of a prisoner `prisoners` has already counted. So the
 * difference is the size of a complement -- an arithmetic identity over two
 * published counts -- and not a second computation of either. It resolves no
 * catalogue, applies no policy and remembers nothing between messages, which
 * is the same test `simulation-counts.ts` applies to
 * `activeIncidentTypeLabelKey`.
 *
 * **The derivation this must not be is available and named**, which is what
 * makes the line real rather than a matter of taste: `prisoners -
 * accommodationCapacity`. Issue #609's second correction measured why that
 * one is *wrong* as well as forbidden -- two cells of two beds with four
 * prisoners all assigned into cell A gives a capacity of 4 and a difference
 * of **0**, while cell A holds `min(4, 2) = 2` places and two prisoners have
 * nowhere to sleep. That subtraction silently assumes capacity is fungible
 * across instances, which is a *simulation* rule
 * (`firstAvailableAccommodationTarget` spends each target's own budget), so
 * a HUD doing it really would be deciding a simulation question. Subtracting
 * a count of prisoners from a count of prisoners assumes nothing.
 *
 * **Clamped at zero.** `assign` does not release a prisoner from a previous
 * instance, and `residentIdsWithExistingPlace` does not de-duplicate, so
 * `occupiedPlaces > prisoners` is not something this layer can prove
 * impossible from the other side of a message channel. A negative badge would
 * be a nonsense sentence on screen; `Math.max` makes the worst case a badge
 * that does not appear.
 */
function prisonersWithoutBed(counts: HudCountsViewModel): number {
  return Math.max(0, counts.prisoners - counts.occupiedPlaces);
}

/**
 * The sentence under the `PRISONERS` chip when somebody has nowhere to sleep,
 * and nothing at all when everybody does (issue #609).
 *
 * **`undefined` rather than a badge reading "0 not housed"**, which is
 * `coverageTone`'s reasoning applied to a chip that has been badge-less until
 * now: *"a status strip where several things are always amber teaches players
 * to ignore amber"*, and that note already extends it to green. A permanent
 * badge on the busiest chip on the strip is the same failure in the shape of
 * reassurance -- nine chips compete for one glance (eight when this was
 * written; #703 added the ninth), and a line that is
 * present in every screenshot is a line nobody reads in the one screenshot it
 * matters in.
 *
 * `warning` and not `danger`. The chip's own `tone` is already the escalation
 * channel for this chip -- `occupancyTone` turns it red the moment the prison
 * is past its accommodation capacity -- and painting the badge red as well
 * would state one fact twice in one colour, leaving nothing louder for the
 * state that really is worse. The badge's job here is to put the *number* on
 * screen, which is what issue #609 measured as missing and what issue #629
 * requires of a mechanic a player would otherwise have to discover: the
 * money stops for every prisoner counted here, and until now nothing on the
 * strip said how many there were.
 */
function prisonersWithoutBedBadge(counts: HudCountsViewModel): HudMetricBadge | undefined {
  const withoutBed = prisonersWithoutBed(counts);
  if (withoutBed <= 0) return undefined;
  /*
   * **`numberParameters`, and this moved on 2026-08-31 rather than being
   * written that way.** It was `parameters: { count }`, which `interpolate`
   * renders with `String()`: a prison with 1,240 unhoused read `1240 with no
   * bed` under a chip reading `1,240`. Identical below a thousand, which is why
   * nothing caught it, and the strip disagreeing with itself above one.
   *
   * Swept here rather than only at the badge that forced the channel
   * (`{remaining} left`), because the defect is the class and not the
   * instance: any badge stating a quantity has it.
   */
  return { tone: 'warning', textKey: HUD_MESSAGE_KEY.prisonersWithoutBed, numberParameters: { count: withoutBed } };
}

/**
 * The badge under the `ROOMS` chip: how many of the rooms it counts cannot yet
 * do the job they were designated for
 * ([#1006](https://github.com/matmaxalez/lockstate/issues/1006) finding 1).
 *
 * ## Why the strip carries this at all
 *
 * Because the warning had exactly one render site and it was behind a tab. A
 * play-test on 2026-09-05 zoned a cell with no door, sat on OVERVIEW for
 * **eight game days**, and the two messages it saw in that time were
 * *"Contraband found: Tool."* and *"Cell designated. Day 2"* -- while
 * `.hud-rooms` (never laid out on that tab) held `NOT READY 1 of 1` and the
 * strip read `1 ROOMS` with no qualifier at all. The sentence
 * `hud.rooms.needs-doorway` is true, immediate and durable, and a player on the
 * tab the game opens on cannot see it. This badge is the qualifier that says
 * the panel has something to say; it does not try to be the panel.
 *
 * ## Why it is not derived from `counts`
 *
 * Every other badge on this strip is, and this one cannot be: whether a room is
 * ready is `projectRoomList`/`projectRoomDetail`'s verdict, pulled over the
 * projection channel, and `simulation/status-counts` carries no such figure.
 * `HudRoomNeedsViewModel` is the answer that already exists, already crosses
 * the boundary and is already what the Rooms panel prints -- so reading it here
 * means the badge and the panel state one number from one source. Recomputing
 * "unfinished" on this side would be the second definition that drifts, which
 * is the rule `HudRoomNeedViewModel` states for the panel and it does not stop
 * applying because the reader moved to the strip.
 *
 * ## The three states, and why two of them draw nothing
 *
 * - **Nothing has asked** (`undefined`) -- no session, or a session that has
 *   stopped. Absent, because a badge reading `0 not ready` would be a claim
 *   about a prison nothing is answering for.
 * - **Every room is ready** (`unfinishedRooms === 0`) -- absent, and this is
 *   `prisonersWithoutBedBadge`'s rule rather than a second opinion: *"a status
 *   strip where several things are always amber teaches players to ignore
 *   amber"*, and the note there already extends it to reassurance. A prison
 *   whose rooms all work is described by the count above the badge.
 * - **Something is not ready** -- the count, toned `warning`.
 *
 * `warning` and not `danger`: an unfinished room is the ordinary state of a
 * room a player has just drawn, and the chip's own `tone` is left alone so this
 * is one signal rather than two for one fact.
 *
 * `numberParameters`, not `parameters`, for the reason `prisonersWithoutBedBadge`
 * records: a badge that states a quantity must group it the way the chip above
 * it groups its own.
 */
function roomsNotReadyBadge(roomNeeds: HudRoomNeedsViewModel | undefined): HudMetricBadge | undefined {
  if (roomNeeds === undefined || roomNeeds.unfinishedRooms <= 0) return undefined;
  return {
    tone: 'warning',
    textKey: HUD_MESSAGE_KEY.roomsNotReady,
    numberParameters: { count: roomNeeds.unfinishedRooms },
  };
}

/**
 * The worst rung anybody is standing on, as a tone (issue #588).
 *
 * Three steps for one metric, in `occupancyTone`'s shape and for
 * `describeStaffCoverage`'s reason: a prison with somebody unguarded is not a
 * worse version of an understaffed one, it is the rung where the cheapest
 * possible action changes the outcome. `undefined` -- not `success` -- when
 * nobody is on either lower rung, because this is a strip of nine chips
 * competing for one glance and *"a status strip where several things are
 * always amber teaches players to ignore amber"* applies to green as well;
 * the badge still says "Covered" in words, so the state is never carried by
 * colour alone.
 */
function coverageTone(counts: HudCountsViewModel): BadgeTone | undefined {
  // Above the ladder, because it is the state the ladder cannot see (ADR 0117,
  // accepted 2026-09-17). While a post cannot be reached, the three counts
  // below alternate between *covered* and *unguarded* on the deployment
  // cadence -- 100 ticks each over 200, seed `0x396` -- so reading them alone
  // paints this chip green on half of all frames over a prison no guard is
  // standing in. `coverageBadge` takes the same precedence for the same
  // reason, so the colour and the word still come off one ladder read once.
  if (counts.postUnreachable === true) return 'danger';
  if (counts.prisonersUnguarded > 0) return 'danger';
  if (counts.prisonersUnderstaffed > 0) return 'warning';
  return undefined;
}

/**
 * The word under the coverage chip: the worst rung anybody is standing on, in
 * the Staff panel's own vocabulary.
 *
 * The three words are `securityCoverageMet`, `securityCoverageShort` and
 * `securityCoverageUnguarded` -- "Covered", "Understaffed", "Unguarded" --
 * rather than second copies of them, so the panel and the strip cannot come to
 * disagree about what a rung is called. "Covered" is also what an *empty*
 * prison reads, which is correct for the same reason it is correct on the
 * panel: a prison with nobody in a sector has all the coverage it needs.
 *
 * ## What this badge used to say, and what the change costs
 *
 * Until the owner's **ruling 21 of 2026-08-31** the two lower rungs rendered
 * `hud.status.coverage-detail` -- `'{understaffed} understaffed · {unguarded}
 * unguarded'` -- and that sentence was not decoration. Issue #588 put it there
 * so that the chip's *value* carried the top rung while the badge carried the
 * whole of the remainder with its counts, *"so the 40s are attributable"*: since
 * ADR 0064 the state withholds part of the prisoner-day grant per unmet need,
 * and those two numbers are how many prisoners each rung is costing. The
 * `coverageTone` docblock above still argues the other half of it -- the badge
 * states the condition in words so colour is never the only signal -- and that
 * half is untouched, because a word is still what it states.
 *
 * **What the ruling weighed it against is a width.** At 1280 a strip carrying
 * every badge is 1,627px of content in a 1,256px row -- 6 of 9 chips on screen,
 * and the two that go are `FUNDS` and `EARNED TODAY`, exactly when the prison is
 * in trouble. This badge is the second-largest single contributor to that
 * excess, and shortening it authors **no new string**: both words already exist
 * and are already on screen in the Staff panel's coverage block
 * (`staff-panel.ts`, `describeStaffCoverage`'s `badgeKey`).
 *
 * **So the two counts are gone from the strip, and that is a real loss stated
 * rather than glossed.** What answers #588's argument only partly: the rung
 * underneath is on this same badge the moment the rung above it is cleared,
 * because the ladder is re-evaluated on every publication -- so the *sequence*
 * of rungs is still discoverable, and only the two magnitudes are not. Where
 * they remain readable in full is the Staff panel, which states the coverage
 * census with its counts and has done since #588.
 */
function coverageBadge(counts: HudCountsViewModel): HudMetricBadge {
  const tone = coverageTone(counts);
  // ADR 0117 §4's second decision, settled here: while this stands,
  // `securityCoverageMet` -- "Covered" -- is false, and it is what this chip
  // would otherwise read on half of all ticks (measured; see `coverageTone`).
  // So the rung is displaced rather than annotated.
  if (counts.postUnreachable === true) return { tone: 'danger', textKey: HUD_MESSAGE_KEY.securityPostUnreachable };
  if (tone === undefined) return { tone: 'success', textKey: HUD_MESSAGE_KEY.securityCoverageMet };
  // One ladder, read once: the tone and the word come off the same two rungs in
  // the same order, so a rung that changes the colour cannot fail to change the
  // word with it.
  return {
    tone,
    textKey:
      counts.prisonersUnguarded > 0
        ? HUD_MESSAGE_KEY.securityCoverageUnguarded
        : HUD_MESSAGE_KEY.securityCoverageShort,
  };
}

/**
 * How much a prison can still spend before its deliveries stop, or `undefined`
 * when there is no facility to have a remainder of.
 *
 * **`balance - deliveriesRung`, and the rung is the whole of what the owner's
 * ruling of 2026-09-01 changed here.** This function computed
 * `balance - overdraftFloor` -- the room to -2,500 -- and its docblock read
 * *"how much of the standing overdraft a prison can still spend"*, which was
 * exactly true under ruling 18's single floor. Ruling 19 of 2026-08-31 gave
 * ADR 0017 decision 8's rungs three thresholds inside that overdraft, and from
 * that moment the figure was an offer of room no press could spend: a prison at
 * -1,300, which had already had a delivery *and* a hire refused, read
 * `1,200 left`. ADR 0017's "Amendment, 2026-09-01" §5 recorded it as owed to
 * the owner and `src/ui/affordability.ts` reported it beside its own re-basing.
 *
 * It is now the same rung `judgeAffordability` refuses a press against, so
 * `0 left` and "the next Buy press is refused" are one fact rather than two
 * numbers that happen to be near each other. That is the property worth having:
 * the badge is read *before* pressing.
 *
 * **Why the deliveries rung and not the deepest one a prison can still reach.**
 * A payday may still spend to the treasury's floor (-2,500), so a badge over
 * the deliveries rung understates what the *prison* will spend. It states what
 * the *player* can spend, which is what a number beside a control is for: a
 * payday happens without a press and is not a choice the badge could inform.
 *
 * **This paragraph named the build queue as a second thing spending past this
 * rung, at -2,000, and that stopped being true on 2026-09-01.** The owner's
 * ruling on #771 (ADR 0017's equalisation amendment) moved
 * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` onto the same -1,250 this
 * rung already is, so the build queue now stops exactly where this badge
 * does too. Kept as a record that the badge used to understate the queue as
 * well as the payday, and no longer does.
 *
 * **The same ruling opened a second gap this function closed the same day:
 * the starter exemption.** While a prison is fresh and unfurnished
 * (`RoomInstanceRegistry.totalResidentCapacity === 0`), `Treasury.floorFor`
 * answers `INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS` (-1,185, not
 * -1,250) so the prison can always afford its first plank. A badge that kept
 * computing the mature rung during that window overstated spendable room by
 * exactly the 65-minor-unit gap between the two floors: at -1,160 it read
 * `90 left` while a 65 press was refused, which is `AGENTS.md`'s fourth
 * exclusion and the exact defect PR #769 closed for the mature floor. Fixed
 * by reading the same freshness `pressFloorMinorUnits` reads --
 * `counts.roomCapacity === 0` -- and passing it through
 * `deliveriesRungFloorMinorUnits`, so the badge and the press it describes
 * are computed from the one boolean rather than two things that can drift
 * apart.
 *
 * **`counts.roomCapacity === 0` was itself the wrong reading, and the clause
 * above is kept rather than rewritten because its *argument* is what survived
 * and its *source* is what did not (2026-09-15).** One boolean shared with the
 * press is still the property; the boolean is now
 * `counts.isFreshUnfurnishedPrison`, the registry figure the worker judges
 * with, read through `freshUnfurnishedPrison`. `roomCapacity` is a sub-sum of
 * that figure over the catalogue fan-out (`docs/HUD_PROJECTIONS.md` gap 15),
 * so it answered "fresh" in strictly more cases than the worker did -- and on
 * a restored prison holding an off-catalogue room this badge read `0 left` at
 * -1,200 while the worker went on accepting presses to -1,250.
 *
 * The rung comes through `deliveriesRungFloorMinorUnits` in
 * `src/ui/affordability.ts` rather than from `rungFloorMinorUnits` directly,
 * because `src/ui/hud/` may not import the simulation -- `AGENTS.md` boundary 1,
 * pinned by `tests/unit/ui-hud-messages.test.ts`. The paragraph this replaces
 * said the HUD *"does not need to: both operands come from the same payload"*,
 * which was true of a figure over the published floor and is not true of one
 * over a rung; what is preserved instead is that the rung is one definition
 * with `Treasury.floorFor`, clamped to the floor this very payload carries,
 * rather than a -1,250 written out here.
 *
 * **The measurement that made this concrete**, kept from the playtest branch
 * that took it rather than left in a research note alone: on the assembled
 * page, at a balance of **-1,235** the badge read `1,265 left` while the
 * cheapest item in the catalogue, a 40 brick, was refused -- the refusal
 * landing on the host's own thread as
 * `HostRefusalError: The last reported balance of -1195 cannot cover 65.`,
 * where no player could see it
 * (`docs/research/2026-09-01-what-the-funds-chip-promises.md`, act 1). The
 * overstatement was **exactly 1,250 at every negative balance**, not a
 * threshold the figure crossed: at -1,250 the real room reaches zero and stays
 * there to the floor while the old figure went on counting down a positive
 * number.
 *
 * **`undefined` for a floor that is absent or `0`.** Both say no room below
 * zero is known, and a facility of nothing has no remainder to state; the
 * chip's own minus sign is then the whole story. Absent is every payload
 * written before the owner's ruling 18 of 2026-08-31.
 *
 * **Clamped at zero, and the boundary is the point.** A balance exactly at the
 * rung has `0` left, which is true and is what the ruling names. A balance
 * *below* it -- which a press cannot produce, and the build queue, a payday and
 * a restored save all can -- would otherwise render a negative number after the
 * word "left", which is a nonsense sentence on the one strip a player glances
 * at. `Math.max` makes the worst case an understatement of a remainder that is
 * already nothing.
 */
function overdraftRemaining(counts: HudCountsViewModel): number | undefined {
  const floor = counts.treasuryOverdraftFloorMinorUnits;
  if (floor === undefined || floor >= 0) return undefined;
  const isFreshUnfurnishedPrison = freshUnfurnishedPrison(counts);
  return Math.max(0, counts.treasuryMinorUnits - deliveriesRungFloorMinorUnits(floor, isFreshUnfurnishedPrison));
}

/**
 * Whether the balance has reached the treasury floor itself -- the deepest a
 * prison can go, published as `counts.treasuryOverdraftFloorMinorUnits` and
 * reached only by an automatic payroll tick, never by a press (issue #768).
 *
 * Its own function because `overdraftTone` and `overdraftDescription` both
 * need the same boundary and must not drift into two comparisons that could
 * disagree at the edge.
 */
function atTreasuryFloor(counts: HudCountsViewModel): boolean {
  const floor = counts.treasuryOverdraftFloorMinorUnits;
  return floor !== undefined && floor < 0 && counts.treasuryMinorUnits <= floor;
}

/**
 * The `FUNDS` chip's tone: nothing while the prison is solvent, `warning`
 * while it is under water with room left, `danger` at the deliveries rung and
 * `critical` at the treasury floor itself (the owner's ruling 18 of
 * 2026-08-31, re-based by the ruling of 2026-09-01, given a third tone by the
 * ruling on issue #768).
 *
 * ## Why three tones and not two
 *
 * `coverageTone`'s argument, applied to money, twice over. A prison at -100
 * and a prison at -1,300 are not the same state told louder: the first can
 * still buy the plank that finishes the cell, and the second can buy nothing
 * at all -- every press that costs money is refused, and none of them will
 * stop being refused until the prison earns some. That is exactly the distinction the
 * coverage ladder draws between understaffed and unguarded, *"the rung where
 * the cheapest possible action changes the outcome"*.
 *
 * **And a prison at -1,300 and one at -2,500 are not the same state either,
 * for the opposite reason.** Both refuse every press alike -- `danger` was
 * correct about that much on its own -- but only the second is the floor no
 * press can reach at all, where the treasury itself has stopped and the
 * *game's* own automatic spends (a payday) are what put it there, not the
 * player. Issue #768 found the two indistinguishable: `danger` covered both
 * the instant ruling 19 re-based it onto the deliveries rung, and a strip that
 * paints "you cannot buy" the same as "you are at the bottom" has nothing left
 * to say once the prison is stuck twice over.
 *
 * **The tone was computed against the whole -2,500 floor until 2026-09-01, and
 * the paragraph above read *"the second can buy nothing at all until the state
 * pays it ... `danger` is reserved for the floor rather than spent on the first
 * minus sign."*** It is kept rather than overwritten because the argument was
 * right and only its threshold was wrong: ruling 19 moved the point at which
 * the cheapest possible action stops changing the outcome from -2,500 up to
 * -1,250, and this function went on reading the floor -- so a prison at -1,300
 * that had already had a delivery and a hire refused still painted amber, which
 * is the one colour on this strip that says *there is still something you can
 * do*. Only the number moved; the ladder's own reasoning chose it.
 *
 * What `danger` no longer means is "nothing at all is spendable": a payday can
 * still spend to -2,500, a press the player cannot cause. **It read "the
 * build queue can still spend to -2,000" as well, until the owner's ruling on
 * #771 (2026-09-01, ADR 0017's equalisation amendment) moved the construction
 * rung onto the same -1,250 this tone already keys off.** `danger` now means
 * exactly what it reads as: no discretionary spend of any kind, player-pressed
 * or scheduled, moves the balance again until the prison earns the money.
 * Only the payday exception survives, and it is named above rather than
 * implied. **And it does not mean "the deepest a prison can go" either** --
 * that is `critical` now, the ruling on issue #768's own boundary.
 *
 * **And during the starter exemption the rung itself moves, which this
 * function must move with rather than key off a stale -1,250.** Before this
 * fix `overdraftTone` painted `danger` at the mature rung even for a fresh,
 * unfurnished prison sitting on the shallower starter floor -- the same
 * source `overdraftRemaining` reads is read here too, so a fresh prison's
 * chip turns amber, not red, exactly at the floor the starter rung actually
 * enforces. The floor itself does not move with the starter exemption --
 * `Treasury.overdraftFloorMinorUnits` is unaffected by furnishing -- so
 * `atTreasuryFloor` needs no matching change; only the `warning`/`danger`
 * boundary above it does.
 *
 * ## Why the chip takes a tone at all, when it has always refused one
 *
 * The `funds` descriptor's own comment refuses a tone at length, and that
 * refusal is intact: *"low on money" is a threshold, and a threshold is a
 * balance decision* reserved to #29 and ADR 0017 decision 5. **Nobody chose a
 * threshold here.** Zero, the deliveries rung and the floor are not numbers
 * this file picked: zero is where the prison stops spending its own money and
 * starts spending the state's, the rung is `Treasury.floorFor('deliveries')`
 * -- the point ADR 0017 decision 8 already defines as where a press stops
 * working -- and the floor is `Treasury.overdraftFloorMinorUnits`, published by
 * the simulation. All three are states the economy defines; none is a
 * judgement about when a balance is "low", and if the deliveries and
 * construction rungs are ever unified (the sibling half of #771) the boundary
 * between `warning` and `danger` moves with them for the same reason -- it is
 * read off the rung, not written out here -- while the boundary this ruling
 * adds, between `danger` and `critical`, stays the published floor and is
 * unaffected either way.
 *
 * **Colour is never the only signal, and this ruling now keeps that promise.**
 * The badge beside the chip states the remainder in words, and until issue
 * #768's ruling of 2026-09-01 the rung and the floor read the same sentence --
 * `HUD_MESSAGE_KEY.fundsDeliveriesStopped`, chosen whenever `overdraftRemaining`
 * clamps to zero, which it does at the rung and everywhere below it alike. A
 * player who could not see the colours read one sentence for two states this
 * function tells apart. `overdraftDescription` now chooses a third key,
 * `HUD_MESSAGE_KEY.fundsTreasuryFloorExhausted`, on exactly the boundary this
 * function paints `critical` on -- `atTreasuryFloor`, over the published
 * `counts.treasuryOverdraftFloorMinorUnits` -- so the words and the colour
 * change together at both steps, not only the first. The sentence itself is
 * player-facing copy and `AGENTS.md`'s fourth exclusion reserves its final
 * wording to the owner; what shipped here is the clearest available draft,
 * flagged owner-pending, not a placeholder.
 */
function overdraftTone(counts: HudCountsViewModel): BadgeTone | undefined {
  const remaining = overdraftRemaining(counts);
  if (remaining === undefined || counts.treasuryMinorUnits >= 0) return undefined;
  if (remaining > 0) return 'warning';
  return atTreasuryFloor(counts) ? 'critical' : 'danger';
}

/**
 * `{remaining} left` under the balance while it is negative, and nothing at all
 * while it is not (the owner's ruling 18 of 2026-08-31, whose words these are).
 *
 * **Nothing while the prison is solvent**, which is `prisonersWithoutBedBadge`'s
 * rule and `coverageTone`'s reason: nine chips compete for one glance, and a
 * badge present in every screenshot is a badge nobody reads in the one
 * screenshot it matters in. A prison in credit is not carrying a facility it is
 * being asked to think about -- it is simply solvent, and the number above says
 * so.
 *
 * The remainder rides `numberParameters` rather than `parameters` so the strip
 * formats it exactly as it formats the balance it sits under; see that field.
 */
function overdraftBadge(counts: HudCountsViewModel): HudMetricBadge | undefined {
  const tone = overdraftTone(counts);
  const remaining = overdraftRemaining(counts);
  if (tone === undefined || remaining === undefined) return undefined;
  return { tone, textKey: HUD_MESSAGE_KEY.fundsRemaining, numberParameters: { remaining } };
}

/**
 * What `{remaining} left` is a remainder of, in a full sentence -- the chip's
 * tooltip and its screen-reader text (the owner's ruling of 2026-09-01).
 *
 * **Drawn exactly when the badge is drawn**, from the same two values, so a
 * chip can never carry a number whose explanation is missing or an explanation
 * with no number beside it. Both call `overdraftTone` and `overdraftRemaining`
 * rather than one deriving from the other, which is one comparison in two
 * places and not two rules.
 *
 * **Two keys, chosen on the same boundary the tone is chosen on.** Above the
 * rung the sentence is a warning about what will happen; at it, deliveries
 * have already stopped and a sentence in the future tense would be false. The
 * badge is amber then red across the same step, so the words and the colour
 * change together.
 *
 * **Three keys now, closing the gap issue #768's ruling of 2026-09-01 found.**
 * `overdraftTone` told the deliveries rung apart from the treasury floor from
 * the moment the third tone landed; this function did not -- `remaining`
 * clamps to zero at the rung and stays zero all the way to the floor and
 * below, so `fundsDeliveriesStopped` was the sentence at both `danger` and
 * `critical`, which differed only in colour. This function now asks
 * `atTreasuryFloor(counts)` directly -- the same boundary `overdraftTone`
 * already draws `critical` on, computed once so the two cannot disagree at
 * the edge -- and chooses `HUD_MESSAGE_KEY.fundsTreasuryFloorExhausted`
 * there instead. `danger` is untouched: it is still exactly the balance-below
 * the rung, above-the-floor case, and still reads `fundsDeliveriesStopped`.
 *
 * The remainder rides `numberParameters` for `overdraftBadge`'s reason: this
 * layer is pure and has no localizer, so it names the quantity and the strip
 * formats it -- and the tooltip's number then groups exactly as the badge's
 * does, which matters more here than anywhere because the two are read
 * together.
 */
function overdraftDescription(counts: HudCountsViewModel): HudMetricText | undefined {
  const tone = overdraftTone(counts);
  const remaining = overdraftRemaining(counts);
  if (tone === undefined || remaining === undefined) return undefined;
  if (atTreasuryFloor(counts)) return { textKey: HUD_MESSAGE_KEY.fundsTreasuryFloorExhausted };
  if (remaining <= 0) return { textKey: HUD_MESSAGE_KEY.fundsDeliveriesStopped };
  return { textKey: HUD_MESSAGE_KEY.fundsBeforeDeliveriesStop, numberParameters: { remaining } };
}

/**
 * What the `Earned today` chip is not paying, in a full sentence -- its
 * tooltip and its screen-reader text (issue #890).
 *
 * **Nothing at all while nothing is withheld**, which is `overdraftBadge`'s
 * rule: a chip that carries the same sentence in every screenshot is one
 * nobody reads in the screenshot it matters in. Absent and `0` are different
 * facts -- a payload written before the field existed against a prison
 * meeting every need -- and both correctly draw nothing.
 *
 * **It reads the published figure and does not derive one.** The undiminished
 * per-place rate is in `src/simulation/economy/income.ts`, which this module
 * may not import (`tests/unit/ui-hud-messages.test.ts`), and subtracting
 * before prorating would disagree with the chip's own value for most of every
 * day -- the projection's field carries the measured tick counts. So the
 * arithmetic stays where the rate is and this function only chooses whether
 * there is a sentence.
 *
 * The figure rides `numberParameters` for `overdraftDescription`'s reason:
 * this layer is pure and has no localizer, so it names the quantity and the
 * strip formats it exactly as it formats the value it sits under.
 */
function earnedWithheldDescription(counts: HudCountsViewModel): HudMetricText | undefined {
  const withheld = counts.stateIncomeWithheldTodayMinorUnits;
  if (withheld === undefined || withheld <= 0) return undefined;
  return { textKey: HUD_MESSAGE_KEY.earnedWithheld, numberParameters: { withheld } };
}

/**
 * The top strip, left to right.
 *
 * Order is part of the contract: a HUD whose metrics move between builds is
 * one a player has to re-read every time.
 *
 * **`roomNeeds` is the one input that is not a count, and it is optional**
 * ([#1006](https://github.com/matmaxalez/lockstate/issues/1006) finding 1).
 * It is the Rooms panel's own readout, pulled over the projection channel
 * rather than published on `simulation/status-counts`, so it is absent whenever
 * nothing has asked -- before a session exists, and after one stops. Optional
 * rather than defaulted for `roomsNotReadyBadge`'s reason: "nobody asked" and
 * "every room is ready" are different facts and only the second is a statement
 * about the prison, so neither may be spelled `0`.
 *
 * **`counts` is optional as of issue #1191, and absent means no prison has
 * reported.** Every descriptor then carries `value: undefined` and no badge,
 * tone, capacity or description, and the strip paints `UNKNOWN_READOUT_TEXT`
 * in each chip -- the `--` its clock has always painted in the same state.
 * Which chips exist, in what order, with which icon and label, is unchanged by
 * absence: that is the same list either way, and the paragraph on
 * `UNREPORTED_CHIP_ENUMERATION` below says how it stays one list.
 */
export function projectStatusMetrics(
  counts?: HudCountsViewModel,
  roomNeeds?: HudRoomNeedsViewModel,
): readonly HudMetricDescriptor[] {
  if (counts === undefined) return UNREPORTED_STATUS_METRICS;
  const hasIncidents = counts.activeIncidents > 0;
  const capacity = counts.prisonerCapacity > 0 ? counts.prisonerCapacity : undefined;

  return [
    {
      id: 'prisoners',
      icon: 'prisoners',
      labelKey: HUD_MESSAGE_KEY.prisoners,
      value: counts.prisoners,
      capacity,
      tone: occupancyTone(counts.prisoners, counts.prisonerCapacity),
      /**
       * **How many of the prisoners this chip counts have no bed** (issue
       * #609), or nothing when they all do.
       *
       * The chip keeps its raw value -- the roster is what a player asks this
       * chip for -- and the badge names the part of it the prison is not
       * being paid for. `occupiedPlaces` is the number the state grants
       * against, so the gap is exactly the population earning nothing, which
       * is the confusion issue #609 was found by having: twelve prisoners in
       * a three-bed prison paying like a three-prisoner one, with the number
       * that separates them computed, transmitted and thrown away at this
       * boundary.
       *
       * The bar beside it answers a different question and both are needed.
       * The bar is population against *accommodation capacity* -- how full
       * the prison is -- and it cannot see a bed that was removed under a
       * sleeping prisoner in a room that still has spare places elsewhere.
       */
      badge: prisonersWithoutBedBadge(counts),
      description: undefined,
    },
    {
      /**
       * **How many of the prisoners the chip to its left counts are on the
       * high-risk regime** (issue #703, the owner's fourth ruling of
       * 2026-08-31: *"`prisonersHighRisk` reaches the screen"*).
       *
       * The count crossed the worker boundary from ADR 0032 onward and nothing
       * in `src/ui/` read it; after ADR 0080 the tier behind it is the gate on
       * both a contraband introduction and an escape attempt, so it stopped
       * being a label on a roster row and became a fact about the prison.
       *
       * **Placed second rather than appended after `earned-today`**, against
       * the convention that descriptor records ("a new chip at the end adds a
       * column without moving one"). Two reasons, and the second is a
       * measurement rather than a preference:
       *
       * - It is the `coverage` chip's own argument one population over. This is
       *   `prisoners` at a second grain -- the same set of people, and the
       *   subset the prison has to staff and search for -- so reading
       *   "12 prisoners, 3 high risk" left to right is the whole statement,
       *   exactly as "5 staff, 12 covered, 4 unguarded" is.
       * - **The end of the row is where a chip goes to be invisible**, on the
       *   narrow viewports where the row scrolls: at 768x1024 the metrics row is
       *   744px and holds five of the nine chips, with the scrollbar suppressed
       *   so nothing says the other four exist (#634). Second is inside that
       *   five and last is not.
       *
       * **A third reason was written here and the measurement refuted it**, so
       * it is recorded rather than quietly dropped. It read that nine chips are
       * ~1234px of content against 1256px of metrics row at 1280x720, that
       * `hud.css` records `FUNDS` growing 85.8px -> 110.2px by a seven-figure
       * treasury, and that "a mid-game prison at 1280 overflows the row by a few
       * pixels and the *last* chip is the one that leaves". Measured on the real
       * page instead of arithmetic: the nine chips and their eight 16px gaps are
       * **1227.6px**, and with `FUNDS` set to `1,284,500` and `Earned today` to
       * `284,500` the row is **1252.0px against 1256px** -- so all nine are on
       * screen at 1280x720 at a mid-game treasury, with 4px to spare. (`Earned
       * today` does not grow at all: its *label* is wider than any value it can
       * hold.) The forward-looking half of that reason survives and the
       * conclusion does not: 4px is the whole of the desktop headroom left, so
       * the next chip, or a longer label in another locale, takes the last one
       * off screen -- but nothing is off screen today because of where this chip
       * was put.
       *
       * What the placement does cost, stated rather than implied: at 768x1024
       * five chips fit and the fifth is now `rooms` instead of `incidents`, so
       * `incidents` moves off screen at that width. #634 already measured 3 of 8
       * off screen there, the alerts region names an open incident in words, and
       * the owner's steer of the same day is that the desktop browser comes
       * first. Appending instead would leave 768 exactly as it was and put this
       * chip among the four nobody sees there.
       *
       * **No tone and no badge**, which is `funds`' reason rather than
       * `contraband`'s. A count of high-risk prisoners is not a failure -- it is
       * the population the prison has -- and nobody has set the number at which
       * it becomes one, so a permanent amber chip on a mature prison would be
       * exactly the *"status strip where several things are always amber"*
       * `coverageTone` refuses. `describePrisonerRow` in `roster-panel.ts`
       * already draws the line for the row badge: *"`warning` for high risk is
       * not a claim that the prisoner is a problem. It is that they are on the
       * restricted timetable"* -- a distinction a per-prisoner badge can carry
       * and a prison-wide counter cannot.
       */
      id: 'high-risk',
      // The Regime tab's own icon: this chip is the count of the prison that
      // tab's restricted timetable applies to, and pressing it is what a player
      // reading the chip would go on to do.
      icon: 'regime',
      labelKey: HIGH_RISK_LABEL_KEY,
      value: counts.prisonersHighRisk,
      capacity: undefined,
      tone: undefined,
      badge: undefined,
      description: undefined,
    },
    {
      id: 'staff',
      icon: 'staff',
      labelKey: HUD_MESSAGE_KEY.staff,
      value: counts.staff,
      capacity: undefined,
      tone: undefined,
      badge: undefined,
      description: undefined,
    },
    {
      /**
       * **How many prisoners the prison's guards are actually covering**
       * (issue #588).
       *
       * The value is the top rung; the badge splits the remainder into the
       * other two. Together they are the `Covered N / Understaffed N /
       * Unguarded N` the issue asks the strip for, *"so the 40s are
       * attributable"* -- since ADR 0064 the state withholds part of the
       * prisoner-day grant per unmet need, and `SafetyCoverageSystem` is what
       * decides whether `safety` is one of them for a given prisoner.
       *
       * **Placed beside `staff` rather than appended after `earned-today`**,
       * which is the convention the `earned-today` descriptor below records
       * ("a new chip at the end adds a column without moving one"). That
       * convention is about not moving a column a player has learned, and this
       * chip is a *staffing* readout whose only remedy is the control the chip
       * to its left counts: reading "5 staff, 12 covered, 4 unguarded" left to
       * right is the whole decision. The four chips it displaces move one
       * column right, once, in an interface no player has learned yet.
       *
       * **`counts.prisoners` is deliberately not the denominator and no
       * capacity is set.** The three rungs sum to the prisoners standing in a
       * sector, and a prisoner still in transit is in none of them, so a bar
       * reading "12 of 16" would be false at exactly the moments intake is
       * busy. The badge states the remainder instead, which is true whatever
       * the population is doing.
       */
      id: 'coverage',
      icon: 'security',
      labelKey: HUD_MESSAGE_KEY.coverage,
      value: counts.prisonersCovered,
      capacity: undefined,
      tone: coverageTone(counts),
      badge: coverageBadge(counts),
      /**
       * **The one sentence a stranded post gets** (ADR 0117, accepted by the
       * owner on 2026-09-17), and `undefined` on every other prison.
       *
       * The chip's own `title` and screen-reader text, exactly as the `FUNDS`
       * chip's is; the badge above carries the short form, so nothing is said
       * only here -- see `HudMetricDescriptor.description`, which states that
       * as a constraint rather than a remark.
       */
      description: counts.postUnreachable === true ? { textKey: HUD_MESSAGE_KEY.securityPostUnreachableHint } : undefined,
    },
    {
      id: 'rooms',
      icon: 'rooms',
      labelKey: HUD_MESSAGE_KEY.rooms,
      value: counts.rooms,
      capacity: undefined,
      /**
       * **The chip's own tone is deliberately left alone** while the badge
       * beside it carries the warning (#1006 finding 1).
       *
       * `prisonersWithoutBedBadge` states the rule this follows in the other
       * direction: there the chip already had `occupancyTone` as its escalation
       * channel, so the badge was not painted red as well. Here the chip has no
       * tone at all and the badge is the only signal, which keeps one fact to
       * one channel either way -- and keeps the strip from turning amber the
       * moment a player draws their first rectangle, which is the ordinary
       * state of a room that has just been designated.
       */
      tone: undefined,
      /**
       * **How many of the rooms this chip counts are not ready** (#1006
       * finding 1), or nothing when they all are and nothing when nobody has
       * asked.
       *
       * The chip keeps the raw count -- how many rooms the prison has is what a
       * player asks it for -- and the badge names the part of it that does not
       * work yet, which is `prisonersWithoutBedBadge`'s arrangement two chips
       * over. See `roomsNotReadyBadge` for why the answer comes from the
       * projection channel rather than from `counts`.
       */
      badge: roomsNotReadyBadge(roomNeeds),
      description: undefined,
    },
    {
      id: 'incidents',
      icon: 'incident',
      labelKey: HUD_MESSAGE_KEY.incidents,
      value: counts.activeIncidents,
      capacity: undefined,
      tone: hasIncidents ? 'danger' : undefined,
      // Colour is never the only signal: the badge states the condition in
      // words, so the strip still reads correctly in monochrome, to a
      // colour-blind player and to a screen reader.
      //
      // **The word itself now names the kind when one is nameable**
      // (issue #506 finding 2): `activeIncidentTypeLabelKey` is one of the
      // `incident-type.*.name` labels `src/content/simulation-message-keys.ts`
      // already authors -- "Assault", "Riot", "Escape Attempt", "Gang
      // Retaliation" -- reused as-is rather than new copy. It falls back to
      // the generic "Active" this strip has always shown whenever the worker
      // could not name exactly one kind: nothing is open, or (unreachable with
      // the shipped single-sector topology, ADR 0061 decision 6) more than one
      // distinct kind is open across several sectors at once. Either way the
      // fallback is a sentence this codebase already ships, never a guess at
      // one it does not.
      badge: hasIncidents
        ? { tone: 'danger', textKey: counts.activeIncidentTypeLabelKey ?? HUD_MESSAGE_KEY.incidentsActive }
        : { tone: 'success', textKey: HUD_MESSAGE_KEY.incidentsClear },
      description: undefined,
    },
    {
      id: 'contraband',
      icon: 'contraband',
      labelKey: HUD_MESSAGE_KEY.contraband,
      value: counts.contrabandFound,
      capacity: undefined,
      tone: counts.contrabandFound > 0 ? 'warning' : undefined,
      /*
       * **The chip says what was found, not only how much** -- the owner's
       * ruling 3 on issue #703, *"The message names what contraband was
       * found."*
       *
       * The incidents chip immediately above is the precedent, verbatim:
       * `contrabandNameKey` is one of the five `contraband.*.name` labels
       * `src/content/contraband-catalog.ts` already authors -- "Weapon",
       * "Drugs", "Phone", "Currency", "Tool" -- reused as-is rather than new
       * copy, exactly as issue #506 finding 2 reused `incident-type.*.name`.
       * Until this line nothing on screen read one of them, so a found phone
       * and a found weapon both rendered as the character `1`, and after
       * ADR 0080 a weapon is something a player's own neglect can produce.
       *
       * The key is not written here and must not be: it arrives from the
       * catalog through `HudCountsViewModel.contrabandNameKey`, so #703's own
       * `grep -rn "contraband\.weapon\.name" src/ui/` goes on returning
       * nothing and is not the check for whether this reader exists.
       *
       * **Where it differs from the incidents chip, and why there is no
       * fallback word.** That badge falls back to the generic "Active" for a
       * count it cannot name a single kind for. This one falls back to *no
       * badge*, because the generic word here would be the chip's own label:
       * a pill reading "Contraband" under a label reading "CONTRABAND" is not
       * a second channel, it is the same word twice. Absent is also what the
       * chip has always shown, so nothing regresses -- and the count beside it
       * still says whether anything was found.
       *
       * **The badge qualifies the whole count, which is why the projection
       * withholds the key rather than this deciding to ignore it.** A pill
       * reading "Phone" beside a `3` that includes a weapon would be a
       * statement about the prison that is false, which is `AGENTS.md`'s
       * fourth exclusion; the two conditions that keep it true are argued on
       * `StatusStripViewModel.counts.contrabandNameKey`.
       *
       * `'warning'`, the tone the chip itself already takes for any find, so
       * the pill does not grade a discovery differently from the number it
       * annotates. Severity is in the catalogue (`severity: 9` for a weapon,
       * `2` for currency) and is deliberately not read here: a badge that went
       * red for a weapon and amber for cash would be teaching a ranking the
       * game never states, which is the hidden mechanic the owner's standing
       * design directive rules out.
       */
      badge:
        counts.contrabandNameKey === undefined
          ? undefined
          : { tone: 'warning', textKey: counts.contrabandNameKey },
      description: undefined,
    },
    {
      id: 'funds',
      icon: 'build',
      labelKey: HUD_MESSAGE_KEY.funds,
      // The balance as the simulation holds it: a count of minor units,
      // formatted by the strip like every other count.
      //
      // **Not divided into a major unit, and not given a symbol.** #96
      // settled that money is the primary resource and named no currency, and
      // ADR 0017 is Accepted without naming one either -- so the unit and the
      // symbol are nobody's decision yet rather than a decision waiting on an
      // approval. Dividing by 100 and printing a symbol would take both by
      // implication, in a chip. A plain number under a label reading "Funds"
      // is the honest rendering of a quantity whose unit
      // nobody has chosen -- and every price in
      // `src/content/procurement-catalog.ts` is a whole number of these, so
      // the figure the player compares against is in the same units.
      //
      // That comparison is a real one since #89: the Build panel's buy
      // control renders `unit price × quantity` in these same units, so the
      // two numbers on screen can be read against each other without anybody
      // having chosen a currency to divide them by.
      value: counts.treasuryMinorUnits,
      capacity: undefined,
      // No tone. "Low on money" is a threshold, and a threshold is a balance
      // decision -- the same reason `BoundedValue` carries no severity band,
      // and ADR 0017 decision 5 reserves every such value to #29. That half is
      // unchanged and is still the whole reason this field is `undefined`.
      //
      // **The reason that used to follow it is false, and both directions are
      // kept rather than one overwritten.** It argued that the slope ran the
      // wrong way for a warning: that #29 had inverted the situation, since
      // the state now pays in once a day while the treasury had, in its words,
      // no outgoing side at all. That was true when it was written -- `4f711d5`
      // (#311, 2026-08-25) -- and it has since been falsified twice, once in
      // each of the two ways money leaves a treasury:
      //
      // - **A charge the player cannot decline.** `916ac46` (#455) made wages
      //   recurring: `PayrollSystem` bills every employee's
      //   `wageBand.minPerDay` at each in-game day boundary.
      // - **A charge the player makes without meaning to.** `a87b0d3` (#640)
      //   made a `PlaceBuildOrder` buy its own materials at the press, so one
      //   drag along a tile edge takes 80 a segment out of this very number.
      //
      // `git merge-base --is-ancestor 4f711d5 916ac46` holds, so the sentence
      // predated the first thing that falsified it by three days rather than
      // having been wrong when written.
      //
      // **So: this chip carries no tone because nobody has chosen the number,
      // not because there is no slope for a number to sit on.** Choosing it is
      // #29's, and `docs/research/2026-08-30-playing-into-the-lock.md` measured
      // what its absence costs -- a wall drag takes the balance from 25,000 to
      // 40 with this chip looking identical at both ends.
      //
      // Worth recording, because this comment used to say the opposite about
      // the *income* side. Until #29 it had to carry the qualifier "on a
      // schedule" -- the unqualified form was false from the day
      // `ProcurementSystem.cancel` landed, and
      // `tests/foundation/documentation-claims-contract.test.ts` was written
      // for exactly that defect. A scheduled credit now exists, so the claim
      // this comment once made is simply untrue and is gone rather than
      // qualified. That file now gates the outgoing direction as well, and the
      // paragraph above was one of the two sites it found. Neither phrase is
      // spelled out here: those checks read comments, so quoting what they hunt
      // for would trip them.
      //
      // **And on 2026-08-31 the chip took a tone after all, without any of the
      // above ceasing to be true.** The owner's ruling 18 paints it while the
      // balance is *negative* and red at the floor -- see `overdraftTone`, which
      // argues why that is not the threshold #29 reserves: nobody chose zero,
      // and nobody chose the floor either. The paragraphs above are kept whole
      // because what they refuse is still refused; there is no tone here for a
      // balance that is merely low.
      tone: overdraftTone(counts),
      // `{remaining} left` while the balance is negative, and nothing at all
      // while it is not. Until this line the standing overdraft (#703 ruling A)
      // reached the player as a minus sign and nothing else -- no tone, no
      // badge, no sentence -- so a player met the facility by hitting it.
      badge: overdraftBadge(counts),
      /*
       * **The one chip on this strip with a description, and the owner's
       * ruling of 2026-09-01 is the whole reason it has one.** The badge above
       * says `{remaining} left` and cannot say what the remainder is *of*: the
       * wording that did -- `{remaining} left before deliveries stop` -- was
       * measured at +133px of chip and pushed this very chip off the visible
       * edge of the row at 1280x800. So the short badge stays and the sentence
       * goes here, where `.ui-sr-only` and `title` cost no width, and into the
       * refusal alert, where it reaches a player who never hovers.
       */
      description: overdraftDescription(counts),
    },
    {
      id: 'earned-today',
      // The clock's own icon, because this figure is a statement about the
      // in-game day rather than about money: it resets when the day does.
      icon: 'clock',
      labelKey: HUD_MESSAGE_KEY.earnedToday,
      // What this day has earned so far, in the same minor units as the
      // balance above -- so the two chips sit beside each other and can be
      // read against each other without a conversion nobody has chosen.
      //
      // **Appended after `funds` deliberately.** The strip's descriptor list is
      // the single definition of which metrics exist and in what order
      // (`status-strip.ts` walks it to build the DOM), so a new chip at the end
      // adds a column without moving one.
      value: counts.stateIncomeAccruedTodayMinorUnits,
      capacity: undefined,
      // No tone and no badge, for the same reason `funds` has neither: "a good
      // day" is a threshold, and nobody has set one.

      tone: undefined,
      badge: undefined,
      // **And a description, which is not a tone and not a badge** (issue
      // #890). The two lines above refuse a threshold nobody has set; this
      // states a figure the simulation already computes and the player has no
      // other way to read -- what today's grant is not paying because
      // residents have needs going unmet. `funds` above is the precedent for
      // the placement as well as the shape: the owner's ruling of 2026-09-01
      // put a sentence here rather than in a badge because `.ui-sr-only` and
      // `title` cost no chip width, and this row's width is measured
      // (`tests/browser/ui-strip-badged-width.spec.ts`).
      description: earnedWithheldDescription(counts),
    },
  ];
}

const SEVERITY_TONES: Readonly<Record<HudSeverity, BadgeTone>> = {
  info: 'info',
  warning: 'warning',
  danger: 'danger',
};

const SEVERITY_LABEL_KEYS: Readonly<Record<HudSeverity, LocalizationKey>> = {
  info: HUD_MESSAGE_KEY.severityInfo,
  warning: HUD_MESSAGE_KEY.severityWarning,
  danger: HUD_MESSAGE_KEY.severityDanger,
};

export function severityTone(severity: HudSeverity): BadgeTone {
  return SEVERITY_TONES[severity];
}

/** The word that accompanies a severity colour, so the colour never stands alone. */
export function severityLabelKey(severity: HudSeverity): LocalizationKey {
  return SEVERITY_LABEL_KEYS[severity];
}

/**
 * What to tell the player when the host refused the action a control asked
 * for (issue #207).
 *
 * A *command* -- a clock change, a build order, a purchase, an undo -- asks
 * the simulation to change and changes nothing locally, so a refusal means the
 * prison is exactly as it was and the player has to be told, or the control
 * they pressed is a control that silently did nothing (issue #82's point). "The
 * control they pressed" is a key for the undo pair and there is no button to
 * mark, which changes where the report lands and not whether one is owed.
 *
 * A *chrome* intent returns `undefined`, and that is the whole reason this
 * is a mapping rather than one generic sentence: selecting a tab, folding a
 * panel or arming the build tool has **already been applied locally** before
 * the host is told, so a failure to notify the host is not something the
 * player did not get. Saying "that did not go through" about a tab that
 * visibly did would be a false statement on screen -- the failure still
 * reaches the host through `MountHudOptions.onError`.
 *
 * ## `reason`, and why the `actionId` alone stopped being enough
 *
 * The owner's ruling 18 of 2026-08-31. Every prison has a standing overdraft
 * (#703 ruling A, ADR 0083 §2), so a purchase this thread refuses on money has
 * reached the end of what the state will carry rather than run the prison out
 * of it -- a **limit**, which is a different thing for a player to know and a
 * different thing for them to do about. The `actionId` names the control and
 * cannot carry that, so the composition root attaches the reason to what it
 * throws (`src/ui/host-refusal.ts`) and it arrives here beside the control.
 *
 * **The reason narrows a sentence and never invents one.** A reason on a
 * control this pair has no sentence for falls through to that control's own
 * key, and a reason on a chrome intent still returns `undefined`: the mapping's
 * subject is still the control, and a claim about money on a control that
 * spends none would be exactly the false statement the paragraph above refuses.
 */
export function refusalMessageKey(actionId: string, reason?: HostRefusalReason): LocalizationKey | undefined {
  if (reason === 'past-the-overdraft-floor') {
    switch (actionId) {
      case 'purchase-materials':
        return HUD_MESSAGE_KEY.refusalPurchaseMaterialsPastFloor;
      case 'hire-staff':
        return HUD_MESSAGE_KEY.refusalHireStaffPastFloor;
      default:
        break;
    }
  }
  /*
   * The owner's ruling of 2026-09-03: a refused Admit names the missing thing
   * rather than saying only that the request was refused. Narrowing by reason
   * exactly as the overdraft floor above does, and falling through to the
   * control's own key for every other reason, which is the property the
   * docblock above calls "narrows a sentence and never invents one".
   */
  if (reason === 'no-room-to-hold-anybody' && actionId === 'admit-prisoner') {
    return HUD_MESSAGE_KEY.refusalAdmitPrisonerNoRoom;
  }
  switch (actionId) {
    case 'set-clock':
      return HUD_MESSAGE_KEY.refusalSetClock;
    case 'place-build-order':
      return HUD_MESSAGE_KEY.refusalPlaceBuildOrder;
    case 'purchase-materials':
      return HUD_MESSAGE_KEY.refusalPurchaseMaterials;
    case 'hire-staff':
      return HUD_MESSAGE_KEY.refusalHireStaff;
    case 'undo':
      return HUD_MESSAGE_KEY.refusalUndo;
    case 'redo':
      return HUD_MESSAGE_KEY.refusalRedo;
    case 'zone-room':
      return HUD_MESSAGE_KEY.refusalZoneRoom;
    case 'unzone-room':
      return HUD_MESSAGE_KEY.refusalUnzoneRoom;
    case 'admit-prisoner':
      return HUD_MESSAGE_KEY.refusalAdmitPrisoner;
    case 'cancel-build-order':
      return HUD_MESSAGE_KEY.refusalCancelBuildOrder;
    case 'cancel-material-purchase':
      return HUD_MESSAGE_KEY.refusalCancelMaterialPurchase;
    case 'sell-materials':
      return HUD_MESSAGE_KEY.refusalSellMaterials;
    case 'release-guard':
      return HUD_MESSAGE_KEY.refusalReleaseGuard;
    default:
      return undefined;
  }
}

/**
 * A row of zeros that never reaches a screen, used to enumerate the chips.
 *
 * It exists so that "which chips the strip has" has exactly one definition
 * (issue #1191). The alternative -- a second table of ids, icons and label
 * keys for the unreported state -- is the drift this file refuses everywhere
 * else: a tenth chip added to `projectStatusMetrics` and not to that table
 * would simply vanish from the strip until a prison reported, and no type
 * would notice.
 *
 * **Every number it produces is discarded** by the mapping below, which keeps
 * `id`, `icon` and `labelKey` and blanks the rest.
 * `tests/unit/ui-hud-projection.test.ts` pins that: no descriptor of
 * `projectStatusMetrics()` carries a value, a badge, a tone, a capacity or a
 * description, and the ids match the reported list one for one.
 */
const UNREPORTED_CHIP_ENUMERATION: HudCountsViewModel = {
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

/**
 * What the strip is told to show when no prison has reported (issue #1191):
 * the same chips in the same order, each with nothing in it.
 *
 * Computed once at module load, from the enumeration above, and frozen by
 * being a `const` of `readonly` descriptors -- the strip walks it on first
 * paint and on every message that carries no counts.
 */
const UNREPORTED_STATUS_METRICS: readonly HudMetricDescriptor[] = projectStatusMetrics(
  UNREPORTED_CHIP_ENUMERATION,
).map((descriptor) => ({
  id: descriptor.id,
  icon: descriptor.icon,
  labelKey: descriptor.labelKey,
  value: undefined,
  capacity: undefined,
  tone: undefined,
  badge: undefined,
  description: undefined,
}));
