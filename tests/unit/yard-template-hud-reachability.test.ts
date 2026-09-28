import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { ROOM_TEMPLATE_NAME_KEYS } from '../../src/ui/hud/room-template-preview';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { localePlCatalog } from '../../src/content/locale-pl';

it('offers the full Yard plan under existing English and Polish names', () => {
  expect(ROOM_TEMPLATE_IDS).toContain('yard-basic');
  expect(ROOM_TEMPLATE_NAME_KEYS).toHaveProperty('yard-basic', 'room.yard.name');
  expect(defaultLocaleEnCatalog.get('room.yard.name')).toBe('Yard');
  expect(localePlCatalog.get('room.yard.name')).toBe('Plac spacerowy');
});
