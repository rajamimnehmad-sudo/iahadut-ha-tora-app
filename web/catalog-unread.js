export function additionKeys(items) {
  const additions = !Array.isArray(items) && Array.isArray(items?.alta) ? items.alta : [];
  return [...new Set(additions.map(item => {
    const text = typeof item === 'string' ? item : item?.text || '';
    if (!text.trim() || /no hay alertas|no hay productos|no pudimos actualizar/i.test(text)) return '';
    return String(typeof item === 'object' && item?.url || text)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }).filter(Boolean))];
}
export function unreadAdditionCount(items, seen) {
  return additionKeys(items).filter(key => !seen.has(key)).length;
}
