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

/**
 * The tab bar, and it is now full.
 *
 * `rooms` is the fifth and last member. ADR 0022 measured the bar with a fifth
 * tab injected: `.hud-tabs__inner` spans x = 1.8 .. 373.2 at 375x812, which is
 * 1.8px of margin per side, so a **sixth tab is foreclosed** at that viewport
 * and a label longer than "Rooms" would already fail
 * `tests/browser/ui-shell.spec.ts`'s `tabs.x >= 0` / `tabs.right <= 375` pair.
 *
 * It went to rooms rather than to something else because rooms were the surface
 * with nothing at all: three of the four existing tabs render no panel, but each
 * is a placeholder for its own named feature -- `overview` is the landing tab,
 * `security` is where the Staff panel lands, `regime` is the schedule -- so none
 * of them was an unclaimed slot to reuse. Relabelling one would have put a Rooms
 * panel behind a tab whose own label message key says something else.
 *
 * Ordered by when a player reaches for them, not alphabetically: you look, you
 * build the walls, you say what the rooms inside them are for, and the last two
 * are the running prison.
 *
 * ---
 *
 * **THREE OF THOSE FIVE IDS CHANGED ON 2026-09-14, AND THE PARAGRAPHS ABOVE ARE
 * KEPT RATHER THAN REWRITTEN** -- every sentence in them is still a true record
 * of why the bar holds five and of what each slot was for when it was taken.
 * What moved is the naming and one panel's home, on
 * [ADR 0112](../../../docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md)
 * decision 3, which the owner ruled in their own typed words happens **now**
 * rather than after the inventory:
 *
 * | Was | Is | The delivery's own name |
 * |---|---|---|
 * | `rooms` | `zones` | Strefy |
 * | `security` | `manage` | Zarządzaj |
 * | `regime` | `day-plan` | Plan dnia (`Schedule` in English -- see the locale) |
 *
 * `overview` and `build` keep their ids because the delivery keeps their
 * subjects (Przegląd, Buduj). The **order** is unchanged: the delivery lists
 * its five in exactly the order this array already held them in, so the
 * "when a player reaches for them" paragraph above survives whole.
 *
 * **The ids are renamed rather than left alone on purpose.** They are not
 * player-visible strings -- the labels are, and they live in
 * `src/content/default-locale-en.ts` -- but they are read as
 * `hud.dataset.activeTab`, as `.ui-tab[data-tab="..."]` in the browser suite,
 * and as `activeTab === '<id>'` gates in `src/main.ts`. An id spelling
 * `security` on the section that holds hiring, dismissal and admissions, or
 * `rooms` on the one the player draws zones in, is a comment that lies in a
 * place the compiler cannot check. Renaming them makes every one of those
 * gates a compile error until it is re-read, which is why this change is safe
 * to make mechanically: `HudTabId` is a union of literals, so a site left on
 * an old spelling does not silently stop firing, it fails to build.
 *
 * **No id here is persisted, so this is not a migration.** Checked at v0.0.613
 * rather than assumed: `activeTab` is produced by `hudShellReducer` from
 * `INITIAL_HUD_SHELL_STATE` below and mutated only by the in-memory
 * `select-tab` action; `src/input/storage.ts` declares four keys
 * (`lockstate.settings.input`, `.accessibility`, `.theme` and `.layout`, the
 * last added by #1159 since this was first measured) and none of them carries
 * a tab id; and no field of `src/persistence/save-schema.ts` names one. A
 * player who had `security` open yesterday gets the reducer's initial tab
 * today, exactly as they do on every page load.
 */
export const HUD_TAB_IDS = ['overview', 'build', 'zones', 'manage', 'day-plan'] as const;
export type HudTabId = (typeof HUD_TAB_IDS)[number];

export const HUD_PANEL_IDS = ['minimap', 'alerts'] as const;
export type HudPanelId = (typeof HUD_PANEL_IDS)[number];

export interface HudShellState {
  readonly activeTab: HudTabId;
  /** Always in `HUD_PANEL_IDS` order, so equal states compare equal. */
  readonly collapsedPanels: readonly HudPanelId[];
}

/**
 * Alerts start OPEN, on the owner's ruling of 2026-08-31 (#703, ruling 1).
 *
 * **This constant read `collapsedPanels: ['alerts']` until then**, under this
 * reason, which is kept because it is still a true statement about screen
 * space: *"Alerts start folded. The HUD frames the world and must not cover
 * it; a list that is empty most of the time should not hold open a rectangle
 * over the prison to say so."*
 *
 * What that reason weighed was an empty list against a rectangle. What it did
 * not weigh is a **full** one nobody can see. Measured on 2026-08-31: a
 * successful escape was written to the event log three times and painted zero
 * times -- the band keeps only the newest event and the all-clear on the same
 * tick replaced it, while the row that would have survived was in a list this
 * constant kept shut.
 *
 * **The same fold is cited as a reason not to route anything to that list in
 * TWELVE places in `src/` alone**, counted rather than estimated:
 * `view-model.ts:1593` and `:1649`, `hud.ts:1129`, `:1200` and `:1295`,
 * `rooms-panel.ts:1520`, `simulation-zoning.ts:26`,
 * `content/default-locale-en.ts:1973`, `main.ts:1336` and `:2131`, and
 * `hud.css:710` and `:747`. Each is a true record of issue #220's defect -- a
 * message that reaches the player at *no* viewport -- and each is why some
 * sentence got a HUD row of its own instead. **Opening the list by default is
 * the one change that addresses all twelve at once**, which is why the ruling
 * went this way rather than giving the escape sentence a thirteenth row.
 * Every one of the twelve is corrected in both directions by the change that
 * carries this one, because a docblock naming a reason that no longer holds is
 * how the next reader gets talked out of using the list again.
 *
 * The accepted cost, stated by the owner: a fixed slice of screen height at
 * every width. The fold itself is untouched -- a player who wants the world
 * back closes it, and `toggle-panel` remembers that for the session.
 */
export const INITIAL_HUD_SHELL_STATE: HudShellState = {
  activeTab: 'overview',
  collapsedPanels: [],
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
