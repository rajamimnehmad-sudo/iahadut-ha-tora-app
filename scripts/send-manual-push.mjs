import {createSign, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {pushImageUrl} from '../web/push-image.js';

// The catalog pipeline cannot call this sender without an explicit manual gate.
export function manualPushMessage({title, body, imageUrl = '', topic = 'catalog-updates', eventKey = randomUUID(), sentAt = new Date().toISOString()}) {
  title = String(title || '').trim();
  body = String(body || '').trim();
  if (!title || !body) throw new Error('Ingresá un título y un mensaje.');
  if (imageUrl && !pushImageUrl(imageUrl)) throw new Error('La foto debe tener una URL HTTPS pública.');
  imageUrl = pushImageUrl(imageUrl);
  if (topic !== 'catalog-updates' && !/^iahadut-test-[a-f0-9]{20}$/.test(topic)) throw new Error('El tema de prueba individual no es válido.');
  const message = {
    topic,
    notification:{title, body},
    android:{priority:'HIGH', ttl:'604800s', notification:{channel_id:'catalog-updates-v2', icon:'ic_notification', sound:'default', tag:eventKey}},
    apns:{headers:{'apns-push-type':'alert', 'apns-priority':'10'}, payload:{aps:{sound:'default', 'mutable-content':1}}},
    data:{action:'alerts', type:'manual', eventKey, sentAt, title, body}
  };
  if (imageUrl) {
    message.notification.image = imageUrl;
    message.android.notification.image = imageUrl;
    message.data.imageUrl = imageUrl;
  }
  // Keys and values count toward FCM's topic payload limit. Reserve headroom.
  const bytes = Object.entries({...message.notification, ...Object.fromEntries(Object.entries(message.data).map(([key, value]) => [`data.${key}`, value]))})
    .reduce((size, [key, value]) => size + Buffer.byteLength(key) + Buffer.byteLength(value), 0);
  if (bytes > 1800) throw new Error('El mensaje es demasiado largo para push. Acortá el título o el texto.');
  return message;
}

export async function sendManualPush(env = process.env, fetcher = fetch) {
  const message = manualPushMessage({title:env.PUSH_TITLE, body:env.PUSH_BODY, imageUrl:env.PUSH_IMAGE_URL, topic:env.PUSH_TEST_TOPIC || 'catalog-updates'});
  if (env.MANUAL_PUSH_APPROVED !== '1') throw new Error('El envío requiere una ejecución manual explícita.');
  if (env.PUSH_SEND !== '1') {
    console.log('Vista previa; no se envió ninguna notificación.');
    console.log(JSON.stringify({topic:message.topic, eventKey:message.data.eventKey, notification:message.notification}, null, 2));
    return;
  }
  if (!env.FCM_SERVICE_ACCOUNT_JSON) throw new Error('Falta FCM_SERVICE_ACCOUNT_JSON en GitHub.');
  if (!env.ALERTS_INGEST_SECRET) throw new Error('Falta la conexión con la bandeja de Alertas.');
  const saved = await fetcher('https://waien-hub.waien-studiodev-3c4.workers.dev/api/alerts', {
    method:'POST', headers:{'content-type':'application/json',Authorization:`Bearer ${env.ALERTS_INGEST_SECRET}`},
    body:JSON.stringify({eventKey:message.data.eventKey,title:message.data.title,body:message.data.body,imageUrl:message.data.imageUrl || '',topic:message.topic,sentAt:message.data.sentAt}),
    signal:AbortSignal.timeout(20000)
  });
  if (!saved.ok) throw new Error(`No se pudo guardar en Alertas: HTTP ${saved.status}. No se envió push.`);
  console.log('Aviso guardado en Alertas, independientemente de la preferencia de push.');
  console.log(`Identificador para retirarlo de Alertas: ${message.data.eventKey}`);
  const account = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
  if (account.project_id !== 'iahadut-hatora') throw new Error('La cuenta de servicio no pertenece al proyecto de la app.');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({alg:'RS256', typ:'JWT'})).toString('base64url');
  const claim = Buffer.from(JSON.stringify({iss:account.client_email, scope:'https://www.googleapis.com/auth/firebase.messaging', aud:'https://oauth2.googleapis.com/token', iat:now, exp:now+3600})).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256'); signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(account.private_key, 'base64url')}`;
  const authorization = await fetcher('https://oauth2.googleapis.com/token', {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion}), signal:AbortSignal.timeout(20000)});
  if (!authorization.ok) throw new Error(`Autorización FCM: HTTP ${authorization.status}`);
  const {access_token:token} = await authorization.json();
  if (!token) throw new Error('FCM no devolvió autorización.');
  const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {method:'POST', headers:{'content-type':'application/json', Authorization:`Bearer ${token}`}, body:JSON.stringify({message}), signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`FCM rechazó el aviso manual: HTTP ${response.status}`);
  console.log('Aviso manual aceptado por FCM. La recepción se comprueba en el dispositivo.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await sendManualPush();
}
