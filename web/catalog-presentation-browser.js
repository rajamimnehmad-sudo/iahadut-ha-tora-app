import {createPresentationSync} from './catalog-presentation.js';
const source = 'https://raw.githubusercontent.com/rajamimnehmad-sudo/iahadut-ha-tora-app/main/web/public/catalog-presentation.json';
const stateKey = 'iht_catalog_presentation_v1';
let database;
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('iht-category-images-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
async function assetStorage(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('images', value ? 'readwrite' : 'readonly');
    const store = transaction.objectStore('images');
    const request = value ? store.put(value, key) : store.get(key);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export function browserCatalogPresentation(bundled, onChange) {
  const objectUrls = new Map();
  const sync = createPresentationSync({
    bundled,
    bundledUrls:Object.fromEntries(Object.keys(bundled.assets).map(key => [key, `${import.meta.env.BASE_URL}category-icons/${key}.png`])),
    readState:() => JSON.parse(localStorage.getItem(stateKey) || 'null'),
    writeState:value => localStorage.setItem(stateKey, JSON.stringify(value)),
    readAsset:key => assetStorage(key), writeAsset:(key, value) => assetStorage(key, value),
    fetchManifest:async () => {
      const response = await fetch(import.meta.env.DEV ? '/catalog-presentation.json' : source, {cache:'no-cache', signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw Error('Configuración remota no disponible');
      const text = await response.text();
      if (text.length > 500000) throw Error('Configuración demasiado grande');
      return JSON.parse(text);
    },
    fetchAsset:async asset => {
      const response = await fetch(asset.url, {signal:AbortSignal.timeout(20000)});
      if (!response.ok || !/^image\/(png|jpeg|webp)(?:;|$)/.test(response.headers.get('content-type') || '')) throw Error('Imagen remota no disponible');
      const reader = response.body?.getReader();
      if (!reader) throw Error('Descarga de imagen no disponible');
      const chunks = []; let size = 0;
      try { for (;;) {const {done, value} = await reader.read(); if (done) break; size += value.byteLength; if (size > asset.bytes) throw Error('Imagen demasiado grande'); chunks.push(value);} }
      finally {await reader.cancel().catch(() => {});}
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
      return bytes.buffer;
    },
    imageUrl:(key, bytes, asset) => {
      if (!objectUrls.has(key)) objectUrls.set(key, URL.createObjectURL(new Blob([bytes], {type:/\.webp(?:[?#]|$)/i.test(asset.url) ? 'image/webp' : /\.jpe?g(?:[?#]|$)/i.test(asset.url) ? 'image/jpeg' : 'image/png'})));
      return objectUrls.get(key);
    }, onChange
  });
  return sync;
}
