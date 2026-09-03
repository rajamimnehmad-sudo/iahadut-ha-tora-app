import {createSign} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {DOMParser} from 'linkedom';

const sourceUrl = 'https://vaad.ar/alertas-de-productos/';
const statePath = resolve(process.env.ALERT_STATE_PATH || 'automation/alert-state.json');
const topic = process.env.FCM_TOPIC || 'catalog-updates';
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const absolute = (value) => value ? new URL(value, sourceUrl).href : '';

const response = await fetch(sourceUrl, {headers: {Accept: 'text/html'}});
if (!response.ok) throw new Error(`No se pudo consultar la fuente oficial: HTTP ${response.status}`);
const document = new DOMParser().parseFromString(await response.text(), 'text/html');
const extract = (selector, type) => [...(document.querySelector(selector)?.querySelectorAll('li') || [])]
  .map((node) => ({type, text: clean(node.textContent), url: absolute(node.querySelector('a[href]')?.getAttribute('href'))}))
  .filter((item, index, all) => item.text.length > 8 && all.findIndex((candidate) => candidate.text === item.text) === index);
const current = [...extract('.card-altas', 'alta'), ...extract('.card-bajas', 'baja')];
const currentMap = Object.fromEntries(current.map((item) => [`${item.type}:${item.text}`, item]));
let previous = {};
try { previous = JSON.parse(await readFile(statePath, 'utf8')); } catch (_) {}
const changes = current.filter((item) => !previous[`${item.type}:${item.text}`]);
await mkdir(dirname(statePath), {recursive: true});
await writeFile(statePath, `${JSON.stringify(currentMap, null, 2)}\n`, 'utf8');

if (!changes.length || !process.env.FCM_SERVICE_ACCOUNT_JSON) {
  console.log(changes.length ? `${changes.length} cambio(s) detectado(s); falta FCM_SERVICE_ACCOUNT_JSON.` : 'Sin cambios nuevos en altas/bajas.');
  process.exit(0);
}

const serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({alg: 'RS256', typ: 'JWT'})).toString('base64url');
const claim = Buffer.from(JSON.stringify({iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600})).toString('base64url');
const unsigned = `${header}.${claim}`;
const signer = createSign('RSA-SHA256'); signer.update(unsigned);
const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion})});
if (!tokenResponse.ok) throw new Error(`No se pudo obtener autorización FCM: HTTP ${tokenResponse.status}`);
const {access_token: accessToken} = await tokenResponse.json();
for (const item of changes) {
  const message = {message: {topic, notification: {title: item.type === 'alta' ? 'Nueva alta en el catálogo' : 'Producto dado de baja', body: item.text}, data: {action: 'sync', alertType: item.type, url: item.url || ''}}};
  const sendResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {method: 'POST', headers: {'content-type': 'application/json', Authorization: `Bearer ${accessToken}`}, body: JSON.stringify(message)});
  if (!sendResponse.ok) throw new Error(`FCM rechazó la notificación: HTTP ${sendResponse.status}`);
  console.log(`Notificación enviada: ${item.type} · ${item.text}`);
}
