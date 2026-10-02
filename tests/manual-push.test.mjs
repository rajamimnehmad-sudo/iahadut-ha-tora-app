import test from 'node:test';
import assert from 'node:assert/strict';
import {manualPushMessage, sendManualPush} from '../scripts/send-manual-push.mjs';
import {revokeNotification} from '../scripts/revoke-manual-push.mjs';
import {notificationIsRevoked, loadRevokedPushes, readRevokedPushes} from '../web/push-revocations.js';

const memory = (initial = []) => {
  const values = new Map([['iht_revoked_pushes', JSON.stringify(initial)]]);
  return {getItem:key => values.get(key), setItem:(key,value) => values.set(key,value)};
};

test('manual message opens Alertas and preserves its withdrawal identifier', () => {
  const message = manualPushMessage({title:'Aviso', body:'Texto', eventKey:'notice-1'});
  assert.equal(message.data.eventKey, 'notice-1');
  assert.equal(message.data.action, 'alerts');
  assert.equal(message.android.notification.channel_id, 'catalog-updates-v2');
  assert.equal(message.android.notification.tag, 'notice-1');
});
test('oversized UTF-8 payload and unsupported topics are rejected before sending', () => {
  assert.throws(() => manualPushMessage({title:'Aviso', body:'ñ'.repeat(1500)}));
  assert.throws(() => manualPushMessage({title:'Aviso', body:'Texto', topic:'other'}));
});
test('neither automatic execution nor preview calls Firebase', async () => {
  const fetcher = () => { throw new Error('Network must not be called'); };
  const env = {PUSH_TITLE:'Aviso', PUSH_BODY:'Texto', PUSH_SEND:'1'};
  await assert.rejects(sendManualPush(env, fetcher), /manual explícita/);
  await sendManualPush({...env, MANUAL_PUSH_APPROVED:'1', PUSH_SEND:'0'}, fetcher);
});
test('withdrawal affects only requested notification and is idempotent', () => {
  const first = revokeNotification({revoked:[]}, 'notice-1');
  const second = revokeNotification(first, 'notice-1');
  assert.deepEqual(second.revoked, ['notice-1']);
  assert.equal(notificationIsRevoked({eventKey:'notice-1'}, second.revoked), true);
  assert.equal(notificationIsRevoked({eventKey:'notice-2'}, second.revoked), false);
  assert.equal(notificationIsRevoked({id:'notice-1'}, second.revoked), true);
  assert.throws(() => revokeNotification(first, ''));
});
test('online withdrawals are cached and delayed deliveries remain suppressed offline', async () => {
  const storage = memory(['older']);
  const ids = await loadRevokedPushes(storage, async () => ({ok:true, json:async () => ({revoked:['notice-1']})}));
  assert.deepEqual(ids, ['older','notice-1']);
  const offline = await loadRevokedPushes(storage, async () => { throw new Error('Offline'); });
  assert.equal(notificationIsRevoked({eventKey:'notice-1'}, offline), true);
  assert.deepEqual(readRevokedPushes(storage), ids);
});
test('malformed or stale remote records cannot restore a removed alert', async () => {
  const storage = memory(['notice-1']);
  for (const document of [{revoked:[null]}, {revoked:[]}]) {
    assert.deepEqual(await loadRevokedPushes(storage, async () => ({ok:true, json:async () => document})), ['notice-1']);
  }
});
