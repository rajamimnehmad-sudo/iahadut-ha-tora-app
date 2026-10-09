import test from 'node:test';
import assert from 'node:assert/strict';
import {createAndroidAppUpdater} from '../web/android-app-update.js';
function fixture(info, result={started:true}) {
  const calls=[],messages=[],states=[];
  const bridge={checkForUpdate:async()=>{calls.push('check');return info;},start:async args=>{calls.push(args.type);return result;},complete:async()=>{calls.push('complete');}};
  return {calls,messages,states,bridge,run:createAndroidAppUpdater({bridge,onState:s=>states.push(s),notify:s=>messages.push(s)})};
}
test('Android update checks fresh Play state before starting a flexible update',async()=>{
 const f=fixture({available:true,flexibleAllowed:true});assert.deepEqual(await f.run(),{status:'started',type:'flexible'});assert.deepEqual(f.calls,['check','flexible']);
});
test('A downloaded update completes without opening another flow',async()=>{
 const f=fixture({downloaded:true});assert.deepEqual(await f.run(),{status:'installing'});assert.deepEqual(f.calls,['check','complete']);
});
test('An account without an offered update stays in the app',async()=>{
 const f=fixture({available:false});assert.equal((await f.run()).status,'current');assert.deepEqual(f.calls,['check']);assert.match(f.messages[0],/tu cuenta/);
});
test('Immediate update is used if Play allows only that in-app flow',async()=>{
 const f=fixture({available:true,flexibleAllowed:false,immediateAllowed:true});assert.equal((await f.run()).type,'immediate');assert.deepEqual(f.calls,['check','immediate']);
});
test('A previously started immediate update can resume',async()=>{
 const f=fixture({available:false,immediateInProgress:true,inProgress:true});assert.equal((await f.run()).type,'immediate');
});
test('An unsupported update reports the condition and stays in the app',async()=>{
 const f=fixture({available:true,flexibleAllowed:false,immediateAllowed:false});assert.equal((await f.run()).status,'unsupported');assert.deepEqual(f.calls,['check']);assert.equal(f.messages.length,1);
});
test('A download already running is not started twice',async()=>{
 const f=fixture({available:true,flexibleAllowed:true,inProgress:true});assert.equal((await f.run()).status,'downloading');assert.deepEqual(f.calls,['check']);
});
test('A download completing between check and start is installed',async()=>{
 const f=fixture({available:true,flexibleAllowed:true},{started:false,downloaded:true});assert.equal((await f.run()).status,'installing');assert.deepEqual(f.calls,['check','flexible','complete']);
});
test('A declined native start never reports success',async()=>{
 const f=fixture({available:true,flexibleAllowed:true},{started:false,available:true});assert.equal((await f.run()).status,'not-started');assert.equal(f.messages.length,1);
});
test('Play errors during check, start or installation remain recoverable in the app',async()=>{
 for(const stage of ['checkForUpdate','start','complete']) {
  const f=fixture(stage==='complete'?{downloaded:true}:{available:true,flexibleAllowed:true});
  f.bridge[stage]=async()=>{throw Error('temporary Play failure');};
  assert.equal((await f.run()).status,'error');assert.equal(f.messages.length,1);
 }
});
test('Repeated taps share one Play request and a later retry checks again',async()=>{
 const f=fixture({available:false});let resolve;
 f.bridge.checkForUpdate=()=>{f.calls.push('check');return new Promise(r=>{resolve=r;});};
 const first=f.run(),second=f.run();assert.equal(first,second);assert.deepEqual(f.calls,['check']);
 resolve({available:false});await first;
 const retry=f.run();assert.deepEqual(f.calls,['check','check']);resolve({available:false});await retry;
});

test('Store fallback is used once only when an in-app attempt fails',async()=>{
 for(const stage of ['checkForUpdate','start','complete','unsupported','not-started']) {
  const calls=[];
  const bridge={checkForUpdate:async()=>stage==='complete'?{downloaded:true}:{available:true,flexibleAllowed:stage!=='unsupported'},start:async()=>({started:false,available:true}),complete:async()=>{}};
  if(['checkForUpdate','start','complete'].includes(stage))bridge[stage]=async()=>{throw Error('temporary failure');};
  const run=createAndroidAppUpdater({bridge,openStore:async()=>calls.push('store')});
  assert.equal((await run()).status,'store-fallback');assert.deepEqual(calls,['store']);
 }
});
test('Successful or unavailable updates do not use the store fallback',async()=>{
 for(const info of [{available:false},{available:true,flexibleAllowed:true},{downloaded:true},{available:true,inProgress:true}]) {
  let stores=0;const bridge={checkForUpdate:async()=>info,start:async()=>({started:true}),complete:async()=>{}};
  await createAndroidAppUpdater({bridge,openStore:()=>stores++})();assert.equal(stores,0);
 }
});
test('An unavailable store fallback still gives a recoverable message',async()=>{
 const messages=[];const run=createAndroidAppUpdater({bridge:{checkForUpdate:async()=>{throw Error('offline');}},openStore:async()=>{throw Error('no store');},notify:m=>messages.push(m)});
 assert.equal((await run()).status,'error');assert.equal(messages.length,1);
});
