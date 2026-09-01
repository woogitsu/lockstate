import { type MessageCatalog, type MessageEntry, buildMessageCatalog } from './catalog';
import { createPlaceholderPattern } from './format';
import { PSEUDO_LOCALE } from './locale';

/**
 * Pseudo-localization is a test tool, not a language (ADR 0011). Running
 * the UI in `en-XA` exposes three classes of bug before a translator is
 * paid: strings hard-coded outside the catalog (they stay unaccented),
 * layouts that cannot survive longer text (the expansion padding), and
 * broken interpolation (placeholders are preserved exactly, so a mangled
 * one is obvious).
 *
 * ## Why an interpolated parameter is marked (#664)
 *
 * The transform's central promise is that **no character of a
 * catalogue-derived string is an ASCII letter**, so every ASCII word left on
 * a pseudo-localized screen is text that never went through the catalogue.
 * `ACCENTS` below maps all 52 ASCII letters and the padding is `·`, so that
 * held -- for the *template*. It did not hold for what the player reads,
 * because a `{placeholder}` is copied through unaccented and the *value*
 * substituted into it is ordinary English.
 *
 * That cost the 2026-08-30 sweep its sharpest finding twice over
 * (`docs/research/2026-08-30-what-stays-readable-under-the-pseudo-locale.md`):
 * a detector that deleted `⟦ … ⟧` spans scored
 * `⟦Çóúļđ ñóţ çřéáţé á ƥříšóñ: Simulation worker fault (…)⟧` as clean, and
 * the detector that replaced it -- every ASCII word anywhere is a finding --
 * cannot say which of the three classes a word belongs to. A legitimate
 * parameter and a hard-coded label look identical.
 *
 * So the placeholder span is copied through byte-for-byte, as ADR 0011
 * requires, and `⟨ ⟩` is written *around* it. After interpolation the value
 * sits inside those markers, which makes the three classes separable by
 * inspection and by machine: ASCII inside `⟨ ⟩` is a parameter, ASCII
 * elsewhere inside `⟦ ⟧` is a fragment concatenated into a localized
 * message, and ASCII outside both never reached the catalogue at all.
 * `tests/helpers/pseudo-locale-residue.ts` is that classifier.
 */

const ACCENTS: Readonly<Record<string, string>> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'đ', e: 'é', f: 'ƒ', g: 'ğ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ó', p: 'ƥ', q: 'ɋ', r: 'ř', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Đ', E: 'É', F: 'Ƒ', G: 'Ğ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ó', P: 'Ƥ', Q: 'Ɋ', R: 'Ř', S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/** Bracketing makes truncation visible: a clipped string loses its closing marker. */
export const PSEUDO_START_MARKER = '⟦';
export const PSEUDO_END_MARKER = '⟧';
export const PSEUDO_PADDING_CHARACTER = '·';

/**
 * Wrapped around a `{placeholder}` span, so the value substituted into it is
 * distinguishable from text that never reached the catalogue. Deliberately
 * not `⟦ ⟧`: a reader and a detector both have to tell a parameter from a
 * message, and reusing the message markers would make the two nest
 * indistinguishably.
 *
 * Exported because a detector that re-declares them is a second copy of a
 * scanning rule, which is how #188 happened.
 */
export const PSEUDO_PARAMETER_START_MARKER = '⟨';
export const PSEUDO_PARAMETER_END_MARKER = '⟩';

export const DEFAULT_PSEUDO_EXPANSION = 0.35;

function accentSegment(segment: string): string {
  let result = '';
  for (const character of segment) result += ACCENTS[character] ?? character;
  return result;
}

/**
 * Accents letters, pads to simulate translation growth and brackets the
 * result -- while copying `{placeholder}` spans through byte-for-byte,
 * because an accented placeholder name would simply fail to interpolate and
 * prove nothing. Each span is wrapped in `⟨ ⟩` so the value that replaces it
 * is attributable; see the module comment.
 */
export function pseudoLocalizeText(text: string, expansion: number = DEFAULT_PSEUDO_EXPANSION): string {
  const pattern = createPlaceholderPattern();
  let transformed = '';
  let lastIndex = 0;

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    transformed += accentSegment(text.slice(lastIndex, match.index));
    transformed += `${PSEUDO_PARAMETER_START_MARKER}${match[0]}${PSEUDO_PARAMETER_END_MARKER}`;
    lastIndex = match.index + match[0].length;
  }
  transformed += accentSegment(text.slice(lastIndex));

  const paddingLength = Math.ceil([...text].length * Math.max(0, expansion));
  return `${PSEUDO_START_MARKER}${transformed}${PSEUDO_PADDING_CHARACTER.repeat(paddingLength)}${PSEUDO_END_MARKER}`;
}

function pseudoLocalizeEntry(entry: MessageEntry, expansion: number): MessageEntry {
  if (typeof entry === 'string') return pseudoLocalizeText(entry, expansion);
  const forms: Record<string, string> = { other: pseudoLocalizeText(entry.other, expansion) };
  for (const category of ['zero', 'one', 'two', 'few', 'many'] as const) {
    const form = entry[category];
    if (form !== undefined) forms[category] = pseudoLocalizeText(form, expansion);
  }
  return forms as MessageEntry;
}

/**
 * Derives the pseudo-locale mechanically from the source catalog, so it
 * can never drift out of date the way a hand-maintained test locale would.
 */
export function buildPseudoLocaleCatalog(
  source: MessageCatalog,
  expansion: number = DEFAULT_PSEUDO_EXPANSION,
): MessageCatalog {
  const messages: Record<string, MessageEntry> = {};
  for (const [key, entry] of Object.entries(source.messages)) {
    messages[key] = pseudoLocalizeEntry(entry as MessageEntry, expansion);
  }
  return buildMessageCatalog(PSEUDO_LOCALE, messages);
}
