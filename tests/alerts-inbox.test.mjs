import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeInboxNotifications,alertExpired} from '../web/alerts-inbox.js';
import {sendManualPush} from '../scripts/send-manual-push.mjs';
import {manualPushMessage} from '../scripts/send-manual-push.mjs';
const notice={eventKey:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',title:'Arcor',body:'Nuevos productos',imageUrl:'https://host.example/photo.jpg',sentAt:'2026-10-06T18:00:00Z'};
test('expiry options are bounded and propagate to push data and delivery TTL',()=>{
  for(const [option,seconds] of [['24h',86400],['48h',172800],['7d',604800]]) {
    const message=manualPushMessage({title:'Aviso',body:'Texto',sentAt:notice.sentAt,expiresAfter:option});
    assert.equal(Date.parse(message.data.expiresAt)-Date.parse(notice.sentAt),seconds*1000);
    assert.equal(message.android.ttl,`${seconds}s`);
  }
  assert.equal(manualPushMessage({title:'Aviso',body:'Texto'}).data.expiresAt,undefined);
  assert.throws(()=>manualPushMessage({title:'Aviso',body:'Texto',expiresAfter:'2d'}),/Vencimiento/);
});
test('expired notices disappear from cache even offline and do not return from feed',()=>{
  assert.equal(alertExpired({data:{expiresAt:'2000-01-02T00:00:00Z'}}),true);
  const expired={...notice,expiresAt:'2000-01-02T00:00:00Z'};
  assert.deepEqual(mergeInboxNotifications([expired],[]),[]);
  assert.deepEqual(mergeInboxNotifications([{...notice}],[expired]),[]);
  const future={...notice,expiresAt:'2099-01-01T00:00:00Z'};
  assert.equal(mergeInboxNotifications([],[future])[0].expiresAt,future.expiresAt);
});
test('users cannot clear the alert inbox in the app',async()=>{
  const {readFile}=await import('node:fs/promises');
  const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
  const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(html,/Limpiar notificaciones|data-clear-push-notifications/);
  assert.doesNotMatch(app,/function clearPushNotifications|closest\('\[data-clear-push-notifications/);
});
test('inbox imports notices without any push token or enabled preference',()=>{
  const rows=mergeInboxNotifications([], [notice]);
  assert.equal(rows.length,1);assert.equal(rows[0].imageUrl,notice.imageUrl);
});
test('feed and FCM history reconcile one notice, preserving its picture',()=>{
  const rows=mergeInboxNotifications([{id:'native',eventKey:notice.eventKey,title:'Arcor',body:'Texto'}],[notice]);
  assert.equal(rows.length,1);assert.equal(rows[0].id,'native');assert.equal(rows[0].imageUrl,notice.imageUrl);
});
test('withdrawn and locally dismissed notices stay removed after reopening',()=>{
  assert.deepEqual(mergeInboxNotifications([], [notice],[notice.eventKey]),[]);
  assert.deepEqual(mergeInboxNotifications([], [notice],[],[notice.eventKey]),[]);
  assert.deepEqual(mergeInboxNotifications([], [{...notice,imageUrl:'javascript:alert(1)'}])[0].imageUrl,'');
});
test('no push is sent when durable inbox cannot store the notice',async()=>{
  const calls=[];
  await assert.rejects(sendManualPush({PUSH_TITLE:'Arcor',PUSH_BODY:'Texto',PUSH_SEND:'1',MANUAL_PUSH_APPROVED:'1',ALERTS_INGEST_SECRET:'test',FCM_SERVICE_ACCOUNT_JSON:'{}'},async(url)=>{calls.push(url);return new Response('{}',{status:503});}),/guardar en Alertas/);
  assert.equal(calls.length,1);assert.match(calls[0],/\/api\/alerts$/);
});
