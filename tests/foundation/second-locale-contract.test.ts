import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { auditLocaleCatalog, describeFindings } from '../helpers/locale-catalog-audit';
import type { MessageCatalog, MessageEntry } from '../../src/services/localization/catalog';
import { buildMessageCatalog } from '../../src/services/localization/catalog';
import { defaultMessageCatalogEn } from '../../src/services/localization/default-catalog';
import { PSEUDO_LOCALE } from '../../src/services/localization/locale';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { OFFERED_LOCALES } from '../../src/input/language-preference';
import { LANGUAGE_MESSAGE_KEY } from '../../src/ui/language-messages';
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
 * Two. `tests/fixtures/localization/*.json` are deliberately excluded: they
 * are four-key fixtures for `tests/unit/localization-chunk-delivery.test.ts`
 * written against a four-key reference, so auditing them against the real
 * catalogue would report 588 keys of nothing.
 *
 * **`pl` arrived on 2026-09-14 (#661), and it arrived without #662.** The
 * paragraph this replaces said the catalogue would register here "when #661's
 * `pl` catalogue and #662's chunk importer meet", and it was wrong about the
 * order rather than about the destination: the audit needs a `MessageCatalog`
 * and nothing else, so a catalogue no loader can reach yet is exactly as
 * auditable as one a player can select. Waiting for the delivery half would
 * have meant authoring 669 Polish strings with no gate over them, which is the
 * opposite of what this file is for.
 */
const NON_DEFAULT_CATALOGS: Readonly<Record<string, () => MessageCatalog>> = {
  [PSEUDO_LOCALE]: () => buildPseudoLocaleCatalog(defaultMessageCatalogEn),
  pl: () => messageCatalogPl,
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
  /*
   * `pl` translates every key the bundled English catalogue holds -- 670 of
   * 670, re-measured on 2026-09-14 after issue #1184 authored
   * `hud.alerts.unknown` and its Polish counterpart together, and 669 of 669
   * at `189a97a3` before that -- so its floor is the whole catalogue and this
   * row cannot be satisfied by losing a key.
   *
   * **Raised deliberately, which is the only direction this row moves.** The
   * English catalogue gaining a key does not fail this test -- `pl` would fall
   * back for it, exactly as the paragraph below says -- so the ratchet is
   * turned by hand, after a measurement, by whoever translated the key.
   *
   * **It is deliberately not a completeness requirement, and the difference
   * matters here more than anywhere else in this file.** #664's rule is that
   * no gate may be passable only by having a complete translation; this row
   * ratchets what was *measured after the fact*, which is the opposite
   * direction. A key added to the English catalogue tomorrow does not fail
   * this -- `pl` simply falls back for it, exactly as the audit's docblock
   * says a partial locale should -- and the floor stays where the last
   * deliberate measurement put it.
   */
  pl: 698,
};

/*
 * **Raised 693 -> 698 on 2026-09-19, by one translated key and a re-measurement
 * that found four more.** `hud.status.earned-withheld` is the key this change
 * authored: #1302 shipped the English sentence alone on 2026-09-19 and #664's
 * rule means no gate saw the gap. The other four were already translated and
 * already uncounted -- `auditLocaleCatalog` reported `pl` at **697** against
 * the reference on the unmodified base commit, with the floor still at 693.
 *
 * **The number lands at the measurement and the attribution is written here
 * instead**, which is the rule the paragraph below settled after the 674 entry
 * had tried the other way round: four keys of slack in a floor is four keys
 * that can be lost without this row noticing. Measured by bisection on this
 * tree -- 698 passes, 699 fails, and 697/698 on the base file before the
 * Polish key was added -- so the floor and the measurement are the same number
 * again.
 *
 * **Raised 675 -> 690 on 2026-09-14 by the fifteen `hud.layout.*` keys**, the
 * same deliberate act, measured the same way. Those fifteen were English on a
 * Polish page -- three of them on screen at boot -- because #1159 added them
 * after #661 authored this catalogue and #663 deliberately left them (see
 * `src/content/locale-pl.ts`'s own note for why that was right there and does
 * not reach here). They are stage 6 work, #1162; `pl` now translates **693 of 693**
 * against the reference, `auditLocaleCatalog` reporting no findings.
 *
 * **It lands at 693 rather than at 675 + 15, which departs from the paragraph
 * below, and the departure is the point.** That entry left the floor three
 * keys under the measurement so that the ratchet would credit only what its
 * own issue added -- three keys #661 and #1190 had translated after the
 * previous measurement. Attribution is worth recording and this paragraph
 * records it; a floor is not where it belongs. Three keys of slack in a floor
 * is three keys that can be lost without this test noticing, which is the one
 * thing the row exists to prevent. The measurement and the floor are the same
 * number now, so **any** key lost from `pl` fails here -- watched going red on
 * a single deleted entry, `hud.layout.map-only`, before this was believed.
 *
 * **Raised 669 -> 674 on 2026-09-14 by #663**, which is the deliberate act
 * this row's own docblock reserves and not a re-measurement of drift. The
 * language picker authored five `display.language.*` keys and translated all
 * five in the same change, so the number moved by exactly what was added.
 * `auditLocaleCatalog` reports `pl` at 677 translated keys against the
 * reference on this tree; the floor is deliberately left at the total this
 * issue is accountable for rather than raised to that, because the three keys
 * of difference were translated by #661 and #1190 after the 669 measurement
 * and ratcheting somebody else's work under this issue's name would misreport
 * who is holding the line.
 */

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
  // The Sell control's own label (ADR 0075 decision 3, invoked by ADR 0096
  // decision 3(b)), in `hud.build.buy-submit`'s own flat shape and for the
  // same reason: it is player-visible copy, and authoring plural forms for
  // it is the owner's under `AGENTS.md` exclusion 4.
  'hud.build.sell-submit',
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
  // The delete confirmation's age fragments (#1142): `{count} min ago`,
  // `{count} h ago`, `{count} d ago`. Listed rather than authored with plural
  // forms, and the reason is the unit rather than the debt: an **abbreviated**
  // unit symbol does not inflect for number in English or in Polish ("1 min
  // temu", "3 min temu", "22 min temu"), so these are in
  // `hud.alert.occurrences`' class -- a formula whose counting is carried by
  // something other than grammar -- and not in `save.list.item`'s. Spelling
  // the units out is what would create the debt, which is why they are not
  // spelled out. `describeSaveAge` in `src/ui/save-panel-delete.ts` records
  // the same reasoning beside the code that selects between them.
  'save.delete.age.days',
  'save.delete.age.hours',
  'save.delete.age.minutes',
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
   * **A thirteenth, on 2026-09-06, and this one is a comment and nothing
   * else.** Issue #1031's ruling ("licz po ukończeniu" -- count a placed object
   * on completion) makes `paintQueue`'s block the only readout an
   * ordered-but-unbuilt object appears in, so nineteen lines saying so went
   * into that function's docblock and `:2482` became `:2501`. The expression is
   * untouched, the delivery site above it did not move, and the branch that
   * paid for the red gate added no player-visible text at all.
   *
   * **Nine re-pins for two unchanged expressions** -- the ninth is the
   * paragraph immediately above -- and the count is the argument rather than an
   * anecdote: every one of them was a line above the site moving, none was a
   * change to what the site does, and each cost a red gate on a branch whose
   * author had no reason to expect one. The fix is to key this map on the
   * quoted expression, which is the durable half of the entry already. It is
   * deliberately **not** done here: this branch is a HUD layout fix, changing
   * the map's key changes what the failure message points a reader at, and
   * doing it as a side effect of an unrelated diff is how a gate loses the
   * property it exists for. Recorded as owed.
   *
   * **#1031's branch declined it for the same reason and it is worth saying
   * why once more**, since that branch was the ninth to pay: its subject is
   * when a capacity counts an object, the key change would rewrite this map's
   * failure message for every reader, and a gate re-keyed inside a diff about
   * something else is exactly the change nobody reviews. The owed item is
   * unchanged and now has nine entries behind it.
   */
  /*
   * **Paid on 2026-09-06, and not by the condition the top of this docblock
   * names.** That condition was "if a fourth assembled sentence ever has to be
   * recorded" -- a fourth has not arrived; there are still exactly two,
   * `:2088` and `:2482` on `origin/main` at the commit this branch forked
   * from (`a2b3632b`). What happened instead: a parallel, unmerged branch
   * (`fix/1031-capacity-counts-on-completion`, commit `1c6ad206`) independently
   * hit the same failure the same day -- nineteen lines added to `paintQueue`'s
   * docblock moved `:2482` to `:2501` with neither expression touched -- and
   * that branch's own commit message calls it the ninth re-pin, declines the
   * expression-keyed fix as out of scope for its diff, and repeats the same
   * "Recorded as owed" this docblock already carried. That branch is not part
   * of this one's history and nothing here depends on it landing first; it is
   * cited because it is independent, contemporaneous confirmation that the
   * pattern above is still live on every branch that touches either site, not
   * a closed chapter. The fix the top of this docblock already named -- "key
   * the map on the quoted expression instead and let the reporter find the
   * line" -- is taken here, ahead of whatever count would eventually have
   * forced it, because the count was never the point; the pattern was.
   *
   * The paragraph at the top of this docblock, and all four historical blocks
   * above this one, are left exactly as they stand, for the reason
   * `docs/AGENT_WORKFLOW.md` §4 gives for marking both directions rather than
   * overwriting: they are the entire argument for why this was worth doing,
   * and a reader should see what was deferred, and for how long, before seeing
   * that the deferral ended.
   *
   * **What changed, mechanically.** The keys below are now the quoted
   * expression -- `template.text` in `findAssembledSentences`, the same
   * string the value used to merely echo -- so a docblock line landing above
   * a site no longer touches that site's key, and not one of the re-pins
   * chronicled above -- on this branch or on `fix/1031-capacity-counts-on-completion`
   * -- could fail this gate again. A genuinely new third expression still
   * fails it, because its text matches neither key below. The failure message
   * a reader sees is still built from `sites`, the live scan the test below
   * performs at assertion time -- never from anything stored in this map -- so
   * it still names a `file:line`, computed fresh rather than kept, which is
   * the property the deferral was protecting and the reason it is not lost by
   * this change.
   *
   * **What one recorded expression appearing at more than one call site would
   * mean, decided here rather than left to fall out of `Set` semantics:** the
   * risk an assembled sentence carries is the shape of the expression -- which
   * fragments it stitches together -- not which line happens to hold it, so a
   * second site producing byte-for-byte the same template shares the first
   * site's justification rather than needing a second entry for it. Neither
   * expression below is duplicated on this tree; the decision is recorded
   * because the map's shape now makes it possible, and a decision a reader has
   * to infer from the code is the same defect this whole entry exists to
   * retire. The test below that names this decision constructs a duplicate
   * and checks the collapse directly, rather than asserting the sentence and
   * leaving it untested.
   */
  '`${t(HUD_MESSAGE_KEY.buildDeliveryCancel)}: ${row.label.textContent}`':
    "aria-label for a delivery row's Cancel button: a localized word, a " +
    "hard-coded ': ', and text read back out of the row's own already-" +
    'localized label. Fixing it means authoring a punctuation-template key ' +
    "-- copy that reaches a screen-reader user, so the owner's under " +
    '`AGENTS.md` exclusion 4.',
  '`${t(HUD_MESSAGE_KEY.buildQueueCancel)}: ${row.label.textContent}`':
    "aria-label for a queue row's Cancel button -- the same shape as the " +
    'delivery row above it, for the same reason: a localized word, a ' +
    "hard-coded ': ', and the row's own already-localized label read back.",
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
    // Compared by *expression* (`site.text`), not by *location* (`site.where`)
    // -- see the docblock above `ASSEMBLED_SENTENCES` for why the key changed.
    // `ASSEMBLED_SENTENCES` is still a hand-maintained literal, independent of
    // this scan, so this is not the fixture-supplies-both-sides shape
    // `docs/TESTING.md` forbids: that shape is the *expected* side being built
    // out of the thing under test, which would hold for any text at all, and
    // is not what a `Set` over the scan's own findings does here. Two sites
    // sharing one recorded expression are one finding, not two -- decided and
    // tested below rather than left as an accident of `Set` semantics.
    const found = [...new Set(sites.map((site) => site.text))].sort();

    expect(
      found,
      `put the punctuation inside the message (docs/LOCALIZATION.md rule 4), or record the site here with its reason.\n${sites
        .map((site) => `  ${site.where}  ${site.text}`)
        .join('\n')}`,
    ).toEqual(Object.keys(ASSEMBLED_SENTENCES).sort());
  });

  it("finds each recorded expression's current file:line by scanning, rather than trusting a stored one", () => {
    // The half of the fix that keeps the property the deferral protected: a
    // failure still has to point a reader at `build-panel.ts:NNNN`. Nothing in
    // ASSEMBLED_SENTENCES carries a line any more, so this proves the line is
    // still recoverable -- from `sites`, the live scan above, computed at
    // assertion time rather than read out of the map.
    for (const expression of Object.keys(ASSEMBLED_SENTENCES)) {
      const locations = sites.filter((site) => site.text === expression);
      expect(locations.length, `${expression} was not found anywhere in the current scan`).toBeGreaterThanOrEqual(1);
      for (const location of locations) {
        expect(location.where, `expected a ui/hud/build-panel.ts:NNNN citation, got ${location.where}`).toMatch(
          /^ui\/hud\/build-panel\.ts:\d+$/,
        );
      }
    }
  });

  it('treats two occurrences of one recorded expression as one finding, not two', () => {
    // The decision the docblock above names, tested directly rather than left
    // to fall out of `Set` semantics by accident: `tests/helpers/canonical-
    // iteration.ts` applies the same reasoning to its own exemptions --
    // "Two occurrences of the same view over the same field share one
    // justification... the reason must justify the *field*, not one call
    // site." An assembled sentence's risk is the shape of the expression, not
    // which line holds it, so a second site producing byte-for-byte the same
    // template is the same finding under a second spotlight.
    const twice =
      'a.setAttribute("aria-label", `${t(KEY.cancel)}: ${row.label.textContent}`); ' +
      'b.setAttribute("aria-label", `${t(KEY.cancel)}: ${row.label.textContent}`);';
    const found = findAssembledSentences(twice, 'fixture.ts');
    // Both call sites are still reported individually -- nothing here hides a
    // location from the file:line test above.
    expect(found).toHaveLength(2);
    // ...but they collapse to one required map entry, which is what the
    // assertion above relies on.
    expect(new Set(found.map((site) => site.text)).size).toBe(1);
  });

  it('makes every recorded site say why it is still there', () => {
    // The same rule `SIMULATION_ENUM_GROUPS.additionalIds` is held to: an
    // exemption that does not explain itself is just a way to switch the gate
    // off for one line.
    const unexplained = Object.entries(ASSEMBLED_SENTENCES)
      .filter(([, reason]) => reason.trim().length < 40)
      .map(([expression]) => expression);
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

// ---------------------------------------------------------------------------
// 4. The catalogue this file audits and the catalogue a player can reach
// ---------------------------------------------------------------------------

/**
 * The two registries agree: everything audited above is published, and
 * everything published is audited (#662).
 *
 * **This is the drift the first three sections cannot see.** Section 1 judges
 * whatever `NON_DEFAULT_CATALOGS` names; `src/main.ts`'s `CATALOG_CHUNKS`
 * decides what a player can actually load. Two lists of locale tags, edited in
 * different issues by different people, and nothing tied them together -- so a
 * second locale published without a row here would ship unaudited, and a
 * catalogue audited here but never registered is the state `pl` sat in from
 * #661 until #662 (a module `tests/foundation/trusted-tier-reachability-contract.test.ts`
 * had to park in `UNREACHABLE_MODULES` to record).
 *
 * The pseudo-locale is the one deliberate asymmetry and is asserted as such:
 * it is audited here and must never be publishable, which
 * `tests/foundation/pseudo-locale-contract.test.ts` enforces from the other
 * side.
 */
describe('every catalogue this file audits is one a player can reach, and vice versa (#662)', () => {
  const mainSource = stripComments(readFileSync(join(SRC_ROOT, 'main.ts'), 'utf8'));

  /** The locale tags `src/main.ts` registers a chunk thunk for. */
  function publishedLocales(source: string): readonly string[] {
    const registry = /const CATALOG_CHUNKS: Readonly<Record<string, CatalogChunkImporter>> = \{([^}]*)\}/.exec(source);
    if (registry === null) return [];
    return [...registry[1]!.matchAll(/(?:^|\s)'?([A-Za-z][A-Za-z0-9-]*)'?\s*:\s*\(\)\s*=>/g)].map((match) => match[1]!);
  }

  it('publishes exactly the non-default catalogues audited above, minus the pseudo-locale', () => {
    const published = [...publishedLocales(mainSource)].sort();
    const audited = Object.keys(NON_DEFAULT_CATALOGS)
      .filter((locale) => locale !== PSEUDO_LOCALE)
      .sort();

    expect(
      published,
      'src/main.ts publishes a different set of locales than this file audits. A locale a player can load and nobody audits is the defect this pairing exists for; a locale audited and never registered is code no production path reaches (ADR 0044).',
    ).toEqual(audited);
    // Not vacuous in either direction: there is at least one of them, and the
    // pseudo-locale is not it.
    expect(published).toContain('pl');
    expect(published).not.toContain(PSEUDO_LOCALE);
  });

  it('offers a player exactly the locales it publishes, and no others (#663)', () => {
    // A third list of locale tags joined the two above when the language
    // picker landed: `OFFERED_LOCALES` is what the control can name. All three
    // have to agree or the picker lies in one of two directions -- an entry
    // that falls back to English silently, or a catalogue a player can be
    // negotiated into and can never choose to leave.
    const published = [...publishedLocales(mainSource)].sort();
    expect(
      [...OFFERED_LOCALES].sort(),
      'the language picker offers a different set of locales than src/main.ts publishes',
    ).toEqual([DEFAULT_LOCALE, ...published].sort());
    // The default is offerable without a chunk, which is why it is added
    // rather than expected in the registry.
    expect(published).not.toContain(DEFAULT_LOCALE);
  });

  it('names every offered language in itself, identically in every catalogue (#663)', () => {
    /*
     * The endonym rule, gated. A picker that names languages in the *current*
     * interface language is unusable to exactly the player who needs it, so
     * `display.language.english` is `English` and `display.language.polish` is
     * `Polski` in every catalogue this repository ships -- byte for byte.
     *
     * This is the one place in the tree where two catalogues agreeing is the
     * requirement rather than a translation not having been done yet, which is
     * why it is asserted here and not left to a reviewer to notice. The
     * pseudo-locale is excluded because it is derived: it accents *every*
     * message mechanically, so it cannot agree with anything and is not a
     * translator's work to get wrong.
     */
    const endonymKeys = [LANGUAGE_MESSAGE_KEY.english, LANGUAGE_MESSAGE_KEY.polish] as const;
    const reference = Object.fromEntries(
      endonymKeys.map((key) => [key, defaultMessageCatalogEn.messages[key]]),
    );

    expect(reference, 'the endonym keys are missing from the bundled catalogue').toEqual({
      [LANGUAGE_MESSAGE_KEY.english]: 'English',
      [LANGUAGE_MESSAGE_KEY.polish]: 'Polski',
    });

    const disagreements: string[] = [];
    for (const [locale, build] of Object.entries(NON_DEFAULT_CATALOGS)) {
      if (locale === PSEUDO_LOCALE) continue;
      const messages = build().messages;
      for (const key of endonymKeys) {
        const value = messages[key];
        // A catalogue that has not translated the key yet falls back per key
        // and is fine; one that has *changed* it is the defect.
        if (value !== undefined && value !== reference[key]) {
          disagreements.push(`${locale}: ${key} is ${JSON.stringify(value)}, not ${JSON.stringify(reference[key])}`);
        }
      }
    }
    expect(
      disagreements,
      'a language name was translated. Each language is named in itself so the player looking for it can read it.',
    ).toEqual([]);
  });

  it('reads a real registry, so the pairing above cannot pass by finding nothing', () => {
    // The scanner against a written-out registry, both directions -- the
    // failure mode this whole section guards against is a regex that has
    // quietly stopped matching, which looks exactly like agreement.
    expect(
      publishedLocales(
        "const CATALOG_CHUNKS: Readonly<Record<string, CatalogChunkImporter>> = {\n  pl: () => import('./x'),\n  'pt-BR': () => import('./y'),\n};",
      ),
    ).toEqual(['pl', 'pt-BR']);
    expect(publishedLocales('const OTHER = { pl: () => 1 };')).toEqual([]);
    // And the real file really does carry the declaration this reads.
    expect(mainSource).toContain('const CATALOG_CHUNKS: Readonly<Record<string, CatalogChunkImporter>> = {');
  });
});
