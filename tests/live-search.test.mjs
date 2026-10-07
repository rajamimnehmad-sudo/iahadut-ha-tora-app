import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSearchClient,createLiveSearchTransport,LIVE_SEARCH_REFRESH_INTERVAL} from '../web/live-search.js';
const a='https://vaad.ar/producto/mermelada/';
const now=Date.parse('2026-10-06T12:00:00Z');
test('Ranking acordado cada quince minutos',()=>assert.equal(LIVE_SEARCH_REFRESH_INTERVAL,900000));
test('Cliente deduplica, reintenta fallos y no depende del almacenamiento',async()=>{
  let calls=0;
  const client=createLiveSearchClient({clock:()=>now,storage:{getItem(){throw Error();},setItem(){throw Error();}},call:async()=>{calls++;return {accepted:true};}});
  await Promise.all([client.record(a),client.record(a)]);await client.record(a);assert.equal(calls,1);
  let failed=true;
  const retry=createLiveSearchClient({clock:()=>now,call:async()=>{if(failed)throw Error('offline');return {accepted:true};}});
  await assert.rejects(retry.record(a));failed=false;assert.equal(await retry.record(a),true);
});
test('El día cambia, y un rechazo temporal no se marca como contado',async()=>{
  let time=now,calls=0;
  const client=createLiveSearchClient({clock:()=>time,call:async()=>{calls++;return {accepted:calls!==1};}});
  assert.equal(await client.record(a),false);assert.equal(await client.record(a),true);
  assert.equal(await client.record(a),false);time+=86400000;assert.equal(await client.record(a),true);
});
test('Transporte HTTP: ranking público, selección autenticada y fallo propagado sin borrar copia',async()=>{
  const requests=[];let tokens=0;
  const call=createLiveSearchTransport({getToken:async()=>{tokens++;return 'session';},fetcher:async(url,options)=>{requests.push({url,options});return Response.json({accepted:true});}});
  await call('getCatalogSearchRanking',{});assert.equal(tokens,0);assert.equal(requests[0].options.method,'GET');
  await call('recordCatalogSearch',{productUrl:a});assert.equal(tokens,1);assert.equal(requests[1].options.headers.Authorization,'Bearer session');
  assert.equal(JSON.parse(requests[1].options.body).productUrl,a);
  await assert.rejects(call('other',{}));
  await assert.rejects(createLiveSearchTransport({getToken:async()=>'',fetcher:async()=>new Response('',{status:503})})('getCatalogSearchRanking',{}));
});
