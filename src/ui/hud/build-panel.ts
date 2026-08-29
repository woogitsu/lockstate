import type { LocalizationKey } from '../../content/localization';
import { deriveSimulationMessageKey } from '../../content/simulation-message-keys';
import type { MessageParameters } from '../../services/localization/format';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { createChoiceGroup, type ChoiceGroup, type ChoiceOption } from '../primitives/choice-group';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { element, eyebrowText, nextUiId, valueText } from '../primitives/dom';
import { createListRow, type ListRow } from '../primitives/list-row';
import { createNumberField, type NumberField } from '../primitives/number-field';
import { createPanel } from '../primitives/panel';
import { rovingFocusMove, rovingTabStop } from '../primitives/roving-focus';
import { HUD_MESSAGE_KEY } from './messages';
import {
  HUD_BUILD_EDGES,
  HUD_DEFAULT_BUILD_EDGE,
  type HudBuildEdge,
  type HudBuildableViewModel,
  type HudBuildOrderViewModel,
  type HudBuildQueueViewModel,
  type HudBuildViewModel,
  type HudLocalizer,
  type HudPendingDeliveriesViewModel,
  type HudPendingDeliveryViewModel,
} from './view-model';

/**
 * The Build panel.
 *
 * ### Pointing is the interaction; the panel is the context around it
 *
 * You do not build by dialling in a coordinate. You point at where the thing
 * goes. So the panel's primary control **arms the map**, and the placement
 * itself happens out in the world: click an edge, or drag along it to lay a
 * run. The panel says *what* you are placing and, as feedback, *where* the
 * pointer is about to put it -- a readout, never the input.
 *
 * The numeric fields are still here, deliberately, and deliberately
 * demoted: folded away in a secondary section, below the map affordance and
 * labelled as the other route. A pointer-only build tool would lock out
 * anybody navigating by keyboard, and `AGENTS.md` boundary 10 is not
 * satisfied by "it works with a mouse". Deleting them would have been the
 * easy half of this change and the wrong half.
 *
 * ### Buying what you are about to build (#89)
 *
 * The same panel is where the materials are bought, because the material is
 * a property of the thing you selected: the buy control names the selected
 * buildable's item, starts at one placement's worth of it and states what
 * the quantity on the stepper will cost. Every one of those figures arrives
 * in `HudBuildableViewModel.material` -- the panel holds no price table, no
 * recipe and no ceiling of its own.
 *
 * It is a **disclosure**, closed on arrival, and that is a measurement rather
 * than a preference: see the comment on `buyToggle` for the 7.8px the panel
 * had to spend at 900x600 and what each always-visible alternative cost.
 *
 * ### Boundaries
 *
 * It is a *composer*, not a source of truth. It holds which buildable is
 * selected, which tile the numeric route names, whether the map is armed and
 * how much of a material the next purchase asks for; it turns those into
 * intents. It never touches the world, never inspects a snapshot, and imports
 * nothing from `src/simulation/**` -- so it does not know that a
 * `PurchaseMaterials` command exists, only that it asked the host to buy
 * something.
 */

export interface BuildPanelIntent {
  readonly definitionId: string;
  readonly x: number;
  readonly y: number;
  readonly edge: HudBuildEdge;
  /**
   * Whether the selected row places a discrete object rather than a wall
   * segment (ADR 0028 phase 1), which decides *which* command the press
   * becomes.
   *
   * Carried on the intent rather than looked up by the caller, because the
   * caller is the HUD's own dispatch and the answer is on the view model the
   * panel already holds. `edge` stays populated for such a row for the reason
   * it always was: the field has one shape and the simulation ignores it for
   * anything that is not a wall.
   */
  readonly placesObject: boolean;
  /**
   * Whether this intent *removes* the object at the coordinates instead of
   * placing anything (ADR 0028 phase 3).
   *
   * The numeric route's half of the removal mode, and it is what gives removal a
   * keyboard route on the day it ships rather than in a follow-up: with the mode
   * on, the same two number fields and the same submit button name a tile to
   * clear. `definitionId` is still carried because the intent has one shape, and
   * a removal names no object type -- the consumer ignores it exactly as the
   * simulation ignores `edge` for anything that is not a wall.
   */
  readonly removing: boolean;
}

/** What one press of the buy control asks for: ids and numbers only. */
export interface BuildPanelPurchaseIntent {
  readonly itemId: string;
  readonly quantity: number;
}

/** Where the pointer is currently aimed, for the panel's readout. */
export interface BuildPanelTarget {
  readonly x: number;
  readonly y: number;
  readonly edge: HudBuildEdge;
  /** How many edges the pending gesture covers. `1` for a tap. */
  readonly segments: number;
}

export interface BuildPanelOptions {
  readonly localizer: HudLocalizer;
  readonly model: HudBuildViewModel;
  /** The numeric route: place exactly one order at the coordinates shown. */
  readonly onPlace: (intent: BuildPanelIntent) => void;
  /**
   * The map route: hand the pointer to a tool, or take it back.
   *
   * `removing` travels with `armed` for the reason `RoomsPanelOptions.onArm`'s
   * does: the two describe one armed tool, and a host that saw them disagree
   * would draw a removal ghost for a placing gesture.
   */
  readonly onArm: (armed: boolean, definitionId: string | undefined, removing: boolean) => void;
  /** Buy the selected buildable's material, in the quantity the stepper shows (#89). */
  readonly onPurchase: (intent: BuildPanelPurchaseIntent) => void;
  /**
   * Withdraw **one** pending order, named by its own id.
   *
   * The id and nothing else. The panel does not know that a `CancelBuildOrder`
   * command exists, any more than it knows `PurchaseMaterials` does -- it knows
   * that a row it drew named an order and that the player pressed that row.
   */
  readonly onCancelOrder: (orderId: string) => void;
  /**
   * Cancel **one** purchase whose delivery has not landed, named by its own id
   * (#285).
   *
   * The id and nothing else, exactly as `onCancelOrder` takes one. The panel does
   * not know that a `CancelMaterialPurchase` command exists any more than it
   * knows `PurchaseMaterials` does -- it knows that a row it drew named a
   * delivery, that the row said what cancelling it gives back, and that the
   * player pressed it.
   */
  readonly onCancelPurchase: (orderId: string) => void;
}

export interface BuildPanel {
  readonly element: HTMLElement;
  /**
   * The controls to disable while a command is in flight — the two buttons
   * that issue one, and nothing else.
   *
   * Choosing a buildable, nudging a coordinate, picking an edge, opening the
   * buy row, stepping its quantity and arming the map are *chrome*: they
   * change what the next order would say and ask the host for nothing.
   * Disabling them alongside the command would drop interactions that have
   * nothing to do with the host, which is the same mistake `dispatchShell`
   * exists to avoid for tabs and panels. Observed while driving the real
   * panel: three taps issued in one turn after "Place order" were all
   * swallowed.
   */
  readonly controls: readonly (HTMLButtonElement | HTMLInputElement)[];
  /**
   * The numeric route's submit button, so a refused order can be reported *on
   * the control that was pressed* (issue #207).
   *
   * `controls` answers "what must be disabled while a command is in flight"
   * and holds this one and the buy button; this answers "which control asked
   * for this *order*", which is one button by definition.
   */
  readonly submitControl: HTMLButtonElement;
  /** The buy button, for the same reason `submitControl` exists: a refused purchase is reported on it. */
  readonly purchaseControl: HTMLButtonElement;
  /** Current numeric-route selection, exposed so a test can assert it without reading the DOM. */
  getSelection(): BuildPanelIntent | undefined;
  isArmed(): boolean;
  /** Whether the armed gesture removes rather than places. Exposed for the same reason `isArmed` is: a test should not have to read the DOM. */
  isRemoving(): boolean;
  /** Live feedback from the world. `undefined` clears the readout. */
  setTarget(target: BuildPanelTarget | undefined): void;
  /**
   * What is still waiting to be built, or `undefined` because nothing asked.
   *
   * Two different silences, and the panel draws them the same way for one
   * reason and not the other: it draws no block when nothing asked *and* when
   * the queue is empty, because in both cases there is nothing about the queue
   * to say. It never draws a block that says the queue is empty -- see
   * `paintQueue`.
   */
  setBuildQueue(queue: HudBuildQueueViewModel | undefined): void;
  /**
   * What has been bought and has not arrived, or `undefined` because nothing
   * asked (#285).
   *
   * The same two silences `setBuildQueue` draws the same way, for the same
   * reason: nothing asked and nothing in transit both have nothing to say about
   * money on its way, and neither earns a line inside a disclosure the player
   * opened to buy something.
   */
  setPendingDeliveries(deliveries: HudPendingDeliveriesViewModel | undefined): void;
  setVisible(visible: boolean): void;
}

/**
 * The edge options are labelled from the simulation enum's own catalog group
 * rather than from a pair of `hud.build.edge-*` keys of the panel's own.
 *
 * `BUILD_EDGES` is player-facing precisely *because* this panel exists, so it
 * carries labels in `src/content/simulation-message-keys.ts` like every other
 * projected enum, and the key is derived from the id rather than written out
 * (ADR 0011). A second hand-authored pair here would be the same two labels
 * maintained twice, and adding a third edge slot would silently leave it
 * unlabelled on screen while the catalog said otherwise.
 *
 * This imports from `src/content/`, never from `src/simulation/**` -- the
 * HUD boundary is intact.
 */
function edgeLabelKey(edge: HudBuildEdge): LocalizationKey {
  return deriveSimulationMessageKey('build-edge', edge);
}

/** The panel's own lookup, built once in `createBuildPanel` from the injected `HudLocalizer`. */
type Translate = (key: LocalizationKey, parameters?: MessageParameters) => string;

/**
 * The edge options the numeric route offers, as data.
 *
 * Exported, and pure, for the same reason `BuildPanel.getSelection` is on the
 * handle: what the panel *says* has to be assertable without a DOM. The
 * default Vitest environment is `node` (`docs/TESTING.md`), so nothing
 * headless can call `createBuildPanel` at all -- and the previous guard on
 * this mapping was a `readFileSync` of this file asserting it contained the
 * substring `deriveSimulationMessageKey('build-edge'`. That assertion is
 * satisfied by a body that derives the key, throws it away and returns
 * `'build-edge.north.name'` for every edge, which labels the West option
 * "North" on screen with the whole suite green.
 *
 * A mapping from an id to the text shown for it is exactly the kind of claim
 * `docs/TESTING.md` puts in the headless layer, so it is one here, over real
 * text from a real catalog.
 */
export function buildEdgeChoiceOptions(t: Translate): readonly ChoiceOption[] {
  return HUD_BUILD_EDGES.map((id) => ({ id, label: t(edgeLabelKey(id)) }));
}

/**
 * Whether the numeric route shows its edge chooser for what is currently
 * selected.
 *
 * The chooser is hidden, not disabled, for a buildable that does not sit on an
 * edge: a disabled control still claims the setting exists. A removal has no
 * edge for the same reason it has no buildable -- what goes is whatever is on
 * the tile -- so the mode hides it too.
 *
 * Exported and pure for the reason `buildEdgeChoiceOptions` above is, and for
 * one more: `paintPlacement` used to spell this rule out and `readSelection`
 * did not consult it at all, so the panel could hide a control and still put
 * its value on a command. One function is now the answer to both questions,
 * which is what makes that pair unable to disagree.
 */
export function edgeChooserShown(buildable: HudBuildableViewModel | undefined, removing: boolean): boolean {
  return !removing && buildable?.occupiesEdge === true;
}

/**
 * The edge a submitted intent carries: the player's choice while the chooser is
 * on screen, and `HUD_DEFAULT_BUILD_EDGE` while it is not.
 *
 * **A hidden control's retained value must not become part of a command**, and
 * that is the rule this function exists to state once. The panel keeps one
 * `edge` for the life of the mount so that returning to an edge buildable finds
 * the orientation you last used; before issue #531 that retained value was read
 * unconditionally, so a row whose chooser was hidden submitted whatever the
 * last *visible* choice had been. The player was shown no control, was given no
 * way to change it, and the command carried a setting anyway.
 *
 * It resolves to a default rather than refusing, deliberately. A refusal here
 * would strand a player who has already been charged for materials, and every
 * consumer of an intent whose chooser is hidden ignores the field: `hud.ts`
 * dispatches `remove-object` for a removal and `place-object` for a row that
 * places one, neither of which carries an edge, and `edgeNumericIdFor` writes
 * nothing for a buildable that is not edge geometry. So the field keeps one
 * shape and stops carrying history.
 *
 * The `door-wooden` case that made this visible is *not* fixed here -- it is
 * fixed by `src/main.ts` publishing `occupiesTileEdge`, which puts the chooser
 * on screen for a door so that `chosen` is a choice the player actually made.
 * This function is the other half: with the composition root correct, no row in
 * today's registry reaches the default branch at all, and the branch is what
 * stops the next non-edge buildable that takes the `place-build-order` route
 * from inheriting an edge the same way.
 */
export function intentEdge(
  buildable: HudBuildableViewModel | undefined,
  removing: boolean,
  chosen: HudBuildEdge,
): HudBuildEdge {
  return edgeChooserShown(buildable, removing) ? chosen : HUD_DEFAULT_BUILD_EDGE;
}

/**
 * The option id that filters nothing.
 *
 * A single `*`, which no category id can be: every group id the host mints is
 * either an authored `ObjectCategory` (kebab-case, `identifierSchema`) or the
 * one word it invents for the buildables that have none, so a sentinel that is
 * not a valid identifier cannot collide with a real group. A `''` would have
 * collided with "the host answered nothing" and an `'all'` with a future
 * category actually called that.
 *
 * Exported because the arrival state *is* this option -- the panel shows every
 * row on arrival, exactly as it did before the filter existed -- and a test
 * that asserted the arrival state needs to be able to name it.
 */
export const BUILD_CATEGORY_ALL = '*';

/**
 * The catalogue's filter options: every group the rows actually carry, in the
 * order the rows carry them, behind an option that filters nothing
 * ([ADR 0035](../../../docs/adr/0035-buildable-catalogue-category-filter.md)).
 *
 * **Derived from the rows, never from a list of categories.** A group with no
 * buildable in it produces no option, so the filter can never offer a choice
 * that yields an empty list; and a group that arrives with a future content row
 * produces one with nothing edited here. That is the whole seam #390 is about:
 * the taxonomy already exists and the layout is the thing that had never read
 * it.
 *
 * **Order is the rows' own order**, first appearance wins, which makes the
 * options read in the same sequence as the list they filter -- one order in the
 * panel rather than two. It is deterministic for the reason `buildCatalogue`'s
 * sort in `src/main.ts` is: the rows arrive sorted by content, so the options
 * are a function of content and not of iteration history
 * (`docs/DETERMINISM.md`).
 *
 * **Empty unless there is something to divide**, which means an empty
 * catalogue *and* a catalogue whose rows are all in one group. Both would
 * produce a control every option of which shows the same list, and the panel
 * draws no filter at all rather than one that can only be pressed to no
 * effect -- the same reading `buildEdgeChoiceOptions` does not need because an
 * edge always has four.
 *
 * The real catalogue has eight groups and only ever gains them, so the
 * one-group case is not a state the application reaches;
 * `tests/browser/ui-harness.ts`'s two-row fixture is, and every height that
 * harness pins is therefore measured on a panel with no filter in it -- which
 * is the other half of the evidence that this control costs nothing.
 *
 * Exported and pure for the reason `buildEdgeChoiceOptions` above is: the
 * default Vitest environment is `node` (`docs/TESTING.md`), so nothing headless
 * can call `createBuildPanel`, and which options the filter offers has to be
 * assertable over real keys.
 */
export function buildCategoryOptions(
  buildables: readonly HudBuildableViewModel[],
  t: Translate,
): readonly ChoiceOption[] {
  const groups = new Map<string, LocalizationKey>();
  for (const buildable of buildables) {
    if (!groups.has(buildable.categoryId)) groups.set(buildable.categoryId, buildable.categoryLabelKey);
  }
  if (groups.size < 2) return [];
  return [
    { id: BUILD_CATEGORY_ALL, label: t(HUD_MESSAGE_KEY.buildCategoryAll) },
    ...[...groups].map(([id, labelKey]) => ({ id, label: t(labelKey) })),
  ];
}

/**
 * Which rows the catalogue leaves on screen, in list order.
 *
 * **The selected row is always among them, whatever the filter says**, and
 * that is the decision in this function rather than an edge case it handles.
 * Filtering is a view operation: it must not change what the next press
 * places. The alternatives were both worse -- moving the selection to the
 * active group changes the armed tool as a side effect of looking around, and
 * hiding the selected row leaves the panel's arm button pointed at a buildable
 * whose "Selected" badge is nowhere on screen, which is a control that lies
 * about what it will do.
 *
 * The cost is one row from another group appearing inside the active one, and
 * it is self-explaining: it is the only row wearing the badge. The worst case
 * is therefore the largest group plus one.
 *
 * Pure, and exported, for `buildCategoryOptions`'s reason.
 */
export function visibleBuildableIds(
  buildables: readonly HudBuildableViewModel[],
  activeCategoryId: string,
  selectedId: string | undefined,
): readonly string[] {
  return buildables
    .filter(
      (buildable) =>
        activeCategoryId === BUILD_CATEGORY_ALL ||
        buildable.categoryId === activeCategoryId ||
        buildable.definitionId === selectedId,
    )
    .map((buildable) => buildable.definitionId);
}

/**
 * Which catalogue rows the keyboard's focus ring is made of, and which one of
 * them carries the group's single tab stop (#411, the Build half).
 *
 * ### Why this exists where the Rooms panel needed nothing
 *
 * `rooms-panel.ts` builds its ring straight out of `model.rooms`, because
 * every room type it draws is on screen for ever. This catalogue has a
 * category filter (ADR 0035), so a row can be laid out or not, and the two
 * halves of a roving tab stop both have to be read off the *visible* rows
 * rather than off all of them:
 *
 * - **The `0` must never land on a hidden row.** `hidden` takes an element out
 *   of sequential focus navigation, so a group whose only `tabIndex = 0` is on
 *   a filtered-out row is a group `Tab` cannot enter at all -- twenty-one rows
 *   unreachable, which is a worse defect than the twenty-one tab stops this
 *   change removes.
 * - **The arrows must not step onto one either.** `focus()` on a `hidden`
 *   element does nothing, so an `ArrowDown` that named a filtered row would
 *   leave focus where it was and read as a dead key.
 *
 * Both are one decision, so this answers both at once and the panel holds no
 * second copy of the filter.
 *
 * ### Why it cannot land on a hidden row twice over
 *
 * `visibleBuildableIds` already guarantees the selected row is visible whatever
 * the filter says, and `rovingTabStop` puts the stop on the selection -- so the
 * stop is on a visible row by construction. This function is what makes that a
 * *checked* property rather than an inference from two other functions'
 * comments: `tests/unit/ui-hud-build-panel.test.ts` asserts the answer is
 * always a member of `visibleIds`, across filters that hide the selection's own
 * group.
 *
 * Pure, and exported, for `visibleBuildableIds`'s reason: `vitest.config.ts`
 * runs in `environment: 'node'`, so a decision left inside a `keydown` listener
 * is one the unit suite cannot reach at all (`docs/TESTING.md`).
 */
export interface BuildCatalogueFocusRing {
  /** The rows a `Tab` or an arrow may land on, in list order. */
  readonly visibleIds: readonly string[];
  /** The one row carrying `tabIndex = 0`, or `undefined` when there are none. */
  readonly tabStopId: string | undefined;
}

export function buildCatalogueFocusRing(
  buildables: readonly HudBuildableViewModel[],
  activeCategoryId: string,
  selectedId: string | undefined,
): BuildCatalogueFocusRing {
  const visibleIds = visibleBuildableIds(buildables, activeCategoryId, selectedId);
  const selectedIndex = selectedId === undefined ? -1 : visibleIds.indexOf(selectedId);
  const tabStop = rovingTabStop(visibleIds.length, selectedIndex < 0 ? undefined : selectedIndex);
  return { visibleIds, tabStopId: tabStop === undefined ? undefined : visibleIds[tabStop] };
}

/**
 * What the target readout says for a given aim, including the case where the
 * pointer is aimed at nothing.
 *
 * Split out beside `buildEdgeChoiceOptions` and for the same reason: this is
 * the *second* place an edge becomes a label, and it is the one where passing
 * the wrong edge is invisible -- the option row at least shows both labels
 * side by side, while the readout shows one string and looks plausible
 * whatever edge produced it.
 */
export function formatBuildTargetText(t: Translate, target: BuildPanelTarget | undefined): string {
  if (target === undefined) return t(HUD_MESSAGE_KEY.buildTargetNone);
  return target.segments > 1
    ? t(HUD_MESSAGE_KEY.buildTargetRun, {
        x: target.x,
        y: target.y,
        edge: t(edgeLabelKey(target.edge)),
        count: target.segments,
      })
    : t(HUD_MESSAGE_KEY.buildTargetValue, { x: target.x, y: target.y, edge: t(edgeLabelKey(target.edge)) });
}

/**
 * How many queued orders the block lists at once.
 *
 * **Three, and it is a measurement plus an argument. Both halves matter.**
 *
 * The measurement is the panel's, and it is the tightest in the interface.
 * `buyToggle`'s comment records it: at 900x600, Build tab, coordinates folded --
 * the state a player arrives in -- the panel's body holds 291.2px of content in
 * a 291.2px box and there is **7.8px** between the last section's bottom edge
 * and the fold. So an always-visible list of rows was never on the table; a
 * collapsed section of its own is 45px, which is already six times the whole
 * budget. That is why this block is `hidden` while nothing is queued -- an empty
 * queue is the state a player arrives in, and the arrival height is therefore
 * byte-identical to what #174 left -- and why it is *collapsed* when it appears,
 * so a queue costs a header and not a list until the player asks for one.
 *
 * The argument is what decides the number rather than making it as large as
 * fits. Since #348 the crew builds **one order at a time**, so the queue is a
 * schedule and this list is its head: row one is being built, row two is next,
 * row three is after that. An order thirteenth in line is not one a player needs
 * to reach, because nothing is going to happen to it for another six hundred
 * ticks -- and the control for "I have changed my mind about that whole run" is
 * `Undo`, which pops the transaction the run was drawn in. So the two controls
 * divide the work: `Undo` takes back a gesture, and a row takes back one order.
 * `hud.build.queue-more` says exactly that to a player with more queued than
 * these, and `hud.build.queue-count` always states the whole length, so the
 * panel never implies the queue is shorter than it is.
 *
 * The rows are also **pooled** -- created once here, repainted per publication --
 * and that is not only an allocation choice. Each row's cancel button joins the
 * HUD's busy group, and `createBusyGroup` has `add` and no `remove`: a block
 * that built a row per order would grow that group without bound over a session
 * and keep every dead button in it.
 */
export const BUILD_QUEUE_ROW_LIMIT = 3;

/**
 * What one queued row says it is, and where.
 *
 * Pure and exported for the reason `buildEdgeChoiceOptions` and
 * `formatBuildTargetText` are: the default Vitest environment is `node`
 * (`docs/TESTING.md`), so nothing headless can call `createBuildPanel` at all,
 * and "what the panel says about an order" is exactly the claim that has to be
 * assertable over real text from a real catalog.
 *
 * An order the host names no buildable for still gets a row -- see
 * `HudBuildOrderViewModel.labelKey` -- and this is where it gets its word.
 * Dropping such a row would hide the only control that reaches the order.
 */
export function formatBuildQueueOrderText(t: Translate, order: HudBuildOrderViewModel): string {
  return t(HUD_MESSAGE_KEY.buildQueueOrder, {
    buildable: t(order.labelKey ?? HUD_MESSAGE_KEY.buildQueueUnnamed),
    x: order.tile.x,
    y: order.tile.y,
    edge: t(edgeLabelKey(order.edge)),
  });
}

/**
 * What a queued order is waiting for, in the simulation's own vocabulary.
 *
 * Derived, never hand-authored, exactly as `edgeLabelKey` is and under the same
 * rule (ADR 0011): `build-order-state` in
 * `src/content/simulation-message-keys.ts` labels every member of
 * `BuildOrderLifecycleState`, and a second pair of words for the five a queue
 * can hold would be two spellings of the same five facts.
 *
 * This imports from `src/content/`, never from `src/simulation/**` -- the HUD
 * boundary is intact.
 */
function buildOrderStateLabelKey(state: HudBuildOrderViewModel['state']): LocalizationKey {
  return deriveSimulationMessageKey('build-order-state', state);
}

/**
 * How many pending deliveries the buy disclosure lists at once.
 *
 * **Three, and unlike `BUILD_QUEUE_ROW_LIMIT` this one is a measurement with no
 * argument beside it: three is what fits, and four does not.**
 *
 * Measured on the assembled page at 900x600 -- where `.hud__rail` also holds the
 * save panel, which the UI harness does not, so that harness hands this panel
 * 128.7px more rail than the application ever gives it -- Build tab, one prison,
 * coordinates folded, with the disclosure open:
 *
 * | pending | buy row | panel overflow |
 * | --- | --- | --- |
 * | none | 128.4px | 125px |
 * | one | 199.7px | 196px |
 * | three, with the "and N more" line | 312.9px | 309px |
 *
 * The panel's visible box at that viewport is **337.0px** (184.7 to 521.7), so
 * the whole open row still fits inside it: after the scroll `paintBuy` already
 * performs on opening, the panel sits at `scrollTop` 260 with the row occupying
 * 208.9 to 521.8, every Cancel 78x44, inside the box, and hit-testing to itself.
 *
 * **A fourth row does not fit, and the failure is the one this repository has
 * shipped before.** At four the row is 360.9px against the same 337.0px box, and
 * the fourth Cancel's box ends at 529.6 -- **7.9px below the panel's visible
 * bottom**, with `offsetParent` set and a 78x44 rectangle, which is #220's exact
 * shape: a control that is laid out, hit-tests to itself, and is not on screen.
 * So the ceiling is a rectangle rather than a preference, and the rows are the
 * deliveries arriving soonest, which is also the order in which their refunds
 * stop being available.
 *
 * **What this block costs the panel when it is not open: nothing at all.**
 * Measured in the arrival state at the same viewport, with five purchases out and
 * the disclosure closed, against the same page with nothing bought -- identical
 * to the tenth of a pixel: the panel is 338.1px, its body holds 291.2px in a
 * 291.2px box, the panel's own overflow is 0, the catalogue list is 88px of 924px
 * of rows, and "Enter coordinates" ends 7.8px inside the fold. That is what
 * decided the *placement*, and it is not a preference either. The catalogue is
 * the one block `hud.css` lets this panel take height from; ADR 0031 decision 3
 * already spends 45px of it on the queue block, and its open question 4 asks
 * whether the catalogue is the right donor at all -- a question with a number
 * behind it now that `BUILDABLE_REGISTRY` holds twenty-one rows, because at this
 * viewport with a queue the list is a 44px box over 924px of rows, which is one
 * row of twenty-one on screen. A block that appeared whenever a delivery was
 * pending would have had to take a second donation out of that same block. This
 * one has nothing to pay for.
 *
 * That open question is answered by
 * [ADR 0035](../../../docs/adr/0035-buildable-catalogue-category-filter.md), and
 * answered in this block's favour rather than against it: the catalogue stays the
 * donor and gains a category filter that shares the section header's own 44px, so
 * the figures above are unchanged and "costs the panel nothing" remains the only
 * way a block gets into this panel.
 *
 * The rows are **pooled** for both of `BUILD_QUEUE_ROW_LIMIT`'s reasons, and the
 * second is not about allocation: each row's cancel button joins the HUD's busy
 * group, `createBusyGroup` has `add` and no `remove`, and a block that built a
 * row per delivery would grow that group without bound over a session.
 */
export const PENDING_DELIVERY_ROW_LIMIT = 3;

/**
 * What one pending delivery says it is, and what cancelling it gives back.
 *
 * Pure and exported for the reason `formatBuildQueueOrderText` is: the default
 * Vitest environment is `node` (`docs/TESTING.md`), so nothing headless can call
 * `createBuildPanel`, and "what the panel promises a cancellation refunds" is
 * exactly the claim that has to be assertable over real text from a real
 * catalog. It is also the one sentence in this panel that states a figure the
 * simulation will move: a row that named the wrong amount would be a lie about
 * money.
 *
 * The total is the *recorded* price the projection carried, never a
 * recomputation from a quantity and a unit price -- `ProcurementSystem.cancel`
 * refunds what was paid, so this renders what was paid.
 *
 * A delivery the host names no item for still gets a row -- see
 * `HudPendingDeliveryViewModel.labelKey` -- and this is where it gets its word.
 */
export function formatPendingDeliveryText(t: Translate, delivery: HudPendingDeliveryViewModel, total: string): string {
  return t(HUD_MESSAGE_KEY.buildDelivery, {
    count: delivery.quantity,
    material: t(delivery.labelKey ?? HUD_MESSAGE_KEY.buildDeliveryUnnamed),
    total,
  });
}

export function createBuildPanel(options: BuildPanelOptions): BuildPanel {
  const { localizer, model } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let selectedId = model.buildables[0]?.definitionId;
  let tileX = Math.trunc(model.origin.x);
  let tileY = Math.trunc(model.origin.y);
  let edge: HudBuildEdge = HUD_DEFAULT_BUILD_EDGE;
  let armed = false;
  /** Whether the armed gesture takes an object away instead of placing one (ADR 0028 phase 3). */
  let removing = false;
  /** Whether the buy row is disclosed. Closed on arrival -- see `.hud-build__buy` in `hud.css`. */
  let buying = false;
  /** How many units the next purchase asks for, and which material it was last set for. */
  let quantity = 1;
  let quantityItemId: string | undefined;

  const selectedBuildable = () => model.buildables.find((entry) => entry.definitionId === selectedId);
  const selectedMaterial = () => selectedBuildable()?.material;

  // ---- what to build ------------------------------------------------
  const catalogueList = element('div', { className: 'hud-build__list' });
  const rows = new Map<string, ListRow>();

  /**
   * Which group of the catalogue is on screen (ADR 0035). View state, and
   * deliberately nothing more: it is not on the intent, not in a snapshot and
   * not in a save. What a player is looking at is not what their prison is,
   * and `src/persistence/save-schema.ts` is untouched by this filter.
   *
   * Starts at `BUILD_CATEGORY_ALL`, so the panel arrives showing exactly the
   * rows it showed before this control existed -- which is what keeps
   * ADR 0031 decision 3's first bullet ("the panel's arrival height is
   * unchanged") a statement about this panel too, and what keeps the most-used
   * buildable in the game from starting out behind a filter.
   */
  let activeCategoryId: string = BUILD_CATEGORY_ALL;

  const categoryOptions = buildCategoryOptions(model.buildables, t);

  /**
   * The filter, as a `<select>` -- the one place in this interface that is not
   * a `createChoiceGroup`, and the reason is arithmetic rather than taste.
   *
   * A choice group shows every option at once, which is right for the edge
   * chooser's four one-word options. This control has as many options as the
   * content has groups -- nine today, one per authored category plus the
   * structural pair plus "Everything" -- and it has to fit **inside a 44px
   * header row** beside an eyebrow, in a 264px rail. A row of nine chips wraps
   * to three lines there, which is exactly the height this filter exists to
   * avoid spending.
   *
   * So: one native control, one tap target, reachable by keyboard and by touch
   * alike, showing its own current value as its visible text -- which is why an
   * `aria-label` is legitimate here rather than a tooltip-only label. It is not
   * promoted to a primitive: `src/ui/primitives/choice-group.ts` states the
   * case against a `<select>` for the case it was written for, and one control
   * that needs the other trade is not yet a pattern.
   */
  const categoryFilter = element('select', {
    className: 'hud-build__category',
    attributes: { 'aria-label': t(HUD_MESSAGE_KEY.buildCategory) },
    children: categoryOptions.map((option) =>
      element('option', { text: option.label, attributes: { value: option.id } }),
    ),
  });
  categoryFilter.value = activeCategoryId;
  categoryFilter.addEventListener('change', () => {
    activeCategoryId = categoryFilter.value;
    paintCatalogue();
    revealSelectedRow();
  });

  /**
   * Scrolls the list, and only the list, until the selected row is inside it.
   *
   * `visibleBuildableIds` guarantees the selected row is *laid out* whatever
   * the filter says, and at the viewport this whole change is about that buys
   * nothing on its own: with a queue at 900x600 the list is a 44px box, so
   * exactly one row is on screen and a selected row anywhere below the first
   * is laid out and invisible. That is #220's shape -- a control with a real
   * box that a player cannot see -- so the rule and this are one decision.
   *
   * Written as arithmetic on `catalogueList.scrollTop` rather than as
   * `scrollIntoView({ block: 'nearest' })`, which walks *every* scroll
   * ancestor: the panel is itself a scroll container
   * (`.ui-panel.hud-build`), so the browser helper would also scroll the panel
   * and move "Enter coordinates" out from under its own fold -- the exact
   * measurement `tests/browser/app-shell.spec.ts` asserts is 7.8px inside it.
   *
   * Called on a filter change and nowhere else. Not at mount, because the
   * arrival state is measured with nothing scrolled; and not on selection,
   * because a player who taps a row is looking at the row they tapped.
   */
  function revealSelectedRow(): void {
    const row = selectedId === undefined ? undefined : rows.get(selectedId);
    if (row === undefined || row.element.hidden) return;
    const listTop = catalogueList.getBoundingClientRect().top + catalogueList.clientTop;
    const rowBox = row.element.getBoundingClientRect();
    const above = rowBox.top - listTop;
    const below = rowBox.bottom - (listTop + catalogueList.clientHeight);
    if (above < 0) catalogueList.scrollTop += above;
    else if (below > 0) catalogueList.scrollTop += below;
  }

  /*
   * The rows the keyboard may currently land on, and which of them holds the
   * group's one tab stop. Repainted with the catalogue, and read by the arrow
   * handler below, so the two can never disagree about what the ring is.
   */
  let focusRing = buildCatalogueFocusRing(model.buildables, activeCategoryId, selectedId);

  const paintCatalogue = (): void => {
    focusRing = buildCatalogueFocusRing(model.buildables, activeCategoryId, selectedId);
    const visible = new Set(focusRing.visibleIds);
    for (const [id, row] of rows) {
      row.setBadge(id === selectedId ? { tone: 'info', text: t(HUD_MESSAGE_KEY.buildSelected) } : undefined);
      row.element.dataset['selected'] = id === selectedId ? 'true' : 'false';
      // `aria-checked` is the *machine* carrier of which buildable is chosen,
      // as it is in `rooms-panel.ts`; the badge above stays the visual one.
      row.element.setAttribute('aria-checked', id === selectedId ? 'true' : 'false');
      /*
       * `hidden` rather than a class, so a filtered row lays out no box at all
       * and the list's `scrollHeight` really is the filtered list's height --
       * which is the whole measurable effect of this control. A row hidden by
       * opacity or by `visibility` would keep its 44px and the filter would
       * shorten nothing.
       */
      row.element.hidden = !visible.has(id);
      // Exactly one `0` in the group, and it follows the selection so that
      // tabbing back in lands on the player's own choice rather than at the
      // top of a list they have already answered. It is read off the *visible*
      // order, so the filter can never park it on a row `Tab` cannot reach --
      // see `buildCatalogueFocusRing`.
      row.element.tabIndex = focusRing.tabStopId === id ? 0 : -1;
    }
  };

  for (const buildable of model.buildables) {
    const row = createListRow({
      icon: 'build',
      label: t(buildable.labelKey),
      onActivate: () => {
        selectedId = buildable.definitionId;
        paintCatalogue();
        paintPlacement();
        // The purchase follows the selection too: a different buildable is a
        // different material, at a different price, and may be one nothing
        // sells.
        paintBuy();
        // The armed tool has to follow the selection, or the map would keep
        // placing whatever was chosen when it was armed. Choosing a row is a
        // statement about *placing*, so it turns removal off -- the two modes
        // are one armed tool, and a player who picked a bed while removal was on
        // asked to place a bed.
        removing = false;
        paintArmed();
        options.onArm(armed, selectedId, removing);
      },
    });
    row.element.dataset['buildable'] = buildable.definitionId;
    // `role="radio"` on a real `<button>`, exactly as `rooms-panel.ts` does it:
    // the role carries the single-select meaning, the button carries the
    // activation, so `Enter` and `Space` still choose through the same
    // `onActivate` a pointer press reaches. No second path.
    row.element.setAttribute('role', 'radio');
    rows.set(buildable.definitionId, row);
    catalogueList.append(row.element);
  }

  /*
   * The catalogue is one choice, so it is announced as one -- and the role is
   * not decoration, it is the half that keeps the roving tab stop below from
   * being a regression.
   *
   * A roving `tabindex` with nothing announcing the grouping would turn
   * "twenty-one tedious stops" into "twenty rows a sighted keyboard-only player
   * can no longer reach at all", because `Tab` is the only mechanism they have
   * and nothing would have told them to try an arrow. `radiogroup` / `radio` is
   * what tells them: a screen reader says "Brick wall, radio button, 1 of 21,
   * selected", naming the ring, the position and the selection in one breath.
   *
   * ### Why on the scroller itself, where the Rooms panel needed a box
   *
   * `rooms-panel.ts` boxes its rows in a `.hud-rooms__rows` child because its
   * scroller holds two different things -- the rows *and* the typed coordinate
   * form ADR 0039 measured into it -- and four number fields must not become
   * members of the choice. This scroller holds the rows and nothing else: the
   * Build panel's typed route is its own collapsible section
   * (`.hud-build__coordinates`), a sibling of this one. So the box that is
   * only the rows already exists, and adding a second one would spend a flex
   * layer inside the panel whose height budget is measured in single-figure
   * pixels (see `buyToggle`) to change nothing about what is announced.
   *
   * Named from the section it heads, as the Rooms group is: that eyebrow reads
   * "What to build", it sits immediately before this box in reading order, and
   * a second near-identical name is noise a screen-reader player hears on every
   * entry. It is an existing key rather than a new sentence.
   */
  if (model.buildables.length > 0) {
    catalogueList.setAttribute('role', 'radiogroup');
    catalogueList.setAttribute('aria-label', t(HUD_MESSAGE_KEY.buildCatalogue));
  }

  /*
   * An empty list must say so. A blank rectangle is indistinguishable from a
   * broken one.
   *
   * It stays inside the scroller, and the scroller is *not* a `radiogroup` in
   * that state -- which is the same ruling `rooms-panel.ts` reaches by putting
   * its own empty row beside the group rather than in it. This row is a
   * sentence, not a choice, and a `radiogroup` whose only member is a
   * non-interactive readout would announce "one of one" for something there is
   * no way to select. Reachable only from a host that passes no buildables; the
   * shipped catalogue has 21.
   */
  if (model.buildables.length === 0) {
    catalogueList.append(
      createListRow({ icon: 'check', label: t(HUD_MESSAGE_KEY.buildCatalogueEmpty) }).element,
    );
  }

  /*
   * The arrows, which are what the one tab stop buys back.
   *
   * Focus moves; selection does not. A radiogroup conventionally selects as it
   * moves, and that convention is refused here for the reason `rooms-panel.ts`
   * refuses it and for one more of this panel's own: choosing a row re-arms the
   * world tool and clears removal (`onActivate` above), so
   * selection-follows-focus would fire `options.onArm` once per arrow press and
   * a player arrowing from Brick wall to Storage rack would re-arm it twenty
   * times. Explicit activation is also what the pointer does, so the two
   * producers of a selection stay one gesture.
   *
   * The ring is `focusRing.visibleIds` rather than every row, so the category
   * filter cannot make an arrow press land on a row that is not laid out --
   * `focus()` on a `hidden` element does nothing, and a key that silently does
   * nothing is the failure this whole change exists to remove.
   *
   * `preventDefault` only for the keys actually consumed -- `rovingFocusMove`
   * answers `undefined` for everything else, and an arrow that is not ours must
   * stay the browser's, or the scroll region this list *is* would stop
   * scrolling.
   */
  catalogueList.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const focused = event.target;
    if (!(focused instanceof HTMLElement)) return;
    const definitionId = focused.dataset['buildable'];
    if (definitionId === undefined) return;
    const order = focusRing.visibleIds;
    const next = rovingFocusMove(event.key, order.indexOf(definitionId), order.length);
    if (next === undefined) return;
    const targetId = order[next];
    const target = rows.get(targetId ?? '');
    if (target === undefined) return;
    event.preventDefault();
    // The moved-to row has to be able to take focus before it is given focus:
    // every row but the tab stop carries `-1`, and `focus()` on a `-1` element
    // works, but leaving the group's `0` behind would mean tabbing back in
    // returns to the row the player arrowed away from.
    for (const [id, row] of rows) row.element.tabIndex = id === targetId ? 0 : -1;
    target.element.focus();
  });

  const catalogue: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.buildCatalogue),
    onToggle: (collapsed) => catalogue.setCollapsed(collapsed),
    /*
     * In the header row, beside the eyebrow, because that row is already 44px
     * and already counted in every floor `hud.css` sums for this section --
     * so the filter costs the panel nothing. Nothing else in this panel could
     * afford it: measured on the assembled page there are 7.8px between the
     * last section and the fold at 900x600 on arrival, and with a queue the
     * catalogue list is down to a single 44px row (ADR 0031 decision 3), so a
     * control with a tap target of its own anywhere else in the body would put
     * "Enter coordinates" below the fold -- issue #174 for a fourth time.
     *
     * Omitted entirely when there is nothing to divide -- an empty catalogue, or
     * one whose rows are all in one group. `buildCategoryOptions` answers `[]`
     * for both, and a filter every option of which shows the same list is a
     * control that can only be pressed to no effect. `hud.css` styles both
     * shapes of this header for that reason.
     */
    ...(categoryOptions.length === 0 ? {} : { headerAction: categoryFilter }),
  });
  // The one section the panel's height budget is allowed to take space from,
  // named so `hud.css` can say which one it is (issue #143). Every other block
  // in the panel keeps its content height; the catalogue is the one that grows
  // with the content catalogue, so it is the one that scrolls.
  catalogue.element.classList.add('hud-build__catalogue');
  catalogue.body.append(catalogueList);

  // ---- the map route (primary) --------------------------------------
  const armButton: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.buildArm),
    tone: 'primary',
    icon: 'build',
    disabled: selectedId === undefined,
    onActivate: () => {
      // Arming to place turns removal off, for the reason the Rooms panel's arm
      // button does: pressing "Place on map" while removal was on is a request
      // to place, not a request to keep removing with a different label.
      const wasRemoving = removing;
      removing = false;
      armed = (wasRemoving || !armed) && selectedId !== undefined;
      paintArmed();
      options.onArm(armed, selectedId, removing);
    },
  });
  armButton.element.dataset['armed'] = 'false';
  // Named, so a selector can say *which* action it means. Both buttons in the
  // row below are `.ui-action`, and `.hud-build__map .ui-action` used to be
  // the arm button by being the only one.
  armButton.element.classList.add('hud-build__arm');

  /**
   * Removal, and the reason it is a peer of the arm button rather than a row of
   * its own (ADR 0028 phase 3).
   *
   * ### Why it is here at all
   *
   * Because until it existed a placed object could be taken back only by `Undo`,
   * and `Undo` is `KeyZ`. So on a touch device a misplaced bed was **permanent
   * for the session**: the Build panel offered no per-order control at all, and a
   * tile under a standing object refuses every further placement. That is
   * precisely the state the Rooms tab shipped in and had to fix in a follow-up,
   * and `AGENTS.md` boundary 10 is not satisfied by "it works with a keyboard"
   * any more than by "it works with a mouse".
   *
   * ### Why it costs the height budget nothing
   *
   * It shares `.hud-build__actions` with the arm button and the buy disclosure,
   * and that row is `--tap-target` tall whether it holds one button or three --
   * the same argument #89's buy toggle made for joining it. What a third button
   * *can* cost is horizontal room, and ADR 0022 measured exactly that: a third
   * button in this row overflowed by 37.9px with the labels it tried. So the
   * arm button is allowed to shrink (`min-width: 0` in `hud.css`, as
   * `.hud-rooms__arm` already is) and this one is labelled with one word.
   * Measured on the assembled page at all five viewports the browser suite
   * visits -- see `tests/browser/app-shell.spec.ts`.
   *
   * ### It is not the queue block, and the two do different work
   *
   * The panel has a per-order control now -- one per row of `.hud-build__queue`,
   * which is where `CancelBuildOrder` finally got its producer -- and this button
   * is still the right one for an object. Three differences, and each is a reason
   * this control stays: the queue names *pending* orders, so it cannot touch a
   * bed that has already been built; it names orders by id rather than by tile,
   * so aiming at a thing you are looking at is a press on the panel rather than
   * on the object; and `RemoveObject` reverses a *standing* object's geometry,
   * which no cancellation of a finished order does through this route. A player
   * removing a bed presses the bed; a player thinning out a queue presses a row.
   *
   * ### Why arming to remove needs no selection
   *
   * A removal names no object type: what goes is whatever the player pressed on.
   * `RoomTool.setArmed` records the same asymmetry for un-designating, and the
   * reason is the same -- requiring a selection before a mistake can be undone
   * would be a rule with nothing behind it, and it would bite hardest in the
   * case removal exists for.
   */
  const removeButton: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.buildRemove),
    onActivate: () => {
      removing = !removing;
      // Arming to remove is arming. The tool stays armed while the mode is on
      // and the world keeps the pointer, so the player presses one control and
      // then presses tiles -- which is the whole gesture on a touch device.
      armed = removing || armed;
      paintArmed();
      paintBuy();
      options.onArm(armed, selectedId, removing);
    },
  });
  removeButton.element.classList.add('hud-build__remove');

  const targetValue = valueText(t(HUD_MESSAGE_KEY.buildTargetNone), 'hud-build__target-value');
  const targetBlock = element('div', {
    className: 'hud-build__target',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.buildPlacement)), targetValue],
  });

  const armHint = eyebrowText(t(HUD_MESSAGE_KEY.buildArmHint), 'hud-build__note');

  function paintArmed(): void {
    // "Armed" on the arm button means armed *to place*, which is what its label
    // and its pressed state are about. A tool armed to remove is armed, and this
    // button is not the control that is on -- the same split `.hud-rooms__arm`
    // makes against `.hud-rooms__remove`.
    const placing = armed && !removing;
    armButton.setLabel(t(placing ? HUD_MESSAGE_KEY.buildDisarm : HUD_MESSAGE_KEY.buildArm));
    armButton.element.dataset['armed'] = placing ? 'true' : 'false';
    // `aria-pressed` says it is a toggle, not a one-shot action; without it a
    // screen reader announces "Stop placing" with no way to tell that the
    // mode is currently on.
    armButton.element.setAttribute('aria-pressed', placing ? 'true' : 'false');

    removeButton.setLabel(t(removing ? HUD_MESSAGE_KEY.buildRemoveActive : HUD_MESSAGE_KEY.buildRemove));
    removeButton.element.dataset['removing'] = removing ? 'true' : 'false';
    removeButton.element.setAttribute('aria-pressed', removing ? 'true' : 'false');

    // One line either way, so the controls under it never move: the hint says
    // what the armed gesture does, and a removal does something else.
    armHint.textContent = t(removing ? HUD_MESSAGE_KEY.buildRemoveHint : HUD_MESSAGE_KEY.buildArmHint);

    // The numeric route follows the mode too, or the one submit button would
    // say "Place order" and clear a tile.
    submit.setLabel(t(removing ? HUD_MESSAGE_KEY.buildRemoveSubmit : HUD_MESSAGE_KEY.buildSubmit));
    paintPlacement();
    // Removal names no buildable, so it is offered even for an empty catalogue
    // -- the one case where the numeric route works with nothing selected.
    submit.setDisabled(!removing && selectedId === undefined);

    if (!armed) setTarget(undefined);
  }

  // ---- buying the materials (#89) -----------------------------------
  /*
   * The panel's one way to spend the treasury, and the whole of why it is
   * shaped like this is the panel's height budget.
   *
   * Measured on the assembled page at 900x600, Build tab, one prison saved,
   * coordinates folded -- the state a player arrives in -- with this row
   * absent: the panel's body holds 291.2px of content in a 291.2px box, its
   * summed floor resolves to 275.2px and the catalogue is sitting exactly on
   * its own floor, so nothing in the panel has anything left to donate. What
   * is left is the 7.8px between the last section's bottom edge and the panel's
   * fold, measured by growing a spacer above that section until the header
   * crosses the fold. So 7.8px is the entire budget a new always-visible block
   * has there -- and it read 11.8px before #174's second half corrected the
   * floors, of which 4px was the catalogue laying its own gutter over the map
   * block's hairline rather than space anything could have used. Every
   * candidate was measured against it: a
   * collapsed section of its own is 45px (1px border plus a 44px header), a
   * bare row of controls is 44px, and neither the arm hint (13.2px at that
   * viewport) nor a one-row catalogue floor can pay for either without
   * costing a control or a list. Issue #174 closed exactly this overflow one
   * commit ago, so re-opening it was not on the table.
   *
   * Hence a **disclosure that costs nothing until it is opened**: the "Buy"
   * toggle shares the arm button's row, which is already `--tap-target` tall
   * whether one button or two sit in it, so the panel's arrival height is
   * byte-identical to what #174 left. Measured on the assembled page at all
   * five of the viewports the browser suite visits, closed: the same body
   * box, the same body content height, the same three block heights and the
   * same 7.9-8.4px between the last section header and the fold as before
   * this existed.
   *
   * Opened, the row is 149.6px where the hint wraps and 128.4px at 900x600
   * where `hud.css` clamps it to one line, and the panel scrolls at four of
   * those five viewports -- by 119px at 1280x720, 83px at 1024x768, 121px at
   * 900x600 and 75px at 375x812, and not at all at 1440x900. That is the
   * same state, for the same reason and with the same honesty, as expanding
   * the numeric fallback, which `hud.css` already documents as the situation
   * where this panel legitimately scrolls: the player opened it, the panel
   * absorbs its own excess, and the wheel scrolls it. Opening therefore also
   * scrolls the row into view -- see `paintBuy` -- because a disclosure that
   * reveals a control below the fold has not revealed it.
   *
   * The toggle is *hidden*, not disabled, for a buildable whose materials
   * cannot be bought: a disabled control still claims the purchase exists,
   * which is the same rule `paintPlacement` follows for the edge chooser.
   */
  const buyToggle: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.buildBuy),
    onActivate: () => {
      buying = !buying;
      paintBuy();
    },
  });
  buyToggle.element.classList.add('hud-build__buy-toggle');

  const quantityField: NumberField = createNumberField({
    label: t(HUD_MESSAGE_KEY.buildBuyQuantity),
    value: quantity,
    // A floor of one and no ceiling in the DOM: the ceiling belongs to the
    // selected material and is applied in `setQuantity` below, because the
    // field's own `max` is fixed when it is built and the selection is not.
    min: 1,
    decrementLabel: t(HUD_MESSAGE_KEY.buildStepDown, { field: t(HUD_MESSAGE_KEY.buildBuyQuantity) }),
    incrementLabel: t(HUD_MESSAGE_KEY.buildStepUp, { field: t(HUD_MESSAGE_KEY.buildBuyQuantity) }),
    onChange: (value) => setQuantity(value),
  });

  const buySubmit: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.buildBuy),
    onActivate: () => {
      const material = selectedMaterial();
      // Unreachable while the row is only shown for a buildable that has one,
      // and returning rather than asserting keeps a purchase of `undefined`
      // impossible rather than merely unlikely.
      if (material === undefined) return;
      options.onPurchase({ itemId: material.itemId, quantity });
    },
  });
  buySubmit.element.classList.add('hud-build__buy-submit');

  /*
   * ---- what has been bought and has not arrived (#285) ----------------
   *
   * **Why it is here, inside the buy disclosure, and not in a block of its
   * own.** The catalogue is the only block `hud.css` lets this panel take height
   * from, ADR 0031 decision 3 already spends 45px of it on the queue block, and
   * at 900x600 with a queue that leaves the list a 44px box over 924px of rows --
   * one `BUILDABLE_REGISTRY` row of twenty-one on screen. A third section drawn
   * whenever something is pending would have been a second donation out of the
   * same donor, which is precisely what that ADR's open question 4 ("is the
   * catalogue the right donor?") is about -- and what ADR 0035 answers by
   * keeping the donation and shortening what the list has to hold, rather than
   * by finding a second donor that does not exist.
   *
   * So this costs the panel **nothing at all** until the player opens the
   * disclosure, which is the same trade `buyToggle` records and the reason that
   * row is allowed to exist. Measured on the assembled page at 900x600, Build
   * tab, one prison, coordinates folded -- the arrival state -- with three
   * deliveries pending and the disclosure closed: the panel is 338.1px, its body
   * holds 291.2px in a 291.2px box, the catalogue list is 88px of a 924px list
   * (two rows of twenty-one), and "Enter coordinates" ends 7.8px inside the fold.
   * Every one of those figures is byte-identical to the same page with nothing
   * bought, because this block has no box in either state.
   *
   * It is also where the player is looking. A pending delivery is a *purchase*,
   * not a build order: the id it carries was minted by the press two controls
   * above it, the money it refunds is the money that press spent, and somebody
   * who has just bought three bricks and changed their mind is already here.
   *
   * **What it costs, stated rather than left to be found.** While the buy toggle
   * is hidden the disclosure cannot be opened, so these rows are unreachable --
   * `paintBuy` hides the toggle for a buildable nothing sells and for the removal
   * mode, and hiding it in that mode is load-bearing (it is what gives the third
   * button in `.hud-build__actions` its room back, on a row ADR 0022 measured a
   * third control overflowing). A player in the removal mode leaves it to reach
   * their money, which is one tap, and the alternative was re-opening a measured
   * overflow.
   */
  const deliveriesCount = valueText('', 'hud-build__deliveries-count');
  const deliveryList = element('div', { className: 'hud-build__delivery-list' });
  /*
   * `hud-build__deliveries-more` as well as `hud-build__note`, and the extra
   * class is load-bearing for the reason `hud-build__queue-more`'s is:
   * `.hud-build__note` is given `display: -webkit-box` under `max-height: 700px`
   * in `hud.css` to clamp the arm hint to one line, and an author `display`
   * beats the user agent's `[hidden] { display: none }`. Without a class to hang
   * a rule on, `hidden` would still lay this line out at every short viewport.
   */
  const deliveriesMore = eyebrowText('', 'hud-build__note hud-build__deliveries-more');

  /**
   * One pooled row: what is coming, and the one control that cancels it.
   *
   * Pooled for both of `BUILD_QUEUE_ROW_LIMIT`'s reasons, and the second is the
   * one that is not about allocation: each row's cancel button joins the HUD's
   * busy group, and `createBusyGroup` has `add` and no `remove`, so a block that
   * built a row per delivery would grow that group without bound over a session
   * and keep every dead button in it.
   */
  interface DeliveryRow {
    readonly element: HTMLElement;
    readonly label: HTMLSpanElement;
    readonly cancel: ActionButton;
    /** The delivery this row currently names, or `undefined` while it is hidden. */
    orderId: string | undefined;
  }

  const deliveryRows: readonly DeliveryRow[] = Array.from({ length: PENDING_DELIVERY_ROW_LIMIT }, (): DeliveryRow => {
    const label = valueText('', 'hud-build__delivery-label');
    const row: DeliveryRow = {
      element: element('div', { className: 'hud-build__delivery-row' }),
      label,
      cancel: createActionButton({
        label: t(HUD_MESSAGE_KEY.buildDeliveryCancel),
        onActivate: () => {
          // Read at press time and not captured at construction, for the reason
          // the queue rows do it: the row is pooled and names whichever delivery
          // the last publication put in it, so a captured id would cancel
          // whatever was here two seconds ago -- and here that is a refund of
          // the wrong amount rather than the wrong wall.
          const { orderId } = row;
          if (orderId === undefined) return;
          options.onCancelPurchase(orderId);
        },
      }),
      orderId: undefined,
    };
    row.element.append(element('div', { className: 'hud-build__delivery-text', children: [label] }), row.cancel.element);
    row.element.hidden = true;
    deliveryList.append(row.element);
    return row;
  });

  const deliveriesBlock = element('div', {
    className: 'hud-build__deliveries',
    children: [
      element('div', {
        className: 'hud-build__deliveries-header',
        children: [eyebrowText(t(HUD_MESSAGE_KEY.buildDeliveries)), deliveriesCount],
      }),
      deliveryList,
      deliveriesMore,
    ],
  });
  /*
   * No initial `hidden` here: `paintDeliveries` runs once at construction, below
   * the `panel.body.append`, and it is the single authority on whether this block
   * has a box. A second assignment would be a line no test could fail on -- the
   * rule `.hud-rooms__needs` records for the same shape of block.
   */

  const buyRow = element('div', {
    className: 'hud-build__buy',
    children: [
      quantityField.element,
      buySubmit.element,
      eyebrowText(t(HUD_MESSAGE_KEY.buildBuyHint), 'hud-build__note'),
      /*
       * Last in the row, and the order is the argument. The stepper and the
       * button are what the player opened this for; the deliveries are what they
       * come back for. `paintBuy` scrolls the row into view when it opens, and
       * `block: 'nearest'` aligns the row's own leading edge when the row is
       * taller than the panel's visible box -- so the controls that buy stay
       * where the player expects them and the rows below them are reached by the
       * scroll the panel already performs.
       */
      deliveriesBlock,
    ],
  });
  buyRow.hidden = true;
  const buyRowId = nextUiId('hud-build-buy');
  buyRow.id = buyRowId;
  buyToggle.element.setAttribute('aria-controls', buyRowId);

  /** Clamps to what the selected material allows, then repaints what it costs. */
  function setQuantity(value: number): void {
    const material = selectedMaterial();
    const ceiling = material === undefined ? value : material.maxQuantity;
    quantity = Math.min(Math.max(1, Math.trunc(value)), ceiling);
    quantityField.setValue(quantity);
    paintBuyTotal();
  }

  function paintBuyTotal(): void {
    const material = selectedMaterial();
    if (material === undefined) return;
    buySubmit.setLabel(
      t(HUD_MESSAGE_KEY.buildBuySubmit, {
        count: quantity,
        material: t(material.labelKey),
        // Minor units, formatted like every other figure the HUD shows and
        // divided by nothing: #96 named no currency, and the prices in
        // `src/content/procurement-catalog.ts` and the balance on the status
        // strip are quoted in the same units, so this is the number the
        // player compares against what they have.
        total: localizer.formatNumber(material.unitPriceMinorUnits * quantity),
      }),
    );
  }

  function paintBuy(): void {
    const material = selectedMaterial();
    if (material === undefined || removing) buying = false;
    // Hidden while removing, for the same reason it is hidden for a buildable
    // nothing sells: a control that claims a purchase belongs to the gesture the
    // player is performing, and a removal buys nothing. It is *hidden* and not
    // disabled -- `paintPlacement` follows the same rule for the edge chooser --
    // and hiding it is also what gives the third button in
    // `.hud-build__actions` its room back while the mode is on.
    buyToggle.element.hidden = material === undefined || removing;
    buyToggle.element.setAttribute('aria-expanded', buying ? 'true' : 'false');
    buyToggle.element.dataset['open'] = buying ? 'true' : 'false';
    const opening = buying && buyRow.hidden;
    buyRow.hidden = !buying;
    // Opened, the row is below the panel's fold at four of the five viewports
    // the browser suite visits -- 119px at 1280x720, 121px at 900x600 --
    // because the panel is sized to its arrival content and this row is
    // roughly 150px of it. Bringing it into view is what makes the
    // disclosure a disclosure rather than a control that appears somewhere
    // the player cannot see; the panel is a scroll container
    // (`.ui-panel.hud-build`), so this scrolls the panel and nothing else.
    if (opening) buyRow.scrollIntoView({ block: 'nearest' });
    if (material === undefined || removing) return;
    // A different material is a different purchase, so the quantity goes back
    // to one placement's worth rather than carrying 200 bricks over onto a
    // door. It is content's number, not one chosen here.
    if (material.itemId !== quantityItemId) {
      quantityItemId = material.itemId;
      setQuantity(material.quantityPerPlacement);
      return;
    }
    setQuantity(quantity);
  }

  /** What has been bought and has not arrived, or `undefined` because nothing asked. */
  let deliveries: HudPendingDeliveriesViewModel | undefined;

  /**
   * Draws what is on its way, or draws nothing.
   *
   * **Nothing is the common state and it must cost nothing**, exactly as for the
   * queue block: a line saying no money is in transit would be furniture inside a
   * disclosure the player opened in order to spend some. `hidden` rather than an
   * empty box, because a laid-out empty block still takes its gap.
   *
   * Repainted on the counts cadence whether the disclosure is open or shut, and
   * that is deliberate: the rows are what a press cancels, so they must be the
   * last thing the simulation said and not the state of the panel when it was
   * last opened.
   */
  function paintDeliveries(): void {
    const shown = deliveries !== undefined && deliveries.total > 0 ? deliveries : undefined;
    deliveriesBlock.hidden = shown === undefined;
    if (shown === undefined) {
      for (const row of deliveryRows) {
        row.element.hidden = true;
        row.orderId = undefined;
      }
      deliveriesCount.textContent = '';
      deliveriesMore.textContent = '';
      deliveriesMore.hidden = true;
      delete deliveriesBlock.dataset['pending'];
      return;
    }

    // The whole list and what all of it would refund, never the rows drawn: a
    // header that counted its own rows would tell a player with nine purchases
    // out that they have three, and understate the money by the same margin.
    deliveriesCount.textContent = t(HUD_MESSAGE_KEY.buildDeliveriesCount, {
      count: shown.total,
      total: localizer.formatNumber(shown.refundableMinorUnits),
    });
    // On the block rather than on the panel, which is the whole difference
    // between this surface and the queue's: `.hud-build[data-queued]` exists
    // because the queue block has to be paid for out of the catalogue's floor,
    // and nothing here has to be paid for at all. Kept as a data attribute so a
    // test can ask how many deliveries the panel was told about without reading
    // translated text.
    deliveriesBlock.dataset['pending'] = String(shown.total);

    for (const [index, row] of deliveryRows.entries()) {
      const delivery = shown.deliveries[index];
      if (delivery === undefined) {
        row.element.hidden = true;
        row.orderId = undefined;
        continue;
      }
      row.orderId = delivery.orderId;
      row.element.hidden = false;
      row.label.textContent = formatPendingDeliveryText(
        t,
        delivery,
        localizer.formatNumber(delivery.paidMinorUnits),
      );
      // Which delivery this row is aimed at, so a test can assert *which* one a
      // control cancels rather than only that a control exists. The same job
      // `.hud-build__queue-row`'s `data-order` does.
      row.element.dataset['delivery'] = delivery.orderId;
      // Three buttons reading "Cancel" are one control repeated, to a screen
      // reader and to anything that queries by accessible name. Two deliveries
      // of the same material and quantity do produce the same name, and that is
      // honest rather than a defect: unlike two build orders, which sit on
      // different tiles, two such purchases are interchangeable -- cancelling
      // either refunds the same figure and leaves the same list.
      row.cancel.element.setAttribute(
        'aria-label',
        `${t(HUD_MESSAGE_KEY.buildDeliveryCancel)}: ${row.label.textContent}`,
      );
    }

    // How many are behind the last row, and no control to reach them: the rows
    // are the deliveries landing soonest, so they are the ones whose refunds are
    // about to stop being available, and the rest come into view as those land.
    const unlisted = Math.max(0, shown.total - shown.deliveries.length);
    deliveriesMore.textContent = unlisted === 0 ? '' : t(HUD_MESSAGE_KEY.buildDeliveriesMore, { count: unlisted });
    deliveriesMore.hidden = unlisted === 0;
  }

  // ---- what is still coming (#348) ----------------------------------
  /*
   * The queue block, and why it exists at all.
   *
   * Before #348 there was nothing here to show. Every `assigned` order started
   * on the tick it was assigned and every `in-progress` order advanced on every
   * scheduled tick, so a twelve-segment run finished in the time one wall takes
   * -- there was no queue to look at, only a brief flicker. #348 made the crew
   * the constraint, and `tests/unit/construction-crew-capacity.test.ts` measures
   * what that costs: the same run finishes at tick 730 rather than 70. A queue
   * became a real thing a player waits on, and **nothing on screen said one
   * existed**.
   *
   * So this block does two things that used to be impossible, and the second is
   * the one the repository has been carrying as a gap. It says what is coming --
   * how many, and which one the crew is on. And it names each order, which is
   * what lets a player *aim*: `CancelBuildOrder` takes an `orderId`, ids reach
   * this thread only through the build-queue projection, and until they did the
   * only control that could take a wall back was `Undo` -- one transaction, last
   * in first out. Cancelling the third order of a twelve-segment run is a
   * different request, and this is where it is made.
   *
   * `BUILD_QUEUE_ROW_LIMIT` carries the height measurement and the argument for
   * showing the head of the queue rather than all of it.
   */
  let queue: HudBuildQueueViewModel | undefined;

  const queueCount = valueText('', 'hud-build__queue-count');
  const queueList = element('div', { className: 'hud-build__queue-list' });
  /*
   * `hud-build__queue-more` as well as `hud-build__note`, and the extra class is
   * load-bearing rather than descriptive.
   *
   * `.hud-build__note` is given `display: -webkit-box` under
   * `max-height: 700px` in `hud.css`, to clamp the arm hint to one line -- and an
   * author `display` beats the user agent's `[hidden] { display: none }`. So
   * without a class to hang a rule on, `queueMore.hidden = true` would still lay
   * this line out at every short viewport. It is the same trap
   * `.hud-build__buy:not([hidden])` closes, and it is closed here in the other
   * direction because the class it has to beat is shared.
   */
  const queueMore = eyebrowText('', 'hud-build__note hud-build__queue-more');

  /**
   * One pooled row: what the order is, what it is waiting for, and the one
   * control that withdraws it.
   *
   * The label is a *readout* and the button is the control, rather than the whole
   * row being one button. A row that was itself a button would be a full-width
   * destructive control whose action a player has to infer from the fact that
   * pressing things usually selects them -- and this one does not select. The
   * button says "Cancel", and its accessible name says which order, because
   * three buttons all reading "Cancel" are three identical controls to a screen
   * reader.
   */
  interface QueueRow {
    readonly element: HTMLElement;
    readonly label: HTMLSpanElement;
    readonly state: HTMLSpanElement;
    readonly cancel: ActionButton;
    /** The order this row currently names, or `undefined` while it is hidden. */
    orderId: string | undefined;
  }

  const queueRows: readonly QueueRow[] = Array.from({ length: BUILD_QUEUE_ROW_LIMIT }, (): QueueRow => {
    const label = valueText('', 'hud-build__queue-label');
    const state = eyebrowText('', 'hud-build__queue-state');
    const row: QueueRow = {
      element: element('div', { className: 'hud-build__queue-row' }),
      label,
      state,
      cancel: createActionButton({
        label: t(HUD_MESSAGE_KEY.buildQueueCancel),
        onActivate: () => {
          // Read at press time, not captured at construction: the row is pooled
          // and names whichever order the last publication put in it. A captured
          // id would cancel whatever was here two seconds ago, which is the
          // exact defect a pooled row exists to avoid paying for with
          // allocations.
          const { orderId } = row;
          if (orderId === undefined) return;
          options.onCancelOrder(orderId);
        },
      }),
      orderId: undefined,
    };
    row.element.append(
      element('div', { className: 'hud-build__queue-text', children: [label, state] }),
      row.cancel.element,
    );
    row.element.hidden = true;
    queueList.append(row.element);
    return row;
  });

  const queueSection: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.buildQueue),
    // Collapsed when it appears, for the reason `BUILD_QUEUE_ROW_LIMIT` gives:
    // a queue then costs this panel a header and a count, and costs it a list
    // only when the player asks for one.
    collapsed: true,
    trailing: queueCount,
    onToggle: (collapsed) => {
      queueSection.setCollapsed(collapsed);
      // Opened, the rows are below the panel's fold at the narrow viewports --
      // the panel is sized to its arrival content and this list is not part of
      // it -- so opening scrolls them into view. Exactly what `paintBuy` does
      // for the buy row, and for the same reason: a disclosure that reveals a
      // control the player cannot see has not revealed it.
      if (!collapsed) queueSection.element.scrollIntoView({ block: 'nearest' });
    },
  });
  queueSection.element.classList.add('hud-build__queue');
  queueSection.body.append(queueList, queueMore);

  /**
   * Draws the queue, or draws nothing.
   *
   * **Nothing is the arrival state and it must cost nothing.** The panel's
   * always-visible budget at 900x600 is 7.8px (`buyToggle`), so a block that
   * said "nothing is queued" would be permanent furniture bought with height
   * this panel does not have -- and it would be furniture saying the least
   * interesting thing it could say. The Rooms panel's needs readout draws no
   * block for a prison whose rooms are all finished, for the same reason and
   * with the same measurement behind it.
   *
   * `hidden`, not an empty box: a laid-out empty block still takes its gap and
   * its border.
   */
  function paintQueue(): void {
    const shown = queue !== undefined && queue.total > 0 ? queue : undefined;
    queueSection.element.hidden = shown === undefined;
    if (shown === undefined) {
      for (const row of queueRows) {
        row.element.hidden = true;
        row.orderId = undefined;
      }
      queueCount.textContent = '';
      queueMore.textContent = '';
      delete panel.element.dataset['queued'];
      return;
    }

    // The whole queue and how much of it is moving, never the row count: a
    // header that counted the rows it drew would tell a player with thirty
    // queued walls that they have three.
    queueCount.textContent = t(HUD_MESSAGE_KEY.buildQueueCount, {
      count: shown.total,
      started: shown.started,
    });
    /*
     * On the *panel*, not on the block, because it is what `hud.css` keys the
     * catalogue's floor on -- and that floor is where the 45px this block costs
     * actually comes from.
     *
     * Measured on the assembled page, where the rail also holds the save panel:
     * with a queue and this block collapsed, the panel was 15px over its box at
     * 1280x720 and 37px over at 900x600, and the block's own header ended 14px
     * and 37px **below the panel's unscrolled fold**. That is #174 re-opened --
     * a control laid out where the player cannot see it, with nothing having
     * scrolled -- and it is invisible in `ui-shell.spec.ts`'s harness, whose
     * aside slot is empty and which therefore hands this panel 128.7px more rail
     * than the application ever does. See `.hud-build[data-queued]` in
     * `hud.css` for what pays for it.
     */
    panel.element.dataset['queued'] = String(shown.total);

    for (const [index, row] of queueRows.entries()) {
      const order = shown.orders[index];
      if (order === undefined) {
        row.element.hidden = true;
        row.orderId = undefined;
        continue;
      }
      row.orderId = order.orderId;
      row.element.hidden = false;
      row.label.textContent = formatBuildQueueOrderText(t, order);
      row.state.textContent = t(buildOrderStateLabelKey(order.state));
      // The order id on the row, so a test can assert *which* order a control
      // is aimed at rather than only that a control exists. The same job
      // `.hud-rooms__needs`'s data attributes do.
      row.element.dataset['order'] = order.orderId;
      // The state as a data attribute as well as a word, so `hud.css` can accent
      // the row the crew is actually on -- and so a test can ask which row that
      // is without reading translated text.
      row.element.dataset['state'] = order.state;
      // Three buttons reading "Cancel" are one control repeated, to a screen
      // reader and to anything that queries by accessible name. The visible
      // word stays short because the row is narrow at 375px.
      row.cancel.element.setAttribute('aria-label', `${t(HUD_MESSAGE_KEY.buildQueueCancel)}: ${row.label.textContent}`);
    }

    // How many are behind the last row, and no control to reach them --
    // `BUILD_QUEUE_ROW_LIMIT` argues that out, and the sentence itself points at
    // the control that does take a whole run back.
    const unlisted = Math.max(0, shown.total - shown.orders.length);
    queueMore.textContent = unlisted === 0 ? '' : t(HUD_MESSAGE_KEY.buildQueueMore, { count: unlisted });
    queueMore.hidden = unlisted === 0;
  }

  // ---- the numeric route (secondary) --------------------------------
  const xField: NumberField = createNumberField({
    label: t(HUD_MESSAGE_KEY.buildTileX),
    value: tileX,
    decrementLabel: t(HUD_MESSAGE_KEY.buildStepDown, { field: t(HUD_MESSAGE_KEY.buildTileX) }),
    incrementLabel: t(HUD_MESSAGE_KEY.buildStepUp, { field: t(HUD_MESSAGE_KEY.buildTileX) }),
    onChange: (value) => {
      tileX = value;
      xField.setValue(value);
    },
  });

  const yField: NumberField = createNumberField({
    label: t(HUD_MESSAGE_KEY.buildTileY),
    value: tileY,
    decrementLabel: t(HUD_MESSAGE_KEY.buildStepDown, { field: t(HUD_MESSAGE_KEY.buildTileY) }),
    incrementLabel: t(HUD_MESSAGE_KEY.buildStepUp, { field: t(HUD_MESSAGE_KEY.buildTileY) }),
    onChange: (value) => {
      tileY = value;
      yField.setValue(value);
    },
  });

  const edgeChoice: ChoiceGroup = createChoiceGroup({
    legend: t(HUD_MESSAGE_KEY.buildEdge),
    options: buildEdgeChoiceOptions(t),
    selectedId: edge,
    onSelect: (id) => {
      edge = id as HudBuildEdge;
      edgeChoice.setSelected(id);
    },
  });

  const submit: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.buildSubmit),
    disabled: selectedId === undefined,
    onActivate: () => {
      const intent = readSelection();
      if (intent === undefined) return;
      options.onPlace(intent);
    },
  });

  // Folded by default: it is the fallback route, and an open panel of number
  // fields would read as the way you are meant to build.
  const coordinates: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.buildCoordinates),
    collapsed: true,
    onToggle: (collapsed) => coordinates.setCollapsed(collapsed),
  });
  // Named, for the reason `.hud-build__arm` and `.hud-build__catalogue` are:
  // a selector has to be able to say *which* section it means. It used to be
  // findable as "the panel's last `.ui-section`", and the queue block (#348) is
  // appended after it -- so `.last()` now resolves to a section that is `hidden`
  // whenever nothing is queued. Three assertions in
  // `tests/browser/app-shell.spec.ts` were reaching this header that way and
  // timed out clicking an invisible one; they name the class now.
  coordinates.element.classList.add('hud-build__coordinates');
  coordinates.body.append(
    eyebrowText(t(HUD_MESSAGE_KEY.buildCoordinatesHint), 'hud-build__note'),
    element('div', { className: 'hud-build__coords', children: [xField.element, yField.element] }),
    edgeChoice.element,
    submit.element,
  );

  function paintPlacement(): void {
    // The rule itself is in `edgeChooserShown`, which `readSelection` also
    // reads. It was written out here and nowhere else, which is how a hidden
    // chooser and a submitted edge came to disagree (#531).
    edgeChoice.element.hidden = !edgeChooserShown(selectedBuildable(), removing);
  }
  paintPlacement();

  // Collapsible, because the panel and the thing it operates on compete for
  // the same screen. At 375px it covers most of the world, and the whole
  // interaction is now "point at the world" -- so folding it to its header
  // while placing is not a nicety. Arming survives the fold: the tool is
  // still yours, you just want to see what you are doing.
  //
  // That paragraph was a claim about a control that did nothing for several
  // releases. `createPanel` folds a panel by setting `hidden` on its body, and
  // `.hud-build > .ui-panel__body`'s own flex `display` in `hud.css` outranks
  // the user agent's `[hidden] { display: none }` -- so pressing "Collapse"
  // stamped `data-collapsed`, announced `aria-expanded="false"` and left the
  // body exactly where it was. Fixed in `primitives.css`
  // (`.ui-panel > .ui-panel__body[hidden]`) and now asserted against the body's
  // *box* in `tests/browser/ui-shell.spec.ts`, because an assertion on the
  // attribute agreed with the defect.
  let panelCollapsed = false;
  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.buildTitle),
    icon: 'build',
    className: 'hud-build',
    collapse: {
      collapseLabel: t(HUD_MESSAGE_KEY.panelCollapse),
      expandLabel: t(HUD_MESSAGE_KEY.panelExpand),
      collapsed: false,
      onToggle: () => {
        panelCollapsed = !panelCollapsed;
        panel.setCollapsed(panelCollapsed);
      },
    },
  });
  panel.body.append(
    catalogue.element,
    element('div', {
      className: 'hud-build__map',
      children: [
        // Two buttons in one row rather than two rows: the row is
        // `--tap-target` tall either way, so the buy disclosure joins the
        // panel at no cost to the height budget issue #174 closed.
        element('div', {
          className: 'hud-build__actions',
          children: [armButton.element, removeButton.element, buyToggle.element],
        }),
        targetBlock,
        armHint,
        buyRow,
      ],
    }),
    coordinates.element,
    // Last in the body, so a queue that appears moves nothing above it: the arm
    // button, the target readout and the hint stay exactly where the player's
    // finger left them, and the panel grows downward into its own scroll.
    queueSection.element,
  );
  paintCatalogue();
  paintArmed();
  paintBuy();
  paintQueue();
  paintDeliveries();

  function readSelection(): BuildPanelIntent | undefined {
    const buildable = selectedBuildable();
    // A removal names no object type, so it is the one intent this panel can
    // read with nothing selected -- and it has to be, or a player whose only
    // mistake was placing the single row in an empty catalogue could not undo it.
    if (buildable === undefined) {
      return removing
        ? {
            definitionId: '',
            x: tileX,
            y: tileY,
            edge: intentEdge(undefined, true, edge),
            placesObject: false,
            removing: true,
          }
        : undefined;
    }
    return {
      definitionId: buildable.definitionId,
      x: tileX,
      y: tileY,
      // A buildable that is not edge geometry still reports an edge, because
      // the command carries one shape -- but it reports the default rather than
      // the retained one, because the control that holds the retained one is not
      // on screen (#531). `intentEdge` is where that is decided, and it is the
      // same predicate `paintPlacement` hides the control with.
      edge: intentEdge(buildable, removing, edge),
      // Which of the two placement commands this row needs. A shape fact the
      // catalogue carried in, exactly like `occupiesEdge` -- the panel does not
      // decide it and cannot derive it, because what a buildable places is
      // simulation content the HUD may not read.
      placesObject: buildable.placesObject === true,
      removing,
    };
  }

  function setTarget(target: BuildPanelTarget | undefined): void {
    targetValue.textContent = formatBuildTargetText(t, target);
    if (target === undefined) {
      delete targetBlock.dataset['target'];
      return;
    }
    targetBlock.dataset['target'] = `${target.x},${target.y},${target.edge},${target.segments}`;
  }

  return {
    element: panel.element,
    // Every control that issues a command, which is now three kinds of them:
    // the numeric route's submit, the buy button, and one cancel per pooled
    // queue row. The rows are pooled precisely so that this list is fixed at
    // mount -- the HUD's busy group has `add` and no `remove`.
    controls: [
      submit.element,
      buySubmit.element,
      ...queueRows.map((row) => row.cancel.element),
      ...deliveryRows.map((row) => row.cancel.element),
    ],
    submitControl: submit.element,
    purchaseControl: buySubmit.element,
    getSelection: readSelection,
    isArmed: () => armed,
    isRemoving: () => removing,
    setTarget,
    setBuildQueue(next: HudBuildQueueViewModel | undefined): void {
      queue = next;
      paintQueue();
    },
    setPendingDeliveries(next: HudPendingDeliveriesViewModel | undefined): void {
      deliveries = next;
      paintDeliveries();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
      // The queue goes with the tab. Nothing refreshes it from another tab --
      // the host only asks while this one is showing -- so a block left behind
      // would be a list of ids that were true when the player walked away, and
      // every row in it a control aimed at an order that may already be a wall.
      if (!visible && queue !== undefined) {
        queue = undefined;
        paintQueue();
      }
      // And the deliveries, for the same reason and with money at stake: nothing
      // refreshes them from another tab, so a list left behind would be rows
      // promising refunds that may already have been delivered.
      if (!visible && deliveries !== undefined) {
        deliveries = undefined;
        paintDeliveries();
      }
      // Leaving the tab must hand the pointer back to the camera. A tool that
      // stayed armed behind a hidden panel would swallow every click on a
      // world the player thought they were only looking at.
      if (!visible && armed) {
        armed = false;
        // The mode leaves with the tab too. Coming back to a panel whose
        // "Remove" was still latched would hand the player a pointer that
        // deletes things they cannot see having armed.
        removing = false;
        paintArmed();
        paintBuy();
        options.onArm(false, selectedId, false);
      }
    },
  };
}
