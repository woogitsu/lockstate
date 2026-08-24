import type { MainToWorkerMessage } from '../protocol/types';
import type { SimulationClient, WorkerMessageHandler } from './client';

/**
 * The stable half of the channel: what a long-lived main-thread reader holds.
 *
 * `SimulationSnapshotFeed` and `SimulationCommandSender` each declare their
 * own structural slice of `SimulationClient` and are satisfied by this, which
 * is the point -- they are built once, at boot, and must keep working across
 * a worker swap without knowing one happened.
 */
export interface SimulationMessageChannel {
  addListener(handler: WorkerMessageHandler): void;
  send(message: MainToWorkerMessage): void;
}

/**
 * Owns the page's simulation worker, and gives every session a worker that
 * has never hosted one (issue #149).
 *
 * ### Why a session boundary is a `Worker` boundary
 *
 * `SimulationWorkerStateMachine.handleInitialize` accepts
 * `simulation/initialize` only while the worker is `uninitialized` and answers
 * anything later with `already-initialized`. That rule is deliberate -- a
 * worker holds one authoritative simulation and quietly replacing it mid-flight
 * is worse than refusing (ADR 0006) -- but `src/main.ts` used to build one
 * worker per *page*, so the first `createPrison` or `loadPrison` consumed it
 * and **every later load in that tab failed** with nothing the player could do
 * but reload the page.
 *
 * So the session boundary is now the worker itself: loading a prison means the
 * same thing as reloading the page, which is what a player expects. The
 * alternative shapes were considered in #149 and rejected there: a
 * `simulation/shutdown` back to `uninitialized` is the cheap version of this
 * one (and `shutting-down` is terminal in the machine as written), and making
 * `initialize` swap the runtime from `paused`/`running` would make the
 * worker's authoritative state replaceable by a message, which is exactly what
 * ADR 0006's state machine exists to prevent.
 *
 * ### The rule, stated so it needs no knowledge of the worker's own state
 *
 * **A worker that has been sent `simulation/initialize` is never sent
 * another.** Claiming consumes. That is total: it holds for a worker that
 * started a session, for one that *refused* a snapshot and is still
 * `uninitialized` in substance, and for one that faulted -- and the main
 * thread needs to know none of those apart to be correct. A rule that reused
 * an "unused" worker would have to read the worker's mind, and would hand the
 * next load a `faulted` worker on the one path that ends there
 * (`handleMessage`'s catch), which is #149 again by a different door.
 *
 * The boot worker is the one worker that is *not* wasted: `open()` constructs
 * it so a browser that cannot start one is discovered before the HUD mounts
 * (issue #82), and it has hosted nothing, so the first session runs in it.
 *
 * ### Order of disposal
 *
 * `claimForSession` terminates the outgoing worker **before** constructing its
 * replacement, so the page never holds two simulations at once. The cost is
 * stated rather than hidden: if the replacement cannot be constructed, this
 * page has no simulation at all until it is reloaded, which is precisely the
 * state issue #82's notice describes -- and `WorkerPerSessionHost` reports it
 * so the HUD says so, instead of the constructor throwing into a click
 * handler.
 */
export class SimulationWorkerChannel implements SimulationMessageChannel {
  private client: SimulationClient | undefined;
  /** Whether `this.client` has already been handed to a session. */
  private claimed = false;
  private readonly listeners = new Set<WorkerMessageHandler>();

  /**
   * `startClient` builds a client over a brand-new `Worker`. It is injected
   * rather than called here because only the composition root can hold Vite's
   * `?worker` import -- see `SimulationClient`'s constructor docs for why a
   * `new URL(...)` inside a class cannot survive a production build.
   */
  public constructor(private readonly startClient: () => SimulationClient) {}

  /**
   * Constructs the page's first worker.
   *
   * Throws whatever the `Worker` constructor threw, unwrapped: the caller is
   * `src/main.ts`, whose whole #82 contract is to catch exactly this and mount
   * the interface anyway.
   */
  public open(): void {
    if (this.client !== undefined) return;
    this.adopt(this.startClient());
  }

  /** True while this page has a worker to talk to. */
  public get isOpen(): boolean {
    return this.client !== undefined;
  }

  /**
   * A worker that has hosted no session, for a session that is about to start.
   *
   * Terminates the previous one first. Throws if a `Worker` cannot be
   * constructed, and the channel is then closed -- `isOpen` is false and
   * `send` refuses, rather than posting into a worker that is gone.
   */
  public claimForSession(): SimulationClient {
    let client = this.client;
    if (client === undefined || this.claimed) {
      this.close();
      client = this.startClient();
      this.adopt(client);
    }
    this.claimed = true;
    return client;
  }

  /** Terminates the current worker, if any. The channel's listeners outlive it. */
  public close(): void {
    this.client?.terminate();
    this.client = undefined;
    this.claimed = false;
  }

  /**
   * Registers a listener for as long as this page lasts, across every worker.
   *
   * The listener set belongs to the channel and not to any one worker, which
   * is what lets the renderer's feed and the command sender be built once at
   * boot: each new worker gets a single forwarder of the channel's own.
   */
  public addListener(handler: WorkerMessageHandler): void {
    this.listeners.add(handler);
  }

  public send(message: MainToWorkerMessage): void {
    const client = this.client;
    if (client === undefined) {
      throw new Error('There is no simulation worker on this page, so nothing can be sent to it.');
    }
    client.send(message);
  }

  private adopt(client: SimulationClient): void {
    this.client = client;
    this.claimed = false;
    client.addListener((message) => {
      // Only while it is the current worker. A message a terminated worker
      // posted before it stopped must not reach readers that have already
      // been told the session ended.
      if (this.client !== client) return;
      for (const listener of this.listeners) listener(message);
    });
  }
}
