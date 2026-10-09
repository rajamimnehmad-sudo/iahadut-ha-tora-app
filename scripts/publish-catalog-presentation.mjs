import {readFile,writeFile} from 'node:fs/promises';
import {validatePresentation,verifyImageBytes} from '../web/catalog-presentation.js';
const source = new URL('../web/data/catalog-presentation.json', import.meta.url);
const output = new URL('../web/public/catalog-presentation.json', import.meta.url);
const value = JSON.parse(await readFile(source,'utf8'));
validatePresentation(value);
// Verify local publication assets before advancing the public revision.
for (const [key,asset] of Object.entries(value.assets)) {
  const bytes = await readFile(new URL(`../web/public/category-icons/${key}.png`,import.meta.url));
  await verifyImageBytes(bytes,asset);
}
let previous;
try {previous = JSON.parse(await readFile(output,'utf8'));} catch(error) {if(error.code !== 'ENOENT')throw error;}
const payload = object => JSON.stringify({...object,revision:''});
if (!previous || payload(previous) !== payload(value)) value.revision = new Date().toISOString();
else value.revision = previous.revision;
await writeFile(source,JSON.stringify(value,null,2)+'\n');
await writeFile(output,JSON.stringify(value)+'\n');
console.log(`Presentación validada: ${Object.keys(value.categories).length} categorías, ${Object.keys(value.assets).length} imágenes. Publicar JSON e imágenes en GitHub; no requiere nuevo build compatible.`);
