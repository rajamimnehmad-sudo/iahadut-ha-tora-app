import test from 'node:test';
import assert from 'node:assert/strict';
import {enableBrandMarqueeDrag} from '../web/brand-marquee.js';
import {centeredCarouselOffset} from '../web/carousel-layout.js';
import {createNoticeViews} from '../web/notice-views.js';
function harness(delay=0){
 const handlers={};let pauses=0,plays=0,phase;
 const motion={currentTime:10000,effect:{getTiming:()=>({duration:130000,delay})},pause:()=>pauses++,play:()=>plays++};
 const track={addEventListener:(key,fn)=>handlers[key]=fn,getAnimations:()=>[motion],querySelector:()=>({getBoundingClientRect:()=>({width:1000})})};
 const drag=enableBrandMarqueeDrag({track,events:{addEventListener:(key,fn)=>handlers[key]=fn},now:()=>100,phaseChanged:t=>phase=t});
 const send=(kind,x,y=0)=>handlers[kind]({pointerId:1,clientX:x,clientY:y,button:0,preventDefault(){}});
 return {motion,drag,send,state:()=>({pauses,plays,phase})};
}
test('Dragging brands resumes at the dragged phase and suppresses accidental taps',()=>{
 const h=harness();h.send('pointerdown',0);h.send('pointermove',20);assert.equal(h.motion.currentTime,7400);h.send('pointerup',20);assert.deepEqual(h.state(),{pauses:1,plays:1,phase:7400});assert.equal(h.drag.suppressClick(),true);
});
test('Vertical scrolling and ordinary taps do not change marquee phase',()=>{
 const h=harness();h.send('pointerdown',0);h.send('pointermove',3,30);h.send('pointercancel',3,30);assert.equal(h.motion.currentTime,10000);assert.equal(h.state().pauses,0);assert.equal(h.drag.suppressClick(),false);
});
test('Carousel phone insets center the same three cards on iPhone and Android widths',()=>{
 for(const width of [320,375,393,402,430]){const card=Math.max(92,Math.min(128,width*.28));const inset=centeredCarouselOffset(width,card,8);assert.ok(Math.abs(inset*2+card*3+16-width)<.001);}
});
test('Notice views deduplicate concurrent reports, retain success and permit retry after failure',async()=>{
 const key='12345678-1234-1234-1234-123456789abc';let requests=0;const saved=new Map();
 const seen=createNoticeViews({storage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},call:async()=>{requests++;return {accepted:true};}});
 await Promise.all([seen(key),seen(key)]);await seen(key);assert.equal(requests,1);
 let fails=true;const retry=createNoticeViews({call:async()=>{if(fails)throw Error('offline');return {accepted:true};}});await assert.rejects(retry(key));fails=false;assert.equal(await retry(key),true);
});


import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../web/theme.css', import.meta.url), 'utf8');
test('Al volver a Inicio la franja continúa en su posición temporal, no desde Noel', () => {
  const start = source.indexOf('  function resumeBrandMarquee()');
  const end = source.indexOf('  function showView(', start);
  let now = 16000;
  const values = {};
  const resume = vm.runInNewContext(`(${source.slice(start,end).trim()})`, {
    brandMarqueeStartedAt:1000, brandMarqueeOffsetMs:0, performance:{now:()=>now},
    document:{querySelector:()=>({style:{setProperty:(key,value)=>{values[key]=value;}}})}
  });
  resume(); assert.equal(values['--trusted-brands-delay'], '-15s');
  now = 31000; resume(); assert.equal(values['--trusted-brands-delay'], '-30s');
  assert.match(css, /animation-delay: var\(--trusted-brands-delay, 0s\)/);
  assert.match(source, /viewId === 'homeView' && !\$\('#homeView'\)\.classList\.contains\('active'\)/);
});
test('Todos los logos se preparan sin esperar a que entren en pantalla', () => {
  assert.match(source, /querySelectorAll\('\.trusted-brands-group img'\)\.forEach\(image => \{ image\.loading = 'eager'; \}\)/);
});

test('Dragging after returning Home respects the existing negative animation delay',()=>{
 const h=harness(-15000);h.send('pointerdown',0);h.send('pointermove',20);h.send('pointerup',20);
 assert.equal(h.motion.currentTime,7400);assert.equal(h.state().phase,22400);
});
