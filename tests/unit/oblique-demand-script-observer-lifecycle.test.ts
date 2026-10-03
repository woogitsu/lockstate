import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Page } from '../browser/network-changed-fixture';
import { observeDemandRoute } from '../browser/oblique-demand-native-observers';

const scratch: string[] = [];
afterEach(() => {
  for (const directory of scratch.splice(0)) {
    unlinkSync(join(directory, 'worker.js'));
    rmdirSync(directory);
  }
});

async function observerPort(delivered: Buffer) {
  const directory = mkdtempSync(join(tmpdir(), 'lockstate-demand-script-observer-'));
  scratch.push(directory);
  writeFileSync(join(directory, 'worker.js'), 'actual supplied worker fixture bytes');
  let closed = false;
  const body = vi.fn(async () => {
    if (closed) throw new Error('response body execution context has closed');
    return delivered;
  });
  const listeners = new Map<string, (value: unknown) => void>();
  const page = {
    on: (name: string, listener: (value: unknown) => void) => { listeners.set(name, listener); },
    addInitScript: async () => undefined,
    evaluate: async () => [],
  } as unknown as Page;
  const observer = await observeDemandRoute(page, directory);
  listeners.get('response')!({
    url: () => 'http://localhost/worker.js', status: () => 200, body,
    request: () => ({ resourceType: () => 'script' }),
  });
  return { observer, body, close: () => { closed = true; } };
}

it('captures delivered script bytes before its worker response context closes', async () => {
  const port = await observerPort(Buffer.from('actual supplied worker fixture bytes'));
  expect((await port.observer.read()).errors).toEqual([]);
  port.close();
  expect(await port.observer.scripts()).toEqual([expect.objectContaining({
    url: 'http://localhost/worker.js', status: 200, resourceType: 'script',
    bytes: Buffer.byteLength('actual supplied worker fixture bytes'),
  })]);
  expect(port.body).toHaveBeenCalledTimes(1);
});

it('records the actual URL and rejects mismatched served bytes instead of a disk-only claim', async () => {
  const port = await observerPort(Buffer.from('different delivered script bytes'));
  const read = await port.observer.read();
  expect(read.errors).toHaveLength(1);
  expect(read.errors[0]).toContain('http://localhost/worker.js');
  expect(read.errors[0]).toContain('Delivered bytes differ');
  await expect(port.observer.scripts()).rejects.toThrow();
});
