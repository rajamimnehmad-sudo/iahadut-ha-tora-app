import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {notificationEventKey, notificationIsRevoked, reconcilePushHistory} from '../web/push-revocations.js';
import {pushImageUrl} from '../web/push-image.js';
import {pushBody} from '../web/push-text.js';
import {alertExpired} from '../web/alerts-inbox.js';
const source = readFileSync(new URL('../web/app.js',import.meta.url),'utf8');

test('Android tray tags and nested event keys both identify withdrawn notifications',()=>{
  for (const item of [{id:'0',tag:'withdrawn'}, {data:{eventKey:'withdrawn'}}, {data:{'gcm.n.tag':'withdrawn'}}]) {
    assert.equal(notificationEventKey(item),'withdrawn');
    assert.equal(notificationIsRevoked(item,['withdrawn']),true);
    assert.equal(notificationIsRevoked(item,['other']),false);
  }
});
test('A restored Android tray notification cannot be persisted or mark alerts unread after withdrawal',()=>{
  const context={clean:value=>String(value||'').trim(),notificationEventKey,notificationIsRevoked,pushImageUrl,pushBody,alertExpired,
    notificationPlayStoreUrl:()=>'',revokedPushes:['withdrawn'],pushNotifications:[],
    pushNotificationKey:item=>item.eventKey||item.id,localStorage:{setItem(){}},
    setPushNotificationBadge(){throw Error('A withdrawn message must not light the bell');},
    document:{querySelector:()=>null}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function persistPushNotification('),source.indexOf('  async function pushTestTopicForToken')),context);
  assert.equal(context.persistPushNotification({id:'0',tag:'withdrawn',title:'Aviso',body:'Texto'}),null);
  assert.equal(context.pushNotifications.length,0);
});
test('Old identifier-less copies are repaired without withdrawing distinct identical notices',()=>{
  const old=[{id:'0',title:'Aviso',body:'Texto'}];
  const native=[{id:'fcm-1',title:'Aviso',body:'Texto',data:{eventKey:'withdrawn'}}];
  assert.equal(reconcilePushHistory(old,native,['withdrawn']).length,0);
  assert.equal(reconcilePushHistory(old,native,[])[0].eventKey,'withdrawn');
  assert.equal(reconcilePushHistory(old,[...native,{id:'fcm-2',title:'Aviso',body:'Texto',data:{eventKey:'keep'}}],['withdrawn']).length,1);
  assert.equal(reconcilePushHistory([{eventKey:'keep',title:'Aviso',body:'Texto'}],native,['withdrawn']).length,1);
});
test('Tray refresh cancels only withdrawn notifications and imports the others',async()=>{
  const withdrawn={id:'0',tag:'withdrawn',title:'Retirado',body:'Texto'};
  const kept={id:'0',tag:'keep',title:'Actual',body:'Otro texto'};
  const expired={id:'1',title:'Vencido',data:{expiresAt:'2000-01-01T00:00:00Z'}};
  const imported=[],removed=[];
  const context={notificationIsRevoked,alertExpired,revokedPushes:['withdrawn'],pushNotifications:[],
    clean:value=>String(value||'').trim(),persistPushNotification:item=>imported.push(item),
    setPushNotificationBadge(){},localStorage:{getItem:()=>null}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  async function refreshDeliveredPushBadge('),source.indexOf('  async function restorePushHistory(')),context);
  await context.refreshDeliveredPushBadge({getDeliveredNotifications:async()=>({notifications:[withdrawn,kept,expired]}),
    removeDeliveredNotifications:async options=>removed.push(...options.notifications)});
  assert.deepEqual(imported,[kept]);
  assert.deepEqual(removed,[withdrawn,expired]);
});
