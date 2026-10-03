import { expect, it } from 'vitest';
import { formatBuildTargetText } from '../../src/ui/hud/build-panel';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
const localizer=new Localizer({locale:'en',catalogs:[defaultMessageCatalogEn]});
it('announces both occupied squares and the exact object anchor without wall-run semantics',()=>{
  expect(formatBuildTargetText(localizer.format.bind(localizer),{x:7,y:7},String,{width:2,height:1})).toBe('2 \u00d7 1 tiles at 7, 7');
});
it('preserves single anchor feedback for removal or absent object content',()=>{
  expect(formatBuildTargetText(localizer.format.bind(localizer),{x:7,y:7},String)).toBe('7, 7');
});

