import { describe, expect, it } from 'vitest';
import {
  coverOf,
  findRoutes,
  isWalkable,
  MAX_DETOUR,
  WALK_METERS_PER_MINUTE,
  walkAudit,
} from './walking';
import { locations } from './network';
const a = locations.find(p => p.name.includes('경복궁역') && p.tags['railway'] === 'subway_entrance');
const b = locations.find(p => p.name.includes('서울역') && p.tags['railway'] === 'subway_entrance');
describe('OSM walking network', () => {
  it('loads real OSM ways for routing', () => { expect(walkAudit.ways).toBe(3807); expect(walkAudit.walkable).toBeGreaterThan(3000); });
  it('only counts explicit tags as covered', () => {
    expect(coverOf({ highway: 'footway', covered: 'yes' })).toBe('covered');
    expect(coverOf({ highway: 'footway', tunnel: 'building_passage' })).toBe('covered');
    expect(coverOf({ highway: 'corridor' })).toBe('covered');
    expect(coverOf({ highway: 'footway' })).toBe('unknown');
    expect(coverOf({ highway: 'footway', covered: 'no' })).toBe('exposed');
  });
  it('excludes roads pedestrians cannot use', () => {
    expect(isWalkable({ highway: 'motorway' })).toBe(false);
    expect(isWalkable({ highway: 'footway', foot: 'no' })).toBe(false);
    expect(isWalkable({ highway: 'service', access: 'private' })).toBe(false);
    expect(isWalkable({ highway: 'footway' })).toBe(true);
  });
  it('connects Gyeongbokgung station to Seoul station', () => {
    if (!a || !b) throw new Error('missing stations');
    const r = findRoutes(a.coord, b.coord);
    if (!r.ok) throw new Error(r.reason);
    expect(r.fast.length).toBeGreaterThan(2000);
    expect(r.dry.length).toBeLessThanOrEqual(r.fast.length * MAX_DETOUR);
    expect(r.dry.uncovered).toBeLessThanOrEqual(r.fast.uncovered);
  });
  it('uses the extra walking time to constrain the drier route', () => {
    if (!a || !b) throw new Error('missing stations');
    const noDetour = findRoutes(a.coord, b.coord, 0);
    const withDetour = findRoutes(a.coord, b.coord, 20);
    if (!noDetour.ok || !withDetour.ok) throw new Error('missing routes');

    expect(noDetour.sameRoute).toBe(true);
    expect(withDetour.fast).toEqual(noDetour.fast);
    const extraDistance = withDetour.dry.length - withDetour.fast.length;
    expect(extraDistance).toBeGreaterThan(0);
    expect(extraDistance).toBeLessThanOrEqual(20 * WALK_METERS_PER_MINUTE);
    expect(withDetour.dry.uncovered).toBeLessThan(noDetour.dry.uncovered);
  });
  it.each([-1, NaN, Infinity])('rejects an invalid detour time of %s', (minutes) => {
    if (!a || !b) throw new Error('missing stations');
    expect(findRoutes(a.coord, b.coord, minutes).ok).toBe(false);
  });
  it('refuses points outside the collected road area', () => {
    const r = findRoutes([127.05, 37.5], [127.06, 37.51]);
    expect(r.ok).toBe(false);
  });
});
