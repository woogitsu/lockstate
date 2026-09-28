import type { RoomTemplatePlan, TemplateSquare } from '../../content/room-template-catalog';

/** The scene receives geometry and a worker verdict, never a simulation command. */
export interface TemplateGhostVerdict {
  readonly ok: boolean;
  readonly tile?: TemplateSquare;
}

export interface TemplateGhostPort {
  isArmed(): boolean;
  planAt(origin: TemplateSquare): RoomTemplatePlan;
  inspectAt(origin: TemplateSquare): Promise<{ readonly plan: RoomTemplatePlan; readonly verdict: TemplateGhostVerdict }>;
  placeAt(origin: TemplateSquare): Promise<TemplateGhostVerdict>;
  standDown(): void;
}
