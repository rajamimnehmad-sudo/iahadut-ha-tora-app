import {catalogCategoryPath} from '../web/catalog-categories.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newProductCategoryPath} from '../web/new-product-categories.js';
const audit=JSON.parse(fs.readFileSync(new URL('../audit/new-products-category-audit-2026-10-09.json',import.meta.url)));
const classify=product=>catalogCategoryPath(product);
test('all eight October additions enter existing product families',()=>{
 const expected=[['Café'],['Frutos secos'],['Fideos y pastas secas'],['Fideos y pastas secas'],['Fideos y pastas secas'],['Fideos y pastas secas'],['Aderezos','Mostaza'],['Frutos secos']];
 assert.equal(audit.newProducts.length,8);
 audit.newProducts.forEach((product,index)=>assert.deepEqual(classify(product),expected[index],product.title));
});
test('flavours and certification prose cannot determine a new product category',()=>{
 assert.deepEqual(classify({title:'Café nuevo',description:'Avellana, chocolate, dulce de leche, bajo certificación'}),['Café']);
 assert.deepEqual(classify({title:'Producto nuevo desconocido',cat:'gondola',description:'Producto bajo certificación; puede contener avellana'}),null);
 assert.deepEqual(classify({title:'Galletitas marca Nueva',description:'Sabor café con avellana'}),['Galletitas y tostadas']);
});
test('specific pasta and peanut families remain distinct',()=>{
 assert.deepEqual(classify({title:'Fideos de arroz marca Nueva'}),['Pastas sin gluten y de legumbres']);
 assert.deepEqual(classify({title:'Maní japonés marca Nueva'}),['Maní japonés']);
});
test('future entries classify by product type rather than brand or flavour',()=>{
 const examples=[
  ['Aceite de oliva marca Café Nuevo',['Aceites','Aceite de oliva']],
  ['Aceite en aerosol de oliva',['Aceites','Aceites en aerosol']],
  ['Galletitas de almendra sabor café',['Galletitas y tostadas']],
  ['Cereal con miel y chocolate',['Cereales']],
  ['Mermelada de damasco',['Mermeladas']],
  ['Pasta de maní',['Pastas y mantequillas de frutos secos']],
  ['Mostaza con miel',['Aderezos','Mostaza']],
  ['Porotos de manteca',['Porotos, lentejas y garbanzos']],
  ['Papas congeladas',['Papas congeladas']],
  ['Arvejas congeladas',['Verduras congeladas']],
  ['Cerveza sin alcohol',['Cervezas sin alcohol']],
  ['Vino marca Café',['Bebidas alcohólicas','Vinos']],
  ['Jugo de uva',['Jugo de uva']],
  ['Jugo de naranja en polvo',['Jugo en polvo']],
  ['Leche de almendras',['Bebidas vegetales']],
  ['Barrita de arroz con maní y café',['Barritas']]
 ];
 for(const [title,expected] of examples)assert.deepEqual(classify({title,description:'Bajo certificación; avellana; chocolate'}),expected,title);
});
test('new entries use only category paths already present in the reviewed taxonomy',()=>{
 const reviewed=JSON.parse(fs.readFileSync(new URL('../web/data/reviewed-categories.json',import.meta.url))).paths;
 const catalog=JSON.parse(fs.readFileSync(new URL('../web/data/catalog.json',import.meta.url))).products;
 const existing=new Set(Object.values(reviewed).map(path=>JSON.stringify(path)));
 for(const product of [...catalog,...audit.newProducts]){
  const path=newProductCategoryPath(product);
  if(path)assert.ok(existing.has(JSON.stringify(path)),`${product.title}: ${JSON.stringify(path)}`);
 }
 assert.equal(newProductCategoryPath({title:'Artículo nuevo',brand:'Café'}),null);
});
