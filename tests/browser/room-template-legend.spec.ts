import { expect, test } from './network-changed-fixture';

test('Full HD selected-plan legend uses fixture rectangles and doorway bars', async ({ page }) => {
  await page.setViewportSize({ width:1920,height:1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button',{name:'New prison'}).click();
  await page.getByRole('button',{name:'Build',exact:true}).click();
  await page.getByRole('button',{name:'Room plans',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Room plans'});
  await dialog.getByRole('button',{name:'Four-cell row',exact:true}).click();
  const legend=dialog.locator('.hud-template__legend');
  await expect(legend).toHaveText('WallDoorFurniture');
  const furniture=legend.locator('.hud-template__fixture');
  await expect(furniture).toHaveCount(1);
  await expect(furniture).toHaveAttribute('aria-hidden','true');
  const shape=await furniture.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,radius:parseFloat(getComputedStyle(el).borderRadius)}));
  expect(shape.width).toBeGreaterThan(shape.height*1.8);
  expect(shape.radius).toBeLessThan(shape.height/2);
  const doorway=await legend.locator('.hud-template__tile--door').evaluate(el=>({height:el.getBoundingClientRect().height,bar:parseFloat(getComputedStyle(el,'::after').height)}));
  expect(doorway.bar).toBeGreaterThan(0);
  expect(doorway.bar).toBeLessThan(doorway.height);
  await expect(dialog.locator('.hud-template__diagram .hud-template__fixture')).toHaveCount(8);
  await expect(legend).toBeInViewport();
  const bounds=await dialog.boundingBox();
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(1040);
  await page.screenshot({path:'test-results/room-plan-legend-fullhd.png'});
});
