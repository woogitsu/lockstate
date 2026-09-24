import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { DAY_LENGTH_TICKS } from './regime';

/** One portion per 50 performing prisoner-ticks; one clean kit per 80. */
export const KITCHEN_TICKS_PER_PORTION = 50;
export const LAUNDRY_TICKS_PER_KIT = 80;

/** Keeps the unstocked canteen ahead of the free cell fallback. */
export function mealHungerMultiplier(actionId: string, output: WorkOutputLedger | undefined, entityId: number, startedAtTick: number): number {
  if (actionId === 'action.eat-meal') return output?.mealEffectMultiplier(entityId, startedAtTick) ?? 1;
  return actionId === 'action.eat-in-cell' ? 0.5 : 1;
}

export interface WorkOutputSnapshot {
  readonly kitchen: readonly (readonly [string, number, number])[];
  readonly laundry: readonly (readonly [string, number])[];
  readonly cleanKits: readonly number[];
  readonly mealClaims: readonly (readonly [number, number, boolean])[];
}

/** Deterministic daily output of furnished work rooms. No purchased food or hauling. */
export class WorkOutputLedger {
  private readonly kitchen = new Map<string, { ticks: number; portions: number }>();
  private readonly laundry = new Map<string, number>();
  private readonly cleanKits = new Set<number>();
  private readonly mealClaims = new Map<number, { startedAtTick: number; hadPortion: boolean }>();

  public get portions(): number {
    let total = 0;
    for (const id of [...this.kitchen.keys()].sort()) total += this.kitchen.get(id)!.portions;
    return total;
  }

  public portionsIn(instanceId: string): number { return this.kitchen.get(instanceId)?.portions ?? 0; }
  public hasCleanKit(entityId: number): boolean { return this.cleanKits.has(entityId); }

  public recordKitchenTick(instanceId: string): void {
    const state = this.kitchen.get(instanceId) ?? { ticks: 0, portions: 0 };
    state.ticks += 1;
    if (state.ticks === KITCHEN_TICKS_PER_PORTION) {
      state.ticks = 0;
      state.portions += 1;
    }
    this.kitchen.set(instanceId, state);
  }

  public recordLaundryTick(instanceId: string, residents: readonly number[]): void {
    const ticks = (this.laundry.get(instanceId) ?? 0) + 1;
    this.laundry.set(instanceId, ticks === LAUNDRY_TICKS_PER_KIT ? 0 : ticks);
    if (ticks !== LAUNDRY_TICKS_PER_KIT) return;
    const recipient = [...residents].sort((a, b) => a - b).find((id) => !this.cleanKits.has(id));
    if (recipient !== undefined) this.cleanKits.add(recipient);
  }

  /** A canteen meal reserves one portion once at the start of this action. */
  public mealEffectMultiplier(entityId: number, startedAtTick: number): 1 | 0.5 {
    const prior = this.mealClaims.get(entityId);
    if (prior?.startedAtTick === startedAtTick) return prior.hadPortion ? 1 : 0.5;
    let hadPortion = false;
    for (const id of [...this.kitchen.keys()].sort()) {
      const state = this.kitchen.get(id)!;
      if (state.portions === 0) continue;
      state.portions -= 1;
      hadPortion = true;
      break;
    }
    this.mealClaims.set(entityId, { startedAtTick, hadPortion });
    return hadPortion ? 1 : 0.5;
  }

  /** Unsold portions spoil and kits expire at the day boundary. */
  public settleDay(): void {
    this.kitchen.clear();
    this.laundry.clear();
    this.cleanKits.clear();
    // A meal already in progress keeps its reservation across midnight.
    // Its portion has been eaten; only unclaimed stock spoils.
  }

  public getSnapshot(): WorkOutputSnapshot {
    return {
      kitchen: [...this.kitchen].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, value]) => [id, value.ticks, value.portions]),
      laundry: [...this.laundry].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      cleanKits: [...this.cleanKits].sort((a, b) => a - b),
      mealClaims: [...this.mealClaims].sort(([a], [b]) => a - b).map(([id, claim]) => [id, claim.startedAtTick, claim.hadPortion]),
    };
  }

  public loadSnapshot(snapshot: WorkOutputSnapshot): void {
    this.kitchen.clear(); this.laundry.clear(); this.cleanKits.clear(); this.mealClaims.clear();
    for (const [id, ticks, portions] of snapshot.kitchen) {
      if (this.kitchen.has(id) || !Number.isSafeInteger(ticks) || ticks < 0 || ticks >= KITCHEN_TICKS_PER_PORTION || !Number.isSafeInteger(portions) || portions < 0) throw new RangeError('Invalid kitchen output.');
      this.kitchen.set(id, { ticks, portions });
    }
    for (const [id, ticks] of snapshot.laundry) {
      if (this.laundry.has(id) || !Number.isSafeInteger(ticks) || ticks < 0 || ticks >= LAUNDRY_TICKS_PER_KIT) throw new RangeError('Invalid laundry output.');
      this.laundry.set(id, ticks);
    }
    for (const id of snapshot.cleanKits) {
      if (!Number.isSafeInteger(id) || id < 0 || this.cleanKits.has(id)) throw new RangeError('Invalid clean kit assignment.');
      this.cleanKits.add(id);
    }
    for (const [id, startedAtTick, hadPortion] of snapshot.mealClaims) {
      if (!Number.isSafeInteger(id) || id < 0 || !Number.isSafeInteger(startedAtTick) || startedAtTick < 0 || typeof hadPortion !== 'boolean' || this.mealClaims.has(id)) throw new RangeError('Invalid meal claim.');
      this.mealClaims.set(id, { startedAtTick, hadPortion });
    }
  }
}

export interface PerformingWork {
  readonly entityId: number;
  readonly instanceId: string;
  readonly kind: 'kitchen' | 'laundry';
}

/** Samples actual performed work after the action system, then expires output at midnight. */
export class WorkOutputSystem implements SystemRegistration {
  public readonly id = 'prisoners.work-output';
  public readonly order = 256;
  public readonly schedule = { intervalTicks: 1, phaseTicks: 0 };

  public constructor(
    private readonly ledger: WorkOutputLedger,
    private readonly performing: (tick: number) => readonly PerformingWork[],
    private readonly residentIds: () => readonly number[],
  ) {}

  public update(context: SimulationContext): void {
    for (const worker of this.performing(context.tick).slice().sort((a, b) => a.entityId - b.entityId)) {
      if (worker.kind === 'kitchen') this.ledger.recordKitchenTick(worker.instanceId);
      else this.ledger.recordLaundryTick(worker.instanceId, this.residentIds());
    }
    if (context.tick % DAY_LENGTH_TICKS === DAY_LENGTH_TICKS - 1) this.ledger.settleDay();
  }
}
