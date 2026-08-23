export type ClockControl = { readonly mode: 'paused' } | { readonly mode: 'running'; readonly speed: 1 | 2 | 4 };

export class FixedStepClock {
  private lastMilliseconds: number | undefined;
  private accumulator = 0;
  private currentControl: ClockControl;

  public constructor(
    public readonly stepMilliseconds = 50,
    control: ClockControl = { mode: 'paused' },
  ) {
    if (!Number.isFinite(stepMilliseconds) || stepMilliseconds <= 0) throw new RangeError('Step duration must be positive.');
    this.currentControl = control;
  }

  /**
   * What the clock is doing right now.
   *
   * Read-only, and the reason it exists: the worker shell has to *report*
   * the clock state over the protocol (`simulation/clock-state`) and the
   * HUD's status-strip projection has to be handed it. Without a getter both
   * callers had to keep their own copy of the last value they set, which is
   * duplicated state that can silently disagree with the clock actually
   * driving the kernel. `docs/HUD_PROJECTIONS.md` recorded the absence as a
   * gap; this closes it.
   *
   * It exposes no way to *change* the control: `setControl` remains the only
   * mutator, so the accumulator can never be advanced behind the clock's back.
   */
  public get control(): ClockControl {
    return this.currentControl;
  }

  public setControl(control: ClockControl, nowMilliseconds: number): void {
    this.pump(nowMilliseconds, 0);
    this.currentControl = control;
  }

  public pump(nowMilliseconds: number, budget: number): number {
    if (!Number.isFinite(nowMilliseconds) || !Number.isInteger(budget) || budget < 0) throw new RangeError('Clock input is invalid.');
    if (this.lastMilliseconds === undefined) {
      this.lastMilliseconds = nowMilliseconds;
      return 0;
    }
    const elapsed = nowMilliseconds - this.lastMilliseconds;
    if (elapsed < 0) throw new RangeError('Clock input must be monotonic.');
    this.lastMilliseconds = nowMilliseconds;
    if (this.currentControl.mode === 'paused') return 0;
    this.accumulator += elapsed * this.currentControl.speed;
    const available = Math.floor(this.accumulator / this.stepMilliseconds);
    const executed = Math.min(available, budget);
    this.accumulator -= executed * this.stepMilliseconds;
    return executed;
  }

  public get backlogMilliseconds(): number { return this.accumulator; }
}
