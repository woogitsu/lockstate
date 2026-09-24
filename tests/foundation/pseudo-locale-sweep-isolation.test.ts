import { describe, expect, it } from 'vitest';
import { pseudoLocaleSweepViolations } from '../helpers/pseudo-locale-sweep-isolation';

describe('pseudo-locale sweep assertions after a worker restart', () => {
  it('does not add a dependent failure when the sweep itself already failed', () => {
    expect(pseudoLocaleSweepViolations([], 0, false)).toEqual([]);
  });

  it('rejects an empty successful sweep', () => {
    expect(pseudoLocaleSweepViolations([], 0, true)).toContain('the sweep above actually ran');
  });

  it('rejects both a leaked key and ordinary English in the completed sweep', () => {
    const findings = [
      { kind: 'text' as const, bracketed: false, text: 'hud.bad.key', residue: 'hud.bad.key', where: 'main' },
      { kind: 'attribute' as const, bracketed: false, text: 'Plain English', residue: 'Plain English', where: 'button' },
    ];
    expect(pseudoLocaleSweepViolations(findings, 1, true)).toEqual([
      'unresolved key: hud.bad.key @ main',
      'readable English: "hud.bad.key" @ main',
      'readable English: "Plain English" @ button',
    ]);
  });

  it('keeps the two deliberate document exemptions', () => {
    expect(pseudoLocaleSweepViolations([
      { kind: 'document', bracketed: false, text: 'Lockstate.io', residue: 'Lockstate.io', where: '<title>' },
      { kind: 'document', bracketed: false, text: 'en-XA', residue: 'en-XA', where: '<html lang>' },
    ], 1, true)).toEqual([]);
  });
});
