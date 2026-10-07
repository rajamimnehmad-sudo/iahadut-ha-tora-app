import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const start = source.indexOf("      let image = existing.querySelector(':scope > img');");
const end = source.indexOf('      const categoryLabel =', start);
const updateImage = `{${source.slice(start, end)}}`;
const theme = fs.readFileSync(new URL('../web/theme.css', import.meta.url), 'utf8');

test('Foto y skeleton mantienen diez píxeles de separación con el texto', () => {
  assert.match(theme, /\.detail-content > img \+ \.detail-body,\s*\.detail-content-loading > \.detail-loading-image \+ \.detail-body \{ margin-top: 10px; \}/);
});

test('La foto mantiene su marco y un skeleton independiente mientras descarga', () => {
  assert.match(theme, /\.detail-content:has\(> img\.asset-loading\)::before,[\s\S]*?height: 224px;/);
  assert.match(theme, /\.detail-content-loading \.detail-loading-image \{[^}]*height: 224px;/);
  assert.match(theme, /\.detail-content:has\(> img\.asset-error\)::before \{\s*content: 'Imagen no disponible';/);
});

test('Un error de foto conserva el espacio y desactiva la ampliación', () => {
  const markup = source.slice(source.indexOf('    const detailImageMarkup ='), source.indexOf('    const taxonomyMarkup ='));
  const handler = markup.match(/onerror="([^"]+)"/)?.[1];
  assert.ok(handler);
  const {document} = parseHTML('<div><img class="asset-loading" role="button" tabindex="0" data-expanded-image="foto.jpg"></div>');
  const image = document.querySelector('img');
  vm.runInNewContext(`(function(){${handler}}).call(image)`, {image});
  assert.ok(image.parentNode);
  assert.equal(image.className, 'asset-error');
  assert.equal(image.hasAttribute('role'), false);
  assert.equal(image.hasAttribute('tabindex'), false);
  assert.equal(image.hasAttribute('data-expanded-image'), false);
});

test('Cambiar de ficha elimina el bitmap anterior antes de cargar la foto nueva', () => {
  const {document} = parseHTML('<div id="detail"><img class="asset-ready" src="https://example.com/anterior.jpg"></div>');
  const existing = document.querySelector('#detail');
  const oldImage = existing.querySelector('img');
  const context = {existing, detailImage:'https://example.com/nueva.jpg',
    detailImageMarkup:'<img class="asset-loading" src="https://example.com/nueva.jpg">',
    product:{title:'Producto nuevo'}, URL, location:{href:'http://localhost/'}};
  vm.runInNewContext(updateImage, context);
  const newImage = existing.querySelector('img');
  assert.notEqual(newImage, oldImage);
  assert.equal(oldImage.parentNode, null);
  assert.equal(newImage.getAttribute('src'), context.detailImage);
  assert.equal(newImage.className, 'asset-loading');
  assert.equal(newImage.alt, 'Producto nuevo');
  // Updating the description of the same product must not restart its image.
  vm.runInNewContext(updateImage, context);
  assert.equal(existing.querySelector('img'), newImage);
  context.detailImage = '';
  vm.runInNewContext(updateImage, context);
  assert.equal(existing.querySelector('img'), null);
});
