import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const catalogPath = resolve(projectRoot, 'web/data/catalog.json');
const cachePath = resolve(projectRoot, process.env.BARCODE_ENRICH_CACHE_PATH || 'automation/barcode-enrichment-cache.json');
const legacyCachePath = resolve(projectRoot, 'work/barcode-enrichment-cache.json');
const evidencePath = resolve(projectRoot, 'automation/barcode-evidence.json');
const detailsPath = resolve(projectRoot, 'web/data/product-details.json');
const reviewDir = resolve(projectRoot, 'work');
const reviewJsonPath = resolve(reviewDir, 'barcode-review.json');
const reviewHtmlPath = resolve(reviewDir, 'barcode-review.html');
const endpoint = process.env.BARCODE_ENRICH_ENDPOINT || 'https://world.openfoodfacts.net/cgi/search.pl';
const userAgent = 'IahadutHaTora/0.11 (barcode enrichment; contact: local)';
const delayMs = Number(process.env.BARCODE_ENRICH_DELAY_MS || 6500);
const maxRequests = Number(process.env.BARCODE_ENRICH_MAX_REQUESTS || 0);
const requestTimeoutMs = Number(process.env.BARCODE_ENRICH_TIMEOUT_MS || 20_000);
const shouldWrite = process.argv.includes('--write');
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tokens = (value) => normalize(value).replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((token) => token.length > 1);
const significantTokens = (value) => tokens(value).filter((token) => !['marca', 'sabor', 'tipo', 'con', 'sin', 'de', 'del', 'la', 'el', 'y'].includes(token));
const tokenAliases = new Map([['aceitunas', 'aceituna'], ['arvejas', 'arveja'], ['cereales', 'cereal'], ['champignones', 'champignon'], ['descarozadas', 'descarozada'], ['duraznos', 'durazno'], ['fideos', 'fideo'], ['negras', 'negra'], ['papas', 'papa'], ['rellenas', 'rellena'], ['rodajas', 'rodaja'], ['verdes', 'verde'], ['clasico', 'clas'], ['clasica', 'clas'], ['classic', 'clas']]);
const variantTokens = new Set(['mango', 'manzana', 'pera', 'uva', 'naranja', 'limon', 'frutilla', 'chocolate', 'vainilla', 'intenso', 'suave', 'extra', 'virgen', 'clas', 'seleccion', 'especial', 'premium', 'light', 'diet', 'zero', 'integral', 'parboilizado', 'carnaroli', 'tetrabrik', 'botella', 'bidon', 'frasco', 'lata', 'aerosol', 'sachet', 'rodaja', 'rellena', 'salmuera', 'natural', 'gigantes', 'trozos', 'morron', 'descarozada', 'negro', 'negra', 'cubo', 'molinillo', 'deshidratado', 'espresso', 'arabico', 'mix', 'sal', 'amarillo', 'amarillos', 'yogur', 'mermelada', 'compota']);
const canonicalTokens = (value) => new Set(significantTokens(value).map((token) => tokenAliases.get(token) || token));

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
  const detail = detailIdentity(productDetails[product.url]?.description || '');
  return clean(`${baseName(product)} ${product.brand || ''} ${detail}`).replace(/[«»]/g, ' ');
}

function detailIdentity(value) {
  const detail = clean(value);
  if (!detail || /^(?:los aceites|productos?|frutos? secos|todos|todas|disponible|debe llevar|se pueden|solo)\b/i.test(detail)) return '';
  return detail.split(/\b(?:marcas reconocidas|actualmente|producto importado|producto autorizado|producto bajo|todos permitidos|todas las marcas|no se han|el rabinato|luego de|se recomienda|igualmente|origen:|certificaci[oó]n:|autorizado hasta)\b/i)[0].trim();
}

function matchCandidate(product, candidate, productDetails) {
  const localBrand = brandKey(product.brand);
  const externalBrand = brandKey(String(candidate.brands || '').split(',')[0]);
  if (!localBrand || !externalBrand || localBrand !== externalBrand) return false;
  const localName = new Set([...canonicalTokens(baseName(product)), ...canonicalTokens(detailIdentity(productDetails[product.url]?.description || ''))]);
  const externalName = canonicalTokens(candidate.product_name_es || candidate.product_name);
  if (!localName.size || !externalName.size) return false;
  if (![...localName].every((token) => externalName.has(token))) return false;
  return ![...externalName].some((token) => variantTokens.has(token) && !localName.has(token));
}

async function fetchMatches(query) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '25',
    fields: 'code,product_name,product_name_es,brands,quantity,packaging,image_front_url,image_front_small_url'
  });
  const data = await fetchJson(`${endpoint}?${params}`);
  return Array.isArray(data.products) ? data.products : [];
}

async function fetchJson(url) {
  const timeoutSeconds = Math.max(1, Math.ceil(requestTimeoutMs / 1000));
  const {stdout} = await execFileAsync('/usr/bin/curl', [
    '--fail', '--silent', '--show-error', '--location', '--compressed',
    '--max-time', String(timeoutSeconds),
    '--header', 'Accept: application/json',
    '--user-agent', userAgent,
    url
  ], {maxBuffer: 12 * 1024 * 1024});
  return JSON.parse(stdout);
}

function quantitySignature(value) {
  const match = clean(value).toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|g|gr|gramos?|l|litros?|ml|cc|unidades?|unid)\b/);
  if (!match) return '';
  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2];
  if (unit === 'kg' || unit === 'kilo') return `${amount * 1000}g`;
  if (unit === 'l' || unit === 'litros') return `${amount * 1000}ml`;
  if (unit === 'cc') return `${amount}ml`;
  if (unit.startsWith('unid')) return `${amount}un`;
  return `${amount}${unit.startsWith('gr') || unit.startsWith('gram') ? 'g' : unit}`;
}

function candidateLabel(candidate) {
  return clean(candidate.product_name_es || candidate.product_name || '');
}

function candidateImage(candidate) {
  return clean(candidate.image_front_url || candidate.image_front_small_url || '');
}

function variantNeedsReview(product, candidate) {
  const localQuantity = quantitySignature(product.title);
  const externalQuantity = quantitySignature(`${candidateLabel(candidate)} ${candidate.quantity || ''}`);
  return Boolean(localQuantity && externalQuantity && localQuantity !== externalQuantity);
}

function reviewCandidates(product, candidates) {
  return [...new Map(candidates.map((candidate) => {
    const code = validGtin(candidate.code);
    return [code, {
      code,
      label: candidateLabel(candidate),
      brand: clean(candidate.brands),
      quantity: clean(candidate.quantity),
      packaging: clean(candidate.packaging),
      image: candidateImage(candidate),
      source: code ? `https://world.openfoodfacts.org/product/${code}` : ''
    }];
  }).filter(([code]) => code)).values()];
}

async function fetchCandidatePhoto(code) {
  const url = `https://world.openfoodfacts.net/api/v2/product/${encodeURIComponent(code)}.json?fields=code,image_front_url,image_front_small_url`;
  const data = await fetchJson(url);
  return candidateImage(data.product || {});
}

async function hydrateReviewImages() {
  if (process.env.BARCODE_SKIP_REVIEW_IMAGES === '1') return {requested: 0, withImage: 0};
  const candidates = reviews.flatMap((review) => review.candidates);
  const pending = [...new Set(candidates.filter((candidate) => candidate.code && !candidate.image).map((candidate) => candidate.code))];
  const limit = Number(process.env.BARCODE_REVIEW_IMAGE_MAX || 0);
  const queue = limit ? pending.slice(0, limit) : pending;
  const imageByCode = new Map();
  const concurrency = 4;
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const code = queue[cursor++];
      try { imageByCode.set(code, await fetchCandidatePhoto(code)); }
      catch (_) { imageByCode.set(code, ''); }
      if (cursor < queue.length) await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.max(250, delayMs / 4)));
    }
  };
  await Promise.all(Array.from({length: Math.min(concurrency, queue.length)}, worker));
  candidates.forEach((candidate) => { if (!candidate.image && imageByCode.has(candidate.code)) candidate.image = imageByCode.get(candidate.code); });
  return {requested: queue.length, withImage: [...imageByCode.values()].filter(Boolean).length};
}

function reviewHtml(reviews) {
  const cards = reviews.map((review, index) => `<article class="review-card">
    <div class="review-heading"><span class="review-number">${String(index + 1).padStart(2, '0')}</span><div><h2>${escapeHtml(review.productTitle)}</h2><p class="reason">${escapeHtml(review.reason)}</p></div></div>
    <div class="official-panel"><div class="section-kicker">Referencia oficial</div><div class="official-content"><img src="${escapeAttribute(review.productImage)}" alt="${escapeAttribute(review.productTitle)}"><div><strong>${escapeHtml(review.productTitle)}</strong><a href="${escapeAttribute(review.productUrl)}" target="_blank" rel="noreferrer">Abrir ficha oficial ↗</a></div></div></div>
    <div class="candidate-panel"><div class="section-kicker">Posibles códigos · comparar presentación</div><div class="candidate-grid">${review.candidates.map((candidate) => `<section class="candidate"><div class="candidate-code">${escapeHtml(candidate.code)}</div><div class="candidate-image">${candidate.image ? `<img src="${escapeAttribute(candidate.image)}" alt="${escapeAttribute(candidate.label)}" loading="lazy">` : '<span>Foto no disponible</span>'}</div><strong>${escapeHtml(candidate.label)}</strong><span>${escapeHtml([candidate.brand, candidate.quantity, candidate.packaging].filter(Boolean).join(' · ') || 'Presentación no informada')}</span><a href="${escapeAttribute(candidate.source)}" target="_blank" rel="noreferrer">Ver fuente ↗</a><button class="approve" type="button" data-approve-product="${escapeAttribute(review.productUrl)}" data-approve-code="${escapeAttribute(candidate.code)}" data-approve-label="${escapeAttribute(candidate.label)}">Seleccionar este código</button></section>`).join('')}</div></div>
  </article>`).join('');
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Revisión de códigos de barras</title><style>
    :root{color-scheme:light;--green:#1f5d46;--ink:#20352d;--muted:#66746c;--line:#dbe7df;--soft:#f4f8f5;--gold:#b68b3d}*{box-sizing:border-box}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:1180px;margin:0 auto;padding:28px 24px 70px;color:var(--ink);background:linear-gradient(180deg,#edf5f0 0,#f8faf8 270px)}header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:10px 0 28px}h1{margin:0;color:var(--green);font-size:clamp(28px,4vw,44px);letter-spacing:-.04em}header p{max-width:540px;margin:8px 0 0;color:var(--muted);line-height:1.5}.header-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.summary{padding:10px 14px;border:1px solid #c8ddd0;border-radius:999px;background:#fff;color:var(--green);font-weight:700;white-space:nowrap}.copy-button,.approve{border:0;border-radius:10px;padding:10px 12px;background:var(--green);color:#fff;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.copy-button:hover,.approve:hover{background:#174936}.review-card{overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:22px;padding:22px;margin:18px 0;box-shadow:0 10px 30px #1f5d4612}.review-heading{display:flex;gap:14px;align-items:flex-start}.review-number{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--green);color:white;font-size:13px;font-weight:800}.review-heading h2{margin:0;color:var(--ink);font-size:clamp(18px,2.5vw,24px);letter-spacing:-.02em}.reason{margin:5px 0 18px;color:#8a621f;font-size:13px;line-height:1.4}.section-kicker{margin-bottom:10px;color:var(--green);font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.official-panel{padding:16px;border:1px solid #d8e9de;border-radius:16px;background:var(--soft)}.official-content{display:flex;align-items:center;gap:18px}.official-content img{width:104px;height:104px;object-fit:contain;border-radius:12px;background:#fff;border:1px solid var(--line)}.official-content div{display:grid;gap:8px}.official-content strong{font-size:17px}.candidate-panel{margin-top:18px}.candidate-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}.candidate{display:grid;gap:8px;align-content:start;min-width:0;padding:13px;border:1px solid var(--line);border-radius:15px;background:#fff;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.candidate:hover{transform:translateY(-2px);border-color:#9bc5ad;box-shadow:0 8px 18px #1f5d4614}.candidate.selected{border-color:var(--green);box-shadow:0 0 0 3px #1f5d4620;background:#f0f8f2}.candidate-code{color:var(--green);font-size:12px;font-weight:800;letter-spacing:.05em}.candidate-image{display:grid;place-items:center;width:100%;height:175px;border-radius:11px;background:#fafcfb;border:1px solid #edf2ee;overflow:hidden}.candidate-image img{width:100%;height:100%;object-fit:contain}.candidate-image span{padding:12px;color:#8a958e;font-size:12px;text-align:center}.candidate strong{font-size:14px;line-height:1.3}.candidate span{min-height:32px;color:var(--muted);font-size:12px;line-height:1.35}.candidate a,.official-content a{color:#1f6d50;font-size:12px;font-weight:700;text-decoration:none}.candidate a:hover,.official-content a:hover{text-decoration:underline}.approve{width:100%;margin-top:2px;background:#fff;color:var(--green);border:1px solid #9bc5ad}.candidate.selected .approve{background:var(--green);color:#fff}.empty{color:var(--muted)}@media(max-width:620px){body{padding:18px 12px 42px}header{display:block}.header-actions{justify-content:flex-start;margin-top:14px}.summary{display:inline-block}.review-card{padding:15px;border-radius:18px}.candidate-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.candidate{padding:9px}.candidate-image{height:140px}.official-content img{width:82px;height:82px}.official-content{gap:12px}}
  </style><body><header><div><h1>Revisión manual de códigos</h1><p>Compará cada producto oficial con sus variantes. Seleccioná solamente la presentación idéntica; después copiá las aprobaciones para cargarlas en la base.</p></div><div class="header-actions"><div class="summary"><span id="approvedCount">0</span> seleccionados · ${reviews.length} pendientes</div><button id="copyApprovals" class="copy-button" type="button">Copiar aprobaciones</button></div></header>${cards || '<p class="empty">No hay casos pendientes.</p>'}<script>const storageKey='iht_barcode_approvals';let approvals={};try{approvals=JSON.parse(localStorage.getItem(storageKey)||'{}')||{}}catch(_){approvals={}}const buttons=[...document.querySelectorAll('[data-approve-product]')];const count=document.getElementById('approvedCount');function render(){buttons.forEach((button)=>{const selected=approvals[button.dataset.approveProduct]?.code===button.dataset.approveCode;button.closest('.candidate')?.classList.toggle('selected',selected);button.textContent=selected?'Código seleccionado':'Seleccionar este código'});count.textContent=String(Object.keys(approvals).length)}buttons.forEach((button)=>button.addEventListener('click',()=>{const product=button.dataset.approveProduct;const current=approvals[product];if(current?.code===button.dataset.approveCode)delete approvals[product];else approvals[product]={code:button.dataset.approveCode,label:button.dataset.approveLabel};localStorage.setItem(storageKey,JSON.stringify(approvals));render()}));document.getElementById('copyApprovals')?.addEventListener('click',async()=>{const lines=Object.entries(approvals).map(([url,item])=>JSON.stringify({url,code:item.code,label:item.label,source:'Open Food Facts · aprobación visual'}));if(!lines.length){alert('Todavía no seleccionaste ningún código.');return}try{await navigator.clipboard.writeText(lines.join('\\n'));alert('Aprobaciones copiadas. Pegalas en el chat para registrarlas.')}catch(_){prompt('Copiá estas aprobaciones:',lines.join('\\n'))}});render();</script></body></html>`;
}

const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const escapeAttribute = (value) => escapeHtml(value).replace(/`/g, '&#96;');

async function loadCache() {
  const paths = process.env.BARCODE_ENRICH_CACHE_PATH ? [cachePath] : [cachePath, legacyCachePath];
  for (const path of paths) {
    try { return JSON.parse(await readFile(path, 'utf8')); } catch (_) {}
  }
  return {};
}

async function loadEvidence() {
  try { return JSON.parse(await readFile(evidencePath, 'utf8')); } catch (_) { return {}; }
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const products = Array.isArray(catalog.products) ? catalog.products : [];
const productDetails = JSON.parse(await readFile(detailsPath, 'utf8').catch(() => '{"products":{}}')).products || {};
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
const reviews = [];
let requests = 0;

for (const product of identities) {
  const identityKey = `${normalize(product.title)}|${brandKey(product.brand)}`;
  if (duplicateIdentities.has(identityKey) || product.barcode || (evidence[product.url] && validGtin(evidence[product.url].code))) continue;
  const query = searchText(product);
  let matches = cache[query];
  if (!matches) {
    if (maxRequests && requests >= maxRequests) break;
    if (requests) await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    try { matches = await fetchMatches(query); cache[query] = matches; }
    catch (error) { console.warn(`Consulta fallida para «${query}»: ${error.message}`); matches = []; cache[query] = matches; }
    requests += 1;
    await mkdir(dirname(cachePath), {recursive: true});
    await writeFile(cachePath, `${JSON.stringify(cache)}\n`, 'utf8');
  }
  const candidates = matches.filter((candidate) => validGtin(candidate.code) && matchCandidate(product, candidate, productDetails));
  const codes = [...new Set(candidates.map((candidate) => validGtin(candidate.code)))];
  if (codes.length === 1) {
    const candidate = candidates.find((item) => validGtin(item.code) === codes[0]);
    if (variantNeedsReview(product, candidate)) {
      reviews.push({productUrl: product.url, productTitle: product.title, productImage: product.image, reason: 'La presentación o el gramaje no coincide con seguridad.', candidates: reviewCandidates(product, candidates)});
    } else {
      assignments.push({product, code: codes[0], candidate});
    }
  } else if (codes.length > 1) {
    reviews.push({productUrl: product.url, productTitle: product.title, productImage: product.image, reason: 'Hay más de un código posible para esta marca y producto; requiere comparar la presentación.', candidates: reviewCandidates(product, candidates)});
  }
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
console.log(`Casos enviados a revisión visual: ${reviews.length}`);
for (const {product, code, candidate} of safeAssignments) console.log(`${code} · ${product.title} · fuente: ${candidate.source || candidate.product_name_es || candidate.product_name}`);

const reviewImageStats = await hydrateReviewImages();
console.log(`Fotos candidatas consultadas: ${reviewImageStats.withImage} de ${reviewImageStats.requested}`);
await mkdir(reviewDir, {recursive: true});
await writeFile(reviewJsonPath, `${JSON.stringify({generatedAt: new Date().toISOString(), reviews}, null, 2)}\n`, 'utf8');
await writeFile(reviewHtmlPath, reviewHtml(reviews), 'utf8');
console.log(`Revisión visual: ${reviewHtmlPath}`);

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
