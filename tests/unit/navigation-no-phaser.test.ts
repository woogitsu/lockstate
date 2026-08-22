import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const NAVIGATION_DIR = join(__dirname, '../../src/simulation/navigation');

describe('navigation module boundaries', () => {
  it('imports no Phaser and touches no DOM/browser globals', () => {
    const files = readdirSync(NAVIGATION_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(join(NAVIGATION_DIR, file), 'utf8');
      expect(source, `${file} must not import Phaser`).not.toMatch(/from ['"]phaser['"]/i);
      expect(source, `${file} must not touch the DOM`).not.toMatch(/\bdocument\.|window\./);
    }
  });
});
