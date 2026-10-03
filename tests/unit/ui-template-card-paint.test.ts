import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';

const hud = (): string => readFileSync(join(__dirname, '../../src/ui/hud/hud.css'), 'utf8');

/** Source-state guard, not computed browser style or native geometry.
 * The catalogue creates ordinary buttons, so the .ui-action quiet rule cannot
 * reach them. Preserve explicit selection and every nonresting state while
 * quieting only the 19 ordinary unselected authored-plan choices.
 */
describe('authored-template card resting paint', () => {
  it('gives only resting unselected catalogue cards the quieter panel paint', () => {
    const rule = /([^{}]+)\{\s*background:\s*transparent;\s*border-color:\s*var\(--border-hairline\);\s*\}/gu;
    const selectors = [...hud().matchAll(rule)].map(match => match[1]?.trim() ?? '');
    const cards = selectors.find(selector => selector.startsWith('.hud-template button.hud-template__card'));
    expect(cards, 'the real ordinary template cards are outside the .ui-action primitive rule').toBeDefined();
    for (const state of ["[aria-pressed='true']", ':hover', ':active', ':focus-visible', ':disabled', "[aria-disabled='true']"]) {
      expect(cards).toContain(`:not(${state})`);
    }
    expect(cards).not.toContain(',');
  });

  it('retains actual selected paint, all twenty catalogue consumers and shared hit geometry', () => {
    const source = readFileSync(join(__dirname, '../../src/ui/hud/room-template-preview.ts'), 'utf8');
    expect(ROOM_TEMPLATE_IDS).toHaveLength(20);
    expect(source).toContain("className: 'hud-template__card'");
    expect(source).toContain("button.setAttribute('aria-pressed', rowId === id ? 'true' : 'false')");
    expect(hud()).toContain(".hud-template button[aria-pressed='true'] { border-color: var(--accent); color: var(--accent); }");
    expect(hud()).toMatch(/\.hud-template button\s*\{\s*min-height:\s*var\(--tap-target\);/u);
  });
});
