import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';

/**
 * What the HUD needs in order to draw itself -- and nothing else.
 *
 * `AGENTS.md` boundary 1: "Rendering is not simulation." The HUD is a view
 * over snapshots and may never become a source of truth, so this module
 * imports nothing from `src/simulation/**` and the HUD is handed plain,
 * already-projected data by whoever owns the simulation connection. A
 * `HudViewModel` is a value: constructing one in a test needs no worker, no
 * kernel and no renderer.
 *
 * Text never crosses this boundary in either direction. The view model
 * carries **message keys**, not translated strings (ADR 0011): a key is a
 * stable identifier that the simulation may hold and persist, whereas a
 * translated string may not be persisted, hashed, compared or branched on.
 * The HUD resolves keys to text at the last possible moment and nothing it
 * resolves ever travels back out.
 */

export type HudClockMode = 'paused' | 'running';

/** Matches the simulation protocol's clock speeds (`src/simulation/protocol/types.ts`). */
export const HUD_SPEEDS = [1, 2, 4] as const;
export type HudSpeed = (typeof HUD_SPEEDS)[number];

export function isHudSpeed(value: number): value is HudSpeed {
  return (HUD_SPEEDS as readonly number[]).includes(value);
}

/**
 * Where the authoritative simulation clock has got to.
 *
 * In the simulation's own units, deliberately. There is **no hour-of-day
 * anywhere in Lockstate**: a day is a budget of ticks, and the number of
 * ticks in one is a candidate value rather than a balance decision
 * (`docs/HUD_PROJECTIONS.md`, gap 5). So the boundary carries the tick
 * position and the HUD draws how far through the day that is -- rather than
 * a 24-hour readout that would put an `07:45` on screen that no system
 * produces.
 *
 * Every field is what the worker last reported. Nothing here is extrapolated
 * from wall time on this thread: a clock the main thread advanced by itself
 * would drift away from the simulation the moment a tab was throttled, and
 * would keep counting after the worker died.
 */
export interface HudClockViewModel {
  /**
   * The in-game day, counting from `1`.
   *
   * `0` is the sentinel for *unknown* -- no session has reported a clock yet
   * -- and is deliberately not a day number: it is rendered as unknown rather
   * than as day one. See `UNKNOWN_HUD_CLOCK`.
   */
  readonly day: number;
  /** `0 .. dayLengthTicks - 1`. */
  readonly tickOfDay: number;
  /**
   * How many ticks one in-game day lasts, as the simulation defines it.
   *
   * `0` means *unknown* -- no session has reported a clock -- and the day
   * position is then shown as unknown rather than as the start of day one.
   * The HUD is handed this instead of holding a constant of its own: the
   * value belongs to the simulation (`AGENTS.md` boundary 1), and a copy on
   * this side of the boundary would silently disagree with it the day the
   * balance changed.
   */
  readonly dayLengthTicks: number;
  readonly mode: HudClockMode;
  readonly speed: HudSpeed;
}

/**
 * The dense top-strip counts.
 *
 * The treasury balance is the only money the *strip* carries (#96).
 *
 * That line is exactly where the honest boundary falls. There **is** a
 * treasury: a balance a purchase spends from, carried in the save, published
 * by the same channel as every other count. There is **no** budget, forecast,
 * income or running cost, because nothing credits the treasury on a schedule.
 * ADR 0017 decision 6 now settles what the state pays for -- per prisoner-day,
 * accrued per occupied place -- and nothing implements it, which is the state
 * this line describes: the answer exists, the accrual does not.
 *
 * It is no longer the only money *the HUD* carries, and the difference is
 * #89's: `HudBuildMaterialViewModel` below carries a unit price, so the Build
 * panel renders what a purchase would cost and issues the purchase that
 * spends this balance. Both figures are produced by something -- the price by
 * `src/content/procurement-catalog.ts`, the balance by the treasury -- which
 * is what the rule this interface has always followed actually demands: a HUD
 * that displays a number no system produces is a lie with a place to sit. A
 * balance is produced. A price is produced. A budget is not.
 */
export interface HudCountsViewModel {
  readonly prisoners: number;
  /** Total cell capacity. `0` means "unknown/none", and the occupancy bar is then omitted rather than guessed. */
  readonly prisonerCapacity: number;
  readonly staff: number;
  readonly rooms: number;
  readonly activeIncidents: number;
  readonly contrabandFound: number;
  /**
   * The treasury balance in minor units (#96).
   *
   * Minor units all the way to the DOM, and converted for display at the
   * last possible moment, for the same reason the simulation holds it that
   * way: an integer is exact and a fraction of a currency is not. The strip
   * formats it; nothing upstream of the formatter knows what a "major unit"
   * is, which is what keeps a currency decision out of the view model.
   */
  readonly treasuryMinorUnits: number;
}

export type HudSeverity = 'info' | 'warning' | 'danger';

export interface HudAlertViewModel {
  /** Stable identity for the row, so a list update is not a full rebuild. */
  readonly id: string;
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
  readonly labelParameters?: MessageParameters;
  readonly severity: HudSeverity;
}

/**
 * Which edge of a tile a wall order occupies.
 *
 * Deliberately re-declared here rather than imported: the HUD may not import
 * `src/simulation/**` (`AGENTS.md` boundary 1, checked by
 * `tests/unit/ui-hud-messages.test.ts`, "imports nothing from the
 * simulation"). The simulation's `BuildEdge` is the
 * authority; this is the wire shape the host translates to and from, and
 * `tests/unit/ui-hud-build-panel.test.ts` pins the two to the same members so
 * they cannot drift silently.
 */
export const HUD_BUILD_EDGES = ['north', 'west'] as const;
export type HudBuildEdge = (typeof HUD_BUILD_EDGES)[number];

/**
 * What a buildable is made of, and what that material costs to buy (#89).
 *
 * Every figure here is **content the host passes through**, never something
 * the HUD knows: the unit price lives in `src/content/procurement-catalog.ts`,
 * the per-placement quantity in the buildable registry, and the ceiling in
 * `src/simulation/economy/`. The panel multiplies and formats them and holds
 * no table of its own, for the same reason `HudCountsViewModel` carries the
 * balance rather than a currency: a copy on this side of the boundary would
 * silently disagree with the simulation the day a price moved.
 *
 * Absent from a buildable whose materials cannot be bought at all, and that
 * is a real state rather than a defensive default: `PROCURABLE_MATERIALS`
 * covers exactly the two items the two shipped buildables consume, and a
 * third buildable made of something unpurchasable must offer no purchase
 * control rather than one that would be refused.
 */
export interface HudBuildMaterialViewModel {
  /** Stable content id. Travels back out unchanged in the intent. */
  readonly itemId: string;
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
  /**
   * What one unit costs, in the same minor units
   * `HudCountsViewModel.treasuryMinorUnits` is counted in -- so the total the
   * panel renders and the balance the strip renders are the same scale, and
   * the player can compare them without a conversion nobody has chosen.
   */
  readonly unitPriceMinorUnits: number;
  /**
   * How many units one placement of this buildable consumes.
   *
   * It is the quantity stepper's starting value: one wall's worth, derived
   * from content rather than a round number somebody picked.
   */
  readonly quantityPerPlacement: number;
  /** The largest quantity one purchase may ask for, as the simulation bounds it. */
  readonly maxQuantity: number;
}

export interface HudBuildableViewModel {
  /** Stable simulation id. Travels back out unchanged in the intent. */
  readonly definitionId: string;
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
  /**
   * Whether this buildable sits on a tile edge and therefore needs an
   * orientation. False hides the edge chooser rather than showing a control
   * whose value would be ignored.
   */
  readonly occupiesEdge: boolean;
  /** Absent when nothing this buildable is made of can be bought. */
  readonly material?: HudBuildMaterialViewModel;
}

/**
 * What the Build panel can offer.
 *
 * Supplied once at mount rather than per snapshot: the buildable catalog is
 * content, not session state, and rebuilding the option list on every frame
 * would drop focus out of the panel while somebody was typing a coordinate.
 */
export interface HudBuildViewModel {
  readonly buildables: readonly HudBuildableViewModel[];
  /** Where the placement fields start -- typically the middle of owned land. */
  readonly origin: { readonly x: number; readonly y: number };
}

/**
 * The authored floor on a room's area, as the panel reads it.
 *
 * Three numbers rather than two, because content authors three: a room asks
 * for a minimum width, a minimum height *and* a minimum tile count, and while
 * every shipped definition sets the third to the product of the first two, a
 * future room could ask for six tiles in any 2x4 shape. The panel shows the
 * two sides, because those are what a drag controls; the third is what the
 * simulation refuses on, and the refusal says so in its own sentence.
 */
export interface HudRoomMinimumViewModel {
  readonly width: number;
  readonly height: number;
}

/**
 * What the room definition asks about being indoors.
 *
 * `'none'` is a real answer -- the catalogue entry carries neither
 * requirement -- and not a fallback, which is why it is a third member rather
 * than an absent field.
 */
export type HudRoomEnclosureRequirement = 'enclosed' | 'outdoors' | 'none';

/**
 * One row of the Rooms panel's catalogue.
 *
 * Simpler than `HudBuildableViewModel`, and the difference is content's rather
 * than this layer's: every one of the 18 room definitions carries a real
 * `nameKey`, so there is no id-to-key mapping table on the host side at all.
 * `BUILDABLE_LABEL_KEY` in `src/main.ts` exists only because the buildable
 * registry carries a hard-coded English `name` and no key
 * (`docs/HUD_PROJECTIONS.md` gap 32); rooms have no such gap.
 */
export interface HudRoomViewModel {
  /** Stable simulation id (`room.cell`). Travels back out unchanged in the intent. */
  readonly roomId: string;
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
  /**
   * The colour the world tints this room's tiles, so the catalogue row and the
   * designation on the map agree without the player having to learn a legend.
   *
   * A number, not a class name: the tint lives in
   * `src/rendering/world/appearance.ts` and is keyed on the room's *category*,
   * so a stylesheet copy of it would be a second table to drift.
   */
  readonly tint: number;
  /** Absent when the definition authors no minimum, which is content's statement and not a default. */
  readonly minimum?: HudRoomMinimumViewModel;
  readonly enclosure: HudRoomEnclosureRequirement;
}

/**
 * What the Rooms panel can offer.
 *
 * Supplied once at mount, exactly as `HudBuildViewModel` is and for the same
 * reason: the room catalogue is content rather than session state, and
 * rebuilding the list every frame would drop the selection the player just
 * made.
 */
export interface HudRoomsViewModel {
  readonly rooms: readonly HudRoomViewModel[];
}

/**
 * What the simulation said about the last room the player designated.
 *
 * Session state, unlike `HudRoomsViewModel`: it arrives on
 * `simulation/status-counts` and changes as the player works, so it lives on
 * `HudViewModel` rather than being passed at mount.
 *
 * It is a **readout, not a refusal**, and the distinction is the whole reason
 * this field exists rather than a seventh zoning refusal reason. The
 * simulation evaluates the room definition's `enclosed`/`outdoors` requirement
 * against the rectangle's own perimeter and accepts the room either way,
 * because the check is narrower than enclosure -- a room drawn inside a larger
 * sealed building reads as open -- and because a door cannot currently seal
 * anything. So the honest surface is one that *tells* the player what they
 * designated. See `src/simulation/rooms/enclosure.ts`.
 *
 * `sequence` is the notice's ordinal, so a repeated publication of an
 * unchanged notice updates the row the player is looking at instead of
 * rebuilding it -- the same job `HudAlertViewModel.id` does.
 */
export interface HudZoningNoticeViewModel {
  readonly sequence: number;
  readonly enclosure: 'sealed' | 'open';
  readonly requirement: HudRoomEnclosureRequirement;
}

/**
 * A staff role the player may hire, and what one hire will spend
 * ([ADR 0025](../../../docs/adr/0025-guard-hiring-surface.md)).
 *
 * Both figures are **content the host passes through**, never something the
 * HUD knows: the label is the role's own `nameKey` from
 * `src/content/staff-role-catalog.ts`, and the charge is that role's
 * `wageBand.minPerDay` read through the simulation's own
 * `staffHireCostMinorUnits`, so the number on the button and the number the
 * treasury is debited come from one definition. A copy of either on this side
 * of the boundary would silently disagree with the simulation the day a band
 * moved -- the same rule `HudBuildMaterialViewModel` follows for a unit price.
 */
export interface HudStaffRoleViewModel {
  /** Stable content id. Travels back out unchanged in the intent. */
  readonly staffRoleId: string;
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
  /**
   * What one hire costs, in the same minor units
   * `HudCountsViewModel.treasuryMinorUnits` is counted in -- so the figure the
   * panel renders and the balance the strip renders are the same scale, and
   * the player can compare them without a conversion nobody has chosen.
   */
  readonly hireChargeMinorUnits: number;
}

/**
 * What the Staff panel can offer.
 *
 * Supplied once at mount rather than per snapshot, for the reason
 * `HudBuildViewModel` is: the staff-role catalogue is content, not session
 * state, and rebuilding the list on every frame would move the selection under
 * somebody's finger.
 *
 * An empty list is a real state and the panel says so rather than rendering a
 * blank box: a host that published no roles offers no hire.
 */
export interface HudStaffViewModel {
  readonly roles: readonly HudStaffRoleViewModel[];
}

export interface HudViewModel {
  readonly counts: HudCountsViewModel;
  readonly clock: HudClockViewModel;
  readonly alerts: readonly HudAlertViewModel[];
  /** Absent until this session has designated a room. Not zeroed -- see the interface. */
  readonly zoning?: HudZoningNoticeViewModel;
}

/**
 * No session has reported a clock.
 *
 * `day: 0` and `dayLengthTicks: 0` both mean "not known", and the strip
 * renders them as such. `speed: 1` is not a claim about the simulation: it
 * is what the *next* play command will ask for, and the transport controls
 * read it for exactly that.
 */
export const UNKNOWN_HUD_CLOCK: HudClockViewModel = {
  day: 0,
  tickOfDay: 0,
  dayLengthTicks: 0,
  mode: 'paused',
  speed: 1,
};

/**
 * The localization surface the HUD actually uses.
 *
 * A structural port rather than the concrete `Localizer` class: the HUD
 * needs two methods, and depending on only those keeps it drivable from a
 * test stub. `Localizer` (src/services/localization/localizer.ts) satisfies
 * this as written.
 */
export interface HudLocalizer {
  format(key: LocalizationKey, parameters?: MessageParameters): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
}

/**
 * An empty prison, for a first paint before any snapshot has arrived.
 *
 * The clock reads *unknown*, not "day 1, paused, at the start of the day".
 * Before a session exists there is no simulation clock to report, and a
 * confident readout of a clock that is not running is the exact failure the
 * transport controls used to have: something on screen that looks like
 * state and is not.
 */
export const EMPTY_HUD_VIEW_MODEL: HudViewModel = {
  counts: {
    prisoners: 0,
    prisonerCapacity: 0,
    staff: 0,
    rooms: 0,
    activeIncidents: 0,
    contrabandFound: 0,
    treasuryMinorUnits: 0,
  },
  clock: UNKNOWN_HUD_CLOCK,
  alerts: [],
};
