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
}

/** Build UI control for the atomic PlaceRoomTemplate command. */
export function createRoomTemplateControl(options: RoomTemplateControlOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui-action hud-build__room-template';
  button.textContent = options.label;
  button.addEventListener('click', () => options.onPlace({
    templateId: options.templateId,
    origin: { ...options.origin },
    mirrorX: options.mirrorX === true,
  }, button));
  return button;
}
