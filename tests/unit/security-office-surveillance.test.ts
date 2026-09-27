import { describe, expect, it } from 'vitest';
import { observedContrabandBySecurityOffice } from '../../src/simulation/security/office-surveillance';

const office = (capabilities: readonly string[]) => ({ objectCapabilities: capabilities });
const item = (state: 'concealed' | 'confiscated' | 'departed') => ({ state });

describe('security-office surveillance', () => {
  it('keeps hidden contraband hidden without a console in a security office', () => {
    const items = { all: () => [item('concealed'), item('confiscated')] };
    expect(observedContrabandBySecurityOffice({ allByRoomCatalogId: () => [] }, items)).toBeUndefined();
    expect(observedContrabandBySecurityOffice({ allByRoomCatalogId: () => [office(['workstation'])] }, items)).toBeUndefined();
  });

  it('reveals only still-concealed items for the prison-wide derived sector', () => {
    const rooms = { allByRoomCatalogId: (id: string) => id === 'room.security-office' ? [office(['workstation', 'surveillance'])] : [] };
    const items = { all: () => [item('concealed'), item('confiscated'), item('concealed'), item('departed')] };
    const observed = observedContrabandBySecurityOffice(rooms, items);
    expect([...observed!.entries()]).toEqual([['security-sector.prison', 2]]);
  });

  it('reports an equipped prison with no concealed items as observed zero', () => {
    const rooms = { allByRoomCatalogId: () => [office(['surveillance'])] };
    const observed = observedContrabandBySecurityOffice(rooms, { all: () => [] });
    expect(observed?.get('security-sector.prison')).toBe(0);
  });
});
