import { describe, expect, it } from 'vitest';
import { UtilityNetwork } from '../../src/simulation/operations/utility-network';

describe('UtilityNetwork: capacity allocation within a connected component', () => {
  it('powers a consumer when producer capacity covers its demand', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 100 });
    network.addNode({ id: 'load-0', kind: 'consumer', capacityOrDemand: 40 });
    network.connect('generator-0', 'load-0');

    const { states, load } = network.evaluate();
    expect(states.get('load-0')).toBe('powered');
    expect(load.get('load-0')).toBe(40);
  });

  it('disables a consumer with no-supply when aggregate demand exceeds capacity, allocated deterministically by ascending node id', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 50 });
    network.addNode({ id: 'load-a', kind: 'consumer', capacityOrDemand: 40 });
    network.addNode({ id: 'load-b', kind: 'consumer', capacityOrDemand: 40 });
    network.connect('generator-0', 'load-a');
    network.connect('generator-0', 'load-b');

    const { states, load } = network.evaluate();
    // 'load-a' sorts before 'load-b': it is served first (40 of 50), leaving only 10 for 'load-b' (needs 40 -> disabled).
    expect(states.get('load-a')).toBe('powered');
    expect(load.get('load-a')).toBe(40);
    expect(states.get('load-b')).toBe('disabled-no-supply');
    expect(load.get('load-b')).toBe(0);
  });

  it('a consumer with zero producer capacity anywhere in its component is disabled-no-supply', () => {
    const network = new UtilityNetwork('water');
    network.addNode({ id: 'tap-0', kind: 'consumer', capacityOrDemand: 5 });
    const { states } = network.evaluate();
    expect(states.get('tap-0')).toBe('disabled-no-supply');
  });

  it('two disconnected components are evaluated independently', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-a', kind: 'producer', capacityOrDemand: 100 });
    network.addNode({ id: 'load-a', kind: 'consumer', capacityOrDemand: 40 });
    network.connect('generator-a', 'load-a');

    network.addNode({ id: 'generator-b', kind: 'producer', capacityOrDemand: 10 });
    network.addNode({ id: 'load-b', kind: 'consumer', capacityOrDemand: 40 });
    network.connect('generator-b', 'load-b');

    const { states } = network.evaluate();
    expect(states.get('load-a')).toBe('powered'); // its own component has enough capacity
    expect(states.get('load-b')).toBe('disabled-no-supply'); // its own component does not, regardless of component A's surplus
  });
});

describe('UtilityNetwork: explicit failure state', () => {
  it('a failed producer contributes no capacity, potentially cascading a consumer to disabled-no-supply', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 40 });
    network.addNode({ id: 'load-0', kind: 'consumer', capacityOrDemand: 40 });
    network.connect('generator-0', 'load-0');
    expect(network.evaluate().states.get('load-0')).toBe('powered');

    network.setFailed('generator-0', true);
    const { states } = network.evaluate();
    expect(states.get('generator-0')).toBe('disabled-failure');
    expect(states.get('load-0')).toBe('disabled-no-supply');
  });

  it('a failed consumer is disabled-failure, not disabled-no-supply, even with ample capacity', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 100 });
    network.addNode({ id: 'load-0', kind: 'consumer', capacityOrDemand: 10 });
    network.connect('generator-0', 'load-0');
    network.setFailed('load-0', true);

    expect(network.evaluate().states.get('load-0')).toBe('disabled-failure');
  });

  it('un-failing a node restores normal evaluation', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 40 });
    network.addNode({ id: 'load-0', kind: 'consumer', capacityOrDemand: 40 });
    network.connect('generator-0', 'load-0');
    network.setFailed('generator-0', true);
    expect(network.evaluate().states.get('load-0')).toBe('disabled-no-supply');

    network.setFailed('generator-0', false);
    expect(network.evaluate().states.get('load-0')).toBe('powered');
  });
});

describe('UtilityNetwork: invalidation only on structural change', () => {
  it('evaluate() returns the identical cached object when nothing changed between calls', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 40 });
    network.addNode({ id: 'load-0', kind: 'consumer', capacityOrDemand: 40 });
    network.connect('generator-0', 'load-0');

    const first = network.evaluate();
    const second = network.evaluate();
    expect(second.states).toBe(first.states); // same cached Map instance, not merely equal
  });

  it('a structural change (addNode/connect/setFailed) invalidates the cache', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 40 });
    network.addNode({ id: 'load-0', kind: 'consumer', capacityOrDemand: 40 });
    network.connect('generator-0', 'load-0');
    const first = network.evaluate();

    network.addNode({ id: 'load-1', kind: 'consumer', capacityOrDemand: 5 });
    const second = network.evaluate();
    expect(second.states).not.toBe(first.states);
  });

  it('setFailed to the same value it already had does not bump the revision (no spurious invalidation)', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 40 });
    const first = network.evaluate();
    network.setFailed('generator-0', false); // already false
    const second = network.evaluate();
    expect(second.states).toBe(first.states);
  });
});

describe('UtilityNetwork: snapshot/restore', () => {
  it('round-trips nodes, connections and failure state', () => {
    const network = new UtilityNetwork('water');
    network.addNode({ id: 'well-0', kind: 'producer', capacityOrDemand: 50 });
    network.addNode({ id: 'tap-0', kind: 'consumer', capacityOrDemand: 20 });
    network.connect('well-0', 'tap-0');
    network.setFailed('tap-0', true);

    const snapshot = network.getSnapshot();
    const restored = new UtilityNetwork('water');
    restored.loadSnapshot(snapshot);

    expect(restored.evaluate().states.get('tap-0')).toBe('disabled-failure');
    expect(restored.isFailed('tap-0')).toBe(true);
  });

  it('rejects loading a snapshot of the wrong utility type', () => {
    const water = new UtilityNetwork('water');
    const snapshot = water.getSnapshot();
    const electricity = new UtilityNetwork('electricity');
    expect(() => electricity.loadSnapshot(snapshot)).toThrow(/Cannot load a "water" snapshot/);
  });
});
