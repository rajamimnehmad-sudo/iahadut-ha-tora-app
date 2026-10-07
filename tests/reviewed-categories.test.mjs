import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {reviewedCategoryPath} from '../web/reviewed-categories.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../web/data/catalog.json',import.meta.url))).products;
const reviewed=JSON.parse(fs.readFileSync(new URL('../web/data/reviewed-categories.json',import.meta.url)));
const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
test('the approved 1109 classifications remain valid as the catalog grows',()=>{
  assert.equal(reviewed.reviewedAt,'2026-10-05');
  assert.equal(Object.keys(reviewed.paths).length,1109);
  for(const product of catalog.filter(p=>reviewedCategoryPath(p))){
    const path=reviewedCategoryPath(product);
    assert.ok(path?.length,product.url);
    assert.ok(path.every(part=>typeof part==='string'&&part.trim()));
    assert.ok(!path.some(part=>['Cachaças','Otros destilados','Aguardientes','Surtidos de dietética','Dulces de fruta'].includes(part)));
  }
});
test('approved classification takes precedence over descriptions and remote rules',()=>{
  const block=source.slice(source.indexOf('  function productCategoryPaths('),source.indexOf('  function productCategoryPath('));
  const context={reviewedCategoryPath};vm.createContext(context);vm.runInContext(block,context);
  for(const product of catalog.filter(p=>reviewedCategoryPath(p))){
    const actual=context.productCategoryPaths({...product,description:'aceite de oliva carne vino harina presencia de insectos'});
    assert.equal(JSON.stringify(actual),JSON.stringify([reviewedCategoryPath(product)]));
  }
  assert.equal(reviewedCategoryPath({url:'https://vaad.ar/producto/nuevo-no-revisado/'}),null);
});
test('parent categories keep directly assigned products reachable beside child categories',()=>{
  const block=source.slice(source.indexOf('  function openTaxonomyPath('),source.indexOf('  function renderSearchCategories('));
  const parent=['Bebidas alcohólicas'];
  const items=catalog.filter(p=>reviewedCategoryPath(p)?.[0]===parent[0]);
  const expected=items.filter(p=>reviewedCategoryPath(p).length===1);
  assert.equal(expected.length,2);
  const elements=new Map();let rendered=[];let view='';
  const context={document:{querySelector:()=>({id:'categoryDirectoryView'})},taxonomyReturnView:'categoryDirectoryView',activeCategoryPath:[],categoryDirectory:()=>[['Vodkas',[]]],categoryDisplayName:s=>s,taxonomyRows:()=>'',productsAtPath:()=>items,productCategoryPaths:p=>[reviewedCategoryPath(p)],$:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);},renderProductCollection:(_,products)=>{rendered=products;},showView:id=>{view=id;}};
  vm.createContext(context);vm.runInContext(block,context);context.openTaxonomyPath(parent);
  assert.equal(view,'subcategoryDirectoryView');
  assert.equal(elements.get('#subcategoryDirectProductList').hidden,false);
  assert.deepEqual(rendered.map(p=>p.url).sort(),expected.map(p=>p.url).sort());
});
