import type { LocalizationKey } from './localization';

/**
 * Message keys for the enumerations the simulation projects to the HUD.
 *
 * `docs/HUD_PROJECTIONS.md` gap 3: every HUD panel receives needs, action
 * ids, intake stages, classification groups, incident types and states,
 * deployment phases, search scopes, job states and the rest as *bare
 * stable ids* with nothing to render them as text. The room/object/item/
 * staff-role/grade/contraband catalogs each carry a `nameKey`; an enum has
 * no definition object to hang one on, so this module is where they live.
 *
 * ADR 0011's three namespaces stay separate exactly as before:
 *
 * | Namespace | Example | Owner |
 * | --- | --- | --- |
 * | stable id | `high-risk` | the simulation enum |
 * | message key | `classification-group.high-risk.name` | this module |
 * | translated text | "High Risk" | a locale catalog |
 *
 * ## The key-derivation rule
 *
 * A message key is **never hand-authored**. It is
 * `deriveSimulationMessageKey(namespace, id)`:
 *
 * 1. Qualify the stable id with its group's `namespace`, unless the id is
 *    already qualified with it (`action.sleep` under namespace `action`
 *    stays `action.sleep`, matching how `room.cell` becomes
 *    `room.cell.name` in the existing catalogs).
 * 2. Append `.name`.
 *
 * That is the same `nameKey` convention the content catalogs already use,
 * extended to values that have no definition object. Because every key in
 * this file is *computed* from the id, a key can never drift away from the
 * id it labels: renaming the id renames the key, and the pair is one edit.
 *
 * ## Why the English text lives here and not in `default-locale-en.ts`
 *
 * For a room, the id and the label are in different files because a room
 * definition has a dozen other attributes and its own schema. These enum
 * values have no definition at all -- the id, its source declaration and
 * its label are the entire record. Splitting them across two files would
 * reintroduce precisely the drift this module exists to prevent, so the
 * group table below is the single place an enum value is declared, and
 * `default-locale-en.ts` composes it into the assembled `en` catalog.
 *
 * ## Staying complete
 *
 * `sourceFile`/`declaration`/`form` are not documentation. The
 * `content-catalogs` test suite reads each declaration out of the real
 * source text (the technique `tests/determinism/ambient-nondeterminism-contract.test.ts`
 * already uses) and fails when a declared value has no label here -- so a
 * need or an incident type added to the simulation cannot ship without a
 * key. The same suite scans `src/simulation/` and `src/content/` for
 * enum-shaped declarations that no group covers, so a whole *new* enum
 * cannot slip past either.
 */

/** How a group's values are written in its source declaration. Each form has one extractor in the completeness test. */
export type SimulationEnumForm =
  /** `export const NAME = ['a', 'b'] as const;` */
  | 'const-array'
  /** `export type NAME = 'a' | 'b';` */
  | 'string-union'
  /** `export type NAME = 0 | 1;` */
  | 'numeric-union'
  /** `export const NAME = z.enum(['a', 'b']);` */
  | 'zod-enum'
  /** `export const NAME = z.discriminatedUnion('k', [...z.literal('a')...]);` */
  | 'zod-literal-union'
  /** `export const NAME: readonly Definition[] = [{ id: 'a', ... }];` */
  | 'definition-id-field';

export interface SimulationEnumGroup {
  /** Key namespace. Also the label a HUD uses to look one up: `deriveSimulationMessageKey('need', needId)`. */
  readonly namespace: string;
  /** Repository-relative path of the module that declares the values. */
  readonly sourceFile: string;
  /** Exported symbol in `sourceFile` holding the values. */
  readonly declaration: string;
  readonly form: SimulationEnumForm;
  /** Stable id -> default (`en`) label. Short, neutral, HUD-appropriate: these are dense panel labels, not prose. */
  readonly labels: Readonly<Record<string, string>>;
  /**
   * Ids that are *not* in the source declaration but are still projected,
   * with the reason. Keeping them explicit means the completeness test can
   * demand exact agreement with the source rather than mere containment.
   */
  readonly additionalIds?: readonly { readonly id: string; readonly reason: string }[];
}

export const SIMULATION_ENUM_GROUPS = [
  // -- Prisoners ----------------------------------------------------------
  {
    namespace: 'need',
    sourceFile: 'src/simulation/prisoners/needs.ts',
    declaration: 'NEED_IDS',
    form: 'const-array',
    labels: {
      hunger: 'Hunger',
      sleep: 'Sleep',
      hygiene: 'Hygiene',
      bladder: 'Bladder',
      safety: 'Safety',
      recreation: 'Recreation',
    },
  },
  {
    namespace: 'action-category',
    sourceFile: 'src/simulation/prisoners/regime.ts',
    declaration: 'ACTION_CATEGORIES',
    form: 'const-array',
    labels: {
      sleep: 'Sleep',
      meal: 'Meal',
      work: 'Work',
      recreation: 'Recreation',
      education: 'Education',
      hygiene: 'Hygiene',
      'free-association': 'Free Association',
    },
  },
  {
    namespace: 'action',
    sourceFile: 'src/simulation/prisoners/actions.ts',
    declaration: 'DEFAULT_ACTIONS',
    form: 'definition-id-field',
    labels: {
      'action.sleep': 'Sleeping',
      'action.eat-meal': 'Eating',
      'action.eat-in-cell': 'Eating in Cell',
      'action.use-toilet': 'Using Toilet',
      'action.shower': 'Showering',
      'action.yard-recreation': 'Yard Time',
      'action.common-room-recreation': 'Common Room',
      'action.classroom-education': 'Class',
    },
  },
  {
    namespace: 'action-phase',
    sourceFile: 'src/simulation/prisoners/components.ts',
    declaration: 'ACTION_PHASES',
    form: 'const-array',
    labels: { idle: 'Idle', travelling: 'Travelling', performing: 'Performing' },
  },
  {
    namespace: 'intake-stage',
    sourceFile: 'src/simulation/prisoners/components.ts',
    declaration: 'INTAKE_STAGES',
    form: 'const-array',
    labels: {
      queued: 'Queued',
      reception: 'Reception',
      classification: 'Classification',
      'accommodation-assignment': 'Cell Assignment',
      completed: 'Admitted',
      failed: 'Failed',
    },
  },
  {
    namespace: 'classification-group',
    sourceFile: 'src/simulation/prisoners/components.ts',
    declaration: 'CLASSIFICATION_GROUP_IDS',
    form: 'const-array',
    labels: { 'general-population': 'General Population', 'high-risk': 'High Risk' },
  },
  {
    // Numeric tiers, not slugs -- `RiskTier` is `0 | 1 | 2 | 3`. The key is
    // still derived, so `risk-tier.3.name` cannot drift from tier 3.
    namespace: 'risk-tier',
    sourceFile: 'src/simulation/prisoners/classification.ts',
    declaration: 'RiskTier',
    form: 'numeric-union',
    labels: { 0: 'Minimal', 1: 'Low', 2: 'Medium', 3: 'High' },
  },

  // -- Incidents ----------------------------------------------------------
  {
    namespace: 'incident-type',
    sourceFile: 'src/simulation/incidents/incident.ts',
    declaration: 'IncidentType',
    form: 'string-union',
    labels: {
      assault: 'Assault',
      'escape-attempt': 'Escape Attempt',
      riot: 'Riot',
      'gang-retaliation': 'Gang Retaliation',
    },
  },
  {
    namespace: 'incident-state',
    sourceFile: 'src/simulation/incidents/incident.ts',
    declaration: 'INCIDENT_STATES',
    form: 'const-array',
    labels: {
      active: 'Active',
      notified: 'Notified',
      responding: 'Responding',
      resolved: 'Resolved',
      lapsed: 'Lapsed',
    },
  },

  // -- Security -----------------------------------------------------------
  {
    namespace: 'deployment-phase',
    sourceFile: 'src/simulation/security/guard-roster.ts',
    declaration: 'DeploymentPhase',
    form: 'string-union',
    labels: {
      unassigned: 'Unassigned',
      travelling: 'Travelling',
      'on-post': 'On Post',
      'on-search': 'On Search',
    },
  },
  {
    namespace: 'sector-control-state',
    sourceFile: 'src/simulation/security/sector.ts',
    declaration: 'SectorControlState',
    form: 'string-union',
    labels: { normal: 'Normal', restricted: 'Restricted', lockdown: 'Lockdown' },
  },
  {
    namespace: 'door-state',
    sourceFile: 'src/simulation/navigation/door.ts',
    declaration: 'DoorState',
    form: 'string-union',
    labels: { open: 'Open', closed: 'Closed', locked: 'Locked' },
  },
  {
    namespace: 'door-side',
    sourceFile: 'src/simulation/navigation/door.ts',
    declaration: 'DoorSide',
    form: 'string-union',
    labels: { left: 'Left', top: 'Top' },
  },
  {
    namespace: 'door-access-denial',
    sourceFile: 'src/simulation/navigation/route-context.ts',
    declaration: 'DoorAccessDenialReason',
    form: 'string-union',
    labels: {
      locked: 'Locked',
      'insufficient-clearance': 'Insufficient Clearance',
      'missing-permission': 'Missing Permission',
    },
  },
  {
    namespace: 'route-failure',
    sourceFile: 'src/simulation/navigation/route.ts',
    declaration: 'RouteFailureReason',
    form: 'string-union',
    labels: {
      'invalid-origin': 'Invalid Start',
      'invalid-destination': 'Invalid Destination',
      unreachable: 'Unreachable',
      'permission-denied': 'Access Denied',
    },
  },
  {
    namespace: 'worker-state',
    sourceFile: 'src/simulation/worker/state-machine.ts',
    declaration: 'WorkerState',
    form: 'string-union',
    labels: {
      uninitialized: 'Not Started',
      ready: 'Ready',
      running: 'Running',
      paused: 'Paused',
      'shutting-down': 'Shutting Down',
      faulted: 'Faulted',
    },
  },

  // -- Contraband ---------------------------------------------------------
  {
    namespace: 'search-scope',
    sourceFile: 'src/simulation/contraband/search-policy.ts',
    declaration: 'SearchScope',
    form: 'string-union',
    labels: { person: 'Person', cell: 'Cell', sector: 'Sector', delivery: 'Delivery' },
  },
  {
    namespace: 'search-order-state',
    sourceFile: 'src/simulation/contraband/search-system.ts',
    declaration: 'SearchJobState',
    form: 'string-union',
    labels: { queued: 'Queued', travelling: 'Travelling', searching: 'Searching' },
    additionalIds: [
      {
        id: 'queued',
        reason:
          "`projectContrabandOverview` types a search order's state as `'queued' | SearchJobState`: an order accepted but not yet assigned a guard has no job record, and the HUD still has to label the row.",
      },
    ],
  },
  {
    namespace: 'contraband-holder-kind',
    sourceFile: 'src/simulation/contraband/item.ts',
    declaration: 'ContrabandHolderKind',
    form: 'string-union',
    labels: { prisoner: 'Prisoner', staff: 'Staff', cell: 'Cell', container: 'Container' },
  },
  {
    namespace: 'contraband-source',
    sourceFile: 'src/simulation/contraband/item.ts',
    declaration: 'ContrabandSourceType',
    form: 'string-union',
    labels: {
      delivery: 'Delivery',
      visit: 'Visit',
      staff: 'Staff',
      prisoner: 'Prisoner',
      'room-object': 'Room Object',
    },
  },
  {
    namespace: 'contraband-state',
    sourceFile: 'src/simulation/contraband/item.ts',
    declaration: 'ContrabandState',
    form: 'string-union',
    labels: { concealed: 'Concealed', confiscated: 'Confiscated' },
  },
  {
    namespace: 'intelligence-target',
    sourceFile: 'src/simulation/contraband/intelligence.ts',
    declaration: 'IntelligenceTargetKind',
    form: 'string-union',
    labels: { prisoner: 'Prisoner', staff: 'Staff', cell: 'Cell', sector: 'Sector' },
  },
  {
    namespace: 'intelligence-source',
    sourceFile: 'src/simulation/contraband/intelligence.ts',
    declaration: 'IntelligenceSourceType',
    form: 'string-union',
    labels: { informant: 'Informant', observation: 'Observation', 'search-residue': 'Search Residue' },
  },
  {
    namespace: 'informant-holder-kind',
    sourceFile: 'src/simulation/contraband/informants.ts',
    declaration: 'InformantHolderKind',
    form: 'string-union',
    labels: { prisoner: 'Prisoner', staff: 'Staff' },
  },

  // -- Operations and construction ---------------------------------------
  {
    namespace: 'job-state',
    sourceFile: 'src/simulation/operations/job.ts',
    declaration: 'JobLifecycleState',
    form: 'string-union',
    labels: {
      available: 'Available',
      reserved: 'Reserved',
      assigned: 'Assigned',
      travelling: 'Travelling',
      performing: 'Working',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    },
  },
  {
    namespace: 'carry-leg',
    sourceFile: 'src/simulation/operations/job.ts',
    declaration: 'CarryLeg',
    form: 'string-union',
    labels: { pickup: 'Pickup', dropoff: 'Drop-off' },
  },
  {
    namespace: 'build-order-state',
    sourceFile: 'src/simulation/construction/build-order.ts',
    declaration: 'BuildOrderLifecycleState',
    form: 'string-union',
    labels: {
      planned: 'Planned',
      approved: 'Approved',
      'materials-pending': 'Awaiting Materials',
      assigned: 'Assigned',
      'in-progress': 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
      failed: 'Failed',
    },
  },
  {
    namespace: 'buildable-category',
    sourceFile: 'src/simulation/construction/definition.ts',
    declaration: 'BuildableCategory',
    form: 'string-union',
    labels: { wall: 'Wall', object: 'Object', utility: 'Utility' },
  },
  {
    namespace: 'utility-type',
    sourceFile: 'src/simulation/operations/utility-network.ts',
    declaration: 'UtilityType',
    form: 'string-union',
    labels: { electricity: 'Electricity', water: 'Water' },
  },
  {
    namespace: 'utility-node-kind',
    sourceFile: 'src/simulation/operations/utility-network.ts',
    declaration: 'UtilityNodeKind',
    form: 'string-union',
    labels: { producer: 'Producer', consumer: 'Consumer' },
  },
  {
    namespace: 'utility-node-state',
    sourceFile: 'src/simulation/operations/utility-network.ts',
    declaration: 'UtilityNodeState',
    form: 'string-union',
    labels: {
      powered: 'Powered',
      'disabled-no-supply': 'No Supply',
      'disabled-failure': 'Fault',
    },
  },

  // -- World and rooms ----------------------------------------------------
  {
    namespace: 'chunk-lifecycle',
    sourceFile: 'src/simulation/world/sparse-world.ts',
    declaration: 'ChunkLifecycle',
    form: 'string-union',
    labels: { 'metadata-only': 'Not Loaded', loaded: 'Loaded' },
  },
  {
    namespace: 'room-requirement',
    sourceFile: 'src/content/room-catalog.ts',
    declaration: 'roomRequirementSchema',
    form: 'zod-literal-union',
    labels: {
      enclosed: 'Enclosed',
      outdoors: 'Outdoors',
      'minimum-size': 'Minimum Size',
      object: 'Required Object',
    },
  },
  {
    namespace: 'room-requirement-status',
    sourceFile: 'src/simulation/presentation/room-projection.ts',
    declaration: 'RoomRequirementStatus',
    form: 'string-union',
    labels: {
      'satisfied-by-capability': 'Satisfied',
      'missing-capability': 'Missing',
      'not-evaluated': 'Not Evaluated',
    },
  },

  // -- Content categories the projections group by ------------------------
  {
    namespace: 'room-category',
    sourceFile: 'src/content/room-catalog.ts',
    declaration: 'roomCategorySchema',
    form: 'zod-enum',
    labels: {
      housing: 'Housing',
      security: 'Security',
      operations: 'Operations',
      food: 'Food',
      hygiene: 'Hygiene',
      recreation: 'Recreation',
      education: 'Education',
      medical: 'Medical',
      administration: 'Administration',
      logistics: 'Logistics',
      utility: 'Utility',
    },
  },
  {
    namespace: 'object-category',
    sourceFile: 'src/content/object-catalog.ts',
    declaration: 'objectCategorySchema',
    form: 'zod-enum',
    labels: {
      furniture: 'Furniture',
      sanitation: 'Sanitation',
      'food-service': 'Food Service',
      security: 'Security',
      storage: 'Storage',
      utility: 'Utility',
      medical: 'Medical',
    },
  },
  {
    namespace: 'item-category',
    sourceFile: 'src/content/item-catalog.ts',
    declaration: 'itemCategorySchema',
    form: 'zod-enum',
    labels: {
      'construction-material': 'Construction Material',
      food: 'Food',
      linen: 'Linen',
      waste: 'Waste',
    },
  },
  {
    namespace: 'staff-department',
    sourceFile: 'src/content/staff-role-catalog.ts',
    declaration: 'staffDepartmentSchema',
    form: 'zod-enum',
    labels: {
      administration: 'Administration',
      security: 'Security',
      medical: 'Medical',
      operations: 'Operations',
    },
  },
  {
    namespace: 'contraband-legal-context',
    sourceFile: 'src/content/contraband-catalog.ts',
    declaration: 'contrabandLegalContextSchema',
    form: 'zod-enum',
    labels: { illicit: 'Illicit', restricted: 'Restricted', controlled: 'Controlled' },
  },
] as const satisfies readonly SimulationEnumGroup[];

export type SimulationEnumNamespace = (typeof SIMULATION_ENUM_GROUPS)[number]['namespace'];

/**
 * The one mechanical rule (see the module comment). Exported so the HUD
 * derives a key the same way the catalog built it, instead of
 * concatenating strings at the call site.
 */
export function deriveSimulationMessageKey(namespace: SimulationEnumNamespace, id: string | number): LocalizationKey {
  const stableId = String(id);
  const qualified = stableId === namespace || stableId.startsWith(`${namespace}.`) ? stableId : `${namespace}.${stableId}`;
  return `${qualified}.name`;
}

/** Every derived key with its default (`en`) text, for `default-locale-en.ts` to compose into the assembled catalog. */
export function simulationEnumMessages(): Readonly<Record<LocalizationKey, string>> {
  const messages: Record<LocalizationKey, string> = {};
  for (const group of SIMULATION_ENUM_GROUPS) {
    for (const [id, text] of Object.entries(group.labels)) {
      messages[deriveSimulationMessageKey(group.namespace, id)] = text;
    }
  }
  return messages;
}

/** Every key this module declares, in derivation order. */
export function simulationEnumMessageKeys(): readonly LocalizationKey[] {
  return Object.keys(simulationEnumMessages());
}

export type SimulationEnumGroupError =
  | { readonly kind: 'duplicate-namespace'; readonly namespace: string }
  | { readonly kind: 'duplicate-key'; readonly key: LocalizationKey }
  | { readonly kind: 'empty-label'; readonly namespace: string; readonly id: string }
  | { readonly kind: 'undeclared-additional-id'; readonly namespace: string; readonly id: string };

/**
 * Self-validation of the group table, in the same spirit as each catalog
 * module's own duplicate/schema check: two groups sharing a namespace
 * would silently overwrite each other's labels, and a blank label would
 * render as nothing at all rather than as a visible missing key.
 */
export function validateSimulationEnumGroups(
  groups: readonly SimulationEnumGroup[] = SIMULATION_ENUM_GROUPS,
): readonly SimulationEnumGroupError[] {
  const errors: SimulationEnumGroupError[] = [];
  const seenNamespaces = new Set<string>();
  const seenKeys = new Set<string>();

  for (const group of groups) {
    if (seenNamespaces.has(group.namespace)) errors.push({ kind: 'duplicate-namespace', namespace: group.namespace });
    seenNamespaces.add(group.namespace);

    for (const [id, text] of Object.entries(group.labels)) {
      if (text.trim().length === 0) errors.push({ kind: 'empty-label', namespace: group.namespace, id });
      const key = deriveSimulationMessageKey(group.namespace as SimulationEnumNamespace, id);
      if (seenKeys.has(key)) errors.push({ kind: 'duplicate-key', key });
      seenKeys.add(key);
    }

    for (const additional of group.additionalIds ?? []) {
      if (!Object.hasOwn(group.labels, additional.id)) {
        errors.push({ kind: 'undeclared-additional-id', namespace: group.namespace, id: additional.id });
      }
    }
  }

  return errors;
}

const groupErrors = validateSimulationEnumGroups();
if (groupErrors.length > 0) {
  throw new Error(`Simulation enum message-key groups failed validation: ${JSON.stringify(groupErrors)}`);
}
