import type { OptionalRenderSceneMode, PreparedProductionRenderScene } from './production-render-bootstrap';

export interface LiveRendererSelectionPorts<TScene> {
  /** Uses the existing render feed and tools; never creates a simulation worker. */
  readonly prepare: (mode: OptionalRenderSceneMode) => Promise<TScene>;
  readonly activate: (scene: TScene) => Promise<void>;
  /** Must stop/remove the scene so its global input listeners are withdrawn. */
  readonly deactivate: (scene: TScene) => void;
  readonly unavailable: (error: unknown) => void;
  readonly changed: (selection: PreparedProductionRenderScene<TScene, TScene>) => void;
}

/** Serial renderer-only replacement. A failed preparation leaves the live scene alone. */
export class LiveRendererSelection<TScene> {
  private selection: PreparedProductionRenderScene<TScene, TScene> | undefined;
  private tail: Promise<void> = Promise.resolve();

  public constructor(initial: PreparedProductionRenderScene<TScene, TScene>, private readonly ports: LiveRendererSelectionPorts<TScene>) {
    this.selection = initial;
  }

  public get current(): PreparedProductionRenderScene<TScene, TScene> | undefined { return this.selection; }

  public select(mode: OptionalRenderSceneMode): Promise<void> {
    const request = this.tail.then(() => this.replace(mode));
    this.tail = request.catch(() => undefined);
    return request;
  }

  private async replace(mode: OptionalRenderSceneMode): Promise<void> {
    if (mode === this.selection?.mode) return;
    const previous = this.selection;
    // Catalogue/network validation must precede withdrawing a playable scene.
    const next = await this.ports.prepare(mode);
    if (previous !== undefined) this.ports.deactivate(previous.scene);
    try {
      await this.ports.activate(next);
    } catch (error) {
      this.ports.deactivate(next);
      let restored: TScene | undefined;
      try {
        // Cached catalogues belong to the adapter: recovery must not refetch the old mode.
        if (previous === undefined) throw error;
        restored = await this.ports.prepare(previous.mode);
        await this.ports.activate(restored);
        this.selection = {mode: previous.mode, scene: restored};
        this.ports.changed(this.selection);
      } catch (rollbackError) {
        if (restored !== undefined) this.ports.deactivate(restored);
        this.selection = undefined;
        const failure = new AggregateError([error, rollbackError], 'Renderer replacement and recovery failed');
        this.ports.unavailable(failure);
        throw failure;
      }
      throw error;
    }
    this.selection = {mode, scene: next};
    this.ports.changed(this.selection);
  }
}
