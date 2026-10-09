import {Capacitor} from '@capacitor/core';
import {Filesystem, Directory, Encoding} from '@capacitor/filesystem';

export function offlineNetworkMayDownload(connection, allowMobile = false) {
  return connection.type !== 'none' && (allowMobile || ((connection.type === 'wifi' || connection.type === 'ethernet') && !connection.metered));
}

export function collectOfflineImages(...sources) {
  const urls = new Set();
  const visit = value => {
    if (typeof value === 'string' && /^https:\/\//.test(value) && /\.(?:jpe?g|png|webp|gif|svg)(?:[?#]|$)/i.test(value)) urls.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  sources.forEach(visit);
  return [...urls].sort();
}

// Fetch timestamps and cache bookkeeping do not change the offline content.
// Keep a compact, deterministic revision so refreshing the same catalog does
// not request a new download. This is a change detector, not a security hash.
export function offlineContentRevision(snapshot) {
  const normalize = value => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort()
      .filter(key => !['generatedAt', 'fetchedAt', 'bundled', 'sourceFingerprint'].includes(key))
      .map(key => [key, normalize(value[key])]));
  };
  const content = normalize({...snapshot, products:[...(snapshot.products || [])].sort((a,b) => String(a.url).localeCompare(String(b.url), 'en'))});
  const text = JSON.stringify(content);
  let first = 2166136261, second = 5381;
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ text.charCodeAt(index);
  }
  return `content-v1:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function createOfflineDownload(onChange = () => {}, background = null) {
  const native = Capacitor.isNativePlatform();
  const folder = 'offline-catalog';
  const manifestPath = `${folder}/manifest.json`;
  const cacheName = 'iht-offline-images-v1';
  let manifest = {images:{}, signature:''};
  let busy = false;
  let paused = false;
  let writes = Promise.resolve();
  let checkedTarget = null;
  let state = {busy:false, percent:0, ready:false, error:''};
  const emit = patch => {
    const changed = Object.entries(patch).some(([key,value]) => state[key] !== value);
    state = {...state, ...patch};
    if (changed) onChange(state);
  };
  const signature = (urls, version) => JSON.stringify([version, urls]);
  const save = () => writes = writes.catch(() => {}).then(async () => {
    if (native) await Filesystem.writeFile({path:manifestPath, directory:Directory.Data, encoding:Encoding.UTF8, data:JSON.stringify(manifest), recursive:true});
    else localStorage.setItem('iht_offline_manifest', JSON.stringify(manifest));
  });
  const init = async () => {
    try {
      const raw = native ? (await Filesystem.readFile({path:manifestPath, directory:Directory.Data, encoding:Encoding.UTF8})).data : localStorage.getItem('iht_offline_manifest');
      if (raw) manifest = JSON.parse(raw);
      if (!manifest.images || typeof manifest.images !== 'object') manifest = {images:{}, signature:''};
      if (native) {
        const files = (await Filesystem.readdir({path:folder, directory:Directory.Data})).files;
        const present = new Set(files.filter(file => file.size > 0).map(file => `${folder}/${file.name}`));
        for (const [url, item] of Object.entries(manifest.images)) if (!present.has(item.path)) delete manifest.images[url];
        // iOS may relocate the data container after an update or restore.
        // Rebuild URLs from durable relative paths, not yesterday's container.
        const {uri} = await Filesystem.getUri({path:folder, directory:Directory.Data});
        for (const item of Object.values(manifest.images)) {
          item.uri = Capacitor.convertFileSrc(`${uri.replace(/\/$/, '')}/${item.path.slice(folder.length + 1)}`);
        }
      } else {
        const cache = await caches.open(cacheName);
        for (const url of Object.keys(manifest.images)) {
          const response = await cache.match(url);
          if (!response) delete manifest.images[url];
          else manifest.images[url].uri = URL.createObjectURL(await response.blob());
        }
      }
    } catch (_) { manifest = {images:{}, signature:''}; }
  };
  const check = (urls, version) => {
    checkedTarget = {urls, version};
    const ready = manifest.signature === signature(urls, version) && urls.every(url => manifest.images[url]);
    state = {...state, ready, hasDownload:Boolean(manifest.signature) || Object.keys(manifest.images).length > 0};
    return state;
  };
  const localUrl = url => manifest.images[url]?.uri || url;
  const remoteUrl = uri => Object.entries(manifest.images).find(([,item]) => item.uri === uri)?.[0] || uri;
  const getResumePreference = () => ({
    enabled:manifest.resume?.enabled ?? (!manifest.signature && Object.keys(manifest.images).length > 0),
    allowMobile:Boolean(manifest.resume?.allowMobile),
    autoUpdate:manifest.resume?.autoUpdate ?? (Boolean(manifest.signature) && !state.paused)
  });
  const setResumePreference = async preference => {
    manifest.resume = {enabled:Boolean(preference.enabled), allowMobile:Boolean(preference.allowMobile),
      autoUpdate:preference.autoUpdate ?? getResumePreference().autoUpdate};
    if (background) await background.preference(manifest.resume);
    else await save();
  };
  const readSnapshot = async () => {
    try {
      const raw = native ? (await Filesystem.readFile({path:`${folder}/catalog.json`, directory:Directory.Data, encoding:Encoding.UTF8})).data : localStorage.getItem('iht_offline_catalog');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  };
  let refreshing = false;
  let generation = 0;
  const refresh = async () => {
    if (!background || refreshing || state.clearing) return state;
    const startedGeneration = generation;
    refreshing = true;
    try {
      const result = await background.status();
      if (generation !== startedGeneration) return state;
      if (result.manifest?.images) {
        manifest = result.manifest;
        for (const item of Object.values(manifest.images)) if (item.uri?.startsWith('file:')) item.uri = Capacitor.convertFileSrc(item.uri);
      }
      const {manifest:ignored, ...status} = result;
      // Native ready refers to its last job. The UI may now have newer content.
      if (checkedTarget) status.ready = manifest.signature === signature(checkedTarget.urls, checkedTarget.version)
        && checkedTarget.urls.every(url => manifest.images[url]);
      busy = Boolean(status.busy);
      emit(status);
    } catch (_) { /* Keep last known state during bridge reconnection. */ }
    finally {refreshing = false;}
    return state;
  };
  const pause = async () => {
    paused = true;
    if (background) {
      try {await background.pause(); await refresh();}
      catch (_) {emit({error:'No se pudo pausar · Reintentar'});}
    } else emit({paused:true});
  };
  const clear = async () => {
    if (busy || state.clearing) return false;
    generation++;
    emit({clearing:true});
    try {
      await writes.catch(() => {});
      await setResumePreference({enabled:false,autoUpdate:false,allowMobile:false});
      if (background) await background.clear();
      else if (native) await Filesystem.rmdir({path:folder, directory:Directory.Data, recursive:true});
      else {
        await caches.delete(cacheName);
        localStorage.removeItem('iht_offline_manifest');
        localStorage.removeItem('iht_offline_catalog');
        for (const item of Object.values(manifest.images)) if (item.uri?.startsWith('blob:')) URL.revokeObjectURL(item.uri);
      }
      manifest = {images:{},signature:'',resume:{enabled:false,autoUpdate:false,allowMobile:false}};
      checkedTarget = null;
      paused = false;
      emit({busy:false,clearing:false,ready:false,hasDownload:false,paused:false,waiting:false,percent:0,error:''});
      return true;
    } catch (_) { emit({clearing:false,error:'No se pudo borrar la descarga · Reintentar'}); return false; }
  };
  const download = async (urls, version, snapshot, canContinue = async () => true, wifiOnly = true) => {
    if (busy || state.clearing) return;
    if (background) {
      busy = true;
      emit({busy:true, paused:false, waiting:false, error:''});
      try {
        await background.start({urls, signature:signature(urls, version), snapshot, wifiOnly});
        await refresh();
      } catch (_) {busy = false; emit({busy:false, error:'No se pudo iniciar la descarga · Reintentar'});}
      return;
    }
    busy = true;
    paused = false;
    let done = urls.filter(url => manifest.images[url]).length;
    emit({busy:true, paused:false, ready:false, error:'', percent:Math.floor(done / Math.max(1,urls.length) * 99)});
    const queue = urls.filter(url => !manifest.images[url]);
    try {
      // Data directory is durable application storage, not Android's evictable cache.
      if (native) await Filesystem.writeFile({path:`${folder}/catalog.json`, directory:Directory.Data, encoding:Encoding.UTF8, data:JSON.stringify(snapshot), recursive:true});
      else localStorage.setItem('iht_offline_catalog', JSON.stringify(snapshot));
      const results = await Promise.allSettled(Array.from({length:3}, async () => {
        while (queue.length) {
          if (paused) return;
          if (!(await canContinue())) {pause(); return;}
          if (paused || !queue.length) return;
          const url = queue.shift();
          if (!manifest.images[url]) {
            if (native) {
              const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
              const name = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,'0')).join('');
              const extension = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|svg)$/i)?.[1] || 'jpg';
              const path = `${folder}/${name}.${extension}`;
              await Filesystem.downloadFile({url, path, directory:Directory.Data, recursive:true, connectTimeout:15000, readTimeout:30000});
              const stat = await Filesystem.stat({path, directory:Directory.Data});
              if (!stat.size) throw new Error('Imagen vacía');
              const {uri} = await Filesystem.getUri({path, directory:Directory.Data});
              const local = Capacitor.convertFileSrc(uri);
              await new Promise((resolve, reject) => {
                const image = new Image();
                const timer = setTimeout(() => reject(new Error('Tiempo de imagen agotado')), 15000);
                image.onload = () => {clearTimeout(timer); resolve();};
                image.onerror = () => {clearTimeout(timer); reject(new Error('Imagen inválida'));};
                image.src = local;
              });
              manifest.images[url] = {path, uri:local};
            } else {
              const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
              if (!response.ok) throw new Error('No se pudo descargar una imagen');
              const blob = await response.clone().blob();
              await (await caches.open(cacheName)).put(url, response);
              manifest.images[url] = {uri:URL.createObjectURL(blob)};
            }
            await save();
          }
          done++;
          emit({percent:Math.floor(done / Math.max(1, urls.length) * 99)});
        }
      }));
      if (paused) return;
      if (results.some(result => result.status === 'rejected')) throw new Error('Descarga incompleta');
      manifest.signature = signature(urls, version);
      await save();
      emit({ready:true, percent:100});
    } catch (_) {
      // Let workers finish before enabling retry; preserve completed downloads.
      emit({error:'Descarga incompleta. Revisá la conexión y el espacio disponible; tocá para reintentar.'});
    } finally {busy = false; emit({busy:false});}
  };
  return {init, check, download, localUrl, remoteUrl, readSnapshot, pause, clear, refresh, getResumePreference, setResumePreference};
}
