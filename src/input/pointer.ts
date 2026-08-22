import type { ActionId, InputContextId, SemanticActionEvent } from './actions';

export interface PointerEventLike {
  readonly pointerId: number;
  readonly pointerType: 'mouse' | 'pen' | 'touch';
  readonly button?: number;
}

/**
 * Normalizes the semantic actions that do not need gesture recognition.
 * Pan, pinch, drag thresholds and gesture arbitration are owned by Issue #11.
 */
export class PointerInputAdapter {
  private readonly activePointers = new Set<number>();

  public constructor(private readonly activeContexts: () => readonly InputContextId[]) {}

  public pointerDown(event: PointerEventLike): readonly SemanticActionEvent[] {
    if (event.pointerType === 'mouse' && event.button !== undefined && event.button !== 0) return [];
    if (this.activePointers.has(event.pointerId)) return [];
    this.activePointers.add(event.pointerId);
    const action = this.primaryAction();
    return action === undefined ? [] : [{ action, phase: 'started', source: 'pointer' }];
  }

  public pointerUp(event: PointerEventLike): readonly SemanticActionEvent[] {
    if (!this.activePointers.delete(event.pointerId)) return [];
    const action = this.primaryAction();
    return action === undefined ? [] : [{ action, phase: 'ended', source: 'pointer' }];
  }

  public pointerCancel(event: PointerEventLike): readonly SemanticActionEvent[] {
    this.activePointers.delete(event.pointerId);
    return this.activeContexts().includes('construction')
      ? [{ action: 'build.cancel', phase: 'started', source: 'pointer' }]
      : [];
  }

  private primaryAction(): ActionId | undefined {
    const contexts = this.activeContexts();
    if (contexts.includes('construction')) return 'build.confirm';
    if (contexts.includes('world')) return 'selection.primary';
    return undefined;
  }
}
