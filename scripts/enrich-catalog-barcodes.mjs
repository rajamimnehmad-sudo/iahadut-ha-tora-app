import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(projectRoot, 'web/data/catalog.json');
const cachePath = resolve(projectRoot, 'automation/barcode-enrichment-cache.json');
const legacyCachePath = resolve(projectRoot, 'work/barcode-enrichment-cache.json');
const evidencePath = resolve(projectRoot, 'automation/barcode-evidence.json');
const endpoint = 'https://world.openfoodfacts.net/cgi/search.pl';
const userAgent = 'IahadutHaTora/0.11 (barcode enrichment; contact: local)';
const delayMs = Number(process.env.BARCODE_ENRICH_DELAY_MS || 6500);
const maxRequests = Number(process.env.BARCODE_ENRICH_MAX_REQUESTS || 0);
const shouldWrite = process.argv.includes('--write');
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tokens = (value) => normalize(value).replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((token) => token.length > 1);
const significantTokens = (value) => tokens(value).filter((token) => !['marca', 'sabor', 'tipo', 'con', 'sin', 'de', 'del', 'la', 'el', 'y'].includes(token));

function validGtin(value) {
  const code = String(value || '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(code.length) || /^0+$/.test(code)) return '';
  let sum = 0;
  for (let index = code.length - 2, position = 0; index >= 0; index -= 1, position += 1) sum += Number(code[index]) * (position % 2 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(code.at(-1)) ? code : '';
}

function brandKey(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function baseName(product) {
  const title = clean(product.title).replace(/\bmarca\b.*$/i, '').replace(/[«»]/g, ' ');
  return significantTokens(title).join(' ');
}

function searchText(product) {
  // The catalog title contains typographic brand markers (and often repeats
  // the brand). Strip those before querying so external catalogues can match
  // the actual product identity instead of an unsearchable display title.
  return clean(`${baseName(product)} ${product.brand || ''}`).replace(/[«»]/g, ' ');
}

function matchCandidate(product, candidate) {
  const localBrand = brandKey(product.brand);
  const externalBrand = brandKey(String(candidate.brands || '').split(',')[0]);
  if (!localBrand || !externalBrand || localBrand !== externalBrand) return false;
  const localName = significantTokens(baseName(product));
  const externalName = new Set(significantTokens(candidate.product_name_es || candidate.product_name));
  if (!localName.length || !externalName.size) return false;
  return localName.every((token) => externalName.has(token));
}

async function fetchMatches(query) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '25',
    fields: 'code,product_name,product_name_es,brands'
  });
  const response = await fetch(`${endpoint}?${params}`, {headers: {Accept: 'application/json', 'User-Agent': userAgent}});
  if (!response.ok) throw new Error(`Open Food Facts respondió HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.products) ? data.products : [];
}

async function loadCache() {
  for (const path of [cachePath, legacyCachePath]) {
    try { return JSON.parse(await readFile(path, 'utf8')); } catch (_) {}
  }
  return {};
}

async function loadEvidence() {
  try { return JSON.parse(await readFile(evidencePath, 'utf8')); } catch (_) { return {}; }
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const products = Array.isArray(catalog.products) ? catalog.products : [];
const cache = await loadCache();
const evidence = await loadEvidence();
const identities = [...new Map(products.map((product) => [`${normalize(product.title)}|${brandKey(product.brand)}`, product])).values()];
const duplicateIdentities = new Set(products.map((product) => `${normalize(product.title)}|${brandKey(product.brand)}`).filter((key, index, all) => all.indexOf(key) !== index));
const evidenceAssignments = Object.entries(evidence).flatMap(([url, item]) => {
  const product = products.find((candidate) => candidate.url === url);
  const code = validGtin(item?.code);
  if (!product || !code || validGtin(product.barcode) === code) return [];
  return [{product, code, candidate:{product_name: item.label || product.title, source: item.source || 'evidence'}, evidence: true}];
});
const assignments = [...evidenceAssignments];
let requests = 0;

for (const product of identities) {
  const identityKey = `${normalize(product.title)}|${brandKey(product.brand)}`;
  if (duplicateIdentities.has(identityKey) || product.barcode) continue;
  const query = searchText(product);
  let matches = cache[query];
  if (!matches) {
    if (maxRequests && requests >= maxRequests) break;
    if (requests) await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    try { matches = await fetchMatches(query); cache[query] = matches; }
    catch (error) { console.warn(`Consulta fallida para «${query}»: ${error.message}`); cache[query] = []; }
    requests += 1;
    await mkdir(dirname(cachePath), {recursive: true});
    await writeFile(cachePath, `${JSON.stringify(cache)}\n`, 'utf8');
  }
  const candidates = matches.filter((candidate) => validGtin(candidate.code) && matchCandidate(product, candidate));
  const codes = [...new Set(candidates.map((candidate) => validGtin(candidate.code)))];
  if (codes.length === 1) assignments.push({product, code: codes[0], candidate: candidates.find((candidate) => validGtin(candidate.code) === codes[0])});
}

// Evidence is keyed by URL, so it can distinguish two catalog records with
// the same display title/brand but different packaging or variant. Exclude
// those targets from the conflict set while their authoritative assignment is
// being applied; unrelated products still keep their existing codes reserved.
const evidenceUrls = new Set(Object.keys(evidence));
const usedCodes = new Set(products.filter((product) => !evidenceUrls.has(product.url)).map((product) => validGtin(product.barcode)).filter(Boolean));
const assignedCodes = new Set();
const safeAssignments = assignments.filter(({code}) => {
  if (usedCodes.has(code) || assignedCodes.has(code)) return false;
  assignedCodes.add(code);
  return true;
});
console.log(`Identidades revisadas: ${identities.length}`);
console.log(`Consultas nuevas: ${requests}`);
console.log(`Códigos candidatos inequívocos: ${safeAssignments.length}`);
for (const {product, code, candidate} of safeAssignments) console.log(`${code} · ${product.title} · fuente: ${candidate.source || candidate.product_name_es || candidate.product_name}`);

if (shouldWrite && safeAssignments.length) {
  const byUrl = new Map(safeAssignments.map(({product, code}) => [product.url, code]));
  for (const product of products) {
    const code = byUrl.get(product.url);
    if (code) product.barcode = code;
  }
  catalog.generatedAt = new Date().toISOString();
  await writeFile(catalogPath, `${JSON.stringify(catalog)}\n`, 'utf8');
  console.log(`Catálogo actualizado: ${catalogPath}`);
} else if (safeAssignments.length) {
  console.log('Modo diagnóstico: usar --write para guardar sólo estos códigos inequívocos.');
}
