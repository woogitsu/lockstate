import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { deriveSimulationMessageKey } from '../../src/content/simulation-message-keys';
import { defaultStaffRoleRegistry } from '../../src/content/staff-role-catalog';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { GUARD_CLAIM_KINDS } from '../../src/simulation/security/guard-release';
import type { HeldGuardsViewModel } from '../../src/simulation/presentation/guard-release-projection';
import { formatHeldGuardText, HELD_GUARD_ROW_LIMIT } from '../../src/ui/hud';
import { heldGuardsFromProjection } from '../../src/ui/simulation-held-guards';

/**
 * The translator between `hud/held-guards` and what the Staff panel renders
 * ([ADR 0034](../../docs/adr/0034-releasing-a-claimed-guard.md)).
 *
 * Two claims are worth proving here and they are different in kind.
 *
 * **That the mapping decides nothing the simulation decided.** The rows are the
 * projection's own window in the projection's own order, and the only things
 * added are two message keys.
 *
 * **That both keys resolve against the real bundled catalog.** This is the half
 * `tests/foundation/localization-key-completeness.test.ts` cannot do: it scans
 * for `labelKey: '...'` literals, and a claim's key is *derived* at runtime from
 * a stable id. So a claim kind added to `GUARD_CLAIM_KINDS` without a label would
 * ship as its own raw dotted text on a panel row, and the loop below is what
 * stops it.
 */

/**
 * The real bundled catalog, and `undefined` for a key it does not hold.
 *
 * `Localizer.format` answers the key itself for a missing key rather than
 * throwing, so "resolved" has to be checked as "the answer is not the key" --
 * the same reading `ui-simulation-alerts.test.ts` takes of the same mechanism.
 */
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
const resolve = (key: string): string | undefined => {
  const text = localizer.format(key);
  return text === key ? undefined : text;
};
const roleKeyOf = (staffRoleId: string) => defaultStaffRoleRegistry.getById(staffRoleId)?.nameKey;

function view(rows: HeldGuardsViewModel['held']['rows'], totals?: Partial<HeldGuardsViewModel['totals']>): HeldGuardsViewModel {
  return {
    schemaVersion: 1,
    held: { rows, total: totals?.held ?? rows.length, offset: 0, limit: 100 },
    countsByClaim: GUARD_CLAIM_KINDS.map((claim) => ({ claim, count: rows.filter((row) => row.claim === claim).length })),
    totals: { hired: totals?.hired ?? rows.length, held: totals?.held ?? rows.length, unassigned: totals?.unassigned ?? 0 },
  } as HeldGuardsViewModel;
}

describe('the mapping adds two keys and decides nothing else', () => {
  it('derives the claim label from the simulation’s stable id, never from a table here', () => {
    const model = heldGuardsFromProjection(
      view([
        { entityId: 0, staffRoleId: 'staff-role.guard', staffRoleNameKey: 'staff-role.guard.name', claim: 'incident-response', deploymentPhase: 'on-search' },
        { entityId: 4, staffRoleId: 'staff-role.guard', staffRoleNameKey: 'staff-role.guard.name', claim: 'search', deploymentPhase: 'on-search' },
      ]),
      roleKeyOf,
    );

    // Derived rather than authored: `deriveSimulationMessageKey` is the one rule
    // the catalog was built with, so a claim renamed in the simulation renames
    // its key in one edit.
    expect(model.guards.map((guard) => guard.claimLabelKey)).toEqual([
      deriveSimulationMessageKey('guard-claim', 'incident-response'),
      deriveSimulationMessageKey('guard-claim', 'search'),
    ]);
  });

  it('keeps the projection’s order and window, and the totals over the whole roster', () => {
    const model = heldGuardsFromProjection(
      view(
        [
          { entityId: 2, staffRoleId: 'staff-role.guard', claim: 'search', deploymentPhase: 'on-search' },
          { entityId: 7, staffRoleId: 'staff-role.guard', claim: 'deployment', deploymentPhase: 'on-post' },
        ],
        { hired: 12, held: 9, unassigned: 3 },
      ),
      roleKeyOf,
    );

    expect(model.guards.map((guard) => guard.entityId)).toEqual([2, 7]);
    // The header counts the prison, the rows count the panel -- so the "and N
    // more" line the panel draws has something true to be about.
    expect(model.held).toBe(9);
    expect(model.unassigned).toBe(3);
  });

  it('leaves the role key absent rather than present-and-undefined for a role the host cannot name', () => {
    // `exactOptionalPropertyTypes` is on, so "the host names no role" has to be
    // an absent property. The row survives, because it is still a held guard
    // whose claim a player may want to release.
    const model = heldGuardsFromProjection(
      view([{ entityId: 3, staffRoleId: 'staff-role.not-a-role', claim: 'unattributed', deploymentPhase: 'on-search' }]),
      roleKeyOf,
    );

    expect(model.guards).toHaveLength(1);
    expect(model.guards[0]).not.toHaveProperty('roleLabelKey');
    expect(model.guards[0]?.entityId).toBe(3);
    expect(model.guards[0]?.claimLabelKey).toBe(deriveSimulationMessageKey('guard-claim', 'unattributed'));
  });

  it('reports no guards as an empty list rather than as an absent model', () => {
    // "Nothing has asked" is the reader answering `undefined`; this is the
    // simulation saying nobody is assigned, and the panel draws a sentence for it.
    const model = heldGuardsFromProjection(view([], { hired: 4, held: 0, unassigned: 4 }), roleKeyOf);
    expect(model).toEqual({ held: 0, unassigned: 4, guards: [] });
  });
});

describe('every key the panel can render resolves against the bundled catalog', () => {
  it('has a real sentence for every claim kind the simulation can report', () => {
    // The loop `localization-key-completeness.test.ts` cannot run, because these
    // keys are derived rather than written as literals. A fifth claim kind added
    // with no label fails here rather than shipping as `guard-claim.x.name` on a
    // row.
    for (const claim of GUARD_CLAIM_KINDS) {
      const key = deriveSimulationMessageKey('guard-claim', claim);
      const text = resolve(key);
      expect(text, `${claim} has no label in the bundled catalog`).toBeDefined();
      expect(text!.trim().length, `${claim} resolves to nothing`).toBeGreaterThan(0);
      // And it is a *label*, not the key rendered back at the player.
      expect(text).not.toBe(key);
    }
  });

  it('renders a row as a real sentence, with the role and the claim in it', () => {
    // `formatHeldGuardText` is pure and exported for exactly this: the default
    // Vitest environment is `node`, so nothing headless can call
    // `createStaffPanel`, and what the panel *says* is holding a guard is the
    // claim that has to be assertable over real text from the real catalog.
    const t = (key: string, parameters?: Record<string, string | number>): string =>
      parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

    const named = formatHeldGuardText(t as never, {
      entityId: 2,
      claimLabelKey: deriveSimulationMessageKey('guard-claim', 'search'),
      roleLabelKey: defaultStaffRoleRegistry.getById('staff-role.guard')!.nameKey,
    });
    expect(named).toContain(resolve(deriveSimulationMessageKey('guard-claim', 'search'))!);
    expect(named).toContain(resolve(defaultStaffRoleRegistry.getById('staff-role.guard')!.nameKey)!);
    expect(named).not.toContain('{');

    // And the unnamed form still says which guard, so the row stays aimable.
    const unnamed = formatHeldGuardText(t as never, {
      entityId: 7,
      claimLabelKey: deriveSimulationMessageKey('guard-claim', 'unattributed'),
    });
    expect(unnamed).toContain('7');
    expect(unnamed).toContain(resolve(deriveSimulationMessageKey('guard-claim', 'unattributed'))!);
    expect(unnamed).not.toContain('{');
  });
});

describe('the reader asks for the panel’s row budget and nothing more', () => {
  it('shares one row limit with the panel, so no row arrives that nothing can draw', () => {
    // Asking for the projection's default hundred would build ninety-odd rows
    // nothing can render, twice a second. The constant is the panel's, and the
    // reader names it rather than defaulting.
    expect(HELD_GUARD_ROW_LIMIT).toBeGreaterThan(0);
    expect(HELD_GUARD_ROW_LIMIT).toBeLessThan(10);
  });
});
