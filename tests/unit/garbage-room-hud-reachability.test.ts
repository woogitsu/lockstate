import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { ROOM_TEMPLATE_NAME_KEYS } from '../../src/ui/hud/room-template-preview';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { localePlCatalog } from '../../src/content/locale-pl';

it('offers the complete Garbage Room plan under its existing EN and PL names', () => {
  expect(ROOM_TEMPLATE_IDS).toContain('garbage-room-basic');
  expect(ROOM_TEMPLATE_NAME_KEYS).toHaveProperty('garbage-room-basic', 'room.garbage-room.name');
  expect(defaultLocaleEnCatalog.get('room.garbage-room.name')).toBe('Garbage Room');
  expect(localePlCatalog.get('room.garbage-room.name')).toBe('Śmietnik');
});
