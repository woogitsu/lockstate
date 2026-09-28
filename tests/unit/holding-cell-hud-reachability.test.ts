import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { ROOM_TEMPLATE_NAME_KEYS } from '../../src/ui/hud/room-template-preview';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { localePlCatalog } from '../../src/content/locale-pl';

it('makes the authored Holding Cell selectable with its localized room name', () => {
  expect(ROOM_TEMPLATE_IDS).toContain('holding-cell-basic');
  expect(ROOM_TEMPLATE_NAME_KEYS).toHaveProperty('holding-cell-basic', 'room.holding-cell.name');
  expect(defaultLocaleEnCatalog.get('room.holding-cell.name')).toBe('Holding Cell');
  expect(localePlCatalog.get('room.holding-cell.name')).toBe('Cela przejściowa');
});
