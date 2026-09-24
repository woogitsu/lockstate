import { describe, expect, it } from 'vitest';
import { LabourCreditSystem } from '../../src/simulation/economy/labour-credit';
import { Treasury } from '../../src/simulation/economy/treasury';

describe('prison labour credit', () => {
  it('pays only completed blocks of real work and survives a mid-day restore', () => {
    const treasury = new Treasury(0);
    let working = [7];
    const first = new LabourCreditSystem(treasury, () => working);
    for (let tick = 0; tick < 250; tick++) first.update({ tick } as never);
    const saved = first.getSnapshot();
    const restored = new LabourCreditSystem(treasury, () => working);
    restored.loadSnapshot(saved);
    for (let tick = 250; tick < 400; tick++) restored.update({ tick } as never);
    working = [];
    for (let tick = 400; tick < 2_400; tick++) restored.update({ tick } as never);
    expect(treasury.balanceMinorUnits).toBe(25);
    expect(restored.getSnapshot().workTicks).toEqual([]);
  });

  it('does not pay for idle time or a partial threshold', () => {
    const treasury = new Treasury(0);
    let working = [7];
    const system = new LabourCreditSystem(treasury, () => working);
    for (let tick = 0; tick < 399; tick++) system.update({ tick } as never);
    working = [];
    for (let tick = 399; tick < 2_400; tick++) system.update({ tick } as never);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('alerts once when a work block ends with idle prisoners and no furnished room', () => {
    const notices: Array<[number, number]> = [];
    const system = new LabourCreditSystem(
      new Treasury(0), () => [], undefined, () => [7, 8], () => false,
      (idle, tick) => notices.push([idle, tick]),
    );
    for (let tick = 500; tick <= 999; tick++) system.update({ tick } as never);
    expect(system.lastBlock).toEqual({ employed: 0, idle: 2 });
    expect(notices).toEqual([[2, 999]]);
  });

  it('reports at the current regime boundary instead of the shipped timetable', () => {
    const notices: Array<[number, number]> = [];
    const system = new LabourCreditSystem(
      new Treasury(0), () => [], undefined, () => [7], () => false,
      (idle, tick) => notices.push([idle, tick]), (tick) => tick === 649,
    );
    for (let tick = 500; tick <= 650; tick++) system.update({ tick } as never);
    expect(system.lastBlock).toEqual({ employed: 0, idle: 1 });
    expect(notices).toEqual([[1, 649]]);
  });
});
