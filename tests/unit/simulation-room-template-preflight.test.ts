import { describe, expect, it } from 'vitest';
import { RoomTemplatePreflightReader } from '../../src/ui/simulation-room-template-preflight';

describe('room template preflight reader', () => {
  it('requests the strict world projection with a typed target', async () => {
    const sent: any[] = [];
    const channel: any = { addListener: () => undefined, send: (message: unknown) => sent.push(message) };
    const reader = new RoomTemplatePreflightReader(channel, { generateMessageId: () => 'template-test', replyTimeoutMs: 5 });
    const pending = reader.read('cell-basic', { x: 2, y: 3 }, true);
    expect(sent[0].payload).toMatchObject({ projectionId: 'world/room-template-preflight', target: { kind: 'room-template', templateId: 'cell-basic', origin: { x: 2, y: 3 }, mirrorX: true } });
    reader.dispose();
    await expect(pending).rejects.toThrow();
  });
});