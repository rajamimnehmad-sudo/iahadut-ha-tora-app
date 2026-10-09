import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function searchWordMatches('),source.indexOf('  function productMarkup('));
const products=[
 {url:'arcor',title:'Mermelada marca «Arcor»',brand:'Arcor',cat:'planta'},
 {url:'noel',title:'Mermelada marca «Noel»',brand:'Noel',cat:'planta'},
 {url:'tomate',title:'Puré de tomate marca «Noel»',brand:'Noel',description:'Sin azúcar agregada',cat:'planta'},
 {url:'sal',title:'Sal marina marca «Genser»',brand:'Genser',cat:'gondola'}
];
function search(query){
 const context=vm.createContext({query,products,normalize:value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),selectedRegion:'all',selectedCategory:'all',favoriteOnly:false,favorites:new Set(),productCategoryPath:()=>[],categoryDisplayName:x=>x,categoryFor:()=>({name:'',desc:''})});
 vm.runInContext(code,context);
 return Array.from(vm.runInContext('filtered(query)',context),product=>product.url);
}
test('brand prefixes do not match the middle of the generic word marca',()=>{
 assert.deepEqual(search('arc'),['arcor']);
 assert.deepEqual(search('arcor'),['arcor']);
 assert.deepEqual(search('mermelada arcor'),['arcor']);
});
test('search retains accents, descriptions, one-letter typing and typo tolerance',()=>{
 assert.deepEqual(search('pure tomate'),['tomate']);
 assert.deepEqual(search('azucar'),['tomate']);
 assert.deepEqual(search('mermelada arocr'),['arcor']);
 assert.ok(search('m').includes('arcor'));
 assert.deepEqual(search('inexistente'),[]);
});

test('Bamba respects country selection and remains discoverable in Uruguay and the complete catalog',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../web/data/catalog.json',import.meta.url),'utf8')).products;
 const context=vm.createContext({products:catalog,normalize:value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),selectedRegion:'argentina',selectedCategory:'all',favoriteOnly:false,favorites:new Set(),productCategoryPath:()=>[],categoryDisplayName:x=>x,categoryFor:()=>({name:'',desc:''})});
 vm.runInContext(code,context);
 assert.equal(vm.runInContext("filtered('bamba').some(p=>p.url.endsWith('/bamba-osem/'))",context),false);
 context.selectedRegion='all';
 assert.ok(vm.runInContext("filtered('bamba').some(p=>p.url.endsWith('/bamba-osem/'))",context));
 context.selectedRegion='uruguay';context.selectedCategory='uruguay';
 assert.ok(vm.runInContext("filtered('bamba').some(p=>p.url.endsWith('/bamba-osem/'))",context));
});
test('Cross-country hint preserves the current results and switches only on request',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../web/data/catalog.json',import.meta.url),'utf8')).products;
 let renderedQuery='';const query={value:'bamba'};
 const context=vm.createContext({products:catalog,normalize:value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),selectedRegion:'argentina',selectedCategory:'gondola',favoriteOnly:false,favorites:new Set(),productCategoryPath:()=>[],categoryDisplayName:x=>x,categoryFor:()=>({name:'',desc:''}),searchBrand:'',$:()=>query,renderSearchCategories:()=>{},renderResults:value=>{renderedQuery=value;},logAnalyticsEvent:()=>{}});
 vm.runInContext(code,context);
 const start=source.indexOf('  function otherRegionMatches('),end=source.indexOf('  function renderResults(',start);
 vm.runInContext(source.slice(start,end),context);
 const hint=vm.runInContext("otherRegionMatches('bamba')",context);
 assert.equal(hint.region,'uruguay');assert.ok(hint.count>0);
 assert.equal(context.selectedRegion,'argentina');assert.equal(vm.runInContext("filtered('bamba').length",context),0);
 vm.runInContext("showSearchRegion('uruguay')",context);
 assert.equal(context.selectedRegion,'uruguay');assert.equal(context.selectedCategory,'all');
 assert.equal(query.value,'bamba');assert.equal(renderedQuery,'bamba');
 assert.ok(vm.runInContext("filtered('bamba').length",context)>0);
 context.favoriteOnly=true;assert.equal(vm.runInContext("otherRegionMatches('bamba')",context),null);
 context.favoriteOnly=false;context.selectedRegion='all';assert.equal(vm.runInContext("otherRegionMatches('bamba')",context),null);
});
