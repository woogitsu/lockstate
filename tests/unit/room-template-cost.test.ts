import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';

describe('room template catalogue cost', () => {
  it('reports the same material demand and catalogue price as the built Basic cell', () => {
    expect(projectRoomTemplateCost('cell-basic')).toEqual({
      orderCount: 20,
      materials: [
        { itemId: 'item.brick', quantity: 35 },
        { itemId: 'item.wood-plank', quantity: 2 },
      ],
      catalogueCostMinorUnits: 1530,
    });
  });

  it('prices every shipped plan from its actual construction orders', () => {
    for (const id of ROOM_TEMPLATE_IDS) {
      const quote = projectRoomTemplateCost(id);
      expect(quote.orderCount).toBeGreaterThan(0);
      expect(quote.materials.every((item) => item.quantity > 0)).toBe(true);
      expect(quote.catalogueCostMinorUnits).toBeGreaterThan(0);
    }
  });
});
