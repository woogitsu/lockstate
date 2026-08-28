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
    // `this._tick`, and deliberately **not** the highest `executeAtTick`
    // already queued. A fourth refusal for that was considered and declined:
    // the HUD legitimately backdates an order relative to the queue whenever a
    // player gives one and then pauses inside its lead, and because a paused
    // clock runs no tick, the command ahead never drains -- so refusing would
    // disable input for the whole pause, and for the first order after loading
    // a save that carries pending commands. See ADR 0020, *"`submitCommand`
    // keeps admitting a command scheduled behind one already queued"*, and
    // `tests/determinism/command-queue-admission.test.ts`.
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

  /**
   * Dispatches every command whose tick has arrived, and advances nothing.
   *
   * **This is step 1 of `step()`, and it is the whole of what this method
   * does.** It moves no tick, runs no system and touches no RNG stream of its
   * own -- it hands the handler the same `SimulationContext` `step()` would
   * have handed it at this tick. Factoring it out is what lets the worker
   * dispatch a command a player gave while the clock is paused, which is ADR
   * 0051 ("What a player sees for an order given while the clock is paused").
   *
   * **Why that is not a determinism change**, stated as the property rather
   * than as reassurance: `_commands` is sorted by `(executeAtTick, sequence)`
   * and drained from the head, so a command dispatched here at tick *N* is
   * dispatched at tick *N*, before any system has run at tick *N* -- exactly
   * where `step()` would have dispatched it. A replay from a snapshot taken
   * before the pause re-dispatches it in the same position; a snapshot taken
   * during the pause carries its effect and no longer carries the command.
   * `tests/determinism/clock-transport.test.ts` is the guard that a pause
   * changes no tick, and it still holds: nothing here produces a tick.
   *
   * **Nothing in `Kernel` calls this by itself.** A caller that wants the
   * ordinary loop calls `step()`; this is for the one caller that wants the
   * dispatch without the tick.
   *
   * @returns how many commands were dispatched, so a caller can tell "nothing
   * was due" from "something happened" without inspecting the queue.
   */
  public dispatchDueCommands(): number {
    return this.dispatchDue({ tick: this._tick, rng: this._rng });
  }

  public step(): void {
    const context: SimulationContext = {
      tick: this._tick,
      rng: this._rng,
    };

    // 1. Apply commands due at this tick. See `dispatchDue` for why the loop
    //    lives in a method of its own and what its head test means.
    this.dispatchDue(context);

    // 2. Execute systems due at this tick based on their schedule
    for (const system of this._systems) {
      if (this._tick % system.schedule.intervalTicks === system.schedule.phaseTicks) {
        system.update(context);
      }
    }

    // 3. Advance tick
    this._tick++;
  }

  /**
   * The drain loop, called by `step()` at the start of a tick and by
   * `dispatchDueCommands` on its own.
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
   *   [ADR 0020](../../../docs/adr/0020-deterministic-kernel.md), as
   *   corrected by its 2026-08-27 amendment: "at the start of a tick, every
   *   command whose `executeAtTick` has arrived or passed is dispatched
   *   before any system runs, in ascending `(executeAtTick, sequence)`
   *   order." A command whose tick has passed is due, so `!==` never
   *   implemented that sentence for it. The load-bearing half is unchanged
   *   by the amendment -- when #422 quoted this sentence the wording was
   *   "all due commands ... in strict sequence order", and it was the "all
   *   due" that decided this branch, not the key.
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
   *
   * **A live queue satisfying `executeAtTick >= this._tick` is not the same
   * property as its ticks being non-decreasing in `sequence`, and only the
   * first is guaranteed.** `submitCommand` compares the incoming tick against
   * the *current* tick and deliberately not against the highest tick already
   * queued, so a later command can sit ahead of an earlier one and dispatch
   * first -- which the HUD reaches whenever a player gives an order and then
   * pauses inside its twenty-tick lead. That is a decision and not an
   * oversight: ADR 0020's section *"`submitCommand` keeps admitting a command
   * scheduled behind one already queued"* records it, with what refusing
   * would have cost, and `tests/determinism/command-queue-admission.test.ts`
   * guards it.
   */
  private dispatchDue(context: SimulationContext): number {
    let dispatched = 0;
    while (true) {
      const nextCommand = this._commands[0];
      if (nextCommand === undefined || nextCommand.executeAtTick > this._tick) break;

      const command = this._commands.shift();
      if (command === undefined) break;
      this._commandHandler(command, context);
      dispatched += 1;
    }
    return dispatched;
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
   *
   * ### RNG streams **merge** onto the kernel's own, they do not replace them
   *
   * This line used to be `this._rng = new NamedRngStreams(snapshot.rngStates)`
   * -- replace, not merge -- and it was issue #415: the four streams the
   * runtime factory had derived from `masterSeed` a moment earlier
   * (`runtime/new-session.ts`) were discarded wholesale, so a bundle that
   * omitted one restored **silently** and then threw
   * `RangeError: Unknown RNG stream` out of `step()` at the first draw,
   * between 5 and 600 ticks later depending on what the player did. The
   * worker's tick-loop catch turns that into a non-recoverable
   * `internal-error` fault, which is terminal
   * (`simulation/worker/state-machine.ts`). The repository's own
   * `tests/fixtures/persistence/save-v1-fresh-prison.json` carries
   * `"rngStates": []` and detonated on the player's first Admit.
   *
   * The expected set needs no declaration here and none is added: the kernel
   * this method is called on **already holds** exactly the streams this build
   * registers, correctly derived. Merging over them rather than replacing them
   * is what stops the discard, and it means:
   *
   * - a stream the bundle carries **wins**, so a restore is still exact for
   *   every stream the save actually recorded;
   * - a stream this build registers and the bundle omits keeps the state
   *   `deriveXoshiroState(masterSeed, name)` already gave it, which is
   *   identical on every client loading that bundle (ADR 0038 §2);
   * - a stream the bundle carries and this build does not register is **kept**,
   *   never dropped, so loading a save is not lossy (ADR 0038 §3).
   *
   * The incoming states are still constructed through `NamedRngStreams` first,
   * so its name-shape and uniqueness rejections (`rng/streams.ts`) fire exactly
   * as before -- merging through a `Map` alone would have swallowed a duplicate
   * name that the save boundary is supposed to refuse. Order is canonical
   * either way: `snapshot()` sorts by name.
   */
  public restoreState(snapshot: KernelSnapshot): void {
    if (!Number.isInteger(snapshot.tick) || snapshot.tick < 0) throw new RangeError('Tick must be a non-negative integer.');
    if (!Number.isInteger(snapshot.expectedSequence) || snapshot.expectedSequence < 0) throw new RangeError('Sequence must be a non-negative integer.');
    this._tick = snapshot.tick;
    this._expectedSequence = snapshot.expectedSequence;
    const merged = new Map<string, NamedRngStreamState>();
    for (const entry of this._rng.snapshot()) merged.set(entry.name, entry);
    for (const entry of new NamedRngStreams(snapshot.rngStates).snapshot()) merged.set(entry.name, entry);
    // Sorted by name rather than handed over in `Map` insertion order. Both
    // inputs are already canonical -- `snapshot()` sorts -- so this walk is
    // deterministic either way and the resulting instance's own `snapshot()`
    // would re-sort regardless. It sorts anyway because
    // `docs/DETERMINISM.md`'s canonical-iteration rule is about the order an
    // enumeration *reaches*, not about whether reverting it would change an
    // answer today, and this array is what the next kernel's stream map is
    // built from.
    this._rng = new NamedRngStreams([...merged.values()].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)));
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
