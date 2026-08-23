import { NamedRngStreams, type NamedRngStreamState } from '../rng/streams';
import type { SystemRegistration, SimulationContext } from './system';

export interface QueuedCommand {
  readonly id: string;
  readonly sequence: number;
  readonly executeAtTick: number;
  readonly payload: unknown; // Opaque to kernel, it just dispatches
}

export type CommandHandler = (command: QueuedCommand, context: SimulationContext) => void;

export interface KernelSnapshot {
  readonly tick: number;
  readonly expectedSequence: number;
  readonly rngStates: readonly NamedRngStreamState[];
  readonly commands: readonly QueuedCommand[];
}

export class Kernel {
  private _tick: number;
  private _expectedSequence: number;
  private _rng: NamedRngStreams;
  private _systems: SystemRegistration[] = [];
  private _commands: QueuedCommand[] = [];
  private _commandHandler: CommandHandler = () => {};

  public constructor(
    initialTick: number = 0,
    initialSequence: number = 0,
    rng: NamedRngStreams = new NamedRngStreams([]),
  ) {
    if (!Number.isInteger(initialTick) || initialTick < 0) throw new RangeError('Tick must be a non-negative integer.');
    if (!Number.isInteger(initialSequence) || initialSequence < 0) throw new RangeError('Sequence must be a non-negative integer.');
    this._tick = initialTick;
    this._expectedSequence = initialSequence;
    this._rng = rng;
  }

  public get tick(): number { return this._tick; }
  public get expectedSequence(): number { return this._expectedSequence; }
  public get rng(): NamedRngStreams { return this._rng; }

  /**
   * The resolved execution order of every registered system, as
   * `{ id, order }` pairs in the exact sequence `step()` runs them.
   *
   * Read-only diagnostic surface. ADR 0004 makes "systems run in a declared
   * integer order" part of the determinism contract, and ADR 0009 turns
   * that contract into a *product* guarantee -- inserting a system into the
   * middle of the order changes every stored challenge replay. That is only
   * reviewable if the resolved order can be asserted from outside the
   * kernel, which is what `tests/determinism/kernel-system-order.test.ts`
   * does. It exposes no mutable state: the array and its entries are fresh
   * copies, so a caller cannot reorder or re-register systems through it.
   */
  public get systemExecutionOrder(): readonly { readonly id: string; readonly order: number }[] {
    return this._systems.map((system) => ({ id: system.id, order: system.order }));
  }

  public setCommandHandler(handler: CommandHandler): void {
    this._commandHandler = handler;
  }

  public registerSystem(system: SystemRegistration): void {
    if (this._systems.some((s) => s.id === system.id)) {
      throw new Error(`System duplicate ID: ${system.id}`);
    }
    this._systems.push(system);
    // Sort systems deterministically: order first, then ID
    this._systems.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  public submitCommand(id: string, sequence: number, executeAtTick: number, payload: unknown): void {
    if (sequence < this._expectedSequence) {
      throw new Error(`Duplicate command sequence: ${sequence}`);
    }
    if (sequence > this._expectedSequence) {
      throw new Error(`Command sequence gap: expected ${this._expectedSequence}, got ${sequence}`);
    }
    if (executeAtTick < this._tick) {
      throw new Error(`Cannot schedule command in the past: tick ${executeAtTick} < current ${this._tick}`);
    }

    this._commands.push({ id, sequence, executeAtTick, payload });
    // Sort commands ascending by tick, then by sequence to maintain deterministic order
    this._commands.sort((a, b) => {
      if (a.executeAtTick !== b.executeAtTick) return a.executeAtTick - b.executeAtTick;
      return a.sequence - b.sequence;
    });

    this._expectedSequence++;
  }

  public step(): void {
    const context: SimulationContext = {
      tick: this._tick,
      rng: this._rng,
    };

    // 1. Apply commands due at this tick.
    // Reading the head into a local keeps the queue safe under
    // noUncheckedIndexedAccess while preserving deterministic ordering.
    while (true) {
      const nextCommand = this._commands[0];
      if (nextCommand === undefined || nextCommand.executeAtTick !== this._tick) break;

      const command = this._commands.shift();
      if (command === undefined) break;
      this._commandHandler(command, context);
    }

    // 2. Execute systems due at this tick based on their schedule
    for (const system of this._systems) {
      if (this._tick % system.schedule.intervalTicks === system.schedule.phaseTicks) {
        system.update(context);
      }
    }

    // 3. Advance tick
    this._tick++;
  }

  public snapshot(): KernelSnapshot {
    return {
      tick: this._tick,
      expectedSequence: this._expectedSequence,
      rngStates: this._rng.snapshot(),
      commands: this._commands.map((c) => ({ ...c })), // Shallow copy to preserve snapshot immutability
    };
  }

  /**
   * Restores tick, sequence, RNG streams and the pending command queue
   * onto an *already-wired* kernel, leaving its registered systems and
   * command handler untouched.
   *
   * `Kernel.restore` (below) builds a kernel and its system list together,
   * which suits a caller that owns both. A session restore
   * (`src/simulation/runtime/restore-session.ts`) is the opposite shape:
   * the runtime factory has already assembled the full system graph and
   * command handler, and only the serialized kernel state needs to land on
   * it. Doing that through this method keeps exactly one definition of how
   * a session's systems are wired, instead of a second list that could
   * drift from the factory's.
   */
  public restoreState(snapshot: KernelSnapshot): void {
    if (!Number.isInteger(snapshot.tick) || snapshot.tick < 0) throw new RangeError('Tick must be a non-negative integer.');
    if (!Number.isInteger(snapshot.expectedSequence) || snapshot.expectedSequence < 0) throw new RangeError('Sequence must be a non-negative integer.');
    this._tick = snapshot.tick;
    this._expectedSequence = snapshot.expectedSequence;
    this._rng = new NamedRngStreams(snapshot.rngStates);
    this._commands = snapshot.commands.map((command) => ({ ...command }));
    this._commands.sort((a, b) => {
      if (a.executeAtTick !== b.executeAtTick) return a.executeAtTick - b.executeAtTick;
      return a.sequence - b.sequence;
    });
  }

  public static restore(snapshot: KernelSnapshot, systems: SystemRegistration[], commandHandler?: CommandHandler): Kernel {
    const rng = new NamedRngStreams(snapshot.rngStates);
    const kernel = new Kernel(snapshot.tick, snapshot.expectedSequence, rng);
    
    for (const sys of systems) {
      kernel.registerSystem(sys);
    }
    if (commandHandler) {
      kernel.setCommandHandler(commandHandler);
    }
    
    for (const cmd of snapshot.commands) {
      // Bypassing submitCommand validation as this is a restore from valid state
      kernel._commands.push({ ...cmd });
    }
    // Sort just in case, though snapshot should be ordered
    kernel._commands.sort((a, b) => {
      if (a.executeAtTick !== b.executeAtTick) return a.executeAtTick - b.executeAtTick;
      return a.sequence - b.sequence;
    });

    return kernel;
  }
}
