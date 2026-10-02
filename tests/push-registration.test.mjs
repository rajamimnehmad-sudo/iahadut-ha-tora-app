import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const registration = source.slice(source.indexOf('  async function pushTestTopicForToken('), source.indexOf('  async function refreshPlayUpdate('));
const setup = source.slice(source.indexOf('  function setupPushNotifications('), source.indexOf('  function renderMore()')).replaceAll("await import('@capacitor-firebase/messaging')", '({FirebaseMessaging:NativeMessaging})');
function harness(permission = 'granted', platform = 'android') {
  const storage = new Map(); const listeners = {}; const calls = [];
  const messaging = {
    addListener:async(name, fn) => { listeners[name] = fn; },
    createChannel:async() => { calls.push('channel'); },
    checkPermissions:async() => ({receive:permission}),
    requestPermissions:async() => { calls.push('permission'); return {receive:'granted'}; },
    getToken:async() => ({token:'fake-token'}),
    subscribeToTopic:async({topic}) => calls.push(topic),
    unsubscribeFromTopic:async() => {}, deleteToken:async() => {}
  };
  const context = vm.createContext({
    TextEncoder, crypto:webcrypto, console,
    localStorage:{getItem:key => storage.get(key) ?? null,setItem:(key,value) => storage.set(key,value),removeItem:key => storage.delete(key)},
    Capacitor:{isNativePlatform:() => true,getPlatform:() => platform},
    NativeMessaging:messaging,
    PushHistory:{configure:async(opts) => calls.push(opts.enabled ? 'subscribe' : 'unsubscribe'),setEnabled:async() => {}},
    pushSetupRequest:null, pushRegistrationQueue:Promise.resolve(),pushGeneration:0,pushListenersReady:false,
    document:{querySelector:() => null},renderNotificationPermission(){},renderPushNotifications(){},renderMore(){},
    restorePushHistory:async() => {},persistPushNotification(){},showView(){}
  });
  vm.runInContext(registration + setup, context);
  return {context, storage, listeners, calls, messaging, run:code => vm.runInContext(code, context)};
}
test('disabled installations do not subscribe automatically', async() => {
  const h = harness(); await h.run('setupPushNotifications(false)');
  assert.equal(h.storage.get('iht_push_status'), 'disabled');
  assert.equal(h.calls.includes('subscribe'), false);
});
test('rationale permission state is retried on explicit activation', async() => {
  const h = harness('prompt-with-rationale'); await h.run('setupPushNotifications(true)');
  assert.equal(h.storage.get('iht_push_status'), 'active');
  assert.equal(h.calls.includes('permission'), true);
});
test('missing token never reports active', async() => {
  const h = harness(); h.messaging.getToken = async() => ({});
  await h.run('setupPushNotifications(true)');
  assert.equal(h.storage.get('iht_push_status'), 'error');
  assert.equal(h.calls.includes('subscribe'), false);
});
test('rotated token after deactivation cannot resubscribe', async() => {
  const h = harness(); await h.run('setupPushNotifications(true)');
  await h.run('disablePushNotifications()'); h.calls.length = 0;
  await h.listeners.tokenReceived({token:'rotated'});
  assert.equal(h.storage.get('iht_push_status'), 'disabled');
  assert.deepEqual(h.calls, []);
});
test('deactivation while token request is pending wins over registration', async() => {
  const h = harness(); let resolveToken; let tokenRequested;
  const pending = new Promise(resolve => { tokenRequested = resolve; });
  h.messaging.getToken = () => { tokenRequested(); return new Promise(resolve => { resolveToken = resolve; }); };
  const setupPromise = h.run('setupPushNotifications(true)');
  await pending; await h.run('disablePushNotifications()');
  resolveToken({token:'late-token'}); await setupPromise;
  assert.equal(h.storage.get('iht_push_status'), 'disabled');
  assert.equal(h.calls.includes('subscribe'), false);
});
test('iOS activation never calls Android channel creation', async() => {
  const h = harness('granted', 'ios'); await h.run('setupPushNotifications(true)');
  assert.equal(h.storage.get('iht_push_status'), 'active');
  assert.equal(h.calls.includes('channel'), false);
});
