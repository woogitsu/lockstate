import type {
  HudBuildQueueViewModel,
  HudHeldGuardsViewModel,
  HudIntakePipelineViewModel,
  HudStaffCoverageViewModel,
  HudPendingDeliveriesViewModel,
  HudPrisonerRosterViewModel,
  HudRegimeViewModel,
  HudRoomNeedsViewModel,
  HudViewModel,
} from '../../src/ui/hud';

/**
 * The contract between the in-page UI harness (`ui-harness.ts`) and
 * `ui-shell.spec.ts`. Every value crossing `page.evaluate` must be
 * structured-clone-safe, so the harness returns plain summaries rather than
 * live DOM nodes or panel objects.
 */

export interface ButtonState {
  readonly found: boolean;
  readonly disabled: boolean;
  readonly ariaBusy: string | null;
}

export interface HudProbe {
  readonly activeTab: string | null;
  readonly metricIds: readonly string[];
  readonly metricValues: readonly string[];
  /** `title` of each transport control currently showing `aria-pressed="true"`. */
  readonly pressedTransport: readonly string[];
  /** The rendered day number, or `--` when no session has reported a clock. */
  readonly clockDay: string;
  /** The rendered position within the in-game day, or `--` when unknown. */
  readonly clockDayProgress: string;
  readonly valueCount: number;
  /** Numbers whose *computed* style is not monospace with tabular figures. */
  readonly nonMonospaceValues: readonly string[];
  readonly alertsCollapsed: string | null;
  /** True when the middle pixel of the viewport does not belong to the HUD. */
  readonly centreIsClickThrough: boolean;
}

/**
 * What the alerts list is actually showing (issue #209).
 *
 * Every field is read off the production DOM the HUD built. Nothing here
 * re-derives what the order *should* be: the spec supplies the view model and
 * compares it with what the browser laid out, so a probe that agreed with a
 * wrong implementation is not possible.
 */
export interface AlertProbe {
  /** `data-alert` of every alert row, in the order the rows appear in the DOM. */
  readonly order: readonly string[];
  /** The rendered text of each of those rows, in the same order. */
  readonly texts: readonly string[];
  /**
   * `data-alert` of every listed row that is the *same DOM node* it was at the
   * last `markAlertRows()`, in DOM order.
   *
   * Node identity, compared with `===` against references the harness kept --
   * not a count, not a heuristic. It is here because the cheap way to make the
   * order right is to empty the list and rebuild it every paint, and that
   * would throw away the identity `HudAlertViewModel.id` exists to preserve
   * ("a list update is not a full rebuild", `view-model.ts`). A rebuild drops
   * focus and restarts any transition on a row the player is looking at, so
   * the ordering fix has to *move* rows rather than replace them.
   */
  readonly reused: readonly string[];
}

export interface LayoutBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * What the Intake panel is showing (#261 step 4).
 *
 * `laidOut` rather than `visible`: the panel and the Build panel share one
 * rail slot and exactly one of them is `hidden` at any time, so what has to be
 * proven is that the browser gave this one a box -- not merely that the node
 * is in the document.
 */
export interface IntakeProbe {
  readonly laidOut: boolean;
  readonly admitLaidOut: boolean;
  readonly admitLabel: string;
  readonly admitDisabled: boolean | null;
  /** The sentence that says what an admission needs, and what it costs when the prison is full. */
  readonly hint: string;
  /**
   * The over-admission warning (issue #549), as a **box** rather than as an
   * attribute.
   *
   * `null` when the line has no box at all -- which is what `[hidden]` is meant
   * to produce and is emphatically not the same claim as `hidden === true`. A
   * stylesheet whose `:not([hidden])` guard has been lost paints the line at
   * full height with the attribute still set, and a spec reading `.hidden`
   * would agree with it. `layoutBoxOf` returns `null` only for a genuinely
   * unlaid-out node, so an assertion on this cannot pass while the player is
   * looking at a warning that should not be there.
   */
  readonly noPlaceBox: LayoutBox | null;
  /** What the warning says, or `''` when it says nothing. */
  readonly noPlaceText: string;
  /** `data-without-place`: the figure the panel was told, without parsing a localized sentence. */
  readonly noPlaceCount: string | null;
  /** The warning's colour, computed. The tone is the whole difference between this line and the readout below it. */
  readonly noPlaceColor: string;
  /** The pipeline readout's box, `null` when the block is folded away. */
  readonly pipelineBox: LayoutBox | null;
  readonly pipelineWaiting: string | null;
  readonly pipelineFailed: string | null;
  /** One line per stage that holds somebody: the stage id and what the line says. */
  readonly pipelineStages: readonly { readonly stage: string; readonly text: string }[];
  /** The panel's own box, so a spec can ask whether it has paid for its content. */
  readonly panelBox: LayoutBox | null;
  /** `scrollHeight - clientHeight` on the panel: how much taller its content is than the box it was given. */
  readonly panelOverflow: number;
  /** The same shortfall for the panel body, which is the box the new line is actually inside. */
  readonly bodyOverflow: number;
  /** Everything the panel drew, so a spec can assert on the sentence a player reads. */
  readonly text: string;
}

/**
 * One option of the Build panel's edge chooser, as a player actually receives
 * it (issue #341).
 *
 * `BuildProbe.edge` reports `data-choice`, which is an **id**: an
 * implementation that labels every edge "North" still reports `west` there, so
 * no assertion over it can see a label defect. #339 measured that exact
 * mutation passing all 2,321 tests in the repository. This carries the id and
 * the *drawn text* side by side so a spec can require them to disagree in the
 * way two distinct edges must.
 *
 * The geometry is here for #220's reason: `toContainText` does not imply
 * visibility, and the edge chooser lives inside a collapsible section whose
 * body is `hidden` until the player opens it, so a label can be in the DOM
 * with nothing on screen. `laidOut` is the browser's own answer via
 * `offsetParent`; the box says the text was given room to be read.
 */
export interface BuildEdgeLabelProbe {
  /** `data-choice` -- the id, which a label defect leaves correct. */
  readonly id: string;
  /** The option button's rendered text: the label, and the thing under test. */
  readonly label: string;
  /** `offsetParent`, not the `hidden` attribute, which is inherited. */
  readonly laidOut: boolean;
  /** The option's border box in CSS pixels. Both must exceed 0 to be readable. */
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface BuildProbe {
  /** False while the Build tab is not the active one. */
  readonly visible: boolean;
  /** `data-buildable` of every offered row, in the order they are drawn. */
  readonly options: readonly string[];
  readonly selected: string | null;
  readonly tileX: string;
  readonly tileY: string;
  readonly edge: string | null;
  /**
   * Every edge option, in the order they are drawn: id, rendered label, and
   * the box the browser gave that label (issue #341).
   *
   * The field `edge` above cannot answer this. It reads `data-choice`, so the
   * mutation that returns `'build-edge.north.name'` for every edge -- which
   * paints the West option "North" -- leaves it reporting `west` and every
   * assertion over it green.
   */
  readonly edgeLabels: readonly BuildEdgeLabelProbe[];
  /** True when the edge chooser is showing at all -- it is hidden for a non-edge buildable. */
  readonly edgeChooserVisible: boolean;
  readonly submitDisabled: boolean;
  /** The map route's toggle: label, pressed state, and whether it is the panel's primary control. */
  readonly armLabel: string;
  readonly armed: boolean;
  readonly armIsPrimary: boolean;
  /**
   * The removal toggle (ADR 0028 phase 3): its label, whether it is laid out,
   * and whether the mode is on.
   *
   * `removeLaidOut` is a `getClientRects()` answer and not an attribute, for the
   * reason `buyToggleVisible` is: this is the third button in a row ADR 0022
   * measured a third button overflowing, so "the browser gave it a box" is the
   * only assertion worth making about it.
   */
  readonly removeLabel: string;
  readonly removeLaidOut: boolean;
  readonly removing: boolean;
  /**
   * The right edge of the actions row's last laid-out button against the panel
   * body's right edge, in CSS pixels: positive means it overflows.
   *
   * The measurement ADR 0022 took when it rejected a third control here, taken
   * again on the row that now has one.
   */
  readonly actionsOverflowPx: number;
  /** The note line under the controls, which says what the armed gesture does. */
  readonly hint: string;
  /** True while the numeric fallback section is folded away. */
  readonly coordinatesCollapsed: boolean;
  /** The `data-target` readout, or null when nothing is aimed at. */
  readonly targetReadout: string | null;
  readonly targetText: string;
  /**
   * Whether the readout `targetText` was read from is laid out, and its box
   * (issue #341, on #220's lesson).
   *
   * `targetText` is a `textContent` read and answers the same on a readout the
   * browser never painted. The readout is the *second* place an edge becomes a
   * label and the one where a wrong edge is invisible, so the string being
   * right is only half the claim -- a player has to be able to read it.
   */
  readonly targetLaidOut: boolean;
  readonly targetBox: LayoutBox | null;
  /** The buy disclosure (#89): whether it is offered at all, and whether it is open. */
  readonly buyToggleVisible: boolean;
  readonly buyOpen: boolean;
  /** True when the row the disclosure reveals is laid out -- `offsetParent`, not the attribute. */
  readonly buyRowVisible: boolean;
  /** The buy button's whole label, which states the quantity, the material and the total. */
  readonly buyLabel: string;
  /**
   * Whether the buy button reports itself **unavailable** -- `aria-disabled`
   * (issue #772): the control's availability is judged against the same
   * `pressAffordabilityVerdict` the press itself is judged against, so this
   * and `buyLabel` moving independently of each other is exactly the gap
   * #772 is about.
   */
  readonly buyUnavailable: boolean;
  /**
   * Whether the buy button is **disabled** -- the DOM property, which is a
   * different question from `buyUnavailable` and is read so a test can pin
   * that they stay different (the narrowing of 2026-09-02).
   *
   * PR #799 put the affordability verdict on this bit, which removed the
   * press and with it the only sentence a player is given for the refusal
   * (`hud.refusal.purchase-materials-past-floor`, the owner's ruling 18 of
   * 2026-08-31). A test that asserts `buyUnavailable` alone would go green
   * again the day somebody re-wired the verdict onto `disabled` and re-took
   * the press; asserting this one stays `false` is what makes the narrowing
   * a fact rather than a comment.
   *
   * It is *not* always `false`: `createBusyGroup` holds every command control
   * disabled while one is in flight
   * (`src/ui/primitives/async-action.ts`), so this reads `true` inside that
   * window. Only assertions taken while nothing is in flight mean anything.
   */
  readonly buyDisabled: boolean;
  /** What the quantity stepper currently shows. */
  readonly buyQuantity: string;
  /** Every visible label in the panel, so an unresolved `hud.*` key is caught. */
  readonly texts: readonly string[];
  /** The queue fold (#348) -- see `BuildQueueProbe`. */
  readonly queue: BuildQueueProbe;
  /** What has been bought and has not arrived (#285) -- see `PendingDeliveriesProbe`. */
  readonly deliveries: PendingDeliveriesProbe;
}

/**
 * The Build panel's queue block, and every field here is a `getClientRects()` or
 * `offsetParent` answer rather than an attribute read.
 *
 * That is issue #220's lesson applied to a control that did not exist when it
 * was learned. #220 measured that a message routed to the alerts list is on
 * screen at **no** viewport -- `hud.css` drops `.hud__corner` at 720px and below,
 * and the section starts folded -- so the row was `offsetParent === null` with a
 * 0x0 box everywhere while `toContainText` passed. A cancel button is a worse
 * case than a message: a control the player cannot reach is a feature that does
 * not exist, and the whole point of this block is that it is *pressable* on a
 * phone.
 */
export interface BuildQueueProbe {
  /** Whether the browser gave the section a box at all. `false` in the arrival state, by design. */
  readonly sectionLaidOut: boolean;
  /** `aria-expanded` on the fold's header: `false` when it appears, which is the design. */
  readonly open: boolean;
  /** The header's figure -- the whole queue's length, never the row count. */
  readonly countText: string;
  /** The section's box, so a spec can say where in the panel it sits. */
  readonly sectionBox: LayoutBox | null;
  /** One entry per row the browser actually laid out, in draw order. */
  readonly rows: readonly BuildQueueRowProbe[];
  /** The "and N more" line, empty when every queued order has a row. */
  readonly moreText: string;
  /**
   * The money line below the block (#627, #629, #640): what the queue could not
   * buy, as a rendered sentence with the figure substituted.
   *
   * Empty whenever the queue is paid for, which is every session that never
   * runs out. Read from outside `.hud-build__queue`, because that is where the
   * node is: the fold starts collapsed and #625 is the record of what putting a
   * requirement inside it costs.
   */
  readonly shortfallText: string;
  /**
   * Whether the browser laid that line out, and whether it has an
   * `offsetParent`.
   *
   * Both, for the reason `cancelBox`/`cancelHasOffsetParent` below are both:
   * `offsetParent` is `null` inside a `display: none` ancestor, and a node can
   * have one and still be 0x0. `.hud-build__note` carries an author `display`
   * that beats `[hidden]`, so "the attribute says hidden" is exactly the claim
   * that must not be trusted here.
   */
  readonly shortfallLaidOut: boolean;
  readonly shortfallHasOffsetParent: boolean;
  /** Its box, so a spec can say it is inside the panel's visible one rather than below the fold (#220). */
  readonly shortfallBox: LayoutBox | null;
}

export interface BuildQueueRowProbe {
  /** `data-order`: *which* order this row is aimed at. The whole feature is that this is answerable. */
  readonly orderId: string;
  /** `data-state`: what the row says it is waiting for, as an id rather than as translated text. */
  readonly state: string;
  /** The rendered sentence: what it is, where it is, which edge. */
  readonly labelText: string;
  /** The rendered state word, so an unresolved `build-order-state.*` key is caught. */
  readonly stateText: string;
  /** The cancel button's accessible name, which must name *this* order. */
  readonly cancelAccessibleName: string;
  /**
   * The cancel button's own box and whether it has an `offsetParent`.
   *
   * Both, and neither alone is enough: `offsetParent` is `null` for a node inside
   * a `display: none` ancestor, and a node can have one and still be 0x0.
   */
  readonly cancelBox: LayoutBox | null;
  readonly cancelHasOffsetParent: boolean;
  readonly cancelDisabled: boolean;
}

/**
 * The pending-delivery rows inside the Build panel's buy disclosure (#285), and
 * every field here is a `getClientRects()` or `offsetParent` answer rather than
 * an attribute read.
 *
 * The same discipline `BuildQueueProbe` carries, for a sharper case: these
 * controls promise *money back*, and the four-row layout this surface was
 * measured against put the fourth Cancel 7.9px below the panel's visible bottom
 * with a full 78x44 box and an `offsetParent` -- laid out, hit-testable, and off
 * screen. Only rectangles can tell that apart from a working control.
 */
export interface PendingDeliveriesProbe {
  /** Whether the browser gave the block a box at all. `false` while nothing is pending, by design. */
  readonly blockLaidOut: boolean;
  /** `data-pending` on the block: how many deliveries the panel was told about, as a string. */
  readonly pending: string | null;
  /** The header's figure -- the whole list and what it would refund, never the row count. */
  readonly countText: string;
  readonly blockBox: LayoutBox | null;
  /** One entry per row the browser actually laid out, in draw order. */
  readonly rows: readonly PendingDeliveryRowProbe[];
  /** The "and N more" line, empty when every pending delivery has a row. */
  readonly moreText: string;
}

export interface PendingDeliveryRowProbe {
  /** `data-delivery`: *which* purchase this row's control refunds. */
  readonly orderId: string;
  /** The rendered sentence: how much of what, and what cancelling it gives back. */
  readonly labelText: string;
  /** The cancel button's accessible name, which must name what the row says. */
  readonly cancelAccessibleName: string;
  readonly cancelBox: LayoutBox | null;
  readonly cancelHasOffsetParent: boolean;
  readonly cancelDisabled: boolean;
}

/**
 * The Staff panel's held-guards section (ADR 0034), and every field here is a
 * `getClientRects()` or `offsetParent` answer rather than an attribute read.
 *
 * #220's lesson applied to the newest control in the interface: a Release button
 * that is laid out, hit-tests to itself and is not on screen is a feature that
 * does not exist. Unlike the delivery rows one panel over these are not inside a
 * disclosure, so the arrival state has a box the moment the simulation reports a
 * held guard -- which is what makes `blockBox` and `panelVisibleBottom` the
 * pair the reachability assertions turn on.
 */
export interface HeldGuardsProbe {
  /** Whether the browser gave the block a box at all. `false` until the first reply, by design. */
  readonly blockLaidOut: boolean;
  /** `data-held` on the block: how many guards the panel was told are held, as a string. */
  readonly held: string | null;
  /** The header's figure -- the whole roster's held/free pair, never the row count. */
  readonly summaryText: string;
  readonly blockBox: LayoutBox | null;
  /** One entry per row the browser actually laid out, in draw order. */
  readonly rows: readonly HeldGuardRowProbe[];
  /** The "and N more" line, empty when every held guard has a row. */
  readonly moreText: string;
  /** The "nobody is assigned" line, empty while any guard is held. */
  readonly emptyText: string;
}

export interface HeldGuardRowProbe {
  /** `data-guard`: *which* guard this row's control releases. */
  readonly guardId: string;
  /** The rendered sentence: who, and what is holding them. */
  readonly labelText: string;
  readonly releaseBox: LayoutBox | null;
  readonly releaseHasOffsetParent: boolean;
  readonly releaseDisabled: boolean;
}

/**
 * The coverage block on the Staff panel
 * ([ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md)
 * consequence 1).
 *
 * Everything here is *measured* rather than read off an attribute, for
 * `HeldGuardsProbe`'s reason: the block has no box until the first `hud/staff`
 * reply, and "the attribute says hidden" and "the browser drew nothing" are
 * different claims -- only the second is what a player experiences.
 */
export interface StaffCoverageProbe {
  /** Whether the browser gave the block a box at all. `false` until the first reply, by design. */
  readonly blockLaidOut: boolean;
  /** `data-tone` on the block: which of the three states the panel decided, as a string. */
  readonly tone: string | null;
  /** The header's pair: assigned against required. */
  readonly summaryText: string;
  /** The badge's word, which is what makes the tone readable without colour. */
  readonly badgeText: string;
  /** `data-tone` on the badge itself, so a badge and a block that disagreed would show. */
  readonly badgeTone: string | null;
  /** The sentence under it -- the action, where there is one. */
  readonly hintText: string;
  readonly blockBox: LayoutBox | null;
}

/** The Staff panel on the Security tab (ADR 0025). */
export interface StaffProbe {
  /** False while the Security tab is not the active one. */
  readonly visible: boolean;
  /** `data-staff-role` of every offered row, in the order they are drawn. */
  readonly options: readonly string[];
  readonly selected: string | null;
  /** The hire button's whole label, which states the role and what the press will spend. */
  readonly hireLabel: string;
  readonly hireDisabled: boolean;
  /** Every visible label in the panel, so an unresolved `hud.*` key is caught. */
  readonly texts: readonly string[];
  /** Which guards are held, and by what (ADR 0034) -- see `HeldGuardsProbe`. */
  readonly held: HeldGuardsProbe;
  /** What the prison asks for against what it has (ADR 0048) -- see `StaffCoverageProbe`. */
  readonly coverage: StaffCoverageProbe;
  /**
   * The bottom of the panel's *client* box -- where its content starts being
   * clipped. The fold the reachability assertions compare a Release button's own
   * bottom edge against, in the shape `BuildLayoutProbe.panelVisibleBottom` set.
   */
  readonly panelVisibleBottom: number;
  /** `scrollHeight - clientHeight` on the panel: 0 when the panel itself does not scroll. */
  readonly panelOverflow: number;
  readonly panelBox: LayoutBox | null;
}

/**
 * One line of the timetable, as a player actually receives it (issue #451).
 *
 * The pairing every readout in this file needs: an id nothing can get wrong
 * beside the words that can be. `group` is `data-group`, so an implementation
 * that labelled every group "General Population" still reports `high-risk`
 * there -- which is why the rendered strings sit next to it rather than being
 * derived from it.
 *
 * `laidOut` is `getClientRects()` and not the `hidden` attribute, for the
 * reason `.hud-regime__blocks[hidden]` exists in `hud.css`: this block carries
 * an author `display: flex`, which beats the user agent's `[hidden] { display:
 * none }`, so "the attribute says hidden" and "the browser drew nothing" are
 * two different claims here.
 */
export interface RegimeBlockProbe {
  /** `data-group` -- the stable classification-group id. */
  readonly group: string;
  /** The group's rendered name. */
  readonly nameText: string;
  /** How far through the running block, as the panel words it. */
  readonly progressText: string;
  /** The sentence listing what this group may do right now. */
  readonly allowsText: string;
  readonly laidOut: boolean;
}

/**
 * One roster row that the browser actually drew.
 *
 * The rows are **pooled**: `PRISONER_ROSTER_ROW_LIMIT` of them exist from the
 * first paint and a shorter reply hides the tail rather than removing it, so
 * every one of them keeps the last prisoner's words in its `textContent`
 * forever. A `textContent` walk therefore reports people who are no longer on
 * the roster, and `RegimeProbe.rows` is filtered by `getClientRects()` for
 * exactly that reason -- it is the list a player can see, not the list the DOM
 * holds.
 */
export interface RegimeRosterRowProbe {
  /** `data-prisoner` -- the entity id, which is the row's only stable name. */
  readonly prisoner: string;
  /** `data-classification-group`, or null before classification has run. */
  readonly classificationGroup: string | null;
  /** `data-risk-tier`, or null before classification has run. */
  readonly riskTier: string | null;
  /** Who the row is about, as the panel put the two halves of a name together. */
  readonly nameText: string;
  /** What they are doing, wrapper included when they are walking to it. */
  readonly activityText: string;
  /** The badge's word -- the half of the badge that survives a colour-blind player. */
  readonly badgeText: string;
  /** `data-tone` on the badge, so a word and a colour that disagreed would show. */
  readonly badgeTone: string | null;
  /**
   * The worst-need bar (issue #535 decision 6), as five separate readings.
   *
   * Five and not one, because the point of this readout is that a need becomes
   * **measurable from outside the simulation**, and the bar's own drawing is the
   * one form that is not: a fill is a `data-filled` on ten `<span>`s and a
   * colour, and a probe reconstructing a level from those would be
   * re-implementing the panel's quantization in the test that checks it.
   *
   * - `need` -- `data-need`, the stable need id. Not the translated word, so an
   *   assertion is about the simulation rather than the locale catalog.
   * - `needPermille` -- `data-need-permille`, `0`..`1000`, unquantized. **This is
   *   the field that tells "the need was served" from "the need decayed but not
   *   far enough"**, which nothing outside the worker could distinguish before.
   * - `needUnmet` -- `data-need-unmet`, whether the state is withholding grant
   *   over it. The worst need being unmet is exactly `unmetNeedCount >= 1`, so
   *   this answers whether the prisoner is costing the prison income at all.
   * - `needText` -- the need's word as drawn, so the colour never stands alone.
   * - `needTone` / `needValueText` -- `data-tone` and `aria-valuetext` on the
   *   bar, the accessible half of the same fact.
   */
  readonly need: string | null;
  readonly needPermille: string | null;
  readonly needUnmet: string | null;
  readonly needText: string;
  readonly needTone: string | null;
  readonly needValueText: string | null;
  /**
   * The row's border box.
   *
   * Not a way to detect a row overflowing sideways -- it is a flex item of a
   * column the panel sizes, so it reports the container's width whatever its
   * contents do, which is the same reason `BuildProbe.actionsOverflowPx` is read
   * off the buttons rather than off the row's `scrollWidth`. What it is for is
   * the vertical question: where this row sits against the panel's fold.
   */
  readonly box: LayoutBox | null;
}

/**
 * The Regime panel on the fifth tab (issue #451): the timetable, the roster,
 * and where the browser put the bottom of it.
 *
 * Nothing here restates a decision `regime-panel.ts` makes headlessly.
 * `describePrisonerRow`, `formatPrisonerName`, `formatPrisonerActivity` and
 * `formatRegimeAllowsText` are pure and exported precisely so `pnpm test` can
 * own which word goes in which slot; what this reports is the half `pnpm test`
 * cannot reach at all -- which of these boxes the browser laid out, what text
 * it actually rendered into them, and where the last of them ends against the
 * panel's fold.
 */
export interface RegimeProbe {
  /**
   * `offsetParent`, which is null for a `hidden` element or one inside a
   * `hidden` ancestor. The rail question: this panel is the fifth occupant of
   * `.hud__side` and exactly one of the five may have a box.
   */
  readonly laidOut: boolean;
  /** Whether the timetable block was drawn at all -- `false` until a reply arrives, by design. */
  readonly blocksLaidOut: boolean;
  /** Every timetable line the browser drew, in the order it drew them. */
  readonly blocks: readonly RegimeBlockProbe[];
  /** Whether the roster block was drawn at all -- `false` until a reply arrives, by design. */
  readonly rosterLaidOut: boolean;
  /** `data-total`: the population the projection reported, not the window's length. */
  readonly total: string | null;
  /**
   * `data-ever-admitted`: whether `admittedCount` is nonzero (issue #506).
   * `null` while the roster block itself has not been drawn -- the same
   * absent-vs-`"false"` distinction `total` draws, and for the same reason:
   * "nothing answered yet" and "answered, and nobody has ever been admitted"
   * are different facts.
   */
  readonly everAdmitted: string | null;
  /** The "N of M" figure beside the roster header. */
  readonly countText: string;
  /** Only the rows a player can see -- see `RegimeRosterRowProbe`. */
  readonly rows: readonly RegimeRosterRowProbe[];
  /**
   * The empty-prison sentence, and whether the browser gave it a box.
   *
   * Both, because the attribute cannot answer it. Under
   * `@media (max-height: 700px)` `hud.css` gives `.hud-regime__note` an author
   * `display: -webkit-box` to clamp it to one line, and an author `display`
   * beats the user agent's `[hidden] { display: none }` -- the trap
   * `.hud-build__deliveries-more` is named for. So "this line is hidden" is a
   * claim only a real layout at a real viewport can settle.
   */
  readonly emptyLaidOut: boolean;
  readonly emptyText: string;
  /** The "and N more" line, on the same terms and for the same reason. */
  readonly moreLaidOut: boolean;
  readonly moreText: string;
  /**
   * `innerText` of the whole panel: what the browser rendered, with the pooled
   * rows it did not draw left out.
   *
   * `textContent` is the wrong read here twice over -- it carries the hidden
   * rows' stale words, and it is identical on a panel that was never painted.
   */
  readonly text: string;
  /**
   * The bottom of the panel's *client* box -- where its content starts being
   * clipped, unaffected by scrolling. The fold, in the shape
   * `StaffProbe.panelVisibleBottom` and `RoomsLayoutProbe.panelVisibleBottom`
   * report it.
   */
  readonly panelVisibleBottom: number;
  /** `scrollHeight - clientHeight` on the panel: 0 when the panel itself does not scroll. */
  readonly panelOverflow: number;
  readonly panelScrollTop: number;
  /**
   * The bottom edge of the lowest thing the panel drew: the last roster row,
   * the "and N more" line, or the empty sentence, whichever is furthest down.
   *
   * The number a reachability assertion turns on. A roster is the only block in
   * this rail whose height grows with the *population*, and the panel is
   * `overflow-y: auto`, so a roster that does not fit is pushed below the fold
   * rather than clipped visibly -- which a screenshot would not show and
   * `panelOverflow` alone would not localise to a line.
   */
  readonly lastLineBottom: number;
  readonly panelBox: LayoutBox | null;
}

export interface LayoutProbe {
  readonly viewport: readonly [number, number];
  readonly strip: LayoutBox | null;
  readonly tabs: LayoutBox | null;
  /** `null` once the minimap is hidden on a narrow viewport. */
  readonly minimap: LayoutBox | null;
  /** True when the minimap frame and the tab bar share any pixel. */
  readonly minimapOverlapsTabs: boolean;
  /** The metrics row scrolls sideways rather than pushing the strip wider. */
  readonly metricsScrollWidth: number;
  readonly metricsClientWidth: number;
}

/**
 * The Build panel's vertical layout, for issue #143.
 *
 * Positions, not styles: the defect is that the panel's last section sits
 * below the fold, and only a rectangle can say whether it does. Every value
 * is in viewport coordinates so the spec can compare them directly.
 */
export interface BuildLayoutProbe {
  readonly viewport: readonly [number, number];
  /** How many catalogue rows the panel is currently drawing. */
  readonly rows: number;
  readonly panel: LayoutBox | null;
  /**
   * The bottom of the panel's *client* box -- where its content starts being
   * clipped, which is the fold the issue is about. Below its border box's
   * bottom by the border width, and unaffected by scrolling.
   */
  readonly panelVisibleBottom: number;
  /** `scrollHeight - clientHeight` on the panel: 0 when the panel itself does not scroll. */
  readonly panelOverflow: number;
  readonly panelScrollTop: number;
  readonly list: LayoutBox | null;
  /** `scrollHeight - clientHeight` on the catalogue list. */
  readonly listOverflow: number;
  /** The list's *computed* `overflow-y`, so a declaration losing to source order shows up. */
  readonly listOverflowY: string;
  /**
   * The header of the panel's last section -- "Enter coordinates". The thing
   * #143 measured below the fold, and the thing that must be on screen.
   */
  readonly lastSectionHeader: LayoutBox | null;
  readonly lastSectionHeaderText: string;
}

/**
 * What the Rooms panel is showing (ADR 0022, amended).
 *
 * Every field is read from the production DOM. The four `*LaidOut` flags are
 * deliberately about layout and not presence: `paintActions` swaps the arm pair
 * for the confirm pair using `hidden`, so a control that is not showing must
 * have no box at all -- a control that is off-screen but still in the tab order
 * is one a keyboard can reach and a player cannot see.
 */
export interface RoomsProbe {
  readonly panelLaidOut: boolean;
  /** Room ids of the catalogue rows, in the order they are drawn. */
  readonly rows: readonly string[];
  readonly selected: string;
  /** `data-area` on the readout block: `x,y,width,height`, or empty for none. */
  readonly area: string;
  readonly areaText: string;
  /**
   * Whether the area readout has a box at all.
   *
   * Laid out and not merely present, for `armLaidOut`'s reason and one more:
   * the block folds when there is no rectangle to report, and `hud.css` gives
   * it an author `display: flex` behind a `:not([hidden])` guard -- so a probe
   * that read the attribute would agree with a rule that had lost its guard and
   * was painting the placeholder anyway.
   */
  readonly areaLaidOut: boolean;
  /** The one note line: the arm hint, the removal hint, the too-small warning or the enclosure warning. */
  readonly noteText: string;
  /** `data-tone`, so a warning is distinguishable from a hint without matching prose. */
  readonly noteTone: string;
  /** The two rule lines: the authored minimum, and the enclosure requirement. */
  readonly ruleText: readonly string[];
  readonly enclosureText: string;
  /** Whether the enclosure readout has a box, for `areaLaidOut`'s reason: it folds until a room has been evaluated. */
  readonly enclosureLaidOut: boolean;
  /** `data-needs` on the panel: the total the readout was told about, or empty when it has no box. */
  readonly panelNeeds: string;
  readonly armLaidOut: boolean;
  readonly removeLaidOut: boolean;
  readonly confirmLaidOut: boolean;
  readonly cancelLaidOut: boolean;
  readonly confirmText: string;
  readonly confirmDisabled: boolean;
  /**
   * What each id in Confirm's `aria-describedby` resolves to, in order:
   * `'note'`, `'refusal'`, `'other'`, or `'dangling'` for an id that names no
   * element. Resolved in the page because the ids are generated.
   */
  readonly confirmDescribedBy: readonly string[];
  /**
   * What the four coordinate fields hold, as the strings the inputs carry:
   * tile X, tile Y, width, height.
   *
   * Read off the DOM rather than from the panel, because the clamp being
   * checked is the field's: `NumberField` is controlled, so what an input shows
   * after a `change` is what its owner accepted, and an owner that accepted an
   * out-of-range number would show it here.
   */
  readonly coordinates: readonly string[];
  /** `data-collapsed` on the typed route's disclosure. */
  readonly coordinatesFolded: string;
  readonly armPressed: string;
  /**
   * The arm control's rendered label -- "Draw on map" disarmed, "Stop drawing"
   * armed.
   *
   * `aria-pressed` beside it says the same thing to a screen reader, and both
   * are read because they are two different promises: one is what the player
   * sees, the other what the toggle announces, and issue #684 is about the
   * moment the seen half was folded off the screen while the state changed
   * underneath it.
   */
  readonly armText: string;
  readonly removePressed: string;
  /**
   * `data-collapsed` on the panel, and whether its body has a box at all.
   *
   * Both, because `hidden` on a body that carries its own `display` is not
   * hidden: before `.ui-panel__body[hidden]` landed in `primitives.css` the
   * attribute and the data flag both said "collapsed" while 404.1px of body
   * stayed on screen, so a probe that read either one alone would have called
   * that fold a success.
   */
  readonly folded: string;
  readonly bodyLaidOut: boolean;
  /**
   * The "not ready" readout (#331 milestone), and whether the browser gave it a
   * box at all.
   *
   * `needsLaidOut` is a `getClientRects()` answer and not the `hidden`
   * attribute, for the reason `bodyLaidOut` above is: this block earns its space
   * only when something is actually missing, so "the browser laid it out" is the
   * only assertion worth making about a state that is supposed to have no box.
   */
  readonly needsLaidOut: boolean;
  /** `data-unfinished`: how many rooms the simulation called unfinished, as a number rather than as prose. */
  readonly needsUnfinished: string;
  /** `data-needs`: how many unmet requirements those rooms have between them. */
  readonly needsTotal: string;
  /** The figure beside the header eyebrow. */
  readonly needsCountText: string;
  /**
   * The room line: which room the readout is about, and where.
   *
   * It named the room *and* one object it wanted until #529 ("Cell at 12, 4
   * needs Bed"). The objects moved to `needsItemText` below when the readout
   * began enumerating all of them, so this is now the heading over that list.
   */
  readonly needsLineText: string;
  /** One entry per object the named room is short, with its quantity, in the order drawn (#529). */
  readonly needsItemText: readonly string[];
  /**
   * The whole block's laid-out height, in CSS pixels.
   *
   * What `ROOM_NEEDS_NAMED_LIMIT` is a budget *for*: that constant is a claim
   * about how much of the rail this readout may spend, and a line count is not
   * that claim -- a spec asserting "three lines are drawn" stays green over a
   * block whose lines have been clipped to nothing.
   */
  readonly needsHeight: number;
}

/**
 * The Rooms panel's geometry, in the shape `BuildLayoutProbe` reports the Build
 * panel's.
 *
 * `lastControlBottom` is the number the reachability assertion turns on. The
 * last block in the panel is the status block, and a floor that is too small
 * pushes it past `panelVisibleBottom` rather than clipping it visibly -- so
 * comparing the enclosure readout's own bottom edge against the fold is what
 * makes "the last control is reachable at 900x600" a measurement rather than a
 * screenshot.
 */
export interface RoomsLayoutProbe {
  readonly viewport: readonly [number, number];
  readonly panel: LayoutBox | null;
  /** The bottom of the panel's *client* box -- the fold, unaffected by scrolling. */
  readonly panelVisibleBottom: number;
  readonly panelOverflow: number;
  readonly panelScrollTop: number;
  /** `scrollHeight - clientHeight` on the panel body, which must never be positive. */
  readonly bodyOverflow: number;
  readonly list: LayoutBox | null;
  /** `scrollHeight - clientHeight` on the catalogue list. Positive is correct here: eighteen rooms. */
  readonly listOverflow: number;
  readonly status: LayoutBox | null;
  readonly lastControlBottom: number;
}

/**
 * What one HUD repaint costs the localization runtime (issue #136).
 *
 * `formatNumberCalls` is counted by the harness's own `HudLocalizer`;
 * `numberFormatConstructions` counts `new Intl.NumberFormat` through a
 * `Proxy` construct trap for the duration of the repaint. Both are counts,
 * never elapsed time -- `docs/BENCHMARKING.md` keeps timing out of assertions.
 */
/**
 * What the HUD shows after the host refused an action (issue #207).
 *
 * Every field is read from the production DOM: the refusal line is not a
 * harness affordance, it is what `mountHud` builds.
 */
export interface RefusalProbe {
  /** True when the refusal line is actually laid out, not merely present. */
  readonly visible: boolean;
  readonly text: string;
  /** `data-action` of the line, i.e. which action it is about. */
  readonly action: string | null;
  /**
   * `data-source` of the line: which producer the standing sentence came from
   * (issue #220, made structural). `'host'` is a command this thread refused
   * before sending it; `'simulation'` is one the worker refused after
   * accepting it. `null` while the line has nothing to say.
   */
  readonly source: string | null;
  /**
   * The line's border box.
   *
   * Measured rather than inferred, because that is the whole lesson of #220:
   * a row can be in the DOM, match a selector and satisfy `toContainText`
   * while occupying a 0x0 box in a folded section. `visible` and these two
   * are asserted together so neither can stand in for the other.
   */
  readonly width: number;
  readonly height: number;
  /** `title` of every control the HUD has marked as having failed. */
  readonly failedControls: readonly string[];
  /** True when every marked control's `aria-describedby` *contains* the refusal line's id. */
  readonly describedByRefusal: boolean;
  /** The line's `role` and `aria-live`, so "a live region says it" is asserted and not assumed. */
  readonly role: string | null;
  readonly ariaLive: string | null;
}

/**
 * The same measurement, for the alerts list's first real row.
 *
 * The comparison #220 rests on and the reason the band exists: at 375x812 the
 * region holding this row is `display: none` outright, and at 1280x800 it is
 * inside a section that starts folded. Asserting the band's box without also
 * measuring this one would prove the band is laid out but not that it was
 * needed.
 */
export interface AlertRowProbe {
  /** True when a non-empty-state row exists in the list at all. */
  readonly present: boolean;
  /** True when that row is actually laid out (`offsetParent !== null`). */
  readonly visible: boolean;
  readonly width: number;
  readonly height: number;
  readonly text: string;
}

export interface RepaintFormatterCost {
  readonly formatNumberCalls: number;
  readonly numberFormatConstructions: number;
}

/**
 * The outcomes the stub importer can report, one per branch
 * `describeImportResult` distinguishes (#287). Named rather than passed as a
 * `SaveImportResult`, so a spec cannot accidentally assert against a shape it
 * built itself.
 */
export type ImportOutcomeName =
  | 'ok'
  | 'ok-migrated'
  | 'not-a-save'
  | 'unsupported-version'
  | 'invalid-shape'
  | 'checksum-mismatch'
  | 'quota-exceeded';

export interface LockstateUiHarness {
  /**
   * Whether every element matching `selector` was actually laid out.
   *
   * The pairing this layer needs for any rendered-text claim: `textContent`,
   * `toHaveText` and `toContainText` all read the DOM and imply nothing about
   * visibility, so a text assertion stays green on an element inside a
   * `display: none` subtree. That is not hypothetical -- `hud.css` drops
   * `.hud__corner` at 720px and below, and a rendered-text assertion on a
   * region inside it passed while the text was not on the page at all
   * (#218 section 6.6).
   *
   * False when the selector matches nothing, so pairing an assertion with
   * this cannot go vacuous by outliving the element it was written for.
   */
  laidOut(selector: string): boolean;

  mountSavePanel(options?: { readonly pseudoLocale?: boolean }): void;
  clickSaveButton(label: string): boolean;
  saveButtonState(label: string): ButtonState;
  savePanelStatus(): string;
  /** Every string the panel has actually rendered, for the ADR 0011 check (issue #208). */
  savePanelText(): readonly string[];
  createCalls(): number;
  prisonRowCount(): number;
  releaseCreate(outcome: 'ok' | 'worker-timeout'): void;
  /**
   * Gives the stub an active session, which is the state an import needs: a
   * save file goes into a prison, and `SessionController.importInto` requires
   * one that exists (#287).
   */
  activateSession(prisonId: string): void;
  /** What the stub's `importInto` will report next. */
  setImportOutcome(outcome: ImportOutcomeName): void;
  /**
   * Every value the panel has handed to `importInto`, as JSON.
   *
   * The proof that the control is not inert: an Import button that read the
   * file and dropped it would leave this empty while every rendered-text
   * assertion still passed.
   */
  importedRaw(): readonly string[];
  /** Whether the panel called `loadPrison` after an import, and for which prison. */
  loadedPrisons(): readonly string[];
  /** Re-reads the slot list, which is what paints the list rows and the empty-list row. */
  refreshSavePanel(): Promise<void>;
  settleSavePanel(): Promise<void>;

  mountHudShell(options?: { readonly empty?: boolean; readonly buildables?: number }): void;
  hudProbe(): HudProbe;
  clickTab(tab: string): boolean;
  clickTransport(label: string): boolean;
  toggleAlerts(): boolean;
  /** Records the identity of the alert rows now on the page, for `alertProbe().reused`. */
  markAlertRows(): void;
  alertProbe(): AlertProbe;
  hudIntents(): readonly string[];
  setHudViewModel(viewModel: HudViewModel): void;
  /** Makes the host's handler for `set-clock` block until released. */
  holdClockIntents(enabled: boolean): void;
  releaseClockIntent(): void;
  /** Makes the host's handler reject every intent, which is what a refusal is. */
  failIntents(enabled: boolean): void;
  refusalProbe(): RefusalProbe;
  /** The alerts list's first non-empty row, measured the same way. */
  alertRowProbe(): AlertRowProbe;
  /** The HUD's rendered text, for the before/after comparison issue #207 was filed on. */
  hudText(): string;
  transportDisabled(): boolean;
  layoutProbe(): LayoutProbe;

  /**
   * The Intake panel (#261 step 4), which shares `.hud__side` with the Build
   * panel and is shown on the Overview tab instead of it.
   */
  intakeProbe(): IntakeProbe;
  /** Presses the admit button. A real click, so a disabled button genuinely does nothing. */
  clickAdmitPrisoner(): boolean;

  buildProbe(): BuildProbe;
  /** The Staff panel on the Security tab (ADR 0025). */
  staffProbe(): StaffProbe;
  /** Presses the hire button. A real click, so a disabled button genuinely does nothing. */
  clickHireStaff(): boolean;
  clickArmBuild(): boolean;
  /** Turns the Build panel's removal mode on or off (ADR 0028 phase 3). A real click. */
  clickRemoveObject(): boolean;
  expandBuildCoordinates(): boolean;
  clickBuildable(definitionId: string): boolean;
  stepBuildCoordinate(axis: 'x' | 'y', direction: 'up' | 'down'): boolean;
  clickBuildEdge(edge: string): boolean;
  /**
   * Aims the panel's target readout at one tile edge, the way the world does.
   *
   * `main.ts` wires `BuildTool.attachReadout` straight into
   * `HudHandle.setBuildTarget`, and this calls that same method on the mounted
   * HUD -- driving a real Phaser pointer belongs to `app-shell.spec.ts`. The
   * numeric edge chooser deliberately does *not* feed this readout: choosing
   * an edge there changes what `clickPlaceOrder` will send, not what the
   * player is currently aimed at. So the readout has to be aimed to be read.
   *
   * `null` clears it. Returns `false` when no HUD is mounted, so a spec cannot
   * pass by asserting about an aim that never happened.
   */
  aimBuildTarget(
    target: { readonly x: number; readonly y: number; readonly edge: string; readonly segments: number } | null,
  ): boolean;
  clickPlaceOrder(): boolean;
  /** Opens or closes the buy disclosure (#89). */
  clickBuyToggle(): boolean;
  /** One press of the quantity stepper. */
  stepBuyQuantity(direction: 'up' | 'down'): boolean;
  /** Types a quantity into the field the way a keyboard user does. */
  typeBuyQuantity(value: string): boolean;
  /** Presses the buy button. A real click, so a disabled button genuinely does nothing. */
  clickBuy(): boolean;
  /**
   * The *world* route to the same command: one finished drag, however many
   * edges it covered (issue #225).
   *
   * It calls the sink the HUD registered on `MountHudOptions.worldBuild`,
   * which is what `BuildTool` calls in the running application. Driving a real
   * canvas belongs to `app-shell.spec.ts`; what this exercises is the half
   * that lives in `mountHud` -- that a gesture becomes one gated intent and
   * that a refusal of it is painted.
   *
   * Returns `false` when no sink is registered, so a spec cannot pass by
   * asserting about a gesture that never happened.
   */
  dragWorldBuild(definitionId: string, edges: readonly { x: number; y: number; edge: string }[]): boolean;
  /**
   * The world's undo or redo key, as the HUD hears it (#261).
   *
   * It calls the sink the HUD registered on `MountHudOptions.editHistory`,
   * which is what `BuildTool.undo()` calls in the running application. The key
   * itself is `world-scene-input.spec.ts`'s; what this exercises is the half
   * that lives in `mountHud` -- that a request becomes one gated intent and
   * that a refusal of it is painted, with no control to mark.
   *
   * Returns `false` when no sink is registered, so a spec cannot pass by
   * asserting about a key press that never reached the HUD.
   */
  pressWorldUndo(direction: string): boolean;
  /**
   * A finished room gesture, as the HUD hears one (ADR 0022).
   *
   * It calls the sink the HUD registered on `MountHudOptions.worldRooms`, which
   * is what `RoomTool.place()` calls in the running application. Driving a real
   * canvas belongs to `app-shell.spec.ts`; what this exercises is the half that
   * lives in `mountHud` and the panel -- and the difference from
   * `dragWorldBuild` is the point of it: **a release dispatches nothing**. The
   * rectangle becomes pending, and the intent leaves when the confirm control
   * is pressed.
   *
   * Returns `false` when no sink is registered, so a spec cannot pass by
   * asserting about a gesture that never happened.
   */
  dragWorldRoom(
    area: { x: number; y: number; width: number; height: number },
    removing?: boolean,
  ): boolean;
  /** The live readout as the pointer moves; `undefined` clears it. */
  hoverWorldRoom(area: { x: number; y: number; width: number; height: number } | undefined): boolean;
  /**
   * Controls what the room tool's stand-in reports for `classifyArea` (issue
   * #493) -- the answer to "is this rectangle's own perimeter walled in",
   * which `RoomTool` would otherwise answer from a real `WorldRenderView` this
   * harness never builds. Defaults to `'sealed'` -- **not** the `'open'`
   * answer a real, worldless tool gives -- because every spec written before
   * #493 drags an ordinary rectangle expecting an ordinary designation to
   * succeed, and none of them calls this. Only a spec that is itself about
   * enclosure needs to.
   *
   * Takes effect for every `dragWorldRoom` and `clickRoomsControl('coordinates-submit')`
   * call from here on, so a spec sets it once before the gesture whose warning
   * it is asserting about.
   */
  setWorldRoomEnclosure(enclosure: 'sealed' | 'open'): void;
  clickRoomType(roomId: string): boolean;
  /**
   * A real click on one of the panel's controls, so a disabled or hidden one
   * does not fire. Four of them are the actions row; `fold` is the panel's own
   * header control; `coordinates` is the typed route's disclosure header and
   * `coordinates-submit` the control inside it that produces the rectangle.
   */
  clickRoomsControl(
    control: 'arm' | 'remove' | 'confirm' | 'cancel' | 'fold' | 'coordinates' | 'coordinates-submit',
  ): boolean;
  /**
   * Types into the panel's coordinate fields, the way a player's keyboard does:
   * the value lands in the input and the input reports `change`.
   *
   * Nothing becomes pending here. The fields are the typed route's *aim*, and
   * `clickRoomsControl('coordinates-submit')` is its release -- the same
   * separation a drag has between moving and letting go.
   *
   * Fields left out of the object are left alone, so a spec can move one number
   * of four and say so. Returns `false` when a named field is not in the DOM,
   * so a spec cannot pass by typing into nothing.
   */
  typeRoomCoordinates(values: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): boolean;
  /**
   * Publishes what the simulation said about the last room designated.
   *
   * In the running application this arrives on `simulation/status-counts` and
   * reaches the view model through `hudZoningFromWorkerMessage`; here it is set
   * directly, because what the specs exercise is what the *panel* does with it.
   */
  reportZoning(
    notice: { readonly sequence: number; readonly enclosure: 'sealed' | 'open'; readonly requirement: 'enclosed' | 'outdoors' | 'none' } | undefined,
  ): void;
  /**
   * Publishes what the rooms are still missing, which in the real app is read
   * over `simulation/request-projection` by `src/ui/simulation-room-needs.ts`.
   *
   * `undefined` is "nothing has been asked", which is a different fact from a
   * model reporting no unfinished rooms -- both draw nothing, and the panel has
   * to be handed each of them to prove it.
   */
  reportRoomNeeds(needs: HudRoomNeedsViewModel | undefined): void;
  /** Publishes the build queue, which in the real app arrives over `simulation/request-projection`. */
  reportBuildQueue(queue: HudBuildQueueViewModel | undefined): void;
  /** Presses the queue fold's header. Returns false when the section is not laid out. */
  toggleBuildQueue(): boolean;
  /** Presses the cancel control on the row aimed at `orderId`. Returns false when no such row is laid out. */
  pressBuildQueueCancel(orderId: string): boolean;
  /**
   * Publishes what has been bought and has not arrived, which in the real app is
   * read over `simulation/request-projection` by
   * `src/ui/simulation-pending-deliveries.ts` (#285).
   *
   * `queue` is optional and reported alongside, because the two surfaces share a
   * panel and their heights interact: a queue takes 45px out of the catalogue's
   * floor, and the disclosure below it has to still fit.
   */
  reportPendingDeliveries(
    deliveries: HudPendingDeliveriesViewModel | undefined,
    queue?: HudBuildQueueViewModel,
  ): void;
  /** Presses the cancel control on the delivery row aimed at `orderId`. Returns false when no such row is laid out. */
  pressPendingDeliveryCancel(orderId: string): boolean;
  /**
   * Publishes which guards are held and by what, which in the real app is read
   * over `simulation/request-projection` by `src/ui/simulation-held-guards.ts`
   * (ADR 0034).
   *
   * `undefined` is "nothing has been asked", which is a different fact from a
   * model reporting no held guards -- the first draws no block at all and the
   * second draws a sentence, and the panel has to be handed each to prove it.
   */
  reportHeldGuards(held: HudHeldGuardsViewModel | undefined): void;
  /** Publishes where the prison's arrivals are, the way `IntakePipelineReader` does in the real app. */
  reportIntakePipeline(pipeline: HudIntakePipelineViewModel | undefined): void;
  /**
   * Publishes how many guards the prison asks for against how many it has,
   * which in the real app is read over `simulation/request-projection` by
   * `src/ui/simulation-staff-coverage.ts` (ADR 0048).
   *
   * `undefined` is "nothing has been asked", which is a different fact from a
   * model reporting no shortage -- the first draws no block at all and the
   * second draws a green badge, and the panel has to be handed each to prove
   * that a prison nothing is answering for does not read as a covered one.
   */
  reportStaffCoverage(coverage: HudStaffCoverageViewModel | undefined): void;
  /** Presses the release control on the row aimed at `guardId`. Returns false when no such row is laid out. */
  pressGuardRelease(guardId: number): boolean;
  /** The Regime panel on the fifth tab (issue #451). */
  regimeProbe(): RegimeProbe;
  /**
   * Publishes what each classification group's day allows and who is in the
   * prison, which in the real app arrive over `simulation/request-projection`
   * by way of `src/ui/simulation-regime.ts` and
   * `src/ui/simulation-prisoner-roster.ts`.
   *
   * Both in one call, and that is not a convenience: they are the two blocks of
   * one panel and their heights interact, so a spec that could only publish one
   * at a time could never measure the panel a player actually gets. The same
   * reason `reportPendingDeliveries` takes the queue beside the deliveries.
   *
   * Spread rather than passed as `undefined`, so "nothing has been asked" is an
   * absent property: `exactOptionalPropertyTypes` is on, and the panel branches
   * on the field being there at all -- absent draws no block, and a present
   * roster with `total: 0` draws the sentence about an empty prison only when
   * `everAdmitted` is also false. A `total: 0` roster with `everAdmitted: true`
   * -- everybody admitted has since left -- draws neither sentence (issue
   * #506; see `regime-panel.ts`'s `paintRoster`).
   */
  reportRegime(regime: HudRegimeViewModel | undefined, roster?: HudPrisonerRosterViewModel): void;
  roomsProbe(): RoomsProbe;
  roomsLayoutProbe(): RoomsLayoutProbe;
  buildLayoutProbe(): BuildLayoutProbe;
  /** Repaints the HUD with a changed view model and reports what it cost the localizer. */
  measureRepaintFormatterCost(): RepaintFormatterCost;

  takeUnhandledRejections(): readonly string[];
}

declare global {
  interface Window {
    lockstateUiHarness: LockstateUiHarness;
  }
}
