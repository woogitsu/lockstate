import {
  PSEUDO_END_MARKER,
  PSEUDO_PARAMETER_END_MARKER,
  PSEUDO_PARAMETER_START_MARKER,
  PSEUDO_START_MARKER,
} from '../../src/services/localization/pseudo';

/**
 * "What, on a pseudo-localized screen, did not come out of the catalogue" --
 * and, unlike the rule it replaces, *which of the five things it is*.
 *
 * ## The rule this is built on, and the two rules it replaces
 *
 * `src/services/localization/pseudo.ts` maps every one of the 52 ASCII
 * letters and pads with `·`, so **no character of a catalogue-derived string
 * is an ASCII letter**. Every run of two or more ASCII letters on the page is
 * therefore text that did not come from a catalogue message. Two rather than
 * one, because a lone letter is far more often part of a number, a unit or an
 * id than a word.
 *
 * The 2026-08-30 sweep
 * (`docs/research/2026-08-30-what-stays-readable-under-the-pseudo-locale.md`)
 * arrived at that rule by discarding a worse one and recorded both, which is
 * why they are both named here:
 *
 * - **Delete every `⟦ … ⟧` span and read the residue.** Blind to the sharpest
 *   class there is: a `{placeholder}` is copied through unaccented, so an
 *   English parameter sits *inside* the brackets and deleting the span
 *   deletes the evidence. It scored the sweep's headline finding as zero and
 *   reported 3 findings where the corrected rule reported 9.
 * - **Every ASCII word anywhere is a finding.** Strictly stronger and what
 *   the sweep shipped -- but it cannot say whether a word is a defect or a
 *   parameter doing its job, so a reader has to adjudicate all 133 hits by
 *   hand.
 *
 * `pseudoLocalizeText` now writes `⟨ ⟩` around each placeholder span (#664),
 * which is what makes the classes separable rather than merely countable.
 *
 * ## What each kind means
 *
 * | kind | where the ASCII sits | what it is |
 * | --- | --- | --- |
 * | `interpolated-parameter` | inside `⟨ ⟩` | a value the call site passed in. Usually correct -- a name, an id. **Not automatically innocent**: an `Error.message` spliced into a localized template arrives this way, and that is a defect. |
 * | `spliced-fragment` | inside `⟦ ⟧`, outside `⟨ ⟩` | English inside a message that was otherwise translated: a fragment concatenated into it after lookup. `docs/LOCALIZATION.md` forbids assembling sentences in code because word order differs per language. |
 * | `unresolved-key` | outside `⟦ ⟧`, key-shaped | `Localizer.format` returning the key itself, which is what it does for a key no catalogue carries (ADR 0011). |
 * | `hard-coded` | outside `⟦ ⟧`, not key-shaped | a string literal that never went through the localizer at all. |
 * | `assembled-message` | -- | two complete `⟦ … ⟧` messages in one string: two catalogue lookups joined in code, the same defect as `spliced-fragment` with both halves translated. |
 * | `truncated-message` | -- | an opening `⟦` with no `⟧`: the layout clipped the string, which is the second bug class ADR 0011 names the pseudo-locale for. |
 *
 * ## What it cannot do
 *
 * It reads one string at a time and has no idea what produced it, so the
 * caller decides the granularity. Two sibling elements each holding one
 * message are two strings and not an `assembled-message`; the same two
 * messages written into one text node are. A caller that concatenates a
 * subtree's text before classifying will manufacture the finding.
 */

/** Which of the five classes an ASCII run belongs to, plus the two structural findings. */
export type PseudoResidueKind =
  | 'interpolated-parameter'
  | 'spliced-fragment'
  | 'unresolved-key'
  | 'hard-coded'
  | 'assembled-message'
  | 'truncated-message';

export interface PseudoResidue {
  readonly kind: PseudoResidueKind;
  /** The ASCII token itself, or the whole string for the two structural kinds. */
  readonly text: string;
}

/**
 * Every kind the classifier can return. Exported so a gate can insist that
 * each one is exercised by a control rather than trusting a green result over
 * a set nothing populates.
 */
export const PSEUDO_RESIDUE_KINDS = [
  'interpolated-parameter',
  'spliced-fragment',
  'unresolved-key',
  'hard-coded',
  'assembled-message',
  'truncated-message',
] as const satisfies readonly PseudoResidueKind[];

/**
 * What `Localizer.format` returns for a key it could not resolve: the key
 * itself. Lower-case dotted identifier, matching `identifierSchema`'s shape
 * for the keys the catalogs actually carry.
 */
const KEY_SHAPED = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;

/** A token that could carry a word: letters, digits and the separators a key or an id uses. */
const TOKEN_PATTERN = /[A-Za-z0-9][A-Za-z0-9._-]*/g;

/** Two or more ASCII letters -- see the module comment for why two. */
const ASCII_WORD = /[A-Za-z]{2,}/;

interface Region {
  readonly inMessage: boolean;
  readonly inParameter: boolean;
  readonly text: string;
}

interface Scan {
  readonly regions: readonly Region[];
  readonly closedMessages: number;
  readonly hasUnclosedMessage: boolean;
}

/**
 * Splits on the markers rather than matching them with a regex, so an
 * unbalanced marker is observable instead of silently failing to match --
 * truncation is one of the things being looked for.
 */
function scan(text: string): Scan {
  const regions: Region[] = [];
  let inMessage = false;
  let inParameter = false;
  let current = '';
  let closedMessages = 0;

  const flush = (): void => {
    if (current.length > 0) regions.push({ inMessage, inParameter, text: current });
    current = '';
  };

  for (const character of text) {
    if (character === PSEUDO_START_MARKER) {
      flush();
      inMessage = true;
      continue;
    }
    if (character === PSEUDO_END_MARKER) {
      flush();
      if (inMessage) closedMessages += 1;
      inMessage = false;
      inParameter = false;
      continue;
    }
    if (character === PSEUDO_PARAMETER_START_MARKER) {
      flush();
      inParameter = true;
      continue;
    }
    if (character === PSEUDO_PARAMETER_END_MARKER) {
      flush();
      inParameter = false;
      continue;
    }
    current += character;
  }
  flush();

  return { regions, closedMessages, hasUnclosedMessage: inMessage };
}

function classifyRegion(region: Region): PseudoResidueKind {
  if (region.inParameter) return 'interpolated-parameter';
  if (region.inMessage) return 'spliced-fragment';
  return 'hard-coded';
}

/**
 * Classifies one rendered string. Returns nothing for a string that is
 * entirely catalogue-derived, which is the state a fully localized surface is
 * in.
 */
export function findPseudoLocaleResidue(text: string): readonly PseudoResidue[] {
  const residue: PseudoResidue[] = [];
  const scanned = scan(text);

  for (const region of scanned.regions) {
    for (const match of region.text.matchAll(TOKEN_PATTERN)) {
      const token = match[0];
      if (!ASCII_WORD.test(token)) continue;
      const kind = classifyRegion(region);
      // A key renders as itself, so a key-shaped token outside every message
      // is `format` reporting a miss rather than a literal someone typed.
      // Inside a message it is a fragment like any other: a key spliced into
      // translated text is still translated text with English in it.
      residue.push({
        kind: kind === 'hard-coded' && KEY_SHAPED.test(token) ? 'unresolved-key' : kind,
        text: token,
      });
    }
  }

  if (scanned.hasUnclosedMessage) residue.push({ kind: 'truncated-message', text });
  if (scanned.closedMessages > 1) residue.push({ kind: 'assembled-message', text });

  return residue;
}

/** Convenience for a gate that only cares whether a class is present at all. */
export function residueKinds(text: string): ReadonlySet<PseudoResidueKind> {
  return new Set(findPseudoLocaleResidue(text).map((finding) => finding.kind));
}
