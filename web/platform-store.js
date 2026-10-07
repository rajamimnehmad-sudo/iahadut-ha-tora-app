export const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=ar.vaad.catalogo.app';

export function appleDistributionUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['apps.apple.com', 'testflight.apple.com'].includes(url.hostname) ? url.href : '';
  } catch (_) { return ''; }
}

export function storeLinks(platform, iosUrl = '') {
  if (platform !== 'ios') return {install:ANDROID_STORE_URL, rate:ANDROID_STORE_URL, label:'Google Play'};
  const install = appleDistributionUrl(iosUrl);
  return {install:install || 'https://vaad.ar/', rate:install.startsWith('https://apps.apple.com/') ? install : '', label:install.startsWith('https://testflight.apple.com/') ? 'TestFlight' : 'App Store'};
}

export function platformRemoteControl(control, platform, version, iosUrl = '') {
  if (platform !== 'ios') return control;
  return {...control,
    minimum_version:control.ios_minimum_version || version,
    latest_version:control.ios_latest_version || version,
    update_url:appleDistributionUrl(control.ios_update_url) || appleDistributionUrl(iosUrl)
  };
}
