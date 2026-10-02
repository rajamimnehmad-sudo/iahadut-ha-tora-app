const STORAGE_KEY = 'iht_revoked_pushes';
const SOURCE = 'https://raw.githubusercontent.com/rajamimnehmad-sudo/iahadut-ha-tora-app/main/web/data/push-revocations.json';

export function notificationIsRevoked(item, revoked) {
  return Boolean((item.eventKey && revoked.includes(item.eventKey)) || (item.id && revoked.includes(item.id)));
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
