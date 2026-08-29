/**
 * The smallest possible DOM helpers.
 *
 * `AGENTS.md` forbids adding a dependency for trivial functionality, so
 * there is no view library here and there will not be one: the UI layer
 * builds real elements exactly as `src/ui/save-panel.ts` already does. These
 * helpers exist only to keep the primitives free of six-line
 * `createElement` / `className` / `append` incantations.
 */

/** Elements a primitive is allowed to create. Keeps the tag/type mapping honest. */
export type TagName = keyof HTMLElementTagNameMap;

export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly dataset?: Readonly<Record<string, string>>;
  readonly children?: readonly Node[];
}

export function element<K extends TagName>(tag: K, options: ElementOptions = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {})) node.setAttribute(name, value);
  for (const [name, value] of Object.entries(options.dataset ?? {})) node.dataset[name] = value;
  if (options.children !== undefined) node.append(...options.children);
  return node;
}

/**
 * A number destined for the screen. Always monospace with tabular figures --
 * a counter that changes width as it counts makes a dense status strip
 * twitch, so this is a rule rather than a preference.
 */
export function valueText(text: string, extraClassName?: string): HTMLSpanElement {
  return element('span', {
    className: extraClassName === undefined ? 'ui-value' : `ui-value ${extraClassName}`,
    text,
  });
}

/** A small-caps section label: 11px, wide tracking, muted. Never carries meaning on its own. */
export function eyebrowText(text: string, extraClassName?: string): HTMLSpanElement {
  return element('span', {
    className: extraClassName === undefined ? 'ui-eyebrow' : `ui-eyebrow ${extraClassName}`,
    text,
  });
}

/**
 * Text that exists only for assistive technology.
 *
 * Used to give a control a full sentence when its visible label is a glyph
 * or an abbreviation. It is an *addition* to a visible affordance, never the
 * only carrier of a meaning: touch has no hover, so a tooltip-only label is
 * an unreachable label.
 */
export function screenReaderText(text: string): HTMLSpanElement {
  return element('span', { className: 'ui-sr-only', text });
}

let idCounter = 0;

/**
 * A unique element id, for `aria-controls` / `aria-labelledby` pairs.
 *
 * Process-local and monotonic rather than random: two HUDs mounted in one
 * document (a test harness, a future split view) must not collide, and a
 * deterministic id keeps a DOM snapshot readable.
 */
export function nextUiId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Removes a node from its parent if it has one. Safe to call twice. */
export function detach(node: Node): void {
  node.parentNode?.removeChild(node);
}

/**
 * Adds `id` to a control's `aria-describedby`, keeping whatever was already
 * there.
 *
 * `aria-describedby` is a *list* of ids, and a control can have more than one
 * thing worth saying about it at once. The HUD's refusal band writes one of
 * them (`hud.ts`, `markControl`); a panel that keeps a standing note beside a
 * control writes another. Whoever wrote last used to win, because both sides
 * called `setAttribute`, and the loser's sentence became unreachable to a
 * screen reader while staying perfectly visible on screen -- the failure mode
 * that is hardest to notice, since sighted testing cannot see it.
 *
 * Idempotent, so a repaint that re-describes the same control does not grow
 * the list. Order is insertion order, which is the order a screen reader
 * reads the descriptions in.
 */
export function describeBy(control: Element, id: string): void {
  const present = (control.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter((token) => token !== '');
  if (present.includes(id)) return;
  present.push(id);
  control.setAttribute('aria-describedby', present.join(' '));
}

/**
 * Removes `id` from a control's `aria-describedby`, leaving the rest.
 *
 * The attribute is removed outright once nothing is left, rather than left as
 * an empty string: `aria-describedby=""` is not the same as absent to every
 * assistive technology, and an empty list is what "nothing describes this"
 * means.
 */
export function undescribeBy(control: Element, id: string): void {
  const remaining = (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/u)
    .filter((token) => token !== '' && token !== id);
  if (remaining.length === 0) {
    control.removeAttribute('aria-describedby');
    return;
  }
  control.setAttribute('aria-describedby', remaining.join(' '));
}
