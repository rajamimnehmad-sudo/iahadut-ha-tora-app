import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK} from 'jose';
import {record,rebuild,RECORD_SQL,cutoffAt,hashUid} from '../src/ranking.js';
import {verifySession} from '../src/auth.js';
import {createHandler,allowedOrigin,syncCatalog} from '../src/index.js';
const now=Date.parse('2026-10-06T12:00:00Z'), day='2026-10-06';
const a='https://vaad.ar/producto/aceite/',b='https://vaad.ar/producto/mermelada/';
function database() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_ranking.sql',import.meta.url),'utf8'));
  sqlite.prepare('INSERT INTO catalog VALUES(?,1),(?,1)').run(a,b);
  const db={sqlite,prepare(sql){let params=[];return {bind(...values){params=values;return this;},
    async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return {results:sqlite.prepare(sql).all(...params)};},
    async run(){return sqlite.prepare(sql).run(...params);}};},async batch(statements){sqlite.exec('BEGIN');try {const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  return db;
}
test('Atomic receipts dedupe by UID/product/day, and counters agree',async()=>{
  const db=database();
  assert.equal((await record(db,'user-a',a,now)).accepted,true);
  assert.equal((await record(db,'user-a',a,now)).reason,'duplicate');
  assert.equal((await record(db,'user-b',a,now)).accepted,true);
  assert.equal((await record(db,'user-a',b,now)).accepted,true);
  assert.deepEqual((await rebuild(db,now)).products,[{url:a,searches:2},{url:b,searches:1}]);
  assert.equal((await record(db,'user-a',a,now+86400000)).accepted,true);
  assert.equal((await rebuild(db,now+29*86400000)).products.length,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM receipts').get().n,0);
});
test('Unknown/retired products are rejected, limits cannot overshoot',async()=>{
  const db=database();
  assert.equal((await record(db,'u','https://evil.test/',now)).accepted,false);
  assert.equal((await record(db,'u','https://vaad.ar/producto/unknown/',now)).accepted,false);
  const uid=await hashUid('u',day);
  db.sqlite.prepare('INSERT INTO user_totals VALUES(?,?,50)').run(day,uid);
  assert.equal((await record(db,'u',a,now)).accepted,false);
  db.sqlite.prepare('INSERT INTO day_totals VALUES(?,4999)').run(day);
  assert.equal((await record(db,'v',a,now)).accepted,true);
  assert.equal((await record(db,'w',b,now)).accepted,false);
  assert.equal(db.sqlite.prepare('SELECT n FROM day_totals').get().n,5000);
  db.sqlite.prepare('UPDATE catalog SET active=0 WHERE url=?').run(a);
  assert.equal((await rebuild(db,now)).products.length,0);
  assert.equal(cutoffAt(now),'2026-09-09');
  assert.match(RECORD_SQL,/RETURNING url/);
});
test('Firebase JWT verifies signature, project, expiry, algorithm and required timestamps',async()=>{
  const {publicKey,privateKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='test';
  const keys=createLocalJWKSet({keys:[jwk]}); const seconds=now/1000;
  const sign=(payload={},header={alg:'RS256',kid:'test'})=>new SignJWT({auth_time:seconds-10,...payload})
    .setProtectedHeader(header).setSubject('anonymous').setAudience('iahadut-hatora')
    .setIssuer('https://securetoken.google.com/iahadut-hatora').setIssuedAt(seconds-5).setExpirationTime(seconds+3600).sign(privateKey);
  const token=await sign(); assert.equal(await verifySession(token,'iahadut-hatora',keys,now),'anonymous');
  await assert.rejects(verifySession(token,'other-project',keys,now));
  await assert.rejects(verifySession(token,'iahadut-hatora',keys,now+4000000));
  await assert.rejects(verifySession(await sign({auth_time:seconds+10}),'iahadut-hatora',keys,now));
  await assert.rejects(verifySession(token.slice(0,-10)+'AAAAAAAAAA','iahadut-hatora',keys,now));
});
test('HTTP auth, CORS, limits, payload bounds and backend failure',async()=>{
  const db=database(),handler=createHandler(async()=> 'session');
  const env={DB:db,FIREBASE_PROJECT:'iahadut-hatora',SEARCH_LIMIT:{limit:async()=>({success:true})}};
  const request=(body,headers={})=>new Request('https://ranking.test/record',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+'a'.repeat(30),...headers},body});
  assert.equal((await handler(new Request('https://ranking.test/record',{method:'POST'}),env)).status,401);
  assert.equal((await createHandler(async()=>{throw Error();})(request('{}'),env)).status,401);
  assert.equal((await handler(request('{'),env)).status,400);
  assert.equal((await handler(request('x'.repeat(2049)),env)).status,413);
  assert.equal((await handler(request('{}',{'Content-Type':'text/plain'}),env)).status,415);
  assert.equal((await handler(request('{}',{Origin:'https://evil.test'}),env)).status,403);
  assert.equal((await handler(request(JSON.stringify({productUrl:a})),env)).status,200);
  env.SEARCH_LIMIT.limit=async()=>({success:false});
  assert.equal((await handler(request('{}'),env)).status,429);
  assert.equal(allowedOrigin('http://localhost'),true);
  assert.equal(allowedOrigin('https://localhost'),true);
  assert.equal(allowedOrigin('capacitor://localhost'),true);
  assert.equal(allowedOrigin('https://rajamimnehmad-sudo.github.io'),true);
  env.DB.prepare=()=>{throw Error('quota');};
  assert.equal((await handler(new Request('https://ranking.test/ranking'),env)).status,503);
});
test('Catalog synchronization verifies digest and retires removed products atomically',async()=>{
  const db=database();
  const {snapshotHash}=await import('../../../web/published-catalog.js');
  const snapshot={catalog:{generatedAt:'ignored',products:[{url:b}]}};
  const hash=await snapshotHash(snapshot);
  let calls=0;
  const fetcher=async url=>{calls++;return Response.json(url.endsWith('manifest.json')?{hash,snapshot:`snapshot-${hash}.json`}:snapshot);};
  await syncCatalog(db,now,fetcher);
  assert.equal(db.sqlite.prepare('SELECT active FROM catalog WHERE url=?').get(a).active,0);
  await syncCatalog(db,now+1000,fetcher);assert.equal(calls,2);
  await syncCatalog(db,now+3*3600000,fetcher);assert.equal(calls,3);
  await assert.rejects(syncCatalog(db,now+6*3600000,async()=>Response.json({hash:'a'.repeat(64),snapshot:'evil.json'})));
  assert.equal(db.sqlite.prepare('SELECT active FROM catalog WHERE url=?').get(b).active,1);
});
