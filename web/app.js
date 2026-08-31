import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { APP_VERSION, accessDecision, defaultRemoteControl, loadRemoteControl } from './remote-control.js';
import catalogSnapshot from './data/catalog.json';
import contentSnapshot from './data/content.json';

(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const phoneNumbers = (value) => [...new Set((String(value || '').match(/(?:\+?54[\s.-]*9[\s.-]*)?11[\s.-]*(?:\d[\s.-]*){8}/g) || []).map((phone) => phone.replace(/\D/g, '')).map((digits) => digits.startsWith('549') ? digits : digits.startsWith('54') ? `549${digits.slice(2)}` : `549${digits}`))];

  function prepareImage(image) {
    if (!(image instanceof HTMLImageElement) || image.matches('.logo, .whatsapp-logo, .whatsapp-tile img')) return;
    if (image.complete) {
      image.classList.add('asset-ready');
      image.classList.remove('asset-loading');
      return;
    }
    image.classList.add('asset-loading');
  }

  document.addEventListener('load', (event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.target.classList.remove('asset-loading');
    event.target.classList.add('asset-ready');
  }, true);
  document.addEventListener('error', (event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.target.classList.remove('asset-loading');
  }, true);
  const imageObserver = new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    if (node.matches('img')) prepareImage(node);
    node.querySelectorAll?.('img').forEach(prepareImage);
  })));
  imageObserver.observe(document.documentElement, {childList:true, subtree:true});
  document.querySelectorAll('img').forEach(prepareImage);

  let categories = [
    {key:'gondola', name:'Autorizados en góndolas', short:'Góndolas', desc:'Productos de compra habitual', count:467, url:'https://vaad.ar/categoria-producto/productos-autorizados-en-gondola/'},
    {key:'planta', name:'Plantas certificadas', short:'Plantas', desc:'Elaborados bajo certificación', count:309, url:'https://vaad.ar/categoria-producto/productos-de-plantas-certificadas/'},
    {key:'especial', name:'Producción especial', short:'Prod. especial', desc:'Producciones supervisadas', count:63, url:'https://vaad.ar/categoria-producto/produccion-especial-kosher/'},
    {key:'uruguay', name:'Góndola Uruguay', short:'Uruguay', desc:'Productos disponibles en Uruguay', count:201, url:'https://vaad.ar/categoria-producto/productos-de-gondola-en-uruguay/'}
  ];
  const info = {
    shops:['Tiendas certificadas','Establecimientos que ofrecen productos certificados','Consultá los establecimientos que trabajan con productos bajo supervisión y certificación.','https://vaad.ar/tiendas-kosher-certificadas/'],
    catering:['Servicios de catering','Catering certificado y supervisado','Información para eventos y servicios de alimentación que requieren supervisión kosher.','https://vaad.ar/servicios-de-catering/'],
    notes:['Notas Kashrut','Información y contenidos sobre Kashrut','Material de consulta para conocer criterios, procesos y recomendaciones de Kashrut.','https://vaad.ar/notas-kashrut/'],
    world:['Certificaciones mundiales','Certificaciones kosher reconocidas','Información sobre organismos y certificaciones kosher reconocidas internacionalmente.','https://vaad.ar/certificaciones-kosher-mundiales/'],
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
  const storedProducts = readJson('iht_products');
  const bundledProducts = Array.isArray(catalogSnapshot?.products) ? catalogSnapshot.products : [];
  let products = Array.isArray(storedProducts) && storedProducts.length ? storedProducts : bundledProducts.length ? bundledProducts : seed;
  const storedFavorites = readJson('iht_favorites', []);
  const storedRecent = readJson('iht_recent', []);
  let recentProducts = readJson('iht_recent_products', []);
  let favorites = new Set(Array.isArray(storedFavorites) ? storedFavorites : []);
  let recent = Array.isArray(storedRecent) ? storedRecent : [];
  let selectedCategory = 'all';
  let favoriteOnly = false;
  let currentProduct = null;
  let previousView = 'homeView';
  let currentInfoKey = '';
  let readerHistory = [];
  let stream = null;
  let scanFrame = 0;
  let searchTimer = 0;
  let activeCategoryPath = [];
  const RESULT_BATCH_SIZE = 48;
  let visibleProducts = [];
  let visibleProductCursor = 0;
  let visibleProductTarget = null;
  let resultObserver = null;
  let remoteControl = {...defaultRemoteControl, configured:false, checkedAt:0};
  let remoteTaxonomyRules = [];
  let pushListenersReady = false;
  const imageGesture = {scale:1, x:0, y:0, pointers:new Map(), startDistance:0, startScale:1};

  const categoryFor = (key) => categories.find((category) => category.key === key);
  const categoryCount = (category) => products.length > seed.length ? products.filter((product) => product.cat === category.key).length : category.count;
  const categoryIcon = (key) => {
    if (key === 'uruguay') return '<span class="category-icon category-flag"><img src="assets/flag-uruguay.svg" alt="Bandera de Uruguay"></span>';
    const paths = {
      all: '<rect x="5" y="5" width="5" height="5" rx="1"/><rect x="14" y="5" width="5" height="5" rx="1"/><rect x="5" y="14" width="5" height="5" rx="1"/><rect x="14" y="14" width="5" height="5" rx="1"/>',
      gondola: '<path d="M3 5h2l2 10h10l3-7H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
      planta: '<path d="M3 20h18M5 20V10h5v10M10 20V6h5v14M15 20v-7h4v7"/><path d="M12 6V3h3l1 3M7 14h1M12 10h1M17 16h1"/>',
      especial: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>'
    };
    return `<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[key] || paths.all}</svg>`;
  };
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
  const bundledSyncTime = catalogSnapshot?.generatedAt ? Date.parse(catalogSnapshot.generatedAt) : 0;
  const syncState = {running:false, last:localStorage.getItem('iht_last_sync') || (bundledProducts.length && bundledSyncTime ? String(bundledSyncTime) : ''), error:''};
  const CACHE_TTL = 12 * 60 * 60 * 1000;
  const INFO_CACHE_VERSION = 31;
  const INITIAL_PRELOAD_KEY = `iht_initial_preload_${INFO_CACHE_VERSION}`;
  const storedInfoCache = readJson('iht_info_cache');
  const infoCache = storedInfoCache?.version === INFO_CACHE_VERSION ? (storedInfoCache.items || {}) : (contentSnapshot?.info || {});
  const storedCardCache = readJson('iht_card_cache');
  const cardCache = storedCardCache?.version === INFO_CACHE_VERSION ? (storedCardCache.items || {}) : (contentSnapshot?.cards || {});
  const storedProductCache = readJson('iht_product_cache');
  const productCache = storedProductCache?.version === INFO_CACHE_VERSION ? (storedProductCache.items || {}) : {};
  const alertUrl = 'https://vaad.ar/alertas-de-productos/';
  const storedAlertCache = readJson('iht_alert_cache');
  let alertCache = storedAlertCache?.version === INFO_CACHE_VERSION ? storedAlertCache : (contentSnapshot?.alerts ? {version:INFO_CACHE_VERSION, items:contentSnapshot.alerts, fetchedAt:Number(contentSnapshot.generatedAt) || 0} : null);
  let preloadStarted = false;

  function syncMessage(message, tone = '') {
    const status = $('#syncStatus');
    status.className = `sync ${tone}`;
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
    if (!local) return url;
    const parsed = new URL(url);
    return `/vaad-api${parsed.pathname}${parsed.search}`;
  }

  function isFresh(value) {
    return Boolean(value?.fetchedAt && Date.now() - Number(value.fetchedAt) < CACHE_TTL);
  }

  async function fetchText(url) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (Capacitor.isNativePlatform()) {
          const response = await CapacitorHttp.get({url, responseType:'text', headers:{Accept:'text/html'}});
          if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
          return String(response.data || '');
        }
        const response = await fetch(url, {cache:'no-store', headers:{Accept:'text/html'}});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
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
      const rawBarcode = container && (container.getAttribute('data-product-id') || container.getAttribute('data-barcode') || container.querySelector('[data-barcode]')?.getAttribute('data-barcode'));
      const brandMatch = title.match(/marca\s+(.+)$/i);
      entries.push({url, title, brand:brandMatch ? clean(brandMatch[1]) : '', barcode:rawBarcode ? clean(rawBarcode).replace(/\D/g,'') : '', cat:category.key, image:image ? new URL(image, category.url).href : '', description:''});
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
      if (element.type === 'image') { output.push(`<img class="info-photo info-flow-photo" src="${escapeHtml(element.src)}" alt="${escapeHtml(element.alt)}" loading="lazy" onerror="this.remove()">`); continue; }
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
      return `<article class="seal-pair"><button class="seal-image-button" type="button" aria-label="Ampliar sello ${escapeHtml(title || seal.alt)}"><img class="info-photo" src="${escapeHtml(seal.src)}" alt="${escapeHtml(seal.alt || title || 'Sello kosher')}" loading="lazy" onerror="this.closest('.seal-pair').remove()"></button><div>${title ? `<h3>${escapeHtml(title)}</h3>` : ''}<p>${escapeHtml(description)}</p></div></article>`;
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
    const copyData = [bankName, alias ? `Alias: ${alias}` : '', cuit ? `CUIT: ${cuit}` : ''].filter(Boolean).join('\n');
    return `<section class="collaboration-card"><h3>Colaborá con nosotros</h3><p>${escapeHtml(data.text)}</p></section><section class="bank-card"><div class="bank-card-head"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18M5 9v9M9 9v9M15 9v9M19 9v9M3 20h18M12 3l9 4H3z"/></svg><div><small>Datos para transferencia</small><strong>${escapeHtml(bankName)}</strong></div></div>${alias ? `<div class="bank-data-row"><span>Alias</span><strong>${escapeHtml(alias)}</strong></div>` : ''}${cuit ? `<div class="bank-data-row"><span>CUIT</span><strong>${escapeHtml(cuit)}</strong></div>` : ''}<button class="copy-bank-button" type="button" data-copy-bank="${escapeHtml(copyData)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><span>Copiar datos bancarios</span></button></section>`;
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
    const cards = (content.cards || []).map((card, index) => { const flag = countryFlag(card.title); return `<button class="info-card${flag ? ' country-card' : ''}" type="button" data-info-card="${index}"><span class="info-card-media"><img class="info-photo" src="${escapeHtml(card.image)}" alt="" aria-hidden="true" loading="lazy" onerror="this.remove()"></span><span class="info-card-copy"><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(content.cardActionLabel || 'Ver información')}</span></span><span class="info-card-arrow" aria-hidden="true">›</span></button>`; }).join('');
    const images = content.images.map((image) => `<img class="info-photo" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy" onerror="this.remove()">`).join('');
    const actionIcon = (kind) => {
      if (kind === 'whatsapp') return '<svg class="info-action-icon whatsapp-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
      const paths = {email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>', whatsapp:'<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>', map:'<path d="M20 10c0 4.5-8 10-8 10s-8-5.5-8-10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'};
      return `<svg class="info-action-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || paths.email}</svg>`;
    };
    const actions = (content.actions || []).map((action) => `<a class="info-action ${escapeHtml(action.kind || '')}" href="${escapeHtml(action.href)}">${actionIcon(action.kind)}<span>${escapeHtml(action.label)}</span></a>`).join('');
    if (content.section === 'notes' && content.images?.length) {
      const titles = (content.cards || []).map((card) => card.title);
      const flyers = content.images.map((image, index) => `<button class="note-flyer" type="button" data-expanded-image="${escapeHtml(image.src)}" data-expanded-caption="${escapeHtml(titles[index] || image.alt || 'Nota Kashrut')}"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(titles[index] || image.alt || 'Nota Kashrut')}" loading="lazy" onerror="this.closest('.note-flyer').remove()"><span>${escapeHtml(titles[index] || image.alt || 'Nota Kashrut')}</span><small>Ver en pantalla completa</small></button>`).join('');
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
    const main = sealPairs || (cards ? `<div class="info-gallery info-cards${countryCards ? ' country-cards-list' : ''}">${cards}</div>${blocks ? `<div class="info-copy">${blocks}</div>` : ''}` : hasOrderedElements ? `<div class="info-copy info-flow">${ordered}</div>` : `${images ? `<div class="info-gallery seal-gallery">${images}</div>` : ''}${blocks ? `<div class="info-copy">${blocks}</div>` : ''}`);
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

  async function fetchProductContent(product) {
    if (!product?.url) return null;
    if (isFresh(productCache[product.url])) return productCache[product.url];
    const document = new DOMParser().parseFromString(await fetchText(sourceUrl(product.url)), 'text/html');
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
    const result = {blocks, images, category, fetchedAt:Date.now()};
    productCache[product.url] = result;
    localStorage.setItem('iht_product_cache', JSON.stringify({version:INFO_CACHE_VERSION, items:productCache}));
    return result;
  }

  async function fetchAlerts() {
    if (isFresh(alertCache)) {
      updateRecentFromAlerts(alertCache.items);
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
    return result;
  }

  function preloadImage(src) {
    if (!src) return Promise.resolve();
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = image.onerror = resolve;
      image.src = src;
      if (image.complete) resolve();
    });
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

  function initialLoadProgress(percent, visible = true) {
    const progress = $('#initialLoadProgress');
    if (!progress) return;
    progress.hidden = !visible;
    progress.style.setProperty('--initial-load-progress', `${Math.max(4, Math.min(100, percent))}%`);
  }

  async function preloadAppData() {
    if (preloadStarted || !navigator.onLine) return;
    preloadStarted = true;
    const firstPreparation = localStorage.getItem(INITIAL_PRELOAD_KEY) !== 'done';
    if (firstPreparation) initialLoadProgress(4);
    try {
      await fetchAlerts().catch(() => null);
      if (firstPreparation) initialLoadProgress(10);
      const infoKeys = Object.keys(info);
      await runPool(infoKeys, fetchInfoContent, 2, firstPreparation ? (done, total) => initialLoadProgress(10 + (done / total) * 30) : null);
      const cards = Object.values(infoCache).flatMap((content) => content?.cards || []).filter((card) => card.url).filter((card, index, all) => all.findIndex((candidate) => candidate.url === card.url) === index);
      await runPool(cards, fetchCardContent, 3, firstPreparation ? (done, total) => initialLoadProgress(40 + (done / Math.max(total, 1)) * 30) : null);
      const imageUrls = [
        ...recentProducts.map((product) => product.image),
        ...Object.values(infoCache).flatMap((content) => [...(content?.images || []).map((image) => image.src), ...(content?.cards || []).map((card) => card.image)]),
        ...Object.values(cardCache).flatMap((content) => content?.images || []).map((image) => image.src)
      ].filter(Boolean).filter((src, index, all) => all.indexOf(src) === index);
      await runPool(imageUrls, preloadImage, 4, firstPreparation ? (done, total) => initialLoadProgress(70 + (done / Math.max(total, 1)) * 30) : null);
      if (firstPreparation) {
        localStorage.setItem(INITIAL_PRELOAD_KEY, 'done');
        initialLoadProgress(100);
        window.setTimeout(() => initialLoadProgress(100, false), 450);
      }
    } finally {
      preloadStarted = false;
    }
  }

  function scheduleAppPreload() {
    const start = () => preloadAppData();
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, {timeout:1800});
    else window.setTimeout(start, 1200);
  }

  async function syncCatalog(force = false) {
    if (syncState.running) return;
    const twelveHours = 12 * 60 * 60 * 1000;
    const expectedCatalogTotal = categories.reduce((total, category) => total + category.count, 0);
    const minimumCatalogTotal = Math.floor(expectedCatalogTotal * 0.97);
    if (!force && syncState.last && Date.now() - Number(syncState.last) < twelveHours && products.length >= minimumCatalogTotal) return;
    syncState.running = true;
    syncState.error = '';
    syncMessage('Sincronizando catálogo oficial…', 'busy');
    try {
      const synced = [];
      for (const category of categories) {
        const firstPage = await fetchCatalogPage(category.url);
        const total = catalogTotal(firstPage) || category.count;
        const pages = Math.ceil(total / 24);
        syncMessage(`Leyendo ${category.short} · 1 de ${pages} páginas`, 'busy');
        for (let page = 1; page <= pages; page += 1) {
          const html = page === 1 ? firstPage : await fetchCatalogPage(`${category.url}?product-page=${page}`);
          synced.push(...productEntries(html, category));
          syncMessage(`Leyendo ${category.short} · ${page} de ${pages} páginas`, 'busy');
        }
      }
      const unique = [...new Map(synced.map((product) => [product.url, product])).values()];
      if (unique.length < minimumCatalogTotal) throw new Error(`Catálogo incompleto (${unique.length} de al menos ${minimumCatalogTotal} productos)`);
      const previousDescriptions = new Map(products.map((product) => [product.url, product.description]));
      const previousUrls = new Set(products.map((product) => product.url));
      products = unique.map((product) => ({...product, description:previousDescriptions.get(product.url) || ''}));
      recentProducts = unique.filter((product) => !previousUrls.has(product.url)).slice(0, 4);
      if (recentProducts.length < 4) recentProducts = unique.slice(0, 4);
      localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
      save();
      syncState.last = String(Date.now());
      localStorage.setItem('iht_last_sync', syncState.last);
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
    const recentCandidates = [...(Array.isArray(recentProducts) ? recentProducts : []), ...products];
    const items = [...new Map(recentCandidates.map((product) => [normalize(product.title), product])).values()].slice(0, 4);
    $('#recentProducts').innerHTML = items.map((product) => `<button class="recent-product" data-product="${escapeHtml(product.url)}" aria-label="Ver ${escapeHtml(product.title)}"><img src="${escapeHtml(product.image || 'assets/logo.png')}" alt="${escapeHtml(product.title)}" loading="lazy" onerror="this.onerror=null;this.src='assets/logo.png'"></button>`).join('');
    renderAlertPreview();
  }

  function updateRecentFromAlerts(groups) {
    const alerts = Array.isArray(groups) ? groups : groups?.alta || [];
    if (!alerts.length || products.length <= seed.length) return;
    const matches = [];
    for (const alert of alerts) {
      const alertText = typeof alert === 'string' ? alert : alert?.text || '';
      const alertTitle = normalize(cleanDisplayText(alertText.replace(/\s*\([^)]*\)\s*$/, '')));
      const linkedProduct = alert?.url ? products.find((product) => product.url === alert.url) : null;
      const match = products.find((product) => {
        const productTitle = normalize(cleanDisplayText(product.title));
        return productTitle.length > 8 && (alertTitle.includes(productTitle) || productTitle.includes(alertTitle));
      });
      const candidate = linkedProduct || match;
      if (candidate && !matches.some((product) => normalize(product.title) === normalize(candidate.title))) matches.push(candidate);
      if (matches.length === 4) break;
    }
    if (!matches.length) return;
    recentProducts = [...matches, ...recentProducts, ...products].filter((product, index, all) => all.findIndex((candidate) => normalize(candidate.title) === normalize(product.title)) === index).slice(0, 4);
    localStorage.setItem('iht_recent_products', JSON.stringify(recentProducts));
    renderHome();
  }

  function openCategoryDirectoryFromHome() {
    renderCategoryDirectory();
    showView('categoryDirectoryView');
  }

  const productCategoryRules = [
    [['Carnes y embutidos', 'Carnes y fiambres'], /bresaola|matambrito|\bcarne\b/],
    [['Carnes y embutidos', 'Hamburguesas'], /hamburguesa/],
    [['Carnes y embutidos', 'Chorizos y salchichas'], /chorizo|salchicha/],
    [['Pescados', 'Pescados ahumados'], /salmon|salm[oó]n|pescado ahumado/],
    [['Untables y pastas', 'Pastas de frutos secos'], /pasta(?:\s+untable)?\s+de\s+(?:avellana|caju|cajú|pecan|pecán|pistacho|mani|maní|almendra)/],
    [['Untables y pastas', 'Tahini y pastas de semillas'], /pasta\s+de\s+sesamo|tahini/],
    [['Legumbres y derivados', 'Pastas de legumbres'], /pasta\s+de\s+(?:arveja|lenteja|garbanzo|poroto)/],
    [['Legumbres y derivados', 'Tofu y soja'], /tofu|tofú|proteina\s+de\s+soja|proteína\s+de\s+soja/],
    [['Legumbres y derivados', 'Arvejas'], /\barveja/],
    [['Legumbres y derivados', 'Porotos, lentejas y garbanzos'], /\bporoto|\blenteja|\bgarbanzo/],
    [['Azúcares y endulzantes', 'Azúcares'], /azucar|azúcar/],
    [['Azúcares y endulzantes', 'Edulcorantes'], /edulcorante/],
    [['Ingredientes para repostería', 'Levaduras y leudantes'], /levadura|polvo\s+para\s+hornear|bicarbonato/],
    [['Ingredientes para repostería', 'Almidones y féculas'], /fecula|fécula|almidon|almidón/],
    [['Ingredientes para repostería', 'Cacao'], /\bcacao\b/],
    [['Ingredientes para repostería', 'Esencias y decoración'], /\breposteria\b|\brepostería\b|esencia\s+de|\bgranas?\b/],
    [['Frutos secos y deshidratados', 'Frutos secos'], /avellana|\bnueces?\b|pistacho|pecan|pecán|caju|cajú|almendra|castana|castaña/],
    [['Frutos secos y deshidratados', 'Frutas deshidratadas'], /datil|dátil|damasco|damasaco|ciruela\s+seca|pasas?\s+de\s+uva|cascara\s+de|cáscara\s+de|polvo\s+de\s+(?:limon|limón|mandarina)/],
    [['Frutos secos y deshidratados', 'Coco'], /coco\s+rallado/],
    [['Cocina internacional', 'Ingredientes asiáticos'], /\balga|\balaga|wasabi/],
    [['Cocina internacional', 'Cuscús y burgol'], /couscous|cuscus|cuscús|burgol|brugol|bulgur/],
    [['Sopas y caldos', 'Caldos y acompañamientos'], /consome|consomé|caldo|shkedei\s+marak/],
    [['Alimentos saludables', 'Productos de dietética'], /productos?\s+de\s+dietetica|mix\s+fibra/],
    [['Alimentos saludables', 'Proteínas y suplementos'], /suplemento|proteina\s+(?!de\s+soja)|proteína\s+(?!de\s+soja)/],
    [['Bebidas', 'Bebidas alcohólicas', 'Licores y destilados'], /bebida\s+alcoholica|bebida\s+alcohólica/],
    [['Bebidas', 'Bebidas sin alcohol', 'Bebidas deportivas'], /gatorade|bebida\s+deportiva|isotonica|isotónica/],
    [['Bebidas', 'Bebidas sin alcohol', 'Kombucha'], /kombucha/],
    [['Bebidas', 'Bebidas sin alcohol', 'Bebidas saborizadas'], /bebida\s+saborizada/],
    [['Cereales, granos y semillas', 'Maíz y polenta'], /polenta|pochoclo|choclo|corn\s+flakes|semola\s+de\s+trigo|sémola\s+de\s+trigo/],
    [['Cereales, granos y semillas', 'Granolas'], /granola/],
    [['Cereales, granos y semillas', 'Semillas'], /girasol\s+pelado/],
    [['Frutas y vegetales', 'Frutas en conserva'], /anana|ananá|durazno|ciruela|damasco|damasaco/],
    [['Frutas y vegetales', 'Pulpas de fruta'], /pulpa\s+de/],
    [['Frutas y vegetales', 'Hongos'], /champignon|champiñon|champiñón|hongo/],
    [['Frutas y vegetales', 'Vegetales en conserva'], /arveja|choclo|hojas?\s+de\s+parra|alcaparra/],
    [['Frutas y vegetales', 'Vegetales deshidratados'], /espinaca|\bkale\b/],
    [['Salsas, aderezos y condimentos', 'Hierbas y especias'], /azafran|azarfan|azafrán|canela|clavo\s+de\s+olor|curry|jengibre|pimenton|pimentón|paprika|perejil|oregano|orégano|romero|salvia|tomillo|estragon|estragón|hibiscus|chimichurri|sazonador|\bsales\b|\bhierbas?\b|mix\s+para\s+(?:carnes|ensaladas)|condifran|condifrán/],
    [['Snacks', 'Chips y bocaditos'], /\bchips?\b|\bthins?\b|\bthings\b|\bbamba\b/],
    [['Dulces y golosinas', 'Obleas y pastillas'], /oblea|pastilla/],
    [['Aceites', 'Aceite de oliva'], /aceite.+oliva|oliva.+aceite/],
    [['Aceites', 'Aceite de girasol'], /aceite.+girasol|girasol.+aceite/],
    [['Aceites', 'Otros aceites'], /\baceite\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Espumantes'], /champagne|espumante/],
    [['Bebidas', 'Bebidas alcohólicas', 'Vinos'], /\bvino|malbec|cabernet|merlot|chardonnay|sauvignon\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Cervezas'], /\bcerveza\b/],
    [['Bebidas', 'Bebidas alcohólicas', 'Licores y destilados'], /\blicor|vodka|whisky|gin\b|fernet|ron\b/],
    [['Bebidas', 'Bebidas sin alcohol', 'Aguas'], /\bagua\b/],
    [['Bebidas', 'Bebidas sin alcohol', 'Jugos'], /\bjugo|zumo|nectar\b/],
    [['Bebidas', 'Bebidas sin alcohol', 'Gaseosas y sodas'], /gaseosa|\bsoda\b|tonica/],
    [['Bebidas', 'Bebidas sin alcohol', 'Bebidas vegetales'], /bebida.+(avena|almendra|soja|coco|arroz)/],
    [['Bebidas', 'Bebidas sin alcohol', 'Energizantes'], /energizante/],
    [['Infusiones', 'Café'], /\bcafe\b/],
    [['Infusiones', 'Café'], /nescafe|nescafé/],
    [['Infusiones', 'Té'], /\bte\b|infusion/],
    [['Infusiones', 'Yerba mate'], /yerba|\bmate\b/],
    [['Dulces y golosinas', 'Dulce de leche'], /dulce.+leche/],
    [['Lácteos', 'Leches'], /\bleche\b/],
    [['Lácteos', 'Quesos'], /\bqueso/],
    [['Lácteos', 'Yogures'], /yogur/],
    [['Lácteos', 'Mantecas y cremas'], /manteca|\bcrema\b/],
    [['Panadería y repostería', 'Harinas'], /\bharina|premezcla/],
    [['Panadería y repostería', 'Panes'], /\bpan\b|panificad/],
    [['Panadería y repostería', 'Galletitas y tostadas'], /gallet|tostad|bizcoch/],
    [['Panadería y repostería', 'Masas'], /\bmasa\b|tapa.+empanada|tapa.+tarta/],
    [['Dulces y golosinas', 'Chocolates y bombones'], /chocolate|bombon/],
    [['Dulces y golosinas', 'Alfajores'], /alfajor/],
    [['Dulces y golosinas', 'Caramelos y golosinas'], /caramelo|golosina|turron|chicle/],
    [['Dulces y golosinas', 'Dulces y mermeladas'], /\bdulce|mermelada|jalea/],
    [['Dulces y golosinas', 'Miel'], /\bmiel\b/],
    [['Cereales, granos y semillas', 'Arroz'], /\barroz\b/],
    [['Cereales, granos y semillas', 'Avena'], /\bavena\b/],
    [['Cereales, granos y semillas', 'Maíz'], /\bmaiz\b/],
    [['Cereales, granos y semillas', 'Quinoa'], /quinoa/],
    [['Cereales, granos y semillas', 'Semillas'], /semilla|chia|lino|sesamo/],
    [['Cereales, granos y semillas', 'Cereales'], /\bcereal/],
    [['Salsas, aderezos y condimentos', 'Mayonesas'], /mayonesa/],
    [['Salsas, aderezos y condimentos', 'Ketchup y mostazas'], /ketchup|mostaza/],
    [['Salsas, aderezos y condimentos', 'Salsas'], /\bsalsa/],
    [['Salsas, aderezos y condimentos', 'Vinagres'], /vinagre/],
    [['Salsas, aderezos y condimentos', 'Especias y condimentos'], /especia|condimento|pimienta|\bsal\b/],
    [['Conservas', 'Pescados en conserva'], /atun|sardina|caballa/],
    [['Conservas', 'Vegetales en conserva'], /aceituna|pickle|palmito|conserva/],
    [['Pastas', 'Pastas secas'], /fideo|spaghetti|tallar|pasta seca/],
    [['Pastas', 'Pastas rellenas'], /raviol|sorrentino|capelet/],
    [['Snacks', 'Papas fritas'], /papas fritas/],
    [['Snacks', 'Frutos secos'], /mani|almendra|nuez|castana/],
    [['Snacks', 'Otros snacks'], /\bsnack|nacho|palito|barrita/],
    [['Frutas y vegetales', 'Frutas'], /\bfruta/],
    [['Frutas y vegetales', 'Vegetales'], /vegetal|verdura|papa|tomate|cebolla|ajo/],
    [['Congelados', 'Productos congelados'], /congelad|freezado/]
  ];

  function productCategoryPath(product) {
    const text = normalize(`${product.title} ${product.description || ''}`);
    const remoteMatch = remoteTaxonomyRules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)));
    if (remoteMatch) return remoteMatch.path;
    const match = productCategoryRules.find(([, pattern]) => pattern.test(text));
    if (match) return match[0];
    const fallback = {gondola:'Productos de góndola', planta:'Productos de plantas certificadas', especial:'Producción especial', uruguay:'Productos de Uruguay'};
    return ['Otros productos', fallback[product.cat] || 'Sin clasificar'];
  }

  function productsAtPath(path) {
    return products.filter((product) => path.every((part, index) => productCategoryPath(product)[index] === part));
  }

  function categoryDirectory(path = []) {
    const grouped = new Map();
    productsAtPath(path).forEach((product) => {
      const name = productCategoryPath(product)[path.length];
      if (!name) return;
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(product);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', {sensitivity:'base'}));
  }

  function renderCategoryDirectory() {
    activeCategoryPath = [];
    $('#alphabeticalCategoryList').innerHTML = taxonomyRows(categoryDirectory(), []);
  }

  function taxonomyIcon(name) {
    const key = normalize(name);
    let path = '<circle cx="12" cy="12" r="8"/><path d="M8.5 12h7M12 8.5v7"/>';
    if (/carnes|fiambres|hamburguesas|chorizos|salchichas/.test(key)) path = '<path d="M7 18c-3-2-3-7 0-10s8-3 10 0 1 8-3 10-5 2-7 0Z"/><circle cx="14.5" cy="10" r="2"/>';
    else if (/pescado|salmon/.test(key)) path = '<path d="M4 12c3-4 7-6 12-3l4-3v12l-4-3c-5 3-9 1-12-3Z"/><circle cx="14" cy="11" r=".8"/>';
    else if (/vino/.test(key)) path = '<path d="M8 3h8l-1 6a3 3 0 0 1-6 0ZM12 12v7M8.5 21h7"/>';
    else if (/cerveza/.test(key)) path = '<path d="M6 5h10v15H6zM16 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M8 8h6"/>';
    else if (/espumante/.test(key)) path = '<path d="M9 3h6l-1 7a2 2 0 0 1-4 0ZM12 12v7M9 21h6M18 4h.1M20 7h.1"/>';
    else if (/alcohol|licor|destilado/.test(key)) path = '<path d="M9 3h6v4l2 3v10H7V10l2-3zM9 7h6M9 14h6"/>';
    else if (/agua/.test(key)) path = '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>';
    else if (/jugo/.test(key)) path = '<path d="M7 7h10l-1 14H8zM8 11h8M12 7V3h4"/>';
    else if (/energizante|deportiva/.test(key)) path = '<path d="m13 2-7 12h6l-1 8 7-12h-6z"/>';
    else if (/kombucha|saborizada|gaseosa|soda|bebida/.test(key)) path = '<path d="M9 3h6v4l2 3v10H7V10l2-3zM9 7h6M10 14h4"/>';
    else if (/cafe/.test(key)) path = '<path d="M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 11h2a2 2 0 0 1 0 4h-2M9 4v2M13 4v2"/>';
    else if (/yerba|mate/.test(key)) path = '<path d="M7 8h10l-1 10H8zM13 8l3-5M15 4h3"/><path d="M10 12c1-1 3-1 4 0"/>';
    else if (/infusion|\bte\b/.test(key)) path = '<path d="M5 8h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM17 10h2a2 2 0 0 1 0 4h-2M8 4h6"/>';
    else if (/aceite|vinagre/.test(key)) path = '<path d="M9 3h6v4l2 3v10H7V10l2-3zM9 7h6"/><path d="M12 12c2 2 2 4 0 5-2-1-2-3 0-5Z"/>';
    else if (/queso/.test(key)) path = '<path d="M4 10 16 4l4 6v10H4zM4 10h16"/><circle cx="10" cy="14" r="1"/><circle cx="16" cy="16" r="1"/>';
    else if (/lacteo|leche/.test(key)) path = '<path d="M8 4h8l2 5v11H6V9zM8 4 6 9h12M10 13h4"/>';
    else if (/yogur/.test(key)) path = '<path d="M7 7h10l-1 13H8zM6 7h12M10 4h4"/>';
    else if (/panes|panaderia/.test(key)) path = '<path d="M5 12c0-4 3-7 7-7s7 3 7 7v7H5zM9 9l-1 3M13 8l-1 4M17 10l-1 3"/>';
    else if (/reposteria|harina|levadura|leudante|esencia|decoracion|cacao/.test(key)) path = '<path d="M6 5c6 0 10 5 10 11M9 5c0 7 4 11 9 11M5 19h14"/><path d="M15 4l4 4"/>';
    else if (/gallet|tostada|oblea/.test(key)) path = '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="8" r="1"/><circle cx="14" cy="14" r="1"/><circle cx="9" cy="15" r="1"/>';
    else if (/chocolate/.test(key)) path = '<path d="M5 5h14v14H5zM5 10h14M10 5v14M15 5v14"/>';
    else if (/golosina|caramelo|pastilla/.test(key)) path = '<path d="m8 8 8 8M7 7l-4 2 2 4M17 17l4-2-2-4"/><rect x="7" y="7" width="10" height="10" rx="3" transform="rotate(-45 12 12)"/>';
    else if (/miel/.test(key)) path = '<path d="M8 8h8l1 12H7zM7 5h10v3H7z"/><path d="M12 11c2 2 2 4 0 5-2-1-2-3 0-5Z"/>';
    else if (/azucar|endulzante/.test(key)) path = '<path d="m6 9 6-4 6 4v7l-6 4-6-4zM6 9l6 4 6-4M12 13v7"/>';
    else if (/cereal|grano|semilla|arroz|avena|maiz|quinoa|granola|polenta|cuscus|burgol/.test(key)) path = '<path d="M12 21V6M12 10c-3 0-5-2-5-5 3 0 5 2 5 5ZM12 15c3 0 5-2 5-5-3 0-5 2-5 5ZM12 19c-3 0-5-2-5-5 3 0 5 2 5 5Z"/>';
    else if (/fruto seco|deshidratad|dietetica/.test(key)) path = '<path d="M7 12c0-5 3-8 5-8s5 3 5 8-2 8-5 8-5-3-5-8Z"/><path d="M9 9c2 1 4 1 6 0M9 14c2-1 4-1 6 0"/>';
    else if (/untable|pasta de frutos|tahini/.test(key)) path = '<path d="M6 8h12l-1 12H7zM7 5h10v3H7zM10 13h4"/>';
    else if (/legumbre|arveja|poroto|lenteja|tofu|soja/.test(key)) path = '<path d="M6 14c0-6 5-9 11-8 1 6-2 11-8 11-2 0-3-1-3-3Z"/><path d="M8 15c2-3 4-5 8-7"/>';
    else if (/salsa|aderezo|condimento|mayonesa|ketchup|mostaza|especia|hierba/.test(key)) path = '<path d="M9 3h6v4l2 3v10H7V10l2-3zM9 7h6M9 13h6"/>';
    else if (/conserva|enlatado/.test(key)) path = '<ellipse cx="12" cy="5" rx="6" ry="2"/><path d="M6 5v14c0 1 3 2 6 2s6-1 6-2V5M6 18c0 1 3 2 6 2s6-1 6-2"/>';
    else if (/pasta|fideo|raviol/.test(key)) path = '<path d="M5 7c3-3 11-3 14 0M5 17c3 3 11 3 14 0M7 5c-3 3-3 11 0 14M17 5c3 3 3 11 0 14M9 9h6v6H9z"/>';
    else if (/snack|papas fritas|chips|bocadito/.test(key)) path = '<path d="M7 3h10l2 18H5zM8 8h8M9 12h6"/>';
    else if (/fruta|vegetal|verdura|hongo/.test(key)) path = '<path d="M12 7c-4-3-8 0-7 5 1 5 4 8 7 8s6-3 7-8c1-5-3-8-7-5ZM12 7c0-3 2-5 5-5M12 5c-2-2-4-2-6-1"/>';
    else if (/congelado/.test(key)) path = '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 5l3 2 3-2M9 19l3-2 3 2"/>';
    else if (/sopa|caldo/.test(key)) path = '<path d="M4 12h16c0 5-3 8-8 8s-8-3-8-8ZM7 8c0-2 2-2 2-4M12 8c0-2 2-2 2-4"/>';
    else if (/saludable|proteina|suplemento/.test(key)) path = '<path d="M12 20s-7-4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 6-7 10-7 10Z"/><path d="M9 12h2l1-2 2 4 1-2h2"/>';
    else if (/cocina internacional|asiatico/.test(key)) path = '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2 2 3 5 3 8s-1 6-3 8c-2-2-3-5-3-8s1-6 3-8Z"/>';
    return `<svg class="taxonomy-icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  }

  function taxonomyTone(name) {
    return `tone-${[...normalize(name)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5}`;
  }

  function taxonomyRows(rows, parentPath) {
    return rows.map(([name, items]) => {
      const path = [...parentPath, name];
      return `<button class="alphabetical-category-row" type="button" data-taxonomy-path="${encodeURIComponent(JSON.stringify(path))}"><span class="alphabetical-category-icon ${taxonomyTone(name)}">${taxonomyIcon(name)}</span><span><strong>${escapeHtml(name)}</strong><small>${items.length.toLocaleString('es-AR')} ${items.length === 1 ? 'producto' : 'productos'}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`;
    }).join('');
  }

  function openTaxonomyPath(path) {
    activeCategoryPath = path;
    const children = categoryDirectory(path);
    const name = path.at(-1);
    if (children.length) {
      $('#subcategoryDirectoryTop').textContent = name;
      $('#subcategoryDirectoryTitle').textContent = name;
      $('#subcategoryDirectoryMeta').textContent = `${children.length} ${children.length === 1 ? 'subcategoría' : 'subcategorías'}`;
      $('#subcategoryList').innerHTML = taxonomyRows(children, path);
      showView('subcategoryDirectoryView');
      return;
    }
    const items = productsAtPath(path).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    $('#categoryProductsTop').textContent = name;
    $('#categoryProductsTitle').textContent = name;
    $('#categoryProductsMeta').textContent = `${items.length.toLocaleString('es-AR')} ${items.length === 1 ? 'producto' : 'productos'}`;
    renderProductCollection($('#categoryProductList'), items);
    showView('categoryProductsView');
  }

  function renderSearchCategories() {
    const all = `<button class="quick-filter ${selectedCategory === 'all' ? 'active' : ''}" data-category="all" aria-label="Ver todos los productos">${categoryIcon('all')}<span>Todos los productos</span><small>Ver el catálogo completo</small></button>`;
    const filters = categories.map((category) => `<button class="quick-filter ${selectedCategory === category.key ? 'active' : ''}" data-category="${category.key}" aria-label="Filtrar por ${escapeHtml(category.name)}">${categoryIcon(category.key)}<span>${escapeHtml(category.short)}</span></button>`).join('');
    $('#searchCategories').innerHTML = `<div class="quick-filters-label">Explorar categorías</div><div class="quick-filters">${all}${filters}</div>`;
    $('#recentSearches').innerHTML = recent.slice(0,5).map((query) => `<button data-recent="${escapeHtml(query)}">${escapeHtml(query)}</button>`).join('') + (recent.length ? '<button class="clear-history-chip" data-clear-history="true" type="button">Borrar historial</button>' : '');
  }

  function productImage(product) {
    return `<img src="${escapeHtml(product.image || 'assets/logo.png')}" alt="${escapeHtml(product.title)}" onerror="this.onerror=null;this.src='assets/logo.png'">`;
  }

  function cleanDisplayText(value) {
    return clean(String(value || '').replace(/[→➜➝➞⟶›▶►]+/g, ' ').replace(/»([^»]+)»/g, '«$1»'));
  }

  function styledBrandText(value) {
    const text = cleanDisplayText(value);
    const match = text.match(/\bmarca\s+(.+?)(?=\s+(?:sabor|tipo|variedad|presentacion|presentación)\b|[,.;:()–—-]|$)/i);
    if (!match) return escapeHtml(text);
    const start = match.index;
    const brandStart = start + match[0].toLowerCase().indexOf(match[1].toLowerCase());
    const brandEnd = brandStart + match[1].length;
    return `${escapeHtml(text.slice(0, brandStart))}<span class="brand-name">${escapeHtml(text.slice(brandStart, brandEnd))}</span>${escapeHtml(text.slice(brandEnd))}`;
  }

  function filtered(query) {
    const term = normalize(query);
    return products.filter((product) => {
      const matchesCategory = selectedCategory === 'all' || product.cat === selectedCategory;
      const matchesFavorite = !favoriteOnly || favorites.has(product.url);
      const text = normalize(`${product.title} ${product.brand || ''} ${product.barcode || ''} ${product.description || ''}`);
      return matchesCategory && matchesFavorite && (!term || text.includes(term));
    }).sort((a,b) => a.title.localeCompare(b.title, 'es'));
  }

  function productMarkup(product) {
    const category = categoryFor(product.cat);
    return `<button class="product" data-product="${escapeHtml(product.url)}"><span>${productImage(product)}</span><span><small class="cat">${escapeHtml(category ? category.name : 'Catálogo oficial')}</small><strong>${styledBrandText(product.title)}</strong><small class="product-status"><span class="status-dot" aria-hidden="true"></span>Autorizado · ${escapeHtml(product.description ? 'Información disponible' : 'Ficha local')}</small></span><span class="save" data-favorite="${escapeHtml(product.url)}" aria-label="${favorites.has(product.url) ? 'Quitar de guardados' : 'Guardar producto'}">${bookmarkIcon(favorites.has(product.url))}</span></button>`;
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

  function renderResults(query = '') {
    const result = filtered(query);
    const title = favoriteOnly ? 'Guardados' : query ? 'Resultados' : selectedCategory === 'all' ? 'Todos los productos' : categoryFor(selectedCategory).name;
    $('#resultsTitle').textContent = title;
    $('#resultsMeta').textContent = `${result.length.toLocaleString('es-AR')} ${result.length === 1 ? 'producto' : 'productos'} en esta vista`;
    $('#results').hidden = false;
    $('#searchCategories').hidden = true;
    $('#recentSearches').hidden = true;
    renderProductCollection($('#productList'), result, `<div class="empty-state"><svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5h5"/></svg><strong>No encontramos productos</strong><span>Probá con otra marca, nombre o categoría.</span><button class="text-btn" id="emptyReset">Hacer nueva búsqueda</button></div>`);
    $('#emptyReset')?.addEventListener('click', () => { $('#query').value = ''; $('#clear').hidden = true; selectedCategory = 'all'; favoriteOnly = false; renderSearchCategories(); $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; $('#query').focus(); });
  }

  function showView(viewId) {
    if (viewId !== 'searchView') document.body.classList.remove('search-open');
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
    document.querySelectorAll('.nav').forEach((button) => button.classList.toggle('active', button.dataset.view === viewId));
    if (viewId === 'searchView') { renderSearchCategories(); $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; }
    if (viewId === 'alertsView') renderAlerts();
    if (viewId === 'moreView') renderMore();
    window.scrollTo(0,0);
  }

  function openSearchScreen() {
    document.body.classList.add('search-open');
    showView('searchView');
    $('#query').value = $('#homeQuery').value;
    $('#clear').hidden = !$('#query').value;
    $('#query').focus();
  }

  function returnHome() {
    selectedCategory = 'all';
    favoriteOnly = false;
    $('#homeQuery').value = '';
    $('#query').value = '';
    $('#homeClear').hidden = true;
    $('#clear').hidden = true;
    showView('homeView');
  }

  function doSearch(input, fromHome = false) {
    const value = clean(input.value);
    if (!value) return;
    recent = [value, ...recent.filter((item) => normalize(item) !== normalize(value))].slice(0,5);
    localStorage.setItem('iht_recent', JSON.stringify(recent));
    if (fromHome) { showView('searchView'); $('#query').value = value; }
    favoriteOnly = false; selectedCategory = 'all'; renderResults(value); renderSearchCategories();
  }

  function toggleFavorite(url) {
    favorites.has(url) ? favorites.delete(url) : favorites.add(url);
    save();
    if (currentProduct && currentProduct.url === url) renderDetail(currentProduct);
    renderResults($('#query').value);
  }

  function renderDetail(product, official = null) {
    currentProduct = product;
    const category = categoryFor(product.cat);
    const officialImage = official?.images?.[0]?.src || product.image;
    const officialDescription = official?.blocks?.filter((block) => block.tag === 'p').map((block) => block.text).join(' ') || product.description || 'Producto incluido en el catálogo local de Iahadut HaTora.';
    const officialCategory = official?.category || (category ? category.name : 'Catálogo oficial');
    $('#detailContent').innerHTML = `<div class="detail-content"><img src="${escapeHtml(officialImage || 'assets/logo.png')}" alt="${escapeHtml(product.title)}" onerror="this.onerror=null;this.src='assets/logo.png'"><div class="detail-body"><span class="label">${escapeHtml(officialCategory)}</span><h1>${escapeHtml(product.title)}</h1><button class="filter-btn" id="detailFavorite">${bookmarkIcon(favorites.has(product.url))}<span>${favorites.has(product.url) ? 'Guardado' : 'Guardar producto'}</span></button><div class="verified-line"><span class="status-dot" aria-hidden="true"></span>Producto autorizado por Iahadut HaTora</div><p>${escapeHtml(officialDescription)}</p><div class="detail-facts single"><div><small>Categoría</small><strong>${escapeHtml(officialCategory)}</strong></div></div></div></div>`;
    $('#detailFavorite').onclick = () => toggleFavorite(product.url);
    $('#detailSave').innerHTML = bookmarkIcon(favorites.has(product.url));
    $('#detailSave').setAttribute('aria-label', favorites.has(product.url) ? 'Quitar de guardados' : 'Guardar producto');
  }

  function openDetail(url) {
    const product = products.find((item) => item.url === url); if (!product) return;
    previousView = document.querySelector('.view.active').id; showView('detailView'); renderDetail(product);
    fetchProductContent(product).then((official) => { if (currentProduct?.url === product.url) renderDetail(product, official); }).catch(() => { if (currentProduct?.url === product.url && productCache[product.url]) renderDetail(product, productCache[product.url]); });
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
      const visual = match?.image ? `<img class="alert-product-image" src="${escapeHtml(match.image)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('•'))">` : '<span class="alert-mark" aria-hidden="true">•</span>';
      return `<article class="alert-item">${visual}<p>${styledBrandText(text)}</p></article>`;
    }).join('')}</div></details>`;
  }

  function alertMarkup(items) {
    const groups = Array.isArray(items) ? alertGroups(items) : items;
    return alertSection('Altas y modificaciones recientes', 'alta', groups.alta) + alertSection('Productos dados de baja', 'baja', groups.baja) + alertSection('Otras comunicaciones', 'general', groups.general);
  }

  async function renderAlerts() {
    $('#alertsMeta').textContent = 'Actualizaciones y comunicaciones del catálogo.';
    if (alertCache?.items && !Array.isArray(alertCache.items)) {
      $('#alertList').innerHTML = alertMarkup(alertCache.items);
      $('#alertsMeta').textContent = 'Información guardada · actualizando…';
    } else {
      $('#alertList').innerHTML = '<div class="content-skeleton alert-skeleton" aria-label="Preparando alertas"><i></i><i></i><i></i></div>';
    }
    try {
      const items = await fetchAlerts();
      if (document.querySelector('.view.active')?.id === 'alertsView') {
        $('#alertList').innerHTML = alertMarkup(items);
        $('#alertsMeta').textContent = 'Actualizaciones y comunicaciones del catálogo.';
      }
    } catch (_) {
      const items = alertCache?.items || {alta:[], baja:['No pudimos actualizar las alertas. Revisá tu conexión e intentá nuevamente.'], general:[]};
      $('#alertList').innerHTML = alertMarkup(items);
      $('#alertsMeta').textContent = 'Sin conexión · mostrando información guardada.';
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
    if (!remoteControl.configured) {
      localStorage.setItem('iht_push_status', 'pending-config');
      return 'pending-config';
    }
    try {
      const {PushNotifications} = await import('@capacitor/push-notifications');
      if (!pushListenersReady) {
        pushListenersReady = true;
        await PushNotifications.addListener('registration', async ({value}) => {
          localStorage.setItem('iht_push_token', value); localStorage.setItem('iht_push_status', 'active');
          if (remoteControl.device_registration_url) {
            try { await CapacitorHttp.post({url:remoteControl.device_registration_url, headers:{'Content-Type':'application/json'}, data:{token:value, platform:Capacitor.getPlatform(), topic:'catalog-updates', appVersion:APP_VERSION}}); } catch (_) {}
          }
          if (document.querySelector('.view.active')?.id === 'moreView') renderMore();
        });
        await PushNotifications.addListener('registrationError', () => localStorage.setItem('iht_push_status', 'error'));
        await PushNotifications.addListener('pushNotificationReceived', (notification) => { $('#navDot').hidden = false; if (notification.data?.action === 'sync') syncCatalog(true); });
        await PushNotifications.addListener('pushNotificationActionPerformed', ({notification}) => { $('#navDot').hidden = true; if (notification.data?.action === 'sync') syncCatalog(true); showView('alertsView'); });
        await PushNotifications.createChannel({id:'catalog-updates', name:'Actualizaciones del catálogo', description:'Altas, bajas y cambios importantes', importance:4, visibility:1, vibration:true});
      }
      let permission = await PushNotifications.checkPermissions();
      if (requestPermission && permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
      if (permission.receive === 'granted') { await PushNotifications.register(); return 'active'; }
      localStorage.setItem('iht_push_status', permission.receive === 'denied' ? 'denied' : 'pending');
      return permission.receive;
    } catch (_) { localStorage.setItem('iht_push_status', 'unavailable'); return 'unavailable'; }
  }

  function renderMore() {
    const saved = `<button class="more-row saved-more-row" data-saved="true">${bookmarkIcon(false)}<span><strong>Productos guardados</strong><small>${favorites.size ? `${favorites.size} productos guardados` : 'Todavía no guardaste productos'}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`;
    const decision = accessDecision(remoteControl);
    const pushStatus = localStorage.getItem('iht_push_status');
    const notificationButton = $('#notificationButton');
    const notificationStatus = $('#notificationStatus');
    if (notificationButton) notificationButton.setAttribute('aria-label', pushStatus === 'active' ? 'Notificaciones activadas' : 'Configurar notificaciones');
    if (notificationStatus) notificationStatus.hidden = pushStatus !== 'active';
    const update = `<button class="more-row managed-more-row update-more-row" data-app-update><span class="managed-icon" aria-hidden="true">↻</span><span><strong>Actualizar aplicación</strong><small>${decision.updateAvailable ? `Nueva versión ${escapeHtml(remoteControl.latest_version)} disponible` : `Versión ${escapeHtml(APP_VERSION)}`}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`;
    $('#moreList').innerHTML = saved + Object.entries(info).map(([key, value]) => `<button class="more-row" data-info="${key}">${infoIcon(key)}<span><strong>${escapeHtml(value[0])}</strong><small>${escapeHtml(value[1])}</small></span><span class="row-arrow" aria-hidden="true">›</span></button>`).join('') + update;
  }

  async function openInfo(key, options = {}) {
    const value = info[key]; if (!value) return;
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
    if (infoCache[key]) renderInfo(infoCache[key]);
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
    $('#readerContent').innerHTML = '<span class="label">Información del catálogo</span><h2>Última actualización</h2><div class="content-skeleton" aria-hidden="true"><i></i><i></i><i></i></div>';
    try {
      const officialDate = await fetchOfficialUpdateDate();
      const date = officialDate || officialUpdateMessage();
      $('#readerContent').innerHTML = `<span class="label">Información del catálogo</span><h2>Última actualización del catálogo</h2><div class="catalog-update-card"><strong>${escapeHtml(date)}</strong><span>Fecha publicada por Iahadut HaTora.</span></div><p class="catalog-app-sync">Última sincronización de esta app: ${escapeHtml(lastSyncMessage())}</p>`;
    } catch (_) {
      $('#readerContent').innerHTML = `<span class="label">Información del catálogo</span><h2>Última actualización del catálogo</h2><div class="catalog-update-card"><strong>${escapeHtml(officialUpdateMessage())}</strong><span>No pudimos consultar la web en este momento.</span></div>`;
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#scanMessage').textContent = 'La cámara no está disponible. Ingresá el código manualmente.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false});
      $('#camera').srcObject = stream;
      if (!('BarcodeDetector' in window)) { $('#scanMessage').textContent = 'Este dispositivo no ofrece lectura automática. Ingresá el EAN o UPC.'; return; }
      const detector = new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});
      const tick = async () => { if (!stream) return; try { const codes = await detector.detect($('#camera')); if (codes[0] && codes[0].rawValue) { closeScanner(); resolveBarcode(codes[0].rawValue); return; } } catch (_) {} scanFrame = requestAnimationFrame(tick); };
      scanFrame = requestAnimationFrame(tick);
    } catch (_) { $('#scanMessage').textContent = 'No pudimos iniciar la cámara. Revisá el permiso o ingresá el código manualmente.'; }
  }
  window.__ihtCameraReady = startCamera;
  window.__ihtCameraDenied = () => { $('#scanMessage').textContent = 'Se necesita permiso de cámara para escanear.'; };

  function openWebScanner(message = 'Alineá el código dentro del recuadro.', useCamera = true) {
    $('#scanMessage').textContent = message;
    $('#scanOverlay').hidden = false;
    $('#scanOverlay').classList.toggle('manual-only', !useCamera);
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
      openWebScanner('No pudimos abrir el lector nativo. Ingresá el código manualmente.', false);
    }
  }

  function closeScanner() { stopCamera(); $('#scanOverlay').hidden = true; $('#scanOverlay').classList.remove('manual-only'); updateModalLock(); }
  window.__ihtCloseScanner = closeScanner;
  async function barcodeIdentity(code) {
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_es,brands`;
      const response = Capacitor.isNativePlatform() ? await CapacitorHttp.get({url, connectTimeout:7000, readTimeout:7000}) : await fetch(url).then((value) => value.json());
      const data = response?.data || response;
      if (Number(data?.status) !== 1 || !data?.product) return null;
      return {name:clean(data.product.product_name_es || data.product.product_name), brand:clean(data.product.brands?.split(',')[0])};
    } catch (_) { return null; }
  }

  async function resolveBarcode(raw) {
    const code = String(raw || '').replace(/\D/g,'');
    if (!code) return;
    const exact = products.find((product) => String(product.barcode || '') === code);
    if (exact) { closeScanner(); openDetail(exact.url); return; }
    const identity = await barcodeIdentity(code);
    if (identity?.brand || identity?.name) {
      closeScanner();
      const query = identity.brand || identity.name;
      openSearchScreen();
      $('#query').value = query;
      $('#clear').hidden = false;
      renderResults(query);
      $('#resultsMeta').textContent += ` · código ${code}`;
      return;
    }
    stopCamera();
    $('#barcode').value = code;
    $('#scanMessage').textContent = `No pudimos identificar el código ${code}. Buscá el producto por nombre.`;
    $('#scanOverlay').hidden = false;
    updateModalLock();
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
    if (activeView === 'detailView') { showView(previousView); return; }
    if (activeView === 'readerView') { goBackReader(); return; }
    if (activeView === 'subcategoryDirectoryView' || activeView === 'categoryProductsView') { goBackTaxonomy(); return; }
    if (activeView === 'categoryDirectoryView' || activeView === 'alertsView' || activeView === 'moreView') { returnHome(); return; }
    if (Capacitor.isNativePlatform()) await App.exitApp();
  }

  App.addListener('backButton', handleMobileBack).catch(() => {});

  document.querySelectorAll('.nav').forEach((button) => button.onclick = () => button.dataset.view === 'homeView' ? returnHome() : button.dataset.view === 'searchView' ? openSearchScreen() : showView(button.dataset.view));
  document.addEventListener('click', (event) => {
    const loadMoreButton = event.target.closest('[data-load-more-products]');
    if (loadMoreButton) { appendProductBatch(); return; }
    const exploreCategories = event.target.closest('[data-explore-categories]');
    if (exploreCategories) { openCategoryDirectoryFromHome(); return; }
    const taxonomyButton = event.target.closest('[data-taxonomy-path]');
    if (taxonomyButton) { openTaxonomyPath(JSON.parse(decodeURIComponent(taxonomyButton.dataset.taxonomyPath))); return; }
    const categoryButton = event.target.closest('[data-category]'); if (categoryButton) { selectedCategory = categoryButton.dataset.category; favoriteOnly = false; showView('searchView'); renderResults(''); }
    const productButton = event.target.closest('[data-product]'); if (productButton && !event.target.closest('[data-favorite]')) openDetail(productButton.dataset.product);
    const favoriteButton = event.target.closest('[data-favorite]'); if (favoriteButton) { event.stopPropagation(); toggleFavorite(favoriteButton.dataset.favorite); }
    const recentButton = event.target.closest('[data-recent]'); if (recentButton) { $('#query').value = recentButton.dataset.recent; renderResults(recentButton.dataset.recent); }
    const infoButton = event.target.closest('[data-info]'); if (infoButton) openInfo(infoButton.dataset.info);
    const savedButton = event.target.closest('[data-saved]'); if (savedButton) { favoriteOnly = true; selectedCategory = 'all'; openSearchScreen(); renderResults(''); }
    const clearHistoryButton = event.target.closest('[data-clear-history]'); if (clearHistoryButton) { if (!recent.length || window.confirm('¿Borrar el historial de búsquedas?')) { recent = []; localStorage.removeItem('iht_recent'); renderMore(); renderSearchCategories(); } }
    const notificationButton = event.target.closest('[data-enable-notifications]');
    if (notificationButton) { setupPushNotifications(true).then(() => renderMore()); return; }
    const updateButton = event.target.closest('[data-app-update]');
    if (updateButton) {
      refreshRemoteControl(true).then((decision) => {
        if (decision.updateAvailable && remoteControl.update_url) openExternal(remoteControl.update_url);
        else window.alert(decision.updateAvailable ? 'La actualización todavía no tiene un enlace de descarga configurado.' : 'Ya tenés la última versión disponible.');
      });
      return;
    }
    const copyBankButton = event.target.closest('[data-copy-bank]');
    if (copyBankButton) {
      const text = copyBankButton.dataset.copyBank || '';
      const copy = navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject();
      copy.then(() => { const label = copyBankButton.querySelector('span'); label.textContent = 'Datos copiados'; window.setTimeout(() => { label.textContent = 'Copiar datos bancarios'; }, 1800); }).catch(() => window.prompt('Copiá estos datos:', text));
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
  $('#clear').onclick = () => { $('#query').value = ''; $('#clear').hidden = true; $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; $('#query').focus(); };
  $('#detailSave').onclick = () => { if (currentProduct) toggleFavorite(currentProduct.url); };
  $('#homeQuery').addEventListener('input', () => { $('#homeClear').hidden = !$('#homeQuery').value; });
  $('#query').addEventListener('input', () => {
    $('#clear').hidden = !$('#query').value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      const value = clean($('#query').value);
      if (value) renderResults(value);
      else { $('#results').hidden = true; $('#searchCategories').hidden = false; $('#recentSearches').hidden = false; }
    }, 180);
  });
  $('#homeQuery').addEventListener('focus', openSearchScreen);
  $('#searchBack').onclick = returnHome;
  $('#categoryDirectoryBack').onclick = returnHome;
  $('#subcategoryDirectoryBack').onclick = goBackTaxonomy;
  $('#categoryProductsBack').onclick = goBackTaxonomy;
  $('#catalogInfo').onclick = openCatalogInfo;
  $('#seeAlerts').onclick = () => showView('alertsView');
  $('#detailBack').onclick = () => showView(previousView);
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
  $('#homeScan').onclick = openScanner; $('#searchScan').onclick = openScanner; $('#closeScan').onclick = closeScanner;
  $('#barcodeForm').onsubmit = (event) => { event.preventDefault(); const code = $('#barcode').value; closeScanner(); resolveBarcode(code); };
  document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (!$('#scanOverlay').hidden) closeScanner(); if (!$('#imageOverlay').hidden) closeImage(); if (!$('#cardOverlay').hidden) closeInfoCard(); });
  function openFilters() {
    $('#filterOptions').innerHTML = `<button class="filter-option ${selectedCategory === 'all' ? 'active' : ''}" data-filter="all">${categoryIcon('all')}<span>Todos los productos</span></button>${categories.map((category) => `<button class="filter-option ${selectedCategory === category.key ? 'active' : ''}" data-filter="${category.key}">${categoryIcon(category.key)}<span>${escapeHtml(category.name)}</span></button>`).join('')}`;
    $('#filterOverlay').hidden = false;
    updateModalLock();
  }
  $('#filterBtn').addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openFilters(); });
  $('#closeFilter').onclick = () => { $('#filterOverlay').hidden = true; updateModalLock(); };
  $('#filterOverlay').onclick = (event) => { if (event.target === $('#filterOverlay')) { $('#filterOverlay').hidden = true; updateModalLock(); return; } const filter = event.target.closest('[data-filter]'); if (filter) { selectedCategory = filter.dataset.filter; $('#filterOverlay').hidden = true; updateModalLock(); renderResults($('#query').value); } };
  $('#resetFilter').onclick = () => { selectedCategory = 'all'; $('#filterOverlay').hidden = true; updateModalLock(); renderResults($('#query').value); };
  $('#syncStatus').onclick = () => syncCatalog(true);
  $('#accessRetry').onclick = () => refreshRemoteControl(true);
  $('#accessUpdate').onclick = () => openExternal(remoteControl.update_url);
  renderHome(); renderSearchCategories();
  syncMessage(lastSyncMessage(), syncState.last ? 'ok' : '');
  if (navigator.onLine && localStorage.getItem(INITIAL_PRELOAD_KEY) !== 'done') initialLoadProgress(4);
  refreshRemoteControl(false);
  setupPushNotifications(false);
  syncCatalog(false).finally(scheduleAppPreload);
  setInterval(() => syncCatalog(false), 12 * 60 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { syncCatalog(false); refreshRemoteControl(false); }
  });
  window.addEventListener('online', () => { syncCatalog(false).finally(scheduleAppPreload); });
})();
