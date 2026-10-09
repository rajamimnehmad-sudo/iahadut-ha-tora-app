import test from 'node:test';
import assert from 'node:assert/strict';
import {appleDistributionUrl, storeLinks, platformRemoteControl, ANDROID_STORE_URL} from '../web/platform-store.js';

test('iPhone never advertises Google Play when its store entry is not configured', () => {
  assert.deepEqual(storeLinks('ios'), {install:'https://apps.apple.com/app/id6819809029', rate:'https://apps.apple.com/app/id6819809029?action=write-review', label:'App Store'});
  assert.equal(storeLinks('android').install, ANDROID_STORE_URL);
});

test('TestFlight installation remains separate from the public App Store review link', () => {
  const testflight = 'https://testflight.apple.com/join/1234abcd';
  assert.equal(storeLinks('ios', testflight).install, testflight);
  assert.equal(storeLinks('ios', testflight).rate, 'https://apps.apple.com/app/id6819809029?action=write-review');
  assert.equal(storeLinks('ios', testflight).label, 'TestFlight');
  assert.equal(storeLinks('ios', 'https://apps.apple.com/ar/app/id123456789').rate, 'https://apps.apple.com/ar/app/id123456789?action=write-review');
});

test('untrusted, credentialed and Android update URLs cannot be opened as Apple updates', () => {
  for (const url of [ANDROID_STORE_URL, 'http://apps.apple.com/id1', 'https://apps.apple.com.attacker.test/id1', 'https://user:pass@apps.apple.com/id1', 'javascript:alert(1)', 'https://apps.apple.com:8080/id1']) {
    assert.equal(appleDistributionUrl(url), '');
  }
});

test('Android version changes cannot block or demand an update of iPhone', () => {
  const control = {app_enabled:false, minimum_version:'9.0.0', latest_version:'9.0.0', update_url:ANDROID_STORE_URL};
  const ios = platformRemoteControl(control, 'ios', '1.0.41');
  assert.equal(ios.minimum_version, '1.0.41');
  assert.equal(ios.latest_version, '1.0.41');
  assert.equal(ios.update_url, '');
  assert.equal(ios.app_enabled, false);
  assert.equal(platformRemoteControl(control, 'android', '1.0.41'), control);
});

test('iPhone respects its own minimum version, latest version and trusted distribution link', () => {
  const control = {ios_minimum_version:'1.0.42', ios_latest_version:'1.0.43', ios_update_url:'https://apps.apple.com/ar/app/id123456789'};
  const ios = platformRemoteControl(control, 'ios', '1.0.41');
  assert.equal(ios.minimum_version, '1.0.42');
  assert.equal(ios.latest_version, '1.0.43');
  assert.equal(ios.update_url, control.ios_update_url);
});
