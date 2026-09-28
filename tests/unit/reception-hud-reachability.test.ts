import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { ROOM_TEMPLATE_NAME_KEYS } from '../../src/ui/hud/room-template-preview';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { localePlCatalog } from '../../src/content/locale-pl';

it('offers the complete Reception plan under its existing EN and PL room names', () => {
  expect(ROOM_TEMPLATE_IDS).toContain('reception-basic');
  expect(ROOM_TEMPLATE_NAME_KEYS).toHaveProperty('reception-basic', 'room.reception.name');
  expect(defaultLocaleEnCatalog.get('room.reception.name')).toBe('Reception');
  expect(localePlCatalog.get('room.reception.name')).toBe('Punkt przyjęć');
});
