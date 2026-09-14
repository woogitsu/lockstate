import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { simulationEnumMessageKeys } from '../../src/content/simulation-message-keys';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_TABS } from '../../src/ui/hud/hud';
import { HUD_MESSAGE_KEY, HUD_MESSAGE_KEYS } from '../../src/ui/hud/messages';
import { projectStatusMetrics } from '../../src/ui/hud/projection';
import type { HudCountsViewModel } from '../../src/ui/hud/view-model';

/**
 * ADR 0011, applied to the HUD.
 *
 * Three namespaces stay separate forever: a stable content id, a message key
 * and translated text. The HUD holds keys and resolves them at the last
 * moment; it contains no literal user-facing string, and no translated text
 * ever travels back toward the simulation. The ADR's own consequence --
 * "every player-visible string added from now on needs a message key and a
 * default-locale entry; a test asserts that ... an unlocalized catalog entry
 * fails CI rather than shipping" -- is what this file is.
 *
 * It also carries the architectural boundary in the same spirit as
 * `tests/unit/navigation-no-phaser.test.ts`: the HUD is a view over
 * snapshots (`AGENTS.md` boundary 1), so it may not import the simulation.
 */

const HUD_ROOT = join(__dirname, '../../src/ui/hud');
const PRIMITIVES_ROOT = join(__dirname, '../../src/ui/primitives');

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

const hudFiles = collectTypeScriptFiles(HUD_ROOT);
const primitiveFiles = collectTypeScriptFiles(PRIMITIVES_ROOT);

/**
 * Every module `src/ui/hud/` and `src/ui/primitives/` hold today, named.
 *
 * The floors below (`> 4`, `> 8`) tolerate losing most of a flat directory
 * before they notice; a walk that silently dropped a subset of it -- the
 * exact shape `tests/unit/services-layer-boundaries.test.ts` and
 * `tests/unit/navigation-no-phaser.test.ts` were both found to carry in
 * `docs/research/2026-09-02-the-unit-gates-that-cannot-fail.md` -- would
 * still clear them while an offending file sat unscanned, including one that
 * imports the simulation directly (AGENTS.md boundary 1). These lists close
 * that: adding or removing a module is a one-line, reviewable diff here.
 */
const HUD_MODULE_NAMES = [
  'alert-row-label.ts',
  'build-panel.ts',
  'dismiss-arming.ts',
  'event-band-dwell.ts',
  'hud-layout.ts',
  'hud-state.ts',
  'hud.ts',
  'index.ts',
  'intake-panel.ts',
  'label-parameters.ts',
  'messages.ts',
  'pooled-row-binding.ts',
  'projection.ts',
  'regime-panel.ts',
  'rooms-panel.ts',
  'staff-panel.ts',
  'status-strip.ts',
  'tool-arming.ts',
  'view-model.ts',
] as const;
const PRIMITIVE_MODULE_NAMES = [
  'action-button.ts',
  'async-action.ts',
  'choice-group.ts',
  'collapsible-section.ts',
  'dom.ts',
  'focus-handoff.ts',
  'icon-button.ts',
  'icon.ts',
  'index.ts',
  'list-row.ts',
  'number-field.ts',
  'panel.ts',
  'resize-separator.ts',
  'roving-focus-keydown.ts',
  'roving-focus.ts',
  'segmented-bar.ts',
  'stat-chip.ts',
  'status-badge.ts',
  'tab-button.ts',
] as const;

/**
 * Source with comments removed, so prose about a rule cannot trip the rule.
 *
 * The shared stripper from `tests/helpers/canonical-iteration.ts` rather than a
 * local copy (#193, #198). The local copy removed only *whole-line* `//`
 * comments, so a **trailing** comment survived it -- and a trailing comment is
 * exactly where a disabled import or a commented-out reference ends up.
 *
 * **Measured, and the consequence is smaller than #188's was, so it is stated
 * rather than implied.** These are "must not contain" rules, so a surviving
 * comment makes them fail *loudly* rather than pass silently: with the old
 * stripper restored and a trailing `// import { Kernel } from
 * '../../simulation/kernel/kernel';` appended to a real import line in
 * `src/ui/hud/projection.ts`, "imports nothing from the simulation" **fails**;
 * with the shared stripper the same mutation leaves all 12 tests passing,
 * correctly. A false failure is not a hole -- but a gate that fails because
 * somebody wrote a comment costs the next reader a hunt for an import that
 * does not exist, and #188's own case (`unconsumed-content-contract`, where the
 * rule asks "is this referenced" and a comment answers yes) is the direction
 * that really is silent.
 *
 * The second difference is about the failure messages rather than the rules:
 * the shared stripper replaces a block comment with its own newlines, while
 * the local copy deleted it outright and shifted every line number after it.
 */
function code(path: string): string {
  return stripComments(readFileSync(path, 'utf8'));
}

describe('every HUD message key resolves in the bundled default locale', () => {
  it('collects a non-trivial number of keys, so this cannot pass vacuously', () => {
    expect(HUD_MESSAGE_KEYS.length).toBeGreaterThan(20);
    expect(new Set(HUD_MESSAGE_KEYS).size).toBe(HUD_MESSAGE_KEYS.length);
  });

  it('resolves every key to real text rather than to the key itself', () => {
    const missingKeys: string[] = [];
    const localizer = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      onMissingKey: (report) => {
        // Only unresolved *keys* matter here: this pass deliberately calls
        // every message without parameters, so the parameterized ones report
        // an unfilled placeholder. Those are exercised with their arguments
        // in the next test.
        if (report.kind === 'missing-key') missingKeys.push(report.key);
      },
    });

    for (const key of HUD_MESSAGE_KEYS) {
      const text = localizer.format(key);
      // An unresolved key renders as itself (ADR 0011). That is the right
      // runtime behaviour and the wrong shipping state.
      expect(text, `${key} has no default-locale entry`).not.toBe(key);
      expect(text.trim().length).toBeGreaterThan(0);
    }
    expect(missingKeys).toEqual([]);
  });

  it('fills every placeholder the parameterized messages declare', () => {
    const missing: string[] = [];
    const localizer = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      onMissingKey: (report) => missing.push(`${report.kind}:${report.key}`),
    });

    expect(localizer.format(HUD_MESSAGE_KEY.occupancyValue, { value: '142', capacity: '180' })).toBe('142 of 180');
    expect(localizer.format(HUD_MESSAGE_KEY.clockSpeed, { speed: 2 })).toContain('2');
    expect(missing).toEqual([]);
  });

  it('uses stable ASCII identifiers, never source text as a key', () => {
    // `t("Cell")` is the failure ADR 0011 rejects outright: fixing a typo
    // would silently break every locale.
    for (const key of HUD_MESSAGE_KEYS) expect(key).toMatch(/^hud\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
  });

  it('declares a funds label and nothing that implies an income or a standing cost', () => {
    /*
     * This used to forbid *every* money word, and it was right to: there was
     * no economy, and a string is where a fake number gets its first place to
     * sit. #96 built one, so the rule moves rather than being deleted.
     *
     * What exists is a **balance** the simulation publishes and, since #89, a
     * **purchase** that spends it: the Build panel's buy control renders a
     * unit price times a quantity, both handed to it by the composition root
     * from `src/content/procurement-catalog.ts`.
     *
     * **What this paragraph went on to say is false, and both halves of it
     * were false at different times.** It read: *"What does not exist is
     * anything that credits or debits the treasury *on a schedule* -- no
     * income, no payroll, no running cost. ADR 0017 decision 6 settles what
     * the state pays for and nothing accrues it."* The income half stopped
     * being true at `4f711d5`, *"Pay the prison for the places it has somebody
     * in (#311)"*, which put `stateIncomeAccruedTodayMinorUnits` on the counts
     * channel and an `earned-today` metric on the strip -- `hud.status.earned-today`
     * has been in the allow-list below ever since, in the same file that
     * denied it. The payroll half stopped being true with ADR 0042 step 3,
     * which bills every employee's wage at every in-game day boundary.
     *
     * So what this gate now guards is a **narrower and real** thing: a label
     * authored before something renders the figure it names is `AGENTS.md`'s
     * fourth exclusion, so a key may name one of these flows only in the change
     * that puts the flow on screen.
     *
     * **The paragraph above used to end "the simulation publishes a daily wage
     * bill and an arrears figure, and no panel renders either, so no key may
     * exist for them yet ... when the panel lands, the key lands with it and
     * this list grows in the same change."** The panel landed (#639 ruling 2):
     * the Staff panel's collapsed `On the payroll` header states
     * `dailyWageBillMinorUnits`, so `hud.security.roster-wage-bill` is the key
     * that arrived with it and the list has grown exactly as that sentence
     * asked. The arrears figure still has no reader and no key, and that half
     * of the old sentence is still in force.
     *
     * So the refused words stay exactly as they were, for a reason that has
     * moved twice rather than disappearing. `income`, `wage` and `salary` name
     * flows that now exist in the simulation and that nothing on screen shows,
     * which is the same rule from the other side. `budget` names a ceiling nobody has set. `money`, `cash` and
     * `currency` name a unit #96 deliberately did not choose. And `cost` and
     * `price` stay refused because a key carrying one would be a *standalone*
     * readout of a figure with no purchase behind it: the panel names the
     * quantity, the material and the total in one sentence
     * (`hud.build.buy-submit`), which is a statement about the button that is
     * about to be pressed, not a price list the HUD keeps.
     */
    /*
     * **`hud.status.funds-remaining` joins the list on 2026-08-31**, under the
     * owner's ruling 18, and the list is extended rather than the rule relaxed.
     * What the rule guards against is a string inviting a number no system
     * produces; `{remaining} left` states `balance - overdraftFloor`, both
     * published on `simulation/status-counts` from a `Treasury` that owns them.
     * It is `hud.status.funds`'s own exception one field wider: the same chip,
     * the same units, the same absence of a currency.
     */
    /*
     * **Two more join on 2026-09-01, and for once the list grows without the
     * screen gaining anything a player did not already have.** The owner's
     * ruling of that day keeps the `FUNDS` badge at `{remaining} left` -- the
     * long wording was measured at +133px of chip and off the visible edge of
     * the metrics row at 1280x800 -- and moves the *name* of the threshold to
     * the chip's tooltip and screen-reader text.
     * `hud.status.funds-before-deliveries-stop` and
     * `hud.status.funds-deliveries-stopped` are that sentence. They name no
     * flow: they name the same remainder `hud.status.funds-remaining` already
     * names, and say what happens when it runs out, which is a rule
     * `Treasury.floorFor` enforces today.
     */
    /*
     * **A third joins on the same principle, for the third tone issue #768's
     * ruling added.** `hud.status.funds-treasury-floor-exhausted` names the
     * same chip's same balance at its `critical` step -- the treasury floor,
     * `counts.treasuryOverdraftFloorMinorUnits` -- and no new flow either.
     */
    /*
     * **Two more join on 2026-09-09, and `price` is one of the two refused
     * words above that this pair actually contradicts -- read the paragraph
     * at "cost" and "price" stay refused" again before assuming precedent.**
     * `hud.build.catalogue-row-price` and `-price-segment` (issue #901) are a
     * catalogue row's own cost, stated on the row rather than behind a press
     * on the buy disclosure. That paragraph's objection was to a *standalone*
     * readout invented for a key with no purchase behind it -- and this one
     * is not standalone: `build-panel.ts`'s row-mount loop computes the exact
     * `unitPriceMinorUnits * quantityPerPlacement` product `paintBuyTotal`
     * already renders for `hud.build.buy-submit`, from the same
     * `HudBuildMaterialViewModel` the buy control reads. It restates a number
     * the panel already states elsewhere, earlier, where a player can read it
     * without a press -- it does not invent one.
     *
     * `AGENTS.md`'s fourth reservation names #901 by number as one of the four
     * sentences waiting when the owner partly released it on 2026-09-04: the
     * wording is the agent's to choose, the truth of it is not, and the two
     * keys ship only because that number is opened and checked, not assumed.
     */
    const ALLOWED_MONEY_KEYS = new Set([
      'hud.status.funds',
      'hud.status.funds-remaining',
      'hud.status.funds-before-deliveries-stop',
      'hud.status.funds-deliveries-stopped',
      'hud.status.funds-treasury-floor-exhausted',
      'hud.security.roster-wage-bill',
      'hud.build.catalogue-row-price',
      'hud.build.catalogue-row-price-segment',
    ]);

    for (const key of HUD_MESSAGE_KEYS) {
      if (ALLOWED_MONEY_KEYS.has(key)) continue;
      expect(key).not.toMatch(/money|fund|budget|cash|balance|currency|cost|price|income|wage|salary/i);
    }

    // And the allow-list is not stale: a key it names that no longer exists
    // would silently permit nothing, which reads exactly like the rule being
    // tighter than it is.
    for (const allowed of ALLOWED_MONEY_KEYS) {
      expect(HUD_MESSAGE_KEYS, `${allowed} is allowed but no longer declared`).toContain(allowed);
    }
  });
});

describe('message keys live in one registry', () => {
  it('no HUD module hard-codes a hud.* key outside messages.ts', () => {
    // One registry is what lets the test above prove *every* key resolves.
    // A key spelled inline somewhere else would never be checked.
    for (const path of hudFiles) {
      if (path.endsWith('messages.ts')) continue;
      const literals = [...code(path).matchAll(/['"](hud\.[A-Za-z0-9._-]+)['"]/g)].map((match) => match[1]);
      expect(literals, `${path} must reference HUD_MESSAGE_KEY instead of a literal key`).toEqual([]);
    }
  });

  /**
   * **This used to require every strip label to be in the HUD's own registry,
   * and #703 made that too narrow rather than wrong.**
   *
   * The rule it enforces is the one that matters and is unchanged: a label the
   * strip renders must resolve to real words in the bundled catalog, never to a
   * dotted id on a player's screen. What changed is that there are two
   * registries a HUD label can legitimately come from, and this file already
   * said so twenty lines down -- the `activeIncidentTypeLabelKey` note explains
   * that a real `incident-type.*.name` key "lives in the simulation content
   * catalogue's registry instead -- a different, and correctly not-this,
   * contract", and left that field out of the fixture rather than let the
   * assertion meet one.
   *
   * #703's `HIGH RISK` chip is a *label* rather than a badge and cannot be left
   * out: it is `classification-group.high-risk.name`, the same authored key the
   * Regime panel's restricted-block heading already resolves, reused so the
   * strip and the panel cannot come to disagree about what the group is called
   * (see `HIGH_RISK_LABEL_KEY` in `src/ui/hud/projection.ts`).
   *
   * So the check now accepts either registry **and resolves the key either
   * way**, which is stronger than the membership test it replaces for the keys
   * it already covered: a `hud.*` key in `HUD_MESSAGE_KEYS` with no
   * default-locale entry passed this assertion before and fails it now. What
   * stays refused is a key belonging to neither registry -- a label spelled
   * inline in a descriptor, which is what the sibling assertion above forbids
   * for `hud.*` keys and what nothing but this one would catch for the rest.
   */
  it('the strip and tab bar draw their labels from a registry, and every one of them resolves', () => {
    const hudRegistry = new Set<string>(HUD_MESSAGE_KEYS);
    const simulationRegistry = new Set<string>(simulationEnumMessageKeys());
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

    // Non-vacuity: the second registry has to be a real, populated set, or
    // "in one registry or the other" would be satisfied by the first alone.
    expect(simulationRegistry.size).toBeGreaterThan(20);
    expect(simulationRegistry.has('classification-group.high-risk.name')).toBe(true);

    const registered = (key: string): boolean => hudRegistry.has(key) || simulationRegistry.has(key);
    const resolves = (key: string): boolean => {
      const text = localizer.format(key);
      return text !== key && text.trim().length > 0;
    };
    const registry = new Set<string>(HUD_MESSAGE_KEYS);
    const busyPrison: HudCountsViewModel = {
      prisoners: 1,
      prisonerCapacity: 2,
      // One prisoner and no place, so the `PRISONERS` chip takes its
      // `prisonersWithoutBed` branch (issue #609) rather than the no-badge
      // one: this case walks every label the strip can render, and a fixture
      // where everybody was housed would leave the new one unwalked.
      occupiedPlaces: 0,
      staff: 1,
      // Not painted by any strip label this case walks (issue #870); a value
      // to satisfy the type.
      staffUnassigned: 1,
      rooms: 1,
      roomCapacity: 2,
      // Non-zero on the understaffed rung, so the coverage chip takes its
      // `securityCoverageShort` branch rather than the `securityCoverageMet`
      // fallback. **The owner's ruling 21 of 2026-08-31 made that badge one of
      // three words where it had been one of two** -- it used to render
      // `coverageDetail` for either lower rung -- so one fixture can no longer
      // walk every word this chip can say, and the loop below runs a second
      // state for the rung this one does not reach.
      prisonersCovered: 1,
      prisonersUnderstaffed: 1,
      prisonersUnguarded: 0,
      // Non-zero, so the `high-risk` chip is walked with a real value (#703).
      // The chip carries no tone and no badge at any value, so this figure
      // changes no branch -- it is here because a count of 0 would leave the
      // fixture unable to tell "the chip exists" from "the chip is blank".
      prisonersHighRisk: 1,
      activeIncidents: 1,
      // No `activeIncidentTypeLabelKey` here on purpose: the label this test
      // walks against is the HUD's own closed registry, and a real
      // `incident-type.*.name` key (issue #506 finding 2) lives in the
      // simulation content catalogue's registry instead -- a different, and
      // correctly not-this, contract.
      contrabandFound: 1,
      treasuryMinorUnits: 0,
      stateIncomeAccruedTodayMinorUnits: 0,
    };

    /*
     * The three coverage states, because the chip says a different authored
     * word in each and a walk that stopped at one would leave two unchecked.
     * The third is the all-covered fallback, which is the state a healthy
     * prison is in and therefore the one a regression would hide in longest.
     */
    const walked: string[] = [];
    for (const counts of [
      busyPrison,
      { ...busyPrison, prisonersUnguarded: 1 },
      { ...busyPrison, prisonersUnderstaffed: 0, prisonersUnguarded: 0 },
    ]) {
      for (const metric of projectStatusMetrics(counts)) {
        expect(registered(metric.labelKey), `${metric.labelKey} is in neither registry`).toBe(true);
        expect(resolves(metric.labelKey), `${metric.labelKey} does not resolve to text`).toBe(true);
        if (metric.badge !== undefined) {
          walked.push(metric.badge.textKey);
          expect(registered(metric.badge.textKey), `${metric.badge.textKey} is in neither registry`).toBe(true);
          expect(resolves(metric.badge.textKey), `${metric.badge.textKey} does not resolve to text`).toBe(true);
        }
      }
    }

    // Non-vacuity for the loop above, and the assertion that ruling 21's three
    // words are all really reached: a fixture that stopped saying one of them
    // would leave this list short and the walk would pass anyway.
    for (const rung of [
      HUD_MESSAGE_KEY.securityCoverageMet,
      HUD_MESSAGE_KEY.securityCoverageShort,
      HUD_MESSAGE_KEY.securityCoverageUnguarded,
    ]) {
      expect(walked, `${rung} is never rendered by the coverage chip in this walk`).toContain(rung);
    }
    expect(HUD_TABS.map((tab) => tab.id)).toEqual(['overview', 'build', 'rooms', 'security', 'regime']);
    for (const tab of HUD_TABS) expect(registry.has(tab.labelKey), tab.labelKey).toBe(true);
  });
});

describe('HUD architectural boundaries', () => {
  it('covers a non-trivial number of files', () => {
    expect(hudFiles.length).toBeGreaterThan(4);
    expect(primitiveFiles.length).toBeGreaterThan(8);
  });

  it('scans every module by name, not just enough of them to clear the floor above', () => {
    expect(hudFiles.map((path) => basename(path)).sort()).toEqual([...HUD_MODULE_NAMES].sort());
    expect(primitiveFiles.map((path) => basename(path)).sort()).toEqual([...PRIMITIVE_MODULE_NAMES].sort());
  });

  it('imports nothing from the simulation', () => {
    // `AGENTS.md` boundary 1: rendering is not simulation, and the HUD must
    // never become a source of truth. It is handed plain view-model data.
    for (const path of [...hudFiles, ...primitiveFiles]) {
      expect(code(path), `${path} must not import the simulation`).not.toMatch(/from ['"][^'"]*\/simulation\//);
    }
  });

  it('imports no Phaser and no renderer internals', () => {
    for (const path of [...hudFiles, ...primitiveFiles]) {
      expect(code(path), `${path} must not import Phaser`).not.toMatch(/from ['"]phaser['"]/i);
      expect(code(path), `${path} must not import the renderer`).not.toMatch(/from ['"][^'"]*\/rendering\//);
    }
  });

  it('keeps the primitives free of localization, so they stay reusable', () => {
    // Primitives take already-resolved text. Resolving a key is the
    // composing layer's job, which is what keeps translated text out of
    // anything that could become a source of truth.
    for (const path of primitiveFiles) {
      expect(code(path), `${path} must not resolve message keys itself`).not.toMatch(/localization/);
    }
  });

  it('attaches click handling only in modules that build a real <button>', () => {
    // Touch-first and keyboard-first: a `<div onclick>` is not focusable,
    // is not activated by Enter or Space, and is invisible to assistive
    // technology. Every clickable primitive must therefore be a `button`.
    let clickable = 0;
    for (const path of primitiveFiles) {
      const source = code(path);
      if (!source.includes("addEventListener('click'")) continue;
      clickable += 1;
      expect(source, `${path} handles clicks but never creates a <button>`).toMatch(/element\('button'/);
    }
    expect(clickable).toBeGreaterThan(2);
  });
});
