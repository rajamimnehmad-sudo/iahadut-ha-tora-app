export function matchingCategories(items, pathsFor, query, limit = 3) {
  const tokens = brandKey(query || '').split(' ').filter(token => token.length >= 3 && !['para', 'con', 'del', 'las', 'los', 'una', 'unos', 'unas', 'marca'].includes(token));
  if (!tokens.length) return [];
  const groups = new Map();
  for (const item of items) for (const path of pathsFor(item)) {
    if (!path.length || path[0] === 'Otros productos') continue;
    const words = brandKey(path.join(' ')).split(' ');
    const matchesCategory = token => words.some(word => word.startsWith(token) || token === `${word}s` || token === `${word}es`);
    const brandWords = brandKey(brandName(item)).split(' ').filter(Boolean);
    // In "mermelada Arcor", Arcor qualifies the product, not the category.
    // Keep category words even if they also happen to be part of a brand.
    const categoryTokens = tokens.filter(token => matchesCategory(token) || !brandWords.some(word => word.startsWith(token)));
    // Never recommend a category solely because many search results use it.
    if (!categoryTokens.length || !categoryTokens.every(matchesCategory)) continue;
    const key = JSON.stringify(path);
    if (!groups.has(key)) groups.set(key, {path, urls:new Set()});
    groups.get(key).urls.add(item.url);
  }
  return [...groups.values()].sort((a,b)=>b.urls.size-a.urls.size || a.path.join(' ').localeCompare(b.path.join(' '),'es')).slice(0,limit).map(({path,urls})=>({path,count:urls.size}));
}
export function navigationScrollKey(view, path = []) {
  return ['subcategoryDirectoryView','categoryProductsView'].includes(view) ? `${view}:${JSON.stringify(path)}` : view;
}
export function brandName(product) {
  const raw = String(product.brand || '').trim();
  // Source brands sometimes include a flavour after the closing quote.
  const quoted = raw.match(/^[«»“"]([^«»“”"]+)[«»”"]/);
  return (quoted ? quoted[1] : raw).replace(/[«»“”"]/g, '').trim().replace(/\s+/g, ' ');
}
export function brandLogoMatches(name, label) {
  const aliases = {'monda 300x300':'monda', 'pomona':'pomona foods', 'almirante':'almirante donn'};
  const raw = brandKey(label);
  if (!raw || raw === 'planta certificada') return false;
  return brandKey(name) === (aliases[raw] || raw);
}
export function brandKey(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function matchingBrands(items, query, limit = 3) {
  const term = brandKey(query);
  if (term.length < 3) return [];
  const groups = new Map();
  for (const item of items) {
    const name = brandName(item), key = brandKey(name);
    if (!key || !key.includes(term)) continue;
    if (!groups.has(key)) groups.set(key, {name, key, urls:new Set()});
    groups.get(key).urls.add(item.url);
  }
  return [...groups.values()].sort((a,b)=>Number(b.key === term)-Number(a.key === term) || b.urls.size-a.urls.size).slice(0,limit).map(({name,urls})=>({name,count:urls.size}));
}
