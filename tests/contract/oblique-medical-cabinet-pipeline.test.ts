import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve(import.meta.dirname, '..', '..', 'tooling', 'blender', 'render-oblique-medical-cabinet.py');

describe('oblique medical cabinet Blender pipeline', () => {
  it('uses the shared 72-pose camera lattice and publishes only after rendering', async () => {
    const source = await readFile(script, 'utf8');
    expect(source).toContain('ASSET_ID = "furniture.medical.cabinet"');
    expect(source).toContain('SLUG = "medical-cabinet"');
    expect(source).toContain('modules.YAW = tuple(-165 + index * 30 for index in range(12))');
    expect(source).toContain('modules.ELEVATION = (20, 30, 40, 50, 60, 70)');
    expect(source.indexOf('modules.render_module(')).toBeLessThan(source.indexOf('existing = json.loads('));
    expect(source).toContain('manifest: f\"/game-content/oblique-{SLUG}.v1.json\"');
  });
});
