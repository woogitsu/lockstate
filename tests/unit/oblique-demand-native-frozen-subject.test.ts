import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { cotFrameAtPublicPose, frozenPath, readFrozenImageInventory, requireFrozenBytes } from '../browser/oblique-demand-frozen-assets';

const directory = mkdtempSync(join(tmpdir(), 'lockstate-demand-frozen-subject-'));
const asset = join(directory, 'client.js');
writeFileSync(asset, 'exact actual supplied fixture bytes');
afterEach(() => { writeFileSync(asset, 'exact actual supplied fixture bytes'); });
process.once('exit', () => { unlinkSync(asset); rmdirSync(directory); });
it('accepts exactly delivered frozen bytes and preserves an absolute subject path', () => {
  const match = requireFrozenBytes(directory, 'http://localhost/client.js', readFileSync(asset));
  expect(match.path).toBe(asset); expect(match.bytes).toBeGreaterThan(0);
});
it('rejects changed delivered bytes rather than silently naming the expected subject', () => {
  expect(() => requireFrozenBytes(directory, 'http://localhost/client.js', Buffer.from('different'))).toThrow('differ');
});
it('rejects dev sources and paths escaping the frozen root', () => {
  expect(() => requireFrozenBytes(directory, 'http://localhost/src/main.ts', Buffer.from('source'))).toThrow('Source route');
  expect(() => frozenPath(directory, '/%2e%2e%2foutside.js')).toThrow('escapes');
});
it('validates actual catalog schemas and identifies both distinct authored cot camera frames', () => {
  const inventory = readFrozenImageInventory(resolve(__dirname, '../../public'));
  expect(inventory.catalogs.size).toBe(inventory.registry.entries.length);
  expect(inventory.floors.length).toBeGreaterThan(0);
  const cot = inventory.catalogs.get('furniture.cell.cot.single'); expect(cot).toBeDefined();
  const initial = cotFrameAtPublicPose(cot!, 300, 40), turned = cotFrameAtPublicPose(cot!, 330, 40);
  expect(initial.sha256).not.toBe(turned.sha256);
  expect(initial.image).toContain('yaw+300-elev40'); expect(turned.image).toContain('yaw+330-elev40');
});
