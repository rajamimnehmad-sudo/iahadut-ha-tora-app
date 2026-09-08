import {createHash, createSign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = resolve(new URL('.', import.meta.url).pathname, '..');
const catalogPath = resolve(projectRoot, 'web/data/catalog.json');
const projectId = process.env.FIREBASE_PROJECT_ID || 'iahadut-hatora';
const database = '(default)';
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${database}/documents`;
const documentBaseName = `projects/${projectId}/databases/${database}/documents`;
const applyChanges = process.argv.includes('--apply');
const seedMode = process.argv.includes('--seed');
const forceSeed = process.argv.includes('--force-seed');
const pageSize = 1000;
const now = new Date().toISOString();

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

function validGtin(value) {
  const code = String(value || '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(code.length) || /^0+$/.test(code)) return '';
  let sum = 0;
  for (let index = code.length - 2, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(code[index]) * (position % 2 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(code.at(-1)) ? code : '';
}

function documentId(url) {
  return createHash('sha256').update(String(url)).digest('hex').slice(0, 40);
}

function firestoreValue(value) {
  if (value === null || value === undefined) return {nullValue: null};
  if (typeof value === 'boolean') return {booleanValue: value};
  if (typeof value === 'number' && Number.isInteger(value)) return {integerValue: String(value)};
  if (typeof value === 'number') return {doubleValue: value};
  return {stringValue: String(value)};
}

function firestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)]));
}

function fromFirestoreValue(value) {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  return undefined;
}

function fromFirestoreDocument(document) {
  return Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

async function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_JSON; nunca se debe guardar una cuenta de servicio en el repositorio.');
  const serviceAccount = JSON.parse(raw);
  if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error('La cuenta de servicio no tiene client_email o private_key.');
  return serviceAccount;
}

async function accessToken(serviceAccount) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({alg: 'RS256', typ: 'JWT'})).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600
  })).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion})
  });
  if (!response.ok) throw new Error(`No se pudo autorizar Firestore: HTTP ${response.status}`);
  return (await response.json()).access_token;
}

async function firestoreRequest(token, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {'content-type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {})}
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore respondió HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function listCollection(token, collection) {
  const documents = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({pageSize: String(pageSize)});
    if (pageToken) query.set('pageToken', pageToken);
    const result = await firestoreRequest(token, `/${collection}?${query}`);
    documents.push(...(result.documents || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return documents;
}

function productDocument(product, generatedAt) {
  const barcode = validGtin(product.barcode);
  return {
    sourceUrl: clean(product.url),
    title: clean(product.title),
    brand: clean(product.brand),
    category: clean(product.cat),
    imageUrl: clean(product.image),
    barcode,
    barcodeStatus: barcode ? 'verified-format' : 'missing',
    status: 'active',
    source: 'vaad.ar',
    catalogGeneratedAt: clean(generatedAt),
    updatedAt: now
  };
}

function sameProduct(a, b) {
  // catalogGeneratedAt identifies the last snapshot in which this product
  // changed. It must not make every unchanged product look modified when a
  // new snapshot is generated.
  const fields = ['sourceUrl', 'title', 'brand', 'category', 'imageUrl', 'barcode', 'barcodeStatus', 'status', 'source'];
  return fields.every((field) => String(a?.[field] ?? '') === String(b?.[field] ?? ''));
}

function writeFor(path, fields) {
  return {update: {name: `${documentBaseName}/${path}`, fields: firestoreFields(fields)}};
}

function deleteFor(path) {
  return {delete: `${documentBaseName}/${path}`};
}

async function commit(token, writes) {
  for (let offset = 0; offset < writes.length; offset += 450) {
    await firestoreRequest(token, ':commit', {method: 'POST', body: JSON.stringify({writes: writes.slice(offset, offset + 450)})});
  }
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const sourceProducts = Array.isArray(catalog.products) ? catalog.products : [];
const activeProducts = [...new Map(sourceProducts
  .filter((product) => product?.url && product?.title)
  .map((product) => [documentId(product.url), product])).entries()]
  .map(([id, product]) => ({id, data: productDocument(product, catalog.generatedAt)}));
if (activeProducts.length < 900) throw new Error(`Catálogo incompleto: ${activeProducts.length} productos. Se cancela para no borrar datos válidos.`);

console.log(`Catálogo fuente: ${activeProducts.length} productos activos · ${activeProducts.filter(({data}) => data.barcode).length} códigos con formato GTIN válido.`);

if (!applyChanges) {
  console.log('Modo diagnóstico: no se escribió nada en Firebase. Para aplicar, usar --apply después de la aprobación.');
  process.exit(0);
}

if (process.env.CATALOG_FIREBASE_APPROVED !== '1') {
  throw new Error('Escritura bloqueada: falta la aprobación CATALOG_FIREBASE_APPROVED=1.');
}

const serviceAccount = await loadServiceAccount();
const token = await accessToken(serviceAccount);
const existingDocuments = await listCollection(token, 'catalog_products');
const existing = new Map(existingDocuments.map((document) => [document.name.split('/').at(-1), fromFirestoreDocument(document)]));

if (seedMode && existing.size && !forceSeed) {
  throw new Error(`La colección ya contiene ${existing.size} productos. Para reemplazarla de forma explícita usar --force-seed; para una actualización normal no usar --seed.`);
}

const writes = [];
const currentIds = new Set(activeProducts.map(({id}) => id));
let added = 0;
let updated = 0;
let retired = 0;
for (const {id, data} of activeProducts) {
  const previous = existing.get(id);
  if (!previous) added += 1;
  else if (!sameProduct(previous, data)) updated += 1;
  if (!previous || !sameProduct(previous, data)) writes.push(writeFor(`catalog_products/${id}`, data));
}

for (const [id, previous] of existing) {
  if (currentIds.has(id)) continue;
  retired += 1;
  const archiveId = `${id}_${Date.now()}`;
  writes.push(writeFor(`catalog_archive/${archiveId}`, {
    ...previous,
    status: 'retired',
    retiredAt: now,
    retiredReason: 'No aparece en la fuente oficial durante la sincronización.',
    originalDocumentId: id
  }));
  writes.push(deleteFor(`catalog_products/${id}`));
}

writes.push(writeFor('catalog_metadata/current', {
  version: clean(catalog.generatedAt) || now,
  source: 'vaad.ar',
  activeProductCount: activeProducts.length,
  validBarcodeCount: activeProducts.filter(({data}) => data.barcode).length,
  updatedAt: now,
  syncMode: seedMode ? 'initial-seed' : 'incremental-authorized'
}));

console.log(`Plan autorizado: ${added} altas · ${updated} cambios · ${retired} bajas archivadas.`);
await commit(token, writes);
console.log(`Firebase actualizado: ${activeProducts.length} productos activos en catalog_products.`);
