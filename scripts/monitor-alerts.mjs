import {createHash, createSign} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {DOMParser} from 'linkedom';

const sourceUrl = 'https://vaad.ar/alertas-de-productos/';
const statePath = resolve(process.env.ALERT_STATE_PATH || 'automation/alert-state.json');
const topic = process.env.FCM_TOPIC || 'catalog-updates';
const productTypes = new Set(['alta', 'baja']);
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const absolute = (value) => value ? new URL(value, sourceUrl).href : '';

const response = await fetch(sourceUrl, {headers: {Accept: 'text/html'}});
if (!response.ok) throw new Error(`No se pudo consultar la fuente oficial: HTTP ${response.status}`);
const document = new DOMParser().parseFromString(await response.text(), 'text/html');
const extract = (selector, type) => [...(document.querySelector(selector)?.querySelectorAll('li') || [])]
  .map((node) => ({type, text: clean(node.textContent), url: absolute(node.querySelector('a[href]')?.getAttribute('href'))}))
  .filter((item, index, all) => item.text.length > 8 && all.findIndex((candidate) => candidate.text === item.text) === index);
const current = [...extract('.card-altas', 'alta'), ...extract('.card-bajas', 'baja')];
const trackedSections = [
  {type: 'notes', title: 'Nueva nota de Kashrut', url: 'https://vaad.ar/notas-kashrut/'},
  {type: 'catering', title: 'Nuevo catering certificado', url: 'https://vaad.ar/servicios-de-catering/'},
  {type: 'shops', title: 'Nueva tienda certificada', url: 'https://vaad.ar/tiendas-kosher-certificadas/'}
];
for (const section of trackedSections) {
  const sectionResponse = await fetch(section.url, {headers: {Accept: 'text/html'}});
  if (!sectionResponse.ok) throw new Error(`No se pudo consultar ${section.type}: HTTP ${sectionResponse.status}`);
  const sectionDocument = new DOMParser().parseFromString(await sectionResponse.text(), 'text/html');
  const sectionText = [...sectionDocument.querySelectorAll('h1,h2,h3,h4,article,.et_pb_blurb,.info-card')]
    .map((node) => clean(node.textContent)).filter((text) => text.length > 2).join('|');
  const digest = createHash('sha256').update(sectionText).digest('hex');
  current.push({type: section.type, text: `${section.title} (${digest.slice(0, 12)})`, url: section.url, digest});
}
const currentMap = Object.fromEntries(current.map((item) => [`${item.type}:${item.text}`, item]));
let previous = {};
try {
  const parsed = JSON.parse(await readFile(statePath, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) previous = parsed;
} catch (_) {}
const previousEntries = Object.fromEntries(Object.entries(previous).filter(([key, item]) => key && item && typeof item === 'object' && typeof item.type === 'string'));
const previousProductCount = Object.values(previousEntries).filter((item) => productTypes.has(item.type)).length;
const currentProductCount = current.filter((item) => productTypes.has(item.type)).length;
const hasProductBaseline = previousProductCount > 0;
const hasSectionBaseline = trackedSections.some((section) => Object.values(previousEntries).some((item) => item?.type === section.type));
const needsProductBaseline = currentProductCount > 0 && !hasProductBaseline;
const changes = current.filter((item) => {
  const key = `${item.type}:${item.text}`;
  if (previousEntries[key]) return false;
  if (productTypes.has(item.type)) return hasProductBaseline;
  return hasSectionBaseline || !trackedSections.some((section) => section.type === item.type);
});
const mergedState = () => ({...previousEntries, ...currentMap});
const persistState = async (state = mergedState()) => {
  await mkdir(dirname(statePath), {recursive: true});
  const temporaryPath = `${statePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, statePath);
};

if (!changes.length) {
  await persistState();
  if (needsProductBaseline) console.log(`Se incorporó una línea de base segura para ${currentProductCount} productos sin enviar históricos.`);
  console.log('Sin cambios nuevos en altas, bajas o secciones informativas.');
  process.exit(0);
}

if (process.env.SEED_ONLY === '1') {
  await persistState();
  console.log(`${changes.length} cambio(s) detectado(s); se guardó la línea de base sin enviar push.`);
  process.exit(0);
}

if (!process.env.FCM_SERVICE_ACCOUNT_JSON) {
  throw new Error(`${changes.length} cambio(s) detectado(s), pero falta FCM_SERVICE_ACCOUNT_JSON. No se actualizó el estado para no perder las notificaciones.`);
}

console.log(`${changes.length} cambio(s) detectado(s); preparando notificaciones push.`);

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
const stateAfterSuccessfulSends = needsProductBaseline
  ? {...previousEntries, ...Object.fromEntries(current.filter((item) => productTypes.has(item.type)).map((item) => [`${item.type}:${item.text}`, item]))}
  : {...previousEntries};
for (const item of changes) {
  const notificationTitle = item.type === 'alta' ? 'Nueva alta en el catálogo' : item.type === 'baja' ? 'Producto dado de baja' : item.type === 'notes' ? 'Nueva nota de Kashrut' : item.type === 'catering' ? 'Nuevo catering certificado' : 'Nueva tienda certificada';
  const eventKey = `${item.type}:${item.text}`;
  const message = {message: {topic, notification: {title: notificationTitle, body: item.type === 'notes' || item.type === 'catering' || item.type === 'shops' ? 'Hay una novedad disponible para consultar.' : item.text}, android: {priority: 'HIGH', ttl: '3600s', collapse_key: 'catalog-updates', notification: {channel_id: 'catalog-updates', sound: 'default'}}, data: {action: 'sync', alertType: item.type, eventKey, sentAt: new Date(now * 1000).toISOString(), text: item.text, url: item.url || ''}}};
  const sendResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {method: 'POST', headers: {'content-type': 'application/json', Authorization: `Bearer ${accessToken}`}, body: JSON.stringify(message)});
  if (!sendResponse.ok) throw new Error(`FCM rechazó la notificación: HTTP ${sendResponse.status}`);
  stateAfterSuccessfulSends[eventKey] = item;
  await persistState(stateAfterSuccessfulSends);
  console.log(`Notificación enviada: ${item.type} · ${item.text}`);
}

await persistState(mergedState());
