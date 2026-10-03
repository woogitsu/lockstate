import type { ObjectPlacementPreflight } from '../simulation/objects/object-placement-service';
import type { SimulationMessageChannel } from '../simulation/worker/worker-channel';
import { SimulationProjectionRequester } from './simulation-projections';

/**
 * Preview freshness follows authoritative publications, not rendered geometry.
 * Paused command drains force status-counts even at the same tick; unsolicited
 * clock publications report dispatched running commands and completed work.
 * There is no animation-frame polling and an idle paused aim makes no requests.
 */
export class SimulationObjectPlacementPreviewRevision {
  private value = 0;
  private tick: number | undefined;

  public constructor(channel: SimulationMessageChannel, onSessionChanged: () => void, onStateChanged: () => void = () => {}) {
    channel.addListener(message => {
      if (message.kind === 'simulation/ready' || message.kind === 'simulation/stopped') {
        this.tick = undefined;
        this.value++;
        onSessionChanged();
      } else if (message.kind === 'simulation/status-counts') {
        this.tick = message.payload.tick;
        this.value++;
        onStateChanged();
      } else if (message.kind === 'simulation/clock-state' && message.replyTo === undefined && message.payload.tick !== this.tick) {
        this.tick = message.payload.tick;
        this.value++;
        onStateChanged();
      }
    });
  }

  public get revision(): number { return this.value; }
}

export interface ObjectPlacementPreviewTarget {
  readonly definitionId: string;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly quarterTurns?: 0 | 1 | 2 | 3;
}

/** Uses the existing correlated read channel; the caller owns selection/session validity. */
export function createSimulationObjectPlacementPreflight(channel: SimulationMessageChannel):
  (target: ObjectPlacementPreviewTarget) => Promise<ObjectPlacementPreflight> {
  const projections = new SimulationProjectionRequester(channel);
  return async target => {
    const reply = await projections.request<ObjectPlacementPreflight>('world/object-placement-preflight', {
      target: { kind: 'object-placement', ...target },
    });
    if (reply.view === undefined) throw new Error('The worker returned no object placement preflight.');
    return reply.view;
  };
}
