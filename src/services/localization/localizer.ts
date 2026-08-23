import type { LocalizationKey } from '../../content/localization';
import type { MessageCatalog, MessageEntry } from './catalog';
import {
  type MessageParameters,
  type PluralForms,
  formatDate,
  formatNumber,
  interpolate,
  selectPluralForm,
} from './format';
import { DEFAULT_LOCALE, buildLocaleFallbackChain, normalizeLocaleTag } from './locale';

export interface MissingMessageReport {
  readonly key: LocalizationKey;
  readonly requestedLocale: string;
  readonly chain: readonly string[];
  readonly kind: 'missing-key' | 'missing-parameter';
  /** Populated for `missing-parameter`. */
  readonly parameters?: readonly string[];
}

export interface LocalizerOptions {
  readonly locale: string;
  readonly catalogs: readonly MessageCatalog[];
  readonly defaultLocale?: string;
  /**
   * Called for unresolved keys and unfilled placeholders. Wired to a
   * development counter or a telemetry event by the host -- never to a
   * thrown error: a missing translation must not crash a running game.
   */
  readonly onMissingKey?: (report: MissingMessageReport) => void;
}

/**
 * Resolves message keys through a per-key fallback chain (ADR 0011).
 * Pure and synchronous: catalogs are loaded before a `Localizer` is
 * constructed, so rendering never awaits a translation.
 */
export class Localizer {
  private readonly catalogsByLocale = new Map<string, MessageCatalog>();
  private readonly chain: readonly string[];
  public readonly locale: string;

  public constructor(private readonly options: LocalizerOptions) {
    this.locale = normalizeLocaleTag(options.locale) ?? DEFAULT_LOCALE;
    this.chain = buildLocaleFallbackChain(this.locale, options.defaultLocale ?? DEFAULT_LOCALE);
    for (const catalog of options.catalogs) {
      // Later catalogs win, so a freshly loaded locale can replace a
      // previously loaded one without rebuilding the whole list.
      this.catalogsByLocale.set(catalog.locale, catalog);
    }
  }

  /** The locales actually consulted for this instance, nearest first. */
  public fallbackChain(): readonly string[] {
    return this.chain;
  }

  public has(key: LocalizationKey): boolean {
    return this.resolveEntry(key) !== undefined;
  }

  /**
   * Resolves and interpolates a message. An unresolved key returns the key
   * itself: visible, greppable and obviously wrong in a screenshot, rather
   * than a blank space that silently ships.
   */
  public format(key: LocalizationKey, parameters: MessageParameters = {}): string {
    const entry = this.resolveEntry(key);
    if (entry === undefined) {
      this.reportMissing({ key, requestedLocale: this.locale, chain: this.chain, kind: 'missing-key' });
      return key;
    }
    const template = typeof entry.value === 'string' ? entry.value : entry.value.other;
    return this.interpolateOrReport(key, template, parameters);
  }

  /**
   * Plural-aware lookup. A plain string entry is treated as its own
   * `other` form, so adding plurals to a key later is a catalog change,
   * not a call-site change.
   */
  public formatPlural(key: LocalizationKey, count: number, parameters: MessageParameters = {}): string {
    const entry = this.resolveEntry(key);
    if (entry === undefined) {
      this.reportMissing({ key, requestedLocale: this.locale, chain: this.chain, kind: 'missing-key' });
      return key;
    }

    const forms: PluralForms = typeof entry.value === 'string' ? { other: entry.value } : entry.value;
    // Selected with the *resolving* locale's rules, not the requested one:
    // an English fallback inside a Polish UI must use English plural rules,
    // or it selects a form the fallback text does not have.
    const template = selectPluralForm(entry.locale, count, forms);
    return this.interpolateOrReport(key, template, { count, ...parameters });
  }

  public formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return formatNumber(this.locale, value, options);
  }

  public formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
    return formatDate(this.locale, value, options);
  }

  /** New instance for a different locale, reusing already-loaded catalogs. */
  public withLocale(locale: string, extraCatalogs: readonly MessageCatalog[] = []): Localizer {
    return new Localizer({
      ...this.options,
      locale,
      catalogs: [...this.options.catalogs, ...extraCatalogs],
    });
  }

  private resolveEntry(key: LocalizationKey): { readonly locale: string; readonly value: MessageEntry } | undefined {
    for (const locale of this.chain) {
      const catalog = this.catalogsByLocale.get(locale);
      const value = catalog?.messages[key];
      if (value !== undefined) return { locale, value: value as MessageEntry };
    }
    return undefined;
  }

  private interpolateOrReport(key: LocalizationKey, template: string, parameters: MessageParameters): string {
    const result = interpolate(template, parameters);
    if (result.missingParameters.length > 0) {
      this.reportMissing({
        key,
        requestedLocale: this.locale,
        chain: this.chain,
        kind: 'missing-parameter',
        parameters: result.missingParameters,
      });
    }
    return result.text;
  }

  private reportMissing(report: MissingMessageReport): void {
    this.options.onMissingKey?.(report);
  }
}
