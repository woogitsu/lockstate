import { expect, test } from './network-changed-fixture';
import { openHarness, reloadHarness } from './harness-fixture';

/**
 * ADR 0109's own named falsifier, run before the mechanism it would have
 * defeated was built, and kept as a standing gate on the claim it failed to
 * defeat.
 *
 * ADR 0109 Decision 2 keeps the session epoch **non-durable** and says so as
 * its weakest claim: *"That the session epoch never has to be durable …
 * Everything that keeps this document outside reservation 2 rests on it, and
 * the argument is that both parties to 'is this writer still current?' are
 * live objects in one process at the moment the question is asked."* It then
 * names what would falsify it:
 *
 * > a capture that survives its own *page*, not merely its own session. If a
 * > write can be issued after the `SessionController` that authorised it no
 * > longer exists — a `visibilitychange` or `pagehide` handler flushing a save
 * > during teardown is the plausible route … then there is no live object left
 * > to compare an in-memory epoch against, and the epoch has to be a durable
 * > lease instead.
 *
 * and what would settle it: *"a `WorkerSessionHost` run that unloads the page
 * between capture and write and observes whether the write lands."*
 *
 * That is exactly this spec, and it is at this layer because nothing below it
 * can produce a browser-generated `pagehide` against a realm that is genuinely
 * being destroyed. The ADR's own measurements used `InProcessSessionHost` and
 * it says so; the harness arms this probe with `SimulationWorkerChannel` +
 * `WorkerPerSessionHost`, the pair `src/main.ts:265` and `:3413` construct.
 *
 * ### What it measured, which is stronger than the claim needed
 *
 * Both real lifecycle events reached the handler and both ran
 * `LifecycleSaveHandler.attempt`, and **no write was issued at all**:
 *
 *     triggers: ["pagehide","visibility-hidden"]
 *     writes:   [{ trigger: "manual", envelopeRevision: 1, ... }]
 *     durableRevision: 1   durableGenerations: 1
 *
 * The reason is structural rather than lucky. `saveNow` cannot reach
 * `PrisonSaveRepository.save` without first awaiting `buildEnvelope()`, and
 * `buildEnvelope` awaits `host.capture()` — a round trip to the simulation
 * worker. The page is destroyed long before the worker answers, so the capture
 * dies with the page it belongs to. **A capture cannot outlive its own page,
 * because the capture is the part that dies first.** The falsifier's premise —
 * a write issued after its authorising `SessionController` is gone — has no
 * route through this code.
 *
 * ### Why the assertions are shaped the way they are
 *
 * `authorisingSessionAlive` is asserted over every recorded write, and for the
 * lifecycle path it is **vacuously true today** because that path records no
 * writes. That is stated rather than hidden: the assertion carrying the
 * information is `durableRevision`, which pins the measured fact that a
 * lifecycle-triggered save does not reach storage on the worker-backed path.
 * If a later change ever lets one land — a cached snapshot, a synchronous
 * capture, a `keepalive` flush — this test goes red, and ADR 0109's weakest
 * claim has to be argued again before it ships. That is the whole point of
 * keeping the falsifier rather than only reporting that it failed.
 *
 * Note also that `LifecycleSaveHandler`'s own class docblock says the write
 * "may simply not complete". Measured here against the production host, it is
 * sharper than that: it never begins.
 */

const PRISON = 'epoch-falsifier-prison';

test.describe('ADR 0109 falsifier: does a lifecycle write outlive the session that authorised it', () => {
  test('a save flushed during real page teardown never outlives the session that authorised it', async ({ page }) => {
    await openHarness(page);
    await page.evaluate((prisonId) => window.lockstateHarness.armLifecycleWriteFalsifier(prisonId), PRISON);

    // `createPrison` writes generation 1 through the instrumented `save`, so
    // the baseline is one recorded write with no lifecycle trigger attached.
    const armed = await page.evaluate((prisonId) => window.lockstateHarness.readLifecycleWriteObservation(prisonId), PRISON);
    expect(armed.writes.map((write) => write.trigger)).toEqual(['manual']);
    expect(armed.durableRevision).toBe(1);

    // The real navigation. This is what produces a browser-generated
    // `pagehide`, runs `LifecycleSaveHandler.attempt` inside it, and then
    // destroys the realm that holds the controller, the host and the worker.
    await reloadHarness(page);

    // The handler really did run. Without this the rest of the test would pass
    // on a page that never fired a lifecycle event at all, which is the
    // vacuous-green shape this whole layer exists to prevent.
    const triggers = await page.evaluate(() => window.lockstateHarness.readLifecycleObservation());
    expect(triggers.triggers).toEqual(['pagehide', 'visibility-hidden']);

    const observed = await page.evaluate((prisonId) => window.lockstateHarness.readLifecycleWriteObservation(prisonId), PRISON);

    // THE FALSIFIER, first half. No write was issued during teardown at all:
    // the capture the write needs is a worker round trip, and it dies with the
    // page. So there is no such thing here as a write whose authorising
    // session has gone.
    expect(observed.writes.filter((write) => write.trigger !== 'manual')).toEqual([]);

    // Second half, read out of storage by the *next* page load rather than
    // asserted in the process that would have done the writing: nothing
    // landed. Generation 1 from `createPrison` is all there is.
    expect(observed.durableRevision).toBe(1);
    expect(observed.durableGenerations).toBe(1);

    // And the standing invariant the epoch rests on, asserted over everything
    // ever recorded: no write was issued by a dead controller. See the
    // docblock on why this is vacuous for the lifecycle path today and why it
    // is kept anyway.
    for (const write of observed.writes) {
      expect(write.authorisingSessionAlive).toBe(true);
    }
  });
});
