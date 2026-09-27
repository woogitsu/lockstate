import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { BuildEdge, BuildOrderLifecycleState } from '../../src/simulation/construction/build-order';
import type { ContrabandHolderKind, ContrabandSourceType, ContrabandState } from '../../src/simulation/contraband/item';
import type { InformantHolderKind } from '../../src/simulation/contraband/informants';
import type { IntelligenceSourceType, IntelligenceTargetKind } from '../../src/simulation/contraband/intelligence';
import type { SearchScope } from '../../src/simulation/contraband/search-policy';
import type { SearchJobState } from '../../src/simulation/contraband/search-system';
import type { IncidentState, IncidentType } from '../../src/simulation/incidents/incident';
import type { DoorSide, DoorState } from '../../src/simulation/navigation/door';
import type { RouteFailureReason } from '../../src/simulation/navigation/route';
import type { DoorAccessDenialReason } from '../../src/simulation/navigation/route-context';
import type { JobLifecycleState, CarryLeg } from '../../src/simulation/operations/job';
import type { UtilityNodeKind, UtilityType } from '../../src/simulation/operations/utility-network';
import type { DeploymentPhase } from '../../src/simulation/security/guard-roster';
import type { SectorControlState } from '../../src/simulation/security/sector';
import type { ChunkLifecycle } from '../../src/simulation/world/sparse-world';

/**
 * Every closed `z.enum` in `save-schema.ts` that mirrors a TypeScript union,
 * and the one direction of disagreement between them that is a defect
 * (issue #1225).
 *
 * **The seam.** The save reader validates a payload with Zod and then hands it
 * to live code through two unchecked assertions -- `result.envelope.payload as
 * unknown as SessionSnapshotBundle`
 * (`src/persistence/session/session-controller.ts:716`) and `snapshot.data as
 * unknown as SessionSnapshotBundle` (`src/ui/simulation-commands.ts:586`).
 * Nothing between the Zod member list and the union's member list is checked
 * by anything, in either direction, and `tsconfig.json` sets no
 * `noUnusedLocals`, so a member with no producer and no reader raises nothing
 * either. That is how a docblock came to assert a false provenance for a
 * `JobLifecycleState` member no build has ever written and survive it.
 *
 * **This file does not assert that the two lists are equal, and that is the
 * ruling rather than an omission.** The reader is allowed to be *wider* than
 * the union and is sometimes required to be:
 *
 * - **Reader narrower than the union is the defect.** A save legitimately
 *   carrying the member becomes an **unloadable prison** -- the payload is
 *   refused as `invalid-shape` and there is no way back to the prison inside
 *   it. `CARRY_JOB_FAIL_REASONS`' docblock (`src/simulation/operations/job.ts`)
 *   already refuses exactly this trade for `failReason`, in its own words:
 *   narrowing the reader *"would turn an unrecognised historical value into an
 *   unloadable prison rather than a job that reads as failed"*. `build-order.ts`
 *   records the identical decision for the identical pair. So the rule those
 *   two docblocks state for one field is the rule this file enforces for the
 *   class.
 * - **Reader wider than the union is a claim that needs a name.** It is how a
 *   member the union has dropped stays loadable: `JobSystem` wrote
 *   `'travelling'` and `'performing'` until ADR 0093 removed it on 2026-09-03,
 *   and `SAVE_SCHEMA_VERSION` only reached 6 on 2026-09-14, so a pre-0093 save
 *   is V5 or lower and the V5 -> V6 step spreads `...payload.simulation`
 *   untouched. A reader that stopped accepting them would refuse those saves.
 *   It is *also* how a phantom gets in -- a member no build has ever written.
 *   The two are indistinguishable from the member list alone, which is why
 *   every reader-only member has to be **named with the build that wrote it**
 *   in `readerOnly` below rather than merely tolerated.
 *
 * **`docs/PERSISTENCE.md` had already ruled on the asymmetry, for enums
 * specifically, and this file applies that ruling rather than reopening it.**
 * Recording ADR 0061's widening of `simulation.contraband.items[].state` to
 * admit `'departed'` with no version bump, it says of the other direction:
 * *"A narrowing would be a different question entirely and is not what this
 * precedent covers: removing a member makes every save that recorded one
 * unreadable, which is a migration."* So a widened reader is a change this
 * repository already knows how to make cheaply, and a narrowed one is a
 * migration nobody has written -- which is precisely the shape of gate below.
 *
 * An equality assertion would be cheaper and would fail for the wrong reason
 * the first time a member is legitimately retired from the union while saves
 * carrying it still exist -- and the fix under a failing equality assertion is
 * to narrow the reader, which is the unloadable prison. This asserts the
 * subset instead, and makes the difference a documented ledger.
 *
 * **Measured when this file was written: `readerOnly` is empty for all
 * twenty-one pairs.** Every closed enum here is exactly its union today. The
 * permission above is a permission, not a description.
 *
 * **What this file does not do.** It does not check that a union member has a
 * live *producer* -- `travelling`, `performing` and `reserved` have none and
 * are all three legal here, because a reader accepting a value nothing writes
 * is the safe direction. `tests/foundation/job-production-contract.test.ts`
 * (#1222) is where producers are partitioned. It also rules on nothing about
 * the *values*: a member renamed on both sides at once is a save-format
 * change and `docs/PERSISTENCE.md` governs it.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SAVE_SCHEMA_PATH = resolve(REPOSITORY_ROOT, 'src/persistence/save-schema.ts');

/**
 * Compile-time exhaustiveness over a TypeScript union.
 *
 * `members` is rejected by `tsc` if it omits a member of `U` (the intersection
 * resolves to `never`) and rejected if it contains anything that is not one
 * (the `readonly U[]` constraint). So the union side of every comparison below
 * is maintained by the compiler rather than by hand, which is the half of this
 * seam that had no check at all: adding a member to a union and forgetting the
 * schema now fails `pnpm typecheck` at the line that names the union, and the
 * fix that makes it compile then fails the assertion that names the schema.
 */
function unionMembers<U extends string>() {
  return function pin<const T extends readonly U[]>(
    members: T & ([U] extends [T[number]] ? unknown : { readonly __UNION_MEMBER_MISSING_FROM_THIS_LIST__: Exclude<U, T[number]> }),
  ): readonly string[] {
    return members;
  };
}

interface ReaderOnlyMember {
  /** The member the reader accepts and the union does not. */
  readonly member: string;
  /**
   * The build that wrote it, specifically enough to check: the system, the
   * change that stopped it writing, and the save versions that can carry it.
   */
  readonly writtenBy: string;
}

interface EnumUnionPair {
  /** `<enclosing declaration>.<field>` in `save-schema.ts`, as the parser below keys it. */
  readonly site: string;
  /** The union this enum mirrors, `file:line` at the declaration. */
  readonly union: string;
  /** Every member of that union, exhaustiveness enforced by `unionMembers`. */
  readonly members: readonly string[];
  /** Members the reader accepts that the union does not, each with its provenance. */
  readonly readerOnly: readonly ReaderOnlyMember[];
}

const PAIRS: readonly EnumUnionPair[] = [
  {
    site: 'savedSearchJobStateSchema',
    union: 'SearchJobState (src/simulation/contraband/search-system.ts:22)',
    members: unionMembers<SearchJobState>()(['travelling', 'searching']),
    readerOnly: [],
  },
  {
    site: 'savedRouteFailureSchema.reason',
    union: 'RouteFailureReason (src/simulation/navigation/route.ts:18)',
    members: unionMembers<RouteFailureReason>()(['invalid-origin', 'invalid-destination', 'unreachable', 'permission-denied']),
    readerOnly: [],
  },
  {
    site: 'savedRouteBlockedBySchema.reason',
    union: 'DoorAccessDenialReason (src/simulation/navigation/route-context.ts:18)',
    members: unionMembers<DoorAccessDenialReason>()(['locked', 'insufficient-clearance', 'missing-permission']),
    readerOnly: [],
  },
  {
    site: 'serializedChunkStateSchema.lifecycle',
    union: 'ChunkLifecycle (src/simulation/world/sparse-world.ts:33)',
    members: unionMembers<ChunkLifecycle>()(['metadata-only', 'loaded']),
    readerOnly: [],
  },
  {
    site: 'buildOrderSchema.edge',
    union: 'BuildEdge (src/simulation/construction/build-order.ts:33)',
    members: unionMembers<BuildEdge>()(['north', 'west']),
    readerOnly: [],
  },
  {
    site: 'buildOrderSchema.state',
    union: 'BuildOrderLifecycleState (src/simulation/construction/build-order.ts:3)',
    members: unionMembers<BuildOrderLifecycleState>()([
      'planned',
      'approved',
      'materials-pending',
      'assigned',
      'in-progress',
      'completed',
      'cancelled',
      'failed',
    ]),
    readerOnly: [],
  },
  {
    site: 'utilityNetworkSchema.type',
    union: 'UtilityType (src/simulation/operations/utility-network.ts:1)',
    members: unionMembers<UtilityType>()(['electricity', 'water']),
    readerOnly: [],
  },
  {
    site: 'utilityNetworkSchema.kind',
    union: 'UtilityNodeKind (src/simulation/operations/utility-network.ts:2)',
    members: unionMembers<UtilityNodeKind>()(['producer', 'consumer']),
    readerOnly: [],
  },
  {
    site: 'carryItemJobSchema.state',
    union: 'JobLifecycleState (src/simulation/operations/job.ts:5)',
    members: unionMembers<JobLifecycleState>()([
      'available',
      'reserved',
      'assigned',
      'travelling',
      'performing',
      'completed',
      'failed',
      'cancelled',
    ]),
    readerOnly: [],
  },
  {
    site: 'carryItemJobSchema.leg',
    union: 'CarryLeg (src/simulation/operations/job.ts:6)',
    members: unionMembers<CarryLeg>()(['pickup', 'dropoff']),
    readerOnly: [],
  },
  {
    site: 'doorDefinitionSchema.side',
    union: 'DoorSide (src/simulation/navigation/door.ts:13)',
    members: unionMembers<DoorSide>()(['left', 'top']),
    readerOnly: [],
  },
  {
    site: 'doorDefinitionSchema.state',
    union: 'DoorState (src/simulation/navigation/door.ts:16)',
    members: unionMembers<DoorState>()(['open', 'closed', 'locked']),
    readerOnly: [],
  },
  {
    site: 'guardRecordSchema.deploymentPhase',
    union: 'DeploymentPhase (src/simulation/security/guard-roster.ts:19)',
    members: unionMembers<DeploymentPhase>()(['unassigned', 'travelling', 'on-post', 'on-search']),
    readerOnly: [],
  },
  {
    site: 'securitySectionSchema.sectorControlStates',
    union: 'SectorControlState (src/simulation/security/sector.ts:36)',
    members: unionMembers<SectorControlState>()(['normal', 'restricted', 'lockdown']),
    readerOnly: [],
  },
  {
    site: 'contrabandHolderSchema.kind',
    union: 'ContrabandHolderKind (src/simulation/contraband/item.ts:12)',
    members: unionMembers<ContrabandHolderKind>()(['prisoner', 'staff', 'cell', 'container']),
    readerOnly: [],
  },
  {
    site: 'contrabandProvenanceSchema.sourceType',
    union: 'ContrabandSourceType (src/simulation/contraband/item.ts:20)',
    members: unionMembers<ContrabandSourceType>()(['delivery', 'visit', 'staff', 'prisoner', 'room-object']),
    readerOnly: [],
  },
  {
    site: 'searchTargetSchema.holderKind',
    union: 'ContrabandHolderKind, via SearchTarget (src/simulation/contraband/search-policy.ts:8)',
    members: unionMembers<ContrabandHolderKind>()(['prisoner', 'staff', 'cell', 'container']),
    readerOnly: [],
  },
  {
    site: 'searchScopeSchema',
    union: 'SearchScope (src/simulation/contraband/search-policy.ts:4)',
    members: unionMembers<SearchScope>()(['person', 'cell', 'sector', 'delivery']),
    readerOnly: [],
  },
  {
    site: 'contrabandSectionSchema.state',
    union: 'ContrabandState (src/simulation/contraband/item.ts:47)',
    members: unionMembers<ContrabandState>()(['concealed', 'confiscated', 'departed']),
    readerOnly: [],
  },
  {
    site: 'contrabandSectionSchema.targetKind',
    union: 'IntelligenceTargetKind (src/simulation/contraband/intelligence.ts:10)',
    members: unionMembers<IntelligenceTargetKind>()(['prisoner', 'staff', 'cell', 'sector']),
    readerOnly: [],
  },
  {
    site: 'contrabandSectionSchema.sourceType',
    union: 'IntelligenceSourceType (src/simulation/contraband/intelligence.ts:12)',
    members: unionMembers<IntelligenceSourceType>()(['informant', 'observation', 'search-residue']),
    readerOnly: [],
  },
  {
    site: 'contrabandSectionSchema.holderKind',
    union: 'InformantHolderKind (src/simulation/contraband/informants.ts:4)',
    members: unionMembers<InformantHolderKind>()(['prisoner', 'staff']),
    readerOnly: [],
  },
  {
    site: 'incidentStateSchema',
    union: 'IncidentState (src/simulation/incidents/incident.ts:20)',
    members: unionMembers<IncidentState>()(['active', 'notified', 'responding', 'resolved', 'lapsed']),
    readerOnly: [],
  },
  {
    site: 'incidentsSectionSchema.type',
    union: 'IncidentType (src/simulation/incidents/incident.ts:6)',
    members: unionMembers<IncidentType>()(['assault', 'escape-attempt', 'riot', 'gang-retaliation']),
    readerOnly: [],
  },
  // The three below arrived with `simulation.inFlight` (issue #1373), which
  // carries resolved-and-uncollected routes, failures included, and each
  // active search job's leg state.
  {
    site: 'routeFailureReasonSchema',
    union: 'RouteFailureReason (src/simulation/navigation/route.ts:18)',
    members: unionMembers<RouteFailureReason>()(['invalid-origin', 'invalid-destination', 'unreachable', 'permission-denied']),
    readerOnly: [],
  },
  {
    site: 'doorAccessDenialReasonSchema',
    union: 'DoorAccessDenialReason (src/simulation/navigation/route-context.ts:18)',
    members: unionMembers<DoorAccessDenialReason>()(['locked', 'insufficient-clearance', 'missing-permission']),
    readerOnly: [],
  },
  {
    site: 'searchJobStateSchema',
    union: 'SearchJobState (src/simulation/contraband/search-system.ts:22)',
    members: unionMembers<SearchJobState>()(['travelling', 'searching']),
    readerOnly: [],
  },
];

/**
 * The enums `save-schema.ts` builds from an exported `as const` array instead
 * of a literal list.
 *
 * These cannot diverge at all: the union is `(typeof X)[number]` over the same
 * array the schema is handed, so one declaration feeds both sides and there is
 * nothing for a ledger to record. They are listed because the coverage
 * assertion below requires every `z.enum` in the file to be accounted for, and
 * because this is the shape that makes the rest of this file unnecessary --
 * the pattern to reach for when a new enum is added.
 */
const DERIVED_SITES: readonly { readonly site: string; readonly identifier: string; readonly module: string }[] = [
  {
    site: 'actorIdentitySnapshotSchema.kind',
    identifier: 'ACTOR_KINDS',
    module: 'src/simulation/identity/actor-identity.ts',
  },
  {
    site: 'regimeBlockSchema.allowedCategories',
    identifier: 'ACTION_CATEGORIES',
    module: 'src/simulation/prisoners/regime.ts',
  },
];

interface ParsedEnum {
  readonly site: string;
  readonly line: number;
  /** Literal members, or `undefined` when the enum is built from an identifier. */
  readonly members: readonly string[] | undefined;
  /** The identifier, when the enum is built from one. */
  readonly identifier: string | undefined;
}

/**
 * Every `z.enum(...)` in `save-schema.ts`, keyed `<declaration>.<field>`.
 *
 * Read off the file rather than from a hand-kept list, for the reason the
 * other reachability contracts in this directory give: a list maintained
 * beside the thing it describes is a second copy that can rot, and the failure
 * mode this issue is about is exactly a second copy rotting. Keyed by the
 * enclosing top-level declaration and the field rather than by `file:line`,
 * because a line number in a file under active edit is the least durable
 * citation available (`docs/AGENT_WORKFLOW.md` §4) and every one of these
 * would drift on an unrelated edit above it.
 */
function parseEnums(): readonly ParsedEnum[] {
  const source = readFileSync(SAVE_SCHEMA_PATH, 'utf8');
  const lines = source.split('\n');
  const pattern = /z\.enum\(\s*(\[[\s\S]*?\]|[A-Za-z_$][\w$]*)\s*\)/gu;
  const parsed: ParsedEnum[] = [];
  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    const line = source.slice(0, index).split('\n').length;
    const lineStart = source.lastIndexOf('\n', index - 1) + 1;
    const before = source.slice(lineStart, index);

    let declaration = '(file scope)';
    for (let cursor = line - 1; cursor >= 0; cursor -= 1) {
      const declared = /^(?:export\s+)?(?:const|function|class) ([A-Za-z_$][\w$]*)/u.exec(lines[cursor] ?? '');
      if (declared?.[1] !== undefined) {
        declaration = declared[1];
        break;
      }
    }

    const fields = [...before.matchAll(/([A-Za-z_$][\w$]*)\s*:/gu)];
    const field = fields.at(-1)?.[1];
    const site = field === undefined ? declaration : `${declaration}.${field}`;

    const raw = match[1] ?? '';
    const literal = raw.startsWith('[');
    parsed.push({
      site,
      line,
      members: literal ? [...raw.matchAll(/'([^']*)'/gu)].map((member) => member[1] ?? '') : undefined,
      identifier: literal ? undefined : raw,
    });
  }
  return parsed;
}

const PARSED = parseEnums();

function parsedFor(site: string): ParsedEnum {
  const found = PARSED.filter((entry) => entry.site === site);
  expect(found.map((entry) => entry.line), `exactly one z.enum should be keyed '${site}' in save-schema.ts`).toHaveLength(1);
  return found[0] as ParsedEnum;
}

describe('save-schema enum / union contract (#1225)', () => {
  it('finds every z.enum in save-schema.ts and keys each one uniquely', () => {
    expect(PARSED.length).toBeGreaterThan(0);
    const sites = PARSED.map((entry) => entry.site);
    expect([...new Set(sites)].sort()).toStrictEqual([...sites].sort());
  });

  it('accounts for every z.enum in the file, so a new one cannot be added unnoticed', () => {
    const accounted = [...PAIRS.map((pair) => pair.site), ...DERIVED_SITES.map((derived) => derived.site)].sort();
    expect(PARSED.map((entry) => entry.site).sort()).toStrictEqual(accounted);
  });

  /**
   * The assertion the issue is about. Subset, not equality: see the file
   * docblock for why equality is the wrong gate and what it would cost the
   * first time it fired.
   */
  it.each(PAIRS.map((pair) => [pair.site, pair] as const))('the reader at %s accepts every member of its union', (_site, pair) => {
    const parsed = parsedFor(pair.site);
    const enumMembers = parsed.members ?? [];
    const missing = pair.members.filter((member) => !enumMembers.includes(member));
    expect(
      missing,
      `${pair.union} has ${missing.length} member(s) the save reader refuses. A save carrying one is an unloadable prison: widen the z.enum at save-schema.ts:${parsed.line}, never narrow the union.`,
    ).toStrictEqual([]);
  });

  /**
   * The other direction, which is allowed and has to be named. An entry here
   * is a statement about save history, so it is checked for being specific
   * rather than merely present -- `docs/AGENT_WORKFLOW.md` §4's rule that a
   * sentence stating a subject outlasts one stating a tally.
   */
  it.each(PAIRS.map((pair) => [pair.site, pair] as const))(
    'every member the reader at %s accepts beyond its union is named with the build that wrote it',
    (_site, pair) => {
      const parsed = parsedFor(pair.site);
      const enumMembers = parsed.members ?? [];
      const beyond = enumMembers.filter((member) => !pair.members.includes(member)).sort();
      const ledgered = pair.readerOnly.map((entry) => entry.member).sort();
      expect(
        beyond,
        `the z.enum at save-schema.ts:${parsed.line} accepts ${JSON.stringify(beyond)} and ${pair.union} does not. That is legal -- a save carrying a retired member must still load -- but each one must be listed in readerOnly with the build that wrote it, so a phantom nothing ever wrote cannot hide among them.`,
      ).toStrictEqual(ledgered);
      for (const entry of pair.readerOnly) {
        expect(entry.writtenBy.length, `readerOnly '${entry.member}' at ${pair.site} needs the build that wrote it, not an empty note`).toBeGreaterThan(20);
      }
    },
  );

  it.each(DERIVED_SITES.map((derived) => [derived.site, derived] as const))(
    'the enum at %s is derived from one declaration and cannot diverge',
    (_site, derived) => {
      const parsed = parsedFor(derived.site);
      expect(parsed.identifier).toBe(derived.identifier);
      const module = readFileSync(resolve(REPOSITORY_ROOT, derived.module), 'utf8');
      expect(module).toContain(`export const ${derived.identifier} = [`);
      expect(module).toContain(`] as const;`);
      expect(module).toMatch(new RegExp(`export type [A-Za-z_$][\\w$]* = \\(typeof ${derived.identifier}\\)\\[number\\];`, 'u'));
    },
  );
});
