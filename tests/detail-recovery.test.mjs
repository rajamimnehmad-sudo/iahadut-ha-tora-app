import test from 'node:test';
import assert from 'node:assert/strict';
import {createDetailRecovery} from '../web/detail-recovery.js';
const detail = {textFormatVersion:1,description:'Ficha oficial',images:[]};
test('Failed fiche recovers from central data and concurrent requests share one sync',async()=>{
 const cache={};let calls=0,finish;
 const recover=createDetailRecovery({online:()=>true,read:url=>cache[url],sync:()=>{calls++;return new Promise(resolve=>{finish=()=>{cache.a=detail;cache.b=detail;resolve();};});}});
 const a=recover('a'),b=recover('b');await Promise.resolve();assert.equal(calls,1);finish();
 assert.equal(await a,detail);assert.equal(await b,detail);
});
test('Missing or failing central fiches do not create a repeated sync loop',async()=>{
 let calls=0,time=0;
 const recover=createDetailRecovery({online:()=>true,read:()=>null,now:()=>time,sync:async()=>{calls++;throw Error('network');}});
 await assert.rejects(recover('a'),/network/);
 await assert.rejects(recover('b'),/todavía/);assert.equal(calls,1);
 time=60000;await assert.rejects(recover('a'),/network/);assert.equal(calls,2);
});
test('Offline failure preserves the catalog and makes no sync request',async()=>{
 let calls=0;const recover=createDetailRecovery({online:()=>false,read:()=>detail,sync:()=>calls++});
 await assert.rejects(recover('a'),/Sin conexión/);assert.equal(calls,0);
});
