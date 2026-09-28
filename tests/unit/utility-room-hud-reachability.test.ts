import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { ROOM_TEMPLATE_NAME_KEYS } from '../../src/ui/hud/room-template-preview';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { localePlCatalog } from '../../src/content/locale-pl';

it('offers the complete Utility Room plan under its existing EN and PL names', () => {
  expect(ROOM_TEMPLATE_IDS).toContain('utility-room-basic');
  expect(ROOM_TEMPLATE_NAME_KEYS).toHaveProperty('utility-room-basic', 'room.utility-room.name');
  expect(defaultLocaleEnCatalog.get('room.utility-room.name')).toBe('Utility Room');
  expect(localePlCatalog.get('room.utility-room.name')).toBe('Pomieszczenie techniczne');
});
