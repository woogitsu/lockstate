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

/**
 * Why a command was refused, as a value rather than as prose in a message.
 *
 * `Kernel.submitCommand` has always distinguished these two conditions -- two
 * adjacent `if` branches on the same comparison -- but it threw a bare `Error`,
 * so the only carrier of the distinction was the human-readable text. The
 * worker's `catch` therefore reported all three of its refusal reasons as
 * `invalid-state`, while `duplicate-message` and `sequence-gap` sat in the
 * twelve-member `ProtocolFaultCode` enum emitted by nothing at all (#187
 * finding 2).
 *
 * A discriminant and not a subclass per case: there are exactly two, they are
 * decided one line apart, and the worker maps them through an exhaustive
 * `Record` so a third added here fails to compile until it is mapped.
 */
export type CommandRejectionKind = 'duplicate-sequence' | 'sequence-gap' | 'past-tick';

/**
 * A command the kernel refused, carrying which of the three refusals it was.
 *
 * `extends Error` and not a plain result object, because `submitCommand`'s
 * contract is already to throw and every caller is written for that; changing
 * the return type would be a change to the boundary rather than to what the
 * boundary can say. `WorldSnapshotError` in `src/simulation/world/sparse-world.ts`
 * is the same shape for the same reason.
 *
 * `instanceof` is the only check the worker needs, and it is safe here because
 * this class and its one thrower are in the same bundle -- there is no realm
 * boundary between the kernel and the worker's state machine.
 */
export class CommandRejectedError extends Error {
  public constructor(
    public readonly kind: CommandRejectionKind,
    message: string,
  ) {
    super(message);
    this.name = 'CommandRejectedError';
  }
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
   * Read-only diagnostic surface.
   * [ADR 0020](../../../docs/adr/0020-deterministic-kernel.md) makes "systems
   * run in a declared integer order" part of the determinism contract, and
   * ADR 0009 turns that contract into a *product* guarantee -- inserting a
   * system into the middle of the order changes every stored challenge
   * replay. That is only
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
    // The messages are unchanged. Only the type is new: these three branches
    // already knew which refusal this was, and now say so in a way a caller
    // can read without parsing English (#187 finding 2).
    if (sequence < this._expectedSequence) {
      throw new CommandRejectedError('duplicate-sequence', `Duplicate command sequence: ${sequence}`);
    }
    if (sequence > this._expectedSequence) {
      throw new CommandRejectedError(
        'sequence-gap',
        `Command sequence gap: expected ${this._expectedSequence}, got ${sequence}`,
      );
    }
    if (executeAtTick < this._tick) {
      throw new CommandRejectedError(
        'past-tick',
        `Cannot schedule command in the past: tick ${executeAtTick} < current ${this._tick}`,
      );
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

    /*
     * 1. Apply commands due at this tick.
     *
     * Reading the head into a local keeps the queue safe under
     * noUncheckedIndexedAccess while preserving deterministic ordering.
     *
     * **`> this._tick`, not `!== this._tick`.** `_commands` is sorted by
     * `(executeAtTick, sequence)`, so this is a head-of-queue test, and a
     * strict inequality against the current tick did not skip a command whose
     * tick had already passed -- it left it at the head and broke out of the
     * loop on it again on every subsequent tick. Every command behind it was
     * then never dispatched for the rest of the session, with no throw, no
     * refusal and no log entry: the player's input silently stopped having any
     * effect, while the worker went on acknowledging each new order as
     * `queued` (which was true, and which is why nothing surfaced).
     *
     * That the queue must drain rather than wedge is not the interesting part;
     * *how* it drains is, and both halves come from the ADRs rather than from
     * preference here:
     *
     * - Execute late, rather than skip.
     *   [ADR 0020](../../../docs/adr/0020-deterministic-kernel.md): "At the
     *   start of a tick, **all due commands** are dispatched in strict
     *   sequence order before any systems run." A command whose tick has
     *   passed is due, so `!==` never implemented that sentence for it.
     * - And rather than *drop*, which was the other defensible reading.
     *   ADR 0009 makes the command stream replay evidence, and `Undo`/`Redo`
     *   travel in that same stream and count positions in it. Discarding a
     *   command would put a hole in the log a replay reproduces from -- a
     *   later `Undo` would undo a different order than it did live -- so
     *   dropping is actively corrupting where executing late is merely late.
     *   Every client restoring the same snapshot dispatches it on the same
     *   tick, so late is still deterministic.
     *
     * This branch changes nothing for any session that has not been restored
     * from a malformed snapshot, and that is stated as a property rather than
     * assumed: `submitCommand` refuses `executeAtTick < this._tick`, and this
     * loop dispatches everything at `executeAtTick === this._tick` before step
     * 3 advances the tick, so a live queue always satisfies
     * `executeAtTick >= this._tick`. An overdue head can therefore only reach
     * here through `restoreState`/`Kernel.restore` -- in practice from a save
     * file, whose schema validates `tick` and each `executeAtTick` as
     * independent non-negative integers and never the relation between them.
     * Validating that relation at the save boundary would make this branch
     * unreachable again, and it belongs there rather than here.
     * `tests/determinism/kernel-system-order.test.ts` pins all three claims.
     */
    while (true) {
      const nextCommand = this._commands[0];
      if (nextCommand === undefined || nextCommand.executeAtTick > this._tick) break;

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
