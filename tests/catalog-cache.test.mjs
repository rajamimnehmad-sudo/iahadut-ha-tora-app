import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {catalogSnapshotNeedsRepair} from '../web/catalog-cache.js';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const boot=source.slice(source.indexOf('  const storedCatalogTimestampAtBoot'), source.indexOf('  // Older cached catalogs'));
function select(version, stored, bundle, timestamp='1790970000000') {
 const context=vm.createContext({localStorage:{getItem:key=>key==='iht_catalog_version'?version:timestamp},storedProducts:stored,bundledProducts:bundle,activeCatalogSnapshot:{generatedAt:'2026-10-02T19:04:48.624Z'},seed:[]});
 vm.runInContext(boot+';result=productSource',context); return context.result;
}
test('legacy cache with same cursor and missing products is repaired from bundle',()=>{
 const bundle=[{url:'one'},{url:'featured'}];assert.equal(select('2026-10-02T19:04:48.624Z',[{url:'one'}],bundle),bundle);
});
test('newer authoritative cache with legitimate removals is kept',()=>{
 const stored=[{url:'one'}];assert.equal(select('2026-10-03T19:04:48.624Z',stored,[{url:'one'},{url:'retired'}]),stored);
});
test('recent download time never makes an older catalog version newer',()=>{
 const bundle=[{url:'one'},{url:'featured'}];assert.equal(select('2026-09-23T00:00:00Z',[{url:'one'}],bundle),bundle);
});
test('manual update repairs an incomplete equal-version snapshot and protects newer removals',()=>{
 const snapshot={generatedAt:'2026-10-02T19:04:48.624Z',products:[{url:'one'},{url:'featured'}]};
 assert.equal(catalogSnapshotNeedsRepair([{url:'one'}],snapshot.generatedAt,snapshot),true);
 assert.equal(catalogSnapshotNeedsRepair([{url:'one'}],'2026-10-03T00:00:00Z',snapshot),false);
 assert.equal(catalogSnapshotNeedsRepair([{url:'one'},{url:'other'}],snapshot.generatedAt,snapshot),true);
 assert.equal(catalogSnapshotNeedsRepair(snapshot.products,snapshot.generatedAt,snapshot),false);
});
test('actual manual sync repairs a corrupt cache even when the public copy cannot be reached',async()=>{
 const snapshot={generatedAt:'2026-10-02T19:04:48.624Z',products:[{url:'one'},{url:'featured'}]};
 const storage=new Map([['iht_catalog_version',snapshot.generatedAt]]);
 const context=vm.createContext({
  products:[{url:'one'}],catalogSnapshotNeedsRepair,activeCatalogSnapshot:snapshot,bundledProducts:snapshot.products,bundledProductDetails:{},activeCatalogTimestamp:Date.parse(snapshot.generatedAt),
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
  syncState:{running:false,last:'0'},syncMessage(){},categories:[{count:2}],productCache:{},seed:[],canonicalBarcode:value=>value||'',
  recentProducts:[],save(){},renderHome(){},renderSearchCategories(){},document:{querySelector:()=>null},
  syncCatalogFromPublishedFiles:async()=>{throw new Error('Offline');}
 });
 const sync=source.slice(source.indexOf('  async function syncCatalog('),source.indexOf('  function categoryMarkup('));
 vm.runInContext(sync,context);await vm.runInContext('syncCatalog(true)',context);
 assert.equal(context.products.length,2);assert.equal(context.products[1].url,'featured');
 assert.equal(context.syncState.running,false);assert.equal(storage.get('iht_catalog_version'),snapshot.generatedAt);
});
test('all featured references and formatted offline fiches belong to the active snapshot',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../web/data/catalog.json',import.meta.url)));
 const featured=JSON.parse(readFileSync(new URL('../web/data/featured-products.json',import.meta.url)));
 const details=JSON.parse(readFileSync(new URL('../web/data/product-details.json',import.meta.url)));
 const urls=new Set(catalog.products.map(p=>p.url));
 for(const item of featured.products) assert.equal(urls.has(item.url),true,item.url);
 for(const item of catalog.products) assert.equal(details.products[item.url]?.textFormatVersion,1,item.url);
});
