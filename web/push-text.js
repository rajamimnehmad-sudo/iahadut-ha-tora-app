// The data payload carries the complete note; notification previews may be shorter.
export function pushBody(notification) {
  const data = notification?.data || {};
  const body = data.body || data.text || notification?.body || data['gcm.n.body'];
  return String(body || 'Hay una actualización disponible.').replace(/\r\n?/g, '\n').trim();
}
