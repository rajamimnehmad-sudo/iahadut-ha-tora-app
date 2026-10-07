// Sources are newest-first. Keep older batches without an arbitrary item cap.
export function mergeAlertHistory(...sources) {
  const result = {alta: [], baja: [], general: []};
  for (const kind of ['alta', 'baja', 'general']) {
    const seen = new Set();
    for (const source of sources) {
      if (!source || Array.isArray(source)) continue;
      for (const item of source[kind] || []) {
        const text = typeof item === 'string' ? item : item?.text || '';
        if (!text.trim() || /no hay alertas|no hay productos|no pudimos actualizar/i.test(text)) continue;
        const identity = String((typeof item === 'object' && item?.url) || text)
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (seen.has(identity)) continue;
        seen.add(identity);
        result[kind].push(item);
      }
    }
  }
  return result;
}
