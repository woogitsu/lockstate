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
 */

const ACCENTS: Readonly<Record<string, string>> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'đ', e: 'é', f: 'ƒ', g: 'ğ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ó', p: 'ƥ', q: 'ɋ', r: 'ř', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Đ', E: 'É', F: 'Ƒ', G: 'Ğ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ó', P: 'Ƥ', Q: 'Ɋ', R: 'Ř', S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/** Bracketing makes truncation visible: a clipped string loses its closing marker. */
const START_MARKER = '⟦';
const END_MARKER = '⟧';
const PADDING_CHARACTER = '·';

export const DEFAULT_PSEUDO_EXPANSION = 0.35;

function accentSegment(segment: string): string {
  let result = '';
  for (const character of segment) result += ACCENTS[character] ?? character;
  return result;
}

/**
 * Accents letters, pads to simulate translation growth and brackets the
 * result -- while copying `{placeholder}` spans through untouched, because
 * an accented placeholder name would simply fail to interpolate and prove
 * nothing.
 */
export function pseudoLocalizeText(text: string, expansion: number = DEFAULT_PSEUDO_EXPANSION): string {
  const pattern = createPlaceholderPattern();
  let transformed = '';
  let lastIndex = 0;

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    transformed += accentSegment(text.slice(lastIndex, match.index));
    transformed += match[0];
    lastIndex = match.index + match[0].length;
  }
  transformed += accentSegment(text.slice(lastIndex));

  const paddingLength = Math.ceil([...text].length * Math.max(0, expansion));
  return `${START_MARKER}${transformed}${PADDING_CHARACTER.repeat(paddingLength)}${END_MARKER}`;
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
