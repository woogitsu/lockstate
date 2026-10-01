import { describe, expect, it } from 'vitest';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';
import { formatRoomTemplateQuote } from '../../src/ui/hud/room-template-quote';

describe('authoritative template material quote', () => {
  const en = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
  const quote = { orderCount: 3, materials: [{ itemId: 'item.brick', quantity: 1200 }, { itemId: 'item.wood-plank', quantity: 2 }], catalogueCostMinorUnits: 1825 };
  it('names exact material quantities and explicitly labels catalogue value', () => {
    expect(formatRoomTemplateQuote(en, quote)).toBe('Brick \u00d7 1,200 \u00b7 Wood Plank \u00d7 2 \u00b7 Materials catalogue value: 1,825');
  });
  it('formats numbers and material labels through the active Polish locale', () => {
    const pl = new Localizer({ locale: 'pl', catalogs: [messageCatalogPl] });
    const text = formatRoomTemplateQuote(pl, quote);
    expect(text).toContain(pl.format('item.brick.name'));
    expect(text).toContain(pl.formatNumber(1200));
    expect(text).toContain(pl.format('hud.build.template-catalogue-value', { value: pl.formatNumber(1825) }));
    expect(text).not.toContain('Materials catalogue value');
  });
  it('keeps a real zero Yard catalogue value and never invents an unavailable value', () => {
    expect(formatRoomTemplateQuote(en, { orderCount: 0, materials: [], catalogueCostMinorUnits: 0 })).toBe('Materials catalogue value: 0');
    expect(formatRoomTemplateQuote(en, { orderCount: 1, materials: [{ itemId: 'item.brick', quantity: 2 }] })).toBe('Brick \u00d7 2');
    expect(formatRoomTemplateQuote(en, undefined)).toBe('');
  });
});
