import { firebaseConfig } from './firebase-config.js';

export const APP_VERSION = '0.11.3';
const CACHE_KEY = 'iht_remote_control';

export const defaultRemoteControl = {
  app_enabled: true,
  maintenance_message: 'Esta versión de prueba no está disponible temporalmente.',
  minimum_version: APP_VERSION,
  latest_version: APP_VERSION,
  update_url: 'https://play.google.com/store/apps/details?id=ar.vaad.catalogo.app',
  trial_expires_at: '',
  enforce_online_check: false,
  offline_grace_hours: 24,
  categories_json: '',
  taxonomy_rules_json: '',
  device_registration_url: ''
};

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; }
};

const configured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export async function loadRemoteControl(force = false) {
  const cached = readCache();
  if (!configured()) return {...defaultRemoteControl, ...(cached?.values || {}), configured:false, checkedAt:cached?.checkedAt || 0};
  try {
    const [{initializeApp, getApps}, remoteModule] = await Promise.all([import('firebase/app'), import('firebase/remote-config')]);
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const remote = remoteModule.getRemoteConfig(app);
    remote.settings.minimumFetchIntervalMillis = force ? 0 : 60 * 60 * 1000;
    remote.settings.fetchTimeoutMillis = 8000;
    remote.defaultConfig = Object.fromEntries(Object.entries(defaultRemoteControl).map(([key, value]) => [key, String(value)]));
    await remoteModule.fetchAndActivate(remote);
    const values = {
      app_enabled:remoteModule.getBoolean(remote, 'app_enabled'),
      maintenance_message:remoteModule.getString(remote, 'maintenance_message'),
      minimum_version:remoteModule.getString(remote, 'minimum_version'),
      latest_version:remoteModule.getString(remote, 'latest_version'),
      update_url:remoteModule.getString(remote, 'update_url'),
      trial_expires_at:remoteModule.getString(remote, 'trial_expires_at'),
      enforce_online_check:remoteModule.getBoolean(remote, 'enforce_online_check'),
      offline_grace_hours:Number(remoteModule.getString(remote, 'offline_grace_hours')) || 24,
      categories_json:remoteModule.getString(remote, 'categories_json'),
      taxonomy_rules_json:remoteModule.getString(remote, 'taxonomy_rules_json'),
      device_registration_url:remoteModule.getString(remote, 'device_registration_url')
    };
    const result = {values, checkedAt:Date.now()};
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
    return {...defaultRemoteControl, ...values, configured:true, checkedAt:result.checkedAt};
  } catch (error) {
    return {...defaultRemoteControl, ...(cached?.values || {}), configured:true, checkedAt:cached?.checkedAt || 0, error:String(error?.message || error)};
  }
}

export function compareVersions(left, right) {
  const a = String(left || '').split('.').map(Number);
  const b = String(right || '').split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

export function accessDecision(control) {
  const expired = control.trial_expires_at && Date.now() >= Date.parse(control.trial_expires_at);
  const staleHours = control.checkedAt ? (Date.now() - control.checkedAt) / 3600000 : Infinity;
  const needsOnlineCheck = control.enforce_online_check && staleHours > Number(control.offline_grace_hours || 24);
  const versionBlocked = compareVersions(APP_VERSION, control.minimum_version) < 0;
  return {
    allowed:Boolean(control.app_enabled) && !expired && !needsOnlineCheck && !versionBlocked,
    expired:Boolean(expired),
    needsOnlineCheck,
    versionBlocked,
    updateAvailable:compareVersions(APP_VERSION, control.latest_version) < 0
  };
}
