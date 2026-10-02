const {onRequest} = require('firebase-functions/v2/https');

const {officialTarget, fetchOfficial} = require('./official-proxy');
const ALLOWED_ORIGINS = [
  /^https:\/\/[^/]+\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
];

function originAllowed(origin) {
  return !origin || ALLOWED_ORIGINS.some((pattern) => pattern.test(origin));
}

exports.vaadProxy = onRequest({
  region: 'us-central1',
  timeoutSeconds: 30,
  memory: '256MiB',
  invoker: 'public'
}, async (request, response) => {
  const origin = String(request.get('Origin') || '');
  if (!originAllowed(origin)) {
    response.status(403).send('Origen no permitido');
    return;
  }
  response.set('Access-Control-Allow-Origin', origin || '*');
  response.set('Vary', 'Origin');
  response.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }
  if (request.method !== 'GET') {
    response.status(405).set('Allow', 'GET, OPTIONS').send('Método no permitido');
    return;
  }

  const requestedUrl = String(request.query.url || '');
  let target;
  try {
    target = officialTarget(requestedUrl);
  } catch (_) {
    response.status(400).send('URL inválida');
    return;
  }

  try {
    const upstream = await fetchOfficial(target.href);
    response.status(upstream.status);
    response.set('Cache-Control', 'public, max-age=60, s-maxage=300');
    response.set('Content-Type', upstream.contentType);
    response.send(upstream.body);
  } catch (_) {
    response.status(502).send('No se pudo consultar la fuente oficial');
  }
});
