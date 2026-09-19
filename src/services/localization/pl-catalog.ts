import { localePlCatalog } from '../../content/locale-pl';
import { type MessageCatalog, type MessageEntry, buildMessageCatalog } from './catalog';

/**
 * The Polish (`pl`) message catalogue: the content-side labels
 * (`src/content/locale-pl.ts`) plus the strings this trusted-services layer
 * introduces, assembled the same way `buildDefaultMessageCatalog()` assembles
 * the English one (#661, ADR 0011).
 *
 * **Two files, because the English is two files.** `src/main.ts` builds the
 * running `Localizer` from `defaultMessageCatalogEn`, not from
 * `defaultLocaleEnCatalog`, and the difference is the sixteen strings below --
 * so a `pl` catalogue that stopped at `src/content/` would leave sixteen
 * English sentences on a Polish screen.
 *
 * **THIS IS NOW ALSO THE CHUNK, AND THE PARAGRAPH BELOW IS KEPT BECAUSE IT IS
 * WHAT WAS TRUE FOR A DAY.** Since #662 (2026-09-14) this module is the target
 * of the only entry in `src/main.ts`'s catalogue-chunk registry --
 * `pl: () => import('./services/localization/pl-catalog')` -- so it is a
 * separate code-split chunk that a player who never asks for Polish never
 * downloads, and `src/services/localization/pl-catalog.ts` has left
 * `UNREACHABLE_MODULES` in
 * `tests/foundation/trusted-tier-reachability-contract.test.ts` in the same
 * change. The **default export** at the bottom is what that registry consumes:
 * `unwrapCatalogModule` takes a module namespace's `default` and hands the
 * plain value to `decodeMessageCatalog`, exactly as a `fetch(...).json()` body
 * would be handed over. The named exports are unchanged and are what the tests
 * import.
 *
 * **This is not the delivery half.** Nothing here registers a chunk loader, a
 * supported-locale list or a picker: that is #662 and #663. What this module
 * is for today is being a real `MessageCatalog` that
 * `tests/foundation/second-locale-contract.test.ts` can audit against the
 * English reference -- which is what makes a claim about this catalogue's
 * well-formedness checkable rather than asserted.
 *
 * ## The two plural entries, and why they are the only ones
 *
 * `save-slots.available` and `save-slots.over-capacity` are the only keys in
 * the whole bundled catalogue that carry plural forms, and they are here as
 * plural forms because the audit's `flattened-plural` finding is right to
 * insist on it: answering a counted reference entry with one flat string uses
 * one grammatical shape for every number, silently.
 *
 * Polish needs four categories where English needs two.
 * `Intl.PluralRules('pl')` puts **1** in `one`, **2-4 and 22-24** in `few`,
 * **0 and 5+** in `many`, and **fractions** in `other` -- so `other` is the
 * category a Polish catalogue is likeliest to get wrong, because the natural
 * instinct is to put the 5+ form there and `other` is the *fraction* form.
 * Each entry below carries all four, and `other` carries the fraction shape
 * (*1,5 slotu*, genitive singular) rather than a copy of `many`.
 *
 * **A caveat that belongs beside them rather than in a document.** Nothing in
 * the running game calls `formatPlural`: `Localizer.format` reads
 * `entry.value.other` for a plural entry, and the HUD's `HudLocalizer` exposes
 * `format` and not `formatPlural`. These two keys are rendered by nothing at
 * all today, so the forms below are correct and unreached. Any *new* counted
 * message reaching a screen through `format` would render `other` for every
 * count -- which is why every counted message in `locale-pl.ts` is written to
 * be correct at every count with no plural forms instead.
 */
const SERVICE_MESSAGES_PL: Readonly<Record<string, MessageEntry>> = {
  'product.save-slots.plus-5.name': '5 dodatkowych slotów na więzienia',
  'product.save-slots.plus-10.name': '10 dodatkowych slotów na więzienia',

  'save-slots.available': {
    one: '{count} wolny slot na więzienie',
    few: '{count} wolne sloty na więzienia',
    many: '{count} wolnych slotów na więzienia',
    other: '{count} wolnego slotu na więzienie',
  },
  // The English puts the numeral in front of a verb ("{count} prisons are
  // above..."), which in Polish agrees with the numeral and flips at five --
  // *2 więzienia przekraczają*, *5 więzień przekracza*. Here that is carried
  // by the plural forms rather than by a reshape, because this entry has forms
  // to carry it with.
  'save-slots.over-capacity': {
    one: '{count} więzienie przekracza obecny limit slotów i nie da się go przenieść do chmury, dopóki uprawnienie nie zostanie potwierdzone.',
    few: '{count} więzienia przekraczają obecny limit slotów i nie da się ich przenieść do chmury, dopóki uprawnienie nie zostanie potwierdzone.',
    many: '{count} więzień przekracza obecny limit slotów i nie da się ich przenieść do chmury, dopóki uprawnienie nie zostanie potwierdzone.',
    other:
      '{count} więzienia przekracza obecny limit slotów i nie da się go przenieść do chmury, dopóki uprawnienie nie zostanie potwierdzone.',
  },

  'entitlements.unverified-offline': 'Płatne sloty są pokazane na podstawie ostatniego potwierdzonego uprawnienia.',
  'entitlements.base-tier': 'Do czasu potwierdzenia uprawnienia widoczne są tylko darmowe sloty.',

  'challenge.result.verified': 'Wynik zweryfikowany',
  'challenge.result.unverified': 'Wynik prywatny — nie liczy się do rankingu',
  // `{reason}` lands after a colon, which is the one position that reads
  // correctly whether it arrives as a resolved label or as raw text -- and
  // nothing in the tree says which it is.
  'challenge.result.rejected': 'Wynik odrzucony: {reason}',

  'telemetry.consent.title': 'Pomóc w ulepszaniu Lockstate?',
  'telemetry.consent.body':
    'Nic nie jest wysyłane, dopóki nie zaznaczysz pola. Możesz to zmienić w każdej chwili, a twój wybór jest zapisany tylko na tym urządzeniu.',
  'telemetry.consent.diagnostics': 'Wysyłaj diagnostykę awarii i błędów',
  'telemetry.consent.performance': 'Wysyłaj pomiary wydajności',
  'telemetry.consent.gameplay': 'Wysyłaj anonimowe statystyki rozgrywki',
  'telemetry.consent.accept': 'Zapisz moje wybory',
  'telemetry.consent.decline': 'Nie wysyłaj niczego',
};

function contentMessagesPl(): Record<string, MessageEntry> {
  const messages: Record<string, MessageEntry> = {};
  for (const [key, value] of localePlCatalog) messages[key] = value;
  return messages;
}

export function buildMessageCatalogPl(): MessageCatalog {
  return buildMessageCatalog('pl', { ...contentMessagesPl(), ...SERVICE_MESSAGES_PL });
}

export const messageCatalogPl = buildMessageCatalogPl();

/**
 * The catalogue chunk's payload, as `CatalogChunkImporter` promises it: a
 * module whose `default` is the catalogue data. It is the *same object* as
 * `messageCatalogPl` rather than a second build -- one evaluation per page,
 * whichever specifier reached it.
 *
 * A default export rather than a named one because that is the port's stated
 * contract (`chunk-catalog-loader.ts`, `unwrapCatalogModule`), which exists so
 * a locale authored as a `.json` file and a locale authored as a `.ts` module
 * arrive in the same shape.
 */
export default messageCatalogPl;
