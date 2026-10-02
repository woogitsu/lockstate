import { expect, test } from './network-changed-fixture';
test.use({locale:'pl-PL'});
test('Full HD keyboard catalogue selection keeps each active long-name row completely visible',async({page},info)=>{
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/?renderer=oblique');
  await page.getByRole('button',{name:'Nowe wiezienie'.replace('wiezienie','wi\u0119zienie'),exact:true}).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button',{name:'Pauza',exact:true}).click();
  await page.getByRole('button',{name:'Buduj',exact:true}).click();
  const list=page.locator('.hud-build__list');
  const rows=list.locator('[data-buildable]');
  const count=await rows.count();
  await rows.first().focus();
  for(let i=0;i<count;i++){
    if(i>0)await page.keyboard.press('ArrowDown');
    const row=rows.nth(i);
    await expect(row).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('aria-checked','true');
    const boxes=await row.evaluate(element=>{
      const scroller=element.parentElement!;
      const container=scroller.getBoundingClientRect();
      const row=element.getBoundingClientRect();
      return {id:(element as HTMLElement).dataset['buildable'],top:row.top,bottom:row.bottom,viewportTop:container.top+scroller.clientTop,viewportBottom:container.top+scroller.clientTop+scroller.clientHeight};
    });
    await page.screenshot({path:info.outputPath('active-'+boxes.id+'.png')});
    expect(boxes.top,JSON.stringify(boxes)).toBeGreaterThanOrEqual(boxes.viewportTop-1);
    expect(boxes.bottom,JSON.stringify(boxes)).toBeLessThanOrEqual(boxes.viewportBottom+1);
  }
});
