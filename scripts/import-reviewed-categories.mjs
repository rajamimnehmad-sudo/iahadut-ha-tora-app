// Convert the approved local proposal into stable, URL-based category paths.
// Outputs JSON only; the calling editor saves it explicitly.
import fs from 'node:fs';
import vm from 'node:vm';
const proposal=new URL('../audit/2026-10-04/catalogo-completo-ordenado.html',import.meta.url);
const html=fs.readFileSync(proposal,'utf8');
const rows=JSON.parse(html.match(/<script[^>]*id="complete-data"[^>]*>([\s\S]*?)<\/script>/)[1]).rows;
const previous=fs.readFileSync(new URL('../audit/2026-10-04/CATEGORIAS-CATALOGO-COMPLETO.md',import.meta.url),'utf8').split('## Inventario completo')[1];
const urls=new Map([...previous.matchAll(/^\| (\d+) \| \[.*?\]\((https[^)]+)\)/gm)].map(m=>[+m[1],m[2]]));
const catalog=JSON.parse(fs.readFileSync(new URL('../web/data/catalog.json',import.meta.url),'utf8'));
const known=new Set(catalog.products.map(p=>p.url));
const context={};vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('const isOil='),html.indexOf('const families='))+'this.family=mainFamily;this.oilType=oilType;this.dressingType=dressingType;this.alcoholType=alcoholType;',context);
const paths={};
for(const row of rows){
  const url=urls.get(row.id);
  if(!known.has(url)||paths[url])throw new Error(`Unresolved or duplicate product ${row.id}`);
  const family=context.family(row),path=[family];
  if(family==='Aceites')path.push(context.oilType(row));
  if(family==='Aderezos')path.push(context.dressingType(row));
  if(family==='Bebidas alcohólicas'&&context.alcoholType(row))path.push(context.alcoholType(row));
  const product=catalog.products.find(product=>product.url===url);
  paths[url]=/^barritas?\b/i.test(product.title.trim()) ? ['Barritas'] : path;
}
if(Object.keys(paths).length!==1109)throw new Error('Expected all 1109 reviewed products');
console.log(JSON.stringify({reviewedAt:'2026-10-08',source:'Propuesta de categorías revisada con el usuario; Barritas separada de Snacks',paths},null,2));
