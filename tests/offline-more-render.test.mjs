import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

test('offline progress preserves the Waien logo, links and unrelated controls',()=>{
 const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
 const start=source.indexOf('  function renderMore('),end=source.indexOf('  async function openInfo(',start);
 const {document}=parseHTML('<div id="moreList"><div class="offline-download-item"></div><a class="developer-credit"><img alt="Waien" src="logo.png"></a><input value="conservar"></div>');
 const logo=document.querySelector('img'),credit=document.querySelector('a'),input=document.querySelector('input');
 let percent=0;let pauseButton;
 const context=vm.createContext({document,$:selector=>document.querySelector(selector),offlineAssets:()=>[],offlineVersion:()=>1,offlineWifiWait:false,offlineStarting:false,offlineDownload:{check:()=>({busy:true,percent})}});
 vm.runInContext(source.slice(start,end),context);
 for(percent=0;percent<=100;percent+=10){vm.runInContext('renderMore({offlineOnly:true})',context);const button=document.querySelector('[data-offline-pause]');if(pauseButton)assert.equal(button,pauseButton);pauseButton=button;assert.equal(document.querySelector('img'),logo);assert.equal(document.querySelector('a'),credit);assert.equal(document.querySelector('input'),input);assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),String(percent));}
});


test('preparing disables repeat taps without changing downloader state',()=>{
 const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
 const start=source.indexOf('  function renderMore('),end=source.indexOf('  async function openInfo(',start);
 const {document}=parseHTML('<div id="moreList"><div class="offline-download-item"></div></div>');
 const state={busy:false,percent:0};
 const context=vm.createContext({document,$:selector=>document.querySelector(selector),offlineAssets:()=>[],offlineVersion:()=>1,offlineWifiWait:false,offlineStarting:true,offlineDownload:{check:()=>state}});
 vm.runInContext(source.slice(start,end),context);
 vm.runInContext('renderMore({offlineOnly:true})',context);
 assert.equal(document.querySelector('[data-offline-download]').hasAttribute('disabled'),true);
 assert.equal(document.querySelector('[data-offline-pause]').hasAttribute('disabled'),true);
 assert.match(document.querySelector('small').textContent,/Preparando descarga/);
 assert.equal(state.busy,false);
});
