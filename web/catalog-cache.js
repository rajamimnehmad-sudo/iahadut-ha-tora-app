export function catalogSnapshotNeedsRepair(products, version, snapshot) {
  const bundled = snapshot?.products;
  const bundledDate = Date.parse(snapshot?.generatedAt || '') || 0;
  const localDate = Date.parse(version || '') || 0;
  if (!Array.isArray(bundled) || !bundled.length || !bundledDate) return false;
  if (localDate > bundledDate) return false;
  if (localDate < bundledDate || !Array.isArray(products)) return true;
  if (products.length !== bundled.length) return true;
  const urls = new Set(products.map((product) => product.url));
  return bundled.some((product) => !urls.has(product.url));
}
