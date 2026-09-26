/**
 * Who currently physically holds a contraband item -- issue #27's
 * "possession/stash/container integration with inventories." `'container'`
 * is a real `operations/inventory.ts` `Container` id (e.g. an incoming
 * delivery crate awaiting inspection); `'cell'` is a `RoomInstanceRegistry`
 * instance id (a stash hidden in a specific room); `'prisoner'`/`'staff'`
 * are `EntityStore` ids from `PrisonerOperationsRuntime`/`GuardRoster`
 * respectively -- two separate entity-id spaces, so the holder kind
 * disambiguates which registry a numeric id refers to (mirroring
 * `RouteContext.role`'s own `'staff' | 'prisoner'` split).
 */
export type ContrabandHolderKind = 'prisoner' | 'staff' | 'cell' | 'container';

export interface ContrabandHolder {
  readonly kind: ContrabandHolderKind;
  readonly id: string;
}

/** Where a contraband instance first entered the prison -- issue #27's "introduction routes through deliveries, visits, staff/prisoner actions and room/object sources." */
export type ContrabandSourceType = 'delivery' | 'visit' | 'staff' | 'prisoner' | 'room-object';

export interface ContrabandProvenance {
  readonly sourceType: ContrabandSourceType;
  readonly sourceId: string;
  readonly introducedAtTick: number;
}

/**
 * Where an item's lifecycle has got to.
 *
 * `'departed'` is the third state and it arrived with the intake introduction
 * route (ADR 0061): once contraband can enter on an arriving prisoner, it has
 * to be able to leave with them. A prisoner who is discharged, or who gets out
 * through an escape attempt nobody contained, takes whatever they were
 * concealing with them -- and the alternative was worse in both directions.
 * Deleting the record would break "every contraband item has stable
 * identity/provenance sufficient for debugging and evidence" (issue #27) and
 * `getMovementHistory` with it; leaving it `'concealed'` at a holder key naming
 * a destroyed entity would leave `byHolder` answering for a prisoner who no
 * longer exists and would keep the item counted for ever by anything that
 * totals what the prison is holding.
 *
 * It is deliberately *not* a fourth way for an item to leave circulation from
 * inside the prison: nothing confiscates, consumes or destroys an item here.
 * The only thing that produces it is a holder leaving.
 */
export type ContrabandState = 'concealed' | 'confiscated' | 'departed';

export interface ContrabandMovementEntry {
  readonly holder: ContrabandHolder;
  readonly atTick: number;
}

/** Read-only view -- every field is a primitive or already-immutable data, so a future UI/debug surface can hold one without a mutable reference back into the registry (architecture notes: "hidden simulation state and player-visible intelligence projections are distinct"). */
export interface ContrabandItemView {
  readonly id: string;
  readonly categoryId: string;
  readonly provenance: ContrabandProvenance;
  readonly holder: ContrabandHolder;
  readonly state: ContrabandState;
}

interface ContrabandRecord {
  readonly id: string;
  readonly categoryId: string;
  readonly provenance: ContrabandProvenance;
  holder: ContrabandHolder;
  state: ContrabandState;
  readonly movementLog: ContrabandMovementEntry[];
}

function holderKey(holder: ContrabandHolder): string {
  return `${holder.kind}:${holder.id}`;
}

function toView(record: ContrabandRecord): ContrabandItemView {
  return { id: record.id, categoryId: record.categoryId, provenance: record.provenance, holder: record.holder, state: record.state };
}

/**
 * Every contraband instance's stable identity and full lifecycle --
 * issue #27's "every contraband item has stable identity/provenance
 * sufficient for debugging and evidence." `introduce` is the one and only
 * entry point that creates an item (no fabricated stock); `moveHolder`
 * is the one and only way possession changes (recorded in `movementLog`,
 * satisfying "debug tooling can trace an item's source and movement");
 * `confiscate` is the one and only way an item leaves circulation. There
 * is deliberately no "destroy"/"consume" beyond confiscation -- disposal
 * of confiscated evidence is a future incident/disciplinary concern (#28),
 * out of scope here.
 *
 * `byHolder` is indexed (not a full scan), per issue #27's explicit
 * performance requirement to "use indexed targets/containers; avoid
 * scanning every entity/item for each search tick" -- a confiscated item
 * is removed from the holder index immediately (it's no longer concealed
 * anywhere), so `byHolder` only ever returns items actually searchable at
 * that holder.
 */
export class ContrabandRegistry {
  private readonly records = new Map<string, ContrabandRecord>();
  private readonly idsByHolderKey = new Map<string, Set<string>>();

  private indexAdd(holder: ContrabandHolder, itemId: string): void {
    const key = holderKey(holder);
    let bucket = this.idsByHolderKey.get(key);
    if (bucket === undefined) {
      bucket = new Set();
      this.idsByHolderKey.set(key, bucket);
    }
    bucket.add(itemId);
  }

  private indexRemove(holder: ContrabandHolder, itemId: string): void {
    this.idsByHolderKey.get(holderKey(holder))?.delete(itemId);
  }

  private require(itemId: string): ContrabandRecord {
    const record = this.records.get(itemId);
    if (record === undefined) throw new RangeError(`Unknown contraband item id "${itemId}".`);
    return record;
  }

  public introduce(itemId: string, categoryId: string, holder: ContrabandHolder, provenance: ContrabandProvenance): void {
    if (this.records.has(itemId)) throw new RangeError(`Duplicate contraband item id "${itemId}".`);
    const record: ContrabandRecord = { id: itemId, categoryId, provenance, holder, state: 'concealed', movementLog: [{ holder, atTick: provenance.introducedAtTick }] };
    this.records.set(itemId, record);
    this.indexAdd(holder, itemId);
  }

  /** Moves a still-concealed item to a new holder -- a prisoner passing it on, staff relocating a stash, or a delivery being unpacked into a cell. */
  public moveHolder(itemId: string, holder: ContrabandHolder, atTick: number): void {
    const record = this.require(itemId);
    if (record.state !== 'concealed') throw new RangeError(`Contraband item "${itemId}" is not concealed (state: "${record.state}").`);
    this.indexRemove(record.holder, itemId);
    record.holder = holder;
    record.movementLog.push({ holder, atTick });
    this.indexAdd(holder, itemId);
  }

  /** The only way an item leaves circulation. Removed from the holder index -- a confiscated item is no longer concealed anywhere and will not appear in a future search of its last holder. */
  public confiscate(itemId: string): ContrabandItemView {
    const record = this.require(itemId);
    if (record.state !== 'concealed') throw new RangeError(`Contraband item "${itemId}" is not concealed (state: "${record.state}").`);
    this.indexRemove(record.holder, itemId);
    record.state = 'confiscated';
    return toView(record);
  }

  /**
   * Every still-concealed item at this holder leaves the prison with them, in
   * ascending item id.
   *
   * The counterpart of `introduce` for a holder that stops existing, and it is
   * `'departed'` rather than `confiscate` because nobody found these: a
   * confiscation is evidence, it records a finding guard and a search order,
   * and `buildDisciplinaryIndex` charges the holder a point for it
   * (`src/simulation/prisoners/disciplinary-record.ts`). Charging a prisoner on
   * the way out for something the prison never discovered would be a finding
   * the prison never made.
   *
   * Answers the ids it moved so a caller can log or count them; it is a no-op
   * for a holder that never held anything, which is the ordinary case on every
   * discharge.
   */
  public departHolder(kind: ContrabandHolderKind, id: string, atTick: number): readonly string[] {
    const bucket = this.idsByHolderKey.get(holderKey({ kind, id }));
    if (bucket === undefined || bucket.size === 0) return [];
    const departed = [...bucket].sort();
    for (const itemId of departed) {
      const record = this.require(itemId);
      record.state = 'departed';
      record.movementLog.push({ holder: record.holder, atTick });
    }
    bucket.clear();
    return departed;
  }

  public get(itemId: string): ContrabandItemView | undefined {
    const record = this.records.get(itemId);
    return record === undefined ? undefined : toView(record);
  }

  /** Indexed: only items currently concealed at this exact holder, never a full scan. Deterministic: sorted by item id. */
  public byHolder(kind: ContrabandHolderKind, id: string): readonly ContrabandItemView[] {
    const ids = this.idsByHolderKey.get(holderKey({ kind, id }));
    if (ids === undefined || ids.size === 0) return [];
    return [...ids].sort().map((itemId) => toView(this.require(itemId)));
  }

  /** Deterministic: sorted by id. Debug/audit surface, not a normal-UI projection (architecture notes: hidden state stays hidden from ordinary play). */
  public all(): readonly ContrabandItemView[] {
    return [...this.records.keys()].sort().map((id) => toView(this.require(id)));
  }

  /** Full source-to-present movement history for one item -- debug tooling only (architecture notes: "debug tooling can trace an item's source and movement without exposing it in normal UI"). */
  public getMovementHistory(itemId: string): readonly ContrabandMovementEntry[] {
    return [...this.require(itemId).movementLog];
  }

  public getSnapshot(): readonly (readonly [string, Omit<ContrabandRecord, 'id'>])[] {
    return [...this.records.keys()].sort().map((id) => {
      const { id: _id, ...rest } = this.require(id);
      return [id, { ...rest, holder: { ...rest.holder }, movementLog: rest.movementLog.map((entry) => ({ ...entry })) }] as const;
    });
  }

  public loadSnapshot(snapshot: ReturnType<ContrabandRegistry['getSnapshot']>): void {
    this.records.clear();
    this.idsByHolderKey.clear();
    for (const [id, rest] of snapshot) {
      const record: ContrabandRecord = { id, ...rest, movementLog: rest.movementLog.map((entry) => ({ ...entry })) };
      this.records.set(id, record);
    }
    // The save reader accepts repeated ids. Only the final record survives in
    // records, so derive holder indexes from that same final state.
    for (const id of [...this.records.keys()].sort()) {
      const record = this.require(id);
      if (record.state === 'concealed') this.indexAdd(record.holder, id);
    }
  }
}
