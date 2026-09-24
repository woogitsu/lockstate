/**
 * Whether a text-entry control currently owns the keyboard.
 *
 * `docs/INPUT.md` has always said that `text-entry` being absent from the world
 * action defaults "prevent[s] game controls from firing while a text field owns
 * input". The first half was true -- no default binding lists `'text-entry'`,
 * and `KeyboardInputAdapter.isActive` intersects a binding's contexts with the
 * active set, so such a binding is skipped. The second half was false, because
 * nothing ever put `'text-entry'` in the active set: the scene supplied a
 * literal `() => ['world']`, so of the four declared contexts exactly one was
 * ever active, forever (issue #201).
 *
 * Measured before this existed: a real `<input>` was focused and received the
 * character `"d"`, **and** the camera panned 249.6 world units at the same time.
 * Both happened. The Build panel's two numeric fields
 * (`src/ui/hud/build-panel.ts`) are the exposure today -- a player typing
 * coordinates watches the world scroll out from under them -- and
 * `inputmode="numeric"` means a phone has the soft keyboard up while
 * `WASD`-shaped taps reach the camera.
 *
 * The document is a parameter so this is unit-testable headlessly, which is the
 * point of the `activeContexts` seam. It defaults to the ambient one because the
 * only production caller has no reason to name it.
 *
 * This also includes a native `<select>`: the Build category filter changes
 * option with the arrow keys. Letting the same arrow reach the world camera
 * moves the map while the player is choosing a category. Ordinary buttons do
 * not consume those keys and must leave the camera available.
 */
function browserDocument(): Document | undefined {
  return globalThis.document;
}

export function isTextEntryFocused(doc: Pick<Document, 'activeElement'> | undefined = browserDocument()): boolean {
  const active = doc?.activeElement;
  if (active === null || active === undefined) return false;

  // `isContentEditable` is a property of `HTMLElement` and is absent on, say, an
  // SVG element that can also hold focus -- so it is read defensively rather
  // than asserted, and a missing property reads as "not editable".
  const editable = (active as { readonly isContentEditable?: boolean }).isContentEditable;
  if (editable === true) return true;

  const tag = active.tagName;
  if (tag === undefined) return false;
  const name = tag.toLowerCase();
  return name === 'input' || name === 'textarea' || name === 'select';
}

/** A native modal owns keyboard input until it closes, even when its focused child is a button. */
export function isModalDialogOpen(
  doc: { querySelector(selector: string): Element | null } | undefined = browserDocument(),
): boolean {
  if (doc === undefined) return false;
  return doc.querySelector('dialog:modal') !== null;
}
