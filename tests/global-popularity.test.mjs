import test from 'node:test';
import assert from 'node:assert/strict';
import {productSearchKey, rankingFromReport, validGlobalRanking} from '../web/global-popularity.js';
const a='https://vaad.ar/producto/aceite/';const b='https://vaad.ar/producto/harina/';
test('global ranking uses measured search selections, sums counts, and excludes retired or unknown products',async()=>{
 const row=async(url,count)=>({dimensionValues:[{value:await productSearchKey(url)}],metricValues:[{value:String(count)}]});
 const ranking=await rankingFromReport({rows:[await row(a,2),await row(b,7),await row(a,3),await row('https://vaad.ar/producto/retirado/',500),await row(a,-1)]},[{url:a},{url:b}]);
 assert.deepEqual(ranking.products,[{url:b,searches:7},{url:a,searches:5}]);assert.equal(validGlobalRanking(ranking),true);
});
test('no recorded global searches cannot produce a fabricated global ranking',async()=>{
 const ranking=await rankingFromReport({rowCount:0},[{url:a}]);assert.deepEqual(ranking.products,[]);assert.equal(validGlobalRanking(ranking),true);
});
test('invalid published rankings are rejected before replacing the cache',async()=>{
 const good=await rankingFromReport({rowCount:0},[]);
 assert.equal(validGlobalRanking({...good,source:'local'}),false);
 assert.equal(validGlobalRanking({...good,products:[{url:'https://evil.test/',searches:20}]}),false);
 assert.equal(validGlobalRanking({...good,products:[{url:a,searches:0}]}),false);
 assert.equal(validGlobalRanking({...good,products:[{url:a,searches:2},{url:a,searches:3}]}),false);
});
test('catalog URLs produce stable identifiers within Analytics parameter limits',async()=>{
 const key=await productSearchKey(a);assert.match(key,/^[a-f0-9]{64}$/);assert.equal(key,await productSearchKey(a));assert.notEqual(key,await productSearchKey(b));
});
