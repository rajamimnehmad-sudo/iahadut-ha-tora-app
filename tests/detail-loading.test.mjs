import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  function openDetail(url, options = {})');
const code = source.slice(start, source.indexOf('  function returnFromDetail()', start));
function harness(cache = {}) {
  const content = {innerHTML:'Foto anterior'};
  let active = 'homeView';
  const frames = [], timers = [], rendered = [];
  const ctx = {products:[{url:'a',title:'A'},{url:'b',title:'B'}], productCache:cache,
    document:{querySelector:()=>({id:active})}, $:()=>content,
    window:{scrollY:0,requestAnimationFrame:fn=>frames.push(fn),setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{}},
    escapeHtml:v=>v,showView:id=>{assert.match(content.innerHTML,/detail-content-loading/);active=id;},
    renderDetail:(p,o)=>rendered.push([p.url,o]),navigator:{onLine:false},
    fetchProductContent:()=>Promise.resolve({images:[{src:'never-loaded.jpg'}]}),
    countPopularity:()=>{},logAnalyticsEvent:()=>{},showKosherToast:()=>{}};
  vm.createContext(ctx); vm.runInContext(code,ctx);
  return {ctx,content,rendered,paint:()=>{while(frames.length)frames.shift()();while(timers.some(t=>t.ms===0))timers.splice(timers.findIndex(t=>t.ms===0),1)[0].fn();}};
}
test('Ficha abre con skeleton visible antes de resolver incluso una caché inmediata', () => {
  const h=harness({a:{description:'Lista'}});h.ctx.openDetail('a');
  assert.match(h.content.innerHTML,/aria-busy="true"/);
  assert.ok(!h.content.innerHTML.includes('asset-loading'));
  assert.ok(!h.content.innerHTML.includes('Foto anterior'));
  assert.equal(h.rendered.length,0);h.paint();assert.equal(h.rendered[0][0],'a');
});
test('Cambio rápido de producto no procesa la ficha anterior', () => {
  const h=harness({a:{},b:{}});h.ctx.openDetail('a');h.ctx.openDetail('b');h.paint();
  assert.deepEqual(h.rendered.map(item=>item[0]),['b']);
});
test('Descripción no espera a descargar la imagen', async () => {
  const h=harness();h.ctx.openDetail('a');h.paint();await Promise.resolve();
  assert.equal(h.rendered[0][0],'a');
  assert.ok(!code.includes('await preloadImages'));
});
test('Almacenamiento lleno o bloqueado no deja la ficha trabada en el skeleton', () => {
  for (const error of ['QuotaExceededError','SecurityError']) {
    const h=harness({a:{description:'Lista'}});
    h.ctx.popularity={};
    h.ctx.localStorage={setItem(){throw new Error(error);}};
    const a=source.indexOf('  const countPopularity =');
    const b=source.indexOf('  let selectedCategory',a);
    vm.runInContext(source.slice(a,b)+'\nthis.countPopularity = countPopularity;',h.ctx);
    h.ctx.openDetail('a');assert.doesNotThrow(()=>h.paint());
    assert.equal(h.rendered[0][0],'a');assert.equal(h.ctx.popularity.a.opens,1);
  }
});
test('Un fallo al persistir la ficha oficial no invalida el resultado descargado', () => {
  const a=source.indexOf('    productCache[product.url] = result;');
  const b=source.indexOf('\n  async function fetchAlerts',a);
  const persist=vm.runInNewContext(`(function(){${source.slice(a,b).replace(/\n  }\s*$/, '')}})`,{
    productCache:{},product:{url:'a'},result:{description:'Ficha válida'},INFO_CACHE_VERSION:1,
    localStorage:{setItem(){throw new Error('QuotaExceededError');}}
  });
  assert.equal(persist().description,'Ficha válida');
});
