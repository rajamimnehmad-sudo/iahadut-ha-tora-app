import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source = readFileSync(new URL('../web/offline-download.js', import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export function/g,'function');
function fixture() {
  const files = new Map();
  const downloads = [];
  let fail = '';
  const context = {crypto:webcrypto, TextEncoder, URL, setTimeout, clearTimeout, Image:class {set src(value) {queueMicrotask(() => this.onload());}},
    Capacitor:{isNativePlatform:()=>true,convertFileSrc:uri=>`local:${uri}`}, Directory:{Data:'DATA'}, Encoding:{UTF8:'utf8'},
    Filesystem:{
      writeFile:async ({path,data})=>files.set(path,data),
      readFile:async ({path})=> {if (!files.has(path)) throw Error('missing'); return {data:files.get(path)};},
      readdir:async()=>({files:[...files.entries()].map(([path,data])=>({name:path.split('/').pop(),size:data.length}))}),
      downloadFile:async ({url,path,directory})=> {downloads.push({url,directory}); if(url===fail)throw Error('network');files.set(path,'image');},
      stat:async({path})=>({size:files.get(path)?.length||0}),getUri:async({path})=>({uri:path})
    }};
  vm.createContext(context); vm.runInContext(source,context);
  return {context,files,downloads,setFail:url=>{fail=url;}};
}
test('Offline assets are unique images, not external page links',()=>{
  const {context}=fixture();
  assert.deepEqual(Array.from(context.collectOfflineImages({image:'https://vaad.ar/a.jpg',url:'https://vaad.ar/producto/'},['https://vaad.ar/a.jpg','https://vaad.ar/b.png'])),['https://vaad.ar/a.jpg','https://vaad.ar/b.png']);
});
test('Ready requires durable files, completed manifest, and matching catalog',async()=>{
  const {context,files,downloads}=fixture();
  const service=context.createOfflineDownload();await service.init();
  const urls=['https://vaad.ar/a.jpg','https://vaad.ar/b.png'];
  assert.equal(service.check(urls,'v1').ready,false);
  await service.download(urls,'v1',{products:[{name:'a'}]});
  assert.equal(service.check(urls,'v1').ready,true);
  assert.equal(service.check([...urls,'https://vaad.ar/c.png'],'v1').ready,false);
  assert.equal(downloads.every(item=>item.directory==='DATA'),true);
  const reopened=context.createOfflineDownload();await reopened.init();
  assert.equal(reopened.check(urls,'v1').ready,true);
  assert.ok(reopened.localUrl(urls[0]).startsWith('local:'));
  assert.equal((await reopened.readSnapshot()).products[0].name,'a');
  const imageFile=[...files.keys()].find(path=>!path.endsWith('.json'));files.delete(imageFile);
  const missing=context.createOfflineDownload();await missing.init();
  assert.equal(missing.check(urls,'v1').ready,false);
});
test('Interrupted download never marks ready and retry reuses completed files',async()=>{
  const f=fixture();f.setFail('https://vaad.ar/b.png');
  const states=[];const service=f.context.createOfflineDownload(state=>states.push({...state}));await service.init();
  const urls=['https://vaad.ar/a.jpg','https://vaad.ar/b.png'];await service.download(urls,'v1',{});
  assert.equal(service.check(urls,'v1').ready,false);assert.ok(states.at(-1).error);assert.equal(states.at(-1).busy,false);
  f.setFail('');await service.download(urls,'v1',{});
  assert.equal(service.check(urls,'v1').ready,true);
  assert.equal(f.downloads.filter(item=>item.url===urls[0]).length,1);
});
test('Pause leaves files intact and resume finishes without redownloading',async()=>{
  const f=fixture();let service;let didPause=false;
  service=f.context.createOfflineDownload(state=>{
    if (state.busy && state.percent>0 && !didPause) {didPause=true;service.pause();}
  });
  await service.init();const urls=Array.from({length:9},(_,i)=>`https://vaad.ar/${i}.png`);
  await service.download(urls,'v1',{});
  assert.equal(service.check(urls,'v1').paused,true);
  assert.equal(service.check(urls,'v1').ready,false);
  assert.ok(f.downloads.length<urls.length);
  await service.download(urls,'v1',{});
  assert.equal(service.check(urls,'v1').ready,true);
  assert.equal(f.downloads.length,urls.length);
});
test('Wi-Fi-only policy stops downloads before requesting files on cellular',async()=>{
  const f=fixture();const service=f.context.createOfflineDownload();await service.init();
  await service.download(['https://vaad.ar/a.png'],'v1',{},async()=>false);
  assert.equal(f.downloads.length,0);assert.equal(service.check(['https://vaad.ar/a.png'],'v1').paused,true);
  const allows=f.context.offlineNetworkMayDownload;
  assert.equal(allows({type:'cellular'}),false);
  assert.equal(allows({type:'cellular'},true),true);
  assert.equal(allows({type:'none'},true),false);
  assert.equal(allows({type:'unknown'}),false);
  assert.equal(allows({type:'wifi',metered:true}),false);
  assert.equal(allows({type:'wifi',metered:false}),true);
});
test('Native background transfer is delegated, survives a new UI instance, and supports pause',async()=>{
  const f=fixture(); const urls=['https://vaad.ar/a.png'];
  let status={busy:false,percent:0}; let request;
  const bridge={start:async options=>{request=options;status={busy:true,waiting:true,percent:0};},status:async()=>status,pause:async()=>{status={busy:false,paused:true,percent:42};}};
  const service=f.context.createOfflineDownload(()=>{},bridge);
  await service.init();await service.download(urls,'v1',{products:[]},undefined,true);
  assert.equal(request.wifiOnly,true);assert.equal(request.signature,JSON.stringify(['v1',urls]));
  assert.equal(f.downloads.length,0);assert.equal(service.check(urls,'v1').waiting,true);
  const reopened=f.context.createOfflineDownload(()=>{},bridge);await reopened.init();await reopened.refresh();
  assert.equal(reopened.check(urls,'v1').busy,true);
  await reopened.pause();assert.equal(reopened.check(urls,'v1').paused,true);
  status={busy:false,percent:100,manifest:{signature:request.signature,images:{[urls[0]]:{path:'offline-catalog/a.png',uri:'file:///data/a.png'}}}};
  await reopened.refresh();assert.equal(reopened.check(urls,'v1').ready,true);
  assert.equal(reopened.localUrl(urls[0]),'local:file:///data/a.png');
});
test('The shipping app uses foreground downloads and excludes foreground-service permissions',()=>{
  const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
  const activity=readFileSync(new URL('../android/app/src/main/java/ar/vaad/catalogo/app/MainActivity.java',import.meta.url),'utf8');
  const manifest=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
  assert.doesNotMatch(app,/registerPlugin\('OfflineDownload'\)/);
  assert.doesNotMatch(activity,/registerPlugin\(OfflineDownloadPlugin/);
  assert.match(app,/if \(document.visibilityState !== 'visible'\) return false/);
  assert.match(app,/const offlineTitle = offlineState.ready \? '✓ Listo para usar offline' : 'Usar sin conexión';/);
  assert.match(app,/'Descarga aproximada: 399 MB'/);
  assert.match(manifest,/android.permission.FOREGROUND_SERVICE" tools:node="remove"/);
  assert.match(manifest,/android.permission.FOREGROUND_SERVICE_DATA_SYNC" tools:node="remove"/);
});
test('Pending offline downloads and network consent survive closing and reopening',async()=>{
  const f=fixture();const service=f.context.createOfflineDownload();await service.init();
  assert.equal(service.getResumePreference().enabled,false);
  await service.setResumePreference({enabled:true,allowMobile:false});
  const reopened=f.context.createOfflineDownload();await reopened.init();
  assert.equal(reopened.getResumePreference().enabled,true);
  assert.equal(reopened.getResumePreference().allowMobile,false);
  await reopened.setResumePreference({enabled:true,allowMobile:true});
  const mobile=f.context.createOfflineDownload();await mobile.init();
  assert.equal(mobile.getResumePreference().allowMobile,true);
  // Explicit pause persists, unlike interruption caused by hiding the app.
  await mobile.setResumePreference({enabled:false,allowMobile:true});
  const paused=f.context.createOfflineDownload();await paused.init();
  assert.equal(paused.getResumePreference().enabled,false);
});
test('Interrupted downloads reopen with pending intent and reuse completed images',async()=>{
  const f=fixture(); const service=f.context.createOfflineDownload();await service.init();
  await service.setResumePreference({enabled:true,allowMobile:false});
  f.setFail('https://vaad.ar/b.png');
  const urls=['https://vaad.ar/a.png','https://vaad.ar/b.png'];
  await service.download(urls,'v1',{});
  const reopened=f.context.createOfflineDownload();await reopened.init();
  assert.equal(reopened.getResumePreference().enabled,true);
  f.setFail('');await reopened.download(urls,'v1',{});
  assert.equal(f.downloads.filter(item=>item.url===urls[0]).length,1);
  await reopened.setResumePreference({enabled:false,allowMobile:false});
  const ready=f.context.createOfflineDownload();await ready.init();
  assert.equal(ready.getResumePreference().enabled,false);
  assert.equal(ready.check(urls,'v1').ready,true);
});
test('App auto-resume respects visibility, explicit pause, Wi-Fi-only and mobile consent',async()=>{
  const f=fixture();let transfers=0;
  let preference={enabled:true,allowMobile:false};
  let connection={type:'cellular',metered:true};
  Object.assign(f.context,{
    logAnalyticsEvent(){},
    offlineStarting:false,offlineNextRetryAt:0,offlineWifiWait:false,offlineMobileAllowed:false,
    document:{visibilityState:'visible',addEventListener:()=>{}},
    window:{setInterval:()=>{},addEventListener:()=>{},alert:()=>{}},
    offlineAssets:()=>['https://vaad.ar/a.png'],offlineVersion:()=> 'v1',
    products:[],productCache:{},infoCache:{},cardCache:{},
    offlineConnection:async()=>connection,setOfflineWifiWait:value=>{f.context.offlineWifiWait=value;},
    offlineDownload:{check:()=>({busy:false,ready:false}),getResumePreference:()=>preference,
      setResumePreference:async next=>{preference=next;},download:async()=>{transfers++;}}
  });
  const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
  vm.runInContext(app.slice(app.indexOf('  async function startOfflineDownload('),app.indexOf('  function useOfflineImages()')),f.context);
  await f.context.startOfflineDownload(true);assert.equal(transfers,0);
  connection={type:'wifi',metered:false};
  await f.context.startOfflineDownload(true);assert.equal(transfers,1);
  f.context.document.visibilityState='hidden';
  await f.context.startOfflineDownload(true);assert.equal(transfers,1);
  f.context.document.visibilityState='visible';preference={enabled:false,allowMobile:false};
  await f.context.startOfflineDownload(true);assert.equal(transfers,1);
  connection={type:'cellular',metered:true};preference={enabled:true,allowMobile:true};
  await f.context.startOfflineDownload(true);assert.equal(transfers,2);
  assert.match(app,/window.setTimeout\(resumeOfflineWhenOpen, 0\)/);
});
