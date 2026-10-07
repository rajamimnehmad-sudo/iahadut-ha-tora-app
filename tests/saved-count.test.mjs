import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('  function renderSaved()'), source.indexOf('  function restoreSearchForm()'));
test('Guardados muestra el total real y se actualiza al quitar favoritos', () => {
  const elements = Object.fromEntries(['#savedTitle', '#savedMeta', '#savedProductList'].map(id => [id, {}]));
  const context = {
    products: [{url: 'a', title: 'A'}, {url: 'b', title: 'B'}],
    favorites: new Set(['a', 'b', 'url-que-no-esta-en-catalogo']),
    $: id => elements[id],
    bookmarkIcon: () => '',
    renderProductCollection: () => {},
  };
  vm.createContext(context);
  vm.runInContext(renderer, context);
  context.renderSaved();
  assert.equal(elements['#savedTitle'].textContent, 'Guardados (2)');
  assert.equal(elements['#savedMeta'].textContent, '2 productos guardados');
  context.favorites.delete('b');
  context.renderSaved();
  assert.equal(elements['#savedTitle'].textContent, 'Guardados (1)');
  assert.equal(elements['#savedMeta'].textContent, '1 producto guardado');
  context.favorites.clear();
  context.renderSaved();
  assert.equal(elements['#savedTitle'].textContent, 'Guardados (0)');
  assert.equal(elements['#savedMeta'].textContent, '0 productos guardados');
});
