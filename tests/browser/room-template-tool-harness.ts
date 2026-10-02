import '../../src/ui/tokens.css';
import '../../src/ui/primitives/primitives.css';
import '../../src/ui/hud/hud.css';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { createRoomTemplatePreview } from '../../src/ui/hud/room-template-preview';
import { RoomTemplateTool, type RoomTemplatePlacementRequest } from '../../src/ui/room-template-tool';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';

const requests: RoomTemplatePlacementRequest[] = [];
const tool = new RoomTemplateTool({
  objectFootprint: id => defaultObjectRegistry.getById(getBuildableDefinition(id).placesObjectId!)!.footprint,
  preflight: async (plan) => plan.origin.x === 5
    ? { ok: false, reason: 'structure-occupied', tile: { x: 6, y: plan.origin.y + 1 } }
    : { ok: true },
  place: async (request) => { requests.push(request); },
});
const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
const preview = createRoomTemplatePreview(localizer, tool);
document.getElementById('root')!.append(preview.openButton, preview.dialog);
(window as unknown as { templateRequests: RoomTemplatePlacementRequest[] }).templateRequests = requests;
