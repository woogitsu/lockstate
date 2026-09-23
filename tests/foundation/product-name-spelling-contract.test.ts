import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';

/**
 * **The product spells its own name one way wherever a player reads it**
 * ([#703](https://github.com/matmaxalez/lockstate/issues/703), the owner's
 * ruling of 2026-09-23, `AGENTS.md` entry 15).
 *
 * #703's ruling 8 of 2026-08-31 said the product stops spelling its name two
 * ways, and left which spelling wins to the owner; they chose `LockState.io`,
 * the spelling `brand.wordmark` already carried. Before the ruling the page's
 * `<title>` and description read `Lockstate.io` and six catalogue entries read
 * `Lockstate` -- two spellings of the name on one page, which is the defect.
 *
 * **What is read, and why these three places.** Everything a player can read
 * that names the product comes from one of them: the HTML shell (`<title>`,
 * the description meta), the bundled English message catalogue -- which is
 * `src/content/default-locale-en.ts` and the service messages together -- and
 * the Polish one. A spelling test that read only one catalogue would let the
 * other drift, which is how the two spellings came about in the first place.
 *
 * **What is deliberately not read.** Code identifiers, the package name, the
 * repository name, storage keys (`lockstate.settings.*`) and deploy
 * configuration are not a player's reading and the ruling does not reach them,
 * so the match below is case-insensitive on purpose and then requires the
 * exact spelling: a lower-case `lockstate` in a *value* would still be caught,
 * because a catalogue value is something a player reads.
 */

const PRODUCT_NAME = 'LockState.io';

/** Every occurrence of the name, in any casing and with or without the suffix. */
const ANY_SPELLING = /lockstate(?:\.io)?/giu;

function misspellings(text: string): string[] {
  return [...text.matchAll(ANY_SPELLING)].map((match) => match[0]).filter((found) => found !== PRODUCT_NAME);
}

function catalogueValues(messages: Readonly<Record<string, unknown>>): readonly (readonly [string, string])[] {
  const out: (readonly [string, string])[] = [];
  for (const [key, entry] of Object.entries(messages)) {
    if (typeof entry === 'string') out.push([key, entry]);
    else if (entry !== null && typeof entry === 'object') {
      for (const form of Object.values(entry as Record<string, unknown>)) {
        if (typeof form === 'string') out.push([key, form]);
      }
    }
  }
  return out;
}

describe('the product name as a player reads it (#703, 2026-09-23)', () => {
  it('is the wordmark the brand badge already shows', () => {
    expect(defaultMessageCatalogEn.messages['brand.wordmark']).toBe(PRODUCT_NAME);
    expect(messageCatalogPl.messages['brand.wordmark']).toBe(PRODUCT_NAME);
  });

  it('is spelled that way in the page shell: its title and its description', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    const title = /<title>([^<]*)<\/title>/u.exec(html)?.[1];
    const description = /<meta\s+name="description"\s+content="([^"]*)"/u.exec(html)?.[1];

    expect(title, 'the tab a player sees').toBe(PRODUCT_NAME);
    expect(description, 'the page must still describe itself').toBeDefined();
    expect(description, 'and name the product in it').toContain(PRODUCT_NAME);
    expect(misspellings(description ?? ''), 'no second spelling in the description').toEqual([]);
  });

  it('is spelled that way in every English and Polish sentence that names it', () => {
    const found: string[] = [];
    for (const [locale, catalogue] of [
      ['en', defaultMessageCatalogEn.messages],
      ['pl', messageCatalogPl.messages],
    ] as const) {
      for (const [key, value] of catalogueValues(catalogue)) {
        for (const wrong of misspellings(value)) found.push(`${locale} ${key}: "${wrong}" in ${JSON.stringify(value)}`);
      }
    }
    expect(found, 'a catalogue value spells the product name another way').toEqual([]);
  });

  it('is actually named somewhere in each catalogue besides the wordmark, so the sweep above has something to read', () => {
    for (const catalogue of [defaultMessageCatalogEn.messages, messageCatalogPl.messages]) {
      const naming = catalogueValues(catalogue).filter(
        ([key, value]) => key !== 'brand.wordmark' && value.includes(PRODUCT_NAME),
      );
      expect(naming.length).toBeGreaterThan(0);
    }
  });
});
