import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf("  $('#query').addEventListener('input'"), source.indexOf("  $('#homeQuery').addEventListener('focus'"));
function setup() {
  const elements = new Map();
  const rendered = [];
  const jobs = new Map();
  let next = 0, input;
  const $ = key => {
    if (!elements.has(key)) elements.set(key, {value:'', hidden:false, classList:{toggle(){}}, addEventListener(_, callback) {input=callback;}});
    return elements.get(key);
  };
  const context = vm.createContext({$, clean: value=>value.trim(), searchBrand:'Arcor', searchTimer:0, searchPlaceholderTimer:0, updateSearchScanAction(){}, startSearchPlaceholders(){}, renderResults:value=>rendered.push(value), window:{clearInterval(){}, clearTimeout:id=>jobs.delete(id), setTimeout:callback=>{jobs.set(++next,callback);return next;}}});
  vm.runInContext(handler, context);
  return {rendered, elements, context, type(value){$('#query').value=value;input();}, flush(){for(const callback of jobs.values()) callback();jobs.clear();}, jobs};
}
test('rapid typing and backspacing render only the final query after the input handler returns',()=>{
  const s=setup(); for(const value of ['aceite','aceit','acei','ace']) s.type(value);
  assert.deepEqual(s.rendered,[]);assert.equal(s.jobs.size,1);s.flush();assert.deepEqual(s.rendered,['ace']);
});
test('deleting the last letter cancels pending results and restores categories immediately',()=>{
  const s=setup();s.type('ace');s.type('');s.flush();assert.deepEqual(s.rendered,[]);assert.equal(s.elements.get('#results').hidden,true);assert.equal(s.elements.get('#searchCategories').hidden,false);
});
test('programmatically cleared query cannot be resurrected by an older scheduled render',()=>{
  const s=setup();s.type('aceite');s.elements.get('#query').value='';s.flush();assert.deepEqual(s.rendered,[]);
});
test('editing or clearing a query clears the exact-brand selection immediately',()=>{
 const s=setup();s.type('');assert.equal(s.context.searchBrand,'');
 s.context.searchBrand='Arcor';s.type('arcor');assert.equal(s.context.searchBrand,'');
});
