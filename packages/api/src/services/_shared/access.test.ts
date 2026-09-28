import { describe, expect, it } from 'vitest';
import { roleCan, rolesWith } from './access';

describe('role capabilities', () => {
  it('gives the Owner everything, including payouts and members', () => {
    expect(roleCan('OWNER', 'organization.payouts')).toBe(true);
    expect(roleCan('OWNER', 'organization.members')).toBe(true);
    expect(roleCan('OWNER', 'event.edit')).toBe(true);
  });

  it('lets an Admin run events but not touch money or members', () => {
    expect(roleCan('ADMIN', 'event.edit')).toBe(true);
    expect(roleCan('ADMIN', 'event.orders')).toBe(true);
    expect(roleCan('ADMIN', 'organization.payouts')).toBe(false);
    expect(roleCan('ADMIN', 'organization.members')).toBe(false);
  });

  it('limits a Scanner to check-in', () => {
    expect(roleCan('SCANNER', 'event.checkIn')).toBe(true);
    expect(roleCan('SCANNER', 'event.edit')).toBe(false);
    expect(roleCan('SCANNER', 'event.orders')).toBe(false);
  });

  it('lists the roles holding a capability', () => {
    expect(rolesWith('organization.payouts')).toEqual(['OWNER']);
    expect(rolesWith('event.checkIn')).toEqual(['OWNER', 'ADMIN', 'SCANNER']);
  });
});
