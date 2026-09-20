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
 * {x}, {y}`), `hud.rooms.needs-object` (`{count} × {object}`) and
 * `hud.alert.occurrences` (`{count}×`, added by #754 after this list was
 * first measured) are formulae where the `×` carries the counting, and a
 * formula has no grammatical number in any language. They are listed anyway:
 * the point of the list is that every counted message has been looked at, and
 * splitting it into "real" and "fine" would need a per-entry judgement that is
 * the owner's to make.
 */
const FLAT_MESSAGES_WITH_COUNT = [
  'hud.alert.event.incidents.riot-opened',
  'hud.alert.event.prisoners.discharged',
  'hud.alert.occurrences',
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
  // `{count} not ready`, the badge under the `ROOMS` chip (#1006 finding 1).
  // Listed rather than authored with forms, and the reason is the entry
  // directly above it: `hud.status.prisoners-without-bed` is the same badge on
  // the same strip, formatted through the same `HudMetricBadge` channel, and
  // that channel calls `format` rather than `formatPlural` -- so a plural entry
  // here would be one key in the catalogue whose forms nothing selects between,
  // which is worse than a flat string that says so. English needs none ("1 not
  // ready" and "3 not ready" are the same shape); Polish would, and it is the
  // same debt the entry above already carries, with the same one-line fix once
  // the badge channel learns to count.
  'hud.status.rooms-not-ready',
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
 *
 * **The keys are `file:line` and they rot faster than anything else in this
 * file.** Both moved three times inside one branch (#860) -- 1780 -> 1781 ->
 * 1828 and 2010 -> 2100 -> 2167 -> 2197 -- every time because a docblock was
 * added *above* an untouched site, never because a site changed. That is
 * `docs/AGENT_WORKFLOW.md` §4's least-durable-citation rule paying for itself,
 * and it is recorded here rather than fixed because the line number is what
 * makes the failure message point at the offending expression. If a fourth
 * assembled sentence ever has to be recorded, key the map on the quoted
 * expression instead and let the reporter find the line.
 */
const ASSEMBLED_SENTENCES: Readonly<Record<string, string>> = {
  /*
   * **These two numbers moved four times on 2026-09-03 and neither side of the
   * merge that produced them was right.** #874 put a shortfall line under the
   * Buy control and #860 rewrote `paintQueue`'s row loop; each branch re-pinned
   * these sites against its own tree, so the merge offered `:1828`/`:2197` on
   * one side and `:1858`/`:2088` on the other and **both were stale on the
   * merged tree**. The live numbers below were read off the merged file by
   * grepping for the assembled expressions themselves, not taken from either
   * branch. `docs/AGENT_WORKFLOW.md` §4 already names this shape: a `file:line`
   * into a file under active edit is the least durable citation here, and a
   * quoted sentence is the most -- which is why the value beside each key
   * quotes the expression and the key is the part that rots.
   */
  /*
   * **A fifth and sixth move, on 2026-09-04, and again neither site changed.**
   * Issue #904 added `armedHintKey` and its docblock above both of these, so
   * `:1906` became `:1952` and `:2275` became `:2321`. Read off the tree by
   * grepping for the expressions themselves, exactly as the paragraph above
   * says to. Six re-pins for two unchanged expressions is the whole of the
   * argument for keying this map on the quoted expression instead, and it is
   * left as a `file:line` for the reason given above: the number is what makes
   * the failure message point at the offending code.
   */
  /*
   * **A seventh and eighth move, later the same day, and again neither site
   * changed.** Issue #920 gave `hud.build.note` a renderer again -- an element
   * and a paint branch in `paintQueue`, plus the docblock that carries the
   * measurement -- so `:1952` became `:2033` and `:2321` became `:2427`. Read
   * off the tree by grepping for the expressions themselves, exactly as the
   * paragraph above says to.
   *
   * **And a ninth and tenth, three commits later, inside the same branch.**
   * That branch's second attempt at the layout added forty-two lines of
   * measurement to the docblock above these sites -- the two placements it had
   * measured and rejected -- and `:2033`/`:2427` became `:2075`/`:2469`. Both
   * expressions are still untouched. Recorded because the interval is the
   * point: **the seventh re-pin was falsified by the same branch that made
   * it**, one commit apart, which no delta pass across branches could have
   * caught. Five re-pins in one day, all of them a comment growing.
   *
   * **An eleventh and twelfth, on 2026-09-04, and again neither site
   * changed.** Issue #926 added thirteen lines of correction to the removal
   * control's docblock -- the amendment recording that `min-width: 0` fitted
   * the third *button* and not the third *label* -- so `:2075`/`:2469` became
   * `:2088`/`:2482`. Read off the tree by grepping for the expressions
   * themselves, exactly as the paragraph above says to, and the count is
   * carried forward rather than restarted because the count is the argument.
   *
   * **Eight re-pins for two unchanged expressions**, and the count is now the
   * argument rather than an anecdote: every one of them was a line above the
   * site moving, none was a change to what the site does, and each cost a red
   * gate on a branch whose author had no reason to expect one. The fix is to
   * key this map on the quoted expression, which is the durable half of the
   * entry already. It is deliberately **not** done here: this branch is a HUD
   * layout fix, changing the map's key changes what the failure message points
   * a reader at, and doing it as a side effect of an unrelated diff is how a
   * gate loses the property it exists for. Recorded as owed.
   */
  'ui/hud/build-panel.ts:2088':
    'aria-label for a delivery row\'s Cancel: `${t(buildDeliveryCancel)}: ${row.label.textContent}`',
  'ui/hud/build-panel.ts:2482':
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
    // 372 on 2026-09-02, and that number will be wrong again next week: the
    // floors below are what this case asserts and neither of them counts
    // `src/` as a whole. The tally is context, not a claim.
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
