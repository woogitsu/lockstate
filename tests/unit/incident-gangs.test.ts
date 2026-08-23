import { describe, expect, it } from 'vitest';
import { GangRegistry, resolveRetaliationRisk } from '../../src/simulation/incidents/gangs';

function twoGangs(): GangRegistry {
  const gangs = new GangRegistry();
  gangs.register({ id: 'gang-north', territorySectorIds: ['block-a', 'block-b'] });
  gangs.register({ id: 'gang-south', territorySectorIds: ['block-b', 'block-c'] });
  return gangs;
}

describe('GangRegistry: deterministic membership, territory and reputation', () => {
  it('rejects duplicate gang ids and unknown-gang membership', () => {
    const gangs = twoGangs();
    expect(() => gangs.register({ id: 'gang-north', territorySectorIds: [] })).toThrow(/Duplicate gang id/);
    expect(() => gangs.addMember('gang-nonexistent', 1)).toThrow(/Unknown gang id/);
  });

  it('membership is exclusive -- joining a new gang leaves the old one', () => {
    const gangs = twoGangs();
    gangs.addMember('gang-north', 5);
    expect(gangs.getGangOf(5)).toBe('gang-north');
    expect(gangs.membersOf('gang-north')).toEqual([5]);

    gangs.addMember('gang-south', 5);
    expect(gangs.getGangOf(5)).toBe('gang-south');
    expect(gangs.membersOf('gang-north')).toEqual([]);
    expect(gangs.membersOf('gang-south')).toEqual([5]);
  });

  it('every accessor is deterministically ordered, never Map insertion order', () => {
    const gangs = twoGangs();
    for (const entityId of [9, 2, 7, 1]) gangs.addMember('gang-north', entityId);

    expect(gangs.membersOf('gang-north')).toEqual([1, 2, 7, 9]); // ascending entity id
    expect(gangs.all().map((gang) => gang.id)).toEqual(['gang-north', 'gang-south']); // sorted gang id
    expect(gangs.gangsClaiming('block-b')).toEqual(['gang-north', 'gang-south']);
    expect(gangs.gangsClaiming('block-a')).toEqual(['gang-north']);
    expect(gangs.gangsClaiming('nowhere')).toEqual([]);
  });

  it('reputation starts neutral and clamps to [0, 1]', () => {
    const gangs = twoGangs();
    expect(gangs.getReputation('gang-north')).toBe(0.5);

    gangs.adjustReputation('gang-north', 0.3);
    expect(gangs.getReputation('gang-north')).toBeCloseTo(0.8, 10);

    gangs.adjustReputation('gang-north', 5);
    expect(gangs.getReputation('gang-north')).toBe(1);
    gangs.adjustReputation('gang-north', -5);
    expect(gangs.getReputation('gang-north')).toBe(0);
  });

  it('grudges accumulate, clamp, and cannot be self-directed', () => {
    const gangs = twoGangs();
    expect(() => gangs.addGrudge('gang-north', 'gang-north', 0.5)).toThrow(/cannot hold a grudge against itself/);

    gangs.addGrudge('gang-north', 'gang-south', 0.4);
    gangs.addGrudge('gang-north', 'gang-south', 0.4);
    expect(gangs.getGrudge('gang-north', 'gang-south')).toBeCloseTo(0.8, 10);
    expect(gangs.getGrudge('gang-south', 'gang-north')).toBe(0); // directional, not mutual

    gangs.addGrudge('gang-north', 'gang-south', 5);
    expect(gangs.getGrudge('gang-north', 'gang-south')).toBe(1);

    gangs.clearGrudge('gang-north', 'gang-south');
    expect(gangs.getGrudge('gang-north', 'gang-south')).toBe(0);
  });

  it('snapshot/restore preserves membership, reputation and grudges', () => {
    const gangs = twoGangs();
    gangs.addMember('gang-north', 3);
    gangs.addMember('gang-south', 8);
    gangs.adjustReputation('gang-south', 0.25);
    gangs.addGrudge('gang-north', 'gang-south', 0.6);

    const restored = new GangRegistry();
    restored.loadSnapshot(gangs.getSnapshot());

    expect(restored.all()).toEqual(gangs.all());
    expect(restored.membersOf('gang-north')).toEqual([3]);
    expect(restored.getGangOf(8)).toBe('gang-south');
    expect(restored.getReputation('gang-south')).toBeCloseTo(0.75, 10);
    expect(restored.getGrudge('gang-north', 'gang-south')).toBeCloseTo(0.6, 10);
  });
});

describe('resolveRetaliationRisk: explicit factors, amplified on contested territory', () => {
  it('is zero with no outstanding grudge', () => {
    const gangs = twoGangs();
    expect(resolveRetaliationRisk(gangs, 'gang-north', 'gang-south', 'block-b')).toBe(0);
  });

  it('a contested sector (both gangs claim it) amplifies the grudge; an uncontested one dampens it', () => {
    const gangs = twoGangs();
    gangs.addGrudge('gang-north', 'gang-south', 0.5);

    // block-b is claimed by both -> 0.5 * 1.5
    expect(resolveRetaliationRisk(gangs, 'gang-north', 'gang-south', 'block-b')).toBeCloseTo(0.75, 10);
    // block-a is claimed only by gang-north -> 0.5 * 0.5
    expect(resolveRetaliationRisk(gangs, 'gang-north', 'gang-south', 'block-a')).toBeCloseTo(0.25, 10);
  });

  it('clamps to [0, 1] even at maximum grudge on contested ground', () => {
    const gangs = twoGangs();
    gangs.addGrudge('gang-north', 'gang-south', 1);
    expect(resolveRetaliationRisk(gangs, 'gang-north', 'gang-south', 'block-b')).toBe(1);
  });
});
