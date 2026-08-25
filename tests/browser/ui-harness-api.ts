import type { HudViewModel } from '../../src/ui/hud';

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
  /** The sentence that says an admission needs somewhere to put the arrival. */
  readonly hint: string;
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
  /** The buy disclosure (#89): whether it is offered at all, and whether it is open. */
  readonly buyToggleVisible: boolean;
  readonly buyOpen: boolean;
  /** True when the row the disclosure reveals is laid out -- `offsetParent`, not the attribute. */
  readonly buyRowVisible: boolean;
  /** The buy button's whole label, which states the quantity, the material and the total. */
  readonly buyLabel: string;
  /** What the quantity stepper currently shows. */
  readonly buyQuantity: string;
  /** Every visible label in the panel, so an unresolved `hud.*` key is caught. */
  readonly texts: readonly string[];
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
  /** The one note line: the arm hint, the removal hint, the too-small warning or the enclosure warning. */
  readonly noteText: string;
  /** `data-tone`, so a warning is distinguishable from a hint without matching prose. */
  readonly noteTone: string;
  /** The two rule lines: the authored minimum, and the enclosure requirement. */
  readonly ruleText: readonly string[];
  readonly enclosureText: string;
  readonly armLaidOut: boolean;
  readonly removeLaidOut: boolean;
  readonly confirmLaidOut: boolean;
  readonly cancelLaidOut: boolean;
  readonly confirmText: string;
  readonly confirmDisabled: boolean;
  readonly armPressed: string;
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
  /** `title` of every control the HUD has marked as having failed. */
  readonly failedControls: readonly string[];
  /** True when every marked control's `aria-describedby` is the refusal line's id. */
  readonly describedByRefusal: boolean;
  /** The line's `role` and `aria-live`, so "a live region says it" is asserted and not assumed. */
  readonly role: string | null;
  readonly ariaLive: string | null;
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
  clickRoomType(roomId: string): boolean;
  /**
   * A real click on one of the panel's controls, so a disabled or hidden one
   * does not fire. Four of them are the actions row; `fold` is the panel's own
   * header control.
   */
  clickRoomsControl(control: 'arm' | 'remove' | 'confirm' | 'cancel' | 'fold'): boolean;
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
