import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, 'web/data/content.json');
const generatedAt = Date.now();
const sections = {
  shops: ['Tiendas certificadas', 'https://vaad.ar/tiendas-kosher-certificadas/'],
  catering: ['Servicios de catering', 'https://vaad.ar/servicios-de-catering/'],
  notes: ['Notas Kashrut', 'https://vaad.ar/notas-kashrut/'],
  world: ['Certificaciones mundiales', 'https://vaad.ar/certificaciones-kosher-mundiales/'],
  certify: ['Certificá tu planta', 'https://vaad.ar/certifica-tu-planta/'],
  about: ['Quiénes somos', 'https://vaad.ar/quienes-somos/'],
  contact: ['Contacto', 'https://vaad.ar/contacto/'],
  collaboration: ['Colaboración', 'https://vaad.ar/contacto/#colabora']
};

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const absolute = (value, base) => value ? new URL(value, base).href : '';

async function fetchHtml(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolvePromise) => setTimeout(resolvePromise, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

function cardLinkMap(document) {
  const links = {};
  [...document.querySelectorAll('script')].forEach((script) => {
    const match = script.textContent.match(/diviElementLinkData\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) return;
    try { JSON.parse(match[1]).forEach((item) => { if (item.class && item.url) links[item.class] = item.url; }); } catch (_) {}
  });
  return links;
}

function contentRoot(document) {
  return document.querySelector('#main-content .et_builder_inner_content, .entry-content, main, article, #main-content') || document.body;
}

function parseInfo(key, html) {
  const [title, pageUrl] = sections[key];
  const document = new DOMParser().parseFromString(html, 'text/html');
  const linksByClass = cardLinkMap(document);
  const footerText = clean([...document.querySelectorAll('footer')].map((node) => node.textContent).join(' '));
  const certify = key === 'certify' ? (() => {
    const introRoot = document.querySelector('.et_pb_text_1 .et_pb_text_inner');
    const steps = [...document.querySelectorAll('.et_pb_blurb_container')].map((node) => ({
      title: clean(node.querySelector('.et_pb_module_header')?.textContent),
      text: clean(node.querySelector('.et_pb_blurb_description p')?.textContent)
    })).filter((step) => step.title && step.text && /evaluaci[oó]n inicial|ajustes necesarios|supervisi[oó]n continua/i.test(step.title));
    return {
      subtitle: clean(document.querySelector('.et_pb_text_0 p')?.textContent),
      introTitle: clean(introRoot?.querySelector('h2')?.textContent),
      introText: clean(introRoot?.querySelector('p')?.textContent),
      steps
    };
  })() : null;
  const collaboration = key === 'collaboration' ? {
    text: clean(document.querySelector('#colabora .et_pb_text_inner')?.textContent),
    bank: clean(document.querySelector('.et_pb_icon_list_4 .et_pb_icon_list_text')?.textContent)
  } : null;

  document.querySelectorAll('script,style,noscript,nav,header,footer,form').forEach((node) => node.remove());
  const root = contentRoot(document);
  const seen = new Set();
  const blocks = [...root.querySelectorAll('h1,h2,h3,h4,h5,p,li,blockquote,address,.et_pb_toggle_title')].map((node) => ({
    tag: node.tagName.toLowerCase(), text: clean(node.textContent)
  })).filter((block) => {
    if (block.text.length <= 4 || /menu|buscar|leer más|ver imagen completa|abrir chat|todos los derechos/i.test(block.text) || seen.has(block.text)) return false;
    seen.add(block.text);
    return true;
  });

  const cards = [...document.querySelectorAll('[data-loop-item]')].map((node) => {
    const imageNode = node.querySelector('img');
    const titleNode = node.querySelector('h1,h2,h3,h4,h5,.et_pb_module_header,strong');
    const rawImage = imageNode && (imageNode.getAttribute('src') || imageNode.getAttribute('data-src') || imageNode.getAttribute('data-lazy-src'));
    const cardTitle = clean(titleNode?.textContent);
    if (!rawImage || cardTitle.length < 2) return null;
    const classes = [node, ...node.querySelectorAll('[class]')].flatMap((element) => String(element.className || '').split(/\s+/));
    const linked = classes.map((className) => linksByClass[className]).find(Boolean) || node.querySelector('a[href]')?.getAttribute('href') || '';
    return {
      title: cardTitle,
      description: clean(node.textContent).replace(cardTitle, '').trim(),
      image: absolute(rawImage, pageUrl),
      url: absolute(linked, pageUrl),
      alt: clean(imageNode.getAttribute('alt') || imageNode.getAttribute('title') || cardTitle)
    };
  }).filter(Boolean).filter((card, index, all) => all.findIndex((candidate) => normalize(candidate.title) === normalize(card.title) && candidate.image === card.image) === index).slice(0, 24);

  const images = [...root.querySelectorAll('img')].map((image) => ({
    src: absolute(image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src'), pageUrl),
    alt: clean(image.getAttribute('alt') || image.getAttribute('title') || title)
  })).filter((image) => image.src).filter((image, index, all) => all.findIndex((candidate) => candidate.src === image.src) === index);

  const orderedSeen = new Set();
  const elements = [...root.querySelectorAll('h1,h2,h3,h4,h5,p,li,blockquote,address,img')].map((node) => {
    if (node.matches('img')) {
      const src = absolute(node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-lazy-src'), pageUrl);
      return src ? { type: 'image', src, alt: clean(node.getAttribute('alt') || node.getAttribute('title') || title) } : null;
    }
    return { type: node.tagName.toLowerCase().startsWith('h') ? 'heading' : 'text', tag: node.tagName.toLowerCase(), text: clean(node.textContent) };
  }).filter(Boolean).filter((element) => {
    const identity = element.type === 'image' ? `image:${element.src}` : `${element.type}:${element.text}`;
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
    actions.push({ label, href, kind });
  };
  const extractedEmails = (contactText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((email) => email.replace(/(?:whatsapp|tel[eé]fono|celular).*$/i, '')).filter((email) => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,8}$/i.test(email));
  [...new Set(extractedEmails)].forEach((email) => addAction(email, `mailto:${email}`, 'email'));
  [...new Set(contactText.match(/\+54\s*9\s*11\s*\d{4}[-\s]\d{4}/g) || [])].forEach((phone, index) => addAction(index === 0 ? 'WhatsApp Secretaría' : 'Administrador Mijael Churba', `https://wa.me/${phone.replace(/\D/g, '')}`, 'whatsapp'));
  Object.values(linksByClass).filter((href) => /chat\.whatsapp\.com/i.test(href)).forEach((href) => addAction('Lista de difusión kosher', href, 'whatsapp'));
  const address = key === 'contact' ? contactText.match(/Comunidad Jafetz Jaim:\s*Ecuador\s+920\s+CABA/i)?.[0] : '';
  if (address && !blocks.some((block) => block.text.includes('Ecuador 920'))) blocks.push({ tag: 'p', text: address });
  const indexedCards = key === 'world' ? [...cards].sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })) : cards;
  return {
    section: key,
    blocks: blocks.length ? blocks : (indexedCards.length ? [] : [{ tag: 'p', text: 'No hay contenido oficial disponible.' }]),
    elements,
    cards: indexedCards,
    images,
    actions,
    cardActionLabel: key === 'world' ? 'Ver sellos autorizados' : key === 'catering' ? 'Ver datos y contacto' : key === 'shops' ? 'Ver datos del local' : 'Ver información',
    contact: key === 'contact', collaboration, certify, fetchedAt: generatedAt
  };
}

function parseCard(card, html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,noscript,nav,header,footer,form').forEach((node) => node.remove());
  const root = document.querySelector('.et_pb_section_1_tb_body') || document.querySelector('.entry-content, main, article') || document.querySelector('.et_builder_inner_content') || document.body;
  const seen = new Set();
  const blocks = [...root.querySelectorAll('h1,h2,h3,h4,h5,p,li,blockquote,address,.et_pb_toggle_title')].map((node) => ({ tag: node.tagName.toLowerCase(), text: clean(node.textContent) })).filter((block) => {
    if (block.text.length <= 4 || /menu|buscar|leer más|ver imagen completa|abrir chat|todos los derechos/i.test(block.text) || seen.has(block.text)) return false;
    seen.add(block.text); return true;
  });
  const images = [...root.querySelectorAll('img')].map((image) => ({ src: absolute(image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src'), card.url), alt: clean(image.getAttribute('alt') || image.getAttribute('title') || card.title) })).filter((image) => image.src).filter((image, index, all) => all.findIndex((candidate) => candidate.src === image.src) === index);
  const seals = card.url.includes('/viajeros/') ? [...root.querySelectorAll('.et_pb_column')].map((column) => {
    const image = column.querySelector('img');
    const text = clean([...column.querySelectorAll('p')].map((node) => node.textContent).join(' '));
    const src = image && absolute(image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src'), card.url);
    return src && text && !/va texto aqu[ií]/i.test(text) ? { src, alt: clean(image.getAttribute('alt') || image.getAttribute('title') || text.split(' - ')[0] || card.title), text } : null;
  }).filter(Boolean).filter((seal, index, all) => all.findIndex((candidate) => candidate.src === seal.src && normalize(candidate.text) === normalize(seal.text)) === index) : [];
  const pageText = clean(root.textContent);
  const actions = [];
  const addAction = (label, href, kind) => { if (href && !actions.some((action) => normalize(action.href) === normalize(href) || normalize(action.label) === normalize(label))) actions.push({ label, href, kind }); };
  [...new Set(pageText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,8}\b/gi) || [])].forEach((email) => addAction(email, `mailto:${email}`, 'email'));
  [...new Set(pageText.match(/(?:\+54\s*9\s*11\s*\d{4}[-\s]\d{4}|\b11\s*\d{8}\b)/g) || [])].forEach((phone, index) => {
    const digits = phone.replace(/\D/g, '');
    addAction(index === 0 ? 'WhatsApp' : 'Contacto por WhatsApp', `https://wa.me/${digits.startsWith('54') ? digits : `549${digits}`}`, 'whatsapp');
  });
  [...root.querySelectorAll('a[href]')].forEach((link) => {
    const href = link.getAttribute('href') || '';
    const label = clean(link.textContent);
    if (/google\.com\/maps/i.test(href)) addAction(label || 'Ver ubicación', href, 'map');
  });
  return { blocks: blocks.length ? blocks : [{ tag: 'p', text: card.description || 'Información publicada por Iahadut HaTora.' }], images, seals, actions, fetchedAt: generatedAt };
}

function parseAlerts(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const extract = (selector) => [...(document.querySelector(selector)?.querySelectorAll('li') || [])].map((node) => clean(node.textContent)).filter((text, index, all) => text.length > 8 && all.indexOf(text) === index);
  return { alta: extract('.card-altas'), baja: extract('.card-bajas'), general: [] };
}

const info = {};
for (const [key, [, url]] of Object.entries(sections)) info[key] = parseInfo(key, await fetchHtml(url));

const cards = Object.values(info).flatMap((section) => section.cards || []).filter((card) => card.url).filter((card, index, all) => all.findIndex((candidate) => candidate.url === card.url) === index);
const cardDetails = {};
let cursor = 0;
const workers = Array.from({ length: 4 }, async () => {
  while (cursor < cards.length) {
    const card = cards[cursor++];
    try { cardDetails[card.url] = parseCard(card, await fetchHtml(card.url)); } catch (error) { console.warn(`No se pudo empaquetar ${card.url}: ${error.message}`); }
  }
});
await Promise.all(workers);
const alerts = parseAlerts(await fetchHtml('https://vaad.ar/alertas-de-productos/'));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ generatedAt, info, cards: cardDetails, alerts })}\n`, 'utf8');
console.log(`Contenido generado: ${Object.keys(info).length} secciones · ${Object.keys(cardDetails).length} fichas · ${outputPath}`);
