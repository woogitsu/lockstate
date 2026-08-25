import { describe, expect, it } from 'vitest';
import {
  HUD_PANEL_IDS,
  HUD_TAB_IDS,
  INITIAL_HUD_SHELL_STATE,
  hudShellReducer,
  isHudPanelId,
  isHudTabId,
  isPanelCollapsed,
} from '../../src/ui/hud/hud-state';

/**
 * The HUD's tab/collapse state machine.
 *
 * It is a pure reducer with no DOM and no simulation dependency precisely so
 * this behaviour can be proven headlessly (docs/TESTING.md: "use the lowest
 * layer that proves the behavior"). `mountHud` owns exactly one of these and
 * repaints from it, so a rule asserted here is the rule on screen.
 */

describe('initial shell state', () => {
  it('opens on the overview tab with the alerts list folded away', () => {
    // The HUD frames the world and must not cover it: a list that is empty
    // most of the time should not hold open a rectangle over the prison.
    expect(INITIAL_HUD_SHELL_STATE.activeTab).toBe('overview');
    expect(isPanelCollapsed(INITIAL_HUD_SHELL_STATE, 'alerts')).toBe(true);
    expect(isPanelCollapsed(INITIAL_HUD_SHELL_STATE, 'minimap')).toBe(false);
  });

  it('exposes five tabs and the panels the shell owns', () => {
    // Five, and the bar is now full: ADR 0022 measured a sixth as foreclosed at
    // 375x812, where the five-tab bar already leaves 1.8px of margin per side.
    // `rooms` sits after `build` rather than at the end because the order is the
    // order a player reaches for them -- look, build the walls, say what the
    // rooms inside them are for.
    expect([...HUD_TAB_IDS]).toEqual(['overview', 'build', 'rooms', 'security', 'regime']);
    expect([...HUD_PANEL_IDS]).toEqual(['minimap', 'alerts']);
  });
});

describe('tab selection', () => {
  it('moves to the selected tab and leaves panel state alone', () => {
    const next = hudShellReducer(INITIAL_HUD_SHELL_STATE, { kind: 'select-tab', tab: 'build' });
    expect(next.activeTab).toBe('build');
    expect(next.collapsedPanels).toEqual(INITIAL_HUD_SHELL_STATE.collapsedPanels);
  });

  it('re-selecting the active tab is idempotent, not a toggle', () => {
    // A bar that closes itself when you tap the tab you are already on is a
    // trap on touch, where a stray second tap is routine.
    const state = hudShellReducer(INITIAL_HUD_SHELL_STATE, { kind: 'select-tab', tab: 'security' });
    const again = hudShellReducer(state, { kind: 'select-tab', tab: 'security' });
    expect(again.activeTab).toBe('security');
    // Identity, not just equality: the shell skips a repaint on a no-op.
    expect(again).toBe(state);
  });

  it('every declared tab is reachable', () => {
    for (const tab of HUD_TAB_IDS) {
      expect(hudShellReducer(INITIAL_HUD_SHELL_STATE, { kind: 'select-tab', tab }).activeTab).toBe(tab);
    }
  });
});

describe('panel collapse', () => {
  it('toggles one panel without disturbing the other', () => {
    const collapsedMinimap = hudShellReducer(INITIAL_HUD_SHELL_STATE, { kind: 'toggle-panel', panel: 'minimap' });
    expect(isPanelCollapsed(collapsedMinimap, 'minimap')).toBe(true);
    expect(isPanelCollapsed(collapsedMinimap, 'alerts')).toBe(true);

    const openAlerts = hudShellReducer(collapsedMinimap, { kind: 'toggle-panel', panel: 'alerts' });
    expect(isPanelCollapsed(openAlerts, 'minimap')).toBe(true);
    expect(isPanelCollapsed(openAlerts, 'alerts')).toBe(false);
  });

  it('round-trips back to the state it started from', () => {
    const there = hudShellReducer(INITIAL_HUD_SHELL_STATE, { kind: 'toggle-panel', panel: 'minimap' });
    const back = hudShellReducer(there, { kind: 'toggle-panel', panel: 'minimap' });
    expect(back).toEqual(INITIAL_HUD_SHELL_STATE);
  });

  it('setting a panel to the state it is already in changes nothing', () => {
    const same = hudShellReducer(INITIAL_HUD_SHELL_STATE, {
      kind: 'set-panel-collapsed',
      panel: 'alerts',
      collapsed: true,
    });
    expect(same).toBe(INITIAL_HUD_SHELL_STATE);
  });

  it('set-panel-collapsed is absolute, so restoring a saved UI state is not a toggle', () => {
    const opened = hudShellReducer(INITIAL_HUD_SHELL_STATE, {
      kind: 'set-panel-collapsed',
      panel: 'alerts',
      collapsed: false,
    });
    const stillOpen = hudShellReducer(opened, { kind: 'set-panel-collapsed', panel: 'alerts', collapsed: false });
    expect(isPanelCollapsed(stillOpen, 'alerts')).toBe(false);
  });

  it('keeps collapsed panels in declaration order, so equal states compare equal', () => {
    // Reached by two different routes; the list must not depend on the path.
    const viaMinimapFirst = hudShellReducer(
      hudShellReducer(INITIAL_HUD_SHELL_STATE, { kind: 'set-panel-collapsed', panel: 'alerts', collapsed: false }),
      { kind: 'set-panel-collapsed', panel: 'minimap', collapsed: true },
    );
    const bothCollapsed = hudShellReducer(viaMinimapFirst, {
      kind: 'set-panel-collapsed',
      panel: 'alerts',
      collapsed: true,
    });
    expect(bothCollapsed.collapsedPanels).toEqual(['minimap', 'alerts']);
  });

  it('does not mutate the state it was given', () => {
    const before = INITIAL_HUD_SHELL_STATE;
    const snapshot = { activeTab: before.activeTab, collapsedPanels: [...before.collapsedPanels] };
    hudShellReducer(before, { kind: 'toggle-panel', panel: 'minimap' });
    hudShellReducer(before, { kind: 'select-tab', tab: 'regime' });
    expect({ activeTab: before.activeTab, collapsedPanels: [...before.collapsedPanels] }).toEqual(snapshot);
  });
});

describe('runtime identifier guards', () => {
  it('accepts declared ids and rejects anything else', () => {
    // Ids arrive from DOM datasets and from restored UI preferences, which
    // are strings, not the union type.
    expect(isHudTabId('build')).toBe(true);
    expect(isHudTabId('finance')).toBe(false); // there is no economy system
    expect(isHudPanelId('alerts')).toBe(true);
    expect(isHudPanelId('')).toBe(false);
  });
});
