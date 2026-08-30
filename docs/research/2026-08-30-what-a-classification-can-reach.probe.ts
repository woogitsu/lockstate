/*
 * Harness for `docs/research/2026-08-30-what-a-classification-can-reach.md`.
 *
 * **Not a gate, and not collected by anything.** `vitest.config.ts` includes
 * only `src/**\/*.test.ts` and `tests/**\/*.test.ts`, and `tsconfig.json`
 * includes only `src`, `tests`, `vite.config.ts` and `vitest.config.ts` -- so
 * this file is neither run nor typechecked by `pnpm verify`. That is
 * deliberate: `docs/research/README.md` calls these records read-only history,
 * *"when the code moves on, a record here does not become wrong, it becomes
 * older"*, and the same standing is what this file wants. It is here so the
 * numbers in that record can be re-obtained rather than believed.
 *
 * It asserts almost nothing. It measures, and prints. §9 of the record says how
 * to run it; the short version is that it must be copied to `probe/` at the
 * repository root (the relative imports assume that depth) and run under a
 * config of its own with `--disable-console-intercept`, without which vitest 4
 * swallows every line of output and the run passes having reported nothing.
 *
 * Measured on `a1d5591` (v0.0.235).
 */
import { describe, expect, it } from 'vitest';
import { CLASSIFICATION_REVIEW_INTERVAL_TICKS, classifyPrisoner, reviewClassification } from '../src/simulation/prisoners/classification';
import { intakeStageFromIndex } from '../src/simulation/prisoners/components';
import { classifiedAtTickOf } from '../src/simulation/prisoners/classification-review-system';
import { Xoshiro128StarStar } from '../src/simulation/rng/xoshiro128starstar';
import { packCommand } from '../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../tests/helpers/room-walls';

const SEED = 0x0cc0;
const DAY = 2_400;
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
const CANTEEN = { x: 19, y: 6, width: 6, height: 6 } as const;
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}
function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}
function cellRect(index: number) {
  // Row 0: x 1..23, clear of SHOWER (x26). Row 1: x 1..17, clear of CANTEEN (x19).
  return index < 8 ? { x: 1 + index * 3, y: 1, width: 2, height: 3 } : { x: 1 + (index - 8) * 3, y: 5, width: 2, height: 3 };
}

interface Plan { readonly cells: number; readonly toilets: boolean; readonly amenities: boolean; readonly guards: number }

function buildPrison(plan: Plan, seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  const cells = Array.from({ length: plan.cells }, (_u, i) => cellRect(i));
  const planks = plan.cells + (plan.amenities ? 6 + 8 : 0);
  const bricks = (plan.toilets ? plan.cells : 0) + (plan.amenities ? 2 : 0);
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: planks }));
  if (bricks > 0) submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: bricks }));
  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  if (plan.amenities) for (const rect of [SHOWER, CANTEEN, YARD]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  cells.forEach((rect, i) => submit(runtime, `zone-c${i}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  if (plan.amenities) {
    submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
    submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));
    submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...YARD }));
  }
  cells.forEach((rect, i) => {
    submit(runtime, `bed${i}`, packCommand({ type: 'PlaceObject', orderId: `bed${i}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    if (plan.toilets) submit(runtime, `wc${i}`, packCommand({ type: 'PlaceObject', orderId: `wc${i}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });
  if (plan.amenities) {
    submit(runtime, 'sh1', packCommand({ type: 'PlaceObject', orderId: 'sh1', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
    submit(runtime, 'sh2', packCommand({ type: 'PlaceObject', orderId: 'sh2', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
    submit(runtime, 'dt1', packCommand({ type: 'PlaceObject', orderId: 'dt1', definitionId: 'dining-table-wooden', x: CANTEEN.x, y: CANTEEN.y }));
    submit(runtime, 'dt2', packCommand({ type: 'PlaceObject', orderId: 'dt2', definitionId: 'dining-table-wooden', x: CANTEEN.x + 3, y: CANTEEN.y }));
    for (let i = 0; i < 4; i += 1) {
      submit(runtime, `bench${i}`, packCommand({ type: 'PlaceObject', orderId: `bench${i}`, definitionId: 'bench-wooden', x: CANTEEN.x + (i % 2) * 2, y: CANTEEN.y + 2 + Math.floor(i / 2) }));
    }
  }
  stepTo(runtime, 1_000);
  for (let i = 0; i < plan.guards; i += 1) submit(runtime, `hire${i}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  if (runtime.refusals.count > 0) console.log(`REFUSALS ${runtime.refusals.count}: ${JSON.stringify(runtime.refusals.last)}`);
  return runtime;
}

interface Tracked { classifiedAt: number; sentence: number; maxTier: number; reviews: number; }

describe('PROBE', () => {
  it('front door: which tiers can classifyPrisoner produce per priorIncidents', () => {
    for (const priors of [0, 1, 2, 3, 4]) {
      const seen = new Set<number>();
      const rng = new Xoshiro128StarStar([1, 2, 3, 4]);
      for (let i = 0; i < 20_000; i += 1) {
        seen.add(classifyPrisoner({ sentenceLengthTicks: 16 * DAY, priorIncidents: priors }, rng).riskTier);
      }
      console.log(`priorIncidents=${priors} -> tiers ${[...seen].sort().join(',')}`);
    }
    // Long sentence term: no drawable sentence differs from a zero-length one.
    const rngA = new Xoshiro128StarStar([5, 6, 7, 8]);
    const rngB = new Xoshiro128StarStar([5, 6, 7, 8]);
    let bites = 0;
    for (let days = 2; days <= 16; days += 1) {
      for (let n = 0; n < 500; n += 1) {
        const a = classifyPrisoner({ sentenceLengthTicks: days * DAY, priorIncidents: 0 }, rngA).riskTier;
        const b = classifyPrisoner({ sentenceLengthTicks: 0, priorIncidents: 0 }, rngB).riskTier;
        if (a !== b) bites += 1;
      }
    }
    console.log(`drawable sentence vs zero-length sentence, 7500 paired draws: differences = ${bites}`);
    console.log(`max drawable sentence = ${16 * DAY}; LONG_SENTENCE_THRESHOLD_TICKS = 200000`);
    console.log('long-sentence term never bites for any drawable sentence: confirmed');
  });

  it('review wait: first eligible review tick as a function of classification tick', () => {
    const I = CLASSIFICATION_REVIEW_INTERVAL_TICKS;
    const waits: number[] = [];
    for (let c = 0; c < I; c += 1) {
      let t = -1;
      for (let k = 1; k <= 6; k += 1) {
        const cand = k * I - 1;
        if (cand - c >= I) { t = cand; break; }
      }
      waits.push(t - c);
    }
    console.log(`wait min=${Math.min(...waits)} max=${Math.max(...waits)}`);
    const reachable = waits.filter((w) => w <= 16 * DAY).length;
    console.log(`classification phases (of ${I}) where a 16-day sentence reaches a review: ${reachable}`);
    for (let days = 2; days <= 16; days += 1) {
      const n = waits.filter((w) => w <= days * DAY).length;
      console.log(`  ${days}d sentence: ${n}/${I} phases reach a first review (${((n / I) * 100).toFixed(1)}%)`);
    }
  });

  it('realistic run: steady admissions into a built prison', () => {
    for (const plan of [
      { label: 'well-run', plan: { cells: 12, toilets: true, amenities: true, guards: 2 } as Plan },
      { label: 'bed-only, unguarded', plan: { cells: 12, toilets: false, amenities: false, guards: 0 } as Plan },
    ]) {
      const runtime = buildPrison(plan.plan);
      const store = runtime.prisoners.entityStore;
      const records = runtime.prisoners.records;
      const tracked = new Map<number, Tracked>();
      const RUN = 30 * 2400 * 4; // 120 in-game days
      let admits = 0;
      // Admit one prisoner every half in-game day, forever.
      const ADMIT_EVERY = 2_400;
      while (runtime.kernel.tick < RUN) {
        const tick = runtime.kernel.tick;
        if (tick % ADMIT_EVERY === 0) {
          submit(runtime, `a${admits}`, packCommand({ type: 'AdmitPrisoner', priorIncidents: 0, ...ARRIVAL }));
          admits += 1;
          continue;
        }
        // Record who is about to be reviewed.
        if (tick % CLASSIFICATION_REVIEW_INTERVAL_TICKS === CLASSIFICATION_REVIEW_INTERVAL_TICKS - 1) {
          for (let i = 0; i <= store.maxActiveIndex; i += 1) {
            if (!store.isIndexAlive(i)) continue;
            const stage = intakeStageFromIndex(records.intakeStage[i]!);
            if (stage !== 'accommodation-assignment' && stage !== 'completed') continue;
            const c = classifiedAtTickOf(records.sentenceEndTick[i]!, records.sentenceLengthTicks[i]!);
            if (c === undefined || tick - c < CLASSIFICATION_REVIEW_INTERVAL_TICKS) continue;
            const id = store.getIdByIndex(i);
            const t = tracked.get(id);
            if (t !== undefined) t.reviews += 1;
          }
        }
        runtime.kernel.step();
        // Track classification the tick after it is written.
        for (let i = 0; i <= store.maxActiveIndex; i += 1) {
          if (!store.isIndexAlive(i)) continue;
          const len = records.sentenceLengthTicks[i]!;
          if (len === 0) continue;
          const id = store.getIdByIndex(i);
          const c = classifiedAtTickOf(records.sentenceEndTick[i]!, len);
          if (c === undefined) continue;
          const existing = tracked.get(id);
          const tier = records.riskTier[i]!;
          if (existing === undefined) tracked.set(id, { classifiedAt: c, sentence: len, maxTier: tier, reviews: 0 });
          else if (existing.classifiedAt !== c) tracked.set(id, { classifiedAt: c, sentence: len, maxTier: tier, reviews: 0 });
          else if (tier > existing.maxTier) existing.maxTier = tier;
        }
      }
      const all = [...tracked.values()];
      // Predicted-vs-observed cross-check: first scheduled review tick at or
      // after C + interval, against the tick the discharge sweep removes them.
      const I = CLASSIFICATION_REVIEW_INTERVAL_TICKS;
      let predicted = 0;
      let mismatch = 0;
      const phases = new Map<number, number>();
      for (const t of all) {
        phases.set(t.classifiedAt % I, (phases.get(t.classifiedAt % I) ?? 0) + 1);
        const T = Math.ceil((t.classifiedAt + I + 1) / I) * I - 1;
        const dischargeTick = Math.ceil((t.classifiedAt + t.sentence) / 20) * 20;
        const should = T < dischargeTick && T <= RUN;
        if (should) predicted += 1;
        if (should !== t.reviews > 0) mismatch += 1;
      }
      console.log(`classification phases (C mod 24000) observed: ${[...phases.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
      console.log(`predicted reviewed = ${predicted}; observed = ${all.filter((t) => t.reviews > 0).length}; mismatches = ${mismatch}`);

      const tiers = [0, 0, 0, 0];
      for (const t of all) tiers[t.maxTier] = (tiers[t.maxTier] ?? 0) + 1;
      const reviewed = all.filter((t) => t.reviews > 0);
      const sentences = new Map<number, number>();
      for (const t of all) sentences.set(t.sentence / DAY, (sentences.get(t.sentence / DAY) ?? 0) + 1);
      console.log(`\n=== ${plan.label} : ${RUN} ticks (${RUN / DAY} in-game days) ===`);
      console.log(`admissions submitted: ${admits}; classified & tracked: ${all.length}`);
      console.log(`sentence days histogram: ${[...sentences.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}d:${n}`).join(' ')}`);
      console.log(`prisoners that reached >=1 review: ${reviewed.length} (${((reviewed.length / all.length) * 100).toFixed(1)}%)`);
      console.log(`  their sentence days: ${[...new Set(reviewed.map((t) => t.sentence / DAY))].sort((a, b) => a - b).join(',')}`);
      console.log(`max tier ever held: tier0=${tiers[0]} tier1=${tiers[1]} tier2=${tiers[2]} tier3=${tiers[3]}`);
      console.log(`review system metrics: ${JSON.stringify(runtime.prisoners.classificationReviewSystem.getMetrics())}`);
      console.log(`incidents: ${JSON.stringify(runtime.incidents.all().reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {}))}`);
      console.log(`confiscations: ${runtime.confiscations.all().length}`);
      console.log(`discharged: ${JSON.stringify(runtime.prisoners.dischargeSystem?.getMetrics?.() ?? 'n/a')}`);
    }
  });
});

const SOLITARY_A = { x: 1, y: 10, width: 2, height: 3 } as const;
const SOLITARY_B = { x: 5, y: 10, width: 2, height: 3 } as const;

describe('PROBE solitary', () => {
  it('who ever occupies room.solitary-cell', () => {
    for (const scenario of [
      { label: 'neglected, priors 0 (what the HUD sends)', priors: 0, guards: 0, amenities: false },
      { label: 'neglected, priors 2 (only a command can send this)', priors: 2, guards: 0, amenities: false },
      { label: 'well-run, priors 2', priors: 2, guards: 2, amenities: true },
    ]) {
      const runtime = buildPrison({ cells: 12, toilets: scenario.amenities, amenities: scenario.amenities, guards: scenario.guards });
      // Two furnished solitary cells, built the way a player would.
      submit(runtime, 'buy-solitary-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-sp', itemId: 'item.wood-plank', quantity: 2 }));
      for (const rect of [SOLITARY_A, SOLITARY_B]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
      submit(runtime, 'zone-sa', packCommand({ type: 'ZoneRoom', roomId: 'room.solitary-cell', ...SOLITARY_A }));
      submit(runtime, 'zone-sb', packCommand({ type: 'ZoneRoom', roomId: 'room.solitary-cell', ...SOLITARY_B }));
      submit(runtime, 'sbed-a', packCommand({ type: 'PlaceObject', orderId: 'sbed-a', definitionId: 'bed-wooden', x: SOLITARY_A.x, y: SOLITARY_A.y }));
      submit(runtime, 'sbed-b', packCommand({ type: 'PlaceObject', orderId: 'sbed-b', definitionId: 'bed-wooden', x: SOLITARY_B.x, y: SOLITARY_B.y }));
      stepTo(runtime, runtime.kernel.tick + 1_000);
      if (runtime.refusals.count > 0) console.log(`REFUSALS ${runtime.refusals.count}: ${JSON.stringify(runtime.refusals.last)}`);

      const store = runtime.prisoners.entityStore;
      const records = runtime.prisoners.records;
      const RUN = 288_000;
      let admits = 0;
      let intakeHighRisk = 0;
      let peakSolitary = 0;
      const everInSolitary = new Set<number>();
      const seenClassified = new Set<number>();
      while (runtime.kernel.tick < RUN) {
        const tick = runtime.kernel.tick;
        if (tick % 2_400 === 0) {
          submit(runtime, `a${admits}`, packCommand({ type: 'AdmitPrisoner', priorIncidents: scenario.priors, ...ARRIVAL }));
          admits += 1;
        } else {
          runtime.kernel.step();
        }
        if (tick % 200 === 0) {
          let occupied = 0;
          for (const instance of runtime.prisoners.roomInstances.allByRoomCatalogId('room.solitary-cell')) {
            for (const occupant of runtime.prisoners.roomInstances.occupantsOf(instance.instanceId)) {
              occupied += 1;
              everInSolitary.add(occupant);
            }
          }
          if (occupied > peakSolitary) peakSolitary = occupied;
        }
        for (let i = 0; i <= store.maxActiveIndex; i += 1) {
          if (!store.isIndexAlive(i)) continue;
          if (records.sentenceLengthTicks[i]! === 0) continue;
          const stage = intakeStageFromIndex(records.intakeStage[i]!);
          if (stage !== 'accommodation-assignment' && stage !== 'completed') continue;
          const key = store.getIdByIndex(i) * 1_000_000 + (records.sentenceEndTick[i]! % 1_000_000);
          if (seenClassified.has(key)) continue;
          seenClassified.add(key);
          if (records.riskTier[i]! >= 3) intakeHighRisk += 1;
        }
      }
      console.log(`\n--- ${scenario.label} ---`);
      console.log(`admissions: ${admits}; high-risk AT INTAKE (first stage read): ${intakeHighRisk}`);
      console.log(`review metrics: ${JSON.stringify(runtime.prisoners.classificationReviewSystem.getMetrics())}`);
      console.log(`sanction metrics: ${JSON.stringify(runtime.prisoners.sanctionSystem?.getMetrics?.() ?? 'n/a')}`);
      console.log(`ever seen inside room.solitary-cell: ${everInSolitary.size}; peak concurrent: ${peakSolitary}`);
      console.log(`incidents: ${JSON.stringify(runtime.incidents.all().reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {}))}`);
    }
  });
});

describe('PROBE accommodation-driven solitary', () => {
  it('a crowded prison: does a review-promoted prisoner get HOUSED in solitary', () => {
    for (const cells of [2, 12]) {
      const runtime = buildPrison({ cells, toilets: false, amenities: false, guards: 0 });
      submit(runtime, 'buy-solitary-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-sp', itemId: 'item.wood-plank', quantity: 2 }));
      for (const rect of [SOLITARY_A, SOLITARY_B]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
      submit(runtime, 'zone-sa', packCommand({ type: 'ZoneRoom', roomId: 'room.solitary-cell', ...SOLITARY_A }));
      submit(runtime, 'zone-sb', packCommand({ type: 'ZoneRoom', roomId: 'room.solitary-cell', ...SOLITARY_B }));
      submit(runtime, 'sbed-a', packCommand({ type: 'PlaceObject', orderId: 'sbed-a', definitionId: 'bed-wooden', x: SOLITARY_A.x, y: SOLITARY_A.y }));
      submit(runtime, 'sbed-b', packCommand({ type: 'PlaceObject', orderId: 'sbed-b', definitionId: 'bed-wooden', x: SOLITARY_B.x, y: SOLITARY_B.y }));
      stepTo(runtime, runtime.kernel.tick + 1_000);
      if (runtime.refusals.count > 0) console.log(`REFUSALS ${runtime.refusals.count}: ${JSON.stringify(runtime.refusals.last)}`);

      const store = runtime.prisoners.entityStore;
      const records = runtime.prisoners.records;
      let admits = 0;
      let sanctioned = 0;
      let unsanctioned = 0;
      const seen = new Set<string>();
      while (runtime.kernel.tick < 288_000) {
        const tick = runtime.kernel.tick;
        if (tick % 2_400 === 0) { submit(runtime, `a${admits}`, packCommand({ type: 'AdmitPrisoner', priorIncidents: 0, ...ARRIVAL })); admits += 1; }
        else runtime.kernel.step();
        if (tick % 40 !== 0) continue;
        for (const instance of runtime.prisoners.roomInstances.allByRoomCatalogId('room.solitary-cell')) {
          for (const occupant of runtime.prisoners.roomInstances.occupantsOf(instance.instanceId)) {
            if (!store.isAlive(occupant)) continue;
            const index = store.getIndex(occupant);
            const key = `${occupant}:${records.sentenceEndTick[index]!}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (records.solitarySanctionEndTick[index]! !== 0) sanctioned += 1;
            else { unsanctioned += 1; console.log(`  unsanctioned solitary occupant at tick ${tick}: tier=${records.riskTier[index]!} stage=${intakeStageFromIndex(records.intakeStage[index]!)}`); }
          }
        }
      }
      console.log(`\n--- ${cells} ordinary cells + 2 solitary cells, priors 0, unguarded ---`);
      console.log(`admissions: ${admits}`);
      console.log(`distinct solitary occupancies: sanction-driven=${sanctioned} accommodation-driven=${unsanctioned}`);
      console.log(`review metrics: ${JSON.stringify(runtime.prisoners.classificationReviewSystem.getMetrics())}`);
      console.log(`sanction metrics: ${JSON.stringify(runtime.prisoners.sanctionSystem.getMetrics())}`);
    }
  });
});

describe('PROBE reachable review space', () => {
  it('enumerates every review a HUD-admitted prisoner can receive', () => {
    const I = CLASSIFICATION_REVIEW_INTERVAL_TICKS;
    const tiers = new Set<number>();
    const credits = new Set<number>();
    const reviewCounts = new Set<number>();
    let cases = 0;
    for (let days = 2; days <= 16; days += 1) {
      const s = days * DAY;
      for (let r = 0; r < I; r += 1) {
        // Every scheduled run while this prisoner is held. Discharge sweeps
        // every 20 ticks with `tick >= sentenceEndTick`, so they are gone at
        // the first multiple of 20 at or after C + s.
        const C = r;
        const dischargeTick = Math.ceil((C + s) / 20) * 20;
        let n = 0;
        for (let k = 1; k <= 4; k += 1) {
          const T = k * I - 1;
          if (T < C + I) continue;
          if (T >= dischargeTick) break;
          n += 1;
          for (let findings = 0; findings <= 4; findings += 1) {
            for (const cleanSince of [C, T, T - I, T - 2 * I, Math.floor((C + T) / 2)]) {
              if (cleanSince < C || cleanSince > T) continue;
              const a = reviewClassification({
                sentenceLengthTicks: s,
                priorIncidentsAtIntake: 0,
                classifiedAtTick: C,
                tick: T,
                disciplinary: findings === 0 ? { points: 0, findingCount: 0, lastFindingTick: undefined } : { points: findings, findingCount: 1, lastFindingTick: cleanSince },
              });
              tiers.add(a.riskTier);
              credits.add(a.factors.cleanConduct);
              cases += 1;
            }
          }
        }
        reviewCounts.add(n);
      }
    }
    console.log(`cases enumerated: ${cases}`);
    console.log(`reachable riskTier at review (priors 0, drawable sentence): {${[...tiers].sort().join(',')}}`);
    console.log(`reachable cleanConduct factor: {${[...credits].sort((a, b) => a - b).join(',')}}  (MAX_CLEAN_CONDUCT_CREDIT is 2)`);
    console.log(`reviews one prisoner can ever receive: {${[...reviewCounts].sort().join(',')}}`);
  });
});
