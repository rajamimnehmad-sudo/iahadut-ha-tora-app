import {createWriteStream} from 'node:fs';
import {mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(projectRoot, 'web/data/catalog.json');
const detailsPath = resolve(projectRoot, 'web/data/product-details.json');
const evidencePath = resolve(projectRoot, 'automation/barcode-evidence.json');
const workDir = resolve(projectRoot, 'work/sepa');
const archivePath = resolve(projectRoot, process.env.SEPA_ARCHIVE_PATH || 'work/sepa/sepa-latest.zip');
const indexPath = resolve(projectRoot, process.env.SEPA_INDEX_PATH || 'work/sepa/sepa-barcode-index.json');
const packageApi = 'https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios';
const sourcePage = 'https://datos.produccion.gob.ar/dataset/sepa-precios';
const minCatalogProducts = 900;
const shouldWrite = process.argv.includes('--write');
const forceDownload = process.argv.includes('--refresh');
const preserveExistingSepa = process.env.SEPA_PRESERVE_EXISTING === '1';
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const stopWords = new Set(['marca', 'producto', 'productos', 'tipo', 'sabor', 'con', 'sin', 'de', 'del', 'la', 'el', 'y', 'para', 'en']);
const tokenAliases = new Map([
  ['aceitunas', 'aceituna'], ['arvejas', 'arveja'], ['cereales', 'cereal'], ['champignones', 'champignon'],
  ['descarozadas', 'descarozada'], ['deshidratados', 'deshidratado'], ['duraznos', 'durazno'], ['fideos', 'fideo'],
  ['negras', 'negra'], ['papas', 'papa'], ['rellenas', 'rellena'], ['rodajas', 'rodaja'], ['verdes', 'verde'],
  ['vegetales', 'vegetal'], ['clasico', 'clas'], ['clasica', 'clas'], ['classic', 'clas']
]);
const tokens = (value) => normalize(value).replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((token) => token.length > 1 && !stopWords.has(token));
const canonicalTokens = (value) => new Set(tokens(value).map((token) => tokenAliases.get(token) || token));
const brandKey = (value) => normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
const variantTokens = new Set(['mango', 'manzana', 'pera', 'uva', 'naranja', 'limon', 'frutilla', 'chocolate', 'vainilla', 'cafe', 'intenso', 'suave', 'extra', 'virgen', 'clas', 'seleccion', 'selecc', 'especial', 'esp', 'premium', 'light', 'diet', 'zero', '4flex', 'pilsener', 'largos', 'largo', 'semola', 'integral', 'parboilizado', 'carnaroli', 'tetrabrik', 'botella', 'bidon', 'frasco', 'lata', 'aerosol', 'sachet', 'rodaja', 'rellena', 'salmuera', 'natural', 'gigantes', 'trozos', 'morron', 'descarozada', 'negra', 'fantasia', 'espresso', 'arabico', 'arabica', 'pronto']);

function validGtin(value) {
  const code = String(value || '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(code.length) || /^0+$/.test(code)) return '';
  let sum = 0;
  for (let index = code.length - 2, position = 0; index >= 0; index -= 1, position += 1) sum += Number(code[index]) * (position % 2 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code.at(-1)) ? code : '';
}

function csvFields(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === '|' && !quoted) { fields.push(field); field = ''; }
    else field += character;
  }
  fields.push(field);
  return fields;
}

async function downloadArchive(resourceUrl) {
  await mkdir(workDir, {recursive: true});
  const response = await fetch(resourceUrl, {headers: {Accept: 'application/zip', 'User-Agent': 'IahadutHaTora/0.11 barcode enrichment'} });
  if (!response.ok || !response.body) throw new Error(`SEPA respondió HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath));
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'inherit']});
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise(output) : reject(new Error(`${command} terminó con código ${code}`)));
  });
}

async function latestResource() {
  try {
    const response = await fetch(packageApi, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const resources = (payload.result?.resources || []).filter((resource) => String(resource.format).toUpperCase() === 'ZIP' && resource.url);
    const latest = resources.sort((a, b) => new Date(b.last_modified || 0) - new Date(a.last_modified || 0))[0];
    if (!latest) throw new Error('no hay ZIP');
    return latest;
  } catch (error) {
    if (await stat(archivePath).catch(() => null)) {
      console.warn(`No se pudo actualizar el índice de recursos SEPA (${error.message}); se usará el ZIP local ya descargado.`);
      return {url: '', last_modified: 'local-archive', name: 'Archivo SEPA local'};
    }
    throw new Error(`No se pudo consultar el catálogo SEPA: ${error.message}`);
  }
}

async function buildIndex(resource) {
  let entries;
  try { entries = JSON.parse(await readFile(indexPath, 'utf8')); } catch (_) { entries = null; }
  if (entries && entries.resourceLastModified === resource.last_modified && !forceDownload) return entries;
  if (forceDownload || !(await stat(archivePath).catch(() => null))) await downloadArchive(resource.url);
  const byBarcode = new Map();
  const outerMembers = (await run('unzip', ['-Z1', archivePath])).split(/\r?\n/).filter((name) => /\.zip$/i.test(name));
  if (!outerMembers.length) throw new Error('No se encontraron paquetes de comercios dentro del ZIP SEPA.');
  const nestedPath = resolve(workDir, '.sepa-nested.zip');
  const extractNested = (member) => new Promise((resolvePromise, reject) => {
    const child = spawn('unzip', ['-p', archivePath, member], {stdio: ['ignore', 'pipe', 'inherit']});
    const output = createWriteStream(nestedPath);
    let processCode = null;
    let outputFinished = false;
    const finish = () => {
      if (!outputFinished || processCode === null) return;
      if (processCode === 0) resolvePromise();
      else reject(new Error(`No se pudo extraer ${member}`));
    };
    output.once('finish', () => { outputFinished = true; finish(); });
    output.once('error', reject);
    child.once('error', reject);
    child.once('close', (code) => { processCode = code; finish(); });
    child.stdout.pipe(output);
  });
  let csvCount = 0;
  for (const [outerIndex, outerMember] of outerMembers.entries()) {
    await extractNested(outerMember);
    const nestedSize = (await stat(nestedPath)).size;
    if (outerIndex === 0 || nestedSize === 0) console.log(`SEPA paquete ${outerIndex + 1}/${outerMembers.length}: ${outerMember} · ${nestedSize} bytes`);
    if (!nestedSize) { await rm(nestedPath, {force: true}); continue; }
    const innerMembers = (await run('unzip', ['-Z1', nestedPath])).split(/\r?\n/).filter((name) => /(?:^|\/)productos\.csv$/i.test(name));
    for (const member of innerMembers) {
      csvCount += 1;
      const child = spawn('unzip', ['-p', nestedPath, member], {stdio: ['ignore', 'pipe', 'inherit']});
      const closePromise = new Promise((resolveClose, rejectClose) => {
        child.once('error', rejectClose);
        child.once('close', (code) => code === 0 ? resolveClose() : rejectClose(new Error(`No se pudo leer ${member}`)));
      });
      const lines = createInterface({input: child.stdout, crlfDelay: Infinity});
      let headers = null;
      for await (const line of lines) {
      if (!line.trim()) continue;
      const values = csvFields(line);
      if (!headers) { headers = values.map((header) => clean(header).toLowerCase()); continue; }
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
      const isEan = ['1', 'true', 'si', 'sí'].includes(normalize(row.productos_ean || row.producto_ean || row.ean));
      const barcode = validGtin(row.id_producto || row.productos_id_producto || row.codigo_barras);
      if (!isEan || !barcode) continue;
      const description = clean(row.productos_descripcion || row.descripcion || row.producto_descripcion);
      const brand = clean(row.productos_marca || row.marca || row.producto_marca);
      const presentation = clean(row.productos_presentacion || row.presentacion || row.producto_presentacion || row.productos_unidad_medida);
        if (!description && !brand) continue;
        const key = `${normalize(description)}|${normalize(brand)}|${normalize(presentation)}`;
        byBarcode.set(barcode, {barcode, description, brand, presentation, key});
      }
      await closePromise;
    }
    await rm(nestedPath, {force: true});
  }
  if (!csvCount) throw new Error('No se encontró productos.csv dentro de los paquetes de comercios SEPA.');
  const result = {source: sourcePage, resourceUrl: resource.url, resourceLastModified: resource.last_modified, generatedAt: new Date().toISOString(), products: [...byBarcode.values()]};
  await writeFile(indexPath, `${JSON.stringify(result)}\n`, 'utf8');
  return result;
}

function productName(product) {
  return clean(`${product.title || ''} ${product.brand || ''}`).replace(/\bmarca\b/ig, '');
}

function detailIdentity(product) {
  const detail = clean(productDetails[product.url]?.description || '');
  if (!detail || /^(?:los aceites|productos?|frutos? secos|todos|todas|disponible|debe llevar|se pueden|solo)\b/i.test(detail)) return '';
  return detail.split(/\b(?:marcas reconocidas|actualmente|producto importado|producto autorizado|producto bajo|todos permitidos|todas las marcas|no se han|el rabinato|luego de|se recomienda|igualmente|origen:|certificaci[oó]n:|autorizado hasta)\b/i)[0].trim();
}

function identityTokens(product) {
  const titleTokens = canonicalTokens(productName(product));
  const detailTokens = canonicalTokens(detailIdentity(product));
  return {titleTokens, detailTokens, all: new Set([...titleTokens, ...detailTokens])};
}

function matchScore(product, entry) {
  const localBrand = brandKey(product.brand || product.title.match(/marca\s+(.+)$/i)?.[1] || '');
  const externalBrand = entry._brand || brandKey(entry.brand);
  const externalText = normalize(`${entry.description} ${entry.brand} ${entry.presentation}`);
  if (localBrand && !externalText.includes(localBrand)) return -1;
  if (localBrand && externalBrand && !externalBrand.includes(localBrand) && !localBrand.includes(externalBrand)) return -1;
  const {titleTokens, detailTokens, all: localTokensSet} = identityTokens(product);
  const localTokens = [...localTokensSet];
  const externalTokens = entry._tokens || canonicalTokens(`${entry.description} ${entry.brand} ${entry.presentation}`);
  if (titleTokens.size < 2 || ![...titleTokens].every((token) => externalTokens.has(token))) return -1;
  if (detailTokens.size && ![...detailTokens].every((token) => externalTokens.has(token))) return -1;
  const unexpectedVariant = [...externalTokens].some((token) => variantTokens.has(token) && !localTokens.includes(token));
  if (unexpectedVariant) return -1;
  const hits = localTokens.filter((token) => externalTokens.has(token));
  return hits.length / localTokens.length + (externalBrand && localBrand === externalBrand ? .45 : 0) + (entry.presentation ? .04 : 0);
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const productDetails = JSON.parse(await readFile(detailsPath, 'utf8').catch(() => '{"products":{}}')).products || {};
if (!Array.isArray(catalog.products) || catalog.products.length < minCatalogProducts) throw new Error('Catálogo local incompleto; se cancela la importación SEPA.');
let cachedIndex = null;
try { cachedIndex = JSON.parse(await readFile(indexPath, 'utf8')); } catch (_) {}
const resource = process.env.SEPA_RESOURCE_URL
  ? {url: process.env.SEPA_RESOURCE_URL, last_modified: process.env.SEPA_RESOURCE_UPDATED_AT || 'external-resource', name: 'Recurso SEPA solicitado'}
  : cachedIndex && !forceDownload
  ? {url: cachedIndex.resourceUrl, last_modified: cachedIndex.resourceLastModified, name: 'Índice SEPA en caché'}
  : await latestResource();
const index = await buildIndex(resource);
const entries = index.products.map((entry) => ({...entry, _brand: brandKey(entry.brand), _tokens: canonicalTokens(`${entry.description} ${entry.brand} ${entry.presentation}`)}));
const tokenBuckets = new Map();
const brandBuckets = new Map();
for (const entry of entries) {
  for (const token of entry._tokens) {
    if (!tokenBuckets.has(token)) tokenBuckets.set(token, []);
    tokenBuckets.get(token).push(entry);
  }
  if (entry._brand) {
    if (!brandBuckets.has(entry._brand)) brandBuckets.set(entry._brand, []);
    brandBuckets.get(entry._brand).push(entry);
  }
}
const candidatePool = (product) => {
  const localBrand = brandKey(product.brand || product.title.match(/marca\s+(.+)$/i)?.[1] || '');
  const localTokens = [...identityTokens(product).all];
  const pools = [];
  if (localBrand && brandBuckets.has(localBrand)) pools.push(brandBuckets.get(localBrand));
  const tokenPools = localTokens.map((token) => tokenBuckets.get(token) || []).sort((a, b) => a.length - b.length);
  pools.push(...tokenPools.slice(0, 3));
  return [...new Set(pools.flat())];
};
const evidence = JSON.parse(await readFile(evidencePath, 'utf8').catch(() => '{}'));
const previousSepa = new Map(Object.entries(evidence).filter(([, item]) => item?.sourceType === 'SEPA').map(([url, item]) => [url, validGtin(item.code)]));
if (!preserveExistingSepa) {
  Object.entries(evidence).forEach(([url, item]) => { if (item?.sourceType === 'SEPA') delete evidence[url]; });
  for (const product of catalog.products) {
    const previousCode = previousSepa.get(product.url);
    if (previousCode && validGtin(product.barcode) === previousCode) product.barcode = '';
  }
}
const usedCodes = new Set(catalog.products.map((product) => validGtin(product.barcode)).filter(Boolean));
const assignments = [];
const ambiguous = [];
for (const product of catalog.products) {
  if (validGtin(product.barcode)) continue;
  const ranked = candidatePool(product).map((entry) => ({entry, score: matchScore(product, entry)})).filter((item) => item.score >= 0).sort((a, b) => b.score - a.score);
  if (!ranked.length) continue;
  const best = ranked[0];
  const next = ranked[1];
  if (next && best.score - next.score < .16) { ambiguous.push({product, candidates: ranked.slice(0, 6).map(({entry, score}) => ({...entry, score}))}); continue; }
  if (usedCodes.has(best.entry.barcode)) continue;
  assignments.push({product, entry:best.entry, score:best.score});
  usedCodes.add(best.entry.barcode);
}
console.log(`SEPA: ${entries.length} productos EAN indexados desde ${resource.last_modified}.`);
console.log(`SEPA: ${assignments.length} coincidencias automáticas y ${ambiguous.length} ambiguas.`);
for (const {product, entry, score} of assignments.slice(0, 30)) console.log(`${entry.barcode} · ${product.title} · ${entry.description} · score ${score.toFixed(2)}`);

if (shouldWrite && assignments.length) {
  for (const {product, entry} of assignments) {
    evidence[product.url] = {code: entry.barcode, label: `${entry.description}${entry.presentation ? ` · ${entry.presentation}` : ''}`, source: sourcePage, sourceType: 'SEPA', sourceUpdatedAt: resource.last_modified};
  }
  await mkdir(dirname(evidencePath), {recursive: true});
  await (await import('node:fs/promises')).writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Evidencias SEPA guardadas: ${evidencePath}`);
} else if (assignments.length) console.log('Modo diagnóstico: usar --write para guardar sólo coincidencias con margen suficiente.');
