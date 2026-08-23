import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { createActionButton } from '../primitives/action-button';
import { createChoiceGroup, type ChoiceGroup } from '../primitives/choice-group';
import { createCollapsibleSection } from '../primitives/collapsible-section';
import { element, eyebrowText } from '../primitives/dom';
import { createListRow, type ListRow } from '../primitives/list-row';
import { createNumberField, type NumberField } from '../primitives/number-field';
import { createPanel } from '../primitives/panel';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudBuildEdge, HudBuildViewModel, HudLocalizer } from './view-model';

/**
 * The Build panel: the surface that makes building reachable.
 *
 * It is a *composer*, not a source of truth. It holds three pieces of local
 * chrome state -- which buildable is selected, which tile, which edge -- and
 * turns a tap on "Place order" into one `place-build-order` intent for the
 * host. It never touches the world, never inspects a snapshot and imports
 * nothing from `src/simulation/**`.
 *
 * Placement is by coordinate rather than by clicking the world. Picking a
 * tile off the canvas is renderer and input work (camera projection, pointer
 * capture, remapping -- `docs/INPUT.md`), and wiring it here would put input
 * orchestration inside a view. Two number fields make the feature reachable
 * today with controls that already work on touch, and leave the eventual
 * pick-on-map path free to feed the same intent.
 */

export interface BuildPanelIntent {
  readonly definitionId: string;
  readonly x: number;
  readonly y: number;
  readonly edge: HudBuildEdge;
}

export interface BuildPanelOptions {
  readonly localizer: HudLocalizer;
  readonly model: HudBuildViewModel;
  readonly onPlace: (intent: BuildPanelIntent) => void;
}

export interface BuildPanel {
  readonly element: HTMLElement;
  /**
   * The controls to disable while a command is in flight — the submit button,
   * and nothing else.
   *
   * Choosing a buildable, nudging a coordinate and picking an edge are
   * *chrome*: they change what the next order would say and ask the host for
   * nothing. Disabling them alongside the command would drop interactions
   * that have nothing to do with the host, which is the same mistake
   * `dispatchShell` exists to avoid for tabs and panels. Observed while
   * driving the real panel: three taps issued in one turn after "Place order"
   * were all swallowed.
   */
  readonly controls: readonly (HTMLButtonElement | HTMLInputElement)[];
  /** Current selection, exposed so a test can assert it without reading the DOM. */
  getSelection(): BuildPanelIntent | undefined;
  setVisible(visible: boolean): void;
}

const EDGE_LABEL_KEY: Readonly<Record<HudBuildEdge, LocalizationKey>> = {
  north: HUD_MESSAGE_KEY.buildEdgeNorth,
  west: HUD_MESSAGE_KEY.buildEdgeWest,
};

export function createBuildPanel(options: BuildPanelOptions): BuildPanel {
  const { localizer, model } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let selectedId = model.buildables[0]?.definitionId;
  let tileX = Math.trunc(model.origin.x);
  let tileY = Math.trunc(model.origin.y);
  let edge: HudBuildEdge = 'north';

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

  const catalogue = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.buildCatalogue),
    onToggle: (collapsed) => catalogue.setCollapsed(collapsed),
  });
  catalogue.body.append(catalogueList);

  // ---- where --------------------------------------------------------
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
    options: (Object.keys(EDGE_LABEL_KEY) as HudBuildEdge[]).map((id) => ({
      id,
      label: t(EDGE_LABEL_KEY[id]),
    })),
    selectedId: edge,
    onSelect: (id) => {
      edge = id as HudBuildEdge;
      edgeChoice.setSelected(id);
    },
  });

  const placement = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.buildPlacement),
    onToggle: (collapsed) => placement.setCollapsed(collapsed),
  });
  placement.body.append(
    element('div', { className: 'hud-build__coords', children: [xField.element, yField.element] }),
    edgeChoice.element,
  );

  function paintPlacement(): void {
    // The edge chooser is hidden, not disabled, for a buildable that does not
    // sit on an edge: a disabled control still claims the setting exists.
    edgeChoice.element.hidden = selectedBuildable()?.occupiesEdge !== true;
  }
  paintPlacement();

  // ---- submit -------------------------------------------------------
  const submit = createActionButton({
    label: t(HUD_MESSAGE_KEY.buildSubmit),
    tone: 'primary',
    icon: 'build',
    disabled: selectedId === undefined,
    onActivate: () => {
      const intent = readSelection();
      if (intent === undefined) return;
      options.onPlace(intent);
    },
  });

  const footer = element('div', {
    className: 'hud-build__footer',
    children: [submit.element, eyebrowText(t(HUD_MESSAGE_KEY.buildNote), 'hud-build__note')],
  });

  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.buildTitle),
    icon: 'build',
    className: 'hud-build',
  });
  panel.body.append(catalogue.element, placement.element, footer);
  paintCatalogue();

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

  return {
    element: panel.element,
    controls: [submit.element],
    getSelection: readSelection,
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
    },
  };
}
