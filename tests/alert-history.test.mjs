import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mergeAlertHistory} from '../web/alert-history.js';
const baseline = JSON.parse(readFileSync(new URL('../web/data/content.json', import.meta.url))).alerts;
const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

test('A truncated 40-item cache recovers all baseline additions and August dates', () => {
  const result = mergeAlertHistory({alta:baseline.alta.slice(0,40)}, baseline);
  assert.equal(result.alta.length, baseline.alta.length);
  assert.equal(result.baja.length, baseline.baja.length);
  assert.ok(result.alta.some(item => item.text.includes('27/08/2026')));
});
test('New batches preserve unlimited history, deduplicate URLs and retain removals separately', () => {
  const previous = {alta:Array.from({length:150}, (_,i)=>({url:`https://example.com/${i}`,text:`Producto ${i}`})),baja:[{url:'https://example.com/0',text:'Baja'}]};
  const result = mergeAlertHistory({alta:[{url:'https://example.com/0',text:'Ficha actualizada'}, {url:'https://example.com/new',text:'Nuevo'}]}, previous, previous);
  assert.equal(result.alta.length,151);
  assert.equal(result.alta[0].text,'Ficha actualizada');
  assert.equal(result.baja.length,1);
});
test('Boot repairs a fresh cache immediately without network access', () => {
  const start = app.indexOf('  let alertCache =');
  const end = app.indexOf('  let timelineKind',start);
  const context = {storedAlertCache:{version:1,items:{alta:baseline.alta.slice(0,40)},fetchedAt:123},INFO_CACHE_VERSION:1,activeContentSnapshot:{alerts:{alta:baseline.alta.slice(0,40)}},contentSnapshot:{alerts:baseline},mergeAlertHistory};
  vm.runInNewContext(`${app.slice(start,end)};result=alertCache;`,context);
  assert.equal(context.result.items.alta.length,baseline.alta.length);
  assert.equal(context.result.fetchedAt,123);
});
test('The snapshot generator also preserves previous batches absent from the live page', async () => {
  const generator = readFileSync(new URL('../scripts/generate-content-snapshot.mjs', import.meta.url),'utf8');
  const start = generator.indexOf('async function mergeAlertHistory(');
  const end = generator.indexOf('\nconst info =',start);
  const context = {
    readFile:async path=>JSON.stringify(path==='snapshot'?{alerts:baseline}:{}),
    outputPath:'snapshot',alertStatePath:'state',console,
    clean:value=>String(value||'').replace(/\s+/g,' ').trim(),
    normalize:value=>String(value||'').toLowerCase()
  };
  vm.createContext(context);
  vm.runInContext(generator.slice(start,end),context);
  const result = await context.mergeAlertHistory({alta:baseline.alta.slice(0,30),baja:[]});
  assert.equal(result.alta.length,baseline.alta.length);
  assert.equal(result.baja.length,baseline.baja.length);
});
test('The actual timeline renders August dates as well as the latest batches', () => {
  const start = app.indexOf('  function realAlertItems(');
  const end = app.indexOf('  function alertMarkup(',start);
  const context = {
    normalize:value=>String(value||'').toLowerCase(),clean:value=>String(value||'').trim(),
    escapeHtml:value=>String(value||''),styledBrandText:value=>value,
    findProductForAlert:()=>null
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start,end),context);
  const html = context.alertTimelineMarkup(mergeAlertHistory({alta:baseline.alta.slice(0,40)},baseline),'','alta');
  assert.ok(html.includes('datetime="2026-08-27"'));
  assert.ok(html.includes('datetime="2026-10-01"'));
  assert.ok(html.indexOf('datetime="2026-10-01"') < html.indexOf('datetime="2026-08-27"'));
});
