import type { LocalizationKey } from '../../content/localization';
import { deriveSimulationMessageKey } from '../../content/simulation-message-keys';
import type { MessageParameters } from '../../services/localization/format';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { createChoiceGroup, type ChoiceGroup } from '../primitives/choice-group';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { element, eyebrowText, nextUiId, valueText } from '../primitives/dom';
import { createListRow, type ListRow } from '../primitives/list-row';
import { createNumberField, type NumberField } from '../primitives/number-field';
import { createPanel } from '../primitives/panel';
import { HUD_MESSAGE_KEY } from './messages';
import { HUD_BUILD_EDGES, type HudBuildEdge, type HudBuildViewModel, type HudLocalizer } from './view-model';

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
 * than a preference: see the comment on `buyToggle` for the 3.9px the panel
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
  /** The map route: hand the pointer to the build tool, or take it back. */
  readonly onArm: (armed: boolean, definitionId: string | undefined) => void;
  /** Buy the selected buildable's material, in the quantity the stepper shows (#89). */
  readonly onPurchase: (intent: BuildPanelPurchaseIntent) => void;
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
  /** Live feedback from the world. `undefined` clears the readout. */
  setTarget(target: BuildPanelTarget | undefined): void;
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

export function createBuildPanel(options: BuildPanelOptions): BuildPanel {
  const { localizer, model } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let selectedId = model.buildables[0]?.definitionId;
  let tileX = Math.trunc(model.origin.x);
  let tileY = Math.trunc(model.origin.y);
  let edge: HudBuildEdge = 'north';
  let armed = false;
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

  const paintCatalogue = (): void => {
    for (const [id, row] of rows) {
      row.setBadge(id === selectedId ? { tone: 'info', text: t(HUD_MESSAGE_KEY.buildSelected) } : undefined);
      row.element.dataset['selected'] = id === selectedId ? 'true' : 'false';
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
        // placing whatever was chosen when it was armed.
        options.onArm(armed, selectedId);
      },
    });
    row.element.dataset['buildable'] = buildable.definitionId;
    rows.set(buildable.definitionId, row);
    catalogueList.append(row.element);
  }

  // An empty list must say so. A blank rectangle is indistinguishable from a
  // broken one.
  if (model.buildables.length === 0) {
    catalogueList.append(
      createListRow({ icon: 'check', label: t(HUD_MESSAGE_KEY.buildCatalogueEmpty) }).element,
    );
  }

  const catalogue: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.buildCatalogue),
    onToggle: (collapsed) => catalogue.setCollapsed(collapsed),
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
      armed = !armed && selectedId !== undefined;
      paintArmed();
      options.onArm(armed, selectedId);
    },
  });
  armButton.element.dataset['armed'] = 'false';
  // Named, so a selector can say *which* action it means. Both buttons in the
  // row below are `.ui-action`, and `.hud-build__map .ui-action` used to be
  // the arm button by being the only one.
  armButton.element.classList.add('hud-build__arm');

  const targetValue = valueText(t(HUD_MESSAGE_KEY.buildTargetNone), 'hud-build__target-value');
  const targetBlock = element('div', {
    className: 'hud-build__target',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.buildPlacement)), targetValue],
  });

  const armHint = eyebrowText(t(HUD_MESSAGE_KEY.buildArmHint), 'hud-build__note');

  function paintArmed(): void {
    armButton.setLabel(t(armed ? HUD_MESSAGE_KEY.buildDisarm : HUD_MESSAGE_KEY.buildArm));
    armButton.element.dataset['armed'] = armed ? 'true' : 'false';
    // `aria-pressed` says it is a toggle, not a one-shot action; without it a
    // screen reader announces "Stop placing" with no way to tell that the
    // mode is currently on.
    armButton.element.setAttribute('aria-pressed', armed ? 'true' : 'false');
    if (!armed) setTarget(undefined);
  }

  // ---- buying the materials (#89) -----------------------------------
  /*
   * The panel's one way to spend the treasury, and the whole of why it is
   * shaped like this is the panel's height budget.
   *
   * Measured on the assembled page at 900x600, Build tab, one prison saved,
   * coordinates folded -- the state a player arrives in -- with this row
   * absent: the panel's body holds 291px of content in a 291px box, its
   * summed floor resolves to 271.2px, and the catalogue is 3.9px above its
   * own two-row floor. So 3.9px is the entire budget a new always-visible
   * block has there, and every candidate was measured against it: a
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

  const buyRow = element('div', {
    className: 'hud-build__buy',
    children: [
      quantityField.element,
      buySubmit.element,
      eyebrowText(t(HUD_MESSAGE_KEY.buildBuyHint), 'hud-build__note'),
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
    if (material === undefined) buying = false;
    buyToggle.element.hidden = material === undefined;
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
    if (material === undefined) return;
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
    options: HUD_BUILD_EDGES.map((id) => ({ id, label: t(edgeLabelKey(id)) })),
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
  coordinates.body.append(
    eyebrowText(t(HUD_MESSAGE_KEY.buildCoordinatesHint), 'hud-build__note'),
    element('div', { className: 'hud-build__coords', children: [xField.element, yField.element] }),
    edgeChoice.element,
    submit.element,
  );

  function paintPlacement(): void {
    // The edge chooser is hidden, not disabled, for a buildable that does not
    // sit on an edge: a disabled control still claims the setting exists.
    edgeChoice.element.hidden = selectedBuildable()?.occupiesEdge !== true;
  }
  paintPlacement();

  // Collapsible, because the panel and the thing it operates on compete for
  // the same screen. At 375px it covers most of the world, and the whole
  // interaction is now "point at the world" -- so folding it to its header
  // while placing is not a nicety. Arming survives the fold: the tool is
  // still yours, you just want to see what you are doing.
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
        element('div', { className: 'hud-build__actions', children: [armButton.element, buyToggle.element] }),
        targetBlock,
        armHint,
        buyRow,
      ],
    }),
    coordinates.element,
  );
  paintCatalogue();
  paintArmed();
  paintBuy();

  function readSelection(): BuildPanelIntent | undefined {
    const buildable = selectedBuildable();
    if (buildable === undefined) return undefined;
    return {
      definitionId: buildable.definitionId,
      x: tileX,
      y: tileY,
      // A buildable that is not edge geometry still reports an edge, because
      // the command carries one shape; the simulation ignores it for anything
      // that is not a wall.
      edge,
    };
  }

  function setTarget(target: BuildPanelTarget | undefined): void {
    if (target === undefined) {
      targetValue.textContent = t(HUD_MESSAGE_KEY.buildTargetNone);
      delete targetBlock.dataset['target'];
      return;
    }
    targetValue.textContent =
      target.segments > 1
        ? t(HUD_MESSAGE_KEY.buildTargetRun, {
            x: target.x,
            y: target.y,
            edge: t(edgeLabelKey(target.edge)),
            count: target.segments,
          })
        : t(HUD_MESSAGE_KEY.buildTargetValue, { x: target.x, y: target.y, edge: t(edgeLabelKey(target.edge)) });
    targetBlock.dataset['target'] = `${target.x},${target.y},${target.edge},${target.segments}`;
  }

  return {
    element: panel.element,
    controls: [submit.element, buySubmit.element],
    submitControl: submit.element,
    purchaseControl: buySubmit.element,
    getSelection: readSelection,
    isArmed: () => armed,
    setTarget,
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
      // Leaving the tab must hand the pointer back to the camera. A tool that
      // stayed armed behind a hidden panel would swallow every click on a
      // world the player thought they were only looking at.
      if (!visible && armed) {
        armed = false;
        paintArmed();
        options.onArm(false, selectedId);
      }
    },
  };
}
