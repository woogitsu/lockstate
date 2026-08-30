export const ACCESSIBILITY_SETTINGS_VERSION = 1 as const;

export interface AccessibilitySettings {
  readonly version: typeof ACCESSIBILITY_SETTINGS_VERSION;
  readonly reducedMotion: boolean;
  readonly uiScale: number;
}

/**
 * The lowest and highest interface scale this build will honour.
 *
 * Unchanged since the record was written, and deliberately not widened by
 * #545: 0.75 is where the 11px eyebrow type stops being readable and 2 is
 * where the 900x600 viewport stops being able to hold the HUD at all. They
 * are the bounds the *stored* value is checked against, which makes them a
 * property of the persisted format rather than of the control -- a save
 * holding a number outside them is rejected, exactly as it always was.
 */
export const MIN_UI_SCALE = 0.75;
export const MAX_UI_SCALE = 2;

/**
 * The interface scales a player may choose, as multipliers.
 *
 * **Fixed steps, not a continuum** (#545, the owner's call). The cadence is
 * Minecraft's -- 25 percentage points between neighbours -- taken across the
 * band this record has always declared legal, so the steps are 75, 100, 125,
 * 150, 175 and 200 per cent. The steps below 75 that Minecraft also offers do
 * not transfer and #545 says why in the owner's own words: Minecraft's scale
 * multiplies an already-large bitmap font, where 25 per cent of this HUD's
 * 11px eyebrow text is not text any more. Offering them would also mean
 * moving `MIN_UI_SCALE`, which is a change to what a persisted record may
 * legally hold and therefore not an implementation detail.
 *
 * Every entry is a quarter, so every entry is exact in binary floating point
 * and `===` is a safe comparison against them. That is not luck -- it is why
 * the steps are expressed as multipliers here and turned into percentages for
 * display, rather than stored as percentages and divided.
 *
 * Ascending, and the whole of the vocabulary: `snapUiScaleToStep` and
 * `nextUiScaleStep` are the only two things that decide which of them a value
 * becomes, and both read this list rather than restating it.
 *
 * **This sentence named `stepUiScale` until 2026-08-29, and no such function
 * has ever existed in this file.** It is the name an earlier draft of #545 used
 * for what shipped as `nextUiScaleStep`, and it survived into this comment,
 * into `docs/INPUT.md` and into a reason string in
 * `tests/unit/ui-orchestration-boundaries.test.ts` -- three places describing
 * an API by a name that was never exported. `git log -S'export function
 * stepUiScale'` returns nothing, which is how that was settled.
 */
export const UI_SCALE_STEPS: readonly number[] = [0.75, 1, 1.25, 1.5, 1.75, 2];

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  version: ACCESSIBILITY_SETTINGS_VERSION,
  reducedMotion: false,
  uiScale: 1,
};

/**
 * The step a scale value becomes.
 *
 * This exists because the steps arrived *after* the record did. A build
 * before #545 could store any number in `[0.75, 2]`, and 0.9 was as legal as
 * 1. Rejecting such a record now would be a migration that silently discards
 * `reducedMotion` along with it -- the decoder answers `undefined` for the
 * whole record or nothing at all -- so an in-range value is **snapped to its
 * nearest step** instead: the player keeps the setting they meant, at the
 * nearest scale this build can express. Out-of-range values are still
 * refused, which is what they always were and what the format version is not
 * being spent on.
 *
 * Ties go to the **larger** step. A tie is only reachable at an exact
 * midpoint (0.875, 1.125, ...), and where the two answers are equally close
 * the accessible one is the bigger type: a player who cannot read the
 * interface is worse off than one whose panel scrolls.
 *
 * Not a `Math.round` over a step size, on purpose. That form hard-codes the
 * cadence a second time and goes wrong the day the steps stop being evenly
 * spaced; this one is a search over `UI_SCALE_STEPS` and stays correct for
 * any list.
 *
 * A value that is not a finite number is not a scale at all, and answers the
 * default rather than `NaN`.
 */
export function snapUiScaleToStep(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ACCESSIBILITY_SETTINGS.uiScale;
  let best = UI_SCALE_STEPS[0] as number;
  let bestDistance = Math.abs(value - best);
  for (const step of UI_SCALE_STEPS) {
    const distance = Math.abs(value - step);
    // `<=` and not `<`: the list ascends, so a tie is resolved in favour of
    // the later -- larger -- entry.
    if (distance <= bestDistance) {
      best = step;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One press of the scale control: the next step up, wrapping from the top back
 * to the bottom.
 *
 * **A ring, because the control is one button.** Minecraft's GUI Scale is a
 * single cycling button and this is the same control for the same reason: the
 * status strip on a 375px phone has 359px of row, the brand badge takes 225 of
 * it, and a pair of `-`/`+` tap targets with a readout between them is 127px
 * irreducible -- 7px of margin against a badge whose width grows every time
 * the patch version gains a digit. Measured, not estimated: with the pair in
 * the strip the Build panel arrived at 362px of box for 375px of content at
 * 375x812, which `app-shell.spec.ts` fails on, and with one button it is
 * 379/379 as it was before.
 *
 * The wrap is what makes one button enough. Six steps is a short ring: any
 * scale is at most five presses from any other, and the alternative -- a
 * button that stops at 200 per cent -- is a control that can be pressed into a
 * state it cannot be pressed out of.
 *
 * It snaps first, so a value that is not a step -- one restored from a build
 * that allowed any number -- advances from *its nearest step* rather than from
 * nothing. Without that, `indexOf` answers -1 and a press on a stored 0.9
 * would land on 0.75, making the interface smaller.
 */
export function nextUiScaleStep(value: number): number {
  const current = snapUiScaleToStep(value);
  const index = UI_SCALE_STEPS.indexOf(current);
  return UI_SCALE_STEPS[(index + 1) % UI_SCALE_STEPS.length] as number;
}

/**
 * Whether a scale is above the one the layout was designed at.
 *
 * A pure predicate rather than a comparison written at a call site, because it
 * is a *layout* decision and it has to be the same one in two places -- the
 * attribute the composition root stamps on `:root` and the rule in `hud.css`
 * that reads it.
 *
 * What it is for, in one measurement: the HUD's tab bar is allowed to wrap to
 * a second row, and it must be, or at 375x812 and 150 % the five tabs cannot
 * shrink below their `min-width` floors and `.hud-tabs__inner`'s own
 * `overflow: hidden` clips two of them away silently. But a flex line breaks on
 * the items' *max-content* widths, before any shrinking is considered -- so a
 * bar allowed to wrap wraps at 375x812 at **100 %** too, where shrinking would
 * have fitted it, and that cost the Rooms panel 70.2px of arrival height at a
 * viewport nobody asked to change. Measured: `app-shell.spec.ts` pins that
 * height and reported 380.9 against 451.1.
 *
 * So the wrap is gated on the player having actually asked for a larger
 * interface. At 75 % and 100 % the bar is exactly what it always was.
 */
export function isUiScaleEnlarged(value: number): boolean {
  return snapUiScaleToStep(value) > DEFAULT_ACCESSIBILITY_SETTINGS.uiScale;
}

export function decodeAccessibilitySettings(input: unknown): AccessibilitySettings | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (
    record.version !== ACCESSIBILITY_SETTINGS_VERSION ||
    typeof record.reducedMotion !== 'boolean' ||
    typeof record.uiScale !== 'number' ||
    !Number.isFinite(record.uiScale) ||
    record.uiScale < MIN_UI_SCALE ||
    record.uiScale > MAX_UI_SCALE
  ) return undefined;
  // Normalised on the way *in*, not on the way out, so every consumer of a
  // decoded record -- the control, the stylesheet, the next write back to the
  // store -- sees a legal step and no consumer has to snap for itself.
  return {
    version: ACCESSIBILITY_SETTINGS_VERSION,
    reducedMotion: record.reducedMotion,
    uiScale: snapUiScaleToStep(record.uiScale),
  };
}
