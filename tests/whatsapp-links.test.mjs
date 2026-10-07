import test from 'node:test';
import assert from 'node:assert/strict';
import {appWhatsAppLink} from '../web/whatsapp-links.js';

test('WhatsApp identifica la app y conserva destinatario y mensaje', () => {
  const link = new URL(appWhatsAppLink('https://wa.me/5491112345678'));
  assert.equal(link.pathname, '/5491112345678');
  assert.equal(link.searchParams.get('text'), 'Hola, vengo de la app de Iahadut HaTora. Quería hacer una consulta.');
  const existing = appWhatsAppLink('https://api.whatsapp.com/send?phone=54911&text=Necesito%20información');
  assert.equal(new URL(existing).searchParams.get('phone'), '54911');
  assert.match(new URL(existing).searchParams.get('text'), /Necesito información$/);
  assert.equal(appWhatsAppLink(existing), existing);
});

test('Consultas de fichas nombran el producto sin modificar canales ni grupos', () => {
  assert.equal(new URL(appWhatsAppLink('https://wa.me/54911', {product:'Puré de tomate'})).searchParams.get('text'), 'Hola, vengo de la app de Iahadut HaTora. Quería consultar por Puré de tomate.');
  for (const href of ['https://whatsapp.com/channel/123', 'https://chat.whatsapp.com/123', 'https://vaad.ar/', 'mailto:secretaria@vaad.ar', 'invalid']) assert.equal(appWhatsAppLink(href), href);
  assert.match(appWhatsAppLink('whatsapp://send?phone=123'), /text=/);
});
