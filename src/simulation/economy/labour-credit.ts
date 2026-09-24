import type { EntityId } from '../entity/entity-store';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { DAY_LENGTH_TICKS } from '../prisoners/regime';
import type { LoanBook } from './loans';
import type { Treasury } from './treasury';

/** A small secondary income line: two 400-tick credits fit in a 1,000-tick work day. */
export const LABOUR_TICKS_PER_CREDIT = 400;
export const LABOUR_CREDIT_MINOR_UNITS = 25;

export interface LabourCreditSnapshot {
  /** Work already performed in the current day, in canonical entity-id order. */
  readonly workTicks: readonly (readonly [EntityId, number])[];
  readonly employedLastBlock: number;
  readonly idleLastBlock: number;
  readonly workedThisBlock?: readonly EntityId[];
  readonly eligibleThisBlock?: readonly EntityId[];
}

/**
 * Counts actual performed room work or education, not the regime's promise to
 * work. A prisoner travelling, idling, free-associating or carrying materials
 * produces no labour credit. The source is sampled after ActionSystem's update
 * on each tick, so a save mid-day preserves precisely the unbilled prefix.
 */
export class LabourCreditSystem implements SystemRegistration {
  public readonly id = 'economy.prison-labour';
  public readonly order = 255;
  public readonly schedule = { intervalTicks: 1, phaseTicks: 0 };
  private readonly workTicks = new Map<EntityId, number>();
  private employedLastBlock = 0;
  private idleLastBlock = 0;
  private readonly workedThisBlock = new Set<EntityId>();
  private readonly eligibleThisBlock = new Set<EntityId>();

  public constructor(
    private readonly treasury: Treasury,
    private readonly workingPrisoners: (tick: number) => readonly EntityId[],
    private readonly loans?: LoanBook,
    private readonly eligiblePrisoners?: (tick: number) => readonly EntityId[],
    private readonly hasFurnishedWorkRoom?: () => boolean,
    private readonly onIdleWithoutRoom?: (idle: number, tick: number) => void,
    private readonly isWorkBlockEnd: (tick: number) => boolean = (tick) =>
      tick % DAY_LENGTH_TICKS === 999 || tick % DAY_LENGTH_TICKS === 1_799,
  ) {}

  public get lastBlock(): { readonly employed: number; readonly idle: number } {
    return { employed: this.employedLastBlock, idle: this.idleLastBlock };
  }

  public getSnapshot(): LabourCreditSnapshot {
    return {
      workTicks: [...this.workTicks].sort(([a], [b]) => a - b),
      employedLastBlock: this.employedLastBlock,
      idleLastBlock: this.idleLastBlock,
      workedThisBlock: [...this.workedThisBlock].sort((a, b) => a - b),
      eligibleThisBlock: [...this.eligibleThisBlock].sort((a, b) => a - b),
    };
  }

  public loadSnapshot(snapshot: LabourCreditSnapshot): void {
    this.workTicks.clear();
    for (const [entityId, ticks] of snapshot.workTicks) {
      if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > DAY_LENGTH_TICKS || this.workTicks.has(entityId)) {
        throw new RangeError('Invalid prisoner labour snapshot.');
      }
      this.workTicks.set(entityId, ticks);
    }
    this.employedLastBlock = snapshot.employedLastBlock;
    this.idleLastBlock = snapshot.idleLastBlock;
    this.workedThisBlock.clear();
    this.eligibleThisBlock.clear();
    for (const id of snapshot.workedThisBlock ?? []) this.workedThisBlock.add(id);
    for (const id of snapshot.eligibleThisBlock ?? []) this.eligibleThisBlock.add(id);
  }

  public update(context: SimulationContext): void {
    const tick = context.tick;
    const working = new Set(this.workingPrisoners(tick));
    for (const entityId of working) {
      this.workTicks.set(entityId, (this.workTicks.get(entityId) ?? 0) + 1);
      this.workedThisBlock.add(entityId);
      this.eligibleThisBlock.add(entityId);
    }
    for (const entityId of this.eligiblePrisoners?.(tick) ?? []) this.eligibleThisBlock.add(entityId);

    // The report follows the current schedule's work-block boundary.
    if (this.isWorkBlockEnd(tick)) {
      this.employedLastBlock = this.workedThisBlock.size;
      this.idleLastBlock = [...this.eligibleThisBlock].filter((id) => !this.workedThisBlock.has(id)).length;
      if (this.idleLastBlock > 0 && this.hasFurnishedWorkRoom?.() === false) {
        this.onIdleWithoutRoom?.(this.idleLastBlock, tick);
      }
      this.workedThisBlock.clear();
      this.eligibleThisBlock.clear();
    }

    if (tick % DAY_LENGTH_TICKS !== DAY_LENGTH_TICKS - 1) return;
    let amount = 0;
    for (const [, ticks] of [...this.workTicks].sort(([a], [b]) => a - b)) {
      amount += Math.floor(ticks / LABOUR_TICKS_PER_CREDIT) * LABOUR_CREDIT_MINOR_UNITS;
    }
    this.workTicks.clear();
    if (amount === 0) return;
    const diverted = this.loans?.divert(amount, tick) ?? 0;
    if (amount > diverted) this.treasury.credit(amount - diverted);
  }
}
