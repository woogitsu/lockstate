import type { SimulationContext, SystemRegistration } from '../kernel/system';

/**
 * Who an intelligence record is about. `'sector'` is a broad, unlocated
 * suspicion (feeds a sector-sweep decision without pointing at one cell or
 * person); `'prisoner'`/`'staff'` and `'cell'` mirror
 * `ContrabandHolderKind`'s own vocabulary so a tip and a search target use
 * the same identity space.
 */
export type IntelligenceTargetKind = 'prisoner' | 'staff' | 'cell' | 'sector';

export type IntelligenceSourceType = 'informant' | 'observation' | 'search-residue';

/**
 * Architecture notes: "intelligence decays/expires and carries
 * uncertainty; it is not a permanent truth flag." `confidence` (0-1) is
 * the *only* mutable field -- everything else about a tip (who/what it's
 * about, where it came from, when it was made) is immutable history.
 */
export interface IntelligenceRecord {
  readonly id: string;
  readonly targetKind: IntelligenceTargetKind;
  readonly targetId: string;
  readonly categoryHint?: string;
  readonly confidence: number;
  readonly sourceType: IntelligenceSourceType;
  readonly createdAtTick: number;
}

interface IntelligenceMutableRecord {
  targetKind: IntelligenceTargetKind;
  targetId: string;
  categoryHint: string | undefined;
  confidence: number;
  sourceType: IntelligenceSourceType;
  createdAtTick: number;
}

function targetKey(targetKind: IntelligenceTargetKind, targetId: string): string {
  return `${targetKind}:${targetId}`;
}

function toRecord(id: string, mutable: IntelligenceMutableRecord): IntelligenceRecord {
  return { id, targetKind: mutable.targetKind, targetId: mutable.targetId, ...(mutable.categoryHint !== undefined ? { categoryHint: mutable.categoryHint } : {}), confidence: mutable.confidence, sourceType: mutable.sourceType, createdAtTick: mutable.createdAtTick };
}

/** Below this, a record no longer represents actionable suspicion and is dropped rather than lingering at a meaningless confidence. */
export const MIN_INTELLIGENCE_CONFIDENCE = 0.05;

/**
 * Suspicion/intelligence storage -- issue #27's "suspicion/intelligence
 * records with source, confidence, expiry and target scope." Indexed by
 * target (not a full scan) so `SearchSystem` can cheaply look up existing
 * suspicion about the exact target it's about to search, per the issue's
 * "avoid scanning every entity/item" performance requirement.
 *
 * ### Identifier category (ADR 0012)
 *
 * `intel.<n>` is an **allocated identity** (category 1), stated here because
 * ADR 0012's "Neither category may be left implicit" requires the declaring
 * module to say so. The counter is owned by this class, is part of this
 * subsystem's snapshot, and the id is carried rather than re-derived.
 *
 * ADR 0012's Decision asserted this subsystem "already satisfied" that; it did
 * not, and the ADR's own Context table records why in the same breath --
 * *"restored from max suffix"*. `decayAll` deletes expired records, so the
 * maximum surviving suffix is a lower bound on what has been minted and not
 * the counter. Measured before the fix: three reports, one decayed away, then
 * one more report -- a continuous run mints `intel.4` and a run restored from
 * that same save mints `intel.3`. The id had already crossed a save boundary
 * (it is the key of every row in the payload's `intelligence` array), which is
 * precisely the condition ADR 0012's Context warns turns this shape into a
 * defect.
 */
export class IntelligenceLedger {
  private readonly records = new Map<string, IntelligenceMutableRecord>();
  private readonly idsByTargetKey = new Map<string, Set<string>>();
  private sequence = 0;

  /** Creates a new record -- the one and only way one enters the ledger, whether from an informant tip, a staff observation, or search residue (a near-miss leaving a trace). Confidence is clamped to [0,1]. */
  public report(targetKind: IntelligenceTargetKind, targetId: string, confidence: number, sourceType: IntelligenceSourceType, tick: number, categoryHint?: string): string {
    this.sequence += 1;
    const id = `intel.${this.sequence}`;
    const clamped = Math.max(0, Math.min(1, confidence));
    this.records.set(id, { targetKind, targetId, categoryHint, confidence: clamped, sourceType, createdAtTick: tick });
    const key = targetKey(targetKind, targetId);
    let bucket = this.idsByTargetKey.get(key);
    if (bucket === undefined) {
      bucket = new Set();
      this.idsByTargetKey.set(key, bucket);
    }
    bucket.add(id);
    return id;
  }

  public get(id: string): IntelligenceRecord | undefined {
    const record = this.records.get(id);
    return record === undefined ? undefined : toRecord(id, record);
  }

  /** Indexed, deterministic: sorted by record id. */
  public forTarget(targetKind: IntelligenceTargetKind, targetId: string): readonly IntelligenceRecord[] {
    const ids = this.idsByTargetKey.get(targetKey(targetKind, targetId));
    if (ids === undefined || ids.size === 0) return [];
    return [...ids].sort().map((id) => toRecord(id, this.records.get(id)!));
  }

  /** Deterministic: sorted by id. */
  public all(): readonly IntelligenceRecord[] {
    return [...this.records.keys()].sort().map((id) => toRecord(id, this.records.get(id)!));
  }

  /** Decays every record's confidence by a fixed amount; a record that decays to/below `MIN_INTELLIGENCE_CONFIDENCE` expires and is dropped -- "intelligence decays/expires," never a permanent truth flag. */
  public decayAll(amount: number): void {
    for (const [id, record] of [...this.records.entries()]) {
      record.confidence -= amount;
      if (record.confidence <= MIN_INTELLIGENCE_CONFIDENCE) {
        this.records.delete(id);
        this.idsByTargetKey.get(targetKey(record.targetKind, record.targetId))?.delete(id);
      }
    }
  }

  public getSnapshot(): readonly (readonly [string, IntelligenceMutableRecord])[] {
    return [...this.records.keys()].sort().map((id) => [id, { ...this.records.get(id)! }] as const);
  }

  /**
   * The allocation counter, so a save can carry it (ADR 0012 category 1).
   *
   * `getSnapshot` cannot: the ledger's records are the ids that *survive*, and
   * `decayAll` deletes expired ones -- so the maximum surviving suffix is a
   * lower bound on what has been minted, not the counter. Reconstructing the
   * counter from the records is exactly the derivation this exists to stop
   * being the only option.
   */
  public getSequence(): number {
    return this.sequence;
  }

  /**
   * `sequence` is the counter the writing session held, and is **optional**.
   *
   * Absent, the counter is derived from the maximum surviving id suffix --
   * which is what this method did unconditionally before the field existed,
   * so a save written by an older build restores exactly as it did (ADR 0038
   * §1: absence is a fact about the save's age, honoured with the value the
   * writing build would have held). That is why the save schema needs no
   * version bump for it.
   *
   * The recorded value is taken as a **floor, not as gospel**:
   * `Math.max(maxSequence, sequence)`. ADR 0012 category 1 requires the
   * counter be restored "such that no future id can collide with a restored
   * one", and a save whose recorded counter disagrees with its own records --
   * hand-edited, or corrupted below the checksum's notice -- would otherwise
   * re-mint an id that is still live in the same ledger. The floor makes the
   * requirement hold for any input rather than for well-formed input.
   */
  public loadSnapshot(snapshot: ReturnType<IntelligenceLedger['getSnapshot']>, sequence?: number): void {
    this.records.clear();
    this.idsByTargetKey.clear();
    let maxSequence = 0;
    for (const [id, record] of snapshot) {
      this.records.set(id, { ...record });
      const key = targetKey(record.targetKind, record.targetId);
      let bucket = this.idsByTargetKey.get(key);
      if (bucket === undefined) {
        bucket = new Set();
        this.idsByTargetKey.set(key, bucket);
      }
      bucket.add(id);
      const numericSuffix = Number(id.slice('intel.'.length));
      if (Number.isFinite(numericSuffix)) maxSequence = Math.max(maxSequence, numericSuffix);
    }
    this.sequence = sequence === undefined ? maxSequence : Math.max(maxSequence, sequence);
  }
}

/** How much confidence decays each time this system runs -- a directional default, not a committed balance figure (per docs/BENCHMARKING.md's "no hard threshold without repeated controlled baselines" policy and issue #27's explicit "final balance of detection probabilities" out-of-scope note). */
export const DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL = 0.1;

/**
 * Runs intelligence decay on a fixed cadence, independent of any other
 * subsystem's scheduling -- decay is a property of the ledger itself, not
 * something `SearchSystem` or informant reporting needs to remember to
 * trigger.
 */
export class IntelligenceSystem implements SystemRegistration {
  public readonly id = 'contraband.intelligence';
  public readonly order = 265;
  public readonly schedule = { intervalTicks: 50, phaseTicks: 0 };

  public constructor(
    private readonly ledger: IntelligenceLedger,
    private readonly decayPerInterval: number = DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL,
  ) {}

  public update(_context: SimulationContext): void {
    this.ledger.decayAll(this.decayPerInterval);
  }
}
