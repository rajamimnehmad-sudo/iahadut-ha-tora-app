export async function productSearchKey(url) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function rankingFromReport(report, products, generatedAt = new Date().toISOString()) {
  if (!Array.isArray(report?.rows) && Number(report?.rowCount || 0) !== 0) throw new Error('Informe incompleto');
  const identities = new Map(await Promise.all(products.map(async product => [await productSearchKey(product.url), product.url])));
  const counts = new Map();
  for (const row of report.rows || []) {
    const url = identities.get(row.dimensionValues?.[0]?.value);
    const count = Number(row.metricValues?.[0]?.value);
    if (!url || !Number.isSafeInteger(count) || count <= 0) continue;
    counts.set(url, (counts.get(url) || 0) + count);
  }
  return {schemaVersion:1, source:'google-analytics', metric:'catalog_product_search', windowDays:28, generatedAt,
    products:Array.from(counts, ([url, searches]) => ({url, searches})).sort((a,b) => b.searches-a.searches || a.url.localeCompare(b.url)).slice(0,20)};
}

export function validGlobalRanking(value) {
  return value?.schemaVersion === 1 && ['google-analytics', 'app-search'].includes(value.source) && value.metric === 'catalog_product_search'
    && value.windowDays === 28 && Number.isFinite(Date.parse(value.generatedAt)) && Array.isArray(value.products)
    && value.products.length <= 20 && new Set(value.products.map(item=>item.url)).size === value.products.length
    && value.products.every(item => /^https:\/\/vaad\.ar\/producto\//.test(item.url || '') && Number.isSafeInteger(item.searches) && item.searches > 0);
}
