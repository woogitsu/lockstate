import { element, nextUiId } from './dom';
import { type IconId, createIcon } from './icon';
import { createIconButton } from './icon-button';

/**
 * The shell every HUD surface sits in: one hairline border, one background
 * step, a header carrying the title and an optional collapse control.
 *
 * Separation is the hairline and the step, and nothing else -- no shadow, no
 * glow, no bevel.
 */
export interface PanelCollapseOptions {
  /** Label for the control when it will collapse the panel. */
  readonly collapseLabel: string;
  /** Label for the control when it will expand the panel. */
  readonly expandLabel: string;
  readonly onToggle: () => void;
  readonly collapsed?: boolean;
}

export interface PanelOptions {
  readonly title: string;
  readonly icon?: IconId;
  readonly collapse?: PanelCollapseOptions;
  readonly className?: string;
}

export interface Panel {
  readonly element: HTMLElement;
  /** Where content goes. Hidden, not merely unstyled, while collapsed. */
  readonly body: HTMLElement;
  /** The collapse control, when there is one, for an owner that needs to disable or focus it. */
  readonly toggle: HTMLButtonElement | undefined;
  setTitle(text: string): void;
  setCollapsed(collapsed: boolean): void;
}

export function createPanel(options: PanelOptions): Panel {
  const bodyId = nextUiId('ui-panel-body');
  const title = element('h2', { className: 'ui-panel__title', text: options.title });
  const headerChildren: Node[] = [];
  if (options.icon !== undefined) headerChildren.push(createIcon(options.icon, 'sm'));
  headerChildren.push(title);

  const collapse = options.collapse;
  const toggle =
    collapse === undefined
      ? undefined
      : createIconButton({
          icon: 'chevron',
          label: collapse.collapsed === true ? collapse.expandLabel : collapse.collapseLabel,
          onActivate: collapse.onToggle,
          size: 'sm',
        });
  if (toggle !== undefined) {
    toggle.element.classList.add('ui-panel__toggle');
    toggle.element.setAttribute('aria-controls', bodyId);
    headerChildren.push(toggle.element);
  }

  const header = element('header', { className: 'ui-panel__header', children: headerChildren });
  const body = element('div', { className: 'ui-panel__body', attributes: { id: bodyId } });

  const root = element('section', {
    className: options.className === undefined ? 'ui-panel' : `ui-panel ${options.className}`,
    children: [header, body],
  });
  root.setAttribute('aria-label', options.title);

  const setCollapsed = (collapsed: boolean): void => {
    root.dataset['collapsed'] = collapsed ? 'true' : 'false';
    body.hidden = collapsed;
    if (toggle === undefined || collapse === undefined) return;
    toggle.element.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setLabel(collapsed ? collapse.expandLabel : collapse.collapseLabel);
  };
  setCollapsed(collapse?.collapsed ?? false);

  return {
    element: root,
    body,
    toggle: toggle?.element,
    setTitle(text: string): void {
      title.textContent = text;
      root.setAttribute('aria-label', text);
    },
    setCollapsed,
  };
}
