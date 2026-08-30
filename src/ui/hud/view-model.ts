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
 * by the same channel as every other count -- and, since #29, what the state
 * pays for running the place. ADR 0017 decision 6 settles the basis (per
 * prisoner-day, accrued per occupied place) and `StateIncomeSystem` implements
 * it, crediting the balance at the end of each in-game day, so the second
 * figure below is a day's accrual against a real payment rather than a number
 * with nothing behind it.
 *
 * **This paragraph ended "There is still **no** budget, forecast, payroll or
 * running cost: nothing debits the treasury on a schedule, and nothing
 * projects anything forward", and half of it went false on 2026-08-28.** It
 * was written at `4f711d5` (#311), when it was true of the whole tree.
 * `916ac46` (#455, ADR 0049) then added `PayrollSystem`
 * (`src/simulation/economy/payroll.ts`), whose `schedule` is
 * `{ intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 }` and
 * whose `update` calls `Treasury.spend` -- a payroll, and a debit on a
 * schedule, which is two of the four things that sentence denied. What
 * survives is the other two: **there is still no budget and no forecast, and
 * nothing projects anything forward**, which is the half the rule below
 * actually rests on, because a forecast is the figure with nothing behind it.
 *
 * Both directions are kept rather than the sentence rewritten, because the
 * reason it was written has not changed and because this is the shape
 * `docs/AGENT_WORKFLOW.md` §4 names: a sentence asserting an absence rots
 * first, and adding the thing it denies never touches the sentence denying it.
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
  /**
   * How many prisoners the prison has somewhere to live -- the denominator of
   * the occupancy bar and of `occupancyTone`'s over-capacity warning.
   *
   * Published, never derived here: it is `counts.accommodationCapacity`
   * (`src/ui/simulation-counts.ts`), the summed resident capacity of the rooms
   * `IntakeSystem` would house an arrival in. It said "total cell capacity"
   * while nothing filled it; the simulation now scopes it from the
   * `AccommodationPolicy` rather than from a room id, so `room.solitary-cell`
   * counts and a furnished infirmary does not.
   *
   * `0` still means "unknown/none", and the bar is then omitted rather than
   * guessed -- which is the honest reading of a prison with no bed in it.
   */
  readonly prisonerCapacity: number;
  /**
   * How many prisoners are holding a residency place **that currently
   * exists** -- the count the state pays on, and the one the `PRISONERS`
   * chip's *"N with no bed"* badge is subtracted from (issue #609).
   *
   * Published, never derived here: it is `counts.occupiedPlaces`
   * (`src/ui/simulation-counts.ts`), which the projection fills from
   * `RoomInstanceRegistry.residentIdsWithExistingPlace().length` and
   * `StateIncomeSystem` grants against on the same list.
   *
   * **Not `roomOccupants`, and the difference is the whole reason this field
   * is here.** `roomOccupants` is *assignments*, and ADR 0028 decision 2
   * keeps an assignment alive when the bed under it is taken away
   * (*"Nobody is evicted"*), so a prisoner whose bed was removed still counts
   * as housed there. This field is *places*, so that prisoner stops counting
   * the moment the bed does -- which is the moment the money stops and the
   * moment a player most needs to be told.
   *
   * `0` is a real state, not "unknown": it is every prison before its first
   * prisoner is housed, and every prison whose last bed has been taken out
   * from under somebody.
   */
  readonly occupiedPlaces: number;
  readonly staff: number;
  readonly rooms: number;
  /**
   * How many prisoners are standing in a sector on each rung of the guard
   * coverage ladder (issue #588): all the guards it asks for, some of them,
   * none of them.
   *
   * Published, never derived here, exactly like `prisonerCapacity` above --
   * `SafetyCoverageSystem` produces the three on the same walk that
   * provisions the `safety` need, so the readout and the provisioning cannot
   * disagree. They sum to the prisoners **in a sector**, which is not
   * necessarily `prisoners`: an arrival still in transit is in neither, so
   * none of the three may be derived from that count by subtraction.
   *
   * All three zero is a real state and not "unknown": it is a prison with
   * nobody in a sector, which is every prison before its first admission.
   */
  readonly prisonersCovered: number;
  readonly prisonersUnderstaffed: number;
  readonly prisonersUnguarded: number;
  readonly activeIncidents: number;
  /**
   * A message key naming the kind of the incident `activeIncidents` counts,
   * when the worker could name exactly one -- issue #506 finding 2.
   *
   * **Absent, not present-and-`undefined`**, both when nothing is open and
   * when more than one distinct kind is open at once (unreachable with the
   * shipped single-sector topology, ADR 0061 decision 6; possible with
   * several sectors open on different kinds). Both are "cannot name one
   * kind", which is one fact, not two, so this field does not distinguish
   * them -- the strip's badge already has `activeIncidents` beside it to say
   * whether anything is open at all. Optional rather than a required
   * `LocalizationKey | undefined`, matching the same field one layer down
   * (`StatusStripViewModel.counts.activeIncidentType`,
   * `src/simulation/presentation/status-strip-projection.ts`) and for the
   * same reason: that field crosses a channel where a present-but-`undefined`
   * value fails to decode, and a translator that turned "absent" into
   * "present and `undefined`" here would be reintroducing the shape that
   * channel refuses, one hop later.
   *
   * Computed in `src/ui/simulation-counts.ts` from the worker's stable
   * `activeIncidentType` id via `deriveSimulationMessageKey('incident-type',
   * ...)`, never here: the HUD may not import `src/simulation/**`
   * (`AGENTS.md` boundary 1) and resolves no text of its own, so this is
   * already the finished message key, exactly the shape every other
   * `*LabelKey` field in this file takes.
   */
  readonly activeIncidentTypeLabelKey?: LocalizationKey;
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
  /**
   * What the in-game day in progress has earned so far, in the same minor
   * units (#29).
   *
   * The rising readout beside the balance. It is **published, never
   * computed here**: the simulation derives it from the tick and the
   * occupied-place count (`stateIncomeAccruedByTick`) and sends it on the
   * status-counts channel, because a HUD that computed a simulation figure
   * from a tick it happens to hold would be a second, drifting authority on
   * what the prison has earned.
   */
  readonly stateIncomeAccruedTodayMinorUnits: number;
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
 * Which edge of a tile an edge-geometry order occupies.
 *
 * This said "a wall order" until issue #531. A wall is no longer the only
 * thing that occupies an edge -- `door-wooden` names a `placesDoor` and writes
 * `DOOR_EDGE_NUMERIC_ID` -- so the narrower sentence had become a claim about
 * content rather than about the vocabulary.
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
 * The edge an order means when nobody chose one.
 *
 * Re-declared for the same reason `HUD_BUILD_EDGES` above is, held to the
 * simulation's `DEFAULT_BUILD_EDGE` by the same test, and named rather than
 * left as the literal `'north'` because #531 gave it a second reader: the
 * Build panel seeds its retained edge with it *and* falls back to it for an
 * intent whose chooser is hidden (`intentEdge`). Two spellings of one default
 * is how the panel would come to submit an edge the simulation does not
 * resolve to.
 */
export const HUD_DEFAULT_BUILD_EDGE: HudBuildEdge = 'north';

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
   *
   * "Would be ignored" was the whole justification and it was only ever true of
   * the *consumer*. The panel went on submitting the hidden control's retained
   * value, so a row that reached `place-build-order` with `occupiesEdge: false`
   * carried the last edge some other row had been given (#531). It no longer
   * does -- `intentEdge` in `build-panel.ts` resolves a hidden chooser to
   * `HUD_DEFAULT_BUILD_EDGE` -- so the sentence is now true of what is sent as
   * well as of what is read.
   *
   * The composition root answers this with `occupiesTileEdge`, not with
   * `category === 'wall'`. The difference is a door.
   */
  readonly occupiesEdge: boolean;
  /**
   * Whether this buildable puts a discrete object on a tile (ADR 0028 phase 1).
   *
   * The sibling of `occupiesEdge`, and a *shape* fact in the same sense: it
   * decides which gesture the world pointer performs (a footprint press rather
   * than an edge run) and which command the panel's numeric fields produce.
   * Both are answers the composition root supplies, because what a buildable
   * places is simulation content the HUD may not read (`AGENTS.md` boundary 1).
   *
   * The two are not opposites, and `door-wooden` is why. That case read: *"it
   * sits on no edge and places no object, which is a shipped defect this phase
   * deliberately leaves as it found it (see `edgeNumericIdFor`)"*. Both halves
   * of that have since closed. `door-wooden` names a `placesDoor` and writes
   * `DOOR_EDGE_NUMERIC_ID`, so it *does* occupy an edge; and since #531 the
   * composition root derives this row's `occupiesEdge` from `occupiesTileEdge`
   * rather than from `category === 'wall'`, so a door answers `true` here and
   * `false` to `placesObject` -- an edge row that places no object, which is
   * the shape the wall route was always for. A row answering `false` to both
   * is still expressible and still takes the wall route unchanged; no
   * buildable in the registry is one today.
   */
  readonly placesObject: boolean;
  /**
   * Which group of the catalogue this row belongs to
   * ([ADR 0035](../../../docs/adr/0035-buildable-catalogue-category-filter.md)).
   *
   * An **opaque id** the panel compares and never renders. It is not an
   * `ObjectCategory`, and the panel is deliberately not told that such a type
   * exists: two of the twenty-one buildables place no object and therefore
   * have no object category at all, so the composition root mints a group for
   * them and the panel's only requirement is that equal ids mean one group.
   * That is the same treatment `definitionId` gets and for the same reason
   * (`AGENTS.md` boundary 1).
   *
   * Required rather than optional, because a row with no group would be a row
   * the filter could only ever hide or only ever show, and neither is a state
   * the panel should have to have an opinion about. The host answers for every
   * row -- see `buildableCategory` in `src/main.ts`.
   */
  readonly categoryId: string;
  /** What that group is called. A message key, never text. */
  readonly categoryLabelKey: LocalizationKey;
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
 * Where one queued build order has got to.
 *
 * Deliberately re-declared here rather than imported, exactly as
 * `HUD_BUILD_EDGES` is and for the same reason: the HUD may not import
 * `src/simulation/**` (`AGENTS.md` boundary 1, checked by
 * `tests/unit/ui-hud-messages.test.ts`). `PENDING_BUILD_ORDER_STATES` in
 * `src/simulation/presentation/construction-projection.ts` is the authority;
 * this is the wire shape the host translates to, and
 * `tests/unit/ui-hud-build-panel.test.ts` pins the two to the same members so
 * they cannot drift silently.
 *
 * Five members and not eight. A queue holds what is still coming, so
 * `completed`, `cancelled` and `failed` are not states a row can be in -- see
 * the projection for why a *completed* order is cancellable and still not
 * queued.
 */
export const HUD_BUILD_ORDER_STATES = [
  'planned',
  'approved',
  'materials-pending',
  'assigned',
  'in-progress',
] as const;
export type HudBuildOrderState = (typeof HUD_BUILD_ORDER_STATES)[number];

/**
 * One order the crew has not finished, and the id that can withdraw it.
 *
 * **`orderId` is the whole reason this interface exists.**
 * `CancelBuildOrder { orderId }` names an arbitrary order, so a control that
 * can aim it needs the id -- and until the build-queue projection existed
 * nothing carried one to this thread, which is why that command was the
 * repository's only one with no production producer. It is a stable simulation
 * id and travels back out unchanged in the intent.
 *
 * `labelKey` is **optional**, and absent is a real state rather than a
 * defensive one: the buildable registry carries a hard-coded English `name` and
 * no key (`docs/HUD_PROJECTIONS.md` gap 32), so the host maps `definitionId` to
 * a key through `buildableLabelKey` and a buildable that names neither a
 * `content.*` entry nor a row in that table has no name to render. The row is
 * still drawn -- an order nobody can name is still an order that can be
 * cancelled, and dropping it would hide the cancellable thing -- and the panel
 * says so in its own words, exactly as `HudRoomNeedViewModel.objectLabelKey`'s
 * absence is handled.
 */
export interface HudBuildOrderViewModel {
  readonly orderId: string;
  /** A message key, never text. Absent when the host names no buildable for this order. */
  readonly labelKey?: LocalizationKey;
  /** Where the order sits, which is how a player recognises *which* wall this is. */
  readonly tile: { readonly x: number; readonly y: number };
  readonly edge: HudBuildEdge;
  readonly state: HudBuildOrderState;
}

/**
 * What is still waiting to be built (#348's consequence, made visible).
 *
 * Session state that arrives on a **pull**, exactly like
 * `HudRoomNeedsViewModel` and for the same two reasons: a queue is
 * `O(orders)` to walk and nobody reads it from the Rooms tab, and absent is a
 * real state -- "nothing has asked" and "the queue is empty" must not render
 * the same, because the second is a statement about the prison and the first is
 * a statement about this thread.
 *
 * `total` is the whole queue and `orders` is the window that fits. The two are
 * separate numbers on purpose: the panel's height is a fact about the rail and
 * the queue's length is a fact about the prison, and a header that counted only
 * the rows it drew would tell a player with thirty queued walls that they have
 * twelve.
 */
export interface HudBuildQueueViewModel {
  /** Every pending order, however many rows there was room to carry. */
  readonly total: number;
  /**
   * How many of them the crew has actually started -- `0` or `1` in every
   * session the simulation can produce, because construction builds one order
   * at a time (#348).
   *
   * Counted over the whole queue rather than over the window, so a player whose
   * in-progress order is past the end of the window is still told that something
   * is happening.
   */
  readonly started: number;
  /** The window, in the order the crew will reach them. */
  readonly orders: readonly HudBuildOrderViewModel[];
}

/**
 * One purchase whose delivery has not landed, and the id that can undo it
 * (#285).
 *
 * **`orderId` is the whole reason this interface exists**, exactly as it is on
 * `HudBuildOrderViewModel`. `CancelMaterialPurchase { orderId }` names one
 * delivery, the id is minted by the press that bought it and immediately
 * forgotten by this thread, and nothing carried one back until
 * `hud/pending-deliveries` did — so a complete, tested refund path
 * (`ProcurementSystem.cancel`) had no caller in the application at all.
 *
 * `labelKey` is **optional** for the reason the build order's is: what an item
 * is called lives in `src/content/item-catalog.ts`, the host looks it up, and a
 * delivery of something the catalogue cannot name is still money a player may
 * want back — so the row is drawn and the panel says so in its own words rather
 * than dropping the only control that reaches it.
 *
 * `paidMinorUnits` is what cancelling gives back, and it is the recorded price
 * rather than a recomputation: the simulation refunds what was paid, so this is
 * the one figure a row is allowed to promise.
 */
export interface HudPendingDeliveryViewModel {
  readonly orderId: string;
  /** A message key, never text. Absent when the host names no item for this delivery. */
  readonly labelKey?: LocalizationKey;
  readonly quantity: number;
  readonly paidMinorUnits: number;
}

/**
 * What has been paid for and has not arrived (#285).
 *
 * Session state on a **pull**, on the same three terms as
 * `HudBuildQueueViewModel`: it is `O(deliveries)` to walk, nobody reads it from
 * another tab, and absent is a real state — "nothing has asked" and "nothing is
 * on its way" must not render the same, because only the second is a statement
 * about the prison.
 *
 * `refundableMinorUnits` is the figure this whole surface exists for. The status
 * strip's balance says what is *left*; this says what is *out* and recoverable,
 * which is the number #285 measured as unrecoverable by any means a player had.
 * It is summed over every pending delivery rather than over the window, so a
 * player with more purchases than rows is still told the whole amount.
 */
export interface HudPendingDeliveriesViewModel {
  /** Every pending delivery, however many rows there was room to carry. */
  readonly total: number;
  /** What the treasury would get back if all of them were cancelled, in minor units. */
  readonly refundableMinorUnits: number;
  /** The window, in the order the deliveries will land. */
  readonly deliveries: readonly HudPendingDeliveryViewModel[];
}

/**
 * One held guard, as the Staff panel's release list reads it
 * ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)).
 *
 * `entityId` is the whole point of the row: `ReleaseGuardAssignment { guardId }`
 * names one guard, and until this view model existed nothing on this thread
 * carried a guard id that a control could aim at. The same shape
 * `HudBuildOrderViewModel` and `HudPendingDeliveryViewModel` are in, one
 * resource over.
 *
 * `claimLabelKey` and `roleLabelKey` are message keys, never text (ADR 0011).
 * The claim's key is derived by the host from the simulation's stable id
 * through `deriveSimulationMessageKey('guard-claim', claim)`, exactly as every
 * other projected simulation enum's label is, so the HUD resolves a key it was
 * handed rather than knowing what a claim kind is.
 *
 * The role's key is optional and the claim's is not, and the asymmetry is real:
 * a guard hired with a role id the catalogue does not define has no name for its
 * role, and it is still a held guard whose claim a player may want to release --
 * so the row is drawn without the role rather than dropped, for the reason a
 * nameless delivery keeps its row.
 */
export interface HudHeldGuardViewModel {
  readonly entityId: number;
  /** What is holding this guard. Always present -- a row exists because something is. */
  readonly claimLabelKey: LocalizationKey;
  /** Absent when the host names no role for this guard. */
  readonly roleLabelKey?: LocalizationKey;
}

/**
 * Which guards are held, and by what (ADR 0034).
 *
 * Session state on a **pull**, on `HudPendingDeliveriesViewModel`'s three terms:
 * `O(guards)` to walk, nobody reads it from another tab, and absent is a real
 * state -- "nothing has asked" and "no guard is held" must not render the same,
 * because only the second is a statement about the prison.
 *
 * `held` is summed over the whole roster rather than over the window, so a
 * prison with more held guards than rows is still told how many there are --
 * `HudPendingDeliveriesViewModel.total` carries the same fact for the same
 * reason. `unassigned` is beside it because the pair is the sentence the header
 * needs: "four of six on duty" is what makes a release a decision rather than a
 * button.
 */
export interface HudHeldGuardsViewModel {
  /** Every held guard, however many rows there was room to carry. */
  readonly held: number;
  /** Guards free right now. */
  readonly unassigned: number;
  /** The window, in ascending entity id. */
  readonly guards: readonly HudHeldGuardViewModel[];
}

export interface HudStaffRosterRowViewModel {
  readonly entityId: number;
  /** What this staff member is doing right now -- the same `guard-claim` vocabulary the held rows use, plus "off duty". */
  readonly statusLabelKey: LocalizationKey;
  /** Absent when the host names no role for this staff member. */
  readonly roleLabelKey?: LocalizationKey;
}

/**
 * Who is on the payroll, and the control that ends it (issue #533).
 *
 * **Not `HudHeldGuardsViewModel` with a different button**, and the difference
 * is the whole reason this type exists rather than a flag on that one. That
 * model is the *held subset* -- guards a claimant is holding -- and the state a
 * player most needs to get out of is the opposite one: three guards hired into
 * a prison that requires none, every one of them `'unassigned'` and therefore
 * on no held row at all, each billed at every in-game day boundary. A dismiss
 * control hung off the held list would have been a control that could not reach
 * the case it exists for.
 *
 * Session state on a **pull**, on `HudHeldGuardsViewModel`'s three terms:
 * `O(staff)` to walk, nobody reads it from another tab, and absent is a real
 * state -- "nothing has asked" and "nobody is hired" must not render the same,
 * because only the second is a statement about the prison.
 *
 * `hired` is summed over the whole roster rather than over the window, so a
 * prison with more staff than rows is still told how many it has.
 */
export interface HudStaffRosterViewModel {
  /** Everybody on the payroll, however many rows there was room to carry. */
  readonly hired: number;
  /** The window, in ascending entity id. */
  readonly staff: readonly HudStaffRosterRowViewModel[];
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
  /**
   * What this room *type* requires standing in it, before any of it is zoned
   * (#529 / #535 decision 2).
   *
   * **A statement about content, not about a prison**, and that is the whole
   * reason it lives here beside `minimum` and `enclosure` rather than arriving
   * with `HudRoomNeedsViewModel`. Those two are already exactly this kind of
   * fact -- authored on the definition, read through
   * `src/simulation/rooms/requirements.ts`, true before a single tile is
   * dragged -- and the requirement list is the third of the same kind. What a
   * *particular* canteen is still short is a different question with a
   * different truth condition and a different answer shape: it can be
   * uncountable (`HudRoomNeedViewModel.missingQuantity`), it changes as the
   * player builds, and it arrives on a pull rather than at mount. The panel
   * renders the two in separate blocks with separate wording for that reason.
   *
   * **Required, not optional**, and deliberately so. Every producer of a
   * catalogue row must state this, including an empty array for `room.yard`,
   * which authors no object requirement at all. An optional field would let a
   * hand-written fixture stay silent, the panel draw nothing, and a green
   * assertion mean only that the fixture agreed with it -- which is precisely
   * how #529's defect survived a full suite. Empty is a real answer here: the
   * panel says the room type needs no objects rather than saying nothing.
   */
  readonly objectRequirements: readonly HudRoomObjectRequirementViewModel[];
}

/**
 * One object a room type requires, and how many of it (#529).
 *
 * `quantity` is the authored `minQuantity` and is always at least 1
 * (`roomRequirementSchema` bounds it to 1..64), so there is no "requires zero"
 * state to render -- a room that needs none of something authors no
 * requirement for it and gets no entry.
 *
 * `labelKey` is the object's own `nameKey` from `src/content/object-catalog.ts`
 * -- a key, never text (ADR 0011) -- and is **optional** for the same reason
 * `HudRoomNeedViewModel.objectLabelKey` is: a room definition may name an
 * object id the object catalogue does not define, and there is then no name for
 * the line to print. The panel says so in its own words rather than being
 * handed an invented key, reusing the same stand-in it already shows for the
 * unfinished-room case. Unreachable with the shipped catalogues --
 * `validateRoomObjectReferences` refuses a room naming an uncatalogued object
 * at load time -- and written down because "unreachable" and "handled" are
 * different claims.
 *
 * `objectId` travels alongside so a test and a `data-` attribute can read which
 * requirement a line is about without parsing a localized sentence, the job
 * `HudIntakeStageViewModel.stageId` does beside its own `labelKey`.
 */
export interface HudRoomObjectRequirementViewModel {
  /** Stable simulation id (`object.bed`). Never rendered. */
  readonly objectId: string;
  /** The object type's `nameKey`. Absent when the object catalogue names none. */
  readonly labelKey?: LocalizationKey;
  /** The authored `minQuantity`. At least 1. */
  readonly quantity: number;
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
 * One thing a room the player has already designated does not have.
 *
 * **The verdict is the simulation's, whole.** `projectRoomList` /
 * `projectRoomDetail` answer "does this room satisfy its catalog
 * requirements" in three words -- `'satisfied-by-capability'`,
 * `'missing-capability'`, `'not-evaluated'` -- and this carries the second
 * one out, one unmet requirement per entry. Nothing on this side of the
 * boundary decides what "missing" means, and nothing may: the rule that a
 * cell without a bed is unfinished is the same rule `IntakeSystem` and
 * `ActionSystem` gate on (`requiredObjectCapability`), and a second copy of
 * it in a panel would be a second copy to drift. That is the same reason
 * `HudCountsViewModel` carries the treasury balance rather than a currency
 * and `HudRoomViewModel` carries a tint rather than a colour table.
 *
 * `objectLabelKey` is the missing object's own `nameKey` from
 * `src/content/object-catalog.ts` -- a key, never text (ADR 0011) -- and it is
 * **optional** because the projection can report a requirement as unmet
 * precisely *because* the object catalogue does not define the id it names.
 * There is then no name to render, and the panel says so in its own words
 * rather than being handed an invented key; the same division
 * `src/ui/simulation-zoning.ts` records, where the enum pair crosses the
 * boundary and "which sentence that pair deserves" stays in the panel.
 * Unreachable with the shipped catalogues -- all 18 room definitions name
 * catalogued objects -- and reachable the moment one does not.
 */
export interface HudRoomNeedViewModel {
  /**
   * The room instance this is about (`room.cell:12:4`).
   *
   * A stable identity for the row, the job `HudAlertViewModel.id` does: a
   * readout that is republished twice a second must update the row the player
   * is reading rather than rebuild it.
   */
  readonly instanceId: string;
  /** The room type's `nameKey`. A key, never text. */
  readonly roomLabelKey: LocalizationKey;
  /** Where the room is, so a player with four cells knows which one this is. */
  readonly tile: { readonly x: number; readonly y: number };
  /** The missing object's `nameKey`, absent when the object catalogue names none. */
  readonly objectLabelKey?: LocalizationKey;
  /**
   * How many **more** of that object the room needs (#529).
   *
   * The shortfall, not the requirement: a canteen authored for four benches and
   * holding three reports `1` here, because one is what the player has to
   * build. `HudRoomObjectRequirementViewModel.quantity` is the other number --
   * what the room type asks for in total -- and the two are deliberately not
   * the same field, because they are true of different things and diverge the
   * moment a player builds anything at all.
   *
   * **Absent when the simulation could not count**, which is a real state and
   * not a one. `RoomRequirementViewModel.satisfyingQuantity` is absent whenever
   * the projection was handed nothing to attribute to the room -- a caller that
   * supplied no placed objects, or an instance from a V4 save with no recorded
   * rectangle -- and in that state the verdict beside it came from the pre-#528
   * capability test, which never consulted `minQuantity` and therefore cannot
   * support a subtraction. Carried across rather than defaulted, so the panel
   * can render the object with no numeral instead of asserting a quantity
   * nothing measured. No session a player runs takes that path: the worker
   * supplies the placed objects (`worker/projection-catalog.ts`).
   *
   * At least 1 when present. A requirement the projection called unmet has a
   * shortfall of at least one by definition, and
   * `roomNeedsFromProjections` only ever reads `'missing-capability'` entries.
   */
  readonly missingQuantity?: number;
}

/**
 * What the rooms the player has designated are still missing (#331 milestone).
 *
 * Session state that arrives on a **pull**, unlike everything else on
 * `HudViewModel`: it is read through `simulation/request-projection` by
 * `src/ui/simulation-room-needs.ts` while the Rooms tab is the one showing,
 * and it is absent at every other moment. Absent is a real state and not a
 * zeroed one -- "nothing has been asked" and "every room is finished" must not
 * render the same, because the second is a statement about the prison and the
 * first is a statement about this thread.
 *
 * `unfinishedRooms === 0` is the case the readout must stay silent for. A room
 * that is fine earns no line: the block is not drawn at all, which is what
 * keeps this from becoming permanent furniture in a panel whose height budget
 * ADR 0022 measured to 0.05px.
 *
 * The three counts are the simulation's own. `unfinishedRooms` and
 * `totalNeeds` are counted over the page of rooms that was actually requested
 * (`MAX_PROJECTION_PAGE_LIMIT` of them), so in a prison with more rooms than
 * one page they describe that page rather than the whole prison;
 * `totalRooms` is `RoomListViewModel.totals.instances`, which is every
 * instance whatever window was asked for.
 */
export interface HudRoomNeedsViewModel {
  /** How many designated rooms are missing at least one thing. */
  readonly unfinishedRooms: number;
  /** How many designated rooms there are, missing something or not. */
  readonly totalRooms: number;
  /** How many unmet requirements those rooms have between them. */
  readonly totalNeeds: number;
  /** The ones there is room to name, in the projection's canonical order. */
  readonly needs: readonly HudRoomNeedViewModel[];
}

/**
 * One stage of the intake pipeline, and how many arrivals are in it.
 *
 * `stageId` is the simulation's own stable id (`queued`,
 * `accommodation-assignment`) and `labelKey` is the message key for it. Both,
 * rather than either alone: the id is what a test and a `data-` attribute read
 * without parsing a localized sentence, and the key is the only thing this
 * layer may render (ADR 0011). Deriving the key here would need the HUD to hold
 * the stage vocabulary, which is `src/simulation/prisoners/components.ts`'s --
 * so `src/ui/simulation-intake.ts` derives it on the other side of the boundary,
 * the way `src/ui/simulation-alerts.ts` does for a refusal.
 */
export interface HudIntakeStageViewModel {
  /** Stable simulation id, for a row identity and a `data-` attribute. Never rendered. */
  readonly stageId: string;
  /** The stage's message key. A key, never text. */
  readonly labelKey: LocalizationKey;
  /** How many arrivals are at this stage. Always greater than zero -- see `stages`. */
  readonly count: number;
}

/**
 * Where the prison's arrivals are in intake (#104's channel, third consumer).
 *
 * Session state that arrives on a **pull**, exactly like `HudRoomNeedsViewModel`
 * and `HudBuildQueueViewModel`: it is read through
 * `simulation/request-projection` (`hud/prisoner-population`) by
 * `src/ui/simulation-intake.ts` while the Overview tab is the one showing, and
 * it is absent at every other moment. Absent is a real state and not a zeroed
 * one -- "nothing has asked" and "nobody is in intake" must not render the
 * same, because the second is a statement about the prison and the first is a
 * statement about this thread.
 *
 * ### The fact it exists to carry
 *
 * An arrival that has been classified and is waiting for somewhere to sleep is
 * **not** a refusal: `IntakeSystem` keeps the stage and retries, and the
 * arrival completes the moment a place frees up -- which is also the state a
 * zoned cell with no bed in it produces, because a room with no bed derives
 * `residentCapacity: 0` (ADR 0028 decision 8). The status strip counts that
 * prisoner among the population, so before this readout existed the player saw
 * a number go up, nothing else happen, and had nothing on screen saying why.
 *
 * `failed` is the opposite case and is kept apart from `waiting` for that
 * reason: it is **terminal**, so building something will not release those
 * arrivals, and a readout that summed the two would promise a player that it
 * would.
 */
export interface HudIntakePipelineViewModel {
  /** Arrivals in a stage intake is still working through. Building or freeing a place moves these. */
  readonly waiting: number;
  /** Arrivals in the terminal `failed` stage, which nothing releases. */
  readonly failed: number;
  /** Every prisoner the prison holds, admitted or not, so the panel can say "3 of 8". */
  readonly total: number;
  /** The stages that hold somebody, in the pipeline's own order. A stage holding nobody is absent, not zero. */
  readonly stages: readonly HudIntakeStageViewModel[];
  /**
   * Arrivals the prison has **no free place for right now** -- issue #549.
   *
   * A subset of `waiting`, and never the same question as the
   * `accommodation-assignment` line in `stages`. An arrival sits at that stage
   * for one scheduled intake interval before anybody looks for a bed for them,
   * so in a prison with a free cell the stage line counts somebody who was
   * never stuck. This counts nobody until the beds actually run out.
   *
   * It is the only figure on this panel that is a warning rather than a
   * readout, and it is what a player pressing Admit into a full prison gets
   * told: the admission is accepted, the money arrives, and there is nowhere
   * for the person to sleep.
   *
   * `0` is the ordinary state and draws nothing. It is a statement about the
   * prison *now* and not a forecast -- an arrival counted here is housed the
   * moment a place exists.
   */
  readonly waitingWithoutPlace: number;
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

/**
 * What the *simulation* last refused, for the band that says so.
 *
 * The structural half of issue #220's fix. #220 measured that a message
 * routed to the alerts list is on screen at no viewport -- `hud.css` drops
 * `.hud__corner` entirely at 720px and below, and the alerts section starts
 * folded (`INITIAL_HUD_SHELL_STATE`), so the row is `offsetParent === null`
 * with a 0x0 box at every size until the player opens it -- and moved one
 * message out. It moved that message and no other, so every refusal the
 * worker decided after accepting a command went on arriving in the same
 * invisible place: a wall on unowned land, a purchase the treasury cannot
 * cover, a room over one already there, and -- since ADR 0028 phase 3 -- a
 * world press with no object under it. This field is the route out for all of
 * them, and it is the *class* of message that moves rather than one more
 * instance of it, so a ninth command route added tomorrow is visible by
 * construction instead of re-opening the hole.
 *
 * **A key, never text** (ADR 0011). The mapping from the wire's refusal id to
 * a message key is `src/ui/simulation-alerts.ts`, which is where it already
 * was for the list row -- the HUD may not import `src/simulation/**`
 * (`AGENTS.md` boundary 1) and does not learn what was refused, only what to
 * say.
 *
 * `sequence` is the refusal's own 1-based ordinal from the session's
 * `RefusalLog`, and it is load-bearing rather than decorative: the counts
 * channel is a *snapshot on a cadence*, so it republishes an unchanged
 * refusal beside a changed count up to twice a second. The band uses the
 * ordinal to tell a republication of the refusal it is already showing from a
 * newly decided one, which is the difference between leaving a later
 * host-side refusal alone and stealing the line back from it.
 *
 * Absent means the session has refused nothing -- or has ended, which empties
 * it for the reason `EMPTY_HUD_VIEW_MODEL.counts` zeroes the counts: a
 * refusal by a simulation that no longer exists is not something the player
 * can act on.
 */
export interface HudRefusalNoticeViewModel {
  readonly sequence: number;
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
}

/**
 * The most recent thing the prison did, for the events band (issue #507).
 *
 * ## Why this is a third band and not a second use of the refusal line
 *
 * `hud.ts` states the rule the two existing bands were built under: a band
 * holds one *class* of sentence with one lifetime, and sharing one "would need
 * a rule about which sentence wins". The two classes there are "whatever
 * refused a player command" and "this page has no simulation". An event is
 * neither. It is not a refusal -- nothing was refused, and in the
 * `'info'` case nothing is even wrong -- and it does not belong to a control,
 * so it cannot clear the way a refusal clears when the same action later
 * succeeds. Putting a discharge notice on the refusal line would silently
 * evict a refusal the player has not read yet, which is the eviction that rule
 * exists to prevent.
 *
 * ## Why the band exists at all, when the alerts list already renders these
 *
 * Because the alerts list does not reach the player. `hud.css` drops
 * `.hud__corner` entirely at 720px and below, and the alerts section inside it
 * starts folded (`INITIAL_HUD_SHELL_STATE`), so a row appended there is
 * `offsetParent === null` at *every* viewport until somebody opens it --
 * measured in Chromium at 1280x800 and 375x812 for issue #220, which is the
 * defect that gave the refusal its own band and then gave "no simulation" a
 * second one. Routing `'info'` to the list alone would have been the third
 * repetition of that defect and would have made the channel's first producers
 * invisible in exactly the way the silent sentence-end already was.
 *
 * So the split is the one `src/ui/simulation-alerts.ts` already names for
 * refusals: **the band is the notice and the list is the log**, and an event
 * appears on both.
 *
 * `sequence` is the event's own 1-based ordinal from the session's
 * `SimulationEventLog`, used to tell a re-render of the event already showing
 * from a newer one -- the same job it does for a refusal, though the pressure
 * is lower here because this channel does not republish.
 *
 * `severity` rather than a fixed tone, because this band is the first surface
 * that carries more than one: a discharge is `'info'`, an unpaid payday is
 * `'warning'`, and since issue #555 an opened riot is `'danger'`.
 * `HudSeverity`'s `'info'` member had no producer anywhere in `src/` before
 * this band, and its `'danger'` member had none outside an unrecoverable
 * protocol fault until the incident events joined it.
 */
export interface HudEventNoticeViewModel {
  readonly sequence: number;
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
  readonly labelParameters?: MessageParameters;
  readonly severity: HudSeverity;
}

export interface HudViewModel {
  readonly counts: HudCountsViewModel;
  readonly clock: HudClockViewModel;
  readonly alerts: readonly HudAlertViewModel[];
  /** Absent until this session has had something to say. See the interface. */
  readonly event?: HudEventNoticeViewModel;
  /** Absent until this session has designated a room. Not zeroed -- see the interface. */
  readonly zoning?: HudZoningNoticeViewModel;
  /** Absent until this session has refused something. See the interface. */
  readonly refusal?: HudRefusalNoticeViewModel;
  /**
   * What the designated rooms are missing, or absent because nothing asked.
   *
   * The one field here that is *pulled* rather than published -- see the
   * interface for why absent and "nothing is missing" are different states.
   */
  readonly roomNeeds?: HudRoomNeedsViewModel;
  /**
   * What is still waiting to be built, or absent because nothing asked.
   *
   * The second pulled field, and it shares every property of the first: absent
   * is "nobody asked" and an empty queue is "the prison has nothing coming",
   * and the two must not render the same.
   */
  readonly buildQueue?: HudBuildQueueViewModel;
  /**
   * Where the prison's arrivals are in intake, or absent because nothing asked.
   *
   * The third pulled field, on the same terms as the two above: absent is
   * "nobody asked" and an empty pipeline is "every arrival has been dealt
   * with", and the two must not render the same.
   */
  readonly intakePipeline?: HudIntakePipelineViewModel;
  /**
   * What has been bought and has not arrived, or absent because nothing asked.
   *
   * The fourth pulled field, on the same terms as the three above: absent is
   * "nobody asked" and an empty list is "no money is in transit", and the two
   * must not render the same (#285).
   */
  readonly pendingDeliveries?: HudPendingDeliveriesViewModel;
  /**
   * Which guards are held, and by what (ADR 0034). Absent until the first
   * `hud/held-guards` reply, which is a different fact from "no guard is held".
   */
  readonly heldGuards?: HudHeldGuardsViewModel;
  /**
   * Who is on the payroll, or absent because nothing asked (issue #533). Same
   * pull terms as `heldGuards` above and read from the same panel.
   */
  readonly staffRoster?: HudStaffRosterViewModel;
  /**
   * How many guards the prison asks for against how many it has assigned, or
   * absent because nothing asked
   * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
   * consequence 1).
   *
   * The sixth pulled field, on the same terms as the five above: absent is
   * "nobody asked" and a zero shortage is "the prison has the guards it asks
   * for", and the two must not render the same.
   */
  readonly staffCoverage?: HudStaffCoverageViewModel;
  /**
   * What each classification group's day allows right now, or absent because
   * nothing asked (issue #451).
   *
   * The seventh pulled field, on the same terms as the six above: absent is
   * "nobody asked", and there is no state of the prison that renders the same
   * -- every schedule covers every tick of the day by construction
   * (`assertGaplessSchedule`), so a group is always inside exactly one block
   * and an empty list is never an answer.
   */
  readonly regime?: HudRegimeViewModel;
  /**
   * Who is in the prison, what each of them is doing, and how each is
   * classified -- or absent because nothing asked (issue #451).
   *
   * The eighth pulled field, and it draws the distinction the six above draw:
   * absent is "nobody asked" and `total: 0` is "this prison holds nobody", and
   * a panel that rendered the first as the second would state a fact about an
   * empty prison on behalf of a session that has said nothing.
   */
  readonly prisonerRoster?: HudPrisonerRosterViewModel;
}

/**
 * A person's name, as the HUD is willing to know it.
 *
 * The one player-facing string in this file that is **not** a message key, and
 * it is not an exception to ADR 0011 so much as outside it: a name is minted
 * from an RNG stream as state (ADR 0015), is never authored into a catalog, is
 * never translated and is identical in every locale.
 * `docs/HUD_PROJECTIONS.md` contract 3 says so on the projection side; this is
 * the same fact on this side of the boundary.
 *
 * The two halves stay separate rather than arriving pre-joined, because
 * *which order they go in* is a locale decision and this layer is where locale
 * decisions are made. `hud.regime.roster-name` is the key that puts them
 * together.
 */
export interface HudActorNameViewModel {
  readonly givenName: string;
  readonly familyName: string;
}

/**
 * One classification group's position in its own timetable, right now.
 *
 * Nothing here is computed on this thread. The group, the block it is in and
 * the categories that block allows are `projectStatusStrip`'s `regime` entry
 * verbatim; the only thing added is the message key for each id (ADR 0011) and
 * the percent, which is a rendering of the projection's own authoritative
 * `permille` rather than a second measurement of the day.
 */
export interface HudRegimeBlockViewModel {
  /** The stable classification-group id, so a probe can name a row without matching text. */
  readonly classificationGroupId: string;
  readonly labelKey: LocalizationKey;
  /**
   * What this group may do in the block that is running, in the order the
   * schedule declares them. Never empty: a block with no legal category would
   * leave `ActionSystem` with no candidate at all, which is the state
   * `assertGaplessSchedule` and the regime catalogue exist to make impossible.
   */
  readonly allowedCategoryLabelKeys: readonly LocalizationKey[];
  /** How far through the running block, `0`--`100`, floored. */
  readonly blockProgressPercent: number;
}

export interface HudRegimeViewModel {
  /** One entry per classification group, in the projection's own stable-id order. */
  readonly groups: readonly HudRegimeBlockViewModel[];
}

/**
 * One prisoner, as a roster row says them.
 *
 * Three facts and an id, and each is carried rather than derived: the name is
 * allocated state, the activity is `CurrentActionComponent`'s selection, and
 * the standing is what `IntakeSystem` or `ClassificationReviewSystem` last
 * wrote. `docs/HUD_PROJECTIONS.md` gap 3 is what makes the last two
 * renderable at all -- every one of those ids has an authored label in
 * `src/content/simulation-message-keys.ts`.
 */
export interface HudPrisonerRowViewModel {
  readonly entityId: number;
  /**
   * Absent until the intake pipeline's `reception` stage mints one, and absent
   * for every row when the session supplies no identity registry.
   */
  readonly name?: HudActorNameViewModel;
  /**
   * What the prisoner is doing: the action when one is selected, and the
   * action *phase* when none is -- so an idle prisoner reads as idle rather
   * than as a blank cell. Always present, which is why the panel never has to
   * choose a word for "nothing".
   */
  readonly activityLabelKey: LocalizationKey;
  /**
   * True only while the prisoner is walking **to a named action**. A phase of
   * `travelling` with no action selected cannot name a destination, so it is
   * reported as the phase instead and this stays `false`.
   */
  readonly travelling: boolean;
  /**
   * The badge word: the risk tier once classification has run, and the intake
   * stage before it. One slot rather than two, because the two are never both
   * meaningful -- `classified: false` means `riskTier` is still the zero a
   * fresh record holds, which is exactly why the projection omits it.
   */
  readonly standingLabelKey: LocalizationKey;
  /**
   * The stable classification-group id, absent until classification has run.
   *
   * Carried as an id rather than as a label because nothing renders it as a
   * word: it decides the badge's *tone*, and the group's name is on screen
   * already, in the block above the roster that says what that group's day
   * allows. It is also the row's handle for a browser assertion.
   */
  readonly classificationGroupId?: string;
  /** `0` (minimal) to `3` (high risk); absent until classification has run. */
  readonly riskTier?: number;
  /**
   * The prisoner's **worst** need: the most depleted of the six, with the word
   * for it and how full it is (issue #535, decision 6).
   *
   * Always present. A prisoner always has six needs and one of them is always
   * the lowest, so there is no "no need" state to render -- which is why this
   * is not optional and why the panel never has to choose what an absent bar
   * would mean.
   */
  readonly lowestNeed: HudPrisonerNeedViewModel;
}

/**
 * One need, as a roster row shows it.
 *
 * Four fields, because they answer different questions and only one is a word:
 *
 * - `needId` is *which* need, as the stable simulation id. Carried for the
 *   reason `classificationGroupId` above is: it is the row's handle for a
 *   browser assertion, and a probe that had to recognise a need by its
 *   *translated* word would be asserting the locale catalog rather than the
 *   simulation.
 * - `labelKey` is that same need as a word. It resolves through the `need` enum
 *   group in `src/content/simulation-message-keys.ts`, whose six labels --
 *   Hunger, Sleep, Hygiene, Bladder, Safety, Recreation -- were authored there
 *   long before this row rendered one. Nothing new is written for this readout.
 *   Derived from `needId` by `deriveSimulationMessageKey` rather than stored
 *   beside it, so the pair cannot drift.
 * - `permille` is *how full*, `0` empty to `1000` satisfied, carried from the
 *   projection's `BoundedValue`. The bar quantizes it to ten segments for the
 *   eye; this is the figure behind the quantization, and it is what a browser
 *   assertion reads rather than counting lit segments.
 * - `unmetForStateIncome` is whether the state is withholding part of this
 *   prisoner's day of the operating grant over it. **A fact about the grant,
 *   not a verdict about the prisoner** -- see the projection field of the same
 *   name, and `docs/HUD_PROJECTIONS.md` gap 7 for why the player-facing
 *   "this is bad" threshold is still the owner's and is not this one.
 */
export interface HudPrisonerNeedViewModel {
  readonly needId: string;
  readonly labelKey: LocalizationKey;
  readonly permille: number;
  readonly unmetForStateIncome: boolean;
}

export interface HudPrisonerRosterViewModel {
  /** Every live prisoner, not the window -- the projection's own `total`. */
  readonly total: number;
  /** The window the panel asked for, in ascending entity index (ADR 0005). */
  readonly rows: readonly HudPrisonerRowViewModel[];
  /**
   * True once at least one prisoner has ever been admitted this session,
   * carried unchanged from `PrisonerRosterPage.everAdmitted` (issue #506).
   * `total: 0` alone cannot say whether nobody has been admitted or whether
   * the whole population has since been discharged, and this is the fact
   * that tells the two apart -- see `regime-panel.ts`'s roster-empty note
   * for what the panel does with it.
   */
  readonly everAdmitted: boolean;
}

/**
 * How many guards the prison asks for, and how many it has.
 *
 * The three figures `StaffViewModel.totals` publishes, carried across the
 * boundary unchanged. **Not derived here and not derivable here**: `required`
 * is `DeploymentSystem.requiredGuardCountFor`'s answer, which since
 * [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md) decision 3
 * is the larger of the authored `DeploymentSchedule` and one guard per eight
 * prisoners standing on owned land. The HUD knows none of those inputs and must
 * not learn them -- a second definition of "how many guards this prison needs"
 * on this thread is exactly what `AGENTS.md` boundary 1 forbids, and it would
 * disagree with the requirement the deployment system actually enforces the day
 * either moved.
 *
 * `shortage` is carried rather than computed from the other two for a reason
 * that is not style: it is the **sum of the per-sector shortages**, so a prison
 * with one sector over-staffed and another short still reports a shortage,
 * where `required - assigned` would net them out and read as covered. Today
 * every session has one sector (`applyDefaultSecuritySector`), so the two agree;
 * they stop agreeing the moment a second sector exists, and the field that
 * survives that is the one the simulation summed.
 */
export interface HudStaffCoverageViewModel {
  /** Guards the prison asks for, summed over every sector. */
  readonly required: number;
  /** Guards assigned to a sector -- already on post, or still walking there. */
  readonly assigned: number;
  /** Summed per-sector shortfall. Zero when every sector has what it asks for. */
  readonly shortage: number;
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
    occupiedPlaces: 0,
    staff: 0,
    rooms: 0,
    prisonersCovered: 0,
    prisonersUnderstaffed: 0,
    prisonersUnguarded: 0,
    activeIncidents: 0,
    // No key at all -- an empty prison has nothing to name (issue #506
    // finding 2), and this field's own doc comment says why `undefined` is
    // never assigned to it explicitly.
    contrabandFound: 0,
    treasuryMinorUnits: 0,
    stateIncomeAccruedTodayMinorUnits: 0,
  },
  clock: UNKNOWN_HUD_CLOCK,
  alerts: [],
};
