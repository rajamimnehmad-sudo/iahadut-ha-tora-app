import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizedSnapshot, snapshotHash, readPublishedSnapshot, applySnapshotDelta} from '../web/published-catalog.js';
const snapshot = normalizedSnapshot({catalog:JSON.parse(readFileSync(new URL('../web/data/catalog.json', import.meta.url))),content:JSON.parse(readFileSync(new URL('../web/data/content.json', import.meta.url))),productDetails:JSON.parse(readFileSync(new URL('../web/data/product-details.json', import.meta.url)))});
snapshot.catalog.products.sort((a,b)=>a.url.localeCompare(b.url,'en'));
const hash = await snapshotHash(snapshot);
const version='2026-10-02T19:04:48.624Z';
const manifest={hash,snapshot:`snapshot-${hash}.json`,version,deltas:[]};
test('unchanged catalog downloads only the small manifest and never reads Firestore',async()=>{
 const calls=[];const result=await readPublishedSnapshot(async file=>{calls.push(file);return manifest;},snapshot,hash);
 assert.equal(result.changed,false);assert.deepEqual(calls,['manifest.json']);
});
test('first download checks every product fiche and content fingerprint',async()=>{
 const calls=[];const result=await readPublishedSnapshot(async file=>{calls.push(file);return file==='manifest.json'?manifest:snapshot;});
 assert.equal(result.snapshot.catalog.products.length,snapshot.catalog.products.length);assert.equal(result.hash,hash);assert.equal(calls.length,2);
 await assert.rejects(readPublishedSnapshot(async file=>file==='manifest.json'?manifest:{...snapshot,content:{info:{},cards:{}}}),/versión/);
});
test('incremental download applies additions, retirements and full fiches together',async()=>{
 const retired=snapshot.catalog.products[0].url;
 const added={...snapshot.catalog.products[0],url:'https://vaad.ar/producto/new-test/',title:'Nuevo'};
 const delta={from:hash,catalog:Object.fromEntries(Object.entries(snapshot.catalog).filter(([key])=>key!=='products')),products:{upserts:[added],removed:[retired]},details:{upserts:{[added.url]:snapshot.productDetails.products[retired]},removed:[retired]},content:null};
 const next=applySnapshotDelta(snapshot,delta);delta.to=await snapshotHash(next);
 const file=`delta-${delta.to}.json`;const nextManifest={hash:delta.to,snapshot:`snapshot-${delta.to}.json`,version,deltas:[{from:hash,to:delta.to,file}]};
 const calls=[];const result=await readPublishedSnapshot(async path=>{calls.push(path);return path==='manifest.json'?nextManifest:delta;},snapshot,hash);
 assert.deepEqual(calls,['manifest.json',file]);assert.equal(result.snapshot.catalog.products.some(product=>product.url===retired),false);assert.ok(result.snapshot.productDetails.products[added.url]);assert.equal(snapshot.catalog.products.length,snapshot.catalog.products.length);assert.ok(snapshot.productDetails.products[retired]);
});
test('corrupt local copy is repaired instead of trusting its saved version',async()=>{
 const broken=structuredClone(snapshot);broken.catalog.products.pop();const calls=[];
 const result=await readPublishedSnapshot(async file=>{calls.push(file);return file==='manifest.json'?manifest:snapshot;},broken,hash);
 assert.equal(result.snapshot.catalog.products.length,snapshot.catalog.products.length);assert.equal(calls.length,2);
});
test('failure during a delta retains the previous complete copy',async()=>{
 const next='1'.repeat(64);const m={hash:next,snapshot:`snapshot-${next}.json`,version,deltas:[{from:hash,to:next,file:`delta-${next}.json`}]};
 await assert.rejects(readPublishedSnapshot(async file=>{if(file==='manifest.json')return m;throw new Error('Offline');},snapshot,hash),/Offline/);
 assert.equal(await snapshotHash(snapshot),hash);
});
test('the shipped refresh and popularity paths do not request Firestore documents',()=>{
 const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
 const sync=app.slice(app.indexOf('  async function syncCatalog('),app.indexOf('  function categoryMarkup('));
 assert.ok(sync.includes('syncCatalogFromPublishedFiles(onProgress)'));assert.equal(sync.includes('syncCatalogFromFirestore('),false);
 assert.equal(app.includes('loadGlobalPopularity();'),false);
 const popularity=app.slice(app.indexOf('  const countPopularity'),app.indexOf('  let selectedCategory'));
 assert.equal(popularity.includes('runTransaction'),false);
});
