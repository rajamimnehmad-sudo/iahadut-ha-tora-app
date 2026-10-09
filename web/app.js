import {createNoticeViews,observeNoticeViews} from './notice-views.js';
import {centeredCarouselOffset} from './carousel-layout.js';
import {enableBrandMarqueeDrag} from './brand-marquee.js';
import {createDetailRecovery} from './detail-recovery.js';
import {createUsageAnalytics} from './usage-analytics.js';
import {productSearchKey, validGlobalRanking} from './global-popularity.js';
import initialGlobalRanking from './data/global-popularity.json';
import { storeLinks, platformRemoteControl, appleDistributionUrl } from './platform-store.js';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { APP_VERSION, accessDecision, defaultRemoteControl, loadRemoteControl } from './remote-control.js';
import { firebaseConfig } from './firebase-config.js';
import { notificationEventKey, notificationIsRevoked, reconcilePushHistory, readRevokedPushes, loadRevokedPushes } from './push-revocations.js';
import { catalogSnapshotNeedsRepair } from './catalog-cache.js';
import {normalizedSnapshot, snapshotHash, readPublishedSnapshot} from './published-catalog.js';
import catalogSnapshot from './data/catalog.json';
import { productText } from './product-text.js';
import { catalogCategoryPath, validCategoryPath } from './catalog-categories.js';
import {correctDisplayText} from './text-corrections.js';
import {browserCatalogPresentation} from './catalog-presentation-browser.js';
import bundledPresentation from './data/catalog-presentation.json';
import { mergeAlertHistory } from './alert-history.js';
import { categoryInformation } from './category-info.js';
import {collectOfflineImages, createOfflineDownload, offlineNetworkMayDownload, offlineContentRevision} from './offline-download.js';
import {pushImageUrl} from './push-image.js';
import {mergeInboxNotifications, alertExpired} from './alerts-inbox.js';
import {pushBody} from './push-text.js';
import {matchingCategories, navigationScrollKey, matchingBrands, brandName, brandKey} from './category-navigation.js';
import {brandLogo, brandForLogoPath} from './brand-logos.js';
import {additionKeys, unreadAdditionCount} from './catalog-unread.js';
import {appWhatsAppLink, appShareWhatsAppLink} from './whatsapp-links.js';
import {createLiveSearchClient, createLiveSearchTransport, LIVE_SEARCH_REFRESH_INTERVAL} from './live-search.js';
import featuredProductsSnapshot from './data/featured-products.json';
import featuredImageBounds from './data/featured-image-bounds.json';
import contentSnapshot from './data/content.json';
import productDetailsSnapshot from './data/product-details.json';
import '@fontsource-variable/manrope';
import '@phosphor-icons/web/regular';

document.documentElement.dataset.platform = Capacitor.getPlatform();
if (Capacitor.getPlatform() === 'ios') {
  // Devices with a home button retain the shared Android dock. Bottom/side
  // safe areas identify edge-to-edge layouts, including landscape rotation.
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;width:calc(env(safe-area-inset-left,0px) + env(safe-area-inset-right,0px));height:env(safe-area-inset-bottom,0px);padding:0;border:0';
  document.body.append(probe);
  const updateIosDockLayout = () => {
    const {width, height} = probe.getBoundingClientRect();
    document.documentElement.dataset.iosEdgeToEdge = String(width > 0 || height > 0);
  };
  // Capacitor can provide safe areas after the first WebView layout. Observe
  // the inset itself instead of assuming a window resize accompanies it.
  new ResizeObserver(updateIosDockLayout).observe(probe);
  updateIosDockLayout();
  window.addEventListener('resize', updateIosDockLayout);
}

const PlayStoreUpdates = registerPlugin('PlayStoreUpdates');
const CatalogBackgroundSync = registerPlugin('CatalogBackgroundSync');
const OfflineNetwork = registerPlugin('OfflineNetwork');
const OfflineDownload = registerPlugin('OfflineDownload');
const ScannerPermissions = registerPlugin('ScannerPermissions');
const PushHistory = registerPlugin('PushHistory');

const initialPreparationPreview = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'initial-load';

if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
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
  // A vector close icon stays centered and legible regardless of font size.
  document.querySelectorAll('.sheet-close, .image-close, #closeScan').forEach(button => {
    button.classList.add('overlay-close-control');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', 'Cerrar escáner');
  });
  const viewTitleSlot = $('#viewTitleSlot');
  const viewHeaderOrigins = new Map();
  document.querySelectorAll('.view > .detail-head').forEach((header) => {
    const marker = document.createComment('view-title-origin');
    header.parentNode.insertBefore(marker, header);
    viewHeaderOrigins.set(header, marker);
  });
  const mountViewTitle = (viewId) => {
    const mounted = viewTitleSlot?.querySelector(':scope > .detail-head');
    if (mounted) {
      const marker = viewHeaderOrigins.get(mounted);
      marker?.parentNode?.insertBefore(mounted, marker.nextSibling);
    }
    const nextHeader = document.querySelector(`#${viewId} > .detail-head`);
    if (nextHeader && viewTitleSlot) viewTitleSlot.appendChild(nextHeader);
    document.body.classList.toggle('has-view-title', Boolean(nextHeader));
  };
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
  let presentationTextCorrections = bundledPresentation.textCorrections;
  const escapeHtml = (value) => correctDisplayText(value || '', presentationTextCorrections).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const productFallbackImage = 'assets/product-placeholder.svg';
  const developerLogoAssetUrl = new URL('./assets/waien-studio-logo.png', import.meta.url).href;
  // Resolver el sello desde el módulo evita que una ruta relativa cambie
  // cuando la app corre dentro del WebView de Capacitor o con otra base URL.
  const shareLogoAssetUrl = new URL('./assets/logo.png', import.meta.url).href;
  let distributionLinks = storeLinks(Capacitor.getPlatform(), import.meta.env.VITE_IOS_STORE_URL);
  let appInstallUrl = distributionLinks.install;
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

  // El header se integra con el fondo en reposo y solo gana una separación
  // sutil cuando el usuario empieza a desplazarse por el contenido.
  let headerScrollFrame = 0;
  const updateHeaderScrollState = () => {
    if (headerScrollFrame) return;
    headerScrollFrame = window.requestAnimationFrame(() => {
      headerScrollFrame = 0;
      const topbar = $('.topbar');
      if (!topbar) return;
      const appShell = $('.app');
      const scrollTop = Math.max(Number(window.scrollY) || 0, Number(appShell?.scrollTop) || 0);
      topbar.classList.toggle('is-scrolled', scrollTop > 10);
      document.body.classList.toggle('app-scrolled', scrollTop > 10);
    });
  };
  window.addEventListener('scroll', updateHeaderScrollState, {passive:true});
  document.querySelector('.app')?.addEventListener('scroll', updateHeaderScrollState, {passive:true});
  updateHeaderScrollState();

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
  // The native cache can legitimately be older than the bundle shipped with
  // this build (for example after a user has opened the app while offline).
  // Never let that stale cache hide products and images that are already in
  // the current bundle.
  const bundledCatalogTimestamp = Date.parse(catalogSnapshot?.generatedAt || '') || 0;
  const nativeCatalogTimestamp = Date.parse(nativeCatalogCache?.catalog?.generatedAt || '') || 0;
  const useNativeCatalog = Boolean(nativeCatalogCache?.catalog)
    && (!bundledCatalogTimestamp || nativeCatalogTimestamp >= bundledCatalogTimestamp);
  const activeCatalogSnapshot = useNativeCatalog ? nativeCatalogCache.catalog : catalogSnapshot;
  const activeContentSnapshot = (useNativeCatalog ? nativeCatalogCache.content : null) || contentSnapshot;
  const activeProductDetailsSnapshot = (useNativeCatalog ? nativeCatalogCache.productDetails : null) || productDetailsSnapshot;
  const storedProducts = readJson('iht_products');
  const bundledProducts = Array.isArray(activeCatalogSnapshot?.products) ? activeCatalogSnapshot.products : [];
  const bundledProductByUrl = new Map(bundledProducts.map((product) => [product.url, product]));
  const bundledProductDetails = activeProductDetailsSnapshot?.products || {};
  // Older builds stamped the last download time as the catalog date, even
  // when the actual source version was older. Trust the source cursor.
  const storedCatalogTimestampAtBoot = Date.parse(localStorage.getItem('iht_catalog_version') || '') || 0;
  const activeCatalogTimestampAtBoot = Date.parse(activeCatalogSnapshot?.generatedAt || '') || 0;
  // A WorkManager download can refresh the native cache while an older
  // WebView copy remains in localStorage. Prefer the newer snapshot at boot
  // so Android does not keep showing the old 1.048-product list.
  // A newer authorized snapshot can contain fewer products after removals.
  // Product count must never override the catalog version.
  // Equal versions must represent the same snapshot. Legacy builds could
  // assign the bundle cursor to a different cached list (1,048 products).
  // A strictly newer source still wins even when authorized removals shrink it.
  const storedCatalogIsCurrent = !activeCatalogTimestampAtBoot
    || storedCatalogTimestampAtBoot > activeCatalogTimestampAtBoot
    || (storedCatalogTimestampAtBoot === activeCatalogTimestampAtBoot && storedProducts?.length === bundledProducts.length);
  const productSource = Array.isArray(storedProducts) && storedProducts.length && storedCatalogIsCurrent
    ? storedProducts
    : bundledProducts.length ? bundledProducts : Array.isArray(storedProducts) && storedProducts.length ? storedProducts : seed;
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
  let globalRanking = readJson('iht_global_ranking', null);
  if (!validGlobalRanking(globalRanking)) globalRanking = validGlobalRanking(initialGlobalRanking) ? initialGlobalRanking : null;
  let globalPopularityRequest = null;
  let liveRankingCheckedAt = 0;
  async function appSessionToken() {
      const firebase = await getFirebaseCatalogApi();
      if (!firebase) throw new Error('Sesión no disponible');
      const [{getApps}, {getAuth, getIdToken}] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
      const user = getAuth(getApps()[0]).currentUser;
      if (!user) throw new Error('Sesión no disponible');
      return getIdToken(user);
  }
  const recordNoticeSeen=createNoticeViews({storage:localStorage,online:()=>navigator.onLine,call:async eventKey=>{
    const token=await appSessionToken();
    const response=await fetch('https://iahadut-search-ranking.iahadut-search-ranking.workers.dev/notice-view',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({eventKey}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('No se pudo registrar la vista');return response.json();
  }});
  let stopNoticeViewObserver;
  const liveSearch = createLiveSearchClient({
    storage: {getItem:key => localStorage.getItem(key), setItem:(key,value) => localStorage.setItem(key,value)},
    call: createLiveSearchTransport({getToken:appSessionToken})
  });
  async function refreshGlobalRanking() {
    if (globalPopularityRequest) return globalPopularityRequest;
    const useLive = remoteControl.live_search_ranking_v1_enabled === true;
    if (useLive ? Date.now() - liveRankingCheckedAt < LIVE_SEARCH_REFRESH_INTERVAL
      : Date.now() - Number(readJson('iht_global_ranking_check', 0)) < 12 * 60 * 60 * 1000) return;
    const url = import.meta.env.DEV ? '/data/global-popularity.json' : 'https://raw.githubusercontent.com/rajamimnehmad-sudo/iahadut-ha-tora-app/main/web/data/global-popularity.json';
    globalPopularityRequest = (async () => {
      try {
        if (useLive) {
          const value = await liveSearch.ranking();
          if (!validGlobalRanking(value) || value.source !== 'app-search') throw new Error('Ranking inválido');
          liveRankingCheckedAt = Date.now();
          // Durante el arranque, conservar el ranking medido de Analytics
          // hasta que haya búsquedas reales en el contador nuevo.
          if (value.products.length || globalRanking?.source === 'app-search') {
            globalRanking = value;
            try { localStorage.setItem('iht_global_ranking', JSON.stringify(value)); } catch (_) {}
          }
          if (document.querySelector('.view.active')?.id === 'searchView' && !$('#query').value.trim()) renderSearchCategories();
          return;
        }
        const response = await fetch(url, {cache:'no-cache', signal:AbortSignal.timeout(10000)});
        if (!response.ok) throw new Error('Ranking no disponible');
        const value = await response.json();
        if (!validGlobalRanking(value)) throw new Error('Ranking inválido');
        if (!globalRanking || Date.parse(value.generatedAt) >= Date.parse(globalRanking.generatedAt)) {
          globalRanking = value; localStorage.setItem('iht_global_ranking', JSON.stringify(value));
        }
        localStorage.setItem('iht_global_ranking_check', String(Date.now()));
        if (document.querySelector('.view.active')?.id === 'searchView' && !$('#query').value.trim()) renderSearchCategories();
      } catch (_) {
        if (useLive) liveRankingCheckedAt = Date.now();
        /* Conservar la copia válida anterior, sin reemplazarla por sugerencias falsas. */
      }
    })().finally(() => { globalPopularityRequest = null; });
    return globalPopularityRequest;
  }
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
      })().catch(() => { firebaseReadyPromise = null; return null; });
    }
    return firebaseReadyPromise;
  }
  const usageAnalytics = createUsageAnalytics({enabled:Capacitor.isNativePlatform() && import.meta.env.PROD});
  const logAnalyticsEvent = usageAnalytics.track;
  if (Capacitor.isNativePlatform() && import.meta.env.PROD) {
    import('@capacitor-firebase/analytics').then(({FirebaseAnalytics}) => {
      usageAnalytics.connect(event => FirebaseAnalytics.logEvent(event));
    }).catch(() => {});
  }
  usageAnalytics.screen('homeView');
  const countPopularity = (key, type) => {
    const entry = popularity[key] || {searches: 0, opens: 0};
    entry[type] = (entry[type] || 0) + 1;
    popularity[key] = entry;
    // Un contador auxiliar nunca debe impedir abrir o buscar un producto.
    // Si el almacenamiento está lleno/bloqueado, conservarlo en memoria.
    try { localStorage.setItem('iht_popularity', JSON.stringify(popularity)); } catch (_) {}
  };
  let selectedCategory = 'all';
  let selectedRegion = 'argentina';
  let favoriteOnly = false;
  let currentProduct = null;
  let previousView = 'homeView';
  let previousScrollTop = 0;
  let currentInfoKey = '';
  const tabletLayout = window.matchMedia('(min-width: 701px) and (min-height: 600px)');
  const moreListHome = $('#moreList').parentElement;
  const shareAppHome = $('#shareAppWhatsApp').parentElement;
  let shareBusy = false;
  const shareImageCache = new Map();
  const shareImageTasks = new Map();
  let shareLogoPromise = null;
  let readerHistory = [];
  let stream = null;
  let scanFrame = 0;
  let cameraStartToken = 0;
  let cameraFallbackTimer = 0;
  let pendingScanProduct = null;
  let kosherToastTimer = 0;
  let searchTimer = 0;
  let activeCategoryPath = [];
  let taxonomyReturnView = 'categoryDirectoryView';
  let activeScrollKey = 'homeView';
  const viewScrollPositions = new Map();
  const RESULT_BATCH_SIZE = 48;
  let visibleProducts = [];
  let visibleProductCursor = 0;
  let visibleProductTarget = null;
  let resultObserver = null;
  let recentCarouselTimer = null;
  let recentCarouselRebaseTimer = null;
  let recentCarouselOffset = 0;
  let renderedHomeItemsKey = '';
  let remoteControl = platformRemoteControl({...defaultRemoteControl, configured:false, checkedAt:0}, Capacitor.getPlatform(), APP_VERSION, import.meta.env.VITE_IOS_STORE_URL);
  let playUpdateState = {available:false, downloaded:false, flexibleAllowed:false, checked:false};
  let remoteTaxonomyRules = [];
  const catalogPresentation = browserCatalogPresentation(bundledPresentation, () => refreshCatalogPresentationViews());
  function managedCategoryInfo(key) {
    return catalogPresentation.current().categoryInformation?.[key] || categoryInformation[key];
  }
  function refreshCatalogPresentationViews() {
    presentationTextCorrections = catalogPresentation.current().textCorrections || bundledPresentation.textCorrections;
    const texts = catalogPresentation.current().texts || {};
    const targets = {homeTitle:'.home-intro h1', welcomeTitle:'.tablet-welcome h2', welcomeDescription:'.tablet-welcome p', catalogTitle:'#searchView .page-head h1', featuredTitle:'.recent-products-section h2', usefulTitle:'.useful-section h2'};
    for (const [key, selector] of Object.entries(targets)) {
      const node = document.querySelector(selector);
      if (node && texts[key]) node.textContent = texts[key];
    }
    renderHome();
    renderSearchCategories();
    const view = document.querySelector('.view.active')?.id;
    if (view === 'categoryDirectoryView') renderCategoryDirectory();
    else if (['subcategoryDirectoryView','categoryProductsView'].includes(view)) openTaxonomyPath([...activeCategoryPath], {restoreScroll:true});
    if (view === 'searchView' && $('#query').value) renderResults($('#query').value);
    if (view === 'detailView' && currentProduct) renderDetail(currentProduct, productCache[currentProduct.url]);
  }
  function refreshCatalogPresentation(force = false) {
    return navigator.onLine ? catalogPresentation.refresh(force).catch(() => false) : Promise.resolve(false);
  }
  let pushListenersReady = false;
  let pushSetupRequest = null;
  let pushRegistrationQueue = Promise.resolve();
  let pushGeneration = 0;
  let pushPhase = '';
  let pushHistoryRequest = null;
  // Preserve existing subscribers; fresh installations require explicit opt-in.
  if (localStorage.getItem('iht_push_enabled') === null) {
    localStorage.setItem('iht_push_enabled', ['active', 'registered'].includes(localStorage.getItem('iht_push_status')) ? '1' : '0');
  }
  const imageGesture = {
    scale: 1,
    x: 0,
    y: 0,
    pointers: new Map(),
    startDistance: 0,
    startScale: 1,
    startCenter: null,
    pinchPoint: null,
    moved: false,
    hadMultiTouch: false,
    tapStart: null,
    lastTap: null
  };

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
  // Todas las entradas de sincronización comparten esta promesa. Así, una
  // segunda pulsación mientras la primera sigue en curso no dispara otra
  // consulta ni otra precarga en paralelo.
  let syncRequest = null;
  const CACHE_TTL = 3 * 60 * 60 * 1000;
  const INFO_CACHE_VERSION = 36;
  const INITIAL_PRELOAD_KEY = `iht_initial_preload_${INFO_CACHE_VERSION}`;
  const storedInfoCache = readJson('iht_info_cache');
  const infoCache = storedInfoCache?.version === INFO_CACHE_VERSION ? (storedInfoCache.items || {}) : (activeContentSnapshot?.info || {});
  const storedCardCache = readJson('iht_card_cache');
  const cardCache = storedCardCache?.version === INFO_CACHE_VERSION ? (storedCardCache.items || {}) : (activeContentSnapshot?.cards || {});
  const storedProductCache = readJson('iht_product_cache');
  const productCache = {...bundledProductDetails, ...(storedProductCache?.version === INFO_CACHE_VERSION ? (storedProductCache.items || {}) : {})};
  let offlineWifiWait = readJson('iht_offline_wifi_wait', false);
  let offlineStarting = false;
  let offlineNextRetryAt = 0;
  let offlineNextUpdateCheckAt = 0;
  let offlineObservedError = '';
  let offlineMobileAllowed = false;
  const offlineDownload = createOfflineDownload(() => {
    if (moreOptionsVisible()) renderMore({offlineOnly:true});
    useOfflineImages();
  }, Capacitor.isNativePlatform() ? OfflineDownload : null);
  await offlineDownload.init();
  await offlineDownload.refresh();
  if (!navigator.onLine) {
    const savedOffline = await offlineDownload.readSnapshot();
    if (Array.isArray(savedOffline?.products)) {
      products = savedOffline.products;
      Object.assign(productCache, savedOffline.productCache || {});
      Object.assign(infoCache, savedOffline.infoCache || {});
      Object.assign(cardCache, savedOffline.cardCache || {});
    }
  }
  function offlineAssets() {
    return collectOfflineImages(products, productCache, infoCache, cardCache, featuredProductsSnapshot);
  }
  function offlineVersion() {
    return offlineContentRevision({products, productCache, infoCache, cardCache});
  }
  function setOfflineWifiWait(value) {
    offlineWifiWait = value;
    try { localStorage.setItem('iht_offline_wifi_wait', JSON.stringify(value)); } catch (_) {}
    if (moreOptionsVisible()) renderMore();
  }
  async function offlineConnection() {
    if (!navigator.onLine) return {type:'none'};
    if (Capacitor.isNativePlatform()) {
      try { return await OfflineNetwork.getConnection(); } catch (_) { return {type:'unknown'}; }
    }
    return {type:navigator.connection?.type || 'unknown', metered:Boolean(navigator.connection?.saveData)};
  }
  function chooseOfflineNetwork(connection) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'offline-network-dialog';
      dialog.setAttribute('aria-labelledby', 'offlineNetworkTitle');
      dialog.innerHTML = `<h2 id="offlineNetworkTitle">${connection.type === 'cellular' ? '¿Descargar con datos móviles?' : '¿Usar esta conexión?'}</h2><p>${connection.type === 'unknown' ? 'No pudimos confirmar que estés en Wi-Fi. ' : ''}La descarga de todas las fotos puede consumir muchos datos.</p><button data-choice="download">Descargar ahora</button><button data-choice="wifi">Esperar Wi-Fi</button><button data-choice="cancel">Cancelar</button>`;
      const finish = value => {dialog.remove(); resolve(value);};
      dialog.addEventListener('click', event => {
        const choice = event.target.closest('[data-choice]');
        if (choice) finish(choice.dataset.choice);
      });
      dialog.addEventListener('cancel', event => {event.preventDefault(); finish('cancel');});
      document.body.append(dialog);
      dialog.showModal();
    });
  }
  async function removeOfflineDownload() {
    const confirmed = await new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'offline-network-dialog';
      dialog.setAttribute('aria-labelledby','offlineDeleteTitle');
      dialog.innerHTML = '<h2 id="offlineDeleteTitle">¿Borrar la descarga offline?</h2><p>Se eliminarán las fotos y la copia descargada para liberar espacio. Tus favoritos y ajustes se conservan. Podés descargarla de nuevo cuando quieras.</p><button data-delete-choice="yes">Borrar descarga</button><button data-delete-choice="no">Cancelar</button>';
      const finish = value => {dialog.remove();resolve(value);};
      dialog.addEventListener('click',event => {
        const button=event.target.closest('[data-delete-choice]');
        if (button) finish(button.dataset.deleteChoice === 'yes');
      });
      dialog.addEventListener('cancel',event => {event.preventDefault();finish(false);});
      document.body.append(dialog);dialog.showModal();
    });
    if (!confirmed) return;
    const images = [...document.querySelectorAll('img[src]')].map(image => [image,offlineDownload.remoteUrl(image.getAttribute('src'))]);
    if (await offlineDownload.clear()) {
      images.forEach(([image,url]) => {if (image.getAttribute('src') !== url) image.setAttribute('src',url);});
      offlineNextRetryAt = 0;offlineNextUpdateCheckAt = 0;offlineObservedError = '';
      setOfflineWifiWait(false);
      logAnalyticsEvent('offline_download',{outcome:'deleted',automatic:0});
    }
  }
  async function startOfflineDownload(automatic = false) {
    if (automatic && Date.now() < offlineNextRetryAt) return;
    if (automatic && !offlineDownload.getResumePreference().enabled && !offlineWifiWait && Date.now() < offlineNextUpdateCheckAt) return;
    if (document.visibilityState !== 'visible' || offlineStarting) return;
    const currentOffline = offlineDownload.check(offlineAssets(), offlineVersion());
    if (currentOffline.busy || currentOffline.clearing) return;
    if (automatic && currentOffline.ready) {
      offlineNextUpdateCheckAt = Date.now() + 30000;
      if (offlineDownload.getResumePreference().enabled) await offlineDownload.setResumePreference({enabled:false, allowMobile:offlineDownload.getResumePreference().allowMobile});
      if (offlineWifiWait) setOfflineWifiWait(false);
      return;
    }
    offlineStarting = true;
    if (moreOptionsVisible()) renderMore({offlineOnly:true});
    try {
      const connection = await offlineConnection();
      const wifi = connection.type === 'wifi' && !connection.metered;
      if (automatic) {
        const preference = offlineDownload.getResumePreference();
        if (!preference.enabled && !preference.autoUpdate && !offlineWifiWait) return;
        offlineMobileAllowed = preference.allowMobile && !offlineWifiWait;
        if (!offlineNetworkMayDownload(connection, offlineMobileAllowed)) return;
      }
      if (!automatic && !wifi && connection.type !== 'ethernet') {
        const choice = await chooseOfflineNetwork(connection);
        if (choice === 'cancel') { logAnalyticsEvent('offline_download', {outcome:'cancelled', automatic:0}); return; }
        if (choice === 'wifi') {
          logAnalyticsEvent('offline_download', {outcome:'wait_wifi', automatic:0});
          await offlineDownload.setResumePreference({enabled:true, allowMobile:false, autoUpdate:true});
          setOfflineWifiWait(true);
          return;
        }
        if (connection.type === 'none') {window.alert('Conectate a Internet para descargar.'); return;}
        offlineMobileAllowed = true;
      } else if (!automatic) offlineMobileAllowed = false;
      await offlineDownload.setResumePreference({enabled:true, allowMobile:offlineMobileAllowed, autoUpdate:true});
      setOfflineWifiWait(false);
      logAnalyticsEvent('offline_download', {outcome:'start', automatic:automatic ? 1 : 0});
      await offlineDownload.download(offlineAssets(), offlineVersion(), {products, productCache, infoCache, cardCache}, async () => {
        if (document.visibilityState !== 'visible') return false;
        if (!offlineDownload.getResumePreference().enabled) return false;
        const network = await offlineConnection();
        if (!offlineDownload.getResumePreference().enabled) return false;
        if (offlineNetworkMayDownload(network, offlineMobileAllowed)) return true;
        setOfflineWifiWait(true);
        return false;
      }, !offlineMobileAllowed);
      const result = offlineDownload.check(offlineAssets(), offlineVersion());
      logAnalyticsEvent('offline_download', {outcome:result.ready ? 'ready' : result.error ? 'error' : 'paused', automatic:automatic ? 1 : 0});
      if (result.ready) await offlineDownload.setResumePreference({enabled:false, allowMobile:offlineMobileAllowed});
      // A failed file must not trigger a tight automatic retry loop.
      offlineNextRetryAt = result.error ? Date.now() + 60000 : 0;
    } catch (_) {
      await offlineDownload.setResumePreference({enabled:false, allowMobile:false}).catch(() => {});
      logAnalyticsEvent('offline_download', {outcome:'error', automatic:automatic ? 1 : 0});
      window.alert('No se pudo guardar el estado de la descarga. Tocá para reintentar.');
    } finally {
      offlineStarting = false;
      if (moreOptionsVisible()) renderMore({offlineOnly:true});
    }
  }
  const resumeOfflineWhenOpen = async () => {
    if (document.visibilityState !== 'visible') return;
    const status = await offlineDownload.refresh();
    if (status?.error && status.error !== offlineObservedError) offlineNextRetryAt = Date.now() + 60000;
    offlineObservedError = status?.error || '';
    const preference = offlineDownload.getResumePreference();
    if ((preference.enabled || preference.autoUpdate || offlineWifiWait) && document.visibilityState === 'visible') startOfflineDownload(true);
  };
  window.setInterval(resumeOfflineWhenOpen, 3000);
  window.addEventListener('online', resumeOfflineWhenOpen);
  document.addEventListener('visibilitychange', resumeOfflineWhenOpen);
  function useOfflineImages() {
    document.querySelectorAll('img[src]').forEach(image => {
      const src = image.getAttribute('src');
      const local = offlineDownload.localUrl(src);
      if (local !== src) {
        image.removeAttribute('srcset');
        image.setAttribute('src', local);
      }
    });
  }
  // Recover before per-image handlers hide the photo or replace it with a placeholder.
  document.addEventListener('error', event => {
    const image = event.target;
    if (image?.tagName !== 'IMG') return;
    const original = offlineDownload.rejectLocalUrl(image.getAttribute('src'));
    if (!original) return;
    event.stopImmediatePropagation();
    image.setAttribute('src', original);
  }, true);
  new MutationObserver(useOfflineImages).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['src']});
  useOfflineImages();
  const alertUrl = 'https://vaad.ar/alertas-de-productos/';
  const storedAlertCache = readJson('iht_alert_cache');
  let alertCache = storedAlertCache?.version === INFO_CACHE_VERSION ? storedAlertCache : (activeContentSnapshot?.alerts ? {version:INFO_CACHE_VERSION, items:activeContentSnapshot.alerts, fetchedAt:Number(activeContentSnapshot.generatedAt) || 0} : null);
  // Repair previously truncated caches even offline or while still fresh.
  if (alertCache) alertCache = {...alertCache, items:mergeAlertHistory(alertCache.items, activeContentSnapshot?.alerts, contentSnapshot?.alerts)};
  let timelineKind = 'all';
  const storedSeenAdditions = readJson('iht_catalog_additions_seen', []);
  const seenAdditions = new Set(Array.isArray(storedSeenAdditions) ? storedSeenAdditions.filter(key => typeof key === 'string') : []);
  function renderNewProductCount(items = alertCache?.items) {
    const count = unreadAdditionCount(items, seenAdditions);
    document.querySelectorAll('[data-open-timeline="alta"]').forEach(button => {
      let badge = button.querySelector('.catalog-unread-count');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'catalog-unread-count';
        button.firstElementChild.append(badge);
      }
      badge.hidden = count === 0;
      badge.textContent = count ? ` (${count.toLocaleString('es-AR')})` : '';
    });
  }
  function markNewProductsSeen(items) {
    additionKeys(items).forEach(key => seenAdditions.add(key));
    try { localStorage.setItem('iht_catalog_additions_seen', JSON.stringify([...seenAdditions])); } catch (_) {}
    renderNewProductCount(items);
  }
  renderNewProductCount();
  const alertProductOverrides = new Map();
  const storedBarcodeAssociations = readJson('iht_barcode_associations', {});
  const barcodeAssociations = storedBarcodeAssociations && typeof storedBarcodeAssociations === 'object' && !Array.isArray(storedBarcodeAssociations) ? storedBarcodeAssociations : {};
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
  let revokedPushes = readRevokedPushes();
  let pushRevocationsRequest = null;
  pushNotifications = dedupePushNotifications(pushNotifications).filter((item) => !notificationIsRevoked(item, revokedPushes));
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
  if (productSource === bundledProducts && activeCatalogSnapshot?.generatedAt) {
    localStorage.setItem('iht_catalog_version', String(activeCatalogSnapshot.generatedAt));
    localStorage.setItem('iht_catalog_generated_at', String(activeCatalogTimestamp));
    localStorage.setItem('iht_products', JSON.stringify(products));
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
    const totalLabel = document.querySelector('.catalog-total-info strong');
    if (totalLabel) totalLabel.textContent = totalCount().toLocaleString('es-AR');
    const status = $('#syncStatus');
    status.className = `sync update-row ${tone}`;
    $('#syncMessage').textContent = message;
    const infoStatus = document.querySelector('[data-info-sync]');
    if (infoStatus) {
      infoStatus.className = `sync update-row catalog-info-sync-row ${tone}`;
      const infoMessage = infoStatus.querySelector('[data-info-sync-message]');
      if (infoMessage) infoMessage.textContent = tone === 'ok' ? lastSyncMessage() : message;
    }
  }

  function relativeSyncMessage(timestamp = syncState.last) {
    const syncedAt = Number(timestamp);
    if (!Number.isFinite(syncedAt) || syncedAt <= 0) return 'Todavía no sincronizada';
    const elapsed = Math.max(0, Date.now() - syncedAt);
    if (elapsed < 60 * 1000) return 'Ahora';
    const minutes = Math.floor(elapsed / (60 * 1000));
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days} día${days === 1 ? '' : 's'}`;
  }

  function lastSyncMessage() {
    return relativeSyncMessage();
  }

  function officialUpdateMessage() {
    return localStorage.getItem('iht_official_update') || catalogSnapshot?.officialUpdate || 'Consultando fuente oficial…';
  }

  function sourceUrl(url) {
    if (Capacitor.isNativePlatform()) return url;
    const local = location.port === '5173' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    if (!local) {
      const encoded = encodeURIComponent(url);
      // Supabase is paused for this app; retain cached content on proxy failure.
      return [
        `https://us-central1-iahadut-hatora.cloudfunctions.net/vaadProxy?url=${encoded}`
        // Paused fallback: https://syeycayasyufedwoprea.supabase.co/functions/v1/iahadut-demo/proxy
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
            const response = await CapacitorHttp.get({url:candidate, responseType:'text', connectTimeout:10000, readTimeout:15000, headers:{Accept:'text/html'}});
            if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
            return String(response.data || '');
          }
          const response = await fetch(candidate, {cache:'no-store', signal:AbortSignal.timeout(15000), headers:{Accept:'text/html'}});
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

  async function refreshOfficialUpdateDate() {
    const officialDate = await fetchOfficialUpdateDate();
    if (!officialDate) return '';
    localStorage.setItem('iht_official_update', officialDate);
    const updateNode = $('#officialUpdateDate');
    if (updateNode) updateNode.textContent = officialDate;
    return officialDate;
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
    const images = content.images.map((image) => `<span class="info-photo-frame"><img class="info-photo asset-loading" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy" onerror="this.closest('.info-photo-frame')?.remove()"></span>`).join('');
    const actionIcon = (kind) => {
      if (kind === 'whatsapp') return '<svg class="info-action-icon whatsapp-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
      const paths = {email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>', whatsapp:'<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>', map:'<path d="M20 10c0 4.5-8 10-8 10s-8-5.5-8-10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'};
      return `<svg class="info-action-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || paths.email}</svg>`;
    };
    const actions = (content.actions || []).map((action) => `<a class="info-action ${escapeHtml(action.kind || '')}" href="${escapeHtml(appWhatsAppLink(action.href))}">${actionIcon(action.kind)}<span>${escapeHtml(action.label)}</span></a>`).join('');
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

  const productContentRequests = new Map();
  async function fetchProductContent(product, force = false) {
    if (!product?.url) return null;
    if (!force && productCache[product.url]?.textFormatVersion === 1) return productCache[product.url];
    if (productContentRequests.has(product.url)) return productContentRequests.get(product.url);
    const request = fetchProductContentFromSource(product);
    productContentRequests.set(product.url, request);
    try { return await request; }
    finally { if (productContentRequests.get(product.url) === request) productContentRequests.delete(product.url); }
  }

  async function fetchProductContentFromSource(product) {
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
      try { save(); } catch (_) {}
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
        .map((node) => productText(node))
        .filter((text, index, all) => text.length > 4 && all.indexOf(text) === index)
      : [];
    const beraja = descriptionRoot
      ? [descriptionRoot, ...descriptionRoot.querySelectorAll('*')]
        .map((node) => clean(node.textContent).match(/^BERAJ[ÁA]\s*:\s*(.+)$/i))
        .filter(Boolean)
        .map((match) => clean(match[1]))
        .sort((first, second) => first.length - second.length)[0] || ''
      : '';
    const description = (descriptionRoot ? productText(descriptionRoot) : descriptionParts.join('\n\n')).trim() || blocks
      .filter((block) => block.tag === 'p')
      .filter((block) => !/^BERAJ[ÁA]\s*:/i.test(block.text))
      .map((block) => block.text)
      .join('\n\n')
      .trim();
    const result = {blocks, images, category, description, textFormatVersion:1, descriptionAvailable:Boolean(description), beraja, barcode:officialBarcode || canonicalBarcode(product.barcode), fetchedAt:Date.now(), bundled:false};
    productCache[product.url] = result;
    // La ficha descargada sigue siendo válida aunque no pueda guardarse.
    try { localStorage.setItem('iht_product_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:productCache})); } catch (_) {}
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
    // Algunas altas comparten el mismo nombre visible pero son fichas
    // distintas (por ejemplo, las variantes de una misma marca). Duplicar
    // por texto descartaba esas fichas y dejaba el catálogo incompleto.
    const extractGroup = (root) => [...(root?.querySelectorAll('li') || [])]
      .map((node) => ({text:clean(node.textContent), url:node.querySelector('a[href]') ? new URL(node.querySelector('a[href]').getAttribute('href'), alertUrl).href : ''}))
      .filter((item, index, all) => item.text.length > 8 && all.findIndex((candidate) => item.url ? candidate.url === item.url : candidate.text === item.text) === index);
    const officialGroups = {alta:extractGroup(document.querySelector('.card-altas')), baja:extractGroup(document.querySelector('.card-bajas')), general:[]};
    const result = officialGroups.alta.length || officialGroups.baja.length ? officialGroups : {alta:[], baja:[], general:items.length ? items : ['No hay alertas publicadas en este momento.']};
    // La fuente oficial puede mostrar solo la tanda más reciente. Conservamos
    // también las tandas ya guardadas para que la cronología no pierda cargas
    // anteriores al actualizar.
    const mergedResult = mergeAlertHistory(result, alertCache?.items, activeContentSnapshot?.alerts, contentSnapshot?.alerts);
    alertCache = {version:INFO_CACHE_VERSION, items:mergedResult, fetchedAt:Date.now()};
    localStorage.setItem('iht_alert_cache', JSON.stringify(alertCache));
    updateRecentFromAlerts(mergedResult);
    refreshAlertBadge();
    return mergedResult;
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

  async function preloadAppData(onProgress = null, allowCatalogSync = true) {
    if (preloadStarted || !navigator.onLine) return;
    preloadStarted = true;
    const firstPreparation = initialPreparationPreview || localStorage.getItem(INITIAL_PRELOAD_KEY) !== 'done';
    try {
      onProgress?.(5, 'Consultando las novedades del catálogo…');
      // Keep the date shown in “Información del catálogo” tied to the live
      // official page instead of the date frozen in an older bundled snapshot.
      refreshOfficialUpdateDate().catch(() => {});
      const freshAlerts = await fetchAlerts(true).catch(() => null);
      const latestAlerts = freshAlerts?.alta || [];
      const latestProductsMissing = latestAlerts.slice(0, 4).some((alert) => alert.url && !products.some((product) => product.url === alert.url));
      if (latestProductsMissing && allowCatalogSync) {
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
    localStorage.setItem('iht_catalog_version', cached.catalog.generatedAt);
    localStorage.setItem('iht_last_sync', String(Date.now()));
    localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
    save();
    renderHome();
    renderSearchCategories();
    if (document.querySelector('.view.active')?.id === 'searchView') renderResults($('#query').value);
    syncMessage(`${products.length.toLocaleString('es-AR')} productos · actualizado`, 'ok');
    return true;
  }

  function scheduleAppPreload() {
    const start = () => preloadAppData();
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, {timeout:1800});
    else window.setTimeout(start, 1200);
  }

  function syncAndPreload(force = false) {
    void refreshGlobalRanking();
    void refreshCatalogPresentation(force);
    if (syncRequest) return syncRequest;
    document.querySelectorAll('#syncStatus, [data-info-sync]').forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });
    syncRequest = Promise.resolve(syncCatalog(force))
      // La sincronización ya se ejecutó arriba; la precarga solo completa
      // imágenes y contenidos para evitar una segunda sincronización.
      .then(() => preloadAppData(null, false))
      .finally(() => {
        document.querySelectorAll('#syncStatus, [data-info-sync]').forEach((button) => {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        });
        syncRequest = null;
      });
    return syncRequest;
  }

  async function syncCatalogFromPublishedFiles(onProgress = null) {
    const base = import.meta.env.DEV ? '/data/published/' : 'https://raw.githubusercontent.com/rajamimnehmad-sudo/iahadut-ha-tora-app/main/web/data/published/';
    const baseline = normalizedSnapshot({catalog:activeCatalogSnapshot, content:activeContentSnapshot, productDetails:activeProductDetailsSnapshot});
    baseline.catalog.products.sort((a,b) => a.url.localeCompare(b.url, 'en'));
    const stored = readJson('iht_published_snapshot');
    const previous = stored?.snapshot || baseline;
    const previousHash = stored?.hash || await snapshotHash(baseline);
    const currentDate = Date.parse(localStorage.getItem('iht_catalog_version') || activeCatalogSnapshot.generatedAt || '') || 0;
    onProgress?.(8, 'Consultando la versión del catálogo…');
    const result = await readPublishedSnapshot(async (file) => {
      const response = await fetch(base + file, {cache:file === 'manifest.json' ? 'no-cache' : 'default', signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(`Copia del catálogo HTTP ${response.status}`);
      const value = await response.json();
      if (file === 'manifest.json' && (Date.parse(value.version) || 0) < currentDate) throw new Error('Se conserva la copia más reciente del catálogo');
      return value;
    }, previous, previousHash);
    const next = result.snapshot;
    const previousUrls = new Set(products.map(product => product.url));
    // Persist the verified complete copy before changing the visible catalog.
    localStorage.setItem('iht_published_snapshot', JSON.stringify({hash:result.hash, snapshot:next}));
    const validUrls = new Set(next.catalog.products.map(product => product.url));
    Object.keys(productCache).forEach(url => { if (!validUrls.has(url)) delete productCache[url]; });
    Object.entries(next.productDetails.products).forEach(([url,detail]) => { productCache[url] = {...detail, fetchedAt:Date.now()}; });
    products = next.catalog.products.map(product => ({...product, barcode:canonicalBarcode(product.barcode || next.productDetails.products[product.url]?.barcode), description:next.productDetails.products[product.url]?.description || product.description || ''}));
    const additions = products.filter(product => !previousUrls.has(product.url));
    recentProducts = additions.length ? additions.slice(0,10) : products.slice(0,10);
    Object.keys(infoCache).forEach(key => { delete infoCache[key]; });
    Object.entries(next.content.info).forEach(([key,value]) => { infoCache[key] = {...value, fetchedAt:Date.now()}; });
    Object.keys(cardCache).forEach(key => { delete cardCache[key]; });
    Object.entries(next.content.cards).forEach(([key,value]) => { cardCache[key] = {...value, fetchedAt:Date.now()}; });
    localStorage.setItem('iht_product_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:productCache}));
    localStorage.setItem('iht_info_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:infoCache}));
    localStorage.setItem('iht_card_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:cardCache}));
    localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
    localStorage.setItem('iht_catalog_version', result.version);
    localStorage.setItem('iht_catalog_generated_at', String(Date.parse(result.version) || currentDate));
    if (next.catalog.officialUpdate) localStorage.setItem('iht_official_update', next.catalog.officialUpdate);
    syncState.last = String(Date.now());
    localStorage.setItem('iht_last_sync', syncState.last);
    save();
    syncMessage(`${products.length.toLocaleString('es-AR')} productos · actualizado`, 'ok');
    renderHome();
    refreshCatalogPresentationViews();
    return true;
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
      ...(validCategoryPath(data?.categoryPath) ? {categoryPath:[...data.categoryPath]} : (() => {try {const path=JSON.parse(data?.categoryPathJson || 'null');return validCategoryPath(path) ? {categoryPath:path} : validCategoryPath(previous?.categoryPath) ? {categoryPath:[...previous.categoryPath]} : {};}catch{return validCategoryPath(previous?.categoryPath) ? {categoryPath:[...previous.categoryPath]} : {};}})()),
      image:clean(data?.imageUrl),
      barcode:canonicalBarcode(data?.barcode),
      description:clean(data?.description) || previous?.description || '',
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
    if (metadataSnapshot.data()?.syncInProgress) throw new Error('El catálogo central se está actualizando; se conserva la copia local');
    const remoteVersion = clean(metadataSnapshot.data()?.version);
    if (!remoteVersion) return false;
    const remoteProductCount = Number(metadataSnapshot.data()?.activeProductCount) || 0;
    const contentVersion = clean(metadataSnapshot.data()?.contentVersion);
    let centralContent = null;
    if (contentVersion && contentVersion !== localStorage.getItem('iht_central_content_version')) {
      const contentDocument = await firebase.api.getDoc(firebase.api.doc(firebase.db, 'catalog_content', 'current'));
      if (!contentDocument.exists() || clean(contentDocument.data()?.version) !== contentVersion) throw new Error('Contenido central incompleto; se conserva la copia local');
      centralContent = JSON.parse(contentDocument.data().contentJson);
      if (!centralContent?.info || !centralContent?.cards) throw new Error('Contenido central inválido; se conserva la copia local');
    }
    const applyCentralContent = () => {
      if (centralContent) {
        Object.keys(infoCache).forEach((key) => { delete infoCache[key]; });
        Object.assign(infoCache, centralContent.info);
        Object.keys(cardCache).forEach((key) => { delete cardCache[key]; });
        Object.assign(cardCache, centralContent.cards);
        localStorage.setItem('iht_info_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:infoCache}));
        localStorage.setItem('iht_card_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:cardCache}));
        localStorage.setItem('iht_central_content_version', contentVersion);
      }
      const officialUpdate = clean(metadataSnapshot.data()?.officialUpdate);
      if (officialUpdate) {
        localStorage.setItem('iht_official_update', officialUpdate);
        const updateNode = document.querySelector('#officialUpdateDate');
        if (updateNode) updateNode.textContent = officialUpdate;
      }
    };

    // Never infer the cursor from the bundled snapshot when a previous
    // installation already has its own cached catalog. That cache may be
    // older than the bundled assets and must be reconciled from Firestore.
    const localVersion = clean(localStorage.getItem('iht_catalog_version'));
    const localDate = localVersion ? Date.parse(localVersion) : 0;
    const remoteDate = Date.parse(remoteVersion);
    const localIsAtLeastAsNew = Boolean(localDate && remoteDate && remoteDate <= localDate);
    const hasUsableLocalVersion = Boolean(localDate && remoteDate && remoteDate > localDate);
    // The metadata version and the product count are published separately.
    // If the count grew without a version bump, a timestamp-only check would
    // incorrectly keep the old local catalog forever (the 1.048-products bug).
    const catalogNeedsReconcile = Boolean(remoteProductCount && remoteDate >= localDate && products.length !== remoteProductCount);
    const needsFullSnapshot = !hasUsableLocalVersion || catalogNeedsReconcile;
    // A versioned local catalog is already a valid snapshot. Do not force a
    // full download just because the old category counters drifted.
    if (localIsAtLeastAsNew && products.length > seed.length && !catalogNeedsReconcile) {
      if (centralContent && remoteDate === localDate) {
        const confirmed = await firebase.api.getDoc(metadataRef);
        if (!confirmed.exists() || confirmed.data()?.syncInProgress || clean(confirmed.data()?.version) !== remoteVersion || clean(confirmed.data()?.contentVersion) !== contentVersion) throw new Error('El contenido cambió durante la descarga');
        applyCentralContent();
      }
      syncState.last = String(Date.now());
      localStorage.setItem('iht_last_sync', syncState.last);
      syncMessage(`${products.length.toLocaleString('es-AR')} productos · actualizado`, 'ok');
      return true;
    }

    onProgress?.(8, hasUsableLocalVersion ? 'Consultando cambios nuevos…' : 'Descargando catálogo autorizado…');
    const activeCollection = firebase.api.collection(firebase.db, 'catalog_products');
    const archiveCollection = firebase.api.collection(firebase.db, 'catalog_archive');
    const [activeSnapshot, archiveSnapshot] = needsFullSnapshot
      ? [await firebase.api.getDocs(activeCollection), {docs:[]}]
      : await Promise.all([
        firebase.api.getDocs(firebase.api.query(activeCollection, firebase.api.where('catalogGeneratedAt', '>', localVersion))),
        firebase.api.getDocs(firebase.api.query(archiveCollection, firebase.api.where('retiredAt', '>', localVersion)))
      ]);

    const previousByUrl = new Map(products.map((product) => [product.url, product]));
    const nextByUrl = needsFullSnapshot ? new Map() : new Map(previousByUrl);
    const changedUrls = new Set();
    const additions = [];
    const updatedDetails = new Map();
    activeSnapshot.docs.forEach((document) => {
      const product = localProductFromFirestore(document.data(), previousByUrl.get(document.data()?.sourceUrl));
      if (!product) return;
      if (!previousByUrl.has(product.url)) additions.push(product);
      nextByUrl.set(product.url, product);
      changedUrls.add(product.url);
      if (document.data()?.detailsJson) {
        const detail = JSON.parse(document.data().detailsJson);
        if (detail?.textFormatVersion !== 1 || !Array.isArray(detail.images) || typeof detail.description !== 'string') throw new Error('Ficha central inválida; se conserva la copia local');
        updatedDetails.set(product.url, {...detail, fetchedAt:Date.now()});
      }
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

    const confirmedMetadata = await firebase.api.getDoc(metadataRef);
    if (!confirmedMetadata.exists() || confirmedMetadata.data()?.syncInProgress || clean(confirmedMetadata.data()?.version) !== remoteVersion || (Number(confirmedMetadata.data()?.activeProductCount) || 0) !== remoteProductCount) throw new Error('El catálogo cambió durante la descarga; se conserva la copia local');
    if (contentVersion && clean(confirmedMetadata.data()?.contentVersion) !== contentVersion) throw new Error('El contenido cambió durante la descarga');
    const nextProducts = [...nextByUrl.values()];
    const minimumCatalogTotal = remoteProductCount || fallbackMinimumCatalogTotal;
    if ((remoteProductCount && nextProducts.length !== remoteProductCount) || nextProducts.length < minimumCatalogTotal) throw new Error(`Catálogo Firebase incompleto (${nextProducts.length} de ${minimumCatalogTotal} productos)`);
    previousByUrl.forEach((_, url) => { if (!nextByUrl.has(url)) changedUrls.add(url); });
    applyCentralContent();
    changedUrls.forEach((url) => { delete productCache[url]; });
    updatedDetails.forEach((detail, url) => { if (nextByUrl.has(url)) productCache[url] = detail; });
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
      ? `${changedUrls.size} cambios nuevos`
      : `${products.length.toLocaleString('es-AR')} productos · actualizado`, 'ok');
    renderHome();
    if (document.querySelector('.view.active')?.id === 'searchView') renderSearchCategories();
    return true;
  }

  function catalogCategoryKey(label) {
    const value = normalize(label);
    if (value.includes('uruguay')) return 'uruguay';
    if (value.includes('planta')) return 'planta';
    if (value.includes('produccion especial') || value.includes('producción especial')) return 'especial';
    return 'gondola';
  }

  async function syncCatalog(force = false, onProgress = null) {
    if (syncState.running) return;
    const catalogRefreshInterval = 3 * 60 * 60 * 1000;
    const expectedCatalogTotal = categories.reduce((total, category) => total + category.count, 0);
    // This fallback protects a full scrape only. Incremental Firebase syncs
    // validate against catalog_metadata.activeProductCount instead.
    const minimumCatalogTotal = Math.floor(expectedCatalogTotal * 0.97);
    const hasCatalogVersion = Boolean(localStorage.getItem('iht_catalog_version'));
    if (!force && hasCatalogVersion && syncState.last && Date.now() - Number(syncState.last) < catalogRefreshInterval) return;
    syncState.running = true;
    syncState.error = '';
    syncMessage('Actualizando…', 'busy');
    try {
      if (force && catalogSnapshotNeedsRepair(products, localStorage.getItem('iht_catalog_version'), activeCatalogSnapshot)) {
        products = bundledProducts.map((product) => ({...product, barcode:canonicalBarcode(product.barcode || bundledProductDetails[product.url]?.barcode)}));
        recentProducts = products.slice(0, 10);
        Object.assign(productCache, bundledProductDetails);
        localStorage.setItem('iht_catalog_version', activeCatalogSnapshot.generatedAt);
        localStorage.setItem('iht_catalog_generated_at', String(activeCatalogTimestamp));
        localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
        save();
        renderHome();
        renderSearchCategories();
        if (document.querySelector('.view.active')?.id === 'searchView') renderResults($('#query').value);
      }
      let firebaseUpdated = false;
      let firebaseError = null;
      try { firebaseUpdated = await syncCatalogFromPublishedFiles(onProgress); } catch (error) { firebaseError = error; }
      if (firebaseUpdated) return;
      // A valid bundled or cached catalog is safer than falling back to a
      // full scrape on every manual sync. Full pagination is reserved for a
      // genuinely empty catalog/recovery state.
      if (products.length > seed.length) {
        syncState.error = firebaseError?.message || 'No se pudo consultar la copia del catálogo';
        syncMessage('Sin cambios verificados · se conserva la copia guardada', 'bad');
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
      localStorage.setItem('iht_catalog_version', new Date(Number(syncState.last)).toISOString());
      localStorage.setItem('iht_catalog_generated_at', syncState.last);
      try {
        const officialUpdate = await fetchOfficialUpdateDate();
        if (officialUpdate) {
          localStorage.setItem('iht_official_update', officialUpdate);
          const updateNode = $('#officialUpdateDate');
          if (updateNode) updateNode.textContent = officialUpdate;
        }
      } catch (_) {}
      syncMessage(`${products.length.toLocaleString('es-AR')} productos · actualizado`, 'ok');
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

  function featuredProductImage(product) {
    // Las miniaturas de WordPress pueden estar recortadas antes de llegar
    // a la app. Usar la misma foto completa que la ficha, no inventar URLs.
    return catalogPresentation.photo(product.url) || productCache[product.url]?.images?.[0]?.src
      || bundledProductDetails[product.url]?.images?.[0]?.src
      || product.image;
  }

  function featuredImageLayout(src) {
    const url = new URL(src || '.', location.href);
    if (url.origin !== 'https://vaad.ar' || !url.pathname.startsWith('/wp-content/uploads/2026/09/')) return '';
    const bounds = featuredImageBounds[url.pathname.split('/').pop()];
    if (!bounds) return '';
    const [width, height, left, top, right, bottom] = bounds;
    return `data-featured-normalized style="--featured-height-scale:${height / (bottom - top)};--featured-center-x:${(left + right) / (2 * width) * 100}%;--featured-top:${top / height * 100}%"`;
  }

  function renderHome() {
    renderSavedButtonCount();
    const updateNode = $('#officialUpdateDate');
    if (updateNode) updateNode.textContent = officialUpdateMessage();
    const sourceNote = document.querySelector('#homeView .official-source-note');
    if (sourceNote) sourceNote.innerHTML = '<span aria-hidden="true">✓</span> Fuente oficial';
    const catalogByUrl = new Map(products.map((product) => [product.url, product]));
    // Explicit selection and order, independent of catalog additions or sync.
    const featuredUrls = catalogPresentation.current().featuredProducts || featuredProductsSnapshot.products.map(product => product.url);
    const items = featuredUrls.map(url => catalogByUrl.get(url)).filter(Boolean)
      .map((product) => ({...product, image:featuredProductImage(product)}));
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
    recentTrack.innerHTML = items.map((product) => `<button class="recent-product" data-product="${escapeHtml(product.url)}" aria-label="Ver ${escapeHtml(product.title)}"><span class="recent-product-media"><img class="asset-loading" ${featuredImageLayout(product.image)} src="${escapeHtml(product.image || productFallbackImage)}" alt="${escapeHtml(product.title)}" loading="eager" onload="this.classList.remove('asset-loading','asset-error');this.classList.add('asset-ready')" onerror="this.onerror=null;this.removeAttribute('data-featured-normalized');this.removeAttribute('style');this.src='${productFallbackImage}';this.classList.add('asset-loading');this.classList.remove('asset-ready','asset-error')">${uruguayBadge(product, 'product-region-badge recent-region-badge')}</span><span class="tablet-featured-copy"><small>${escapeHtml(brandName(product))}</small><strong>${escapeHtml(product.title.replace(/\s+marca\b.*$/i, '').trim())}</strong></span></button>`).join('');
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
      // También bloquear el listener delegado del documento al deslizar.
      event.stopPropagation();
      if (recentTrack.dataset.suppressClick === 'true') {
        event.preventDefault();
        return;
      }
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
    const {step, carouselStart} = metrics;
    let snapped = carouselStart + Math.round((viewport.scrollLeft - carouselStart) / step) * step;
    // Primero asentamos la tarjeta más cercana dentro de la copia visible.
    // Reubicar aquí mismo al bloque central produce un salto perceptible tras
    // un gesto rápido, aunque ambas copias tengan el mismo contenido.
    snapped = Math.max(0, Math.min(snapped, viewport.scrollWidth - viewport.clientWidth));
    const distance = Math.abs(snapped - viewport.scrollLeft);
    if (distance > 0.5) {
      viewport.dataset.carouselSettling = 'true';
      viewport.scrollTo({left: snapped, behavior: 'smooth'});
    }
    recentCarouselOffset = snapped;
    // Una vez terminada la animación corta, llevamos la copia equivalente al
    // bloque central. Al diferirlo, el usuario solo ve el asentamiento suave.
    scheduleRecentCarouselNormalize(viewport, distance > 0.5 ? 420 : 80);
  }

  function scheduleRecentCarouselNormalize(viewport, delay = 120) {
    if (recentCarouselRebaseTimer) window.clearTimeout(recentCarouselRebaseTimer);
    recentCarouselRebaseTimer = window.setTimeout(() => {
      recentCarouselRebaseTimer = null;
      normalizeRecentCarouselPosition(viewport);
      window.requestAnimationFrame(() => {
        delete viewport.dataset.carouselSettling;
      });
    }, delay);
  }

  function fitRecentCarouselCards(viewport) {
    const track = $('#recentProducts');
    if (!track || !viewport) return;
    const styles = window.getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap) || 0;
    const available = Math.max(0, viewport.clientWidth);
    if (tabletLayout.matches) {
      const columns = Math.max(2, Math.min(5, Math.floor((available + gap) / 160)));
      const cardWidth = (available - gap * (columns - 1)) / columns;
      track.dataset.carouselEdgeOffset = '0';
      track.dataset.carouselViewportWidth = String(available);
      track.style.paddingInline = '0px';
      track.style.setProperty('--recent-card-width', `${cardWidth}px`);
      return;
    }
    // Dejamos una previsualización lateral de la tarjeta anterior y siguiente.
    // El ancho acompaña el viewport de forma continua: no cambia de golpe al
    // cruzar un umbral que altere la cantidad estimada de tarjetas visibles.
    const cardWidth = Math.max(92, Math.min(128, available * 0.28));
    track.dataset.carouselEdgeOffset = String(centeredCarouselOffset(available, cardWidth, gap));
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
      if (!pointerActive && viewport.dataset.carouselSettling !== 'true') scheduleSettle(90);
      recentCarouselOffset = viewport.scrollLeft;
    }, {passive: true});
    viewport.addEventListener('scrollend', () => {
      if (!pointerActive && viewport.dataset.carouselSettling !== 'true') settleRecentCarouselPosition(viewport);
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
    renderNewProductCount(groups);
    const alerts = Array.isArray(groups) ? groups : groups?.alta || [];
    if (!alerts.length || products.length <= seed.length) return;
    const matches = [];
    for (const alert of alerts) {
      const alertText = typeof alert === 'string' ? alert : alert?.text || '';
      const displayTitle = cleanDisplayText(alertText.replace(/\s*\([^)]*\)\s*$/, ''));
      const match = findProductForAlert(alert, displayTitle);
      const candidate = match || (alert?.url ? {url:alert.url, title:displayTitle, brand:'', barcode:'', cat:'gondola', image:productFallbackImage, description:''} : null);
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
    taxonomyReturnView = 'categoryDirectoryView';
    renderCategoryDirectory();
    showView('categoryDirectoryView');
  }

  function productCategoryPaths(product) {
    const path = catalogCategoryPath(product);
    if (path) return [path];
    // Sin un tipo inequívoco no inventamos una categoría por ingredientes.
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
    const managed = catalogPresentation.icon(name);
    if (managed) return `<span class="taxonomy-photo" aria-hidden="true" style="background-image:url('${escapeHtml(managed.url)}');background-size:${managed.size};background-position:${managed.position}"></span>`;
    const key = normalize(name);
    const dryFood = /^frutos secos y (?:deshidratados|frutas secas)$/.test(key)
      ? '<path d="M10 3C4 5 2 12 5 17c5 1 10-5 5-14ZM9 6 6 14"/><ellipse cx="17" cy="15" rx="3" ry="4" transform="rotate(25 17 15)"/><path d="m17 13-1 3M19 7c-2 0-3 1-3 3"/>'
      : /^frutos secos$/.test(key)
        ? '<path d="M12 3c-2-1-4 0-5 2-3 0-4 3-3 5-2 3 0 6 2 7 0 3 4 5 6 3 2 2 6 0 6-3 2-1 4-4 2-7 1-2 0-5-3-5-1-2-3-3-5-2ZM12 3v17M8 7l-2 3 3 2-2 4M16 7l2 3-3 2 2 4"/>'
        : /^(?:frutas secas(?: y deshidratadas)?|frutas deshidratadas)$/.test(key)
          ? '<ellipse cx="8" cy="9" rx="3.5" ry="4.5" transform="rotate(-25 8 9)"/><ellipse cx="17" cy="10" rx="3.5" ry="4.5" transform="rotate(25 17 10)"/><ellipse cx="12" cy="18" rx="4" ry="3.5"/><path d="m8 7-1 3M17 8l-1 3M10 18h3"/>' : '';
    if (dryFood) return `<svg class="taxonomy-icon" viewBox="0 0 24 24" aria-hidden="true">${dryFood}</svg>`;
    // Dibujos específicos para productos que no tienen un equivalente claro
    // en la biblioteca. Comparten tamaño y trazo con los demás iconos.
    const specific = /barrita/.test(key) ? '<path d="m5 4 14 3-3 13-14-3Z M5 4l3 4M19 7l-4 2M2 17l4-2M16 20l-3-4"/>' : /alcaparra/.test(key) ? '<path d="M6 5h12M8 3h8v2M7 5v3l-2 3v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8l-2-3V5"/><circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/><circle cx="12" cy="17" r="1.5"/>' :
      /alga|sushi/.test(key) ? '<path d="m5 4 13-1 1 14-13 2Z M8 7l7-1M8 10l7-1M9 13l6-1M9 16l6-1M6 19l1 3 14-3-2-2"/>' :
      /almidon|fecula/.test(key) ? '<path d="M8 3h8l-1 4 4 7v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5l4-7Z M9 7h6M5 15c3-2 5 2 8 0s4-1 6 0"/><path d="M9 18h.01M12 17h.01M15 19h.01"/>' :
      /hojas de parra/.test(key) ? '<path d="M12 21v-8M12 16C4 18 2 11 3 5l5 2 4-5 4 5 5-2c1 6-1 13-9 11ZM12 13l-5-3M12 13l5-3"/>' :
      /champinon|hongo/.test(key) ? '<path d="M3 13a9 9 0 0 1 18 0ZM9 13v6a3 3 0 0 0 6 0v-6"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="8" r="1"/>' :
      /turron|chocolate|cacao/.test(key) ? '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 9h14M5 15h14M12 3v18"/>' :
      /tomate/.test(key) ? '<path d="M12 7c-8-5-13 9-5 13 3 2 7 2 10 0 8-4 3-18-5-13ZM12 7V3M12 7 7 5M12 7l5-2M12 7l-3 3M12 7l3 3"/>' :
      /aceituna/.test(key) ? '<ellipse cx="10" cy="15" rx="5" ry="6" transform="rotate(25 10 15)"/><path d="M12 9l3-5c4-1 6 0 6 0-1 4-4 5-7 4M8 13l-1 3"/>' :
      /papas?/.test(key) ? '<path d="M5 7c-5 5-1 14 6 14s12-10 7-15c-4-4-8-1-13 1Z M8 10h.01M14 8h.01M10 16h.01M16 14h.01"/>' :
      /aceite|vinagre/.test(key) && !/aerosol/.test(key) ? '<path d="M9 3h6v4l3 4v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9l3-4ZM9 6h6M6 12h12"/><path d="M12 14s-2 2-2 3a2 2 0 0 0 4 0c0-1-2-3-2-3Z"/>' : '';
    if (specific) return `<svg class="taxonomy-icon" viewBox="0 0 24 24" aria-hidden="true">${specific}</svg>`;
    const specificIcon = /aderezo|mayonesa|ketchup|mostaza|salsa (?:barbacoa|golf)/.test(key) ? 'jar' :
      /mantecas? vegetales/.test(key) ? 'jar' :
      /malta sin alcohol/.test(key) ? 'beer-bottle' :
      /jugo en polvo/.test(key) ? 'bag' :
      /bicarbonato|polvo de hornear|levadura/.test(key) ? 'cooking-pot' :
      /harina|semola|cuscus|burgol/.test(key) ? 'grains' :
      /tomate/.test(key) ? 'orange' : /pepino|palmito/.test(key) ? 'carrot' :
      /pochoclo/.test(key) ? 'popcorn' : /jugo de uva/.test(key) ? 'wine' :
      /edulcorante/.test(key) ? 'drop' :
      /coco/.test(key) ? 'orange' : /mermelada|dulce de leche|dulces de batata|pastas dulces/.test(key) ? 'jar' :
      /gin\b|gins|ron\b|rones|vodka|whiski|whisky|tequila|arak|anisado/.test(key) ? 'martini' :
      /bebidas vegetales|yogur/.test(key) ? 'plant' : /esencia/.test(key) ? 'eyedropper' :
      /granas|decoracion/.test(key) ? 'sparkle' :
      /sales?\b/.test(key) ? 'tip-jar' : /mani|frutos secos/.test(key) ? 'nut' :
      /condimento|chimichurri|wasabi/.test(key) ? 'leaf' : /aerosol/.test(key) ? 'spray-bottle' : '';
    if (specificIcon) return phosphorIcon(specificIcon, 'taxonomy-icon', 'regular');
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
      /saludable|proteina|suplemento/.test(key) ? 'heart' : /cocina internacional|asiatico/.test(key) ? 'globe-hemisphere-west' : 'basket';
    return phosphorIcon(icon, 'taxonomy-icon', 'regular');
  }

  function taxonomyTone(name) {
    if (catalogPresentation.icon(name)) return 'tone-photo';
    return `tone-${[...normalize(name)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5}`;
  }

  function categoryDisplayName(name) {
    if (catalogPresentation.current().categories[name]?.label) return catalogPresentation.current().categories[name].label;
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
      return `<button class="alphabetical-category-row" type="button" data-taxonomy-path="${encodeURIComponent(JSON.stringify(path))}"><span class="alphabetical-category-icon ${taxonomyTone(name)}">${taxonomyIcon(name)}</span><span><strong>${escapeHtml(categoryDisplayName(name))}</strong><small>${items.length.toLocaleString('es-AR')} ${items.length === 1 ? 'producto' : 'productos'}${catalogPresentation.current().categories[name]?.description ? ' · '+escapeHtml(catalogPresentation.current().categories[name].description) : ''}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`;
    }).join('');
  }

  function openTaxonomyPath(path, {restoreScroll = false} = {}) {
    const origin = document.querySelector('.view.active')?.id;
    if (!['subcategoryDirectoryView','categoryProductsView'].includes(origin)) taxonomyReturnView = origin === 'searchView' ? 'searchView' : 'categoryDirectoryView';
    activeCategoryPath = path;
    const children = categoryDirectory(path);
    const name = path.at(-1);
    const displayName = categoryDisplayName(name);
    if (children.length) {
      $('#subcategoryDirectoryTop').textContent = displayName;
      $('#subcategoryDirectoryTitle').textContent = displayName;
      $('#subcategoryDirectoryMeta').textContent = `${children.length} ${children.length === 1 ? 'subcategoría' : 'subcategorías'}`;
      $('#subcategoryList').innerHTML = taxonomyRows(children, path);
      const directItems = productsAtPath(path).filter(product => productCategoryPaths(product).some(candidate => candidate.length === path.length && path.every((part, index) => candidate[index] === part))).sort((a, b) => a.title.localeCompare(b.title, 'es'));
      $('#subcategoryDirectProductList').hidden = !directItems.length;
      renderProductCollection($('#subcategoryDirectProductList'), directItems);
      showView('subcategoryDirectoryView', {restoreScroll});
      return;
    }
    const items = productsAtPath(path).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    $('#categoryProductsTop').textContent = displayName;
    $('#categoryProductsTitle').textContent = displayName;
    $('#categoryProductsMeta').textContent = `${items.length.toLocaleString('es-AR')} ${items.length === 1 ? 'producto' : 'productos'}`;
    renderProductCollection($('#categoryProductList'), items, `<div class="empty-state"><svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16M6 7.5v11h12v-11M9 7.5V5h6v2.5M9 11v4M15 11v4"/></svg><strong>Todavía no hay productos en esta categoría</strong><span>La sección queda lista para mostrar nuevos aderezos cuando sean publicados en el catálogo oficial.</span></div>`);
    showView('categoryProductsView', {restoreScroll});
  }

  function renderSearchCategories() {
    const regions = `<div class="region-switch" role="group" aria-label="País del catálogo"><button class="${selectedRegion === 'argentina' ? 'active' : ''}" type="button" data-region="argentina" aria-pressed="${selectedRegion === 'argentina'}"><span class="category-icon category-flag category-flag-arg"><img src="assets/flag-argentina.svg" alt=""></span><span>Argentina</span></button><button class="${selectedRegion === 'uruguay' ? 'active' : ''}" type="button" data-region="uruguay" aria-pressed="${selectedRegion === 'uruguay'}">${categoryIcon('uruguay')}<span>Uruguay</span></button></div>`;
    const ranked = (globalRanking?.products || []).map(entry => products.find(product => product.url === entry.url && product.image)).filter(Boolean);
    const popular = ranked.slice(0, 6);
    const popularMarkup = `<div class="popular-searches"><strong>Más buscados</strong>${popular.length ? `<div class="popular-searches-track">${popular.map((product) => `<button class="popular-search-card" type="button" data-product="${escapeHtml(product.url)}" aria-label="Ver ${escapeHtml(product.title)}"><img class="asset-loading" ${transparentPhotoAttribute(product)} src="${escapeHtml(resolvedProductPhoto(product))}" alt="" loading="eager"><span>${escapeHtml(compactProductTitle(product.title))}</span></button>`).join('')}</div>` : '<p>Estamos reuniendo las búsquedas de la comunidad. Los productos aparecerán cuando haya datos disponibles.</p>'}</div>`;
    $('#searchCategories').innerHTML = `<div class="region-shortcut-wrap" aria-label="Filtro de país">${regions}</div>${popularMarkup}`;
    $('#recentSearches').innerHTML = '';
  }

  function productImage(product) {
    return `<img class="asset-loading" ${transparentPhotoAttribute(product)} src="${escapeHtml(resolvedProductPhoto(product) || productFallbackImage)}" alt="${escapeHtml(product.title)}" onload="this.classList.remove('asset-loading','asset-error');this.classList.add('asset-ready')" onerror="this.onerror=null;this.src='${productFallbackImage}';this.classList.add('asset-loading');this.classList.remove('asset-ready','asset-error')">`;
  }

  function resolvedProductPhoto(product, fallback) {
    return catalogPresentation.photo(product.url) || fallback
      || productCache[product.url]?.images?.[0]?.src
      || bundledProductDetails[product.url]?.images?.[0]?.src || product.image;
  }
  function transparentPhotoAttribute(product) {
    return catalogPresentation.photo(product.url) ? 'data-transparent-product-photo' : '';
  }

  function cleanDisplayText(value) {
    return clean(correctDisplayText(value || '', presentationTextCorrections)
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

  // Allow small typing mistakes, including swapped adjacent letters.
  function searchWordMatches(query, word) {
    if (word.startsWith(query)) return true;
    if (query.length < 4 || /\d/.test(query + word)) return false;
    const limit = query.length >= 7 ? 2 : 1;
    if (Math.abs(query.length - word.length) > limit) return false;
    const distances = Array.from({length:query.length + 1}, () => Array(word.length + 1).fill(0));
    for (let i = 0; i <= query.length; i++) distances[i][0] = i;
    for (let j = 0; j <= word.length; j++) distances[0][j] = j;
    for (let i = 1; i <= query.length; i++) {
      for (let j = 1; j <= word.length; j++) {
        distances[i][j] = Math.min(distances[i-1][j] + 1, distances[i][j-1] + 1, distances[i-1][j-1] + (query[i-1] === word[j-1] ? 0 : 1));
        if (i > 1 && j > 1 && query[i-1] === word[j-2] && query[i-2] === word[j-1]) distances[i][j] = Math.min(distances[i][j], distances[i-2][j-2] + 1);
      }
    }
    return distances[query.length][word.length] <= limit;
  }

  function filtered(query, region = selectedRegion, category = selectedCategory) {
    const term = normalize(query);
    const searchTokens = term.split(/[^a-z0-9]+/).filter((token) => token && !['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'marca'].includes(token));
    const searchableProducts = products;
    return searchableProducts.map((product) => {
      const isUruguay = product.cat === 'uruguay' || product.category === 'uruguay';
      const matchesRegion = region === 'all' || (region === 'uruguay' ? isUruguay : !isUruguay);
      const matchesCategory = category === 'all' || (category === 'gondola' ? product.cat === 'gondola' && !isUruguay : product.cat === category);
      const matchesFavorite = !favoriteOnly || favorites.has(product.url);
      const taxonomyPath = productCategoryPath(product);
      const taxonomyText = [...taxonomyPath, ...taxonomyPath.map(categoryDisplayName)].join(' ');
      const sourceCategory = categoryFor(product.cat);
      const titleText = normalize(`${product.title} ${product.brand || ''}`);
      const text = normalize(`${titleText} ${product.barcode || ''} ${product.description || ''} ${taxonomyText} ${sourceCategory?.name || ''} ${sourceCategory?.desc || ''}`);
      const identityWords = titleText.split(/[^a-z0-9]+/).filter(word => word && word !== 'marca');
      const searchableWords = text.split(/[^a-z0-9]+/).filter(word => word && word !== 'marca');
      const matchesSearch = !term || searchTokens.length > 0 && searchTokens.every(token => searchableWords.some(word => word.startsWith(token)) || identityWords.some(word => searchWordMatches(token, word)));
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

  let searchBrand = '';
  function otherRegionMatches(query) {
    if (favoriteOnly || normalize(query).length < 3 || !['argentina','uruguay'].includes(selectedRegion)) return null;
    const region = selectedRegion === 'argentina' ? 'uruguay' : 'argentina';
    const matches = searchBrand
      ? filtered('',region,'all').filter(product => brandKey(brandName(product)) === brandKey(searchBrand))
      : filtered(query,region,'all');
    return matches.length ? {region, count:matches.length} : null;
  }

  function showSearchRegion(region) {
    if (!['argentina','uruguay'].includes(region)) return;
    selectedRegion = region;
    selectedCategory = 'all';
    renderSearchCategories();
    renderResults($('#query').value);
    logAnalyticsEvent('catalog_filter',{kind:'region',region:selectedRegion,source:'search_match'});
  }
  function renderResults(query = '') {
    if (brandKey(query) !== brandKey(searchBrand)) searchBrand = '';
    const result = searchBrand ? filtered('').filter(product => brandKey(brandName(product)) === brandKey(searchBrand)) : filtered(query);
    const title = favoriteOnly ? 'Guardados' : query ? 'Resultados' : selectedCategory !== 'all' ? categoryFor(selectedCategory).name : selectedRegion === 'all' ? 'Todos los productos' : selectedRegion === 'uruguay' ? 'Uruguay' : 'Argentina';
    $('#resultsTitle').textContent = searchBrand ? `Marca ${searchBrand}` : title;
    $('#resultsMeta').textContent = `${result.length.toLocaleString('es-AR')} ${result.length === 1 ? 'producto' : 'productos'} ${selectedRegion === 'all' ? 'en esta vista' : `en ${selectedRegion === 'uruguay' ? 'Uruguay' : 'Argentina'}`}`;
    renderSearchScope();
    let categoryLinks = $('#searchCategoryMatches');
    if (!categoryLinks) {
      categoryLinks = document.createElement('div');
      categoryLinks.id = 'searchCategoryMatches';
      categoryLinks.className = 'search-category-matches';
      $('#productList').before(categoryLinks);
    }
    // One or two letters should show products, not a wall of unrelated paths.
    const suggested = normalize(query).length >= 3 && !favoriteOnly ? matchingCategories(result, productCategoryPaths, query) : [];
    categoryLinks.hidden = !suggested.length;
    categoryLinks.innerHTML = suggested.length ? `<span class="search-category-caption">Encontralo también en categorías</span>${suggested.map(({path})=>`<button class="search-category-match" type="button" data-taxonomy-path="${encodeURIComponent(JSON.stringify(path))}">${taxonomyIcon(path.at(-1))}<span>${escapeHtml(path.map(categoryDisplayName).join(' › '))}</span><span aria-hidden="true">›</span></button>`).join('')}` : '';
    let brandLinks = $('#searchBrandMatches');
    if (!brandLinks) {
      brandLinks = document.createElement('div');
      brandLinks.id = 'searchBrandMatches';
      brandLinks.className = 'search-brand-matches';
      categoryLinks.before(brandLinks);
    }
    let regionLinks = $('#searchRegionMatches');
    if (!regionLinks) {
      regionLinks = document.createElement('div');
      regionLinks.id = 'searchRegionMatches';
      regionLinks.className = 'search-region-matches';
      $('#productList').after(regionLinks);
    }
    const otherRegion = otherRegionMatches(query);
    regionLinks.hidden = !otherRegion;
    regionLinks.innerHTML = otherRegion ? `<button type="button" class="search-region-match" data-search-region="${otherRegion.region}"><span aria-hidden="true">${otherRegion.region === 'uruguay' ? '🇺🇾' : '🇦🇷'}</span><span>Coincidencias en ${otherRegion.region === 'uruguay' ? 'Uruguay' : 'Argentina'} <small>· ${otherRegion.count.toLocaleString('es-AR')} ${otherRegion.count === 1 ? 'producto' : 'productos'}</small></span><span aria-hidden="true">›</span></button>` : '';
    // Filter before limiting: logo-less matches must not occupy suggestion slots.
    const brands = !favoriteOnly && !searchBrand ? matchingBrands(filtered('').filter(product => brandLogo(brandName(product))), query) : [];
    brandLinks.hidden = !brands.length;
    brandLinks.innerHTML = brands.map(({name,count}) => {
      const logo = brandLogo(name);
      const initials = name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
      return `<button class="search-brand-match" type="button" data-search-brand="${escapeHtml(name)}" aria-label="Ver ${count} productos de ${escapeHtml(name)}"><span class="search-brand-circle"><span class="search-brand-initials" aria-hidden="true">${escapeHtml(initials)}</span>${logo ? `<img src="${escapeHtml(logo)}" alt="" onerror="this.hidden=true; const note=this.parentElement.querySelector('details'); if(note)note.open=true">` : ''}</span><strong>${escapeHtml(name)}</strong></button>`;
    }).join('');
    $('#results').hidden = false;
    $('#searchCategories').hidden = true;
    $('#recentSearches').hidden = true;
    // Cada consulta representa una nueva colección: nunca reutilizamos la
    // posición anterior del scroll, que podía dejar el encabezado sticky
    // sobre la primera tarjeta.
    const resultsView = $('#results');
    if (resultsView) {
      resultsView.scrollTop = 0;
      resultsView.scrollLeft = 0;
    }
    renderProductCollection($('#productList'), result, `<div class="empty-state"><svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5h5"/></svg><strong>No encontramos productos</strong><span>Probá con otra marca, nombre o categoría.</span><button class="text-btn" id="emptyReset">Hacer nueva búsqueda</button></div>`);
    $('#emptyReset')?.addEventListener('click', () => { $('#query').value = ''; $('#clear').hidden = true; selectedCategory = 'all'; favoriteOnly = false; renderSearchScope(); renderSearchCategories(); $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; $('#query').focus(); });
  }

  function renderSavedButtonCount() {
    const count = products.filter(product => favorites.has(product.url)).length.toLocaleString('es-AR');
    document.querySelectorAll('[data-saved-count]').forEach(node => { node.textContent = count; });
  }

  function renderSaved() {
    const items = products.filter((product) => favorites.has(product.url)).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    const count = items.length.toLocaleString('es-AR');
    $('#savedTitle').textContent = `Guardados (${count})`;
    $('#savedMeta').textContent = `${count} ${items.length === 1 ? 'producto guardado' : 'productos guardados'}`;
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
    if (!topbar) return;
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
    if (!document.body.classList.contains('search-open')) return;
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

  const brandMarqueeStartedAt = performance.now();
  let brandMarqueeOffsetMs = 0;
  // Los logos son locales y pequeños. Preparar también los que aún están
  // fuera de pantalla para no dejar huecos al avanzar la franja.
  document.querySelectorAll('.trusted-brands-group img').forEach(image => { image.loading = 'eager'; });
  document.querySelectorAll('.trusted-brands-group img').forEach(image => {
    const name = brandForLogoPath(image.getAttribute('src'));
    if (!name) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'trusted-brand-link';
    button.dataset.searchBrand = name;
    button.setAttribute('aria-label', `Ver productos de ${name}`);
    // The duplicated animation group remains mouse/touch accessible without
    // adding duplicate keyboard stops inside its aria-hidden subtree.
    if (image.closest('[aria-hidden="true"]')) button.tabIndex = -1;
    image.replaceWith(button);
    button.append(image);
  });
  const brandMarqueeDrag = enableBrandMarqueeDrag({
    track:document.querySelector('.trusted-brands-track'), events:window,
    phaseChanged:time => { brandMarqueeOffsetMs = time - (performance.now() - brandMarqueeStartedAt); }
  });

  function resumeBrandMarquee() {
    const track = document.querySelector('.trusted-brands-track');
    if (!track) return;
    const elapsed = (((performance.now() - brandMarqueeStartedAt + brandMarqueeOffsetMs) % 130000 + 130000) % 130000) / 1000;
    track.style.setProperty('--trusted-brands-delay', `${-elapsed}s`);
  }

  function showView(viewId, {preserveSearch = false, restoreScroll = false} = {}) {
    const appShell = document.querySelector('.app');
    viewScrollPositions.set(activeScrollKey, {window:Number(window.scrollY)||0, app:Number(appShell?.scrollTop)||0, results:Number($('#results')?.scrollTop)||0});
    activeScrollKey = navigationScrollKey(viewId, activeCategoryPath);
    const savedPosition = restoreScroll ? viewScrollPositions.get(activeScrollKey) : null;
    if (viewId === 'homeView' && !$('#homeView').classList.contains('active')) resumeBrandMarquee();
    document.body.dataset.activeView = viewId;
    usageAnalytics.screen(viewId);
    if (viewId !== 'searchView') {
      document.body.classList.remove('search-open');
      setSearchHomeHidden(false);
      restoreSearchForm();
    }
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
    mountViewTitle(viewId);
    updateTabletResourceSelection();
    document.querySelectorAll('.nav').forEach((button) => button.classList.toggle('active', button.dataset.view === viewId));
    if (viewId === 'searchView' && !preserveSearch) { renderSearchCategories(); $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; }
    if (viewId === 'timelineView') renderCatalogTimeline(undefined, '', timelineKind);
    if (viewId === 'alertsView') {
      setPushNotificationBadge(false);
      renderPushNotifications();
      // Manual push messages are the only entries in this inbox.
      void restorePushHistory(true);
    }
    if (viewId === 'moreView') renderMore();
    if (viewId === 'savedView') renderSaved();
    // En el teléfono desplaza la ventana; en la vista de escritorio de Vite,
    // el desplazamiento vive dentro del marco que simula el dispositivo.
    window.scrollTo(0,0);
    if (appShell) appShell.scrollTop = 0;
    window.requestAnimationFrame(() => {
      if (savedPosition) {
        window.scrollTo(0, savedPosition.window);
        if (appShell) appShell.scrollTop = savedPosition.app;
        if ($('#results')) $('#results').scrollTop = savedPosition.results;
      }
      updateHeaderScrollState();
    });
  }

  function renderPushNotifications() {
    pushNotifications=pushNotifications.filter(item=>!alertExpired(item));
    if(!pushNotifications.length)setPushNotificationBadge(false);
    const list = $('#pushNotificationList');
    if (!list) return;
    renderNotificationPermission();
    list.innerHTML = pushNotifications.length ? pushNotifications.map((item) => {
      const playUrl = trustedPlayStoreUrl(item.url);
      const photo = pushImageUrl(item.imageUrl);
      const image = photo ? `<img class="push-notification-image" src="${escapeHtml(photo)}" alt="Foto del aviso" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true; const note=this.parentElement.querySelector('details'); if(note)note.open=true">` : '';
      const link = playUrl ? `<button class="push-notification-link" data-push-link="${escapeHtml(playUrl)}" type="button">Abrir en ${distributionLinks.label} <span aria-hidden="true">›</span></button>` : '';
      const text = `<p>${escapeHtml(item.body || 'Hay una actualización disponible.')}</p>`;
      const note = photo && item.bodyDisplay==='collapsed' ? `<details class="push-note"><summary><span class="push-note-closed">Leer la nota</span><span class="push-note-open">Ocultar la nota</span></summary>${text}</details>` : text;
      return `<article class="push-notification-item" data-notice-key="${escapeHtml(item.eventKey || '')}"><div><strong>${escapeHtml(item.title || 'Novedad del catálogo')}</strong>${image}${note}<small>${escapeHtml(item.time || '')}</small>${link}</div></article>`;
    }).join('') : '<div class="empty-state"><strong>No hay notificaciones</strong><span>Cuando llegue un aviso nuevo, aparecerá acá.</span></div>';
    stopNoticeViewObserver?.();
    if(typeof IntersectionObserver!=='undefined') stopNoticeViewObserver=observeNoticeViews({list,visible:()=>document.querySelector('.view.active')?.id==='alertsView' && document.visibilityState==='visible',record:recordNoticeSeen});
  }

  function renderRetiredShortcut(items = alertCache?.items) {
    const panel = $('#catalogAlertShortcut');
    if (!panel) return;
    const groups = Array.isArray(items) ? alertGroups(items) : (items || {});
    const count = realAlertItems(groups.baja).length;
    panel.hidden = count === 0;
    const meta = $('#retiredProductsMeta');
    if (meta && count) meta.textContent = `${count} ${count === 1 ? 'producto retirado' : 'productos retirados'}`;
  }

  function renderNotificationPermission() {
    const status = localStorage.getItem('iht_push_status');
    const active = status === 'active';
    const failed = status === 'error' || status === 'unavailable';
    const disableFailed = localStorage.getItem('iht_push_disable_error') === '1';
    document.querySelectorAll('.notification-permission').forEach((container) => {
      container.classList.toggle('active', active);
      container.innerHTML = pushPhase
        ? `<strong>${pushPhase === 'activating' ? 'Activando avisos…' : 'Desactivando avisos…'}</strong><button class="text-btn" type="button" disabled>Esperá un momento</button>`
        : disableFailed
        ? '<strong>No pudimos completar la desactivación</strong><button class="text-btn" data-disable-notifications type="button">Reintentar desactivación</button>'
        : status === 'denied'
        ? '<strong>Notificaciones bloqueadas en el teléfono</strong><span>Habilitalas en Ajustes → Aplicaciones → Iahadut HaTora → Notificaciones.</span><button class="text-btn" data-enable-notifications type="button">Volver a comprobar</button>'
        : active
        ? '<strong>Notificación push activada</strong><button class="push-disable" data-disable-notifications type="button">Desactivar <span aria-hidden="true">›</span></button>'
        : `<strong>${failed ? 'No pudimos activar los avisos push' : 'Recibí avisos push de novedades'}</strong><button class="text-btn" data-enable-notifications type="button">${failed ? 'Reintentar' : 'Activar avisos'}</button>`;
    });
  }

  function setPushNotificationBadge(hasNew) {
    const value = Boolean(hasNew);
    if (value) localStorage.setItem('iht_push_unread', '1');
    else localStorage.removeItem('iht_push_unread');
    $('#headerNotificationDot').hidden = !value;
    $('#headerNotifications')?.classList.toggle('has-alerts', value);
    $('#navDot').hidden = !value;
    document.querySelectorAll('.nav[data-view="alertsView"]').forEach(button => button.classList.toggle('has-alerts', value));
  }

  // La campana y la pestaña Alertas representan avisos push. Las novedades
  // editoriales del catálogo siguen viviendo únicamente en Cronología. Esta
  // función queda como compatibilidad para llamadas antiguas, pero no debe
  // ocultar ni reemplazar el indicador de pushes sin leer.
  function setCatalogAlertBadge() {
    return;
  }

  async function refreshDeliveredPushBadge(FirebaseMessaging, markRead = false) {
    try {
      const result = await FirebaseMessaging.getDeliveredNotifications();
      const withdrawn = [];
      for (const notification of result?.notifications || []) {
        if (notificationIsRevoked(notification, revokedPushes) || alertExpired(notification)) {
          withdrawn.push(notification);
          continue;
        }
        // Native history carries the FCM message ID; Android's status-bar ID
        // does not. Do not import a second copy of the same displayed notice.
        if (!pushNotifications.some((item) => item.title === clean(notification.title) && item.body === clean(notification.body))) {
          persistPushNotification(notification, !markRead);
        }
      }
      if (withdrawn.length) await FirebaseMessaging.removeDeliveredNotifications({notifications:withdrawn});
      setPushNotificationBadge(!markRead && localStorage.getItem('iht_push_unread') === '1');
      // Only clear messages after successfully importing their content.
      if (markRead) await FirebaseMessaging.removeAllDeliveredNotifications();
    } catch (_) {
      setPushNotificationBadge(!markRead && localStorage.getItem('iht_push_unread') === '1');
    }
  }

  let inboxRequest = null;
  async function syncAlertsInbox(markRead = false) {
    if (inboxRequest) return inboxRequest;
    inboxRequest=(async()=>{
      try {
        let topic=localStorage.getItem('iht_alerts_test_topic') || localStorage.getItem('iht_push_test_topic') || '';
        if (Capacitor.getPlatform()==='android') {
          const result=await PushHistory.getTestTopic();
          topic=result.topic;
          localStorage.setItem('iht_alerts_test_topic',topic);
        }
        const response=await fetch(`https://waien-hub.waien-studiodev-3c4.workers.dev/api/alerts${topic?`?topic=${encodeURIComponent(topic)}`:''}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok) return;
        const {notices}=await response.json();
        if(!Array.isArray(notices)) return;
        const dismissed=JSON.parse(localStorage.getItem('iht_alerts_dismissed') || '[]');
        const previous=new Set(pushNotifications.map(item=>item.eventKey || item.id));
        pushNotifications=mergeInboxNotifications(pushNotifications,notices,revokedPushes,dismissed);
        localStorage.setItem('iht_push_notifications',JSON.stringify(pushNotifications));
        const reading=markRead || document.querySelector('.view.active')?.id==='alertsView';
        if(!reading && pushNotifications.some(item=>!previous.has(item.eventKey || item.id))) setPushNotificationBadge(true);
        if(reading) setPushNotificationBadge(false);
        if(document.querySelector('.view.active')?.id==='alertsView') renderPushNotifications();
      } catch (_) { /* Preserve cached inbox when offline. */ }
    })().finally(()=>{inboxRequest=null;});
    return inboxRequest;
  }

  async function restorePushHistory(markRead = false) {
    await refreshPushRevocations();
    await syncAlertsInbox(markRead);
    if (!Capacitor.isNativePlatform()) return;
    if (pushHistoryRequest) {
      await pushHistoryRequest;
      if (markRead) return restorePushHistory(true);
      return;
    }
    pushHistoryRequest = (async () => {
      const {FirebaseMessaging} = await import('@capacitor-firebase/messaging');
      if (['android', 'ios'].includes(Capacitor.getPlatform())) {
        const result = await PushHistory.getHistory({markRead, revoked:revokedPushes});
        pushNotifications = reconcilePushHistory(pushNotifications, result.notifications || [], revokedPushes).filter(item=>!alertExpired(item));
        localStorage.setItem('iht_push_notifications', JSON.stringify(pushNotifications));
        for (const notification of result.notifications || []) persistPushNotification(notification, !markRead && notification.unread === true);
      }
      await refreshDeliveredPushBadge(FirebaseMessaging, markRead);
      if (markRead) setPushNotificationBadge(false);
      if (document.querySelector('.view.active')?.id === 'alertsView') renderPushNotifications();
    })().catch(() => {}).finally(() => { pushHistoryRequest = null; });
    return pushHistoryRequest;
  }

  async function refreshPushRevocations() {
    if (pushRevocationsRequest) return pushRevocationsRequest;
    pushRevocationsRequest = loadRevokedPushes().then((ids) => {
      revokedPushes = ids;
      const remaining = pushNotifications.filter((item) => !notificationIsRevoked(item, ids));
      if (remaining.length !== pushNotifications.length) {
        pushNotifications = remaining;
        localStorage.setItem('iht_push_notifications', JSON.stringify(remaining));
        if (!remaining.length) setPushNotificationBadge(false);
        renderPushNotifications();
      }
    }).finally(() => { pushRevocationsRequest = null; });
    return pushRevocationsRequest;
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
    const mobileSearchDock = $('.bottom-nav');
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
    showView('searchView', {preserveSearch:true, restoreScroll:true});
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
    void refreshGlobalRanking();
    searchBrand = '';
    selectedRegion = 'argentina';
    selectedCategory = 'all';
    favoriteOnly = false;
    window.clearTimeout(searchFocusTimer);
    const searchForm = $('#searchForm');
    searchForm.hidden = false;
    const mobileSearchDock = $('.bottom-nav');
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
    if (!hasText) {
      searchBrand = '';
      window.clearTimeout(searchTimer);
    }
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
    window.clearTimeout(searchTimer);
    const value = clean(input.value);
    if (!value) return;
    countPopularity(`query:${normalize(value)}`, 'searches');
    // Never transmit the free text a person enters in the search box.
    recent = [value, ...recent.filter((item) => normalize(item) !== normalize(value))].slice(0,5);
    localStorage.setItem('iht_recent', JSON.stringify(recent));
    if (fromHome) { showView('searchView'); $('#query').value = value; }
    favoriteOnly = false; selectedCategory = 'all'; renderResults(value); renderSearchCategories();
    logAnalyticsEvent('catalog_search', {query_length:value.length, result_count:filtered(value).length, region:selectedRegion});
  }

  function toggleFavorite(url) {
    favorites.has(url) ? favorites.delete(url) : favorites.add(url);
    save();
    logAnalyticsEvent(favorites.has(url) ? 'product_save' : 'product_unsave', {screen:document.querySelector('.view.active')?.id, saved_count:favorites.size});
    renderSavedButtonCount();
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

  async function buildProductShareImage(product, cacheKey) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas no disponible');
    const photoSource = resolvedProductPhoto(product, productCache[product.url]?.images?.[0]?.src || product.image);
    const loadedDetailImage = document.querySelector('#detailContent .detail-content > img');
    const canReuseDetailImage = loadedDetailImage?.complete
      && loadedDetailImage.naturalWidth > 0
      && (() => { try { return new URL(loadedDetailImage.currentSrc || loadedDetailImage.src, window.location.href).origin === window.location.origin; } catch (_) { return false; } })();
    const photoPromise = canReuseDetailImage
      ? Promise.resolve({image: loadedDetailImage, revoke: () => {}})
      : loadShareImage(photoSource);
    const [photo, logo] = await Promise.all([photoPromise, loadLocalShareImage(shareLogoAssetUrl)]);
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
    while (shareImageCache.size > 4) shareImageCache.delete(shareImageCache.keys().next().value);
    return blob;
  }

  function createProductShareImage(product) {
    const cacheKey = clean(product?.url || product?.title);
    const cachedImage = shareImageCache.get(cacheKey);
    if (cachedImage) {
      // Mantener primero en la caché los productos usados más recientemente.
      shareImageCache.delete(cacheKey);
      shareImageCache.set(cacheKey, cachedImage);
      return Promise.resolve(cachedImage);
    }
    const existingTask = shareImageTasks.get(cacheKey);
    if (existingTask) return existingTask;
    const task = buildProductShareImage(product, cacheKey).finally(() => {
      if (shareImageTasks.get(cacheKey) === task) shareImageTasks.delete(cacheKey);
    });
    shareImageTasks.set(cacheKey, task);
    return task;
  }

  function warmProductShareImage(product) {
    if (!product?.image || product.image === productFallbackImage) return;
    const prepare = () => {
      if (document.visibilityState === 'visible') createProductShareImage(product).catch(() => {});
    };
    if (window.requestIdleCallback) window.requestIdleCallback(prepare, {timeout: 1200});
    else window.setTimeout(prepare, 400);
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
      Capacitor.getPlatform() === 'ios' && !appleDistributionUrl(appInstallUrl)
        ? '📲 Descubrí más productos kosher en nuestro sitio:'
        : '📲 Instalá la app y descubrí más productos kosher:',
      `👉 ${appInstallUrl}`
    ].filter(Boolean).join('\n');
  }

  async function shareCurrentProduct() {
    if (!currentProduct || shareBusy) return;
    shareBusy = true;
    logAnalyticsEvent('product_share', {outcome:'attempt'});
    const button = $('#detailShare');
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.setAttribute('aria-label', 'Preparando imagen para compartir');
      button.classList.add('is-loading');
      button.innerHTML = '<span class="share-button-spinner" aria-hidden="true"></span>';
    }
    const preparingNotice = showShareNotice('Abriendo compartir…', '', 0, 'loading');
    try {
      const text = productShareText(currentProduct);
      const url = clean(currentProduct.url) || window.location.href;
      const title = `${currentProduct.title} · Iahadut HaTora`;
      if (Capacitor.isNativePlatform()) {
        // En Android/iOS compartimos la ficha visual como archivo real. Antes
        // este camino enviaba únicamente texto y URL aunque el botón indicara
        // que estaba preparando la foto.
        const imageBlob = await createProductShareImage(currentProduct);
        const safeName = clean(currentProduct.title || 'producto')
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 56) || 'producto';
        await shareImageWithAndroid(imageBlob, `iahadut-${safeName}.jpg`, title, text);
        logAnalyticsEvent('product_share', {outcome:'sheet_returned'});
        showShareNotice('Foto y ficha listas para compartir');
      } else if (navigator.share) {
        // Los navegadores que admiten archivos reciben la misma tarjeta visual;
        // si no, conservamos el compartir tradicional del enlace.
        const imageBlob = await createProductShareImage(currentProduct);
        const safeName = clean(currentProduct.title || 'producto')
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 56) || 'producto';
        const imageFile = new File([imageBlob], `iahadut-${safeName}.jpg`, {type: imageBlob.type || 'image/jpeg'});
        const shareData = {title, text, url};
        if (navigator.canShare?.({files: [imageFile]})) shareData.files = [imageFile];
        await navigator.share(shareData);
        logAnalyticsEvent('product_share', {outcome:'sheet_returned'});
        showShareNotice(shareData.files ? 'Foto y ficha listas para compartir' : 'Ficha lista para compartir');
      } else {
        try {
          await navigator.clipboard.writeText(`${title}\n${url}`);
          logAnalyticsEvent('product_share', {outcome:'copied'});
          showShareNotice('Enlace copiado');
        } catch (_) {
          logAnalyticsEvent('product_share', {outcome:'error'});
          showShareNotice('Copiá el enlace de la ficha para compartirla', 'bad');
        }
      }
    } catch (error) {
      logAnalyticsEvent('product_share', {outcome:error?.name === 'AbortError' ? 'cancelled' : 'error'});
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
    // Las fotos revisadas conservan su transparencia aunque se refresque la
    // ficha oficial. Las demás mantienen su imagen de mayor resolución.
    const officialImage = resolvedProductPhoto(product, official?.images?.[0]?.src || product.image);
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
    const detailImageMarkup = detailImage ? `<img class="asset-loading" ${transparentPhotoAttribute(product)} loading="eager" src="${escapeHtml(detailImage)}" alt="${escapeHtml(product.title)}" data-expanded-image="${escapeHtml(detailImage)}" data-expanded-caption="${escapeHtml(product.title)}" role="button" tabindex="0" aria-label="Ampliar imagen de ${escapeHtml(product.title)}" onload="this.classList.remove('asset-loading','asset-error');this.classList.add('asset-ready')" onerror="this.classList.remove('asset-loading','asset-ready');this.classList.add('asset-error');this.removeAttribute('data-expanded-image');this.removeAttribute('role');this.removeAttribute('tabindex')">` : '';
    const taxonomyMarkup = taxonomyPath.length ? `<nav class="detail-taxonomy" aria-label="Categoría del catálogo"><small>Categoría en el catálogo</small><div>${taxonomyPath.map((part, index) => `${index ? '<span aria-hidden="true">→</span>' : ''}<button type="button" data-detail-taxonomy-path="${escapeHtml(encodeURIComponent(JSON.stringify(taxonomyPath.slice(0, index + 1))))}">${escapeHtml(categoryDisplayName(part))}</button>`).join('')}</div></nav>` : '';
    const berajaMarkup = official?.beraja ? `<div class="detail-facts single"><div><small>Berajá</small><strong>${escapeHtml(official.beraja)}</strong></div></div>` : '';
    const detailContent = $('#detailContent');
    const existing = detailContent.querySelector('.detail-content:not(.detail-content-loading)');
    if (!existing) {
      detailContent.innerHTML = `<div class="detail-content">${detailImageMarkup}<div class="detail-body">${uruguayBadge(product, 'product-region-badge detail-region-badge')}<span class="label ${detailCategoryClass}">${escapeHtml(officialCategory)}${specialSealMarkup}</span><h1>${styledBrandText(product.title)}</h1><p class="detail-description">${escapeHtml(officialDescription)}</p>${berajaMarkup}${taxonomyMarkup}${official?.loadFailed ? '<button class="filter-btn detail-retry" id="detailRetry" type="button"><span>Reintentar carga</span></button>' : ''}</div></div>`;
    } else {
      let image = existing.querySelector(':scope > img');
      if (!detailImage) image?.remove();
      else if (image && image.src !== new URL(detailImage, location.href).href) {
        // A reused <img> keeps its old decoded bitmap until the new URL loads.
        // Replace it with a fresh, hidden loading image instead.
        image.remove();
        existing.insertAdjacentHTML('afterbegin', detailImageMarkup);
        image = existing.querySelector(':scope > img');
      }
      else if (!image) { existing.insertAdjacentHTML('afterbegin', detailImageMarkup); image = existing.querySelector(':scope > img'); }
      if (image && detailImage) {
        image.dataset.expandedImage = detailImage;
        image.dataset.expandedCaption = product.title;
        image.alt = product.title;
        image.setAttribute('aria-label', `Ampliar imagen de ${product.title}`);
      }
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
    const statusLabel = detailContent.querySelector('.label');
    if (managedCategoryInfo(product.cat) && statusLabel) {
      const statusButton = document.createElement('button');
      statusButton.type = 'button';
      statusButton.className = `${statusLabel.className} category-info-trigger`;
      statusButton.innerHTML = statusLabel.innerHTML;
      statusButton.dataset.categoryInfo = product.cat;
      statusButton.setAttribute('aria-haspopup', 'dialog');
      statusButton.setAttribute('aria-label', `${statusLabel.textContent}. Ver explicación`);
      const infoButton = document.createElement('button');
      infoButton.type = 'button';
      infoButton.className = 'category-info-button';
      infoButton.dataset.categoryInfo = product.cat;
      infoButton.setAttribute('aria-haspopup', 'dialog');
      infoButton.setAttribute('aria-label', `Información: ${statusLabel.textContent}`);
      infoButton.innerHTML = '<span class="category-info-mark" aria-hidden="true">i</span>';
      const wrapper = document.createElement('div');
      wrapper.className = `category-info-wrap ${detailCategoryClass}`;
      statusLabel.closest('.category-info-wrap')?.replaceWith(statusLabel);
      statusLabel.replaceWith(wrapper);
      wrapper.append(statusButton, infoButton);
    }
    if (retry) retry.onclick = () => openDetail(product.url, {retry:true});
    detailContent.querySelectorAll('[data-detail-taxonomy-path]').forEach((button) => {
      button.onclick = () => openTaxonomyPath(JSON.parse(decodeURIComponent(button.dataset.detailTaxonomyPath)));
    });
    $('#detailSave').innerHTML = bookmarkIcon(favorites.has(product.url));
    $('#detailSave').setAttribute('aria-label', favorites.has(product.url) ? 'Quitar de guardados' : 'Guardar producto');
    if (!official?.loading) warmProductShareImage(product);
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

  const recoverProductContent = createDetailRecovery({
    online:() => navigator.onLine,
    sync:() => syncRequest || syncCatalogFromPublishedFiles(),
    read:url => productCache[url]
  });
  function openDetail(url, options = {}) {
    const product = products.find((item) => item.url === url); if (!product) return;
    const fromSearch = options.fromSearch && !options.retry && document.querySelector('.view.active')?.id === 'searchView' && $('#query').value.trim();
    if (!options.retry) {
      previousView = document.querySelector('.view.active').id;
      previousScrollTop = window.scrollY;
    }
    currentProduct = product;
    // Limpiar la ficha anterior ANTES de activar la vista. El placeholder es
    // visible (asset-loading se reserva para imágenes reales que aún no cargan).
    $('#detailContent').innerHTML = `<div class="detail-content detail-content-loading" role="status" aria-label="Cargando ficha de ${escapeHtml(product.title)}" aria-busy="true"><div class="detail-loading-image" aria-hidden="true"></div><div class="detail-body"><span class="label">Cargando ficha</span><div class="detail-loading-line detail-loading-line-long" aria-hidden="true"></div><div class="detail-loading-line" aria-hidden="true"></div><div class="detail-loading-line detail-loading-line-short" aria-hidden="true"></div></div></div>`;
    showView('detailView');
    // Permitir un primer pintado incluso con caché o una respuesta inmediata.
    window.requestAnimationFrame(() => window.setTimeout(() => {
    if (currentProduct?.url !== product.url || document.querySelector('.view.active')?.id !== 'detailView') return;
    if (fromSearch) {
      void productSearchKey(product.url).then(product_key => logAnalyticsEvent('catalog_product_search', {product_key})).catch(() => {});
      if (remoteControl.live_search_ranking_v1_enabled === true) void liveSearch.record(product.url).catch(() => {});
    }
    countPopularity(product.url, 'opens');
    logAnalyticsEvent('product_open', {source:options.fromScan ? 'scanner' : fromSearch ? 'search' : previousView === 'savedView' ? 'saved' : 'catalog', retry:options.retry ? 1 : 0});
    const cachedOfficial = productCache[product.url] || null;
    if (cachedOfficial) renderDetail(product, cachedOfficial);
    if (options.fromScan) showKosherToast(product);
    if (cachedOfficial) {
      // Complete fiches are updated with the central catalog; their age alone
      // must not trigger another scrape of the official website on each phone.
      if (navigator.onLine && cachedOfficial.textFormatVersion !== 1) fetchProductContent(product, true).then((official) => {
        if (currentProduct?.url === product.url) renderDetail(product, official);
      }).catch(() => {});
      return;
    }
    const slowNotice = window.setTimeout(() => {
      if (currentProduct?.url === product.url) renderDetail(product, {loading:true});
    }, 10000);
    fetchProductContent(product).then((official) => {
      window.clearTimeout(slowNotice);
      if (currentProduct?.url === product.url) renderDetail(product, official);
    }).catch(async () => {
      window.clearTimeout(slowNotice);
      const stillOpen = () => currentProduct?.url === product.url && document.querySelector('.view.active')?.id === 'detailView';
      if (!stillOpen()) return;
      if (navigator.onLine) renderDetail(product, {loading:true});
      try {
        const official = await recoverProductContent(product.url);
        if (stillOpen()) renderDetail(products.find(item => item.url === product.url) || product, official);
      } catch (_) {
        if (stillOpen()) renderDetail(product, {loadFailed:true});
      }
    });
    }, 0));
  }

  function returnFromDetail() {
    if (previousView === 'searchView') restoreSearchScreen();
    else showView(previousView, {restoreScroll:true});
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

  // Alerts can arrive before the user's local catalog cache has caught up.
  // Resolve them against both sources so a fresh alert still has its product
  // photo and remains tappable on an older installed build.
  function findProductForAlert(item, text = '') {
    const pools = [products];
    const url = typeof item === 'object' ? item?.url : '';
    if (url) {
      for (const pool of pools) {
        const linked = pool.find((product) => product.url === url);
        if (linked) return linked;
      }
      if (alertProductOverrides.has(url)) return alertProductOverrides.get(url);
    }
    const normalizedText = normalize(String(text || '').replace(/\s*\([^)]*\)\s*$/, ''));
    if (!normalizedText) return null;
    for (const pool of pools) {
      const match = pool.find((product) => {
        const productTitle = normalize(product.title);
        return productTitle.length > 8 && (normalizedText.includes(productTitle) || productTitle.includes(normalizedText));
      });
      if (match) return match;
    }
    return null;
  }

  async function hydrateAlertProducts(groups) {
    const entries = [...realAlertItems(groups?.alta), ...realAlertItems(groups?.baja)];
    const missing = entries
      .filter((item) => item && typeof item === 'object' && item.url && !findProductForAlert(item, item.text)?.image)
      .slice(0, 12);
    if (!missing.length) return false;
    const hydrated = await Promise.all(missing.map(async (item) => {
      const candidate = {url:item.url, title:cleanDisplayText(item.text || ''), brand:'', barcode:'', cat:'gondola', image:'', description:''};
      try {
        const official = await fetchProductContent(candidate);
        const image = official?.images?.[0]?.src;
        if (!image) return false;
        candidate.image = image;
        alertProductOverrides.set(item.url, candidate);
        return true;
      } catch (_) { return false; }
    }));
    return hydrated.some(Boolean);
  }

  function alertSection(title, key, items) {
    if (!items.length && key === 'general') return '';
    const visibleItems = items.length ? items : [`No hay productos ${key === 'alta' ? 'dados de alta' : 'dados de baja'} publicados en este momento.`];
    const icon = key === 'alta' ? '✓' : key === 'baja' ? '!' : '•';
    return `<details class="alert-group alert-${key}"><summary class="alert-group-head"><span class="alert-group-icon">${icon}</span><div><h2>${title}</h2><small>${items.length} ${items.length === 1 ? 'actualización' : 'actualizaciones'}</small></div><svg class="alert-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></summary><div class="alert-group-items">${visibleItems.map((item) => {
      const text = typeof item === 'string' ? item : item?.text || '';
      const match = findProductForAlert(item, text);
      const visual = match?.image ? `<img class="alert-product-image asset-loading" src="${escapeHtml(match.image)}" alt="" loading="lazy" onload="this.classList.remove('asset-loading','asset-error')" onerror="this.onerror=null;this.src='assets/product-placeholder.svg';this.classList.add('asset-error')">` : '<span class="alert-mark" aria-hidden="true">•</span>';
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
        const match = findProductForAlert(item, text);
        const visual = match?.image
          ? `<span class="alert-timeline-visual"><img class="alert-product-image asset-loading" src="${escapeHtml(match.image)}" alt="" loading="lazy" onload="this.classList.remove('asset-loading','asset-error')" onerror="this.onerror=null;this.src='assets/product-placeholder.svg';this.classList.add('asset-error')"></span>`
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
    // La tarjeta de bajas queda arriba para que sea visible antes de la
    // cronología de altas y cambios.
    return `${bajaAction}${alertTimelineMarkup(groups, state, 'all')}`;
  }

  function alertMetaText() {
    return 'Altas y bajas, ordenadas por fecha.';
  }

  function renderRetiredAlerts(items = alertCache?.items, state = '') {
    if (!$('#alertList')) return;
    // La campana muestra todas las novedades del catálogo. Las bajas siguen
    // disponibles dentro del mismo timeline, sin ocultar las altas nuevas.
    $('#alertList').innerHTML = alertMarkup(items || {alta:[], baja:[], general:[]}, state);
    $('#alertsMeta').textContent = state === 'error' ? 'Sin conexión · no pudimos actualizar las novedades.' : 'Altas y bajas, ordenadas por fecha.';
  }

  function renderTimelineItems(items, state, kind) {
    const isRemovalTimeline = kind === 'baja';
    $('#timelineTitle').textContent = isRemovalTimeline ? 'Productos dados de baja' : kind === 'alta' ? 'Últimos productos incorporados a la lista' : 'Últimos cambios';
    $('#timelineMeta').textContent = isRemovalTimeline ? 'Productos retirados del catálogo, ordenados por fecha.' : 'Altas y bajas, ordenadas por fecha.';
    const showAllButton = isRemovalTimeline
      ? '<button class="alert-secondary-action" type="button" data-open-all-changes><span class="alert-secondary-icon" aria-hidden="true">↗</span><span><strong>Ver todos los cambios</strong><small>Altas y bajas del catálogo</small></span><span class="alert-secondary-arrow" aria-hidden="true">›</span></button>'
      : '';
    $('#timelineList').innerHTML = `${showAllButton}${alertTimelineMarkup(items || {alta:[], baja:[], general:[]}, state, kind)}`;
    if (state !== 'error' && document.querySelector('.view.active')?.id === 'timelineView' && timelineKind === kind && kind !== 'baja') markNewProductsSeen(items);
  }

  async function renderCatalogTimeline(items = alertCache?.items, state = '', kind = timelineKind) {
    if (!$('#timelineList')) return;
    if (items && !Array.isArray(items)) {
      renderTimelineItems(items, state, kind);
      if (state !== 'error') $('#timelineMeta').textContent = kind === 'baja' ? 'Información guardada · actualizando bajas…' : 'Información guardada · actualizando novedades…';
    } else {
      $('#timelineList').innerHTML = '<div class="content-skeleton alert-skeleton" aria-label="Preparando cronología"><i></i><i></i><i></i></div>';
    }
    if (state === 'error') {
      renderTimelineItems(items || {}, state, kind);
      return;
    }
    try {
      const freshItems = await fetchAlerts();
      if (document.querySelector('.view.active')?.id === 'timelineView') {
        renderTimelineItems(freshItems, '', kind);
      }
      // Some very recent alerts can be published before their product is
      // present in the catalog snapshot. Fetch that product's official image
      // in the background and replace the temporary marker when it arrives.
      hydrateAlertProducts(freshItems).then((changed) => {
        if (changed && document.querySelector('.view.active')?.id === 'timelineView') {
          renderTimelineItems(freshItems, '', kind);
        }
      }).catch(() => {});
    } catch (_) {
      if (document.querySelector('.view.active')?.id === 'timelineView') {
        renderTimelineItems(alertCache?.items || {}, 'error', kind);
      }
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
    if (Capacitor.getPlatform() === 'ios') return appleDistributionUrl(value);
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

  function persistPushNotification(notification, unread = true) {
    const data = notification?.data && typeof notification.data === 'object' ? notification.data : {};
    const fallbackTitle = 'Aviso de Iahadut HaTora';
    const item = {
      id: clean(notification?.id || data.messageId || data['google.message_id']) || `notice:${clean(notification?.title || data.title)}|${clean(notification?.body || data.body)}|${clean(data.sentAt || notification?.receivedAt)}`,
      eventKey: notificationEventKey(notification),
      bodyDisplay: data.bodyDisplay==='collapsed'?'collapsed':'expanded',
      imageUrl: pushImageUrl(data.imageUrl || notification?.image || data['gcm.n.image']),
      sentAt: data.sentAt || notification?.receivedAt || new Date().toISOString(),
      expiresAt: data.expiresAt || notification?.expiresAt || '',
      title: clean(notification?.title || data.title || data['gcm.n.title'] || fallbackTitle),
      body: pushBody(notification),
      time: new Date(notification?.receivedAt || data.sentAt || Date.now()).toLocaleString('es-AR', {hour12:false}),
      url: notificationPlayStoreUrl(notification)
    };
    if (notificationIsRevoked(item, revokedPushes)) return null;
    if (alertExpired(item)) return null;
    try { if(JSON.parse(localStorage.getItem('iht_alerts_dismissed') || '[]').includes(item.eventKey || item.id)) return null; } catch (_) { /* Keep new messages if a local preference was damaged. */ }
    const existing=pushNotifications.findIndex(stored=>pushNotificationKey(stored)===pushNotificationKey(item));
    if (existing<0) {
      pushNotifications = [item, ...pushNotifications];
    } else pushNotifications[existing]={...pushNotifications[existing],...item,imageUrl:item.imageUrl || pushNotifications[existing].imageUrl};
    localStorage.setItem('iht_push_notifications', JSON.stringify(pushNotifications));
    if (unread) setPushNotificationBadge(true);
    if (document.querySelector('.view.active')?.id === 'alertsView') renderPushNotifications();
    return item;
  }

  async function pushTestTopicForToken(token) {
    const bytes = new TextEncoder().encode(String(token || ''));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const suffix = [...new Uint8Array(digest)].slice(0, 10).map((value) => value.toString(16).padStart(2, '0')).join('');
    return `iahadut-test-${suffix}`;
  }

  const pushEnabled = () => localStorage.getItem('iht_push_enabled') === '1';

  function registerPushToken(token, FirebaseMessaging) {
    if (!token) return Promise.reject(new Error('No se recibió un token de notificaciones'));
    const generation = pushGeneration;
    const register = async () => {
      if (!pushEnabled() || generation !== pushGeneration) return '';
      const testTopic = Capacitor.getPlatform()==='android' ? (await PushHistory.getTestTopic()).topic : localStorage.getItem('iht_alerts_test_topic') || await pushTestTopicForToken(token);
      localStorage.setItem('iht_alerts_test_topic',testTopic);
      if (!pushEnabled() || generation !== pushGeneration) return '';
      if (Capacitor.getPlatform() === 'android') {
        // The native bridge waits for FCM subscription tasks to complete.
        await PushHistory.configure({enabled:true, testTopic});
      } else {
        await PushHistory.configure({enabled:true});
        await FirebaseMessaging.subscribeToTopic({topic:'catalog-updates'});
        if (!pushEnabled() || generation !== pushGeneration) return '';
        await FirebaseMessaging.subscribeToTopic({topic:testTopic});
      }
      if (!pushEnabled() || generation !== pushGeneration) return '';
      localStorage.setItem('iht_push_token', token);
      localStorage.setItem('iht_push_test_topic', testTopic);
      return testTopic;
    };
    const task = pushRegistrationQueue.then(register);
    pushRegistrationQueue = task.catch(() => {});
    return task;
  }

  async function refreshPlayUpdate() {
    if (Capacitor.getPlatform() !== 'android') return playUpdateState;
    try {
      const result = await PlayStoreUpdates.checkForUpdate();
      playUpdateState = {...playUpdateState, ...result, checked:true};
    } catch (_) {
      // Las instalaciones de desarrollo o fuera de Google Play no tienen
      // acceso a esta API; en esos casos queda activo el fallback remoto.
      playUpdateState = {...playUpdateState, checked:true};
    }
    renderHomeAppUpdate();
    if (moreOptionsVisible()) renderMore();
    return playUpdateState;
  }

  function renderHomeAppUpdate() {
    const update = $('#homeAppUpdate');
    if (!update) return;
    const button = update.querySelector('button');
    if (button) button.setAttribute('aria-label', `Abrir la actualización de la aplicación en ${distributionLinks.label}`);
    // Local visual preview only; release builds keep the real update check.
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'app-update') {
      update.hidden = false;
      return;
    }
    update.hidden = Capacitor.getPlatform() === 'ios'
      ? !(accessDecision(remoteControl).updateAvailable && remoteControl.update_url)
      : !(playUpdateState.available || playUpdateState.downloaded);
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
    if (Capacitor.getPlatform() === 'ios') {
      distributionLinks = storeLinks('ios', remoteControl.update_url);
      appInstallUrl = distributionLinks.install;
    }
    applyRemoteContent(remoteControl);
    const decision = updateAccessOverlay(remoteControl);
    renderHome(); renderSearchCategories();
    renderHomeAppUpdate();
    if (moreOptionsVisible()) renderMore();
    return decision;
  }

  function setupPushNotifications(requestPermission = false) {
    if (!Capacitor.isNativePlatform()) return Promise.resolve('unavailable');
    if (pushPhase === 'deactivating') return Promise.resolve('disabled');
    if (!requestPermission && pushPhase) return pushSetupRequest || Promise.resolve('pending');
    if (requestPermission && pushPhase === 'activating') return pushSetupRequest || Promise.resolve('pending');
    if (pushSetupRequest) return pushSetupRequest.then(() => requestPermission ? setupPushNotifications(true) : localStorage.getItem('iht_push_status'));
    if (requestPermission) {
      if (!pushEnabled()) pushGeneration += 1;
      localStorage.setItem('iht_push_enabled', '1');
      localStorage.removeItem('iht_push_disable_error');
      pushPhase = 'activating';
      renderNotificationPermission();
    }
    const generation = pushGeneration;
    pushSetupRequest = configurePushNotifications(requestPermission, generation)
      .finally(() => { pushSetupRequest = null; if (pushPhase === 'activating') pushPhase = ''; renderNotificationPermission(); });
    return pushSetupRequest;
  }

  async function configurePushNotifications(requestPermission, generation) {
    try {
      const {FirebaseMessaging} = await import('@capacitor-firebase/messaging');
      if (!pushListenersReady) {
        await FirebaseMessaging.addListener('tokenReceived', async ({token}) => {
          if (!pushEnabled() || pushPhase) return;
          try {
            const topic = await registerPushToken(token, FirebaseMessaging);
            if (topic && pushEnabled()) localStorage.setItem('iht_push_status', 'active');
          } catch (_) {
            if (pushEnabled()) localStorage.setItem('iht_push_status', 'error');
          }
          renderNotificationPermission();
        });
        await FirebaseMessaging.addListener('notificationReceived', ({notification}) => {
          if (!pushEnabled()) return;
          const viewingAlerts = document.querySelector('.view.active')?.id === 'alertsView';
          persistPushNotification(notification, !viewingAlerts);
          void restorePushHistory(viewingAlerts);
        });
        await FirebaseMessaging.addListener('notificationActionPerformed', async ({notification}) => {
          await restorePushHistory(false);
          persistPushNotification(notification, false);
          showView('alertsView');
        });
        pushListenersReady = true;
      }
      // An inbox download must never delay Android's permission/activation UI.
      void restorePushHistory(document.querySelector('.view.active')?.id === 'alertsView');
      if (generation !== pushGeneration) return 'disabled';
      if (!pushEnabled()) {
        localStorage.setItem('iht_push_status', 'disabled');
        await PushHistory.setEnabled({enabled:false});
        renderNotificationPermission();
        return 'disabled';
      }
      if (Capacitor.getPlatform() === 'android') {
        await FirebaseMessaging.createChannel({id:'catalog-updates-v2', name:'Avisos de Iahadut HaTora', description:'Avisos enviados por el equipo', importance:4, vibration:true, lights:true, lightColor:'#0000FF'});
      }
      let permission = await FirebaseMessaging.checkPermissions();
      if (requestPermission && ['prompt', 'prompt-with-rationale'].includes(permission.receive)) permission = await FirebaseMessaging.requestPermissions();
      if (!pushEnabled() || generation !== pushGeneration) return 'disabled';
      if (permission.receive !== 'granted') {
        localStorage.setItem('iht_push_status', permission.receive === 'denied' ? 'denied' : 'pending');
        renderNotificationPermission();
        return permission.receive;
      }
      const {token} = await pushOperationTimeout(FirebaseMessaging.getToken());
      if (!token) throw new Error('No se recibió un token de notificaciones');
      const topic = await registerPushToken(token, FirebaseMessaging);
      if (!topic || !pushEnabled() || generation !== pushGeneration) return 'disabled';
      localStorage.setItem('iht_push_status', 'active');
      renderNotificationPermission();
      return 'active';
    } catch (_) {
      const status = pushEnabled() && generation === pushGeneration ? 'error' : 'disabled';
      localStorage.setItem('iht_push_status', status);
      renderNotificationPermission();
      return status;
    }
  }

  async function disablePushNotifications() {
    if (pushPhase === 'deactivating') return;
    pushPhase = 'deactivating';
    logAnalyticsEvent('notification_setting', {outcome:'disabled'});
    localStorage.setItem('iht_push_enabled', '0');
    localStorage.setItem('iht_push_status', 'disabled');
    pushGeneration += 1;
    renderNotificationPermission();
    const testTopic = localStorage.getItem('iht_push_test_topic');
    const cleanup = async () => {
      const {FirebaseMessaging} = await import('@capacitor-firebase/messaging');
      if (Capacitor.getPlatform() === 'android') await PushHistory.configure({enabled:false});
      else {
        await PushHistory.configure({enabled:false});
        await FirebaseMessaging.unsubscribeFromTopic({topic:'catalog-updates'});
        if (testTopic) await FirebaseMessaging.unsubscribeFromTopic({topic:testTopic});
        await FirebaseMessaging.deleteToken();
      }
      localStorage.removeItem('iht_push_token');
      localStorage.removeItem('iht_push_test_topic');
      localStorage.removeItem('iht_push_disable_error');
    };
    try {
      await PushHistory.setEnabled({enabled:false});
      const task = pushRegistrationQueue.then(cleanup);
      pushRegistrationQueue = task.catch(() => {});
      await task;
    } catch (_) { localStorage.setItem('iht_push_disable_error', '1'); }
    pushPhase = '';
    renderNotificationPermission();
    renderPushNotifications();
    renderMore();
  }

  function pushOperationTimeout(operation, milliseconds = 30000) {
    let timer;
    return Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('La conexión de notificaciones no respondió. Reintentá con conexión.')),milliseconds);})]).finally(()=>clearTimeout(timer));
  }

  function moreOptionsVisible() {
    return tabletLayout.matches || document.querySelector('.view.active')?.id === 'moreView';
  }

  function updateTabletResources() {
    const sidebar = $('#tabletResources');
    (tabletLayout.matches ? sidebar : moreListHome).append($('#moreList'));
    (tabletLayout.matches ? sidebar : shareAppHome).append($('#shareAppWhatsApp'));
    if (tabletLayout.matches) {
      renderMore();
      if (document.querySelector('.view.active')?.id === 'moreView') returnHome();
    }
    updateTabletResourceSelection();
    if (recentCarouselTimer) { window.clearInterval(recentCarouselTimer); recentCarouselTimer = null; }
    startRecentCarousel();
  }

  function updateTabletResourceSelection() {
    const reading = document.body.dataset.activeView === 'readerView';
    document.querySelectorAll('#tabletResources [data-info]').forEach(button => {
      const selected = reading && button.dataset.info === currentInfoKey;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function renderMore({offlineOnly = false} = {}) {
    const offlineState = {...offlineDownload.check(offlineAssets(), offlineVersion())};
    if (offlineStarting && !offlineState.busy && !offlineState.paused && !offlineState.ready) Object.assign(offlineState, {busy:true, preparing:true});
    const offlineTitle = offlineState.ready ? 'Listo para usar offline' : 'Usar sin conexión';
    const offlineStatus = offlineState.preparing ? 'Preparando descarga…' : offlineWifiWait || offlineState.waiting ? 'Esperando conexión permitida' : offlineState.pausing ? 'Pausando…' : offlineState.paused ? 'Descarga pausada' : offlineState.busy ? (offlineState.total ? `Descargando · ${offlineState.completed.toLocaleString('es-AR')} de ${offlineState.total.toLocaleString('es-AR')} fotos` : `Descargando · ${offlineState.percent}%`) : offlineState.error ? 'Descarga incompleta · Reintentar' : offlineState.ready ? '' : offlineState.hasDownload ? 'Actualizar descarga' : 'Descarga aproximada: 399 MB';
    const offline = `<div class="offline-download-item"><button class="more-row offline-download-row" data-offline-download ${offlineState.busy || offlineState.clearing || offlineState.ready ? 'disabled' : ''}><span class="more-row-leading-icon offline-storage-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${offlineState.ready ? '<path d="M4 8h16v12H4zM3 4h18v4H3zM10 12h4"/>' : '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>'}</svg></span><span><strong>${offlineTitle}</strong>${offlineStatus ? `<small>${offlineStatus}</small>` : ''}${offlineState.busy || offlineState.paused || offlineWifiWait ? `<span class="offline-download-progress" role="progressbar" aria-label="Descarga offline" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${offlineState.percent}"><span style="width:${offlineState.percent}%"></span></span>` : ''}</span></button>${offlineState.busy || offlineWifiWait ? `<button class="offline-pause-button" data-offline-pause ${offlineState.preparing || offlineState.pausing ? 'disabled' : ''}>${offlineWifiWait ? 'Cancelar' : 'Pausar'}</button>` : offlineState.paused ? '<button class="offline-pause-button" data-offline-download>Reanudar</button>' : ''}${offlineState.hasDownload && !offlineState.busy ? `<div class="offline-download-actions"><button class="offline-delete-button" type="button" aria-label="${offlineState.clearing ? 'Borrando descarga' : 'Borrar descarga'}" title="Borrar descarga" data-offline-delete ${offlineState.clearing ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg></button></div>` : ''}</div>`;
    // Progress changes only this row. Recreating the entire More screen
    // reloads the lazy Waien logo and interrupts focus/scroll on every image.
    const offlineItem = $('#moreList .offline-download-item');
    if (offlineOnly && offlineItem) {
      const template = document.createElement('div');
      template.innerHTML = offline;
      const next = template.firstElementChild;
      for (const selector of ['.offline-download-row', '.offline-pause-button', '.offline-download-actions']) {
        const current = offlineItem.querySelector(selector);
        const replacement = next.querySelector(selector);
        if (current && replacement) {
          for (const attribute of [...current.attributes]) if (!replacement.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
          for (const attribute of [...replacement.attributes]) current.setAttribute(attribute.name, attribute.value);
          if (current.innerHTML !== replacement.innerHTML) current.innerHTML = replacement.innerHTML;
        } else if (replacement) offlineItem.append(replacement);
        else if (current) current.remove();
      }
      return;
    }
    const officialWebsite = `<a class="more-row official-site-row" href="https://vaad.ar/" target="_blank" rel="noopener"><span class="more-row-leading-icon" aria-hidden="true">↗</span><span><strong>Sitio web oficial</strong></span><span class="row-arrow" aria-hidden="true">›</span></a>`;
    const rateApp = distributionLinks.rate ? `<a class="more-row rate-app-row" href="${distributionLinks.rate}" data-rate-app target="_blank" rel="noopener"><span class="rate-app-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg></span><span><strong>Calificá la app</strong><small>Dejanos tu opinión en ${Capacitor.getPlatform() === 'ios' ? 'App Store' : distributionLinks.label}</small></span><span class="row-arrow" aria-hidden="true">›</span></a>` : '';
    const decision = accessDecision(remoteControl);
    const pushStatus = localStorage.getItem('iht_push_status');
    const notificationButton = $('#notificationButton');
    const notificationStatus = $('#notificationStatus');
    if (notificationButton) notificationButton.setAttribute('aria-label', pushStatus === 'active' ? 'Notificaciones activadas' : 'Configurar notificaciones');
    if (notificationStatus) notificationStatus.hidden = pushStatus !== 'active';
    const playUpdateAvailable = Boolean(playUpdateState.available || playUpdateState.downloaded);
    const nativeAndroid = Capacitor.getPlatform() === 'android';
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
    const developerWhatsApp = appWhatsAppLink('https://wa.me/5491135195674', {message:'¿Podemos hacer un proyecto juntos?'});
    const developerCredit = `<div class="developer-credit"><span class="app-version">Versión ${escapeHtml(APP_VERSION)}</span><span class="developer-name">Y.R.N Soluciones Software</span><a class="developer-cta" href="https://wa.me/5491135195674" target="_blank" rel="noopener">¿Necesitás una app?</a><a class="developer-whatsapp" href="https://wa.me/5491135195674" target="_blank" rel="noopener" aria-label="Contactar por WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c0 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg></a></div>`;
    const moreInfo = Object.entries(info).filter(([key]) => !['shops', 'catering', 'notes', 'world'].includes(key));
    $('#moreList').innerHTML = moreInfo.map(([key, value]) => `<button class="more-row" data-info="${key}">${infoIcon(key)}<span><strong>${escapeHtml(value[0])}</strong><small>${escapeHtml(value[1])}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`).join('') + offline + update + rateApp + officialWebsite + developerCredit;
    document.querySelectorAll('.developer-name').forEach((node) => {
      node.innerHTML = `<img src="${developerLogoAssetUrl}" alt="waien studio" width="520" height="290" loading="lazy" decoding="async"><span class="developer-label"><strong>Waien</strong> Studio</span>`;
    });
    document.querySelectorAll('.developer-cta, .developer-whatsapp').forEach((link) => { link.href = developerWhatsApp; });
    // Toda la firma de Waien Studio funciona como un único acceso a WhatsApp;
    // el ícono conserva su enlace propio, pero logo y texto también responden.
    document.querySelectorAll('.developer-credit').forEach((credit) => {
      credit.setAttribute('role', 'link');
      credit.setAttribute('tabindex', '0');
      const openDeveloperWhatsApp = (event) => {
        if (event.target.closest('a')) return;
        event.preventDefault();
        window.open(developerWhatsApp, '_blank', 'noopener,noreferrer');
      };
      credit.addEventListener('click', openDeveloperWhatsApp);
      credit.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target.closest('a')) return;
        event.preventDefault();
        window.open(developerWhatsApp, '_blank', 'noopener,noreferrer');
      });
    });
    infoNoticeKeys.forEach((key) => updateInfoNotice(key));
    updateTabletResourceSelection();
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
      const totalLabel = totalCount().toLocaleString('es-AR');
      const currentMessage = syncState.running
        ? 'Actualizando…'
        : syncState.error
          ? ($('#syncMessage')?.textContent || 'Sin cambios verificados')
          : lastSyncMessage();
      const currentTone = syncState.error ? 'bad' : syncState.running ? 'busy' : syncState.last ? 'ok' : '';
      const syncDisabled = syncRequest ? ' disabled aria-busy="true"' : '';
      $('#readerContent').innerHTML = `<div class="catalog-info-sync"><button class="sync update-row catalog-info-sync-row ${currentTone}" data-info-sync type="button" aria-live="polite" aria-label="Actualizar catálogo"${syncDisabled}><i></i><span><strong>Última sincronización</strong><small data-info-sync-message>${escapeHtml(currentMessage)}</small></span><b aria-hidden="true"><svg class="refresh-icon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-4L3 9m0 0V4m0 5h5M4 13a8 8 0 0 0 14.9 4L21 15m0 0v5m0-5h-5"/></svg></b></button></div><div class="catalog-total-info"><span>Productos en el catálogo</span><strong>${escapeHtml(totalLabel)}</strong></div><div class="catalog-update-card"><span class="catalog-update-label">Última actualización</span><strong>${escapeHtml(date)}</strong><small>${escapeHtml(note)}</small></div>`;
    };
    renderDate(officialUpdateMessage());
    try {
      const officialDate = await refreshOfficialUpdateDate();
      if (officialDate) renderDate(officialDate);
    } catch (_) {
      // La fecha empaquetada sigue siendo válida aunque la actualización en
      // segundo plano no tenga conexión.
    }
  }

  let categoryInfoOpener = null;
  function openCategoryInfo(key, opener) {
    const info = managedCategoryInfo(key);
    if (!info) return;
    logAnalyticsEvent('content_open', {kind:'category'});
    categoryInfoOpener = opener;
    $('#categoryInfoTitle').textContent = info.title;
    $('#categoryInfoText').innerHTML = info.paragraphs.map(text => `<p>${escapeHtml(text)}</p>`).join('');
    $('#categoryInfoOverlay').hidden = false;
    updateModalLock();
    $('#closeCategoryInfo').focus();
  }
  function closeCategoryInfo() {
    $('#categoryInfoOverlay').hidden = true;
    updateModalLock();
    if (categoryInfoOpener?.isConnected) categoryInfoOpener.focus();
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

  function clampImagePosition() {
    const image = $('#expandedImage');
    const frame = image?.parentElement;
    if (!image || !frame) return;
    const maxX = Math.max(0, (image.offsetWidth * imageGesture.scale - frame.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * imageGesture.scale - frame.clientHeight) / 2);
    imageGesture.x = Math.max(-maxX, Math.min(maxX, imageGesture.x));
    imageGesture.y = Math.max(-maxY, Math.min(maxY, imageGesture.y));
  }

  function applyImageZoom(animate = false) {
    const image = $('#expandedImage');
    if (!image) return;
    clampImagePosition();
    image.classList.toggle('zoom-animate', animate);
    $('#imageOverlay')?.classList.toggle('is-zoomed', imageGesture.scale > 1.02);
    image.style.transform = `translate3d(${imageGesture.x}px, ${imageGesture.y}px, 0) scale(${imageGesture.scale})`;
    if (animate) window.setTimeout(() => image.classList.remove('zoom-animate'), 260);
  }

  function zoomImageAt(scale, clientX, clientY, animate = true) {
    const image = $('#expandedImage');
    const frame = image?.parentElement?.getBoundingClientRect();
    if (!image || !frame) return;
    const nextScale = Math.min(4, Math.max(1, scale));
    const centerX = frame.left + frame.width / 2;
    const centerY = frame.top + frame.height / 2;
    const ratio = nextScale / imageGesture.scale;
    imageGesture.x = clientX - centerX - (clientX - centerX - imageGesture.x) * ratio;
    imageGesture.y = clientY - centerY - (clientY - centerY - imageGesture.y) * ratio;
    imageGesture.scale = nextScale;
    if (nextScale === 1) { imageGesture.x = 0; imageGesture.y = 0; }
    applyImageZoom(animate);
  }

  function resetImageZoom(animate = false) {
    imageGesture.scale = 1;
    imageGesture.x = 0;
    imageGesture.y = 0;
    imageGesture.pointers.clear();
    imageGesture.startDistance = 0;
    imageGesture.startCenter = null;
    imageGesture.pinchPoint = null;
    imageGesture.moved = false;
    imageGesture.hadMultiTouch = false;
    imageGesture.tapStart = null;
    imageGesture.lastTap = null;
    if ($('#expandedImage')) applyImageZoom(animate);
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
    const heroImage = $('#cardImage');
    heroImage.classList.add('asset-loading');
    heroImage.classList.remove('asset-ready', 'asset-error');
    heroImage.src = card.image;
    heroImage.alt = card.alt || card.title;
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

  function closeInfoCard() { $('#cardOverlay').hidden = true; $('#cardImage').src = ''; $('#cardImage').classList.remove('asset-loading', 'asset-ready', 'asset-error'); updateModalLock(); }

  function stopCamera() {
    cameraStartToken += 1;
    if (cameraFallbackTimer) window.clearTimeout(cameraFallbackTimer);
    cameraFallbackTimer = 0;
    if (scanFrame) cancelAnimationFrame(scanFrame);
    scanFrame = 0;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    $('#camera').srcObject = null;
  }

  async function startCamera() {
    const token = ++cameraStartToken;
    const video = $('#camera');
    const showManualFallback = (message = 'No pudimos abrir la cámara. Ingresá el EAN o UPC.') => {
      if (token !== cameraStartToken || $('#scanOverlay').hidden) return;
      stopCamera();
      openWebScanner(message, false);
      window.setTimeout(() => { if (!$('#scanOverlay').hidden && $('#scanOverlay').classList.contains('manual-only')) $('#barcode').focus(); }, 40);
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showManualFallback('Este dispositivo no permite usar la cámara. Ingresá el EAN o UPC.');
      return;
    }
    cameraFallbackTimer = window.setTimeout(() => showManualFallback('La cámara tardó demasiado en iniciar. Ingresá el EAN o UPC.'), 7000);
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false});
      if (token !== cameraStartToken || $('#scanOverlay').hidden) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = nextStream;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => { if (settled) return; settled = true; video.removeEventListener('loadedmetadata', finish); resolve(); };
          video.addEventListener('loadedmetadata', finish, {once:true});
          window.setTimeout(finish, 2200);
        });
      }
      if (token !== cameraStartToken || $('#scanOverlay').hidden) return;
      if (!video.videoWidth || !video.videoHeight) throw new Error('camera-preview-unavailable');
      const frameAvailable = await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => { if (settled) return; settled = true; resolve(value); };
        if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(() => finish(true));
        const startedAt = performance.now();
        const poll = () => {
          if (video.currentTime > 0) { finish(true); return; }
          if (performance.now() - startedAt >= 1800) { finish(false); return; }
          window.setTimeout(poll, 120);
        };
        poll();
      });
      if (!frameAvailable) throw new Error('camera-frame-unavailable');
      if (cameraFallbackTimer) window.clearTimeout(cameraFallbackTimer);
      cameraFallbackTimer = 0;
      $('#scanOverlay').classList.remove('manual-only');
      $('#scanMessage').textContent = 'Alineá el código dentro del recuadro.';
      if (!('BarcodeDetector' in window)) {
        showManualFallback('Este dispositivo no ofrece lectura automática. Ingresá el EAN o UPC.');
        return;
      }
      const requestedFormats = ['ean_13','ean_8','upc_a','upc_e','itf14','code_128','codabar'];
      const supportedFormats = BarcodeDetector.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : requestedFormats;
      const formats = requestedFormats.filter((format) => supportedFormats.includes(format));
      const detector = new BarcodeDetector(formats.length ? {formats} : undefined);
      const tick = async () => { if (!stream) return; try { const codes = await detector.detect($('#camera')); if (codes[0] && codes[0].rawValue) { stopCamera(); resolveBarcode(codes[0].rawValue); return; } } catch (_) {} scanFrame = requestAnimationFrame(tick); };
      scanFrame = requestAnimationFrame(tick);
    } catch (_) {
      if (cameraFallbackTimer) window.clearTimeout(cameraFallbackTimer);
      cameraFallbackTimer = 0;
      showManualFallback('No pudimos abrir la cámara. Ingresá el EAN o UPC.');
    }
  }
  window.__ihtCameraReady = startCamera;
  window.__ihtCameraDenied = () => closeScanner();

  function openWebScanner(message = 'Alineá el código dentro del recuadro.', useCamera = true) {
    const cameraAvailable = useCamera && Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
    const scannerMessage = cameraAvailable ? 'Iniciando cámara…' : (message === 'Alineá el código dentro del recuadro.' ? 'No pudimos abrir la cámara. Ingresá el EAN o UPC.' : message);
    pendingScanProduct = null;
    $('#scanMessage').textContent = scannerMessage;
    $('#scanOverlay').hidden = false;
    $('#scanOverlay').classList.remove('scan-result');
    // Mientras la cámara arranca mostramos siempre una salida manual legible;
    // solo volvemos al visor oscuro cuando el preview ya está confirmado.
    $('#scanOverlay').classList.add('manual-only');
    $('#camera').hidden = false;
    $('.frame').hidden = false;
    $('#barcode').value = '';
    updateModalLock();
    if (cameraAvailable) startCamera(); else {
      stopCamera();
      window.setTimeout(() => { if (!$('#scanOverlay').hidden && $('#scanOverlay').classList.contains('manual-only')) $('#barcode').focus(); }, 40);
    }
  }

  async function openScanner() {
    logAnalyticsEvent('scanner_open');
    if (!Capacitor.isNativePlatform()) {
      openWebScanner();
      return;
    }
    try {
      if (Capacitor.getPlatform() === 'android') {
        const permission = await ScannerPermissions.requestCamera();
        if (!permission.granted) {
          logAnalyticsEvent('scanner_result', {outcome:'permission_denied'});
          openWebScanner('La cámara no tiene permiso. Podés habilitarla en Ajustes o ingresar el EAN o UPC.', false);
          return;
        }
      }
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
        scanOrientation:CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
        cancelButtonAccessibilityLabel:'Cancelar escaneo',
        torchButtonOnAccessibilityLabel:'Apagar linterna',
        torchButtonOffAccessibilityLabel:'Encender linterna',
        android:{scanningLibrary:CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT}
      });
      if (result?.ScanResult) await resolveBarcode(result.ScanResult);
      else logAnalyticsEvent('scanner_result', {outcome:'cancelled'});
    } catch (error) {
      const cancellation = `${error?.code || ''} ${error?.message || error || ''}`;
      if (/0006|cancel(?:led|ado|aci[oó]n)?/i.test(cancellation)) { logAnalyticsEvent('scanner_result', {outcome:'cancelled'}); return; }
      logAnalyticsEvent('scanner_result', {outcome:'error'});
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
    // Some readers return the same retail code as a zero-padded GTIN-14.
    if (code.length === 14 && code.startsWith('0')) candidates.push(code.slice(1));
    return [...new Set(candidates)];
  }

  function findProductsByBarcode(value) {
    const candidates = barcodeCandidates(value);
    if (!candidates.length) return [];
    const directMatches = products.filter((product) => {
      const barcode = canonicalBarcode(product.barcode);
      return barcode && barcodeCandidates(barcode).some((candidate) => candidates.includes(candidate));
    });
    if (directMatches.length) return directMatches;
    const associatedUrls = new Set(candidates.map((candidate) => barcodeAssociations[candidate]?.url).filter(Boolean));
    return products.filter((product) => associatedUrls.has(product.url));
  }

  const scanIdentityStopWords = new Set(['con', 'para', 'del', 'una', 'uno', 'de', 'el', 'la', 'los', 'las', 'and', 'the', 'with', 'sabor', 'flavor', 'flavour', 'taste', 'bebida', 'drink', 'beverage', 'producto', 'product', 'marca', 'brand']);
  const scanIdentityAliases = new Map([
    ['grape', 'uva'], ['grapes', 'uva'], ['uva', 'uva'],
    ['orange', 'naranja'], ['naranja', 'naranja'], ['laranja', 'naranja'],
    ['apple', 'manzana'], ['apples', 'manzana'], ['manzana', 'manzana'],
    ['lemon', 'limon'], ['limon', 'limon'], ['lime', 'lima'], ['lima', 'lima'],
    ['peach', 'durazno'], ['durazno', 'durazno'], ['zero', 'zero'],
    ['berry', 'berry'], ['berries', 'berry'], ['frutilla', 'frutilla'], ['strawberry', 'frutilla'],
    ['barra', 'barrita'], ['bar', 'barrita'], ['bars', 'barrita'], ['barrita', 'barrita']
  ]);
  const scanIdentityTokens = (value) => normalize(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => scanIdentityAliases.get(token) || token)
    .filter((token) => token.length > 2 && !scanIdentityStopWords.has(token));

  function findProductsByIdentity(identity) {
    const nameTokens = [...new Set(scanIdentityTokens(identity?.name))];
    const brandTokens = [...new Set(scanIdentityTokens(identity?.brand))];
    if (nameTokens.length < 1 || (nameTokens.length === 1 && !brandTokens.length)) return [];
    const identityTokens = [...new Set([...nameTokens, ...brandTokens])];
    const variantTokens = nameTokens.filter((token) => !brandTokens.includes(token));
    return products
      .map((product) => {
        const productText = `${product.title || ''} ${product.brand || ''}`;
        const productTokens = new Set(scanIdentityTokens(productText));
        const matchedNameTokens = nameTokens.filter((token) => productTokens.has(token));
        const matchedBrandTokens = brandTokens.filter((token) => productTokens.has(token));
        const matchedVariantTokens = variantTokens.filter((token) => productTokens.has(token));
        const allIdentityTokensMatch = identityTokens.length > 1 && identityTokens.every((token) => productTokens.has(token));
        const brandMatch = brandTokens.length > 0 && brandTokens.every((token) => productTokens.has(token));
        const exactNameMatch = nameTokens.length > 1 && nameTokens.every((token) => productTokens.has(token));
        const score = matchedNameTokens.length * 2 + matchedBrandTokens.length * 2 + matchedVariantTokens.length * 2
          + (brandMatch ? 3 : 0) + (exactNameMatch ? 2 : 0) + (allIdentityTokensMatch ? 2 : 0);
        return {product, score, brandMatch, exactNameMatch, matchedVariantTokens};
      })
      .filter(({score, brandMatch, matchedVariantTokens, exactNameMatch}) => {
        const hasDiscriminatingVariant = matchedVariantTokens.length > 0 || exactNameMatch;
        const minimumScore = brandTokens.length ? 7 : Math.max(4, nameTokens.length * 2);
        return hasDiscriminatingVariant && score >= minimumScore && (brandMatch || exactNameMatch);
      })
      .sort((a, b) => b.score - a.score || Number(b.exactNameMatch) - Number(a.exactNameMatch));
  }

  function findProductByIdentity(identity) {
    const matches = findProductsByIdentity(identity);
    const best = matches[0];
    if (!best) return null;
    const sameScore = matches.filter(({score, brandMatch}) => score === best.score && Boolean(brandMatch) === Boolean(best.brandMatch));
    return sameScore.length === 1 ? best.product : null;
  }

  function findClosestProductsByIdentity(identity, limit = 4) {
    const nameTokens = [...new Set(scanIdentityTokens(identity?.name))];
    const brandTokens = [...new Set(scanIdentityTokens(identity?.brand))];
    const identityCategory = scanCategoryPath(identity)[0] || '';
    if (!nameTokens.length && !brandTokens.length) return [];
    return products.map((product) => {
      const productTokens = new Set(scanIdentityTokens(`${product.title || ''} ${product.brand || ''}`));
      const matchedNameTokens = nameTokens.filter((token) => productTokens.has(token));
      const matchedBrandTokens = brandTokens.filter((token) => productTokens.has(token));
      const productCategory = productCategoryPath(product)[0] || '';
      const sameCategory = Boolean(identityCategory && productCategory && identityCategory === productCategory);
      const brandCoverage = brandTokens.length ? matchedBrandTokens.length / brandTokens.length : 0;
      const nameCoverage = nameTokens.length ? matchedNameTokens.length / nameTokens.length : 0;
      const score = brandCoverage * 6 + nameCoverage * 4 + (sameCategory ? 1 : 0);
      const credible = brandTokens.length
        ? matchedBrandTokens.length > 0 && matchedNameTokens.length > 0
        : matchedNameTokens.length >= 2 && sameCategory;
      return {product, score, credible, brandCoverage, nameCoverage};
    })
      .filter(({credible}) => credible)
      .sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title, 'es'))
      .slice(0, limit);
  }

  function rememberBarcodeAssociation(code, product, identity) {
    const normalizedCode = String(code || '').replace(/\D/g, '');
    if (!normalizedCode || !product?.url) return;
    barcodeCandidates(normalizedCode).forEach((candidate) => {
      barcodeAssociations[candidate] = {
        url: product.url,
        label: product.title,
        source: 'Open Food Facts · coincidencia inequívoca',
        savedAt: Date.now(),
        identity: clean(`${identity?.name || ''} ${identity?.brand || ''}`)
      };
    });
    localStorage.setItem('iht_barcode_associations', JSON.stringify(barcodeAssociations));
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
      const url = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}?fields=code,product_name,product_name_es,brands,categories,categories_tags`;
      const headers = {Accept:'application/json'};
      const response = Capacitor.isNativePlatform()
        ? await CapacitorHttp.get({url, headers:{...headers, 'User-Agent':`IahadutHaTora/${APP_VERSION} (https://vaad.ar)`}, connectTimeout:7000, readTimeout:7000})
        : await fetch(url, {headers});
      const data = response?.data || await response.json();
      const returnedCode = String(data?.product?.code || data?.code || '').replace(/\D/g, '');
      if (data?.result?.id !== 'product_found' || !data?.product || returnedCode !== code) return null;
      const name = clean(data.product.product_name_es || data.product.product_name);
      const brand = clean(String(data.product.brands || '').split(',')[0]);
      const categoriesText = clean(data.product.categories || (Array.isArray(data.product.categories_tags) ? data.product.categories_tags.join(' ') : ''));
      const categorySource = `${name} ${brand} ${categoriesText}`;
      const categoryPath = scanCategoryPath({name, brand, categories:categoriesText, categoryPath:productCategoryPath({title:categorySource, description:''})});
      return {name, brand, categories:categoriesText, categoryPath, normalizedName:normalize(name), normalizedBrand:normalize(brand)};
    } catch (_) { return null; }
  }

  function showScanResult(code, product = null, identity = null, exactMatches = [], identityMatches = []) {
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
    } else if (identityMatches.length > 1) {
      const matchesMarkup = identityMatches.map(({product}) => `<button class="scan-alternative" type="button" data-scan-alternative="${escapeHtml(product.url)}"><span>${escapeHtml(product.title)}</span></button>`).join('');
      $('#scanMessage').innerHTML = `<span class="scan-result-status found">Producto identificado</span><strong class="scan-result-title">Elegí la presentación correcta</strong><small class="scan-result-code">Código escaneado: ${escapeHtml(code)}</small><span class="scan-result-note">Encontramos varias fichas compatibles con la información del código.</span><div class="scan-alternatives"><div class="scan-alternatives-grid">${matchesMarkup}</div></div><button class="scan-result-action secondary" type="button" data-scan-again>Escanear otro producto</button>`;
    } else {
      const identified = externalName ? `<strong class="scan-result-title">${escapeHtml(externalName)}${externalBrand ? ` · ${escapeHtml(externalBrand)}` : ''}</strong>` : '';
      const closestMatches = findClosestProductsByIdentity(identity);
      const alternatives = closestMatches.length ? closestMatches.map(({product}) => product) : findScanAlternatives(identity, code);
      const alternativesHeading = closestMatches.length ? '¿Es alguno de estos productos del catálogo?' : 'Te sugerimos productos de esta categoría';
      const alternativesNote = closestMatches.length ? '<span class="scan-result-note">Son posibles coincidencias por nombre o marca; elegí una para ver su ficha. Esto no confirma por sí solo el código.</span>' : '';
      const alternativesMarkup = alternatives.length ? `<div class="scan-alternatives"><strong>${alternativesHeading}</strong>${alternativesNote}<div class="scan-alternatives-grid">${alternatives.map((item) => `<button class="scan-alternative" type="button" data-scan-alternative="${escapeHtml(item.url)}">${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ''}<span>${escapeHtml(item.title)}</span></button>`).join('')}</div></div>` : '';
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

  function showInvalidBarcode(code) {
    pendingScanProduct = null;
    stopCamera();
    $('#scanOverlay').hidden = false;
    $('#scanOverlay').classList.add('scan-result', 'manual-only');
    $('#camera').hidden = true;
    $('.frame').hidden = true;
    $('#scanMessage').innerHTML = `<span class="scan-result-status not-found">Lectura incompleta</span><strong class="scan-result-title">No se leyó un código de producto válido</strong><small class="scan-result-code">Código leído: ${escapeHtml(code)}</small><span class="scan-result-note">Alineá el código completo dentro del recuadro. Para productos del catálogo aceptamos EAN/UPC válidos.</span><button class="scan-result-action secondary" type="button" data-scan-again>Volver a escanear</button>`;
    $('#barcode').value = code;
    updateModalLock();
  }

  async function resolveBarcode(raw) {
    const code = String(raw || '').replace(/\D/g,'');
    if (!code) return;
    // The native scanner can decode non-retail numeric formats (or partial
    // internal codes). Only query the catalog / Open Food Facts for a complete,
    // checksum-valid GTIN so a short read cannot be mistaken for a product.
    if (!validGtin(code)) {
      logAnalyticsEvent('scanner_result', {outcome:'invalid'});
      showInvalidBarcode(code);
      return;
    }
    stopCamera();
    const exactMatches = findProductsByBarcode(code);
    if (exactMatches.length === 1) {
      logAnalyticsEvent('scanner_result', {outcome:'exact'});
      closeScanner();
      openDetail(exactMatches[0].url, {fromScan:true});
      return;
    }
    if (exactMatches.length > 1) {
      logAnalyticsEvent('scanner_result', {outcome:'multiple'});
      showScanResult(code, null, null, exactMatches);
      return;
    }
    showScanLoading(code);
    const identity = await barcodeIdentity(code);
    const identityMatches = findProductsByIdentity(identity);
    // Open Food Facts is only a fallback when the local catalog has no code.
    // We auto-open only a unique, high-confidence identity match; ambiguous
    // variants remain explicit so a scan can never open the wrong product.
    const matchedProduct = identityMatches.length === 1 ? identityMatches[0].product : findProductByIdentity(identity);
    if (matchedProduct) {
      logAnalyticsEvent('scanner_result', {outcome:'identified'});
      rememberBarcodeAssociation(code, matchedProduct, identity);
      closeScanner();
      openDetail(matchedProduct.url, {fromScan:true});
      return;
    }
    logAnalyticsEvent('scanner_result', {outcome:identityMatches.length ? 'multiple' : 'not_found'});
    showScanResult(code, null, identity, [], identityMatches);
  }

  function goBackTaxonomy() {
    const parent = activeCategoryPath.slice(0, -1);
    if (parent.length) openTaxonomyPath(parent, {restoreScroll:true});
    else if (taxonomyReturnView === 'searchView') restoreSearchScreen();
    else { renderCategoryDirectory(); showView('categoryDirectoryView', {restoreScroll:true}); }
  }

  function goBackReader() {
    const target = readerHistory.pop();
    if (target?.type === 'info') { openInfo(target.key, {fromHistory:true}); return; }
    currentInfoKey = '';
    showView(target?.id || 'moreView');
  }

  async function handleMobileBack() {
    if (!$('#categoryInfoOverlay').hidden) { closeCategoryInfo(); return; }
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
    if (Capacitor.getPlatform() === 'android') await App.exitApp();
  }

  App.addListener('backButton', handleMobileBack).catch(() => {});

  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() === 'android') PlayStoreUpdates.addListener('updateDownloaded', () => {
      playUpdateState = {...playUpdateState, downloaded:true};
      renderHomeAppUpdate();
      renderMore();
    }).catch(() => {});
    App.addListener('appStateChange', ({isActive}) => {
      if (!isActive) return;
      void refreshPushRevocations();
      void syncAlertsInbox(document.querySelector('.view.active')?.id === 'alertsView');
      void applyNativeCatalogCacheIfNewer();
      refreshPlayUpdate();
      void setupPushNotifications(false);
    }).catch(() => {});
  }

  document.querySelectorAll('.nav').forEach((button) => button.onclick = () => button.dataset.view === 'homeView' ? returnHome() : button.dataset.view === 'searchView' ? openSearchScreen() : showView(button.dataset.view));
  document.addEventListener('pointerdown', (event) => {
    const regionButton = event.target.closest('#searchView .region-switch [data-region]');
    if (regionButton && document.activeElement === $('#query')) event.preventDefault();
  });
  // Includes dynamically loaded official contacts and links inside notifications.
  const prepareWhatsAppContact = (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    if (link.id !== 'shareAppWhatsApp' && event.type === 'click' && /^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//.test(link.href)) logAnalyticsEvent('contact_open', {screen:document.querySelector('.view.active')?.id});
    if (link.id === 'shareAppWhatsApp') {
      if (event.type === 'click') logAnalyticsEvent('app_share', {channel:'whatsapp'});
      return;
    }
    const product = link.closest('#detailView') && currentProduct ? currentProduct.title : '';
    const href = appWhatsAppLink(link.href, {product});
    if (href !== link.href) link.href = href;
  };
  document.addEventListener('click', prepareWhatsAppContact, true);
  document.addEventListener('auxclick', prepareWhatsAppContact, true);
  document.addEventListener('contextmenu', prepareWhatsAppContact, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-offline-delete]')) {
      void removeOfflineDownload();
      return;
    }
    if (event.target.closest('[data-offline-pause]')) {
      // Explicit pause cancels auto-resume; hiding the app does not.
      setOfflineWifiWait(false);
      void offlineDownload.pause();
      logAnalyticsEvent('offline_download', {outcome:'paused', automatic:0});
      return;
    }
    if (event.target.closest('[data-offline-download]')) {
      startOfflineDownload();
      return;
    }
    const scanOpenButton = event.target.closest('[data-scan-open]');
    if (scanOpenButton) {
      const product = pendingScanProduct;
      closeScanner();
      if (product) openDetail(product.url);
      return;
    }
    const scanAgainButton = event.target.closest('[data-scan-again]');
    if (scanAgainButton) { openScanner(); return; }
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
    const brandButton = event.target.closest('[data-search-brand]');
    if (brandButton) {
      if (brandButton.classList.contains('trusted-brand-link')) {
        if (brandMarqueeDrag.suppressClick() && event.detail !== 0) return;
        openSearchScreen();
        window.clearTimeout(searchFocusTimer);
        $('#query').blur();
        selectedRegion = 'all';
        selectedCategory = 'all';
        favoriteOnly = false;
      }
      window.clearTimeout(searchTimer);
      logAnalyticsEvent('catalog_filter', {kind:'brand'});
      searchBrand = brandButton.dataset.searchBrand;
      $('#query').value = searchBrand;
      updateSearchScanAction(true);
      $('.bottom-nav').classList.add('has-query');
      renderResults(searchBrand);
      return;
    }
    const exploreCategories = event.target.closest('[data-explore-categories]');
    if (exploreCategories) { openCategoryDirectoryFromHome(); return; }
    const taxonomyButton = event.target.closest('[data-taxonomy-path]');
    if (taxonomyButton) { logAnalyticsEvent('catalog_filter', {kind:'category'}); openTaxonomyPath(JSON.parse(decodeURIComponent(taxonomyButton.dataset.taxonomyPath))); return; }
    const regionButton = event.target.closest('[data-region]');
    const searchRegionButton = event.target.closest('[data-search-region]');
    if (searchRegionButton) { showSearchRegion(searchRegionButton.dataset.searchRegion); return; }
    if (regionButton) {
      const keepSearchFocus = document.activeElement === $('#query');
      selectedRegion = regionButton.dataset.region;
      logAnalyticsEvent('catalog_filter', {kind:'region', region:selectedRegion});
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
    if (retiredButton) { timelineKind = 'baja'; showView('timelineView'); return; }
    const allChangesButton = event.target.closest('[data-open-all-changes]');
    if (allChangesButton) { timelineKind = 'all'; renderCatalogTimeline(undefined, '', timelineKind); return; }
    const timelineButton = event.target.closest('[data-open-timeline]');
    if (timelineButton) { timelineKind = timelineButton.dataset.openTimeline === 'alta' ? 'alta' : 'all'; showView('timelineView'); return; }
    const categoryButton = event.target.closest('[data-category]'); if (categoryButton) { logAnalyticsEvent('catalog_filter', {kind:'category'}); selectedCategory = categoryButton.dataset.category; favoriteOnly = false; showView('searchView'); renderResults(''); }
    const productButton = event.target.closest('[data-product]'); if (productButton && !event.target.closest('[data-favorite]')) openDetail(productButton.dataset.product, {fromSearch:Boolean(productButton.closest('#productList'))});
    const favoriteButton = event.target.closest('[data-favorite]'); if (favoriteButton) { event.stopPropagation(); toggleFavorite(favoriteButton.dataset.favorite); }
    const recentButton = event.target.closest('[data-recent]'); if (recentButton) { $('#query').value = recentButton.dataset.recent; renderResults(recentButton.dataset.recent); }
    const featuredButton = event.target.closest('[data-featured-step]');
    if (featuredButton) {
      const viewport = $('#recentProducts').parentElement;
      const metrics = recentCarouselMetrics(viewport);
      if (metrics) {
        viewport.scrollTo({left: viewport.scrollLeft + Number(featuredButton.dataset.featuredStep) * metrics.step, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
        scheduleRecentCarouselNormalize(viewport, 720);
      }
      return;
    }
    const infoButton = event.target.closest('[data-info]'); if (infoButton) { logAnalyticsEvent('content_open', {kind:'info'}); openInfo(infoButton.dataset.info); }
    const categoryInfoButton = event.target.closest('[data-category-info]'); if (categoryInfoButton) { openCategoryInfo(categoryInfoButton.dataset.categoryInfo, categoryInfoButton); return; }
    const savedButton = event.target.closest('[data-saved]'); if (savedButton) { openSavedScreen(); return; }
    const clearHistoryButton = event.target.closest('[data-clear-history]'); if (clearHistoryButton) { if (!recent.length || window.confirm('¿Borrar el historial de búsquedas?')) { recent = []; localStorage.removeItem('iht_recent'); renderMore(); renderSearchCategories(); } }
    const notificationButton = event.target.closest('[data-enable-notifications]');
    if (notificationButton) {
      logAnalyticsEvent('notification_setting', {outcome:'request'});
      setupPushNotifications(true).then(status => { logAnalyticsEvent('notification_setting', {outcome:status}); renderPushNotifications(); renderMore(); }); return;
    }
    const disableNotificationButton = event.target.closest('[data-disable-notifications]');
    if (disableNotificationButton) { disablePushNotifications(); return; }
    const openAlertsButton = event.target.closest('[data-open-alerts]');
    if (openAlertsButton) { showView('alertsView'); return; }
    const openPlayStoreButton = event.target.closest('[data-open-play-store]');
    if (openPlayStoreButton) { logAnalyticsEvent('store_open', {purpose:'store'}); openExternal(remoteControl.update_url || appInstallUrl); return; }
    const rateAppButton = event.target.closest('[data-rate-app]');
    if (rateAppButton) { logAnalyticsEvent('store_open', {purpose:'rate'}); event.preventDefault(); openExternal(distributionLinks.rate); return; }
    const updateButton = event.target.closest('[data-app-update]');
    if (updateButton) {
      logAnalyticsEvent('store_open', {purpose:'update'});
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
    const infoSyncButton = event.target.closest('[data-info-sync]');
    if (infoSyncButton) {
      if (!syncRequest) {
        logAnalyticsEvent('catalog_refresh', {outcome:'attempt'});
        syncAndPreload(true).then(() => logAnalyticsEvent('catalog_refresh', {outcome:syncState.error ? 'error' : 'finished'})).catch(() => logAnalyticsEvent('catalog_refresh', {outcome:'error'}));
      }
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
    if (expandedImage) {
      logAnalyticsEvent('content_open', {kind:'image'}); event.preventDefault(); openImage(expandedImage.dataset.expandedImage, expandedImage.dataset.expandedCaption || 'Nota Kashrut'); return; }
    if (cardButton && window.__ihtInfoCards) { logAnalyticsEvent('content_open', {kind:'card'}); event.preventDefault(); event.stopPropagation(); openInfoCard(window.__ihtInfoCards[Number(cardButton.dataset.infoCard)]); return; }
    if (photo) { logAnalyticsEvent('content_open', {kind:'image'}); event.preventDefault(); event.stopPropagation(); openImage(photo.currentSrc || photo.src, photo.alt || ''); }
  });
  const dismissKeyboard = (input) => { input?.blur(); window.scrollTo({top: 0, behavior: 'smooth'}); };
  $('#homeForm').onsubmit = (event) => { event.preventDefault(); dismissKeyboard($('#homeQuery')); doSearch($('#homeQuery'), true); };
  $('#searchForm').onsubmit = (event) => { event.preventDefault(); dismissKeyboard($('#query')); doSearch($('#query')); };
  $('#homeClear').onclick = () => { $('#homeQuery').value = ''; $('#homeClear').hidden = true; };
  $('#clear').onclick = () => { window.clearTimeout(searchTimer); $('#query').value = ''; updateSearchScanAction(false); $('.bottom-nav').classList.remove('has-query'); $('#clear').hidden = true; $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; $('#query').focus(); startSearchPlaceholders(); };
  $('#detailSave').onclick = () => { if (currentProduct) toggleFavorite(currentProduct.url); };
  $('#detailShare').onclick = shareCurrentProduct;
  $('#shareAppWhatsApp').href = appShareWhatsAppLink();
  $('#homeQuery').addEventListener('input', () => {
    const hasText = Boolean($('#homeQuery').value.trim());
    $('#homeClear').hidden = !$('#homeQuery').value;
    if (hasText) window.clearInterval(homePlaceholderTimer); else startHomePlaceholders();
  });
  $('#query').addEventListener('input', () => {
    searchBrand = '';
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
    if (value) {
      searchTimer = window.setTimeout(() => {
        if (clean($('#query').value) === value) renderResults(value);
      }, 180);
    }
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
  $('#closeCategoryInfo').onclick = closeCategoryInfo;
  $('#categoryInfoOverlay').onclick = event => { if (event.target === $('#categoryInfoOverlay')) closeCategoryInfo(); };
  document.addEventListener('keydown', event => {
    if ($('#categoryInfoOverlay').hidden) return;
    if (event.key === 'Escape') { closeCategoryInfo(); return; }
    if (event.key === 'Tab') {
      const first = $('#closeCategoryInfo');
      const last = first;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  $('#imageOverlay').onclick = (event) => { if (event.target === $('#imageOverlay')) closeImage(); };
  $('#expandedImage').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    $('#expandedImage').setPointerCapture?.(event.pointerId);
    imageGesture.pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
    if (imageGesture.pointers.size === 1) {
      imageGesture.moved = false;
      imageGesture.hadMultiTouch = false;
      imageGesture.tapStart = {x:event.clientX, y:event.clientY, time:performance.now()};
    }
    if (imageGesture.pointers.size === 2) {
      const [a,b] = [...imageGesture.pointers.values()];
      const frame = $('#expandedImage').parentElement.getBoundingClientRect();
      const center = {x:(a.x + b.x) / 2, y:(a.y + b.y) / 2};
      const frameCenter = {x:frame.left + frame.width / 2, y:frame.top + frame.height / 2};
      imageGesture.hadMultiTouch = true;
      imageGesture.startDistance = Math.hypot(a.x - b.x, a.y - b.y);
      imageGesture.startScale = imageGesture.scale;
      imageGesture.startCenter = center;
      imageGesture.pinchPoint = {
        x:(center.x - frameCenter.x - imageGesture.x) / imageGesture.scale,
        y:(center.y - frameCenter.y - imageGesture.y) / imageGesture.scale
      };
    }
  });
  $('#expandedImage').addEventListener('pointermove', (event) => {
    if (!imageGesture.pointers.has(event.pointerId)) return;
    const previous = imageGesture.pointers.get(event.pointerId);
    imageGesture.pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
    if (Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 1.5) imageGesture.moved = true;
    if (imageGesture.pointers.size >= 2) {
      const [a,b] = [...imageGesture.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = {x:(a.x + b.x) / 2, y:(a.y + b.y) / 2};
      const frame = $('#expandedImage').parentElement.getBoundingClientRect();
      const frameCenter = {x:frame.left + frame.width / 2, y:frame.top + frame.height / 2};
      imageGesture.scale = Math.min(4, Math.max(1, imageGesture.startScale * distance / Math.max(1, imageGesture.startDistance)));
      imageGesture.x = center.x - frameCenter.x - imageGesture.pinchPoint.x * imageGesture.scale;
      imageGesture.y = center.y - frameCenter.y - imageGesture.pinchPoint.y * imageGesture.scale;
    } else if (imageGesture.scale > 1) {
      imageGesture.x += event.clientX - previous.x;
      imageGesture.y += event.clientY - previous.y;
    }
    applyImageZoom(false);
  });
  const endImagePointer = (event) => {
    const wasSinglePointer = imageGesture.pointers.size === 1;
    const tap = imageGesture.tapStart;
    imageGesture.pointers.delete(event.pointerId);
    if (imageGesture.pointers.size < 2) imageGesture.startDistance = 0;
    if (imageGesture.scale < 1.03 && (imageGesture.hadMultiTouch || imageGesture.moved)) resetImageZoom(true);
    else applyImageZoom(true);
    if (wasSinglePointer && !imageGesture.hadMultiTouch && !imageGesture.moved && tap && performance.now() - tap.time < 280) {
      const now = performance.now();
      const isDoubleTap = imageGesture.lastTap
        && now - imageGesture.lastTap.time < 320
        && Math.hypot(event.clientX - imageGesture.lastTap.x, event.clientY - imageGesture.lastTap.y) < 36;
      if (isDoubleTap) {
        if (imageGesture.scale > 1.02) resetImageZoom(true);
        else zoomImageAt(2.5, event.clientX, event.clientY, true);
        imageGesture.lastTap = null;
      } else {
        imageGesture.lastTap = {x:event.clientX, y:event.clientY, time:now};
      }
    }
    if (imageGesture.pointers.size === 0) {
      imageGesture.tapStart = null;
      imageGesture.hadMultiTouch = false;
    }
  };
  $('#expandedImage').addEventListener('pointerup', endImagePointer);
  $('#expandedImage').addEventListener('pointercancel', endImagePointer);
  $('#expandedImage').addEventListener('dblclick', (event) => {
    if (event.pointerType === 'touch') return;
    if (imageGesture.scale > 1.02) resetImageZoom(true);
    else zoomImageAt(2.5, event.clientX, event.clientY, true);
  });
  $('#expandedImage').addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomImageAt(imageGesture.scale + (event.deltaY < 0 ? .3 : -.3), event.clientX, event.clientY, false);
  }, {passive:false});
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
  $('#syncStatus').onclick = () => { if (!syncRequest) syncAndPreload(true).catch(() => {}); };
  $('#accessRetry').onclick = () => refreshRemoteControl(true);
  $('#accessUpdate').onclick = () => openExternal(remoteControl.update_url);
  $('#headerNotifications')?.setAttribute('aria-label', 'Abrir Alertas');
  $('#headerNotifications')?.setAttribute('title', 'Alertas');
  tabletLayout.addEventListener('change', updateTabletResources);
  updateTabletResources();
  renderHome(); renderSearchCategories(); infoNoticeKeys.forEach((key) => updateInfoNotice(key));
  window.setTimeout(resumeOfflineWhenOpen, 0);
  refreshAlertBadge();
  syncMessage(lastSyncMessage(), syncState.last ? 'ok' : '');
  // La interfaz queda disponible de inmediato. La precarga completa continúa
  // en segundo plano y comunica su estado en la barra superior.
  preloadInitialProductImages();
  await catalogPresentation.init();
  void refreshCatalogPresentation();
  setInterval(() => {if (!document.hidden && navigator.onLine) void refreshCatalogPresentation();}, 15 * 60 * 1000);
  // El ranking global se consulta como copia estática; nunca usa Firestore por usuario.
  const remoteControlReady = refreshRemoteControl(false);
  void refreshPushRevocations();
  void syncAlertsInbox(false);
  // A withdrawal is not another push: refresh while the inbox is on screen.
  // No polling while hidden, offline, or browsing other sections.
  setInterval(() => {
    if (!document.hidden && pushNotifications.some(item=>alertExpired(item))) {
      pushNotifications=pushNotifications.filter(item=>!alertExpired(item));
      localStorage.setItem('iht_push_notifications',JSON.stringify(pushNotifications));
      if(!pushNotifications.length)setPushNotificationBadge(false);
      if(document.querySelector('.view.active')?.id==='alertsView')renderPushNotifications();
    }
    if (!document.hidden && navigator.onLine) {
      void syncAlertsInbox(document.querySelector('.view.active')?.id === 'alertsView');
      if(document.querySelector('.view.active')?.id === 'alertsView') void restorePushHistory(true);
    }
  }, 30000);
  refreshPlayUpdate();
  setupPushNotifications(false);
  remoteControlReady.catch(() => {});
  startBackgroundPreparation().finally(() => {
    window.setTimeout(scheduleAppPreload, 350);
    syncAndPreload(false).finally(scheduleAppPreload);
  });
  setInterval(() => { if (!document.hidden && navigator.onLine) void syncAndPreload(false); }, 3 * 60 * 60 * 1000);
  setInterval(() => {
    if (!document.hidden && navigator.onLine && document.querySelector('.view.active')?.id === 'searchView') void refreshGlobalRanking();
  }, LIVE_SEARCH_REFRESH_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { void refreshPushRevocations(); void syncAlertsInbox(document.querySelector('.view.active')?.id === 'alertsView'); syncAndPreload(false); refreshRemoteControl(false); refreshPlayUpdate(); }
  });
  window.addEventListener('online', () => { void refreshPushRevocations(); void syncAlertsInbox(document.querySelector('.view.active')?.id === 'alertsView'); syncAndPreload(false).finally(scheduleAppPreload); });
})();
