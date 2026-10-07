import {verifySession} from './auth.js';
import {record,rebuild,hashUid,dayAt,validProduct} from './ranking.js';
const source = 'https://raw.githubusercontent.com/rajamimnehmad-sudo/iahadut-ha-tora-app/main/web/data/published/';
export function allowedOrigin(origin) {
  return !origin || ['http://localhost','https://localhost','capacitor://localhost'].includes(origin)
    || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
    || origin === 'https://rajamimnehmad-sudo.github.io';
}
export async function syncCatalog(db, now = Date.now(), fetcher = fetch) {
  const meta = await db.prepare("SELECT value FROM state WHERE key='catalog-check'").first();
  if (now-Number(meta?.value||0)<3*3600000) return;
  const manifestResponse = await fetcher(`${source}manifest.json`,{signal:AbortSignal.timeout(10000)});
  if (!manifestResponse.ok) throw Error('Catalog unavailable');
  const manifest = await manifestResponse.json();
  if (!/^[a-f0-9]{64}$/.test(manifest.hash) || manifest.snapshot!==`snapshot-${manifest.hash}.json`) throw Error('Invalid manifest');
  const current = await db.prepare("SELECT value FROM state WHERE key='catalog-hash'").first();
  if (current?.value!==manifest.hash) {
    const response = await fetcher(`${source}${manifest.snapshot}`,{signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw Error('Snapshot unavailable');
    const snapshot = await response.json();
    // Canonical snapshot digest uses the publisher's sorted JSON contract.
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object'
      ? Object.fromEntries(Object.keys(value).sort().filter(key=>!['generatedAt','fetchedAt','bundled'].includes(key)).map(key=>[key,canonical(value[key])])) : value;
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(snapshot))));
    const hash = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const products = snapshot.catalog?.products;
    if (hash!==manifest.hash || !Array.isArray(products) || !products.length || products.length>5000
      || !products.every(p=>validProduct(p.url)) || new Set(products.map(p=>p.url)).size!==products.length) throw Error('Invalid catalog');
    // Single transaction: no intermediate catalogue can accept retired products.
    // One JSON parameter avoids D1's bound-variable and batch-size limits.
    await db.batch([
      db.prepare('UPDATE catalog SET active=0 WHERE active=1'),
      db.prepare(`INSERT INTO catalog(url,active) SELECT value,1 FROM json_each(?) WHERE true
        ON CONFLICT(url) DO UPDATE SET active=1`).bind(JSON.stringify(products.map(p=>p.url))),
      db.prepare("INSERT INTO state VALUES('catalog-hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(hash)
    ]);
  }
  await db.prepare("INSERT INTO state VALUES('catalog-check',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now)).run();
}
export function createHandler(verify = verifySession) {
  return async (request,env) => {
    const origin = request.headers.get('Origin')||'';
    const headers = {'Access-Control-Allow-Origin':origin||'*','Vary':'Origin',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const json = (data,status=200) => Response.json(data,{status,headers});
    if (!allowedOrigin(origin)) return Response.json({error:'Origin not allowed'},{status:403});
    const path = new URL(request.url).pathname;
    if (!['/ranking','/record'].includes(path)) return json({error:'Not found'},404);
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers});
    try {
      if (path==='/ranking' && request.method==='GET') {
        const row = await env.DB.prepare("SELECT value FROM state WHERE key='ranking'").first();
        return row ? json(JSON.parse(row.value)) : json({error:'Ranking warming up'},503);
      }
      if (path!=='/record' || request.method!=='POST') return json({error:'Method not allowed'},405);
      const authorization = request.headers.get('Authorization')||'';
      if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization)) return json({error:'Unauthorized'},401);
      let uid;
      try {uid = await verify(authorization.slice(7),env.FIREBASE_PROJECT);} catch (_) {return json({error:'Unauthorized'},401);}
      const key = await hashUid(uid,dayAt(Date.now()));
      if (!(await env.SEARCH_LIMIT.limit({key})).success) return json({error:'Too many requests'},429);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'JSON required'},415);
      // Enforce a byte limit even with missing/incorrect Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return json({error:'Invalid body'},400);
      let size=0; const chunks=[];
      while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength;
        if(size>2048){await reader.cancel();return json({error:'Body too large'},413);} chunks.push(value); }
      const bytes = new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let data; try {data=JSON.parse(new TextDecoder().decode(bytes));}catch(_){return json({error:'Invalid JSON'},400);}
      return json(await record(env.DB,uid,data?.productUrl));
    } catch (_) { return json({error:'Temporarily unavailable'},503); }
  };
}
export default {
  fetch:createHandler(),
  async scheduled(event,env,ctx) {
    ctx.waitUntil((async()=>{
      // If the official source is unavailable, keep the previous allowlist and ranking.
      try {await syncCatalog(env.DB,event.scheduledTime);} catch (_) {}
      await rebuild(env.DB,event.scheduledTime);
    })());
  }
};
