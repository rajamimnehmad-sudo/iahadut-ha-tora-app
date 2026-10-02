// Public static distribution keeps catalog reads out of Firestore quotas.
export function normalizedSnapshot(value) {
  if (Array.isArray(value)) return value.map(normalizedSnapshot);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => !['generatedAt', 'fetchedAt', 'bundled'].includes(key)).map(key => [key, normalizedSnapshot(value[key])]));
}
export async function snapshotHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizedSnapshot(value)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validSnapshot(value) {
  const products = value?.catalog?.products;
  const details = value?.productDetails?.products;
  if (!Array.isArray(products) || products.length < 900 || !details || !value?.content?.info || !value?.content?.cards) throw new Error('Copia central incompleta');
  const urls = new Set();
  for (const product of products) {
    if (!product.url || !product.title || urls.has(product.url) || details[product.url]?.textFormatVersion !== 1) throw new Error('Faltan productos o fichas en la copia central');
    urls.add(product.url);
  }
  return value;
}
export function applySnapshotDelta(previous, delta) {
  const products = new Map(previous.catalog.products.map(product => [product.url, product]));
  for (const url of delta.products.removed) products.delete(url);
  for (const product of delta.products.upserts) products.set(product.url, product);
  const details = {...previous.productDetails.products, ...delta.details.upserts};
  for (const url of delta.details.removed) delete details[url];
  return {catalog:{...delta.catalog, products:[...products.values()].sort((a,b) => a.url.localeCompare(b.url, 'en'))}, productDetails:{...previous.productDetails, products:details}, content:delta.content || previous.content};
}
export async function readPublishedSnapshot(fetchJson, previous = null, previousHash = '') {
  if (previous && await snapshotHash(previous) !== previousHash) { previous = null; previousHash = ''; }
  const manifest = await fetchJson('manifest.json');
  if (!Number.isFinite(Date.parse(manifest.version || '')) || !Array.isArray(manifest.deltas) || manifest.deltas.length > 60) throw new Error('Versión central inválida');
  if (!/^[a-f0-9]{64}$/.test(manifest.hash || '') || !/^snapshot-[a-f0-9]{64}\.json$/.test(manifest.snapshot || '')) throw new Error('Versión central inválida');
  if (previous && previousHash === manifest.hash) return {snapshot:validSnapshot(previous), hash:manifest.hash, changed:false, version:manifest.version};
  let snapshot = previous;
  let cursor = previousHash;
  let remaining = [...(manifest.deltas || [])];
  // Each immutable delta is fetched once. Retain the previous copy on any failure.
  while (snapshot && cursor !== manifest.hash) {
    const next = remaining.find(delta => delta.from === cursor);
    if (!next || !/^[a-f0-9]{64}$/.test(next.to || '') || !/^delta-[a-f0-9]{64}\.json$/.test(next.file || '')) { snapshot = null; break; }
    const delta = await fetchJson(next.file);
    if (delta.from !== cursor || delta.to !== next.to) throw new Error('Cambios centrales inválidos');
    snapshot = applySnapshotDelta(snapshot, delta);
    cursor = next.to;
    remaining = remaining.filter(item => item !== next);
  }
  if (!snapshot) snapshot = await fetchJson(manifest.snapshot);
  validSnapshot(snapshot);
  if (await snapshotHash(snapshot) !== manifest.hash) throw new Error('La copia central no coincide con su versión');
  return {snapshot, hash:manifest.hash, changed:true, version:manifest.version};
}
