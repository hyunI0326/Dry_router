import { describe, expect, it } from 'vitest';
import { classify, counts, locations, nearbyShelters, raw, matchesLocation, sourceAudit, osm } from './network';
import original from './shelters.json';
describe('uploaded OSM dataset',()=>{
 it('finds 1240 nodes but no connected ways in the supplied original OSM JSON',()=>{expect(sourceAudit.nodes).toBe(1240);expect(sourceAudit.ways).toBe(0);expect(sourceAudit.relations).toBe(0);expect(sourceAudit.matchedIds).toBe(1240);});
 it('uses coordinates matching the original OSM records',()=>{for(const element of osm.elements){const location=locations.find(p=>p.id===`node/${element.id}`);expect(location?.coord).toEqual([element.lon,element.lat]);}});
 it('imports all 1550 uploaded points and no invented walking lines',()=>{expect(counts.total).toBe(1550);expect(counts.lines).toBe(0);});
 it('only classifies explicit shelter=yes as shelter',()=>{expect(counts.shelter).toBe(87);expect(classify({shelter:'yes'})).toBe('shelter');});
 it('preserves every original canopy ID, coordinate and property',()=>{for(const feature of original.features){const merged=raw.features.find(p=>p.id===feature.id);expect(merged?.geometry).toEqual(feature.geometry);expect(merged?.properties).toMatchObject(feature.properties);}});
 it('keeps covered points distinct from shelter and walking lines',()=>{expect(classify({covered:'yes'})).toBe('covered');expect(classify({covered:'no'})).toBe('unknown');});
 it('searches original OSM tags and identifiers',()=>{const p=locations.find(p=>p.tags['highway']==='elevator');if(!p)throw new Error('Missing elevator');expect(matchesLocation(p,'elevator')).toBe(true);expect(matchesLocation(p,p.id)).toBe(true);expect(matchesLocation(p,'not-an-osm-location')).toBe(false);});
 it('does not treat subway entrances as covered paths',()=>{expect(classify({railway:'subway_entrance'})).toBe('entrance');expect(classify({entrance:'main'})).toBe('entrance');});
 it('does not turn missing or negative tags into shelter',()=>{expect(classify({highway:'bus_stop'})).toBe('unknown');expect(classify({shelter:'no'})).toBe('unsheltered');});
 it('only lists explicit shelters near selected bounds',()=>{const a=locations[0];const b=locations[1];if(!a||!b)throw new Error('Missing endpoints');const list=nearbyShelters(a,b);expect(list.length).toBeGreaterThan(0);expect(list.every(p=>p.tags['shelter']==='yes')).toBe(true);});
});
