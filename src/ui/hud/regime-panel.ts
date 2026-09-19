import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { element, eyebrowText, valueText } from '../primitives/dom';
import { createPanel } from '../primitives/panel';
import { createCollapsibleSection } from '../primitives/collapsible-section';
import { createToggleGroup, type ToggleGroup } from '../primitives/toggle-group';
import { deriveSimulationMessageKey, simulationEnumIds } from '../../content/simulation-message-keys';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudLocalizer, HudRegimeBlockViewModel, HudRegimeViewModel } from './view-model';

/**
 * The Regime panel: what the prison's day allows right now (issue #451).
 *
 * ### Why it is here, and why the roster is no longer in it
 *
 * The `regime` tab rendered nothing from ADR 0022 -- which measured the tab bar
 * full at five and gave the last slot to Rooms -- until #451 put the timetable
 * and the prisoner roster on it together, in one panel. This file's header
 * argued for that arrangement in these words, which are quoted rather than
 * deleted because they are still true of the *tab* and were only ever wrong
 * about the *panel*:
 *
 * > Sharing it is not a compromise here, which is the reason it is one panel.
 * > The two blocks are one subject read at two scales: the timetable says what
 * > *general population* and *high risk* may do at this tick, and the roster
 * > says who is in each and what they are actually doing. [...] That reads as
 * > cause and effect only if both halves are on screen at once.
 *
 * **Both halves are still on screen at once**, and that is the whole of what
 * the owner ruled on ADR 0115 on 2026-09-16: split the panel in code, keep both
 * halves on Plan dnia. `roster-panel.ts` is the other half; `hud.ts` mounts the
 * two in `.hud__side` and shows them on the same tab, the way the Intake and
 * Staff panels have shared the Manage tab since 2026-09-14. The option that put
 * the roster on the Manage rail was put to the owner and **declined**, on the
 * measured 51.56px the Staff panel drops to at phone width; nothing here is
 * groundwork for making that move anyway.
 *
 * What one panel cost, and what two buy, is set out in `roster-panel.ts`'s own
 * header. The half of it that belongs here: this panel's height is bounded by
 * the classification-group catalogue rather than by the population, so it is
 * the one that keeps its natural height while the roster absorbs a short rail
 * -- `.ui-panel.hud-regime` in `hud.css` states that division of labour and
 * carries the measurement behind it.
 *
 * ### Boundaries
 *
 * A composer, exactly like the Staff and Intake panels. It imports nothing from
 * `src/simulation/**`, and every figure and every word it renders arrives on
 * the view model as a number or a message key. It holds no selection, issues no
 * intent and counts nothing.
 *
 * ### What it deliberately does not show
 *
 * **No block bounds.** A regime block's `startTickOfDay`/`endTickOfDay` are
 * ticks, and `regime.ts` says outright that `DAY_LENGTH_TICKS` is a tick budget
 * rather than a mapping onto a clock face. The strip already had to withdraw an
 * `HH:MM` readout for exactly this reason. How far through the block the
 * simulation is, is a share of that block and renders honestly as a percent.
 */

export interface RegimePanelOptions {
  readonly localizer: HudLocalizer;
  /**
   * The player changed what one group's **running** block allows (#1167,
   * ADR 0113 slice 1).
   *
   * A *command*, and the only one this panel has. `onSelectPrisoner` used to
   * sit above it and does not any more: the owner's ADR 0115 ruling moved the
   * roster and its selection to `roster-panel.ts`, so the distinction that
   * docblock drew -- chrome the panel has already applied against a command
   * the simulation has to accept -- is now a distinction between the two
   * panels rather than between two options of one. This one asks the
   * simulation to change, so the host gates it and a refusal has to reach the
   * player. The panel applies nothing itself -- the toggles repaint from the
   * next `hud/status-strip` reply, exactly as the `Allows` sentence beside
   * them does -- which is what keeps the DOM from becoming a second,
   * disagreeing copy of the schedule if the command is refused.
   *
   * Absent means no editor is drawn at all. A panel offered no sink for the
   * command must not show controls that would send one, which is the same rule
   * `pendingDeliveries` and the roster draw between "nobody asked" and "the
   * answer is none".
   */
  readonly onEditBlock?: (intent: {
    readonly classificationGroupId: string;
    readonly startTickOfDay: number;
    readonly allowedCategoryIds: readonly string[];
  }) => void;
}

/** The localizer call this panel makes, narrowed so the pure helpers below need no `HudLocalizer`. */
type Translate = (key: LocalizationKey, parameters?: MessageParameters) => string;

/**
 * What one classification group may do in the block that is running.
 *
 * The categories are joined with a message key rather than a literal, because
 * a list separator is locale vocabulary. The order is the schedule's own -- the
 * projection copies `RegimeBlock.allowedCategories` as declared -- so two
 * clients reading the same tick print the same sentence.
 */
export function formatRegimeAllowsText(t: Translate, group: HudRegimeBlockViewModel): string {
  const separator = t(HUD_MESSAGE_KEY.regimeCategorySeparator);
  return t(HUD_MESSAGE_KEY.regimeBlockAllows, {
    categories: group.allowedCategoryLabelKeys.map((key) => t(key)).join(separator),
  });
}

/**
 * The categories a block would allow after one toggle press, in the
 * vocabulary's own order.
 *
 * Pure and exported for the reason `describeStaffCoverage` and
 * `formatRegimeAllowsText` are: the default Vitest environment is `node`
 * (`docs/TESTING.md`), so nothing headless can call `createRegimePanel`, and
 * *what a press asks the simulation for* is the decision this change adds. A
 * rule that only ran inside a DOM builder would be unreachable from
 * `pnpm test` rather than merely untested.
 *
 * **Filtered out of `vocabulary` rather than spliced into `current`**, which
 * is what makes the result order-stable: two presses that end at the same set
 * produce the same array, so the command a player sends does not depend on the
 * order they pressed things in. `RegimeScheduleRegistry.editBlock` canonicalises
 * anyway (`canonicalCategories`), so this is about what the *wire* carries
 * being a function of the state rather than of the gestures.
 *
 * **A category not in `vocabulary` is dropped**, including one that was in
 * `current`. That cannot happen while `simulationEnumIds('action-category')`
 * and `ACTION_CATEGORIES` agree, which
 * `tests/foundation/content-vocabulary-contract.test.ts` requires exactly --
 * and if they ever stopped agreeing, sending a member this panel could not
 * name would be sending a value the command's own `z.enum` would refuse.
 */
export function nextAllowedCategories(
  current: readonly string[],
  categoryId: string,
  pressed: boolean,
  vocabulary: readonly string[],
): readonly string[] {
  const wanted = new Set(current);
  if (pressed) wanted.add(categoryId);
  else wanted.delete(categoryId);
  return vocabulary.filter((candidate) => wanted.has(candidate));
}

/**
 * Which of a block's toggles may not be pressed, and it is never more than one.
 *
 * A block must allow at least one category -- `editRegimeBlockSchema` puts
 * `.min(1)` on `allowedCategories` -- and the press that emptied one would not
 * be quietly dropped so much as **thrown**: `packCommand` parses against that
 * schema inside `SimulationCommandSender.submit`
 * (`src/ui/simulation-commands.ts`), on this thread, before anything is sent.
 * The refusal a player would then read is `hud.refusal.*`'s generic line,
 * which says nothing about what they did. A panel that let that happen would
 * be a control that failed and did not say why, which is the shape the owner's
 * standing directive names. So the **last remaining** category is locked, with
 * `hud.regime.edit-last-category` saying why instead.
 *
 * (`unpackCommand` answering `null` is the same rule one boundary further on,
 * for a payload that reached the worker some other way. Nothing on this path
 * gets that far.)
 *
 * Only the pressed member is ever locked: an *off* toggle can always be
 * switched on, whatever else is off, because adding a category can never empty
 * the block.
 */
export function lockedCategoryIdsFor(allowedCategoryIds: readonly string[]): readonly string[] {
  return allowedCategoryIds.length === 1 ? allowedCategoryIds : [];
}

export interface RegimePanel {
  readonly element: HTMLElement;
  /**
   * Repaint the timetable from a fresh `hud/status-strip` reply.
   *
   * `undefined` hides the block, and it is a different state from a group list
   * that happens to be empty: "nothing has asked yet" must not render as "this
   * prison runs no regime", which is the distinction every pulled readout in
   * this HUD draws.
   */
  setRegime(regime: HudRegimeViewModel | undefined): void;
  setVisible(visible: boolean): void;
}
export function createRegimePanel(options: RegimePanelOptions): RegimePanel {
  const { localizer } = options;
  const t: Translate = (key, parameters) => (parameters === undefined ? localizer.format(key) : localizer.format(key, parameters));

  // ---- what the day allows ------------------------------------------
  /*
   * Rebuilt rather than pooled, which is the opposite choice from the roster
   * below and rests on the same rule the Intake panel's stage lines state:
   * there is one row per classification group, the vocabulary is a closed
   * catalogue rather than the population, and nothing in the block is
   * focusable -- so replacing it cannot take focus away from a player.
   */
  const blockList = element('div', { className: 'hud-regime__block-list' });

  // ---- and the one control over it ----------------------------------
  /*
   * The regime editor (#1167). `EditRegimeBlock` has had a consumer, two
   * refusals and a V6 save section since ADR 0113 slice 1 landed, and no
   * producer -- it was the only entry in `AWAITING_PRODUCER`
   * (`tests/foundation/unconsumed-command-contract.test.ts`), which is that
   * gate's own words for a command only a test can send.
   *
   * **Collapsed on arrival, and that is a height decision rather than a taste
   * one.** Seven toggles per group is four wrapped rows at 375px, and this
   * panel shares `.hud__side` with a roster that is already the taller half of
   * it. A collapsed section costs the layout one 44px header, which is the
   * same argument `BUILD_QUEUE_ROW_LIMIT`'s block makes one panel over -- the
   * arrival height is unchanged and a player who wants the control opens it.
   *
   * **THE LAST CLAUSE CONTRADICTS THE ONE BEFORE IT AND IS FALSE, AND BOTH ARE
   * KEPT** (`docs/AGENT_WORKFLOW.md` SS4). A section cannot cost a 44px header
   * *and* leave the arrival height unchanged; measured in Chromium with
   * `ui-roster-panel-split.spec.ts`'s fixtures at all five viewports, this
   * block adds a flat **+49px** to `.ui-panel.hud-regime` -- the 44px header
   * plus the column gap above it -- collapsed, before a player touches it.
   *
   * **What that buys and what it costs is a property of the ADR 0115 split
   * rather than of this section**, and it could not be measured until both
   * landed. At 1024x768 and above the rail affords the 49px and the Plan dnia
   * pair grows 550 -> 599px. At 900x600 and 375x812 it does not: the pair
   * holds at 504px and the **roster** panel gives up the whole 49 (333.6 ->
   * 285, 347.4 -> 298), because this panel is `flex: 0 0 auto` and that one is
   * `overflow-y: auto`. The timetable does not move and nothing becomes
   * unreachable. `hud.css`'s `.ui-panel.hud-roster` block carries the table
   * and the reading.
   *
   * **Pooled per group, where the rows above are rebuilt**, and here the
   * reason the rows give is the one that stops applying: `replaceChildren`
   * is safe for the rows because *nothing in them is focusable*, and every
   * member of this section is a `<button>`. This block repaints on the same
   * pull cadence, so rebuilding it would take a player's focus off the toggle
   * they were about to press, twice a second.
   */
  const editorBody = element('div', { className: 'hud-regime__editor-list' });
  const editor = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.regimeEdit),
    collapsed: true,
    // Controlled, like every section in this HUD: the widget reports the state
    // it wants and this applies it. There is nothing else to decide here --
    // no other block's height depends on it -- so the owner's answer is always
    // yes, and it is still routed through `setCollapsed` rather than letting
    // the widget flip itself, which is the rule the primitive states.
    onToggle: (collapsed) => {
      editor.setCollapsed(collapsed);
    },
  });
  editor.element.classList.add('hud-regime__editor');
  editor.body.append(editorBody);

  /*
   * The whole vocabulary, not the members this block happens to allow: a
   * player who could only switch categories *off* would have no way back.
   * `simulationEnumIds` is how the HUD is allowed to know it --
   * `ACTION_CATEGORIES` lives in `src/simulation/**`, which this layer may not
   * import, and `content/simulation-message-keys.ts` is gated to agree with it
   * exactly.
   */
  const categoryIds = simulationEnumIds('action-category');
  const editorGroups = new Map<string, ToggleGroup>();

  const blocksBlock = element('div', {
    className: 'hud-regime__blocks',
    children: [
      eyebrowText(t(HUD_MESSAGE_KEY.regimeBlocks), 'hud-regime__blocks-header'),
      blockList,
      editor.element,
    ],
  });

  let regime: HudRegimeViewModel | undefined;

  /**
   * One toggle group per classification group, created once and repainted.
   *
   * The legend is the group's own label rather than a word of its own: the
   * rows above already name the group, and a second noun here would be a
   * second vocabulary for the same thing.
   */
  function editorGroupFor(group: HudRegimeBlockViewModel): ToggleGroup {
    const existing = editorGroups.get(group.classificationGroupId);
    if (existing !== undefined) return existing;
    const created = createToggleGroup({
      legend: t(group.labelKey),
      options: categoryIds.map((id) => ({ id, label: t(deriveSimulationMessageKey('action-category', id)) })),
      pressedIds: group.allowedCategoryIds,
      onToggle: (categoryId, pressed) => {
        /*
         * Read off `regime` at press time rather than off the `group` this
         * closure was created with: the closure is made once and the schedule
         * is republished twice a second, so a captured row would send the
         * categories the block held when the section was first drawn.
         */
        const current = regime?.groups.find(
          (candidate) => candidate.classificationGroupId === group.classificationGroupId,
        );
        if (current === undefined) return;
        options.onEditBlock?.({
          classificationGroupId: current.classificationGroupId,
          startTickOfDay: current.startTickOfDay,
          allowedCategoryIds: nextAllowedCategories(current.allowedCategoryIds, categoryId, pressed, categoryIds),
        });
      },
    });
    created.element.dataset['group'] = group.classificationGroupId;
    editorGroups.set(group.classificationGroupId, created);
    editorBody.append(created.element);
    return created;
  }

  function paintEditor(): void {
    // No sink for the command means no control that would send one.
    editor.element.hidden = regime === undefined || options.onEditBlock === undefined;
    if (regime === undefined) return;
    for (const group of regime.groups) {
      const toggles = editorGroupFor(group);
      toggles.setPressed(group.allowedCategoryIds);
      toggles.setLocked(lockedCategoryIdsFor(group.allowedCategoryIds), t(HUD_MESSAGE_KEY.regimeEditLastCategory));
    }
  }

  function paintRegime(): void {
    blocksBlock.hidden = regime === undefined;
    paintEditor();
    if (regime === undefined) {
      blockList.replaceChildren();
      return;
    }

    blockList.replaceChildren(
      ...regime.groups.map((group) => {
        const row = element('div', {
          className: 'hud-regime__block-row',
          children: [
            element('div', {
              className: 'hud-regime__block-header',
              children: [
                valueText(t(group.labelKey), 'hud-regime__block-name'),
                eyebrowText(
                  t(HUD_MESSAGE_KEY.regimeBlockProgress, {
                    percent: localizer.formatNumber(group.blockProgressPercent),
                  }),
                  'hud-regime__block-progress',
                ),
              ],
            }),
            eyebrowText(formatRegimeAllowsText(t, group), 'hud-regime__block-allows'),
          ],
        });
        // The group's own id, so a browser assertion can find the line about
        // one group rather than counting rows -- the handle
        // `.hud-intake__pipeline-stage` carries for the same reason.
        row.dataset['group'] = group.classificationGroupId;
        return row;
      }),
    );
  }
  let collapsed = false;
  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.regimeTitle),
    icon: 'regime',
    className: 'hud-regime',
    collapse: {
      collapseLabel: t(HUD_MESSAGE_KEY.panelCollapse),
      expandLabel: t(HUD_MESSAGE_KEY.panelExpand),
      collapsed: false,
      onToggle: () => {
        collapsed = !collapsed;
        panel.setCollapsed(collapsed);
      },
    },
  });
  panel.body.append(blocksBlock);

  /*
   * The single authority on whether the block has a box, run once here rather
   * than by an initial `hidden` on the element: a second assignment would be a
   * line no test could fail on, which is the rule `paintNeeds` and
   * `paintCoverage` both state.
   */
  paintRegime();

  return {
    element: panel.element,
    setRegime(next: HudRegimeViewModel | undefined): void {
      regime = next;
      paintRegime();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
      // The readout is *pulled* while this tab is the one showing, so leaving
      // it stops the refresh -- and a readout nothing is refreshing goes stale
      // in silence. Cleared rather than frozen, exactly as the Rooms and Intake
      // panels clear their own: what is on screen must be something a system is
      // still answering for.
      if (!visible) {
        regime = undefined;
        paintRegime();
      }
    },
  };
}
