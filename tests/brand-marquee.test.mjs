import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../web/theme.css', import.meta.url), 'utf8');
test('Al volver a Inicio la franja continúa en su posición temporal, no desde Noel', () => {
  const start = source.indexOf('  function resumeBrandMarquee()');
  const end = source.indexOf('  function showView(', start);
  let now = 16000;
  const values = {};
  const resume = vm.runInNewContext(`(${source.slice(start,end).trim()})`, {
    brandMarqueeStartedAt:1000, performance:{now:()=>now},
    document:{querySelector:()=>({style:{setProperty:(key,value)=>{values[key]=value;}}})}
  });
  resume(); assert.equal(values['--trusted-brands-delay'], '-15s');
  now = 31000; resume(); assert.equal(values['--trusted-brands-delay'], '-30s');
  assert.match(css, /animation-delay: var\(--trusted-brands-delay, 0s\)/);
  assert.match(source, /viewId === 'homeView' && !\$\('#homeView'\)\.classList\.contains\('active'\)/);
});
test('Todos los logos se preparan sin esperar a que entren en pantalla', () => {
  assert.match(source, /querySelectorAll\('\.trusted-brands-group img'\)\.forEach\(image => \{ image\.loading = 'eager'; \}\)/);
});
