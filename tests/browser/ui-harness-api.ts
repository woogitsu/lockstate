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

export interface LockstateUiHarness {
  mountSavePanel(): void;
  clickSaveButton(label: string): boolean;
  saveButtonState(label: string): ButtonState;
  savePanelStatus(): string;
  createCalls(): number;
  prisonRowCount(): number;
  releaseCreate(outcome: 'ok' | 'worker-timeout'): void;
  settleSavePanel(): Promise<void>;

  mountHudShell(options?: { readonly empty?: boolean }): void;
  hudProbe(): HudProbe;
  clickTab(tab: string): boolean;
  clickTransport(label: string): boolean;
  toggleAlerts(): boolean;
  hudIntents(): readonly string[];
  setHudViewModel(viewModel: HudViewModel): void;
  /** Makes the host's handler for `set-clock` block until released. */
  holdClockIntents(enabled: boolean): void;
  releaseClockIntent(): void;
  transportDisabled(): boolean;
  layoutProbe(): LayoutProbe;

  buildProbe(): BuildProbe;
  clickArmBuild(): boolean;
  expandBuildCoordinates(): boolean;
  clickBuildable(definitionId: string): boolean;
  stepBuildCoordinate(axis: 'x' | 'y', direction: 'up' | 'down'): boolean;
  clickBuildEdge(edge: string): boolean;
  clickPlaceOrder(): boolean;

  takeUnhandledRejections(): readonly string[];
}

declare global {
  interface Window {
    lockstateUiHarness: LockstateUiHarness;
  }
}
