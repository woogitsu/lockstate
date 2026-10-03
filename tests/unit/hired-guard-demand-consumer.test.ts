import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

it('the actual hired-Guard native callback captures empty pixels before Hire and waits for the demanded frame afterwards', async () => {
  const source = readFileSync(new URL('../browser/hired-guard-player-build.spec.ts', import.meta.url), 'utf8');
  const executable = stripTypeScriptTypes(source, { mode: 'strip' })
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm, '');
  const frame = { sha256: 'expected-initial-frame' };
  const stop = new Error('exact initial frame verified; remaining real browser coverage is outside this unit');
  const actions: string[] = [];
  let hired = false;
  let callback: ((args: { page: unknown }, info: { outputPath: (name: string) => string }) => Promise<void>) | undefined;
  const commands: object[] = [];
  const test = Object.assign((_name: string, registered: NonNullable<typeof callback>) => { callback = registered; }, { use() {} });
  const locator = (selector: string) => ({
    async click() {
      actions.push(selector);
      if (selector === '.hud-staff__hire') {
        hired = true;
        commands.push({ type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
      }
    },
    async screenshot() {
      expect(hired, 'empty-world capture must precede the public hire').toBe(false);
      actions.push('empty-canvas');
      return Buffer.alloc(0);
    },
  });
  const page = {
    async goto(url: string) { actions.push(url); },
    getByRole(_role: string, options: { name: string }) { return locator(options.name); },
    locator,
  };
  const fixtureExpect = Object.assign((value: unknown) => ({
    toEqual(expected: unknown) { expect(value).toEqual(expected); },
    async toHaveText(_expected: string) {},
    async toBeVisible() {},
  }), {
    poll(producer: () => Promise<unknown>) {
      return {
        async toEqual(expected: unknown) { expect(await producer()).toEqual(expected); },
        async toBe(expected: unknown) {
          expect(await producer(), 'an empty roster cannot demand a Guard PNG').toBe(expected);
          expect(hired).toBe(true);
          actions.push('exact-png');
          throw stop;
        },
      };
    },
  });
  runInNewContext(executable, {
    test, expect: fixtureExpect,
    installTee: async () => {}, installGuardWorkerProbe: async () => {},
    observeGuardImages: async () => async () => ({ images: hired
      ? [{ sha256: frame.sha256, complete: true, error: false, width: 512, height: 512 }]
      : [] }),
    guardSnapshot: async () => ({ simulation: { security: { guards: { records: [] } } } }),
    centreGuard: async () => {}, showPanel: async () => {}, sentCommands: async () => commands,
    GUARD_INITIAL_FRAME: frame,
  }, { filename: 'actual-hired-guard-player-build.spec.ts' });
  expect(callback).toBeDefined();
  await expect(callback!({ page }, { outputPath: name => name })).rejects.toBe(stop);
  expect(actions.indexOf('empty-canvas')).toBeLessThan(actions.indexOf('.hud-staff__hire'));
  expect(actions.indexOf('.hud-staff__hire')).toBeLessThan(actions.indexOf('exact-png'));
});
