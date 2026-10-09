import {ANDROID_STORE_URL, APPLE_STORE_URL} from './platform-store.js';

const introduction = 'Hola, vengo de la app de Iahadut HaTora.';

export function appWhatsAppLink(href, {product = '', message = ''} = {}) {
  let url;
  try { url = new URL(href); } catch (_) { return href; }
  const host = url.hostname.toLowerCase();
  const direct = host === 'wa.me' && /^\/\d+\/?$/.test(url.pathname)
    || ['api.whatsapp.com', 'web.whatsapp.com', 'www.whatsapp.com', 'whatsapp.com'].includes(host) && url.pathname === '/send'
    || url.protocol === 'whatsapp:' && url.hostname === 'send';
  if (!direct) return href;
  const previous = (message || url.searchParams.get('text') || '').trim();
  if (previous.includes(introduction)) return url.href;
  const text = product ? `Quería consultar por ${product}.` : previous || 'Quería hacer una consulta.';
  url.searchParams.set('text', `${introduction} ${text}`);
  return url.href;
}

// No recipient: WhatsApp lets the user choose whom to share the app with.
export function appShareWhatsAppLink() {
  const url = new URL('https://wa.me/');
  url.searchParams.set('text', `Te comparto Iahadut HaTora, el catálogo kosher.\n\nAndroid: ${ANDROID_STORE_URL}\niPhone: ${APPLE_STORE_URL}`);
  return url.href;
}
