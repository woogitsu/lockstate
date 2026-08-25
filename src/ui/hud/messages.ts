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
   * the primary resource and did not name one, and ADR 0017 is still Proposed.
   * A label that names no currency lets the number be shown honestly without
   * inventing one.
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
   * cover is a refusal the worker makes after accepting the command; that has
   * no route back at all (`src/simulation/runtime/session-commands.ts`).
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

  severityInfo: 'hud.severity.info',
  severityWarning: 'hud.severity.warning',
  severityDanger: 'hud.severity.danger',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type HudMessageKey = (typeof HUD_MESSAGE_KEY)[keyof typeof HUD_MESSAGE_KEY];

export const HUD_MESSAGE_KEYS: readonly HudMessageKey[] = Object.values(HUD_MESSAGE_KEY);
