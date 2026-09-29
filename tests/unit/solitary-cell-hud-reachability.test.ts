import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { ROOM_TEMPLATE_NAME_KEYS } from '../../src/ui/hud/room-template-preview';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { localePlCatalog } from '../../src/content/locale-pl';

it('makes the authored Solitary Cell selectable with its localized room name', () => {
  expect(ROOM_TEMPLATE_IDS).toContain('solitary-cell-basic');
  expect(ROOM_TEMPLATE_NAME_KEYS).toHaveProperty('solitary-cell-basic', 'room.solitary-cell.name');
  expect(defaultLocaleEnCatalog.get('room.solitary-cell.name')).toBe('Solitary Cell');
  expect(localePlCatalog.get('room.solitary-cell.name')).toBe('Cela izolacyjna');
});
