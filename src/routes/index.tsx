import { createFileRoute, ClientOnly } from '@tanstack/react-router';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import type { Map } from 'maplibre-gl';
import { ArrowDownUp, ArrowRight, Check, Clock, CloudRain, Download, ExternalLink, Layers, LocateFixed, MapPin, Minus, Plus, Route as RouteIcon, Search, ShieldCheck, Umbrella, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { findRoutes, MAX_DETOUR, walkAudit, walkSource, type RouteResult } from '@/features/router/walking';
import { counts, coveredCount, datasetBounds, datasetTime, labels, locations, matchesLocation, nearbyShelters, osm, raw, sourceAudit, walkingQuery, type Category, type Location } from '@/features/router/network';
const RouteMap = lazy(() => import('@/features/router/map'));
const origin = locations.find(p => p.name.includes('경복궁역') && p.tags['railway'] === 'subway_entrance') ?? locations[0];
const destination = locations.find(p => p.name.includes('서울역') && p.tags['railway'] === 'subway_entrance') ?? locations[1];
const categories: Category[] = ['shelter','covered','entrance','unknown','unsheltered'];
const defaultDetour = `${Math.round((MAX_DETOUR - 1) * 100)}%`;
export const Route = createFileRoute('/')({ head: () => ({ meta: [{ title: 'ROUTER | 경복궁역–서울역 비 덜 맞는 길' }, { name: 'description', content: 'OSM 보행로 3,700여 개를 이어 빠른 길과 지붕 구간이 많은 길을 비교하세요. 경복궁역부터 서울역까지.' }, { property: 'og:title', content: 'ROUTER | 비를 덜 맞는 도심 보행 경로' }, { property: 'og:description', content: '실제 OSM 보행로 연결로 빠른 길과 덜 젖는 길을 비교합니다.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }), component: Index });
function Index() {
 const [fromText,setFromText]=useState(origin?.name ?? '');const [toText,setToText]=useState(destination?.name ?? '');
 const [focus,setFocus]=useState<'from'|'to'|null>(null);const [endpoints,setEndpoints]=useState<[Location,Location]|null>(null);
 const [visible,setVisible]=useState<Category[]>(categories);const [selected,setSelected]=useState<Location|null>(null);const [query,setQuery]=useState('');const [message,setMessage]=useState('');
 const [fromId,setFromId]=useState(origin?.id ?? '');const [toId,setToId]=useState(destination?.id ?? '');const [limit,setLimit]=useState(60);const [active,setActive]=useState<'fast'|'dry'>('dry');
 const [result, setResult] = useState<(RouteResult & { detourMinutes: number | undefined }) | null>(null);
 const mapRef=useRef<Map|null>(null);
 const list=useMemo(()=>{const pool=endpoints?nearbyShelters(...endpoints):locations;return pool.filter(p=>visible.includes(p.category)&&matchesLocation(p,query));},[endpoints,visible,query]);
 const suggestions=locations.filter(p=>matchesLocation(p,focus==='from'?fromText:toText)).slice(0,8);
 function pick(p: Location,field: 'from'|'to') {if(field==='from'){setFromText(p.name);setFromId(p.id);}else{setToText(p.name);setToId(p.id);}setFocus(null);setMessage('');}
 function search(detourMinutes?: number) {
   setFocus(null);
   const a = locations.find(p => p.id === fromId);
   const b = locations.find(p => p.id === toId);
   if (!a || !b) {
     setMessage('검색 목록에서 출발지와 도착지를 선택해 주세요.');
     return;
   }
   if (a.id === b.id) {
     setMessage('출발지와 도착지를 다르게 선택해 주세요.');
     return;
   }
   setEndpoints([a, b]);
   setVisible(['shelter', 'covered', 'entrance']);
   setQuery('');
   setSelected(null);
   setLimit(60);
   const route = findRoutes(a.coord, b.coord, detourMinutes);
   setResult({ ...route, detourMinutes });
   setActive('dry');
   setMessage(route.ok ? '' : route.reason);
 }
 function download() {const url=URL.createObjectURL(new Blob([walkingQuery],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='경복궁역-서울역_보행로_Overpass.txt';a.click();URL.revokeObjectURL(url);}
 function overview(){setEndpoints(null);setResult(null);setMessage('');setSelected(null);setVisible(categories);setLimit(60);mapRef.current?.fitBounds(datasetBounds,{padding:70,duration:650});}
 function exportData(format: 'geojson' | 'osm' = 'geojson'){const url=URL.createObjectURL(new Blob([JSON.stringify(format==='osm'?osm:raw,null,2)],{type:format==='osm'?'application/json':'application/geo+json'}));const a=document.createElement('a');a.href=url;a.download=format==='osm'?'ROUTER_원본_OSM.json':'ROUTER_전체위치_1550.geojson';a.click();URL.revokeObjectURL(url);}
 return <div className="app-shell">
  <header className="topbar"><a href="/" className="brand"><span className="brand-symbol"><RouteIcon size={23}/></span>ROUTER<span className="brand-divider"/><span className="brand-tagline">비를 피하는 길, 더 좋은 길.</span></a><div className="topbar-right"><span className="area-label"><MapPin size={14}/> 경복궁역 — 서울역</span><span className="demo-badge">OSM 보행로 {walkAudit.walkable.toLocaleString()}</span></div></header>
  <main className="workspace"><aside className="sidebar">
    <div className="search-section"><div className="section-eyebrow"><span className="status-dot"/> 날씨와 공간을 잇다</div><h1>서울 도심의<br/>비 피할 곳.</h1><p className="subheading">보행로 {walkAudit.walkable.toLocaleString()}개 연결 · 위치 {counts.total.toLocaleString()}곳</p>
    <form onSubmit={e => {
      e.preventDefault();
      const minutes = new FormData(e.currentTarget).get('detour-minutes');
      search(minutes ? Number(minutes) : undefined);
    }}><div className="location-fields">
      {(['from','to'] as const).map(field=><div className="location-field" key={field}><span className={`location-dot ${field}`}/><div className="field-inner"><label htmlFor={field}>{field==='from'?'출발지':'도착지'}</label><input id={field} autoComplete="off" value={field==='from'?fromText:toText} onFocus={()=>setFocus(field)} onBlur={()=>setTimeout(()=>setFocus(current=>current===field?null:current),150)} onChange={e=>{if(field==='from'){setFromText(e.target.value);setFromId('');}else{setToText(e.target.value);setToId('');}setFocus(field);}}/></div>{field==='from'&&<Button type="button" variant="ghost" size="icon" title="출발지와 도착지 바꾸기" aria-label="출발지와 도착지 바꾸기" onClick={()=>{setFromText(toText);setToText(fromText);setFromId(toId);setToId(fromId);}}><ArrowDownUp/></Button>}</div>)}
     {focus&&<div className="suggestions">{suggestions.map(p=><Button type="button" variant="ghost" className="suggestion" key={p.id} onClick={()=>pick(p,focus)}><MapPin/><span>{p.name}</span></Button>)}{!suggestions.length&&<span className="suggestion-note">일치하는 위치가 없습니다.</span>}</div>}
    </div>
    <div className="mt-4 flex items-center justify-between gap-3">
      <div>
        <label htmlFor="detour-minutes" className="block text-xs font-semibold">최대 우회 시간</label>
        <p id="detour-help" className="mt-1 text-[11px] text-muted-foreground">
          빠른 길 기준 · 비워 두면 기본 {defaultDetour}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input
          id="detour-minutes"
          name="detour-minutes"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="자동"
          aria-describedby="detour-unit detour-help"
          className="w-20"
        />
        <span id="detour-unit" className="text-xs text-muted-foreground">분</span>
      </div>
    </div>
    <Button className="search-button" type="submit"><Search/>덜 젖는 길 찾기<ArrowRight className="ml-auto"/></Button></form>
   </div>
   <div className="weather-band"><div className="weather-icon"><CloudRain size={25}/></div><div><strong>비 오는 날 모드</strong><span>날씨 미연동 · OSM 태그 기준</span></div><Umbrella size={19} className="text-primary"/></div>
   {result?.ok&&<div className="results-section route-results">{(['dry','fast'] as const).map(kind=>{const r=result[kind];return <Button key={kind} variant="outline" className={`route-card ${active===kind?'selected':''}`} aria-pressed={active===kind} onClick={()=>setActive(kind)}><div className="route-card-heading"><span>{kind==='dry'?<Umbrella size={14}/>:<Clock size={14}/>}{kind==='dry'?'덜 젖는 길':'빠른 길'}</span>{kind==='dry'&&result.sameRoute&&<small className="route-note">빠른 길과 같음</small>}</div><div className="route-metrics"><strong>{r.minutes}<small>분</small></strong><span>{(r.length/1000).toFixed(2)}km</span><span className="exposure-metric"><CloudRain size={12}/>지붕 미확인 {Math.round(r.uncovered).toLocaleString()}m</span></div><div className="cover-bar" aria-label={`지붕 확인 구간 ${Math.round(r.covered/r.length*100)}%`}><i style={{width:`${r.covered/r.length*100}%`}}/></div><div className="route-cover-text"><span><i className="legend-line-covered"/>지붕·실내 태그 {Math.round(r.covered).toLocaleString()}m</span><span>{Math.round(r.covered/r.length*100)}%</span></div></Button>;})}
    <p className="route-caveat">
      빠른 길보다 최대 {result.detourMinutes === undefined ? defaultDetour : `${result.detourMinutes.toLocaleString()}분`} 더 걸을 수 있도록 검색했습니다.
      {' '}지붕 태그가 없는 구간은 '정보 없음'으로 비에 노출된다고 보고 계산했습니다.
      {' '}출발 {result.snap[0]}m · 도착 {result.snap[1]}m 떨어진 보행로에 연결했습니다.
    </p>
   </div>}
   <div className="results-section">
     <div className="results-title"><h2>수집된 위치</h2><span>{counts.total.toLocaleString()}곳</span></div>
    <div className="dataset-stats"><div><strong>{counts.shelter}</strong><span>쉼터 표시</span></div><div><strong>{counts.entrance}</strong><span>출입구</span></div><div><strong>{walkAudit.coveredWays}</strong><span>지붕·실내 길</span></div></div>
    <div className="filter-grid">{categories.map(category=><Button key={category} variant={visible.includes(category)?'secondary':'outline'} className="filter-button" aria-pressed={visible.includes(category)} onClick={()=>setVisible(current=>current.includes(category)?current.filter(c=>c!==category):[...current,category])}><i className={`legend-${category}`}/><span>{labels[category]}</span>{visible.includes(category)&&<Check size={12}/>}</Button>)}</div>
     <div className="availability"><ShieldCheck size={18}/><div><strong>{message?'경로를 찾지 못했어요':'보행로 연결망 준비됨'}</strong><p>{message||`OSM에서 받은 길 ${walkAudit.ways.toLocaleString()}개 중 걸을 수 있는 ${walkAudit.walkable.toLocaleString()}개를 공유 지점으로만 이었습니다. 지붕·실내 태그 길은 총 ${(walkAudit.coveredMeters/1000).toFixed(1)}km입니다.`}</p><dl className="source-audit"><div><dt>보행로</dt><dd>길 {walkAudit.walkable.toLocaleString()} · 지점 {walkAudit.nodes.toLocaleString()}</dd></div><div><dt>서로 연결됨</dt><dd>지점 {walkAudit.connectedNodes.toLocaleString()}</dd></div><div><dt>위치 자료</dt><dd>점 {sourceAudit.points.toLocaleString()} · ID 일치 {sourceAudit.matchedIds.toLocaleString()}</dd></div></dl></div></div>
    <div className="list-header"><h2>{endpoints?'선택 구간 주변 쉼터':'위치 목록'}</h2><span>{list.length}곳</span>{endpoints&&<Button variant="ghost" size="sm" onClick={overview}>전체 보기</Button>}</div>
     <div className="list-search"><Search size={14}/><input aria-label="위치 목록 검색" value={query} onChange={e=>{setQuery(e.target.value);setLimit(60);}} placeholder="이름 · OSM ID · 태그 검색"/></div>
     <div className="location-list">{list.slice(0,limit).map(p=><Button variant="ghost" className={`location-item ${selected?.id===p.id?'active':''}`} key={p.id} onClick={()=>setSelected(p)}><span className={`location-type-icon legend-${p.category}`}><MapPin size={15}/></span><span><strong>{p.name}</strong><small>{labels[p.category]} · {p.id}</small></span><ArrowRight size={14}/></Button>)}{list.length===0&&<p className="empty-list">조건에 맞는 위치가 없습니다.</p>}{list.length>limit&&<Button variant="ghost" className="w-full" onClick={()=>setLimit(n=>n+60)}>더 보기 ({Math.min(limit,list.length)} / {list.length})</Button>}</div>
     <div className="data-note"><span>OpenStreetMap · 현장 미검증</span><p>쉼터는 잠시 머무는 장소이며 연속 보행로가 아닙니다.<br/>덮임·실내 표시 {coveredCount}곳은 점 정보이며 경로 계산에는 길의 태그만 씁니다.<br/>보행로 자료 시점: {walkSource.timestamp.replace('T',' ').replace('Z',' UTC')}<br/>출입구만으로 지하통로 연결·지붕을 판단하지 않습니다.<br/>위치 자료 시점: {datasetTime.replace('T',' ').replace('Z',' UTC')}</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={download}><Download/>도로 선 질의 받기</Button><Button variant="outline" size="sm" onClick={()=>exportData()}><Download/>전체 GeoJSON</Button><Button variant="outline" size="sm" onClick={()=>exportData('osm')}><Download/>원본 OSM JSON</Button></div></div>
   </div><div className="sidebar-footer"><span>LINK! 날씨와 공간을 연결하다</span><span>SM@THON 2026</span></div>
  </aside><section className="map-section">
   <ClientOnly fallback={<div className="map-loading">지도를 불러오는 중…</div>}><Suspense fallback={<div className="map-loading">지도를 불러오는 중…</div>}><RouteMap visible={visible} onSelect={setSelected} selected={selected} endpoints={endpoints} mapRef={mapRef} routes={result?.ok?{fast:result.fast,dry:result.dry,active}:null}/></Suspense></ClientOnly>
    <div className="map-top-label"><MapPin size={16}/><strong>경복궁역 — 서울역</strong><span>OSM 보행로 · 현장 미검증</span></div>
   <div className="map-tools"><Button variant="outline" size="icon" title="확대" aria-label="확대" onClick={()=>mapRef.current?.zoomIn()}><Plus/></Button><Button variant="outline" size="icon" title="축소" aria-label="축소" onClick={()=>mapRef.current?.zoomOut()}><Minus/></Button><div className="tool-gap"/><Button variant="outline" size="icon" title="전체 범위 보기" aria-label="전체 범위 보기" onClick={overview}><LocateFixed/></Button><Button variant="outline" size="icon" title="쉼터만 표시" aria-label="쉼터만 표시" onClick={()=>setVisible(['shelter'])}><Layers/></Button></div>
    <div className="map-legend"><span><i className="legend-line-covered"/>지붕·실내 길</span><span><i className="legend-line-open"/>경로 중 지붕 미확인</span><span><i className="legend-shelter"/>쉼터 표시</span><span><i className="legend-covered"/>덮임·실내</span><span><i className="legend-entrance"/>출입구</span><span><i className="legend-unknown"/>정보 없음</span><span><i className="legend-unsheltered"/>쉼터 없음</span></div>
    {!selected&&<div className="journey-panel"><div className="journey-summary"><span className="journey-icon"><Umbrella/></span><div><strong>{result?.ok?`${active==='dry'?'덜 젖는 길':'빠른 길'} · ${result[active].minutes}분 · 지붕 ${Math.round(result[active].covered).toLocaleString()}m`:endpoints?'경로 없음':`보행로 ${walkAudit.walkable.toLocaleString()}개 · 쉼터 ${counts.shelter}곳`}</strong><span>{result?.ok?`비 노출 가능 ${Math.round(result[active].uncovered).toLocaleString()}m · OSM 태그 기준, 현장 미검증`:endpoints?message:'출발지와 도착지를 골라 경로를 비교하세요'}</span></div></div></div>}
   {selected&&<div className="segment-panel point-detail"><div className="flex items-center justify-between"><span className="section-eyebrow">위치 정보</span><Button variant="ghost" size="icon" aria-label="위치 정보 닫기" onClick={()=>setSelected(null)}><X/></Button></div><h3>{selected.name}</h3><span className="point-classification">{labels[selected.category]}</span><dl><div><dt>쉼터 태그</dt><dd>{selected.tags['shelter']||'정보 없음'}</dd></div><div><dt>시설</dt><dd>{selected.tags['railway']==='subway_entrance'?'지하철 출입구':selected.tags['highway']==='bus_stop'?'버스 정류장':selected.tags['entrance']?'건물 출입구':'기타 위치'}</dd></div><div><dt>출입 조건</dt><dd>{selected.tags['access']||'미확인'}</dd></div><div><dt>태그 확인일</dt><dd>{selected.tags['check_date:shelter']||'정보 없음'}</dd></div><div><dt>현장 검증</dt><dd>앱에서 미검증</dd></div><div><dt>좌표</dt><dd>{selected.coord[1].toFixed(6)}, {selected.coord[0].toFixed(6)}</dd></div></dl><p className="detail-caution">{selected.category==='shelter'?'쉼터 존재 태그입니다. 크기·비 차단 정도·현재 상태는 미확인입니다.':'이 위치만으로 지붕이나 연결통로가 있다고 판단할 수 없습니다.'}</p><div className="detail-actions"><Button variant="outline" size="sm" onClick={()=>pick(selected,'from')}>출발지로</Button><Button variant="outline" size="sm" onClick={()=>pick(selected,'to')}>도착지로</Button><Button variant="ghost" size="sm" asChild><a href={`https://www.openstreetmap.org/${selected.id}`} target="_blank" rel="noreferrer">OSM<ExternalLink/></a></Button></div><details className="raw-tags"><summary>원본 태그</summary>{Object.entries(selected.tags).map(([key,value])=><div key={key}><code>{key}</code><span>{value}</span></div>)}</details></div>}
  </section></main>
 </div>;
}
