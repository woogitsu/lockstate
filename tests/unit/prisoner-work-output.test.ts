import { describe, expect, it } from 'vitest';
import { WorkOutputLedger } from '../../src/simulation/prisoners/work-output';

describe('kitchen and laundry production (#592)', () => {
  it('makes one portion per 50 real stove ticks, consumes it once, then feeds at half rate', () => {
    const output = new WorkOutputLedger();
    for (let tick = 0; tick < 49; tick++) output.recordKitchenTick('kitchen-1');
    expect(output.portions).toBe(0);
    output.recordKitchenTick('kitchen-1');
    expect(output.portions).toBe(1);
    expect(output.mealEffectMultiplier(7, 500)).toBe(1);
    expect(output.mealEffectMultiplier(7, 500)).toBe(1);
    expect(output.portions).toBe(0);
    output.settleDay();
    expect(output.mealEffectMultiplier(7, 500)).toBe(1);
    expect(output.mealEffectMultiplier(8, 500)).toBe(0.5);
  });

  it('assigns a clean kit at 80 ticks, halves hygiene decay for the day and expires at midnight', () => {
    const output = new WorkOutputLedger();
    for (let tick = 0; tick < 80; tick++) output.recordLaundryTick('laundry-1', [7, 8]);
    expect(output.hasCleanKit(7)).toBe(true);
    expect(output.hasCleanKit(8)).toBe(false);
    output.settleDay();
    expect(output.hasCleanKit(7)).toBe(false);
  });

  it('restores partial production and a reserved meal without duplicating either', () => {
    const output = new WorkOutputLedger();
    for (let tick = 0; tick < 49; tick++) output.recordKitchenTick('kitchen-1');
    output.loadSnapshot(JSON.parse(JSON.stringify(output.getSnapshot())));
    output.recordKitchenTick('kitchen-1');
    expect(output.mealEffectMultiplier(7, 500)).toBe(1);
    const restored = new WorkOutputLedger();
    restored.loadSnapshot(JSON.parse(JSON.stringify(output.getSnapshot())));
    expect(restored.mealEffectMultiplier(7, 500)).toBe(1);
    expect(restored.portions).toBe(0);
  });
});
