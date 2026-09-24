import type { JsonValue } from '../../shared/json';
import {
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  WORLD_RENDER_SNAPSHOT_SCHEMA_ID,
  WORLD_RENDER_SNAPSHOT_SCHEMA_VERSION,
  projectBuildQueue,
  projectContraband,
  projectHeldGuards,
  projectIncidentDetail,
  projectIncidents,
  projectPrisonerDetail,
  projectPrisonerPopulationCounts,
  projectPendingDeliveries,
  projectPrisonerRoster,
  projectRoomDetail,
  projectRoomList,
  projectSecurity,
  projectStaff,
  projectStatusStrip,
  projectWorldForRendering,
  type ViewModelPage,
} from '../presentation';
import { HUD_VIEW_MODEL_SCHEMA_ID } from '../presentation/view-model';
import type { EntityId } from '../entity/entity-store';
import { PROJECTION_IDS, type ProjectionId, type ProjectionTarget } from '../protocol/types';
import type { SimulationRuntime } from '../runtime/new-session';

/**
 * Which registry of a real session answers which read model.
 *
 * `src/simulation/presentation/` deliberately takes narrow, per-projection
 * source shapes so a test can drive one projection without standing up the
 * session graph. Something still has to know that `PrisonerOperationsRuntime`
 * answers both the prisoner source *and* the room source, that the door
 * registry lives on the navigation system, and that the two incident systems
 * are the metric sources -- and that is worker-shell knowledge rather than
 * projection knowledge. `status-counts.ts` already established that this is
 * where it lives; this file is the same idea for the other eleven, which is
 * what keeps ADR 0003 decision 12 ("the worker adapter must remain thin")
 * true of the state machine while eleven projections become reachable.
 *
 * ## Why one catalog instead of eleven more messages
 *
 * Issue #104 was filed against a shape, not a shortage: two projections had
 * reached the interface and each had arrived as **its own message kind**, so
 * the remaining nine were nine more protocol changes away. A third, fourth
 * and fifth bespoke kind would have made the protocol grow with the read
 * model rather than with the boundary. Here the protocol grows once -- one
 * request kind, one reply kind -- and the *catalog* grows with the read
 * model, in a `Record<ProjectionId, ...>` that does not compile until a newly
 * declared id has an entry.
 *
 * That compile error is the first of the two gates behind #104's "the next
 * projection must not be silently unreachable". The second is
 * `tests/contract/worker-projection-channel.test.ts`, which drives every
 * declared id through a real state machine, because a `Record` can be
 * satisfied by an entry that throws.
 *
 * ## A read, and only a read
 *
 * Every function called from here is a pure projection over the registries it
 * is handed (`docs/HUD_PROJECTIONS.md` contract 1). Nothing in this file calls
 * the kernel, steps a system, advances a clock or writes to simulation state,
 * which is what keeps ADR 0009's determinism guarantee intact while panels
 * read:  `tests/determinism/projection-request.test.ts` requires sixty ticks
 * driven through the real worker *with every projection requested on every
 * wake* to end byte-identical to the same sixty ticks with none requested.
 *
 * `tick` is passed in rather than read off `runtime.kernel`, matching
 * `status-counts.ts`: the caller decides which tick the readout is about, and
 * the same value is what stamps the reply.
 *
 * ## What the catalog deliberately does not supply
 *
 * `RoomProjectionOptions.sectorIdByRoomInstanceId` is left absent, so a room's
 * security grade is absent rather than guessed. The simulation has no
 * room-instance-to-sector mapping at all -- `room-projection.ts` says so at
 * length -- and inventing a spatial containment rule *here*, in the wiring,
 * would be the worst place in the repository to decide it.
 *
 * `RoomProjectionOptions.placedObjects` **is** supplied, and it is the one
 * option this file passes. There the spatial rule is not invented here: ADR 0028
 * decision 2 already states it (an object belongs to the room whose rectangle
 * contains its anchor), `roomContains` implements it, and the projection reads
 * that. Without it every `object` requirement falls back to the room's
 * capability list and ignores its authored `minQuantity`, which is issue #528 --
 * a canteen with one dining table and one bench reading finished.
 */

/** What one request asks for, after the boundary has validated it. */
export interface ProjectionRequest {
  readonly offset?: number;
  readonly limit?: number;
  readonly target?: ProjectionTarget;
}

/** The window a paged projection built, echoed onto the reply envelope. */
export interface ProjectionPage {
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}

export interface ProjectionResult {
  /** Absent when a detail projection was asked about a target that does not exist. */
  readonly view?: JsonValue;
  /** Absent on a projection with no list in it. */
  readonly page?: ProjectionPage;
}

/** What a request may name, and what the worker rejects when it names the wrong thing. */
export type ProjectionTargetKind = 'none' | 'entity' | 'id';

export interface ProjectionCatalogEntry {
  /**
   * The read model's own schema identity, carried on the reply's
   * `versionedPayload` so the view-model shape can evolve without an
   * envelope-version change (ADR 0003 decision 5).
   *
   * `HUD_VIEW_MODEL_SCHEMA_VERSION` is one number covering every projection
   * in `src/simulation/presentation/`, which is a known limitation of that
   * constant rather than a claim that these eleven versions move together --
   * `statusCountsSchema` records the same caveat. The world render snapshot
   * has a version of its own and uses it.
   */
  readonly schemaId: string;
  readonly schemaVersion: number;
  /** Whether `offset`/`limit` mean anything here. A page request on a `false` entry is refused. */
  readonly paged: boolean;
  /** What a request must name. A request naming something else is refused. */
  readonly target: ProjectionTargetKind;
  project(runtime: SimulationRuntime, tick: number, request: ProjectionRequest): ProjectionResult;
}

/** The page block of a `ViewModelPage`, without its rows. */
function pageOfView(page: ViewModelPage<unknown>): ProjectionPage {
  return { total: page.total, offset: page.offset, limit: page.limit };
}

/**
 * The `PageRequest` a projection takes, built only from what was actually
 * asked for.
 *
 * Spread rather than passed as `undefined`, because `exactOptionalPropertyTypes`
 * is on and because `resolvePageRequest` distinguishes an absent `limit` (use
 * `DEFAULT_VIEW_MODEL_PAGE_LIMIT`) from a present `0` (build no rows).
 */
function pageRequest(request: ProjectionRequest): { readonly offset?: number; readonly limit?: number } {
  return {
    ...(request.offset === undefined ? {} : { offset: request.offset }),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  };
}

/**
 * The entity id a detail request named.
 *
 * The state machine has already rejected a request whose target kind does not
 * match the entry's declaration, so reaching this with anything else is a
 * programming error in this file rather than a bad message -- which is why it
 * throws instead of returning a fault: an unhandled throw inside the worker
 * is reported as `internal-error`, and that is the honest classification.
 */
function entityTarget(request: ProjectionRequest): EntityId {
  const { target } = request;
  if (target?.kind !== 'entity') throw new TypeError('This projection requires an entity target.');
  return target.entityId as EntityId;
}

function idTarget(request: ProjectionRequest): string {
  const { target } = request;
  if (target?.kind !== 'id') throw new TypeError('This projection requires an id target.');
  return target.id;
}

/**
 * The status strip's own source, shared with `status-counts.ts`'s timer
 * publication so the pull route and the push route cannot answer differently.
 */
function statusStripSource(runtime: SimulationRuntime, tick: number) {
  return {
    tick,
    // `PrisonerOperationsRuntime` owns the room-instance registry, so it
    // answers both the prisoner source and the room source.
    prisoners: runtime.prisoners,
    labourCredit: runtime.labourCredit,
    workOutput: runtime.prisoners.workOutput,
    rooms: runtime.prisoners,
    // The session's timetables rather than the module constant this source
    // previously left `projectStatusStrip` to default to
    // ([ADR 0113](../../../docs/adr/0113-how-a-regime-is-edited-and-whose-day-it-is.md)
    // §6). Without this line the panel would keep reporting
    // `DEFAULT_REGIME_SCHEDULES` after an `EditRegimeBlock` had changed the day
    // the prisoners actually run -- a projection stating something the
    // simulation had stopped doing.
    regimeSchedules: runtime.prisoners.regimes.all(),
    staff: runtime.securityGuards,
    incidents: runtime.incidents,
    searchSystem: runtime.searchSystem,
    treasury: runtime.treasury,
  } as const;
}

const hud = (schemaId: string): Pick<ProjectionCatalogEntry, 'schemaId' | 'schemaVersion'> => ({
  schemaId,
  schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
});

/**
 * Every declared projection, bound to the session state that answers it.
 *
 * A `Record` over `ProjectionId` rather than a `Map` built at runtime,
 * because that makes it **exhaustive at compile time**: an id added to
 * `PROJECTION_IDS` fails to compile here until somebody decides which
 * registry answers it. That is the property #104 asked for -- "the next
 * projection cannot silently be unreachable" -- expressed in the type system
 * rather than only in a test.
 */
export const PROJECTION_CATALOG: Readonly<Record<ProjectionId, ProjectionCatalogEntry>> = {
  'hud/status-strip': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.status-strip`),
    paged: false,
    target: 'none',
    project: (runtime, tick) => ({ view: projectStatusStrip(statusStripSource(runtime, tick)) as unknown as JsonValue }),
  },

  /**
   * What is still waiting to be built.
   *
   * `runtime.construction` is the one `ConstructionSystem` a session has, so
   * this is the queue the crew is actually working through rather than a second
   * view of it. Paged, because a queue has no ceiling: a drag along thirty tiles
   * is thirty orders, and `docs/HUD_PROJECTIONS.md` contract 5 puts the window
   * in the caller's hands with `MAX_PROJECTION_PAGE_LIMIT` as the ceiling.
   */
  'hud/build-queue': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.build-queue`),
    paged: true,
    target: 'none',
    project: (runtime, _tick, request) => {
      const view = projectBuildQueue(runtime.construction, pageRequest(request), runtime.justInTimeMaterials);
      return { view: view as unknown as JsonValue, page: pageOfView(view.orders) };
    },
  },

  /*
   * What has been bought and has not arrived (#285).
   *
   * `runtime.procurement` is the source and it needs no adapter: the projection
   * takes `{ pendingDeliveries }` and `ProcurementSystem` already exposes exactly
   * that as a public accessor over the list `snapshot`/`restore` carry. So this
   * entry reads state a V5 save has always held, which is why the surface behind
   * it moves no persisted shape and bumps no save version.
   *
   * `paged: true` for the reason the build queue is: a player can press Buy as
   * often as the treasury allows, so the list has no ceiling and the window is
   * the caller's, bounded by `MAX_PROJECTION_PAGE_LIMIT` at the protocol edge.
   */
  'hud/pending-deliveries': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.pending-deliveries`),
    paged: true,
    target: 'none',
    project: (runtime, _tick, request) => {
      const view = projectPendingDeliveries(runtime.procurement, pageRequest(request));
      return { view: view as unknown as JsonValue, page: pageOfView(view.deliveries) };
    },
  },

  /**
   * ADR 0034's read model: which guards are held, and by what.
   *
   * `runtime.guardRelease` is handed in as the claim resolver rather than the
   * projection re-deriving the claim, and that is the point of the entry rather
   * than a convenience -- the row and the `ReleaseGuardAssignment` that aims at
   * it must resolve "what is holding this guard" by one rule, and
   * `GuardReleaseService.claimOf` is that rule.
   *
   * `paged: true` for `hud/pending-deliveries`' reason: the roster has no
   * ceiling short of `GuardRoster`'s capacity, so the window is the caller's,
   * bounded by `MAX_PROJECTION_PAGE_LIMIT` at the protocol edge.
   */
  'hud/held-guards': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.held-guards`),
    paged: true,
    target: 'none',
    project: (runtime, _tick, request) => {
      const view = projectHeldGuards(
        { staff: runtime.securityGuards, claims: runtime.guardRelease },
        pageRequest(request),
        { identity: runtime.actorIdentity },
      );
      return { view: view as unknown as JsonValue, page: pageOfView(view.held) };
    },
  },

  'hud/prisoner-population': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.prisoner-population`),
    paged: false,
    target: 'none',
    project: (runtime) => ({
      view: {
        ...projectPrisonerPopulationCounts(runtime.prisoners),
        intakeCandidates: runtime.intakeCandidates.snapshot().candidates,
      } as unknown as JsonValue,
    }),
  },

  'hud/prisoner-roster': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.prisoner-roster`),
    paged: true,
    target: 'none',
    project: (runtime, _tick, request) => {
      const page = projectPrisonerRoster(runtime.prisoners, pageRequest(request), {
        gangs: runtime.gangs,
        identity: runtime.actorIdentity,
      });
      return { view: page as unknown as JsonValue, page: pageOfView(page) };
    },
  },

  'hud/prisoner-detail': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.prisoner-detail`),
    paged: false,
    target: 'entity',
    project: (runtime, _tick, request) => {
      const detail = projectPrisonerDetail(runtime.prisoners, entityTarget(request), {
        gangs: runtime.gangs,
        identity: runtime.actorIdentity,
      });
      // Absent, not an error: a prisoner released between the click and the
      // reply is a race the UI handles, not a protocol fault.
      return detail === undefined ? {} : { view: detail as unknown as JsonValue };
    },
  },

  'hud/room-list': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.room-list`),
    paged: true,
    target: 'none',
    project: (runtime, _tick, request) => {
      const view = projectRoomList(runtime.prisoners, pageRequest(request), {
        placedObjects: runtime.placedObjects,
        // The world's edge layers, the session's own door registry and the
        // region partition built from both, so a row can say whether anybody
        // can get into the room (#938, and ADR 0108 for the third). All three
        // come from the runtime rather than from a copy: `navigation.doors` is
        // the registry the router, the caches and `doorsSnapshot` all read
        // (`runtime/new-session.ts` says why there is only one) and
        // `getGraph()` is the graph the router routes over, so the panel's
        // answer and the walk's answer cannot disagree.
        perimeter: {
          edges: runtime.world,
          doors: runtime.navigation.doors,
          regions: runtime.navigation.getGraph(),
        },
      });
      return { view: view as unknown as JsonValue, page: pageOfView(view.rooms) };
    },
  },

  'hud/room-detail': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.room-detail`),
    paged: false,
    target: 'id',
    project: (runtime, _tick, request) => {
      const detail = projectRoomDetail(runtime.prisoners, idTarget(request), {
        placedObjects: runtime.placedObjects,
        // The list's reason, and it has to be all three: the needs readout
        // asks for the list and then for one detail per unfinished room, so a
        // detail that could not answer this would drop the fact between the
        // two requests.
        perimeter: {
          edges: runtime.world,
          doors: runtime.navigation.doors,
          regions: runtime.navigation.getGraph(),
        },
      });
      return detail === undefined ? {} : { view: detail as unknown as JsonValue };
    },
  },

  'hud/staff': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.staff`),
    paged: true,
    target: 'none',
    project: (runtime, tick, request) => {
      const view = projectStaff(
        {
          staff: runtime.securityGuards,
          response: runtime.incidentResponseSystem,
          deployment: runtime.deploymentSystem,
          patrol: runtime.patrolSystem,
          // Post tiles, so a row can say `Returning` instead of asserting a
          // post the guard is not standing on. The same registry
          // `hud/security` below reads, and the one the deployment system
          // routes against, so the panel and the walk cannot disagree.
          sectors: runtime.securitySectors,
        },
        tick,
        pageRequest(request),
        { identity: runtime.actorIdentity },
      );
      return { view: view as unknown as JsonValue, page: pageOfView(view.roster) };
    },
  },

  'hud/security': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.security`),
    paged: false,
    target: 'none',
    project: (runtime, tick) => ({
      view: projectSecurity(
        {
          sectors: runtime.securitySectors,
          // The navigation system owns the only `DoorRegistry` in a session
          // (`new-session.ts` hands the same one to `SecuritySectorRegistry`),
          // so this is the registry the sectors' own door ids resolve against
          // rather than a second view of them.
          doors: runtime.navigation.doors,
          staff: runtime.securityGuards,
          deployment: runtime.deploymentSystem,
          patrol: runtime.patrolSystem,
          incidents: runtime.incidents,
        },
        tick,
      ) as unknown as JsonValue,
    }),
  },

  'hud/contraband': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.contraband`),
    paged: true,
    target: 'none',
    project: (runtime, _tick, request) => {
      const view = projectContraband(
        {
          searchSystem: runtime.searchSystem,
          // `all()`, never `drain()`. #157 finding 2's first bullet: draining
          // here would blank the panel and discard the evidence it is
          // reporting. `ContrabandConfiscationSource` types the non-consuming
          // accessor, so this is checked rather than merely intended.
          confiscations: runtime.confiscations,
          intelligence: runtime.intelligence,
          informants: runtime.informants,
          searchPolicies: runtime.searchPolicies,
        },
        pageRequest(request),
      );
      return { view: view as unknown as JsonValue, page: pageOfView(view.discovered) };
    },
  },

  'hud/incidents': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.incidents`),
    paged: true,
    target: 'none',
    project: (runtime, tick, request) => {
      const view = projectIncidents(
        {
          incidents: runtime.incidents,
          trigger: runtime.incidentTriggerSystem,
          response: runtime.incidentResponseSystem,
          // The same registry `hud/security` reads above, so the grade word a
          // row prints and the grade word the sectors block prints are the
          // same lookup rather than two.
          sectors: runtime.securitySectors,
        },
        tick,
        pageRequest(request),
      );
      return { view: view as unknown as JsonValue, page: pageOfView(view.resolved) };
    },
  },

  'hud/incident-detail': {
    ...hud(`${HUD_VIEW_MODEL_SCHEMA_ID}.incident-detail`),
    paged: false,
    target: 'id',
    project: (runtime, tick, request) => {
      const detail = projectIncidentDetail(
        { incidents: runtime.incidents, response: runtime.incidentResponseSystem, sectors: runtime.securitySectors },
        idTarget(request),
        tick,
      );
      return detail === undefined ? {} : { view: detail as unknown as JsonValue };
    },
  },

  'world/render-snapshot': {
    schemaId: WORLD_RENDER_SNAPSHOT_SCHEMA_ID,
    // Its own version, not the HUD's: this projection predates the read-model
    // layer and versions independently of it.
    schemaVersion: WORLD_RENDER_SNAPSHOT_SCHEMA_VERSION,
    paged: false,
    target: 'none',
    project: (runtime) => ({ view: projectWorldForRendering(runtime.world) as unknown as JsonValue }),
  },
};

/**
 * Why the entries above cast to `JsonValue`.
 *
 * Every view model in `src/simulation/presentation/` is already
 * structured-clone-safe by contract 1 -- readonly plain objects, arrays and
 * numbers, with absent optionals rather than `undefined` values -- but
 * `JsonValue`'s index signature cannot be *proved* of an interface with
 * declared optional properties without restating each one, and restating them
 * is the duplication this channel exists to avoid. The property is therefore
 * enforced where it can be: `versionedPayloadSchema`'s `jsonValueSchema` runs
 * over the real payload at the boundary, so a projection that ever produced a
 * cycle, an `Infinity`, a class instance or a `Map` is rejected as
 * `invalid-payload` rather than silently posted.
 * `tests/contract/worker-projection-channel.test.ts` decodes every reply
 * through that schema for exactly this reason.
 */

/** Every declared id, in declaration order. Re-exported so callers need one import. */
export const CATALOGUED_PROJECTION_IDS: readonly ProjectionId[] = PROJECTION_IDS;
