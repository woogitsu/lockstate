/**
 * Giving the keyboard back to the control a change took it from.
 *
 * Two things in this interface take focus away from a control without the
 * player asking, and both do it as a side effect of something else:
 *
 *   1. **Disabling it.** `createBusyGroup` sets `disabled` on every control
 *      that issues a command for as long as one is in flight
 *      (`src/ui/primitives/async-action.ts`). A disabled element cannot hold
 *      focus, so the browser blurs it to `<body>` -- and re-enabling it a
 *      moment later does not undo that.
 *   2. **Hiding it.** The Rooms panel's confirm row swaps two controls for two
 *      others the instant the rectangle is taken (`paintActions` in
 *      `src/ui/hud/rooms-panel.ts`), and `hidden` blurs exactly the same way.
 *
 * A player using a pointer never notices either: their hand is already where
 * the next control is. A player on the keyboard loses the only position they
 * have. So the rule is one sentence, and the whole of this module is that
 * sentence made checkable: **give back the focus you took, to a control that
 * can take it, and only while nobody else has claimed it.**
 *
 * ### Why it is a module and not four lines inside each caller
 *
 * `vitest.config.ts` runs in `environment: 'node'` with no jsdom, so anything
 * that reads `document` from inside a listener is a decision the unit suite
 * cannot reach at all -- the argument `roving-focus.ts` makes one file over,
 * and the reason `orderPrisonsForDisplay` exists. Every predicate here takes
 * what it inspects as a parameter and the shapes are structural, so the rules
 * are node-testable and only the *wiring* needs a browser.
 *
 * Nothing here queries the document for a control. It is only ever handed one.
 */

/**
 * Anything focus can be given back to.
 *
 * Deliberately structural and deliberately all-optional: `HTMLButtonElement`
 * and `HTMLInputElement` satisfy it as written, and so does a test stub that
 * models only the part of the state a case is about. A control with no
 * `focus` method is simply never focused -- absence answers "no" rather than
 * throwing, because the caller's alternative would be a cast.
 */
export interface FocusableControl {
  readonly disabled?: boolean | undefined;
  /**
   * `boolean | 'until-found'` rather than `boolean`, because that is what
   * `HTMLElement.hidden` is: `hidden="until-found"` hides the element until
   * find-in-page or a fragment navigation reveals it, and it cannot hold focus
   * while it is hidden either. Anything other than `false` counts as hidden.
   */
  readonly hidden?: boolean | 'until-found' | undefined;
  readonly isConnected?: boolean | undefined;
  focus?: (() => void) | undefined;
}

/**
 * Where the keyboard is.
 *
 * A structural port rather than `Document` itself, for the reason
 * `isTextEntryFocused` takes a `Pick<Document, 'activeElement'>`
 * (`src/input/focus.ts`): the decision is then testable headlessly, and the
 * real `Document` satisfies it as written. `body` is here because the answer
 * this module needs is not "what has focus" but "has anything claimed it",
 * and a browser that blurs a control parks focus on the body element.
 */
export interface FocusOwner {
  readonly activeElement: unknown;
  readonly body?: unknown;
}

/**
 * The ambient document, or `undefined` where there is none.
 *
 * Read through `globalThis` rather than named directly so that importing this
 * module in the `node` unit environment cannot throw, which is the whole
 * reason the predicates below are reachable from `pnpm test`.
 */
export function ambientFocusOwner(): FocusOwner | undefined {
  return (globalThis as { document?: FocusOwner }).document;
}

/** Whether `control` is the thing currently holding the keyboard. */
export function holdsFocus(owner: FocusOwner | undefined, control: unknown): boolean {
  if (owner === undefined || control === undefined || control === null) return false;
  return owner.activeElement === control;
}

/**
 * Whether the keyboard is going spare -- nothing holds it, or the body does.
 *
 * This is the guard that stops a restore from becoming a theft. A control
 * blurred by `disabled` or `hidden` leaves focus on the body, and *that* is
 * focus this module took and may give back. Focus on any other element is
 * somewhere a player put it -- they tabbed away while the request was in
 * flight -- and moving it would be a worse bug than the one being fixed.
 */
export function keyboardIsUnclaimed(owner: FocusOwner | undefined): boolean {
  if (owner === undefined) return false;
  const active = owner.activeElement;
  if (active === null || active === undefined) return true;
  return active === owner.body;
}

/**
 * Whether focus can actually land on `control`.
 *
 * Three states make a control unfocusable and each of them really happens
 * here: it was rebuilt and the remembered one is detached (`isConnected`), the
 * panel hid it as part of the same change (`hidden`), or it is still disabled
 * for a reason of its own -- the Staff panel's *Hire* with no role chosen
 * (`src/ui/hud/staff-panel.ts`). A missing property reads as "not in that
 * state", so a stub that models none of them is focusable.
 *
 * It is a filter and not a proof: an element inside a hidden ancestor passes
 * every check here and the browser still refuses it. That is why the callers
 * treat a failed hand-off as "leave focus where it is" rather than as
 * something to detect -- the cost of being wrong is the state we were already
 * in.
 */
export function canTakeFocus(control: FocusableControl | undefined): boolean {
  if (control === undefined) return false;
  if (control.disabled === true) return false;
  if (control.hidden !== undefined && control.hidden !== false) return false;
  if (control.isConnected === false) return false;
  return typeof control.focus === 'function';
}

/**
 * Puts the keyboard on `control` if it can hold it, and answers whether it
 * did.
 *
 * The return value is not decoration: a caller with a second choice can try
 * it, and a test can tell "focused it" from "declined to" without a document.
 */
export function handOffFocus(control: FocusableControl | undefined): boolean {
  if (!canTakeFocus(control)) return false;
  control?.focus?.();
  return true;
}
