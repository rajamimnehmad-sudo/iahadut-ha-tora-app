import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  function taxonomyIcon(name)');
const end = source.indexOf('  function taxonomyTone(name)', start);
const icon = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
  normalize: text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  phosphorIcon: name => name
});
const css = readFileSync(new URL('../node_modules/@phosphor-icons/web/src/regular/style.css', import.meta.url), 'utf8');
const categories = JSON.parse(readFileSync(new URL('../web/data/reviewed-categories.json', import.meta.url))).paths;

test('cada categoría usa un SVG propio o un icono disponible, nunca una caja', () => {
  for (const name of new Set(Object.values(categories).flat())) {
    const result = icon(name);
    assert.notEqual(result, 'package', name);
    if (!result.startsWith('<svg')) assert.ok(css.includes(`.ph.ph-${result}:before`), `${name}: ${result}`);
  }
});
test('alcaparras, algas y féculas tienen dibujos diferentes', () => {
  const drawings = ['Alcaparras', 'Algas para sushi', 'Almidones y féculas'].map(icon);
  assert.ok(drawings.every(drawing => drawing.startsWith('<svg')));
  assert.equal(new Set(drawings).size, 3);
});
test('los aderezos comparten el mismo envase, incluidas las salsas golf y barbacoa', () => {
  for (const name of ['Aderezos', 'Mayonesas', 'Mostaza', 'Ketchup', 'Salsa barbacoa', 'Salsa golf']) {
    assert.equal(icon(name), 'jar', name);
  }
});
test('los productos vegetales y sin alcohol no se confunden con lácteos o destilados', () => {
  assert.equal(icon('Mantecas vegetales / parve'), 'jar');
  assert.equal(icon('Malta sin alcohol'), 'beer-bottle');
  assert.equal(icon('Jugo en polvo'), 'bag');
});
