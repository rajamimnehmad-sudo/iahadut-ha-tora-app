const STORAGE_KEY = 'iht_revoked_pushes';
const SOURCE = 'https://raw.githubusercontent.com/rajamimnehmad-sudo/iahadut-ha-tora-app/main/web/data/push-revocations.json';

export function notificationEventKey(item) {
  return String(item?.eventKey || item?.data?.eventKey || item?.tag || item?.data?.['gcm.n.tag'] || '').trim();
}

export function notificationIsRevoked(item, revoked) {
  return Boolean(revoked.includes(notificationEventKey(item)) || (item?.id && revoked.includes(item.id)));
}

// Repair old tray copies that were stored without their event key. Only use a
// unique native match; identical text from distinct notices is not sufficient.
export function reconcilePushHistory(items, nativeItems, revoked) {
  const text = value => String(value || '').replace(/\s+/g, ' ').trim();
  return items.map(item => {
    if (notificationEventKey(item)) return item;
    const exact = nativeItems.filter(candidate => item.id && String(candidate.id) === String(item.id));
    const matches = exact.length ? exact : nativeItems.filter(candidate =>
      text(candidate.title || candidate.data?.title) === text(item.title) &&
      text(candidate.body || candidate.data?.body) === text(item.body));
    const keys = [...new Set(matches.map(notificationEventKey).filter(Boolean))];
    return keys.length === 1 ? {...item, eventKey:keys[0]} : item;
  }).filter(item => !notificationIsRevoked(item, revoked));
}

export function readRevokedPushes(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
  } catch (_) { return []; }
}

// Keep withdrawals on disk so delayed FCM deliveries cannot restore an alert.
export async function loadRevokedPushes(storage = localStorage, fetcher = fetch) {
  const cached = readRevokedPushes(storage);
  try {
    const response = await fetcher(`${SOURCE}?t=${Date.now()}`, {cache:'no-store', signal:AbortSignal.timeout(8000)});
    if (!response.ok) return cached;
    const document = await response.json();
    if (!Array.isArray(document.revoked) || document.revoked.some((id) => typeof id !== 'string' || !id.trim())) return cached;
    const merged = [...new Set([...cached, ...document.revoked])];
    storage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (_) { return cached; }
}
