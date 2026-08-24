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

export interface LayoutBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
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
  /** True while the numeric fallback section is folded away. */
  readonly coordinatesCollapsed: boolean;
  /** The `data-target` readout, or null when nothing is aimed at. */
  readonly targetReadout: string | null;
  readonly targetText: string;
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

export interface LockstateUiHarness {
  mountSavePanel(options?: { readonly pseudoLocale?: boolean }): void;
  clickSaveButton(label: string): boolean;
  saveButtonState(label: string): ButtonState;
  savePanelStatus(): string;
  /** Every string the panel has actually rendered, for the ADR 0011 check (issue #208). */
  savePanelText(): readonly string[];
  createCalls(): number;
  prisonRowCount(): number;
  releaseCreate(outcome: 'ok' | 'worker-timeout'): void;
  /** Re-reads the slot list, which is what paints the list rows and the empty-list row. */
  refreshSavePanel(): Promise<void>;
  settleSavePanel(): Promise<void>;

  mountHudShell(options?: { readonly empty?: boolean; readonly buildables?: number }): void;
  hudProbe(): HudProbe;
  clickTab(tab: string): boolean;
  clickTransport(label: string): boolean;
  toggleAlerts(): boolean;
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

  buildProbe(): BuildProbe;
  clickArmBuild(): boolean;
  expandBuildCoordinates(): boolean;
  clickBuildable(definitionId: string): boolean;
  stepBuildCoordinate(axis: 'x' | 'y', direction: 'up' | 'down'): boolean;
  clickBuildEdge(edge: string): boolean;
  clickPlaceOrder(): boolean;
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
