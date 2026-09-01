import { describe, expect, it } from 'vitest';
import {
  PSEUDO_RESIDUE_KINDS,
  type PseudoResidueKind,
  findPseudoLocaleResidue,
  residueKinds,
} from '../helpers/pseudo-locale-residue';
import { interpolate } from '../../src/services/localization/format';
import { pseudoLocalizeText } from '../../src/services/localization/pseudo';

/**
 * The classifier in `tests/helpers/pseudo-locale-residue.ts`, which is the
 * reusable half of the 2026-08-30 pseudo-locale sweep (#664).
 *
 * A detector is the one kind of instrument whose failure is invisible from
 * the outside: one that never fires makes every sweep built on it report a
 * clean page, and one that always fires makes every sweep report a page of
 * defects. So both directions are exercised here, per kind -- the
 * `covers every kind` case below fails if a kind is ever added without a
 * fixture, which is how the set stays honest as it grows.
 */

/** One fixture per kind, written as the thing a real screen would hold. */
const FIXTURES: Readonly<Record<PseudoResidueKind, string>> = {
  // A `{name}` filled with an English value: correct behaviour, and the class
  // the sweep's first detector deleted along with the brackets.
  'interpolated-parameter': pseudoLocalizeText('Welcome, {name}').replace('{name}', 'Ana'),
  // English concatenated into a message after it was looked up.
  'spliced-fragment': `⟦Çóúļđ ñóţ çřéáţé á ƥříšóñ: Kernel is already initialized.·····⟧`,
  // `Localizer.format` returning the key itself, which is what it does for a
  // key no catalogue carries (ADR 0011).
  'unresolved-key': 'hud.clock.day-of-week',
  // A literal that never went through the localizer.
  'hard-coded': 'Lockstate game application',
  // Two catalogue lookups joined in code.
  'assembled-message': `${pseudoLocalizeText('Hire Guard')} · ${pseudoLocalizeText('80')}`,
  // The layout clipped the string and took the closing marker with it.
  'truncated-message': '⟦Çóñţřáƀáñđ ƒóúñ',
};

describe('the pseudo-locale residue classifier (#664)', () => {
  it('reports nothing for a string that is entirely catalogue-derived', () => {
    // The negative control. Without it every assertion below is satisfied by
    // a classifier that fires on everything, which is the same nothing as a
    // classifier that never fires.
    expect(findPseudoLocaleResidue(pseudoLocalizeText('Prison saves'))).toEqual([]);
    expect(findPseudoLocaleResidue(pseudoLocalizeText('No prisons yet.'))).toEqual([]);
    // Padding and markers on their own are not words either.
    expect(findPseudoLocaleResidue('⟦·····⟧')).toEqual([]);
  });

  it('covers every kind it can return, so the set cannot grow a member nothing exercises', () => {
    expect([...PSEUDO_RESIDUE_KINDS].sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  for (const kind of PSEUDO_RESIDUE_KINDS) {
    it(`reports ${kind} for the string that class comes from`, () => {
      expect(residueKinds(FIXTURES[kind]).has(kind), `fixture: ${FIXTURES[kind]}`).toBe(true);
    });
  }

  it('separates a parameter from a fragment inside the same message', () => {
    // The distinction the markers exist for. Both are ASCII inside `⟦ ⟧`, and
    // the rule the sweep shipped -- "every ASCII word anywhere" -- calls them
    // the same thing.
    const withParameter = pseudoLocalizeText('{name} broke out — no guard reached them in time.').replace(
      '{name}',
      'Ada Whitlock',
    );
    expect(residueKinds(withParameter)).toEqual(new Set<PseudoResidueKind>(['interpolated-parameter']));

    const withFragment = pseudoLocalizeText('Could not create a prison: ').slice(0, -1) + 'Kernel is already initialized.⟧';
    expect(residueKinds(withFragment).has('spliced-fragment')).toBe(true);
  });

  it('tells an unresolved key from a hard-coded label', () => {
    expect(findPseudoLocaleResidue('hud.build.note')).toEqual([{ kind: 'unresolved-key', text: 'hud.build.note' }]);
    expect(findPseudoLocaleResidue('Build note')).toEqual([
      { kind: 'hard-coded', text: 'Build' },
      { kind: 'hard-coded', text: 'note' },
    ]);
  });

  it('ignores a lone ASCII letter, which is far more often a unit than a word', () => {
    // A synthetic case, not `hud.clock.speed`'s own text -- the owner's ruling
    // of 2026-09-01 moved that key's sign to U+00D7
    // (`tests/foundation/times-sign-contract.test.ts`), and a real `x` outside
    // a placeholder is now a defect there rather than an example of one here.
    // The shape is still worth covering on its own terms, because a lone
    // ASCII letter beside a number is not always a times sign -- a unit
    // suffix could put one there too -- and a generation id reads
    // `gen-mtg1aol0-1`. Neither is copy.
    expect(findPseudoLocaleResidue('⟦Šƥééđ ⟨2⟩x···⟧')).toEqual([]);
    expect(findPseudoLocaleResidue('⟦Ẃ⟧ 3 × 4')).toEqual([]);
  });

  it('survives interpolation of a real catalogue message end to end', () => {
    // The whole path a rendered string takes: transform, then interpolate.
    // A value that is itself accented would make this pass for the wrong
    // reason, so the parameter is deliberately plain English.
    const template = pseudoLocalizeText('{count} × {material} · {total} back');
    const rendered = interpolate(template, { count: 3, material: 'Brick', total: '£12' });

    expect(rendered.missingParameters).toEqual([]);
    expect(findPseudoLocaleResidue(rendered.text)).toEqual([{ kind: 'interpolated-parameter', text: 'Brick' }]);
  });
});
