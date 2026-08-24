import type { LocalizationKey } from '../../content/localization';
import { deriveSimulationMessageKey } from '../../content/simulation-message-keys';
import type { MessageParameters } from '../../services/localization/format';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { createChoiceGroup, type ChoiceGroup } from '../primitives/choice-group';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { element, eyebrowText, valueText } from '../primitives/dom';
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
 * ### Boundaries
 *
 * It is a *composer*, not a source of truth. It holds which buildable is
 * selected, which tile the numeric route names, and whether the map is armed;
 * it turns those into intents. It never touches the world, never inspects a
 * snapshot, and imports nothing from `src/simulation/**`.
 */

export interface BuildPanelIntent {
  readonly definitionId: string;
  readonly x: number;
  readonly y: number;
  readonly edge: HudBuildEdge;
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
}

export interface BuildPanel {
  readonly element: HTMLElement;
  /**
   * The controls to disable while a command is in flight — the numeric
   * route's submit button, and nothing else.
   *
   * Choosing a buildable, nudging a coordinate, picking an edge and arming
   * the map are *chrome*: they change what the next order would say and ask
   * the host for nothing. Disabling them alongside the command would drop
   * interactions that have nothing to do with the host, which is the same
   * mistake `dispatchShell` exists to avoid for tabs and panels. Observed
   * while driving the real panel: three taps issued in one turn after "Place
   * order" were all swallowed.
   */
  readonly controls: readonly (HTMLButtonElement | HTMLInputElement)[];
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

  const selectedBuildable = () => model.buildables.find((entry) => entry.definitionId === selectedId);

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
    element('div', { className: 'hud-build__map', children: [armButton.element, targetBlock, armHint] }),
    coordinates.element,
  );
  paintCatalogue();
  paintArmed();

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
    controls: [submit.element],
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
