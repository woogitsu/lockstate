import type { RoomTemplateId } from '../../content/room-template-catalog';

export interface RoomTemplatePlacementIntent {
  readonly templateId: RoomTemplateId;
  readonly origin: { readonly x: number; readonly y: number };
  readonly mirrorX: boolean;
}

export interface RoomTemplateControlOptions {
  readonly label: string;
  readonly templateId: RoomTemplateId;
  readonly origin: { readonly x: number; readonly y: number };
  readonly mirrorX?: boolean;
  readonly onPlace: (intent: RoomTemplatePlacementIntent, control: HTMLButtonElement) => void;
  readonly onPreflight?: (intent: RoomTemplatePlacementIntent) => Promise<boolean>;
}

/** Build UI control for the atomic PlaceRoomTemplate command. */
export function createRoomTemplateControl(options: RoomTemplateControlOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui-action hud-build__room-template';
  button.textContent = options.label;
  button.addEventListener('click', async () => {
    const intent = { templateId: options.templateId, origin: { ...options.origin }, mirrorX: options.mirrorX === true } satisfies RoomTemplatePlacementIntent;
    if (options.onPreflight !== undefined && !(await options.onPreflight(intent))) return;
    options.onPlace(intent, button);
  });
  return button;
}
