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
 * `sourceFile`/`declaration`/`form` are not documentation. The source
 * declaration is the authority and this table conforms to it:
 * `tests/unit/simulation-message-keys.test.ts` reads each declaration out
 * of the real source text (the technique
 * `tests/determinism/ambient-nondeterminism-contract.test.ts` already uses,
 * with the rules themselves living in
 * `tests/helpers/simulation-enum-source.ts`) and fails when
 * a declared value has no label here -- so a need or an incident type added
 * to the simulation cannot ship without a key. The same test scans
 * `src/simulation/` and `src/content/` for enum-shaped declarations that no
 * group covers, so a whole *new* enum cannot slip past either.
 *
 * ## What is deliberately not here
 *
 * Runtime-registered ids are not enum values and cannot be labelled from a
 * static table: `GangRegistry` accepts any `GangDefinition.id` a scenario
 * registers, so a gang's label has to come from the definition that created
 * it (a `nameKey` field, the way the content catalogs do it), not from
 * here. `docs/HUD_PROJECTIONS.md` gap 3 lists gang ids alongside the
 * enumerations for that reason -- they are the same *symptom*, but a
 * different fix.
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
  // -- Actors -------------------------------------------------------------
  {
    // Labelled rather than exempted. No projection emits `ActorKind` as a
    // field *yet* -- the prisoner roster and the staff roster are each
    // single-kind, so the distinction is currently carried by which panel
    // you are looking at. But it is a player-facing distinction, not
    // transport or diagnostic vocabulary: the moment any list mixes the two
    // populations it needs the word, and `contraband-holder-kind`,
    // `intelligence-target` and `informant-holder-kind` already label
    // exactly this distinction for their own value sets. An exemption here
    // would have to claim prisoner-vs-staff is never displayed, which is
    // not true. Its own namespace, so a key still says which enum it came
    // from -- the identity registry keys names by `(kind, entityId)`
    // because the two populations have separate `EntityStore`s that both
    // hand out id `0` (ADR 0015).
    namespace: 'actor-kind',
    sourceFile: 'src/simulation/identity/actor-identity.ts',
    declaration: 'ACTOR_KINDS',
    form: 'const-array',
    labels: { prisoner: 'Prisoner', staff: 'Staff' },
  },

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
      // Not "Free Association", which is the *category*'s label two groups
      // up. A roster cell says what the prisoner is doing, and repeating the
      // regime's own word for the block would make the two columns read as
      // the same fact; the shorter form is also what the wing calls it.
      'action.free-association': 'Association',
      // The job, not the room: a roster cell says what the prisoner is doing,
      // and `room.laundry.name` is already "Laundry" two catalogs over.
      'action.laundry-work': 'Laundry Duty',
      // Same rule as the line above, and the same shape: `room.kitchen.name`
      // is already "Kitchen" two catalogs over, so the cell says the job.
      // **This is the one new player-facing sentence issue #532 adds, and it
      // is a draft for the owner's review** -- no existing string in this file
      // fits (the `work` *category* label is "Work", which is what a roster
      // would say for laundry duty too, and `room.kitchen.name` names the
      // place rather than the activity).
      'action.kitchen-work': 'Kitchen Duty',
      // Same rule again -- the cell says the job, not the place -- and **the
      // owner confirmed this word on 2026-09-03**, shown it among candidates
      // and answering *"Errand"*. So this label is settled copy: of the three
      // sentences ADR 0093's *What is owed to the owner* reserves, it is the
      // first to be settled, and the other two are still owed.
      //
      // **It read the same word marked as provisional until that
      // confirmation, and what the marking said is kept rather than
      // overwritten** (`docs/AGENT_WORKFLOW.md` §4). It read: *"**this is a
      // draft for the owner's review, exactly as the line above it is.** ADR
      // 0093's section *What is owed to the owner* names the carry's label as
      // the first of three sentences it cannot write, and this file is not
      // where that reservation can be honoured by omission: the group above
      // declares `form: 'definition-id-field'` over `DEFAULT_ACTIONS`, and
      // `tests/unit/simulation-message-keys.test.ts` requires each namespace
      // to label *exactly* the ids its declaration declares. So an entry has
      // to exist for `action.carry` the moment the catalogue holds it, and the
      // choice is between a draft that is marked as one and a suite that
      // cannot go green."* Every word of that is still true of the mechanism;
      // what changed is that the entry is no longer provisional, so the string
      // does not move and the marking does. The line above it --
      // `action.kitchen-work` -- is still a draft, and the confirmation of
      // this one says nothing about it.
      //
      // "Errand" rather than "Carrying" (a phase, and `action-phase` already
      // labels three of those), "Haulage" (the trade, not the shift) or
      // "Delivery Duty" (which names the *purchase* a player made, and a carry
      // will not always be a delivery once other producers arrive). Those were
      // the alternatives put to the owner beside the chosen word.
      'action.carry': 'Errand',
      // The care, not the place: `room.infirmary.name` is already "Infirmary"
      // two catalogs over, which is the rule `action.laundry-work`,
      // `action.kitchen-work` and `action.carry` above already follow -- a
      // roster cell says what the prisoner is *doing*.
      //
      // **This is the one new player-facing string issue #589 adds, and it is
      // a draft for the owner's review** -- no existing string fits (the
      // `hygiene` *category* label is "Hygiene", which is what a roster would
      // say for a shower too). An entry has to exist the moment the catalogue
      // holds the action: the group above declares `form: 'definition-id-field'`
      // over `DEFAULT_ACTIONS` and `tests/unit/simulation-message-keys.test.ts`
      // requires each namespace to label *exactly* the ids its declaration
      // declares, so the choice is between a draft marked as one and a suite
      // that cannot go green -- the same bind `action.carry`'s note records.
      //
      // **What makes it TRUE, which is the half `AGENTS.md`'s fourth
      // reservation keeps.** The wording is this repository's since 2026-09-04;
      // that the sentence be true is the owner's. This one is shown by
      // `PrisonerActionViewModel` for the action a prisoner is *currently
      // performing*, and an action is only ever current after
      // `ActionSystem.resolveTargetInstance` answered it a real
      // `room.infirmary` instance with a free `medical-treatment` place and
      // `claimUseIfNeeded` took the claim. So "Treatment" appears exactly when
      // a prisoner is on a medical bed in an infirmary that exists. A prison
      // with no infirmary never shows it: the promotion in `planIdleSelection`
      // is gated on `prisonProvides`, the injured prisoner picks their
      // need-ranked candidate instead, and the cell says what they are really
      // doing. **No string anywhere claims a prisoner is being treated, or is
      // waiting to be, on the strength of the flag alone** -- which is why
      // #589 needs one sentence and no refusal beside it.
      'action.infirmary-treatment': 'Treatment',
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
      returning: 'Returning',
    },
    additionalIds: [
      {
        id: 'returning',
        reason:
          "`projectStaff` types a roster row's phase as `DisplayedDeploymentPhase` -- `DeploymentPhase | 'returning'` -- and derives this member rather than storing it (`src/simulation/security/deployment-phase.ts`). A guard restored from a save taken mid-journey settles on `'on-post'` while standing wherever the walk had got to, and `On Post` is an assertion about a tile it is not on; `Returning` is the word the owner chose for it. It is deliberately not a fifth `DeploymentPhase`: that union is persisted in every save under a `.strict()` schema and is read by the coverage census, both travel systems and the release service, none of which needs a new member to answer a question about one row's wording.",
      },
    ],
  },
  {
    // Labelled rather than exempted, unlike every refusal vocabulary beside it,
    // and the difference is what the words are *for*. A refusal is a sentence
    // about something that did not happen; this is a **label on a row** -- the
    // Staff panel's held-guards list says what is holding each guard, one dense
    // phrase per row, exactly as `deployment-phase` above labels the phase. ADR
    // 0034 is the decision it arrived with.
    //
    // `'unattributed'` is the one member worth naming here: it is an
    // `'on-search'` guard that neither `'on-search'` claimant names, which is
    // the residue ADR 0033 is about. It is a real state a player can see -- in
    // the window between loading a save taken during a response and that
    // system's next scheduled update -- so it needs a word rather than an
    // exemption, and the word says "nothing is holding this" rather than naming
    // a claimant that does not exist.
    namespace: 'guard-claim',
    sourceFile: 'src/simulation/security/guard-release.ts',
    declaration: 'GUARD_CLAIM_KINDS',
    form: 'const-array',
    labels: {
      deployment: 'Sector Post',
      'incident-response': 'Incident Response',
      search: 'Contraband Search',
      unattributed: 'Unclaimed',
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
    labels: { concealed: 'Concealed', confiscated: 'Confiscated', departed: 'Left With Holder' },
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
    // Where a build order has got to, and since the Build panel's queue block
    // these words are **on screen** rather than merely authored: five of the
    // eight are what a queued order's row says it is waiting for, resolved
    // through `deriveSimulationMessageKey('build-order-state', state)` from the
    // `state` on `BuildQueueOrderViewModel`.
    //
    // `assigned` was `'Assigned'` while nothing rendered any of these, and that
    // word does not survive being read by a player: an `assigned` order has its
    // materials and is waiting for the crew, and since #348 the crew is the
    // constraint -- one order in progress at a time -- so this is the state a
    // queue of eleven walls spends its whole wait in. "Assigned" names what the
    // simulation did to it; "Awaiting the crew" names what the player is waiting
    // for, which is the same distinction `'materials-pending'` already resolved
    // in favour of the player with "Awaiting Materials". The stable id is
    // untouched: it is persisted in `save-schema.ts` and a label is not an id
    // (ADR 0011).
    namespace: 'build-order-state',
    sourceFile: 'src/simulation/construction/build-order.ts',
    declaration: 'BuildOrderLifecycleState',
    form: 'string-union',
    labels: {
      planned: 'Planned',
      approved: 'Approved',
      'materials-pending': 'Awaiting Materials',
      assigned: 'Awaiting the Crew',
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
    // Labelled rather than exempted, and not marginally so: the HUD's Build
    // panel makes the player *choose* one of these before placing a wall
    // (#74), so an exemption would have to claim the value is never
    // displayed while a shipped panel displays it.
    //
    // Only two members, because only two exist to store: `SparseWorld` keeps
    // wall geometry in a `topEdge` and a `leftEdge` layer, and the other two
    // sides of a tile are already covered -- the south edge of `(x, y)` *is*
    // the north edge of `(x, y + 1)`. `door-side` above labels the same
    // geometry from the navigation side under its own storage names (`top`,
    // `left`); this group names it as a player picks it, by compass
    // direction. Both are correct for their caller, which is why they are
    // separate namespaces rather than one shared list.
    namespace: 'build-edge',
    sourceFile: 'src/simulation/construction/build-order.ts',
    declaration: 'BUILD_EDGES',
    form: 'const-array',
    labels: { north: 'North', west: 'West' },
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
    // **The one group whose ids are also named by a hand-authored key family,
    // and the two families disagreed on two of the seven labels.**
    //
    // `OBJECT_CATEGORY_NAME_KEYS` in `src/content/object-catalog.ts` maps the
    // same seven ids to `object.category.<id>.name`, and
    // `default-locale-en.ts` authors text for all seven. This group derives
    // `object-category.<id>.name`. The keys differ by one character -- a dot
    // where the other has a hyphen -- so `validateSimulationEnumGroups`'
    // `duplicate-key` check, which compares exact keys, cannot see them as
    // related, and both families land in the assembled `en` catalog. Measured
    // on `defaultLocaleEnCatalog` rather than inferred:
    //
    //     sanitation     authored="Plumbing"  derived="Sanitation"
    //     food-service   authored="Catering"  derived="Food Service"
    //
    // and the other five agreed. `tests/foundation/content-vocabulary-contract.test.ts`
    // now fails on any such pair, so the divergence is gated as a class rather
    // than corrected as two instances.
    //
    // **The authored family's copy is the one that wins, and this table's two
    // labels changed to match it -- not the other way round.** Three reasons,
    // in order of force:
    //
    //  1. It is the family with a consumer. `buildableCategory`
    //     (`src/main.ts:845`) renders
    //     `OBJECT_CATEGORY_NAME_KEYS[category]` in the Build panel's category
    //     filter. Nothing anywhere calls
    //     `deriveSimulationMessageKey('object-category', …)` -- the string
    //     `'object-category'` appears in no `src/` or `tests/` file outside
    //     this one -- so these seven derived keys reach no surface at all.
    //  2. Its copy is deliberate and argued. `default-locale-en.ts` records
    //     why `sanitation` reads "Plumbing" and `food-service` reads
    //     "Catering": the id names the *domain* while the option has to name
    //     the things in it, and a player hunting a shower head looks for
    //     plumbing. "Sanitation" and "Food Service" here were the id spelled
    //     with a capital letter, which is this table's default and is right
    //     for the other five.
    //  3. ADR 0035 §7 decided it, and is Accepted. Its table assigns "the
    //     seven category *names*" to `OBJECT_CATEGORY_NAME_KEYS`, "beside the
    //     schema that declares them", and it explicitly **rejects** the
    //     computed alternative: *"A convention computed at the call site --
    //     `object.category.${category}.name` -- type-checks against any
    //     string and would have shipped exactly that."* Deleting
    //     `OBJECT_CATEGORY_NAME_KEYS` in favour of
    //     `deriveSimulationMessageKey` is that rejected option, so it is an
    //     ADR amendment and not a cleanup.
    //
    // What agreement does **not** fix: there are still two places an object
    // category's English name is written, which is what this module's own
    // docblock exists to prevent ("the group table below is the single place
    // an enum value is declared"). Agreement makes the duplication harmless
    // and gated; it does not make it right. The architectural fix is to
    // exempt `objectCategorySchema` in this file's completeness test on ADR
    // 0035 §7's grounds -- the category name is content, and this table is the
    // wrong home for it -- which needs an edit to
    // `tests/unit/simulation-message-keys.test.ts`'s `UNLABELLED` list and a
    // line in ADR 0035. It is proposed rather than taken here.
    namespace: 'object-category',
    sourceFile: 'src/content/object-catalog.ts',
    declaration: 'objectCategorySchema',
    form: 'zod-enum',
    labels: {
      furniture: 'Furniture',
      sanitation: 'Plumbing',
      'food-service': 'Catering',
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

/**
 * Every stable id in one namespace, in the order this catalogue declares them.
 *
 * **The point of it is which module may ask.** A HUD panel that offers the
 * player a *choice* out of one of these vocabularies -- the Regime panel's
 * regime editor is the first, offering the seven `ActionCategory` members --
 * needs the whole vocabulary and not only the members the current projection
 * happens to carry, and it may not import `ACTION_CATEGORIES` itself: the HUD
 * imports nothing from `src/simulation/**` (`AGENTS.md` boundary 1, gated by
 * `tests/unit/ui-hud-messages.test.ts`). This module is already on the HUD's
 * side of that line and is already where the same panel derives each member's
 * label from, so the ids and the words come from one source rather than two.
 *
 * **It is a safe source rather than a convenient one**, and the reason is
 * `validateSimulationEnumGroups` below: a group's `labels` keys must agree
 * *exactly* with its `sourceFile`'s own declaration -- containment is not
 * enough, which is what `additionalIds` exists to make possible -- so a
 * category added to `ACTION_CATEGORIES` and not to this catalogue fails
 * `tests/foundation/content-vocabulary-contract.test.ts` rather than quietly
 * leaving a toggle off the panel.
 *
 * `additionalIds` are deliberately **not** included: they are ids the source
 * declaration does not hold, with a reason, and a control that offered one
 * would be offering a value the simulation's own vocabulary does not contain.
 */
export function simulationEnumIds(namespace: SimulationEnumNamespace): readonly string[] {
  const group = SIMULATION_ENUM_GROUPS.find((candidate) => candidate.namespace === namespace);
  return group === undefined ? [] : Object.keys(group.labels);
}

export type SimulationEnumGroupError =
  | { readonly kind: 'duplicate-namespace'; readonly namespace: string }
  | { readonly kind: 'duplicate-key'; readonly key: LocalizationKey }
  | { readonly kind: 'empty-label'; readonly namespace: string; readonly id: string }
  | { readonly kind: 'undeclared-additional-id'; readonly namespace: string; readonly id: string }
  | { readonly kind: 'unexplained-additional-id'; readonly namespace: string; readonly id: string };

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
      // An exemption from "the source declaration is the authority" has to
      // say why, or it is simply a way to switch the completeness check off
      // for one value.
      if (additional.reason.trim().length < 40) {
        errors.push({ kind: 'unexplained-additional-id', namespace: group.namespace, id: additional.id });
      }
    }
  }

  return errors;
}

const groupErrors = validateSimulationEnumGroups();
if (groupErrors.length > 0) {
  throw new Error(`Simulation enum message-key groups failed validation: ${JSON.stringify(groupErrors)}`);
}
