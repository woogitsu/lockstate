import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

// Actual consumer/helper callbacks; this source protocol control does not
// reproduce Chromium layout or claim that the hosted 960px geometry passed.
function executable(path: string): string {
  return stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'), { mode: 'strip' })
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm, '')
    .replace(/^export /gm, '');
}

function publicControls() {
  let expanded = false;
  const actions: string[] = [];
  const locator = (name: string) => ({ name,
    async isVisible() { return name === '.hud-camera-panel' ? expanded : true; },
    async click() { actions.push(name); if (name === 'View') expanded = !expanded; },
    async selectOption(value: string) {
      expect(expanded, 'actual renderer selection requires the public expanded View').toBe(true);
      expect(value).toBe('oblique'); actions.push('selected-oblique');
    },
  });
  const page = {
    locator,
    getByRole(_role: string, options: { name: string | RegExp }) {
      return locator(typeof options.name === 'string' ? options.name : 'View');
    },
  };
  const fixtureExpect = (value: ReturnType<typeof locator>) => ({
    async toHaveCount(count: number) { expect(value.name).toBe('.hud-camera-panel'); expect(count).toBe(1); },
    async toBeVisible() { expect(await value.isVisible()).toBe(true); },
    async toBeHidden() { expect(await value.isVisible()).toBe(false); },
    async toHaveAttribute(name: string, expected: string) {
      expect(name).toBe('aria-expanded'); expect(String(expanded)).toBe(expected);
    },
    async toBeEnabled() {}, async toHaveValue(value: string) { expect(value).toBe('oblique'); },
  });
  const context = { expect: fixtureExpect };
  runInNewContext(executable('../browser/public-camera-controls.ts'), context);
  const helpers = context as unknown as {
    openCameraControls: (page: unknown) => Promise<void>;
    closeCameraControls?: (page: unknown) => Promise<void>;
  };
  return { page, helpers, fixtureExpect, actions, expanded: () => expanded };
}

it.each([960, 1920, 2560])('the real %ipx readability callback closes View after actual selection and before the original world target', async width => {
  const controls = publicControls();
  const stop = new Error('public map ownership checked; actual browser geometry remains separate');
  const callbacks = new Map<string, (args: { page: unknown }) => Promise<void>>();
  runInNewContext(executable('../browser/build-target-readability.spec.ts'), {
    ...controls.helpers, expect: controls.fixtureExpect,
    test: (name: string, callback: (args: { page: unknown }) => Promise<void>) => callbacks.set(name, callback),
  });
  const page = { ...controls.page,
    async setViewportSize(actual: { width: number; height: number }) {
      expect(actual).toEqual({ width, height: width === 960 ? 540 : 1080 });
    },
    async goto() {},
    mouse: { async move(x: number, y: number) {
      expect({ x, y }).toEqual({ x: width === 960 ? 370 : 650, y: 250 });
      expect(controls.expanded(), 'world-readout recipe must release the public View overlay before its original map target').toBe(false);
      expect(controls.actions.indexOf('selected-oblique')).toBeLessThan(controls.actions.lastIndexOf('View'));
      throw stop;
    } },
  };
  const callback = [...callbacks].find(([name]) => name.startsWith(`${width} `))?.[1];
  expect(callback).toBeDefined();
  await expect(callback!({ page })).rejects.toBe(stop);
});

it('public close leaves an already closed View unchanged and closes an open one through its real action', async () => {
  const controls = publicControls();
  expect(controls.helpers.closeCameraControls).toBeDefined();
  await controls.helpers.closeCameraControls!(controls.page);
  expect(controls.actions).toEqual([]);
  await controls.helpers.openCameraControls(controls.page);
  await controls.helpers.closeCameraControls!(controls.page);
  expect(controls.actions).toEqual(['View', 'View']);
  expect(controls.expanded()).toBe(false);
});
