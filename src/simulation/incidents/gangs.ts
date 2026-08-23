import type { EntityId } from '../entity/entity-store';

export interface GangDefinition {
  readonly id: string;
  /** Sector ids this gang claims. Territory overlap between gangs is exactly what `resolveRetaliationRisk` reads as friction. */
  readonly territorySectorIds: readonly string[];
}

/**
 * Lightweight membership/territory/reputation model -- issue #28's
 * "lightweight gang membership/territory/reputation/retaliation model,"
 * explicitly *not* final gang diplomacy/economy (out of scope). Every
 * accessor is deterministically ordered, so nothing downstream can
 * accidentally depend on `Map` iteration order ("alters risk/action
 * scoring without nondeterministic iteration").
 */
export class GangRegistry {
  private readonly definitions = new Map<string, GangDefinition>();
  private readonly gangIdByMember = new Map<EntityId, string>();
  private readonly memberIdsByGang = new Map<string, Set<EntityId>>();
  /** 0-1 standing per gang; raised by successful retaliation, lowered when a gang's own incident is contained. */
  private readonly reputationByGang = new Map<string, number>();
  /** Outstanding grudges: `${offendedGangId}->${offendingGangId}` -> pending retaliation weight (0-1). */
  private readonly grudges = new Map<string, number>();

  public register(definition: GangDefinition): void {
    if (this.definitions.has(definition.id)) throw new RangeError(`Duplicate gang id "${definition.id}".`);
    this.definitions.set(definition.id, definition);
    this.memberIdsByGang.set(definition.id, new Set());
    this.reputationByGang.set(definition.id, 0.5);
  }

  public getDefinition(gangId: string): GangDefinition | undefined {
    return this.definitions.get(gangId);
  }

  public addMember(gangId: string, entityId: EntityId): void {
    if (!this.definitions.has(gangId)) throw new RangeError(`Unknown gang id "${gangId}".`);
    const existing = this.gangIdByMember.get(entityId);
    if (existing !== undefined) this.memberIdsByGang.get(existing)?.delete(entityId);
    this.gangIdByMember.set(entityId, gangId);
    this.memberIdsByGang.get(gangId)!.add(entityId);
  }

  public removeMember(entityId: EntityId): void {
    const gangId = this.gangIdByMember.get(entityId);
    if (gangId === undefined) return;
    this.memberIdsByGang.get(gangId)?.delete(entityId);
    this.gangIdByMember.delete(entityId);
  }

  public getGangOf(entityId: EntityId): string | undefined {
    return this.gangIdByMember.get(entityId);
  }

  /** Deterministic: ascending entity id. */
  public membersOf(gangId: string): readonly EntityId[] {
    const members = this.memberIdsByGang.get(gangId);
    return members === undefined ? [] : [...members].sort((a, b) => a - b);
  }

  /** Deterministic: sorted by gang id. */
  public all(): readonly GangDefinition[] {
    return [...this.definitions.keys()].sort().map((id) => this.definitions.get(id)!);
  }

  public getReputation(gangId: string): number {
    return this.reputationByGang.get(gangId) ?? 0;
  }

  public adjustReputation(gangId: string, delta: number): void {
    if (!this.definitions.has(gangId)) throw new RangeError(`Unknown gang id "${gangId}".`);
    this.reputationByGang.set(gangId, Math.max(0, Math.min(1, this.getReputation(gangId) + delta)));
  }

  /** Gangs claiming this sector, deterministic: sorted by gang id. */
  public gangsClaiming(sectorId: string): readonly string[] {
    return this.all().filter((gang) => gang.territorySectorIds.includes(sectorId)).map((gang) => gang.id);
  }

  private grudgeKey(offendedGangId: string, offendingGangId: string): string {
    return `${offendedGangId}->${offendingGangId}`;
  }

  /** Records that `offendingGangId` wronged `offendedGangId` -- the input `resolveRetaliationRisk` turns into a retaliation incident later. Accumulates, clamped to 1. */
  public addGrudge(offendedGangId: string, offendingGangId: string, weight: number): void {
    if (offendedGangId === offendingGangId) throw new RangeError('A gang cannot hold a grudge against itself.');
    const key = this.grudgeKey(offendedGangId, offendingGangId);
    this.grudges.set(key, Math.max(0, Math.min(1, (this.grudges.get(key) ?? 0) + weight)));
  }

  public getGrudge(offendedGangId: string, offendingGangId: string): number {
    return this.grudges.get(this.grudgeKey(offendedGangId, offendingGangId)) ?? 0;
  }

  public clearGrudge(offendedGangId: string, offendingGangId: string): void {
    this.grudges.delete(this.grudgeKey(offendedGangId, offendingGangId));
  }

  /** Deterministic: sorted by `offended->offending` key. */
  public allGrudges(): readonly (readonly [string, string, number])[] {
    return [...this.grudges.keys()].sort().map((key) => {
      const [offended, offending] = key.split('->') as [string, string];
      return [offended, offending, this.grudges.get(key)!] as const;
    });
  }

  public getSnapshot() {
    return {
      definitions: this.all(),
      members: [...this.gangIdByMember.keys()].sort((a, b) => a - b).map((entityId) => [entityId, this.gangIdByMember.get(entityId)!] as const),
      reputation: [...this.reputationByGang.keys()].sort().map((gangId) => [gangId, this.reputationByGang.get(gangId)!] as const),
      grudges: this.allGrudges(),
    };
  }

  public loadSnapshot(snapshot: ReturnType<GangRegistry['getSnapshot']>): void {
    this.definitions.clear();
    this.gangIdByMember.clear();
    this.memberIdsByGang.clear();
    this.reputationByGang.clear();
    this.grudges.clear();
    for (const definition of snapshot.definitions) this.register(definition);
    for (const [entityId, gangId] of snapshot.members) this.addMember(gangId, entityId);
    for (const [gangId, reputation] of snapshot.reputation) this.reputationByGang.set(gangId, reputation);
    for (const [offended, offending, weight] of snapshot.grudges) this.grudges.set(this.grudgeKey(offended, offending), weight);
  }
}

/**
 * Pure, explicit-factor retaliation risk for one gang pair in one sector:
 * the outstanding grudge, amplified when the offending gang also claims
 * that sector (a grudge is far more likely to be acted on where both
 * sides actually are). Clamped to [0,1]. Feeds `IncidentTriggerSystem`'s
 * existing decision path rather than a parallel AI engine, exactly as the
 * architecture notes require.
 */
export function resolveRetaliationRisk(gangs: GangRegistry, offendedGangId: string, offendingGangId: string, sectorId: string): number {
  const grudge = gangs.getGrudge(offendedGangId, offendingGangId);
  if (grudge === 0) return 0;
  const claimants = gangs.gangsClaiming(sectorId);
  const contested = claimants.includes(offendedGangId) && claimants.includes(offendingGangId);
  return Math.max(0, Math.min(1, contested ? grudge * 1.5 : grudge * 0.5));
}
