import { describe, expect, it } from 'vitest';
import { repositoryPathLabel } from '../helpers/repository-path-label';

describe('repository-relative documentation labels', () => {
  it('normalizes Windows labels before scope exclusions and ADR identity checks', () => {
    for (const path of [
      'docs/research/dated-note.md',
      'docs/adr/STATUS-QUEUE.md',
      'docs/adr/0013-free-tier-capacity-contract.md',
      'tests/foundation/adr-status-reference-contract.test.ts',
    ]) {
      expect(repositoryPathLabel(path.replaceAll('/', '\\'))).toBe(path);
    }
  });

  it('retains POSIX labels and source line suffixes', () => {
    expect(repositoryPathLabel('docs/adr/example.md:12')).toBe('docs/adr/example.md:12');
    expect(repositoryPathLabel('docs\\adr\\example.md:12')).toBe('docs/adr/example.md:12');
  });
});
