import type { NamedRngStreams } from '../rng/streams';

export interface SystemSchedule {
  readonly intervalTicks: number;
  readonly phaseTicks: number;
}

export interface SimulationContext {
  readonly tick: number;
  readonly rng: NamedRngStreams;
}

export interface SystemRegistration {
  readonly id: string;
  readonly order: number;
  readonly schedule: SystemSchedule;
  update(context: SimulationContext): void;
}
