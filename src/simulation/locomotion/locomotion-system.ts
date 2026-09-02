import type { SimulationContext, SystemRegistration } from '../kernel/system';

/**
 * Advances one population's walks, once per tick
 * ([ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)).
 *
 * ### Why the population is a callback and not a list
 *
 * The two populations that walk keep their positions in incompatible stores --
 * prisoners in the index-keyed `Int32Array`s of `PositionComponent`, guards in
 * a `Map` of `GuardRecord` -- and each owns the rule for writing a tile into
 * its own store. Handing this system a function that advances *one* population
 * keeps that rule where the store is, and registering one instance per
 * population keeps a population that a session does not have from costing it a
 * branch per tick.
 *
 * ### Why order 200 (the prisoner instance), and why a second instance takes
 * ### a different number rather than sharing it
 *
 * After `NavigationSystem` (150), which is what produces the routes walks are
 * built from, and before `ActionSystem` (250) and the security systems (270,
 * 280), which are the state machines that ask whether a walk has finished. A
 * walk that completes on tick *n* is therefore visible to its owner on tick
 * *n*, not on tick *n + 1*.
 *
 * `order` is a constructor parameter, not a fixed `200`, because ADR 0088 adds
 * a second population's instance (`security.locomotion`) that has to run in
 * the same window -- after navigation, before the systems that read an
 * arrival -- but `tests/determinism/kernel-system-order.test.ts`'s own second
 * case requires every declared order in a real session to be distinct, so the
 * two instances cannot both default to 200. The guard instance is registered
 * at 201; see `new-session.ts`.
 *
 * ### Why every tick
 *
 * `intervalTicks: 1` is what makes this locomotion rather than a coarser
 * teleport: the reconsideration cadences around it are 10 and 20 ticks, and a
 * position that moved once per twenty ticks would step half a tile at a time
 * (`DEFAULT_WALK_SUBTILE_UNITS_PER_TICK`). The cost is a `Map` iteration over
 * the actors *in transit*, which is why `LocomotionStore` holds only those.
 */
export class LocomotionSystem implements SystemRegistration {
  public readonly schedule = { intervalTicks: 1, phaseTicks: 0 };

  public constructor(
    public readonly id: string,
    private readonly advanceTicks: (ticks: number, tick: number) => void,
    public readonly order: number = 200,
  ) {}

  public update(context: SimulationContext): void {
    this.advanceTicks(this.schedule.intervalTicks, context.tick);
  }
}
