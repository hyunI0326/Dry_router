import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { datasetBounds, locations, type Category, type Location } from './network';
import { walkwayFeatures, type WalkRoute } from './walking';
export type MapRoutes = { fast: WalkRoute; dry: WalkRoute; active: 'fast' | 'dry' } | null;
function routeData(routes: MapRoutes) {
 const features = routes ? (['fast','dry'] as const).flatMap(kind => routes[kind].segments.map(s => ({ type: 'Feature' as const, properties: { kind, active: routes.active === kind, cover: s.cover }, geometry: { type: 'LineString' as const, coordinates: s.coords } }))) : [];
 return { type: 'FeatureCollection' as const, features };
}
export function fitArea(map: maplibregl.Map) { map.fitBounds(datasetBounds,{padding:70,duration:650}); }
export default function RouteMap({ visible, onSelect, selected, endpoints, mapRef, routes }: { routes: MapRoutes; visible: Category[]; onSelect: (p: Location) => void; selected: Location | null; endpoints: [Location, Location] | null; mapRef: React.MutableRefObject<maplibregl.Map | null> }) {
 const container = useRef<HTMLDivElement>(null); const callback = useRef(onSelect); callback.current = onSelect;
 const viewState = useRef({visible, selected, endpoints, routes}); viewState.current = {visible, selected, endpoints, routes};
 useEffect(() => {
  if (!container.current) return;
  maplibregl.setWorkerUrl(workerUrl);
  const color = (token: string) => {
   const ctx = document.createElement('canvas').getContext('2d'); if (!ctx) return 'transparent';
   ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim();ctx.fillRect(0,0,1,1);
   const pixel = ctx.getImageData(0,0,1,1).data;return `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
  };
  const map = new maplibregl.Map({container: container.current,style:'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',center:[126.977,37.565],zoom:14,attributionControl:{compact:true}});mapRef.current=map;
  map.on('load',() => {
   fitArea(map);
   map.addSource('walkways',{type:'geojson',data:walkwayFeatures()});
   map.addLayer({id:'walkways',type:'line',source:'walkways',paint:{'line-color':['match',['get','cover'],'covered',color('--covered'),color('--unknown')],'line-width':['interpolate',['linear'],['zoom'],13,['match',['get','cover'],'covered',2.5,.6],17,['match',['get','cover'],'covered',6,2]],'line-opacity':['match',['get','cover'],'covered',.9,.45]}});
   map.addSource('routes',{type:'geojson',data:routeData(viewState.current.routes)});
   map.addLayer({id:'route-casing',type:'line',source:'routes',filter:['==',['get','active'],true],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color('--map-halo'),'line-width':10}});
   map.addLayer({id:'route-inactive',type:'line',source:'routes',filter:['==',['get','active'],false],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color('--foreground'),'line-width':3,'line-opacity':.35,'line-dasharray':[2,1.5]}});
   map.addLayer({id:'route-active',type:'line',source:'routes',filter:['==',['get','active'],true],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','cover'],'covered',color('--covered'),color('--outdoor')],'line-width':6}});
   map.addSource('locations',{type:'geojson',data:{type:'FeatureCollection',features:locations.map(p => ({type:'Feature',properties:{id:p.id,name:p.name,category:p.category},geometry:{type:'Point',coordinates:p.coord}}))}});
    map.addLayer({id:'locations',type:'circle',source:'locations',paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,4,16,8],'circle-color':['match',['get','category'],'shelter',color('--covered'),'covered',color('--roof-point'),'entrance',color('--indoor'),'unsheltered',color('--outdoor'),color('--unknown')],'circle-stroke-width':2,'circle-stroke-color':color('--map-halo'),'circle-opacity':.92}});
   map.addLayer({id:'location-labels',type:'symbol',source:'locations',minzoom:16,layout:{'text-field':['get','name'],'text-font':['Open Sans Regular'],'text-size':11,'text-offset':[0,1.4],'text-anchor':'top'},paint:{'text-color':color('--foreground'),'text-halo-color':color('--map-halo'),'text-halo-width':2}});
   const initialFilter: maplibregl.FilterSpecification = ['in',['get','category'],['literal',viewState.current.visible]];
   map.setFilter('locations', initialFilter); map.setFilter('location-labels', initialFilter);
   ['route-casing','route-inactive','route-active'].forEach(id=>map.moveLayer(id));
   map.on('click','locations',e => {const id=e.features?.[0]?.properties?.['id'];const p=locations.find(p=>p.id===id);if(p)callback.current(p);});
   map.on('mouseenter','locations',()=>{map.getCanvas().style.cursor='pointer';});map.on('mouseleave','locations',()=>{map.getCanvas().style.cursor='';});
  });
  map.on('resize', () => { if (!viewState.current.selected && !viewState.current.endpoints) fitArea(map); });
  return ()=>{map.remove();mapRef.current=null;};
 },[mapRef]);
 useEffect(()=>{const map=mapRef.current;if(!map)return;const update=()=>{const filter: maplibregl.FilterSpecification=['in',['get','category'],['literal',visible]]; if(map.getLayer('locations'))map.setFilter('locations',filter);if(map.getLayer('location-labels'))map.setFilter('location-labels',filter);};if(map.isStyleLoaded())update();else map.once('load',update);return()=>{map.off('load',update);};},[visible,mapRef]);
 useEffect(()=>{const map=mapRef.current;if(!map)return;const update=()=>{const source=map.getSource('routes') as maplibregl.GeoJSONSource|undefined;source?.setData(routeData(routes));};if(map.getSource('routes'))update();else map.once('load',update);return()=>{map.off('load',update);};},[routes,mapRef]);
 useEffect(()=>{if(selected)mapRef.current?.flyTo({center:selected.coord,zoom:16.5,duration:650});},[selected,mapRef]);
 useEffect(()=>{const map=mapRef.current;if(!map||!endpoints)return;const bounds=new maplibregl.LngLatBounds();endpoints.forEach(p=>bounds.extend(p.coord));map.fitBounds(bounds,{padding:90,maxZoom:16,duration:650});const markers=endpoints.map((p,i)=>{const el=document.createElement('span');el.className='place-marker';el.textContent=i===0?'출':'도';return new maplibregl.Marker({element:el}).setLngLat(p.coord).addTo(map);});return()=>markers.forEach(m=>m.remove());},[endpoints,mapRef]);
 return <div ref={container} className="h-full w-full" aria-label="경복궁역부터 서울역 주변 보행로와 쉼터 지도"/>;
}
