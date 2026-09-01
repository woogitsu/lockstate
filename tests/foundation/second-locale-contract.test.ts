import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { auditLocaleCatalog, describeFindings } from '../helpers/locale-catalog-audit';
import type { MessageCatalog, MessageEntry } from '../../src/services/localization/catalog';
import { buildMessageCatalog } from '../../src/services/localization/catalog';
import { defaultMessageCatalogEn } from '../../src/services/localization/default-catalog';
import { PSEUDO_LOCALE } from '../../src/services/localization/locale';
import { buildPseudoLocaleCatalog } from '../../src/services/localization/pseudo';

/**
 * What a second locale needs from this repository, gated (#664).
 *
 * Three sections, in the order a second locale meets them:
 *
 * 1. **every non-default catalogue is well-formed**, without demanding that it
 *    be complete -- a partial locale falls back per key and that is a valid
 *    shipping state;
 * 2. **the English catalogue's counted messages**, because a flat string with
 *    `{count}` in it is grammatical in English and wrong in Polish for most
 *    numbers, and no translator can fix that from their side;
 * 3. **sentences assembled in code**, which no catalogue can fix from its side
 *    either.
 *
 * ## The rule every section here is written against
 *
 * #664 states it: *"Do not make a gate that can only pass by having a complete
 * translation, and then complete the translation to make the gate pass."* The
 * catalogue is the owner's to approve. So sections 2 and 3 are **inventories
 * pinned at what is there today**, failing when the debt grows and equally
 * when it shrinks without the list being updated -- not thresholds that
 * anybody has to translate their way past.
 */

const SRC_ROOT = join(__dirname, '../../src');

// ---------------------------------------------------------------------------
// 1. Non-default catalogues
// ---------------------------------------------------------------------------

/**
 * Every non-default catalogue this repository can build.
 *
 * One today. `tests/fixtures/localization/*.json` are deliberately excluded:
 * they are four-key fixtures for `tests/unit/localization-chunk-delivery.test.ts`
 * written against a four-key reference, so auditing them against the real
 * catalogue would report 588 keys of nothing. When #661's `pl` catalogue and
 * #662's chunk importer meet, that catalogue registers here and the ratchet
 * below gains its row.
 */
const NON_DEFAULT_CATALOGS: Readonly<Record<string, () => MessageCatalog>> = {
  [PSEUDO_LOCALE]: () => buildPseudoLocaleCatalog(defaultMessageCatalogEn),
};

/**
 * Keys each locale actually carries, pinned so coverage cannot quietly fall.
 *
 * A **floor**, not a target: adding translations is free, and losing them
 * fails immediately because the floor sits at the current value. The
 * pseudo-locale is derived from the default catalogue and is therefore always
 * complete; a hand-authored locale is the one this exists for.
 */
const COVERAGE_FLOOR: Readonly<Record<string, number>> = {
  [PSEUDO_LOCALE]: 588,
};

describe('every non-default catalogue is well-formed, without being required to be complete (#664)', () => {
  it('audits each registered catalogue clean', () => {
    const problems: string[] = [];
    for (const build of Object.values(NON_DEFAULT_CATALOGS)) {
      problems.push(...describeFindings(auditLocaleCatalog(build(), defaultMessageCatalogEn)));
    }
    expect(problems).toEqual([]);
  });

  it('fires on these same catalogues when they are broken, so the pass above is not vacuous', () => {
    // The control, and it is run against the **real** catalogue rather than a
    // four-key fixture (those are in `tests/unit/locale-catalog-audit.test.ts`,
    // one per finding kind). A pass over a registry the audit cannot judge --
    // an empty reference, a candidate that failed to build -- looks identical
    // to a pass over a clean one.
    const pseudo = buildPseudoLocaleCatalog(defaultMessageCatalogEn);
    const messages = { ...pseudo.messages } as Record<string, MessageEntry>;

    // Re-tagged `pl`, whose rules select four categories rather than English's
    // two: every plural entry in the catalogue is now short of `few` and
    // `many`, which is precisely the defect a Polish catalogue would ship.
    const retagged = buildMessageCatalog('pl', { ...messages, 'ui.not-a-real-key': 'X' });
    const audit = auditLocaleCatalog(retagged, defaultMessageCatalogEn);
    const kinds = new Set(audit.findings.map((finding) => finding.kind));

    expect(audit.referenceKeyCount, 'the reference catalogue is empty, so the audit is judging nothing').toBeGreaterThanOrEqual(588);
    expect([...kinds].sort()).toEqual(['missing-plural-category', 'unknown-key']);
    // Two plural entries short of two categories each.
    expect(audit.findings.filter((finding) => finding.kind === 'missing-plural-category')).toHaveLength(4);
  });

  it('keeps the ratchet and the registry in agreement, in both directions', () => {
    // A locale registered with no row would be audited and never ratcheted; a
    // row for a locale nobody builds is a floor over nothing. Either way the
    // ratchet stops meaning what it says.
    expect(Object.keys(COVERAGE_FLOOR).sort()).toEqual(Object.keys(NON_DEFAULT_CATALOGS).sort());
    expect(Object.keys(NON_DEFAULT_CATALOGS).length).toBeGreaterThanOrEqual(1);
  });

  it('has not lost coverage in any locale', () => {
    for (const [locale, build] of Object.entries(NON_DEFAULT_CATALOGS)) {
      const audit = auditLocaleCatalog(build(), defaultMessageCatalogEn);
      expect(
        audit.translatedKeyCount,
        `${locale} translates fewer keys than when its floor was set -- raise it deliberately, never lower it`,
      ).toBeGreaterThanOrEqual(COVERAGE_FLOOR[locale]!);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Counted messages that are not plural entries
// ---------------------------------------------------------------------------

/**
 * English messages that interpolate `{count}` into one flat string.
 *
 * `Localizer.formatPlural` treats a flat string as its own `other` form, so
 * these render one grammatical shape for every number. That is correct in
 * English for most of them and wrong in Polish for 2, 3, 4, 22, 23, 24 and so
 * on -- and a translator **cannot fix it from the catalogue**, because a
 * locale may only supply the forms the key already has: a flat key has no
 * `few` slot to fill.
 *
 * Pinned exactly rather than counted, and pinned rather than fixed. Turning
 * one of these into a plural entry means authoring its English `one`/`other`
 * text, which is player-visible copy and the owner's (`AGENTS.md`, exclusion
 * 4). What this list does is stop the debt growing silently: a new counted
 * message fails here on the commit that adds it, while it is still one
 * sentence to write rather than twenty-two.
 *
 * Not every entry is a defect. `hud.build.target-run` (`{count} × {edge} from
 * {x}, {y}`) and `hud.rooms.needs-object` (`{count} × {object}`) are formulae
 * where the `×` carries the counting, and a formula has no grammatical number
 * in any language. They are listed anyway: the point of the list is that
 * every counted message has been looked at, and splitting it into "real" and
 * "fine" would need a per-entry judgement that is the owner's to make.
 */
const FLAT_MESSAGES_WITH_COUNT = [
  'hud.alert.event.incidents.riot-opened',
  'hud.alert.event.prisoners.discharged',
  'hud.build.buy-submit',
  'hud.build.deliveries-count',
  'hud.build.deliveries-more',
  'hud.build.delivery',
  'hud.build.queue-count',
  'hud.build.queue-more',
  'hud.build.target-run',
  'hud.intake.no-place',
  'hud.intake.pipeline-failed',
  'hud.intake.pipeline-stage',
  'hud.regime.roster-more',
  'hud.rooms.needs-item-more',
  'hud.rooms.needs-object',
  'hud.rooms.requires-object',
  'hud.security.coverage-short-hint',
  'hud.security.coverage-unguarded-hint',
  'hud.security.held-more',
  'hud.status.prisoners-without-bed',
  'save.list.item',
] as const;

describe('the English catalogue counts things with flat strings, and the debt may not grow (#664)', () => {
  it('holds exactly the counted messages this list names', () => {
    const found = Object.entries(defaultMessageCatalogEn.messages)
      .filter(([, entry]) => typeof entry === 'string' && entry.includes('{count}'))
      .map(([key]) => key)
      .sort();

    expect(
      found,
      'a message interpolating {count} into a flat string cannot be given plural forms by a translator: ' +
        'author the forms in English, or add the key here with the reason it needs none',
    ).toEqual([...FLAT_MESSAGES_WITH_COUNT].sort());
  });

  it('is measured against a catalogue that has messages in it, and plural entries it could have used', () => {
    // The control. The assertion above is a set comparison, which an empty
    // catalogue satisfies against an empty list -- and the list is only
    // interesting next to the number of keys that got this right.
    const entries = Object.values(defaultMessageCatalogEn.messages);
    expect(entries.length, 'fewer messages than when this floor was set').toBeGreaterThanOrEqual(588);

    // Two, today: `save-slots.available` and `save-slots.over-capacity`. The
    // mechanism exists and is used, which is why the list above is a debt
    // rather than a missing feature.
    const plural = entries.filter((entry) => typeof entry !== 'string');
    expect(plural.length, 'no plural entry is left, so the catalogue has no worked example of the right shape').toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Sentences assembled in code
// ---------------------------------------------------------------------------

/**
 * `docs/LOCALIZATION.md`'s authoring rule 4: *"Keep punctuation and units
 * inside the message; do not assemble sentences from fragments in code -- word
 * order differs per language."* Nothing enforced it.
 *
 * A template literal that mixes a localized string with literal text produces
 * a sentence whose shape no catalogue can change. It is the same defect as a
 * missing key with the opposite symptom: the missing key is loud (it renders
 * as itself), and this one renders perfectly in English forever.
 */
const UI_ROOTS = ['ui', 'main.ts'] as const;

/** `t(...)`, `localizer.format(...)`, `.formatPlural(...)`. */
const LOCALIZER_CALL = /(?:\bt|\.format|\.formatPlural)\s*\(/;

/**
 * Sites that assemble, with the reason each is still here.
 *
 * Both are accessible names, and both are the same shape: a localized word,
 * a hard-coded `": "`, and text read back out of another element that is
 * itself already localized. Fixing one means authoring a key whose text is a
 * punctuation template -- copy that reaches a screen-reader user, so the
 * owner's under `AGENTS.md` exclusion 4. Recorded here rather than fixed, and
 * pinned so a third cannot arrive unnoticed.
 */
const ASSEMBLED_SENTENCES: Readonly<Record<string, string>> = {
  'ui/hud/build-panel.ts:1670':
    'aria-label for a delivery row\'s Cancel: `${t(buildDeliveryCancel)}: ${row.label.textContent}`',
  'ui/hud/build-panel.ts:1900':
    'aria-label for a queue row\'s Cancel: `${t(buildQueueCancel)}: ${row.label.textContent}`',
};

function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

interface TemplateLiteral {
  readonly text: string;
  readonly line: number;
}

/**
 * Template literals in source order.
 *
 * A hand scanner rather than a regex because a template literal can hold a
 * `${}` span that holds a `}`; the depth counter handles one level, which is
 * every case in this tree. A template nested inside an interpolation would be
 * mis-split -- the limit is stated rather than papered over, and the floor in
 * the control below is what would notice if it started swallowing the file.
 */
function templateLiterals(source: string): readonly TemplateLiteral[] {
  const found: TemplateLiteral[] = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '`') continue;
    let end = index + 1;
    let depth = 0;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (character === '\\') {
        end += 1;
        continue;
      }
      if (character === '$' && source[end + 1] === '{') {
        depth += 1;
        end += 1;
        continue;
      }
      if (character === '}' && depth > 0) {
        depth -= 1;
        continue;
      }
      if (character === '`' && depth === 0) break;
    }
    found.push({ text: source.slice(index, end + 1), line: source.slice(0, index).split('\n').length });
    index = end;
  }
  return found;
}

/** The parts of a template that are literal text rather than interpolation. */
function staticParts(template: string): string {
  return template.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
}

interface AssemblySite {
  readonly where: string;
  readonly text: string;
}

function findAssembledSentences(source: string, where: string): readonly AssemblySite[] {
  const sites: AssemblySite[] = [];
  for (const template of templateLiterals(source)) {
    if (!LOCALIZER_CALL.test(template.text)) continue;
    // Backticks and the interpolation braces are not content.
    const literal = staticParts(template.text).slice(1, -1);
    if (literal.trim().length === 0) continue;
    sites.push({ where: `${where}:${template.line}`, text: template.text.replace(/\s+/g, ' ').trim() });
  }
  return sites;
}

describe('no player-visible sentence is assembled from a localized fragment and a literal (#664)', () => {
  const files = UI_ROOTS.flatMap((entry) => {
    const path = join(SRC_ROOT, entry);
    return statSync(path).isDirectory() ? collectTypeScriptFiles(path) : [path];
  });

  const scanned = files.map((path) => ({
    where: relative(SRC_ROOT, path).split('\\').join('/'),
    source: stripComments(readFileSync(path, 'utf8')),
  }));

  const sites = scanned.flatMap((file) => findAssembledSentences(file.source, file.where));

  it('holds exactly the assembled sentences this list names', () => {
    // Only the *locations* are compared. An earlier version of this
    // assertion compared the source text too and built the expected side out
    // of the scan's own output, which is the fixture-supplies-both-sides shape
    // `docs/TESTING.md` forbids: it would have held for any text at all.
    expect(
      sites.map((site) => site.where).sort(),
      `put the punctuation inside the message (docs/LOCALIZATION.md rule 4), or record the site here with its reason.\n${sites
        .map((site) => `  ${site.where}  ${site.text}`)
        .join('\n')}`,
    ).toEqual(Object.keys(ASSEMBLED_SENTENCES).sort());
  });

  it('makes every recorded site say why it is still there', () => {
    // The same rule `SIMULATION_ENUM_GROUPS.additionalIds` is held to: an
    // exemption that does not explain itself is just a way to switch the gate
    // off for one line.
    const unexplained = Object.entries(ASSEMBLED_SENTENCES)
      .filter(([, reason]) => reason.trim().length < 40)
      .map(([where]) => where);
    expect(unexplained, 'record what the site assembles and why it has not been fixed').toEqual([]);
  });

  it('reads the whole UI, and the detector fires, so the list above is not vacuous', () => {
    // Two controls, because this assertion is an emptiness claim over a scan
    // and a scan that read nothing satisfies it.
    // FLOOR at the measured values: 366 `.ts` files under `src/`, of which
    // these are the UI ones, and the localizer is called throughout them.
    expect(scanned.length, 'the scan resolved fewer UI modules than when this floor was set').toBeGreaterThanOrEqual(28);
    const callSites = scanned.reduce(
      (total, file) => total + [...file.source.matchAll(/(?:\bt|\.format|\.formatPlural)\s*\(/g)].length,
      0,
    );
    expect(callSites, 'the UI no longer calls the localizer where this scan is looking').toBeGreaterThanOrEqual(200);

    // The detector, against a written-out fragment: it must find the thing it
    // is looking for, and leave the two correct shapes alone.
    const offending = 'element.setAttribute("aria-label", `${t(KEY.cancel)}: ${row.label.textContent}`);';
    expect(findAssembledSentences(offending, 'fixture.ts')).toHaveLength(1);
    // A template that is nothing but one localized call: no literal text, so
    // no assembled sentence.
    expect(findAssembledSentences('const label = `${t(KEY.cancel)}`;', 'fixture.ts')).toEqual([]);
    // The right way to do it, which `formatRegimeAllowsText` already does:
    // the separator is itself a key.
    expect(findAssembledSentences('const text = t(KEY.allows, { categories: parts.join(t(KEY.sep)) });', 'fixture.ts')).toEqual(
      [],
    );
  });
});
