import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_TABS } from '../../src/ui/hud/hud';
import { HUD_MESSAGE_KEY, HUD_MESSAGE_KEYS } from '../../src/ui/hud/messages';
import { projectStatusMetrics } from '../../src/ui/hud/projection';

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
     * So what this gate now guards is a **narrower and real** thing: the
     * simulation publishes a daily wage bill and an arrears figure, and no
     * panel renders either, so no key may exist for them yet. A label authored
     * before something renders the figure it names is `AGENTS.md`'s fourth
     * exclusion. When the panel lands, the key lands with it and this list
     * grows in the same change.
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
    const ALLOWED_MONEY_KEYS = new Set(['hud.status.funds']);

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

  it('the strip and tab bar draw their labels from the registry', () => {
    const registry = new Set<string>(HUD_MESSAGE_KEYS);
    for (const metric of projectStatusMetrics({
      prisoners: 1,
      prisonerCapacity: 2,
      // One prisoner and no place, so the `PRISONERS` chip takes its
      // `prisonersWithoutBed` branch (issue #609) rather than the no-badge
      // one: this case walks every label the strip can render, and a fixture
      // where everybody was housed would leave the new one unwalked.
      occupiedPlaces: 0,
      staff: 1,
      rooms: 1,
      // Non-zero on both lower rungs, so the coverage chip takes its
      // `coverageDetail` branch rather than the `securityCoverageMet`
      // fallback: this case walks every label the strip can render, and a
      // fixture that never left the fallback would leave one unwalked.
      prisonersCovered: 1,
      prisonersUnderstaffed: 1,
      prisonersUnguarded: 1,
      activeIncidents: 1,
      // No `activeIncidentTypeLabelKey` here on purpose: the label this test
      // walks against is the HUD's own closed registry, and a real
      // `incident-type.*.name` key (issue #506 finding 2) lives in the
      // simulation content catalogue's registry instead -- a different, and
      // correctly not-this, contract.
      contrabandFound: 1,
      treasuryMinorUnits: 0,
      stateIncomeAccruedTodayMinorUnits: 0,
    })) {
      expect(registry.has(metric.labelKey), metric.labelKey).toBe(true);
      if (metric.badge !== undefined) expect(registry.has(metric.badge.textKey), metric.badge.textKey).toBe(true);
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
