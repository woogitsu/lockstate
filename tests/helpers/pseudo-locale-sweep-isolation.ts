/** Findings produced by one completed pseudo-locale sweep test. */
export interface PseudoLocaleSweepFinding {
  readonly kind: 'text' | 'attribute' | 'document';
  readonly bracketed: boolean;
  readonly text: string;
  readonly residue: string;
  readonly where: string;
}

const KEY_SHAPED = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/u;

/**
 * Check only the current test's observations. Playwright starts a new worker
 * after a failed test, so a later test must never assert on process globals
 * populated by a previous worker. The original failure remains the suite red.
 *
 * Bracketed text passed through the catalogue, including interpolated names.
 * The document title is a brand and <html lang> is a language tag, so neither
 * is player-facing prose that the catalogue should transform. Every other
 * unbracketed finding is a leak, whether or not it resembles a dotted key.
 */
export function pseudoLocaleSweepViolations(
  findings: readonly PseudoLocaleSweepFinding[],
  statesVisited: number,
  sweepPassed: boolean,
): readonly string[] {
  if (!sweepPassed) return [];
  if (findings.length + statesVisited === 0) return ['the sweep above actually ran'];

  const violations: string[] = [];
  for (const finding of findings) {
    if (!finding.bracketed && KEY_SHAPED.test(finding.text)) {
      violations.push(`unresolved key: ${finding.text} @ ${finding.where}`);
    }
    if (finding.kind !== 'document' && !finding.bracketed) {
      violations.push(`readable English: ${JSON.stringify(finding.residue)} @ ${finding.where}`);
    }
  }
  return [...new Set(violations)];
}
