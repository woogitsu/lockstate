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
   * Labels for the two entries `BUILDABLE_REGISTRY` holds.
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
  refusalSetClock: 'hud.refusal.set-clock',
  refusalPlaceBuildOrder: 'hud.refusal.place-build-order',
  refusalPurchaseMaterials: 'hud.refusal.purchase-materials',
  refusalUndo: 'hud.refusal.undo',
  refusalRedo: 'hud.refusal.redo',

  severityInfo: 'hud.severity.info',
  severityWarning: 'hud.severity.warning',
  severityDanger: 'hud.severity.danger',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type HudMessageKey = (typeof HUD_MESSAGE_KEY)[keyof typeof HUD_MESSAGE_KEY];

export const HUD_MESSAGE_KEYS: readonly HudMessageKey[] = Object.values(HUD_MESSAGE_KEY);
