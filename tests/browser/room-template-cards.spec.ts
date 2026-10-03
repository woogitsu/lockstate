import { expect, test } from './network-changed-fixture';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate } from '../../src/content/room-template-catalog';
test('Full HD catalogue compares all room footprints before selection and keeps row controls in view', async ({ page }) => {
  await page.setViewportSize({ width:1920,height:1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button',{name:'New prison'}).click();
  await page.getByRole('button',{name:'Build',exact:true}).click();
  await page.getByRole('button',{name:'Room plans',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Room plans'});
  await expect(dialog).toBeVisible();
  const cards = dialog.locator('.hud-template__card');
  await expect(cards).toHaveCount(20);
  for (const id of ROOM_TEMPLATE_IDS) {
    const card = dialog.locator(`[data-template-id="${id}"]`);
    await expect(card.locator('.hud-template__fixture')).toHaveCount(instantiateRoomTemplate(id, { x: 0, y: 0 }).objects.length);
    const miniature = card.locator('.hud-template__miniature');
    const rect = await miniature.boundingBox();
    expect(rect!.width).toBeLessThanOrEqual(56.1);
    expect(rect!.height).toBeLessThanOrEqual(56.1);
    for (const fixture of await card.locator('.hud-template__fixture').all()) {
      const bounds = await fixture.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(2.4);
      expect(bounds!.height).toBeGreaterThanOrEqual(2.4);
      expect(bounds!.x).toBeGreaterThanOrEqual(rect!.x);
      expect(bounds!.y).toBeGreaterThanOrEqual(rect!.y);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(rect!.x + rect!.width + 0.1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(rect!.y + rect!.height + 0.1);
    }
  }
  const basic = dialog.getByRole('button',{name:'Basic cell',exact:true});
  await expect(basic).toContainText('4 \u00d7 7');
  await expect(basic).toContainText('Furniture \u00d7 2');
  await expect(basic.locator('.hud-template__miniature .hud-template__tile')).toHaveCount(28);
  await expect(basic.locator('.hud-template__miniature .hud-template__tile--object')).toHaveCount(3);
  await expect(basic.locator('.hud-template__fixture')).toHaveCount(2);
  const bed = basic.locator('.hud-template__fixture').first();
  const bedBounds = await bed.boundingBox();
  expect(bedBounds!.height).toBeGreaterThan(bedBounds!.width * 1.8);
  const large = dialog.getByRole('button', { name: 'Large cell', exact: true });
  await expect(large.locator('.hud-template__fixture')).toHaveCount(3);
  const row = dialog.getByRole('button', { name: 'Four-cell row', exact: true });
  await expect(row.locator('.hud-template__fixture')).toHaveCount(8);
  const door = basic.locator('.hud-template__tile--door').first();
  const doorway = await door.evaluate(el => ({ tile: el.getBoundingClientRect().height, bar: parseFloat(getComputedStyle(el, '::after').height) }));
  expect(doorway.bar).toBeGreaterThan(0);
  expect(doorway.bar).toBeLessThan(doorway.tile);
  const yard = dialog.getByRole('button',{name:'Yard',exact:true});
  await expect(yard).toContainText('8 \u00d7 8');
  await expect(yard).toContainText('Furniture \u00d7 0');
  await expect(yard.locator('.hud-template__tile--wall')).toHaveCount(0);
  await expect(yard.locator('.hud-template__tile')).toHaveCount(64);
  await dialog.getByRole('button',{name:'Four-cell row',exact:true}).click();
  const selectedDiagram = dialog.locator('.hud-template__diagram');
  await expect(selectedDiagram.locator('.hud-template__tile')).toHaveCount(112);
  await expect(selectedDiagram.locator('.hud-template__fixture')).toHaveCount(8);
  const selectedBed = await selectedDiagram.locator('.hud-template__fixture').first().boundingBox();
  expect(selectedBed!.height).toBeGreaterThan(selectedBed!.width * 1.8);
  const selectedDoor = await selectedDiagram.locator('.hud-template__tile--door').first().evaluate(el => ({
    tile: el.getBoundingClientRect().height, bar: parseFloat(getComputedStyle(el, '::after').height),
  }));
  expect(selectedDoor.bar).toBeGreaterThan(0);
  expect(selectedDoor.bar).toBeLessThan(selectedDoor.tile);
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally' }).check();
  await expect(selectedDiagram.locator('.hud-template__fixture')).toHaveCount(8);
  const mirroredBed = await selectedDiagram.locator('.hud-template__fixture').first().boundingBox();
  expect(mirroredBed!.height).toBeGreaterThan(mirroredBed!.width * 1.8);

  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(40);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1040);
  expect(await dialog.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  await expect(dialog.getByRole('button',{name:'Place on map',exact:true})).toBeInViewport();
  await page.screenshot({path:'test-results/room-catalogue-cards-fullhd.png'});
  await dialog.getByRole('button',{name:'Place on map',exact:true}).click();
  await page.mouse.move(880,380);
  await expect(page.locator('.room-template-world-ghost polygon')).toHaveCount(112);
});
