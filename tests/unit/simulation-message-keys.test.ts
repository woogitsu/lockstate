import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SIMULATION_ENUM_GROUPS,
  type SimulationEnumGroup,
  defaultLocaleEnCatalog,
  deriveSimulationMessageKey,
  extractEnumDeclarationIds,
  findEnumShapedDeclarations,
  simulationEnumMessageKeys,
  simulationEnumMessages,
  stripSourceComments,
  validateSimulationEnumGroupSource,
  validateSimulationEnumGroups,
} from '../../src/content';
import {
  Localizer,
  PSEUDO_LOCALE,
  buildPseudoLocaleCatalog,
  defaultMessageCatalogEn,
} from '../../src/services/localization';

/**
 * The completeness contract for `src/content/simulation-message-keys.ts`.
 *
 * The table labels enum values that have no definition object to carry a
 * `nameKey`. Its only real risk is silence: someone adds a sixth incident
 * type, no key exists for it, and the HUD renders `gang-retaliation` at a
 * player. So the *source declaration is authoritative* and the table must
 * conform to it -- not the other way round, and not against a second
 * hand-maintained list of expected values, which would be the same table
 * written twice and would rot in exactly the same way.
 *
 * The rules live in `src/content/validate-catalog.ts` (exported, typed and
 * exercised against fixtures below); this file is the part that has to touch
 * the filesystem, mirroring the split in
 * `tests/determinism/ambient-nondeterminism-contract.test.ts`.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SCANNED_ROOTS = ['src/simulation', 'src/content'] as const;

const repoPath = (file: string): string => relative(REPOSITORY_ROOT, file).split('\\').join(posix.sep);

function listTypeScriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listTypeScriptFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const SCANNED_FILES = SCANNED_ROOTS.flatMap((root) => listTypeScriptFiles(join(REPOSITORY_ROOT, root)));

const readSource = (file: string): string => readFileSync(join(REPOSITORY_ROOT, file), 'utf8');

/**
 * Enum-shaped declarations that intentionally carry no player-facing label,
 * each with the reason. This is the *only* way to have one, so introducing
 * an unlabelled enum is a reviewable diff rather than an omission -- the
 * same device as the allow-list in the ambient-nondeterminism contract.
 */
const UNLABELLED: readonly { readonly sourceFile: string; readonly declaration: string; readonly reason: string }[] = [
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'MAIN_TO_WORKER_MESSAGE_KINDS',
    reason:
      'Wire protocol message kinds (ADR 0003). They travel between the main thread and the worker and are never rendered; a player never sees "load-snapshot".',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'WORKER_TO_MAIN_MESSAGE_KINDS',
    reason:
      'Wire protocol message kinds (ADR 0003), same as the main-to-worker set: transport vocabulary, not text a panel displays.',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'PROJECTION_IDS',
    reason:
      'Which read model a `simulation/request-projection` names (#104). Wire vocabulary in the same sense as the two message-kind lists above -- it selects a payload shape, it is not a payload. A panel already knows which projection it asked for, because it named it; nothing renders "hud/prisoner-roster", and a label for it would be a caption for a request rather than for anything in the prison. The *contents* of each projection do carry labels, through the groups this table already holds -- `IntakeStage`, `IncidentType`, `DeploymentPhase` and the rest -- which is where the words a roster or an incident list shows actually come from.',
  },
  {
    sourceFile: 'src/simulation/worker/projection-catalog.ts',
    declaration: 'ProjectionTargetKind',
    reason:
      'Whether a catalogued projection takes no target, an entity id or a string id (#104). It is a property of the *catalog entry*, read only by the worker\'s own request validation to decide whether a request named the right kind of thing, and it never crosses the boundary in either direction: the wire carries `ProjectionTarget`, which is the target itself, and never this classification of it. Nothing projects it and no panel could render it.',
  },
  {
    sourceFile: 'src/simulation/protocol/decode.ts',
    declaration: 'PROTOCOL_DECODE_ERROR_CODES',
    reason:
      'Developer diagnostics for a malformed protocol envelope, reported to the main thread as protocol fault codes. A player-facing failure message is the UI layer\'s own string with its own key; surfacing "unsupported-protocol-version" verbatim would be a bug, not a missing translation.',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'PROTOCOL_FAULT_CODES',
    reason:
      'The twelve reasons the worker may refuse or abandon a request, and the superset of `PROTOCOL_DECODE_ERROR_CODES` exempted just above for the same reason: developer diagnostics on the worker-to-main boundary. A player-facing failure message is the UI layer\'s own string with its own key -- `src/ui/hud/messages.ts`\'s `hud.refusal.*` names the outcome and deliberately carries neither the code nor the thrown `Error` text (#207) -- so rendering "snapshot-incompatible" verbatim would be a bug rather than a missing translation. Newly *discovered* by this scan rather than newly written: the vocabulary used to live inline inside `z.enum([...])`, where no scan could see it, and #187 exported it as a `const` tuple so `tests/foundation/fault-code-reachability-contract.test.ts` could enumerate it.',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'REFUSAL_REASONS',
    reason:
      'The only exemption here for a vocabulary that genuinely does reach the player, and the distinction is *how*. This table labels an id a panel renders as a **label** -- a cell reading "Awaiting Materials", a badge reading "High Risk" -- and a refusal is not a label: it is a whole sentence saying what did not happen and why ("The build order failed -- you do not own that land."), which a derived `refusal-reason.build.unowned-land.name` reading "Unowned Land" cannot be and would have nowhere to be rendered. So the id maps 1:1 onto an authored HUD sentence key in `src/ui/simulation-alerts.ts` (#261). The completeness this table would give is given there instead, and in two directions: the mapping is a `Record` over the closed union, so a reason added to the protocol fails to compile until it has a key, and `tests/unit/ui-simulation-alerts.test.ts` resolves every one of those keys against the bundled default catalog so none can ship as its own raw dotted text.',
  },
  {
    sourceFile: 'src/simulation/construction/build-order.ts',
    declaration: 'BUILD_ORDER_FAIL_REASONS',
    reason:
      'The construction system\'s own spelling of why it failed an order, and it never leaves the simulation under this name: `createConstructionCommandHandler` maps every member onto a `RefusalReason` through an exhaustive `Record` before anything is published, and no projection in `src/simulation/presentation/` emits `BuildOrder.failReason` at all. It is persisted (`save-schema.ts`) and read back as save data, which is storage rather than display. Labelling it would author a second set of words for the same nine facts `REFUSAL_REASONS` already carries, and the two would drift.',
  },
  {
    sourceFile: 'src/simulation/economy/procurement.ts',
    declaration: 'PurchaseRefusalReason',
    reason:
      'The procurement system\'s own spelling of why it refused a purchase, exempt for exactly the reason `BUILD_ORDER_FAIL_REASONS` above is: `createSessionCommandHandler` maps every member onto a `RefusalReason` through an exhaustive `Record` before anything crosses the worker boundary, and nothing projects or persists it. Newly *discovered* rather than newly written -- the union used to sit inline inside `PurchaseOutcome`, where no scan could see it, and #261 named it so the mapping could be checked exhaustively at compile time.',
  },
  {
    sourceFile: 'src/simulation/kernel/kernel.ts',
    declaration: 'CommandRejectionKind',
    reason:
      'Which of three refusals `Kernel.submitCommand` made -- a duplicate sequence, a sequence gap, or a tick already executed. It exists so the worker can map a refusal to a fault code instead of collapsing all three onto `invalid-state` (#187 finding 2), so it is one layer *below* a diagnostic that is itself exempt above. Nothing projects it: it never leaves the worker, and the main thread receives the mapped `ProtocolFaultCode` and never this discriminant.',
  },
  {
    sourceFile: 'src/simulation/rooms/zoning.ts',
    declaration: 'ZoneRoomRefusalReason',
    reason:
      'Why `RoomZoningService.zone` refused a `ZoneRoom` -- unowned land, an overlap, a rectangle no room can be. It is the zoning counterpart of `BuildOrder.failReason`, which is likewise a stable id and likewise carries no key: #207 settled that a refusal a player sees is the UI layer\'s own `hud.refusal.*` string naming the outcome, never the simulation\'s code rendered verbatim. It never leaves the simulation under this spelling: `createSessionCommandHandler` maps every member onto a `RefusalReason` through an exhaustive `Record` before anything is published, and what the player reads is one authored `hud.alert.refusal.zone.*` sentence per reason rather than a two-word label this table could hold -- see the `REFUSAL_REASONS` entry above for that argument in full. Until #261 step 2 built the route this entry said "nothing projects this one at all yet -- it reaches `recentRefusals()` and stops there"; the reason it reaches now is mapped, and the window it also still fills is diagnosis.',
  },
  {
    sourceFile: 'src/content/simulation-message-keys.ts',
    declaration: 'SimulationEnumForm',
    reason:
      'Metadata of the labelling mechanism itself -- how a declaration is written in source. It describes the table, it is not a value the simulation projects.',
  },
  {
    sourceFile: 'src/content/validate-catalog.ts',
    declaration: 'EnumIdExtractionFailure',
    reason:
      'Failure codes of the completeness check in this same test file. They appear in a test assertion message, never in the game.',
  },
];

const groupKey = (sourceFile: string, declaration: string): string => `${sourceFile}::${declaration}`;
const COVERED = new Set(SIMULATION_ENUM_GROUPS.map((group) => groupKey(group.sourceFile, group.declaration)));

describe('simulation enum message keys are internally consistent', () => {
  it('has no duplicate namespace, duplicate derived key, blank label or unexplained exemption', () => {
    expect(validateSimulationEnumGroups()).toEqual([]);
  });

  it('refuses a blank label, a duplicate namespace and an exemption with no stated reason', () => {
    expect(
      validateSimulationEnumGroups([
        { namespace: 'demo', sourceFile: 'a.ts', declaration: 'A', form: 'const-array', labels: { a: '  ' } },
        {
          namespace: 'demo',
          sourceFile: 'b.ts',
          declaration: 'B',
          form: 'const-array',
          labels: { b: 'B' },
          additionalIds: [{ id: 'b', reason: 'because' }],
        },
      ]),
    ).toEqual([
      { kind: 'empty-label', namespace: 'demo', id: 'a' },
      { kind: 'duplicate-namespace', namespace: 'demo' },
      { kind: 'unexplained-additional-id', namespace: 'demo', id: 'b' },
    ]);
  });

  it('derives every key from its id rather than letting one be written by hand', () => {
    expect(deriveSimulationMessageKey('need', 'hunger')).toBe('need.hunger.name');
    // Already qualified: `action.sleep` must not become `action.action.sleep`.
    expect(deriveSimulationMessageKey('action', 'action.sleep')).toBe('action.sleep.name');
    // Numeric ids are stringified, so `RiskTier` 3 still gets a stable key.
    expect(deriveSimulationMessageKey('risk-tier', 3)).toBe('risk-tier.3.name');
  });

  it('produces one message per labelled id, and every key is a valid catalog identifier', () => {
    const labelCount = SIMULATION_ENUM_GROUPS.reduce((total, group) => total + Object.keys(group.labels).length, 0);
    const keys = simulationEnumMessageKeys();

    expect(keys).toHaveLength(labelCount);
    for (const key of keys) {
      expect(key, `${key} is not an acceptable message-catalog key`).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:/-]*\.name$/);
    }
  });

  it('keeps stable ids and translated text in separate namespaces (ADR 0011)', () => {
    for (const group of SIMULATION_ENUM_GROUPS) {
      for (const [id, label] of Object.entries(group.labels)) {
        expect(label, `${group.namespace}.${id} is labelled with its own id`).not.toBe(id);
      }
    }
  });
});

describe('every labelled group agrees with the source declaration it names', () => {
  it('names a real, still-present file inside the scanned roots', () => {
    for (const group of SIMULATION_ENUM_GROUPS) {
      expect(existsSync(join(REPOSITORY_ROOT, group.sourceFile)), `${group.sourceFile} does not exist`).toBe(true);
      expect(
        SCANNED_FILES.map(repoPath),
        `${group.sourceFile} is outside the scanned roots, so nothing would notice it changing`,
      ).toContain(group.sourceFile);
    }
  });

  it.each(SIMULATION_ENUM_GROUPS.map((group) => [group.namespace, group] as const))(
    '%s labels exactly the ids its declaration declares',
    (_namespace, group: SimulationEnumGroup) => {
      expect(validateSimulationEnumGroupSource(group, readSource(group.sourceFile))).toEqual([]);
    },
  );
});

describe('no enum reaches the HUD without a group covering it', () => {
  const discovered = SCANNED_FILES.flatMap((file) =>
    findEnumShapedDeclarations(readFileSync(file, 'utf8')).map((declaration) => ({
      sourceFile: repoPath(file),
      ...declaration,
    })),
  );

  it('discovers the enums it is supposed to discover -- the scan is not silently matching nothing', () => {
    const names = discovered.map((entry) => groupKey(entry.sourceFile, entry.declaration));
    expect(discovered.length).toBeGreaterThan(20);
    expect(names).toContain('src/simulation/prisoners/needs.ts::NEED_IDS');
    expect(names).toContain('src/simulation/incidents/incident.ts::IncidentType');
    expect(names).toContain('src/simulation/prisoners/classification.ts::RiskTier');
    expect(names).toContain('src/content/room-catalog.ts::roomCategorySchema');
  });

  it('leaves every discovered enum either labelled or explicitly exempted', () => {
    const exempt = new Set(UNLABELLED.map((entry) => groupKey(entry.sourceFile, entry.declaration)));
    const unaccounted = discovered
      .map((entry) => groupKey(entry.sourceFile, entry.declaration))
      .filter((key) => !COVERED.has(key) && !exempt.has(key));

    expect(unaccounted).toEqual([]);
  });

  it('keeps the exemption list honest -- every entry still names a real enum with a real reason', () => {
    const discoveredKeys = new Set(discovered.map((entry) => groupKey(entry.sourceFile, entry.declaration)));
    for (const entry of UNLABELLED) {
      expect(
        discoveredKeys,
        `stale exemption: ${entry.declaration} is no longer a discovered enum in ${entry.sourceFile}`,
      ).toContain(groupKey(entry.sourceFile, entry.declaration));
      expect(entry.reason.length).toBeGreaterThan(40);
    }
  });
});

describe('the extraction rules are exercised, not merely trusted', () => {
  it('reads each declared form out of source text', () => {
    expect(extractEnumDeclarationIds("export const IDS = ['a', 'b'] as const;", 'IDS', 'const-array')).toEqual({
      ok: true,
      ids: ['a', 'b'],
    });
    expect(extractEnumDeclarationIds("export type T = 'a' | 'b';", 'T', 'string-union')).toEqual({
      ok: true,
      ids: ['a', 'b'],
    });
    expect(extractEnumDeclarationIds('export type T = 0 | 1 | 2;', 'T', 'numeric-union')).toEqual({
      ok: true,
      ids: ['0', '1', '2'],
    });
    expect(extractEnumDeclarationIds("export const S = z.enum(['a', 'b']);", 'S', 'zod-enum')).toEqual({
      ok: true,
      ids: ['a', 'b'],
    });
    expect(
      extractEnumDeclarationIds(
        "export const S = z.discriminatedUnion('type', [z.object({ type: z.literal('a') }), z.object({ type: z.literal('b') })]);",
        'S',
        'zod-literal-union',
      ),
    ).toEqual({ ok: true, ids: ['a', 'b'] });
    expect(
      extractEnumDeclarationIds(
        "export const D: readonly X[] = [{ id: 'a', objectId: 'not-an-id' }, { id: 'b' }];",
        'D',
        'definition-id-field',
      ),
    ).toEqual({ ok: true, ids: ['a', 'b'] });
  });

  it('reads a nested value list whole instead of stopping at the first inner bracket', () => {
    const source = "export const D: readonly X[] = [{ id: 'a', tags: ['x'] }, { id: 'b' }];";
    expect(extractEnumDeclarationIds(source, 'D', 'definition-id-field')).toEqual({ ok: true, ids: ['a', 'b'] });
  });

  it('refuses a union that is not purely literal rather than reporting a plausible subset', () => {
    expect(extractEnumDeclarationIds("export type T = 'a' | 'b' | string;", 'T', 'string-union')).toEqual({
      ok: false,
      reason: 'declaration-not-in-declared-form',
    });
  });

  it('reports a renamed or removed declaration instead of an empty id list', () => {
    expect(extractEnumDeclarationIds("export const OTHER = ['a'] as const;", 'IDS', 'const-array')).toEqual({
      ok: false,
      reason: 'declaration-not-found',
    });
  });

  it('ignores declarations that only appear inside comments', () => {
    expect(stripSourceComments("// export const IDS = ['a'] as const;\nconst ok = 1;")).not.toContain('IDS');
    expect(findEnumShapedDeclarations("/* export type T = 'a' | 'b'; */\nconst ok = 1;")).toEqual([]);
  });

  it('would catch an id added to a declaration with no label, and a label for an id that no longer exists', () => {
    const group: SimulationEnumGroup = {
      namespace: 'demo',
      sourceFile: 'demo.ts',
      declaration: 'DEMO',
      form: 'const-array',
      labels: { a: 'A', removed: 'Removed' },
    };

    expect(validateSimulationEnumGroupSource(group, "export const DEMO = ['a', 'b'] as const;")).toEqual([
      { kind: 'missing-label', namespace: 'demo', id: 'b' },
      { kind: 'stale-label', namespace: 'demo', id: 'removed' },
    ]);
  });

  it('rejects an exemption for a value the source does declare, so the escape hatch cannot be left open', () => {
    const group: SimulationEnumGroup = {
      namespace: 'demo',
      sourceFile: 'demo.ts',
      declaration: 'DEMO',
      form: 'const-array',
      labels: { a: 'A', b: 'B' },
      additionalIds: [{ id: 'b', reason: 'x'.repeat(50) }],
    };

    expect(validateSimulationEnumGroupSource(group, "export const DEMO = ['a', 'b'] as const;")).toEqual([
      { kind: 'obsolete-additional-id', namespace: 'demo', id: 'b' },
    ]);
  });
});

describe('the derived keys resolve as real text through the localization runtime', () => {
  const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

  it('resolves every derived key in the bundled default catalog, with no key falling back to itself', () => {
    const messages = simulationEnumMessages();
    expect(Object.keys(messages).length).toBeGreaterThan(0);

    for (const [key, text] of Object.entries(messages)) {
      expect(defaultLocaleEnCatalog.get(key), `${key} is missing from the default en catalog`).toBe(text);
      expect(localizer.has(key), `${key} does not reach the localization runtime`).toBe(true);
      expect(localizer.format(key)).not.toBe(key);
    }
  });

  it('goes through the pseudo-locale like every other key rather than bypassing it (ADR 0011)', () => {
    const pseudo = buildPseudoLocaleCatalog(defaultMessageCatalogEn);
    const pseudoLocalizer = new Localizer({ locale: PSEUDO_LOCALE, catalogs: [defaultMessageCatalogEn, pseudo] });

    for (const [key, english] of Object.entries(simulationEnumMessages())) {
      const pseudoText = pseudoLocalizer.format(key);
      expect(pseudoText, `${key} is not pseudo-localized`).not.toBe(english);
      expect(pseudoText.startsWith('⟦') && pseudoText.endsWith('⟧'), `${key} is not bracketed`).toBe(true);
    }

    // A HUD reading a label through `deriveSimulationMessageKey` gets the
    // pseudo-locale automatically -- which is the point: the enum labels are
    // now testable for truncation like every other string.
    expect(pseudoLocalizer.format(deriveSimulationMessageKey('incident-type', 'riot'))).toContain('Ř');
  });
});
