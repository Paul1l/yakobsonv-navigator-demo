export const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
export const smoothstep=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;

// Arrival/departure are scroll positions. The guide stays at a document point
// while text unfolds, then travels to the next point as scrolling continues.
export function createStations(points,viewportHeight,journeyTop=0,maxScroll=Infinity){
 const duration=clamp(viewportHeight*.36,170,340); // окно появления текста: длиннее — спокойнее вылет блоков
 const stations=points.map((point,index)=>({
  ...point,index,
  arrival:index===0?0:journeyTop+point.y-viewportHeight*.66,
  departure:index===0?0:journeyTop+point.y-viewportHeight*.66+duration
 }));
 // Последние разделы могут не успеть раскрыться до конца страницы (планшет в портрете: высокий экран).
 // Тогда окно раскрытия сдвигается выше, чтобы закончиться не позже максимальной прокрутки.
 for(let index=stations.length-1;index>0;index--){
  const station=stations[index],shift=station.departure-maxScroll;
  if(!(shift>0))break;
  const previous=stations[index-1];
  station.departure=Math.max(maxScroll,previous.departure+2);
  station.arrival=Math.max(station.arrival-shift,previous.departure+1);
  if(station.arrival>=station.departure)station.arrival=station.departure-1;
  maxScroll=station.arrival-1;
 }
 return stations;
}
export function stationProgress(station,scrollY){
 if(station.index===0)return 1;
 return clamp((scrollY-station.arrival)/(station.departure-station.arrival));
}
export function sampleGuide(stations,scrollY){
 if(scrollY<=stations[0].departure)return {...stations[0],phase:1};
 for(let index=1;index<stations.length;index++){
  const a=stations[index-1],b=stations[index];
  if(scrollY<b.arrival){
   const t=clamp((scrollY-a.departure)/(b.arrival-a.departure)),e=smoothstep(t);
   return {x:mix(a.x,b.x,e),y:mix(a.y,b.y,t),scale:mix(a.scale,b.scale,e),index:t<.5?index-1:index,phase:0};
  }
  if(scrollY<=b.departure)return {...b,phase:stationProgress(b,scrollY)};
 }
 return {...stations[stations.length-1],phase:1};
}
export function packetState(stageProgress,order,source,target){
 const start=order*.18,end=.58+order*.21;
 const progress=clamp((stageProgress-start)/(end-start));
 const eased=smoothstep(progress);
 return {
  progress,eased,
  dx:(source.x-target.x)*(1-eased),
  dy:(source.y-target.y)*(1-eased),
  scale:.04+.96*eased,
  opacity:clamp(progress*3),
  energy:Math.sin(progress*Math.PI)
 };
}
export function routePath(points){
 if(!points.length)return '';
 let d=`M ${points[0].x} ${points[0].y}`;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dy=(b.y-a.y)/3;
  d+=` C ${a.x} ${a.y+dy} ${b.x} ${b.y-dy} ${b.x} ${b.y}`;
 }
 return d;
}
