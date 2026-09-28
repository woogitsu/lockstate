import '../../src/ui/tokens.css';
import '../../src/ui/primitives/primitives.css';
import '../../src/ui/hud/hud.css';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { createRoomTemplatePreview } from '../../src/ui/hud/room-template-preview';
import { RoomTemplateTool, type RoomTemplatePlacementRequest } from '../../src/ui/room-template-tool';

const requests: RoomTemplatePlacementRequest[] = [];
let releasePendingPlacement: (() => void) | undefined;
const tool = new RoomTemplateTool({
  preflight: async (plan) => plan.origin.x === 5
    ? { ok: false, reason: 'structure-occupied', tile: { x: 6, y: plan.origin.y + 1 } }
    : { ok: true },
  place: async (request) => {
    if (request.origin.x === 42) await new Promise<void>((resolve) => { releasePendingPlacement = resolve; });
    requests.push(request);
  },
});
const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
const preview = createRoomTemplatePreview(localizer, tool);
document.getElementById('root')!.append(preview.openButton, preview.dialog);
(window as unknown as { templateRequests: RoomTemplatePlacementRequest[] }).templateRequests = requests;
(window as unknown as { releaseTemplatePlacement: () => void }).releaseTemplatePlacement = () => releasePendingPlacement?.();
(window as unknown as { templatePlacementPending: () => boolean }).templatePlacementPending = () => releasePendingPlacement !== undefined;
