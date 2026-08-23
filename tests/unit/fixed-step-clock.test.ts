import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../../src/simulation/clock';

describe('fixed step clock', () => {
  it('uses 50ms steps with pause and semantic speed controls', () => {
    const clock = new FixedStepClock();
    expect(clock.pump(0, 99)).toBe(0);
    clock.setControl({ mode: 'running', speed: 2 }, 0);
    expect(clock.pump(50, 99)).toBe(2);
    clock.setControl({ mode: 'paused' }, 50);
    expect(clock.pump(1_050, 99)).toBe(0);
  });

  it('reports the control it is actually running under', () => {
    // The worker reports this over the protocol and the status-strip
    // projection is handed it, so a getter that lagged behind `setControl`
    // would have the HUD showing a speed the kernel is not running at.
    const clock = new FixedStepClock();
    expect(clock.control).toEqual({ mode: 'paused' });

    clock.setControl({ mode: 'running', speed: 4 }, 0);
    expect(clock.control).toEqual({ mode: 'running', speed: 4 });

    clock.setControl({ mode: 'paused' }, 10);
    expect(clock.control).toEqual({ mode: 'paused' });
  });

  it('takes the control it was constructed with, not a default', () => {
    expect(new FixedStepClock(50, { mode: 'running', speed: 2 }).control).toEqual({ mode: 'running', speed: 2 });
  });

  it('preserves active overload backlog instead of dropping ticks', () => {
    const clock = new FixedStepClock(50, { mode: 'running', speed: 1 });
    clock.pump(0, 1);
    expect(clock.pump(250, 2)).toBe(2);
    expect(clock.backlogMilliseconds).toBe(150);
    expect(clock.pump(250, 2)).toBe(2);
  });
});
