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

  it('banks none of the time it was paused for, and none of a pre-pause backlog is lost', () => {
    // `docs/DETERMINISM.md` states both halves, so both are pinned here.
    const clock = new FixedStepClock(50, { mode: 'running', speed: 1 });
    clock.pump(0, 5);
    // 1,000 ms elapsed, a budget of five: five ticks run and 750 ms is left
    // over. That leftover is a *backlog*, not paused time.
    expect(clock.pump(1_000, 5)).toBe(5);
    expect(clock.backlogMilliseconds).toBe(750);

    clock.setControl({ mode: 'paused' }, 1_000);
    expect(clock.backlogMilliseconds).toBe(750);

    // A minute of wall time while paused executes nothing and, crucially,
    // adds nothing: a pause is not a way to store up simulation time.
    expect(clock.pump(61_000, 99)).toBe(0);
    expect(clock.backlogMilliseconds).toBe(750);

    // Resuming spends the pre-pause backlog and nothing more. 750 ms is
    // fifteen steps -- the same catch-up the clock performs after an overload
    // with no pause involved -- and the minute paused contributes none.
    clock.setControl({ mode: 'running', speed: 1 }, 61_000);
    expect(clock.pump(61_000, 99)).toBe(15);
    expect(clock.backlogMilliseconds).toBe(0);
  });
});
