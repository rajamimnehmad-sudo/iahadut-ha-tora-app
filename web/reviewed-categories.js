import reviewedCategories from './data/reviewed-categories.json' with {type:'json'};

// Exact URL identity prevents instructions/ingredients in a description or a
// remote keyword rule from moving a reviewed product to the wrong category.
export function reviewedCategoryPath(product) {
  const path = reviewedCategories.paths[product?.url];
  return Array.isArray(path) && path.length ? [...path] : null;
}
