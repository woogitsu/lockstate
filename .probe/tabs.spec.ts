import { expect, test } from '@playwright/test';
import { attachConsole, dumpHud, installCommandTee, openApp, panelText } from './lib';

test('the three tabs nobody has walked, at 900x600', async ({ page }) => {
  test.setTimeout(240_000);
  const console_ = attachConsole(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await installCommandTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  for (const which of ['overview', 'security', 'regime'] as const) {
    await tab(page, which);
    await dumpHud(page, `${which} tab, fresh prison, 900x600`);
    console.log(`  .hud-intake -> ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
    console.log(`  .hud-staff  -> ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    console.log(`  .hud-regime -> ${JSON.stringify(await panelText(page, '.hud-regime'))}`);
    console.log(
      `  buttons: ${JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLButtonElement>('.hud__corner button, .hud button')]
            .filter((b) => b.getClientRects().length > 0)
            .map((b) => ({ t: b.innerText.trim().slice(0, 40), dis: b.disabled })),
        ),
      )}`,
    );
  }

  // Press every enabled action on Security and Regime and see what happens.
  await tab(page, 'security');
  await page.waitForTimeout(300);
  const hireButtons = await page.locator('.hud-staff button').all();
  for (const b of hireButtons) {
    const label = (await b.innerText()).trim();
    const enabled = await b.isEnabled();
    console.log(`SECURITY action "${label}" enabled=${enabled}`);
  }
  console.log('=== console ===');
  console.log(console_.join('\n') || '(nothing)');
});

test('export then import, mouse-driven', async ({ page }) => {
  test.setTimeout(240_000);
  const console_ = attachConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installCommandTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  console.log(`save panel on arrival: ${JSON.stringify(await panelText(page, '.save-panel'))}`);

  // Export: a real click, with the download intercepted.
  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  await page.getByRole('button', { name: 'Export' }).click();
  await page.waitForTimeout(1200);
  const download = await downloadPromise;
  console.log(`download event: ${download === null ? 'NONE' : download.suggestedFilename()}`);
  console.log(`save panel after Export: ${JSON.stringify(await panelText(page, '.save-panel'))}`);
  console.log(`.hud__event after Export: ${JSON.stringify(await panelText(page, '.hud__event'))}`);

  let exported = '';
  if (download !== null) {
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    exported = Buffer.concat(chunks).toString('utf8');
    console.log(`exported ${exported.length} bytes; first 300: ${exported.slice(0, 300)}`);
  }

  // Import: the control opens a native file picker, which Playwright can
  // answer via the filechooser event.
  await page.getByRole('button', { name: 'Save now' }).click();
  await page.waitForTimeout(500);

  const chooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 }).catch(() => null);
  await page.getByRole('button', { name: 'Import' }).click();
  const chooser = await chooserPromise;
  console.log(`filechooser fired: ${chooser !== null}`);
  if (chooser !== null && exported !== '') {
    await chooser.setFiles({ name: 'lockstate-save.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await page.waitForTimeout(1500);
    console.log(`save panel after Import: ${JSON.stringify(await panelText(page, '.save-panel'))}`);
    await dumpHud(page, 'after Import of the exported save');
  } else if (chooser !== null) {
    console.log('no exported bytes to import; cancelling chooser');
    await chooser.setFiles([]);
  }

  // And the failure path a player will actually hit: importing junk.
  const chooser2 = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10_000 }).catch(() => null),
    page.getByRole('button', { name: 'Import' }).click(),
  ]).then(([c]) => c);
  if (chooser2 !== null) {
    await chooser2.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a save') });
    await page.waitForTimeout(1200);
    console.log(`save panel after importing junk: ${JSON.stringify(await panelText(page, '.save-panel'))}`);
    await dumpHud(page, 'after importing a non-save file');
  }
  console.log('=== console ===');
  console.log(console_.join('\n') || '(nothing)');
});
