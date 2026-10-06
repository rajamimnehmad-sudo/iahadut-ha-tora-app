import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeInboxNotifications} from '../web/alerts-inbox.js';
import {sendManualPush} from '../scripts/send-manual-push.mjs';
const notice={eventKey:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',title:'Arcor',body:'Nuevos productos',imageUrl:'https://host.example/photo.jpg',sentAt:'2026-10-06T18:00:00Z'};
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
