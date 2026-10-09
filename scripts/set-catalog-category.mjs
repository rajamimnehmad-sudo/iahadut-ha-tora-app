import {readFile, writeFile} from 'node:fs/promises';
import {validCategoryPath, categorizeCatalog} from '../web/catalog-categories.js';

const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
if (!args.includes('--url') || !args.includes('--path')) {
  throw new Error('Uso: node scripts/set-catalog-category.mjs --url URL --path \'["Café"]\' [--apply]');
}
const url = value('--url');
const path = JSON.parse(value('--path'));
if (!validCategoryPath(path)) throw new Error('Categoría inválida');
const catalogFile = new URL('../web/data/catalog.json', import.meta.url);
const overridesFile = new URL('../web/data/catalog-category-overrides.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
if (!catalog.products.some(product => product.url === url)) throw new Error('Producto no encontrado en el catálogo');
const overrides = JSON.parse(await readFile(overridesFile, 'utf8'));
overrides.paths[url] = path;
const updated = categorizeCatalog(catalog, overrides.paths);
console.log(JSON.stringify({url, categoryPath:path, apply:args.includes('--apply')}));
if (args.includes('--apply')) {
  await writeFile(overridesFile, JSON.stringify(overrides, null, 2) + '\n');
  await writeFile(catalogFile, JSON.stringify(updated) + '\n');
  console.log('Guardado local. Publicar la copia central para distribuirlo; no requiere compilar la app compatible.');
}
