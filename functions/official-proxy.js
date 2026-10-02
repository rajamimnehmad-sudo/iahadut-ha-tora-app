const ALLOWED_HOSTS = new Set(['vaad.ar', 'www.vaad.ar']);
const MAX_BYTES = 5 * 1024 * 1024;

function officialTarget(value) {
  const target = new URL(value);
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname) || target.username || target.password || (target.port && target.port !== '443')) {
    throw new Error('Solo se permite consultar https://vaad.ar');
  }
  return target;
}

async function fetchOfficial(value, fetcher = fetch) {
  let target = officialTarget(value);
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const upstream = await fetcher(target, {
      redirect: 'manual', signal,
      headers: {Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'IahadutHaTora-Proxy/1.0'}
    });
    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      await upstream.body?.cancel();
      const location = upstream.headers.get('location');
      if (!location || redirects === 4) throw new Error('Redirección inválida');
      target = officialTarget(new URL(location, target).href);
      continue;
    }
    if (Number(upstream.headers.get('content-length')) > MAX_BYTES) {
      await upstream.body?.cancel();
      throw new Error('Respuesta demasiado grande');
    }
    const reader = upstream.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const {done, value: chunk} = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > MAX_BYTES) throw new Error('Respuesta demasiado grande');
          chunks.push(Buffer.from(chunk));
        }
      } catch (error) {
        await reader.cancel();
        throw error;
      } finally { reader.releaseLock(); }
    }
    return {status: upstream.status, contentType: upstream.headers.get('content-type') || 'text/html; charset=utf-8', body: Buffer.concat(chunks).toString('utf8')};
  }
}
module.exports = {officialTarget, fetchOfficial};
