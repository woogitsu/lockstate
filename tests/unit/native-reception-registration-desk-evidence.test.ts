import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertReceptionDeliveredArt } from '../browser/native-reception-room-evidence';
import { RECEPTION_ART, RECEPTION_REGISTRATION_DESK_ART } from '../fixtures/native-reception-room-plan';

const root = new URL('../../', import.meta.url);
const readPublic = (path: string) => readFileSync(new URL(`public${path}`, root));
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('independent Reception registration desk source/body preparation', () => {
  it('pins the published dedicated desk source and canonical local60/e40 frame independently', () => {
    expect(RECEPTION_REGISTRATION_DESK_ART.sourceSha256).toBe('be670aa62316c8f8557a1edbed75f3ac87df3ebe4bc78a3958c1e106347bb0dc');
    expect(sha(readFileSync(new URL(RECEPTION_REGISTRATION_DESK_ART.source, root)))).toBe('be670aa62316c8f8557a1edbed75f3ac87df3ebe4bc78a3958c1e106347bb0dc');
    expect(RECEPTION_REGISTRATION_DESK_ART.exposedFrameSha256).toBe('bac55a0b3bacc977eeca707eaf444e58f8661171391a8d1c1d430e521204febe');
    expect(sha(readPublic(RECEPTION_REGISTRATION_DESK_ART.exposedFrame))).toBe('bac55a0b3bacc977eeca707eaf444e58f8661171391a8d1c1d430e521204febe');
  });

  it.each([RECEPTION_ART, RECEPTION_REGISTRATION_DESK_ART])('accepts the actual local $assetId bodies using the native observer assertions', art => {
    // Local file evidence only: this does not synthesize a native network/decoder receipt.
    const verified = assertReceptionDeliveredArt(art, readPublic(art.descriptor), readPublic(art.exposedFrame));
    expect(verified.catalog.assetId).toBe(art.assetId);
    expect(verified.catalog.frames).toHaveLength(72);
  });

  it('rejects a wrong source hash even when the descriptor body and pinned canonical body hash agree', () => {
    const art = RECEPTION_REGISTRATION_DESK_ART;
    const altered: Record<string, unknown> = JSON.parse(readPublic(art.descriptor).toString('utf8')) as Record<string, unknown>;
    altered['sourceSha256'] = '0'.repeat(64);
    const body = Buffer.from(JSON.stringify(altered, null, 2) + '\n');
    const matchedBodyPin = { ...art, descriptorCanonicalTextSha256: sha(body) };
    expect(() => assertReceptionDeliveredArt(matchedBodyPin, body, readPublic(art.exposedFrame))).toThrow();
  });

  it('rejects the prior generic Office body instead of accepting an available PNG as the desk', () => {
    const oldBody = readPublic('/game-content/oblique-furniture-office-desk-generic.v1.json');
    const matchedBodyPin = { ...RECEPTION_REGISTRATION_DESK_ART,
      descriptorCanonicalTextSha256: sha(Buffer.from(oldBody.toString('utf8').replace(/\r\n/g, '\n'))) };
    expect(() => assertReceptionDeliveredArt(matchedBodyPin, oldBody,
      readPublic(RECEPTION_REGISTRATION_DESK_ART.exposedFrame))).toThrow();
  });
});
