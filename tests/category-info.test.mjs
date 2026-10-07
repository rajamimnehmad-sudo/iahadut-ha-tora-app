import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {categoryInformation} from '../web/category-info.js';
const source = readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
test('La etiqueta incorpora una i redonda del mismo color sin botones anidados',()=>{
  const css=readFileSync(new URL('../web/theme.css',import.meta.url),'utf8');
  assert.match(source, /<span class="category-info-mark" aria-hidden="true">i<\/span>/);
  assert.match(css, /\.category-info-button \{[^}]*border-radius: 50%;[^}]*color: var\(--detail-category-ink\);/);
  assert.match(source, /wrapper\.append\(statusButton, infoButton\)/);
});
test('La explicación permanece dentro de la app sin enlace externo ni foco al enlace eliminado',()=>{
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/categoryInfoSource|Ver explicación oficial/);
  assert.doesNotMatch(source,/\$\('#categoryInfoSource'\)/);
  assert.match(source,/const last = first;/);
});
test('All four certification labels have an explanation and their own official source',()=>{
  assert.deepEqual(Object.keys(categoryInformation).sort(),['especial','gondola','planta','uruguay']);
  for (const info of Object.values(categoryInformation)) {
    assert.ok(info.paragraphs.length>=2);
    assert.ok(info.url.startsWith('https://vaad.ar/categoria-producto/'));
  }
});
test('The closed saved button counts only products still in the catalog and updates to zero',()=>{
  const badge={textContent:''};
  const context={products:[{url:'a'},{url:'b'}],favorites:new Set(['a','unknown']),document:{querySelectorAll:()=>[badge]}};
  const fn=source.slice(source.indexOf('  function renderSavedButtonCount()'),source.indexOf('  function renderSaved()'));
  vm.createContext(context);vm.runInContext(fn,context);
  context.renderSavedButtonCount();assert.equal(badge.textContent,'1');
  context.favorites.add('b');context.renderSavedButtonCount();assert.equal(badge.textContent,'2');
  context.favorites.clear();context.renderSavedButtonCount();assert.equal(badge.textContent,'0');
});
