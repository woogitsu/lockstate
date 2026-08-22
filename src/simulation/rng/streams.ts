import { Xoshiro128StarStar, type Xoshiro128StarStarState } from './xoshiro128starstar';

export interface NamedRngStreamState {
  readonly name: string;
  readonly state: Xoshiro128StarStarState;
}

export class NamedRngStreams {
  private readonly streams = new Map<string, Xoshiro128StarStar>();

  public constructor(initial: readonly NamedRngStreamState[]) {
    for (const entry of initial) {
      if (!/^[a-z][a-z0-9.:-]*$/.test(entry.name) || this.streams.has(entry.name)) {
        throw new RangeError('RNG stream names must be unique stable identifiers.');
      }
      this.streams.set(entry.name, new Xoshiro128StarStar(entry.state.words));
    }
  }

  public get(name: string): Xoshiro128StarStar {
    const stream = this.streams.get(name);
    if (stream === undefined) throw new RangeError(`Unknown RNG stream: ${name}`);
    return stream;
  }

  public snapshot(): readonly NamedRngStreamState[] {
    return [...this.streams.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, stream]) => ({ name, state: stream.snapshot() }));
  }
}
