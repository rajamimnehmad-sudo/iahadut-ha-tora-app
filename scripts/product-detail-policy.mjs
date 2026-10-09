import {createHash} from 'node:crypto';

export function productSourceFingerprint(product) {
  return createHash('sha256').update(JSON.stringify(
    ['url','title','brand','cat','image','barcode'].map(key => String(product[key] || ''))
  )).digest('hex');
}

export function reusableProductDetail(product, detail, refreshAll = false) {
  if (refreshAll || detail?.textFormatVersion !== 1 || !Array.isArray(detail.images) || typeof detail.description !== 'string') return false;
  // Adopt existing complete caches without refetching the entire catalog.
  return !detail.sourceFingerprint || detail.sourceFingerprint === productSourceFingerprint(product);
}
