import type { TemplateSquare } from '../content/room-template-catalog';
import type { RoomTemplateTool } from './room-template-tool';

/** An older worker answer must not disarm a newer preview or selection. */
export async function placeObliqueTemplateIfCurrent(
  tool: RoomTemplateTool,
  origin: TemplateSquare,
  isCurrent: () => boolean,
): Promise<void> {
  const result = await tool.placeAt(origin);
  if (result.ok && isCurrent()) tool.standDown();
}
