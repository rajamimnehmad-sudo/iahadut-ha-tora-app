import {readFile, writeFile, mkdir, readdir, unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {normalizedSnapshot, snapshotHash, validSnapshot} from '../web/published-catalog.js';
const root = resolve(new URL('../', import.meta.url).pathname);
const output = resolve(root, 'web/data/published');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const catalog = await readJson(resolve(root, 'web/data/catalog.json'));
const content = await readJson(resolve(root, 'web/data/content.json'));
const productDetails = await readJson(resolve(root, 'web/data/product-details.json'));
const snapshot = normalizedSnapshot({catalog, content, productDetails});
snapshot.catalog.products.sort((a,b) => a.url.localeCompare(b.url, 'en'));
validSnapshot(snapshot);
const hash = await snapshotHash(snapshot);
await mkdir(output, {recursive:true});
let previousManifest = null;
let previous = null;
try {
 previousManifest = await readJson(resolve(output, 'manifest.json'));
 previous = await readJson(resolve(output, previousManifest.snapshot));
 if (await snapshotHash(previous) !== previousManifest.hash) throw new Error('La copia anterior no coincide con su versión');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const deltas = [...(previousManifest?.deltas || [])];
if (previous && previousManifest.hash !== hash) {
 const previousProducts = new Map(previous.catalog.products.map(product => [product.url, product]));
 const nextProducts = new Map(snapshot.catalog.products.map(product => [product.url, product]));
 const removed = [...previousProducts.keys()].filter(url => !nextProducts.has(url));
 const changed = (a,b) => JSON.stringify(normalizedSnapshot(a)) !== JSON.stringify(normalizedSnapshot(b));
 const {products, ...catalogHeader} = snapshot.catalog;
 const delta = {from:previousManifest.hash, to:hash, catalog:catalogHeader,
  products:{removed,upserts:products.filter(product => changed(previousProducts.get(product.url), product))},
  details:{removed:Object.keys(previous.productDetails.products).filter(url => !snapshot.productDetails.products[url]), upserts:Object.fromEntries(Object.entries(snapshot.productDetails.products).filter(([url,detail]) => changed(previous.productDetails.products[url],detail)))},
  content:changed(previous.content,snapshot.content) ? snapshot.content : null};
 const file = `delta-${await snapshotHash({from:previousManifest.hash, to:hash})}.json`;
 await writeFile(resolve(output,file), JSON.stringify(delta)+'\n');
 deltas.push({from:previousManifest.hash, to:hash, file});
 console.log(`Cambios: ${delta.products.upserts.length} productos · ${removed.length} bajas · ${Object.keys(delta.details.upserts).length} fichas`);
}
const snapshotFile = `snapshot-${hash}.json`;
if (previousManifest?.hash !== hash) await writeFile(resolve(output,snapshotFile),JSON.stringify(snapshot)+'\n');
const manifest = {hash,snapshot:snapshotFile,version:catalog.generatedAt,checkedAt:new Date().toISOString(),deltas:deltas.slice(-60)};
await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest)+'\n');
const keep = new Set(['manifest.json',snapshotFile,previousManifest?.snapshot,...manifest.deltas.map(delta=>delta.file)]);
for (const file of await readdir(output)) if (/^(snapshot|delta)-[a-f0-9]{64}\.json$/.test(file) && !keep.has(file)) await unlink(resolve(output,file));
console.log(`Copia estática completa: ${snapshot.catalog.products.length} productos · versión ${hash.slice(0,12)}${previousManifest?.hash===hash ? ' · sin cambios' : ''}`);
