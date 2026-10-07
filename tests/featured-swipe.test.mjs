import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const start=source.indexOf("    recentTrack.querySelectorAll('[data-product]').forEach");
const code=source.slice(start,source.indexOf("    $('#recentProducts')",start));
for (const suppressed of [true,false]) test(suppressed ? 'Deslizar Destacados no abre una ficha por el listener delegado' : 'Un toque normal en Destacados abre exactamente una ficha',()=>{
  const {document,window}=parseHTML('<div id="track"><button data-product="a"><span>Producto</span></button></div>');
  const recentTrack=document.querySelector('#track');
  recentTrack.dataset.suppressClick=String(suppressed);
  const opened=[];
  vm.runInNewContext(code,{recentTrack,openDetail:url=>opened.push(url)});
  document.addEventListener('click',event=>{
    const product=event.target.closest('[data-product]');
    if(product)opened.push(product.dataset.product);
  });
  recentTrack.querySelector('span').dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));
  assert.deepEqual(opened,suppressed?[]:['a']);
});
