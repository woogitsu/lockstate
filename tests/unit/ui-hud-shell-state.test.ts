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
  it('opens on the overview tab with NOTHING folded away', () => {
    // This assertion read `alerts` collapsed `true` until 2026-08-31, under the
    // reason the constant carried: "The HUD frames the world and must not cover
    // it: a list that is empty most of the time should not hold open a
    // rectangle over the prison." The owner ruled the other way (#703, ruling
    // 1) on a measurement that reason could not see -- a successful escape was
    // written to the event log three times and painted zero times, because the
    // band that shows it is replaced within the tick and the list that keeps it
    // was shut. See `INITIAL_HUD_SHELL_STATE` for the account.
    //
    // Asserted as "no panel is collapsed" rather than as an empty array, so
    // this test keeps working if a third panel is added, and so the failure
    // message names the panel rather than a shape.
    expect(INITIAL_HUD_SHELL_STATE.activeTab).toBe('overview');
    expect(isPanelCollapsed(INITIAL_HUD_SHELL_STATE, 'alerts')).toBe(false);
    expect(isPanelCollapsed(INITIAL_HUD_SHELL_STATE, 'minimap')).toBe(false);
    for (const panel of HUD_PANEL_IDS) expect(isPanelCollapsed(INITIAL_HUD_SHELL_STATE, panel)).toBe(false);
  });

  it('exposes six tabs and the panels the shell owns', () => {
    // SIX as of 2026-09-17, and the paragraph below is kept because it is the
    // measurement that was overturned rather than a mistake. ADR 0022 measured
    // a sixth tab as foreclosed at 375x812 against a bar of five *labelled*
    // tabs; #1192's ruling of 2026-09-16 takes the labels off the screen below
    // 721px, so the bar there is six icons. Re-measured on the assembled page
    // at 375x812: six 56px buttons span 19.5..355.5 inside a 338px bar, where
    // six labelled ones spanned -4.5..379.5 in a 351px one.
    // `zones` sits after `build` rather than at the end because the order is the
    // order a player reaches for them -- look, build the walls, say what the
    // rooms inside them are for.
    //
    // These are the 2026-09-13 delivery's own five sections, in its own order
    // (ADR 0112 decision 3, ruled by the owner on 2026-09-13 and implemented
    // 2026-09-14): Przeglad / Buduj / Strefy / Zarzadzaj / Plan dnia. This
    // assertion is the fact being changed on purpose -- it and
    // `tests/unit/ui-hud-messages.test.ts`'s `HUD_TABS` assertion are the only
    // two places that name the array verbatim, and either one going stale
    // without the other is what they exist to catch.
    expect([...HUD_TAB_IDS]).toEqual(['overview', 'build', 'zones', 'manage', 'day-plan', 'security']);
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
    const state = hudShellReducer(INITIAL_HUD_SHELL_STATE, { kind: 'select-tab', tab: 'manage' });
    const again = hudShellReducer(state, { kind: 'select-tab', tab: 'manage' });
    expect(again.activeTab).toBe('manage');
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
    // Both panels start open as of #703 ruling 1, so the pair this drives is
    // "collapse the minimap, then collapse alerts" rather than the old
    // "collapse the minimap, then *open* alerts". The property under test is
    // unchanged and is the only thing asserted: one toggle moves one panel.
    const collapsedMinimap = hudShellReducer(INITIAL_HUD_SHELL_STATE, { kind: 'toggle-panel', panel: 'minimap' });
    expect(isPanelCollapsed(collapsedMinimap, 'minimap')).toBe(true);
    expect(isPanelCollapsed(collapsedMinimap, 'alerts')).toBe(false);

    const collapsedAlerts = hudShellReducer(collapsedMinimap, { kind: 'toggle-panel', panel: 'alerts' });
    expect(isPanelCollapsed(collapsedAlerts, 'minimap')).toBe(true);
    expect(isPanelCollapsed(collapsedAlerts, 'alerts')).toBe(true);

    // And back the other way, so the test still exercises an *opening* toggle
    // rather than only closing ones -- which is what it exercised before the
    // initial state moved, and is the half that would otherwise be lost.
    const reopenedAlerts = hudShellReducer(collapsedAlerts, { kind: 'toggle-panel', panel: 'alerts' });
    expect(isPanelCollapsed(reopenedAlerts, 'minimap')).toBe(true);
    expect(isPanelCollapsed(reopenedAlerts, 'alerts')).toBe(false);
  });

  it('round-trips back to the state it started from', () => {
    const there = hudShellReducer(INITIAL_HUD_SHELL_STATE, { kind: 'toggle-panel', panel: 'minimap' });
    const back = hudShellReducer(there, { kind: 'toggle-panel', panel: 'minimap' });
    expect(back).toEqual(INITIAL_HUD_SHELL_STATE);
  });

  it('setting a panel to the state it is already in changes nothing', () => {
    // `collapsed: false` now, because that is the state `alerts` starts in
    // (#703, ruling 1). Identity, not equality: the shell skips a repaint on a
    // no-op, and that is the property this pins.
    const same = hudShellReducer(INITIAL_HUD_SHELL_STATE, {
      kind: 'set-panel-collapsed',
      panel: 'alerts',
      collapsed: false,
    });
    expect(same).toBe(INITIAL_HUD_SHELL_STATE);

    // The other direction is a real change and must NOT be identity, or the
    // assertion above would pass for a reducer that ignores this action.
    const changed = hudShellReducer(INITIAL_HUD_SHELL_STATE, {
      kind: 'set-panel-collapsed',
      panel: 'alerts',
      collapsed: true,
    });
    expect(changed).not.toBe(INITIAL_HUD_SHELL_STATE);
    expect(isPanelCollapsed(changed, 'alerts')).toBe(true);
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
    hudShellReducer(before, { kind: 'select-tab', tab: 'day-plan' });
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
