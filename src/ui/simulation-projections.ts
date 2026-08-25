import type {
  MainToWorkerMessage,
  ProjectionId,
  ProjectionTarget,
  WorkerToMainMessage,
} from '../simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../simulation/protocol/types';

/**
 * Asks the worker for a read model, and resolves when it answers.
 *
 * The third member of the family beside `./simulation-clock.ts` and
 * `./simulation-counts.ts`, and it lives here for the same reason they do: a
 * module that has to know both a protocol message and something the interface
 * paints may not sit inside `src/ui/hud/`, which imports nothing from
 * `src/simulation/**` (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`).
 *
 * It differs from those two in direction, and that is the point of the whole
 * change behind it. The clock and the counts are *publications*: the worker
 * decides when, and the main thread has only to map what arrived. A roster, a
 * room list or an incident history is a **pull** -- only an open panel wants
 * it, and only that panel knows which window of it. So this is a correlated
 * request/response pair (ADR 0003 decision 2), and every reply carries the
 * `messageId` of the request that asked for it.
 *
 * ## Why a class with its own pending map
 *
 * `WorkerSessionHost` already has this mechanism, and this is deliberately not
 * routed through it. That host is the *persistence* seam: it owns
 * `simulation/initialize`, `simulation/request-snapshot` and
 * `simulation/shutdown`, its lifetime is one session, and
 * `WorkerPerSessionHost` replaces it whenever a prison is loaded. A panel's
 * readouts are registered once at mount and have to keep working across a
 * worker swap without knowing one happened (#149), which is exactly why
 * `SimulationMessageChannel` exists and why `simulation-clock.ts` and
 * `simulation-counts.ts` read from it rather than from the host.
 *
 * ## What it does not do
 *
 * It does not cache, coalesce or re-request. A panel that wants a projection
 * refreshed asks again; a panel that is closed asks for nothing, which is what
 * makes the unbounded reads behind two of these projections (#157 finding 2)
 * cost nothing while nobody is looking at them. Adding a cache here would put
 * a second, stale copy of simulation state on the main thread, which is the
 * boundary this whole layer exists to keep.
 */

export interface ProjectionQuery {
  /** Rows to skip. Only meaningful on a projection with a list; the worker refuses it otherwise. */
  readonly offset?: number;
  /** Rows to build, capped by `MAX_PROJECTION_PAGE_LIMIT`. Refused on a projection with no list. */
  readonly limit?: number;
  /** Which row a detail projection is about. Refused when the projection takes no target. */
  readonly target?: ProjectionTarget;
}

/** The window the worker actually built, so a panel can size a scrollbar without asking for every row. */
export interface ProjectionPageInfo {
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}

export interface ProjectionReply<TView> {
  readonly projectionId: ProjectionId;
  /** The tick the projection was read at, not the tick it is painted on. */
  readonly tick: number;
  readonly page?: ProjectionPageInfo;
  /**
   * Absent when a detail projection was asked about a target that no longer
   * exists -- a prisoner released between the click and the reply. That is a
   * race a panel is expected to handle, not an error.
   */
  readonly view?: TView;
}

/** A `protocol/error` the worker sent in answer to a projection request. */
export class ProjectionRequestError extends Error {
  public constructor(
    public readonly code: string,
    detail: string,
  ) {
    super(`Simulation refused a projection request (${code}): ${detail}`);
    this.name = 'ProjectionRequestError';
  }
}

/** The slice of the channel this needs. Structural, so a test needs no worker. */
export interface ProjectionMessageChannel {
  addListener(handler: (message: WorkerToMainMessage) => void): void;
  send(message: MainToWorkerMessage): void;
}

export interface ProjectionRequesterOptions {
  /** Injectable so tests are not tied to `crypto.randomUUID` availability. */
  readonly generateMessageId?: () => string;
  /**
   * How long to wait for a reply. A worker that never answers must surface on
   * the panel that asked, not as a promise that never settles -- the same rule
   * `WorkerSessionHost` follows, and the same default.
   */
  readonly replyTimeoutMs?: number;
}

const DEFAULT_REPLY_TIMEOUT_MS = 15_000;

interface Pending {
  readonly resolve: (message: WorkerToMainMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class SimulationProjectionRequester {
  private readonly pending = new Map<string, Pending>();
  private readonly generateMessageId: () => string;
  private readonly replyTimeoutMs: number;

  public constructor(
    private readonly channel: ProjectionMessageChannel,
    options: ProjectionRequesterOptions = {},
  ) {
    this.generateMessageId = options.generateMessageId ?? (() => crypto.randomUUID());
    this.replyTimeoutMs = options.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS;
    this.channel.addListener((message) => this.handleMessage(message));
  }

  /**
   * A reply settles exactly the request whose id it names.
   *
   * An uncorrelated message settles nothing -- the two publications on this
   * boundary carry no `replyTo` precisely so they cannot resolve a pending
   * request that happens to share an id (ADR 0003 decision 2).
   */
  private handleMessage(message: WorkerToMainMessage): void {
    const replyTo = (message as { replyTo?: string }).replyTo;
    if (replyTo === undefined) return;
    const entry = this.pending.get(replyTo);
    if (entry === undefined) return;
    this.pending.delete(replyTo);
    clearTimeout(entry.timer);

    if (message.kind === 'protocol/error') {
      entry.reject(new ProjectionRequestError(message.payload.code, message.payload.message));
      return;
    }
    entry.resolve(message);
  }

  /**
   * `TView` is the caller's claim about which view model this id returns, and
   * it is a claim rather than a proof: the body crosses the boundary as an
   * opaque `versionedPayload` (see `simulation/projection`'s schema for why
   * that is the right shape for a family of eleven read models). What *is*
   * checked before this resolves is everything the envelope declares -- the
   * id, the tick, the page window and the payload's structured-clone safety --
   * because `decodeWorkerToMainMessage` has already run over the message.
   */
  public async request<TView>(projectionId: ProjectionId, query: ProjectionQuery = {}): Promise<ProjectionReply<TView>> {
    const messageId = this.generateMessageId();
    const reply = await new Promise<WorkerToMainMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        reject(new Error(`The simulation worker did not answer a "${projectionId}" request within ${this.replyTimeoutMs}ms.`));
      }, this.replyTimeoutMs);
      this.pending.set(messageId, { resolve, reject, timer });
      try {
        this.channel.send({
          protocolVersion: SIMULATION_PROTOCOL_VERSION,
          messageId,
          kind: 'simulation/request-projection',
          payload: {
            projectionId,
            // Spread rather than passed as `undefined`: the payload is
            // `.strict()` over optional fields, so "did not ask for a window"
            // has to be an absent key rather than a present one holding
            // nothing.
            ...(query.offset === undefined ? {} : { offset: query.offset }),
            ...(query.limit === undefined ? {} : { limit: query.limit }),
            ...(query.target === undefined ? {} : { target: query.target }),
          },
        });
      } catch (error) {
        this.pending.delete(messageId);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    if (reply.kind !== 'simulation/projection') {
      throw new Error(`Expected a projection reply, got "${reply.kind}".`);
    }
    if (reply.payload.projectionId !== projectionId) {
      // The worker answered about a different read model than the one asked
      // for. Correlation is by `messageId`, so this cannot happen by two
      // requests crossing; it would mean the worker mislabelled a reply, and
      // painting it would put one panel's data in another panel.
      throw new Error(`Asked for "${projectionId}" and the worker answered about "${reply.payload.projectionId}".`);
    }

    const { tick, page, view } = reply.payload;
    return {
      projectionId,
      tick,
      ...(page === undefined ? {} : { page }),
      ...(view === undefined ? {} : { view: view.data as TView }),
    };
  }

  /** Fails every request still in flight. For a panel or page that is going away. */
  public dispose(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('The projection requester was disposed.'));
    }
    this.pending.clear();
  }
}
