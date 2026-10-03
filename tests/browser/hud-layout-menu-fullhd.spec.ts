import { test } from './network-changed-fixture';
import { assertLayoutEscapeKeepsBuildPlacement } from './layout-menu-escape-acceptance';

for (const renderer of ['world', 'oblique'] as const) {
  test(`Full HD ${renderer} view closes Layout without cancelling armed Build`, async ({ page }, testInfo) => {
    await assertLayoutEscapeKeepsBuildPlacement(page, testInfo, renderer);
  });
}
