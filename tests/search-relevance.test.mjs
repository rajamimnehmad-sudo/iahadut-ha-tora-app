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
