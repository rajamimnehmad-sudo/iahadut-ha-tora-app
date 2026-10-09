import test from 'node:test';
import assert from 'node:assert/strict';
import {productSourceFingerprint, reusableProductDetail} from '../scripts/product-detail-policy.mjs';

const product={url:'https://vaad.ar/producto/test/',title:'Producto',image:'https://vaad.ar/test.jpg',cat:'gondola'};
const detail={textFormatVersion:1,images:[],description:''};
test('Complete legacy fiches migrate without mass network requests',()=>{
  assert.equal(reusableProductDetail(product,detail),true);
  assert.equal(reusableProductDetail(product,{textFormatVersion:1}),false);
});
test('Only changed or missing fiches require a request',()=>{
  const saved={...detail,sourceFingerprint:productSourceFingerprint(product)};
  assert.equal(reusableProductDetail({...product,fetchedAt:999},saved),true);
  assert.equal(reusableProductDetail({...product,image:'https://vaad.ar/new.jpg'},saved),false);
  assert.equal(reusableProductDetail({...product,title:'Corregido'},saved),false);
  assert.equal(reusableProductDetail(product,null),false);
  assert.equal(reusableProductDetail(product,saved,true),false);
});
