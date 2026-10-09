import test from 'node:test';
import assert from 'node:assert/strict';
import {pushBody} from '../web/push-text.js';

test('native history keeps paragraphs and bullets, using the complete data note', () => {
  const full = 'Introducción\r\n\r\n• Primero\r\n• Segundo\r\n\r\nACLARACIÓN: texto final.';
  assert.equal(pushBody({body:'Introducción…',data:{body:full}}), full.replace(/\r\n/g,'\n'));
});
test('notification-only bodies keep their line breaks', () => {
  assert.equal(pushBody({body:'  Nota\n\nFinal  '}),'Nota\n\nFinal');
  assert.equal(pushBody({}), 'Hay una actualización disponible.');
});
