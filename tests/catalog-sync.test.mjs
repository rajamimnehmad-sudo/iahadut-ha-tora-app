import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('  function localProductFromFirestore('),source.indexOf('  function catalogCategoryKey('));
const version='2026-10-02T19:04:48.624Z';
function harness({localVersion=version,local=['one','retired','two'],active=['one','two'],archive=[],metadata={version,activeProductCount:2},confirmed=metadata}={}) {
 const storage=new Map([['iht_catalog_version',localVersion]]);let reads=0;const calls=[];
 const docs=items=>({docs:items.map(url=>({data:()=>({sourceUrl:url,title:url,retiredAt:version,catalogGeneratedAt:version})}))});
 const api={doc:()=>({}),getDoc:async()=>{const value=++reads===1?metadata:confirmed;return {exists:()=>true,data:()=>value};},collection:(_db,name)=>name,where:()=>({}),query:collection=>collection,getDocs:async collection=>{calls.push(collection);return docs(collection==='catalog_products'?active:archive);}};
 const context=vm.createContext({
  clean:value=>String(value||'').trim(),canonicalBarcode:()=>'',getFirebaseCatalogApi:async()=>({db:{},api}),
  products:local.map(url=>({url,title:url})),productCache:Object.fromEntries(local.map(url=>[url,{text:'cached'}])),seed:[],
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},syncState:{},syncMessage(){},recentProducts:[],INFO_CACHE_VERSION:1,save(){},renderHome(){},renderSearchCategories(){},document:{querySelector:()=>null}
 });vm.runInContext(functions,context);
 return {context,storage,calls,run:()=>vm.runInContext('syncCatalogFromFirestore(1)',context)};
}
test('same-version excess count reconciles authorized removals and deletes stale fiche',async()=>{
 const h=harness();await h.run();assert.deepEqual(Array.from(h.context.products,p=>p.url),['one','two']);assert.equal(h.context.productCache.retired,undefined);assert.deepEqual(h.calls,['catalog_products']);
});
test('older central snapshot cannot replace a newer locally authorized catalog',async()=>{
 const h=harness({localVersion:'2026-10-03T00:00:00Z',local:['one']});await h.run();assert.equal(h.context.products.length,1);assert.deepEqual(h.calls,[]);
});
test('in-progress central publication preserves the current copy',async()=>{
 const h=harness({metadata:{version,activeProductCount:2,syncInProgress:true}});await assert.rejects(h.run(),/actualizando/);assert.equal(h.context.products.length,3);assert.deepEqual(h.calls,[]);
});
test('changed metadata during download never commits a partial snapshot',async()=>{
 const h=harness({confirmed:{version:'2026-10-03T00:00:00Z',activeProductCount:2}});await assert.rejects(h.run(),/durante la descarga/);assert.equal(h.context.products.length,3);
});
test('incomplete Firestore response preserves products and cursor',async()=>{
 const h=harness({active:['one']});await assert.rejects(h.run(),/incompleto/);assert.equal(h.context.products.length,3);assert.equal(h.storage.get('iht_catalog_version'),version);
});
test('incremental publication applies additions and archive removals together',async()=>{
 const h=harness({localVersion:'2026-10-01T00:00:00Z',local:['one','retired'],active:['new'],archive:['retired']});await h.run();assert.deepEqual(Array.from(h.context.products,p=>p.url),['one','new']);assert.equal(h.context.productCache.retired,undefined);
});
