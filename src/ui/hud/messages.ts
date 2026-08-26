import type { LocalizationKey } from '../../content/localization';

/**
 * Every message key the HUD can render.
 *
 * ADR 0011: the HUD contains no literal user-facing text. A key is a stable
 * ASCII identifier that never reaches a player; the text is resolved at
 * render time through the localization runtime and an unresolved key renders
 * as itself -- visible, greppable and obviously wrong in a screenshot rather
 * than a blank gap.
 *
 * Collected in one frozen object so `tests/unit/ui-hud-messages.test.ts` can
 * assert that the bundled default catalog resolves all of them. A key added
 * here without a default-locale entry fails `pnpm test` rather than shipping
 * as raw dotted text on someone's screen.
 */
export const HUD_MESSAGE_KEY = {
  statusRegion: 'hud.status.title',
  prisoners: 'hud.status.prisoners',
  staff: 'hud.status.staff',
  rooms: 'hud.status.rooms',
  incidents: 'hud.status.incidents',
  contraband: 'hud.status.contraband',
  /**
   * The treasury balance chip (#96).
   *
   * "Funds" rather than a currency name, because #96 decided that money is
   * the primary resource and did not name one, and ADR 0017 -- Accepted, and
   * Accepted in full -- names none either. A label that names no currency lets
   * the number be shown honestly without inventing one.
   */
  funds: 'hud.status.funds',
  /**
   * The rising "earned today" chip beside the balance (#29).
   *
   * Named for what the number is -- what this in-game day has earned so far --
   * rather than for the flow behind it, and the distinction is not cosmetic.
   * The state pays per prisoner-day at the end of the day (ADR 0017 decisions
   * 3 and 6), so the figure beside the balance is *this day's accrual*. A
   * label reading "Income", "Budget" or "Projected" would each name something
   * no system produces: there is no rate to display, no budget to spend
   * against, and nothing that forecasts past the current day.
   *
   * The one honest caveat, since the accrual prorates *current* occupancy
   * across the ticks already served (`stateIncomeAccruedByTick`): if occupancy
   * changes mid-day the figure restates the whole elapsed day at the new
   * occupancy rather than tracking what each tick actually held. "Earned
   * today" is still the right name for it -- it is what the day will pay -- and
   * nothing in `src/` can change occupancy mid-day today, because nothing can
   * admit a prisoner.
   */
  earnedToday: 'hud.status.earned-today',
  occupancy: 'hud.status.occupancy',
  occupancyValue: 'hud.status.occupancy-value',
  incidentsClear: 'hud.status.incidents-clear',
  incidentsActive: 'hud.status.incidents-active',

  clockRegion: 'hud.clock.title',
  /**
   * Names the value beside the day number for a screen reader.
   *
   * It replaced `hud.clock.time`, which labelled an `HH:MM` readout the
   * simulation never produced: there is no hour-of-day in Lockstate
   * (`docs/HUD_PROJECTIONS.md`, gap 5), so what the strip shows is the
   * position within the in-game day and the label has to say so.
   */
  clockDayProgress: 'hud.clock.day-progress',
  clockDay: 'hud.clock.day',
  clockSpeed: 'hud.clock.speed',
  transportPause: 'hud.transport.pause',
  transportPlay: 'hud.transport.play',
  transportFastForward: 'hud.transport.fast-forward',

  tabsRegion: 'hud.tabs.title',
  tabOverview: 'hud.tab.overview',
  tabBuild: 'hud.tab.build',
  tabSecurity: 'hud.tab.security',
  tabRegime: 'hud.tab.regime',
  tabRooms: 'hud.tab.rooms',

  minimapTitle: 'hud.minimap.title',
  minimapPlaceholder: 'hud.minimap.placeholder',
  alertsTitle: 'hud.alerts.title',
  alertsEmpty: 'hud.alerts.empty',

  panelCollapse: 'hud.panel.collapse',
  panelExpand: 'hud.panel.expand',

  buildTitle: 'hud.build.title',
  buildCatalogue: 'hud.build.catalogue',
  buildCatalogueEmpty: 'hud.build.catalogue-empty',
  buildSelected: 'hud.build.selected',
  buildPlacement: 'hud.build.placement',
  buildTileX: 'hud.build.tile-x',
  buildTileY: 'hud.build.tile-y',
  buildStepDown: 'hud.build.step-down',
  buildStepUp: 'hud.build.step-up',
  buildEdge: 'hud.build.edge',
  buildSubmit: 'hud.build.submit',
  buildNote: 'hud.build.note',

  buildArm: 'hud.build.arm',
  buildDisarm: 'hud.build.disarm',
  buildArmHint: 'hud.build.arm-hint',
  buildTargetNone: 'hud.build.target-none',
  buildTargetValue: 'hud.build.target-value',
  buildTargetRun: 'hud.build.target-run',
  buildCoordinates: 'hud.build.coordinates',
  buildCoordinatesHint: 'hud.build.coordinates-hint',
  /*
   * The removal mode's four keys (ADR 0028 phase 3).
   *
   * `buildRemove` and `buildRemoveActive` are the two labels of one toggle,
   * spelled the way `roomsRemove`/`roomsRemoveActive` are because they are the
   * same control on a different surface: the button says what pressing it will
   * do, so it reads "Remove" while off and "Stop removing" while on.
   * `buildRemoveHint` replaces the arm hint in the note line, which is one line
   * tall either way so the controls under it cannot move. `buildRemoveSubmit`
   * relabels the numeric route's one submit button, because that route is
   * removal's keyboard half and a button saying "Place order" must not clear a
   * tile.
   */
  buildRemove: 'hud.build.remove',
  buildRemoveActive: 'hud.build.remove-active',
  buildRemoveHint: 'hud.build.remove-hint',
  buildRemoveSubmit: 'hud.build.remove-submit',

  /**
   * The purchase surface (#89).
   *
   * `buildBuy` labels the disclosure that sits beside "Place on map" and
   * costs the panel no height of its own; the other three label the row it
   * reveals. None of them names a currency, for the reason `funds` does not:
   * #96 decided money is the primary resource and named no currency, so the
   * figures are rendered as the plain minor units every price in
   * `src/content/procurement-catalog.ts` is quoted in.
   *
   * `buildBuySubmit` states the quantity, the material and the total in one
   * sentence, so the button says what pressing it will spend rather than
   * leaving the player to multiply. The step buttons reuse `buildStepDown`
   * and `buildStepUp` with the quantity field's own label -- a second pair
   * saying "Decrease quantity" would be the same sentence maintained twice.
   */
  buildBuy: 'hud.build.buy',
  buildBuyQuantity: 'hud.build.buy-quantity',
  buildBuySubmit: 'hud.build.buy-submit',
  buildBuyHint: 'hud.build.buy-hint',
  /**
   * The queue block, which is what #348 made worth building.
   *
   * Construction now builds one order at a time, so a twelve-segment run
   * finishes at tick 730 rather than 70 -- and nothing on screen said a queue
   * existed. `buildQueue` labels the fold, `buildQueueCount` is the figure in its
   * header (the whole queue, not the rows that fit), and `buildQueueOrder` is one
   * row: what it is, where it is, which edge, and what it is waiting for. The
   * state's own word comes from `build-order-state` in
   * `src/content/simulation-message-keys.ts` rather than from a key here, for the
   * reason the edge labels do -- it is a projected simulation enum, and a second
   * set of words for it here would drift.
   *
   * `buildQueueCancel` is the badge on every row saying what pressing it does.
   * A row that only named an order would be a control whose action a player has
   * to guess, and this one is destructive.
   *
   * `buildQueueUnnamed` is for an order whose buildable the host names no key
   * for -- possible by construction (`docs/HUD_PROJECTIONS.md` gap 32) and not
   * reachable with the shipped catalogue. The row is still drawn, because an
   * order nobody can name is still an order a player may want to withdraw.
   *
   * `buildQueueMore` states how many orders are queued behind the last row
   * shown, and the reason there is no control to reach them is in
   * `BUILD_QUEUE_ROW_LIMIT`: the list is the crew's schedule, so the rows are
   * the orders that are about to happen, and taking a whole run back is what
   * `Undo` is for.
   */
  buildQueue: 'hud.build.queue',
  buildQueueCount: 'hud.build.queue-count',
  buildQueueOrder: 'hud.build.queue-order',
  buildQueueCancel: 'hud.build.queue-cancel',
  buildQueueUnnamed: 'hud.build.queue-unnamed',
  buildQueueMore: 'hud.build.queue-more',
  /**
   * What has been bought and has not arrived, inside the buy disclosure (#285).
   *
   * These label the one surface in the interface that says money is in transit,
   * and they sit **beside the control that spent it** rather than in a block of
   * their own -- see `PENDING_DELIVERY_ROW_LIMIT` for the measurement that
   * decided that, which is a fact about the panel's height rather than a
   * preference about layout.
   *
   * `buildDeliveries` labels the group and `buildDeliveriesCount` is the figure
   * beside it: how many purchases are out and what they would refund. The refund
   * total is the number #285 is about -- the status strip says what is left, and
   * nothing said what is out.
   *
   * `buildDelivery` is one row: how much of what, and what cancelling it gives
   * back. `buildDeliveryCancel` is the control's own word, because a row that
   * only named a delivery would leave a player guessing what pressing it does.
   * Neither names a currency, for the reason `buildBuySubmit` does not.
   *
   * `buildDeliveryUnnamed` is for a delivery whose item the host names no key
   * for. The row is still drawn: money nobody can label is still money, and
   * dropping the row would hide the only control that recovers it.
   *
   * `buildDeliveriesMore` states how many purchases are behind the last row, and
   * unlike `buildQueueMore` it names no alternative control -- there is no
   * `Undo` for a purchase. It says what actually happens instead: the rows are
   * the deliveries arriving soonest, and the rest come into view as those land.
   */
  buildDeliveries: 'hud.build.deliveries',
  buildDeliveriesCount: 'hud.build.deliveries-count',
  buildDelivery: 'hud.build.delivery',
  buildDeliveryCancel: 'hud.build.delivery-cancel',
  buildDeliveryUnnamed: 'hud.build.delivery-unnamed',
  buildDeliveriesMore: 'hud.build.deliveries-more',

  /**
   * The Staff panel on the Security tab
   * ([ADR 0025](../../../docs/adr/0025-guard-hiring-surface.md)).
   *
   * `securityStaffTitle` names the panel and `securityStaffRoles` the list of
   * roles it can hire; `securityStaffHire` is the one action, and it states
   * the role and what the press will spend in a single sentence so that the
   * figure is a statement about the button rather than a standalone readout
   * -- exactly the distinction `hud.build.buy-submit` draws, and the reason
   * neither key carries a money word.
   *
   * None of them names a currency, for the reason `funds` does not: #96
   * decided money is the primary resource and named no currency, so the
   * figure is rendered as the plain minor units the treasury, the procurement
   * catalogue and the staff-role catalogue's wage bands are all quoted in.
   */
  securityStaffTitle: 'hud.security.staff',
  securityStaffRoles: 'hud.security.roles',
  securityStaffRolesEmpty: 'hud.security.roles-empty',
  securityStaffSelected: 'hud.security.selected',
  securityStaffHire: 'hud.security.hire',
  securityStaffHint: 'hud.security.hire-hint',

  /**
   * The Staff panel's held-guards list
   * ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)).
   *
   * `securityHeldTitle` names the section and `securityHeldSummary` states the
   * pair that makes a release a decision rather than a button -- how many guards
   * are held against how many are free. `securityHeldRow` is one row: who, and
   * what is holding them. `securityHeldRelease` is the action, and it names no
   * claim, because a release does the same thing whatever held the guard --
   * which is ADR 0034's whole shape and would be undone by three verbs.
   *
   * `securityHeldEmpty` exists because a blank rectangle is indistinguishable
   * from a broken one, the rule `hud.security.roles-empty` follows one section up.
   * `securityHeldMore` is the overflow line, in the shape
   * `hud.build.deliveries-more` set: the list is windowed to the panel's row
   * budget and the header counts the whole roster, so the difference has to be
   * said rather than implied by a list that stops.
   */
  securityHeldTitle: 'hud.security.held',
  securityHeldSummary: 'hud.security.held-summary',
  securityHeldEmpty: 'hud.security.held-empty',
  securityHeldRow: 'hud.security.held-row',
  securityHeldRowUnnamed: 'hud.security.held-row-unnamed',
  securityHeldRelease: 'hud.security.held-release',
  securityHeldMore: 'hud.security.held-more',
  securityHeldHint: 'hud.security.held-hint',

  /**
   * Labels for the two `BUILDABLE_REGISTRY` entries whose ids name no content
   * entry.
   *
   * Two of four since ADR 0028 phase 2, and it is these two that stay: a
   * buildable with a `placesObjectId` is labelled by that object's own
   * `nameKey` (`buildableLabelKey` in `src/main.ts` records why), so `bed-wooden`
   * reads `object.bed.name` and `toilet-brick` reads `object.toilet.name` and
   * neither needs a key here. `wall-brick` and `door-wooden` place no object and
   * therefore still do.
   *
   * They live here, in the HUD's own namespace, because that registry carries
   * a hard-coded English `name` and no `nameKey` -- an ADR 0011 gap issue #74
   * records and leaves to the content layer (`docs/HUD_PROJECTIONS.md`, gap
   * 32). When a buildable gains a real `content.*` key these two go away and
   * the host passes the catalog's key through instead; nothing else changes,
   * because the panel already renders whatever key it is handed.
   */
  buildableWallBrick: 'hud.build.buildable.wall-brick',
  buildableDoorWooden: 'hud.build.buildable.door-wooden',

  /**
   * The catalogue's category filter (#390,
   * [ADR 0035](../../../docs/adr/0035-buildable-catalogue-category-filter.md)).
   *
   * **Three keys, not eight.** The seven groups a player can choose between
   * are the seven categories `src/content/object-catalog.ts` authors, and each
   * is named in the *content* namespace by `OBJECT_CATEGORY_NAME_KEYS` -- the
   * same split `buildableWallBrick` above already lives on the other side of.
   * A `hud.build.category.furniture` key here would author a second English
   * word for a content fact and let the two drift, which is the mistake
   * `buildableLabelKey`'s comment in `src/main.ts` refuses for row labels.
   *
   * These three are the panel's own, because none of them names content:
   *
   *   - `buildCategory` is the control's accessible name. The filter sits in
   *     the catalogue's header row beside a 44px eyebrow, with no room for a
   *     visible label of its own, so this is an `aria-label` -- which is
   *     allowed here and not a tooltip-only label, because the control shows
   *     its own current value as its visible text.
   *   - `buildCategoryAll` is the option that filters nothing, and it is the
   *     arrival state: the panel arrives showing every row, exactly as it did
   *     before this filter existed, so nothing a player already knew moved.
   *   - `buildCategoryStructure` is the group for the two buildables that
   *     place no object -- `wall-brick` and `door-wooden` -- and so belong to
   *     no `ObjectCategory`. It is a HUD key rather than a content one for the
   *     same reason the two labels above it are: there is no content entry to
   *     read it off.
   */
  buildCategory: 'hud.build.category',
  buildCategoryAll: 'hud.build.category-all',
  buildCategoryStructure: 'hud.build.category.structure',

  /**
   * The intake surface (#261 step 4).
   *
   * `intakeHint` is not decoration and is not a disclaimer. Until something
   * in the application can zone a room, every press of the admit control is
   * refused, and a control that can only be refused has to say why *before*
   * it is pressed as well as after -- the refusal line answers "that did not
   * happen", and the hint answers "and it will not until you have somewhere
   * to put them". The two sentences are different jobs and neither replaces
   * the other.
   */
  intakeTitle: 'hud.intake.title',
  intakeAdmit: 'hud.intake.admit',
  intakeHint: 'hud.intake.hint',

  /**
   * Where the arrivals the player has already admitted are (#104's channel,
   * third consumer).
   *
   * Four keys for one readout, and the split is the readout's whole point.
   * `intakePipeline` and `intakePipelineCount` are the block's header -- the
   * eyebrow, and how many of the prison's people are still in intake.
   * `intakePipelineStage` is one line per stage that holds somebody, and the
   * stage's *own* name is interpolated into it from the key the simulation's
   * enum catalog derives (`intake-stage.*.name`), never authored here.
   *
   * `intakePipelineFailed` is a separate sentence rather than a fifth stage
   * line, because the fact is a different kind: an arrival waiting for a cell
   * is released the moment a place exists, and one in the terminal `failed`
   * stage is released by nothing at all (ADR 0028 decision 8). One sentence
   * covering both would tell a player that building something will help when
   * it will not.
   */
  intakePipeline: 'hud.intake.pipeline',
  intakePipelineCount: 'hud.intake.pipeline-count',
  intakePipelineStage: 'hud.intake.pipeline-stage',
  intakePipelineFailed: 'hud.intake.pipeline-failed',

  /**
   * What the player is told when a control's action was refused (issue #207).
   *
   * One key per *command* intent rather than one generic sentence, because
   * each command leaves the prison in a different state and a player acting
   * on the message needs to know which: a refused clock change leaves the
   * simulation running exactly as it was, a refused build order leaves
   * nothing queued, a refused purchase leaves the money where it was, and a
   * refused undo or redo leaves in place whatever the player was trying to
   * take back or reapply.
   *
   * `refusalPurchaseMaterials` covers both ways a purchase is refused before
   * it is sent -- no session at all, and a total the last published balance
   * cannot cover -- because they leave the prison in the same state and there
   * is nothing different for the player to do about them. What it does *not*
   * cover is a refusal the worker makes after accepting the command, and that
   * is a division of labour rather than a gap: since #261 all eight command
   * routes record to the session's `RefusalLog`
   * (`src/simulation/runtime/session-commands.ts`), and the sentence comes
   * from `hud.alert.refusal.*` -- the simulation's own vocabulary, mapped in
   * `src/ui/simulation-alerts.ts`, which can say *why* where these keys can
   * only say *what*. Both land on the same band; see the refusal element in
   * `hud.ts` for the one-line rule that governs it.
   *
   * Deliberately no key for the thrown `Error`'s own text. Those messages are
   * hard-coded English raised on the main thread (`src/ui/simulation-commands.ts`,
   * `src/main.ts`), so putting one on screen would put untranslated text in
   * the HUD -- which ADR 0011 and `tests/unit/ui-hud-messages.test.ts` forbid.
   * The diagnostic detail stays with the host through `MountHudOptions.onError`;
   * what reaches the player is a localized sentence about the outcome.
   */
  /**
   * The Rooms panel (ADR 0022, amended).
   *
   * A dedicated tab rather than a block inside Build, which is the surface the
   * owner chose over that ADR's original decision: the Build panel's whole
   * always-visible budget at 900x600 is 7.81px, and this panel needs a
   * confirm step, a removal control, a minimum-size rule, an enclosure
   * readout and a catalogue of eighteen rows. Those are the strings for all
   * five.
   *
   * `roomsConfirm` and `roomsCancel` are the confirm step, and it is a step
   * rather than a straight submit for a reason the removal control does not
   * remove: a designation can cover 4,096 tiles, and while `UnzoneRoom` now
   * makes that recoverable, "recoverable" is not the same as "costless" --
   * removal grows each covered tile into its whole same-type run, so undoing
   * an accidental overlap of two rooms takes both away. Two Point Hospital
   * puts a confirm on the same gesture for the same reason.
   *
   * `roomsMinimum` states the authored floor, so the rule is readable *before*
   * the drag rather than only in the refusal after it. `roomsEnclosureSealed`
   * and `roomsEnclosureOpen` are the readout of what the simulation actually
   * found, and `roomsEnclosureOpenRequired` is the one case that is worth
   * flagging: the room asked to be enclosed and the rectangle's perimeter is
   * not. It is a *warning*, never a refusal -- see
   * `src/simulation/rooms/enclosure.ts` for why the simulation cannot honestly
   * refuse on it.
   */
  roomsTitle: 'hud.rooms.title',
  roomsCatalogue: 'hud.rooms.catalogue',
  roomsCatalogueEmpty: 'hud.rooms.catalogue-empty',
  roomsSelected: 'hud.rooms.selected',
  roomsArm: 'hud.rooms.arm',
  roomsDisarm: 'hud.rooms.disarm',
  roomsArmHint: 'hud.rooms.arm-hint',
  roomsRemove: 'hud.rooms.remove',
  roomsRemoveActive: 'hud.rooms.remove-active',
  roomsRemoveHint: 'hud.rooms.remove-hint',
  roomsArea: 'hud.rooms.area',
  roomsAreaNone: 'hud.rooms.area-none',
  roomsAreaValue: 'hud.rooms.area-value',
  roomsConfirm: 'hud.rooms.confirm',
  roomsConfirmRemove: 'hud.rooms.confirm-remove',
  roomsCancel: 'hud.rooms.cancel',
  roomsMinimum: 'hud.rooms.minimum',
  roomsMinimumNone: 'hud.rooms.minimum-none',
  roomsTooSmall: 'hud.rooms.too-small',
  roomsEnclosure: 'hud.rooms.enclosure',
  roomsEnclosureNone: 'hud.rooms.enclosure-none',
  roomsEnclosureSealed: 'hud.rooms.enclosure-sealed',
  roomsEnclosureOpen: 'hud.rooms.enclosure-open',
  roomsEnclosureOpenRequired: 'hud.rooms.enclosure-open-required',
  roomsRequirementEnclosed: 'hud.rooms.requirement-enclosed',
  roomsRequirementOutdoors: 'hud.rooms.requirement-outdoors',
  roomsRequirementNone: 'hud.rooms.requirement-none',
  /*
   * What a designated room is still missing (#331 milestone).
   *
   * The five keys of the readout that answers "I zoned a cell and nothing
   * happened". The simulation has been able to answer that since #123 --
   * `projectRoomList` reports `missingCapability` per room and
   * `projectRoomDetail` names the object each unmet requirement wants -- and
   * until now nothing under `src/ui/` asked it, so the panel that made the room
   * could not say why the room does nothing.
   *
   * `roomsNeeds` and `roomsNeedsCount` are the block's header: the eyebrow and,
   * beside it, how many of the prison's rooms are unfinished. The pair is
   * shaped like `roomsEnclosure` and its value deliberately -- label left,
   * figure right -- because it is the same kind of line: a readout of what the
   * simulation found, not a control.
   *
   * `roomsNeedsOne` and `roomsNeedsMore` are the *one* detail line, in its two
   * forms: what one unfinished room needs, and the same with a count of
   * everything else that went unnamed. Two keys chosen in code rather than one
   * with a nested plural, which is the split ADR 0011 names outright ("where a
   * message genuinely needs nested selection, it is split into separate keys
   * chosen in code").
   *
   * **One line and not a list**, and that is a measurement rather than a
   * preference -- see `ROOM_NEEDS_NAMED_LIMIT` in `rooms-panel.ts` for the
   * numbers. The panel's height at 900x600 is fixed by the rail and its
   * catalogue list is already on its one-row floor there, so the whole readout
   * has about 43px to live in. A three-row list measured 101.3px and pushed the
   * rule readout 58px below the panel's fold, which is the #174 defect with a
   * new cause.
   *
   * `roomsNeedsObjectUnknown` stands in for the object's name when the object
   * catalogue defines nothing under the id the requirement names -- which is
   * the *reason* the projection calls that requirement unmet. Substituted as
   * `{object}` rather than given the sentence a fourth variant, and it is a key
   * rather than a blank because a sentence that trailed off would read as a
   * rendering bug rather than as the content error it is.
   *
   * There is deliberately **no** "every room is ready" key. A room that is fine
   * earns no line at all -- the block is not drawn -- which is what keeps this
   * out of the way of a panel whose always-visible budget ADR 0022 measured at
   * 7.9px.
   */
  roomsNeeds: 'hud.rooms.needs',
  roomsNeedsCount: 'hud.rooms.needs-count',
  roomsNeedsOne: 'hud.rooms.needs-one',
  roomsNeedsMore: 'hud.rooms.needs-more',
  roomsNeedsObjectUnknown: 'hud.rooms.needs-object-unknown',

  refusalSetClock: 'hud.refusal.set-clock',
  refusalPlaceBuildOrder: 'hud.refusal.place-build-order',
  refusalPurchaseMaterials: 'hud.refusal.purchase-materials',
  /**
   * A hire the host refused before it was sent -- no session at all, or a wage
   * the last published balance cannot cover. Its own key rather than sharing
   * `refusalPurchaseMaterials`, because the two leave the prison in states a
   * player would act on differently: one has no new staff member, the other
   * has no materials on the way, and reading the wrong one sends them to the
   * wrong panel.
   */
  refusalHireStaff: 'hud.refusal.hire-staff',
  refusalUndo: 'hud.refusal.undo',
  refusalRedo: 'hud.refusal.redo',
  /**
   * The two room intents, each with its own sentence for the reason every
   * other entry here has one: a refused designation leaves the prison with no
   * new room, and a refused removal leaves the room exactly where it was --
   * different states, and different things for the player to do next.
   */
  refusalZoneRoom: 'hud.refusal.zone-room',
  refusalUnzoneRoom: 'hud.refusal.unzone-room',
  /**
   * Covers both ways an admission is refused before it is sent -- no session
   * at all, and a prison the last published counts say holds no room -- for
   * the reason `refusalPurchaseMaterials` covers both of its: they leave the
   * prison in the same state and there is nothing different to do about them.
   */
  refusalAdmitPrisoner: 'hud.refusal.admit-prisoner',
  refusalCancelBuildOrder: 'hud.refusal.cancel-build-order',
  /**
   * A cancelled purchase the host refused before it was sent -- which here means
   * only "there is no session", because this thread has nothing to pre-check
   * (#285).
   *
   * Its own key rather than sharing `refusalCancelBuildOrder`, for the reason
   * every entry here has one: a withdrawn build order and a cancelled delivery
   * leave the prison in different states, and one of the two is about money.
   *
   * It is **not** the sentence a player sees when the delivery has already
   * landed. That refusal is the simulation's -- `cancel-purchase.not-pending`,
   * decided at the tick the command executes -- and it arrives in the alerts
   * list. The two sit on opposite sides of `sender.submit`, so one press
   * produces exactly one of them and never both.
   */
  refusalCancelMaterialPurchase: 'hud.refusal.cancel-material-purchase',

  /**
   * What a refused *dispatch* of a release says, on the control that was pressed
   * (ADR 0034).
   *
   * Its own sentence rather than a shared one, for the reason every other member
   * of this family has one: this press leaves the prison with the guard still
   * held, and a player told only "that was refused" would not know whether to
   * press again or go and look elsewhere.
   *
   * It is **not** the sentence a player sees when the guard was already free.
   * That refusal is the simulation's -- `release-guard.not-held`, decided at the
   * tick the command executes -- and it arrives in the alerts list. The two sit
   * on opposite sides of `sender.submit`, so one press produces exactly one of
   * them and never both.
   */
  refusalReleaseGuard: 'hud.refusal.release-guard',

  severityInfo: 'hud.severity.info',
  severityWarning: 'hud.severity.warning',
  severityDanger: 'hud.severity.danger',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type HudMessageKey = (typeof HUD_MESSAGE_KEY)[keyof typeof HUD_MESSAGE_KEY];

export const HUD_MESSAGE_KEYS: readonly HudMessageKey[] = Object.values(HUD_MESSAGE_KEY);
