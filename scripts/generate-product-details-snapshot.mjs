import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(projectRoot, 'web/data/catalog.json');
const outputPath = resolve(projectRoot, 'web/data/product-details.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const generatedAt = Date.now();
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const refreshAll = process.argv.includes('--refresh');
let previousProducts = {};
try {
  previousProducts = JSON.parse(await readFile(outputPath, 'utf8')).products || {};
} catch (_) {}

async function fetchHtml(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolvePromise) => setTimeout(resolvePromise, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function parseProduct(product, html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,noscript,nav,header,footer,form').forEach((node) => node.remove());
  const root = document.querySelector('.et_pb_section_1_tb_body') || document.querySelector('.entry-content, main, article') || document.querySelector('.et_builder_inner_content.product') || document.body;
  const descriptionRoot = root.querySelector('.et_pb_wc_description .et_builder_inner_content.product, .et_pb_wc_description .et_pb_module_inner, .woocommerce-product-details__short-description');
  const descriptionParts = descriptionRoot
    ? [descriptionRoot, ...descriptionRoot.querySelectorAll('p, li, blockquote, address, div')]
      .filter((node) => ![...node.children].some((child) => clean(child.textContent)))
      .map((node) => clean(node.textContent))
      .filter((text, index, all) => text.length > 4 && all.indexOf(text) === index && !/^BERAJ[ÁA]\s*:/i.test(text))
    : [];
  const fallbackDescription = [...root.querySelectorAll('p')]
    .map((node) => clean(node.textContent))
    .filter((text, index, all) => text.length > 4 && all.indexOf(text) === index && !/^BERAJ[ÁA]\s*:/i.test(text) && !/menu|buscar|leer más|abrir chat|todos los derechos|productos relacionados/i.test(text))
    .join(' ')
    .trim();
  const beraja = descriptionRoot
    ? [descriptionRoot, ...descriptionRoot.querySelectorAll('*')]
      .map((node) => clean(node.textContent).match(/^BERAJ[ÁA]\s*:\s*(.+)$/i))
      .filter(Boolean)
      .map((match) => clean(match[1]))
      .sort((first, second) => first.length - second.length)[0] || ''
    : '';
  const imageNode = root.querySelector('.woocommerce-product-gallery img, img.wp-post-image, .et_pb_wc_images img');
  const rawImage = imageNode && (imageNode.getAttribute('data-large_image') || imageNode.getAttribute('data-src') || imageNode.getAttribute('data-lazy-src') || imageNode.getAttribute('src'));
  const description = descriptionParts.join(' ').trim() || fallbackDescription;
  return {
    images: rawImage ? [{ src: new URL(rawImage, product.url).href, alt: product.title }] : [],
    category: clean(root.querySelector('.product_meta .posted_in a')?.textContent || ''),
    description,
    descriptionAvailable: Boolean(description),
    beraja,
    fetchedAt: generatedAt,
    bundled: true
  };
}

const products = {};
const failures = [];
let cursor = 0;
let completed = 0;
const sourceProducts = Array.isArray(catalog.products) ? catalog.products : [];
const workers = Array.from({ length: 8 }, async () => {
  while (cursor < sourceProducts.length) {
    const product = sourceProducts[cursor++];
    try {
      products[product.url] = !refreshAll && previousProducts[product.url]
        ? previousProducts[product.url]
        : parseProduct(product, await fetchHtml(product.url));
    } catch (error) {
      failures.push({ url: product.url, error: error.message });
    }
    completed += 1;
    if (completed % 25 === 0 || completed === sourceProducts.length) console.log(`Fichas: ${completed}/${sourceProducts.length}`);
  }
});

await Promise.all(workers);
if (Object.keys(products).length < Math.floor(sourceProducts.length * 0.95)) {
  throw new Error(`La extracción de fichas quedó incompleta: ${Object.keys(products).length}/${sourceProducts.length}`);
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ generatedAt, products, failures })}\n`, 'utf8');
console.log(`Fichas empaquetadas: ${Object.keys(products).length} · errores: ${failures.length} · ${outputPath}`);
