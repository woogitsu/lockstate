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
  /**
   * A control that sits **beside** the header button rather than inside it
   * ([ADR 0035](../../../docs/adr/0035-buildable-catalogue-category-filter.md)).
   *
   * `trailing` above puts a node *inside* the header, which is a `<button>`,
   * so it can only ever carry something inert -- a count badge, a status dot.
   * An interactive control nested in a button is not reachable as itself: the
   * outer button swallows the press, and nesting interactive content is
   * invalid HTML besides. So a control gets a slot of its own, as a sibling,
   * and the two share one 44px row.
   *
   * **Sharing the row is the whole point of the slot.** A control placed above
   * or below a section costs the layout its own tap target; a control on the
   * header row costs nothing at all, because the header's 44px is already in
   * every height budget that sums this section. That is what made a filter
   * affordable in the Build panel, whose catalogue had 7.8px of slack at
   * 900x600 and none at all with a queue (ADR 0031 decision 3).
   *
   * Present or absent changes the section's DOM shape: with an action the
   * header button is wrapped in `.ui-section__header-row`, so a selector
   * written as `.ui-section > .ui-section__header` stops matching. Only the
   * sections that pass one are affected, which is why this is opt-in rather
   * than the shape every section has.
   */
  readonly headerAction?: HTMLElement;
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
  const headerSlot =
    options.headerAction === undefined
      ? header
      : element('div', { className: 'ui-section__header-row', children: [header, options.headerAction] });
  const root = element('div', { className: 'ui-section', children: [headerSlot, body] });

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
