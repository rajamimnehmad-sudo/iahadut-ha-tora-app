import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  function featuredProductImage(product)');
const end = source.indexOf('  function featuredImageLayout(src)', start);
const details = JSON.parse(fs.readFileSync(new URL('../web/data/product-details.json', import.meta.url))).products;
const featured = JSON.parse(fs.readFileSync(new URL('../web/data/featured-products.json', import.meta.url))).products;
const cache = {};
const image = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {productCache:cache, bundledProductDetails:details, catalogPresentation:{photo:()=>null}});
const bounds = JSON.parse(fs.readFileSync(new URL('../web/data/featured-image-bounds.json', import.meta.url)));
const layout = vm.runInNewContext(`(${source.slice(end, source.indexOf('  function renderHome()', end)).trim()})`, {
  featuredImageBounds:bounds, URL, location:{href:'http://127.0.0.1:5173/'}
});

test('Cada destacado tiene límites medidos que permiten mostrar el frasco entero sin deformarlo', () => {
  for (const product of featured) {
    const src = image(product);
    const [width,height,left,top,right,bottom] = bounds[new URL(src).pathname.split('/').pop()];
    assert.ok(left >= 0 && top >= 0 && right <= width && bottom <= height);
    assert.ok(right > left && bottom > top);
    assert.ok((right-left)/(bottom-top) < 1, product.title);
    assert.match(layout(src), /data-featured-normalized/);
  }
  assert.equal(layout('https://example.com/mermelada15.jpg'), '');
  assert.equal(layout('https://vaad.ar/wp-content/uploads/2026/09/new.jpg'), '');
});

test('Destacados usa las fotos completas oficiales de Noel, no las miniaturas recortadas', () => {
  for (const product of featured.filter(p => /Noel/.test(p.title))) {
    assert.equal(image(product), details[product.url].images[0].src);
    assert.doesNotMatch(image(product), /-\d+x\d+\./);
  }
});
test('La foto oficial actual tiene prioridad y una ficha sin foto conserva su imagen del catálogo', () => {
  cache.new = {images:[{src:'foto-actual.jpg'}]};
  assert.equal(image({url:'new', image:'miniatura.jpg'}), 'foto-actual.jpg');
  assert.equal(image({url:'unknown', image:'catalogo.jpg'}), 'catalogo.jpg');
  assert.match(source, /image:featuredProductImage\(product\)/);
});
