import test from 'node:test';
import assert from 'node:assert/strict';
import {additionKeys,unreadAdditionCount} from '../web/catalog-unread.js';
test('new-product badge counts unique additions, not removals or refreshes',()=>{
 const items={alta:[{text:'Producto A',url:'https://example.com/a'},{text:'Producto B',url:'https://example.com/b'},{text:'Producto A',url:'https://example.com/a'}],baja:[{text:'Producto C',url:'c'}]};
 const seen=new Set();assert.equal(unreadAdditionCount(items,seen),2);
 additionKeys(items).forEach(key=>seen.add(key));assert.equal(unreadAdditionCount(items,seen),0);
 const saved=new Set(JSON.parse(JSON.stringify([...seen])));
 assert.equal(unreadAdditionCount({...items,alta:[...items.alta,{text:'Producto D',url:'d'}]},saved),1);
});
test('empty and failed feeds never create unread products',()=>{
 assert.equal(unreadAdditionCount(null,new Set()),0);
 assert.equal(unreadAdditionCount({alta:['No hay productos nuevos']},new Set()),0);
});
