import test from 'node:test';
import assert from 'node:assert/strict';
import {pushImageUrl} from '../web/push-image.js';
import {manualPushMessage} from '../scripts/send-manual-push.mjs';

test('picture reaches Android and app history through data', () => {
  const url = 'https://hub.example/api/push-images/photo.jpg';
  const message = manualPushMessage({title:'Foto', body:'Producto nuevo', imageUrl:url});
  assert.equal(message.notification.image, url);
  assert.equal(message.android.notification.image, url);
  assert.equal(message.data.imageUrl, url);
  assert.equal(message.data.action, 'alerts');
});
test('text-only notices remain compatible and unsafe images are rejected', () => {
  assert.equal(manualPushMessage({title:'Texto', body:'Sin foto'}).data.imageUrl, undefined);
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,x', 'http://host/a', 'https://user:pass@host/a']) {
    assert.equal(pushImageUrl(value), '');
    assert.throws(() => manualPushMessage({title:'Foto',body:'Texto',imageUrl:value}));
  }
});
