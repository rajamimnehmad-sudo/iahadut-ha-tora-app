import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createUsageAnalytics, usageEvent} from '../web/usage-analytics.js';

test('Search and sharing discard free text, URLs, tokens and unrecognized dimensions', () => {
  const sensitive = {query:'personal@email.test', token:'secret', product_url:'https://example.com/private', user_id:'123'};
  assert.deepEqual(usageEvent('catalog_search', {...sensitive, query_length:19, result_count:0, region:'argentina'}),
    {name:'catalog_search',params:{analytics_schema:1,query_length:19,result_count:0,region:'argentina'}});
  assert.deepEqual(usageEvent('product_share', {...sensitive,outcome:'attempt'}).params, {analytics_schema:1,outcome:'attempt'});
  assert.equal(usageEvent('unexpected', sensitive),null);
  assert.deepEqual(usageEvent('product_save', {saved_count:NaN,screen:'arbitrary-text'}).params, {analytics_schema:1});
  const hash='a'.repeat(64);
  assert.equal(usageEvent('catalog_product_search',{product_key:hash}).params.product_key,hash);
  assert.equal(usageEvent('catalog_product_search',{product_key:'email@test'}).params.product_key,undefined);
});

test('Startup buffer flushes once, stays bounded and keeps the initial screen', () => {
  const events=[]; const analytics=createUsageAnalytics({maxPending:3});
  analytics.screen('homeView'); analytics.screen('homeView'); analytics.screen('savedView');
  analytics.track('product_save',{saved_count:1}); analytics.track('product_unsave',{saved_count:0});
  analytics.connect(event=>events.push(event)); analytics.connect(event=>events.push(event));
  assert.equal(events.length,3);
  assert.deepEqual(events.slice(0,2).map(e=>e.params.screen),['homeView','savedView']);
  assert.equal(events[1].params.previous_screen,'homeView');
  analytics.screen('savedView'); assert.equal(events.length,3);
  analytics.screen('homeView'); assert.equal(events.length,4);
});

test('Disabled telemetry and sync/async SDK failures do not affect app actions', async () => {
  const events=[];const disabled=createUsageAnalytics({enabled:false});
  disabled.track('product_save'); disabled.screen('homeView'); disabled.connect(e=>events.push(e));
  assert.equal(events.length,0);
  const analytics=createUsageAnalytics(); analytics.connect(()=>{throw Error('SDK unavailable');});
  assert.doesNotThrow(()=>analytics.track('product_save'));
  analytics.connect(()=>Promise.reject(Error('offline')));
  analytics.track('product_save'); await new Promise(resolve=>setImmediate(resolve));
});

test('Real save/remove handler preserves favorites and reports both actions after storage succeeds', () => {
  const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
  const handler=app.slice(app.indexOf('  function toggleFavorite('),app.indexOf('  function showShareNotice('));
  const favorites=new Set();const events=[];let writes=0;
  const context={favorites,currentProduct:null, save(){writes++;},renderSavedButtonCount(){},
    document:{querySelector(){return {id:'searchView'};}},renderResults(){},$:()=>({value:''}),
    logAnalyticsEvent:createUsageAnalytics().track};
  const analytics=createUsageAnalytics();analytics.connect(e=>events.push(e));context.logAnalyticsEvent=analytics.track;
  vm.runInNewContext(handler+'\ntoggleFavorite("https://vaad.ar/producto/test/");toggleFavorite("https://vaad.ar/producto/test/");',context);
  assert.equal(writes,2);assert.equal(favorites.size,0);
  assert.deepEqual(events.map(e=>[e.name,e.params.saved_count]),[['product_save',1],['product_unsave',0]]);
  context.save=()=>{throw Error('storage full');};
  assert.throws(()=>vm.runInNewContext(handler+'\ntoggleFavorite("test");',context));
  assert.equal(events.length,2);
});
