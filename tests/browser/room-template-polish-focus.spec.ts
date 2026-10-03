import {expect,test} from './network-changed-fixture';
import {installTee,sentCommands} from './playtest-harness';

test('Polish Full HD room catalogue exposes all names and supports one roving keyboard stop',async({page},testInfo)=>{
  await installTee(page);
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'languages',{get:()=>['pl-PL']});
    Object.defineProperty(navigator,'language',{get:()=> 'pl-PL'});
  });
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/?renderer=oblique');
  await expect(page.locator('html')).toHaveAttribute('lang','pl');
  await page.getByRole('button',{name:'Nowe wi\u0119zienie',exact:true}).click();
  await page.getByRole('button',{name:'Buduj',exact:true}).click();
  const open=page.getByRole('button',{name:'Wzory pomieszcze\u0144',exact:true});
  await open.click();
  const dialog=page.getByRole('dialog',{name:'Wzory pomieszcze\u0144'});
  const cards=dialog.locator('[data-template-id]');
  await expect(cards).toHaveCount(20);
  const layout=await cards.evaluateAll(elements=>elements.map(el=>{
    const box=el.getBoundingClientRect(); const label=el.querySelector('strong')!;
    return {text:label.textContent,accessible:el.getAttribute('aria-label'),
      fits:label.scrollWidth<=label.clientWidth,top:box.top,bottom:box.bottom,
      hit:el.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2))};
  }));
  expect(layout.every(row=>row.text===row.accessible&&row.fits&&row.hit&&row.top>=0&&row.bottom<=1080)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('polish-catalogue.png')});
  const first=cards.first(),last=cards.last();
  await first.focus(); await page.keyboard.press('End');
  await expect(last).toBeFocused();
  await expect(first).toHaveAttribute('aria-pressed','true');
  expect(await cards.evaluateAll(items=>items.filter(item=>(item as HTMLElement).tabIndex===0).length)).toBe(1);
  await page.keyboard.press('ArrowRight'); await expect(first).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(last).toBeFocused();
  await page.keyboard.press('Home'); await expect(first).toBeFocused();
  for(let index=1;index<20;index+=1) {
    await page.keyboard.press('ArrowRight'); await expect(cards.nth(index)).toBeFocused();
    await expect(first).toHaveAttribute('aria-pressed','true');
  }
  await page.screenshot({path:testInfo.outputPath('polish-catalogue-focus.png')});
  await page.keyboard.press('Enter'); await expect(last).toHaveAttribute('aria-pressed','true');
  await expect(dialog.locator('.hud-template__quote')).not.toBeEmpty();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('.hud-template__rotation')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('checkbox')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button',{name:'Postaw na mapie',exact:true})).toBeFocused();
  expect((await sentCommands(page)).filter(c=>c.type==='PlaceRoomTemplate')).toHaveLength(0);
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(open).toBeFocused();
});
