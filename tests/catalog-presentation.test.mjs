import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePresentation,createPresentationSync,iconBackground} from '../web/catalog-presentation.js';
const bundled = JSON.parse(readFileSync(new URL('../web/data/catalog-presentation.json',import.meta.url)));
const clone = value => JSON.parse(JSON.stringify(value));
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function fixture() {
  const bytes = new Uint8Array([1,2,3]).buffer, key = await hash(bytes);
  const next = clone(bundled); next.revision = '2099-01-01T00:00:00Z'; next.assets[key] = {sha256:key,url:'https://example.com/new.png',bytes:3}; next.categories['Categoría nueva'] = {label:'Nueva',icon:{asset:key,columns:1,rows:1,column:0,row:0}};
  let state=null, fetches=0, changes=0, writes=0;
  const cache = new Map();
  const options = {bundled,bundledUrls:Object.fromEntries(Object.keys(bundled.assets).map(key=>[key,'/category-icons/'+key+'.png'])),readState:()=>state,writeState:value=>{state=clone(value);writes++;},readAsset:key=>cache.get(key),writeAsset:(key,value)=>cache.set(key,value),fetchManifest:async()=>{fetches++;return next;},fetchAsset:async()=>bytes,imageUrl:key=>'blob:'+key,onChange:()=>{changes++;}};
  return {options,next,key,cache,stats:()=>({fetches,changes,writes,state})};
}
test('all approved categories and product photos have immutable bundled files',async()=>{
  assert.equal(Object.keys(validatePresentation(bundled).categories).length,113);
  for(const [key,asset] of Object.entries(bundled.assets)) {
    const bytes=readFileSync(new URL('../web/public/category-icons/'+key+'.png',import.meta.url));
    assert.equal(bytes.length,asset.bytes);assert.equal(await hash(bytes),key);
  }
  assert.deepEqual(iconBackground({columns:6,rows:8,column:5,row:7}),{size:'600% 800%',position:'100% 100%'});
});
test('malicious URLs, invalid sprite positions and unsupported code/text fields are rejected',()=>{
  for(const mutate of [v=>{Object.values(v.assets)[0].url='javascript:alert(1).png';},v=>{Object.values(v.categories)[0].icon.column=99;},v=>{v.texts.homeTitle='<script>';},v=>{v.featuredProducts=['https://evil.example/producto/a'];}]){const v=clone(bundled);mutate(v);assert.throws(()=>validatePresentation(v));}
});
test('new icon and category activate together after image storage; restart works offline',async()=>{
  const f=await fixture(),sync=createPresentationSync(f.options);await sync.init();assert.equal(await sync.refresh(),true);assert.ok(sync.icon('Categoría nueva'));assert.equal(f.stats().writes,1);
  const restart=createPresentationSync({...f.options,fetchAsset:async()=>{throw Error('offline');}});await restart.init();assert.equal(restart.current().revision,f.next.revision);assert.ok(restart.icon('Categoría nueva'));
});
test('broken image keeps previous presentation and never publishes partial metadata',async()=>{
  const f=await fixture();const sync=createPresentationSync({...f.options,fetchAsset:async()=>new Uint8Array([9,9,9]).buffer});await assert.rejects(sync.refresh(),/alterada/);assert.equal(sync.current().revision,bundled.revision);assert.equal(f.stats().writes,0);
});
test('storage failure preserves previous active presentation',async()=>{
  const f=await fixture(),sync=createPresentationSync({...f.options,writeAsset:async()=>{throw Error('full');}});await assert.rejects(sync.refresh(),/full/);assert.equal(sync.current().revision,bundled.revision);assert.equal(f.stats().writes,0);
});
test('concurrent requests share one refresh and unchanged data is throttled',async()=>{
  const f=await fixture(),sync=createPresentationSync(f.options);await Promise.all([sync.refresh(),sync.refresh()]);await sync.refresh();assert.equal(f.stats().fetches,1);
});
test('older remote configuration cannot roll back the current offline version',async()=>{
  const f=await fixture(),sync=createPresentationSync(f.options);await sync.refresh();f.next.revision='2000-01-01T00:00:00Z';assert.equal(await sync.refresh(true),false);assert.equal(sync.current().revision,'2099-01-01T00:00:00Z');assert.equal(f.stats().writes,1);
});

test('product-only image updates are cached before activation and survive an offline restart',async()=>{
  const f=await fixture();delete f.next.categories['Categoría nueva'];
  const url='https://vaad.ar/producto/foto-revisada/';f.next.productImages[url]=f.key;
  const sync=createPresentationSync(f.options);await sync.refresh();assert.equal(sync.photo(url),'blob:'+f.key);
  const restart=createPresentationSync({...f.options,fetchAsset:async()=>{throw Error('offline');}});
  await restart.init();assert.equal(restart.photo(url),'blob:'+f.key);
});
test('an invalid product photo identity or unknown asset cannot replace current images',()=>{
  for(const images of [{'https://evil.example/producto/a':Object.keys(bundled.assets)[0]},{'https://vaad.ar/producto/a/':'unknown'}]){
    const next=clone(bundled);next.productImages=images;assert.throws(()=>validatePresentation(next),/Foto de producto/);
  }
});
