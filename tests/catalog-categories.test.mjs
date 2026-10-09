import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogCategoryPath, categorizeCatalog} from '../web/catalog-categories.js';
import {applySnapshotDelta, validSnapshot} from '../web/published-catalog.js';
import {readFileSync} from 'node:fs';

test('A central correction overrides a bundled reviewed category without changing product content', () => {
  const product = {url:'https://vaad.ar/producto/aceite-de-coco-marca-chennat/', title:'Aceite de coco', cat:'gondola'};
  const corrected = categorizeCatalog({products:[product]}, {[product.url]:['Categoría revisada']}).products[0];
  assert.deepEqual(catalogCategoryPath(product), ['Aceites','Otros aceites']);
  assert.deepEqual(catalogCategoryPath(corrected), ['Categoría revisada']);
  assert.equal(corrected.title, product.title);
  assert.equal(corrected.cat, 'gondola');
  assert.equal(product.categoryPath, undefined);
  assert.deepEqual(catalogCategoryPath(JSON.parse(JSON.stringify(corrected))), ['Categoría revisada']);
});
test('Category corrections survive subsequent source refreshes and classify coffee by its main type', () => {
  const product = {url:'https://vaad.ar/producto/test-cafe/', title:'Café marca Juan Valdes', description:'Sabor avellana'};
  assert.deepEqual(catalogCategoryPath(categorizeCatalog({products:[product]}).products[0]), ['Café']);
  const overrides = {[product.url]:['Café','Molido']};
  const first = categorizeCatalog({products:[product]}, overrides);
  const refreshed = categorizeCatalog({products:[{...product, title:'Café nuevo nombre'}]}, overrides);
  assert.deepEqual(first.products[0].categoryPath, refreshed.products[0].categoryPath);
});
test('A category-only delta updates classification, retaining fiches and offline data', () => {
  const read = name => JSON.parse(readFileSync(new URL('../web/data/'+name+'.json', import.meta.url)));
  const previous = {catalog:read('catalog'), content:read('content'), productDetails:read('product-details')};
  const product = {...previous.catalog.products[0], categoryPath:['Café']};
  const next = applySnapshotDelta(previous, {catalog:previous.catalog, products:{removed:[],upserts:[product]}, details:{removed:[],upserts:{}},content:null});
  assert.deepEqual(catalogCategoryPath(next.catalog.products.find(p => p.url === product.url)), ['Café']);
  assert.deepEqual(next.productDetails, previous.productDetails);
  assert.doesNotThrow(() => validSnapshot(next));
  product.categoryPath = ['<script>'];
  assert.throws(() => validSnapshot(next), /Categoría central inválida/);
});
