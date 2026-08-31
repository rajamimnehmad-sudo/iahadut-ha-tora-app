import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, 'web/data/catalog.json');
const pageSize = 24;
const categories = [
  { key: 'gondola', url: 'https://vaad.ar/categoria-producto/productos-autorizados-en-gondola/' },
  { key: 'planta', url: 'https://vaad.ar/categoria-producto/productos-de-plantas-certificadas/' },
  { key: 'especial', url: 'https://vaad.ar/categoria-producto/produccion-especial-kosher/' },
  { key: 'uruguay', url: 'https://vaad.ar/categoria-producto/productos-de-gondola-en-uruguay/' }
];

const decodeHtml = (value) => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&(amp|quot|apos|nbsp|ndash|mdash|laquo|raquo);/gi, (_, name) => ({
    amp: '&', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', laquo: '«', raquo: '»'
  }[name.toLowerCase()]))
  .replace(/\s+/g, ' ')
  .trim();

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

function totalFrom(html) {
  const match = html.match(/Mostrando[\s\S]{0,120}?de\s+([\d.]+)\s+resultados/i);
  return match ? Number(match[1].replace(/\./g, '')) : 0;
}

function productsFrom(html, category) {
  const blocks = [...html.matchAll(/<li\b[^>]*class=(?:"[^"]*\bproduct\b[^"]*"|'[^']*\bproduct\b[^']*')[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => match[1]);
  return blocks.map((block) => {
    const href = block.match(/<a\b[^>]*href=["']([^"']*\/producto\/[^"']*)["']/i)?.[1];
    const title = decodeHtml(block.match(/<h2\b[^>]*woocommerce-loop-product__title[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
    const imageTag = block.match(/<img\b[^>]*>/i)?.[0] || '';
    const image = imageTag.match(/(?:data-lazy-src|data-src|src)=["']([^"']+)["']/i)?.[1] || '';
    if (!href || !title) return null;
    const url = new URL(href, category.url).href.split('#')[0];
    const brandMatch = title.match(/marca\s+(.+)$/i);
    return {
      url,
      title,
      brand: brandMatch ? brandMatch[1].trim() : '',
      barcode: '',
      cat: category.key,
      image: image ? new URL(image, category.url).href : '',
      description: ''
    };
  }).filter(Boolean);
}

const products = [];
for (const category of categories) {
  const first = await fetchHtml(category.url);
  const total = totalFrom(first);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  for (let page = 1; page <= pages; page += 1) {
    const html = page === 1 ? first : await fetchHtml(`${category.url}?product-page=${page}`);
    products.push(...productsFrom(html, category));
  }
}

const uniqueProducts = [...new Map(products.map((product) => [product.url, product])).values()];
if (uniqueProducts.length < 900) throw new Error(`La extracción quedó incompleta: ${uniqueProducts.length} productos.`);

const home = await fetchHtml('https://vaad.ar/');
const officialUpdate = decodeHtml(home.match(/Última actualización del catálogo:\s*<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1]);
const snapshot = {
  generatedAt: new Date().toISOString(),
  officialUpdate,
  products: uniqueProducts
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
console.log(`Snapshot generado: ${uniqueProducts.length} productos · ${outputPath}`);
