import { test, type Page } from '@playwright/test';
import { buildAndPopulate, currentTick, installTee, latestCounts, openApp, panelText, tab } from './playtest-harness';

/**
 * **Issue #740: does a deployed guard walk to its post, or is it snapped there?**
 *
 * An *instrument*, not a gate. Only
 * `tests/browser/playwright.playtest.config.ts` collects `*.playtest.ts`.
 *
 * It samples the render delta channel -- the same bytes the renderer draws
 * from -- rather than the roster projection, because the question is about
 * *positions over ticks* and the roster is polled twice a second while the
 * delta arrives ten times a second and carries a sub-tile position and a
 * velocity per actor (ADR 0059's layout 2). A guard that walks publishes
 * intermediate positions and a non-zero velocity; a guard that is snapped
 * publishes two tiles and nothing in between.
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

interface GuardSample {
  readonly at: number;
  readonly guards: readonly { readonly id: number; readonly subX: number; readonly subY: number; readonly vx: number; readonly vy: number }[];
}

/** Decodes every `simulation/delta` the page receives into guard-population records. */
async function installGuardProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const samples: GuardSample[] = [];
    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as { kind?: string; payload?: { tick?: number; delta?: { data?: ArrayBuffer } } };
          if (message.kind !== 'simulation/delta') return;
          const buffer = message.payload?.delta?.data;
          if (!(buffer instanceof ArrayBuffer)) return;
          const view = new DataView(buffer);
          const recordCount = view.getUint32(8, true);
          const guards: { id: number; subX: number; subY: number; vx: number; vy: number }[] = [];
          for (let record = 0; record < recordCount; record += 1) {
            const offset = (4 + record * 5) * 4;
            const packed = view.getUint32(offset + 4, true);
            if ((packed & 0xff) !== 1) continue; // RENDER_ACTOR_POPULATION_GUARD
            guards.push({
              id: view.getUint32(offset, true),
              subX: view.getInt32(offset + 8, true),
              subY: view.getInt32(offset + 12, true),
              vx: view.getInt16(offset + 16, true),
              vy: view.getInt16(offset + 18, true),
            });
          }
          samples.push({ at: message.payload?.tick ?? -1, guards });
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    (window as unknown as { lockstateGuardSamples?: GuardSample[] }).lockstateGuardSamples = samples;
  });
}

async function guardSamples(page: Page): Promise<readonly GuardSample[]> {
  return page.evaluate(() => (window as unknown as { lockstateGuardSamples?: GuardSample[] }).lockstateGuardSamples ?? []);
}

/** Every roster row's text, as a player reads it. */
async function rosterRows(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.hud-staff__roster [data-staff]'))
      .filter((row) => !row.hidden)
      .map((row) => (row.innerText ?? '').replace(/\n+/g, ' · ').trim()),
  );
}

test('a deployed guard: does it walk to its post? (#740)', async ({ page }) => {
  const act = '740';
  await installTee(page);
  await installGuardProbe(page);
  await openApp(page);

  await buildAndPopulate(page, { beds: 4, admits: 4, guards: 4, label: act });

  // Open the roster fold so the rows are laid out and pollable.
  await tab(page, 'security').click();
  const rosterSection = page.locator('.hud-staff__roster');
  if ((await rosterSection.getAttribute('data-collapsed')) === 'true') {
    await rosterSection.locator('> .ui-panel__header > .ui-panel__toggle').click();
  }

  const phaseCounts = new Map<string, number>();
  let rosterPolls = 0;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180_000) {
    for (const row of await rosterRows(page)) {
      rosterPolls += 1;
      const phase = row.split('·').slice(1).join('·').trim();
      phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1);
    }
    await page.waitForTimeout(80);
  }

  log(act, `tick now ${await currentTick(page)}; counts ${JSON.stringify(await latestCounts(page))}`);
  log(act, `roster samples: ${rosterPolls}; phases seen: ${JSON.stringify([...phaseCounts.entries()].sort())}`);
  log(act, `staff panel now:\n${await panelText(page, '.hud-staff')}`);

  const samples = await guardSamples(page);
  log(act, `render-delta samples: ${samples.length}`);
  const byGuard = new Map<number, { subX: number; subY: number; at: number }[]>();
  let nonZeroVelocity = 0;
  let offTileSamples = 0;
  for (const sample of samples) {
    for (const guard of sample.guards) {
      if (guard.vx !== 0 || guard.vy !== 0) nonZeroVelocity += 1;
      if (guard.subX % 256 !== 0 || guard.subY % 256 !== 0) offTileSamples += 1;
      const track = byGuard.get(guard.id) ?? [];
      const last = track[track.length - 1];
      if (last === undefined || last.subX !== guard.subX || last.subY !== guard.subY) {
        track.push({ subX: guard.subX, subY: guard.subY, at: sample.at });
      }
      byGuard.set(guard.id, track);
    }
  }
  log(act, `samples with a non-zero published velocity: ${nonZeroVelocity}`);
  log(act, `samples with a position that is not exactly on a tile centre: ${offTileSamples}`);
  for (const [id, track] of [...byGuard.entries()].sort((a, b) => a[0] - b[0])) {
    const steps = track.map((point, index) => {
      if (index === 0) return `start (${point.subX / 256},${point.subY / 256})@t${point.at}`;
      const previous = track[index - 1]!;
      const manhattan = Math.abs(point.subX - previous.subX) / 256 + Math.abs(point.subY - previous.subY) / 256;
      return `-> (${point.subX / 256},${point.subY / 256})@t${point.at} [${manhattan} tiles in ${point.at - previous.at} ticks]`;
    });
    log(act, `guard ${id}: ${track.length} distinct position(s)`);
    for (const step of steps) log(act, `  ${step}`);
  }
});
