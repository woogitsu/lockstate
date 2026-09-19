import type { LocalizationKey } from '../../content/localization';
import { deriveSimulationMessageKey } from '../../content/simulation-message-keys';
import type { MessageParameters } from '../../services/localization/format';
import { freshUnfurnishedPrison, pressAffordabilityVerdict, purchasePreviewMinorUnits, sellBackPreviewMinorUnits } from '../affordability';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { createChoiceGroup, type ChoiceGroup, type ChoiceOption } from '../primitives/choice-group';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { describeBy, element, eyebrowText, nextUiId, undescribeBy, valueText } from '../primitives/dom';
import { createListRow, type ListRow } from '../primitives/list-row';
import { createNumberField, type NumberField } from '../primitives/number-field';
import { createPanel } from '../primitives/panel';
import { rovingTabStop } from '../primitives/roving-focus';
import { bindRovingFocusKeydown } from '../primitives/roving-focus-keydown';
import { HUD_MESSAGE_KEY } from './messages';
import { assignPooledRows } from './pooled-row-binding';
import { toggleRemovalMode } from './tool-arming';
import {
  HUD_BUILD_EDGES,
  HUD_DEFAULT_BUILD_EDGE,
  type HudBuildEdge,
  type HudBuildableViewModel,
  type HudBuildOrderViewModel,
  type HudBuildQueueViewModel,
  type HudBuildViewModel,
  type HudCountsViewModel,
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
 * What has already been bought and has **not** arrived is not in that
 * disclosure, and since 2026-08-31 (issue #703 ruling 2) it is not in it in
 * either direction: the spend and the `Cancel` that reverses it are laid out on
 * the panel itself, because #640 spends the player's money at a placement press
 * and a charge nobody ordered cannot live behind a control nobody presses. See
 * `deliveriesBlock` in `createBuildPanel`.
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
   * panel already holds. `edge` stays populated for such a row because the field
   * has one shape -- but since #531 it carries `HUD_DEFAULT_BUILD_EDGE` rather
   * than the panel's retained choice, because the chooser is not on screen for
   * one. See `intentEdge`. The reason given here used to be *"the simulation
   * ignores it for anything that is not a wall"*, and that is now too narrow:
   * `occupiesTileEdge` is the rule, and a door is not a wall.
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
   * a removal names no object type -- the consumer ignores it exactly as
   * `remove-object` carries no `edge` at all. That comparison read *"as the
   * simulation ignores `edge` for anything that is not a wall"*, which was too
   * narrow even then: what the simulation ignores an edge for is anything
   * `occupiesTileEdge` says is not edge geometry, and a door is not a wall.
   */
  readonly removing: boolean;
}

/**
 * What one press of the buy control asks for: ids and numbers only.
 *
 * Reused for the sell control below rather than declared a second time with
 * an identical shape: both name a material and a quantity and nothing else,
 * and a second interface would be one more thing to keep in step with this
 * one for no distinction either control's consumer reads.
 */
export interface BuildPanelPurchaseIntent {
  readonly itemId: string;
  readonly quantity: number;
}

/**
 * Where the pointer is currently aimed, for the panel's readout.
 *
 * **Two shapes, because two tools aim through this one line (#550).** A wall is
 * laid on a tile *edge* and a drag along it covers a run, so an edge aim carries
 * both. An object is placed on -- or taken off -- a *tile*: there is no edge to
 * name and no run to count, so a tile aim carries neither and the readout says
 * the tile alone.
 *
 * Optional fields rather than a discriminated union, deliberately. The union
 * would have `tsc` decide which arm a reader is holding, which is this tree's
 * usual preference (`HudObjectGesture`) -- but it would also rename the shape
 * every existing producer already builds, including one in `tests/browser/`,
 * to gain a check that `edge === undefined` already makes. The absent edge *is*
 * the discriminant, and `exactOptionalPropertyTypes` is on, so a producer
 * cannot pass `edge: undefined` and pretend otherwise.
 */
export interface BuildPanelTarget {
  readonly x: number;
  readonly y: number;
  /** The edge a wall would go on, or absent because this aim is at a tile. */
  readonly edge?: HudBuildEdge;
  /** How many edges the pending gesture covers. `1` for a tap, absent for a tile aim. */
  readonly segments?: number;
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
   * Withdraw **one** pending order, named by its own id, at the revision this
   * row's own last publication read for it (ADR 0107).
   *
   * The id, the revision and nothing else. The panel does not know that a
   * `CancelBuildOrder` command exists, any more than it knows
   * `PurchaseMaterials` does, or that `expectedRevision` is compared against
   * anything -- it knows that a row it drew named an order at a revision and
   * that the player pressed that row.
   */
  readonly onCancelOrder: (orderId: string, revision: number) => void;
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
  /**
   * Sell the selected buildable's material, in the quantity the stepper
   * shows, back to the depot at a loss (ADR 0075 decision 3, invoked by ADR
   * 0096 decision 3(b)).
   *
   * Shares `onPurchase`'s stepper and its `BuildPanelPurchaseIntent` shape --
   * selling names the same material and the same quantity a purchase would,
   * out of the same disclosure.
   */
  readonly onSell: (intent: BuildPanelPurchaseIntent) => void;
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
  /** The sell button, for the same reason `purchaseControl` exists: a refused sale is reported on it. */
  readonly sellControl: HTMLButtonElement;
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
   *
   * That last clause was written while this block lived inside the buy
   * disclosure; since 2026-08-31 (issue #703 ruling 2) it does not, and the
   * silence matters *more* rather than less -- a line saying no money is in
   * transit would now be permanent furniture on the panel itself. See
   * `deliveriesBlock` in `createBuildPanel`.
   */
  setPendingDeliveries(deliveries: HudPendingDeliveriesViewModel | undefined): void;
  /**
   * The two treasury figures the buy button's availability is judged
   * against (issue #772): `treasuryMinorUnits` and `roomCapacity`, published
   * on every `simulation/status-counts` tick and passed straight through --
   * the panel decides the comparison (`pressAffordabilityVerdict`, the same
   * one `src/main.ts` judges the press itself with), this line decides
   * nothing.
   *
   * The full `HudCountsViewModel` rather than two bare numbers, because it is
   * the type the composition root already produces every tick and a fresh
   * two-field type here would be a second shape for the same publication to
   * be translated into on its way from `hud.ts` to this panel.
   */
  setTreasury(counts: HudCountsViewModel): void;
  /**
   * Puts the panel's tool down, as `Escape` on the world asks (issue #959).
   *
   * Exactly the transition leaving the tab already makes -- both flags off,
   * repaint, one `onArm(false, ...)` report -- rather than a second answer to
   * "what does a disarmed Build panel look like". A press that finds the
   * panel holding nothing does nothing at all.
   */
  standDown(): void;
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
 * Which sentence the armed tool's one hint line carries (issue #904).
 *
 * **The line described the wall gesture for every row in the catalogue, and
 * nineteen of the twenty-one place an object on a tile instead.** Arming a Bed,
 * a Toilet or a Storage Rack read *"Click a tile edge to place a wall. Drag
 * along it to lay a run."* -- two instructions, neither of which does anything
 * for such a row: `ObjectTool.place` is one press on one tile
 * (`src/ui/object-tool.ts`), and the dragged-run producer is
 * `BuildTool.attachOrders`, which lays walls and nothing else.
 *
 * Keyed on `placesObject`, which is the same field `HudPlaceIntent`'s consumer
 * in `hud.ts` branches on to send `place-object` rather than
 * `place-build-order`. That is the point of reading it here as well: the
 * sentence and the command are then two readings of one fact instead of two
 * rules that can disagree, which is the argument `edgeChooserShown` above
 * makes about a hidden control and a submitted value.
 *
 * Removal wins over both, for the reason it hides the edge chooser: it names no
 * buildable at all, so the selected row decides nothing about it.
 *
 * Exported and pure so that the choice is checkable without a DOM, exactly as
 * the two functions above are -- `paintArmed` is otherwise reachable only
 * through a mounted panel, and the wrong sentence there is invisible to every
 * headless test.
 */
export function armedHintKey(buildable: HudBuildableViewModel | undefined, removing: boolean): LocalizationKey {
  if (removing) return HUD_MESSAGE_KEY.buildRemoveHint;
  return buildable?.placesObject === true ? HUD_MESSAGE_KEY.buildArmHintObject : HUD_MESSAGE_KEY.buildArmHint;
}

/**
 * What one catalogue row's own label says, price included (issue #901).
 *
 * **Every one of the 21 rows used to show zero digits.** The price existed
 * only behind a press on the buy disclosure (`hud.build.buy-submit`); this is
 * where it is folded into the row itself instead, on the shape
 * `hud.security.hire` already shipped for the Security tab -- see the
 * commentary on `HUD_MESSAGE_KEY.buildCatalogueRowPrice` in `messages.ts` and
 * on the two locale entries in `default-locale-en.ts` for the full
 * verification: what the two keys say, and the code that makes each true.
 *
 * Branched on `buildable.placesObject`, the same fact `armedHintKey` above
 * branches its own two sentences on: `true` (nineteen rows) is one press, one
 * tile, one command (`ObjectTool.place`), so a flat price stays true; `false`
 * (`wall-brick`, `door-wooden`) reaches the drag-a-run route
 * (`BuildTool.place`), so the price must name its unit or a run of several
 * would be underquoted by the same factor.
 *
 * `total` arrives pre-formatted, exactly as `formatBuildQueueOrderText` and
 * `formatPendingDeliveryText` below take theirs: number formatting is
 * `HudLocalizer.formatNumber`'s job, which a function taking only `Translate`
 * has no access to. `undefined` means the buildable's material has no price
 * at all (`HudBuildableViewModel.material` is absent) -- the row still needs a
 * label, and a row naming no price is honest about a material `#29` has not
 * priced, rather than a bug to route around.
 *
 * Pure and exported for the reason `armedHintKey` above is: the default
 * Vitest environment is `node` (`docs/TESTING.md`), so nothing headless can
 * mount the panel, and "what a row's price sentence says" is exactly the
 * claim that has to be assertable over real text from a real catalog.
 */
export function buildCatalogueRowLabel(
  t: Translate,
  buildable: HudBuildableViewModel,
  total: string | undefined,
): string {
  const name = t(buildable.labelKey);
  if (total === undefined) return name;
  return t(
    buildable.placesObject
      ? HUD_MESSAGE_KEY.buildCatalogueRowPrice
      : HUD_MESSAGE_KEY.buildCatalogueRowPriceSegment,
    { buildable: name, total },
  );
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
  // An aim with no edge is an aim at a tile, which is what the object tool
  // reports for both of its modes (#550). It gets its own template rather than
  // the edge one with a blank `{edge}`: see `buildTargetTile`.
  if (target.edge === undefined) return t(HUD_MESSAGE_KEY.buildTargetTile, { x: target.x, y: target.y });
  const edge = target.edge;
  return (target.segments ?? 1) > 1
    ? t(HUD_MESSAGE_KEY.buildTargetRun, {
        x: target.x,
        y: target.y,
        edge: t(edgeLabelKey(edge)),
        count: target.segments ?? 1,
      })
    : t(HUD_MESSAGE_KEY.buildTargetValue, { x: target.x, y: target.y, edge: t(edgeLabelKey(edge)) });
}

/**
 * How many queued orders the block holds a row for.
 *
 * **Sixty-four, and it is a measurement plus an argument -- as three was, and
 * both halves changed for a reason each (#862).**
 *
 * ### What three was, and what falsified it
 *
 * The measurement was the panel's, and it is still the tightest in the
 * interface. `buyToggle`'s comment records it: at 900x600, Build tab,
 * coordinates folded -- the state a player arrives in -- the panel's body holds
 * 291.2px of content in a 291.2px box and there is **7.8px** between the last
 * section's bottom edge and the fold. So an always-visible list of rows was
 * never on the table; a collapsed section of its own is 45px, which is already
 * six times the whole budget. That is why this block is `hidden` while nothing
 * is queued -- an empty queue is the state a player arrives in, and the arrival
 * height is therefore byte-identical to what #174 left -- and why it is
 * *collapsed* when it appears, so a queue costs a header and not a list until
 * the player asks for one. **None of that is withdrawn.**
 *
 * What is withdrawn is the step from that measurement to a *row count*. The
 * height a list costs the panel is a property of the list's **box**, not of how
 * many rows are inside it, and `.hud-build__queue-list` in `hud.css` now bounds
 * that box directly -- three rows tall, which is the 148px the opened list
 * measured at before this change, with `overflow-y: auto` under it. So the
 * opened block costs the panel exactly what it cost when this number was three,
 * at every viewport, and the rows past the third are reached by scrolling the
 * list rather than by not existing. That is the same mechanism
 * `.hud-build__list` has always used for the catalogue one section up, in this
 * same panel, and `tests/browser/app-shell.spec.ts` asserts that list is
 * scrollable in the arrival state for exactly this reason: rows a player cannot
 * reach are what a donation costs, and `overflow-y` is the whole of what makes
 * them reachable (#174).
 *
 * The argument was that the queue is the crew's *schedule* and this list is its
 * head -- row one being built, row two next, row three after that -- so an order
 * thirteenth in line is not one a player needs to reach, `Undo` being the
 * control for "I have changed my mind about that whole run". **Measured, that
 * is what it cost:** with fourteen orders placed, three had a control and
 * eleven had none at any of the six viewports the browser suite visits, because
 * eleven of them had no row in the DOM at all. `Undo` is not a substitute --
 * it pops the transaction the run was drawn in, so the player who wants one
 * wall of fourteen back has to take all fourteen. ADR 0031 decision 4 named
 * itself *"the decision most open to being overruled"* and named the trigger:
 * *"If that proves to be the common case rather than the rare one"*. A batch of
 * orders is the common case -- it is what a drag produces, and #348 is why the
 * batch then sits there for hundreds of ticks.
 *
 * ### Why sixty-four
 *
 * Because that is how many orders **one gesture can place**.
 * `MAX_RUN_SEGMENTS` in `src/rendering/build/edge-picking.ts` clamps a dragged
 * wall run to 64 segments and one segment is one `PlaceBuildOrder`, so 64 is
 * the longest queue a player can produce without meaning to produce two. It is
 * not imported here -- `src/ui/hud/` may not import from `src/rendering/`
 * (`AGENTS.md` boundary 1) -- and the two numbers agreeing is asserted by
 * `tests/unit/ui-hud-build-panel.test.ts`, which may import both, exactly as
 * `MAX_ZONE_SIDE_TILES` states its own agreement with the simulation's ceiling.
 *
 * A queue longer than one gesture still exists, and `hud.build.queue-more`
 * still says how many are behind the last row while `hud.build.queue-count`
 * always states the whole length -- so the panel never implies the queue is
 * shorter than it is, which is the property that made three honest and makes
 * sixty-four honest.
 *
 * **What it costs, measured rather than asserted.** This number is also the
 * projection window `BuildQueueReader` asks for, and `projectBuildQueue` prices
 * each row by walking the whole order book
 * (`ConstructionSystem.previewCancelRefundMinorUnits` -> `demandedQuantityOf`),
 * so the call is O(window x orders). Timed on this container over a real
 * runtime, 200 calls per figure: with 328 orders queued -- the drag
 * `tests/integration/economy-cancel-what-comes-back.test.ts` measures -- one
 * projection costs 0.318ms at a window of 3 and **3.469ms** at 64; with 64
 * orders queued it is 0.250ms against 0.739ms. The reader is driven by the
 * worker's clock heartbeat at up to about four a second (ADR 0086 section 3),
 * so the worst case a player can reach is roughly 14ms of worker time per
 * second, and it drains as the queue does. That is the price of every order in
 * a drag having a control, and it is worth paying.
 *
 * ### What has not changed: the rows are pooled
 *
 * Created once here, repainted per publication -- and that is not only an
 * allocation choice. Each row's cancel button joins the HUD's busy group, and
 * `createBusyGroup` has `add` and no `remove`: a block that built a row per
 * order would grow that group without bound over a session and keep every dead
 * button in it. A **fixed** pool is what closes that, at any size, which is why
 * this number could move at all -- 64 buttons joined once at construction is
 * bounded in exactly the way 3-per-publication would not be.
 */
export const BUILD_QUEUE_ROW_LIMIT = 64;

/**
 * How long a place in the queue list stays blank after the order it named
 * leaves, before another order may appear there (#860).
 *
 * ## Why there is a number here at all
 *
 * Because a place in a list is what a player aims a destructive control by, and
 * this list is rewritten about four times a second. `assignPooledRows` keeps
 * every surviving order in the place it arrived in, which closes the case where
 * the pool re-points a row -- and **that half alone was measured failing.** The
 * pool is `BUILD_QUEUE_ROW_LIMIT` places over a queue that loses its head about
 * every 625ms of wall clock at 4x, so inside a human decision the order a
 * player aimed at has usually left the window altogether; the next order then
 * took the place their pointer was already over. Two presses of three still
 * cancelled a different wall.
 *
 * So a freed place is held blank, and this is how long for.
 *
 * ## Where the figure comes from, and what is *not* measured about it
 *
 * **Its lower bound is measured and its value is a judgement.** The browser run
 * of 2026-09-03 pressed at instrumented decision delays of 0ms, 250ms and
 * 600ms; every press at 0ms was aimed correctly and every press at 250ms and
 * 600ms was not, and the elapsed time from the read to the click was larger
 * than the nominal delay by the probe's own round trips -- about 450ms and
 * 800ms. So the window has to be **at least** ~800ms to cover what has actually
 * been seen to fail. One second is that, rounded up, and it is a claim about how
 * long a person takes to read a short label and press the control beside it,
 * which nothing in this repository has measured.
 *
 * It is deliberately **not** derived from `CLOCK_STATE_PUBLISH_INTERVAL_MS`.
 * That constant is how fast the panel is redrawn; this one is how slowly a
 * person acts, and tying the second to the first would make a rendering
 * decision govern a safety one. Two publications' worth of blankness -- 500ms --
 * was tried on paper and is inside the 800ms already observed to fail.
 *
 * ## What it costs, and why that cost needs no player-facing sentence
 *
 * While the queue churns the block draws fewer than its three rows: a place is
 * blank for a second after each of its orders leaves. The count in the header
 * and the "and N more" line are both counted against the rows actually drawn,
 * so nothing on screen claims otherwise, and a blank row promises nothing --
 * which is what keeps this a paint rule rather than a refusal needing a
 * sentence of its own (`AGENTS.md` exclusion 4).
 */
export const BUILD_QUEUE_ROW_SETTLE_MS = 1_000;

/**
 * What one queued row says it is, and where -- and, since the owner's ruling
 * of 2026-09-02, what cancelling it would give back.
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
 *
 * `total` is a formatted string rather than `order.cancelRefundMinorUnits`
 * itself, on the same terms `formatPendingDeliveryText`'s own `total`
 * parameter is: number formatting is `HudLocalizer.formatNumber`'s job, which
 * this function has no access to and must not reimplement, and the delivery
 * row two lines above this one in the locale
 * (`hud.build.delivery`, "{total} back") sets the pattern this row now
 * follows for the same money.
 */
export function formatBuildQueueOrderText(t: Translate, order: HudBuildOrderViewModel, total: string): string {
  return t(HUD_MESSAGE_KEY.buildQueueOrder, {
    buildable: t(order.labelKey ?? HUD_MESSAGE_KEY.buildQueueUnnamed),
    x: order.tile.x,
    y: order.tile.y,
    edge: t(edgeLabelKey(order.edge)),
    total,
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
 * How many pending deliveries the panel lists at once.
 *
 * **Corrected 2026-08-31 (issue #703 ruling 2): this list is no longer inside
 * the buy disclosure**, so the first line of this docblock used to read *"How
 * many pending deliveries the buy disclosure lists at once"* and every
 * measurement below was taken with that disclosure open. The correction at the
 * foot of the block says which of them survived the move and which did not; the
 * count itself is unchanged, and the reason is at the foot too.
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
 * **That last clause is withdrawn as of 2026-08-31 (issue #703 ruling 2), and
 * the correction at the foot of this docblock says what replaced it.** A second
 * way into this panel now exists and the owner opened it: a block may cost the
 * panel height when the *simulation* has something the player has to be told,
 * as long as it costs nothing in the state the panel arrives in. The rule the
 * clause was defending is intact -- nothing here donates from the catalogue --
 * and what it got wrong was treating "nothing at all, ever" as the only price
 * this panel could pay.
 *
 * The rows are **pooled** for both of `BUILD_QUEUE_ROW_LIMIT`'s reasons, and the
 * second is not about allocation: each row's cancel button joins the HUD's busy
 * group, `createBusyGroup` has `add` and no `remove`, and a block that built a
 * row per delivery would grow that group without bound over a session.
 *
 * ---------------------------------------------------------------------------
 *
 * **Corrected 2026-08-31 -- issue #703 ruling 2, and the two halves fare
 * differently.**
 *
 * *"What this block costs the panel when it is not open: nothing at all"* is
 * **withdrawn as a description of a pending delivery** and kept as a
 * description of the arrival state. The block is now a child of
 * `.hud-build__map` rather than of the buy row, so with something pending it
 * costs the panel the whole of its own height; with nothing pending it is still
 * `hidden` and still costs nothing, which is why the arrival figures above are
 * unchanged. The correction beside `deliveriesBlock` in `createBuildPanel`
 * carries the new per-viewport table.
 *
 * *"Three is what fits, and four does not"* **stands, and it is now a floor as
 * well as a ceiling.** Four rows put the last `Cancel` 7.9px below the fold with
 * a full box, which is why the limit exists; and three is already more than fits
 * the visible box at 900x600 now that the block is always laid out -- measured,
 * one of three on screen with 178px of panel overflow. **Lowering it was
 * considered and rejected**: a row that is not drawn is a refund the player
 * cannot reach at all, while a row below the fold is a refund one wheel turn
 * away, and `tests/browser/build-deliveries-outside-the-fold.spec.ts` asserts
 * that turn reaches it. The rows are the deliveries arriving soonest, so the
 * ones drawn are the ones whose refunds stop being available first.
 */
export const PENDING_DELIVERY_ROW_LIMIT = 3;

/**
 * How long a place in the pending-deliveries list stays blank after the
 * purchase it named leaves, before another purchase may appear there.
 *
 * The same figure and the same argument as `BUILD_QUEUE_ROW_SETTLE_MS` one
 * block over, and deliberately the same number rather than a second judgement:
 * both are claims about how long a person takes to read a short label and press
 * the control beside it, and nothing measured here distinguishes the two lists.
 * Read that constant's header for where the ~800ms lower bound comes from and
 * for what about the figure is judgement rather than measurement.
 *
 * **Why this list needed it too**, which issue #877 named and left unmeasured:
 * a delivery leaves the window by *arriving*, `PROCUREMENT_DELIVERY_DELAY_TICKS`
 * apart, and the rows are the three landing soonest -- so the head of this list
 * is replaced on its own schedule with no press from the player, exactly as the
 * queue's is when the crew finishes a wall. What a misfire costs here is a
 * refund of the wrong amount on a purchase the player did not mean to cancel.
 */
export const PENDING_DELIVERY_ROW_SETTLE_MS = BUILD_QUEUE_ROW_SETTLE_MS;

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
  /**
   * The two treasury figures a purchase's affordability is judged against
   * (issue #772), published on every `simulation/status-counts` tick and
   * held here between publications so a quantity change alone can repaint
   * the buy button without waiting for the next one.
   *
   * Zeroed and unfurnished until the first `setTreasury` call -- and since the
   * buy row cannot be open before a session exists to populate it, this default
   * is never rendered.
   *
   * **`EMPTY_HUD_VIEW_MODEL.counts` used to be the reading cited for that
   * default, and it no longer exists** (issue #1191): a HUD that has heard from
   * nobody carries no counts at all, and `hud.ts` withholds this setter rather
   * than passing a fabricated `0` balance through it. The default below is this
   * panel's own, which is what it always effectively was.
   */
  let treasuryMinorUnits = 0;
  /**
   * The published predicate, cached beside the balance it is judged with --
   * not `counts.roomCapacity`, which this panel derived freshness from until
   * 2026-09-15 and which cannot see a room instance registered under a
   * room-catalog id the content registry does not define
   * (`statusCountsSchema.isFreshUnfurnishedPrison`).
   */
  let treasuryFreshUnfurnishedPrison = false;

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
    /*
     * The row's price, **formatted here and computed nowhere here** (issue
     * #1160, constitution article 4).
     *
     * This read
     * `buildable.material.unitPriceMinorUnits * buildable.material.quantityPerPlacement`
     * until 2026-09-14, which is the interface recomputing a finance figure --
     * and recomputing it over the first *purchasable* requirement rather than
     * over all of them, so a buildable naming two materials would have been
     * priced at part of its cost. `placementCostMinorUnits` in
     * `src/simulation/economy/placement-cost.ts` is the simulation's own
     * arithmetic, the composition root runs it, and what arrives here is a
     * number to format. `HudLocalizer.formatNumber` stays the panel's job: ADR
     * 0011 puts number formatting on this side of the boundary and the figure
     * on the other.
     *
     * Formatted once at mount rather than repainted, unchanged: content
     * supplies one price per unit and it never moves
     * (`src/content/procurement-catalog.ts`), and `model.buildables` is itself
     * supplied once at mount and not per snapshot -- see `HudBuildViewModel`.
     * `undefined` for a buildable the simulation cannot price, which
     * `buildCatalogueRowLabel` reads as "no price to state" rather than a bug.
     */
    const total =
      buildable.placementCostMinorUnits === undefined
        ? undefined
        : localizer.formatNumber(buildable.placementCostMinorUnits);
    const row = createListRow({
      icon: 'build',
      label: buildCatalogueRowLabel(t, buildable, total),
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
   *
   * Wired through `bindRovingFocusKeydown` rather than a listener written
   * here: `preventDefault()` alone left the same keystroke free to bubble to
   * `WorldScene`'s `window`-level camera binding, which paid out as six
   * `ArrowDown` presses in this catalogue panning the world underneath the
   * player -- a 2026-09-01 keyboard playtest of the assembled page, recorded
   * on an unmerged research branch at the time of this fix.
   * `rooms-panel.ts` had written the identical listener, with the identical
   * gap, for the identical reason -- so the fix is the shared wiring both now
   * call, not a `stopPropagation()` pasted into each a second time. See that
   * function's own comment for why the cure is *there* and not a wider gate
   * on the camera binding.
   */
  bindRovingFocusKeydown(catalogueList, {
    datasetAttribute: 'buildable',
    order: () => focusRing.visibleIds,
    rows,
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
   * **AMENDED 2026-09-04 (issue #926): that pair fitted the third BUTTON and
   * not the third LABEL, and the paragraph above is left as it stands because
   * it is the claim that was incomplete.** Letting the arm button shrink put
   * it at 76.4px with an 87.9px label, and `primitives.css` had
   * `.ui-action__label { white-space: nowrap }` with no `overflow` above it --
   * so the arm label painted 17.8px outside its own button and 9.8px over
   * *this* control at every viewport 900px wide or wider. Shortening this
   * label further would not have helped: with the icon and `.ui-action`'s
   * padding, the arm label had 18.4px of box to fit in. `hud.css` and
   * `primitives.css` carry the fix and the whole measurement;
   * `tests/browser/ui-build-arm-label-fit.spec.ts` is the gate, because the
   * one this row already had reads the button's own box.
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
      // Arming to remove is arming. The tool stays armed while the mode is on
      // and the world keeps the pointer, so the player presses one control and
      // then presses tiles -- which is the whole gesture on a touch device.
      //
      // And pressing it again stands the tool down. **This line read
      // `armed = removing || armed` until #689**: the sentence above is right
      // on the way in, and on the way out that expression kept whatever `armed`
      // already was, so "Stop removing" handed the player a *placing* tool
      // still holding the pointer. The pair moves together now, in
      // `toggleRemovalMode`, which the Rooms panel's removal control calls too
      // -- the two panels held one defect in two copies of one expression, so
      // the transition has one home.
      const nextArming = toggleRemovalMode({ armed, removing });
      armed = nextArming.armed;
      removing = nextArming.removing;
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

  /*
   * Its own class beside `.hud-build__note`, for the reason
   * `.hud-build__queue-shortfall` has one: a rule has to be able to name *this*
   * note and not the three others in this panel. `hud.css` needs it since #920
   * -- the queued-order sentence is paid for out of this hint's fourth line --
   * and a structural selector (`.hud-build__map > .hud-build__note`) would have
   * meant a rule that silently changes meaning the next time a note joins or
   * leaves this block.
   */
  const armHint = eyebrowText(t(HUD_MESSAGE_KEY.buildArmHint), 'hud-build__note hud-build__arm-hint');

  /*
   * `hud.build.note` -- "An order is queued now and built while the clock
   * runs." -- and the sentence a paused newcomer needs (#920, and the owner's
   * first ruling of 2026-08-30 in #639).
   *
   * ### What this block said until 2026-09-04, and why both directions are kept
   *
   * It said the sentence *"is rendered by nothing"*, had been that way since
   * `67e366e` (2026-08-23) -- which, in moving the submit button into the
   * folded "Enter coordinates" section, deleted the `.hud-build__footer` the
   * sentence shared with it -- and that the owner's ruling *"still does not"*
   * reach the screen *"because this panel has no room for it"*. Every word of
   * that was true when it was written, and the measurement under it was real:
   * PR #647 restored the sentence **unconditionally** in this block, right
   * here below `armHint`, and its own gate found the panel over its box. The
   * renderer was dropped and the table was left where the next reader of #639
   * would look for it. It is kept below rather than overwritten, because it is
   * the claim that was overturned and `docs/AGENT_WORKFLOW.md` §4 asks for the
   * direction to be marked.
   *
   * The table it carried, as it stood -- the sentence appended here, one prison
   * saved, Build tab, nothing scrolled:
   *
   * | viewport | sentence | panel overflow | why |
   * | --- | --- | --- | --- |
   * | 1440x900 | 26.4px, 2 lines | 0 | the catalogue list absorbs it whole |
   * | 1024x768 | 26.4px, 2 lines | 0 | same |
   * | 375x812 | 13.2px, 1 line | 0 | same |
   * | 1280x720 | 26.4px, 2 lines | **4px** | list absorbs 22.4 of 26.4, then hits its floor |
   * | 900x600 | 26.4px, 2 lines | **23px** | list is *already* on its floor and absorbs nothing |
   *
   * ### The measurement that replaces it, and it is worse rather than better
   *
   * Re-taken on 2026-09-04 on the assembled page at `0e614c71` (v0.0.451), the
   * same way -- `New prison`, Build tab, nothing opened, nothing scrolled, the
   * sentence injected here from the test so that both readings come from one
   * tree. **`.hud-build`'s `scrollHeight - clientHeight` with the sentence
   * always laid out, against 0 without it at all five viewports:**
   *
   * | viewport | sentence | panel overflow | then | now |
   * | --- | --- | --- | --- | --- |
   * | 1440x900 | 26.4px, 2 lines | 0 | 0 | unchanged |
   * | 1024x768 | 26.4px, 2 lines | 0 | 0 | unchanged |
   * | 375x812 | 13.2px, 1 line | 0 | 0 | unchanged |
   * | 1280x720 | 26.4px, 2 lines | **27px** | 4px | **the list no longer absorbs any of it** |
   * | 900x600 | 13.2px, clipped | **9px** | 23px | the clamp, and the clamp cuts the half that matters |
   *
   * The 1280x720 row is the one that moved, and the reason is that the
   * catalogue list is now *already* on its two-row floor there: 238x88 on
   * arrival, which is `--hud-build-catalogue-floor` exactly. In the tree the
   * old table was taken on it still had 22.4px of slack to donate. So the
   * always-laid-out placement did not become tunable in the year since -- it
   * got 23px further away, at the viewport `HUD_LAYOUT_VIEWPORTS` puts first.
   * The 900x600 row is the same 9px the old block derived for its clipped
   * variant, so nothing about that viewport is in dispute.
   *
   * ### What this does instead, and why it costs the arrival state nothing
   *
   * **The sentence is laid out only while something is queued.** `paintQueue`
   * owns it, on the one predicate the queue block itself is drawn on
   * (`queue.total > 0`), so:
   *
   *   - **arrival is untouched.** Nothing is queued when a player loads the
   *     game, so this element has no box, and `the Build panel arrives inside
   *     its own fold, with nothing queued (#174)` measures the same panel it
   *     measured before: 0 overflow at all five viewports, "Enter coordinates"
   *     still ending 7.8px inside the fold at 900x600. That is the whole reason
   *     the renderer can exist now when it could not in August -- the 17.2px
   *     against 7.8px the commit message of `445f5465` called *"structurally
   *     impossible"* was arithmetic about the **arrival** state, and this
   *     sentence is no longer in it.
   *   - **it appears in the state #920 is about**, which is the state where the
   *     money has already left the treasury. Act 4 of
   *     `docs/research/2026-09-04-the-first-ten-minutes.md` measured a newcomer
   *     at `24 waiting / 0 being built`, tick `-1`, 1,920 spent, with `/clock/i`
   *     false against the entire laid-out HUD.
   *   - **and it is on screen there without scrolling.** Measured in the queued
   *     state, the sentence's own box against the panel's unscrolled fold:
   *     y=541.3..567.7 of 637.6 at 1280x720, 586.3..612.7 of 817.6 at 1440x900,
   *     553.3..579.7 of 685.6 at 1024x768, 424.9..451.3 of 521.7 at 900x600 and
   *     564.4..577.6 of 717.8 at 375x812. Inside the fold at every one.
   *
   * ### Why here and not beside the queue block
   *
   * Beside the queue block is where `queueShortfall` lives, and its argument --
   * a readout the player must not go looking for is appended beside a fold and
   * never inside one -- is the reason it was the other candidate #920 named.
   * **It was measured and it loses.** Appended immediately after
   * `queueSection.element`, the same sentence lands at y=866.2 of a 637.6 fold
   * at 1280x720, 911.2 of 817.6, 878.2 of 685.6, 699.4 of 521.7 and 876 of
   * 717.8: **below the fold at all five viewports, not one.** The queue block is
   * the last thing in the body and the panel grows downward into its own
   * scroll, so anything after it is past the fold in every state that has a
   * queue in it. The map block is the second thing in the body, which is why
   * the same sentence is visible from here and invisible from there.
   *
   * ### And it is not free here either -- what the first attempt broke
   *
   * `.hud-build__map` ends in the deliveries block (#703 ruling 2), and that
   * block's spend line and **first refund** are guaranteed on screen with
   * nothing opened and nothing scrolled -- the owner's ruling of 2026-08-31,
   * asserted at every viewport by
   * `tests/browser/build-deliveries-outside-the-fold.spec.ts`. In the loaded
   * state it sits right against the panel's fold. Adding this sentence above it
   * and giving nothing back pushed the first refund's Cancel *out*: y=607..651
   * against a fold at 637.6 at 1280x720, and y=478.6..522.6 against 521.7 at
   * 900x600. That went red, which is the gate doing its job, and it is why
   * `hud.css` pays for this sentence out of the arm hint's fourth line rather
   * than out of nothing. The table of what that comes to is there, beside the
   * rule.
   *
   * What still moves: "Enter coordinates" and the queue block's header go down
   * by 13.2px at the viewports where the clamp applies and 26.4px at 900x600.
   * **Both are already below the panel's fold in this state before the note
   * exists** -- coordinates at y=777.2 and the queue header at y=822.2 against
   * a 637.6 fold at 1280x720, on unmodified `main` -- so what moves is content
   * the player already reaches by scrolling, and it moves by one line.
   *
   * (That last fact is worth someone's attention separately: `hud.css`'s
   * `.hud-build[data-queued]` block bought 45px specifically to keep the queue
   * block's header above the fold, and #703's deliveries block has since taken
   * it. Not this branch's to fix, and not caused by it.)
   *
   * ### The two placements that were measured and lost
   *
   * **Beside the queue block**, where `queueShortfall` lives, and which #920
   * names as a candidate: appended immediately after `queueSection.element` the
   * sentence lands at y=776.2 of a 637.6 fold at 1280x720, 821.2 of 817.6,
   * 788.2 of 685.6, 609.4 of 521.7 and 786 of 717.8 -- **below the fold at five
   * of the five short viewports**, in the fold only at 1920x1080. The queue
   * block is the last thing in the body and the panel grows downward into its
   * own scroll, so anything after it is past the fold in every state that has a
   * queue in it.
   *
   * **After the deliveries block**, which costs that block nothing and was the
   * obvious answer to the paragraph above: y=802.5, 847.5, 814.5, 635.8, 799.2
   * against the same folds. Same verdict, same reason.
   *
   * A fold is still refused for the reason it always was: a fold that starts
   * shut is what #627 measured reaching nobody. And a sentence below an
   * unscrolled fold is the same defect wearing a scrollbar.
   */
  const orderNote = eyebrowText(t(HUD_MESSAGE_KEY.buildNote), 'hud-build__note hud-build__order-note');
  /*
   * Hidden until `paintQueue` says otherwise, and `hidden` rather than an empty
   * text node: an empty laid-out line still takes its gap.
   *
   * The class beside `.hud-build__note` is load-bearing rather than
   * descriptive, exactly as `.hud-build__queue-shortfall`'s is, and it is
   * load-bearing **twice** here. `.hud-build__note` is given an author
   * `display` by `hud.css`'s `max-height: 700px` block, which beats the user
   * agent's `[hidden] { display: none }`; and this element takes a second
   * author `display` from that same block's clamp exemption. Both are answered
   * by `.hud-build__order-note[hidden]` in `hud.css`, which is a class and an
   * attribute against one class either way.
   */
  orderNote.hidden = true;

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
    //
    // **Three sentences reach this line since issue #904, not two, and the
    // third is a correction rather than an addition.** `buildArmHint`
    // describes the wall gesture -- an edge click and a dragged run -- and was
    // shown for every row in the catalogue, including the nineteen of twenty-one that place
    // an object on a tile. There is no drag route for those at all
    // (`ObjectTool.place` is one press, one tile) and they are addressed by a
    // tile rather than by an edge, so the hint told a player arming a bed to
    // do two things neither of which works.
    //
    // Chosen on `placesObject`, which is the same shape fact `onPlace` in
    // `hud.ts` branches on to decide whether the numeric route sends
    // `place-object` or `place-build-order`. Reading one field for both means
    // the sentence cannot describe a gesture other than the one the panel
    // would perform. Removal still wins over both: it names no row.
    armHint.textContent = t(armedHintKey(selectedBuildable(), removing));

    // The numeric route follows the mode too, or the one submit button would
    // say "Place order" and clear a tile.
    submit.setLabel(t(removing ? HUD_MESSAGE_KEY.buildRemoveSubmit : HUD_MESSAGE_KEY.buildSubmit));
    paintPlacement();
    // Removal names no buildable, so it is offered even for an empty catalogue
    // -- the one case where the numeric route works with nothing selected.
    submit.setDisabled(!removing && selectedId === undefined);

    // Disarmed entirely, the panel clears its own readout -- and it is the only
    // thing that can, on a host with no world tools at all (every harness in
    // `tests/browser/`).
    //
    // It is deliberately **not** the clear that fixes #550. A tool armed to
    // remove, or armed to place an object, is armed, so this line never fires
    // on the switch that used to leave the wall tool's last tile standing under
    // a bed. What fixes that is on the other side of the seam: a tool whose
    // `setArmed` leaves it disarmed withdraws its own aim, so whichever of the
    // three loses the pointer takes its coordinates with it, whatever the panel
    // believes about arming. See `BuildTool.setArmed`.
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
   * **Those two heights no longer move with what is on its way (2026-08-31,
   * issue #703 ruling 2).** They were measured with nothing pending, and while
   * the deliveries block was the row's last child the same row measured 312.9px
   * with three deliveries and the "and N more" line. The block is outside this
   * row now, so 149.6px and 128.4px are the row's height in every state -- and
   * `paintBuy` therefore scrolls twice on opening, the block first and this row
   * second, to keep reaching what one call reached while the two were one
   * element. The comment there carries the three assertions that measured it.
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

  /**
   * Sell back the same material the buy row is open on, in the same
   * quantity the same stepper shows (ADR 0075 decision 3, invoked by ADR
   * 0096 decision 3(b)).
   *
   * Beside `buySubmit` in the same disclosure rather than a fold of its own:
   * both name the same material and reuse `quantityField`, so a second
   * toggle and a second stepper would be two controls asking the same two
   * questions the Buy row already asks. `paintBuy` already hides this row
   * for a buildable nothing sells and for the removal gesture, on the same
   * terms `buyToggle`'s own comment gives, because a purchase and a sale of
   * a material nothing prices are both nothing to offer.
   *
   * **No `setUnavailable` and no pre-flight, unlike `buySubmit`.** #772's
   * verdict exists because the host holds a published balance to check a
   * charge against; there is no published count of what the container
   * holds, so there is nothing honest to check a quantity against before the
   * press. The press still lands and is still refused on its own terms --
   * `session-commands.ts`'s `SellMaterials` branch records
   * `sell.insufficient-stock` through the same `RefusalLog` every other
   * command's refusal reaches the player through -- which is
   * `cancel-material-purchase`'s own precedent for a control with no
   * pre-check, applied here to stock instead of to a delivery in flight.
   */
  const sellSubmit: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.buildSell),
    onActivate: () => {
      const material = selectedMaterial();
      if (material === undefined) return;
      options.onSell({ itemId: material.itemId, quantity });
    },
  });
  sellSubmit.element.classList.add('hud-build__sell-submit');

  /*
   * ---- what has been bought and has not arrived (#285, #703) -----------
   *
   * **Read the correction at the foot of this block first: since 2026-08-31
   * this block is NOT inside the buy disclosure.** Everything above that
   * correction is the argument that put it there, kept because the ruling
   * overturned the placement and not the measurements.
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
   *
   * ---------------------------------------------------------------------
   *
   * **Corrected 2026-08-31 -- issue #703 ruling 2. This block is no longer
   * inside the buy disclosure, and none of the sentences above are deleted
   * because every measurement in them was true when it was taken.** The owner's
   * words: *"The spent amount and the control that reverses it both come out of
   * the Buy fold."* Two alternatives were rejected by name -- surfacing the
   * amount alone and leaving the reversal behind a click, and leaving both in
   * the fold.
   *
   * **What changed under the argument above was who spends the money.** #285
   * built this block for a delivery the player had pressed *Buy* for, which is
   * why "it is also where the player is looking" was right. #640 made a
   * `PlaceBuildOrder` buy its own materials, so the common case became a charge
   * the player never ordered -- 480 for a six-segment wall run, with no
   * procurement press at any point -- and #693 then made a cancelled `jit:`
   * delivery withdraw the queued orders behind it, giving this block's `Cancel`
   * a job nothing else in the interface can do. Both of those landed inside a
   * fold that #640 exists so the player never has to open.
   *
   * `docs/research/2026-08-31-playing-the-nine-changes.md` §1b measured the
   * result on the real page with the fold shut:
   * `{"blockHidden":"false","pending":"24","visibleRows":3,"width":0,"height":0}`
   * -- correct text, correct total, `data-pending="24"`, zero pixels -- and §1c
   * measured the refund's only trigger as a twenty-second actionability timeout
   * on a button that *"is not visible"*.
   *
   * **Where it is now, and what that costs.** The last child of
   * `.hud-build__map`, immediately after `buyRow` -- see the `panel.body.append`
   * below. The panel's *arrival* geometry is untouched, because `paintDeliveries`
   * leaves the block `hidden` when nothing is pending and a `hidden` flex child
   * takes no gap: the figures three paragraphs up still describe the page a
   * player arrives at. What is no longer true is the *identity* those figures
   * were quoted for -- with deliveries pending the panel is now taller by this
   * block, and the coordinates section and the queue below it move down.
   * Measured on the assembled page by
   * `tests/browser/build-deliveries-outside-the-fold.spec.ts`, six `jit:`
   * deliveries pending from one wall run, fold never opened:
   *
   * | Viewport | block | panel overflow | refunds on screen without scrolling |
   * | --- | --- | --- | --- |
   * | 1920x1080 | 238x226.9 | 0px | 3 of 3 |
   * | 1440x900 | 238x226.9 | 94px | 3 of 3 |
   * | 1280x800 | 238x226.9 | 169px | 2 of 3 |
   * | 900x600 | 238x180.5 | 178px | 1 of 3 |
   * | 375x812 | 333x213.7 | 158px | 2 of 3 |
   *
   * The spend itself and the first row's `Cancel` -- the delivery landing
   * soonest, whose refund is the first to stop being available -- are inside the
   * panel's visible box at **every** one of those viewports, and every row below
   * the fold is reached by the scroll `.ui-panel.hud-build` already performs,
   * asserted there by scrolling to it and re-measuring rather than assumed. The
   * owner's steer of the same day is that the desktop browser comes first and
   * mobile is a later pass, so the three desktop viewports are what this ruling
   * is judged at and the two tight ones are measured so a later pass can see
   * what it changed.
   *
   * **And the cost recorded in the paragraph above this correction is gone.**
   * The rows were unreachable while `buyToggle` was hidden -- in the removal
   * mode, and for a buildable nothing sells. They are not any more, which is
   * worth stating because it was the one honest complaint against the old
   * placement.
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
   *
   * **`orderId` is read at press time, and that is necessary and was never
   * sufficient** -- the same correction `RosterRow` in `staff-panel.ts` records
   * about itself, left unmade here when #877 closed because that pass never
   * reached this block. Reading at press time makes the id **current**, not
   * **the one the player read**. This block bound `rows[i]` to
   * `deliveries[i]`, and a delivery leaves the window by *landing*, on the
   * procurement clock and with no press from the player, so the head of the list
   * was replaced while the player was reading it and every surviving purchase
   * slid up one row. The `Cancel` under the pointer then refunded a different
   * purchase for a different amount.
   *
   * `assignPooledRows` is what closes it, and `freedAtMs` is the state that rule
   * needs from this row. Gated by `tests/browser/ui-pooled-rows-aim.spec.ts`.
   */
  interface DeliveryRow {
    readonly element: HTMLElement;
    readonly label: HTMLSpanElement;
    readonly cancel: ActionButton;
    /** The delivery this row currently names, or `undefined` while it names nothing. */
    orderId: string | undefined;
    /** When this place was last emptied. `assignPooledRows` reads it; see `PENDING_DELIVERY_ROW_SETTLE_MS`. */
    freedAtMs: number | undefined;
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
      freedAtMs: undefined,
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

  /*
   * **What stops a press, and what would lift it** -- the wording half of
   * issue #772, on the owner's sentence of 2026-09-03
   * (`hud.build.buy-shortfall`).
   *
   * A line of its own rather than a second job for the arrival hint below it,
   * and the shape is the one this panel already uses for the same kind of
   * sentence: `.hud-build__queue-shortfall` is the queue's money line, drawn
   * only while there is a shortfall and withdrawing to *no box* when there is
   * not. The two sentences beside this control answer different questions --
   * `hud.build.buy-hint` says what a press that goes through does, this says
   * why one will not -- and a line that swapped between them would leave a
   * player who has fixed their balance with no statement of what a purchase
   * even is. `hud.rooms.arm-hint`'s "one line, two jobs" is the other
   * available shape and it was not taken for that reason.
   *
   * **Above the hint and directly under the button**, because it is about the
   * control immediately above it; the row is a flex column, so DOM order is
   * reading order (`.hud-build__buy:not([hidden])`, `hud.css`).
   *
   * Its own class beside `.hud-build__note` for `.hud-build__queue-shortfall`'s
   * reason: this panel has several notes and a spec has to be able to name
   * this one without depending on document order. And it costs the panel
   * nothing in the state a player is normally in -- `hidden` while the press
   * is affordable, which is every state a solvent prison has.
   */
  const buyShortfall = eyebrowText('', 'hud-build__note hud-build__buy-shortfall');
  buyShortfall.hidden = true;
  /*
   * The line is the Buy control's *description* while it stands, on the shape
   * `rooms-panel.ts` uses for its Confirm note: a player who cannot see the
   * line reaches a control that reports itself unavailable and is told
   * "unavailable" and nothing else, which is the finding a keyboard-only
   * playtest made about Confirm.
   *
   * Written per repaint rather than once at construction, unlike that note,
   * because this one *withdraws*: `aria-describedby` pointing at a line with
   * no box would describe the button with a sentence nobody can read. That is
   * `markControl`'s own pattern in `hud.ts`, and `describeBy`/`undescribeBy`
   * merge rather than replace -- so the refusal band's id and this id coexist
   * on the button when a press has actually been refused, which is exactly
   * the state this line is drawn in.
   */
  const buyShortfallId = nextUiId('hud-build-buy-shortfall');
  buyShortfall.id = buyShortfallId;

  /*
   * Buy and Sell, side by side rather than stacked (issue measured live: a
   * second full-width row here pushes `deliveriesBlock` -- a *sibling* of
   * `buyRow`, not a child of it -- far enough down that its third delivery
   * row's Cancel control lands outside `.hud-build`'s visible box at 900x600.
   * `tests/browser/app-shell.spec.ts`'s "a pending delivery is on the panel
   * with the fold shut … (#285, #703)" measures exactly that box and caught
   * it. One row of the same height Buy alone used to take, on
   * `.hud-build__actions`'s own pattern (two buttons, `flex: 1 1 0`,
   * `min-width: 0`), is what keeps this addition height-neutral.
   */
  const buySellRow = element('div', {
    className: 'hud-build__buy-sell',
    children: [buySubmit.element, sellSubmit.element],
  });

  const buyRow = element('div', {
    className: 'hud-build__buy',
    children: [
      quantityField.element,
      buySellRow,
      buyShortfall,
      eyebrowText(t(HUD_MESSAGE_KEY.buildBuyHint), 'hud-build__note'),
      /*
       * `deliveriesBlock` used to be the last child of this row, and the
       * paragraph that put it here read:
       *
       * > Last in the row, and the order is the argument. The stepper and the
       * > button are what the player opened this for; the deliveries are what
       * > they come back for. `paintBuy` scrolls the row into view when it
       * > opens, and `block: 'nearest'` aligns the row's own leading edge when
       * > the row is taller than the panel's visible box -- so the controls
       * > that buy stay where the player expects them and the rows below them
       * > are reached by the scroll the panel already performs.
       *
       * **Moved out of this row on 2026-08-31 (issue #703 ruling 2).** It is
       * now the last child of `.hud-build__map`, immediately after this row --
       * see the `panel.body.append` below. The argument above was sound while
       * every delivery was one the player had pressed *Buy* for; #640 made the
       * game buy materials on the player's behalf, so the row that reports a
       * spend is no longer a row they came back for. The owner's words:
       * *"The spent amount and the control that reverses it both come out of
       * the Buy fold."*
       */
    ],
  });
  buyRow.hidden = true;
  const buyRowId = nextUiId('hud-build-buy');
  buyRow.id = buyRowId;
  buyToggle.element.setAttribute('aria-controls', buyRowId);

  /** Clamps to what the selected material allows, then repaints what it costs and what selling it back would credit. */
  function setQuantity(value: number): void {
    const material = selectedMaterial();
    const ceiling = material === undefined ? value : material.maxQuantity;
    quantity = Math.min(Math.max(1, Math.trunc(value)), ceiling);
    quantityField.setValue(quantity);
    paintBuyTotal();
    paintSellTotal();
  }

  /**
   * What selling the stepper's quantity of the selected material would
   * credit -- `paintBuyTotal`'s own shape, and simpler than it for the
   * reason `sellSubmit`'s own comment gives: there is no verdict to mark,
   * only a label to state, so this is the whole of what a quantity change
   * repaints on the sell side.
   */
  function paintSellTotal(): void {
    const material = selectedMaterial();
    if (material === undefined) return;
    const total = sellBackPreviewMinorUnits(material.unitPriceMinorUnits, quantity);
    sellSubmit.setLabel(
      t(HUD_MESSAGE_KEY.buildSellSubmit, {
        count: quantity,
        material: t(material.labelKey),
        total: localizer.formatNumber(total),
      }),
    );
  }

  function paintBuyTotal(): void {
    const material = selectedMaterial();
    if (material === undefined) return;
    // The charge `ProcurementSystem.purchase` will make, called rather than
    // recomposed here -- the same seam `paintSellTotal` above uses for the sell
    // side, and for the reason `purchasePreviewMinorUnits` states: this line
    // read `material.unitPriceMinorUnits * quantity` until 2026-09-14, which is
    // the panel computing a price (issue #1160, constitution article 4).
    const total = purchasePreviewMinorUnits(material.unitPriceMinorUnits, quantity);
    buySubmit.setLabel(
      t(HUD_MESSAGE_KEY.buildBuySubmit, {
        count: quantity,
        material: t(material.labelKey),
        // Minor units, formatted like every other figure the HUD shows and
        // divided by nothing: #96 named no currency, and the prices in
        // `src/content/procurement-catalog.ts` and the balance on the status
        // strip are quoted in the same units, so this is the number the
        // player compares against what they have.
        total: localizer.formatNumber(total),
      }),
    );
    /*
     * **Issue #772: the control's state tracks the same verdict the press
     * itself will be judged against, computed before the press rather than
     * discovered by it.** `pressAffordabilityVerdict` is the exact comparison
     * `src/main.ts` runs on `onPurchase` -- same `judgeAffordability`, same
     * `pressFloorMinorUnits`, same constant floor -- so a press this marks
     * unavailable and a press this would have let through are never two
     * approximations of one question.
     *
     * **`setUnavailable`, not `setDisabled`, and this is the narrowing of
     * 2026-09-02.** PR #799 wrote `setDisabled(verdict.refused)` here. It was
     * the right verdict on the wrong bit, and it cost a whole refusal route:
     *
     *   - `disabled` removes the press, and the press is what produces the
     *     only sentence a player is ever given for this refusal --
     *     `hud.refusal.purchase-materials-past-floor`, which the owner
     *     authored under ruling 18 of 2026-08-31 precisely because the generic
     *     line told a player nothing about a limit they had no other way of
     *     learning. With `disabled`, that sentence, the
     *     `data-action-failed` mark on this button and the `aria-describedby`
     *     link between them became unreachable from this panel: the last
     *     producer of `'past-the-overdraft-floor'` left is `hire-staff`. The
     *     label is unchanged either way (see the split below), so a hard
     *     `disabled` says "no" and nothing else, for ever.
     *   - It never held, either. `buySubmit.element` is in this panel's
     *     `controls`, and `createBusyGroup`'s `apply`
     *     (`src/ui/primitives/async-action.ts`) assigns
     *     `control.disabled = busy` for every member on every busy
     *     transition -- so the gate re-enabled this button after *any*
     *     command in the HUD settled, and nothing repainted it until the next
     *     `setTreasury` or quantity change. A refusal reachable in that window
     *     and nowhere else is an accident, not a design.
     *
     * `aria-disabled` keeps both halves: assistive technology reports the
     * control as unavailable and `primitives.css` dims it, so #772's
     * before-the-press signal is intact -- and the press still lands, is
     * still refused on this thread, and the player is still told why. See
     * `ActionButton.setUnavailable` for the general form of the distinction.
     *
     * **Unavailable, not hidden**, unlike `buyToggle` two paragraphs above:
     * that comment's rule is for a control that would claim a purchase
     * *exists* when it does not (nothing sells the buildable, or the removal
     * gesture buys nothing) -- a permanent fact about the row. Affordability
     * is the opposite shape: the purchase exists and stays offered, the
     * balance that blocks it is a fact about *right now*, and the same press
     * that is refused this tick goes through the next time a delivery lands or
     * the quantity comes down. `aria-disabled` says exactly that -- advised
     * against, but still here -- where `hidden` would claim the row itself
     * stopped meaning anything.
     *
     * **This is the mechanical half only (issue #772's split).** What the
     * button *says* is untouched -- still `hud.build.buy.submit`, byte for
     * byte, whichever way the verdict falls. Naming what stops and what would
     * lift it is new player-facing copy, which `AGENTS.md`'s fourth exclusion
     * and this issue's own text both reserve to the owner, and ADR 0087's
     * decision 2 (a standing condition, gated on copy) or ADR 0089's
     * reason-as-data mechanism are the places that sentence gets decided --
     * not here. The refusal band is the one sentence that already exists, and
     * keeping the press is what keeps it reachable.
     *
     * **Freshness, threaded exactly as `overdraftRemaining` threads it**
     * (`src/ui/hud/projection.ts`): the published predicate, never a bare
     * `false`, because a fresh, unfurnished prison is judged against the
     * shallower starter rung and a caller that silently answered "not fresh"
     * would reopen the -1,185/-1,250 gap PR #769 and #771's amendment closed
     * (`deliveriesRungFloorMinorUnits`'s own docblock).
     *
     * **That sentence read `treasuryRoomCapacity === 0` until 2026-09-15 and
     * is corrected rather than overwritten, because the reason it gives is
     * still the reason.** Deriving the predicate from `roomCapacity` was the
     * host inventing a second definition of "fresh", and it answered
     * differently from the worker's on any prison holding a room the content
     * catalogue does not define -- the same defect this paragraph warns about
     * wearing the opposite sign, and the one that actually shipped.
     */
    const isFreshUnfurnishedPrison = treasuryFreshUnfurnishedPrison;
    const verdict = pressAffordabilityVerdict(total, treasuryMinorUnits, isFreshUnfurnishedPrison);
    buySubmit.setUnavailable(verdict.refused);
    /*
     * **And now it says what stops it** (the owner's sentence of 2026-09-03),
     * which is the half the comment above records as reserved. The paragraph
     * beginning *"This is the mechanical half only"* is kept rather than
     * rewritten because it is the record of why this line did not exist for
     * two days: what changed is the ruling, not the argument.
     *
     * The label is still untouched, and that part of it still holds --
     * `hud.build.buy.submit` is byte-identical whichever way the verdict
     * falls. The sentence is a line of its own, so nothing a screen reader
     * announces as this control's *name* moved.
     *
     * **The money branch only.** `shortfallMinorUnits` is `0` on every verdict
     * but `'past-the-floor'`, and a `'Not enough money'` sentence is false
     * about a malformed charge -- so the condition is the refusal reason and
     * not `verdict.refused`. `'malformed-charge'` is unreachable with the
     * shipped catalogue (the quantity is a clamped integer and the price comes
     * from `procurement-catalog.ts`), and it says nothing to a player either
     * before or after this change.
     *
     * `formatNumber`, like every other money figure on this panel: the label
     * above, the queue's shortfall and the delivery rows all go through it, and
     * a second formatter here would be the same number rendered two ways.
     */
    const shortfallStands = verdict.refusal === 'past-the-floor';
    buyShortfall.hidden = !shortfallStands;
    buyShortfall.textContent = shortfallStands
      ? t(HUD_MESSAGE_KEY.buildBuyShortfall, { amount: localizer.formatNumber(verdict.shortfallMinorUnits) })
      : '';
    if (shortfallStands) describeBy(buySubmit.element, buyShortfallId);
    else undescribeBy(buySubmit.element, buyShortfallId);
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
    //
    // **Two calls since 2026-08-31 (issue #703 ruling 2), and the order is the
    // whole of it.** `deliveriesBlock` is no longer this row's last child, so
    // one call on the row scrolls to the stepper and the button and stops --
    // and the block, now *below* the row, gets pushed down by the 149.6px the
    // row takes when it opens. That was measured rather than reasoned about:
    // with a single call, three assertions in `ui-pending-deliveries.spec.ts`
    // went red -- `buy-02`'s cancel below the panel's fold at 375x812,
    // `buy-01`'s at 1280x800, and `buy-01`'s at 900x600 beside a queue -- all
    // of them states that were reachable before the block moved.
    //
    // So the block is brought into view first and the row second, because the
    // last call wins where the two do not both fit. That reproduces exactly
    // what the single call did while the block was inside the row: the whole of
    // it if it fits, and the buy controls' own leading edge if it does not.
    if (opening) {
      if (deliveriesBlock.hidden === false) deliveriesBlock.scrollIntoView({ block: 'nearest' });
      buyRow.scrollIntoView({ block: 'nearest' });
    }
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
   * **This function is now the whole of what keeps the panel's arrival height
   * (2026-08-31, issue #703 ruling 2).** The sentence above was written when the
   * block sat inside the buy row, which had no box of its own until the player
   * opened it, so `hidden` was the second of two mechanisms. The block is a child
   * of `.hud-build__map` now, and this line is the only one left: a block left
   * laid out with nothing in it would take a hairline, a header and its gap off
   * the panel's always-visible budget in every state, which is the height #174
   * closed.
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
        /*
         * **The settle window is forgotten here rather than stamped, and that
         * is `paintQueue`'s correction one block over rather than a new
         * decision.** This branch is *"nothing has asked"* and *"nothing is on
         * the way"*, and `src/main.ts:2538` reaches it every time the player
         * leaves the Build tab, because nothing refreshes this list from
         * another tab. Stamping here is what #860's first version shipped for
         * the queue: every place came back inside its window, **refused the
         * publication that arrives when the player returns**, and -- with
         * nothing further to publish until a delivery lands -- left the block
         * drawing no rows at all. Measured on this branch before the
         * correction: three purchases out, tab away, tab back, and
         * `probe().rows` is `[]`.
         *
         * The rule is `pooled-row-binding.ts`'s: a place with **no box** carries
         * no settle window, because the window exists so that a label the
         * player may have read is not replaced under their pointer, and a place
         * with no box had no label to read.
         */
        row.freedAtMs = undefined;
        row.element.hidden = true;
        row.orderId = undefined;
        row.cancel.setUnavailable(true);
        delete row.element.dataset['delivery'];
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

    /*
     * Which row names which delivery -- `assignPooledRows`, not
     * `shown.deliveries[index]`, and the substitution is #860's fix applied to
     * the list issue #877 named beside the two in the Staff panel and left
     * unmeasured.
     *
     * The hazard is the queue's, arriving by a different route. A delivery
     * leaves this window by **landing**, on the procurement clock and with no
     * press from the player, so the head of the list is replaced while the
     * player is reading it and every surviving purchase used to slide up one
     * row. The `Cancel` beside the label then refunded a different purchase for
     * a different amount -- and the id read at press time was that different
     * purchase, so nothing on the code path could detect it. The remedy is the
     * one that module's header argues for: a *place* names one purchase for as
     * long as that purchase is in the window, and a new one only appears in a
     * place that has been visibly blank for `PENDING_DELIVERY_ROW_SETTLE_MS`.
     */
    const byOrderId = new Map(shown.deliveries.map((delivery) => [delivery.orderId, delivery]));
    const nowMs = performance.now();
    const assignments = assignPooledRows(
      deliveryRows.map((row) => ({ itemId: row.orderId, freedAtMs: row.freedAtMs })),
      shown.deliveries.map((delivery) => delivery.orderId),
      nowMs,
      PENDING_DELIVERY_ROW_SETTLE_MS,
    );

    let drawn = 0;
    for (const [index, row] of deliveryRows.entries()) {
      const assignment = assignments[index];
      if (assignment === undefined || assignment.kind === 'empty') {
        if (row.orderId !== undefined) row.freedAtMs = nowMs;
        row.element.hidden = true;
        row.orderId = undefined;
        row.label.textContent = '';
        row.cancel.setUnavailable(true);
        delete row.element.dataset['delivery'];
        continue;
      }
      if (assignment.kind === 'holds-open') {
        /*
         * This place names nothing: its delivery has just landed or been
         * cancelled, or it is still inside its settle window, or a row below it
         * is occupied and giving this box up would slide that row up into
         * whatever pointer is resting there -- which is the same defect by
         * geometry instead of by binding. It keeps its box and loses everything
         * else, and `row.orderId === undefined` in the handler above is the
         * authority that stops a press; `setUnavailable` is the signal, for the
         * reason the queue's own hold-open branch records about
         * `createBusyGroup`.
         */
        if (row.orderId !== undefined) row.freedAtMs = nowMs;
        row.orderId = undefined;
        row.element.hidden = false;
        row.label.textContent = '';
        row.cancel.setUnavailable(true);
        row.cancel.element.setAttribute('aria-label', t(HUD_MESSAGE_KEY.buildDeliveryCancel));
        delete row.element.dataset['delivery'];
        continue;
      }
      const delivery = byOrderId.get(assignment.itemId);
      if (delivery === undefined) continue;
      drawn += 1;
      row.orderId = delivery.orderId;
      row.element.hidden = false;
      row.cancel.setUnavailable(false);
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

    /*
     * How many are behind the last row, and no control to reach them: the rows
     * are the deliveries landing soonest, so they are the ones whose refunds are
     * about to stop being available, and the rest come into view as those land.
     *
     * Counted against the rows this pass actually **drew** rather than against
     * `shown.deliveries.length`, for the reason the queue's own "and N more"
     * line is: a place holding its box open for a publication is a place the
     * arriving purchase could not have, so counting the window instead would
     * understate what the player cannot reach.
     */
    const unlisted = Math.max(0, shown.total - drawn);
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
   * how many orders the pool holds a row for -- **sixty-four since #862, and
   * this sentence used to say "showing the head of the queue rather than all of
   * it"**. It said that because the list's height was the row count; it is now
   * the list's own box (`.hud-build__queue-list` in `hud.css`), so the head of
   * the queue is what the box shows and the whole of it is what the list holds.
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
  /*
   * The queue's one sentence about money (#627, #629, #640), and the only part
   * of this block that is **not** inside the fold.
   *
   * `queueSection` opens collapsed, on purpose and with a measurement behind it
   * (`BUILD_QUEUE_ROW_LIMIT`) -- and #625 is the record of what that costs when
   * the thing inside is a requirement rather than a detail: *"Awaiting
   * Materials"* was there, in this fold, and reached nobody. So this line is
   * appended to the panel body *after* `queueSection.element` rather than to
   * `queueSection.body`. A player who never opens the fold still reads it.
   *
   * That is the rule `deliveriesBlock` was moved to obey on 2026-08-31 (issue
   * #703 ruling 2), one fold over and for the third time in this panel: #625 for
   * *"Awaiting Materials"*, this line for the money the queue is waiting on, and
   * that block for the money the game has already spent. A readout the player
   * must not have to go looking for is appended beside a fold, never inside one.
   *
   * `hud-build__queue-shortfall` as well as `hud-build__note`, for exactly the
   * reason `hud-build__queue-more` carries its own class: `.hud-build__note`
   * gets an author `display: -webkit-box` under `max-height: 700px` in
   * `hud.css`, which beats the user agent's `[hidden] { display: none }`, so
   * without a rule of its own this line would lay out empty at every short
   * viewport. See `.hud-build__queue-shortfall[hidden]` there.
   */
  const queueShortfall = eyebrowText('', 'hud-build__note hud-build__queue-shortfall');

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
    /** The order this row names, or `undefined` while it names nothing. */
    orderId: string | undefined;
    /**
     * The revision (ADR 0107) this row's last publication read for `orderId`
     * -- `0` while the row names nothing, matching `ConstructionSystem
     * .revisionOf`'s own answer for an id it holds nothing under. Kept in
     * step with `orderId` for the same reason: `assignPooledRows` guarantees
     * this field always names *this row's current occupant*, never a
     * previous one, so a press reads the pairing this row is showing right
     * now rather than one captured earlier and possibly re-pointed since.
     */
    revision: number;
    /** When this place was last emptied. `assignPooledRows` reads it; see `BUILD_QUEUE_ROW_SETTLE_MS`. */
    freedAtMs: number | undefined;
  }

  /**
   * The pool: at most `BUILD_QUEUE_ROW_LIMIT` rows, created as the queue first
   * needs them and reused for ever after.
   *
   * **Lazily rather than all at once, and that changed with #862 for a reason
   * a test found.** The pool used to be built eagerly, `Array.from({ length:
   * BUILD_QUEUE_ROW_LIMIT })`, which was free while the limit was three and is
   * not free at sixty-four: `tests/browser/app-shell.spec.ts`'s #88 sweep
   * asserts that the set of controls *never laid out in any state* equals an
   * explicit exempt list, and sixty-four rows against the six orders that test
   * places would have put fifty-eight `Cancel` buttons on that list. Extending
   * a pinned list is allowed here; extending it by fifty-eight entries that
   * move whenever this constant does is not the same thing as recording a
   * genuine exemption, and the sweep's finding is real: a control that is never
   * drawn is a control nothing can vouch for.
   *
   * Growing on demand costs nothing the eager version did not, and gives two
   * things back. A session that never queues anything holds no rows at all, and
   * the HUD's busy group -- `add` with no `remove` -- gains a member only when
   * a queue has actually been that long. The bound the group depends on is
   * unchanged, because it was never "created up front": it is that the pool has
   * a **ceiling** and rows past it are reused rather than built.
   */
  const queueRows: QueueRow[] = [];

  /** One row: two lines of readout, and the one control that withdraws it. */
  function createQueueRow(): QueueRow {
    const label = valueText('', 'hud-build__queue-label');
    const state = eyebrowText('', 'hud-build__queue-state');
    const row: QueueRow = {
      element: element('div', { className: 'hud-build__queue-row' }),
      label,
      state,
      cancel: createActionButton({
        label: t(HUD_MESSAGE_KEY.buildQueueCancel),
        onActivate: () => {
          /*
           * Read at press time, not captured at construction -- and that on its
           * own was never enough, which is #860.
           *
           * The comment this replaces argued that a captured id *"would cancel
           * whatever was here two seconds ago, which is the exact defect a
           * pooled row exists to avoid paying for with allocations"*. That is
           * still true and is still why the read is here. But reading at press
           * time makes the id **current**, not **the one the player read**:
           * while the pool bound `rows[i]` to `orders[i]`, one completion
           * between the paint a player acted on and their click re-pointed
           * every row, and this line then submitted the order that had just
           * landed in it. Measured 2026-09-03 with a coordinate press: two of
           * four cancelled a different wall, at decision delays of 250ms and
           * 600ms, while both presses at a 0ms delay were aimed correctly.
           *
           * `assignPooledRows` is what closes it, by refusing to let this row
           * name a different order at all. `orderId` is therefore the order
           * this row has named since it took it, and `undefined` on a row whose
           * order has left the window -- so a press reaches what the player was
           * looking at, or reaches nothing.
           */
          const { orderId, revision } = row;
          if (orderId === undefined) return;
          options.onCancelOrder(orderId, revision);
        },
      }),
      orderId: undefined,
      revision: 0,
      freedAtMs: undefined,
    };
    row.element.append(
      element('div', { className: 'hud-build__queue-text', children: [label, state] }),
      row.cancel.element,
    );
    row.element.hidden = true;
    queueList.append(row.element);
    return row;
  }

  /**
   * Grows the pool until it can draw `count` orders, and never past its
   * ceiling.
   *
   * The clamp is here rather than at the call site because it is the invariant
   * the busy group depends on, and an invariant that lives at one call site is
   * one refactor away from living nowhere.
   */
  function ensureQueueRows(count: number): void {
    const wanted = Math.min(count, BUILD_QUEUE_ROW_LIMIT);
    while (queueRows.length < wanted) queueRows.push(createQueueRow());
  }

  /**
   * Takes a row out of the list entirely: no order, no box, and nothing left on
   * it that could be read as a control aimed at something.
   *
   * The label and both data attributes are cleared as well as the id, which the
   * loop this replaces did not do. A hidden row used to keep the `data-order`
   * of whichever order was last in it, so a queue that shrank from three to two
   * left a third row carrying a live-looking order id with `orderId` already
   * `undefined` -- and a `[data-order="…"]` press then resolved to a row with no
   * box and hung. That is the third of #859's side findings, and
   * `staff-panel.ts`'s `paintHeld` already emptied its pooled rows this way
   * (*"so a press that somehow reached a hidden button cannot name a guard from
   * the last publication"*); this is the same rule, one panel over.
   */
  function emptyQueueRow(row: QueueRow, forgetSettle = false): void {
    /*
     * The settle stamp goes with the emptying, on the same transition rule the
     * `'holds-open'` branch of `paintQueue` uses: a place that named an order a
     * moment ago must not take another one straight away, and a place that was
     * already blank must not have its window restarted, or it would never take
     * another order at all.
     *
     * `forgetSettle` is the one case that must not stamp, and it is `#88`'s
     * regression -- see `paintQueue`'s `shown === undefined` branch.
     */
    if (row.orderId !== undefined && !forgetSettle) row.freedAtMs = performance.now();
    if (forgetSettle) row.freedAtMs = undefined;
    row.orderId = undefined;
    row.element.hidden = true;
    row.label.textContent = '';
    row.state.textContent = '';
    delete row.element.dataset['order'];
    delete row.element.dataset['state'];
    row.cancel.setUnavailable(false);
    row.cancel.element.setAttribute('aria-label', t(HUD_MESSAGE_KEY.buildQueueCancel));
  }

  const queueSection: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.buildQueue),
    /*
     * Collapsed when it appears, for the reason `BUILD_QUEUE_ROW_LIMIT` gives:
     * a queue then costs this panel a header and a count, and costs it a list
     * only when the player asks for one.
     *
     * **#862 asked whether it should arrive open, now that the list's box is
     * bounded, and the answer is measured rather than argued.** Unfolding was
     * tried and the probe reverted: the section goes from 45px to 201px, and
     * the panel pays that 156px out of the catalogue's list, which is the one
     * block `hud.css` lets it take height from. In the UI harness, with
     * fourteen orders queued, arriving open put the panel's own overflow at 0 at
     * 1440x900, 1280x800, 1280x720, 1024x768 and 375x812 -- so it *fits* there,
     * by shrinking the catalogue's list from 245px of 924px of rows to 89px,
     * two rows of twenty-one -- and at **12px over its box at 900x600 with
     * nothing having scrolled**, where the catalogue is already flat on its
     * one-row floor and has nothing left to give. That harness hands this panel
     * 128.7px more rail than the assembled page does, so 900x600 is not the only
     * viewport where it does not fit in the application.
     *
     * Both halves of that are reasons to leave it shut. The 12px is #174's shape
     * -- laid out below the unscrolled fold -- and the 156px is the donation ADR
     * 0031's acceptance is explicitly conditional on not making bigger: its
     * status section promotes open question 4 to blocking and says the catalogue
     * *"needs a surface of its own -- its own scroll, a filter, or a different
     * donor -- before more rows arrive"*. A queue that arrived open would spend
     * that donor twice.
     *
     * What #862 is actually about is reachable underneath: one press on a header
     * that states the queue's whole length now reveals a control for every order
     * in it, where before it revealed three of fourteen. Whether the fold should
     * also arrive open -- a two-row catalogue against a queue the player never
     * has to open -- is a trade between two player-visible surfaces and is the
     * owner's, with the figures above.
     */
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
   *
   * ## What the owner's ruling of 2026-09-06 (#1031) makes this block
   *
   * *"Świat ma rację -- licz po ukończeniu"* ("The world is right -- count on
   * completion"): a bed that has been ordered and not yet built raises no
   * capacity anywhere, so **this is the only readout in the interface that
   * names it**. The ruling's second half -- *"whatever a player has ordered
   * must be visible somewhere"* -- therefore rests on the predicate one line
   * below. It is a `total > 0` and nothing else, which is what keeps `hidden`
   * meaning "nothing is queued" rather than "nothing is being said". Measured
   * against the projection this block draws from, in
   * `tests/integration/capacity-counts-on-completion.test.ts`: every bed a
   * player has pressed for is either standing in a room's capacity or named in
   * that queue, at every tick, with no instant in which it is neither.
   *
   * A queued order is 151 ticks of a player's attention for a bed
   * (`PROCUREMENT_DELIVERY_DELAY_TICKS` and then the work), so a change that
   * made this block conditional on anything more than the queue's length would
   * take the acknowledgement away rather than tidy it.
   */
  function paintQueue(): void {
    const shown = queue !== undefined && queue.total > 0 ? queue : undefined;
    queueSection.element.hidden = shown === undefined;
    if (shown === undefined) {
      /*
       * `forgetSettle`, and it is the correction to #860's first shipped fix.
       *
       * This branch is *"nothing has asked"* and *"nothing is queued"* -- and
       * `src/main.ts` reaches it every time the player leaves the Build tab,
       * because nothing refreshes the queue from another tab and a block left
       * behind would be a list of ids that were true when they walked away.
       * With the settle stamp applied here, every place came back inside its
       * settle window and **refused the queue**; and with the clock stopped
       * there is no later publication to arrive once the window expires, so the
       * block stayed empty for good. `app-shell.spec.ts`'s #88 sweep caught it
       * -- six orders queued, the clock stopped, `.hud-build__queue-list`
       * resolved fourteen times with no box -- and
       * `ui-build-queue.spec.ts`'s *"draws its rows again after the tab has
       * been away"* is the same sequence in two lines.
       *
       * The settle window exists so that a label a player may have **read on
       * this panel** is not replaced under their pointer. When the block itself
       * stops being drawn there was no panel to read, so every place starts
       * fresh. That is why this is the only emptying that forgets the window
       * and the two inside `paintQueue`'s assignment loop do not: those happen
       * while the block is on screen and a label was there a moment ago.
       */
      for (const row of queueRows) emptyQueueRow(row, true);
      queueCount.textContent = '';
      queueMore.textContent = '';
      // Nothing queued is nothing to wait for. The line goes with the block it
      // is about rather than standing over an empty queue.
      queueShortfall.textContent = '';
      queueShortfall.hidden = true;
      /*
       * The one sentence in this panel that says why a queue is not moving goes
       * with the queue it is about (#920). Nothing queued is nothing waiting on
       * the clock -- and, more to the point, the arrival state is the one place
       * this panel has no height to spare: `orderNote`'s own block carries the
       * 27px and 9px that an always-laid-out line costs there.
       */
      orderNote.hidden = true;
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
     * Shown for the whole time a queue exists, and **not** narrowed to
     * `shown.started === 0`, which was the other candidate and is the one that
     * would have made the sentence false.
     *
     * `started` is 0 whenever the crew has not begun, and a stopped clock is
     * only one of the reasons for that: a queue stalled on materials money has
     * `started: 0` with the clock *running*, which is the state
     * `queueShortfall` two lines below is about. Saying "built while the clock
     * runs" into that state would name the wrong cause, and a sentence whose
     * truth depends on which reason produced the zero is the fourth reservation
     * in `AGENTS.md` -- a promise the code does not keep. As written the
     * sentence is true of every state that has a queue in it: what it says is
     * that the money is spent and the work is tick-driven, which does not stop
     * being true while a wall is going up.
     */
    orderNote.hidden = false;
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

    // The pool grows to what this publication needs before anything below reads
    // `queueRows`, so a queue that has just become longer than any before it
    // draws every order it can reach this pass rather than next time (#862).
    // Capped at `BUILD_QUEUE_ROW_LIMIT`, same as `assignPooledRows`'s own input
    // below is -- growing past what the loop can assign would be a pool no
    // publication could ever fill.
    ensureQueueRows(shown.orders.length);

    /*
     * Which row names which order -- `assignPooledRows`, not `orders[index]`,
     * and that substitution is the whole of #860's fix. Its header carries the
     * measurement, the argument, and what the fix costs; what it means here is
     * that a *place* in this list names one order for as long as that order is
     * in the window, and that a new order only appears in a place that has been
     * visibly blank for `BUILD_QUEUE_ROW_SETTLE_MS`. So the press handler above
     * cannot be handed an order the row never named.
     */
    const orders = new Map(shown.orders.map((order) => [order.orderId, order]));
    const nowMs = performance.now();
    const assignments = assignPooledRows(
      // `itemId` rather than `orderId`, because the rule is about pooled rows
      // and not about build orders: the Staff panel's two pools and this
      // panel's deliveries have the identical hazard and will hand it the
      // identical shape.
      queueRows.map((row) => ({ itemId: row.orderId, freedAtMs: row.freedAtMs })),
      shown.orders.map((order) => order.orderId),
      nowMs,
      BUILD_QUEUE_ROW_SETTLE_MS,
    );

    let drawn = 0;
    for (const [index, row] of queueRows.entries()) {
      const assignment = assignments[index];
      if (assignment === undefined || assignment.kind === 'empty') {
        emptyQueueRow(row);
        continue;
      }
      if (assignment.kind === 'holds-open') {
        /*
         * This place names nothing: its order has just gone, or it is still
         * inside its settle window, or a row below it is occupied and giving
         * this box up would move that row. It is emptied -- no id, no label, no
         * state, and the control reports itself unavailable -- and it keeps its
         * box, because hiding it would slide every row below it up a row's
         * height into whatever pointer is resting there, which is #860 again by
         * geometry instead of by binding.
         *
         * `freedAtMs` is stamped from the transition this loop can see for
         * itself -- the row held an order before the assignment and holds none
         * after -- which is why `assignPooledRows` does not have to return it.
         * Stamped only on the transition, or a place that stayed blank would
         * restart its own settle window on every publication and never take
         * another order at all.
         *
         * `setUnavailable`, not `setDisabled`: `createBusyGroup`'s `apply`
         * assigns `disabled` to every member on every busy transition, so a
         * `disabled` written here would be cleared the next time any command in
         * the HUD settles (`ActionButton.setUnavailable`'s docblock records
         * that collision). `aria-disabled` has one writer. Either way the
         * authority is `row.orderId === undefined` in the handler above; this
         * is the signal, not the gate.
         */
        if (row.orderId !== undefined) row.freedAtMs = nowMs;
        row.orderId = undefined;
        row.revision = 0;
        row.element.hidden = false;
        row.label.textContent = '';
        row.state.textContent = '';
        delete row.element.dataset['order'];
        delete row.element.dataset['state'];
        row.cancel.setUnavailable(true);
        row.cancel.element.setAttribute('aria-label', t(HUD_MESSAGE_KEY.buildQueueCancel));
        continue;
      }
      const order = orders.get(assignment.itemId);
      if (order === undefined) continue;
      drawn += 1;
      row.orderId = order.orderId;
      row.revision = order.revision;
      row.element.hidden = false;
      row.cancel.setUnavailable(false);
      row.label.textContent = formatBuildQueueOrderText(t, order, localizer.formatNumber(order.cancelRefundMinorUnits));
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

    /*
     * Counted against the rows this pass actually **drew** rather than against
     * `shown.orders.length`, because those two are no longer the same number: a
     * row holding its box open for one publication is a row the arriving order
     * could not have, so a queue of twelve with three sent and two drawn has
     * ten behind the list and not nine.
     *
     * That also subsumes the other way `shown.orders.length` could be the wrong
     * divisor (#862): a window longer than the pool, which nothing in
     * production hands this panel -- `BuildQueueReader` asks for exactly
     * `BUILD_QUEUE_ROW_LIMIT` rows -- but which a test that writes its own view
     * model can. `drawn` cannot exceed `queueRows.length` either way, because
     * the loop above assigns it by walking `queueRows` itself; a separate
     * `Math.min(..., queueRows.length)` here would be guarding an invariant
     * `drawn`'s own definition already guarantees.
     */
    const unlisted = Math.max(0, shown.total - drawn);
    queueMore.textContent = unlisted === 0 ? '' : t(HUD_MESSAGE_KEY.buildQueueMore, { count: unlisted });
    queueMore.hidden = unlisted === 0;

    /*
     * What unblocks the front of the queue, when it is stalled on money at all
     * (issue #771's second finding, the owner's ruling of 2026-09-01).
     *
     * **Driven by `unfunded` and not by `nextOrderShortfallMinorUnits > 0`.**
     * The two agree in every reachable session state, and they are not the
     * same claim: the flag is the projection's answer to "is this queue
     * stalled on money", and reading the figure instead would put this panel
     * in the business of deciding that from a number -- which is the second
     * source of truth `AGENTS.md` boundary 1 forbids, in miniature.
     *
     * **The figure itself changed subject on that ruling.** It used to be
     * `shortfallMinorUnits`, the sum of every order the queue could not fund --
     * "what the queue still needs, whole". ADR 0081 decision 2 funds one whole
     * order at a time and lets a later, cheaper order through while an
     * earlier, pricier one waits (`JustInTimeMaterialsService`'s rule 2), so a
     * player who saved the sum could still watch nothing move. This states
     * `nextOrderShortfallMinorUnits` instead: what actually unblocks the order
     * at the front of the walk, which `ConstructionSystem.orderedOrders()` and
     * this panel's own rows agree is also the front of the list on screen
     * (ADR 0082).
     *
     * The figure is in the same minor units as the status strip's Funds chip
     * and is formatted the same way, which is the comparison
     * `BuildQueueMaterialsFundingViewModel` says it exists for: what is left is
     * on the strip, what is missing is here, and neither divides by a currency
     * nobody has chosen.
     */
    queueShortfall.textContent = shown.materialsFunding.unfunded
      ? t(HUD_MESSAGE_KEY.buildQueueShortfall, {
          total: localizer.formatNumber(shown.materialsFunding.nextOrderShortfallMinorUnits),
        })
      : '';
    queueShortfall.hidden = !shown.materialsFunding.unfunded;
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
        // Below the arm hint and above the buy disclosure, which is PR #647's
        // placement kept rather than re-derived. See `orderNote` for the
        // measurement that says it is the only one of the two candidates the
        // player can read without scrolling.
        orderNote,
        buyRow,
        /*
         * Outside `buyRow` and immediately below it (issue #703 ruling 2,
         * 2026-08-31). See the block's own docblock above for the ruling and
         * what it cost the panel's height budget; the placement is the same
         * argument `queueShortfall` carries at the foot of this body -- a
         * readout the player must not have to open a fold to read is appended
         * beside the fold rather than inside it.
         *
         * Here rather than at the foot of the body, which was the other
         * candidate: this block reports money the *placement* gesture spent, so
         * it belongs with the placement controls the player is looking at, and
         * `.hud-build__map`'s padding is the box the block was measured in when
         * it lived one level deeper. The cost of that choice, stated: a
         * delivery appearing pushes the coordinates section and the queue down,
         * which the foot of the body would not have done. The arm button, the
         * target readout and the hint stay where the player's finger left them.
         */
        deliveriesBlock,
      ],
    }),
    coordinates.element,
    // Last in the body, so a queue that appears moves nothing above it: the arm
    // button, the target readout and the hint stay exactly where the player's
    // finger left them, and the panel grows downward into its own scroll.
    queueSection.element,
    // Below the block and outside it, so the fold's collapsed state cannot hide
    // it. See `queueShortfall` for why that placement is the whole point.
    queueShortfall,
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
    // A tile aim writes the two numbers it has and no more (#550). Writing
    // `undefined,undefined` after them would put the string "undefined" on an
    // attribute a browser test reads as the panel's own account of the aim.
    targetBlock.dataset['target'] =
      target.edge === undefined
        ? `${target.x},${target.y}`
        : `${target.x},${target.y},${target.edge},${target.segments ?? 1}`;
  }

  return {
    element: panel.element,
    // Every control that issues a command, which is now four kinds of them:
    // the numeric route's submit, the buy button, the sell button, and one
    // cancel per pooled queue row. The rows are pooled precisely so that this
    // list is fixed at mount -- the HUD's busy group has `add` and no
    // `remove`.
    controls: [
      submit.element,
      buySubmit.element,
      sellSubmit.element,
      ...queueRows.map((row) => row.cancel.element),
      ...deliveryRows.map((row) => row.cancel.element),
    ],
    submitControl: submit.element,
    purchaseControl: buySubmit.element,
    sellControl: sellSubmit.element,
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
    setTreasury(counts: HudCountsViewModel): void {
      treasuryMinorUnits = counts.treasuryMinorUnits;
      treasuryFreshUnfurnishedPrison = freshUnfurnishedPrison(counts);
      // A publication can arrive while the buy row is closed -- most
      // publications do -- and `paintBuyTotal` returns immediately for an
      // undisclosed row (`selectedMaterial()` reads whatever the catalogue
      // filter currently shows, not whether the disclosure is open, so this
      // still repaints a hidden button rather than skip the work). Repainting
      // unconditionally is what the badge on the strip already does for the
      // same balance (`strip.update`), and it is cheap: one comparison, one
      // text assignment and one `setAttribute` per publication, none of which
      // changes layout when the value is what it already was. **This sentence
      // read "no DOM write when the label and disabled flag do not change"
      // until 2026-09-02, and that stopped being true when the verdict moved
      // from the `disabled` property to the `aria-disabled` attribute:
      // assigning a property the value it holds is a no-op, and
      // `setAttribute` with an unchanged value still writes.** The cost is a
      // string comparison the engine makes either way; the reason the old
      // sentence gave is gone, and the conclusion is not.
      paintBuyTotal();
    },
    standDown(): void {
      /*
       * The world's `Escape`, with no gesture left for it to take (#959).
       *
       * **The same five lines `setVisible(false)` runs below, and the same
       * guard**, because "the tool is put down" has one meaning on this panel,
       * and a transition written twice is how #689 came to be shipped twice. What
       * differs is only what else goes: leaving the tab also drops the queue
       * and the deliveries, because nothing refreshes them from another tab.
       * The player is still looking at this panel, so those stay.
       *
       * `removing` goes with `armed`, for `toggleRemovalMode`'s reason: a
       * panel whose "Remove" was still latched would hand back a pointer that
       * deletes, on a press the player made to hold nothing.
       */
      if (!armed) return;
      armed = false;
      removing = false;
      paintArmed();
      paintBuy();
      options.onArm(false, selectedId, false);
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
