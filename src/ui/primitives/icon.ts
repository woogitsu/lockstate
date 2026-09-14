/**
 * Flat, single-weight line glyphs.
 *
 * Every icon is one 24x24 viewBox drawn with strokes only -- no fills, no
 * two-tone shapes, no gradients -- rendered in `currentColor` at 16-20px and
 * set inline with text. An icon is never decorative and never the only
 * carrier of a meaning: it always sits beside a label or, where the control
 * is glyph-only, beside screen-reader text.
 *
 * Paths are data, not code. Adding an icon is a new entry in `ICON_PATHS`.
 */

export const ICON_IDS = [
  'prisoners',
  'staff',
  'rooms',
  'incident',
  'contraband',
  'clock',
  'pause',
  'play',
  'fast-forward',
  'chevron',
  'minimap',
  'overview',
  'build',
  'security',
  'regime',
  'check',
  'brand',
  'ui-scale',
  'theme',
  'dismiss',
  'zoom-in',
  'zoom-out',
] as const;

export type IconId = (typeof ICON_IDS)[number];

export type IconSize = 'sm' | 'md' | 'lg';

const ICON_PATHS: Readonly<Record<IconId, readonly string[]>> = {
  prisoners: ['M12 4.75a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5Z', 'M4.75 19.75a7.25 7.25 0 0 1 14.5 0'],
  staff: [
    'M9.25 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
    'M3.25 19.25a6 6 0 0 1 12 0',
    'M15.75 5.75a2.75 2.75 0 0 1 0 5.5',
    'M17 19.25a6 6 0 0 0-2.75-5.05',
  ],
  rooms: ['M3.75 4.75h16.5v14.5H3.75z', 'M3.75 12h6.75', 'M10.5 12v7.25'],
  incident: ['M12 4.5 20.75 19.5H3.25z', 'M12 10v3.75', 'M12 16.75h.01'],
  contraband: ['M8.25 8.25V6.5a3.75 3.75 0 0 1 7.5 0v1.75', 'M4.75 8.25h14.5v11h-14.5z'],
  clock: ['M12 4.25a7.75 7.75 0 1 1 0 15.5 7.75 7.75 0 0 1 0-15.5Z', 'M12 7.75V12l2.75 1.75'],
  pause: ['M9.5 5.75v12.5', 'M14.5 5.75v12.5'],
  play: ['M8.25 5.5 18.25 12l-10 6.5z'],
  'fast-forward': ['M4.25 5.75 11 12l-6.75 6.25z', 'M13 5.75 19.75 12 13 18.25z'],
  chevron: ['M6.5 9.75 12 15.25l5.5-5.5'],
  minimap: ['M9 4.75 3.75 7v12.25L9 17l6 2.25 5.25-2.25V4.75L15 7z', 'M9 4.75V17', 'M15 7v12.25'],
  overview: ['M4.25 4.25h6v6h-6z', 'M13.75 4.25h6v6h-6z', 'M4.25 13.75h6v6h-6z', 'M13.75 13.75h6v6h-6z'],
  build: ['M3.75 5.75h16.5v12.5H3.75z', 'M3.75 12h16.5', 'M9.25 5.75V12', 'M14.75 12v6.25'],
  security: ['M12 3.75 19.75 6.5v5.75c0 4-3.1 6.9-7.75 8.1-4.65-1.2-7.75-4.1-7.75-8.1V6.5z'],
  regime: ['M3.75 6.25h16.5v13.5H3.75z', 'M3.75 10.5h16.5', 'M8.5 3.75v4.5', 'M15.5 3.75v4.5'],
  check: ['M5.25 12.5 10 17.25 18.75 6.75'],
  // The `x` on a dismissable alert row (ADR 0084 decision 3, the owner's, and
  // their ruling of the same day that the control is its own element rather
  // than the whole row). Two strokes on the same 24-unit grid and the same
  // 4.75/19.25 inset every other glyph here uses, so it reads at
  // `--icon-size-sm` beside `incident` on the row it sits on. Deliberately not
  // a glyph from a font: `createIcon` draws paths, and a literal x would be a
  // character a locale might not have and a screen reader would announce.
  dismiss: ['M6.75 6.75 17.25 17.25', 'M17.25 6.75 6.75 17.25'],
  // Interface scale (#545): a large letterform beside a small one, which is
  // the glyph a player already reads as "text size" everywhere else. Strokes
  // only, like every other entry -- two strokes per letter, the stem pair and
  // the crossbar, so it stays legible at 16px.
  // The theme (#1157): a circle with one half struck through, the glyph a
  // player already reads as "contrast" or "appearance". Strokes only, like
  // every other entry -- the outline plus three chords across one half, which
  // reads as a filled half at 16px without needing a fill this icon set does
  // not use. Not a sun and not a moon: the control offers three values and one
  // of them is "follow the device", which neither of those glyphs can mean.
  theme: [
    'M12 4.25a7.75 7.75 0 1 1 0 15.5 7.75 7.75 0 0 1 0-15.5Z',
    'M12 4.25v15.5',
    'M12 7.5h5.9',
    'M12 12h7.7',
    'M12 16.5h5.9',
  ],
  'ui-scale': [
    'M3.25 18.75 8 5.25l4.75 13.5',
    'M4.9 14.25h6.2',
    'M14.75 18.75 17.75 10l3 8.75',
    'M15.8 16.1h3.9',
  ],
  // The wordmark's mark: a padlock, shackle above a body, with a keyway. The
  // same 24x24 stroke-only rule as every other entry, so the brand mark scales
  // and recolours with the text beside it instead of being a bitmap that has to
  // be shipped, LFS-tracked and validated by the atlas pipeline.
  //
  // Deliberately not the `contraband` padlock, which this resembles. Two ids
  // pointing at one path would make a content sweep read the brand as a
  // contraband indicator, and the shapes want to diverge: `contraband` is a
  // closed lock and this one is the identity of the game.
  // The camera zoom, in the HUD's bottom-left corner (issue #1023). A
  // magnifier -- circle and handle -- with a plus or a minus across it, which
  // is the glyph a player already reads as "zoom" in a map, a document viewer
  // and a photo library.
  //
  // Strokes only and on the same 24-unit grid as every other entry, so the
  // pair sits at `--icon-size-md` beside the transport controls' own glyphs.
  // Deliberately not the characters `+` and `-`: `dismiss` above records why
  // (a literal character is one a locale might not have and a screen reader
  // would announce), and the two buttons carry their words in
  // `screenReaderText` instead.
  //
  // The circle and the handle are byte-identical between the two, so the only
  // difference on screen is the bar the player is being asked about.
  'zoom-in': [
    'M10.5 4.75a5.75 5.75 0 1 1 0 11.5 5.75 5.75 0 0 1 0-11.5Z',
    'M14.85 14.85 19.25 19.25',
    'M7.75 10.5h5.5',
    'M10.5 7.75v5.5',
  ],
  'zoom-out': [
    'M10.5 4.75a5.75 5.75 0 1 1 0 11.5 5.75 5.75 0 0 1 0-11.5Z',
    'M14.85 14.85 19.25 19.25',
    'M7.75 10.5h5.5',
  ],
  brand: [
    'M8 10.25V7.5a4 4 0 0 1 8 0v2.75',
    'M5.75 10.25h12.5v9.5H5.75z',
    'M12 13.5v3',
  ],
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Builds an icon.
 *
 * The result is `aria-hidden` by default: the accessible name belongs to the
 * label or the screen-reader text beside it, so exposing the glyph as well
 * would make every control announce itself twice.
 */
export function createIcon(id: IconId, size: IconSize = 'sm'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', `ui-icon ui-icon--${size}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset['icon'] = id;

  for (const definition of ICON_PATHS[id]) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', definition);
    svg.append(path);
  }
  return svg;
}

export function isIconId(value: string): value is IconId {
  return (ICON_IDS as readonly string[]).includes(value);
}
