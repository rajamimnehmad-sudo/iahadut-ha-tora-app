import {validCategoryPath} from './catalog-categories.js';

export const PRESENTATION_REFRESH_MS = 15 * 60 * 1000;
const safeText = (value, max = 100) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max && !/[<>\u0000-\u001f]/.test(value);
const safeUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !/["'<>\\\s]/.test(value); } catch { return false; }
};
const textKeys = new Set(['homeTitle','welcomeTitle','welcomeDescription','catalogTitle','featuredTitle','usefulTitle']);
export function validatePresentation(value) {
  if (value?.schemaVersion !== 1 || !Number.isFinite(Date.parse(value.revision)) || !value.assets || !value.categories || Array.isArray(value.categories)) throw Error('Configuración de catálogo inválida');
  const assets = Object.entries(value.assets);
  if (assets.length > 256 || Object.keys(value.categories).length > 512) throw Error('Configuración demasiado grande');
  let size = 0;
  for (const [key, asset] of assets) {
    if (!/^[a-f0-9]{64}$/.test(key) || asset.sha256 !== key || !safeUrl(asset.url) || !/\.(png|webp|jpe?g)(?:[?#]|$)/i.test(asset.url) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 10 * 1024 * 1024) throw Error('Imagen remota inválida');
    size += asset.bytes;
  }
  if (size > 64 * 1024 * 1024) throw Error('Imágenes demasiado grandes');
  for (const [name, category] of Object.entries(value.categories)) {
    if (!validCategoryPath([name]) || !safeText(category.label || name) || (category.description !== undefined && !safeText(category.description, 600))) throw Error('Categoría remota inválida');
    const icon = category.icon;
    if (!icon) continue;
    if (!value.assets[icon.asset] || !['columns','rows','column','row'].every(k => Number.isSafeInteger(icon[k])) || icon.columns < 1 || icon.rows < 1 || icon.columns > 16 || icon.rows > 16 || icon.column < 0 || icon.column >= icon.columns || icon.row < 0 || icon.row >= icon.rows) throw Error('Recorte de icono inválido');
  }
  for (const [key, text] of Object.entries(value.texts || {})) if (!textKeys.has(key) || !safeText(text, 300)) throw Error('Texto remoto inválido');
  for (const [key, info] of Object.entries(value.categoryInformation || {})) {
    if (!/^[a-z][a-z0-9_-]{0,50}$/.test(key) || !safeText(info.title, 150) || !safeUrl(info.url) || !Array.isArray(info.paragraphs) || info.paragraphs.length > 12 || !info.paragraphs.every(p => safeText(p, 3000))) throw Error('Información de categoría inválida');
  }
  if (value.featuredProducts != null && (!Array.isArray(value.featuredProducts) || value.featuredProducts.length > 30 || new Set(value.featuredProducts).size !== value.featuredProducts.length || !value.featuredProducts.every(url => safeUrl(url) && url.startsWith('https://vaad.ar/producto/')))) throw Error('Destacados inválidos');
  const corrections = Object.entries(value.textCorrections || {});
  if (corrections.length > 256 || corrections.some(([from,to]) => !safeText(from,60) || !safeText(to,100))) throw Error('Correcciones de texto inválidas');
  const photos = Object.entries(value.productImages || {});
  if (photos.length > 4096 || photos.some(([url, key]) => !safeUrl(url) || !url.startsWith('https://vaad.ar/producto/') || !value.assets[key])) throw Error('Foto de producto inválida');
  return value;
}
export function iconBackground(icon) {
  return {size:icon.columns === 1 && icon.rows === 1 ? 'contain' : `${icon.columns * 100}% ${icon.rows * 100}%`, position:`${icon.columns === 1 ? 50 : icon.column * 100 / (icon.columns - 1)}% ${icon.rows === 1 ? 50 : icon.row * 100 / (icon.rows - 1)}%`};
}
export async function verifyImageBytes(bytes, asset) {
  if (bytes.byteLength !== asset.bytes) throw Error('Imagen incompleta');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== asset.sha256) throw Error('Imagen alterada');
}

// Apply metadata only after every referenced image is available offline.
// Dependency injection allows failure/restart tests without a browser.
export function createPresentationSync({bundled, bundledUrls, readState, writeState, readAsset, writeAsset, fetchManifest, fetchAsset, imageUrl, onChange = () => {}, now = Date.now}) {
  let current = validatePresentation(structuredClone(bundled)), urls = {...bundledUrls}, running = null, checkedAt = -Infinity;
  async function prepare(candidate) {
    const nextUrls = {};
    const referenced = new Set(Object.values(candidate.categories).map(c => c.icon?.asset).filter(Boolean));
    Object.values(candidate.productImages || {}).forEach(key => referenced.add(key));
    for (const key of referenced) {
      if (bundledUrls[key]) { nextUrls[key] = bundledUrls[key]; continue; }
      const asset = candidate.assets[key];
      let bytes = await readAsset(key);
      if (bytes) { try { await verifyImageBytes(bytes, asset); } catch { bytes = null; } }
      if (!bytes) { bytes = await fetchAsset(asset); await verifyImageBytes(bytes, asset); await writeAsset(key, bytes); }
      nextUrls[key] = imageUrl(key, bytes, asset);
    }
    return nextUrls;
  }
  const activate = (candidate, nextUrls) => {current = candidate; urls = nextUrls; onChange(candidate);};
  async function init() {
    try {
      const cached = validatePresentation(await readState());
      if (Date.parse(cached.revision) > Date.parse(bundled.revision)) activate(cached, await prepare(cached));
    } catch { /* Keep the complete bundled copy. */ }
    return current;
  }
  function refresh(force = false) {
    if (running) return running;
    if (!force && now() - checkedAt < PRESENTATION_REFRESH_MS) return Promise.resolve(false);
    checkedAt = now();
    running = (async () => {
      const candidate = validatePresentation(structuredClone(await fetchManifest()));
      if (Date.parse(candidate.revision) <= Date.parse(current.revision)) return false;
      const nextUrls = await prepare(candidate);
      await writeState(candidate);
      activate(candidate, nextUrls);
      return true;
    })().finally(() => {running = null;});
    return running;
  }
  return {init, refresh, current:() => current, photo:url => urls[current.productImages?.[url]] || null, icon:name => {
    const icon = current.categories[name]?.icon;
    return icon && urls[icon.asset] ? {...iconBackground(icon), url:urls[icon.asset]} : null;
  }};
}
