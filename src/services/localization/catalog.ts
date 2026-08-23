import { z } from 'zod';
import type { LocalizationCatalog, LocalizationKey } from '../../content/localization';
import { type DeepReadonly, identifierSchema } from '../../simulation/protocol/types';
import type { PluralForms } from './format';
import { normalizeLocaleTag } from './locale';

/**
 * A catalog is versioned data loaded by locale, not a module constant:
 * only the default locale is bundled (so the game always has complete text
 * offline), and every other locale is fetched from its own versioned URL
 * (docs/DEPLOYMENT.md forbids mutable stable-name asset paths).
 */
export const MESSAGE_CATALOG_VERSION = 1 as const;

export const pluralFormsSchema = z
  .object({
    zero: z.string().optional(),
    one: z.string().optional(),
    two: z.string().optional(),
    few: z.string().optional(),
    many: z.string().optional(),
    /** Mandatory: plural selection must always resolve to something. */
    other: z.string(),
  })
  .strict();

export const messageEntrySchema = z.union([z.string(), pluralFormsSchema]);
export type MessageEntry = string | PluralForms;

export const messageCatalogSchema = z
  .object({
    version: z.literal(MESSAGE_CATALOG_VERSION),
    locale: z.string().min(2).max(35),
    /**
     * Keys are stable identifiers, never source text (ADR 0011): using the
     * English string as the key makes a typo fix break every locale.
     */
    messages: z.record(identifierSchema, messageEntrySchema),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    if (normalizeLocaleTag(catalog.locale) === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Catalog locale is not a valid language tag.', path: ['locale'] });
    }
  });
export type MessageCatalog = DeepReadonly<z.infer<typeof messageCatalogSchema>>;

export type MessageCatalogDecodeResult =
  | { readonly ok: true; readonly catalog: MessageCatalog }
  | { readonly ok: false; readonly message: string };

/**
 * Validates a fetched catalog. A catalog that fails validation is refused
 * whole: the caller keeps the previous (or default) locale rather than
 * starting with half its text missing.
 */
export function decodeMessageCatalog(input: unknown): MessageCatalogDecodeResult {
  const parsed = messageCatalogSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; '),
    };
  }
  const normalizedLocale = normalizeLocaleTag(parsed.data.locale)!;
  return { ok: true, catalog: { ...parsed.data, locale: normalizedLocale } as MessageCatalog };
}

export function buildMessageCatalog(
  locale: string,
  messages: Readonly<Record<LocalizationKey, MessageEntry>>,
): MessageCatalog {
  const result = decodeMessageCatalog({ version: MESSAGE_CATALOG_VERSION, locale, messages });
  if (!result.ok) throw new RangeError(`Invalid message catalog for "${locale}": ${result.message}`);
  return result.catalog;
}

/**
 * Bridges the existing content-side default map
 * (`src/content/default-locale-en.ts`) into a real catalog. The content
 * layer keeps owning which keys exist -- this only changes how they are
 * resolved, so no content module had to be rewritten for #36.
 */
export function messageCatalogFromLocalizationCatalog(locale: string, catalog: LocalizationCatalog): MessageCatalog {
  const messages: Record<string, MessageEntry> = {};
  for (const [key, value] of catalog) messages[key] = value;
  return buildMessageCatalog(locale, messages);
}

/**
 * Loader boundary: fetching is the host's concern (a versioned URL in the
 * browser, a file in a test). Keeping it a port is what lets the whole
 * localization runtime be tested without a network or a DOM.
 */
export interface MessageCatalogLoader {
  load(locale: string): Promise<unknown>;
}

export type LoadedCatalogResult =
  | { readonly ok: true; readonly catalog: MessageCatalog }
  | { readonly ok: false; readonly locale: string; readonly message: string };

/** Loads and validates one locale, reporting failure instead of throwing into UI code. */
export async function loadMessageCatalog(loader: MessageCatalogLoader, locale: string): Promise<LoadedCatalogResult> {
  const normalized = normalizeLocaleTag(locale);
  if (normalized === undefined) return { ok: false, locale, message: 'Invalid locale tag.' };

  let raw: unknown;
  try {
    raw = await loader.load(normalized);
  } catch (error) {
    return { ok: false, locale: normalized, message: error instanceof Error ? error.message : 'Catalog load failed.' };
  }

  const decoded = decodeMessageCatalog(raw);
  if (!decoded.ok) return { ok: false, locale: normalized, message: decoded.message };
  if (decoded.catalog.locale !== normalized) {
    return { ok: false, locale: normalized, message: `Catalog declares locale "${decoded.catalog.locale}".` };
  }
  return { ok: true, catalog: decoded.catalog };
}
