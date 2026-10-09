import {reviewedCategoryPath} from './reviewed-categories.js';
import {newProductCategoryPath} from './new-product-categories.js';

export function validCategoryPath(path) {
  return Array.isArray(path) && path.length > 0 && path.length <= 4
    && path.every(part => typeof part === 'string' && part === part.trim()
      && part.length > 0 && part.length <= 100 && !/[<>\u0000-\u001f]/.test(part));
}

// Category data travels with the product through incremental and offline copies.
// Old catalogs keep their bundled classification until central data arrives.
export function catalogCategoryPath(product) {
  if (validCategoryPath(product?.categoryPath)) return [...product.categoryPath];
  return reviewedCategoryPath(product) || newProductCategoryPath(product);
}

export function categorizeCatalog(catalog, overrides = {}) {
  for (const [url, path] of Object.entries(overrides)) {
    if (!url.startsWith('https://vaad.ar/producto/') || !validCategoryPath(path)) {
      throw new Error('Corrección de categoría inválida: ' + url);
    }
  }
  return {...catalog, products:catalog.products.map(product => {
    const {categoryPath:previousPath, ...data} = product;
    const path = overrides[product.url] || reviewedCategoryPath(product) || newProductCategoryPath(product);
    return path ? {...data, categoryPath:[...path]} : data;
  })};
}
