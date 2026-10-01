import { HUD_MESSAGE_KEY } from './messages';
import { defaultItemRegistry } from '../../content/item-catalog';
import type { LocalizationKey } from '../../content/localization';
import type { RoomTemplateCostQuote } from '../room-template-tool';
import type { HudLocalizer } from './view-model';

/** Worker catalogue value describes materials, never a debit after held stock. */
export function formatRoomTemplateQuote(localizer: HudLocalizer, quote: RoomTemplateCostQuote | undefined): string {
  if (quote === undefined) return '';
  const materials = quote.materials.flatMap(material => {
    const definition = defaultItemRegistry.getById(material.itemId);
    return definition === undefined ? [] : [`${localizer.format(definition.nameKey as LocalizationKey)} × ${localizer.formatNumber(material.quantity)}`];
  });
  return [
    ...materials,
    ...(quote.catalogueCostMinorUnits === undefined ? [] : [localizer.format(HUD_MESSAGE_KEY.buildTemplateCatalogueValue, { value: localizer.formatNumber(quote.catalogueCostMinorUnits) })]),
  ].join(' · ');
}
