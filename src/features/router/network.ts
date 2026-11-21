import original from './shelters.json';
import expanded from './roads.json';
import osmSource from './osm.json';
export const osm = osmSource;
type SourceFeature = { type: string; id: string; properties: Record<string, string | undefined>; geometry: { type: string; coordinates: number[] } };
const records = new Map<string, SourceFeature>(expanded.features.map(feature => [feature.id, feature]));
for (const feature of original.features) {
  const newer = records.get(feature.id);
  records.set(feature.id, newer ? { ...newer, properties: { ...newer.properties, ...feature.properties }, geometry: feature.geometry } : feature);
}
export const raw = { ...expanded, features: [...records.values()] };
export type Category = 'shelter' | 'covered' | 'entrance' | 'unknown' | 'unsheltered';
export type Location = { id: string; name: string; coord: [number, number]; category: Category; tags: Record<string, string> };
export function classify(tags: Record<string, string>): Category {
  if (tags['shelter'] === 'yes') return 'shelter';
  if (['yes', 'arcade', 'colonnade'].includes(tags['covered'] ?? '') || tags['indoor'] === 'yes') return 'covered';
  if (tags['railway'] === 'subway_entrance' || tags['entrance']) return 'entrance';
  if (tags['shelter'] === 'no') return 'unsheltered';
  return 'unknown';
}
export const locations: Location[] = raw.features.flatMap(feature => {
  const [lng, lat] = feature.geometry.coordinates;
  if (feature.geometry.type !== 'Point' || typeof lng !== 'number' || typeof lat !== 'number') return [];
  const tags = Object.fromEntries(Object.entries(feature.properties).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const name = tags['name:ko'] || tags['name'] || tags['description:ko'] || tags['description'] || (tags['entrance'] ? `건물 출입구 · ${feature.id.split('/')[1]}` : `위치 · ${feature.id.split('/')[1]}`);
  return [{ id: feature.id, name, coord: [lng, lat] as [number, number], category: classify(tags), tags }];
});
export const labels: Record<Category, string> = { shelter: '쉼터 표시 있음', covered: '덮임·실내 표시 (점)', entrance: '출입구 · 지붕 미확인', unknown: '지붕 정보 없음', unsheltered: '쉼터 없음' };
export const counts = { total: locations.length, shelter: locations.filter(p => p.category === 'shelter').length, entrance: locations.filter(p => p.category === 'entrance').length, unknown: locations.filter(p => p.category === 'unknown').length, unsheltered: locations.filter(p => p.category === 'unsheltered').length, lines: raw.features.filter(p => p.geometry.type !== 'Point').length };
const osmIds = new Set(osm.elements.map(element => `${element.type}/${element.id}`));
export const sourceAudit = {
  points: expanded.features.filter(feature => feature.geometry.type === 'Point').length,
  lines: expanded.features.filter(feature => ['LineString', 'MultiLineString'].includes(feature.geometry.type)).length,
  nodes: osm.elements.filter(element => element.type === 'node').length,
  ways: osm.elements.filter(element => element.type === 'way').length,
  relations: osm.elements.filter(element => element.type === 'relation').length,
  matchedIds: expanded.features.filter(feature => osmIds.has(feature.id)).length,
  timestamp: osm.osm3s.timestamp_osm_base,
};
export const datasetTime = raw.timestamp;
export const coveredCount = locations.filter(p => p.category === 'covered').length;
export const datasetBounds: [[number, number], [number, number]] = [
  [Math.min(...locations.map(p => p.coord[0])), Math.min(...locations.map(p => p.coord[1]))],
  [Math.max(...locations.map(p => p.coord[0])), Math.max(...locations.map(p => p.coord[1]))],
];
export function matchesLocation(p: Location, query: string) {
  const text = query.trim().toLocaleLowerCase();
  return !text || [p.id, p.name, ...Object.values(p.tags)].some(value => value.toLocaleLowerCase().includes(text));
}
export function nearbyShelters(a: Location, b: Location): Location[] {
  const minLat = Math.min(a.coord[1],b.coord[1]) - .002;
  const maxLat = Math.max(a.coord[1],b.coord[1]) + .002;
  const minLng = Math.min(a.coord[0],b.coord[0]) - .004;
  const maxLng = Math.max(a.coord[0],b.coord[0]) + .004;
  return locations.filter(p => p.category === 'shelter' && p.coord[0] >= minLng && p.coord[0] <= maxLng && p.coord[1] >= minLat && p.coord[1] <= maxLat);
}
export const walkingQuery = `[out:json][timeout:180];
(
 way["highway"](37.545,126.950,37.590,127.000);
 way["covered"](37.545,126.950,37.590,127.000);
 way["indoor"](37.545,126.950,37.590,127.000);
 way["tunnel"](37.545,126.950,37.590,127.000);
);
out body geom;
>;
out body qt;`;
