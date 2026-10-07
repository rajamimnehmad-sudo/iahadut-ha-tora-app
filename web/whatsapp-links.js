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
