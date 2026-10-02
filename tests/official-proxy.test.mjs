import test from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../functions/official-proxy.js';
const {officialTarget, fetchOfficial} = proxy;

test('proxy rejects alternate hosts, protocols, credentials and ports', () => {
  for (const url of ['http://vaad.ar/', 'https://example.com/', 'https://vaad.ar.example.com/', 'https://user:pass@vaad.ar/', 'https://vaad.ar:444/']) assert.throws(() => officialTarget(url));
  assert.equal(officialTarget('https://www.vaad.ar/producto/a').hostname, 'www.vaad.ar');
});
test('proxy rejects off-host redirect before issuing another request', async () => {
  let calls = 0;
  await assert.rejects(fetchOfficial('https://vaad.ar/', async (_url, options) => {
    calls += 1;
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    return new Response(null, {status:302, headers:{location:'https://example.com/'}});
  }));
  assert.equal(calls, 1);
});
test('proxy follows a bounded relative redirect and preserves upstream status', async () => {
  const calls = [];
  const result = await fetchOfficial('https://vaad.ar/', async (url) => {
    calls.push(url.href);
    return calls.length === 1 ? new Response(null, {status:301, headers:{location:'/producto/a'}}) : new Response('Ficha', {status:200});
  });
  assert.deepEqual(calls, ['https://vaad.ar/', 'https://vaad.ar/producto/a']);
  assert.equal(result.body, 'Ficha');
  assert.equal(result.status, 200);
});
test('proxy stops redirect loops and oversized responses', async () => {
  let calls = 0;
  await assert.rejects(fetchOfficial('https://vaad.ar/', async () => { calls++; return new Response(null, {status:302, headers:{location:'/'}}); }));
  assert.equal(calls, 5);
  await assert.rejects(fetchOfficial('https://vaad.ar/', async () => new Response('large', {headers:{'content-length':String(6*1024*1024)}})));
  await assert.rejects(fetchOfficial('https://vaad.ar/', async () => new Response(new Uint8Array(6*1024*1024))));
});
