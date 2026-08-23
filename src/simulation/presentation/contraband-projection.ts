import type { ContrabandCategoryDefinition, ContrabandLegalContext } from '../../content/contraband-catalog';
import { defaultContrabandRegistry } from '../../content/contraband-catalog';
import type { ContentRegistry } from '../../content/registry';
import type { ConfiscationEvent } from '../contraband/confiscation';
import type { InformantRecord } from '../contraband/informants';
import type { IntelligenceRecord } from '../contraband/intelligence';
import type { ContrabandHolder } from '../contraband/item';
import type { SearchPolicyDefinition, SearchScope } from '../contraband/search-policy';
import type { SearchJobState, SearchSystem } from '../contraband/search-system';
import type { EntityId } from '../entity/entity-store';
import {
  compareStableIds,
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  pageOf,
  toBoundedValue,
  type BoundedValue,
  type HudViewModelSchemaVersion,
  type PageRequest,
  type ViewModelPage,
} from './view-model';

/**
 * **What this projection deliberately does not carry.**
 *
 * `ContrabandRegistry` is ground truth: every concealed item, its holder
 * and its full movement history. `docs/CONTRABAND.md`'s architecture note
 * is explicit that hidden simulation state and player-visible intelligence
 * are distinct, and that item tracing is a debug surface rather than
 * normal UI. So this projection exposes only what the prison has actually
 * *found* (the confiscation ledger) and what it *suspects*
 * (the intelligence ledger, with its uncertainty intact). A HUD built on
 * this cannot accidentally reveal where the drugs are.
 */

export interface ContrabandSearchSource {
  getMetrics(): ReturnType<SearchSystem['getMetrics']>;
  getSnapshot(): ReturnType<SearchSystem['getSnapshot']>;
  getJobState(orderId: string): SearchJobState | undefined;
}

export interface ContrabandConfiscationSource {
  /** Read-only; never `drain()`, which would consume the evidence a panel is showing. */
  all(): readonly ConfiscationEvent[];
}

export interface ContrabandIntelligenceSource {
  all(): readonly IntelligenceRecord[];
}

export interface ContrabandInformantSource {
  all(): readonly InformantRecord[];
}

export interface ContrabandProjectionSource {
  readonly searchSystem: ContrabandSearchSource;
  readonly confiscations: ContrabandConfiscationSource;
  readonly intelligence?: ContrabandIntelligenceSource;
  readonly informants?: ContrabandInformantSource;
  /** The live policy list a session pushes into; `SearchSystem` reads the same array. */
  readonly searchPolicies: readonly SearchPolicyDefinition[];
}

export interface ContrabandProjectionOptions {
  readonly categories?: ContentRegistry<ContrabandCategoryDefinition>;
}

export interface ContrabandHolderViewModel {
  readonly kind: ContrabandHolder['kind'];
  readonly id: string;
}

export interface SearchOrderViewModel {
  readonly orderId: string;
  readonly scope: SearchScope;
  /** `'queued'` means staffing demand is unmet -- an observable backlog, not a failure. */
  readonly state: 'queued' | SearchJobState;
  readonly targets: readonly ContrabandHolderViewModel[];
  readonly targetCount: number;
  readonly currentTargetIndex: number;
  readonly progress: BoundedValue;
  readonly assignedGuardEntityIds: readonly EntityId[];
}

export interface SearchPolicyViewModel {
  readonly scope: SearchScope;
  readonly requiredGuardCount: number;
  readonly dwellTicksPerTarget: number;
  readonly baseDetectionProbability: BoundedValue;
  readonly concealmentPenaltyPerPoint: number;
  readonly intelligenceConfidenceBonus: number;
}

export interface DiscoveredContrabandViewModel {
  readonly itemId: string;
  readonly categoryId: string;
  readonly categoryNameKey?: string;
  readonly legalContext?: ContrabandLegalContext;
  readonly severity?: number;
  readonly foundAtHolder: ContrabandHolderViewModel;
  readonly searchOrderId: string;
  readonly foundByStaffEntityId: EntityId;
  readonly tick: number;
  /** Where the item entered the prison. Confiscated evidence, not hidden state. */
  readonly provenance: {
    readonly sourceType: string;
    readonly sourceId: string;
    readonly introducedAtTick: number;
  };
}

export interface IntelligenceViewModel {
  readonly recordId: string;
  readonly targetKind: IntelligenceRecord['targetKind'];
  readonly targetId: string;
  readonly confidence: BoundedValue;
  readonly sourceType: IntelligenceRecord['sourceType'];
  readonly createdAtTick: number;
  readonly categoryHintId?: string;
  readonly categoryHintNameKey?: string;
}

export interface InformantViewModel {
  readonly holderKind: InformantRecord['holderKind'];
  readonly holderId: string;
  readonly reliability: BoundedValue;
}

export interface ContrabandViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  /** Queued orders first (FIFO, their own canonical order), then active orders in ascending order id. */
  readonly searchOrders: readonly SearchOrderViewModel[];
  /** Ascending scope id, so the policy table never reshuffles. */
  readonly policies: readonly SearchPolicyViewModel[];
  readonly discovered: ViewModelPage<DiscoveredContrabandViewModel>;
  /** Ascending record id -- the ledger's own canonical order. */
  readonly intelligence: readonly IntelligenceViewModel[];
  readonly informants: readonly InformantViewModel[];
  readonly metrics: {
    readonly itemsDiscovered: number;
    readonly itemsMissed: number;
    readonly searchesCompleted: number;
    readonly searchesCancelled: number;
    readonly searchesQueued: number;
    readonly searchesActive: number;
  };
  /** Declared catalog order; categories with nothing found still appear. */
  readonly discoveredByCategoryId: readonly {
    readonly categoryId: string;
    readonly categoryNameKey: string;
    readonly legalContext: ContrabandLegalContext;
    readonly count: number;
  }[];
}

const SEARCH_SCOPES: readonly SearchScope[] = ['cell', 'delivery', 'person', 'sector'];

function holderView(holder: { readonly kind: ContrabandHolder['kind']; readonly id: string }): ContrabandHolderViewModel {
  return { kind: holder.kind, id: holder.id };
}

/**
 * The contraband panel: outstanding search orders, the policy driving
 * them, what has been found, and what is merely suspected.
 *
 * **Cost.** `O(searchOrders + intelligenceRecords + informants)` plus one
 * row per confiscation in the requested window. `ConfiscationLedger.all()`
 * copies the whole ledger, so `discovered.total` is `O(confiscations)`
 * even when a single page is requested -- see this module's reported gap
 * about the ledger having no indexed or windowed accessor.
 */
export function projectContraband(
  source: ContrabandProjectionSource,
  request: PageRequest = {},
  options: ContrabandProjectionOptions = {},
): ContrabandViewModel {
  const categories = options.categories ?? defaultContrabandRegistry;
  const snapshot = source.searchSystem.getSnapshot();

  const queued: SearchOrderViewModel[] = snapshot.queue.map((order) => ({
    orderId: order.id,
    scope: order.scope,
    state: 'queued',
    targets: order.targets.map((target) => ({ kind: target.holderKind, id: target.holderId })),
    targetCount: order.targets.length,
    currentTargetIndex: 0,
    progress: toBoundedValue(0, Math.max(1, order.targets.length)),
    assignedGuardEntityIds: [],
  }));

  const active: SearchOrderViewModel[] = snapshot.active.map(([orderId, job]) => ({
    orderId,
    scope: job.scope,
    state: source.searchSystem.getJobState(orderId) ?? 'travelling',
    targets: job.targets.map((target) => ({ kind: target.holderKind, id: target.holderId })),
    targetCount: job.targets.length,
    currentTargetIndex: job.currentTargetIndex,
    progress: toBoundedValue(job.currentTargetIndex, Math.max(1, job.targets.length)),
    assignedGuardEntityIds: [...job.guardIds],
  }));

  const confiscations = source.confiscations.all();
  const discoveredRows: DiscoveredContrabandViewModel[] = confiscations.map((event) => {
    const category = categories.getById(event.categoryId);
    return {
      itemId: event.itemId,
      categoryId: event.categoryId,
      ...(category !== undefined
        ? { categoryNameKey: category.nameKey, legalContext: category.legalContext, severity: category.severity }
        : {}),
      foundAtHolder: holderView(event.foundAtHolder),
      searchOrderId: event.searchOrderId,
      foundByStaffEntityId: event.foundByGuardId,
      tick: event.tick,
      provenance: {
        sourceType: event.provenance.sourceType,
        sourceId: event.provenance.sourceId,
        introducedAtTick: event.provenance.introducedAtTick,
      },
    };
  });

  const countsByCategory = new Map<string, number>();
  for (const event of confiscations) countsByCategory.set(event.categoryId, (countsByCategory.get(event.categoryId) ?? 0) + 1);

  const policyByScope = new Map(source.searchPolicies.map((policy) => [policy.scope, policy] as const));

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    searchOrders: [...queued, ...active],
    policies: SEARCH_SCOPES.flatMap((scope) => {
      const policy = policyByScope.get(scope);
      if (policy === undefined) return [];
      return [
        {
          scope,
          requiredGuardCount: policy.requiredGuardCount,
          dwellTicksPerTarget: policy.dwellTicksPerTarget,
          baseDetectionProbability: toBoundedValue(policy.baseDetectionProbability, 1),
          concealmentPenaltyPerPoint: policy.concealmentPenaltyPerPoint,
          intelligenceConfidenceBonus: policy.intelligenceConfidenceBonus,
        },
      ];
    }),
    discovered: pageOf(discoveredRows, request),
    intelligence: (source.intelligence?.all() ?? []).map((record) => {
      const hint = record.categoryHint === undefined ? undefined : categories.getById(record.categoryHint);
      return {
        recordId: record.id,
        targetKind: record.targetKind,
        targetId: record.targetId,
        confidence: toBoundedValue(record.confidence, 1),
        sourceType: record.sourceType,
        createdAtTick: record.createdAtTick,
        ...(record.categoryHint !== undefined ? { categoryHintId: record.categoryHint } : {}),
        ...(hint !== undefined ? { categoryHintNameKey: hint.nameKey } : {}),
      };
    }),
    informants: (source.informants?.all() ?? []).map((record) => ({
      holderKind: record.holderKind,
      holderId: record.holderId,
      reliability: toBoundedValue(record.reliability, 1),
    })),
    metrics: { ...source.searchSystem.getMetrics(), searchesActive: snapshot.active.length },
    discoveredByCategoryId: categories.all().map((category) => ({
      categoryId: category.id,
      categoryNameKey: category.nameKey,
      legalContext: category.legalContext,
      count: countsByCategory.get(category.id) ?? 0,
    })),
  };
}

/** Exported so a test can assert the declared scope order without duplicating the list. */
export const CONTRABAND_SEARCH_SCOPE_ORDER: readonly SearchScope[] = SEARCH_SCOPES;

/** Kept next to the scope order for the same reason. */
export function compareSearchScopes(left: SearchScope, right: SearchScope): number {
  return compareStableIds(left, right);
}
