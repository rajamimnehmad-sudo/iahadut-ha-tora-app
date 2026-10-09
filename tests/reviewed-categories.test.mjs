import {catalogCategoryPath} from '../web/catalog-categories.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {reviewedCategoryPath} from '../web/reviewed-categories.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../web/data/catalog.json',import.meta.url))).products;
const reviewed=JSON.parse(fs.readFileSync(new URL('../web/data/reviewed-categories.json',import.meta.url)));
const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
test('all 1109 products have exactly the category paths approved in the live proposal',()=>{
  const expected=JSON.parse(execFileSync(process.execPath,['scripts/import-reviewed-categories.mjs'],{encoding:'utf8'}));
  assert.deepEqual(reviewed,expected);
  assert.equal(catalog.length,1109);
  assert.equal(Object.keys(reviewed.paths).length,1109);
  for(const product of catalog){
    const path=reviewedCategoryPath(product);
    assert.ok(path?.length,product.url);
    assert.ok(path.every(part=>typeof part==='string'&&part.trim()));
    assert.ok(!path.some(part=>['Cachaças','Otros destilados','Aguardientes','Surtidos de dietética','Dulces de fruta'].includes(part)));
  }
});
test('approved classification takes precedence over descriptions and remote rules',()=>{
  const block=source.slice(source.indexOf('  function productCategoryPaths('),source.indexOf('  function productCategoryPath('));
  const context={catalogCategoryPath,reviewedCategoryPath};vm.createContext(context);vm.runInContext(block,context);
  for(const product of catalog){
    const actual=context.productCategoryPaths({...product,description:'aceite de oliva carne vino harina presencia de insectos'});
    assert.equal(JSON.stringify(actual),JSON.stringify([reviewedCategoryPath(product)]));
  }
  assert.equal(reviewedCategoryPath({url:'https://vaad.ar/producto/nuevo-no-revisado/'}),null);
});
test('parent categories keep directly assigned products reachable beside child categories',()=>{
  const block=source.slice(source.indexOf('  function openTaxonomyPath('),source.indexOf('  function renderSearchCategories('));
  const parent=['Bebidas alcohólicas'];
  const items=catalog.filter(p=>reviewedCategoryPath(p)[0]===parent[0]);
  const expected=items.filter(p=>reviewedCategoryPath(p).length===1);
  assert.equal(expected.length,2);
  const elements=new Map();let rendered=[];let view='';
  const context={document:{querySelector:()=>({id:'categoryDirectoryView'})},taxonomyReturnView:'categoryDirectoryView',activeCategoryPath:[],categoryDirectory:()=>[['Vodkas',[]]],categoryDisplayName:s=>s,taxonomyRows:()=>'',productsAtPath:()=>items,productCategoryPaths:p=>[reviewedCategoryPath(p)],$:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);},renderProductCollection:(_,products)=>{rendered=products;},showView:id=>{view=id;}};
  vm.createContext(context);vm.runInContext(block,context);context.openTaxonomyPath(parent);
  assert.equal(view,'subcategoryDirectoryView');
  assert.equal(elements.get('#subcategoryDirectProductList').hidden,false);
  assert.deepEqual(rendered.map(p=>p.url).sort(),expected.map(p=>p.url).sort());
});

test('all current bars have their own category and Bamba remains a snack',()=>{
 const bars=catalog.filter(p=>/^barritas?\b/i.test(p.title.trim()));
 assert.equal(bars.length,25);
 for (const product of bars) assert.deepEqual(reviewedCategoryPath(product),['Barritas']);
 assert.deepEqual(reviewedCategoryPath(catalog.find(p=>p.url.endsWith('/bamba-osem/'))),['Snacks']);
});
