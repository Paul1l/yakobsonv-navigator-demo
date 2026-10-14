import{clamp,createStations,stationProgress,sampleGuide,packetState,routePath}from'./geometry.js';

const root=document.documentElement;
const journey=document.getElementById('journey');
const guide=document.getElementById('guide');
const scenes=[...document.querySelectorAll('[data-scene]')];
const packetElements=[...document.querySelectorAll('[data-packet]')];
const navLinks=[...document.querySelectorAll('[data-step]')];
const routeSvg=document.getElementById('journey-track');
const route=document.getElementById('route-path');
const raySvg=document.getElementById('connections');
const caption=document.getElementById('guide-caption-text');
const position=document.getElementById('journey-position');
const motionButton=document.getElementById('motion-toggle');
const themeButton=document.getElementById('theme-toggle');
const dialog=document.getElementById('detail-dialog');
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const svgNS='http://www.w3.org/2000/svg';
let motionEnabled=!reduceMotion.matches;
let stations=[];
let packets=[];
let journeyTop=0;
let guideSize=360;
let activeScene=-1;
let scheduledFrame=null;
let resizeFrame=null;
let dialogTrigger=null;
const captions=['Джарвис · ваш гид','01 · Создаём основу','02 · Находим клиентов','03 · Освобождаем время','04 · Ваша задача'];
const topicData={
 site:{category:'Сайт · от структуры до запуска',title:'Понятный путь к обращению',description:'Начинаем с задачи бизнеса и вопросов посетителя. Из них складываются структура страниц, содержание и интерфейс.',items:['Разбор текущего сайта и структура основных сценариев.','Дизайн, адаптивная вёрстка и удобство на разных экранах.','Формы, проверка передачи заявок и измерение целевых действий.']},
 traffic:{category:'Трафик · поисковый спрос',title:'Встретиться с вашими клиентами',description:'Развиваем сайт вокруг задач, с которыми клиенты приходят в поиск. Содержание и структура помогают получить нужный ответ.',items:['Изучение запросов и развитие подходящих посадочных страниц.','Технический аудит, приоритеты исправления и проверка изменений.','Результаты с контекстом: исходная ситуация, период и выполненные работы.']},
 automation:{category:'Автоматизация · процессы и ИИ',title:'Повторяющиеся действия — в один процесс',description:'Разбираем, какие операции отнимают время, и подбираем автоматизацию к конкретной задаче.',items:['Передача заявок между инструментами и уведомления.','Обработка информации и подготовка черновиков с помощью ИИ.','Связь сервисов, контроль ошибок и проверка человеком там, где важна точность.']}
};

function svgElement(tag,attributes){const el=document.createElementNS(svgNS,tag);for(const[key,value]of Object.entries(attributes))el.setAttribute(key,String(value));return el;}
function layoutBox(element){
 let left=0,top=0,node=element;
 while(node&&node!==journey){left+=node.offsetLeft;top+=node.offsetTop;node=node.offsetParent;}
 return{left,top,width:element.offsetWidth,height:element.offsetHeight};
}
function buildOrb(){
 const ticks=document.getElementById('orb-ticks');
 for(let i=0;i<96;i++){const a=i*Math.PI/48,inner=i%8===0?184:188,outer=192;ticks.append(svgElement('line',{x1:200+Math.cos(a)*inner,y1:200+Math.sin(a)*inner,x2:200+Math.cos(a)*outer,y2:200+Math.sin(a)*outer,opacity:i%8===0?.8:.38}));}
 const globe=document.getElementById('orb-core');
 const project=(lat,lon)=>{const r=53,x=r*Math.cos(lat)*Math.sin(lon),y=r*Math.sin(lat),z=r*Math.cos(lat)*Math.cos(lon),angle=.28;return{x:200+x*Math.cos(angle)-y*Math.sin(angle),y:200+x*Math.sin(angle)+y*Math.cos(angle),z};};
 for(let lat=-60;lat<=60;lat+=20){let d='';for(let lon=0;lon<=360;lon+=5){const p=project(lat*Math.PI/180,lon*Math.PI/180);d+=`${lon?'L':'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)} `;}globe.append(svgElement('path',{d,opacity:.3}));}
 for(let lon=0;lon<180;lon+=22.5){let d='';for(let lat=-90;lat<=270;lat+=5){const p=project(lat*Math.PI/180,lon*Math.PI/180);d+=`${lat===-90?'M':'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)} `;}globe.append(svgElement('path',{d,opacity:.4}));}
 for(let lat=-60;lat<=60;lat+=20){for(let lon=-90;lon<=90;lon+=30){const p=project(lat*Math.PI/180,lon*Math.PI/180);globe.append(svgElement('circle',{cx:p.x,cy:p.y,r:1.25,fill:'currentColor',stroke:'none',opacity:.8}));}}
 globe.append(svgElement('circle',{cx:200,cy:200,r:53,opacity:.22}));
}


function measure(){
 journeyTop=journey.getBoundingClientRect().top+window.scrollY;
 const width=journey.clientWidth,height=journey.offsetHeight,mobile=width<=640;
 guideSize=guide.offsetWidth;
 const points=scenes.map((scene,index)=>{
  const box=layoutBox(scene.querySelector('.guide-anchor'));
  return{x:box.left,y:box.top,scale:index===0?1:mobile?.76:index===4?.78:.68};
 });
 stations=createStations(points,window.innerHeight,journeyTop);
 for(const svg of[routeSvg,raySvg]){
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.setAttribute('width',width);svg.setAttribute('height',height);
 }
 route.setAttribute('d',routePath(points));
 raySvg.replaceChildren();
 packets=packetElements.map(el=>{
  const scene=el.closest('[data-scene]'),index=scenes.indexOf(scene);
  const box=layoutBox(el),source=points[index];
  const originX=source.x<box.left+box.width/2?0:1,originY=mobile?0:.5;
  const target={x:box.left+box.width*originX,y:box.top+box.height*originY};
  el.style.transformOrigin=`${originX*100}% ${originY*100}%`;
  const line=svgElement('path',{}),dot=svgElement('circle',{r:2});
  raySvg.append(line,dot);
  return{el,index,order:Number(el.dataset.packet),source,target,line,dot,last:null};
 });
 activeScene=-1;render();
}
function render(){
 scheduledFrame=null;
 if(!stations.length)return;
 const scrollY=window.scrollY;
 const p=motionEnabled?sampleGuide(stations,scrollY):stations[0];
 guide.style.transform=`translate3d(${(p.x-guideSize/2).toFixed(2)}px,${(p.y-guideSize/2).toFixed(2)}px,0) scale(${p.scale.toFixed(4)})`;
 guide.classList.add('is-ready');
 // Подпись гида видна у остановки; в перелёте между разделами прячется — на телефоне она проходила бы поверх заголовков
 guide.classList.toggle('is-travelling',motionEnabled&&p.phase===0&&p.index>0);
 let current=p.index;
 if(!motionEnabled){current=0;for(let i=1;i<stations.length;i++)if(scrollY>=stations[i].arrival)current=i;}
 if(current!==activeScene){
  activeScene=current;caption.textContent=captions[motionEnabled?current:0];
  navLinks.forEach(link=>{if(link.dataset.step===scenes[current].id)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});
  position.replaceChildren(document.createTextNode(String(current+1).padStart(2,'0')+' '));
  const total=document.createElement('span');total.textContent='/ 05';position.append(total);
 }
 let power=0;
 for(const packet of packets){
  const focused=packet.el.contains(document.activeElement);
  const phase=motionEnabled&&!focused?stationProgress(stations[packet.index],scrollY):1;
  const state=packetState(phase,packet.order,packet.source,packet.target);
  if(motionEnabled&&packet.index===p.index)power=Math.max(power,state.energy);
  if(packet.last===state.progress)continue;
  packet.last=state.progress;
  packet.el.style.transform=`translate3d(${state.dx.toFixed(2)}px,${state.dy.toFixed(2)}px,0) scale(${state.scale.toFixed(4)})`;
  packet.el.style.opacity=String(state.opacity);
  packet.el.style.filter=state.progress>0&&state.progress<1?`blur(${((1-state.eased)*2).toFixed(2)}px)`:'none';
  packet.el.classList.toggle('is-emitting',state.progress<.98);
  const emitting=motionEnabled&&state.progress>0&&state.progress<1;
  const opacity=emitting?state.energy*.28:0;
  packet.line.style.opacity=String(opacity);
  packet.dot.style.opacity=String(opacity*2);
  if(emitting){
   const end={x:packet.target.x+state.dx,y:packet.target.y+state.dy};
   const a=packet.source,midX=(a.x+end.x)/2;
   packet.line.setAttribute('d',`M ${a.x} ${a.y} C ${midX} ${a.y} ${midX} ${end.y} ${end.x} ${end.y}`);
   packet.dot.setAttribute('cx',end.x);packet.dot.setAttribute('cy',end.y);
  }
 }
 guide.style.setProperty('--emission-power',power.toFixed(3));
}
function requestRender(){if(scheduledFrame===null)scheduledFrame=requestAnimationFrame(render);}
function requestMeasure(){if(resizeFrame!==null)cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{resizeFrame=null;measure();});}
function applyMotion(){
 activeScene=-1;
 root.classList.toggle('motion-off',!motionEnabled);
 root.classList.toggle('motion-opt-in',motionEnabled&&reduceMotion.matches);
 motionButton.setAttribute('aria-pressed',String(motionEnabled));
 motionButton.querySelector('.motion-icon').textContent=motionEnabled?'Ⅱ':'▷';
 motionButton.querySelector('.motion-label').textContent=motionEnabled?'Без анимации':'Включить гида';
 packets.forEach(packet=>{packet.last=null;});requestRender();
}
function goTo(id,{start=false,instant=false}={}){
 const index=scenes.findIndex(scene=>scene.id===id);
 if(index<0||!stations.length)return false;
 const station=stations[index];
 const top=index===0?0:start&&motionEnabled?station.arrival+(station.departure-station.arrival)*.1:station.departure;
 window.scrollTo({top:Math.max(0,top),behavior:instant||!motionEnabled?'instant':'smooth'});
 return true;
}
document.addEventListener('click',event=>{
 const link=event.target.closest('a[href^="#"]');
 if(!link||event.defaultPrevented||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const id=link.getAttribute('href').slice(1);
 if(goTo(id,{start:link.hasAttribute('data-tour-start')})){
  event.preventDefault();history.replaceState(null,'',`#${id}`);
 }
});
function openDetails(topic,trigger){
 const data=topicData[topic];if(!data)return;
 document.getElementById('detail-category').textContent=data.category;
 document.getElementById('detail-title').textContent=data.title;
 document.getElementById('detail-description').textContent=data.description;
 const list=document.getElementById('detail-list');list.replaceChildren();
 for(const text of data.items){const li=document.createElement('li');li.textContent=text;list.append(li);}
 dialogTrigger=trigger;dialog.showModal();root.classList.add('modal-open');document.getElementById('dialog-close').focus();
}
dialog.addEventListener('close',()=>{root.classList.remove('modal-open');if(dialogTrigger?.isConnected)dialogTrigger.focus({preventScroll:true});requestMeasure();});
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
document.getElementById('dialog-close').addEventListener('click',()=>dialog.close());
document.getElementById('dialog-contact').addEventListener('click',()=>{
 dialogTrigger=null;dialog.close();goTo('contact');history.replaceState(null,'','#contact');
 const target=document.getElementById('contact-title');target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
});
document.querySelectorAll('[data-topic]').forEach(button=>button.addEventListener('click',()=>openDetails(button.dataset.topic,button)));
// Keyboard users can reach the details without having to perform the scroll gesture.
document.addEventListener('focusin',event=>{
 const packet=event.target.closest?.('[data-packet]');
 if(packet&&motionEnabled&&event.target.matches('a,button')){
  const scene=packet.closest('[data-scene]'),index=scenes.indexOf(scene);
  if(stationProgress(stations[index],window.scrollY)<1)goTo(scene.id,{instant:true});
 }
 requestRender();
});
document.addEventListener('focusout',requestRender);
motionButton.addEventListener('click',()=>{motionEnabled=!motionEnabled;applyMotion();});
reduceMotion.addEventListener('change',()=>{motionEnabled=!reduceMotion.matches;applyMotion();});
function setTheme(dark){root.dataset.theme=dark?'dark':'light';themeButton.setAttribute('aria-pressed',String(dark));themeButton.setAttribute('aria-label',dark?'Включить светлую тему':'Включить тёмную тему');document.querySelector('meta[name="theme-color"]').setAttribute('content',dark?'#101918':'#f5f5f0');}
themeButton.addEventListener('click',()=>{const dark=root.dataset.theme!=='dark';setTheme(dark);try{localStorage.setItem('yakobson-jarvis-theme',dark?'dark':'light');}catch{}});
try{if(localStorage.getItem('yakobson-jarvis-theme')==='dark')setTheme(true);}catch{}
window.addEventListener('scroll',requestRender,{passive:true});
window.addEventListener('resize',requestMeasure,{passive:true});
window.addEventListener('hashchange',()=>goTo(location.hash.slice(1),{instant:true}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestMeasure();});
const resizeObserver=new ResizeObserver(requestMeasure);resizeObserver.observe(journey);
buildOrb();applyMotion();measure();
document.fonts.ready.then(()=>{measure();if(location.hash)goTo(location.hash.slice(1),{instant:true});});
