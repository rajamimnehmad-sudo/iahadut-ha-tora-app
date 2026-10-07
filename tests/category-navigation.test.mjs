import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingCategories,navigationScrollKey,matchingBrands,brandName,brandKey,brandLogoMatches} from '../web/category-navigation.js';
test('search suggestions use the real complete taxonomy and deduplicate products',()=>{
 const items=[{url:'a',path:['Purés de tomate']},{url:'b',path:['Purés de tomate']},{url:'a',path:['Purés de tomate']},{url:'c',path:['Otros productos','Góndola']}];
 assert.deepEqual(matchingCategories(items,item=>[item.path],'puré de tomate'),[{path:['Purés de tomate'],count:2}]);
});
test('brand queries never suggest unrelated high-count categories',()=>{
 const items=[{url:'a',path:['Condimentos']},{url:'b',path:['Sales']},{url:'c',path:['Bebidas alcohólicas','Cervezas']}];
 assert.deepEqual(matchingCategories(items,item=>[item.path],'arc'),[]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'arcor'),[]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'sal'),[{path:['Sales'],count:1}]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'e'),[]);
});
test('broad oil suggestions group at the parent without losing specific searches',()=>{
 const items=[{url:'a',brand:'Arcor',path:['Aceites','Aceite de oliva']},{url:'b',brand:'Arcor',path:['Aceites','Otros aceites']},{url:'a',brand:'Arcor',path:['Aceites','Aceite de oliva']}];
 assert.deepEqual(matchingCategories(items,item=>[item.path],'ace'),[{path:['Aceites'],count:2}]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'aceite'),[{path:['Aceites'],count:2}]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'aceite arcor'),[{path:['Aceites'],count:2}]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'aceite oliva'),[{path:['Aceites','Aceite de oliva'],count:1}]);
 assert.deepEqual(items[1].path,['Aceites','Otros aceites']);
});
test('combined product and brand queries still suggest the actual category',()=>{
 const items=[{url:'a',brand:'«Arcor»',path:['Mermeladas']},{url:'b',brand:'«Arcor»',path:['Sales']}];
 assert.deepEqual(matchingCategories(items,item=>[item.path],'mermelada arcor'),[{path:['Mermeladas'],count:1}]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'arcor'),[]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'mermelada inexistente'),[]);
});
test('all nested categories use the shortest matching path, not an oil-specific exception',()=>{
 const items=[
  {url:'a',path:['Bebidas alcohólicas','Cervezas']},
  {url:'b',path:['Bebidas alcohólicas','Vinos']},
  {url:'c',path:['Harinas','Harinas de arroz']},
  {url:'d',path:['Harinas','Harinas de trigo']},
  {url:'e',path:['Aceites en aerosol']}
 ];
 assert.deepEqual(matchingCategories(items,item=>[item.path],'bebidas'),[{path:['Bebidas alcohólicas'],count:2}]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'cervezas'),[{path:['Bebidas alcohólicas','Cervezas'],count:1}]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'harinas'),[{path:['Harinas'],count:2}]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'harina arroz'),[{path:['Harinas','Harinas de arroz'],count:1}]);
 assert.deepEqual(matchingCategories(items,item=>[item.path],'aceite aerosol'),[{path:['Aceites en aerosol'],count:1}]);
});
test('brand suggestions wait for three letters and deduplicate quoted brand names',()=>{
 const items=[{url:'a',brand:'»Arcor»'},{url:'b',brand:'«Arcor»'},{url:'b',brand:'Arcor'},{url:'c',brand:'Noel'}];
 assert.deepEqual(matchingBrands(items,'a'),[]);
 assert.deepEqual(matchingBrands(items,'ar'),[]);
 assert.deepEqual(matchingBrands(items,'arc'),[{name:'Arcor',count:2}]);
 assert.equal(brandName(items[0]),'Arcor');
 assert.equal(brandKey('Cañuelas'),brandKey('canuelas'));
});
test('flavours do not create separate brands and existing logos match safely',()=>{
 assert.equal(brandName({brand:'»La parmesana» pimienta blanca molida'}),'La parmesana');
 assert.equal(brandName({brand:'«Noel»'}),'Noel');
 assert.equal(brandLogoMatches('La Parmesana','la parmesana'),true);
 assert.equal(brandLogoMatches('Pomona foods','pomona'),true);
 assert.equal(brandLogoMatches('Monda','monda_300x300'),true);
 assert.equal(brandLogoMatches('Marvavic','av'),false);
 assert.equal(brandLogoMatches('Planta certificada','Planta certificada'),false);
 assert.deepEqual(matchingBrands([{url:'a',brand:'»Karu» sabor mango'},{url:'b',brand:'»Karu» sabor hibiscus'}],'karu'),[{name:'Karu',count:2}]);
});
test('each nested directory keeps its own independent return position',()=>{
 assert.notEqual(navigationScrollKey('subcategoryDirectoryView',['Bebidas']),navigationScrollKey('subcategoryDirectoryView',['Aceites']));
 assert.equal(navigationScrollKey('categoryDirectoryView',['Purés de tomate']),'categoryDirectoryView');
 assert.equal(navigationScrollKey('searchView'),'searchView');
});
