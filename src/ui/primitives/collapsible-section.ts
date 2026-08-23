import { element, eyebrowText, nextUiId } from './dom';
import { createIcon } from './icon';

/**
 * A small-caps eyebrow, a chevron, and a body that folds away.
 *
 * The whole header row is the button, not just the chevron: on a touch
 * screen a 16px glyph is not a target. The chevron rotates via a data
 * attribute, so the open/closed state is inspectable in the DOM and
 * assertable in a test rather than living only in a CSS class name.
 *
 * The section is **controlled**: a click reports the state it wants and
 * changes nothing. The owner decides, and calls `setCollapsed`. Letting the
 * widget flip itself as well would make the DOM a second source of truth
 * beside the state machine, and the two would drift the first time an
 * update was rejected or applied from elsewhere.
 */
export interface CollapsibleSectionOptions {
  readonly eyebrow: string;
  /** Receives the state the user asked for. Nothing changes until `setCollapsed` is called. */
  readonly onToggle: (collapsed: boolean) => void;
  readonly collapsed?: boolean;
  /** Optional trailing element in the header -- typically a count badge. */
  readonly trailing?: HTMLElement;
}

export interface CollapsibleSection {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  /** The header button, for an owner that needs to disable or focus it. */
  readonly header: HTMLButtonElement;
  setCollapsed(collapsed: boolean): void;
  isCollapsed(): boolean;
}

export function createCollapsibleSection(options: CollapsibleSectionOptions): CollapsibleSection {
  const bodyId = nextUiId('ui-section-body');
  const chevron = createIcon('chevron', 'sm');
  chevron.classList.add('ui-section__chevron');

  const headerChildren: Node[] = [chevron, eyebrowText(options.eyebrow, 'ui-section__eyebrow')];
  if (options.trailing !== undefined) headerChildren.push(options.trailing);

  const header = element('button', {
    className: 'ui-section__header',
    attributes: { type: 'button', 'aria-controls': bodyId },
    children: headerChildren,
  });

  const body = element('div', { className: 'ui-section__body', attributes: { id: bodyId } });
  const root = element('div', { className: 'ui-section', children: [header, body] });

  let collapsed = options.collapsed ?? false;

  const apply = (): void => {
    root.dataset['collapsed'] = collapsed ? 'true' : 'false';
    header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    body.hidden = collapsed;
  };
  apply();

  header.addEventListener('click', () => {
    options.onToggle(!collapsed);
  });

  return {
    element: root,
    body,
    header,
    setCollapsed(next: boolean): void {
      if (next === collapsed) return;
      collapsed = next;
      apply();
    },
    isCollapsed(): boolean {
      return collapsed;
    },
  };
}
