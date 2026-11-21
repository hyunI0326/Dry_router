import data from './walkways.json';

export type Cover = 'covered' | 'exposed' | 'unknown';
type Way = { id: number; nodes: number[]; coords: number[][]; tags: Record<string, string> };
type Edge = { to: number; length: number; cover: Cover; way: number };
export type RouteSegment = { cover: Cover; coords: [number, number][]; wayId: number; name: string; length: number };
export type WalkRoute = { length: number; covered: number; uncovered: number; exposed: number; minutes: number; segments: RouteSegment[]; ways: number };
export type RouteResult =
  | { ok: true; fast: WalkRoute; dry: WalkRoute; sameRoute: boolean; snap: [number, number] }
  | { ok: false; reason: string };

export const walkSource = { timestamp: data.timestamp, bbox: data.bbox as [number, number, number, number], query: data.query };
const ways = data.ways as Way[];
const blockedHighways = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction', 'proposed', 'busway', 'bus_guideway', 'raceway', 'abandoned']);
export const WALK_METERS_PER_MINUTE = 75;
export const MAX_DETOUR = 1.4;
export const MAX_SNAP_METERS = 200;

export function isWalkable(tags: Record<string, string>) {
  if (!tags['highway'] || blockedHighways.has(tags['highway'])) return false;
  const foot = tags['foot'];
  if (foot === 'no') return false;
  if (['no', 'private'].includes(tags['access'] ?? '') && !['yes', 'designated', 'permissive'].includes(foot ?? '')) return false;
  return true;
}
/** Only explicit OSM tags count as cover; missing tags stay unknown. */
export function coverOf(tags: Record<string, string>): Cover {
  if (['yes', 'arcade', 'colonnade'].includes(tags['covered'] ?? '')) return 'covered';
  if (['yes', 'building_passage'].includes(tags['tunnel'] ?? '')) return 'covered';
  if (tags['indoor'] === 'yes' || tags['highway'] === 'corridor' || tags['location'] === 'underground') return 'covered';
  if (tags['covered'] === 'no') return 'exposed';
  return 'unknown';
}
export function distance(a: number[], b: number[]) {
  const r = 6371008.8, rad = Math.PI / 180;
  const dLat = ((b[1] ?? 0) - (a[1] ?? 0)) * rad, dLng = ((b[0] ?? 0) - (a[0] ?? 0)) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] ?? 0) * rad) * Math.cos((b[1] ?? 0) * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const graph = new Map<number, Edge[]>();
const nodeCoord = new Map<number, [number, number]>();
export const walkWays = ways.filter(w => isWalkable(w.tags));
walkWays.forEach((way, index) => {
  const cover = coverOf(way.tags);
  for (let i = 0; i < way.nodes.length; i++) {
    const id = way.nodes[i], c = way.coords[i];
    if (id === undefined || !c) continue;
    nodeCoord.set(id, [c[0] ?? 0, c[1] ?? 0]);
    if (i === 0) continue;
    const prev = way.nodes[i - 1], pc = way.coords[i - 1];
    if (prev === undefined || !pc) continue;
    const length = distance(pc, c);
    if (!graph.has(prev)) graph.set(prev, []);
    if (!graph.has(id)) graph.set(id, []);
    graph.get(prev)?.push({ to: id, length, cover, way: index });
    graph.get(id)?.push({ to: prev, length, cover, way: index });
  }
});
// Largest connected component, so snapped endpoints can actually reach each other.
const component = new Map<number, number>();
let componentId = 0; const sizes: number[] = [];
for (const start of graph.keys()) {
  if (component.has(start)) continue;
  const stack = [start]; component.set(start, componentId); let size = 0;
  while (stack.length) { const n = stack.pop() as number; size++; for (const e of graph.get(n) ?? []) if (!component.has(e.to)) { component.set(e.to, componentId); stack.push(e.to); } }
  sizes.push(size); componentId++;
}
const mainComponent = sizes.indexOf(Math.max(...sizes));

export const walkAudit = {
  ways: ways.length,
  walkable: walkWays.length,
  nodes: graph.size,
  connectedNodes: sizes[mainComponent] ?? 0,
  coveredWays: walkWays.filter(w => coverOf(w.tags) === 'covered').length,
  coveredMeters: Math.round(walkWays.filter(w => coverOf(w.tags) === 'covered').reduce((s, w) => s + w.coords.slice(1).reduce((t, c, i) => t + distance(w.coords[i] ?? c, c), 0), 0)),
};

export function walkwayFeatures() {
  return { type: 'FeatureCollection' as const, features: walkWays.map(w => ({ type: 'Feature' as const, properties: { id: w.id, cover: coverOf(w.tags) }, geometry: { type: 'LineString' as const, coordinates: w.coords } })) };
}
export function inWalkArea(coord: [number, number]) {
  const [w, s, e, n] = walkSource.bbox; return coord[0] >= w && coord[0] <= e && coord[1] >= s && coord[1] <= n;
}
export function snap(coord: [number, number]) {
  let best = -1, bestDistance = Infinity;
  for (const [id, c] of nodeCoord) {
    if (component.get(id) !== mainComponent) continue;
    const d = distance(coord, c); if (d < bestDistance) { bestDistance = d; best = id; }
  }
  return { node: best, meters: bestDistance };
}

function shortest(from: number, to: number, wetFactor: number) {
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, { node: number; edge: Edge }>();
  const heap: [number, number][] = [[0, from]];
  const push = (item: [number, number]) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if ((heap[p]?.[0] ?? 0) <= item[0]) break; heap[i] = heap[p] as [number, number]; i = p; } heap[i] = item; };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length && last) { let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; const v = (k: number) => heap[k]?.[0] ?? Infinity; if (v(l) < (m === i ? last[0] : v(m))) m = l; if (v(r) < (m === i ? last[0] : v(m))) m = r; if (m === i) break; heap[i] = heap[m] as [number, number]; i = m; } heap[i] = last; } return top; };
  while (heap.length) {
    const top = pop(); if (!top) break; const [cost, node] = top;
    if (node === to) break;
    if (cost > (dist.get(node) ?? Infinity)) continue;
    for (const edge of graph.get(node) ?? []) {
      const next = cost + edge.length * (edge.cover === 'covered' ? 1 : wetFactor);
      if (next < (dist.get(edge.to) ?? Infinity)) { dist.set(edge.to, next); prev.set(edge.to, { node, edge }); push([next, edge.to]); }
    }
  }
  if (!dist.has(to)) return null;
  const edges: { from: number; edge: Edge }[] = [];
  for (let n = to; n !== from;) { const p = prev.get(n); if (!p) return null; edges.unshift({ from: p.node, edge: p.edge }); n = p.node; }
  return summarize(edges);
}
function summarize(edges: { from: number; edge: Edge }[]): WalkRoute {
  const segments: RouteSegment[] = [];
  let length = 0, covered = 0, exposed = 0;
  for (const { from, edge } of edges) {
    length += edge.length; if (edge.cover === 'covered') covered += edge.length; if (edge.cover === 'exposed') exposed += edge.length;
    const a = nodeCoord.get(from) as [number, number], b = nodeCoord.get(edge.to) as [number, number];
    const way = walkWays[edge.way];
    const last = segments[segments.length - 1];
    if (last && last.cover === edge.cover && last.wayId === way?.id) { last.coords.push(b); last.length += edge.length; }
    else segments.push({ cover: edge.cover, coords: [a, b], wayId: way?.id ?? 0, name: way?.tags['name'] ?? '', length: edge.length });
  }
  return { length, covered, uncovered: length - covered, exposed, minutes: Math.max(1, Math.round(length / WALK_METERS_PER_MINUTE)), segments, ways: new Set(segments.map(s => s.wayId)).size };
}

export function findRoutes(
  a: [number, number],
  b: [number, number],
  maxDetourMinutes?: number,
): RouteResult {
  if (maxDetourMinutes !== undefined && (!Number.isFinite(maxDetourMinutes) || maxDetourMinutes < 0)) {
    return { ok: false, reason: '최대 우회 시간은 0분 이상으로 입력해 주세요.' };
  }
  if (!inWalkArea(a) || !inWalkArea(b)) return { ok: false, reason: '출발지나 도착지가 수집한 도로 범위(경복궁역–서울역 일대) 밖에 있습니다.' };
  const sa = snap(a), sb = snap(b);
  if (sa.meters > MAX_SNAP_METERS || sb.meters > MAX_SNAP_METERS) return { ok: false, reason: `가까운 보행로가 ${MAX_SNAP_METERS}m 안에 없습니다.` };
  if (sa.node === sb.node) return { ok: false, reason: '출발지와 도착지가 같은 보행로 지점에 연결됩니다. 더 떨어진 위치를 골라 주세요.' };
  const fast = shortest(sa.node, sb.node, 1);
  if (!fast) return { ok: false, reason: '두 지점을 잇는 연결된 보행로가 없습니다.' };
  const maxLength = maxDetourMinutes === undefined
    ? fast.length * MAX_DETOUR
    : fast.length + maxDetourMinutes * WALK_METERS_PER_MINUTE;
  let dry = fast;
  for (const factor of [1.5, 2, 3, 5, 8]) {
    const candidate = shortest(sa.node, sb.node, factor);
    if (candidate && candidate.length <= maxLength && candidate.uncovered < dry.uncovered - 1) dry = candidate;
  }
  return { ok: true, fast, dry, sameRoute: dry === fast, snap: [Math.round(sa.meters), Math.round(sb.meters)] };
}
