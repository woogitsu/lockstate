/**
 * The HUD shell's own state: which tab is showing and which panels are
 * folded away.
 *
 * This is *chrome* state, not game state. It is a pure reducer with no DOM
 * and no simulation dependency, which is what lets the tab and collapse
 * behaviour be proven by a fast headless test (docs/TESTING.md: "use the
 * lowest layer that proves the behavior") rather than by clicking.
 *
 * A transition that changes nothing returns the *same object*, so a caller
 * can skip a repaint with an identity check instead of a deep comparison.
 */

export const HUD_TAB_IDS = ['overview', 'build', 'security', 'regime'] as const;
export type HudTabId = (typeof HUD_TAB_IDS)[number];

export const HUD_PANEL_IDS = ['minimap', 'alerts'] as const;
export type HudPanelId = (typeof HUD_PANEL_IDS)[number];

export interface HudShellState {
  readonly activeTab: HudTabId;
  /** Always in `HUD_PANEL_IDS` order, so equal states compare equal. */
  readonly collapsedPanels: readonly HudPanelId[];
}

/**
 * Alerts start folded. The HUD frames the world and must not cover it; a
 * list that is empty most of the time should not hold open a rectangle over
 * the prison to say so.
 */
export const INITIAL_HUD_SHELL_STATE: HudShellState = {
  activeTab: 'overview',
  collapsedPanels: ['alerts'],
};

export type HudShellAction =
  | { readonly kind: 'select-tab'; readonly tab: HudTabId }
  | { readonly kind: 'toggle-panel'; readonly panel: HudPanelId }
  | { readonly kind: 'set-panel-collapsed'; readonly panel: HudPanelId; readonly collapsed: boolean };

export function isHudTabId(value: string): value is HudTabId {
  return (HUD_TAB_IDS as readonly string[]).includes(value);
}

export function isHudPanelId(value: string): value is HudPanelId {
  return (HUD_PANEL_IDS as readonly string[]).includes(value);
}

export function isPanelCollapsed(state: HudShellState, panel: HudPanelId): boolean {
  return state.collapsedPanels.includes(panel);
}

function withPanelCollapsed(state: HudShellState, panel: HudPanelId, collapsed: boolean): HudShellState {
  if (isPanelCollapsed(state, panel) === collapsed) return state;
  const next = HUD_PANEL_IDS.filter((id) => (id === panel ? collapsed : isPanelCollapsed(state, id)));
  return { activeTab: state.activeTab, collapsedPanels: next };
}

export function hudShellReducer(state: HudShellState, action: HudShellAction): HudShellState {
  switch (action.kind) {
    case 'select-tab':
      // Re-selecting the active tab is idempotent, not a toggle. A tab bar
      // that closes itself when you tap the tab you are already on is a trap
      // on touch, where a stray second tap is common.
      if (state.activeTab === action.tab) return state;
      return { activeTab: action.tab, collapsedPanels: state.collapsedPanels };
    case 'toggle-panel':
      return withPanelCollapsed(state, action.panel, !isPanelCollapsed(state, action.panel));
    case 'set-panel-collapsed':
      return withPanelCollapsed(state, action.panel, action.collapsed);
  }
}
