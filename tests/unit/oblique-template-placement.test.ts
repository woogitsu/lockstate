import { expect, it, vi } from 'vitest';
import { placeObliqueTemplateIfCurrent } from '../../src/ui/oblique-template-placement';
import type { RoomTemplateTool } from '../../src/ui/room-template-tool';

it('does not dismiss a newly selected plan when an older placement resolves', async () => {
  let resolvePlacement: ((value: { readonly ok: true }) => void) | undefined;
  const placement = new Promise<{ readonly ok: true }>((resolve) => { resolvePlacement = resolve; });
  const standDown = vi.fn();
  const tool = { placeAt: () => placement, standDown } as unknown as RoomTemplateTool;
  let revision = 1;
  const pending = placeObliqueTemplateIfCurrent(tool, { x: 10, y: 10 }, () => revision === 1);
  revision = 2; // Player moved the ghost or chose another plan before the worker replied.
  resolvePlacement?.({ ok: true });
  await pending;
  expect(standDown).not.toHaveBeenCalled();
});

it('dismisses the submitted plan when its own placement succeeds', async () => {
  const standDown = vi.fn();
  const tool = { placeAt: async () => ({ ok: true }), standDown } as unknown as RoomTemplateTool;
  await placeObliqueTemplateIfCurrent(tool, { x: 10, y: 10 }, () => true);
  expect(standDown).toHaveBeenCalledOnce();
});
