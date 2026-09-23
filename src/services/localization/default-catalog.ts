import { defaultLocaleEnCatalog } from '../../content/default-locale-en';
import { DEFAULT_LOCALE } from '../../content/localization';
import { type MessageCatalog, type MessageEntry, buildMessageCatalog } from './catalog';

/**
 * The bundled default-locale catalog: content labels (owned by
 * `src/content/`) plus the product/UI strings this trusted-services layer
 * introduces. Only the default locale is bundled -- it must be complete so
 * the game always has text offline -- while every other locale is fetched
 * as versioned data (ADR 0011).
 *
 * Only strings that already exist are authored here. Issue #36 explicitly
 * excludes translating the game before content stabilizes; this is the
 * infrastructure plus the keys the layer itself needs.
 */
const SERVICE_MESSAGES: Readonly<Record<string, MessageEntry>> = {
  'product.save-slots.plus-5.name': '5 extra prison slots',
  'product.save-slots.plus-10.name': '10 extra prison slots',

  // Plural forms exercise the `Intl.PluralRules` path in the default
  // locale, so the mechanism is covered by real strings rather than only
  // by test fixtures.
  'save-slots.available': {
    one: '{count} prison slot available',
    other: '{count} prison slots available',
  },
  'save-slots.over-capacity': {
    one: '{count} prison is above your current slot capacity and cannot be moved to the cloud until your entitlement is confirmed.',
    other:
      '{count} prisons are above your current slot capacity and cannot be moved to the cloud until your entitlement is confirmed.',
  },
  'entitlements.unverified-offline': 'Paid slots are shown from your last confirmed entitlement.',
  'entitlements.base-tier': 'Showing free slots only until your entitlement can be confirmed.',

  'challenge.result.verified': 'Verified result',
  'challenge.result.unverified': 'Personal result — not eligible for ranking',
  'challenge.result.rejected': 'Result rejected: {reason}',

  // Rendered by `src/ui/telemetry-consent-prompt.ts`, which is mounted only
  // by a build that has an ingestion destination configured. The first four
  // of these shipped inside the bundle for months with nothing rendering them
  // (ADR 0044); the last three arrive with the code that renders all seven.
  // `LockState.io` since the owner's ruling of 2026-09-23 on #703.
  'telemetry.consent.title': 'Help improve LockState.io?',
  'telemetry.consent.body':
    'Nothing is sent unless you tick a box. You can change this at any time, and your choice is stored on this device only.',
  'telemetry.consent.diagnostics': 'Send crash and error diagnostics',
  'telemetry.consent.performance': 'Send performance measurements',
  'telemetry.consent.gameplay': 'Send anonymous gameplay statistics',
  'telemetry.consent.accept': 'Save my choices',
  'telemetry.consent.decline': 'Send nothing',
};

function contentMessages(): Record<string, MessageEntry> {
  const messages: Record<string, MessageEntry> = {};
  for (const [key, value] of defaultLocaleEnCatalog) messages[key] = value;
  return messages;
}

export function buildDefaultMessageCatalog(): MessageCatalog {
  return buildMessageCatalog(DEFAULT_LOCALE, { ...contentMessages(), ...SERVICE_MESSAGES });
}

export const defaultMessageCatalogEn = buildDefaultMessageCatalog();
