import type { Xoshiro128StarStar } from '../rng/xoshiro128starstar';
import type { IntelligenceLedger, IntelligenceTargetKind } from './intelligence';

export type InformantHolderKind = 'prisoner' | 'staff';

export interface InformantRecord {
  readonly holderKind: InformantHolderKind;
  readonly holderId: string;
  /** 0-1: how much jitter/noise a tip from this informant carries -- not itself a confidence value (see `reportInformantTip`). */
  readonly reliability: number;
}

function key(holderKind: InformantHolderKind, holderId: string): string {
  return `${holderKind}:${holderId}`;
}

/**
 * Issue #27's "informant relationship hooks" -- deliberately a plain,
 * explicitly-set reliability score rather than anything derived from
 * traits/relationships, because issue #39 (traits/relationships, richer
 * informants) does not exist yet and "the base interface must work
 * without it" (issue #27's own stated dependency note). A future #39
 * integration recruits/adjusts reliability from trait data; nothing here
 * needs to change for that to slot in.
 */
export class InformantRegistry {
  private readonly informants = new Map<string, InformantRecord>();

  public recruit(holderKind: InformantHolderKind, holderId: string, reliability: number): void {
    const clamped = Math.max(0, Math.min(1, reliability));
    this.informants.set(key(holderKind, holderId), { holderKind, holderId, reliability: clamped });
  }

  public release(holderKind: InformantHolderKind, holderId: string): void {
    this.informants.delete(key(holderKind, holderId));
  }

  public isInformant(holderKind: InformantHolderKind, holderId: string): boolean {
    return this.informants.has(key(holderKind, holderId));
  }

  public getReliability(holderKind: InformantHolderKind, holderId: string): number | undefined {
    return this.informants.get(key(holderKind, holderId))?.reliability;
  }

  /** Deterministic: sorted by holder key. */
  public all(): readonly InformantRecord[] {
    return [...this.informants.keys()].sort().map((k) => this.informants.get(k)!);
  }

  public getSnapshot(): readonly InformantRecord[] {
    return this.all();
  }

  public loadSnapshot(snapshot: readonly InformantRecord[]): void {
    this.informants.clear();
    for (const record of snapshot) this.informants.set(key(record.holderKind, record.holderId), { ...record });
  }
}

/** Confidence jitter range around an informant's own reliability -- a tip is never a bare copy of reliability (architecture notes: intelligence "carries uncertainty"). */
const TIP_CONFIDENCE_JITTER = 0.2;

/**
 * The one hook this issue ships for turning an informant relationship into
 * an intelligence record -- a session/scenario (or, later, #39's richer
 * informant AI) calls this explicitly; nothing here decides *when* a tip
 * happens on its own. Uses the caller-supplied named RNG stream (issue
 * #27's "detection uses explicit factors and named RNG; one subsystem's
 * draws cannot perturb another") -- never a shared/global stream with
 * `SearchSystem`'s own detection draws.
 */
export function reportInformantTip(
  informants: InformantRegistry,
  ledger: IntelligenceLedger,
  informantHolderKind: InformantHolderKind,
  informantHolderId: string,
  targetKind: IntelligenceTargetKind,
  targetId: string,
  tick: number,
  rng: Xoshiro128StarStar,
  categoryHint?: string,
): string {
  const reliability = informants.getReliability(informantHolderKind, informantHolderId);
  if (reliability === undefined) throw new RangeError(`"${informantHolderKind}:${informantHolderId}" is not a recruited informant.`);
  const jitter = (rng.nextFloat() - 0.5) * TIP_CONFIDENCE_JITTER;
  return ledger.report(targetKind, targetId, reliability + jitter, 'informant', tick, categoryHint);
}
