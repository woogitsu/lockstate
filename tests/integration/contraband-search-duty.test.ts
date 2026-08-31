import { describe, expect, it } from 'vitest';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { DEFAULT_LOCALE, resolveLocalizationKey } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { projectStatusStrip } from '../../src/simulation/presentation/status-strip-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationEvent,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { resolveHudLabelParameters } from '../../src/ui/hud/label-parameters';
import type { HudAlertViewModel } from '../../src/ui/hud/view-model';
import { MAX_EVENT_ALERT_ROWS, hudEventAlertsFromWorkerMessage } from '../../src/ui/simulation-events';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { hashFullRuntime } from '../helpers/determinism-state';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **The Contraband figure, watched moving**
 * ([ADR 0073](../../docs/adr/0073-who-orders-a-contraband-search.md), closing
 * issue #552).
 *
 * ## Why this is not a unit test
 *
 * #552's finding was not that a function was wrong. `SearchSystem` is complete
 * and its own suite exercises staffing, real travel, detection against a named
 * RNG stream, confiscation and a lossless restore -- every one of those cases
 * submitting the order itself. What was missing was a *caller*:
 * `submitOrder` was reachable from nowhere in `src/`, and `searchPolicies` was
 * an empty array nothing pushed to, so `findPolicy` would have thrown on the
 * first search a session ordered. A unit test cannot see either absence,
 * because a unit test supplies both. So the cases below start at
 * `createNewSimulationRuntime` and use nothing but real commands through the
 * real command handler.
 *
 * ## What this measured on `origin/main` (6c309fc)
 *
 * The prison `playedPrison` builds, run for sixteen in-game days: **two
 * contraband items introduced, both still `'concealed'`, zero searches queued,
 * completed or cancelled, zero confiscations, and `contrabandDiscovered: 0` on
 * the status strip.** The same prison and seed on this branch finds both.
 *
 * ## What is deliberately not claimed
 *
 * Not "the tuning is right". ADR 0073 ships a standing duty *first* precisely
 * so that the six numbers per scope get watched running before a player is
 * given a control that spends guards on them, and `docs/BENCHMARKING.md`
 * forbids a hard threshold without repeated controlled baselines. The
 * assertions below are therefore about *reachability and cost* -- something is
 * found, guards are spent finding it, and nothing is stranded -- not about how
 * much.
 */

/** Distinct from every other seed in the suite, so a shared fixture cannot make these figures true by accident. */
const SEED = 0x552;

/** `room.cell`'s authored minimum, and the same rectangle the other loops use. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
/** `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, written out -- the tile a hire stands on and an admission arrives at. */
const ORIGIN = { x: 16, y: 16 } as const;
/** What one press of the Intake panel asks for, with a sentence long enough to outlast the measurement. */
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;
const DAY_LENGTH = 2_400;
/** Sixteen in-game days. Long enough that a 10%-per-admission introduction rate has produced something to find. */
const SIXTEEN_DAYS = DAY_LENGTH * 16;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A prison a player could plausibly have after an hour: one walled, zoned and
 * furnished cell, three guards, and twelve admissions spread out rather than
 * arriving at once.
 *
 * **Three guards, and the number is the point.** The derived sector's
 * requirement scales with population (ADR 0048), so two of the three are posted
 * and the third is the spare a sweep is walked by. Two guards would leave none
 * spare and, per `SectorSearchDutySystem`'s own rule, order no sweeps at all --
 * which is the case `security-default-sector.test.ts` keeps.
 */
function playedPrison(seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  stepTo(runtime, 200); // delivery delay plus build progress, the margin the furnished-cell loop uses
  for (let index = 0; index < 3; index += 1) {
    submit(runtime, `hire-${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ORIGIN }));
  }
  for (let index = 0; index < 12; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN }));
    stepTo(runtime, runtime.kernel.tick + 40);
  }
  // Not `expect` on a projection: a silently refused command here would leave a
  // prison with no prisoners or no guards, and every assertion below would then
  // be measuring the wrong prison.
  if (runtime.refusals.count > 0) throw new Error('A command this fixture depends on was refused.');
  return runtime;
}

function strip(runtime: SimulationRuntime): ReturnType<typeof projectStatusStrip>['counts'] {
  return projectStatusStrip({
    tick: runtime.kernel.tick,
    prisoners: runtime.prisoners,
    staff: runtime.securityGuards,
    searchSystem: runtime.searchSystem,
    confiscations: runtime.confiscations,
  }).counts;
}

function contrabandDiscovered(runtime: SimulationRuntime): number {
  return strip(runtime).contrabandDiscovered;
}

/** Every contraband discovery this session has announced, narrowed to that member so its own fields are readable. */
function discoveriesIn(runtime: SimulationRuntime): readonly Extract<SimulationEvent, { type: 'contraband.discovered' }>[] {
  return runtime.events
    .since(0)
    .filter((event): event is Extract<SimulationEvent, { type: 'contraband.discovered' }> => event.type === 'contraband.discovered');
}

/**
 * One `simulation/event` publication, parsed by the production wire schema
 * rather than hand-shaped, so an event the worker boundary would reject cannot
 * reach an assertion. `messageId` is a fixed v4 UUID: the envelope's identity is
 * not what any case here is about.
 */
function publish(event: SimulationEvent): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000703',
    kind: 'simulation/event',
    payload: { tick: event.tick + 1, event },
  }) as WorkerToMainMessage;
}

describe('a prison a player can start finds the contraband it admits', () => {
  it('moves the Contraband figure off zero, having spent guards to do it', () => {
    const runtime = playedPrison();

    // The premise, asserted rather than assumed: the strip starts at zero and
    // the prison really is carrying something to find. Without this the case
    // could pass in a prison where nothing was ever concealed.
    expect(contrabandDiscovered(runtime)).toBe(0);

    stepTo(runtime, SIXTEEN_DAYS);

    const concealedOrConfiscated = runtime.contraband.all();
    expect(concealedOrConfiscated.length, 'twelve admissions must have brought something in for this case to mean anything').toBeGreaterThan(0);

    const metrics = runtime.searchSystem.getMetrics();
    expect(metrics.searchesCompleted, 'sweeps must actually run').toBeGreaterThan(0);
    expect(metrics.itemsDiscovered, 'and must find something').toBeGreaterThan(0);
    expect(contrabandDiscovered(runtime)).toBe(metrics.itemsDiscovered);

    // Found, not deleted: every discovery is a confiscation record naming a
    // guard and an order, and the item is `'confiscated'` in the registry.
    expect(runtime.confiscations.all()).toHaveLength(metrics.itemsDiscovered);
    for (const event of runtime.confiscations.all()) {
      expect(runtime.contraband.get(event.itemId)?.state).toBe('confiscated');
      expect(runtime.securityGuards.allGuardIds()).toContain(event.foundByGuardId);
      expect(event.searchOrderId).toMatch(/^contraband\.sector-sweep\./);
    }
  });

  it('leaves no guard stranded and no order stuck: the queue drains and the searchers come back', () => {
    const runtime = playedPrison();
    stepTo(runtime, SIXTEEN_DAYS);

    // A queue that grew would mean orders nobody can staff -- the failure mode
    // "order a sweep unconditionally" produces, and one that would bloat the
    // save for the life of the prison.
    expect(runtime.searchSystem.getMetrics().searchesQueued).toBe(0);
    expect(runtime.searchSystem.getMetrics().searchesCancelled).toBe(0);

    // Every guard is doing something a player can point at, and at least one is
    // back in the pool -- a searcher that was never released would sit on
    // `'on-search'` for ever with no job naming it.
    const phases = runtime.securityGuards.allGuardIds().map((id) => runtime.securityGuards.getDeploymentPhase(id));
    expect(phases).toHaveLength(3);
    for (const phase of phases) expect(['on-post', 'travelling', 'on-search', 'unassigned']).toContain(phase);
    expect(runtime.searchSystem.claimedGuardIds().length).toBeLessThanOrEqual(1);
  });

  it('finds nothing without a spare guard, which is the staffing cost the ADR states rather than a free mechanic', () => {
    /*
     * The same prison with one fewer hire. The derived sector's requirement
     * scales with its twelve occupants, so both guards are posted and none is
     * claimable -- and `SearchSystem` staffs a job from the claimable pool, not
     * from a posted guard. So the counter does not move, and the difference
     * between this case and the first is exactly one hire.
     */
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
    stepTo(runtime, 200);
    for (let index = 0; index < 12; index += 1) {
      submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN }));
      stepTo(runtime, runtime.kernel.tick + 40);
    }
    submit(runtime, 'hire-0', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ORIGIN }));
    submit(runtime, 'hire-1', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ORIGIN }));
    stepTo(runtime, SIXTEEN_DAYS);

    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)[0]).toMatchObject({ required: 2, assigned: 2, shortage: 0 });
    expect(runtime.securityGuards.unassignedGuardIds()).toEqual([]);
    expect(runtime.searchSystem.getMetrics()).toMatchObject({ searchesCompleted: 0, searchesQueued: 0, itemsDiscovered: 0 });
    expect(contrabandDiscovered(runtime)).toBe(0);
  });

  /**
   * **The strip says *what* it found, not only how much** -- the owner's ruling
   * 3 on issue #703, 2026-08-31: *"The message names what contraband was
   * found."*
   *
   * Both halves of the rule are driven through a real prison rather than a
   * stub, because the interesting half is the one a stub cannot produce: a
   * *mixed* haul. `contrabandDiscovered` comes from `SearchSystem`'s counter
   * and the name comes from `ConfiscationLedger`, and a badge beside a count
   * qualifies the whole count -- so naming a category the count is only partly
   * made of would be a false statement about the prison
   * (`AGENTS.md`'s fourth exclusion).
   *
   * ## The seeds are chosen from a measurement, and the measurement is the
   * argument for the rule
   *
   * Thirteen seeds of `playedPrison`, each run the same sixteen in-game days,
   * counting the distinct categories their sweeps actually confiscated:
   *
   * | seed | items | distinct categories | named |
   * | --- | --- | --- | --- |
   * | 0x1 | 2 | currency | Currency |
   * | 0x2 | 3 | phone, tool | -- |
   * | 0x3 | 2 | drug | Drugs |
   * | 0x4 | 1 | drug | Drugs |
   * | 0x5 | 1 | phone | Phone |
   * | 0x6 | 1 | currency | Currency |
   * | 0x7 | 2 | phone, currency | -- |
   * | 0x8 | 4 | phone, tool, drug | -- |
   * | 0x9 | 1 | tool | Tool |
   * | 0xa | 1 | phone | Phone |
   * | 0xb | 3 | phone, currency | -- |
   * | 0xc | 2 | phone | Phone |
   * | 0x552 | 2 | drug, phone | -- |
   *
   * **Seven of thirteen name a category and six do not**, which is the honest
   * reach of this surface and is reported rather than hidden: a chip carrying
   * one word cannot describe a phone and a weapon at once. Naming *each* of
   * several discoveries needs a per-discovery message, and that needs a
   * sentence joining a name to what happened -- no such sentence is authored
   * and a sentence is the owner's.
   *
   * `0xc` is the named case rather than one of the four one-item seeds
   * deliberately: it confiscates **two** items of one category, so it fails if
   * the rule ever degrades to "name the first thing found". `0x552` is the
   * fixture's own seed, and it is the mixed case, so the negative half costs no
   * extra prison.
   */
  it('names the contraband it found, and stays silent where one word would be a claim about the other (#703 ruling 3)', () => {
    const named = playedPrison(0xc);
    stepTo(named, SIXTEEN_DAYS);
    const namedCounts = strip(named);

    // The premise: two items, and both really are one category. Asserted off
    // the ledger, so a run that stopped finding two things fails here rather
    // than passing the assertion below for the wrong reason.
    expect(namedCounts.contrabandDiscovered).toBe(2);
    expect([...new Set(named.confiscations.all().map((event) => event.categoryId))]).toEqual(['contraband.phone']);

    // The key itself, written out. Not read back off the catalog the
    // projection reads: an expectation computed from the code under test's own
    // input holds for any implementation (`docs/TESTING.md`).
    expect(namedCounts.contrabandNameKey).toBe('contraband.phone.name');

    // And it is a key a locale actually authors, which is the whole claim that
    // this is a reader for existing copy rather than new copy. A key with no
    // entry would reach the strip and be painted as itself --
    // `resolveLocalizationKey` falls back to the key on purpose -- so the
    // assertion is that the fallback is *not* what happens.
    const publishedKey = namedCounts.contrabandNameKey;
    if (publishedKey === undefined) throw new Error('the assertion above already proved the key is present');
    const rendered = resolveLocalizationKey(defaultLocaleEnCatalog, publishedKey);
    expect(rendered).not.toBe(publishedKey);
    expect(rendered.trim().length).toBeGreaterThan(0);

    const mixed = playedPrison();
    stepTo(mixed, SIXTEEN_DAYS);
    const mixedCounts = strip(mixed);

    expect(mixedCounts.contrabandDiscovered).toBe(2);
    expect([...new Set(mixed.confiscations.all().map((event) => event.categoryId))].sort()).toEqual([
      'contraband.drug',
      'contraband.phone',
    ]);
    // Two categories, so no word is true of the count: the strip falls back to
    // the bare figure it has always shown rather than picking one of them.
    expect(mixedCounts.contrabandNameKey).toBeUndefined();
  }, 300_000);

  /**
   * **The alerts list says what was found** -- the owner's **ruling 13** on
   * issue #703, 2026-08-31: *"Contraband found: {item}."*, at `'warning'`, with
   * a weapon in the same band as any other item.
   *
   * The case above is the honest limit of the status chip and says so: a badge
   * beside a count can name a category only while the whole count is that
   * category, so six of thirteen measured prisons render the bare figure. This
   * is the surface that names *each* discovery, and the ruling is what authored
   * the sentence the chip could not have.
   *
   * ## Why it starts at `createNewSimulationRuntime` and ends at a rendered
   * string
   *
   * Every link in the chain is a place the key could be dropped, and the unit
   * tests can each see only one of them. `SearchSystem` resolves the catalog's
   * `nameKey` and records the event; `simulationEventSchema` must accept it at
   * the worker boundary; `eventParameterMessages` must map it onto `{item}`; and
   * `hud.alert.event.contraband.discovered` must exist in the catalog that
   * ships. A missing branch anywhere in that list renders the literal
   * placeholder or a dotted key on screen -- `interpolate` and
   * `resolveLocalizationKey` both leave one visible on purpose -- so the
   * assertion is the finished English sentence, assembled through
   * `resolveHudLabelParameters`, which is what `hud.ts` renders with.
   *
   * Seed `0xc` is the two-phone prison the case above measured, so the sentence
   * under test is a real find rather than a hand-built payload.
   */
  it('tells the player what a search found, in a sentence, by name (#703 ruling 13)', () => {
    // The premise: a session announces nothing about contraband on its own, so
    // a row below is a consequence of a search rather than of session setup.
    // Asserted per type, because `events.count` is every event of any kind.
    expect(discoveriesIn(createNewSimulationRuntime(0xc))).toEqual([]);

    const runtime = playedPrison(0xc);
    stepTo(runtime, SIXTEEN_DAYS);

    const discoveries = discoveriesIn(runtime);
    // One row per item found, and the ledger is the independent count of that.
    expect(runtime.searchSystem.getMetrics().itemsDiscovered).toBe(2);
    expect(discoveries).toHaveLength(2);
    expect(discoveries.map((event) => event.categoryNameKey)).toEqual([
      'contraband.phone.name',
      'contraband.phone.name',
    ]);
    // The ticks are the ticks the searches dwelt on, which the ledger also
    // recorded -- so the sentence a player reads is dated by the find and not
    // by the publication that carried it.
    expect(discoveries.map((event) => event.tick)).toEqual(runtime.confiscations.all().map((record) => record.tick));

    // Through the real wire schema, so an event this boundary would reject
    // cannot reach the assertion below.
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const rows = discoveries.reduce<readonly HudAlertViewModel[]>(
      (list, event) => hudEventAlertsFromWorkerMessage(publish(event), list) ?? list,
      [],
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.severity, 'ruling 13: warning, and a weapon is not louder').toBe('warning');
      const sentence = localizer.format(
        row.labelKey,
        resolveHudLabelParameters((key, parameters) => localizer.format(key, parameters), row),
      );
      expect(sentence).toBe('Contraband found: Phone.');
    }
  });

  /**
   * **How many of these rows one tick can produce, in a prison a player could
   * have** -- the arithmetic the 8-row alerts list makes load-bearing.
   *
   * `MAX_EVENT_ALERT_ROWS` is 8 and the cap evicts the least severe row first
   * (#703 ruling 11), so a search posting several `'warning'` rows on one tick
   * would evict other warnings rather than the `'info'` rows the rule is tuned
   * to sacrifice. `runDetectionForCurrentTarget` really can do that -- it draws
   * once per concealed item at the target, and
   * `tests/unit/contraband-search-system.test.ts` drives five items on one
   * holder and gets five events on one tick.
   *
   * **In real play it does not.** Measured over 48 prisons built by real
   * commands (13 seeds at 12 admissions / 3 guards, 8 more at 12, and 8 at 40
   * admissions / 8 guards), 60 in-game days each: **463 confiscations, and the
   * most that landed on any one tick was one.** The two structural reasons are
   * both checkable rather than lucky -- one sector is registered (ADR 0036) and
   * `SectorSearchDutySystem.hasOutstandingSweep` allows one outstanding sweep
   * per sector, so a single job advances a single target per tick; and the only
   * route to a holder with two items is ADR 0080's escalation introduction,
   * which needs a review that raises somebody into risk tier 3.
   *
   * So **nothing coalesces**, and this case is what would notice if that stopped
   * being safe. It asserts the measured ceiling for the prison it builds rather
   * than a number pulled from the sweep above, and it asserts the consequence
   * the cap actually cares about: a tick's worth of discoveries cannot fill the
   * list on its own.
   */
  it('does not put a tick`s worth of discoveries on the list at once, so nothing needs coalescing (#703 ruling 13)', () => {
    const runtime = playedPrison();
    stepTo(runtime, DAY_LENGTH * 60);

    const discoveries = discoveriesIn(runtime);
    expect(discoveries.length, 'the premise: this prison really found things to announce').toBeGreaterThan(1);

    const perTick = new Map<number, number>();
    for (const event of discoveries) perTick.set(event.tick, (perTick.get(event.tick) ?? 0) + 1);
    const busiest = Math.max(...perTick.values());

    expect(busiest, 'one sector, one outstanding sweep, one target per tick').toBe(1);
    expect(busiest, 'a single tick must not be able to fill the alerts list by itself').toBeLessThan(MAX_EVENT_ALERT_ROWS);
  }, 120_000);

  it('is deterministic: the same seed and the same commands find the same items twice', () => {
    const first = playedPrison();
    stepTo(first, SIXTEEN_DAYS);
    const second = playedPrison();
    stepTo(second, SIXTEEN_DAYS);

    expect(second.searchSystem.getMetrics()).toEqual(first.searchSystem.getMetrics());
    // The whole runtime, not just the metrics: a duty that read `Map` order, a
    // clock or an unnamed RNG stream would show up here.
    expect(hashFullRuntime(second)).toBe(hashFullRuntime(first));
  });
});

describe('the search policies survive a save without a schema bump', () => {
  function reload(bundle: SessionSnapshotBundle): SimulationRuntime {
    return restoreSimulationRuntime(bundle, SEED).runtime;
  }

  it('gives the four to a save written before they existed, with no migration', () => {
    /*
     * A V5 payload from before ADR 0073: the section shape is unchanged and
     * `searchPolicies` is empty, which is what **every** save this repository
     * has ever written looks like -- nothing in `src/` had ever pushed to that
     * array. Built by blanking a real capture rather than by hand, so it stays
     * a valid V5 payload in every other respect.
     */
    const live = captureSessionSnapshot(createNewSimulationRuntime(SEED));
    const beforeThisAdr: SessionSnapshotBundle = {
      ...live,
      simulation: {
        ...live.simulation!,
        contraband: { ...live.simulation!.contraband, searchPolicies: [] },
      },
    };
    expect(beforeThisAdr.simulation?.contraband.searchPolicies).toEqual([]);

    const restored = reload(beforeThisAdr);

    expect(restored.searchPolicies.map((policy) => policy.scope)).toEqual(['cell', 'delivery', 'person', 'sector']);
  });

  it('keeps a policy the payload carries, rather than re-imposing the default over it', () => {
    // The defaults are authoritative only where the payload is silent. Without
    // this, a session could not hold any tuning other than the shipped one, and
    // a re-tuning in a later build would silently rewrite the balance of a
    // prison somebody is already playing.
    const live = createNewSimulationRuntime(SEED);
    const index = live.searchPolicies.findIndex((policy) => policy.scope === 'sector');
    live.searchPolicies.splice(index, 1, { scope: 'sector', requiredGuardCount: 2, dwellTicksPerTarget: 7, baseDetectionProbability: 0.11, concealmentPenaltyPerPoint: 0.02, intelligenceConfidenceBonus: 0.03 });

    const restored = reload(captureSessionSnapshot(live));

    expect(restored.searchPolicies.filter((policy) => policy.scope === 'sector')).toEqual([
      { scope: 'sector', requiredGuardCount: 2, dwellTicksPerTarget: 7, baseDetectionProbability: 0.11, concealmentPenaltyPerPoint: 0.02, intelligenceConfidenceBonus: 0.03 },
    ]);
    expect(restored.searchPolicies).toHaveLength(4);
  });

  it('resumes the sweep cadence across a save, without carrying a field to do it', () => {
    const live = playedPrison();
    stepTo(live, 4_000);
    const bundle = captureSessionSnapshot(live);

    // The duty system holds no state, so nothing of it is in the payload: what
    // a restored session resumes from is the tick and `SearchSystem`'s own
    // queue. This is the assertion that would fail if it grew one.
    const restored = reload(bundle);
    const completedAtSave = live.searchSystem.getMetrics().searchesCompleted;
    expect(completedAtSave, 'the saved session must already have swept, or "more than before" is a claim about nothing').toBeGreaterThan(0);

    stepTo(restored, 4_000 + 3 * 600);
    expect(restored.searchSystem.getMetrics().searchesCompleted).toBeGreaterThan(completedAtSave);
  });
});
