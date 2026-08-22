export type ClockControl = { readonly mode: 'paused' } | { readonly mode: 'running'; readonly speed: 1 | 2 | 4 };

export class FixedStepClock {
  private lastMilliseconds: number | undefined;
  private accumulator = 0;

  public constructor(
    public readonly stepMilliseconds = 50,
    private control: ClockControl = { mode: 'paused' },
  ) {
    if (!Number.isFinite(stepMilliseconds) || stepMilliseconds <= 0) throw new RangeError('Step duration must be positive.');
  }

  public setControl(control: ClockControl, nowMilliseconds: number): void {
    this.pump(nowMilliseconds, 0);
    this.control = control;
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
    if (this.control.mode === 'paused') return 0;
    this.accumulator += elapsed * this.control.speed;
    const available = Math.floor(this.accumulator / this.stepMilliseconds);
    const executed = Math.min(available, budget);
    this.accumulator -= executed * this.stepMilliseconds;
    return executed;
  }

  public get backlogMilliseconds(): number { return this.accumulator; }
}
