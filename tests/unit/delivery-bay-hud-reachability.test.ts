import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { ROOM_TEMPLATE_NAME_KEYS } from '../../src/ui/hud/room-template-preview';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { localePlCatalog } from '../../src/content/locale-pl';

it('makes the authored Delivery Bay selectable with its localized room name', () => {
  expect(ROOM_TEMPLATE_IDS).toContain('delivery-bay-basic');
  expect(ROOM_TEMPLATE_NAME_KEYS).toHaveProperty('delivery-bay-basic', 'room.delivery-bay.name');
  expect(defaultLocaleEnCatalog.get('room.delivery-bay.name')).toBe('Delivery Bay');
  expect(localePlCatalog.get('room.delivery-bay.name')).toBe('Rampa dostawcza');
});
