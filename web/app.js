import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { APP_VERSION, accessDecision, defaultRemoteControl, loadRemoteControl } from './remote-control.js';
import { firebaseConfig } from './firebase-config.js';
import catalogSnapshot from './data/catalog.json';
import contentSnapshot from './data/content.json';
import productDetailsSnapshot from './data/product-details.json';
import '@phosphor-icons/web/regular';

const PlayStoreUpdates = registerPlugin('PlayStoreUpdates');
const CatalogBackgroundSync = registerPlugin('CatalogBackgroundSync');

const initialPreparationPreview = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'initial-load';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {scope: import.meta.env.BASE_URL}).catch(() => {}));
}

if (import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  let installPrompt;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const gate = document.querySelector('#installGate');
  const app = document.querySelector('.app');
  const installButton = document.querySelector('#installApp');
  const installHelp = document.querySelector('#installHelp');
  if (!standalone && gate && app) {
    gate.hidden = false;
    app.setAttribute('aria-hidden', 'true');
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
    });
    installButton?.addEventListener('click', async () => {
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        return;
      }
      if (installHelp) {
        installHelp.hidden = false;
        installHelp.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent)
          ? 'En Safari: Compartir → Agregar a pantalla de inicio.'
          : 'Usá el menú del navegador y elegí “Instalar aplicación” o “Agregar a pantalla de inicio”.';
      }
    });
  }
}

(async () => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  let searchFormHome;
  let searchPlaceholderTimer;
  let homePlaceholderTimer;
  let searchPlaceholderSwapTimer;
  let homePlaceholderSwapTimer;
  let searchFocusTimer;
  let searchCloseTimer;
  let searchCloseViewport;
  let searchCloseViewportHandler;
  let searchViewportBaseline = 0;
  const searchPlaceholders = ['Buscá un producto', 'Probá con una marca', 'Encontrá una categoría', 'Escaneá un código'];
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const productFallbackImage = 'assets/product-placeholder.svg';
  // Resolver el sello desde el módulo evita que una ruta relativa cambie
  // cuando la app corre dentro del WebView de Capacitor o con otra base URL.
  const shareLogoAssetUrl = new URL('./assets/logo.png', import.meta.url).href;
  const appInstallUrl = 'https://play.google.com/store/apps/details?id=ar.vaad.catalogo.app';
  const phoneNumbers = (value) => [...new Set((String(value || '').match(/(?:\+?54[\s.-]*9[\s.-]*)?11[\s.-]*(?:\d[\s.-]*){8}/g) || []).map((phone) => phone.replace(/\D/g, '')).map((digits) => digits.startsWith('549') ? digits : digits.startsWith('54') ? `549${digits.slice(2)}` : `549${digits}`))];

  function validGtin(value) {
    const code = String(value || '').replace(/\D/g, '');
    if (![8, 12, 13, 14].includes(code.length) || /^0+$/.test(code)) return '';
    let sum = 0;
    for (let index = code.length - 2, position = 0; index >= 0; index -= 1, position += 1) {
      sum += Number(code[index]) * (position % 2 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === Number(code.at(-1)) ? code : '';
  }

  const canonicalBarcode = (value) => validGtin(value);

  function prepareImage(image) {
    if (!(image instanceof HTMLImageElement) || image.matches('.logo, .whatsapp-logo, .whatsapp-tile img')) return;
    if (image.complete) {
      if (image.naturalWidth > 0) {
        image.classList.add('asset-ready');
        image.classList.remove('asset-loading', 'asset-error');
      } else {
        image.classList.remove('asset-loading', 'asset-ready');
        image.classList.add('asset-error');
      }
      return;
    }
    image.classList.add('asset-loading');
    image.classList.remove('asset-ready', 'asset-error');
  }

  document.addEventListener('load', (event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.target.classList.remove('asset-loading', 'asset-error');
    event.target.classList.add('asset-ready');
  }, true);
  document.addEventListener('error', (event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.target.classList.remove('asset-loading', 'asset-ready');
    event.target.classList.add('asset-error');
  }, true);
  const imageObserver = new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    if (node.matches('img')) prepareImage(node);
    node.querySelectorAll?.('img').forEach(prepareImage);
  })));
  imageObserver.observe(document.documentElement, {childList:true, subtree:true});
  document.querySelectorAll('img').forEach(prepareImage);
  document.addEventListener('selectstart', (event) => {
    event.preventDefault();
  }, true);
  document.addEventListener('dragstart', (event) => {
    event.preventDefault();
  }, true);
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  }, true);
  document.addEventListener('selectionchange', () => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (start !== null && end !== null && start !== end) active.blur();
    }
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  }, true);

  let categories = [
    {key:'gondola', name:'Autorizados en góndolas', short:'Góndolas', desc:'Productos de compra habitual', count:467, url:'https://vaad.ar/categoria-producto/productos-autorizados-en-gondola/'},
    {key:'planta', name:'Plantas certificadas', short:'Plantas', desc:'Elaborados bajo certificación', count:309, url:'https://vaad.ar/categoria-producto/productos-de-plantas-certificadas/'},
    {key:'especial', name:'Producción especial', short:'Prod. especial', desc:'Producciones supervisadas', count:69, url:'https://vaad.ar/categoria-producto/produccion-especial-kosher/'},
    {key:'uruguay', name:'Góndola Uruguay', short:'Uruguay', desc:'Productos disponibles en Uruguay', count:201, url:'https://vaad.ar/categoria-producto/productos-de-gondola-en-uruguay/'}
  ];
  const info = {
    shops:['Tiendas certificadas','Establecimientos que ofrecen productos certificados','Consultá los establecimientos que trabajan con productos bajo supervisión y certificación.','https://vaad.ar/tiendas-kosher-certificadas/'],
    catering:['Servicios de catering','Catering certificado y supervisado','Información para eventos y servicios de alimentación que requieren supervisión kosher.','https://vaad.ar/servicios-de-catering/'],
    notes:['Notas Kashrut','Información y contenidos sobre Kashrut','Material de consulta para conocer criterios, procesos y recomendaciones de Kashrut.','https://vaad.ar/notas-kashrut/'],
    world:['Certificaciones internacionales','Certificaciones kosher reconocidas','Información sobre organismos y certificaciones kosher reconocidas internacionalmente.','https://vaad.ar/certificaciones-kosher-mundiales/'],
    certify:['Certificá tu planta','El primer paso para expandir tu mercado','Información oficial sobre el proceso de certificación kosher.','https://vaad.ar/certifica-tu-planta/'],
    about:['Quiénes somos','Equipo Kosher Iahadut HaTora · Mehadrin Argentina','Un equipo dedicado a ofrecer información confiable y acompañar los procesos de certificación.','https://vaad.ar/quienes-somos/'],
    contact:['Contacto','Canales oficiales de atención','Para consultas generales, podés comunicarte con el equipo de Iahadut HaTora.','https://vaad.ar/contacto/'],
    collaboration:['Colaboración','Ayudá a sostener esta información','Datos oficiales para colaborar con el equipo Kosher.','https://vaad.ar/contacto/#colabora']
  };
  const seed = [
    {url:'https://vaad.ar/producto/aceite-de-girasol-marca-canuelas/',title:'Aceite de girasol marca Cañuelas',cat:'gondola',image:'https://arete.com.py/userfiles/images/productos/7792180001641.jpg',description:'Los aceites de girasol y oliva de marcas reconocidas de grandes productores como este, en Argentina no han presentado problemas de Kashrut.'},
    {url:'https://vaad.ar/producto/aceite-de-girasol-marca-natura/',title:'Aceite de girasol marca Natura',cat:'gondola',image:'https://acdn-us.mitiendanube.com/stores/005/651/909/products/1-0b66de4961c9b1880717532197495821-1024-1024.webp'},
    {url:'https://vaad.ar/producto/bebida-de-avena-marca-amande/',title:'Bebida de avena marca Amande',cat:'planta',image:'https://acdn-us.mitiendanube.com/stores/001/416/724/products/web-amande-avena-8c6526bd0016da30b317690105710312-640-0.webp'},
    {url:'https://vaad.ar/producto/barrita-marca-alnuna-sabor-almond-bar/',title:'Barrita marca Alnuna sabor almond bar',cat:'planta',image:'https://acdn-us.mitiendanube.com/stores/003/477/137/products/img_1078-a728f7488e2fed30c317610054351176-480-0.webp'},
    {url:'https://vaad.ar/producto/dulce-de-leche-marca-caranegra/',title:'Dulce de leche marca Caranegra',cat:'especial',image:'https://acdn-us.mitiendanube.com/stores/323/592/products/ducle-de-leche-cara-87b00f63e4d924238d17243488591790-1024-1024.webp'},
    {url:'https://vaad.ar/producto/aceite-de-oliva-extra-virgen-el-emigrante/',title:'Aceite de oliva extra virgen El Emigrante',cat:'uruguay',image:'https://simpleynatural.com.uy/wp-content/uploads/2022/07/Imagen-2024-05-23T193843.839.webp'}
  ];
  const readJson = (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (_) { return fallback; }
  };
  async function readNativeCatalogCache() {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
    try {
      const result = await CatalogBackgroundSync.readCache();
      const catalog = result?.catalog ? JSON.parse(result.catalog) : null;
      if (!Array.isArray(catalog?.products) || catalog.products.length < 900) return null;
      const productDetails = result.productDetails ? JSON.parse(result.productDetails) : null;
      const content = result.content ? JSON.parse(result.content) : null;
      return {catalog, productDetails, content};
    } catch (_) {
      return null;
    }
  }
  const nativeCatalogCache = await readNativeCatalogCache();
  const activeCatalogSnapshot = nativeCatalogCache?.catalog || catalogSnapshot;
  const activeContentSnapshot = nativeCatalogCache?.content || contentSnapshot;
  const activeProductDetailsSnapshot = nativeCatalogCache?.productDetails || productDetailsSnapshot;
  const storedProducts = readJson('iht_products');
  const bundledProducts = Array.isArray(activeCatalogSnapshot?.products) ? activeCatalogSnapshot.products : [];
  const bundledProductByUrl = new Map(bundledProducts.map((product) => [product.url, product]));
  const bundledProductDetails = activeProductDetailsSnapshot?.products || {};
  const productSource = Array.isArray(storedProducts) && storedProducts.length ? storedProducts : bundledProducts.length ? bundledProducts : seed;
  // Older cached catalogs could contain the site's internal data-product-id.
  // Keep only real GTIN/EAN/UPC values so those IDs can never be scanned as barcodes.
  let products = productSource.map((product) => ({...product, barcode:canonicalBarcode(product.barcode || bundledProductByUrl.get(product.url)?.barcode || bundledProductDetails[product.url]?.barcode)}));
  const storedFavorites = readJson('iht_favorites', []);
  const storedRecent = readJson('iht_recent', []);
  let recentProducts = readJson('iht_recent_products', []);
  let favorites = new Set(Array.isArray(storedFavorites) ? storedFavorites : []);
  let recent = Array.isArray(storedRecent) ? storedRecent : [];
  let popularity = readJson('iht_popularity', {});
  if (!popularity || typeof popularity !== 'object' || Array.isArray(popularity)) popularity = {};
  let globalPopularity = {};
  let globalPopularityDb = null;
  let globalPopularityApi = null;
  let firebaseCatalogDb = null;
  let firebaseCatalogApi = null;
  let firebaseReadyPromise = null;
  const popularityDocId = (key) => [...String(key)].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7).toString(36);
  async function getFirebaseCatalogApi() {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) return null;
    if (firebaseCatalogDb && firebaseCatalogApi) return {db:firebaseCatalogDb, api:firebaseCatalogApi};
    if (!firebaseReadyPromise) {
      firebaseReadyPromise = (async () => {
        const [{initializeApp, getApps}, authModule, firestoreModule] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
        const app = getApps()[0] || initializeApp(firebaseConfig);
        const auth = authModule.getAuth(app);
        if (!auth.currentUser) await authModule.signInAnonymously(auth);
        firebaseCatalogDb = firestoreModule.getFirestore(app);
        firebaseCatalogApi = firestoreModule;
        return {db:firebaseCatalogDb, api:firebaseCatalogApi};
      })().catch(() => null);
    }
    return firebaseReadyPromise;
  }
  async function loadGlobalPopularity() {
    try {
      const firebase = await getFirebaseCatalogApi();
      if (!firebase) return;
      globalPopularityDb = firebase.db;
      globalPopularityApi = firebase.api;
      const snapshot = await firebase.api.getDocs(firebase.api.query(firebase.api.collection(globalPopularityDb, 'product_popularity'), firebase.api.orderBy('score', 'desc'), firebase.api.limit(12)));
      globalPopularity = Object.fromEntries(snapshot.docs.map((doc) => [doc.data().productUrl, doc.data()]));
      renderSearchCategories();
    } catch (_) {}
  }
  let firebaseAnalytics = null;
  if (Capacitor.isNativePlatform()) import('@capacitor-firebase/analytics').then(({FirebaseAnalytics}) => { firebaseAnalytics = FirebaseAnalytics; }).catch(() => {});
  const logAnalyticsEvent = (name, params) => { try { firebaseAnalytics?.logEvent({name, params}); } catch (_) {} };
  const countPopularity = (key, type) => {
    const entry = popularity[key] || {searches: 0, opens: 0};
    entry[type] = (entry[type] || 0) + 1;
    popularity[key] = entry;
    localStorage.setItem('iht_popularity', JSON.stringify(popularity));
    if (globalPopularityDb && globalPopularityApi && !String(key).startsWith('query:')) {
      const product = products.find((item) => item.url === key);
      const ref = globalPopularityApi.doc(globalPopularityDb, 'product_popularity', popularityDocId(key));
      globalPopularityApi.runTransaction(globalPopularityDb, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists() ? snapshot.data() : {};
        transaction.set(ref, {productUrl:key, title:product?.title || key, image:product?.image || '', searches:Number(current.searches || 0) + (type === 'searches' ? 1 : 0), opens:Number(current.opens || 0) + (type === 'opens' ? 1 : 0), score:Number(current.score || 0) + 1, updatedAt:globalPopularityApi.serverTimestamp()}, {merge:true});
      }).catch(() => {});
    }
  };
  let selectedCategory = 'all';
  let selectedRegion = 'argentina';
  let favoriteOnly = false;
  let currentProduct = null;
  let previousView = 'homeView';
  let previousScrollTop = 0;
  let currentInfoKey = '';
  let shareBusy = false;
  const shareImageCache = new Map();
  let shareLogoPromise = null;
  let readerHistory = [];
  let stream = null;
  let scanFrame = 0;
  let pendingScanProduct = null;
  let kosherToastTimer = 0;
  let searchTimer = 0;
  let activeCategoryPath = [];
  const RESULT_BATCH_SIZE = 48;
  let visibleProducts = [];
  let visibleProductCursor = 0;
  let visibleProductTarget = null;
  let resultObserver = null;
  let recentCarouselTimer = null;
  let recentCarouselRebaseTimer = null;
  let recentCarouselOffset = 0;
  let renderedHomeItemsKey = '';
  let remoteControl = {...defaultRemoteControl, configured:false, checkedAt:0};
  let playUpdateState = {available:false, downloaded:false, flexibleAllowed:false, checked:false};
  let remoteTaxonomyRules = [];
  let pushListenersReady = false;
  const imageGesture = {scale:1, x:0, y:0, pointers:new Map(), startDistance:0, startScale:1};

  const categoryFor = (key) => categories.find((category) => category.key === key);
  const categoryCount = (category) => products.length > seed.length ? products.filter((product) => product.cat === category.key).length : category.count;
  const phosphorIcon = (name, className = 'category-icon', weight = 'regular') => `<i class="${weight === 'duotone' ? 'ph-duotone' : 'ph'} ph-${name} ${className}" aria-hidden="true"></i>`;
  const categoryIcon = (key) => {
    if (key === 'uruguay') return '<span class="category-icon category-flag"><img src="assets/flag-uruguay.svg" alt="Bandera de Uruguay"></span>';
    const paths = {
      all: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
      gondola: '<path d="M4 6h2l1.4 9.2a2 2 0 0 0 2 1.7h7.8a2 2 0 0 0 1.9-1.5L21 9H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
      planta: '<path d="M4 20h16M6 20V8h7v12M13 12h5v8M8.5 11h2M8.5 14h2M15.5 15h1"/>',
      especial: '<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z"/><path d="M19 3v3M17.5 4.5h3M5 17v3M3.5 18.5h3"/>',
      uruguay: '<path d="M5 21V4a8 8 0 0 1 10 0 8 8 0 0 0 4 0v13a8 8 0 0 1-4 0 8 8 0 0 0-10 0"/>'
    };
    return `<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[key] || paths.all}</svg>`;
  };
  const isUruguayProduct = (product) => product?.cat === 'uruguay' || product?.category === 'uruguay';
  const uruguayBadge = (product, className = 'product-region-badge') => isUruguayProduct(product)
    ? `<span class="${className}" role="img" aria-label="Producto de Uruguay">${categoryIcon('uruguay')}</span>`
    : '';
  const infoIcon = (key) => {
    const paths = {
      shops: '<path d="M6 4v7M4 4v4a2 2 0 0 0 4 0V4M6 11v9M14 4v16M14 4c3 0 4 2 4 5h-4"/>',
      catering: '<path d="M4 13h16M5 13c.7-4.2 3.1-6.5 7-6.5s6.3 2.3 7 6.5M3 13h18M5 13v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M12 4v2.5"/>',
      notes: '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
      history: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7M4 4v4.7h4.7M12 7v5l3 2"/>',
      world: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2 2 3 5 3 8s-1 6-3 8c-2-2-3-5-3-8s1-6 3-8Z"/>',
      certify: '<path d="M4 20V8l8-4 8 4v12M8 20v-6h8v6M3 20h18"/>',
      about: '<circle cx="12" cy="8" r="3"/><path d="M5 20c.8-3.2 3-5 7-5s6.2 1.8 7 5"/>',
      contact: '<path d="M5 5h14v11H9l-4 3zM8 9h8M8 12h5"/>',
      collaboration: '<path d="M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11Z"/>'
    };
    return `<svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[key] || paths.notes}</svg>`;
  };
  const bookmarkIcon = (filled = false) => `<svg class="bookmark-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z"${filled ? ' fill="currentColor"' : ''}/></svg>`;
  const save = () => { localStorage.setItem('iht_products', JSON.stringify(products)); localStorage.setItem('iht_favorites', JSON.stringify([...favorites])); };
  const totalCount = () => products.length > seed.length ? products.length : categories.reduce((total, category) => total + category.count, 0);
  const bundledSyncTime = activeCatalogSnapshot?.generatedAt ? Date.parse(activeCatalogSnapshot.generatedAt) : 0;
  const syncState = {running:false, last:localStorage.getItem('iht_last_sync') || '', error:''};
  const CACHE_TTL = 12 * 60 * 60 * 1000;
  const INFO_CACHE_VERSION = 36;
  const INITIAL_PRELOAD_KEY = `iht_initial_preload_${INFO_CACHE_VERSION}`;
  const storedInfoCache = readJson('iht_info_cache');
  const infoCache = storedInfoCache?.version === INFO_CACHE_VERSION ? (storedInfoCache.items || {}) : (activeContentSnapshot?.info || {});
  const storedCardCache = readJson('iht_card_cache');
  const cardCache = storedCardCache?.version === INFO_CACHE_VERSION ? (storedCardCache.items || {}) : (activeContentSnapshot?.cards || {});
  const storedProductCache = readJson('iht_product_cache');
  const productCache = {...bundledProductDetails, ...(storedProductCache?.version === INFO_CACHE_VERSION ? (storedProductCache.items || {}) : {})};
  const alertUrl = 'https://vaad.ar/alertas-de-productos/';
  const storedAlertCache = readJson('iht_alert_cache');
  let alertCache = storedAlertCache?.version === INFO_CACHE_VERSION ? storedAlertCache : (activeContentSnapshot?.alerts ? {version:INFO_CACHE_VERSION, items:activeContentSnapshot.alerts, fetchedAt:Number(activeContentSnapshot.generatedAt) || 0} : null);
  const pushNotificationKey = (item) => {
    const eventKey = clean(item?.eventKey || item?.data?.eventKey);
    if (eventKey) return `event:${eventKey}`;
    const id = clean(item?.id || item?.data?.messageId);
    if (id) return `id:${id}`;
    return `legacy:${clean(item?.title)}|${clean(item?.body)}|${clean(item?.url)}|${clean(item?.time)}`;
  };
  const dedupePushNotifications = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = pushNotificationKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  let pushNotifications = readJson('iht_push_notifications', []);
  if (!Array.isArray(pushNotifications)) pushNotifications = [];
  pushNotifications = dedupePushNotifications(pushNotifications).slice(0, 30);
  const assetCacheKey = `iht_asset_cache_${INFO_CACHE_VERSION}`;
  const storedAssetCache = readJson(assetCacheKey, []);
  const assetCache = new Set(Array.isArray(storedAssetCache) ? storedAssetCache : []);
  let preloadStarted = false;
  const activeCatalogTimestamp = activeCatalogSnapshot?.generatedAt ? Date.parse(activeCatalogSnapshot.generatedAt) : 0;
  const storedCatalogTimestamp = Number(localStorage.getItem('iht_catalog_generated_at') || 0);
  if (activeCatalogTimestamp > storedCatalogTimestamp) localStorage.setItem('iht_catalog_generated_at', String(activeCatalogTimestamp));
  // Una instalación nueva puede usar la instantánea incluida como baseline.
  // Si ya existe un catálogo local, primero se reconcilia con Firebase para
  // no confundir una copia anterior con la versión empaquetada.
  if (!localStorage.getItem('iht_catalog_version') && !(Array.isArray(storedProducts) && storedProducts.length) && activeCatalogSnapshot?.generatedAt) {
    localStorage.setItem('iht_catalog_version', String(activeCatalogSnapshot.generatedAt));
  }
  const infoNoticeVersion = 'v3';
  const infoNoticeKeys = ['shops', 'catering', 'notes'];
  const infoNewState = Object.fromEntries(infoNoticeKeys.map((key) => [
    key,
    // La novedad se muestra por defecto hasta que se abre esa sección.
    !localStorage.getItem(`iht_info_seen_${key}_${infoNoticeVersion}`)
  ]));

  function infoContentSignature(content) {
    if (!content) return '';
    const {fetchedAt, ...stableContent} = content;
    return JSON.stringify(stableContent);
  }

  function updateInfoNotice(key, isNew = infoNewState[key] === true) {
    if (!infoNoticeKeys.includes(key)) return;
    infoNewState[key] = isNew;
    localStorage.setItem(`iht_info_new_${key}_${INFO_CACHE_VERSION}`, isNew ? '1' : '0');
    document.querySelectorAll(`[data-info="${key}"]`).forEach((button) => {
      button.classList.toggle('has-info-new', isNew);
      button.querySelector('.info-new-dot')?.remove();
    });
  }

  function markInfoSeen(key) {
    if (!infoNoticeKeys.includes(key)) return;
    updateInfoNotice(key, false);
    const signature = infoContentSignature(infoCache[key]);
    if (signature) localStorage.setItem(`iht_info_seen_${key}_${infoNoticeVersion}`, signature);
  }

  function syncMessage(message, tone = '') {
    const status = $('#syncStatus');
    status.className = `sync update-row ${tone}`;
    $('#syncMessage').textContent = message;
  }

  function lastSyncMessage() {
    if (!syncState.last) return 'Todavía no sincronizada';
    const date = new Date(Number(syncState.last));
    return `${date.toLocaleDateString('es-AR')} · ${date.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})}`;
  }

  function officialUpdateMessage() {
    return localStorage.getItem('iht_official_update') || catalogSnapshot?.officialUpdate || 'Consultando fuente oficial…';
  }

  function sourceUrl(url) {
    if (Capacitor.isNativePlatform()) return url;
    const local = location.port === '5173' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    if (!local) {
      const encoded = encodeURIComponent(url);
      // Firebase is the primary public proxy. The Supabase URL remains a
      // temporary fallback until the function is deployed everywhere.
      return [
        `https://us-central1-iahadut-hatora.cloudfunctions.net/vaadProxy?url=${encoded}`,
        `https://syeycayasyufedwoprea.supabase.co/functions/v1/iahadut-demo/proxy?url=${encoded}`
      ];
    }
    const parsed = new URL(url);
    return `/vaad-api${parsed.pathname}${parsed.search}`;
  }

  function isFresh(value) {
    return Boolean(value?.fetchedAt && Date.now() - Number(value.fetchedAt) < CACHE_TTL);
  }

  async function fetchText(url) {
    let lastError;
    const candidates = Array.isArray(url) ? url : [url];
    for (const candidate of candidates) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          if (Capacitor.isNativePlatform()) {
            const response = await CapacitorHttp.get({url:candidate, responseType:'text', headers:{Accept:'text/html'}});
            if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
            return String(response.data || '');
          }
          const response = await fetch(candidate, {cache:'no-store', headers:{Accept:'text/html'}});
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        } catch (error) {
          lastError = error;
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error('No se pudo descargar el contenido');
  }

  function productEntries(html, category) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const entries = [];
    document.querySelectorAll('a[href*="/producto/"]').forEach((link) => {
      const url = new URL(link.getAttribute('href'), category.url).href.split('#')[0];
      if (!url.includes('/producto/')) return;
      let container = link;
      for (let index = 0; index < 8 && container; index += 1) {
        if (container.matches && container.matches('li.product, article.product, .product-item, .jet-listing-grid__item, .e-loop-item')) break;
        container = container.parentElement;
      }
      const titleNode = container && container.querySelector('h1,h2,h3,h4,h5,.woocommerce-loop-product__title,.product-title');
      const title = clean((titleNode || link).textContent).replace(/leer más/ig, '').trim();
      if (!title || title.length < 2) return;
      const imageNode = container && container.querySelector('img');
      const image = imageNode && (imageNode.getAttribute('data-src') || imageNode.getAttribute('data-lazy-src') || imageNode.getAttribute('src'));
      const barcodeNode = container && container.querySelector('[data-barcode],[data-ean],[data-gtin],[data-upc]');
      const rawBarcode = [
        container?.getAttribute('data-barcode'),
        container?.getAttribute('data-ean'),
        container?.getAttribute('data-gtin'),
        container?.getAttribute('data-upc'),
        barcodeNode?.getAttribute('data-barcode'),
        barcodeNode?.getAttribute('data-ean'),
        barcodeNode?.getAttribute('data-gtin'),
        barcodeNode?.getAttribute('data-upc')
      ].find(Boolean);
      const brandMatch = title.match(/marca\s+(.+)$/i);
      entries.push({url, title, brand:brandMatch ? clean(brandMatch[1]) : '', barcode:canonicalBarcode(rawBarcode), cat:category.key, image:image ? new URL(image, category.url).href : '', description:''});
    });
    return entries;
  }

  function catalogTotal(html) {
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
    const match = text.match(/de\s+([\d.]+)\s+resultados/i);
    return match ? Number(match[1].replace(/\./g, '')) : 0;
  }

  async function fetchCatalogPage(url) {
    return fetchText(sourceUrl(url));
  }

  async function fetchOfficialUpdateDate() {
    const html = await fetchCatalogPage('https://vaad.ar/');
    const match = html.match(/Última actualización del catálogo:\s*<strong[^>]*>\s*([^<]+?)\s*<\/strong>/i) || html.match(/Última actualización del catálogo:\s*([^<\s][^<]*)/i);
    return clean(match?.[1] || '');
  }

  async function fetchInfoContent(key) {
    const value = info[key];
    if (!value) return '';
    if (isFresh(infoCache[key])) return infoCache[key];
    const previousSignature = infoContentSignature(infoCache[key]);
    const document = new DOMParser().parseFromString(await fetchText(sourceUrl(value[3])), 'text/html');
    const certifyContent = key === 'certify' ? (() => {
      const introRoot = document.querySelector('.et_pb_text_1 .et_pb_text_inner');
      const steps = [...document.querySelectorAll('.et_pb_blurb_container')].map((node) => ({title:clean(node.querySelector('.et_pb_module_header')?.textContent), text:clean(node.querySelector('.et_pb_blurb_description p')?.textContent)})).filter((step) => step.title && step.text && /evaluaci[oó]n inicial|ajustes necesarios|supervisi[oó]n continua/i.test(step.title));
      return {
        subtitle:clean(document.querySelector('.et_pb_text_0 p')?.textContent),
        introTitle:clean(introRoot?.querySelector('h2')?.textContent),
        introText:clean(introRoot?.querySelector('p')?.textContent),
        steps
      };
    })() : null;
    const collaborationContent = key === 'collaboration' ? {
      text:clean(document.querySelector('#colabora .et_pb_text_inner')?.textContent),
      bank:clean(document.querySelector('.et_pb_icon_list_4 .et_pb_icon_list_text')?.textContent)
    } : null;
    const footerText = clean([...document.querySelectorAll('footer')].map((node) => node.textContent).join(' '));
    const cardLinks = {};
    [...document.querySelectorAll('script')].forEach((script) => {
      const match = script.textContent.match(/diviElementLinkData\s*=\s*(\[[\s\S]*?\]);/);
      if (!match) return;
      try { JSON.parse(match[1]).forEach((item) => { if (item.class && item.url) cardLinks[item.class] = item.url; }); } catch (_) {}
    });
    document.querySelectorAll('script,style,noscript,nav,header,footer,form').forEach((node) => node.remove());
    const contentRoot = document.querySelector('#main-content .et_builder_inner_content, .entry-content, main, article, #main-content') || document.body;
    const nodes = [...contentRoot.querySelectorAll('h1, h2, h3, h4, h5, p, li, blockquote, address, .et_pb_toggle_title')];
    const seen = new Set();
    const blocks = nodes.map((node) => ({tag:node.tagName.toLowerCase(), text:clean(node.textContent)})).filter((block) => {
      if (block.text.length <= 4 || /menu|buscar|leer más|ver imagen completa|abrir chat|todos los derechos/i.test(block.text) || seen.has(block.text)) return false;
      seen.add(block.text);
      return true;
    });
    // Algunas páginas oficiales de Divi guardan las tarjetas fuera de main/article.
    // Buscar el marcador en todo el documento evita perderlas y mostrar solo una
    // secuencia de imágenes sueltas.
    const cardNodes = [...document.querySelectorAll('[data-loop-item]')];
    const cards = cardNodes.map((node) => {
      const imageNode = node.querySelector('img');
      const titleNode = node.querySelector('h1,h2,h3,h4,h5,.et_pb_module_header,strong');
      const rawImage = imageNode && (imageNode.getAttribute('src') || imageNode.getAttribute('data-src') || imageNode.getAttribute('data-lazy-src'));
      const title = clean(titleNode?.textContent || '');
      if (!rawImage || title.length < 2) return null;
      const description = clean(node.textContent).replace(title, '').trim();
      const classes = [node, ...node.querySelectorAll('[class]')].flatMap((element) => String(element.className || '').split(/\s+/));
      const linkedCard = classes.map((className) => cardLinks[className]).find(Boolean) || node.querySelector('a[href]')?.getAttribute('href') || '';
      return {title, description, image:new URL(rawImage, value[3]).href, url:linkedCard ? new URL(linkedCard, value[3]).href : '', alt:clean(imageNode.getAttribute('alt') || imageNode.getAttribute('title') || title)};
    }).filter(Boolean).filter((card, index, all) => all.findIndex((candidate) => candidate.title.toLowerCase() === card.title.toLowerCase() && candidate.image === card.image) === index).slice(0, 24);
    const images = [...contentRoot.querySelectorAll('img')].map((image) => ({src:image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src'), alt:clean(image.getAttribute('alt') || image.getAttribute('title') || value[0])})).filter((image) => image.src).map((image) => ({...image, src:new URL(image.src, value[3]).href})).filter((image, index, all) => all.findIndex((candidate) => candidate.src === image.src) === index);
    const orderedSeen = new Set();
    const elements = [...contentRoot.querySelectorAll('h1, h2, h3, h4, h5, p, li, blockquote, address, img')].map((node) => {
      if (node.matches('img')) {
        const rawImage = node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-lazy-src');
        if (!rawImage) return null;
        return {type:'image', src:new URL(rawImage, value[3]).href, alt:clean(node.getAttribute('alt') || node.getAttribute('title') || value[0])};
      }
      return {type:node.tagName.toLowerCase().startsWith('h') ? 'heading' : 'text', tag:node.tagName.toLowerCase(), text:clean(node.textContent)};
    }).filter((element) => {
      const identity = element.type === 'image' ? `image:${element.src}` : `${element.type}:${element.text}`;
      if (!element.text && element.type !== 'image') return false;
      if (element.type !== 'image' && (element.text.length <= 4 || /menu|buscar|leer más|ver imagen completa|abrir chat|todos los derechos/i.test(element.text))) return false;
      if (orderedSeen.has(identity)) return false;
      orderedSeen.add(identity);
      return true;
    });
    const pageText = clean(document.body.textContent);
    const contactText = key === 'contact' ? `${pageText} ${footerText}` : pageText;
    const actions = [];
    const addAction = (label, href, kind) => {
      if (!href || actions.some((action) => normalize(action.href) === normalize(href) || normalize(action.label) === normalize(label))) return;
      actions.push({label, href, kind});
    };
    const extractedEmails = (contactText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
      .map((email) => email.replace(/(?:whatsapp|tel[eé]fono|celular).*$/i, ''))
      .filter((email) => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,8}$/i.test(email));
    [...new Set(extractedEmails)].forEach((email) => addAction(email, `mailto:${email}`, 'email'));
    const phoneMatches = [...new Set(contactText.match(/\+54\s*9\s*11\s*\d{4}[-\s]\d{4}/g) || [])];
    phoneMatches.forEach((phone, index) => {
      const digits = phone.replace(/\D/g, '');
      addAction(index === 0 ? 'WhatsApp Secretaría' : 'Administrador Mijael Churba', `https://wa.me/${digits}`, 'whatsapp');
    });
    if (key === 'contact') [...document.querySelectorAll('a[href]')].forEach((link) => {
      const href = link.getAttribute('href') || '';
      const label = clean(link.textContent);
      if (/^mailto:/i.test(href)) {
        const email = href.replace(/^mailto:/i, '').split('?')[0].replace(/(?:whatsapp|tel[eé]fono|celular).*$/i, '');
        if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,8}$/i.test(email)) addAction(email, `mailto:${email}`, 'email');
      } else if (/^(tel:|https:\/\/wa\.me\/|https:\/\/chat\.whatsapp\.com\/)/i.test(href)) {
        addAction(/chat\.whatsapp\.com/i.test(href) ? 'Lista de difusión kosher' : label || 'WhatsApp', href, 'whatsapp');
      }
    });
    if (key === 'contact') Object.values(cardLinks).filter((href) => /chat\.whatsapp\.com/i.test(href)).forEach((href) => addAction('Lista de difusión kosher', href, 'whatsapp'));
    const address = key === 'contact' ? contactText.match(/Comunidad Jafetz Jaim:\s*Ecuador\s+920\s+CABA/i)?.[0] : '';
    if (address && !blocks.some((block) => block.text.includes('Ecuador 920'))) blocks.push({tag:'p', text:address});
    const cardActionLabel = key === 'world' ? 'Ver sellos autorizados' : key === 'catering' ? 'Ver datos y contacto' : key === 'shops' ? 'Ver datos del local' : 'Ver información';
    const indexedCards = key === 'world' ? [...cards].sort((a, b) => a.title.localeCompare(b.title, 'es', {sensitivity:'base'})) : cards;
    const result = {section:key, blocks:blocks.length ? blocks : (indexedCards.length ? [] : [{tag:'p', text:'No hay contenido oficial disponible.'}]), elements, cards:indexedCards, images, actions, cardActionLabel, contact:key === 'contact', collaboration:collaborationContent, certify:certifyContent, fetchedAt:Date.now()};
    infoCache[key] = result;
    localStorage.setItem('iht_info_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:infoCache}));
    const seenSignature = localStorage.getItem(`iht_info_seen_${key}_${infoNoticeVersion}`);
    if (previousSignature && previousSignature !== infoContentSignature(result) && seenSignature !== infoContentSignature(result)) updateInfoNotice(key, true);
    return result;
  }

  function sanitizeOfficialText(value) {
    return clean(String(value || '').replace(/\\x19/gi, '’').replace(/[\u0000-\u001F\u007F\uE000-\uF8FF]/g, ' ').replace(/[→➜➝➞⟶›▶►]+/g, ' ').replace(/»([^»]+)»/g, '«$1»'));
  }

  function isStandaloneContact(value) {
    const text = sanitizeOfficialText(value);
    const compact = text.replace(/\s/g, '');
    if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(text)) return true;
    if (/^(?:\+?\d[\d\s().-]{7,}\d)$/.test(text) || /^\d{8,13}$/.test(compact)) return true;
    return /^(?:correo|email|e-mail|whatsapp|tel[eé]fono|celular|ver en google maps|ubicaci[oó]n)(?:\s*:.*)?$/i.test(text);
  }

  function infoFlowMarkup(elements, hasContactActions = false) {
    const output = [];
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      if (element.type === 'image') { output.push(`<img class="info-photo info-flow-photo asset-loading" src="${escapeHtml(element.src)}" alt="${escapeHtml(element.alt)}" loading="lazy" onerror="this.remove()">`); continue; }
      const text = sanitizeOfficialText(element.text);
      if (!text || (hasContactActions && isStandaloneContact(text))) continue;
      if (element.type === 'heading' && (text.includes('?') || text.startsWith('¿'))) {
        const answers = [];
        let answerIndex = index + 1;
        while (elements[answerIndex]?.type === 'text') { const answer = sanitizeOfficialText(elements[answerIndex].text); if (answer && !(hasContactActions && isStandaloneContact(answer))) answers.push(`<p>${escapeHtml(answer)}</p>`); answerIndex += 1; }
        output.push(`<details class="info-faq"><summary>${escapeHtml(text)}<span aria-hidden="true">+</span></summary>${answers.join('')}</details>`);
        index = answerIndex - 1;
        continue;
      }
      output.push(element.type === 'heading' ? `<h3>${escapeHtml(text)}</h3>` : `<p>${escapeHtml(text)}</p>`);
    }
    return output.join('');
  }

  function countryFlag(title) {
    const name = normalize(title);
    const uruguay = '<svg class="country-flag-svg" viewBox="0 0 36 36" aria-hidden="true"><defs><clipPath id="uyFlagClip"><circle cx="18" cy="18" r="16"/></clipPath></defs><circle cx="18" cy="18" r="16" fill="#fff"/><g clip-path="url(#uyFlagClip)"><rect width="36" height="36" fill="#fff"/><path d="M0 6h36v4H0zM0 14h36v4H0zM0 22h36v4H0zM0 30h36v4H0z" fill="#69aaca"/><rect width="18" height="18" fill="#fff"/><circle cx="9" cy="9" r="3.3" fill="#f4c542"/><path d="M9 3.7v2M9 12.3v2M3.7 9h2M12.3 9h2M5.25 5.25l1.4 1.4M11.35 11.35l1.4 1.4M12.75 5.25l-1.4 1.4M6.65 11.35l-1.4 1.4" stroke="#c28c2d" stroke-width=".8" stroke-linecap="round"/></g><circle cx="18" cy="18" r="16" fill="none" stroke="#dce5df" stroke-width="1.2"/></svg>';
    const flags = [['uruguay', uruguay], ['fran', '🇫🇷'], ['panam', '🇵🇦'], ['belg', '🇧🇪'], ['brasil', '🇧🇷'], ['mexic', '🇲🇽'], ['estados unidos', '🇺🇸'], ['inglaterra', '🇬🇧'], ['israel', '🇮🇱']];
    return flags.find(([key]) => name.includes(key))?.[1] || '';
  }

  function certifyStepIcon(title) {
    const name = normalize(title);
    const paths = name.includes('evaluacion') ? '<path d="M4 20h16M6 20V9h12v11M9 9V5h6v4M9 13h6M9 16h4"/>' : name.includes('ajustes') ? '<path d="M4 7h10M17 7h3M4 17h3M10 17h10M14 4v6M7 14v6"/>' : '<path d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Z"/><circle cx="12" cy="12" r="2.5"/>';
    return `<svg class="certify-step-icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  }

  function certifyMarkup(content) {
    const data = content.certify;
    if (!data?.introTitle || !data?.introText || !data?.steps?.length) return '';
    const steps = data.steps.map((step, index) => `<article class="certify-step"><span class="certify-step-number">${index + 1}</span><span class="certify-step-visual">${certifyStepIcon(step.title)}</span><div><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p></div></article>`).join('');
    return `<section class="certify-intro">${data.subtitle ? `<p class="certify-subtitle">${escapeHtml(data.subtitle)}</p>` : ''}<div class="certify-explainer"><span class="certify-shield" aria-hidden="true">✓</span><div><h3>${escapeHtml(data.introTitle)}</h3><p>${escapeHtml(data.introText)}</p></div></div></section><section class="certify-process"><div class="certify-process-head"><span>Proceso</span><h3>Proceso de Certificación</h3></div>${steps}</section><button class="certify-cta" type="button" data-info="contact"><span>Solicitá consulta gratuita</span><span aria-hidden="true">›</span></button>`;
  }

  function sealPairsMarkup(seals) {
    return `<div class="seal-pair-list">${seals.map((seal) => {
      const separator = seal.text.indexOf(' - ');
      const title = separator > 0 ? seal.text.slice(0, separator) : '';
      const description = separator > 0 ? seal.text.slice(separator + 3) : seal.text;
      return `<article class="seal-pair"><button class="seal-image-button" type="button" aria-label="Ampliar sello ${escapeHtml(title || seal.alt)}"><img class="info-photo asset-loading" src="${escapeHtml(seal.src)}" alt="${escapeHtml(seal.alt || title || 'Sello kosher')}" loading="lazy" onerror="this.closest('.seal-pair').remove()"></button><div>${title ? `<h3>${escapeHtml(title)}</h3>` : ''}<p>${escapeHtml(description)}</p></div></article>`;
    }).join('')}</div>`;
  }

  function collaborationMarkup(content) {
    if (content.section !== 'collaboration' && !content.collaboration) return '';
    const data = {
      text:content.collaboration?.text || 'Si te fue útil nuestra info, colaborá con nosotros. Con tu ayuda podemos ayudar más.',
      bank:content.collaboration?.bank || 'Cuenta Banco Santander. Alias: Equipo.kosher.arg - CUIT: 30709463655'
    };
    const bank = data.bank.match(/^(.+?)\.\s*Alias:\s*(.+?)\s*-\s*CUIT:\s*(\d+)$/i);
    const bankName = bank?.[1] || data.bank;
    const alias = bank?.[2] || '';
    const cuit = bank?.[3] || '';
    const copyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
    const copyButton = (value, label) => `<button class="copy-field-button" type="button" data-copy-value="${escapeHtml(value)}" aria-label="Copiar ${escapeHtml(label)}" title="Copiar ${escapeHtml(label)}">${copyIcon}</button>`;
    return `<section class="collaboration-card"><h3>Colaborá con nosotros</h3><p>${escapeHtml(data.text)}</p></section><section class="bank-card"><div class="bank-card-head"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18M5 9v9M9 9v9M15 9v9M19 9v9M3 20h18M12 3l9 4H3z"/></svg><div><small>Datos para transferencia</small><strong>${escapeHtml(bankName)}</strong></div></div>${alias ? `<div class="bank-data-row"><span>Alias</span><div class="bank-data-value"><strong>${escapeHtml(alias)}</strong>${copyButton(alias, 'el alias')}</div></div>` : ''}${cuit ? `<div class="bank-data-row"><span>CUIT</span><div class="bank-data-value"><strong>${escapeHtml(cuit)}</strong>${copyButton(cuit, 'el CUIT')}</div></div>` : ''}</section>`;
  }

  function infoContentMarkup(content) {
    const certification = certifyMarkup(content);
    if (certification) return certification;
    const collaboration = collaborationMarkup(content);
    if (collaboration) return collaboration;
    const cardTitles = new Set((content.cards || []).map((card) => card.title.toLowerCase()));
    const pageHeading = normalize(content.elements?.find((element) => element.type === 'heading')?.text || '');
    const hasContactActions = Boolean(content.contact || content.actions?.length);
    const blocks = content.blocks.map((block) => ({...block, text:sanitizeOfficialText(block.text)})).filter((block) => block.text).filter((block) => !(block.tag.startsWith('h') && (cardTitles.has(block.text.toLowerCase()) || normalize(block.text) === pageHeading))).filter((block) => !(hasContactActions && isStandaloneContact(block.text))).map((block) => block.tag.startsWith('h') ? `<h3>${escapeHtml(block.text)}</h3>` : `<p>${escapeHtml(block.text)}</p>`).join('');
    const cards = (content.cards || []).map((card, index) => { const flag = countryFlag(card.title); const media = flag ? `<span class="info-card-media country-card-flag-media">${flag}</span>` : `<span class="info-card-media"><img class="info-photo asset-loading" src="${escapeHtml(card.image)}" alt="" aria-hidden="true" loading="lazy" onerror="this.remove()"></span>`; return `<button class="info-card${flag ? ' country-card' : ''}" type="button" data-info-card="${index}">${media}<span class="info-card-copy"><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(content.cardActionLabel || 'Ver información')}</span></span><span class="info-card-arrow" aria-hidden="true">›</span></button>`; }).join('');
    const images = content.images.map((image) => `<img class="info-photo asset-loading" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy" onerror="this.remove()">`).join('');
    const actionIcon = (kind) => {
      if (kind === 'whatsapp') return '<svg class="info-action-icon whatsapp-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
      const paths = {email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>', whatsapp:'<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>', map:'<path d="M20 10c0 4.5-8 10-8 10s-8-5.5-8-10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'};
      return `<svg class="info-action-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || paths.email}</svg>`;
    };
    const actions = (content.actions || []).map((action) => `<a class="info-action ${escapeHtml(action.kind || '')}" href="${escapeHtml(action.href)}">${actionIcon(action.kind)}<span>${escapeHtml(action.label)}</span></a>`).join('');
    if (content.section === 'notes' && content.images?.length) {
      const titles = (content.cards || []).map((card) => card.title);
      const flyers = content.images.map((image, index) => `<button class="note-flyer" type="button" data-expanded-image="${escapeHtml(image.src)}" data-expanded-caption="${escapeHtml(titles[index] || image.alt || 'Nota Kashrut')}"><img class="asset-loading" src="${escapeHtml(image.src)}" alt="${escapeHtml(titles[index] || image.alt || 'Nota Kashrut')}" loading="lazy" onerror="this.closest('.note-flyer').remove()"><span>${escapeHtml(titles[index] || image.alt || 'Nota Kashrut')}</span><small>Ver en pantalla completa</small></button>`).join('');
      return `<div class="note-flyer-list">${flyers}</div>`;
    }
    if (content.contact) {
      const address = content.blocks.map((block) => sanitizeOfficialText(block.text)).find((text) => /Ecuador\s+920\s+CABA/i.test(text));
      return `<div class="contact-clean-list">${actions}</div>${address ? `<div class="contact-address"><span class="contact-address-icon">${actionIcon('map')}</span><div><small>Sede</small><strong>${escapeHtml(address.replace(/^Comunidad Jafetz Jaim:\s*/i, ''))}</strong></div></div>` : ''}`;
    }
    const orderedElements = (content.elements || []).filter((element) => !(element.type === 'heading' && normalize(element.text) === pageHeading));
    const hasOrderedElements = !cards && Boolean(orderedElements.length);
    const ordered = hasOrderedElements ? infoFlowMarkup(orderedElements, hasContactActions) : blocks;
    const countryCards = (content.cards || []).some((card) => countryFlag(card.title));
    const sealPairs = content.seals?.length ? sealPairsMarkup(content.seals) : '';
    const worldIntro = content.section === 'world' ? `<div class="world-certification-intro"><span class="world-certification-intro-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2 2 3 5 3 8s-1 6-3 8c-2-2-3-5-3-8s1-6 3-8Z"/></svg></span><div><strong>Sellos reconocidos internacionalmente</strong><p>Elegí un país para consultar sus certificaciones autorizadas.</p></div></div>` : '';
    const main = sealPairs || (cards ? `${worldIntro}<div class="info-gallery info-cards${countryCards ? ' country-cards-list' : ''}">${cards}</div>${blocks ? `<div class="info-copy">${blocks}</div>` : ''}` : hasOrderedElements ? `<div class="info-copy info-flow">${ordered}</div>` : `${images ? `<div class="info-gallery seal-gallery">${images}</div>` : ''}${blocks ? `<div class="info-copy">${blocks}</div>` : ''}`);
    return `${main}${actions ? `<div class="info-actions"><span class="info-actions-title">Contacto oficial</span>${actions}</div>` : ''}`;
  }

  async function fetchCardContent(card) {
    if (!card.url) return {blocks:[{tag:'p', text:card.description || 'Información publicada por Iahadut HaTora en el catálogo oficial.'}], images:[], actions:[]};
    if (isFresh(cardCache[card.url])) return cardCache[card.url];
    const document = new DOMParser().parseFromString(await fetchText(sourceUrl(card.url)), 'text/html');
    document.querySelectorAll('script,style,noscript,nav,header,footer,form').forEach((node) => node.remove());
    // Las fichas oficiales usan secciones Divi en vez de main/article. La
    // segunda sección contiene la ficha; tomarla evita mezclar header/footer
    // y recomendaciones de la web con los sellos o datos de contacto.
    const contentRoot = document.querySelector('.et_pb_section_1_tb_body') || document.querySelector('.entry-content, main, article') || document.querySelector('.et_builder_inner_content') || document.body;
    const nodes = [...contentRoot.querySelectorAll('h1, h2, h3, h4, h5, p, li, blockquote, address, .et_pb_toggle_title')];
    const seen = new Set();
    const blocks = nodes.map((node) => ({tag:node.tagName.toLowerCase(), text:clean(node.textContent)})).filter((block) => {
      if (block.text.length <= 4 || /menu|buscar|leer más|ver imagen completa|abrir chat|todos los derechos/i.test(block.text) || seen.has(block.text)) return false;
      seen.add(block.text);
      return true;
    });
    const images = [...contentRoot.querySelectorAll('img')].map((image) => ({src:image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src'), alt:clean(image.getAttribute('alt') || image.getAttribute('title') || card.title)})).filter((image) => image.src).map((image) => ({...image, src:new URL(image.src, card.url).href})).filter((image, index, all) => all.findIndex((candidate) => candidate.src === image.src) === index);
    const seals = card.url.includes('/viajeros/') ? [...contentRoot.querySelectorAll('.et_pb_column')].map((column) => {
      const image = column.querySelector('img');
      const text = clean([...column.querySelectorAll('p')].map((node) => node.textContent).join(' '));
      const rawImage = image && (image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src'));
      if (!rawImage || !text || /va texto aqu[ií]/i.test(text)) return null;
      return {src:new URL(rawImage, card.url).href, alt:clean(image.getAttribute('alt') || image.getAttribute('title') || text.split(' - ')[0] || card.title), text};
    }).filter(Boolean).filter((seal, index, all) => all.findIndex((candidate) => candidate.src === seal.src && normalize(candidate.text) === normalize(seal.text)) === index) : [];
    const pageText = clean(contentRoot.textContent);
    // En una ficha individual solo deben aparecer sus propios contactos.
    // El pie de página contiene los datos institucionales del Vaad y no se
    // debe mezclar con los teléfonos/email del local o del catering.
    const contactText = pageText;
    const actions = [];
    const addAction = (label, href, kind) => { if (href && !actions.some((action) => normalize(action.href) === normalize(href) || normalize(action.label) === normalize(label))) actions.push({label, href, kind}); };
    [...new Set(contactText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,8}\b/gi) || [])].forEach((email) => addAction(email, `mailto:${email}`, 'email'));
    phoneNumbers(contactText).forEach((digits, index) => addAction(index === 0 ? 'WhatsApp' : 'Contacto por WhatsApp', `https://wa.me/${digits}`, 'whatsapp'));
    [...contentRoot.querySelectorAll('a[href]')].forEach((link) => {
      const href = link.getAttribute('href') || '';
      const label = clean(link.textContent);
      if (/google\.com\/maps/i.test(href)) addAction(label || 'Ver ubicación', href, 'map');
      if (/^mailto:/i.test(href)) {
        const email = href.replace(/^mailto:/i, '').split('?')[0].replace(/(?:whatsapp|tel[eé]fono|celular).*$/i, '');
        if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,8}$/i.test(email)) addAction(email, `mailto:${email}`, 'email');
      } else if (/^(tel:|https:\/\/wa\.me\/|https:\/\/chat\.whatsapp\.com\/)/i.test(href)) {
        addAction(label || 'WhatsApp', href, 'whatsapp');
      }
    });
    const result = {blocks:blocks.length ? blocks : [{tag:'p', text:card.description || 'Información publicada por Iahadut HaTora en el catálogo oficial.'}], images, seals, actions, fetchedAt:Date.now()};
    cardCache[card.url] = result;
    localStorage.setItem('iht_card_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:cardCache}));
    return result;
  }

  async function fetchProductContent(product, force = false) {
    if (!product?.url) return null;
    if (!force && productCache[product.url]) return productCache[product.url];
    const document = new DOMParser().parseFromString(await fetchText(sourceUrl(product.url)), 'text/html');
    const structuredBarcodes = [];
    const collectStructuredBarcodes = (value) => {
      if (Array.isArray(value)) { value.forEach(collectStructuredBarcodes); return; }
      if (!value || typeof value !== 'object') return;
      Object.entries(value).forEach(([key, entry]) => {
        if (/^gtin(?:8|12|13|14)?$/i.test(key)) structuredBarcodes.push(entry);
        else collectStructuredBarcodes(entry);
      });
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try { collectStructuredBarcodes(JSON.parse(script.textContent)); } catch (_) {}
    });
    const barcodeValues = [
      ...[...document.querySelectorAll('[itemprop^="gtin"],[data-barcode],[data-ean],[data-gtin],[data-upc]')].flatMap((node) => [node.getAttribute('content'), node.getAttribute('value'), node.getAttribute('data-barcode'), node.getAttribute('data-ean'), node.getAttribute('data-gtin'), node.getAttribute('data-upc'), node.textContent]),
      ...structuredBarcodes
    ];
    const officialBarcode = barcodeValues.map(canonicalBarcode).find(Boolean) || '';
    if (officialBarcode && !canonicalBarcode(product.barcode)) {
      product.barcode = officialBarcode;
      save();
    }
    document.querySelectorAll('script,style,noscript,nav,header,footer,form').forEach((node) => node.remove());
    const contentRoot = document.querySelector('.et_pb_section_1_tb_body') || document.querySelector('.entry-content, main, article') || document.querySelector('.et_builder_inner_content.product') || document.body;
    const seen = new Set();
    const blocks = [...contentRoot.querySelectorAll('h1, h2, h3, h4, h5, p, li, blockquote, address')].map((node) => ({tag:node.tagName.toLowerCase(), text:clean(node.textContent)})).filter((block) => {
      if (block.text.length <= 4 || /menu|buscar|leer más|abrir chat|todos los derechos|productos relacionados/i.test(block.text) || seen.has(block.text)) return false;
      seen.add(block.text);
      return true;
    });
    const images = [...contentRoot.querySelectorAll('img')].map((image) => ({src:image.getAttribute('data-large_image') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src') || image.getAttribute('src'), alt:clean(image.getAttribute('alt') || image.getAttribute('title') || product.title)})).filter((image) => image.src).map((image) => ({...image, src:new URL(image.src, product.url).href})).filter((image, index, all) => all.findIndex((candidate) => candidate.src === image.src) === index);
    const category = clean(contentRoot.querySelector('.product_meta .posted_in a')?.textContent || '');
    // WooCommerce/Divi no siempre publica la descripción dentro de <p>.
    // Muchas fichas oficiales usan <div> anidados, por eso tomamos solamente
    // los nodos hoja para conservar el texto real sin repetirlo.
    const descriptionRoot = contentRoot.querySelector('.et_pb_wc_description .et_builder_inner_content.product, .et_pb_wc_description .et_pb_module_inner, .woocommerce-product-details__short-description');
    const descriptionParts = descriptionRoot
      ? [descriptionRoot, ...descriptionRoot.querySelectorAll('p, li, blockquote, address, div')]
        .filter((node) => ![...node.children].some((child) => clean(child.textContent)))
        .map((node) => clean(node.textContent))
        .filter((text, index, all) => text.length > 4 && all.indexOf(text) === index)
      : [];
    const beraja = descriptionRoot
      ? [descriptionRoot, ...descriptionRoot.querySelectorAll('*')]
        .map((node) => clean(node.textContent).match(/^BERAJ[ÁA]\s*:\s*(.+)$/i))
        .filter(Boolean)
        .map((match) => clean(match[1]))
        .sort((first, second) => first.length - second.length)[0] || ''
      : '';
    const description = descriptionParts.join(' ').trim() || blocks
      .filter((block) => block.tag === 'p')
      .filter((block) => !/^BERAJ[ÁA]\s*:/i.test(block.text))
      .map((block) => block.text)
      .join(' ')
      .trim();
    const result = {blocks, images, category, description, descriptionAvailable:Boolean(description), beraja, barcode:officialBarcode || canonicalBarcode(product.barcode), fetchedAt:Date.now(), bundled:false};
    productCache[product.url] = result;
    localStorage.setItem('iht_product_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:productCache}));
    return result;
  }

  async function fetchAlerts(force = false) {
    if (!force && isFresh(alertCache)) {
      updateRecentFromAlerts(alertCache.items);
      refreshAlertBadge();
      return alertCache.items;
    }
    const document = new DOMParser().parseFromString(await fetchText(sourceUrl(alertUrl)), 'text/html');
    document.querySelectorAll('script,style,noscript,nav,header,footer,form').forEach((node) => node.remove());
    const nodes = [...document.querySelectorAll('main h1, main h2, main h3, main p, main li, article h1, article h2, article h3, article p, article li, .entry-content h1, .entry-content h2, .entry-content h3, .entry-content p, .entry-content li')];
    const items = [...new Set(nodes.map((node) => clean(node.textContent)).filter((text) => text.length > 8 && !/menu|buscar|leer más|abrir chat|todos los derechos/i.test(text)))].slice(0, 40);
    const extractGroup = (root) => [...(root?.querySelectorAll('li') || [])].map((node) => ({text:clean(node.textContent), url:node.querySelector('a[href]') ? new URL(node.querySelector('a[href]').getAttribute('href'), alertUrl).href : ''})).filter((item, index, all) => item.text.length > 8 && all.findIndex((candidate) => candidate.text === item.text) === index);
    const officialGroups = {alta:extractGroup(document.querySelector('.card-altas')), baja:extractGroup(document.querySelector('.card-bajas')), general:[]};
    const result = officialGroups.alta.length || officialGroups.baja.length ? officialGroups : {alta:[], baja:[], general:items.length ? items : ['No hay alertas publicadas en este momento.']};
    alertCache = {version:INFO_CACHE_VERSION, items:result, fetchedAt:Date.now()};
    localStorage.setItem('iht_alert_cache', JSON.stringify(alertCache));
    updateRecentFromAlerts(result);
    refreshAlertBadge();
    return result;
  }

  function preloadImage(src) {
    if (!src) return Promise.resolve();
    return new Promise((resolve) => {
      const image = new Image();
      let settled = false;
      const finish = (loaded) => {
        if (settled) return;
        settled = true;
        resolve(loaded);
      };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = src;
      if (image.complete) finish(image.naturalWidth > 0);
    });
  }

  async function preloadNewImages(images = [], concurrency = 4, onProgress = null) {
    const unique = [...new Set(images.filter(Boolean))];
    const pending = unique.filter((src) => !assetCache.has(src));
    const batchSize = 36;
    let completed = 0;
    for (let start = 0; start < pending.length; start += batchSize) {
      const batch = pending.slice(start, start + batchSize);
      await runPool(batch, async (src) => {
        if (await preloadImage(src)) assetCache.add(src);
      }, concurrency, (done) => onProgress?.(completed + done, pending.length));
      completed += batch.length;
      if (start + batchSize < pending.length) {
        await new Promise((resolve) => {
          if ('requestIdleCallback' in window) window.requestIdleCallback(resolve, {timeout: 180});
          else window.setTimeout(resolve, 0);
        });
      }
    }
    localStorage.setItem(assetCacheKey, JSON.stringify([...assetCache]));
    return {total:unique.length, pending:pending.length};
  }

  async function preloadImages(images = []) {
    const unique = [...new Set(images.filter(Boolean))];
    if (unique.length) await runPool(unique, preloadImage, 4);
  }

  async function preloadInitialProductImages() {
    const candidates = [...(Array.isArray(recentProducts) ? recentProducts : []), ...products, ...bundledProducts]
      .map((product) => product?.image)
      .filter(Boolean)
      .filter((src, index, all) => all.indexOf(src) === index)
      .slice(0, 10);
    if (!candidates.length) return;
    await Promise.race([
      runPool(candidates, async (src) => {
        if (await preloadImage(src)) assetCache.add(src);
      }, 4),
      new Promise((resolve) => window.setTimeout(resolve, 4000))
    ]);
    localStorage.setItem(assetCacheKey, JSON.stringify([...assetCache]));
  }

  async function preloadProductContent(firstPreparation = false, onProgress = null) {
    const warmProducts = [...(Array.isArray(recentProducts) ? recentProducts : []), ...products]
      .filter((product, index, all) => product?.url && all.findIndex((candidate) => candidate.url === product.url) === index)
      .filter((product) => !productCache[product.url])
      .slice(0, firstPreparation ? 12 : 24);
    const candidates = warmProducts;
    if (!candidates.length) return;
    await runPool(candidates, fetchProductContent, 3, onProgress);
  }

  async function runPool(items, worker, concurrency = 3, onProgress = null) {
    const queue = [...items];
    let completed = 0;
    const runners = Array.from({length:Math.min(concurrency, queue.length)}, async () => {
      while (queue.length) {
        const item = queue.shift();
        try { await worker(item); } catch (_) {}
        completed += 1;
        onProgress?.(completed, items.length);
      }
    });
    await Promise.all(runners);
  }

  function updateBackgroundLoad(percent, text, visible = true, state = 'busy') {
    const progress = $('#initialLoadProgress');
    const bar = $('#initialLoadProgressBar');
    const label = $('#initialLoadMessage');
    const percentLabel = $('#initialLoadPercent');
    const value = Math.round(Math.max(4, Math.min(100, percent)));
    if (progress) {
      progress.hidden = !visible;
      progress.dataset.state = state;
      progress.style.setProperty('--initial-load-progress', `${value}%`);
    }
    if (bar) bar.style.width = `${value}%`;
    if (label && text && label.textContent !== text) {
      label.classList.remove('is-changing');
      void label.offsetWidth;
      label.textContent = text;
      label.classList.add('is-changing');
    }
    if (percentLabel) percentLabel.textContent = `${value}%`;
  }

  async function startBackgroundPreparation() {
    if (!initialPreparationPreview && localStorage.getItem(INITIAL_PRELOAD_KEY) === 'done') return;
    if (!navigator.onLine) {
      updateBackgroundLoad(100, 'Sin conexión · usando catálogo guardado', true, 'error');
      window.setTimeout(() => updateBackgroundLoad(100, '', false, 'error'), 4200);
      return;
    }
    updateBackgroundLoad(4, 'Preparando el catálogo en segundo plano…');
    try {
      await preloadAppData((progress, text) => updateBackgroundLoad(progress, text));
      updateBackgroundLoad(100, 'Catálogo listo para usar', true, 'done');
      window.setTimeout(() => updateBackgroundLoad(100, 'Catálogo listo para usar', false, 'done'), 2600);
    } catch (_) {
      updateBackgroundLoad(100, 'Usando el catálogo guardado', true, 'error');
      window.setTimeout(() => updateBackgroundLoad(100, '', false, 'error'), 4200);
    }
  }

  async function preloadAppData(onProgress = null) {
    if (preloadStarted || !navigator.onLine) return;
    preloadStarted = true;
    const firstPreparation = initialPreparationPreview || localStorage.getItem(INITIAL_PRELOAD_KEY) !== 'done';
    try {
      onProgress?.(5, 'Consultando las novedades del catálogo…');
      const freshAlerts = await fetchAlerts(true).catch(() => null);
      const latestAlerts = freshAlerts?.alta || [];
      const latestProductsMissing = latestAlerts.slice(0, 4).some((alert) => alert.url && !products.some((product) => product.url === alert.url));
      if (latestProductsMissing) {
        onProgress?.(8, 'Incorporando productos nuevos…');
        await syncCatalog(true, onProgress).catch(() => null);
        updateRecentFromAlerts(freshAlerts);
      }
      await preloadProductContent(firstPreparation, (done, total) => onProgress?.(45 + (done / Math.max(total, 1)) * 30, firstPreparation ? 'Preparando productos destacados…' : 'Incorporando contenido nuevo…'));
      const warmProducts = [...(Array.isArray(recentProducts) ? recentProducts : []), ...products]
        .filter((product, index, all) => product?.url && all.findIndex((candidate) => candidate.url === product.url) === index)
        .slice(0, firstPreparation ? 18 : 30);
      const imageUrls = [
        ...warmProducts.map((product) => product.image),
        ...warmProducts.flatMap((product) => productCache[product.url]?.images || []).map((image) => image.src),
        ...Object.values(infoCache).slice(0, 2).flatMap((content) => [...(content?.images || []).map((image) => image.src), ...(content?.cards || []).map((card) => card.image)]),
        ...Object.values(cardCache).slice(0, 6).flatMap((content) => content?.images || []).map((image) => image.src)
      ].filter(Boolean).filter((src, index, all) => all.indexOf(src) === index);
      await preloadNewImages(imageUrls, 3, (done, total) => onProgress?.(75 + (done / Math.max(total, 1)) * 25, firstPreparation ? 'Cargando imágenes principales…' : 'Descargando imágenes nuevas…'));
      if (firstPreparation) {
        localStorage.setItem(INITIAL_PRELOAD_KEY, 'done');
      }
    } finally {
      preloadStarted = false;
    }
  }

  async function applyNativeCatalogCacheIfNewer() {
    const cached = await readNativeCatalogCache();
    if (!cached?.catalog) return false;
    const generatedAt = Date.parse(cached.catalog.generatedAt || '') || 0;
    const currentAt = Number(localStorage.getItem('iht_catalog_generated_at') || activeCatalogTimestamp || 0);
    if (!generatedAt || generatedAt <= currentAt) return false;
    const cachedProducts = Array.isArray(cached.catalog.products) ? cached.catalog.products : [];
    if (cachedProducts.length < 900) return false;
    products = cachedProducts.map((product) => ({
      ...product,
      barcode: canonicalBarcode(product.barcode || bundledProductByUrl.get(product.url)?.barcode || cached.productDetails?.products?.[product.url]?.barcode)
    }));
    recentProducts = products.slice(0, 10);
    Object.assign(productCache, cached.productDetails?.products || {});
    Object.assign(infoCache, cached.content?.info || {});
    Object.assign(cardCache, cached.content?.cards || {});
    localStorage.setItem('iht_catalog_generated_at', String(generatedAt));
    localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
    save();
    renderHome();
    renderSearchCategories();
    if (document.querySelector('.view.active')?.id === 'searchView') renderResults($('#query').value);
    syncMessage(`Catálogo actualizado · ${products.length.toLocaleString('es-AR')} productos`, 'ok');
    return true;
  }

  function scheduleAppPreload() {
    const start = () => preloadAppData();
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, {timeout:1800});
    else window.setTimeout(start, 1200);
  }

  function syncAndPreload(force = false) {
    return Promise.resolve(syncCatalog(force)).then(() => preloadAppData());
  }

  function localProductFromFirestore(data, previous = null) {
    const url = clean(data?.sourceUrl);
    const title = clean(data?.title);
    if (!url || !title) return null;
    return {
      url,
      title,
      brand:clean(data?.brand),
      cat:clean(data?.category || 'gondola'),
      image:clean(data?.imageUrl),
      barcode:canonicalBarcode(data?.barcode),
      description:previous?.description || '',
      catalogGeneratedAt:clean(data?.catalogGeneratedAt),
      updatedAt:clean(data?.updatedAt)
    };
  }

  async function syncCatalogFromFirestore(fallbackMinimumCatalogTotal, onProgress = null) {
    const firebase = await getFirebaseCatalogApi();
    if (!firebase) return false;
    const metadataRef = firebase.api.doc(firebase.db, 'catalog_metadata', 'current');
    const metadataSnapshot = await firebase.api.getDoc(metadataRef);
    if (!metadataSnapshot.exists()) return false;
    const remoteVersion = clean(metadataSnapshot.data()?.version);
    if (!remoteVersion) return false;
    const remoteProductCount = Number(metadataSnapshot.data()?.activeProductCount) || 0;

    // Never infer the cursor from the bundled snapshot when a previous
    // installation already has its own cached catalog. That cache may be
    // older than the bundled assets and must be reconciled from Firestore.
    const localVersion = clean(localStorage.getItem('iht_catalog_version'));
    const localDate = localVersion ? Date.parse(localVersion) : 0;
    const remoteDate = Date.parse(remoteVersion);
    const localIsAtLeastAsNew = Boolean(localDate && remoteDate && remoteDate <= localDate);
    const hasUsableLocalVersion = Boolean(localDate && remoteDate && remoteDate > localDate);
    // A versioned local catalog is already a valid snapshot. Do not force a
    // full download just because the old category counters drifted.
    if (localIsAtLeastAsNew && products.length > seed.length) {
      syncState.last = String(Date.now());
      localStorage.setItem('iht_last_sync', syncState.last);
      syncMessage(`Catálogo al día · ${products.length.toLocaleString('es-AR')} productos`, 'ok');
      return true;
    }

    onProgress?.(8, hasUsableLocalVersion ? 'Consultando cambios nuevos…' : 'Descargando catálogo autorizado…');
    const activeCollection = firebase.api.collection(firebase.db, 'catalog_products');
    const archiveCollection = firebase.api.collection(firebase.db, 'catalog_archive');
    const [activeSnapshot, archiveSnapshot] = hasUsableLocalVersion
      ? await Promise.all([
        firebase.api.getDocs(firebase.api.query(activeCollection, firebase.api.where('catalogGeneratedAt', '>', localVersion))),
        firebase.api.getDocs(firebase.api.query(archiveCollection, firebase.api.where('retiredAt', '>', localVersion)))
      ])
      : [await firebase.api.getDocs(activeCollection), {docs:[]}];

    const previousByUrl = new Map(products.map((product) => [product.url, product]));
    const nextByUrl = hasUsableLocalVersion ? new Map(previousByUrl) : new Map();
    const changedUrls = new Set();
    const additions = [];
    activeSnapshot.docs.forEach((document) => {
      const product = localProductFromFirestore(document.data(), previousByUrl.get(document.data()?.sourceUrl));
      if (!product) return;
      if (!previousByUrl.has(product.url)) additions.push(product);
      nextByUrl.set(product.url, product);
      changedUrls.add(product.url);
    });
    if (hasUsableLocalVersion) {
      archiveSnapshot.docs.forEach((document) => {
        const data = document.data() || {};
        const url = clean(data.sourceUrl);
        if (!url) return;
        const active = nextByUrl.get(url);
        const activeDate = Date.parse(active?.catalogGeneratedAt || active?.updatedAt || '') || 0;
        const retiredDate = Date.parse(data.retiredAt || '') || 0;
        if (active && activeDate > retiredDate) return;
        nextByUrl.delete(url);
        changedUrls.add(url);
      });
    }

    const nextProducts = [...nextByUrl.values()];
    const minimumCatalogTotal = remoteProductCount || fallbackMinimumCatalogTotal;
    if (nextProducts.length < minimumCatalogTotal) throw new Error(`Catálogo Firebase incompleto (${nextProducts.length} de ${minimumCatalogTotal} productos)`);
    changedUrls.forEach((url) => { delete productCache[url]; });
    products = nextProducts;
    recentProducts = additions.length ? additions.slice(0, 10) : nextProducts.slice(0, 10);
    localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
    localStorage.setItem('iht_catalog_version', remoteVersion);
    if (remoteDate) localStorage.setItem('iht_catalog_generated_at', String(remoteDate));
    syncState.last = String(Date.now());
    localStorage.setItem('iht_last_sync', syncState.last);
    save();
    localStorage.setItem('iht_product_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:productCache}));
    syncMessage(hasUsableLocalVersion
      ? `Actualización rápida · ${changedUrls.size} cambios`
      : `Catálogo actualizado · ${products.length.toLocaleString('es-AR')} productos`, 'ok');
    renderHome();
    if (document.querySelector('.view.active')?.id === 'searchView') renderSearchCategories();
    return true;
  }

  async function syncCatalog(force = false, onProgress = null) {
    if (syncState.running) return;
    const twelveHours = 12 * 60 * 60 * 1000;
    const expectedCatalogTotal = categories.reduce((total, category) => total + category.count, 0);
    // This fallback protects a full scrape only. Incremental Firebase syncs
    // validate against catalog_metadata.activeProductCount instead.
    const minimumCatalogTotal = Math.floor(expectedCatalogTotal * 0.97);
    const hasCatalogVersion = Boolean(localStorage.getItem('iht_catalog_version'));
    if (!force && hasCatalogVersion && syncState.last && Date.now() - Number(syncState.last) < twelveHours) return;
    syncState.running = true;
    syncState.error = '';
    syncMessage('Sincronizando catálogo oficial…', 'busy');
    try {
      let firebaseUpdated = false;
      let firebaseError = null;
      try { firebaseUpdated = await syncCatalogFromFirestore(minimumCatalogTotal, onProgress); } catch (error) { firebaseError = error; }
      if (firebaseUpdated) return;
      // A valid bundled or cached catalog is safer than falling back to a
      // full scrape on every manual sync. Full pagination is reserved for a
      // genuinely empty catalog/recovery state.
      if (products.length > seed.length) {
        syncState.error = firebaseError?.message || 'No se pudo consultar la sincronización incremental';
        syncMessage('No se pudieron verificar cambios · se conserva el catálogo guardado', 'bad');
        return;
      }
      const synced = [];
      for (const [categoryIndex, category] of categories.entries()) {
        const firstPage = await fetchCatalogPage(category.url);
        const total = catalogTotal(firstPage) || category.count;
        const pages = Math.ceil(total / 24);
        const categoryStart = categoryIndex / categories.length;
        onProgress?.(8 + categoryStart * 22, `Descargando ${category.short}…`);
        syncMessage(`Leyendo ${category.short} · 1 de ${pages} páginas`, 'busy');
        for (let page = 1; page <= pages; page += 1) {
          const html = page === 1 ? firstPage : await fetchCatalogPage(`${category.url}?product-page=${page}`);
          synced.push(...productEntries(html, category));
          onProgress?.(8 + ((categoryIndex + (page / pages)) / categories.length) * 22, `Descargando ${category.short} · ${page} de ${pages} páginas…`);
          syncMessage(`Leyendo ${category.short} · ${page} de ${pages} páginas`, 'busy');
        }
      }
      const unique = [...new Map(synced.map((product) => [product.url, product])).values()];
      if (unique.length < minimumCatalogTotal) throw new Error(`Catálogo incompleto (${unique.length} de al menos ${minimumCatalogTotal} productos)`);
      const previousByUrl = new Map(products.map((product) => [product.url, product]));
      const previousDescriptions = new Map(products.map((product) => [product.url, product.description]));
      const previousUrls = new Set(products.map((product) => product.url));
      const currentUrls = new Set(unique.map((product) => product.url));
      Object.keys(productCache).filter((url) => !currentUrls.has(url)).forEach((url) => delete productCache[url]);
      unique.forEach((product) => {
        const previous = previousByUrl.get(product.url);
        const changed = previous && ['title', 'brand', 'barcode', 'cat', 'image'].some((field) => String(previous[field] || '') !== String(product[field] || ''));
        if (changed) delete productCache[product.url];
      });
      products = unique.map((product) => {
        const previous = previousByUrl.get(product.url);
        return {
          ...product,
          // The category listing often omits the barcode. Never erase a
          // verified code already learned from the official product page.
          barcode:canonicalBarcode(product.barcode) || canonicalBarcode(previous?.barcode),
          description:previousDescriptions.get(product.url) || ''
        };
      });
      recentProducts = unique.filter((product) => !previousUrls.has(product.url)).slice(0, 10);
      if (recentProducts.length < 10) recentProducts = unique.slice(0, 10);
      localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
      save();
      localStorage.setItem('iht_product_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:productCache}));
      syncState.last = String(Date.now());
      localStorage.setItem('iht_last_sync', syncState.last);
      const sourceVersion = clean(activeCatalogSnapshot?.generatedAt);
      if (sourceVersion && Date.parse(sourceVersion)) localStorage.setItem('iht_catalog_version', sourceVersion);
      localStorage.setItem('iht_catalog_generated_at', syncState.last);
      try {
        const officialUpdate = await fetchOfficialUpdateDate();
        if (officialUpdate) {
          localStorage.setItem('iht_official_update', officialUpdate);
          const updateNode = $('#officialUpdateDate');
          if (updateNode) updateNode.textContent = officialUpdate;
        }
      } catch (_) {}
      syncMessage(`Sincronizado · ${products.length.toLocaleString('es-AR')} productos`, 'ok');
      renderHome();
      if (document.querySelector('.view.active')?.id === 'searchView') renderSearchCategories();
    } catch (error) {
      syncState.error = error.message;
      syncMessage(products.length > seed.length ? 'Sin conexión · usando catálogo guardado' : 'Sin conexión · muestra local', 'bad');
    } finally {
      syncState.running = false;
    }
  }

  function categoryMarkup(category, compact = false) {
    return `<button class="category-card" data-category="${category.key}" aria-label="Ver ${escapeHtml(category.name)}">${categoryIcon(category.key)}<span><strong>${escapeHtml(compact ? category.name : category.name)}</strong><small>${escapeHtml(category.desc)} · ${categoryCount(category).toLocaleString('es-AR')}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`;
  }

  function renderHome() {
    $('#homeTotal').textContent = `${totalCount().toLocaleString('es-AR')} productos en el catálogo`;
    const updateNode = $('#officialUpdateDate');
    if (updateNode) updateNode.textContent = officialUpdateMessage();
    const recentCandidates = [...(Array.isArray(recentProducts) ? recentProducts : []), ...products, ...bundledProducts];
    const items = [...new Map(recentCandidates.map((product) => [product.url, product])).values()].slice(0, 10);
    const itemsKey = items.map((product) => `${product.url}|${product.image || ''}`).join('\n');
    if (itemsKey === renderedHomeItemsKey) {
      renderAlertPreview();
      return;
    }
    renderedHomeItemsKey = itemsKey;
    if (recentCarouselTimer) {
      window.clearInterval(recentCarouselTimer);
      recentCarouselTimer = null;
    }
    if (recentCarouselRebaseTimer) {
      window.clearTimeout(recentCarouselRebaseTimer);
      recentCarouselRebaseTimer = null;
    }
    recentCarouselOffset = 0;
    const recentTrack = $('#recentProducts');
    delete recentTrack.dataset.carouselPositioned;
    recentTrack.style.removeProperty('transform');
    recentTrack.parentElement?.scrollTo({left: 0, behavior: 'auto'});
    recentTrack.innerHTML = items.map((product) => `<button class="recent-product" data-product="${escapeHtml(product.url)}" aria-label="Ver ${escapeHtml(product.title)}"><span class="recent-product-media"><img class="asset-loading" src="${escapeHtml(product.image || productFallbackImage)}" alt="${escapeHtml(product.title)}" loading="eager" onload="this.classList.remove('asset-loading','asset-error');this.classList.add('asset-ready')" onerror="this.onerror=null;this.src='${productFallbackImage}';this.classList.add('asset-loading');this.classList.remove('asset-ready','asset-error')">${uruguayBadge(product, 'product-region-badge recent-region-badge')}</span></button>`).join('');
    if (items.length > 1) {
      // Tres copias permiten iniciar en el centro y desplazarse en ambas
      // direcciones. El scroll se recentra en silencio cuando cruza una
      // copia, por lo que el usuario nunca alcanza un extremo visible.
      const originalMarkup = recentTrack.innerHTML;
      recentTrack.insertAdjacentHTML('afterbegin', originalMarkup);
      recentTrack.insertAdjacentHTML('beforeend', originalMarkup);
      recentTrack.dataset.carouselOriginalCount = String(items.length);
    } else delete recentTrack.dataset.carouselOriginalCount;
    recentTrack.querySelectorAll('[data-product]').forEach((card) => card.addEventListener('click', (event) => {
      if (recentTrack.dataset.suppressClick === 'true') {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      openDetail(card.dataset.product);
    }));
    $('#recentProducts').style.setProperty('--recent-items', String(items.length));
    startRecentCarousel();
    renderAlertPreview();
  }

  function startRecentCarousel() {
    if (recentCarouselTimer) return;
    const track = $('#recentProducts');
    if (!track || !track.children.length || !track.dataset.carouselOriginalCount) return;
    const viewport = track.parentElement;
    if (!viewport) return;
    enableRecentCarouselTouch(viewport);
    fitRecentCarouselCards(viewport);
    const metrics = recentCarouselMetrics(viewport);
    if (!metrics) return;
    if (track.dataset.carouselPositioned !== 'true') {
      viewport.scrollTo({left: metrics.carouselStart, behavior: 'auto'});
      track.dataset.carouselPositioned = 'true';
      recentCarouselOffset = metrics.carouselStart;
    } else {
      recentCarouselOffset = viewport.scrollLeft;
    }
    track.dataset.carouselAutoplay = 'true';
    viewport.classList.add('is-autoplaying');
    const stop = () => {
      if (recentCarouselTimer) {
        window.clearInterval(recentCarouselTimer);
        recentCarouselTimer = null;
      }
      if (recentCarouselRebaseTimer) {
        window.clearTimeout(recentCarouselRebaseTimer);
        recentCarouselRebaseTimer = null;
      }
      track.dataset.carouselAutoplay = 'false';
      viewport.classList.remove('is-autoplaying');
    };
    const move = () => {
      if (!track.isConnected || !track.children.length || document.hidden) {
        stop();
        return;
      }
      const current = recentCarouselMetrics(viewport);
      if (!current || !viewport.scrollWidth) return;
      const nextOffset = viewport.scrollLeft + current.step;
      viewport.scrollTo({left: nextOffset, behavior: 'smooth'});
      recentCarouselOffset = nextOffset;
      scheduleRecentCarouselNormalize(viewport, 720);
    };
    // Avanza una tarjeta por vez, con una pausa cómoda para leer cada foto.
    recentCarouselTimer = window.setInterval(move, 2800);
  }

  function recentCarouselMetrics(viewport) {
    const track = $('#recentProducts');
    const originalCount = Number(track?.dataset.carouselOriginalCount) || 0;
    const firstCard = track?.children[0];
    if (!viewport || !track || !originalCount || !firstCard) return null;
    const styles = window.getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap) || 0;
    const step = firstCard.getBoundingClientRect().width + gap;
    const cycleDistance = step * originalCount;
    const edgeOffset = Number(track.dataset.carouselEdgeOffset) || 0;
    if (!step || !cycleDistance) return null;
    return {
      track,
      step,
      cycleDistance,
      carouselStart: Math.max(0, cycleDistance - edgeOffset),
    };
  }

  function normalizeRecentCarouselPosition(viewport) {
    const metrics = recentCarouselMetrics(viewport);
    if (!metrics) return;
    const {cycleDistance, carouselStart} = metrics;
    let normalized = viewport.scrollLeft;
    while (normalized < carouselStart) normalized += cycleDistance;
    while (normalized >= carouselStart + cycleDistance) normalized -= cycleDistance;
    if (Math.abs(normalized - viewport.scrollLeft) > 0.5) {
      viewport.scrollTo({left: normalized, behavior: 'auto'});
    }
    recentCarouselOffset = normalized;
  }

  function settleRecentCarouselPosition(viewport) {
    const metrics = recentCarouselMetrics(viewport);
    if (!metrics) return;
    const {step, cycleDistance, carouselStart} = metrics;
    let snapped = carouselStart + Math.round((viewport.scrollLeft - carouselStart) / step) * step;
    while (snapped < carouselStart) snapped += cycleDistance;
    while (snapped >= carouselStart + cycleDistance) snapped -= cycleDistance;
    const distance = Math.abs(snapped - viewport.scrollLeft);
    if (distance > 0.5) {
      // Para un gesto normal usamos el desplazamiento nativo suave. Si el
      // usuario atravesó una copia completa, rebasamos en silencio para no
      // animar un recorrido largo que mostraría el bucle interno.
      const behavior = distance <= step * 1.25 ? 'smooth' : 'auto';
      viewport.scrollTo({left: snapped, behavior});
    }
    recentCarouselOffset = snapped;
  }

  function scheduleRecentCarouselNormalize(viewport, delay = 120) {
    if (recentCarouselRebaseTimer) window.clearTimeout(recentCarouselRebaseTimer);
    recentCarouselRebaseTimer = window.setTimeout(() => {
      recentCarouselRebaseTimer = null;
      normalizeRecentCarouselPosition(viewport);
    }, delay);
  }

  function fitRecentCarouselCards(viewport) {
    const track = $('#recentProducts');
    if (!track || !viewport) return;
    const styles = window.getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap) || 0;
    const available = Math.max(0, viewport.clientWidth);
    // Dejamos una previsualización lateral de la tarjeta anterior y siguiente.
    // El grupo central queda formado por tarjetas completas y centradas.
    const visibleCount = Math.max(3, Math.min(5, Math.floor((available + gap) / (128 + gap))));
    const peekRatio = 0.18;
    // En teléfonos angostos dejamos que la tarjeta reduzca su ancho para
    // conservar las dos previsualizaciones laterales sin desbordar.
    const cardWidth = Math.max(72, Math.min(136, (available - (gap * (visibleCount + 1))) / (visibleCount + (peekRatio * 2))));
    const peekWidth = cardWidth * peekRatio;
    track.dataset.carouselVisibleCount = String(visibleCount);
    track.dataset.carouselEdgeOffset = String(peekWidth + gap);
    track.dataset.carouselViewportWidth = String(available);
    track.style.paddingInline = '0px';
    track.style.setProperty('--recent-card-width', `${cardWidth}px`);
  }

  function enableRecentCarouselTouch(viewport) {
    if (viewport.dataset.touchReady === 'true') return;
    viewport.dataset.touchReady = 'true';
    const track = $('#recentProducts');
    let resumeTimer = null;
    let settleTimer = null;
    let pointerStart = null;
    let dragged = false;
    let pointerActive = false;
    const pause = () => {
      if (recentCarouselTimer) {
        window.clearInterval(recentCarouselTimer);
        recentCarouselTimer = null;
      }
      if (recentCarouselRebaseTimer) {
        window.clearTimeout(recentCarouselRebaseTimer);
        recentCarouselRebaseTimer = null;
      }
      if (resumeTimer) window.clearTimeout(resumeTimer);
      if (settleTimer) window.clearTimeout(settleTimer);
      if (track) track.dataset.carouselAutoplay = 'false';
      viewport.classList.remove('is-autoplaying');
      viewport.classList.add('is-interacting');
    };
    const scheduleSettle = (delay = 90) => {
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        if (!pointerActive) settleRecentCarouselPosition(viewport);
      }, delay);
    };
    const resume = () => {
      if (resumeTimer) window.clearTimeout(resumeTimer);
      // Una pausa breve permite terminar el gesto sin que el carrusel se
      // sienta detenido; después vuelve a avanzar sin exigir otro toque.
      resumeTimer = window.setTimeout(() => {
        viewport.classList.remove('is-interacting');
        if (!document.hidden) startRecentCarousel();
      }, 2000);
    };
    viewport.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerStart = {x: event.clientX, y: event.clientY};
      dragged = false;
      pointerActive = true;
      pause();
    }, {passive: true});
    viewport.addEventListener('pointermove', (event) => {
      if (!pointerStart || dragged) return;
      dragged = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8;
    }, {passive: true});
    viewport.addEventListener('wheel', () => { pause(); scheduleSettle(180); resume(); }, {passive: true});
    const endPointer = () => {
      if (dragged) {
        if (track) track.dataset.suppressClick = 'true';
        window.setTimeout(() => { if (track) delete track.dataset.suppressClick; }, 350);
        scheduleSettle(90);
      }
      pointerStart = null;
      dragged = false;
      pointerActive = false;
      resume();
    };
    viewport.addEventListener('pointerup', endPointer, {passive: true});
    viewport.addEventListener('pointercancel', endPointer, {passive: true});
    let normalizing = false;
    viewport.addEventListener('scroll', () => {
      const originalCount = Number(track.dataset.carouselOriginalCount) || 0;
      if (!originalCount || normalizing || track.dataset.carouselAutoplay === 'true') {
        recentCarouselOffset = viewport.scrollLeft;
        return;
      }
      if (!pointerActive) scheduleSettle(90);
      recentCarouselOffset = viewport.scrollLeft;
    }, {passive: true});
    viewport.addEventListener('scrollend', () => {
      if (!pointerActive) settleRecentCarouselPosition(viewport);
    }, {passive: true});
    viewport.addEventListener('focusin', pause);
    viewport.addEventListener('focusout', resume);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) startRecentCarousel();
    }, {passive: true});
    let resizeFrame = null;
    const refreshCarouselLayout = () => {
      if (pointerActive) return;
      const currentWidth = viewport.clientWidth;
      const previousWidth = Number(track?.dataset.carouselViewportWidth) || 0;
      if (previousWidth && Math.abs(currentWidth - previousWidth) < 1) return;
      const wasPositioned = track?.dataset.carouselPositioned === 'true';
      const oldFirstCard = track?.children[0];
      const oldStyles = track ? window.getComputedStyle(track) : null;
      const oldGap = parseFloat(oldStyles?.columnGap || oldStyles?.gap) || 0;
      const oldCycleDistance = (oldFirstCard?.getBoundingClientRect().width + oldGap) * (Number(track?.dataset.carouselOriginalCount) || 0);
      const oldEdgeOffset = Number(track?.dataset.carouselEdgeOffset) || 0;
      const oldStart = Math.max(0, oldCycleDistance - oldEdgeOffset);
      const progress = wasPositioned && oldCycleDistance
        ? (viewport.scrollLeft - oldStart) / oldCycleDistance
        : 0;

      fitRecentCarouselCards(viewport);
      if (!wasPositioned) return;
      const originalCount = Number(track.dataset.carouselOriginalCount) || 0;
      const firstCard = track.children[0];
      const styles = window.getComputedStyle(track);
      const gap = parseFloat(styles.columnGap || styles.gap) || 0;
      const cycleDistance = (firstCard?.getBoundingClientRect().width + gap) * originalCount;
      if (!cycleDistance) return;
      const edgeOffset = Number(track.dataset.carouselEdgeOffset) || 0;
      const carouselStart = Math.max(0, cycleDistance - edgeOffset);
      let normalized = carouselStart + (progress * cycleDistance);
      while (normalized < carouselStart) normalized += cycleDistance;
      while (normalized >= carouselStart + cycleDistance) normalized -= cycleDistance;
      viewport.scrollTo({left: normalized, behavior: 'auto'});
      recentCarouselOffset = normalized;
    };
    const scheduleCarouselLayout = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        refreshCarouselLayout();
      });
    };
    window.addEventListener('resize', scheduleCarouselLayout, {passive: true});
    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(scheduleCarouselLayout);
      resizeObserver.observe(viewport);
    }
  }

  async function updateRecentFromAlerts(groups) {
    const alerts = Array.isArray(groups) ? groups : groups?.alta || [];
    if (!alerts.length || products.length <= seed.length) return;
    const matches = [];
    for (const alert of alerts) {
      const alertText = typeof alert === 'string' ? alert : alert?.text || '';
      const displayTitle = cleanDisplayText(alertText.replace(/\s*\([^)]*\)\s*$/, ''));
      const alertTitle = normalize(displayTitle);
      const linkedProduct = alert?.url ? products.find((product) => product.url === alert.url) : null;
      const match = products.find((product) => {
        const productTitle = normalize(cleanDisplayText(product.title));
        return productTitle.length > 8 && (alertTitle.includes(productTitle) || productTitle.includes(alertTitle));
      });
      const candidate = linkedProduct || (match && (!alert?.url || match.url === alert.url) ? match : null) || (alert?.url ? {url:alert.url, title:displayTitle, brand:'', barcode:'', cat:'gondola', image:productFallbackImage, description:''} : null);
      if (candidate && !matches.some((product) => product.url === candidate.url)) matches.push(candidate);
      if (matches.length === 10) break;
    }
    if (!matches.length) return;
    recentProducts = [...matches, ...recentProducts, ...products].filter((product, index, all) => all.findIndex((candidate) => candidate.url === product.url) === index).slice(0, 10);
    localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
    renderHome();
    const missingImages = recentProducts.filter((product) => product.image === productFallbackImage && product.url);
    await Promise.all(missingImages.map(async (product) => {
      try {
        const official = await fetchProductContent(product);
        if (official?.images?.[0]?.src) product.image = official.images[0].src;
      } catch (_) {}
    }));
    localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
    renderHome();
  }

  function openCategoryDirectoryFromHome() {
    renderCategoryDirectory();
    showView('categoryDirectoryView');
  }

  // Solo identifica chocolates/bombones cuando el título describe el
  // producto principal. No clasifica cereales, barritas u otros artículos
  // que únicamente mencionan chocolate como sabor o ingrediente.
  const actualChocolateProductPattern = /^(?:chocolates?|bombones?|bombonera|tabletas?(?:\s+de)?\s+chocolate|barras?\s+de\s+chocolate|cajas?\s+de\s+chocolates?)\b/;

  const productCategoryRules = [
    [['Carnes y embutidos', 'Carnes y fiambres'], /bresaola|matambrito|pastron|pastrón|\bcarne\b/],
    [['Carnes y embutidos', 'Hamburguesas'], /hamburguesa/],
    [['Carnes y embutidos', 'Chorizos y salchichas'], /chorizo|salchicha/],
    [['Pescados', 'Pescados ahumados'], /salmon|salm[oó]n|pescado ahumado/],
    [['Untables y pastas', 'Pastas de frutos secos'], /pasta(?:\s+untable)?\s+de\s+(?:avellana|caju|cajú|pecan|pecán|pistacho|mani|maní|almendra)/],
    [['Untables y pastas', 'Tahini y pastas de semillas'], /pasta\s+de\s+sesamo|tahini/],
    [['Legumbres y derivados', 'Pastas de legumbres'], /pasta\s+de\s+(?:arveja|lenteja|garbanzo|poroto)/],
    [['Legumbres y derivados', 'Tofu y soja'], /tofu|tofú|proteina\s+de\s+soja|proteína\s+de\s+soja/],
    [['Legumbres y derivados', 'Arvejas'], /\barveja/],
    [['Legumbres y derivados', 'Porotos, lentejas y garbanzos'], /\bporoto|\blenteja|\bgarbanzo/],
    [['Azúcares'], /\bazucar(?:es)?\b/],
    [['Edulcorantes'], /edulcorante|stevia|sucralosa/],
    [['Ingredientes para repostería', 'Levaduras y leudantes'], /levadura|polvo\s+para\s+hornear|bicarbonato/],
    [['Ingredientes para repostería', 'Almidones y féculas'], /fecula|fécula|almidon|almidón/],
    [['Ingredientes para repostería', 'Cacao'], /\bcacao\b/],
    [['Ingredientes para repostería', 'Esencias y decoración'], /\breposteria\b|\brepostería\b|esencia\s+de|\bgranas?\b/],
    [['Frutos secos y deshidratados', 'Frutos secos'], /avellana|\bnueces?\b|pistacho|pecan|pecán|caju|cajú|almendra|\bmani\b|castana|castaña/],
    [['Frutos secos y deshidratados', 'Frutas deshidratadas'], /datil|dátil|damasco|damasaco|ciruela\s+seca|pasas?\s+de\s+uva|cascara\s+de|cáscara\s+de|polvo\s+de\s+(?:limon|limón|mandarina)/],
    [['Frutos secos y deshidratados', 'Coco'], /coco\s+rallado/],
    [['Condimentos'], /\balga|\balaga|wasabi/],
    [['Condimentos', 'Condimentos para hamburguesas'], /(?:condimento|sazonador|especia).*\bhamburguesas?\b/],
    [['Cereales, granos y semillas', 'Cuscús y burgol'], /couscous|cuscus|cuscús|burgol|brugol|bulgur/],
    [['Sopas y caldos', 'Caldos y acompañamientos'], /consome|consomé|caldo|shkedei\s+marak/],
    [['Alimentos saludables', 'Productos de dietética'], /productos?\s+de\s+dietetica|mix\s+fibra/],
    [['Alimentos saludables', 'Proteínas y suplementos'], /suplemento|proteina\s+(?!de\s+soja)|proteína\s+(?!de\s+soja)/],
    [['Bebidas', 'Bebidas alcohólicas', 'Otros destilados'], /bebida\s+alcoholica|bebida\s+alcohólica/],
    [['Bebidas', 'Bebidas sin alcohol', 'Bebidas deportivas'], /gatorade|bebida\s+deportiva|isotonica|isotónica/],
    [['Bebidas', 'Bebidas sin alcohol', 'Kombucha'], /kombucha/],
    [['Bebidas', 'Bebidas sin alcohol', 'Bebidas saborizadas'], /bebida\s+saborizada/],
    [['Cereales, granos y semillas', 'Maíz y polenta'], /\bmaiz\b|polenta|pochoclo|corn\s+flakes|semola\s+de\s+trigo|sémola\s+de\s+trigo/],
    [['Cereales, granos y semillas', 'Granolas'], /granola/],
    [['Cereales, granos y semillas', 'Semillas'], /girasol\s+pelado/],
    [['Frutas y vegetales', 'Frutas en conserva'], /anana|ananá|durazno|ciruela|damasco|damasaco/],
    [['Frutas y vegetales', 'Pulpas de fruta'], /pulpa\s+de/],
    [['Frutas y vegetales', 'Hongos'], /champignon|champiñon|champiñón|hongo/],
    [['Frutas y vegetales', 'Vegetales en conserva'], /arveja|hojas?\s+de\s+parra|alcaparra/],
    [['Frutas y vegetales', 'Vegetales deshidratados'], /espinaca|\bkale\b|vegetales?\s+deshidratados|morron|morrón/],
    [['Condimentos', 'Hierbas y especias'], /azafran|azarfan|azafrán|canela|clavo\s+de\s+olor|curry|jengibre|pimenton|pimentón|paprika|perejil|oregano|orégano|romero|salvia|tomillo|estragon|estragón|hibiscus|chimichurri|\bsales\b|\bhierbas?\b|mix\s+para\s+(?:carnes|ensaladas)/],
    [['Snacks'], /\bchips?\b|\bthins?\b|\bthings\b|\bbamba\b/],
    [['Obleas'], /oblea/],
    [['Caramelos y golosinas'], /pastilla/],
    [['Aceites', 'Aceite de oliva'], /aceite.+oliva|oliva.+aceite/],
    [['Aceites', 'Aceite de girasol'], /aceite.+girasol|girasol.+aceite/],
    [['Aceites', 'Otros aceites'], /\baceite\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Espumantes'], /champagne|espumante/],
    [['Bebidas', 'Bebidas alcohólicas', 'Vinos'], /\bvino|malbec|cabernet|merlot|chardonnay|sauvignon\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Cervezas'], /\bcerveza\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Licores'], /\blicor\b|fernet/],
    [['Bebidas', 'Bebidas alcohólicas', 'Vodkas'], /\bvodka\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Whiskies'], /\bwhisk(?:y|ey)\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Gins'], /\bgin\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Rones'], /\bron\b/],
    [['Bebidas', 'Bebidas sin alcohol', 'Aguas'], /\bagua\b/],
    [['Bebidas', 'Bebidas sin alcohol', 'Jugos'], /\bjugo|zumo|nectar\b/],
    [['Bebidas', 'Bebidas sin alcohol', 'Gaseosas y sodas'], /gaseosa|\bsoda\b|tonica/],
    [['Bebidas', 'Bebidas sin alcohol', 'Bebidas vegetales'], /bebida.+(avena|almendra|soja|coco|arroz)/],
    [['Bebidas', 'Bebidas sin alcohol', 'Energizantes'], /energizante/],
    [['Café'], /\bcafe\b/],
    [['Café'], /nescafe|nescafé/],
    [['Té'], /\bte\b|infusion/],
    [['Yerba mate'], /yerba|\bmate\b/],
    [['Dulce de leche'], /dulce.+leche/],
    [['Lácteos', 'Leches'], /\bleche\b/],
    [['Lácteos', 'Quesos'], /\bqueso/],
    [['Lácteos', 'Yogures'], /yogur/],
    [['Manteca'], /\bmanteca\b/],
    [['Lácteos', 'Cremas'], /\bcrema\b/],
    [['Panadería y repostería', 'Harinas'], /\bharina|premezcla/],
    [['Panadería y repostería', 'Panes'], /\bpan\b|panificad/],
    [['Panadería y repostería', 'Galletitas y tostadas'], /gallet|tostad|bizcoch/],
    [['Panadería y repostería', 'Masas'], /\bmasa\b|tapa.+empanada|tapa.+tarta/],
    [['Chocolates y bombones'], actualChocolateProductPattern],
    [['Caramelos y golosinas'], actualChocolateProductPattern],
    [['Alfajores'], /alfajor/],
    [['Caramelos y golosinas'], /alfajor|oblea|\bbarritas?\b|\bturron(?:es)?\b/],
    [['Turrones'], /\bturron(?:es)?\b/],
    [['Caramelos y golosinas'], /caramelo|golosina|chicle/],
    [['Mermeladas'], /mermelada|jalea/],
    [['Dulces de fruta'], /dulce\s+de\s+(?:batata|membrillo|fruta)|\bbatata\b|\bmembrillo\b/],
    [['Miel'], /\bmiel\b/],
    [['Cereales, granos y semillas', 'Arroz'], /\barroz\b/],
    [['Cereales, granos y semillas', 'Avena'], /\bavena\b/],
    [['Cereales, granos y semillas', 'Quinoa'], /quinoa/],
    [['Cereales, granos y semillas', 'Semillas'], /^(?:semillas?|s[eé]samo|lino|chia|girasol\s+pelado|mix\s+de\s+semillas)\b/],
    [['Cereales, granos y semillas', 'Cereales'], /\bcereal/],
    [['Pastas dulces'], /pastas?\s+dulces?/],
    [['Aderezos', 'Mayonesas'], /mayonesa/],
    [['Aderezos', 'Ketchup'], /ketchup/],
    [['Aderezos', 'Mostaza'], /mostaza/],
    [['Aderezos'], /aderezo|dressing|mayonesa|ketchup|mostaza|salsa\s+(?:golf|cesar|césar|barbacoa|bbq)|alioli|tartara|tártara|ranch/],
    [['Salsas'], /\bsalsa/],
    [['Conservas', 'Pepinos en conserva'], /pepinos?\s+(?:en\s+vinagre|encurtidos?)/],
    [['Vinagres'], /vinagre/],
    [['Condimentos'], /condimento|sazonador|condifran|condifrán/],
    [['Condimentos', 'Hierbas y especias'], /especia|pimienta|\bsal\b/],
    [['Conservas', 'Pescados en conserva'], /atun|sardina|caballa/],
    [['Aceitunas'], /\baceitunas?\b/],
    [['Conservas', 'Vegetales en conserva'], /aceituna|pickle|palmito|conserva/],
    [['Pastas', 'Pastas secas'], /fideo|spaghetti|tallar|pasta seca/],
    [['Pastas', 'Pastas rellenas'], /raviol|sorrentino|capelet/],
    [['Snacks'], /papas fritas/],
    [['Snacks'], /\bsnack|nacho|palito|barrita/],
    [['Frutas y vegetales', 'Frutas'], /\bfruta/],
    [['Papas'], /\bpapas?\b|\bpure\s+de\s+papa\b|\bfecula\s+de\s+papa\b/],
    [['Frutas y vegetales', 'Vegetales'], /vegetal|verdura|tomate|cebolla|ajo/],
    [['Congelados', 'Productos congelados'], /congelad|freezado/]
  ];

  // Reglas de alta confianza. Se evalúan antes que las coincidencias generales
  // para que una palabra secundaria (sabor, uso o ingrediente) no mande un
  // producto a una categoría equivocada.
  const priorityProductCategoryRules = [
    [['Bebidas', 'Bebidas alcohólicas', 'Gins'], /\b(?:beefeater|bombay saphire|bombay sapphire|gordon.?s|plymouth gin|tanqueray|broker.?s)\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Vodkas'], /\b(?:beluga|grey goose|smirnoff|stolichnaya|van gogh blue|skyy)\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Whiskies'], /\b(?:deanston|glen moray|jack daniel.?s|johnnie walker|speyburn|chivas regal)\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Rones'], /\b(?:don q gold|flor de cana|ron abuelo|bacardi|barcelo|mount gay|myers.?s|velho barreiro)\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Tequilas'], /\b(?:patron|el jimador|jose cuervo|ultramark)\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Arak y anisados'], /\b(?:elite arak|zachlawi)\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Licores'], /\b(?:cointreau|disaronno|heering|kahlua|luxardo)\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Vinos'], /\b(?:galilee winery|joseph gold)\b/],
    [['Turrones'], /\bturron(?:es)?\b/],
    // Las papas son una familia que el usuario busca como categoría propia
    // (fritas, congeladas, pay, puré y fécula), no como un vegetal genérico.
    [['Papas'], /\bpapas?\b|\bpure\s+de\s+papa\b|\bfecula\s+de\s+papa\b/],
    [['Congelados', 'Frutas congeladas'], /(?:^|\s)fruta\s+congelad|(?:frambuesa|frutilla|mango|arandanos?)\s+congelad/],
    [['Congelados', 'Vegetales congelados'], /congelad|freezado|cogelad/],
    [['Snacks'], /\bbarritas?\b/],
    [['Panadería y repostería', 'Harinas'], /\bharina\b/],
    [['Panadería y repostería', 'Galletitas y tostadas'], /\bgallet(?:a|as|ita|itas)\b|\bbizcoch|\btostadas?\b/],
    [['Pastas', 'Pastas especiales'], /\b(?:fusilli|spaghetti|tallarines?|coditos|sedanini|ravioles?|sorrentinos?|capeletis?)\b/],
    [['Untables y pastas', 'Pastas de frutos secos'], /mantequilla\s+de\s+mani/],
    [['Manteca'], /manteca\s+parve|veganteca/],
    [['Bebidas', 'Bebidas sin alcohol', 'Bebidas vegetales'], /^bebida\b.*\b(?:avena|almendra|soja|coco|arroz|parve)\b/],
    [['Frutos secos y deshidratados', 'Frutas deshidratadas'], /fruta\s+liofilizada|liofilizad[ao].*\b(?:anana|banana|frutilla|mango|fruta)\b/],
    [['Frutos secos y deshidratados', 'Frutos secos'], /mix\s+frutos\s+tostados|nuez\s+tostada/],
    [['Conservas', 'Frutas en conserva'], /coctel\s+de\s+frutas/],
    [['Conservas', 'Choclos en conserva'], /\bchoclos?\b(?!\s+congelad)(?=.*(?:marca|lata|conserva|enlatad))|crema\s+de\s+choclo\b/],
    [['Condimentos'], /^condimentos?\b|\bsazonador(?:es)?\b|condifran|condifrán/],
    [['Condimentos', 'Hierbas y especias'], /^especias?\b|\bnuez\s+moscada\b/],
    [['Condimentos', 'Pimientas'], /\bpimientas?\b/],
    [['Condimentos', 'Sales'], /(?:^|\s)sal(?:\s|$)|\bsales\b/]
  ];

  function productCategoryPaths(product) {
    const text = normalize(`${product.title} ${product.description || ''}`);
    const titleText = normalize(product.title);
    // La yerba mate y el mate cocido tienen su propia categoría, nunca
    // Condimentos. Este atajo evita que reglas remotas o descripciones
    // demasiado amplias agreguen una clasificación incorrecta.
    if (/\byerba\b|\bmate\b/.test(text)) return [['Yerba mate']];
    const paths = [];
    const separateCondimentPath = (path) => {
      if (!Array.isArray(path)) return [];
      const root = normalize(path[0]);
      if (root !== 'salsas, aderezos y condimentos') return path;
      const child = normalize(path[1] || '');
      if (child === 'aderezos' || child === 'mayonesas' || child === 'ketchup y mostazas') return ['Aderezos', ...path.slice(1)];
      if (child === 'salsas') return ['Salsas', ...path.slice(1)];
      if (child === 'vinagres') return ['Vinagres', ...path.slice(1)];
      if (child) return ['Condimentos', ...path.slice(1)];
      return [];
    };
    const addPath = (path) => {
      let canonicalPath = separateCondimentPath(path);
      const originalRoot = normalize(canonicalPath[0] || '');
      const originalChild = normalize(canonicalPath[1] || '');
      // Los cereales no deben terminar bajo Azúcares solo porque el nombre
      // mencione "azucarado". Esa categoría queda reservada para productos
      // cuyo título realmente es azúcar o edulcorante.
      if (['azucares y endulzantes', 'azucares'].includes(originalRoot)) {
        const sugarPattern = originalChild === 'edulcorantes' ? /edulcorante|stevia|sucralosa/ : /\bazucar(?:es)?\b/;
        if (!sugarPattern.test(titleText)) return;
      }
      if (originalRoot === 'edulcorantes' && !/edulcorante|stevia|sucralosa/.test(titleText)) return;
      // Un condimento para hamburguesas no es una hamburguesa.
      if (originalRoot === 'carnes y embutidos' && originalChild === 'hamburguesas' && /\b(?:condimento|sazonador|especia)\b/.test(text)) return;
      // Un chocolate real con cereal en el título no debe contaminar la
      // familia de cereales; el sabor a chocolate de un cereal sí conserva
      // su clasificación de cereal.
      if (originalRoot === 'cereales, granos y semillas' && actualChocolateProductPattern.test(text)) return;
      // Semillas queda reservada para productos cuyo título es realmente una
      // semilla. Evita que aceite de sésamo, arroz o barritas terminen allí
      // solo porque la descripción menciona un ingrediente.
      if (originalRoot === 'cereales, granos y semillas' && originalChild === 'semillas' && !/^(?:semillas?|s[eé]samo|lino|chia|girasol\s+pelado|mix\s+de\s+semillas)\b/.test(titleText)) return;
      // Aceitunas se muestran como familia principal, no como vegetal en conserva.
      if (originalRoot === 'conservas' && originalChild === 'vegetales en conserva' && /\baceitunas?\b/.test(text)) return;
      // Un pepino en vinagre es una conserva, no un vinagre.
      if (originalRoot === 'vinagres' && /\bpepinos?\b/.test(text)) return;
      // Snacks es una familia principal: sus variantes no abren otra rama.
      if (originalRoot === 'snacks') canonicalPath = ['Snacks'];
      // Café y té son categorías principales, no subcategorías de Infusiones.
      if (originalRoot === 'infusiones') {
        if (/cafe|nescafe/.test(originalChild) || /\bcafe\b|nescafe/.test(text)) canonicalPath = ['Café'];
        else if (/\bte\b|tea|infusion/.test(originalChild) || /\bte\b|tea|infusion/.test(text)) canonicalPath = ['Té'];
        else return;
      }
      // La manteca tiene su propia categoría principal, incluso si una regla
      // remota todavía la entrega dentro de Lácteos.
      if (originalRoot === 'lacteos' && originalChild === 'mantecas y cremas' && /\bmanteca\b/.test(text)) return;
      // Cada subfamilia de Cereales, granos y semillas pasa al listado
      // principal: Arroz, Avena, Maíz, Quinoa, Semillas, etc.
      if (originalRoot === 'cereales, granos y semillas') canonicalPath = [canonicalPath[1] || 'Cereales'];
      // Maíz y polenta son una sola familia. Unificamos también los caminos
      // que puedan llegar desde reglas remotas o datos antiguos como "Maíz".
      if (['maiz', 'maiz y polenta'].includes(normalize(canonicalPath[0] || ''))) canonicalPath = ['Maíz y polenta'];
      // Azúcar y edulcorantes son búsquedas distintas para el usuario.
      if (originalRoot === 'azucares y endulzantes') canonicalPath = originalChild === 'edulcorantes' ? ['Edulcorantes'] : ['Azúcares'];
      const root = normalize(canonicalPath[0] || '');
      if (!canonicalPath.length || root === 'dulces y golosinas' || canonicalPath.some((part) => normalize(part) === 'cocina internacional')) return;
      if (!paths.some((candidate) => candidate.join('|') === canonicalPath.join('|'))) paths.push(canonicalPath);
    };
    const priorityMatch = priorityProductCategoryRules.find(([, pattern]) => pattern.test(text));
    if (priorityMatch) addPath(priorityMatch[0]);
    // Los productos identificados como cereales se convierten a la categoría
    // principal "Cereales" mediante la normalización de addPath().
    if (/\bcereales?\b|\bcopos de maiz\b/.test(text)) addPath(['Cereales, granos y semillas', 'Cereales']);
    const remoteMatch = remoteTaxonomyRules.find((rule) => !rule.path.some((part) => normalize(part) === 'cocina internacional') && rule.keywords.some((keyword) => text.includes(keyword)));
    if (remoteMatch) addPath(remoteMatch.path);
    // A product may belong to multiple useful branches. This improves
    // discovery without changing the primary path used in product cards.
    productCategoryRules.forEach(([path, pattern]) => { if (pattern.test(text)) addPath(path); });
    if (paths.length) return paths;
    const fallback = {gondola:'Productos de góndola', planta:'Productos de plantas certificadas', especial:'Producción especial', uruguay:'Productos de Uruguay'};
    return [['Otros productos', fallback[product.cat] || 'Sin clasificar']];
  }

  function productCategoryPath(product) {
    return productCategoryPaths(product)[0];
  }

  function productsAtPath(path) {
    return products.filter((product) => productCategoryPaths(product).some((candidate) => path.every((part, index) => candidate[index] === part)));
  }

  function categoryDirectory(path = []) {
    const grouped = new Map();
    productsAtPath(path).forEach((product) => {
      productCategoryPaths(product).forEach((categoryPath) => {
        if (!path.every((part, index) => categoryPath[index] === part)) return;
        const name = categoryPath[path.length];
        if (!name) return;
        if (!grouped.has(name)) grouped.set(name, []);
        if (!grouped.get(name).some((candidate) => candidate.url === product.url)) grouped.get(name).push(product);
      });
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', {sensitivity:'base'}));
  }

  function renderCategoryDirectory() {
    activeCategoryPath = [];
    $('#alphabeticalCategoryList').innerHTML = taxonomyRows(categoryDirectory(), []);
  }

  function taxonomyIcon(name) {
    const key = normalize(name);
    const icon = /salsa|condimento/.test(key) ? 'bowl-food' :
      /aderezo|mayonesa|ketchup|mostaza/.test(key) ? 'jar' :
      /papa/.test(key) ? 'popcorn' :
      /frutas?\s+secas?|deshidratad/.test(key) ? 'sun' :
      /frutos?\s+secos?/.test(key) ? 'leaf' :
      /dietetica/.test(key) ? 'heart' :
      /frutas y vegetales/.test(key) ? 'carrot' :
      /carnes|fiambres|hamburguesas|chorizos|salchichas/.test(key) ? 'hamburger' :
      /pescado|salmon/.test(key) ? 'fish-simple' : /vino/.test(key) ? 'wine' :
      /cerveza/.test(key) ? 'beer-bottle' : /espumante/.test(key) ? 'champagne' :
      /alcohol|licor|destilado/.test(key) ? 'martini' : /agua/.test(key) ? 'drop' :
      /jugo|fruta/.test(key) ? 'orange' : /energizante|deportiva/.test(key) ? 'lightning' :
      /kombucha|saborizada|gaseosa|soda|bebida/.test(key) ? 'beer-bottle' : /cafe/.test(key) ? 'coffee' :
      /yerba|mate/.test(key) ? 'coffee-bean' : /infusion|\bte\b/.test(key) ? 'tea-bag' :
      /aceituna/.test(key) ? 'orange' : /aceite|vinagre/.test(key) ? 'flask' : /queso/.test(key) ? 'cheese' :
      /manteca|lacteo|leche/.test(key) ? 'cow' : /yogur|untable|pasta de frutos|tahini/.test(key) ? 'jar' :
      /panes|panaderia/.test(key) ? 'bread' : /reposteria|harina|levadura|leudante|esencia|decoracion|cacao/.test(key) ? 'cake' :
      /gallet|tostada|oblea/.test(key) ? 'cookie' : /chocolate/.test(key) ? 'cookie' :
      /golosina|caramelo|pastilla/.test(key) ? 'sparkle' : /miel/.test(key) ? 'jar' :
      /azucar|endulzante/.test(key) ? 'cube' : /arroz/.test(key) ? 'bowl-food' : /cereal|grano|semilla|avena|maiz|quinoa|granola|polenta|cuscus|burgol/.test(key) ? 'plant' :
      /legumbre|arveja|poroto|lenteja|tofu|soja/.test(key) ? 'plant' :
      /salsa|aderezo|condimento|mayonesa|ketchup|mostaza|especia|hierba|pimienta|sales?/.test(key) ? 'bowl-food' : /conserva|enlatado/.test(key) ? 'jar' :
      /pasta|fideo|raviol/.test(key) ? 'bowl-food' : /snack|barrita|papas fritas|chips|bocadito/.test(key) ? 'popcorn' :
      /vegetal|verdura|hongo/.test(key) ? 'carrot' : /congelado/.test(key) ? 'snowflake' : /sopa|caldo/.test(key) ? 'bowl-steam' :
      /saludable|proteina|suplemento/.test(key) ? 'heart' : /cocina internacional|asiatico/.test(key) ? 'globe-hemisphere-west' : 'package';
    return phosphorIcon(icon, 'taxonomy-icon', 'regular');
  }

  function taxonomyTone(name) {
    return `tone-${[...normalize(name)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5}`;
  }

  function categoryDisplayName(name) {
    return ({
      'Autorizados en góndolas': 'Productos autorizados',
      'Cereales, granos y semillas': 'Cereales y granos',
      'Ingredientes para repostería': 'Repostería e ingredientes',
      'Frutos secos y deshidratados': 'Frutos secos y frutas secas',
      'Untables y pastas': 'Untables y pastas'
    })[name] || name;
  }

  function taxonomyRows(rows, parentPath) {
    return rows.map(([name, items]) => {
      const path = [...parentPath, name];
      return `<button class="alphabetical-category-row" type="button" data-taxonomy-path="${encodeURIComponent(JSON.stringify(path))}"><span class="alphabetical-category-icon ${taxonomyTone(name)}">${taxonomyIcon(name)}</span><span><strong>${escapeHtml(categoryDisplayName(name))}</strong><small>${items.length.toLocaleString('es-AR')} ${items.length === 1 ? 'producto' : 'productos'}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`;
    }).join('');
  }

  function openTaxonomyPath(path) {
    activeCategoryPath = path;
    const children = categoryDirectory(path);
    const name = path.at(-1);
    const displayName = categoryDisplayName(name);
    if (children.length) {
      $('#subcategoryDirectoryTop').textContent = displayName;
      $('#subcategoryDirectoryTitle').textContent = displayName;
      $('#subcategoryDirectoryMeta').textContent = `${children.length} ${children.length === 1 ? 'subcategoría' : 'subcategorías'}`;
      $('#subcategoryList').innerHTML = taxonomyRows(children, path);
      showView('subcategoryDirectoryView');
      return;
    }
    const items = productsAtPath(path).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    $('#categoryProductsTop').textContent = displayName;
    $('#categoryProductsTitle').textContent = displayName;
    $('#categoryProductsMeta').textContent = `${items.length.toLocaleString('es-AR')} ${items.length === 1 ? 'producto' : 'productos'}`;
    renderProductCollection($('#categoryProductList'), items, `<div class="empty-state"><svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16M6 7.5v11h12v-11M9 7.5V5h6v2.5M9 11v4M15 11v4"/></svg><strong>Todavía no hay productos en esta categoría</strong><span>La sección queda lista para mostrar nuevos aderezos cuando sean publicados en el catálogo oficial.</span></div>`);
    showView('categoryProductsView');
  }

  function renderSearchCategories() {
    const regions = `<div class="region-switch" role="group" aria-label="País del catálogo"><button class="${selectedRegion === 'argentina' ? 'active' : ''}" type="button" data-region="argentina" aria-pressed="${selectedRegion === 'argentina'}"><span class="category-icon category-flag category-flag-arg"><img src="assets/flag-argentina.svg" alt=""></span><span>Argentina</span></button><button class="${selectedRegion === 'uruguay' ? 'active' : ''}" type="button" data-region="uruguay" aria-pressed="${selectedRegion === 'uruguay'}">${categoryIcon('uruguay')}<span>Uruguay</span></button></div>`;
    const popularitySource = Object.keys(globalPopularity).length ? globalPopularity : popularity;
    const popular = products.filter((product) => product.image).sort((a, b) => ((popularitySource[b.url]?.score || 0) || ((popularitySource[b.url]?.searches || 0) + (popularitySource[b.url]?.opens || 0))) - ((popularitySource[a.url]?.score || 0) || ((popularitySource[a.url]?.searches || 0) + (popularitySource[a.url]?.opens || 0)))).slice(0, 6);
    const popularMarkup = popular.length ? `<div class="popular-searches"><strong>Más buscados</strong><div class="popular-searches-track">${popular.map((product) => `<button class="popular-search-card" type="button" data-product="${escapeHtml(product.url)}" aria-label="Ver ${escapeHtml(product.title)}"><img class="asset-loading" src="${escapeHtml(product.image)}" alt="" loading="eager"><span>${escapeHtml(compactProductTitle(product.title))}</span></button>`).join('')}</div></div>` : '';
    $('#searchCategories').innerHTML = `<div class="region-shortcut-wrap" aria-label="Filtro de país">${regions}</div>${popularMarkup}`;
    $('#recentSearches').innerHTML = '';
  }

  function productImage(product) {
    return `<img class="asset-loading" src="${escapeHtml(product.image || productFallbackImage)}" alt="${escapeHtml(product.title)}" onload="this.classList.remove('asset-loading','asset-error');this.classList.add('asset-ready')" onerror="this.onerror=null;this.src='${productFallbackImage}';this.classList.add('asset-loading');this.classList.remove('asset-ready','asset-error')">`;
  }

  function cleanDisplayText(value) {
    return clean(String(value || '')
      .replace(/certifiacion/gi, 'certificación')
      .replace(/[→➜➝➞⟶›▶►]+/g, ' ')
      .replace(/»([^»]+)»/g, '«$1»'));
  }

  function styledBrandText(value) {
    const text = cleanDisplayText(value);
    const cleanBrand = (brand) => brand.replace(/^[«»"“”]+|[«»"“”]+$/g, '').trim();
    const formatQuotedBrands = (source) => {
      const quotedBrand = /«\s*([^»]+?)\s*»/g;
      let result = '';
      let cursor = 0;
      let quoted;
      while ((quoted = quotedBrand.exec(source))) {
        result += escapeHtml(source.slice(cursor, quoted.index));
        result += `<span class="brand-separator" aria-hidden="true">—</span><span class="brand-name">${escapeHtml(cleanBrand(quoted[1]))}</span>`;
        cursor = quoted.index + quoted[0].length;
      }
      return `${result}${escapeHtml(source.slice(cursor))}`;
    };
    const quotedMatch = text.match(/\b(marca)\s+(«[^»]+»|“[^”]+”|"[^"]+")/i);
    const match = quotedMatch || text.match(/\b(marca)\s+(.+?)(?=\s+(?:sabor|tipo|variedad|presentacion|presentación|azucarados|classic)\b|[,.;:()–—-]|$)/i);
    if (!match) return formatQuotedBrands(text);
    const start = match.index;
    const end = start + match[0].length;
    return `${escapeHtml(text.slice(0, start))}<span class="brand-separator" aria-hidden="true">—</span><span class="brand-name">${escapeHtml(cleanBrand(match[2]))}</span>${formatQuotedBrands(text.slice(end))}`;
  }

  function compactProductTitle(value) {
    const text = cleanDisplayText(value);
    const match = text.match(/\bmarca\s+(«[^»]+»|“[^”]+”|"[^"]+")/i);
    if (!match) return text.replace(/[«»“”"]/g, '').replace(/\s+/g, ' ').trim();
    const brand = match[1].replace(/^[«»"“”]+|[«»"“”]+$/g, '').trim();
    return `${text.slice(0, match.index).trim()} · ${brand}${text.slice(match.index + match[0].length)}`.replace(/\s+/g, ' ').trim();
  }

  function filtered(query) {
    const term = normalize(query);
    const searchTokens = term.split(/\s+/).filter((token) => token.length > 1 && !['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'marca'].includes(token));
    return products.map((product) => {
      const isUruguay = product.cat === 'uruguay' || product.category === 'uruguay';
      const matchesRegion = selectedRegion === 'all' || (selectedRegion === 'uruguay' ? isUruguay : !isUruguay);
      const matchesCategory = selectedCategory === 'all' || (selectedCategory === 'gondola' ? product.cat === 'gondola' && !isUruguay : product.cat === selectedCategory);
      const matchesFavorite = !favoriteOnly || favorites.has(product.url);
      const taxonomyPath = productCategoryPath(product);
      const taxonomyText = [...taxonomyPath, ...taxonomyPath.map(categoryDisplayName)].join(' ');
      const sourceCategory = categoryFor(product.cat);
      const titleText = normalize(`${product.title} ${product.brand || ''}`);
      const text = normalize(`${titleText} ${product.barcode || ''} ${product.description || ''} ${taxonomyText} ${sourceCategory?.name || ''} ${sourceCategory?.desc || ''}`);
      const matchesSearch = !term || text.includes(term) || searchTokens.every((token) => text.includes(token));
      if (!(matchesRegion && matchesCategory && matchesFavorite && matchesSearch)) return null;
      if (!term) return {product, relevance:0};
      const titleTokens = new Set(titleText.split(/[^a-z0-9]+/).filter(Boolean));
      const brandText = normalize(product.brand || '');
      const taxonomySourceText = normalize(`${taxonomyText} ${sourceCategory?.name || ''} ${sourceCategory?.desc || ''}`);
      const exactTitleTokens = searchTokens.filter((token) => titleTokens.has(token)).length;
      const exactBrandTokens = searchTokens.filter((token) => brandText.split(/[^a-z0-9]+/).includes(token)).length;
      const relevance = (titleText.startsWith(term) ? 90 : 0)
        + (titleText.includes(term) ? 120 : 0)
        + exactTitleTokens * 45
        + exactBrandTokens * 30
        + (brandText.includes(term) ? 24 : 0)
        + (taxonomySourceText.includes(term) ? 5 : 0)
        + (text.includes(term) ? 1 : 0);
      return {product, relevance};
    }).filter(Boolean).sort((a, b) => b.relevance - a.relevance || a.product.title.localeCompare(b.product.title, 'es')).map(({product}) => product);
  }

  function productMarkup(product) {
    const taxonomyPath = productCategoryPath(product).map(categoryDisplayName);
    const categoryLabel = taxonomyPath.length ? taxonomyPath.join(' · ') : 'Catálogo oficial';
    return `<button class="product" data-product="${escapeHtml(product.url)}"><span class="product-media">${productImage(product)}${uruguayBadge(product)}</span><span><small class="cat">${escapeHtml(categoryLabel)}</small><strong>${styledBrandText(product.title)}</strong></span><span class="save" data-favorite="${escapeHtml(product.url)}" aria-label="${favorites.has(product.url) ? 'Quitar de guardados' : 'Guardar producto'}">${bookmarkIcon(favorites.has(product.url))}</span></button>`;
  }

  function observeLoadMore() {
    resultObserver?.disconnect();
    const trigger = visibleProductTarget?.querySelector('[data-load-more-products]');
    if (!trigger || !('IntersectionObserver' in window)) return;
    resultObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) appendProductBatch();
    }, {rootMargin:'320px 0px'});
    resultObserver.observe(trigger);
  }

  function appendProductBatch() {
    if (!visibleProductTarget?.isConnected || visibleProductCursor >= visibleProducts.length) return;
    resultObserver?.disconnect();
    visibleProductTarget.querySelector('[data-load-more-products]')?.remove();
    const next = visibleProducts.slice(visibleProductCursor, visibleProductCursor + RESULT_BATCH_SIZE);
    visibleProductTarget.insertAdjacentHTML('beforeend', next.map(productMarkup).join(''));
    visibleProductCursor += next.length;
    if (visibleProductCursor < visibleProducts.length) {
      const remaining = visibleProducts.length - visibleProductCursor;
      visibleProductTarget.insertAdjacentHTML('beforeend', `<button class="load-more-products" type="button" data-load-more-products><span>Mostrar más productos</span><small>${remaining.toLocaleString('es-AR')} restantes</small></button>`);
      observeLoadMore();
    }
  }

  function renderProductCollection(target, items, emptyMarkup = '') {
    resultObserver?.disconnect();
    visibleProducts = items;
    visibleProductCursor = 0;
    visibleProductTarget = target;
    target.innerHTML = '';
    if (!items.length) {
      target.innerHTML = emptyMarkup;
      return;
    }
    appendProductBatch();
  }

  function renderSearchScope() {
    const scope = $('#searchScope');
    const label = $('#searchScopeLabel');
    if (!scope || !label) return;
    const category = selectedCategory !== 'all' ? categoryFor(selectedCategory) : null;
    if (!category) {
      scope.hidden = true;
      label.textContent = '';
      return;
    }
    label.textContent = category.name;
    scope.hidden = false;
  }

  function renderResults(query = '') {
    const result = filtered(query);
    const title = favoriteOnly ? 'Guardados' : query ? 'Resultados' : selectedCategory !== 'all' ? categoryFor(selectedCategory).name : selectedRegion === 'all' ? 'Todos los productos' : selectedRegion === 'uruguay' ? 'Uruguay' : 'Argentina';
    $('#resultsTitle').textContent = title;
    $('#resultsMeta').textContent = `${result.length.toLocaleString('es-AR')} ${result.length === 1 ? 'producto' : 'productos'} en esta vista`;
    renderSearchScope();
    $('#results').hidden = false;
    $('#searchCategories').hidden = true;
    $('#recentSearches').hidden = true;
    renderProductCollection($('#productList'), result, `<div class="empty-state"><svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5h5"/></svg><strong>No encontramos productos</strong><span>Probá con otra marca, nombre o categoría.</span><button class="text-btn" id="emptyReset">Hacer nueva búsqueda</button></div>`);
    $('#emptyReset')?.addEventListener('click', () => { $('#query').value = ''; $('#clear').hidden = true; selectedCategory = 'all'; favoriteOnly = false; renderSearchScope(); renderSearchCategories(); $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; $('#query').focus(); });
  }

  function renderSaved() {
    const items = products.filter((product) => favorites.has(product.url)).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    $('#savedMeta').textContent = items.length
      ? `${items.length.toLocaleString('es-AR')} ${items.length === 1 ? 'producto guardado' : 'productos guardados'}`
      : 'Todavía no guardaste productos.';
    renderProductCollection($('#savedProductList'), items, `<div class="empty-state saved-empty-state">${bookmarkIcon(false)}<strong>No hay productos guardados</strong><span>Cuando guardes un producto, aparecerá en esta pantalla.</span></div>`);
  }

  function restoreSearchForm() {
    const searchForm = $('#searchForm');
    const mobileSearchDock = $('.bottom-nav');
    if (!searchForm || !mobileSearchDock || !searchFormHome) return;
    if (searchForm.parentElement === mobileSearchDock) {
      searchFormHome.parent.insertBefore(searchForm, searchFormHome.before);
      searchForm.hidden = false;
    }
    mobileSearchDock.classList.remove('search-mode', 'has-query');
    $('#searchView')?.style.removeProperty('--search-dock-space');
  }

  function setSearchHomeHidden(hidden) {
    const topbar = $('.topbar');
    if (!topbar || !window.matchMedia('(max-width: 700px)').matches) return;
    if (hidden) topbar.setAttribute('hidden', '');
    else topbar.removeAttribute('hidden');
  }

  function rememberSearchViewportBaseline() {
    const visualHeight = Number(window.visualViewport?.height) || 0;
    const layoutHeight = Number(window.innerHeight) || 0;
    const height = Math.max(visualHeight, layoutHeight);
    if (height > 0) searchViewportBaseline = height;
  }

  function updateSearchDockSpace() {
    if (!window.matchMedia('(max-width: 700px)').matches || !document.body.classList.contains('search-open')) return;
    const searchView = $('#searchView');
    const dock = $('.bottom-nav.search-mode');
    if (!searchView || !dock) return;
    const viewTop = searchView.getBoundingClientRect().top;
    const dockBottom = dock.getBoundingClientRect().bottom;
    const safeSpace = 12;
    const requiredSpace = Math.max(0, Math.ceil(dockBottom - viewTop + safeSpace));
    searchView.style.setProperty('--search-dock-space', `${requiredSpace}px`);
  }

  const scheduleSearchDockSpace = () => window.requestAnimationFrame(updateSearchDockSpace);
  window.addEventListener('resize', scheduleSearchDockSpace, {passive:true});
  window.visualViewport?.addEventListener('resize', scheduleSearchDockSpace, {passive:true});

  function showView(viewId, {preserveSearch = false} = {}) {
    if (viewId !== 'searchView') {
      document.body.classList.remove('search-open');
      setSearchHomeHidden(false);
      restoreSearchForm();
    }
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
    document.querySelectorAll('.nav').forEach((button) => button.classList.toggle('active', button.dataset.view === viewId));
    if (viewId === 'searchView' && !preserveSearch) { renderSearchCategories(); $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; }
    if (viewId === 'timelineView') renderCatalogTimeline();
    if (viewId === 'alertsView') {
      markAlertsSeen();
      renderAlerts();
    }
    if (viewId === 'notificationsView') { setPushNotificationBadge(false); renderPushNotifications(); }
    if (viewId === 'moreView') renderMore();
    if (viewId === 'savedView') renderSaved();
    // En el teléfono desplaza la ventana; en la vista de escritorio de Vite,
    // el desplazamiento vive dentro del marco que simula el dispositivo.
    window.scrollTo(0,0);
    const appShell = document.querySelector('.app');
    if (appShell) appShell.scrollTop = 0;
  }

  function renderPushNotifications() {
    const list = $('#pushNotificationList');
    if (!list) return;
    renderNotificationPermission();
    $('#notificationsMeta').textContent = pushNotifications.length ? `${pushNotifications.length} aviso${pushNotifications.length === 1 ? '' : 's'} recibido${pushNotifications.length === 1 ? '' : 's'}.` : 'Todavía no recibiste avisos push.';
    list.innerHTML = pushNotifications.length ? pushNotifications.map((item) => {
      const playUrl = trustedPlayStoreUrl(item.url);
      const link = playUrl ? `<button class="push-notification-link" data-push-link="${escapeHtml(playUrl)}" type="button">Abrir en Google Play <span aria-hidden="true">›</span></button>` : '';
      return `<article class="push-notification-item"><span class="push-notification-icon">✓</span><div><strong>${escapeHtml(item.title || 'Novedad del catálogo')}</strong><p>${escapeHtml(item.body || 'Hay una actualización disponible.')}</p><small>${escapeHtml(item.time || '')}</small>${link}</div></article>`;
    }).join('') : '<div class="empty-state"><strong>No hay notificaciones</strong><span>Cuando llegue un aviso nuevo, aparecerá acá.</span></div>';
  }

  function renderNotificationPermission() {
    const status = localStorage.getItem('iht_push_status');
    const active = status === 'active';
    const failed = status === 'error' || status === 'unavailable';
    document.querySelectorAll('.notification-permission').forEach((container) => {
      container.classList.toggle('active', active);
      container.innerHTML = active
        ? '<strong>Notificación push activada</strong><button class="push-disable" data-disable-notifications type="button">Desactivar <span aria-hidden="true">›</span></button>'
        : `<strong>${failed ? 'No pudimos activar los avisos push' : 'Recibí avisos push de novedades'}</strong><button class="text-btn" data-enable-notifications type="button">${failed ? 'Reintentar' : 'Activar avisos'}</button>`;
    });
  }

  function setPushNotificationBadge(hasNew) {
    const value = Boolean(hasNew);
    $('#headerNotificationDot').hidden = !value;
    $('#headerNotifications')?.classList.toggle('has-alerts', value);
  }

  function setCatalogAlertBadge(hasNew) {
    const value = Boolean(hasNew);
    $('#navDot').hidden = !value;
    $('.nav[data-view="alertsView"]')?.classList.toggle('has-alerts', value);
  }

  function alertHasItems(items) {
    const groups = Array.isArray(items) ? alertGroups(items) : (items || {});
    return realAlertItems(groups.alta).length > 0 || realAlertItems(groups.baja).length > 0;
  }

  function alertSignature(items) {
    const groups = Array.isArray(items) ? alertGroups(items) : (items || {});
    return ['alta', 'baja'].map((key) => realAlertItems(groups[key]).map((item) => {
      const text = typeof item === 'string' ? item : item?.text || '';
      const url = typeof item === 'string' ? '' : item?.url || '';
      return `${normalize(text)}|${url}`;
    }).join('||')).join('###');
  }

  function markAlertsSeen(items = alertCache?.items) {
    const signature = alertSignature(items);
    if (signature) localStorage.setItem('iht_alerts_seen_signature', signature);
    localStorage.setItem('iht_alerts_seen_at', String(Date.now()));
    setCatalogAlertBadge(false);
  }

  function refreshAlertBadge() {
    if (document.querySelector('.view.active')?.id === 'alertsView') return;
    const seenAt = Number(localStorage.getItem('iht_alerts_seen_at') || 0);
    const fetchedAt = Number(alertCache?.fetchedAt || 0);
    const signature = alertSignature(alertCache?.items);
    let seenSignature = localStorage.getItem('iht_alerts_seen_signature') || '';
    // Migrate the previous timestamp-based state so alerts already opened in
    // an older version do not reappear just because the cache was refreshed.
    if (!seenSignature && seenAt && fetchedAt && seenAt >= fetchedAt && signature) {
      seenSignature = signature;
      localStorage.setItem('iht_alerts_seen_signature', signature);
    }
    setCatalogAlertBadge(alertHasItems(alertCache?.items) && signature !== seenSignature);
  }

  function restoreSearchScreen() {
    const searchForm = $('#searchForm');
    const mobileSearchDock = window.matchMedia('(max-width: 700px)').matches ? $('.bottom-nav') : null;
    if (mobileSearchDock && !document.body.classList.contains('search-open')) rememberSearchViewportBaseline();
    // Aplicar el estado antes de mover el formulario evita un frame intermedio
    // del home mientras Android redimensiona el WebView por el teclado.
    if (mobileSearchDock) {
      document.body.classList.add('search-open');
    }
    setSearchHomeHidden(true);
    searchForm.hidden = false;
    if (mobileSearchDock) {
      if (!searchFormHome) searchFormHome = {parent: searchForm.parentElement, before: $('#recentSearches')};
      if (searchForm.parentElement !== mobileSearchDock) mobileSearchDock.append(searchForm);
      mobileSearchDock.classList.add('search-mode');
      mobileSearchDock.classList.toggle('has-query', Boolean($('#query').value.trim()));
      updateSearchDockSpace();
    }
    showView('searchView', {preserveSearch:true});
    updateSearchScanAction(Boolean($('#query').value.trim()));
    $('#clear').hidden = !$('#query').value;
    $('#query').blur();
  }

  function focusSearchAfterLayout() {
    window.clearTimeout(searchFocusTimer);
    searchFocusTimer = window.setTimeout(() => {
      if (!document.body.classList.contains('search-open')) return;
      $('#query')?.focus({preventScroll:true});
      updateSearchDockSpace();
    }, 220);
  }

  function openSavedScreen() {
    favoriteOnly = false;
    document.activeElement?.blur();
    $('#query')?.blur();
    $('#homeQuery')?.blur();
    showView('savedView');
  }

  function openSearchScreen() {
    selectedRegion = 'argentina';
    selectedCategory = 'all';
    favoriteOnly = false;
    window.clearTimeout(searchFocusTimer);
    const searchForm = $('#searchForm');
    searchForm.hidden = false;
    const mobileSearchDock = window.matchMedia('(max-width: 700px)').matches ? $('.bottom-nav') : null;
    if (mobileSearchDock && !document.body.classList.contains('search-open')) rememberSearchViewportBaseline();
    // El estado visual cambia antes del reparenting para evitar un frame
    // intermedio del home en WebView móvil.
    if (mobileSearchDock) {
      document.body.classList.add('search-open');
    }
    setSearchHomeHidden(true);
    if (mobileSearchDock) {
      if (!searchFormHome) searchFormHome = { parent: searchForm.parentElement, before: $('#recentSearches') };
      if (searchForm.parentElement !== mobileSearchDock) mobileSearchDock.append(searchForm);
      mobileSearchDock.classList.add('search-mode');
      updateSearchDockSpace();
    }
    showView('searchView');
    $('#query').value = $('#homeQuery').value;
    $('.bottom-nav').classList.toggle('has-query', Boolean($('#query').value));
    updateSearchScanAction(Boolean($('#query').value.trim()));
    $('#clear').hidden = !$('#query').value;
    startSearchPlaceholders();
    focusSearchAfterLayout();
  }

  function startSearchPlaceholders() {
    window.clearInterval(searchPlaceholderTimer);
    const input = $('#query');
    if (!input || input.value.trim()) return;
    let index = 0;
    input.placeholder = searchPlaceholders[index];
    searchPlaceholderTimer = window.setInterval(() => {
      if (input.value.trim()) return window.clearInterval(searchPlaceholderTimer);
      index = (index + 1) % searchPlaceholders.length;
      input.classList.add('placeholder-changing');
      window.clearTimeout(searchPlaceholderSwapTimer);
      searchPlaceholderSwapTimer = window.setTimeout(() => {
        input.placeholder = searchPlaceholders[index];
        input.classList.remove('placeholder-changing');
      }, 220);
      }, 2700);
  }

  function startHomePlaceholders() {
    window.clearInterval(homePlaceholderTimer);
    const input = $('#homeQuery');
    if (!input || input.value.trim()) return;
    let index = 0;
    input.placeholder = searchPlaceholders[index];
    homePlaceholderTimer = window.setInterval(() => {
      if (input.value.trim()) return window.clearInterval(homePlaceholderTimer);
      index = (index + 1) % searchPlaceholders.length;
      input.classList.add('placeholder-changing');
      window.clearTimeout(homePlaceholderSwapTimer);
      homePlaceholderSwapTimer = window.setTimeout(() => {
        input.placeholder = searchPlaceholders[index];
        input.classList.remove('placeholder-changing');
      }, 220);
    }, 2700);
  }

  function updateSearchScanAction(hasText) {
    const button = $('#searchScan');
    if (!button) return;
    button.classList.toggle('is-clear', hasText);
    button.innerHTML = hasText ? '<span aria-hidden="true">×</span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6V4h2M18 4h2v2M4 18v2h2M20 18v2h-2M8 8v8M10.5 8v8M13.5 8v8M16 8v8"/></svg>';
    button.setAttribute('aria-label', hasText ? 'Borrar búsqueda' : 'Abrir escáner de código de barras');
    button.onclick = hasText ? () => { $('#query').value = ''; updateSearchScanAction(false); $('#clear').hidden = true; $('.bottom-nav').classList.remove('has-query'); $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; startSearchPlaceholders(); $('#query').focus(); } : openScanner;
  }

  function returnHome() {
    window.clearTimeout(searchFocusTimer);
    // No vuelvas a animar ni a reconstruir el home si ya estamos ahí. Esto
    // evita el destello al tocar Inicio varias veces seguidas.
    if (document.querySelector('.view.active')?.id === 'homeView' && !document.body.classList.contains('search-open')) return;
    // El botón/gesto de atrás debe cerrar el buscador completo. En Android el
    // teclado no desaparece en el mismo frame que blur(); si mostramos Home
    // inmediatamente, aparece un frame de Home con el teclado todavía arriba.
    // Conservamos search-open hasta que la ventana visual se estabilice.
    if (searchCloseTimer) return;
    const mobileSearchDock = searchFormHome ? $('.bottom-nav') : null;
    const viewport = window.visualViewport;
    const activeInput = document.activeElement?.matches?.('input, textarea, [contenteditable="true"]');
    const screenHeight = Number(window.screen?.height) || window.innerHeight;
    const currentViewportHeight = Math.max(Number(viewport?.height) || 0, Number(window.innerHeight) || 0);
    const baselineHeight = searchViewportBaseline || screenHeight;
    const viewportLooksShrunk = currentViewportHeight > 0 && currentViewportHeight < baselineHeight - 80;
    // En Android el botón/gesto de volver puede entregar el evento después de
    // que el input perdió el foco. El formulario sigue dentro del dock, por
    // lo que el cierre debe tratarse como un cierre con IME potencialmente
    // abierto aunque activeElement ya no sea el input.
    const keyboardWasOpen = Boolean(mobileSearchDock && (activeInput || viewportLooksShrunk || $('#searchForm')?.parentElement === mobileSearchDock));
    // Durante el cierre Android redimensiona el WebView varias veces. Home se
    // muestra de inmediato y el nav queda oculto hasta que el IME termina.
    const closingSearchView = document.querySelector('.view.active')?.id === 'searchView';
    if (closingSearchView) document.body.classList.add('search-closing');
    document.activeElement?.blur();
    $('#query')?.blur();
    $('#homeQuery')?.blur();

    const finish = () => {
      window.clearTimeout(searchCloseTimer);
      searchCloseTimer = null;
      if (searchCloseViewport && searchCloseViewportHandler) {
        searchCloseViewport.removeEventListener('resize', searchCloseViewportHandler);
      }
      searchCloseViewport = null;
      searchCloseViewportHandler = null;

      // Reparentar antes de quitar search-open mantiene todos los cambios en
      // una sola tarea de layout: Android nunca llega a pintar el Home con el
      // formulario todavía dentro del nav superior del buscador.
      if (mobileSearchDock) restoreSearchForm();
      showView('homeView');
      selectedCategory = 'all';
      favoriteOnly = false;
      $('#homeQuery').value = '';
      $('#query').value = '';
      $('#homeClear').hidden = true;
      $('#clear').hidden = true;

      // No revelamos el nav hasta que el viewport recupera la altura previa
      // al teclado. En Android pueden quedar uno o dos resize pendientes aun
      // después de que Home ya fue activado.
      if (mobileSearchDock && keyboardWasOpen) {
        const revealStartedAt = performance.now();
        const revealNav = () => {
          const currentHeight = Math.max(Number(viewport?.height) || 0, Number(window.innerHeight) || 0);
          const viewportRestored = !viewport || currentHeight >= baselineHeight - 40 || currentHeight >= screenHeight - 120;
          const revealDeadlineReached = performance.now() - revealStartedAt >= (viewport ? 1400 : 0);
          if (!viewportRestored && !revealDeadlineReached) {
            searchCloseTimer = window.setTimeout(revealNav, 70);
            return;
          }
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            searchCloseTimer = null;
            document.body.classList.remove('search-closing');
            searchViewportBaseline = 0;
          }));
        };
        revealNav();
      } else {
        document.body.classList.remove('search-closing');
        searchViewportBaseline = 0;
      }
    };

    // Home se activa en el mismo evento de la flecha. El teclado puede seguir
    // animándose en Android, pero esa animación ya no debe bloquear la vista
    // ni dejar una pantalla blanca entre el buscador y Home.
    finish();
  }

  function doSearch(input, fromHome = false) {
    const value = clean(input.value);
    if (!value) return;
    countPopularity(`query:${normalize(value)}`, 'searches');
    logAnalyticsEvent('catalog_search', {query: value.slice(0, 80)});
    recent = [value, ...recent.filter((item) => normalize(item) !== normalize(value))].slice(0,5);
    localStorage.setItem('iht_recent', JSON.stringify(recent));
    if (fromHome) { showView('searchView'); $('#query').value = value; }
    favoriteOnly = false; selectedCategory = 'all'; renderResults(value); renderSearchCategories();
  }

  function toggleFavorite(url) {
    favorites.has(url) ? favorites.delete(url) : favorites.add(url);
    save();
    if (currentProduct && currentProduct.url === url) {
      const detailSave = $('#detailSave');
      if (detailSave) {
        detailSave.innerHTML = bookmarkIcon(favorites.has(url));
        detailSave.setAttribute('aria-label', favorites.has(url) ? 'Quitar de guardados' : 'Guardar producto');
      }
    }
    const activeView = document.querySelector('.view.active')?.id;
    if (activeView === 'searchView' || (activeView === 'detailView' && previousView === 'searchView')) renderResults($('#query').value);
    if (activeView === 'savedView' || (activeView === 'detailView' && previousView === 'savedView')) renderSaved();
  }

  function showShareNotice(message, tone = '', duration = 3200, state = 'done') {
    document.querySelector('.share-toast')?.remove();
    const notice = document.createElement('div');
    notice.className = `share-toast${tone ? ` ${tone}` : ''}${state === 'loading' ? ' is-loading' : ''}`;
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    const mark = state === 'loading'
      ? '<span class="share-toast-spinner"></span>'
      : tone === 'bad' ? '!' : '✓';
    notice.innerHTML = `<span class="share-toast-mark" aria-hidden="true">${mark}</span><span>${escapeHtml(message)}</span>`;
    $('#detailView')?.appendChild(notice);
    window.requestAnimationFrame(() => notice.classList.add('visible'));
    if (duration > 0) window.setTimeout(() => {
      notice.classList.remove('visible');
      window.setTimeout(() => notice.remove(), 240);
    }, duration);
    return notice;
  }

  function drawShareWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = clean(text).split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    });
    if (line) lines.push(line);
    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      let last = visibleLines.at(-1) || '';
      while (last && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      visibleLines[visibleLines.length - 1] = `${last.trimEnd()}…`;
    }
    visibleLines.forEach((visibleLine, index) => context.fillText(visibleLine, x, y + (index * lineHeight)));
    return y + (visibleLines.length * lineHeight);
  }

  function drawShareImageContain(context, image, x, y, width, height) {
    if (!image?.naturalWidth && !image?.width) return false;
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const drawnWidth = imageWidth * scale;
    const drawnHeight = imageHeight * scale;
    context.drawImage(image, x + ((width - drawnWidth) / 2), y + ((height - drawnHeight) / 2), drawnWidth, drawnHeight);
    return true;
  }

  function shareRoundedRect(context, x, y, width, height, radius) {
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, radius);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.arcTo(x + width, y, x + width, y + r, r);
    context.lineTo(x + width, y + height - r);
    context.arcTo(x + width, y + height, x + width - r, y + height, r);
    context.lineTo(x + r, y + height);
    context.arcTo(x, y + height, x, y + height - r, r);
    context.lineTo(x, y + r);
    context.arcTo(x, y, x + r, y, r);
    context.closePath();
  }

  function drawShareSeal(context, image, x, y, width, height) {
    if (!image) return;
    context.save();
    context.shadowColor = '#173c2a33';
    context.shadowBlur = 18;
    context.shadowOffsetY = 5;
    context.fillStyle = '#ffffff';
    context.beginPath();
    shareRoundedRect(context, x, y, width, height, 18);
    context.fill();
    context.shadowColor = 'transparent';
    context.strokeStyle = '#b88a2d';
    context.lineWidth = 3;
    context.beginPath();
    shareRoundedRect(context, x, y, width, height, 18);
    context.stroke();
    drawShareImageContain(context, image, x + 10, y + 8, width - 20, height - 16);
    context.restore();
  }

  async function loadShareImageAttempt(src) {
    if (!src || src === productFallbackImage) return null;
    let objectUrl = '';
    try {
      let imageSource = src;
      if (Capacitor.isNativePlatform()) {
        // En Android/iOS usamos la capa HTTP nativa para evitar que CORS del
        // servidor de imágenes impida generar la tarjeta compartible.
        const response = await CapacitorHttp.get({url:src, responseType:'blob', connectTimeout:6000, readTimeout:6000});
        if (response.status < 200 || response.status >= 300 || !response.data) throw new Error(`HTTP ${response.status}`);
        const contentType = Object.entries(response.headers || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1] || 'image/jpeg';
        imageSource = String(response.data).startsWith('data:') ? String(response.data) : `data:${contentType};base64,${response.data}`;
      } else {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 6000);
        try {
          const response = await fetch(src, {mode:'cors', credentials:'omit', cache:'force-cache', signal:controller.signal});
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          objectUrl = URL.createObjectURL(await response.blob());
          imageSource = objectUrl;
        } finally {
          window.clearTimeout(timeout);
        }
      }
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = imageSource;
      });
      return {image, revoke:() => URL.revokeObjectURL(objectUrl)};
    } catch (_) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return null;
    }
  }

  async function loadShareImage(src) {
    // Algunos servidores mantienen abierta la respuesta de una imagen sin
    // cerrarla correctamente. El timeout total evita que Compartir quede
    // bloqueado aunque el navegador no respete la cancelación de fetch.
    const timeout = new Promise((resolve) => window.setTimeout(() => resolve(null), 5200));
    return Promise.race([loadShareImageAttempt(src), timeout]);
  }

  function loadLocalShareImage(src) {
    if (shareLogoPromise) return shareLogoPromise;
    shareLogoPromise = new Promise((resolve) => {
      if (!src) { resolve(null); return; }
      const image = new Image();
      image.onload = () => resolve({image, revoke:() => {}});
      image.onerror = () => resolve(null);
      image.src = src;
    });
    return shareLogoPromise;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const separator = dataUrl.indexOf(',');
        if (separator < 0) { reject(new Error('Imagen inválida')); return; }
        resolve(dataUrl.slice(separator + 1));
      };
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
      reader.readAsDataURL(blob);
    });
  }

  async function shareImageWithAndroid(blob, filename, title, text) {
    const [{Filesystem, Directory}, {Share}] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share')
    ]);
    const support = await Share.canShare();
    if (!support.value) throw new Error('Compartir no disponible');

    // El archivo vive únicamente en la caché privada de la app. Share lo
    // expone mediante FileProvider al panel nativo y luego lo eliminamos;
    // nunca aparece en Descargas ni en la galería del usuario.
    const cachePath = `share/${Date.now()}-${filename}`;
    let sharedUri = '';
    try {
      await Filesystem.writeFile({
        path: cachePath,
        data: await blobToBase64(blob),
        directory: Directory.Cache,
        recursive: true
      });
      sharedUri = (await Filesystem.getUri({path: cachePath, directory: Directory.Cache})).uri;
      await Share.share({
        title,
        text,
        files: [sharedUri],
        dialogTitle: 'Compartir ficha del producto'
      });
    } finally {
      // La aplicación receptora puede leer el URI después de cerrar el panel.
      window.setTimeout(() => Filesystem.deleteFile({path: cachePath, directory: Directory.Cache}).catch(() => {}), 60000);
    }
  }

  async function createProductShareImage(product) {
    const cacheKey = clean(product?.url || product?.title);
    const cachedImage = shareImageCache.get(cacheKey);
    if (cachedImage) return cachedImage;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas no disponible');
    const photoSource = productCache[product.url]?.images?.[0]?.src || product.image;
    const [photo, logo] = await Promise.all([
      loadShareImage(photoSource),
      loadLocalShareImage(shareLogoAssetUrl)
    ]);
    context.fillStyle = '#f5f8f5';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // La imagen compartida es deliberadamente cuadrada y limpia: conserva
    // toda la foto, sin textos ni tarjetas que compitan con el producto.
    context.fillStyle = '#ffffff';
    context.fillRect(28, 28, 1024, 1024);
    if (photo) {
      context.save();
      context.beginPath();
      shareRoundedRect(context, 28, 28, 1024, 1024, 24);
      context.clip();
      drawShareImageContain(context, photo.image, 28, 28, 1024, 1024);
      context.restore();
    } else {
      context.fillStyle = '#6d8376';
      context.font = '500 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      context.textAlign = 'center';
      context.fillText('Imagen disponible en la ficha oficial', 540, 540);
      context.textAlign = 'left';
    }
    // El sello siempre se compone al final, por encima de la foto. Así no
    // desaparece si la imagen tarda, cambia su proporción o el WebView la
    // dibuja con un recorte distinto.
    drawShareSeal(context, logo?.image, 808, 816, 220, 176);
    photo?.revoke();
    logo?.revoke();
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No se pudo crear la imagen')), 'image/jpeg', .88));
    shareImageCache.set(cacheKey, blob);
    return blob;
  }

  function productShareText(product) {
    const category = categoryFor(product.cat)?.name;
    const productUrl = clean(product.url);
    return [
      '🛒 Este producto está en el listado oficial de Iahadut HaTora.',
      `📦 ${clean(product.title)}`,
      category ? `✅ ${category}` : '',
      '',
      productUrl ? `🔎 Mirá la ficha completa: ${productUrl}` : '',
      '',
      '✨ Compartido desde la app Iahadut HaTora.',
      '📲 Instalá la app y descubrí más productos kosher:',
      `👉 ${appInstallUrl}`
    ].filter(Boolean).join('\n');
  }

  async function shareCurrentProduct() {
    if (!currentProduct || shareBusy) return;
    shareBusy = true;
    const button = $('#detailShare');
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.setAttribute('aria-label', 'Preparando imagen para compartir');
      button.classList.add('is-loading');
      button.innerHTML = '<span class="share-button-spinner" aria-hidden="true"></span>';
    }
    const preparingNotice = showShareNotice('Preparando imagen para compartir…', '', 0, 'loading');
    try {
      const blob = await createProductShareImage(currentProduct);
      const filename = `iahadut-${normalize(currentProduct.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'producto'}.jpg`;
      const file = new File([blob], filename, {type:'image/jpeg'});
      const text = productShareText(currentProduct);
      const installedShareContext = Capacitor.isNativePlatform()
        || window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
      if (Capacitor.isNativePlatform()) {
        await shareImageWithAndroid(blob, filename, `${currentProduct.title} · Iahadut HaTora`, text);
        showShareNotice('Ficha lista para compartir');
      } else if (installedShareContext && navigator.share && navigator.canShare?.({files:[file]})) {
        // Solo para una vista instalada que implemente Web Share. Nunca
        // descargamos automáticamente la imagen como sustituto.
        await navigator.share({title:`${currentProduct.title} · Iahadut HaTora`, text, files:[file]});
        showShareNotice('Ficha lista para compartir');
      } else {
        showShareNotice('Abrí la app Android para compartir la ficha', 'bad');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') showShareNotice('No pudimos preparar la imagen para compartir', 'bad');
      else preparingNotice.remove();
    } finally {
      shareBusy = false;
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.classList.remove('is-loading');
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m7.8 11 8.4-5M7.8 13l8.4 5"/></svg>';
        button.setAttribute('aria-label', 'Compartir ficha del producto');
      }
    }
  }

  function renderDetail(product, official = null) {
    currentProduct = product;
    const category = categoryFor(product.cat);
    // La miniatura del catálogo ya está cargada en la pantalla anterior. Usarla
    // también en la ficha evita una segunda descarga y cualquier parpadeo.
    const officialImage = product.image || official?.images?.[0]?.src;
    const officialDescription = official?.loading
      ? 'La ficha oficial está tardando un poco. Seguimos cargándola…'
      : official?.loadFailed
        ? 'No pudimos cargar la descripción oficial en este momento.'
        : official?.description || official?.blocks?.filter((block) => block.tag === 'p').map((block) => block.text).join(' ') || (official?.descriptionAvailable === false ? 'La ficha oficial no incluye una descripción adicional.' : product.description || 'Consultando descripción oficial…');
    const taxonomyPath = productCategoryPath(product);
    const officialCategory = official?.category || (category ? category.name : 'Catálogo oficial');
    const detailCategoryClass = `detail-category-${category?.key || 'default'}`;
    const specialSealMarkup = category?.key === 'especial'
      ? `<img class="detail-special-seal" src="${escapeHtml(shareLogoAssetUrl)}" alt="Sello de Iahadut HaTora">`
      : '';
    const detailImage = officialImage && !/(^|\/)assets\/(?:logo(?:-[^/]+)?\.png|product-placeholder\.svg)$/i.test(officialImage) ? officialImage : '';
    const detailImageMarkup = detailImage ? `<img class="asset-loading" loading="eager" src="${escapeHtml(detailImage)}" alt="${escapeHtml(product.title)}" onload="this.classList.remove('asset-loading','asset-error');this.classList.add('asset-ready')" onerror="this.remove()">` : '';
    const taxonomyMarkup = taxonomyPath.length ? `<nav class="detail-taxonomy" aria-label="Categoría del catálogo"><small>Categoría en el catálogo</small><div>${taxonomyPath.map((part, index) => `${index ? '<span aria-hidden="true">→</span>' : ''}<button type="button" data-detail-taxonomy-path="${escapeHtml(encodeURIComponent(JSON.stringify(taxonomyPath.slice(0, index + 1))))}">${escapeHtml(categoryDisplayName(part))}</button>`).join('')}</div></nav>` : '';
    const berajaMarkup = official?.beraja ? `<div class="detail-facts single"><div><small>Berajá</small><strong>${escapeHtml(official.beraja)}</strong></div></div>` : '';
    const detailContent = $('#detailContent');
    const existing = detailContent.querySelector('.detail-content:not(.detail-content-loading)');
    if (!existing) {
      detailContent.innerHTML = `<div class="detail-content">${detailImageMarkup}<div class="detail-body">${uruguayBadge(product, 'product-region-badge detail-region-badge')}<span class="label ${detailCategoryClass}">${escapeHtml(officialCategory)}${specialSealMarkup}</span><h1>${styledBrandText(product.title)}</h1><p class="detail-description">${escapeHtml(officialDescription)}</p>${berajaMarkup}${taxonomyMarkup}${official?.loadFailed ? '<button class="filter-btn detail-retry" id="detailRetry" type="button"><span>Reintentar carga</span></button>' : ''}</div></div>`;
    } else {
      const image = existing.querySelector(':scope > img');
      if (!detailImage) image?.remove();
      else if (image && image.src !== new URL(detailImage, location.href).href) image.src = detailImage;
      else if (!image) existing.insertAdjacentHTML('afterbegin', detailImageMarkup);
      const categoryLabel = existing.querySelector('.label');
      existing.querySelector('.detail-region-badge')?.remove();
      if (isUruguayProduct(product)) categoryLabel.insertAdjacentHTML('beforebegin', uruguayBadge(product, 'product-region-badge detail-region-badge'));
      categoryLabel.innerHTML = `${escapeHtml(officialCategory)}${specialSealMarkup}`;
      categoryLabel.className = `label ${detailCategoryClass}`;
      existing.querySelector('h1').innerHTML = styledBrandText(product.title);
      const descriptionNode = existing.querySelector('.detail-description') || existing.querySelector('.detail-body p');
      descriptionNode.classList.add('detail-description');
      descriptionNode.textContent = officialDescription;
      existing.querySelector('.detail-retry')?.remove();
      existing.querySelector('.verified-line')?.remove();
      existing.querySelector('.detail-facts')?.remove();
      existing.querySelector('.detail-taxonomy')?.remove();
      descriptionNode.insertAdjacentHTML('afterend', `${berajaMarkup}${taxonomyMarkup}`);
      if (official?.loadFailed) existing.querySelector('.detail-body').insertAdjacentHTML('beforeend', '<button class="filter-btn detail-retry" id="detailRetry" type="button"><span>Reintentar carga</span></button>');
    }
    const retry = $('#detailRetry');
    if (retry) retry.onclick = () => openDetail(product.url, {retry:true});
    detailContent.querySelectorAll('[data-detail-taxonomy-path]').forEach((button) => {
      button.onclick = () => openTaxonomyPath(JSON.parse(decodeURIComponent(button.dataset.detailTaxonomyPath)));
    });
    $('#detailSave').innerHTML = bookmarkIcon(favorites.has(product.url));
    $('#detailSave').setAttribute('aria-label', favorites.has(product.url) ? 'Quitar de guardados' : 'Guardar producto');
  }

  function showKosherToast(product) {
    window.clearTimeout(kosherToastTimer);
    document.querySelector('.kosher-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'kosher-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `<span class="kosher-toast-mark">✓</span><span><strong>¡Es kosher!</strong><small>${styledBrandText(product.title)}</small></span>`;
    $('#detailView').appendChild(toast);
    window.requestAnimationFrame(() => toast.classList.add('visible'));
    kosherToastTimer = window.setTimeout(() => {
      toast.classList.remove('visible');
      window.setTimeout(() => toast.remove(), 280);
    }, 2800);
  }

  function openDetail(url, options = {}) {
    const product = [...(Array.isArray(recentProducts) ? recentProducts : []), ...products].find((item) => item.url === url); if (!product) return;
    countPopularity(product.url, 'opens');
    logAnalyticsEvent('product_open', {product_url: product.url, product_name: product.title?.slice(0, 80) || ''});
    if (!options.retry) {
      previousView = document.querySelector('.view.active').id;
      previousScrollTop = window.scrollY;
    }
    currentProduct = product;
    showView('detailView');
    const cachedOfficial = productCache[product.url] || null;
    if (cachedOfficial) renderDetail(product, cachedOfficial);
    else {
      // No mostrar el texto local/provisional mientras llega la ficha original.
      $('#detailContent').innerHTML = `<div class="detail-content detail-content-loading"><div class="detail-loading-image asset-loading"></div><div class="detail-body"><span class="label">Cargando ficha original</span><div class="detail-loading-line detail-loading-line-long"></div><div class="detail-loading-line"></div><div class="detail-loading-line detail-loading-line-short"></div></div></div>`;
    }
    if (options.fromScan) showKosherToast(product);
    if (cachedOfficial) {
      if (!isFresh(cachedOfficial)) fetchProductContent(product, true).catch(() => {});
      return;
    }
    const slowNotice = window.setTimeout(() => {
      if (currentProduct?.url === product.url) renderDetail(product, {loading:true});
    }, 10000);
    fetchProductContent(product).then(async (official) => {
      window.clearTimeout(slowNotice);
      await preloadImages((official.images || []).slice(0, 1).map((image) => image.src));
      if (currentProduct?.url === product.url) renderDetail(product, official);
    }).catch(() => {
      window.clearTimeout(slowNotice);
      if (currentProduct?.url === product.url) renderDetail(product, {loadFailed:true});
    });
  }

  function returnFromDetail() {
    if (previousView === 'searchView') restoreSearchScreen();
    else showView(previousView);
    window.requestAnimationFrame(() => window.scrollTo(0, previousScrollTop));
  }

  function renderAlertPreview() {
    $('#recentAlert').hidden = true;
  }

  function alertGroups(items) {
    const groups = {alta:[], baja:[], general:[]};
    let current = 'general';
    items.forEach((item) => {
      const text = normalize(item);
      if (/dad[oa]s? de alta|alta de productos|autorizad/.test(text)) { current = 'alta'; return; }
      if (/dad[oa]s? de baja|baja de productos|retirad|no autorizado/.test(text)) { current = 'baja'; return; }
      groups[current].push(item);
    });
    return groups;
  }

  function alertSection(title, key, items) {
    if (!items.length && key === 'general') return '';
    const visibleItems = items.length ? items : [`No hay productos ${key === 'alta' ? 'dados de alta' : 'dados de baja'} publicados en este momento.`];
    const icon = key === 'alta' ? '✓' : key === 'baja' ? '!' : '•';
    return `<details class="alert-group alert-${key}"><summary class="alert-group-head"><span class="alert-group-icon">${icon}</span><div><h2>${title}</h2><small>${items.length} ${items.length === 1 ? 'actualización' : 'actualizaciones'}</small></div><svg class="alert-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></summary><div class="alert-group-items">${visibleItems.map((item) => {
      const text = typeof item === 'string' ? item : item?.text || '';
      const linked = item?.url ? products.find((product) => product.url === item.url) : null;
      const normalizedText = normalize(text.replace(/\s*\([^)]*\)\s*$/, ''));
      const match = linked || products.find((product) => { const productTitle = normalize(product.title); return productTitle.length > 8 && (normalizedText.includes(productTitle) || productTitle.includes(normalizedText)); });
      const visual = match?.image ? `<img class="alert-product-image asset-loading" src="${escapeHtml(match.image)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('•'))">` : '<span class="alert-mark" aria-hidden="true">•</span>';
      const tag = match ? 'button' : 'article';
      const productAttrs = match ? ` data-product="${escapeHtml(match.url)}" aria-label="Ver ${escapeHtml(match.title)}" type="button"` : '';
      return `<${tag} class="alert-item${match ? ' alert-item-clickable' : ''}"${productAttrs}>${visual}<p>${styledBrandText(text)}</p>${match ? '<span class="alert-item-arrow" aria-hidden="true">›</span>' : ''}</${tag}>`;
    }).join('')}</div></details>`;
  }

  function realAlertItems(items) {
    return (items || []).filter((item) => {
      const text = normalize(typeof item === 'string' ? item : item?.text || '');
      return text && !/no hay alertas|no hay productos|no pudimos actualizar/.test(text);
    });
  }

  function alertDate(text) {
    const matches = [...String(text || '').matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];
    const match = matches.at(-1);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return {date, key:`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, label:date.toLocaleDateString('es-AR', {day:'numeric', month:'long', year:'numeric'})};
  }

  function alertTextWithoutDate(text) {
    return clean(String(text || '')
      .replace(/\s*\([^)]*\d{1,2}\/\d{1,2}\/\d{4}[^)]*\)\s*$/, '')
      .replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}\s*$/, ''));
  }

  function alertTimelineMarkup(items, state = '', kind = 'all') {
    if (state === 'error') return `<div class="alert-empty-state alert-empty-error"><span class="alert-empty-icon" aria-hidden="true">!</span><strong>No pudimos actualizar las novedades</strong><span>Revisá tu conexión e intentá nuevamente.</span></div>`;
    const groups = Array.isArray(items) ? alertGroups(items) : (items || {});
    const isRemovalTimeline = kind === 'baja';
    const entries = kind === 'all'
      ? [...realAlertItems(groups.alta).map((item) => ({item, kind:'alta'})), ...realAlertItems(groups.baja).map((item) => ({item, kind:'baja'}))]
      : realAlertItems(groups[kind]).map((item) => ({item, kind}));
    if (!entries.length) return `<div class="alert-empty-state${isRemovalTimeline ? ' alert-empty-removals' : ''}"><span class="alert-empty-icon" aria-hidden="true">✓</span><strong>${isRemovalTimeline ? 'No hay bajas registradas' : kind === 'all' ? 'No hay novedades' : 'No hay productos nuevos'}</strong><span>${isRemovalTimeline ? 'Cuando se retire un producto del catálogo, va a aparecer acá.' : kind === 'all' ? 'Cuando haya cambios en el catálogo, van a aparecer acá.' : 'Cuando se agregue un producto al catálogo, va a aparecer acá.'}</span></div>`;
    const days = new Map();
    entries.forEach(({item, kind: entryKind}) => {
      const rawText = typeof item === 'string' ? item : item?.text || '';
      const parsedDate = alertDate(rawText);
      const key = parsedDate?.key || 'undated';
      if (!days.has(key)) days.set(key, {date:parsedDate, items:[]});
      days.get(key).items.push({item, kind:entryKind, text:alertTextWithoutDate(rawText)});
    });
    const orderedDays = [...days.values()].sort((first, second) => {
      if (!first.date) return 1;
      if (!second.date) return -1;
      return second.date.date - first.date.date;
    });
    const dayMarkup = orderedDays.map((day) => {
      const dateLabel = day.date ? day.date.label : 'Fecha no informada';
      const productMarkup = day.items.map(({item, kind: entryKind, text}) => {
        const linked = item?.url ? products.find((product) => product.url === item.url) : null;
        const normalizedText = normalize(text);
        const match = linked || products.find((product) => {
          const productTitle = normalize(product.title);
          return productTitle.length > 8 && (normalizedText.includes(productTitle) || productTitle.includes(normalizedText));
        });
        const visual = match?.image
          ? `<span class="alert-timeline-visual"><img class="alert-product-image asset-loading" src="${escapeHtml(match.image)}" alt="" loading="lazy" onerror="this.remove()"></span>`
          : '<span class="alert-timeline-visual alert-timeline-placeholder" aria-hidden="true">!</span>';
        const title = match?.title || text;
        const entryIsRemoval = entryKind === 'baja';
        const statusText = entryIsRemoval ? 'Producto dado de baja' : 'Producto agregado';
        const itemClass = `alert-timeline-item${entryIsRemoval ? ' alert-timeline-item-removal' : ''}`;
        return match
          ? `<button class="${itemClass}" type="button" data-product="${escapeHtml(match.url)}" aria-label="Ver ${escapeHtml(match.title)}">${visual}<span class="alert-timeline-copy"><strong>${styledBrandText(title)}</strong><small>${statusText} · Ver ficha</small></span><span class="alert-timeline-arrow" aria-hidden="true">›</span></button>`
          : `<article class="${itemClass}">${visual}<span class="alert-timeline-copy"><strong>${styledBrandText(title)}</strong><small>${statusText}</small></span></article>`;
      }).join('');
      return `<section class="alert-timeline-day"><div class="alert-timeline-day-head"><time datetime="${day.date?.key || ''}">${escapeHtml(dateLabel)}</time><span>${day.items.length} ${day.items.length === 1 ? 'cambio' : 'cambios'}</span></div><div class="alert-timeline-items">${productMarkup}</div></section>`;
    }).join('');
    return `<div class="alert-timeline${isRemovalTimeline ? ' alert-timeline-removals' : ''}" data-alert-kind="${kind}">${dayMarkup}</div>`;
  }

  function alertMarkup(items, state = '') {
    const groups = Array.isArray(items) ? alertGroups(items) : (items || {});
    const bajaItems = realAlertItems(groups.baja);
    const bajaAction = bajaItems.length
      ? `<button class="alert-secondary-action" type="button" data-open-retired><span class="alert-secondary-icon" aria-hidden="true">!</span><span><strong>Ver productos dados de baja</strong><small>${bajaItems.length} ${bajaItems.length === 1 ? 'producto retirado' : 'productos retirados'}</small></span><span class="alert-secondary-arrow" aria-hidden="true">›</span></button>`
      : '';
    return `${bajaAction}${alertTimelineMarkup(groups, state, 'all')}`;
  }

  function alertMetaText() {
    return 'Productos retirados, ordenados por fecha.';
  }

  function renderRetiredAlerts(items = alertCache?.items, state = '') {
    if (!$('#alertList')) return;
    $('#alertList').innerHTML = alertTimelineMarkup(items || {alta:[], baja:[], general:[]}, state, 'baja');
    $('#alertsMeta').textContent = state === 'error' ? 'Sin conexión · no pudimos actualizar las bajas.' : 'Productos retirados, ordenados por fecha.';
  }

  async function renderCatalogTimeline(items = alertCache?.items, state = '') {
    if (!$('#timelineList')) return;
    if (items && !Array.isArray(items)) {
      $('#timelineList').innerHTML = alertMarkup(items);
      $('#timelineMeta').textContent = 'Información guardada · actualizando novedades…';
    } else {
      $('#timelineList').innerHTML = '<div class="content-skeleton alert-skeleton" aria-label="Preparando cronología"><i></i><i></i><i></i></div>';
    }
    if (state === 'error') {
      $('#timelineList').innerHTML = alertMarkup(items || {}, state);
      $('#timelineMeta').textContent = 'Sin conexión · no pudimos actualizar las novedades.';
      return;
    }
    try {
      const freshItems = await fetchAlerts();
      if (document.querySelector('.view.active')?.id === 'timelineView') {
        $('#timelineList').innerHTML = alertMarkup(freshItems);
        $('#timelineMeta').textContent = 'Altas y bajas, ordenadas por fecha.';
      }
    } catch (_) {
      if (document.querySelector('.view.active')?.id === 'timelineView') {
        $('#timelineList').innerHTML = alertMarkup(alertCache?.items || {}, 'error');
        $('#timelineMeta').textContent = 'Sin conexión · no pudimos actualizar las novedades.';
      }
    }
  }

  function cachePushCatalogAlert(notification) {
    const type = notification?.data?.alertType;
    if (type !== 'alta' && type !== 'baja') return false;
    const text = clean(notification?.data?.text || notification?.body || (type === 'alta' ? 'Nueva alta en el catálogo' : 'Producto dado de baja'));
    const url = clean(notification?.data?.url || '');
    const current = alertCache?.items && !Array.isArray(alertCache.items)
      ? alertCache.items
      : {alta:[], baja:[], general:[]};
    const list = Array.isArray(current[type]) ? current[type] : [];
    const duplicate = list.some((item) => {
      const itemText = typeof item === 'string' ? item : item?.text || '';
      return (url && item?.url === url) || normalize(itemText) === normalize(text);
    });
    if (duplicate) return false;
    const next = {
      alta: type === 'alta' ? [{text, url}, ...list].slice(0, 40) : (current.alta || []),
      baja: type === 'baja' ? [{text, url}, ...list].slice(0, 40) : (current.baja || []),
      general: current.general || []
    };
    alertCache = {version:INFO_CACHE_VERSION, items:next, fetchedAt:Date.now()};
    localStorage.setItem('iht_alert_cache', JSON.stringify(alertCache));
    if (type === 'alta' || type === 'baja') setCatalogAlertBadge(true);
    if (document.querySelector('.view.active')?.id === 'alertsView') {
      renderRetiredAlerts(next);
    }
    if (document.querySelector('.view.active')?.id === 'timelineView') renderCatalogTimeline(next);
    return true;
  }

  async function renderAlerts() {
    $('#alertsMeta').textContent = alertMetaText();
    if (alertCache?.items && !Array.isArray(alertCache.items)) {
      renderRetiredAlerts(alertCache.items);
      $('#alertsMeta').textContent = 'Información guardada · actualizando bajas…';
    } else {
      $('#alertList').innerHTML = '<div class="content-skeleton alert-skeleton" aria-label="Preparando alertas"><i></i><i></i><i></i></div>';
    }
    try {
      const items = await fetchAlerts();
      if (document.querySelector('.view.active')?.id === 'alertsView') {
        renderRetiredAlerts(items);
        markAlertsSeen(items);
      }
    } catch (_) {
      const items = alertCache?.items || {alta:[], baja:['No pudimos actualizar las alertas. Revisá tu conexión e intentá nuevamente.'], general:[]};
      if (document.querySelector('.view.active')?.id === 'alertsView') markAlertsSeen(items);
      if (document.querySelector('.view.active')?.id === 'alertsView') renderRetiredAlerts(alertCache?.items || {}, 'error');
      if (document.querySelector('.view.active')?.id === 'timelineView') renderCatalogTimeline(alertCache?.items || {}, 'error');
    }
  }

  function parseRemoteList(value) {
    if (!value) return [];
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
  }

  function applyRemoteContent(control) {
    const managedCategories = parseRemoteList(control.categories_json).filter((item) => item?.key && item?.name);
    if (managedCategories.length) categories = managedCategories.map((item) => ({key:clean(item.key), name:clean(item.name), short:clean(item.short || item.name), desc:clean(item.desc), count:Number(item.count) || 0, url:clean(item.url)}));
    remoteTaxonomyRules = parseRemoteList(control.taxonomy_rules_json).filter((item) => Array.isArray(item?.path) && Array.isArray(item?.keywords)).map((item) => ({path:item.path.map(clean).filter(Boolean), keywords:item.keywords.map(normalize).filter(Boolean)}));
  }

  function openExternal(url) {
    if (!url) return;
    const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
  }

  function trustedPlayStoreUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || url.hostname !== 'play.google.com') return '';
      const isAppPage = url.pathname === '/store/apps/details' && url.searchParams.get('id') === 'ar.vaad.catalogo.app';
      const isTesterPage = url.pathname === '/apps/testing/ar.vaad.catalogo.app' || url.pathname.startsWith('/apps/testing/ar.vaad.catalogo.app/');
      return isAppPage || isTesterPage ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function notificationPlayStoreUrl(notification) {
    return trustedPlayStoreUrl(notification?.data?.url || notification?.data?.link || notification?.data?.playStoreUrl);
  }

  async function refreshPlayUpdate() {
    if (!Capacitor.isNativePlatform()) return playUpdateState;
    try {
      const result = await PlayStoreUpdates.checkForUpdate();
      playUpdateState = {...playUpdateState, ...result, checked:true};
    } catch (_) {
      // Las instalaciones de desarrollo o fuera de Google Play no tienen
      // acceso a esta API; en esos casos queda activo el fallback remoto.
      playUpdateState = {...playUpdateState, checked:true};
    }
    renderHomeAppUpdate();
    if (document.querySelector('.view.active')?.id === 'moreView') renderMore();
    return playUpdateState;
  }

  function renderHomeAppUpdate() {
    const update = $('#homeAppUpdate');
    if (!update) return;
    update.hidden = !(playUpdateState.available || playUpdateState.downloaded);
  }

  function updateAccessOverlay(control) {
    const decision = accessDecision(control);
    $('#accessOverlay').hidden = decision.allowed;
    if (decision.allowed) return decision;
    $('#accessTitle').textContent = decision.versionBlocked ? 'Necesitás actualizar' : decision.expired ? 'Acceso finalizado' : decision.needsOnlineCheck ? 'Conectate para verificar' : 'Aplicación no disponible';
    $('#accessMessage').textContent = decision.versionBlocked ? 'Hay una versión más nueva necesaria para continuar.' : control.maintenance_message;
    $('#accessUpdate').hidden = !(decision.versionBlocked && control.update_url);
    return decision;
  }

  async function refreshRemoteControl(force = false) {
    remoteControl = await loadRemoteControl(force);
    applyRemoteContent(remoteControl);
    const decision = updateAccessOverlay(remoteControl);
    renderHome(); renderSearchCategories();
    if (document.querySelector('.view.active')?.id === 'moreView') renderMore();
    return decision;
  }

  async function setupPushNotifications(requestPermission = false) {
    if (!Capacitor.isNativePlatform()) return 'unavailable';
    if (!requestPermission && localStorage.getItem('iht_push_status') === 'disabled') return 'disabled';
    if (!remoteControl.configured) {
      localStorage.setItem('iht_push_status', 'pending-config');
      return 'pending-config';
    }
    try {
      const {PushNotifications} = await import('@capacitor/push-notifications');
      if (!pushListenersReady) {
        pushListenersReady = true;
        await PushNotifications.addListener('registration', async ({value}) => {
          localStorage.setItem('iht_push_token', value);
          if (localStorage.getItem('iht_push_status') !== 'active') localStorage.setItem('iht_push_status', 'registered');
          if (remoteControl.device_registration_url) {
            try { await CapacitorHttp.post({url:remoteControl.device_registration_url, headers:{'Content-Type':'application/json'}, data:{token:value, platform:Capacitor.getPlatform(), topic:'catalog-updates', appVersion:APP_VERSION}}); } catch (_) {}
          }
          if (document.querySelector('.view.active')?.id === 'moreView') renderMore();
        });
        await PushNotifications.addListener('registrationError', () => { localStorage.setItem('iht_push_status', 'error'); renderNotificationPermission(); });
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          const item = {id:clean(notification.id || notification.data?.messageId), eventKey:clean(notification.data?.eventKey), title:notification.title || notification.data?.title || 'Novedad del catálogo', body:notification.body || notification.data?.body || 'Hay una actualización disponible.', time:new Date().toLocaleString('es-AR'), url:notificationPlayStoreUrl(notification)};
          if (pushNotifications.some((stored) => pushNotificationKey(stored) === pushNotificationKey(item))) return;
          cachePushCatalogAlert(notification);
          pushNotifications = [item, ...pushNotifications].slice(0, 30);
          localStorage.setItem('iht_push_notifications', JSON.stringify(pushNotifications));
          setPushNotificationBadge(true);
          if (notification.data?.action === 'sync') void syncAndPreload(true).catch(() => {});
        });
        await PushNotifications.addListener('pushNotificationActionPerformed', ({notification}) => {
          cachePushCatalogAlert(notification);
          setPushNotificationBadge(false);
          if (notification.data?.action === 'sync') void syncAndPreload(true).catch(() => {});
          const playUrl = notificationPlayStoreUrl(notification);
          if (playUrl) { openExternal(playUrl); return; }
          showView('notificationsView');
        });
        await PushNotifications.createChannel({id:'catalog-updates', name:'Actualizaciones del catálogo', description:'Altas, bajas y cambios importantes', importance:4, visibility:1, vibration:true});
      }
      let permission = await PushNotifications.checkPermissions();
      if (requestPermission && permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
      if (permission.receive === 'granted') {
        await PushNotifications.register();
        try {
          const {FirebaseMessaging} = await import('@capacitor-firebase/messaging');
          const tokenResult = await FirebaseMessaging.getToken();
          const token = tokenResult?.token;
          if (token) {
            localStorage.setItem('iht_push_token', token);
            if (remoteControl.device_registration_url) {
              try { await CapacitorHttp.post({url:remoteControl.device_registration_url, headers:{'Content-Type':'application/json'}, data:{token, platform:Capacitor.getPlatform(), topic:'catalog-updates', appVersion:APP_VERSION}}); } catch (_) {}
            }
          }
          await FirebaseMessaging.subscribeToTopic({topic: 'catalog-updates'});
          localStorage.setItem('iht_push_status', 'active');
          renderNotificationPermission();
        } catch (_) {
          localStorage.setItem('iht_push_status', 'error');
          renderNotificationPermission();
          return 'error';
        }
        return 'active';
      }
      localStorage.setItem('iht_push_status', permission.receive === 'denied' ? 'denied' : 'pending');
      return permission.receive;
    } catch (_) { localStorage.setItem('iht_push_status', 'unavailable'); return 'unavailable'; }
  }

  async function disablePushNotifications() {
    localStorage.setItem('iht_push_status', 'disabled');
    localStorage.removeItem('iht_push_token');
    setPushNotificationBadge(false);
    try {
      const {PushNotifications} = await import('@capacitor/push-notifications');
      try {
        const {FirebaseMessaging} = await import('@capacitor-firebase/messaging');
        await FirebaseMessaging.unsubscribeFromTopic({topic:'catalog-updates'});
      } catch (_) {}
      await PushNotifications.unregister();
    } catch (_) {}
    renderNotificationPermission();
    renderAlerts();
    renderPushNotifications();
    renderMore();
  }

  function renderMore() {
    const saved = `<button class="more-row saved-more-row" data-saved="true">${bookmarkIcon(false)}<span><strong>Productos guardados</strong><small>${favorites.size ? `${favorites.size} productos guardados` : 'Todavía no guardaste productos'}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`;
    const officialWebsite = `<a class="more-row official-site-row" href="https://vaad.ar/" target="_blank" rel="noopener"><span class="more-row-leading-icon" aria-hidden="true">↗</span><span><strong>Sitio web oficial</strong></span><span class="row-arrow" aria-hidden="true">›</span></a>`;
    const decision = accessDecision(remoteControl);
    const pushStatus = localStorage.getItem('iht_push_status');
    const notificationButton = $('#notificationButton');
    const notificationStatus = $('#notificationStatus');
    if (notificationButton) notificationButton.setAttribute('aria-label', pushStatus === 'active' ? 'Notificaciones activadas' : 'Configurar notificaciones');
    if (notificationStatus) notificationStatus.hidden = pushStatus !== 'active';
    const playUpdateAvailable = Boolean(playUpdateState.available || playUpdateState.downloaded);
    const nativeAndroid = Capacitor.isNativePlatform();
    const updateAvailable = nativeAndroid ? playUpdateAvailable : decision.updateAvailable;
    const updateMessage = playUpdateState.downloaded
      ? 'Actualización descargada · Tocá para instalar'
      : playUpdateState.available
        ? 'Nueva versión disponible en Google Play'
        : decision.updateAvailable
          ? `Nueva versión ${escapeHtml(remoteControl.latest_version)} disponible`
          : `Versión ${escapeHtml(APP_VERSION)}`;
    const update = (!nativeAndroid || updateAvailable)
      ? `<button class="more-row managed-more-row update-more-row${updateAvailable ? ' has-update-new' : ''}" data-app-update><span class="managed-icon" aria-hidden="true">↻</span><span><strong>Actualizar aplicación</strong><small>${updateMessage}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`
      : '';
    const developerWhatsApp = `https://wa.me/5491135195674?text=${encodeURIComponent('¡Me gustó la app de Iahadut HaTora! ¿Podemos hacer un proyecto juntos?')}`;
    const developerCredit = `<div class="developer-credit"><span class="app-version">Versión ${escapeHtml(APP_VERSION)}</span><span class="developer-name">Y.R.N Soluciones Software</span><a class="developer-cta" href="https://wa.me/5491135195674" target="_blank" rel="noopener">¿Necesitás una app?</a><a class="developer-whatsapp" href="https://wa.me/5491135195674" target="_blank" rel="noopener" aria-label="Contactar por WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c0 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg></a></div>`;
    const moreInfo = Object.entries(info).filter(([key]) => !['shops', 'catering', 'notes', 'world'].includes(key));
    $('#moreList').innerHTML = saved + moreInfo.map(([key, value]) => `<button class="more-row" data-info="${key}">${infoIcon(key)}<span><strong>${escapeHtml(value[0])}</strong><small>${escapeHtml(value[1])}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`).join('') + update + officialWebsite + developerCredit;
    document.querySelectorAll('.developer-cta, .developer-whatsapp').forEach((link) => { link.href = developerWhatsApp; });
    infoNoticeKeys.forEach((key) => updateInfoNotice(key));
  }

  async function openInfo(key, options = {}) {
    const value = info[key]; if (!value) return;
    markInfoSeen(key);
    const activeView = document.querySelector('.view.active')?.id || 'homeView';
    if (!options.fromHistory) {
      if (activeView === 'readerView' && currentInfoKey) readerHistory.push({type:'info', key:currentInfoKey});
      else readerHistory = [{type:'view', id:activeView}];
    }
    currentInfoKey = key;
    showView('readerView');
    $('#readerTop').textContent = value[0];
    $('#readerContent').innerHTML = '<div class="content-skeleton" aria-hidden="true"><i></i><i></i><i></i></div>';
    const renderInfo = (content) => {
      window.__ihtInfoCards = content.cards || [];
      $('#readerTop').textContent = value[0];
      $('#readerContent').innerHTML = infoContentMarkup(content);
    };
    if (infoCache[key]) {
      renderInfo(infoCache[key]);
      // Actualizar la copia silenciosamente para la próxima apertura. Mantener
      // quieta la pantalla actual evita que el texto cambie frente al usuario.
      fetchInfoContent(key).catch(() => {});
      return;
    }
    try {
      const content = await fetchInfoContent(key);
      if (document.querySelector('.view.active')?.id === 'readerView' && currentInfoKey === key) renderInfo(content);
    } catch (_) {
      if (!infoCache[key] && document.querySelector('.view.active')?.id === 'readerView' && currentInfoKey === key) {
        const content = {blocks:[{tag:'p', text:'No se pudo cargar el contenido oficial. Revisá tu conexión e intentá nuevamente.'}], images:[], elements:[]};
        renderInfo(content);
      }
    }
  }

  async function openCatalogInfo() {
    readerHistory = [{type:'view', id:document.querySelector('.view.active')?.id || 'homeView'}];
    currentInfoKey = '__catalog';
    showView('readerView');
    $('#readerTop').textContent = 'Catálogo';
    const renderDate = (date, note = 'Fecha publicada por Iahadut HaTora.') => {
      $('#readerContent').innerHTML = `<span class="label">Información del catálogo</span><h2>Última actualización del catálogo</h2><div class="catalog-update-card"><strong>${escapeHtml(date)}</strong><span>${escapeHtml(note)}</span></div><p class="catalog-app-sync">Última sincronización de esta app: ${escapeHtml(lastSyncMessage())}</p>`;
    };
    renderDate(officialUpdateMessage());
    try {
      const officialDate = await fetchOfficialUpdateDate();
      if (officialDate) localStorage.setItem('iht_official_update', officialDate);
    } catch (_) {
      // La fecha empaquetada sigue siendo válida aunque la actualización en
      // segundo plano no tenga conexión.
    }
  }

  function updateModalLock() {
    const hasOpenOverlay = [...document.querySelectorAll('.overlay')].some((overlay) => !overlay.hidden);
    document.body.classList.toggle('modal-open', hasOpenOverlay);
  }

  function openImage(src, caption = '') {
    resetImageZoom();
    $('#expandedImage').src = src;
    $('#expandedImage').alt = caption;
    $('#expandedCaption').textContent = caption;
    $('#imageOverlay').hidden = false;
    updateModalLock();
  }

  function applyImageZoom() {
    $('#expandedImage').style.transform = `translate3d(${imageGesture.x}px, ${imageGesture.y}px, 0) scale(${imageGesture.scale})`;
  }

  function resetImageZoom() {
    imageGesture.scale = 1; imageGesture.x = 0; imageGesture.y = 0; imageGesture.pointers.clear(); imageGesture.startDistance = 0;
    if ($('#expandedImage')) applyImageZoom();
  }

  function closeImage() { $('#imageOverlay').hidden = true; $('#expandedImage').src = ''; resetImageZoom(); updateModalLock(); }

  async function openInfoCard(card) {
    if (!card) return;
    const withoutTitle = (content) => {
      const cardTitleNormalized = normalize(card.title);
      const seen = new Set();
      const blocks = (content.blocks || []).filter((block) => {
        const text = clean(block.text);
        const normalized = normalize(text);
        if (!text || !normalized) return false;
        if (normalized === cardTitleNormalized) return false;
        if (cardTitleNormalized && normalized.startsWith(`${cardTitleNormalized} · `)) return false;
        if (block.tag && block.tag.startsWith('h') && (normalized.includes(cardTitleNormalized) || cardTitleNormalized.includes(normalized))) return false;
        if (block.tag === 'p' && (text.toLowerCase().startsWith(card.title.toLowerCase()) || text.toLowerCase() === `${card.title.toLowerCase()}:`)) return false;
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
      const imageKey = (src) => {
        try { return new URL(src).pathname.replace(/-\d+x\d+(?=\.[^.]+$)/, ''); } catch (_) { return src; }
      };
      const heroImageKey = imageKey(card.image);
      return {
        ...content,
        blocks,
        images: (content.images || []).filter((image) => imageKey(image.src) !== heroImageKey).filter((image, index, all) => all.findIndex((candidate) => imageKey(candidate.src) === imageKey(image.src)) === index)
      };
    };
    $('#cardImage').src = card.image;
    $('#cardImage').alt = card.alt || card.title;
    $('#cardTitle').textContent = card.title;
    const cachedCard = cardCache[card.url];
    $('#cardDetails').innerHTML = cachedCard ? infoContentMarkup(withoutTitle(cachedCard)) : '<div class="content-skeleton" aria-hidden="true"><i></i><i></i><i></i></div>';
    $('#cardOverlay').hidden = false;
    updateModalLock();
    if (cachedCard) {
      fetchCardContent(card).catch(() => {});
      return;
    }
    try {
      const content = await fetchCardContent(card);
      const details = withoutTitle(content);
      $('#cardDetails').innerHTML = infoContentMarkup(details);
    } catch (_) {
      const cached = cardCache[card.url];
      if (cached) $('#cardDetails').innerHTML = infoContentMarkup(withoutTitle(cached));
      else $('#cardDetails').innerHTML = `<p>${escapeHtml(card.description || 'Información publicada por Iahadut HaTora en el catálogo oficial.')}</p>`;
    }
  }

  function closeInfoCard() { $('#cardOverlay').hidden = true; $('#cardImage').src = ''; updateModalLock(); }

  function stopCamera() {
    if (scanFrame) cancelAnimationFrame(scanFrame);
    scanFrame = 0;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    $('#camera').srcObject = null;
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { closeScanner(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false});
      $('#camera').srcObject = stream;
      if (!('BarcodeDetector' in window)) { $('#scanMessage').textContent = 'Este dispositivo no ofrece lectura automática. Ingresá el EAN o UPC.'; return; }
      const requestedFormats = ['ean_13','ean_8','upc_a','upc_e','itf14','code_128','codabar'];
      const supportedFormats = BarcodeDetector.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : requestedFormats;
      const formats = requestedFormats.filter((format) => supportedFormats.includes(format));
      const detector = new BarcodeDetector(formats.length ? {formats} : undefined);
      const tick = async () => { if (!stream) return; try { const codes = await detector.detect($('#camera')); if (codes[0] && codes[0].rawValue) { stopCamera(); resolveBarcode(codes[0].rawValue); return; } } catch (_) {} scanFrame = requestAnimationFrame(tick); };
      scanFrame = requestAnimationFrame(tick);
    } catch (_) { closeScanner(); }
  }
  window.__ihtCameraReady = startCamera;
  window.__ihtCameraDenied = () => closeScanner();

  function openWebScanner(message = 'Alineá el código dentro del recuadro.', useCamera = true) {
    pendingScanProduct = null;
    $('#scanMessage').textContent = message;
    $('#scanOverlay').hidden = false;
    $('#scanOverlay').classList.remove('scan-result');
    $('#scanOverlay').classList.toggle('manual-only', !useCamera);
    $('#camera').hidden = false;
    $('.frame').hidden = false;
    $('#barcode').value = '';
    updateModalLock();
    if (useCamera) startCamera(); else stopCamera();
  }

  async function openScanner() {
    if (!Capacitor.isNativePlatform()) {
      openWebScanner();
      return;
    }
    try {
      const {
        CapacitorBarcodeScanner,
        CapacitorBarcodeScannerAndroidScanningLibrary,
        CapacitorBarcodeScannerCameraDirection,
        CapacitorBarcodeScannerScanOrientation,
        CapacitorBarcodeScannerTypeHint
      } = await import('@capacitor/barcode-scanner');
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint:CapacitorBarcodeScannerTypeHint.ALL,
        scanInstructions:'Alineá el código de barras del producto',
        scanButton:false,
        scanText:'Escanear',
        cameraDirection:CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation:CapacitorBarcodeScannerScanOrientation.PORTRAIT,
        cancelButtonAccessibilityLabel:'Cancelar escaneo',
        torchButtonOnAccessibilityLabel:'Apagar linterna',
        torchButtonOffAccessibilityLabel:'Encender linterna',
        android:{scanningLibrary:CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT}
      });
      if (result?.ScanResult) await resolveBarcode(result.ScanResult);
    } catch (error) {
      const cancellation = `${error?.code || ''} ${error?.message || error || ''}`;
      if (/0006|cancel(?:led|ado|aci[oó]n)?/i.test(cancellation)) return;
      // Si Android rechaza el permiso o el lector nativo no puede iniciarse,
      // no mostramos una segunda pantalla de error: volvemos a la vista que
      // estaba usando la persona y dejamos el ingreso manual en Catálogo.
      closeScanner();
    }
  }

  function closeScanner() {
    stopCamera();
    pendingScanProduct = null;
    $('#scanOverlay').hidden = true;
    $('#scanOverlay').classList.remove('manual-only', 'scan-result');
    $('#camera').hidden = false;
    $('.frame').hidden = false;
    $('#scanMessage').textContent = 'Alineá el código dentro del recuadro.';
    updateModalLock();
  }
  window.__ihtCloseScanner = closeScanner;
  function barcodeCandidates(value) {
    const code = String(value || '').replace(/\D/g, '');
    if (!code) return [];
    const candidates = [code];
    // UPC-A is commonly returned as 12 digits while catalog data stores it as EAN-13.
    if (code.length === 12) candidates.push(`0${code}`);
    if (code.length === 13 && code.startsWith('0')) candidates.push(code.slice(1));
    return [...new Set(candidates)];
  }

  function findProductsByBarcode(value) {
    const candidates = barcodeCandidates(value);
    if (!candidates.length) return [];
    return products.filter((product) => {
      const barcode = canonicalBarcode(product.barcode);
      return barcode && barcodeCandidates(barcode).some((candidate) => candidates.includes(candidate));
    });
  }

  function findProductByIdentity(identity) {
    const nameTokens = normalize(identity?.name).split(/\s+/).filter((token) => token.length > 2 && !['con', 'para', 'del', 'una'].includes(token));
    const brand = normalize(identity?.brand);
    if (nameTokens.length < 2) return null;
    return products
      .map((product) => {
        const title = normalize(product.title);
        const titleTokens = nameTokens.filter((token) => title.includes(token));
        const brandMatch = brand && normalize(`${product.title} ${product.brand || ''}`).includes(brand);
        const score = titleTokens.length + (brandMatch ? 3 : 0);
        return {product, score, brandMatch};
      })
      .filter(({score, brandMatch}) => score >= Math.max(2, Math.ceil(nameTokens.length * .45)) && (brandMatch || nameTokens.length <= 3))
      .sort((a, b) => b.score - a.score)[0]?.product || null;
  }

  function scanCategoryPath(identity) {
    const text = normalize(`${identity?.name || ''} ${identity?.brand || ''} ${identity?.categories || ''}`);
    const rules = [
      [['Bebidas'], /bebida|beverage|drink|gaseosa|soda|cola|jugo|juice|agua|water|refresco|isoton|energy drink/],
      [['Café'], /cafe|coffee|nescafe/],
      [['Té'], /\bte\b|tea|infusion/],
      [['Arroz'], /arroz|rice/],
      [['Avena'], /avena|oat/],
      [['Maíz y polenta'], /maiz|maize|corn flakes|polenta|pochoclo/],
      [['Granolas'], /granola/],
      [['Quinoa'], /quinoa/],
      [['Semillas'], /semilla|seed|chia|lino|sesamo|sesame/],
      [['Cereales'], /cereal|grain|grano/],
      [['Azúcares y endulzantes'], /edulcorante|sweetener|azucar|sugar|stevia|sucralosa/],
      [['Aceites'], /aceite|oil|oliva|olive|girasol|sunflower/],
      [['Aceitunas'], /aceituna|olive/],
      [['Manteca'], /manteca|butter/],
      [['Lácteos'], /lacteo|dairy|leche|milk|queso|cheese|yogur|yogurt|manteca|butter/],
      [['Panadería y repostería'], /pan|bread|galleta|cookie|harina|flour|reposteria|bakery/],
      [['Dulce de leche'], /dulce\s+de\s+leche/],
      [['Mermeladas'], /mermelada|jam|jalea/],
      [['Miel'], /\bmiel\b|honey/],
      [['Obleas'], /oblea|wafer/],
      [['Caramelos y golosinas', 'Pastillas'], /pastilla/],
      [['Alfajores'], /alfajor/],
      [['Chocolates y bombones'], actualChocolateProductPattern],
      [['Caramelos y golosinas'], /caramelo|candy|golosina/],
      [['Aderezos', 'Ketchup'], /ketchup/],
      [['Aderezos', 'Mostaza'], /mostaza/],
      [['Aderezos', 'Mayonesas'], /mayonesa/],
      [['Condimentos', 'Condimentos para hamburguesas'], /(?:condimento|sazonador|especia).*hamburguesas?/],
      [['Aderezos'], /aderezo|dressing|mayonesa|salsa\s+(?:golf|cesar|césar|barbacoa|bbq)/],
      [['Condimentos'], /condimento|spice|especia|pimienta|sazonador|sal\b/],
      [['Salsas'], /salsa|sauce/],
      [['Conservas', 'Pepinos en conserva'], /pepinos?\s+(?:en\s+vinagre|encurtidos?)/],
      [['Pastas dulces'], /pastas?\s+dulces?/],
      [['Frutos secos y deshidratados'], /fruto seco|nuts?|almendra|almond|mani|peanut|nuez|walnut|pistacho|pistachio|pasas?|raisin/],
      [['Pastas'], /pasta|fideo|noodle|raviol/],
      [['Snacks'], /snack|chips?|papas fritas|popcorn/]
    ];
    return rules.find(([, pattern]) => pattern.test(text))?.[0] || identity?.categoryPath || [];
  }

  function findScanAlternatives(identity, code, limit = 4) {
    const categoryPath = scanCategoryPath(identity);
    if (!categoryPath.length || categoryPath[0] === 'Otros productos') return [];
    const matched = findProductByIdentity(identity);
    const candidates = products.filter((product) => product.image && product.url !== matched?.url);
    const sameSubcategory = categoryPath.length > 1
      ? candidates.filter((product) => productCategoryPath(product).slice(0, categoryPath.length).join('|') === categoryPath.join('|'))
      : [];
    const sameCategory = categoryPath.length
      ? candidates.filter((product) => productCategoryPath(product)[0] === categoryPath[0])
      : [];
    const seedValue = [...String(code || 'scan')].reduce((hash, char) => ((hash * 33) + char.charCodeAt(0)) >>> 0, 5381);
    const varied = (items) => [...items].sort((a, b) => {
      const rank = (product) => [...product.url].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, seedValue);
      return rank(a) - rank(b);
    });
    const ordered = [...varied(sameSubcategory), ...varied(sameCategory)];
    return [...new Map(ordered.map((product) => [product.url, product])).values()].slice(0, limit);
  }

  async function barcodeIdentity(code) {
    try {
      const url = `https://world.openfoodfacts.net/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_es,brands,categories,categories_tags`;
      const response = Capacitor.isNativePlatform()
        ? await CapacitorHttp.get({url, connectTimeout:7000, readTimeout:7000})
        : await fetch(url, {headers:{Accept:'application/json'}});
      const data = response?.data || await response.json();
      if (Number(data?.status) !== 1 || !data?.product) return null;
      const name = clean(data.product.product_name_es || data.product.product_name);
      const brand = clean(String(data.product.brands || '').split(',')[0]);
      const categoriesText = clean(data.product.categories || (Array.isArray(data.product.categories_tags) ? data.product.categories_tags.join(' ') : ''));
      const categorySource = `${name} ${brand} ${categoriesText}`;
      const categoryPath = scanCategoryPath({name, brand, categories:categoriesText, categoryPath:productCategoryPath({title:categorySource, description:''})});
      return {name, brand, categories:categoriesText, categoryPath, normalizedName:normalize(name), normalizedBrand:normalize(brand)};
    } catch (_) { return null; }
  }

  function showScanResult(code, product = null, identity = null, exactMatches = []) {
    pendingScanProduct = product;
    stopCamera();
    $('#scanOverlay').hidden = false;
    $('#scanOverlay').classList.add('scan-result', 'manual-only');
    $('#camera').hidden = true;
    $('.frame').hidden = true;
    const externalName = clean(identity?.name);
    const externalBrand = clean(identity?.brand);
    if (product) {
      $('#scanMessage').innerHTML = `<span class="scan-result-status found">¡Kosher! =)</span><strong class="scan-result-title">${styledBrandText(product.title)}</strong><small class="scan-result-code">Código escaneado: ${escapeHtml(code)}</small><button class="scan-result-action" type="button" data-scan-open>Ver ficha del producto</button>`;
    } else if (exactMatches.length > 1) {
      const matchesMarkup = exactMatches.map((item) => `<button class="scan-alternative" type="button" data-scan-alternative="${escapeHtml(item.url)}"><span>${escapeHtml(item.title)}</span></button>`).join('');
      $('#scanMessage').innerHTML = `<span class="scan-result-status found">Código reconocido</span><strong class="scan-result-title">Hay más de una ficha asociada</strong><small class="scan-result-code">Código escaneado: ${escapeHtml(code)}</small><span class="scan-result-note">Elegí la ficha correcta para continuar.</span><div class="scan-alternatives"><div class="scan-alternatives-grid">${matchesMarkup}</div></div><button class="scan-result-action secondary" type="button" data-scan-again>Escanear otro producto</button>`;
    } else {
      const identified = externalName ? `<strong class="scan-result-title">${escapeHtml(externalName)}${externalBrand ? ` · ${escapeHtml(externalBrand)}` : ''}</strong>` : '';
      const alternatives = findScanAlternatives(identity, code);
      const alternativesMarkup = alternatives.length ? `<div class="scan-alternatives"><strong>Te sugerimos productos de esta categoría</strong><div class="scan-alternatives-grid">${alternatives.map((item) => `<button class="scan-alternative" type="button" data-scan-alternative="${escapeHtml(item.url)}"><img src="${escapeHtml(item.image)}" alt=""><span>${escapeHtml(item.title)}</span></button>`).join('')}</div></div>` : '';
      const resultTitle = 'No encontramos este producto';
      const resultNote = 'Puede que el código todavía no esté cargado. Probá buscándolo en la lista por nombre o marca.';
      const searchMarkup = `<button class="scan-result-action" type="button" data-scan-search="${escapeHtml(externalName)}">Buscar en la lista</button>`;
      $('#scanMessage').innerHTML = `<span class="scan-result-status not-found">Código no encontrado</span>${identified}<strong class="scan-result-title">${resultTitle}</strong><small class="scan-result-code">Código: ${escapeHtml(code)}</small><span class="scan-result-note">${resultNote}</span>${searchMarkup}${alternativesMarkup}<button class="scan-result-action secondary" type="button" data-scan-again>Escanear otro producto</button>`;
    }
    $('#barcode').value = code;
    updateModalLock();
  }

  function showScanLoading(code) {
    pendingScanProduct = null;
    stopCamera();
    $('#scanOverlay').hidden = false;
    $('#scanOverlay').classList.add('scan-result', 'manual-only');
    $('#camera').hidden = true;
    $('.frame').hidden = true;
    $('#scanMessage').innerHTML = `<span class="scan-loading-logo" aria-hidden="true"><i class="ph ph-barcode scan-loading-mark"></i><i class="scan-loading-shimmer"></i></span><strong class="scan-loading-title">Buscando el producto</strong><span class="scan-loading-copy">Estamos verificando el código escaneado…</span><small class="scan-result-code">Código: ${escapeHtml(code)}</small>`;
    $('#barcode').value = code;
    updateModalLock();
  }

  async function resolveBarcode(raw) {
    const code = String(raw || '').replace(/\D/g,'');
    if (!code) return;
    stopCamera();
    const exactMatches = findProductsByBarcode(code);
    if (exactMatches.length === 1) {
      closeScanner();
      openDetail(exactMatches[0].url, {fromScan:true});
      return;
    }
    if (exactMatches.length > 1) {
      showScanResult(code, null, null, exactMatches);
      return;
    }
    showScanLoading(code);
    const identity = await barcodeIdentity(code);
    // A name/brand match is only a hint. It must never replace an exact
    // barcode association, otherwise a scan can open a different product.
    showScanResult(code, null, identity);
  }

  function goBackTaxonomy() {
    const parent = activeCategoryPath.slice(0, -1);
    if (parent.length) openTaxonomyPath(parent);
    else { renderCategoryDirectory(); showView('categoryDirectoryView'); }
  }

  function goBackReader() {
    const target = readerHistory.pop();
    if (target?.type === 'info') { openInfo(target.key, {fromHistory:true}); return; }
    currentInfoKey = '';
    showView(target?.id || 'moreView');
  }

  async function handleMobileBack() {
    if (!$('#filterOverlay').hidden) { $('#filterOverlay').hidden = true; updateModalLock(); return; }
    if (!$('#scanOverlay').hidden) { closeScanner(); return; }
    if (!$('#imageOverlay').hidden) { closeImage(); return; }
    if (!$('#cardOverlay').hidden) { closeInfoCard(); return; }
    const activeView = document.querySelector('.view.active')?.id || 'homeView';
    if (activeView === 'searchView') { returnHome(); return; }
    if (activeView === 'detailView') { returnFromDetail(); return; }
    if (activeView === 'readerView') { goBackReader(); return; }
    if (activeView === 'subcategoryDirectoryView' || activeView === 'categoryProductsView') { goBackTaxonomy(); return; }
    if (activeView === 'timelineView' || activeView === 'alertsView' || activeView === 'categoryDirectoryView' || activeView === 'moreView' || activeView === 'savedView') { returnHome(); return; }
    if (Capacitor.isNativePlatform()) await App.exitApp();
  }

  App.addListener('backButton', handleMobileBack).catch(() => {});

  if (Capacitor.isNativePlatform()) {
    PlayStoreUpdates.addListener('updateDownloaded', () => {
      playUpdateState = {...playUpdateState, downloaded:true};
      renderHomeAppUpdate();
      renderMore();
    }).catch(() => {});
    App.addListener('appStateChange', ({isActive}) => {
      if (!isActive) return;
      void applyNativeCatalogCacheIfNewer();
      refreshPlayUpdate();
    }).catch(() => {});
  }

  document.querySelectorAll('.nav').forEach((button) => button.onclick = () => button.dataset.view === 'homeView' ? returnHome() : button.dataset.view === 'searchView' ? openSearchScreen() : showView(button.dataset.view));
  document.addEventListener('pointerdown', (event) => {
    const regionButton = event.target.closest('#searchView .region-switch [data-region]');
    if (regionButton && document.activeElement === $('#query')) event.preventDefault();
  });
  document.addEventListener('click', (event) => {
    const scanOpenButton = event.target.closest('[data-scan-open]');
    if (scanOpenButton) {
      const product = pendingScanProduct;
      closeScanner();
      if (product) openDetail(product.url);
      return;
    }
    const scanAgainButton = event.target.closest('[data-scan-again]');
    if (scanAgainButton) { openWebScanner(); return; }
    const scanSearchButton = event.target.closest('[data-scan-search]');
    if (scanSearchButton) {
      $('#homeQuery').value = scanSearchButton.dataset.scanSearch || '';
      closeScanner();
      openSearchScreen();
      doSearch($('#query'));
      return;
    }
    const scanAlternative = event.target.closest('[data-scan-alternative]');
    if (scanAlternative) { closeScanner(); openDetail(scanAlternative.dataset.scanAlternative); return; }
    const loadMoreButton = event.target.closest('[data-load-more-products]');
    if (loadMoreButton) { appendProductBatch(); return; }
    const exploreCategories = event.target.closest('[data-explore-categories]');
    if (exploreCategories) { openCategoryDirectoryFromHome(); return; }
    const taxonomyButton = event.target.closest('[data-taxonomy-path]');
    if (taxonomyButton) { openTaxonomyPath(JSON.parse(decodeURIComponent(taxonomyButton.dataset.taxonomyPath))); return; }
    const regionButton = event.target.closest('[data-region]');
    if (regionButton) {
      const keepSearchFocus = document.activeElement === $('#query');
      selectedRegion = regionButton.dataset.region;
      if (regionButton.closest('.region-switch')) {
        favoriteOnly = false;
        selectedCategory = selectedRegion === 'uruguay' ? 'uruguay' : 'all';
        $('#results').hidden = true;
        $('#searchCategories').hidden = false;
        $('#recentSearches').hidden = false;
        renderSearchCategories();
        if (keepSearchFocus) window.requestAnimationFrame(() => {
          const queryInput = $('#query');
          if (!queryInput || !document.body.classList.contains('search-open')) return;
          queryInput.focus({preventScroll:true});
          queryInput.setSelectionRange(queryInput.value.length, queryInput.value.length);
        });
        return;
      }
      favoriteOnly = false; showView('searchView'); renderResults($('#query').value); renderSearchCategories(); return;
    }
    const retiredButton = event.target.closest('[data-open-retired]');
    if (retiredButton) { showView('alertsView'); return; }
    const timelineButton = event.target.closest('[data-open-timeline]');
    if (timelineButton) { showView('timelineView'); return; }
    const categoryButton = event.target.closest('[data-category]'); if (categoryButton) { selectedCategory = categoryButton.dataset.category; favoriteOnly = false; showView('searchView'); renderResults(''); }
    const productButton = event.target.closest('[data-product]'); if (productButton && !event.target.closest('[data-favorite]')) openDetail(productButton.dataset.product);
    const favoriteButton = event.target.closest('[data-favorite]'); if (favoriteButton) { event.stopPropagation(); toggleFavorite(favoriteButton.dataset.favorite); }
    const recentButton = event.target.closest('[data-recent]'); if (recentButton) { $('#query').value = recentButton.dataset.recent; renderResults(recentButton.dataset.recent); }
    const infoButton = event.target.closest('[data-info]'); if (infoButton) openInfo(infoButton.dataset.info);
    const savedButton = event.target.closest('[data-saved]'); if (savedButton) { openSavedScreen(); return; }
    const clearHistoryButton = event.target.closest('[data-clear-history]'); if (clearHistoryButton) { if (!recent.length || window.confirm('¿Borrar el historial de búsquedas?')) { recent = []; localStorage.removeItem('iht_recent'); renderMore(); renderSearchCategories(); } }
    const notificationButton = event.target.closest('[data-enable-notifications]');
    if (notificationButton) { setupPushNotifications(true).then(() => { renderAlerts(); renderPushNotifications(); renderMore(); }); return; }
    const disableNotificationButton = event.target.closest('[data-disable-notifications]');
    if (disableNotificationButton) { disablePushNotifications(); return; }
    const openAlertsButton = event.target.closest('[data-open-alerts]');
    if (openAlertsButton) { showView('notificationsView'); return; }
    const openPlayStoreButton = event.target.closest('[data-open-play-store]');
    if (openPlayStoreButton) { openExternal(remoteControl.update_url || defaultRemoteControl.update_url); return; }
    const updateButton = event.target.closest('[data-app-update]');
    if (updateButton) {
      if (playUpdateState.downloaded) {
        PlayStoreUpdates.complete().then(() => { window.alert('La actualización se instalará al reiniciar la aplicación.'); refreshPlayUpdate(); }).catch(() => openExternal(remoteControl.update_url));
        return;
      }
      if (playUpdateState.available) {
        PlayStoreUpdates.start({type:'flexible'}).then((result) => { if (!result?.started) openExternal(remoteControl.update_url); }).catch(() => openExternal(remoteControl.update_url));
        return;
      }
      refreshRemoteControl(true).then((decision) => {
        if (decision.updateAvailable && remoteControl.update_url) openExternal(remoteControl.update_url);
        else window.alert(decision.updateAvailable ? 'La actualización todavía no tiene un enlace de descarga configurado.' : 'Ya tenés la última versión disponible.');
      });
      return;
    }
    const copyValueButton = event.target.closest('[data-copy-value]');
    if (copyValueButton) {
      const text = copyValueButton.dataset.copyValue || '';
      const copy = navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject();
      copy.then(() => {
        copyValueButton.classList.add('copied');
        copyValueButton.setAttribute('aria-label', 'Dato copiado');
        copyValueButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
        window.setTimeout(() => {
          copyValueButton.classList.remove('copied');
          copyValueButton.setAttribute('aria-label', 'Copiar dato');
          copyValueButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
        }, 1600);
      }).catch(() => window.prompt('Copiá este dato:', text));
      return;
    }
    const cardButton = event.target.closest('[data-info-card]');
    const photo = event.target.closest('.info-photo');
    const expandedImage = event.target.closest('[data-expanded-image]');
    if (expandedImage) { event.preventDefault(); openImage(expandedImage.dataset.expandedImage, expandedImage.dataset.expandedCaption || 'Nota Kashrut'); return; }
    if (cardButton && window.__ihtInfoCards) { event.preventDefault(); event.stopPropagation(); openInfoCard(window.__ihtInfoCards[Number(cardButton.dataset.infoCard)]); return; }
    if (photo) { event.preventDefault(); event.stopPropagation(); openImage(photo.currentSrc || photo.src, photo.alt || ''); }
  });
  const dismissKeyboard = (input) => { input?.blur(); window.scrollTo({top: 0, behavior: 'smooth'}); };
  $('#homeForm').onsubmit = (event) => { event.preventDefault(); dismissKeyboard($('#homeQuery')); doSearch($('#homeQuery'), true); };
  $('#searchForm').onsubmit = (event) => { event.preventDefault(); dismissKeyboard($('#query')); doSearch($('#query')); };
  $('#homeClear').onclick = () => { $('#homeQuery').value = ''; $('#homeClear').hidden = true; };
  $('#clear').onclick = () => { $('#query').value = ''; updateSearchScanAction(false); $('.bottom-nav').classList.remove('has-query'); $('#clear').hidden = true; $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; $('#query').focus(); startSearchPlaceholders(); };
  $('#detailSave').onclick = () => { if (currentProduct) toggleFavorite(currentProduct.url); };
  $('#detailShare').onclick = shareCurrentProduct;
  $('#homeQuery').addEventListener('input', () => {
    const hasText = Boolean($('#homeQuery').value.trim());
    $('#homeClear').hidden = !$('#homeQuery').value;
    if (hasText) window.clearInterval(homePlaceholderTimer); else startHomePlaceholders();
  });
  $('#query').addEventListener('input', () => {
    const hasText = Boolean($('#query').value.trim());
    $('.bottom-nav').classList.toggle('has-query', hasText);
    updateSearchScanAction(hasText);
    if ($('#query').value.trim()) window.clearInterval(searchPlaceholderTimer); else startSearchPlaceholders();
    $('#clear').hidden = !$('#query').value;
    // Al aparecer la primera letra no dejamos las categorías visibles durante
    // la espera del filtro: de lo contrario Uruguay queda expuesto un frame
    // debajo del vidrio y desaparece cuando termina el debounce.
    if (hasText) {
      $('#searchCategories').hidden = true;
      $('#recentSearches').hidden = true;
    }
    window.clearTimeout(searchTimer);
    const value = clean($('#query').value);
    if (value) renderResults(value);
    else { $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; }
  });
  $('#homeQuery').addEventListener('focus', openSearchScreen);
  startHomePlaceholders();
  $('#searchBack').onclick = returnHome;
  $('#categoryDirectoryBack').onclick = returnHome;
  $('#subcategoryDirectoryBack').onclick = goBackTaxonomy;
  $('#categoryProductsBack').onclick = goBackTaxonomy;
  $('#catalogInfo').onclick = openCatalogInfo;
  $('#seeAlerts').onclick = () => showView('alertsView');
  $('#alertsBack').onclick = returnHome;
  $('#timelineBack').onclick = returnHome;
  $('#savedBack').onclick = returnHome;
  $('#detailBack').onclick = returnFromDetail;
  $('#readerBack').onclick = goBackReader;
  $('#closeImage').onclick = closeImage;
  $('#imageOverlay').onclick = (event) => { if (event.target === $('#imageOverlay')) closeImage(); };
  $('#expandedImage').addEventListener('pointerdown', (event) => {
    event.preventDefault(); $('#expandedImage').setPointerCapture?.(event.pointerId);
    imageGesture.pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
    if (imageGesture.pointers.size === 2) { const [a,b] = [...imageGesture.pointers.values()]; imageGesture.startDistance = Math.hypot(a.x - b.x, a.y - b.y); imageGesture.startScale = imageGesture.scale; }
  });
  $('#expandedImage').addEventListener('pointermove', (event) => {
    if (!imageGesture.pointers.has(event.pointerId)) return;
    const previous = imageGesture.pointers.get(event.pointerId);
    imageGesture.pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
    if (imageGesture.pointers.size >= 2) { const [a,b] = [...imageGesture.pointers.values()]; const distance = Math.hypot(a.x - b.x, a.y - b.y); imageGesture.scale = Math.min(5, Math.max(1, imageGesture.startScale * distance / Math.max(1, imageGesture.startDistance))); }
    else if (imageGesture.scale > 1) { imageGesture.x += event.clientX - previous.x; imageGesture.y += event.clientY - previous.y; }
    applyImageZoom();
  });
  const endImagePointer = (event) => { imageGesture.pointers.delete(event.pointerId); if (imageGesture.pointers.size < 2) imageGesture.startDistance = 0; };
  $('#expandedImage').addEventListener('pointerup', endImagePointer);
  $('#expandedImage').addEventListener('pointercancel', endImagePointer);
  $('#expandedImage').addEventListener('dblclick', () => { imageGesture.scale = imageGesture.scale > 1 ? 1 : 2.5; if (imageGesture.scale === 1) { imageGesture.x = 0; imageGesture.y = 0; } applyImageZoom(); });
  $('#expandedImage').addEventListener('wheel', (event) => { event.preventDefault(); imageGesture.scale = Math.min(5, Math.max(1, imageGesture.scale + (event.deltaY < 0 ? .25 : -.25))); if (imageGesture.scale === 1) { imageGesture.x = 0; imageGesture.y = 0; } applyImageZoom(); }, {passive:false});
  $('#closeCard').onclick = closeInfoCard;
  $('#cardImage').onclick = () => { if ($('#cardImage').src) openImage($('#cardImage').src, $('#cardTitle').textContent || 'Imagen'); };
  $('#cardOverlay').onclick = (event) => { if (event.target === $('#cardOverlay')) closeInfoCard(); };
  $('#homeScan').onclick = openScanner; updateSearchScanAction(false); $('#closeScan').onclick = closeScanner;
  $('#barcodeForm').onsubmit = (event) => { event.preventDefault(); const code = $('#barcode').value; closeScanner(); resolveBarcode(code); };
  document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (!$('#scanOverlay').hidden) closeScanner(); if (!$('#imageOverlay').hidden) closeImage(); if (!$('#cardOverlay').hidden) closeInfoCard(); });
  function openFilters() {
    $('#filterOptions').innerHTML = `<button class="filter-option ${selectedCategory === 'all' ? 'active' : ''}" data-filter="all">${categoryIcon('all')}<span>Todos los productos</span></button>${categories.map((category) => `<button class="filter-option ${selectedCategory === category.key ? 'active' : ''}" data-filter="${category.key}">${categoryIcon(category.key)}<span>${escapeHtml(category.name)}</span></button>`).join('')}`;
    $('#filterOverlay').hidden = false;
    updateModalLock();
  }
  $('#filterBtn').addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openFilters(); });
  $('#closeFilter').onclick = () => { $('#filterOverlay').hidden = true; updateModalLock(); };
  $('#filterOverlay').onclick = (event) => { if (event.target === $('#filterOverlay')) { $('#filterOverlay').hidden = true; updateModalLock(); return; } const filter = event.target.closest('[data-filter]'); if (filter) { selectedCategory = filter.dataset.filter; if (selectedCategory === 'uruguay') selectedRegion = 'uruguay'; $('#filterOverlay').hidden = true; updateModalLock(); renderResults($('#query').value); } };
  const clearActiveFilter = () => { selectedCategory = 'all'; selectedRegion = 'all'; renderResults($('#query').value); };
  $('#resetFilter').onclick = () => { clearActiveFilter(); $('#filterOverlay').hidden = true; updateModalLock(); };
  $('#clearSearchScope').onclick = clearActiveFilter;
  $('#syncStatus').onclick = () => syncAndPreload(true);
  $('#accessRetry').onclick = () => refreshRemoteControl(true);
  $('#accessUpdate').onclick = () => openExternal(remoteControl.update_url);
  renderHome(); renderSearchCategories(); infoNoticeKeys.forEach((key) => updateInfoNotice(key));
  refreshAlertBadge();
  syncMessage(lastSyncMessage(), syncState.last ? 'ok' : '');
  // La interfaz queda disponible de inmediato. La precarga completa continúa
  // en segundo plano y comunica su estado en la barra superior.
  preloadInitialProductImages();
  loadGlobalPopularity();
  const remoteControlReady = refreshRemoteControl(false);
  refreshPlayUpdate();
  setupPushNotifications(false);
  remoteControlReady.then(() => setupPushNotifications(false)).catch(() => {});
  startBackgroundPreparation().finally(() => {
    window.setTimeout(scheduleAppPreload, 350);
    syncAndPreload(false).finally(scheduleAppPreload);
  });
  setInterval(() => syncAndPreload(false), 12 * 60 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { syncAndPreload(false); refreshRemoteControl(false); refreshPlayUpdate(); }
  });
  window.addEventListener('online', () => { syncAndPreload(false).finally(scheduleAppPreload); });
})();
